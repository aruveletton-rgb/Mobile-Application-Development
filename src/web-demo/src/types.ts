export type Mode = 'offline-synthetic' | 'remote-http';
export type Page = 'home' | 'chat' | 'services' | 'profile';
export type SessionKey = 'campus-user' | 'community-user';

export interface Session {
  key: SessionKey;
  userId: string;
  domainId: 'campus-demo' | 'community-demo';
  roles: string[];
}

export interface Envelope<T> {
  code: string;
  message: string;
  data: T | null;
  traceId: string;
}

export interface EvidenceRef { evidenceId: string; version: string; }
export interface ChatData {
  requestId: string; conversationId: string; answer: string; evidenceRefs: EvidenceRef[];
  intent: string; draftId?: string; fallbackReason?: string; synthetic: boolean; realBusinessWrite: boolean;
}
export interface Notice { noticeId: string; title: string; content: string; sourceId: string; evidenceId: string; version: string; effectiveFrom: string; effectiveTo: string | null; }
export interface ScheduleItem { scheduleId: string; kind: 'course' | 'exam'; title: string; location: string; startsAt: string; endsAt: string; synthetic: boolean; localPersonal?: boolean; }
export interface Draft { draftId: string; revision: number; status: 'AWAITING_CONFIRMATION'; displayFields: Record<string, string>; evidenceRefs: EvidenceRef[]; expiresAt: string; synthetic: true; realBusinessWrite: false; }
export interface Confirmation { confirmationId: string; draftId: string; revision: number; expiresAt: string; synthetic: true; realBusinessWrite: false; }
export interface Ticket { ticketId: string; requestId: string; status: 'SUBMITTED' | 'PROCESSING' | 'RESOLVED'; version: number; displayFields: Record<string, string>; evidenceRefs: EvidenceRef[]; synthetic: true; realBusinessWrite: false; }
export interface LostItem { lostItemId: string; kind: string; itemDescription: string; location: string; occurredOn: string; status: 'PENDING_REVIEW'; contactAlias: string; }
export interface Activity { activityId: string; title: string; location: string; startsAt: string; deadlineAt: string; remainingCapacity: number; status: 'OPEN' | 'CLOSED'; session?: string; }
export interface ActivityDraft extends Draft { displayFields: { activityId: string; title: string; session: string; contactAlias: string; }; }
export interface Signup { signupId: string; activityId: string; status: 'SUBMITTED'; session?: string; submittedAt?: string; synthetic: true; realBusinessWrite: false; }
export interface PendingSubmission { requestId: string; key: string; draft: Draft; confirmation: Confirmation; }

export interface PersistedState {
  page: Page; mode: Mode; apiBaseUrl: string; sessionKey: SessionKey; conversationId: string;
  messages: { role: 'user' | 'assistant' | 'system'; text: string; evidenceRefs?: EvidenceRef[]; incomplete?: boolean; intent?: string }[];
  preferences: { compact: boolean; notifications: boolean };
  localSchedule: ScheduleItem[]; todos: string[]; recentServices: string[];
  drafts: Draft[]; tickets: Ticket[]; lostDrafts: Draft[]; lostItems: LostItem[]; activities: Activity[]; signups: Signup[];
  signupsStatus?: 'unknown' | 'loaded' | 'error'; signupsError?: string;
  notices: Notice[]; serverSchedule: ScheduleItem[]; pending?: PendingSubmission;
  pendingLost?: PendingSubmission; pendingActivity?: PendingSubmission;
}
