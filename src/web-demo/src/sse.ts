export interface StreamEvent { type: 'meta' | 'delta' | 'error' | 'done'; data: Record<string, unknown>; }
export class SSEDecoder {
  private buffer = '';
  push(text: string): StreamEvent[] {
    this.buffer += text;
    const result: StreamEvent[] = [];
    let separator: RegExpExecArray | null;
    while ((separator = /\r?\n\r?\n/.exec(this.buffer))) {
      const block = this.buffer.slice(0, separator.index);
      this.buffer = this.buffer.slice(separator.index + separator[0].length);
      let type = '', data: string[] = [];
      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith('event:')) type = line.slice(6).trim();
        if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
      }
      if (['meta', 'delta', 'error', 'done'].includes(type) && data.length) result.push({ type: type as StreamEvent['type'], data: JSON.parse(data.join('\n')) });
    }
    if (this.buffer.length > 1_000_000) throw new Error('SSE 帧超过大小限制');
    return result;
  }
}
