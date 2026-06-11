import { describe, it, expect, vi, beforeEach } from 'vitest';
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

// =========================================================================
// fetchData - 重试 + 优雅降级
// =========================================================================

const mockExecFile = vi.fn();
vi.mock('child_process', () => ({
  execFile: (...args: unknown[]) => mockExecFile(...args),
}));

// 动态导入：vi.mock 是 hoisted 的，但 fetchData 必须在 mock 注册后再加载，
// 否则模块顶层捕获到的是真的 execFile。
const { fetchData } = await import('@/lib/data-fetcher');

type ExecCb = (err: Error | null, stdout: string, stderr: string) => void;

/** 模拟一次 execFile 调用结果。exitCode=null 表示 ETIMEDOUT。 */
function fakeOnce(exitCode: number | null, stdout = '', stderr = '') {
  return (...args: unknown[]) => {
    const cb = args[args.length - 1] as ExecCb;
    if (exitCode === null) {
      cb(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT', killed: true, signal: 'SIGTERM' }), '', stderr);
    } else if (exitCode !== 0) {
      cb(Object.assign(new Error(`exit ${exitCode}`), { code: exitCode, killed: false }), '', stderr);
    } else {
      cb(null, stdout, stderr);
    }
  };
}

describe('data-fetcher.fetchData - 重试与降级', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('成功路径：errors[] 为空 → partial=false 且不重试', async () => {
    mockExecFile.mockImplementation(
      fakeOnce(0, JSON.stringify({ meta: { engines_used: ['yfinance'] }, errors: [] }))
    );

    const r = await fetchData('AAPL', 'US', { retryDelaysMs: [0, 0, 0] });

    expect(r.partial).toBe(false);
    expect(r.errors).toEqual([]);
    expect(r.enginesUsed).toEqual(['yfinance']);
    expect(mockExecFile).toHaveBeenCalledTimes(1);
  });

  it('部分数据：errors[] 非空 → partial=true 且不抛错', async () => {
    const payload = {
      meta: {
        engines_used: ['akshare'],
        engines_failed: [{ engine: 'yfinance', error: 'Too Many Requests' }],
      },
      errors: ['yfinance failed'],
    };
    mockExecFile.mockImplementation(fakeOnce(0, JSON.stringify(payload)));

    const r = await fetchData('00700', 'HK', { retryDelaysMs: [0, 0, 0] });

    expect(r.partial).toBe(true);
    expect(r.errors).toEqual(['yfinance failed']);
    expect(r.enginesFailed).toEqual(['yfinance: Too Many Requests']);
    expect(mockExecFile).toHaveBeenCalledTimes(1);
  });

  it('首次超时 → 重试一次后成功（共 2 次调用）', async () => {
    let calls = 0;
    mockExecFile.mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as ExecCb;
      calls++;
      if (calls === 1) {
        cb(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }), '', '');
      } else {
        cb(null, JSON.stringify({ meta: {}, errors: [] }), '');
      }
    });

    const r = await fetchData('AAPL', 'US', { retryDelaysMs: [0, 0, 0] });

    expect(r.partial).toBe(false);
    expect(mockExecFile).toHaveBeenCalledTimes(2);
  });

  it('连续 3 次都超时 → 抛 FetchDataError(TIMEOUT)', async () => {
    mockExecFile.mockImplementation(fakeOnce(null, '', ''));

    await expect(fetchData('AAPL', 'US', { retryDelaysMs: [0, 0, 0] })).rejects.toMatchObject({
      name: 'FetchDataError',
      code: 'TIMEOUT',
    });
    expect(mockExecFile).toHaveBeenCalledTimes(3);
  });

  it('非零退出 + 瞬态 stderr（429）→ 重试到 3 次机会用完', async () => {
    mockExecFile.mockImplementation(fakeOnce(1, '', 'HTTPError 429 Too Many Requests'));

    await expect(fetchData('AAPL', 'US', { retryDelaysMs: [0, 0, 0] })).rejects.toMatchObject({
      name: 'FetchDataError',
      code: 'EXIT_NONZERO',
    });
    expect(mockExecFile).toHaveBeenCalledTimes(3);
  });

  it('非零退出 + 静态 stderr（ImportError）→ 只重试 1 次（共 2 次）', async () => {
    mockExecFile.mockImplementation(fakeOnce(1, '', 'ModuleNotFoundError: No module named akshare'));

    await expect(fetchData('AAPL', 'US', { retryDelaysMs: [0, 0, 0] })).rejects.toMatchObject({
      name: 'FetchDataError',
      code: 'EXIT_NONZERO',
    });
    expect(mockExecFile).toHaveBeenCalledTimes(2);
  });

  it('PARSE_ERROR 不重试（首次失败直接抛）', async () => {
    mockExecFile.mockImplementation(fakeOnce(0, 'not json at all', ''));

    await expect(fetchData('AAPL', 'US', { retryDelaysMs: [0, 0, 0] })).rejects.toMatchObject({
      name: 'FetchDataError',
      code: 'PARSE_ERROR',
    });
    expect(mockExecFile).toHaveBeenCalledTimes(1);
  });

  it('onRetry 回调：每次重试前触发，attempt/delayMs/reason 正确', async () => {
    let calls = 0;
    mockExecFile.mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as ExecCb;
      calls++;
      if (calls < 3) {
        cb(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }), '', '');
      } else {
        cb(null, JSON.stringify({ meta: {}, errors: [] }), '');
      }
    });

    const retries: Array<{ attempt: number; delayMs: number; reason: string }> = [];
    await fetchData('AAPL', 'US', {
      retryDelaysMs: [0, 50, 80],
      onRetry: (info) => retries.push(info),
    });

    expect(retries).toHaveLength(2);
    expect(retries[0]).toMatchObject({ attempt: 2, delayMs: 50 });
    expect(retries[1]).toMatchObject({ attempt: 3, delayMs: 80 });
    expect(retries[0].reason).toContain('Python 脚本超时');
  });

  it('公平超时：首次 30s，重试 15s', async () => {
    const timeouts: number[] = [];
    mockExecFile.mockImplementation((_python: unknown, _args: unknown, opts: { timeout: number }, cb: ExecCb) => {
      timeouts.push(opts.timeout);
      cb(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }), '', '');
    });

    await expect(fetchData('AAPL', 'US', { retryDelaysMs: [0, 0, 0] })).rejects.toBeDefined();
    expect(timeouts).toEqual([30_000, 15_000, 15_000]);
  });
});
