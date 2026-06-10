/** SSE 事件解析结果 */
export interface SSEEvent {
  event: string;
  data: unknown;
}

/**
 * SSE 逐行状态机解析器。
 * 将原始 SSE 文本块解析为结构化事件列表。
 *
 * 用法：
 *   const parser = new SSEParser();
 *   const events = parser.parse(chunk1);
 *   const moreEvents = parser.parse(chunk2); // 跨 chunk 保持状态
 */
export class SSEParser {
  private buffer = '';
  private pendingEvent: string | null = null;

  /**
   * 解析一个 SSE 数据块，返回完整的事件列表。
   * 支持跨 chunk 的不完整行（保留在内部 buffer 中）。
   */
  parse(chunk: string): SSEEvent[] {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || ''; // 最后一个可能是不完整的行

    const events: SSEEvent[] = [];

    for (const line of lines) {
      if (line === '') {
        // SSE 事件之间的空行，重置状态
        this.pendingEvent = null;
        continue;
      }

      if (line.startsWith(':')) {
        // SSE comment line
        continue;
      }

      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) continue;

      const field = line.slice(0, colonIndex);
      let value = line.slice(colonIndex + 1);
      if (value.startsWith(' ')) value = value.slice(1);

      if (field === 'event') {
        this.pendingEvent = value.trim();
      } else if (field === 'data' && this.pendingEvent) {
        try {
          const data = JSON.parse(value);
          events.push({ event: this.pendingEvent, data });
          this.pendingEvent = null;
        } catch (err) {
          console.warn('Failed to parse SSE data', { event: this.pendingEvent, data: value, error: err });
          this.pendingEvent = null;
        }
      }
    }

    return events;
  }

  /** 重置解析器状态 */
  reset(): void {
    this.buffer = '';
    this.pendingEvent = null;
  }
}
