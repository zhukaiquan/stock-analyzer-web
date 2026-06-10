import { describe, it, expect, vi } from 'vitest';
import { SSEParser } from '@/lib/sse-parser';

// =========================================================================
// 测试用例：SSE 逐行状态机解析器（P1 优化验证）
// 验收标准：
//   1. 标准的 SSE event+data 对被正确解析
//   2. 跨 chunk 的不完整行能被正确处理（buffer 机制）
//   3. JSON 格式错误不会导致解析器崩溃（容错）
//   4. 空行正确重置 pendingEvent 状态
//   5. 无 event 前缀的 data 行被忽略
//   6. 多个连续事件被正确解析
// =========================================================================

describe('SSEParser - 基本事件解析', () => {
  it('解析单个完整的 SSE 事件', () => {
    const parser = new SSEParser();
    const events = parser.parse('event: fetching_data\ndata: {"status":"ok"}\n\n');

    expect(events.length).toBe(1);
    expect(events[0].event).toBe('fetching_data');
    expect(events[0].data).toEqual({ status: 'ok' });
  });

  it('支持无空格的合法 SSE 字段格式', () => {
    const parser = new SSEParser();
    const events = parser.parse('event:fetching_data\ndata:{"status":"ok"}\n\n');

    expect(events.length).toBe(1);
    expect(events[0].event).toBe('fetching_data');
    expect(events[0].data).toEqual({ status: 'ok' });
  });

  it('解析多个连续 SSE 事件', () => {
    const parser = new SSEParser();
    const chunk = [
      'event: fetching_data',
      'data: {"step":1}',
      '',
      'event: data_fetched',
      'data: {"step":2}',
      '',
      'event: analyzing',
      'data: {"partial":"分析内容"}',
      '',
    ].join('\n');

    const events = parser.parse(chunk);
    expect(events.length).toBe(3);
    expect(events[0].event).toBe('fetching_data');
    expect(events[0].data).toEqual({ step: 1 });
    expect(events[1].event).toBe('data_fetched');
    expect(events[1].data).toEqual({ step: 2 });
    expect(events[2].event).toBe('analyzing');
    expect(events[2].data).toEqual({ partial: '分析内容' });
  });

  it('正确解析 complete 事件（含嵌套数据）', () => {
    const parser = new SSEParser();
    const data = {
      id: 'test-id',
      markdown: '# 分析报告',
      parsed: {
        score: 85,
        conclusion: '推荐',
        dimensions: { industry: 80, company: 85 },
      },
    };
    const chunk = `event: complete\ndata: ${JSON.stringify(data)}\n\n`;

    const events = parser.parse(chunk);
    expect(events.length).toBe(1);
    expect(events[0].event).toBe('complete');
    expect((events[0].data as Record<string, unknown>).id).toBe('test-id');
  });
});

describe('SSEParser - 跨 chunk buffer 机制（P1 关键验证）', () => {
  it('不完整的行保留在 buffer 中，下一个 chunk 补全', () => {
    const parser = new SSEParser();

    // 第一个 chunk：event 行完整，data 行被截断
    const events1 = parser.parse('event: fetching_data\ndata: {"sta');
    expect(events1.length).toBe(0); // data 行不完整，还在 buffer 中

    // 第二个 chunk：补全 data 行
    const events2 = parser.parse('tus":"ok"}\n\n');
    expect(events2.length).toBe(1);
    expect(events2[0].event).toBe('fetching_data');
    expect(events2[0].data).toEqual({ status: 'ok' });
  });

  it('event 行被分割在两个 chunk 之间', () => {
    const parser = new SSEParser();

    const events1 = parser.parse('event: analy');
    expect(events1.length).toBe(0);

    const events2 = parser.parse('zing\ndata: {"partial":"..."}\n\n');
    expect(events2.length).toBe(1);
    expect(events2[0].event).toBe('analyzing');
  });

  it('多个 chunk 模拟真实流式传输', () => {
    const parser = new SSEParser();
    const allEvents: Array<{ event: string; data: unknown }> = [];

    // 模拟 3 个网络 chunk
    allEvents.push(...parser.parse('event: fetching_data\ndata: {"msg":"开始取数"}\n\nevent: '));
    allEvents.push(...parser.parse('data_fetched\ndata: {"msg":"取数完成"}\n\nevent: analyzing\n'));
    allEvents.push(...parser.parse('data: {"partial":"## 行业分析"}\n\n'));

    expect(allEvents.length).toBe(3);
    expect(allEvents[0].event).toBe('fetching_data');
    expect(allEvents[1].event).toBe('data_fetched');
    expect(allEvents[2].event).toBe('analyzing');
  });
});

