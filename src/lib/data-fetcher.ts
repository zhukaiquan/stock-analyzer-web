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
    volume: getNumber(price, 'volume') || getNumber(shares, 'shares_outstanding'),
    raw: data,
  };
}

export async function fetchData(symbol: string, market: string): Promise<StockData> {
  const scriptPath = path.join(process.cwd(), '..', 'stock-value-analyzer', 'scripts', 'fetch_stock_data.py');

  return new Promise((resolve, reject) => {
    execFile('python3', [
      scriptPath,
      '--symbol', symbol,
      '--market', market,
      '--print'
    ], { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`Python script failed: ${err.message}\n${stderr}`));
        return;
      }

      try {
        const parsed = extractJsonFromStdout(stdout);
        resolve(normalizeStockData(parsed, symbol, market));
      } catch (parseErr) {
        reject(new Error(`Failed to parse JSON: ${(parseErr as Error).message}`));
      }
    });
  });
}
