import { execFile } from 'child_process';
import path from 'path';

export interface PythonStockData {
  meta?: Record<string, unknown>;
  price?: Record<string, unknown>;
  valuation?: Record<string, unknown>;
  profitability?: Record<string, unknown>;
  financials?: Record<string, unknown>;
  dividend?: Record<string, unknown>;
  company?: Record<string, unknown>;
  shares?: Record<string, unknown>;
  financials_abstract?: Record<string, unknown>;
  errors?: unknown[];
  [key: string]: unknown;
}

export interface StockData {
  symbol: string;
  name: string;
  market: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  marketCap: number | null;
  pe: number | null;
  pb: number | null;
  roe: number | null;
  grossMargin: number | null;
  dividendYield: number | null;
  revenue: number | null;
  netIncome: number | null;
  eps: number | null;
  week52High: number | null;
  week52Low: number | null;
  volume: number | null;
  raw: PythonStockData;
  [key: string]: unknown;
}

function cleanJsonString(jsonStr: string): string {
  // Replace NaN/Infinity with null (these are not valid JSON)
  return jsonStr
    .replace(/:\s*NaN/g, ': null')
    .replace(/:\s*Infinity/g, ': null')
    .replace(/:\s*-Infinity/g, ': null');
}

function parseJsonObject(jsonStr: string): PythonStockData | null {
  try {
    const parsed = JSON.parse(cleanJsonString(jsonStr.trim()));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as PythonStockData;
    }
  } catch {
    // Try the next candidate
  }
  return null;
}

export function extractJsonFromStdout(stdout: string): PythonStockData {
  const trimmed = stdout.trim();
  const direct = parseJsonObject(trimmed);
  if (direct) return direct;

  const marker = '--- JSON 内容 ---';
  const markerIndex = stdout.lastIndexOf(marker);
  if (markerIndex >= 0) {
    const afterMarker = stdout.slice(markerIndex + marker.length).trim();
    const parsed = parseJsonObject(afterMarker);
    if (parsed) return parsed;
  }

  const lines = stdout.split('\n').map(line => line.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const parsed = parseJsonObject(lines.slice(i).join('\n'));
    if (parsed) return parsed;
  }

  for (let start = stdout.lastIndexOf('{'); start >= 0; start = stdout.lastIndexOf('{', start - 1)) {
    const candidate = stdout.slice(start).trim();
    const parsed = parseJsonObject(candidate);
    if (parsed) return parsed;
  }

  const preview = stdout.slice(0, 500).replace(/\s+/g, ' ').trim();
  throw new Error(`No valid JSON found in output. stdout preview: ${preview}`);
}