describe('SSEParser - 容错机制', () => {
  it('JSON 格式错误时不崩溃，返回空结果并记录警告', () => {
    const parser = new SSEParser();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const chunk = 'event: analyzing\ndata: {不是有效 JSON\n\n';

    const events = parser.parse(chunk);
    expect(events.length).toBe(0);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('JSON 错误后继续解析下一个事件', () => {
    const parser = new SSEParser();
    const chunk = [
      'event: analyzing',
      'data: {broken',
      '',
      'event: complete',
      'data: {"id":"ok"}',
      '',
    ].join('\n');

    const events = parser.parse(chunk);
    expect(events.length).toBe(1);
    expect(events[0].event).toBe('complete');
  });

  it('无 event 前缀的 data 行被忽略', () => {
    const parser = new SSEParser();
    const chunk = 'data: {"orphan":"data"}\n\n';

    const events = parser.parse(chunk);
    expect(events.length).toBe(0);
  });

  it('空行重置 pendingEvent，防止跨事件混淆', () => {
    const parser = new SSEParser();
    const chunk = [
      'event: fetching_data',
      '', // 空行重置
      'data: {"should":"be ignored"}', // 无 pending event，应被忽略
      '',
    ].join('\n');

    const events = parser.parse(chunk);
    expect(events.length).toBe(0);
  });

  it('注释行（:开头）不影响解析', () => {
    const parser = new SSEParser();
    const chunk = ': this is a comment\nevent: fetching_data\ndata: {"ok":true}\n\n';

    const events = parser.parse(chunk);
    expect(events.length).toBe(1);
    expect(events[0].event).toBe('fetching_data');
  });
});

describe('SSEParser - reset 方法', () => {
  it('reset 后清除 buffer 和 pendingEvent', () => {
    const parser = new SSEParser();

    // 先喂一个不完整的行
    parser.parse('event: analyz');
    parser.reset();

    // 重置后，新的解析不受影响
    const events = parser.parse('event: complete\ndata: {"id":"new"}\n\n');
    expect(events.length).toBe(1);
    expect(events[0].event).toBe('complete');
  });
});

describe('SSEParser - 完整流程模拟', () => {
  it('模拟一次完整的分析流程 SSE 事件序列', () => {
    const parser = new SSEParser();

    const fullStream = [
      'event: fetching_data',
      'data: {"symbol":"600519","market":"A"}',
      '',
      'event: data_fetched',
      'data: {"symbol":"600519","dataPoints":42}',
      '',
      'event: analyzing',
      'data: {"partial":"# 贵州茅台分析"}',
      '',
      'event: analyzing',
      'data: {"partial":"\\n\\n## 行业分析"}',
      '',
      'event: analyzing',
      'data: {"partial":"\\n白酒行业龙头"}',
      '',
      'event: analysis_complete',
      'data: {}',
      '',
      'event: parsed',
      'data: {"score":85}',
      '',
      'event: saved',
      'data: {"id":"abc-123"}',
      '',
      'event: complete',
      'data: {"id":"abc-123","markdown":"# 完整报告","parsed":{"score":85}}',
      '',
    ].join('\n');

    const events = parser.parse(fullStream);
    const eventNames = events.map(e => e.event);

    expect(eventNames).toEqual([
      'fetching_data',
      'data_fetched',
      'analyzing',
      'analyzing',
      'analyzing',
      'analysis_complete',
      'parsed',
      'saved',
      'complete',
    ]);
  });
});
