import { describe, it, expect } from 'vitest';
import { extractJsonFromStdout, normalizeStockData } from '@/lib/data-fetcher';

describe('data-fetcher - stdout JSON extraction', () => {
  it('parses pure JSON stdout', () => {
    const result = extractJsonFromStdout('{"meta":{"symbol_input":"600519"}}');
    expect(result.meta?.symbol_input).toBe('600519');
  });

  it('parses JSON after script marker', () => {
    const stdout = `
[OK] 取数完成 -> ./account/_temp.json
     [WARN] 失败引擎: [{'engine': 'x', 'error': 'y'}]

--- JSON 内容 ---
{
  "meta": { "symbol_input": "600519", "market": "A" },
  "price": { "current": 1500 }
}
`;

    const result = extractJsonFromStdout(stdout);
    expect(result.meta?.symbol_input).toBe('600519');
    expect(result.price?.current).toBe(1500);
  });

  it('does not greedily capture earlier brace logs', () => {
    const stdout = `debug {not json}
--- JSON 内容 ---
{"meta":{"symbol_input":"AAPL","market":"US"}}`;

    const result = extractJsonFromStdout(stdout);
    expect(result.meta?.symbol_input).toBe('AAPL');
  });
});

describe('data-fetcher - normalizeStockData', () => {
  it('normalizes nested Python output into flat StockData', () => {
    const result = normalizeStockData({
      meta: { symbol_input: '600519', market: 'A' },
      price: {
        current: 1500,
        change_pct: 1.2,
        fifty_two_week_high: 1800,
        fifty_two_week_low: 1200,
        volume: 10000,
      },
      valuation: {
        market_cap: 1880000000000,
        trailing_pe: 25,
        price_to_book: 8,
      },
      profitability: {
        return_on_equity: 0.32,
        gross_margins: 0.91,
      },
      dividend: { dividend_yield: 0.02 },
      financials: {
        total_revenue_ttm: 100,
        net_income_ttm: 50,
      },
      company: { long_name: '贵州茅台' },
    }, 'fallback', 'A');

    expect(result.symbol).toBe('600519');
    expect(result.name).toBe('贵州茅台');
    expect(result.market).toBe('A');
    expect(result.price).toBe(1500);
    expect(result.pe).toBe(25);
    expect(result.pb).toBe(8);
    expect(result.roe).toBe(32);
    expect(result.grossMargin).toBe(91);
    expect(result.dividendYield).toBe(2);
    expect(result.raw.meta?.symbol_input).toBe('600519');
  });
});
