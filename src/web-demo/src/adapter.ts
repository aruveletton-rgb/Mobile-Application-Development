import type { Activity, ActivityDraft, ChatData, Confirmation, Draft, Envelope, EvidenceRef, LostItem, Mode, Notice, ScheduleItem, Session, Signup, Ticket } from './types';
import { OfflineStore } from './offline';
import { SSEDecoder, type StreamEvent } from './sse';

const wait = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
  const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
  const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
  signal?.addEventListener('abort', abort, { once: true });
});
const id = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
const envelope = <T>(data: T | null, code = 'OK', message = 'ok'): Envelope<T> => ({ code, message, data, traceId: id('trace') });

export const notices: Notice[] = [
  { noticeId: 'notice-001', title: '图书馆周末开放时间调整', content: '本合成通知：周六、周日开放至21:00。请以服务台最终公告为准。', sourceId: 'synthetic-campus-board', evidenceId: 'campus-notice-001', version: 'v1', effectiveFrom: '2026-10-01', effectiveTo: null },
  { noticeId: 'notice-002', title: '秋季校园活动周', content: '本合成通知：活动报名需要在截止时间前完成确认。', sourceId: 'synthetic-campus-board', evidenceId: 'campus-activity-001', version: 'v1', effectiveFrom: '2026-10-08', effectiveTo: '2026-10-31' },
];
export const schedule: ScheduleItem[] = [
  { scheduleId: 'course-001', kind: 'course', title: '移动应用开发', location: '教学楼 A203', startsAt: '2026-10-13T08:00:00+08:00', endsAt: '2026-10-13T09:40:00+08:00', synthetic: true },
  { scheduleId: 'course-002', kind: 'course', title: '仓颉语言程序设计', location: '实验楼 B108', startsAt: '2026-10-14T14:00:00+08:00', endsAt: '2026-10-14T15:40:00+08:00', synthetic: true },
  { scheduleId: 'exam-001', kind: 'exam', title: '数据库原理阶段测验', location: '教学楼 C301', startsAt: '2026-10-20T09:00:00+08:00', endsAt: '2026-10-20T10:30:00+08:00', synthetic: true },
];
export const activities: Activity[] = [
  { activityId: 'activity-001', title: '校园创新作品分享会', location: '报告厅', startsAt: new Date(Date.now() + 7 * 86400000).toISOString(), deadlineAt: new Date(Date.now() + 6 * 86400000).toISOString(), remainingCapacity: 18, status: 'OPEN', session: 'morning' },
  { activityId: 'activity-002', title: '旧物循环交换日（满额）', location: '生活区广场', startsAt: new Date(Date.now() + 8 * 86400000).toISOString(), deadlineAt: new Date(Date.now() + 7 * 86400000).toISOString(), remainingCapacity: 0, status: 'OPEN', session: 'morning' },
  { activityId: 'activity-003', title: '校园运动日（已截止）', location: '操场', startsAt: new Date(Date.now() - 86400000).toISOString(), deadlineAt: new Date(Date.now() - 2 * 86400000).toISOString(), remainingCapacity: 8, status: 'CLOSED', session: 'morning' },
];
export const lostItems: LostItem[] = [
  { lostItemId: 'lost-001', kind: 'FOUND', itemDescription: '蓝色卡套，合成示例', location: '图书馆一层', occurredOn: '2026-10-11', status: 'PENDING_REVIEW', contactAlias: 'SYN-CONTACT-K' },
];

