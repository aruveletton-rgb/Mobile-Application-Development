import { http } from '@kit.NetworkKit';
import { util } from '@kit.ArkTS';
import { Envelope, StreamData, StreamEvent } from '../model/Models';
interface DemoFlags { synthetic: boolean; realBusinessWrite: boolean; }

export class ApiFailure extends Error {
  code: string;
  uncertain: boolean;
  constructor(code: string, message: string, uncertain: boolean = false) { super(`${code}: ${message}`); this.code = code; this.uncertain = uncertain; }
}
export class SSEFrames {
  private buffer: string = '';
  push(text: string): StreamEvent[] {
    this.buffer += text;
    const result: StreamEvent[] = [];
    let separator = /\r?\n\r?\n/.exec(this.buffer);
    while (separator) {
      const block = this.buffer.slice(0, separator.index);
      this.buffer = this.buffer.slice(separator.index + separator[0].length);
      let type = ''; const data: string[] = [];
      block.split(/\r?\n/).forEach(line => { if (line.startsWith('event:')) type = line.slice(6).trim(); if (line.startsWith('data:')) data.push(line.slice(5).trimStart()); });
      if (['meta', 'delta', 'error', 'done'].includes(type) && data.length > 0) result.push({ type, data: JSON.parse(data.join('\n')) as StreamData });
      separator = /\r?\n\r?\n/.exec(this.buffer);
    }
    if (this.buffer.length > 1000000) throw new Error('SSE 帧过大');
    return result;
  }
}
export class ApiClient {
  baseUrl: string;
  session: string;
  private active: http.HttpRequest | null = null;
  private cancelActive: (() => void) | null = null;
  constructor(baseUrl: string, session: string) { this.baseUrl = baseUrl; this.session = session; }
  async request<T>(path: string, method: http.RequestMethod = http.RequestMethod.GET, body: string = '', key: string = ''): Promise<T> {
    const request = http.createHttp();
    try {
      const result = await request.request(this.baseUrl.replace(/\/$/, '') + path, { method, header: { 'Content-Type': 'application/json', 'X-Demo-Session': this.session, 'Idempotency-Key': key }, extraData: body, connectTimeout: 6000, readTimeout: 6000, expectDataType: http.HttpDataType.STRING });
      const response = JSON.parse(String(result.result)) as Envelope<T>;
      if (result.responseCode !== 200 || response.code !== 'OK') throw new ApiFailure(response.code, response.message);
      if (!response.data || !response.traceId) throw new ApiFailure('INVALID_RESPONSE', '响应封装不完整', true);
      const flags = JSON.parse(JSON.stringify(response.data)) as DemoFlags;
      if (flags.synthetic !== true || flags.realBusinessWrite !== false) throw new ApiFailure('NON_DEMO_RESPONSE', '接口未标记为合成演示，结果未确认', true);
      return response.data;
    } catch (e) {
      if (e instanceof ApiFailure) throw e;
      throw new ApiFailure('CONNECTION_UNCERTAIN', '连接失败或超时，结果未确认', true);
    } finally { request.destroy(); }
  }
  cancel(): void { if (this.cancelActive) this.cancelActive(); }
  stream(body: string, onEvent: (event: StreamEvent) => void): Promise<void> {
    this.cancel();
    return new Promise<void>((resolve, reject) => {
      const request = http.createHttp(); this.active = request;
      const frames = new SSEFrames(); const decoder = new util.TextDecoder('utf-8'); let ended = false;
      const finish = (failure: Error | null): void => {
        if (ended) return; ended = true; clearTimeout(timer); request.destroy(); this.active = null; this.cancelActive = null;
        if (failure) reject(failure); else resolve();
      };
      const timer = setTimeout(() => finish(new Error('流式超时，回答未完成')), 30000);
      this.cancelActive = () => finish(new Error('已取消，回答未完成'));
      request.on('dataReceive', (data: ArrayBuffer) => {
        if (ended) return;
        try { frames.push(decoder.decodeToString(new Uint8Array(data), { stream: true })).forEach(onEvent); } catch (e) { finish(new Error('流式协议错误')); }
      });
      request.on('dataEnd', () => { if (!ended) { try { frames.push(decoder.decodeToString(new Uint8Array(0), { stream: false })).forEach(onEvent); finish(null); } catch (e) { finish(new Error('流式解码失败')); } } });
      request.requestInStream(this.baseUrl.replace(/\/$/, '') + '/api/v1/chat/stream', { method: http.RequestMethod.POST, header: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream', 'X-Demo-Session': this.session }, extraData: body, connectTimeout: 6000, readTimeout: 30000 }).then(code => { if (code !== 200) finish(new Error(`STREAM_${code}`)); }).catch(() => finish(new Error('流式连接失败，回答未完成')));
    });
  }
}
