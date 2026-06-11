import { describe, it, expect, vi, beforeEach } from 'vitest';

// =========================================================================
// 测试用例：storage.ts 异步 I/O + 索引优化
// 验收标准：
//   1. saveReport 异步写入 JSON 和 Markdown 文件
//   2. listReports 优先从 index.json 索引读取（快速路径）
//   3. listReports 索引不存在时自动重建（容错）
//   4. deleteReport 并行删除文件并更新索引
//   5. getReport 文件不存在时返回 null
// =========================================================================

// Mock fs/promises 模块，避免实际文件操作
const mockFs = {
  mkdir: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockResolvedValue([]),
  unlink: vi.fn().mockResolvedValue(undefined),
  rename: vi.fn().mockResolvedValue(undefined),
};

vi.mock('fs/promises', () => ({
  default: mockFs,
}));

// 动态导入，让 mock 先生效
const { saveReport, getReport, listReports, deleteReport, findRecentReport } = await import('@/lib/storage');

describe('storage - saveReport（P0：异步 I/O 验证）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFs.readFile.mockRejectedValue(new Error('ENOENT')); // 默认索引不存在
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.mkdir.mockResolvedValue(undefined);
  });

  it('返回有效的 UUID 字符串', async () => {
    const id = await saveReport('600519', 'A', '# 贵州茅台分析', { name: '贵州茅台', score: 85 });
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('异步并行写入 JSON 和 Markdown 两个文件', async () => {
    await saveReport('600519', 'A', '# 茅台分析', { name: '贵州茅台', score: 85 });

    // writeFile 应该被调用两次（JSON + Markdown）
    expect(mockFs.writeFile).toHaveBeenCalledTimes(2);

    const writeArgs = mockFs.writeFile.mock.calls;
    const jsonWrite = writeArgs.find((c: unknown[]) => String(c[0]).endsWith('.json'));
    const mdWrite = writeArgs.find((c: unknown[]) => String(c[0]).endsWith('.md'));

    expect(jsonWrite).toBeDefined();
    expect(mdWrite).toBeDefined();
  });

  it('JSON 文件包含完整的 StoredReport 结构', async () => {
    const id = await saveReport('600519', 'A', '# 贵州茅台分析', {
      name: '贵州茅台',
      score: 85,
      conclusion: '🟢 推荐',
    });

    const jsonWriteCall = mockFs.writeFile.mock.calls.find(
      (c: unknown[]) => String(c[0]).endsWith('.json')
    );
    const writtenData = JSON.parse(jsonWriteCall![1] as string);

    expect(writtenData.id).toBe(id);
    expect(writtenData.symbol).toBe('600519');
    expect(writtenData.name).toBe('贵州茅台');
    expect(writtenData.market).toBe('A');
    expect(writtenData.score).toBe(85);
    expect(writtenData.conclusion).toBe('🟢 推荐');
    expect(writtenData.markdown).toBe('# 贵州茅台分析');
    expect(writtenData.createdAt).toBeDefined();
  });

  it('索引存在时，saveReport 将摘要 unshift 到索引头部', async () => {
    // 模拟索引已存在
    const existingIndex = [
      { id: 'old-id', symbol: '000001', name: '平安银行', score: 70, createdAt: '2026-01-01T00:00:00Z' },
    ];
    mockFs.readFile.mockImplementation((filePath: string) => {
      if (filePath.endsWith('index.json')) {
        return Promise.resolve(JSON.stringify(existingIndex));
      }
      return Promise.reject(new Error('ENOENT'));
    });

    await saveReport('600519', 'A', '# 茅台分析', { name: '贵州茅台', score: 85 });

    // 索引应该被更新（写入 3 个文件：JSON + MD + index.tmp，然后 rename）
    const indexRenameCall = mockFs.rename.mock.calls.find(
      (c: unknown[]) => String(c[1]).endsWith('index.json')
    );
    expect(indexRenameCall).toBeDefined();

    const indexWriteCall = mockFs.writeFile.mock.calls.find(
      (c: unknown[]) => String(c[0]).endsWith('.tmp')
    );
    expect(indexWriteCall).toBeDefined();

    const updatedIndex = JSON.parse(indexWriteCall![1] as string);
    expect(updatedIndex.length).toBe(2);
    // 最新的在前面
    expect(updatedIndex[0].symbol).toBe('600519');
    expect(updatedIndex[1].symbol).toBe('000001');
  });
});

