// Command F — HTTP client.
//
// Thin wrapper over the Modal FastAPI service. Auth pattern (Supabase JWT as a
// Bearer token) is lifted verbatim from the original CommandFPage. Every shape
// here is documented in execution/commandf/UI_ENDPOINT_CONTRACTS.md. All
// endpoints (chat, deck, survey, upload) are live; the EndpointPendingError path
// is a graceful fallback for a 404/501 (backend unreachable), not a "coming soon".

import { supabase } from '../../lib/supabase';

export const COMMANDF_URL = import.meta.env.VITE_MODAL_COMMANDF_URL as string | undefined;

// ── Types ──────────────────────────────────────────────────────────────────

export type Source = {
  n?: number;
  file_name: string;
  file_id?: string;
  file_path?: string;
  chunk_index?: number;
  link?: string;
  // The backend sends the retrieved passage as `content`; older payloads used
  // `snippet`. Accept either — the UI reads `content ?? snippet`.
  content?: string;
  snippet?: string;
  similarity?: number;
};

export type Message = {
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  error?: boolean;
};

export type Session = { id: string; title: string; updated_at: string };
// `description` + `cost` come straight from the backend /models roster and let
// the picker explain what each model is scoped to (e.g. "Fast" / "Most capable").
export type ModelOption = { id: string; name: string; description?: string; cost?: string };

export type KnowledgeFile = { file_name: string; chunks: number; modified: string | null };

export type Briefing = {
  client_context: string | null;
  clients: { slug: string; name: string }[];
  signals: {
    pending: number; active: number; total: number;
    by_event: { key: string; label: string; count: number }[];
    by_client: { client: string; count: number }[];
  };
  outreach: { pipeline: number; sent: number };
  engine_recs: { pending: number };
  knowledge: {
    doc_count: number; chunk_count: number;
    // True when the counts are approximate/best-effort — the backend RPC fell
    // back to planner stats because the exact scan couldn't finish under DB load.
    // The UI labels the numbers "syncing…" instead of implying a genuine 0.
    counts_stale?: boolean;
    files: KnowledgeFile[];
    last_sync_at?: string | null;
    last_sync_status?: string | null;
    drive_connected: boolean;
  };
};

export type SourcesStatus = { google_drive: boolean; dropbox: boolean };

export type SyncStatus = {
  status: string;
  files_indexed?: number;
  files_added?: number;
  files_updated?: number;
  files_removed?: number;
  message?: string;
  last_sync_at?: string | null;
};

export type ChatResponse = {
  response: string;
  sources?: Source[];
  model_used?: string;
  session_id?: string;
};

// Job shapes for the generation endpoints. The backend emits `complete` on
// success (`done` also accepted for forward-compat) — both handled by useJob.
// `progress` is a human-readable status line ("planning storyline…").
export type JobStatus = {
  status: 'queued' | 'running' | 'complete' | 'done' | 'error';
  progress?: string;
  slide_count?: number;
  sheet_count?: number;
  title?: string;
  download_url?: string;
  preview_urls?: string[];
  placeholders?: string[];
  plan?: Record<string, unknown>;  // carried on a completed deck so slides can be edited
  // Chunked-build continuity markers (present on a section build). The UI offers
  // "build next N slides" against the SAME plan while built_through < plan_total_slides.
  deck_scope?: 'full' | 'section';
  section_start?: number;
  built_through?: number;       // next unbuilt slide index (0-based) of the full plan
  plan_total_slides?: number;   // total content slides in the approved full plan
  error?: string;
};

// Deck outline (Stage-1 plan) — returned SYNCHRONOUSLY by /generate-deck/outline.
// The consultant edits it (reorder/delete/retitle) and posts `plan` back verbatim
// as `approved_plan` to /generate-deck, which then skips the re-plan (no double spend).
export type OutlineSource = { n: number; file: string; link?: string; snippet?: string };
export type OutlineSlide = {
  slide_template: string;
  lede: string;
  must_show?: string;
  evidence_ns?: number[];
  sources?: OutlineSource[];
};
export type DeckOutline = {
  deliverable_type?: string;
  governing_thought: string;
  organizing_construct: string;
  lines_of_argument: string[];
  slides: OutlineSlide[];
  sources_pool: OutlineSource[];
  plan: Record<string, unknown>;
};

