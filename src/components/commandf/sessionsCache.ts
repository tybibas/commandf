// Per-user local cache of the recent-conversations list, so the sidebar renders
// instantly on load (zero flash) before the network `GET /sessions` resolves —
// the stale-while-revalidate pattern ChatGPT/Claude use. Keyed by the user's
// JWT sub, so a different operator on the same browser never sees another's list.

import type { Briefing, Session } from './api';

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

// ── Per-user briefing / knowledge-base counts ────────────────────────────────
// Unlike sessions, the briefing had NO local cache, so the KB doc count was a
// live fetch on every tab open — a fresh browser profile during a slow backend
// window (Modal cold start, DB index build) rendered "0 documents indexed"
// while an older tab showed the truth from React state (2026-07-02 incident).
// Same stale-while-revalidate pattern: seed instantly, overwrite on live fetch.
const briefingKey = (uid: string) => `cf-kb-${uid}`;

export function readBriefingCache(uid: string | null): Briefing | null {
  if (!uid) return null;
  try {
    const raw = localStorage.getItem(briefingKey(uid));
    return raw ? (JSON.parse(raw) as Briefing) : null;
  } catch {
    return null;
  }
}

export function writeBriefingCache(uid: string | null, briefing: Briefing): void {
  if (!uid) return;
  try {
    localStorage.setItem(briefingKey(uid), JSON.stringify(briefing));
  } catch {
    /* quota / disabled storage — non-fatal */
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

// ── Per-session deck-job pointer (P0-1 belt-and-braces) ──────────────────────
// The durable link is the backend `commandf_jobs.session_id` column, looked up
// via `getDeckJobBySession`. This local pointer is purely an optimization: it
// lets the UI show a "Resume deck" affordance the instant a session opens,
// before that network round trip resolves — and degrades harmlessly (the
// by-session confirm call is still the source of truth) if it's stale, absent,
// or storage is disabled. Keyed by sessionId (not uid) per the fix direction in
// Actionist/COMMANDF_DEMO_RUN_PROBLEMS_2026-07-07.md — a session belongs to one
// signed-in operator already, so no extra uid scoping is needed here.
export type DeckPointer = { job_id: string; deck_rev: number };
const deckKey = (sessionId: string) => `cf-deck-${sessionId}`;

export function readDeckPointer(sessionId: string | null): DeckPointer | null {
  if (!sessionId) return null;
  try {
    const raw = localStorage.getItem(deckKey(sessionId));
    return raw ? (JSON.parse(raw) as DeckPointer) : null;
  } catch {
    return null;
  }
}

/** Overwrites any prior pointer for this session — a new build for the same
 *  session must replace the old job_id, never accumulate alongside it. */
export function writeDeckPointer(sessionId: string | null, pointer: DeckPointer): void {
  if (!sessionId) return;
  try {
    localStorage.setItem(deckKey(sessionId), JSON.stringify(pointer));
  } catch {
    /* quota / disabled storage — non-fatal, the DB by-session lookup still works */
  }
}

export function clearDeckPointer(sessionId: string | null): void {
  if (!sessionId) return;
  try {
    localStorage.removeItem(deckKey(sessionId));
  } catch {
    /* non-fatal */
  }
}