describe('storage - listReports（P1：index.json 索引验证）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('索引存在时直接返回（快速路径，不调用 readdir）', async () => {
    const indexData = [
      { id: 'a', symbol: '600519', name: '贵州茅台', score: 85, createdAt: '2026-06-09' },
      { id: 'b', symbol: '000001', name: '平安银行', score: 70, createdAt: '2026-06-08' },
    ];
    mockFs.readFile.mockResolvedValue(JSON.stringify(indexData));

    const result = await listReports();

    expect(result).toEqual(indexData);
    expect(result.length).toBe(2);
    // 不应该调用 readdir（重建才会调用）
    expect(mockFs.readdir).not.toHaveBeenCalled();
  });

  it('索引不存在时，重建索引（扫描目录）', async () => {
    // 第一次 readFile（读索引）失败，触发重建
    let readIndexCallCount = 0;
    mockFs.readFile.mockImplementation((filePath: string) => {
      if (filePath.endsWith('index.json')) {
        readIndexCallCount++;
        if (readIndexCallCount <= 1) {
          return Promise.reject(new Error('ENOENT'));
        }
        // 重建后写入了新索引，再次读取时返回
        return Promise.resolve('[]');
      }
      // 模拟读取 JSON 报告文件
      if (filePath.endsWith('.json')) {
        return Promise.resolve(JSON.stringify({
          id: 'test-id',
          symbol: '600519',
          name: '贵州茅台',
          market: 'A',
          score: 85,
          conclusion: '推荐',
          createdAt: '2026-06-09T00:00:00Z',
          markdown: '# 分析',
          parsed: {},
        }));
      }
      return Promise.reject(new Error('ENOENT'));
    });

    mockFs.readdir.mockResolvedValue(['report1.json', 'report1.md', 'index.json']);

    const result = await listReports();

    // 应该调用 readdir 扫描目录
    expect(mockFs.readdir).toHaveBeenCalled();
    // 结果应包含从 JSON 文件重建的摘要
    expect(result.length).toBeGreaterThan(0);
  });

  it('跳过损坏的 JSON 文件（容错）', async () => {
    let readIndexCallCount = 0;
    mockFs.readFile.mockImplementation((filePath: string) => {
      if (filePath.endsWith('index.json')) {
        readIndexCallCount++;
        if (readIndexCallCount <= 1) {
          return Promise.reject(new Error('ENOENT'));
        }
        return Promise.resolve('[]');
      }
      if (filePath.endsWith('.json')) {
        return Promise.resolve('这不是有效的 JSON {{{');
      }
      return Promise.reject(new Error('ENOENT'));
    });

    mockFs.readdir.mockResolvedValue(['broken.json']);

    const result = await listReports();

    // 损坏的文件应该被跳过，不抛异常
    expect(result).toEqual([]);
  });
});

describe('storage - getReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('返回完整的 StoredReport 对象', async () => {
    const storedReport = {
      id: 'test-id',
      symbol: '600519',
      name: '贵州茅台',
      market: 'A',
      score: 85,
      conclusion: '推荐',
      createdAt: '2026-06-09T00:00:00Z',
      markdown: '# 分析',
      parsed: { score: 85 },
    };
    mockFs.readFile.mockResolvedValue(JSON.stringify(storedReport));

    const result = await getReport('test-id');
    expect(result).toEqual(storedReport);
    expect(result?.symbol).toBe('600519');
  });

  it('报告不存在时返回 null（而非抛出异常）', async () => {
    mockFs.readFile.mockRejectedValue(new Error('ENOENT'));

    const result = await getReport('nonexistent-id');
    expect(result).toBeNull();
  });
});

describe('storage - deleteReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('并行删除 JSON 和 Markdown 文件', async () => {
    mockFs.unlink.mockResolvedValue(undefined);
    mockFs.readFile.mockRejectedValue(new Error('ENOENT')); // 索引不存在

    await deleteReport('test-id');

    // 应该调用 unlink 两次（JSON + Markdown）
    expect(mockFs.unlink).toHaveBeenCalledTimes(2);
    const unlinkArgs = mockFs.unlink.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(unlinkArgs.some((a: string) => a.endsWith('.json'))).toBe(true);
    expect(unlinkArgs.some((a: string) => a.endsWith('.md'))).toBe(true);
  });

  it('索引存在时，删除对应条目并更新索引', async () => {
    const existingIndex = [
      { id: 'keep-id', symbol: '000001', name: '平安银行' },
      { id: 'delete-id', symbol: '600519', name: '贵州茅台' },
    ];
    mockFs.unlink.mockResolvedValue(undefined);
    mockFs.readFile.mockImplementation((filePath: string) => {
      if (filePath.endsWith('index.json')) {
        return Promise.resolve(JSON.stringify(existingIndex));
      }
      return Promise.reject(new Error('ENOENT'));
    });

    await deleteReport('delete-id');

    const indexRenameCall = mockFs.rename.mock.calls.find(
      (c: unknown[]) => String(c[1]).endsWith('index.json')
    );
    expect(indexRenameCall).toBeDefined();

    const indexWriteCall = mockFs.writeFile.mock.calls.find(
      (c: unknown[]) => String(c[0]).endsWith('.tmp')
    );
    expect(indexWriteCall).toBeDefined();

    const updatedIndex = JSON.parse(indexWriteCall![1] as string);
    expect(updatedIndex.length).toBe(1);
    expect(updatedIndex[0].id).toBe('keep-id');
  });

  it('报告文件不存在时返回 false', async () => {
    const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    mockFs.unlink.mockRejectedValue(enoent);
    mockFs.readFile.mockRejectedValue(enoent);

    const result = await deleteReport('nonexistent-id');
    expect(result).toBe(false);
  });

  it('JSON 删除失败时不吞掉非 ENOENT 错误', async () => {
    mockFs.unlink.mockRejectedValue(new Error('EACCES'));

    await expect(deleteReport('test-id')).rejects.toThrow('EACCES');
  });
});