/** The three deliverable types the deck generator validates as a structured enum
 * — any other value returns HTTP 400. Every other UI chip is folded into the
 * request prose instead (the planner is LLM-driven and adapts). See DeckSurface. */
export const DECK_ENUM_TYPES = new Set(['proposal', 'engagement_recap', 'pov_memo']);

// ── Errors ─────────────────────────────────────────────────────────────────

export class NotConfiguredError extends Error {
  constructor() { super('Command F is not configured.'); this.name = 'NotConfiguredError'; }
}
export class NotSignedInError extends Error {
  constructor() { super('Not signed in — please re-authenticate.'); this.name = 'NotSignedInError'; }
}
/** Thrown when an endpoint returns 404/501 — i.e. the backend is unreachable,
 * not that the feature is unbuilt. Surfaces a graceful "try again" state. */
export class EndpointPendingError extends Error {
  constructor(endpoint: string) {
    super(`${endpoint} is currently unavailable.`);
    this.name = 'EndpointPendingError';
  }
}

// ── Resilience primitives ─────────────────────────────────────────────────────

/** Thrown when a fetch is aborted by our own timeout guard (distinct from a
 * server error). Callers treat this as "couldn't load — retry", NOT empty data. */
export class RequestTimeoutError extends Error {
  constructor(what: string) {
    super(`${what} timed out.`);
    this.name = 'RequestTimeoutError';
  }
}

// Default network budgets. These bound EVERY query so a slow/degraded backend
// (e.g. Postgres statement-timeout 57014 under bulk-ingest load) can never
// produce an infinite spinner. They degrade to a typed error, not empty data.
const T_FAST = 6000;    // lists / lightweight reads (sessions, models, status)
const T_HISTORY = 8000; // a single conversation's messages
const T_BRIEFING = 10000; // knowledge briefing (count RPC can be slow)

/** fetch() with an AbortController-backed timeout. Rejects with
 * RequestTimeoutError when the budget elapses so the caller can distinguish a
 * timeout from an HTTP/error response and from an empty-but-successful result. */
