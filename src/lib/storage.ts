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

/** 写入索引文件 */
async function writeIndex(index: ReportSummary[]): Promise<void> {
  await fs.writeFile(INDEX_FILE, JSON.stringify(index, null, 2));
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

  // 更新索引
  const summary = toSummary(report);
  const index = await readIndex();
  if (index) {
    index.unshift(summary); // 最新在前
    await writeIndex(index);
  }
  // 如果索引不存在，下次 listReports 时会自动重建

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

  if (!deletedJson) {
    const index = await readIndex();
    const existsInIndex = index?.some(r => r.id === id) ?? false;
    if (!existsInIndex) return false;
    return false;
  }

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
