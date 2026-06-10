import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =========================================================================
// 测试用例：ai-client.ts API key 校验 + 系统提示词缓存
// 验收标准：
//   1. DEEPSEEK_API_KEY 未设置时，调用分析函数立即抛出带指引的错误
//   2. DEEPSEEK_API_KEY 为空字符串时，同样抛出错误
//   3. SKILL.md 读取成功时，系统提示词被缓存
//   4. references 目录不存在时不会报错（容错）
// =========================================================================

// Mock OpenAI — 必须用 class 才能被 `new OpenAI()` 调用
const mockCreate = vi.hoisted(() => vi.fn());
vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: mockCreate,
      },
    };
  },
}));

// Mock fs（同步 API，ai-client.ts 内部用的 fs 而非 fs/promises）
const mockReadFileSync = vi.fn();
const mockReaddirSync = vi.fn();

vi.mock('fs', () => ({
  default: {
    readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
    readdirSync: (...args: unknown[]) => mockReaddirSync(...args),
  },
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
  readdirSync: (...args: unknown[]) => mockReaddirSync(...args),
}));

// 保存原始 env
const originalEnv = { ...process.env };

describe('ai-client - API key 校验（P0 验证）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 每次测试前清除缓存，确保 getClient 重新执行
    vi.resetModules();
    delete process.env.DEEPSEEK_API_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('DEEPSEEK_API_KEY 未设置时，claudeAnalyze 抛出带指引的错误', async () => {
    // 重新导入，清除模块级缓存
    const { claudeAnalyze } = await import('@/lib/ai-client');

    await expect(
      claudeAnalyze('600519', 'A', { price: 1800 })
    ).rejects.toThrow('DEEPSEEK_API_KEY');
  });

  it('DEEPSEEK_API_KEY 为空字符串时，同样抛出错误', async () => {
    process.env.DEEPSEEK_API_KEY = '';
    const { claudeAnalyze } = await import('@/lib/ai-client');

    await expect(
      claudeAnalyze('600519', 'A', { price: 1800 })
    ).rejects.toThrow('DEEPSEEK_API_KEY');
  });

  it('错误信息包含配置指引（.env.local）', async () => {
    const { claudeAnalyze } = await import('@/lib/ai-client');

    try {
      await claudeAnalyze('600519', 'A', {});
      expect.unreachable('应该抛出错误');
    } catch (err) {
      expect((err as Error).message).toContain('.env.local');
    }
  });

  it('DEEPSEEK_API_KEY 有效时，正确初始化 OpenAI 客户端', async () => {
    process.env.DEEPSEEK_API_KEY = 'sk-test-valid-key-123';

    // 模拟 SKILL.md 读取
    mockReadFileSync.mockImplementation((filePath: string) => {
      if (filePath.includes('SKILL.md')) return '# 价值投资分析 Skill';
      if (filePath.includes('references')) throw new Error('ENOENT');
      return '';
    });
    mockReaddirSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });

    // Mock stream response
    mockCreate.mockResolvedValue({
      [Symbol.asyncIterator]: async function* () {
        yield { choices: [{ delta: { content: '分析结果' } }] };
      },
    });

    const { claudeAnalyze } = await import('@/lib/ai-client');

    // 不应该抛出错误
    const stream = await claudeAnalyze('600519', 'A', { price: 1800 });
    expect(stream).toBeDefined();
  });
});

describe('ai-client - 系统提示词缓存', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.DEEPSEEK_API_KEY = 'sk-test-key';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('读取 SKILL.md 成功，references 目录不存在时不报错', async () => {
    mockReadFileSync.mockImplementation((filePath: string) => {
      if (filePath.includes('SKILL.md')) return '# Skill 内容';
      return '';
    });
    mockReaddirSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });

    mockCreate.mockResolvedValue({
      [Symbol.asyncIterator]: async function* () {
        yield { choices: [{ delta: { content: 'ok' } }] };
      },
    });

    const { claudeAnalyze } = await import('@/lib/ai-client');
    const stream = await claudeAnalyze('600519', 'A', {});
    expect(stream).toBeDefined();

    // SKILL.md 应该被读取
    expect(mockReadFileSync).toHaveBeenCalledWith(
      expect.stringContaining('SKILL.md'),
      'utf-8'
    );
  });

  it('references 目录下的 .md 文件会被追加到系统提示词', async () => {
    mockReadFileSync.mockImplementation((filePath: string) => {
      if (filePath.includes('SKILL.md')) return '# Skill';
      if (filePath.includes('qiu.md')) return '邱国鹭方法论';
      return '';
    });
    mockReaddirSync.mockReturnValue(['qiu.md', 'notes.txt']); // notes.txt 应被过滤

    mockCreate.mockResolvedValue({
      [Symbol.asyncIterator]: async function* () {
        yield { choices: [{ delta: { content: 'ok' } }] };
      },
    });

    const { claudeAnalyze } = await import('@/lib/ai-client');
    await claudeAnalyze('600519', 'A', {});

    // 验证 OpenAI create 被调用，且系统提示词包含 reference 内容
    expect(mockCreate).toHaveBeenCalled();
    const createArgs = mockCreate.mock.calls[0][0];
    const systemMessage = createArgs.messages.find((m: { role: string }) => m.role === 'system');
    expect(systemMessage.content).toContain('# Skill');
    expect(systemMessage.content).toContain('邱国鹭方法论');
    // notes.txt 不应被包含
    expect(systemMessage.content).not.toContain('notes.txt');
  });
});

describe('ai-client - claudeAnalyzeSync 同步版本', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    delete process.env.DEEPSEEK_API_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('API key 未设置时同样抛出错误', async () => {
    const { claudeAnalyzeSync } = await import('@/lib/ai-client');

    await expect(
      claudeAnalyzeSync('600519', 'A', {})
    ).rejects.toThrow('DEEPSEEK_API_KEY');
  });
});