async function fetchWithTimeout(
  input: string, init: RequestInit, ms: number, label: string,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new RequestTimeoutError(label);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Discriminated result for the persistence-critical reads. `ok:true` carries
 * data (which may legitimately be an empty list — a real "no conversations yet");
 * `ok:false` carries the error so the UI shows "couldn't load — retry" and NEVER
 * mistakes a failure for an empty list. */
export type LoadResult<T> = { ok: true; data: T } | { ok: false; error: Error };

// ── Internals ────────────────────────────────────────────────────────────────

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new NotSignedInError();
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

async function bearer(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new NotSignedInError();
  return token;
}

/** Returns the current access token, or null if not signed in (never throws). */
export async function currentToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/** Stable per-user id (JWT sub) for keying the local sessions cache; null if
 * not signed in. Never throws. */
export async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

/** Token + stable uid in ONE getSession() read (local, no network). Avoids the
 * two back-to-back getSession() calls the sidecar loader used to make. Never
 * throws; both fields are null when not signed in. */
export async function currentAuth(): Promise<{ token: string | null; uid: string | null }> {
  const { data } = await supabase.auth.getSession();
  return {
    token: data.session?.access_token ?? null,
    uid: data.session?.user?.id ?? null,
  };
}

function requireUrl(): string {
  if (!COMMANDF_URL) throw new NotConfiguredError();
  return COMMANDF_URL;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    if (res.status === 401) throw new NotSignedInError();
    throw new Error(detail || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Live endpoints ───────────────────────────────────────────────────────────

export async function fetchModels(): Promise<ModelOption[]> {
  const url = requireUrl();
  try {
    const res = await fetchWithTimeout(`${url}/models`, {}, T_FAST, 'Loading models');
    const r = await res.json();
    return r.models || [];
  } catch {
    return []; // non-critical: the composer falls back to the default model
  }
}

/** Persistence-critical: the recent-conversations list. Returns a discriminated
 * result so the caller can distinguish a genuine empty history (ok:true, []) from
 * a load FAILURE (ok:false) — the failure must surface "couldn't load — retry",
 * never a silent empty that reads as "all chats gone". Bounded by a timeout. */
export async function fetchSessions(): Promise<LoadResult<Session[]>> {
  try {
    const url = requireUrl();
    const res = await fetchWithTimeout(
      `${url}/sessions`, { headers: await authHeaders() }, T_FAST, 'Loading conversations',
    );
    if (!res.ok) {
      if (res.status === 401) return { ok: false, error: new NotSignedInError() };
      return { ok: false, error: new Error(`HTTP ${res.status}`) };
    }
    const r = await res.json();
    return { ok: true, data: r.sessions || [] };
  } catch (e: any) {
    return { ok: false, error: e instanceof Error ? e : new Error(String(e)) };
  }
}

export async function fetchBriefing(clientContext: string): Promise<Briefing | null> {
  const url = requireUrl();
  const qs = clientContext ? `?client_context=${encodeURIComponent(clientContext)}` : '';
  try {
    const res = await fetchWithTimeout(
      `${url}/briefing${qs}`, { headers: await authHeaders() }, T_BRIEFING, 'Loading briefing',
    );
    return await res.json();
  } catch {
    return null; // non-fatal — the page works without the briefing
  }
}

/** A conversation's messages. Bounded by a timeout: a slow/degraded backend
 * rejects with RequestTimeoutError (not an infinite spinner). Callers surface
 * "couldn't load this conversation — retry" rather than silently blanking it. */
export async function fetchHistory(sessionId: string): Promise<Message[]> {
  const url = requireUrl();
  const res = await fetchWithTimeout(
    `${url}/history?session_id=${encodeURIComponent(sessionId)}`,
    { headers: await authHeaders() }, T_HISTORY, 'Loading conversation',
  );
  if (!res.ok) {
    if (res.status === 401) throw new NotSignedInError();
    throw new Error(`HTTP ${res.status}`);
  }
  const r = await res.json();
  return (r.history || []).map((h: any) => ({
    role: h.role, content: h.content, sources: h.sources || [],
  }));
}

/** Rewrite the user's raw/dictated notes into a well-structured prompt, in place,
 * before sending. Cheap single-shot call on the backend (no RAG, no side effects). */
export async function optimizePrompt(text: string): Promise<{ optimized: string }> {
  const url = requireUrl();
  const res = await fetch(`${url}/optimize-prompt`, {
    method: 'POST', headers: await authHeaders(), body: JSON.stringify({ text }),
  });
  return json<{ optimized: string }>(res);
}

export async function sendChat(
  message: string, model: string, sessionId: string | null,
): Promise<ChatResponse> {
  const url = requireUrl();
  const res = await fetch(`${url}/chat`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ message, model, session_id: sessionId }),
  });
  return json<ChatResponse>(res);
}

/** Streaming chat: invokes `onStep` per live progress event and resolves with the
 *  final answer. The backend runs to completion + persists regardless of the
 *  stream, so a closed tab never loses the answer (recovered via history on reopen). */
export async function sendChatStream(
  message: string, model: string | undefined, sessionId: string | null,
  onStep: (evt: { phase?: string; step?: number; label?: string; tool?: string; count?: number }) => void,
): Promise<ChatResponse> {
  const url = requireUrl();
  const res = await fetch(`${url}/chat/stream`, {
    method: 'POST',
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, model, session_id: sessionId }),
  });
  if (!res.ok || !res.body) throw new Error(`chat failed (${res.status})`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let final: ChatResponse | null = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split('\n\n');
    buf = parts.pop() ?? '';
    for (const p of parts) {
      const line = p.split('\n').find((l) => l.startsWith('data: '));
      if (!line) continue;
      const evt = JSON.parse(line.slice(6));
      if (evt.type === 'step') onStep(evt);
      else if (evt.type === 'done') final = evt as ChatResponse;
      else if (evt.type === 'error') throw new Error(evt.detail || 'chat failed');
    }
  }
  if (!final) throw new Error('stream ended without an answer');
  return final;
}