describe('storage - findRecentReport（7 天报告缓存）', () => {
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('返回 TTL 内的最新报告（命中缓存）', async () => {
    const indexData = [
      { id: 'b', symbol: '600519', name: '贵州茅台', market: 'A', score: 85, conclusion: '推荐', createdAt: '2026-06-10T00:00:00Z' },
      { id: 'a', symbol: '600519', name: '贵州茅台', market: 'A', score: 80, conclusion: '推荐', createdAt: '2026-06-05T00:00:00Z' },
    ];
    mockFs.readFile.mockResolvedValue(JSON.stringify(indexData));

    const now = Date.parse('2026-06-11T00:00:00Z');
    const result = await findRecentReport('600519', 'A', SEVEN_DAYS, now);

    expect(result?.id).toBe('b'); // 最新一份
  });

  it('最新匹配也已超期时返回 null', async () => {
    const indexData = [
      { id: 'a', symbol: '600519', name: '贵州茅台', market: 'A', score: 85, conclusion: '推荐', createdAt: '2026-05-30T00:00:00Z' },
    ];
    mockFs.readFile.mockResolvedValue(JSON.stringify(indexData));

    const now = Date.parse('2026-06-11T00:00:00Z'); // 距离 createdAt 12 天，超期
    const result = await findRecentReport('600519', 'A', SEVEN_DAYS, now);

    expect(result).toBeNull();
  });

  it('symbol 或 market 不匹配时返回 null', async () => {
    const indexData = [
      { id: 'a', symbol: '000001', name: '平安银行', market: 'A', score: 70, conclusion: '观望', createdAt: '2026-06-10T00:00:00Z' },
    ];
    mockFs.readFile.mockResolvedValue(JSON.stringify(indexData));

    const now = Date.parse('2026-06-11T00:00:00Z');
    expect(await findRecentReport('600519', 'A', SEVEN_DAYS, now)).toBeNull(); // 不同 symbol
    expect(await findRecentReport('000001', 'HK', SEVEN_DAYS, now)).toBeNull(); // 不同 market
  });

  it('TTL 边界严格大于：刚好 7 天整应视为过期', async () => {
    // createdAt 距离 now 正好 7 天
    const indexData = [
      { id: 'a', symbol: '600519', name: '贵州茅台', market: 'A', score: 85, conclusion: '推荐', createdAt: '2026-06-04T00:00:00Z' },
    ];
    mockFs.readFile.mockResolvedValue(JSON.stringify(indexData));

    const now = Date.parse('2026-06-11T00:00:00Z');
    expect(await findRecentReport('600519', 'A', SEVEN_DAYS, now)).toBeNull();

    // 早 1 秒（少于 7 天）应命中
    const justInside = now - 1000;
    expect((await findRecentReport('600519', 'A', SEVEN_DAYS, justInside))?.id).toBe('a');
  });

  it('索引为空时返回 null（不报错）', async () => {
    mockFs.readFile.mockResolvedValue('[]');
    const result = await findRecentReport('600519', 'A');
    expect(result).toBeNull();
  });

  it('跳过最新匹配前的非匹配条目（不会被首条非匹配误终止）', async () => {
    const indexData = [
      // 索引按 createdAt DESC：最新的是别的股票，目标股票排第二
      { id: 'other', symbol: '000001', name: '平安银行', market: 'A', score: 70, conclusion: '观望', createdAt: '2026-06-10T00:00:00Z' },
      { id: 'target', symbol: '600519', name: '贵州茅台', market: 'A', score: 85, conclusion: '推荐', createdAt: '2026-06-09T00:00:00Z' },
    ];
    mockFs.readFile.mockResolvedValue(JSON.stringify(indexData));

    const now = Date.parse('2026-06-11T00:00:00Z');
    const result = await findRecentReport('600519', 'A', SEVEN_DAYS, now);

    expect(result?.id).toBe('target');
  });
});