export class ApiError extends Error {
  constructor(public code: string, message: string, public uncertain = false) { super(`${code}: ${message}`); }
}
export class DemoAdapter {
  private local: OfflineStore;
  constructor(private readonly mode: Mode, private readonly baseUrl: string, private readonly session: Session) {
    this.local = new OfflineStore(session, activities);
  }
  private headers(extra: Record<string, string> = {}) { return { 'Content-Type': 'application/json', 'X-Demo-Session': this.session.key, ...extra }; }
  private locally<T>(operation: () => T): Promise<T> {
    if (!navigator.locks) throw new ApiError('LOCAL_LOCK_UNAVAILABLE', '浏览器不支持本地业务锁，请使用支持 Web Locks 的浏览器');
    return navigator.locks.request(`campus-offline:${this.session.domainId}:${this.session.userId}`, operation);
  }
  private async remote<T>(path: string, init: RequestInit = {}): Promise<Envelope<T>> {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}${path}`, { ...init, signal: controller.signal, headers: { ...this.headers(), ...(init.headers ?? {}) } });
      const body = await response.json() as Envelope<T>;
      if (!response.ok || body.code !== 'OK') throw new ApiError(body.code || 'HTTP_ERROR', body.message || `HTTP ${response.status}`);
      if (!body.data || !body.traceId) throw new ApiError('INVALID_RESPONSE', '响应封装不完整', true);
      const flags = body.data as { synthetic?: boolean; realBusinessWrite?: boolean };
      if (flags.synthetic !== true || flags.realBusinessWrite !== false) throw new ApiError('NON_DEMO_RESPONSE', '接口未标记为合成演示，结果不能确认', true);
      return body;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError('CONNECTION_UNCERTAIN', `连接失败或超时：${(error as Error).message}`, true);
    } finally { clearTimeout(timer); }
  }
  async health() { return this.mode === 'offline-synthetic' ? envelope({ status: 'offline', version: '0.2.0', synthetic: true, realBusinessWrite: false }) : this.remote<{ status: string; version: string; synthetic: boolean }>('/health'); }
  async getNotices() {
    const items = this.session.domainId === 'campus-demo' ? notices : [{ ...notices[0], noticeId: 'community-notice-001', title: '合成社区服务时间', content: '社区演示服务台周一至周五开放，仅合成示例。', sourceId: 'synthetic-community-board', evidenceId: 'community-notice-001' }];
    return this.mode === 'offline-synthetic' ? envelope({ items, synthetic: true, realBusinessWrite: false }) : this.remote<{ items: Notice[] }>('/api/v1/notices');
  }
  async getSchedule() { if (this.mode === 'remote-http') return this.remote<{ items: ScheduleItem[] }>('/api/v1/schedule'); this.local.campus(); return envelope({ items: schedule, synthetic: true, realBusinessWrite: false }); }
  async getActivities() { if (this.mode === 'remote-http') return this.remote<{ items: Activity[] }>('/api/v1/activities'); this.local.campus(); return envelope({ items: this.local.items().activities, synthetic: true, realBusinessWrite: false }); }
  async getLostItems() { if (this.mode === 'remote-http') return this.remote<{ items: LostItem[] }>('/api/v1/lost-items'); this.local.campus(); return envelope({ items: [...lostItems, ...this.local.items().lost], synthetic: true, realBusinessWrite: false }); }
  async getTickets() { return this.mode === 'remote-http' ? this.remote<{ items: Ticket[] }>('/api/v1/tickets') : envelope({ items: this.local.items().tickets, synthetic: true, realBusinessWrite: false }); }
  async getTicket(ticketId: string) {
    if (this.mode === 'remote-http') return this.remote<Ticket>(`/api/v1/tickets/${ticketId}`);
    const ticket = this.local.items().tickets.find(item => item.ticketId === ticketId);
    if (!ticket) throw new ApiError('NOT_FOUND', '工单不存在于当前会话');
    return envelope(ticket);
  }
  async chat(requestId: string, text: string, conversationId: string) {
    if (this.mode === 'remote-http') return this.remote<ChatData>('/api/v1/chat', { method: 'POST', body: JSON.stringify({ requestId, text, conversationId }) });
    const intent = /报修|漏水|坏/.test(text) ? 'repair' : /课程|考试|课表/.test(text) ? 'schedule' : /失物|拾物/.test(text) ? 'lost' : /活动/.test(text) ? 'activity' : /通知|公告/.test(text) ? 'notice' : /养老/.test(text) ? 'eldercare' : /材料|办事/.test(text) ? 'consultation' : 'chitchat';
    const community = this.session.domainId === 'community-demo';
    const answer = intent === 'repair' ? '请转到报修服务，填写位置、问题描述和合成联系别名，再核对草稿并确认。对话不会创建工单。' : intent === 'schedule' ? community ? '社区会话不能查看校园课程。' : '课程与考试在本地日程页。个人 CSV 仅在本机导入、校验和保存。' : intent === 'lost' ? '失物发布须核对草稿并明确确认，校园演示发布只进入待审核；社区仅提供查询咨询。' : intent === 'activity' ? '校园活动在报名时重新检查截止、容量和重复报名；社区只提供咨询。' : intent === 'notice' ? '请在通知页查看当前域的合成公告及来源版本。' : intent === 'eldercare' ? '仅提供合成养老咨询，没有真实资格或服务时段证据，不能申请服务。' : intent === 'consultation' ? '请补充具体事项，当前没有真实办事材料清单。' : '你好。请选择通知、日程、报修、失物或活动。当前为本地合成回答。';
    const evidenceRefs: EvidenceRef[] = ['chitchat', 'eldercare', 'consultation'].includes(intent) ? [] : [{ evidenceId: `${this.session.domainId}-${intent}-synthetic`, version: 'v1' }];
    return envelope({ requestId, conversationId, answer, evidenceRefs, intent, synthetic: true, realBusinessWrite: false });
  }
  async *streamChat(requestId: string, text: string, conversationId: string, signal: AbortSignal): AsyncGenerator<StreamEvent> {
    if (this.mode === 'remote-http') {
      const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/api/v1/chat/stream`, { method: 'POST', headers: this.headers({ Accept: 'text/event-stream' }), body: JSON.stringify({ requestId, text, conversationId }), signal });
      if (!response.ok || !response.body || !response.headers.get('content-type')?.includes('text/event-stream')) throw new ApiError(`STREAM_${response.status}`, '服务端未提供流式响应');
      const reader = response.body.getReader(), decoder = new TextDecoder(), frames = new SSEDecoder();
      let completed = false;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) { for (const event of frames.push(decoder.decode())) yield event; break; }
          for (const event of frames.push(decoder.decode(value, { stream: true }))) {
            if (event.type === 'done') { if (completed) throw new Error('重复 done 事件'); completed = true; }
            yield event;
          }
        }
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      return;
    }
    const result = await this.chat(requestId, text, conversationId); if (!result.data) throw new Error('CHAT_EMPTY');
    yield { type: 'meta', data: { requestId, traceId: result.traceId, conversationId, evidenceRefs: result.data.evidenceRefs, intent: result.data.intent, synthetic: true } };
    for (const part of result.data.answer.match(/.{1,8}/gu) ?? []) { await wait(90, signal); yield { type: 'delta', data: { text: part } }; }
    yield { type: 'done', data: { status: 'COMPLETED' } };
  }
  async createDraft(requestId: string, fields: Record<string, string>, kind: 'repair' | 'lost') {
    return this.mode === 'remote-http' ? this.remote<Draft>(kind === 'repair' ? '/api/v1/ticket-drafts' : '/api/v1/lost-item-drafts', { method: 'POST', body: JSON.stringify({ requestId, ...fields }) }) : envelope(await this.locally(() => this.local.draft(fields, kind)));
  }
  async confirmDraft(requestId: string, draft: Draft, kind: 'repair' | 'lost') {
    return this.mode === 'remote-http' ? this.remote<Confirmation>(`${kind === 'repair' ? '/api/v1/ticket-drafts/' : '/api/v1/lost-item-drafts/'}${draft.draftId}/confirm`, { method: 'POST', body: JSON.stringify({ requestId, revision: draft.revision }) }) : envelope(await this.locally(() => this.local.confirm(draft, kind)));
  }
  async submitRepair(requestId: string, draft: Draft, confirmation: Confirmation, key: string) {
    return this.mode === 'remote-http' ? this.remote<Ticket>('/api/v1/tickets', { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify({ requestId, draftId: draft.draftId, confirmationId: confirmation.confirmationId }) }) : envelope(await this.locally(() => this.local.submit(requestId, draft, confirmation, key, 'repair') as Ticket));
  }
  async submitLost(requestId: string, draft: Draft, confirmation: Confirmation, key: string) {
    return this.mode === 'remote-http' ? this.remote<LostItem>('/api/v1/lost-items', { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify({ requestId, draftId: draft.draftId, confirmationId: confirmation.confirmationId }) }) : envelope(await this.locally(() => this.local.submit(requestId, draft, confirmation, key, 'lost') as LostItem));
  }
  async createActivityDraft(requestId: string, activity: Activity, session: string, contactAlias: string) {
    return this.mode === 'remote-http' ? this.remote<ActivityDraft>('/api/v1/activity-signup-drafts', { method: 'POST', body: JSON.stringify({ requestId, activityId: activity.activityId, session, contactAlias }) }) : envelope(await this.locally(() => this.local.draft({ activityId: activity.activityId, title: activity.title, session, contactAlias }, 'activity') as ActivityDraft));
  }
  async confirmActivityDraft(requestId: string, draft: ActivityDraft) {
    return this.mode === 'remote-http' ? this.remote<Confirmation>(`/api/v1/activity-signup-drafts/${draft.draftId}/confirm`, { method: 'POST', body: JSON.stringify({ requestId, revision: draft.revision }) }) : envelope(await this.locally(() => this.local.confirm(draft, 'activity')));
  }
  async submitActivity(requestId: string, draft: ActivityDraft, confirmation: Confirmation, key: string, activity: Activity) {
    return this.mode === 'remote-http' ? this.remote<Signup>(`/api/v1/activities/${activity.activityId}/signups`, { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify({ requestId, draftId: draft.draftId, confirmationId: confirmation.confirmationId }) }) : envelope(await this.locally(() => this.local.submit(requestId, draft, confirmation, key, 'activity') as Signup));
  }
  async getMySignups() {
    if (this.mode === 'remote-http') return this.remote<{ items: Signup[] }>('/api/v1/activity-signups');
    this.local.campus();
    return envelope({ items: this.local.items().signups, synthetic: true, realBusinessWrite: false });
  }
  async getRequestResult(requestId: string) {
    return this.mode === 'remote-http' ? this.remote<{ requestId: string; resultStatus: string; ticketId?: string; receipt?: Ticket }> (`/api/v1/requests/${encodeURIComponent(requestId)}/result`) : envelope(this.local.request(requestId));
  }
}
