import type { Activity, Confirmation, Draft, LostItem, Session, Signup, Ticket } from './types';

type Kind = 'repair' | 'lost' | 'activity';
type Receipt = Ticket | LostItem | Signup;
interface StoredDraft { draft: Draft; kind: Kind; used: boolean; }
interface Ledger {
  drafts: Record<string, StoredDraft>; confirmations: Record<string, { value: Confirmation; snapshot: string }>;
  receipts: Record<string, { signature: string; value: Receipt }>; requests: Record<string, Receipt>;
  tickets: Ticket[]; lost: LostItem[]; signups: Signup[]; activities: Activity[];
}
export interface StoragePort { getItem(key: string): string | null; setItem(key: string, value: string): void; }
export const newId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
function fail(code: string, message: string): never { throw new Error(`${code}: ${message}`); }
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

// One persisted ledger is the atomic boundary for the local synthetic adapter.
export class OfflineStore {
  private readonly key: string;
  constructor(private session: Session, private seed: Activity[], private storage: StoragePort = localStorage, private now = () => Date.now()) {
    const campus = session.key === 'campus-user';
    if (!['campus-user', 'community-user'].includes(session.key) || session.domainId !== (campus ? 'campus-demo' : 'community-demo') || session.userId !== (campus ? 'user-syn-campus-001' : 'user-syn-community-001') || JSON.stringify(session.roles) !== JSON.stringify([campus ? 'student' : 'resident'])) fail('FORBIDDEN', '演示身份与可信会话不一致');
    this.key = `campus-offline:v2:${session.domainId}:${session.userId}`;
  }
  private load(): Ledger {
    const saved = this.storage.getItem(this.key);
    if (saved) return JSON.parse(saved);
    return { drafts: {}, confirmations: {}, receipts: {}, requests: {}, tickets: [], lost: [], signups: [], activities: clone(this.seed) };
  }
  private save(value: Ledger) { this.storage.setItem(this.key, JSON.stringify(value)); }
  campus() { if (this.session.domainId !== 'campus-demo') fail('FORBIDDEN', '社区会话不能访问校园服务'); }
  items() { return clone(this.load()); }
  draft(fields: Record<string, string>, kind: Kind): Draft {
    if (kind !== 'repair') this.campus();
    if ((fields.domainId && fields.domainId !== this.session.domainId) || (fields.userId && fields.userId !== this.session.userId) || fields.roles || fields.authContext) fail('FORBIDDEN', '不能覆盖演示身份');
    if (!/^SYN-CONTACT-[A-Z0-9_-]+$/.test(fields.contactAlias ?? '')) fail('VALIDATION_ERROR', '联系别名须为 SYN-CONTACT-*');
    const required = kind === 'repair' ? ['location', 'description', 'contactAlias'] : kind === 'lost' ? ['kind', 'itemDescription', 'location', 'occurredOn', 'contactAlias'] : ['activityId', 'session', 'contactAlias'];
    if (required.some(key => !fields[key]?.trim() || fields[key].length > 500)) fail('VALIDATION_ERROR', '请补齐字段（最多 500 字符）');
    if (kind === 'lost') {
      if (!['lost', 'found'].includes(fields.kind.toLowerCase())) fail('VALIDATION_ERROR', '类型须为 LOST / FOUND');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.occurredOn) || !Number.isFinite(Date.parse(fields.occurredOn)) || new Date(fields.occurredOn).toISOString().slice(0, 10) !== fields.occurredOn || Date.parse(fields.occurredOn) > this.now()) fail('VALIDATION_ERROR', '日期无效或在未来');
    }
    const ledger = this.load();
    if (kind === 'activity') this.checkActivity(ledger, fields.activityId, fields.session);
    const draft: Draft = { draftId: newId('draft'), revision: 1, status: 'AWAITING_CONFIRMATION', displayFields: clone(fields), evidenceRefs: [{ evidenceId: `${this.session.domainId}-${kind}-synthetic`, version: 'v1' }], expiresAt: new Date(this.now() + 300_000).toISOString(), synthetic: true, realBusinessWrite: false };
    ledger.drafts[draft.draftId] = { draft, kind, used: false }; this.save(ledger); return clone(draft);
  }
  confirm(draft: Draft, kind: Kind): Confirmation {
    const ledger = this.load(), stored = ledger.drafts[draft.draftId];
    if (!stored || stored.kind !== kind) fail('FORBIDDEN', '草稿不属于当前会话');
    if (stored.used || Date.parse(stored.draft.expiresAt) <= this.now() || JSON.stringify(stored.draft) !== JSON.stringify(draft)) fail('RECONFIRM_REQUIRED', '草稿已变化、消耗或过期');
    const confirmation: Confirmation = { confirmationId: newId('confirm'), draftId: draft.draftId, revision: draft.revision, expiresAt: new Date(Math.min(this.now() + 120_000, Date.parse(draft.expiresAt))).toISOString(), synthetic: true, realBusinessWrite: false };
    ledger.confirmations[confirmation.confirmationId] = { value: confirmation, snapshot: JSON.stringify(draft) }; this.save(ledger); return clone(confirmation);
  }
  private checkActivity(ledger: Ledger, activityId: string, session: string) {
    const activity = ledger.activities.find(item => item.activityId === activityId);
    if (!activity || activity.session !== session) fail('VALIDATION_ERROR', '活动或场次无效');
    if (ledger.signups.some(item => item.activityId === activityId)) fail('ALREADY_SIGNED_UP', '已报名该活动');
    if (activity.status !== 'OPEN' || Date.parse(activity.deadlineAt) <= this.now()) fail('ACTIVITY_CLOSED', '活动已截止');
    if (activity.remainingCapacity < 1) fail('CAPACITY_EXCEEDED', '活动名额已满');
    return activity;
  }
  submit(requestId: string, draft: Draft, confirmation: Confirmation, key: string, kind: Kind): Receipt {
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(requestId) || !/^[A-Za-z0-9_-]{1,100}$/.test(key)) fail('VALIDATION_ERROR', '请求标识无效');
    if (kind !== 'repair') this.campus();
    const ledger = this.load(), signature = JSON.stringify({ requestId, draftId: draft.draftId, confirmationId: confirmation?.confirmationId, kind });
    const previous = ledger.receipts[key];
    if (previous) {
      if (previous.signature !== signature) fail('IDEMPOTENCY_CONFLICT', '同键请求内容不同');
      return clone(previous.value);
    }
    const stored = ledger.drafts[draft.draftId], token = ledger.confirmations[confirmation?.confirmationId];
    if (!stored || stored.kind !== kind) fail('FORBIDDEN', '草稿不属于当前会话');
    if (!token || token.value.draftId !== draft.draftId || token.value.revision !== draft.revision) fail('CONFIRMATION_REQUIRED', '需要有效确认');
    if (stored.used || token.snapshot !== JSON.stringify(stored.draft) || JSON.stringify(draft) !== token.snapshot || Date.parse(token.value.expiresAt) <= this.now() || Date.parse(draft.expiresAt) <= this.now()) fail('RECONFIRM_REQUIRED', '草稿或确认已失效');
    if (ledger.requests[requestId]) fail('IDEMPOTENCY_CONFLICT', 'requestId 已用于另一提交');
    let receipt: Receipt;
    if (kind === 'repair') {
      receipt = { ticketId: newId('ticket'), requestId, status: 'SUBMITTED', version: 1, displayFields: clone(draft.displayFields), evidenceRefs: clone(draft.evidenceRefs), synthetic: true, realBusinessWrite: false };
      ledger.tickets.push(receipt);
    } else if (kind === 'lost') {
      receipt = { lostItemId: newId('lost'), kind: draft.displayFields.kind, itemDescription: draft.displayFields.itemDescription, location: draft.displayFields.location, occurredOn: draft.displayFields.occurredOn, contactAlias: draft.displayFields.contactAlias, status: 'PENDING_REVIEW', synthetic: true, realBusinessWrite: false } as LostItem;
      ledger.lost.push(receipt);
    } else {
      const activity = this.checkActivity(ledger, draft.displayFields.activityId, draft.displayFields.session);
      receipt = { signupId: newId('signup'), activityId: activity.activityId, status: 'SUBMITTED', synthetic: true, realBusinessWrite: false };
      activity.remainingCapacity -= 1; ledger.signups.push(receipt);
    }
    stored.used = true; ledger.receipts[key] = { signature, value: receipt }; ledger.requests[requestId] = receipt; this.save(ledger); return clone(receipt);
  }
  request(requestId: string) {
    const receipt = this.load().requests[requestId];
    return { requestId, resultStatus: receipt ? 'COMMITTED' : 'NOT_FOUND', ticketId: receipt && 'ticketId' in receipt ? receipt.ticketId : undefined, receipt, synthetic: true, realBusinessWrite: false };
  }
}
