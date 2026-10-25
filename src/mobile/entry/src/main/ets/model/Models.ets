export interface Evidence { evidenceId: string; version: string; }
export interface Fields {
  location?: string; description?: string; contactAlias?: string; kind?: string;
  itemDescription?: string; occurredOn?: string; activityId?: string; title?: string; session?: string;
}
export interface Draft {
  draftId: string; revision: number; status: string; displayFields: Fields;
  evidenceRefs: Evidence[]; expiresAt: string; synthetic: boolean; realBusinessWrite: boolean;
}
export interface Confirmation { confirmationId: string; draftId: string; revision: number; expiresAt: string; }
export interface Receipt {
  ticketId?: string; lostItemId?: string; signupId?: string; requestId?: string; activityId?: string;
  status: string; version?: number; displayFields?: Fields; evidenceRefs?: Evidence[]; session?: string; submittedAt?: string;
  kind?: string; itemDescription?: string; location?: string; occurredOn?: string; contactAlias?: string;
  synthetic: boolean; realBusinessWrite: boolean;
}
export interface Notice { noticeId: string; title: string; content: string; sourceId: string; evidenceId: string; version: string; effectiveFrom: string; effectiveTo: string | null; }
export interface Schedule { scheduleId: string; title: string; kind: string; location: string; startsAt: string; endsAt: string; personal: boolean; }
export interface Activity { activityId: string; title: string; location: string; startsAt: string; deadlineAt: string; remainingCapacity: number; status: string; session: string; }
export interface Message { role: string; text: string; incomplete: boolean; evidenceRefs: Evidence[]; intent: string; }
export interface Pending { kind: string; requestId: string; key: string; draft: Draft; confirmation: Confirmation; }
export interface DraftRecord { draft: Draft; kind: string; used: boolean; }
export interface ConfirmationRecord { confirmation: Confirmation; snapshot: string; }
export interface IdempotencyRecord { key: string; signature: string; receipt: Receipt; }
export interface ClientSnapshot {
  conversationId: string; messages: Message[]; compact: boolean; reminderPreference: boolean;
  personalSchedule: Schedule[]; todos: string[]; recent: string[]; drafts: DraftRecord[];
  confirmations: ConfirmationRecord[]; ledger: IdempotencyRecord[]; pending: Pending[];
  tickets: Receipt[]; lost: Receipt[]; signups: Receipt[]; activities: Activity[];
}
export interface Envelope<T> { code: string; message: string; data: T | null; traceId: string; }
export interface Items<T> { items: T[]; }
export interface RequestResult { resultStatus: string; ticketId?: string; }
export interface StreamEvent { type: string; data: StreamData; }
export interface StreamData { text?: string; status?: string; requestId?: string; traceId?: string; conversationId?: string; evidenceRefs?: Evidence[]; intent?: string; code?: string; message?: string; canFallback?: boolean; }
export function makeId(prefix: string): string { return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000000000)}`; }
export function freshSnapshot(): ClientSnapshot {
  const now = Date.now();
  return {
    conversationId: makeId('conversation'), messages: [], compact: false, reminderPreference: false,
    personalSchedule: [], todos: [], recent: [], drafts: [], confirmations: [], ledger: [], pending: [], tickets: [], lost: [], signups: [],
    activities: [
      { activityId: 'activity-local-open', title: '合成创新分享会', location: '报告厅', startsAt: new Date(now + 7 * 86400000).toISOString(), deadlineAt: new Date(now + 6 * 86400000).toISOString(), remainingCapacity: 18, status: 'OPEN', session: 'morning' },
      { activityId: 'activity-local-full', title: '合成满额活动', location: '活动室', startsAt: new Date(now + 7 * 86400000).toISOString(), deadlineAt: new Date(now + 6 * 86400000).toISOString(), remainingCapacity: 0, status: 'OPEN', session: 'morning' },
      { activityId: 'activity-local-closed', title: '合成截止活动', location: '操场', startsAt: new Date(now - 86400000).toISOString(), deadlineAt: new Date(now - 2 * 86400000).toISOString(), remainingCapacity: 8, status: 'CLOSED', session: 'morning' }
    ]
  };
}