export async function deleteSession(sessionId: string): Promise<void> {
  const url = requireUrl();
  await fetch(`${url}/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE', headers: await authHeaders() });
}

export async function fetchSourcesStatus(): Promise<SourcesStatus | null> {
  const url = requireUrl();
  try {
    const res = await fetchWithTimeout(
      `${url}/sources/status`, { headers: await authHeaders() }, T_FAST, 'Loading sources',
    );
    return await res.json();
  } catch {
    return null;
  }
}

export async function startSync(): Promise<void> {
  const url = requireUrl();
  const res = await fetch(`${url}/sync`, { method: 'POST', headers: await authHeaders() });
  if (!res.ok) throw new Error(await res.text().catch(() => 'Re-index failed.'));
}

export async function fetchSyncStatus(): Promise<SyncStatus | null> {
  const url = requireUrl();
  return fetch(`${url}/sync/status`, { headers: await authHeaders() })
    .then((r) => r.json()).catch(() => null);
}

/** Drive OAuth is a full-page redirect (token passed as a query param). */
export async function connectDriveUrl(): Promise<string> {
  const url = requireUrl();
  const token = await bearer();
  return `${url}/connect/google?token=${encodeURIComponent(token)}`;
}

// ── Pending endpoints (UI_ENDPOINT_CONTRACTS.md §Needed) ─────────────────────
// Implemented optimistically: if the endpoint returns 404/501 we surface the
// preview state; once the backend ships the contract these light up unchanged.

async function postJob(path: string, body: BodyInit, isMultipart: boolean): Promise<{ job_id: string }> {
  const url = requireUrl();
  const token = await bearer();
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (!isMultipart) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${url}${path}`, { method: 'POST', headers, body });
  if (res.status === 404 || res.status === 501) throw new EndpointPendingError(path);
  return json<{ job_id: string }>(res);
}

/** Stage-1 outline — cheap (~5-8s), SYNCHRONOUS, no job. Throws EndpointPending
 * on 404/501; on 422 (`outline_failed` — no corpus evidence) json() throws with
 * the backend detail so the surface can show an honest error. */