function getObject(source: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = source[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function getString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getNumber(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const normalized = value.replace(/,/g, '').trim();
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function percentFromRatio(value: number | null): number | null {
  if (value === null) return null;
  return Math.abs(value) <= 1 ? value * 100 : value;
}

export function normalizeStockData(data: PythonStockData, symbol: string, market: string): StockData {
  const meta = getObject(data, 'meta');
  const price = getObject(data, 'price');
  const valuation = getObject(data, 'valuation');
  const profitability = getObject(data, 'profitability');
  const financials = getObject(data, 'financials');
  const dividend = getObject(data, 'dividend');
  const company = getObject(data, 'company');
  const shares = getObject(data, 'shares');

  const normalizedSymbol = getString(meta, 'symbol_input') || symbol;
  const normalizedMarket = getString(meta, 'market') || market;
  const name = getString(company, 'long_name') || getString(company, 'short_name') || getString(price, 'name') || normalizedSymbol;

  return {
    symbol: normalizedSymbol,
    name,
    market: normalizedMarket,
    price: getNumber(price, 'current'),
    change: getNumber(price, 'change'),
    changePercent: getNumber(price, 'change_pct'),
    marketCap: getNumber(valuation, 'market_cap'),
    pe: getNumber(valuation, 'trailing_pe'),
    pb: getNumber(valuation, 'price_to_book'),
    roe: percentFromRatio(getNumber(profitability, 'return_on_equity')),
    grossMargin: percentFromRatio(getNumber(profitability, 'gross_margins')),
    dividendYield: percentFromRatio(getNumber(dividend, 'dividend_yield')),
    revenue: getNumber(financials, 'total_revenue_ttm'),
    netIncome: getNumber(financials, 'net_income_ttm'),
    eps: getNumber(financials, 'trailing_eps'),
    week52High: getNumber(price, 'fifty_two_week_high'),
    week52Low: getNumber(price, 'fifty_two_week_low'),
    // 优先取交易量，缺失时回退到总股本（注意：两个是不同的概念）
    volume: getNumber(price, 'volume') ?? getNumber(shares, 'shares_outstanding'),
    raw: data,
  };
}

// =========================================================================
// fetchData：调 Python 子进程取数，带重试 + 公平超时 + 优雅降级
// - TIMEOUT / 瞬态 EXIT_NONZERO（429/Timeout/ConnectionError 等）：重试 2 次（1s + 3s 退避）
// - 静态 EXIT_NONZERO（如 ImportError）：只重试 1 次
// - PARSE_ERROR：不重试（多是 stdout 截断，重试常常同样失败）
// - 公平超时：首次 30s（要冷启 Python）、重试 15s（解释器已在 OS 页缓存里）
// - 部分数据（exit 0 + errors[] 非空）不视为失败：调用方拿 partial=true 继续走 AI 步
// =========================================================================

export class FetchDataError extends Error {
  code: 'TIMEOUT' | 'EXIT_NONZERO' | 'PARSE_ERROR';
  stderr: string;
  exitCode: number | null;
  attempt: number;

  constructor(
    code: 'TIMEOUT' | 'EXIT_NONZERO' | 'PARSE_ERROR',
    message: string,
    stderr: string,
    exitCode: number | null,
    attempt: number,
  ) {
    super(message);
    this.name = 'FetchDataError';
    this.code = code;
    this.stderr = stderr;
    this.exitCode = exitCode;
    this.attempt = attempt;
  }
}

export interface FetchDataResult {
  data: StockData;
  /** Python errors[] 原文（每个引擎失败一条） */
  errors: string[];
  /** true = errors[] 非空，部分字段可能为 null，AI 需要在报告里显式标注不确定性 */
  partial: boolean;
  /** Python meta.engines_used，例如 ['yfinance'] 或 ['akshare'] */
  enginesUsed: string[];
  /** "<engine>: <error>" 列表，UI 用它展示失败原因 */
  enginesFailed: string[];
  elapsedMs: number;
}

export interface FetchDataOptions {
  /** retry 退避，索引 0=首次前等待 / 1=第 1 次重试前 / 2=第 2 次重试前。默认 [0, 1000, 3000] */
  retryDelaysMs?: number[];
  /** 首次调 Python 的超时，默认 30s（冷启动留余量） */
  firstTimeoutMs?: number;
  /** 重试时调 Python 的超时，默认 15s（解释器已在 OS 页缓存） */
  retryTimeoutMs?: number;
  /** 每次重试前回调，UI 用它显示「正在重试 2/3」 */
  onRetry?: (info: { attempt: number; delayMs: number; reason: string }) => void;
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const DEFAULT_RETRY_DELAYS = [0, 1000, 3000];
const DEFAULT_FIRST_TIMEOUT = 30_000;
const DEFAULT_RETRY_TIMEOUT = 15_000;
/** 网络瞬态错误的 stderr 签名：匹配这些字样的非零退出可以满 3 次重试 */
const TRANSIENT_STDERR_PATTERNS = /Timeout|ConnectionError|RemoteDisconnected|URLError|JSONDecodeError|429|Too Many Requests/i;

export async function fetchData(
  symbol: string,
  market: string,
  options: FetchDataOptions = {},
): Promise<FetchDataResult> {
  const delays = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS;
  const firstTimeout = options.firstTimeoutMs ?? DEFAULT_FIRST_TIMEOUT;
  const retryTimeout = options.retryTimeoutMs ?? DEFAULT_RETRY_TIMEOUT;
  const onRetry = options.onRetry;

  const scriptPath = path.join(process.cwd(), '..', 'stock-value-analyzer', 'scripts', 'fetch_stock_data.py');
  const startedAt = Date.now();
  const maxAttempts = delays.length;
  let lastError: FetchDataError | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // 第 2/3 次：等退避 + 通知 UI
    const delay = delays[attempt - 1];
    if (delay > 0) {
      onRetry?.({ attempt, delayMs: delay, reason: lastError?.message ?? '' });
      await sleep(delay);
    }

    const timeout = attempt === 1 ? firstTimeout : retryTimeout;
    let stdout: string;
    try {
      stdout = await runPython(scriptPath, symbol, market, timeout, attempt);
    } catch (err) {
      lastError = err as FetchDataError;
      if (attempt >= maxAttempts) throw lastError;
      // 静态 EXIT_NONZERO（ImportError 等）只重试 1 次（第 2 次重试还是会失败）
      if (lastError.code === 'EXIT_NONZERO' && !TRANSIENT_STDERR_PATTERNS.test(lastError.stderr)) {
        if (attempt >= 2) throw lastError;
      }
      // TIMEOUT 和瞬态 EXIT_NONZERO 继续重试
      continue;
    }

    // 解析阶段：失败包成 PARSE_ERROR，不重试（stdout 截断/编码问题，重试同样失败）
    try {
      const parsed = extractJsonFromStdout(stdout);
      const errors = Array.isArray(parsed.errors) ? (parsed.errors as unknown[]).map(e => String(e)) : [];
      const meta = (parsed.meta as Record<string, unknown> | undefined) ?? {};
      const enginesUsed = Array.isArray(meta.engines_used) ? (meta.engines_used as string[]) : [];
      const enginesFailedRaw = Array.isArray(meta.engines_failed)
        ? (meta.engines_failed as Array<{ engine?: string; error?: string }>)
        : [];

      return {
        data: normalizeStockData(parsed, symbol, market),
        errors,
        partial: errors.length > 0,
        enginesUsed,
        enginesFailed: enginesFailedRaw.map(e => `${e.engine ?? 'unknown'}: ${e.error ?? 'unknown'}`),
        elapsedMs: Date.now() - startedAt,
      };
    } catch (parseErr) {
      throw new FetchDataError(
        'PARSE_ERROR',
        `解析 Python 输出失败: ${(parseErr as Error).message}`,
        '',
        0,
        attempt,
      );
    }
  }
  // 不可达，但 TS 不知道
  throw lastError!;
}

function runPython(
  scriptPath: string,
  symbol: string,
  market: string,
  timeout: number,
  attempt: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'python3',
      [scriptPath, '--symbol', symbol, '--market', market, '--print'],
      { timeout },
      (err, stdout, stderr) => {
        if (err) {
          const code = (err as NodeJS.ErrnoException).code;
          if (code === 'ETIMEDOUT') {
            reject(new FetchDataError('TIMEOUT', `Python 脚本超时 (${timeout}ms)`, stderr, null, attempt));
          } else {
            const exitCode = typeof code === 'number' ? code : null;
            reject(new FetchDataError('EXIT_NONZERO', `Python 退出码 ${exitCode}: ${err.message}`, stderr, exitCode, attempt));
          }
          return;
        }
        resolve(stdout);
      },
    );
  });
}
