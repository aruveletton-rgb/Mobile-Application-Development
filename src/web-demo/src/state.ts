import type { Mode, PersistedState, SessionKey } from './types';

const settingsKey = 'campus-client:v2:settings';
export const storageKey = (mode: Mode, session: SessionKey, base: string) => `campus-client:v2:${mode}:${session}:${mode === 'remote-http' ? base : 'local'}`;
export function freshState(mode: Mode = 'offline-synthetic', sessionKey: SessionKey = 'campus-user', apiBaseUrl = '/backend'): PersistedState {
  return { page: 'home', mode, sessionKey, apiBaseUrl, conversationId: `conversation-${crypto.randomUUID()}`, messages: [], preferences: { compact: false, notifications: false }, localSchedule: [], todos: [], recentServices: [], drafts: [], tickets: [], lostDrafts: [], lostItems: [], activities: [], signups: [], signupsStatus: 'unknown', notices: [], serverSchedule: [] };
}
export function loadState(mode?: Mode, session?: SessionKey, base?: string): PersistedState {
  try {
    const settings = JSON.parse(localStorage.getItem(settingsKey) ?? '{}');
    const defaults = freshState(mode ?? settings.mode, session ?? settings.sessionKey, base ?? settings.apiBaseUrl);
    const stored = JSON.parse(localStorage.getItem(storageKey(defaults.mode, defaults.sessionKey, defaults.apiBaseUrl)) ?? '{}');
    return { ...defaults, ...stored, mode: defaults.mode, sessionKey: defaults.sessionKey, apiBaseUrl: defaults.apiBaseUrl };
  } catch { return freshState(mode, session, base); }
}
export function saveState(state: PersistedState) {
  localStorage.setItem(storageKey(state.mode, state.sessionKey, state.apiBaseUrl), JSON.stringify(state));
  localStorage.setItem(settingsKey, JSON.stringify({ mode: state.mode, sessionKey: state.sessionKey, apiBaseUrl: state.apiBaseUrl }));
}
export function sessionFor(key: SessionKey) { return key === 'campus-user' ? { key, userId: 'user-syn-campus-001', domainId: 'campus-demo' as const, roles: ['student'] } : { key, userId: 'user-syn-community-001', domainId: 'community-demo' as const, roles: ['resident'] }; }
