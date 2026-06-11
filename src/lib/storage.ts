import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export interface StoredReport {
  id: string;
  symbol: string;
  name: string;
  market: string;
  score: number;
  conclusion: string;
  createdAt: string;
  markdown: string;
  parsed: Record<string, unknown>;
}

/** 报告摘要，存储在索引文件中，避免全量读取 */
export interface ReportSummary {
  id: string;
  symbol: string;
  name: string;
  market: string;
  score: number;
  conclusion: string;
  createdAt: string;
}

const REPORTS_DIR = path.join(process.cwd(), '..', 'output', 'reports');
const INDEX_FILE = path.join(REPORTS_DIR, 'index.json');

/** 报告缓存 TTL：7 天内的同 (symbol, market) 报告可直接复用，避免重复消耗 LLM token */
export const REPORT_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// 简单互斥锁，防止 index.json 并发写入竞态
let indexLock: Promise<void> = Promise.resolve();

async function withIndexLock<T>(fn: () => Promise<T>): Promise<T> {
  let release: () => void;
  const prevLock = indexLock;
  indexLock = new Promise<void>(resolve => { release = resolve; });
  await prevLock;
  try {
    return await fn();
  } finally {
    release!();
  }
}

async function ensureReportsDir(): Promise<void> {
  await fs.mkdir(REPORTS_DIR, { recursive: true });
}

/** 从完整报告提取摘要 */
function toSummary(report: StoredReport): ReportSummary {
  return {
    id: report.id,
    symbol: report.symbol,
    name: report.name,
    market: report.market,
    score: report.score,
    conclusion: report.conclusion,
    createdAt: report.createdAt,
  };
}

/** 读取索引文件 */
async function readIndex(): Promise<ReportSummary[] | null> {
  try {
    const content = await fs.readFile(INDEX_FILE, 'utf-8');
    return JSON.parse(content) as ReportSummary[];
  } catch {
    return null;
  }
}

/** 原子写入索引文件：先写临时文件再重命名，防止写入中断导致文件损坏 */
async function writeIndex(index: ReportSummary[]): Promise<void> {
  const tmpFile = INDEX_FILE + '.tmp';
  await fs.writeFile(tmpFile, JSON.stringify(index, null, 2));
  await fs.rename(tmpFile, INDEX_FILE);
}

/** 重建索引：扫描目录读取所有 JSON 报告 */
async function rebuildIndex(): Promise<ReportSummary[]> {
  await ensureReportsDir();

  const files = await fs.readdir(REPORTS_DIR);
  const jsonFiles = files.filter(f => f.endsWith('.json') && f !== 'index.json');

  const summaries: ReportSummary[] = [];

  for (const file of jsonFiles) {
    try {
      const content = await fs.readFile(path.join(REPORTS_DIR, file), 'utf-8');
      const report = JSON.parse(content) as StoredReport;
      summaries.push(toSummary(report));
    } catch {
      // 跳过损坏的文件
    }
  }

  // 按创建时间倒序
  summaries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  await writeIndex(summaries);
  return summaries;
}

export async function saveReport(
  symbol: string,
  market: string,
  markdown: string,
  parsed: Record<string, unknown>
): Promise<string> {
  await ensureReportsDir();

  const id = crypto.randomUUID();
  const report: StoredReport = {
    id,
    symbol,
    name: (parsed.name as string) || symbol,
    market,
    score: (parsed.score as number) || 0,
    conclusion: (parsed.conclusion as string) || '',
    createdAt: new Date().toISOString(),
    markdown,
    parsed
  };

  // 并行写入 JSON 和 Markdown
  await Promise.all([
    fs.writeFile(
      path.join(REPORTS_DIR, `${id}.json`),
      JSON.stringify(report, null, 2)
    ),
    fs.writeFile(
      path.join(REPORTS_DIR, `${id}.md`),
      markdown
    ),
  ]);

  // 在锁内更新索引
  await withIndexLock(async () => {
    const summary = toSummary(report);
    const index = await readIndex();
    if (index) {
      index.unshift(summary); // 最新在前
      await writeIndex(index);
    }
    // 如果索引不存在，下次 listReports 时会自动重建
  });

  return id;
}

export async function getReport(id: string): Promise<StoredReport | null> {
  const filePath = path.join(REPORTS_DIR, `${id}.json`);

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as StoredReport;
  } catch {
    return null;
  }
}

export async function listReports(): Promise<ReportSummary[]> {
  await ensureReportsDir();

  // 优先从索引文件读取
  const index = await readIndex();
  if (index) {
    return index;
  }

  // 索引不存在，重建
  return rebuildIndex();
}

/**
 * 查找同 (symbol, market) 在 ttlMs 内的最新报告；超期或无匹配则返回 null。
 * 用于 /api/analyze 在不强制刷新时短路掉 DeepSeek 调用，省 token。
 * `now` 参数可注入，方便单测覆盖 TTL 边界。
 */
export async function findRecentReport(
  symbol: string,
  market: string,
  ttlMs: number = REPORT_CACHE_TTL_MS,
  now: number = Date.now()
): Promise<ReportSummary | null> {
  const all = await listReports(); // 已按 createdAt DESC 排序
  const cutoff = now - ttlMs;
  for (const r of all) {
    if (r.symbol !== symbol || r.market !== market) continue;
    const ts = new Date(r.createdAt).getTime();
    if (!Number.isFinite(ts)) continue;
    // 首条匹配即为最新；若它已超期，更旧的更不可能命中，直接返回 null
    return ts > cutoff ? r : null;
  }
  return null;
}

function isNotFoundError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT';
}

export async function deleteReport(id: string): Promise<boolean> {
  const jsonPath = path.join(REPORTS_DIR, `${id}.json`);
  const mdPath = path.join(REPORTS_DIR, `${id}.md`);

  let deletedJson = false;

  try {
    await fs.unlink(jsonPath);
    deletedJson = true;
  } catch (err) {
    if (!isNotFoundError(err)) throw err;
  }

  // 在锁内检查并清理索引
  return await withIndexLock(async () => {
    if (deletedJson) {
      // 成功删除 JSON 文件，也清理 MD 文件（可选的）
      try {
        await fs.unlink(mdPath);
      } catch (err) {
        if (!isNotFoundError(err)) throw err;
      }

      // 更新索引
      const index = await readIndex();
      if (index) {
        const updated = index.filter(r => r.id !== id);
        await writeIndex(updated);
      }
      return true;
    }

    // JSON 文件已不存在，检查索引中是否有孤立条目
    const index = await readIndex();
    const existsInIndex = index?.some(r => r.id === id) ?? false;
    if (existsInIndex) {
      // 清理索引中的孤立条目
      const updated = index!.filter(r => r.id !== id);
      await writeIndex(updated);
      // 也尝试清理孤立的 MD 文件
      try {
        await fs.unlink(mdPath);
      } catch { /* 忽略，MD 文件可能也不存在 */ }
      return true; // 报告已不存在，返回 true 表示"已删除"
    }
    return false; // 报告完全不存在
  });
}
