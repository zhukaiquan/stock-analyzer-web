import { describe, it, expect } from 'vitest';
import { searchStocks, detectMarket } from '@/lib/stock-search';

// =========================================================================
// 测试用例：股票搜索 & 任意代码识别优化
// 验收标准：
//   1. 内置股票库按名称/代码/行业搜索正常工作
//   2. 输入不在内置库的 A 股代码（如 601006）能正确识别市场
//   3. 输入港股、美股代码也能识别
//   4. detectMarket 支持科创板（688xxx）等 6 位代码
// =========================================================================

describe('searchStocks - 内置股票搜索', () => {
  it('按股票代码搜索：600519 → 贵州茅台', async () => {
    const results = await searchStocks('600519');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toBe('贵州茅台');
    expect(results[0].market).toBe('A');
  });

  it('按股票名称搜索：招商银行', async () => {
    const results = await searchStocks('招商银行');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(r => r.symbol === '600036')).toBe(true);
  });

  it('按行业搜索：白酒', async () => {
    const results = await searchStocks('白酒');
    expect(results.length).toBeGreaterThan(1);
    // 至少有茅台、五粮液、泸州老窖等
    const names = results.map(r => r.name);
    expect(names).toContain('贵州茅台');
    expect(names).toContain('五粮液');
  });

  it('空查询返回前 10 只演示股票', async () => {
    const results = await searchStocks('');
    expect(results.length).toBe(10);
  });

  it('港股搜索：腾讯', async () => {
    const results = await searchStocks('腾讯');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].market).toBe('HK');
    expect(results[0].symbol).toBe('00700');
  });

  it('美股搜索：AAPL', async () => {
    const results = await searchStocks('AAPL');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].market).toBe('US');
    expect(results[0].name).toBe('Apple');
  });
});

describe('searchStocks - 任意代码识别（P2 优化验证）', () => {
  it('A 股代码 601006（大秦铁路）不在内置库，应被识别为 A 股', async () => {
    const results = await searchStocks('601006');
    expect(results.length).toBe(1);
    expect(results[0].symbol).toBe('601006');
    expect(results[0].market).toBe('A');
  });

  it('科创板代码 688981（中芯国际）应被识别为 A 股', async () => {
    const results = await searchStocks('688981');
    expect(results.length).toBe(1);
    expect(results[0].symbol).toBe('688981');
    expect(results[0].market).toBe('A');
  });

  it('港股代码 0388（港交所）不在内置库，应被识别为港股', async () => {
    const results = await searchStocks('0388');
    expect(results.length).toBe(1);
    expect(results[0].symbol).toBe('00388');
    expect(results[0].market).toBe('HK');
  });

  it('美股代码 NVDA 不在内置库，应被识别为美股', async () => {
    const results = await searchStocks('NVDA');
    expect(results.length).toBe(1);
    expect(results[0].symbol).toBe('NVDA');
    expect(results[0].market).toBe('US');
  });

  it('无意义输入 abcdef 不应返回结果', async () => {
    const results = await searchStocks('abcdef');
    expect(results.length).toBe(0);
  });

  it('中文名称但不在库中（如"中国平安"已存在 → 应匹配）', async () => {
    const results = await searchStocks('中国平安');
    expect(results.length).toBeGreaterThan(0);
  });
});

describe('detectMarket - 市场检测（P2 优化验证）', () => {
  it('6 位 A 股代码（主板）: 600519 → A', () => {
    expect(detectMarket('600519')).toBe('A');
  });

  it('6 位 A 股代码（创业板）: 300750 → A', () => {
    expect(detectMarket('300750')).toBe('A');
  });

  it('6 位 A 股代码（科创板 688xxx）: 688981 → A', () => {
    expect(detectMarket('688981')).toBe('A');
  });

  it('5 位港股代码: 00700 → HK', () => {
    expect(detectMarket('00700')).toBe('HK');
  });

  it('4 位港股代码: 0388 → HK', () => {
    expect(detectMarket('0388')).toBe('HK');
  });

  it('美股字母代码: AAPL → US', () => {
    expect(detectMarket('AAPL')).toBe('US');
  });

  it('小写美股代码也识别: aapl → US', () => {
    expect(detectMarket('aapl')).toBe('US');
  });

  it('未知格式默认 A 股: 1234567 → A', () => {
    expect(detectMarket('1234567')).toBe('A');
  });
});
