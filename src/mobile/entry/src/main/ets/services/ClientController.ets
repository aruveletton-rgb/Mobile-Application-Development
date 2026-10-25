import { common } from '@kit.AbilityKit';
import { http } from '@kit.NetworkKit';
import { Activity, ClientSnapshot, Confirmation, Draft, Fields, Items, Message, Notice, Pending, Receipt, RequestResult, Schedule, StreamEvent, freshSnapshot, makeId } from '../model/Models';
import { ApiClient, ApiFailure } from './ApiClient';
import { LocalStore } from './LocalStore';
import { OfflineRepository } from './OfflineRepository';

interface ChatRequest { requestId: string; text: string; conversationId: string; }
interface RepairRequest { requestId: string; location: string; description: string; contactAlias: string; }
interface LostRequest { requestId: string; kind: string; itemDescription: string; location: string; occurredOn: string; contactAlias: string; }
interface ActivityRequest { requestId: string; activityId: string; session: string; contactAlias: string; }
interface ConfirmRequest { requestId: string; revision: number; }
interface SubmitRequest { requestId: string; draftId: string; confirmationId: string; }

export class ClientController {
  state: ClientSnapshot = freshSnapshot();
  mode: string = 'offline'; session: string = 'campus-user'; base: string = 'http://127.0.0.1:38082';
  notices: Notice[] = []; schedule: Schedule[] = [];
  signupStatus: string = 'unknown'; signupError: string = '';
  private store: LocalStore = new LocalStore();
  private api: ApiClient = new ApiClient(this.base, this.session);
  private cancelled: boolean = false;
  private saveQueue: Promise<void> = Promise.resolve();
  private scope(): string { return `${this.mode}:${this.session}:${this.mode === 'remote' ? this.base : 'local'}`; }
  isCampus(): boolean { return this.session === 'campus-user'; }
  async open(context: common.UIAbilityContext): Promise<void> {
    await this.store.open(context);
    this.mode = await this.store.setting('mode', 'offline'); this.session = await this.store.setting('session', 'campus-user'); this.base = await this.store.setting('base', this.base);
    this.state = await this.store.load(this.scope()); this.api = new ApiClient(this.base, this.session);
    await this.refresh();
  }
  async save(): Promise<void> {
    const scope = this.scope(); const snapshot = JSON.parse(JSON.stringify(this.state)) as ClientSnapshot;
    this.saveQueue = this.saveQueue.catch(() => {}).then(() => this.store.save(scope, snapshot)); return this.saveQueue;
  }
  async configure(mode: string, session: string, base: string): Promise<void> {
    if (!['offline', 'remote'].includes(mode) || !['campus-user', 'community-user'].includes(session)) throw new Error('UNAUTHORIZED: 演示模式或会话无效');
    if (!/^https?:\/\/[^\s]+$/.test(base)) throw new Error('接口须为完整 HTTP(S) 地址');
    this.cancel(); await this.save(); this.mode = mode; this.session = session; this.base = base;
    await this.store.setSetting('mode', mode); await this.store.setSetting('session', session); await this.store.setSetting('base', base);
    this.state = await this.store.load(this.scope()); this.api = new ApiClient(base, session); await this.refresh();
  }
  async refresh(): Promise<void> {
    if (this.mode === 'offline') {
      this.signupStatus = 'loaded'; this.signupError = '';
      const n: Notice = { noticeId: `${this.session}-notice`, title: this.isCampus() ? '合成图书馆开放通知' : '合成社区服务台通知', content: '合成示例：服务时间需以正式公告为准。', sourceId: 'local-synthetic', evidenceId: `${this.session}-notice`, version: 'v1', effectiveFrom: '2026-10-01', effectiveTo: null };
      this.notices = [n];
      const now = Date.now();
      this.schedule = this.isCampus() ? [
        { scheduleId: 'local-course', title: '合成移动应用开发', kind: 'course', location: 'A203', startsAt: new Date(now + 86400000).toISOString(), endsAt: new Date(now + 90000000).toISOString(), personal: false },
        { scheduleId: 'local-exam', title: '合成阶段考试', kind: 'exam', location: 'C301', startsAt: new Date(now + 3 * 86400000).toISOString(), endsAt: new Date(now + 3 * 86400000 + 3600000).toISOString(), personal: false }
      ] : [];
      return;
    }
    this.signupStatus = 'unknown'; this.signupError = '';
    if (this.isCampus()) {
      try {
        this.state.signups = (await this.api.request<Items<Receipt>>('/api/v1/activity-signups')).items;
        this.signupStatus = 'loaded';
      } catch (e) {
        this.signupStatus = 'error'; this.signupError = e instanceof Error ? e.message : '报名查询失败';
      }
    }
    this.notices = []; this.schedule = []; this.state.tickets = []; this.state.lost = []; this.state.activities = [];
    this.notices = (await this.api.request<Items<Notice>>('/api/v1/notices')).items;
    this.state.tickets = (await this.api.request<Items<Receipt>>('/api/v1/tickets')).items;
    if (this.isCampus()) {
      this.schedule = (await this.api.request<Items<Schedule>>('/api/v1/schedule')).items;
      this.state.lost = (await this.api.request<Items<Receipt>>('/api/v1/lost-items')).items;
      this.state.activities = (await this.api.request<Items<Activity>>('/api/v1/activities')).items;
    }
    await this.save();
    if (this.signupStatus === 'error') throw new Error(this.signupError);
  }
  latest(kind: string): Draft | null { const available = this.state.drafts.filter(r => r.kind === kind && !r.used); return available.length > 0 ? available[available.length - 1].draft : null; }
  token(draft: Draft): Confirmation | null { const tokens = this.state.confirmations.filter(c => c.confirmation.draftId === draft.draftId); return tokens.length > 0 ? tokens[tokens.length - 1].confirmation : null; }
  async create(kind: string, fields: Fields): Promise<Draft> {
    if (this.state.pending.some(p => p.kind === kind)) throw new Error('原提交结果待确认，请恢复或重试原请求');
    let draft: Draft;
    if (this.mode === 'offline') draft = new OfflineRepository(this.state, this.isCampus()).create(fields, kind);
    else {
      let body = ''; let path = '';
      if (kind === 'repair') { const request: RepairRequest = { requestId: makeId('request'), location: fields.location || '', description: fields.description || '', contactAlias: fields.contactAlias || '' }; body = JSON.stringify(request); path = '/api/v1/ticket-drafts'; }
      else if (kind === 'lost') { const request: LostRequest = { requestId: makeId('request'), kind: fields.kind || '', itemDescription: fields.itemDescription || '', location: fields.location || '', occurredOn: fields.occurredOn || '', contactAlias: fields.contactAlias || '' }; body = JSON.stringify(request); path = '/api/v1/lost-item-drafts'; }
      else { const request: ActivityRequest = { requestId: makeId('request'), activityId: fields.activityId || '', session: fields.session || '', contactAlias: fields.contactAlias || '' }; body = JSON.stringify(request); path = '/api/v1/activity-signup-drafts'; }
      draft = await this.api.request<Draft>(path, http.RequestMethod.POST, body); this.state.drafts.push({ draft, kind, used: false });
    }
    await this.save(); return draft;
  }
  async confirm(kind: string, draft: Draft): Promise<void> {
    let confirmation: Confirmation;
    if (this.mode === 'offline') confirmation = new OfflineRepository(this.state, this.isCampus()).confirm(draft, kind);
    else {
      const path = kind === 'repair' ? 'ticket-drafts' : kind === 'lost' ? 'lost-item-drafts' : 'activity-signup-drafts';
      const request: ConfirmRequest = { requestId: makeId('request'), revision: draft.revision };
      confirmation = await this.api.request<Confirmation>(`/api/v1/${path}/${draft.draftId}/confirm`, http.RequestMethod.POST, JSON.stringify(request));
      this.state.confirmations.push({ confirmation, snapshot: JSON.stringify(draft) });
    }
    await this.save();
  }
  private async accept(kind: string, receipt: Receipt): Promise<void> {
    if (kind === 'repair' && receipt.ticketId && this.mode === 'remote') receipt = await this.api.request<Receipt>(`/api/v1/tickets/${receipt.ticketId}`);
    if (kind === 'repair' && !receipt.ticketId) throw new Error('工单回执不可查询，结果待确认');
    if (kind === 'repair') { this.state.tickets = this.state.tickets.filter(i => i.ticketId !== receipt.ticketId); this.state.tickets.push(receipt); }
    if (kind === 'lost') { this.state.lost = this.state.lost.filter(i => i.lostItemId !== receipt.lostItemId); this.state.lost.push(receipt); }
    if (kind === 'activity') { this.state.signups = this.state.signups.filter(i => i.signupId !== receipt.signupId); this.state.signups.push(receipt); }
    const pending = this.state.pending.find(p => p.kind === kind);
    if (pending) { const record = this.state.drafts.find(r => r.draft.draftId === pending.draft.draftId); if (record) record.used = true; }
    this.state.pending = this.state.pending.filter(p => p.kind !== kind); this.state.recent.push(`${kind} · 合成 ${receipt.status}`); await this.save();
  }
  async submit(kind: string): Promise<void> {
    let pending = this.state.pending.find(p => p.kind === kind);
    if (!pending) { const draft = this.latest(kind); if (!draft) throw new Error('无待确认草稿'); const token = this.token(draft); if (!token) throw new Error('CONFIRMATION_REQUIRED'); pending = { kind, requestId: makeId('request'), key: makeId('idem'), draft, confirmation: token }; this.state.pending.push(pending); await this.save(); }
    try {
      let receipt: Receipt;
      if (this.mode === 'offline') receipt = new OfflineRepository(this.state, this.isCampus()).submit(kind, pending.requestId, pending.key, pending.draft, pending.confirmation);
      else { const path = kind === 'repair' ? '/api/v1/tickets' : kind === 'lost' ? '/api/v1/lost-items' : `/api/v1/activities/${pending.draft.displayFields.activityId}/signups`; const request: SubmitRequest = { requestId: pending.requestId, draftId: pending.draft.draftId, confirmationId: pending.confirmation.confirmationId }; receipt = await this.api.request<Receipt>(path, http.RequestMethod.POST, JSON.stringify(request), pending.key); }
      await this.accept(kind, receipt);
    } catch (e) {
      if (e instanceof ApiFailure && !e.uncertain) { this.state.pending = this.state.pending.filter(p => p.kind !== kind); this.state.confirmations = this.state.confirmations.filter(c => c.confirmation.draftId !== pending?.draft.draftId); await this.save(); }
      if (e instanceof Error) throw e;
      throw new Error(String(e));
    }
  }
  async recoverRepair(): Promise<string> {
    const p = this.state.pending.find(i => i.kind === 'repair'); if (!p) return '无待确认提交';
    if (this.mode === 'offline') { const entry = this.state.ledger.find(r => r.receipt.requestId === p.requestId); if (!entry) return 'NOT_FOUND：未确认提交，保留原请求'; await this.accept('repair', entry.receipt); return '已恢复合成回执'; }
    const result = await this.api.request<RequestResult>(`/api/v1/requests/${p.requestId}/result`);
    if (result.resultStatus !== 'COMMITTED' || !result.ticketId) return `${result.resultStatus}：仍未确认提交`;
    await this.accept('repair', await this.api.request<Receipt>(`/api/v1/tickets/${result.ticketId}`)); return '已恢复可查询合成工单';
  }
  cancel(): void { this.cancelled = true; this.api.cancel(); }
  async chat(text: string, onChange: () => void): Promise<void> {
    this.cancelled = false;
    const scope = this.scope(); const current = this.state;
    const user: Message = { role: 'user', text, incomplete: false, evidenceRefs: [], intent: '' };
    const intent = /报修|漏水|坏/.test(text) ? 'repair' : /课程|考试|课表/.test(text) ? 'schedule' : /失物|拾物/.test(text) ? 'lost' : /活动/.test(text) ? 'activity' : 'notice';
    const message: Message = { role: 'assistant', text: '', incomplete: true, evidenceRefs: [], intent };
    current.messages.push(user); current.messages.push(message); await this.save(); onChange();
    let meta = false; let done = false;
    const consume = (event: StreamEvent): void => {
      if (scope !== this.scope()) return;
      if (event.type === 'meta') { meta = true; message.evidenceRefs = event.data.evidenceRefs || []; message.intent = event.data.intent || message.intent; }
      if (event.type === 'delta') { if (!meta || done) throw new Error('流式顺序错误'); message.text += event.data.text || ''; }
      if (event.type === 'error' && !event.data.canFallback) throw new Error(event.data.message || '流式错误');
      if (event.type === 'done') { if (!meta || done || event.data.status !== 'COMPLETED') throw new Error('无效 done'); done = true; }
      onChange(); this.save().catch(() => console.error('partial answer persistence failed'));
    };
    try {
      if (this.mode === 'remote') { const request: ChatRequest = { requestId: makeId('request'), text, conversationId: current.conversationId }; await this.api.stream(JSON.stringify(request), consume); }
      else {
        const intent = /报修|漏水|坏/.test(text) ? 'repair' : /课程|考试|课表/.test(text) ? 'schedule' : /失物|拾物/.test(text) ? 'lost' : /活动/.test(text) ? 'activity' : 'notice';
        consume({ type: 'meta', data: { intent, evidenceRefs: [{ evidenceId: `${this.session}-${intent}-synthetic`, version: 'v1' }] } });
        const answer = '本地合成回答：请进入结构化服务核对参数，确认后才能提交演示记录。AI没有业务写权限；个人日程只保存在本机。';
        for (let i = 0; i < answer.length; i += 8) { await new Promise<void>(resolve => setTimeout(resolve, 90)); if (this.cancelled) throw new Error('已取消，回答未完成'); consume({ type: 'delta', data: { text: answer.slice(i, i + 8) } }); }
        consume({ type: 'done', data: { status: 'COMPLETED' } });
      }
      message.incomplete = !done; if (!done) throw new Error('缺少 done，回答未完成');
    } finally { if (scope === this.scope()) { await this.save(); onChange(); } }
  }
}
