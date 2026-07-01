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
