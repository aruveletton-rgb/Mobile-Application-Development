import { ClientSnapshot, Confirmation, Draft, DraftRecord, Fields, Receipt, makeId } from '../model/Models';

export class OfflineRepository {
  state: ClientSnapshot;
  private campus: boolean;
  constructor(state: ClientSnapshot, campus: boolean) { this.state = state; this.campus = campus; }
  private requireCampus(kind: string): void { if (kind !== 'repair' && !this.campus) throw new Error('FORBIDDEN: 社区不能办理校园服务'); }
  private checkActivity(fields: Fields): void {
    const a = this.state.activities.find(i => i.activityId === fields.activityId);
    if (!a || a.session !== fields.session) throw new Error('VALIDATION_ERROR: 场次无效');
    if (this.state.signups.some(i => i.activityId === a.activityId)) throw new Error('ALREADY_SIGNED_UP: 已报名');
    if (a.status !== 'OPEN' || Date.parse(a.deadlineAt) <= Date.now()) throw new Error('ACTIVITY_CLOSED: 已截止');
    if (a.remainingCapacity <= 0) throw new Error('CAPACITY_EXCEEDED: 名额已满');
  }
  create(fields: Fields, kind: string): Draft {
    this.requireCampus(kind);
    if (!/^SYN-CONTACT-[A-Z0-9_-]+$/.test(fields.contactAlias || '')) throw new Error('VALIDATION_ERROR: 联系别名须为 SYN-CONTACT-*');
    if (kind === 'repair' && (!fields.location?.trim() || !fields.description?.trim())) throw new Error('VALIDATION_ERROR: 缺少位置或描述');
    if (kind === 'lost') {
      if (!fields.itemDescription?.trim() || !fields.location?.trim() || !fields.occurredOn || !['LOST', 'FOUND'].includes(fields.kind || '')) throw new Error('VALIDATION_ERROR: 失物字段不完整');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.occurredOn) || !Number.isFinite(Date.parse(fields.occurredOn)) || new Date(fields.occurredOn).toISOString().slice(0, 10) !== fields.occurredOn || Date.parse(fields.occurredOn) > Date.now()) throw new Error('VALIDATION_ERROR: 日期无效');
    }
    if (kind === 'activity') this.checkActivity(fields);
    const draft: Draft = { draftId: makeId('draft'), revision: 1, status: 'AWAITING_CONFIRMATION', displayFields: JSON.parse(JSON.stringify(fields)) as Fields, evidenceRefs: [{ evidenceId: `${this.campus ? 'campus' : 'community'}-${kind}-synthetic`, version: 'v1' }], expiresAt: new Date(Date.now() + 300000).toISOString(), synthetic: true, realBusinessWrite: false };
    const record: DraftRecord = { draft, kind, used: false }; this.state.drafts.push(record); return draft;
  }
  confirm(draft: Draft, kind: string): Confirmation {
    const record = this.state.drafts.find(r => r.draft.draftId === draft.draftId && r.kind === kind);
    if (!record) throw new Error('FORBIDDEN: 草稿不属于当前会话');
    if (record.used || JSON.stringify(record.draft) !== JSON.stringify(draft) || Date.parse(draft.expiresAt) <= Date.now()) throw new Error('RECONFIRM_REQUIRED: 草稿已失效');
    const confirmation: Confirmation = { confirmationId: makeId('confirm'), draftId: draft.draftId, revision: draft.revision, expiresAt: new Date(Math.min(Date.now() + 120000, Date.parse(draft.expiresAt))).toISOString() };
    this.state.confirmations.push({ confirmation, snapshot: JSON.stringify(draft) }); return confirmation;
  }
  submit(kind: string, requestId: string, key: string, draft: Draft, confirmation: Confirmation): Receipt {
    this.requireCampus(kind);
    const signature = `${kind}|${requestId}|${draft.draftId}|${confirmation.confirmationId}`;
    const previous = this.state.ledger.find(r => r.key === key);
    if (previous) { if (previous.signature !== signature) throw new Error('IDEMPOTENCY_CONFLICT: 同键不同请求'); return previous.receipt; }
    const record = this.state.drafts.find(r => r.draft.draftId === draft.draftId && r.kind === kind);
    const token = this.state.confirmations.find(c => c.confirmation.confirmationId === confirmation.confirmationId);
    if (!record) throw new Error('FORBIDDEN: 草稿不属于当前会话');
    if (!token || token.confirmation.draftId !== draft.draftId || token.confirmation.revision !== draft.revision) throw new Error('CONFIRMATION_REQUIRED');
    if (record.used || token.snapshot !== JSON.stringify(draft) || token.snapshot !== JSON.stringify(record.draft) || Date.parse(token.confirmation.expiresAt) <= Date.now() || Date.parse(draft.expiresAt) <= Date.now()) throw new Error('RECONFIRM_REQUIRED');
    if (this.state.ledger.some(r => r.receipt.requestId === requestId)) throw new Error('IDEMPOTENCY_CONFLICT: requestId 已使用');
    if (kind === 'activity') this.checkActivity(draft.displayFields);
    const receipt: Receipt = { requestId, status: kind === 'lost' ? 'PENDING_REVIEW' : 'SUBMITTED', synthetic: true, realBusinessWrite: false, displayFields: draft.displayFields, evidenceRefs: draft.evidenceRefs, version: 1 };
    if (kind === 'repair') { receipt.ticketId = makeId('ticket'); this.state.tickets.push(receipt); }
    if (kind === 'lost') { receipt.lostItemId = makeId('lost'); receipt.kind = draft.displayFields.kind; receipt.itemDescription = draft.displayFields.itemDescription; receipt.location = draft.displayFields.location; receipt.occurredOn = draft.displayFields.occurredOn; receipt.contactAlias = draft.displayFields.contactAlias; this.state.lost.push(receipt); }
    if (kind === 'activity') { receipt.signupId = makeId('signup'); receipt.activityId = draft.displayFields.activityId; this.state.signups.push(receipt); const a = this.state.activities.find(i => i.activityId === receipt.activityId); if (a) a.remainingCapacity--; }
    record.used = true; this.state.ledger.push({ key, signature, receipt }); return receipt;
  }
}
