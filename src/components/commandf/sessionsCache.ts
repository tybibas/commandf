// Per-user local cache of the recent-conversations list, so the sidebar renders
// instantly on load (zero flash) before the network `GET /sessions` resolves —
// the stale-while-revalidate pattern ChatGPT/Claude use. Keyed by the user's
// JWT sub, so a different operator on the same browser never sees another's list.

import type { Session } from './api';

const key = (uid: string) => `cf-sessions-${uid}`;
const MAX = 50; // bound the cache the same way the server bounds the list

export function readSessionsCache(uid: string | null): Session[] {
  if (!uid) return [];
  try {
    const raw = localStorage.getItem(key(uid));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeSessionsCache(uid: string | null, sessions: Session[]): void {
  if (!uid) return;
  try {
    localStorage.setItem(key(uid), JSON.stringify(sessions.slice(0, MAX)));
  } catch {
    /* quota / disabled storage — non-fatal, the network list still loads */
  }
}

// ── Per-user composer draft ──────────────────────────────────────────────────
// Persist the unsent input so closing/minimizing the tab (or an accidental
// reload) never loses what the user was typing. Keyed by JWT sub so a shared
// browser never leaks one operator's draft to another. Cleared on send.
const draftKey = (uid: string) => `cf-draft-${uid}`;

export function readDraft(uid: string | null): string {
  if (!uid) return '';
  try {
    return localStorage.getItem(draftKey(uid)) || '';
  } catch {
    return '';
  }
}

export function writeDraft(uid: string | null, text: string): void {
  if (!uid) return;
  try {
    if (text) localStorage.setItem(draftKey(uid), text);
    else localStorage.removeItem(draftKey(uid));
  } catch {
    /* non-fatal */
  }
}

// ── Per-user active thread ───────────────────────────────────────────────────
// Remember which conversation was open so reopening the app restores it (like
// ChatGPT/Claude) instead of dropping the user on a blank home surface.
const activeKey = (uid: string) => `cf-active-${uid}`;

export function readActiveSession(uid: string | null): string | null {
  if (!uid) return null;
  try {
    return localStorage.getItem(activeKey(uid)) || null;
  } catch {
    return null;
  }
}

export function writeActiveSession(uid: string | null, sid: string | null): void {
  if (!uid) return;
  try {
    if (sid) localStorage.setItem(activeKey(uid), sid);
    else localStorage.removeItem(activeKey(uid));
  } catch {
    /* non-fatal */
  }
}