export async function generateDeckOutline(input: {
  request: string; deliverable_type?: string; client_slug?: string; session_id?: string | null;
  file_ids?: string[];  // source-pinning: bias the evidence pool to these Drive docs
  // HARD length constraint: plan a deck of ~target_slides content slides. The
  // backend injects this into the emit_plan prompt so length is a REAL planner
  // constraint. Omit for Auto (planner sizes the deck to the evidence).
  target_slides?: number;
}): Promise<DeckOutline> {
  const url = requireUrl();
  const token = await bearer();
  const res = await fetch(`${url}/generate-deck/outline`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
  if (res.status === 404 || res.status === 501) throw new EndpointPendingError('/generate-deck/outline');
  return json<DeckOutline>(res);
}

export async function generateDeck(input: {
  request: string; deliverable_type?: string; session_id?: string | null; client_slug?: string;
  // When present, the backend SKIPS Stage-1 re-planning (no double spend). It is
  // the (edited) `plan` object from generateDeckOutline; the backend also unwraps
  // a full { plan: {...} } envelope.
  approved_plan?: Record<string, unknown>;
  file_ids?: string[];  // source-pinning: bias the evidence pool to these Drive docs
  // Length + chunked-build — all REAL server-side params (contract, not prose):
  //   target_slides  HARD planner length constraint (full-plan planning only;
  //                  ignored when approved_plan is supplied — the plan fixed it).
  //   deck_scope     'full' (whole plan) | 'section' (author only a slice).
  //   section_start  first slide index of the slice (0-based) when scope='section'.
  //   section_size   slides in the slice (<=0 / omit = to the end).
  // Continuity: "build next N slides" carries the SAME approved_plan +
  // deck_scope:'section' + the next section_start; the backend re-slices, no re-plan.
  target_slides?: number;
  deck_scope?: 'full' | 'section';
  section_start?: number;
  section_size?: number;
}): Promise<{ job_id: string }> {
  return postJob('/generate-deck', JSON.stringify(input), false);
}

/** Re-author ONE slide of a built deck from a natural-language edit and re-render
 *  in place. Synchronous: returns the fresh, fully re-rendered deck result. */
export async function editDeckSlide(input: {
  job_id: string; request: string; approved_plan: Record<string, unknown>;
  slide_index: number; edit_instruction: string;
  deliverable_type?: string; client_slug?: string; session_id?: string | null; file_ids?: string[];
}): Promise<JobStatus> {
  const url = requireUrl();
  const token = await bearer();
  const res = await fetch(`${url}/generate-deck/edit-slide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
  if (res.status === 404 || res.status === 501) throw new EndpointPendingError('/generate-deck/edit-slide');
  return json<JobStatus>(res);
}

export async function generateDeckStatus(jobId: string): Promise<JobStatus> {
  const url = requireUrl();
  const res = await fetch(`${url}/generate-deck/${encodeURIComponent(jobId)}/status`, { headers: await authHeaders() });
  if (res.status === 404 || res.status === 501) throw new EndpointPendingError('/generate-deck');
  return json<JobStatus>(res);
}

/** Builds a download href an `<a download>` can use: the download endpoints accept
 * the JWT as `?token=` because an anchor can't send an Authorization header. */
export async function authedDownloadUrl(downloadUrl: string): Promise<string> {
  const token = await currentToken();
  if (!token) return downloadUrl;
  const sep = downloadUrl.includes('?') ? '&' : '?';
  return `${downloadUrl}${sep}token=${encodeURIComponent(token)}`;
}

export async function generateSurveyCompendium(file: File, title?: string): Promise<{ job_id: string }> {
  const form = new FormData();
  form.append('file', file);
  if (title) form.append('title', title);
  return postJob('/survey-compendium', form, true);
}

export async function surveyCompendiumStatus(jobId: string): Promise<JobStatus> {
  const url = requireUrl();
  const res = await fetch(`${url}/survey-compendium/${encodeURIComponent(jobId)}/status`, { headers: await authHeaders() });
  if (res.status === 404 || res.status === 501) throw new EndpointPendingError('/survey-compendium');
  return json<JobStatus>(res);
}

/** Ingest a document → 202 { file_id, file_name, status:"indexing" }. Poll
 * uploadDocumentStatus(file_id) until `complete`; the doc is then searchable in /chat. */
export async function uploadDocument(file: File, metadata?: Record<string, unknown>): Promise<{ file_id: string; file_name: string; status: string }> {
  const url = requireUrl();
  const token = await bearer();
  const form = new FormData();
  form.append('file', file);
  if (metadata) form.append('metadata', JSON.stringify(metadata));
  const res = await fetch(`${url}/upload`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
  });
  if (res.status === 404 || res.status === 501) throw new EndpointPendingError('/upload');
  return json<{ file_id: string; file_name: string; status: string }>(res);
}

export async function uploadDocumentStatus(fileId: string): Promise<{ status: 'indexing' | 'complete' | 'error'; chunks_indexed?: number; error?: string }> {
  const url = requireUrl();
  const res = await fetch(`${url}/upload/${encodeURIComponent(fileId)}/status`, { headers: await authHeaders() });
  if (res.status === 404 || res.status === 501) throw new EndpointPendingError('/upload');
  return json<{ status: 'indexing' | 'complete' | 'error'; chunks_indexed?: number; error?: string }>(res);
}
