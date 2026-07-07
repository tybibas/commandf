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
  /** Stable React key assigned by the UI at insertion time. Never from the backend. */
  _key?: string;
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
  // Deck Studio (C-2): monotonic revision of the built deck; seeds the studio
  // session and the `?v=` preview cache-bust. Absent on pre-studio builds.
  deck_rev?: number;
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

// ── Deck Studio (C-2) — edit-op protocol & reflection payloads ───────────────
// Contract: .agents/C2_DECKSTUDIO_CONTRACT.md (backend lane, feat/commandf-brain-v2).
// Transport is SSE (`data: {json}\n\n`) — same framing as sendChatStream — with the
// event types in §3.1. The op envelope (§2.1) is opaque to the UI except for the
// display fields (summary/target/affects_slides); `before`/`after` are the backend's
// restorable state and the UI never interprets them (undo is server-authoritative, R1).

/** Which part of a slide an op targets. `element_id` omitted = slide-level op.
 *  Reserved element ids: title, lede, body, chart, score_device, source, legend,
 *  company; collection members carry their own id (Bullet/Row/Column/…). */
export type DeckOpTarget = { slide_id: string; element_id?: string };

/** One reversible edit op (§2.1). The UI shows `summary` + `target`; it does not
 *  read `before`/`after` (kept opaque so the contract can evolve them freely). */
export type DeckOp = {
  op_id: string;
  batch_id: string;
  type: string;                 // e.g. rewrite_body, edit_bullet, change_chart_type, rewrite_slide
  target: DeckOpTarget;
  summary: string;              // human, one line, past-tense
  reversible: boolean;
  affects_slides: string[];     // slide_ids to re-raster
  before?: unknown;
  after?: unknown;
};

/** Stream event lines (§3.1). Discriminated on `event`. NOTE `slide_indices` are
 *  1-BASED (they match pdftoppm page numbering and the /preview/{slide_index}
 *  path); the UI converts to 0-based array positions at the boundary. A failed op
 *  carries an extra `error` string. `batch_done` carries the fresh `slide_order`
 *  (authoritative after add/remove/reorder — use it to map ids→positions). */
export type DeckStreamEvent =
  | { event: 'batch_start'; batch_id: string; planned: number; summary: string }
  | { event: 'assistant_delta'; text: string }
  | { event: 'op'; op: DeckOp; index: number; status: 'applied' | 'failed'; error?: string }
  | { event: 'slide_dirty'; slide_ids: string[]; slide_indices: number[] }
  | { event: 'phase'; label: string; state: 'active' | 'done' }
  | { event: 'batch_done'; batch_id: string; deck_rev: number; applied: number; failed: number; slide_order?: string[] }
  | { event: 'error'; recoverable: boolean; message: string };

export type DeckBatchDone = { batch_id: string; deck_rev: number; applied: number; failed: number; slide_order?: string[] };

// B-reflection (§4) — category grounding, delivered as STRUCTURED JSON on session
// open (the backend does the extraction; the UI never parses a style string).
export type BuildFormatOption = { format: string; target_category: string; label: string };
export type StyleExemplar = {
  deck_name: string;
  deliverable_type: string;
  service_line: string;
  density: string;
  uses_harvey_balls: boolean;
  chart_types: string[];
  frameworks: string[];
  archetype_sequence: string[];
  png_prefix: string;
  n_slides: number;
};
export type DeckGrounding = {
  target_category: string;
  // `content_pool` is NULL on session-open by design ("grounding pending" — real
  // retrieval provenance needs a live embed+RPC the free-testing policy skips). A
  // real authoring turn may populate it. The UI must treat null as "pending", not 0.
  content_pool: {
    n_chunks: number; n_files: number; category_matched_files: number;
    top_similarity: number; similarity_floor: number;
  } | null;
  style_exemplars: {
    filter_deliverable_type: string;
    // null = pending (see content_pool); a number once retrieval has run.
    n_matched: number | null;
    /** TRUE => B3 loud fail-open fired (no category-matched style exemplars) — the
     *  trust footer MUST surface this as a soft warning. null = pending. */
    fell_back_unfiltered: boolean | null;
    exemplars: StyleExemplar[];
  };
};
/** Returned by GET /generate-deck/{job_id}/studio (§4). `slide_order` is the
 *  authoritative id→position map (id at 0-based index i is slide i+1 in the deck). */
export type StudioSession = {
  deck_rev: number;
  slide_order: string[];
  build_format_options: BuildFormatOption[];
  active_format: string;
  active_target_category: string;
  grounding: DeckGrounding;
};

// ── Spend ledger (commandf_query_costs) ─────────────────────────────────────
// Read-only aggregate for the Spend tab. Sourced from the cost ledger the backend
// writes per LLM/embedding call. `model: null` rows are embeddings (no chat model).
export type CostByModel = {
  model: string | null;
  label: string;
  rows: number;
  usd: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
};
export type CostDaily = { date: string; usd: number; anthropic_usd: number };
export type CostSummary = {
  currency: string;              // "usd"
  since: string;                 // ISO — first ledger row
  updated_at: string;            // ISO — latest ledger row
  row_count: number;
  totals: { all_time: number; anthropic: number; embedding: number; last_24h: number; last_7d: number };
  by_model: CostByModel[];
  daily: CostDaily[];            // ascending by date
};

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
// Budgets must survive the WORST cold path, not just a warm backend: a sleeping
// Modal container adds up to ~30s to the first request, and /sessions makes two
// sequential DB round-trips. At 6s, every fresh-profile sign-in during DB load
// (e.g. an index build) looked like "all my chats/docs are gone" (2026-07-02
// cross-profile incident).
const T_FAST = 15000;    // lists / lightweight reads (sessions, models, status)
const T_HISTORY = 15000; // a single conversation's messages
const T_BRIEFING = 12000; // knowledge briefing (count RPC can be slow)
const T_MUTATE = 20000;  // write operations: sync, delete, upload, optimize-prompt
const T_GEN = 30000;     // generation submits and status polls (deck, survey, upload)

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
      `${url}/sessions`, { headers: await authHeaders(), cache: 'no-store' }, T_FAST, 'Loading conversations',
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
  const res = await fetchWithTimeout(
    `${url}/optimize-prompt`,
    { method: 'POST', headers: await authHeaders(), body: JSON.stringify({ text }) },
    T_MUTATE, 'Optimizing prompt',
  );
  return json<{ optimized: string }>(res);
}

export async function sendChat(
  message: string, model: string, sessionId: string | null,
): Promise<ChatResponse> {
  const url = requireUrl();
  const res = await fetchWithTimeout(
    `${url}/chat`,
    { method: 'POST', headers: await authHeaders(), body: JSON.stringify({ message, model, session_id: sessionId }) },
    T_MUTATE, 'Sending message',
  );
  return json<ChatResponse>(res);
}

/** Thrown when the caller aborts the stream via the returned controller. */
export class StreamAbortedError extends Error {
  constructor() { super('Stream cancelled.'); this.name = 'StreamAbortedError'; }
}

/** Streaming chat: invokes `onStep` per live progress event, `onDelta` per
 *  streamed text chunk, and resolves with the final answer.
 *
 *  Delta events carry raw (marker-stripped) text as the model generates the
 *  synthesis turn. The caller should display these in a draft bubble, then
 *  replace the bubble content with the final `response` from the resolved
 *  ChatResponse (which is the post-processed, citation-normalized version).
 *
 *  The backend runs to completion + persists regardless of the stream, so a
 *  closed tab never loses the answer (recovered via history on reopen).
 *
 *  Pass an optional `signal` from the caller's AbortController; the function
 *  also enforces a 90s idle timeout (reset on every incoming SSE event). */
export async function sendChatStream(
  message: string, model: string | undefined, sessionId: string | null,
  onStep: (evt: { phase?: string; step?: number; label?: string; tool?: string; count?: number }) => void,
  signal?: AbortSignal,
  onDelta?: (text: string) => void,
): Promise<ChatResponse> {
  const IDLE_MS = 90_000;
  const url = requireUrl();

  // Internal controller handles the idle-timeout abort path.
  const internalCtrl = new AbortController();
  const combined = signal
    ? (AbortSignal as any).any?.([signal, internalCtrl.signal]) ?? internalCtrl.signal
    : internalCtrl.signal;

  // Forward external cancellation into the internal controller so we can
  // always cancel via internalCtrl.abort() regardless of which signal fired.
  let externalAborted = false;
  signal?.addEventListener('abort', () => { externalAborted = true; internalCtrl.abort(); });

  let idleTimer = setTimeout(() => internalCtrl.abort(), IDLE_MS);
  const resetIdle = () => { clearTimeout(idleTimer); idleTimer = setTimeout(() => internalCtrl.abort(), IDLE_MS); };

  try {
    const res = await fetch(`${url}/chat/stream`, {
      method: 'POST',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, model, session_id: sessionId }),
      signal: combined,
    });
    if (!res.ok || !res.body) throw new Error(`chat failed (${res.status})`);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let final: ChatResponse | null = null;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      resetIdle();
      buf += dec.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop() ?? '';
      for (const p of parts) {
        const line = p.split('\n').find((l) => l.startsWith('data: '));
        if (!line) continue;
        const evt = JSON.parse(line.slice(6));
        if (evt.type === 'step') onStep(evt);
        else if (evt.type === 'delta') { resetIdle(); onDelta?.(evt.text ?? ''); }
        else if (evt.type === 'done') final = evt as ChatResponse;
        else if (evt.type === 'error') throw new Error(evt.detail || 'chat failed');
      }
    }
    if (!final) throw new Error('stream ended without an answer');
    return final;
  } catch (e: any) {
    if (e?.name === 'AbortError' || internalCtrl.signal.aborted || externalAborted) {
      throw new StreamAbortedError();
    }
    throw e;
  } finally {
    clearTimeout(idleTimer);
  }
}

export async function deleteSession(sessionId: string): Promise<void> {
  const url = requireUrl();
  await fetchWithTimeout(
    `${url}/sessions/${encodeURIComponent(sessionId)}`,
    { method: 'DELETE', headers: await authHeaders() },
    T_MUTATE, 'Deleting session',
  );
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
  const res = await fetchWithTimeout(
    `${url}/sync`,
    { method: 'POST', headers: await authHeaders() },
    T_MUTATE, 'Starting sync',
  );
  if (!res.ok) throw new Error(await res.text().catch(() => 'Re-index failed.'));
}

export async function fetchSyncStatus(): Promise<SyncStatus | null> {
  const url = requireUrl();
  try {
    const res = await fetchWithTimeout(
      `${url}/sync/status`, { headers: await authHeaders() }, T_FAST, 'Loading sync status',
    );
    return await res.json();
  } catch {
    return null;
  }
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
  const res = await fetchWithTimeout(`${url}${path}`, { method: 'POST', headers, body }, T_GEN, path);
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
  const res = await fetchWithTimeout(
    `${url}/generate-deck/outline`,
    { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(input) },
    T_GEN, 'Generating outline',
  );
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
  const res = await fetchWithTimeout(
    `${url}/generate-deck/edit-slide`,
    { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(input) },
    T_GEN, 'Editing slide',
  );
  if (res.status === 404 || res.status === 501) throw new EndpointPendingError('/generate-deck/edit-slide');
  return json<JobStatus>(res);
}

export async function generateDeckStatus(jobId: string): Promise<JobStatus> {
  const url = requireUrl();
  const res = await fetchWithTimeout(
    `${url}/generate-deck/${encodeURIComponent(jobId)}/status`,
    { headers: await authHeaders() },
    T_GEN, 'Checking deck status',
  );
  if (res.status === 404 || res.status === 501) throw new EndpointPendingError('/generate-deck');
  return json<JobStatus>(res);
}

/** Studio session payload (§4) for a built deck: build-format options + the
 *  category-grounding provenance. Throws EndpointPending on 404/501 so the surface
 *  can degrade gracefully while the backend endpoint is still landing. */
export async function fetchStudioSession(jobId: string, format?: string): Promise<StudioSession> {
  const url = requireUrl();
  // `?format=` re-issues grounding retrieval for a different build format (§4). NOTE
  // (contract flag): whether the backend honors this query param is unconfirmed — if
  // not, it returns the same session and the selector just reflects locally.
  const qs = format ? `?format=${encodeURIComponent(format)}` : '';
  const res = await fetchWithTimeout(
    `${url}/generate-deck/${encodeURIComponent(jobId)}/studio${qs}`,
    { headers: await authHeaders() },
    T_GEN, 'Opening studio session',
  );
  if (res.status === 404 || res.status === 501) throw new EndpointPendingError('/generate-deck/studio');
  return json<StudioSession>(res);
}

/** Read-only spend summary from the cost ledger for the Spend tab. Operator-gated.
 *  NOTE (contract flag): `GET /costs` is a PROPOSED endpoint — the backend writes
 *  `commandf_query_costs` (cost_ledger.py) but exposes no read/aggregate route yet.
 *  Built + mocked against this shape; confirm/adjust with the backend lane. */
export async function fetchCostSummary(): Promise<CostSummary> {
  const url = requireUrl();
  const res = await fetchWithTimeout(`${url}/costs`, { headers: await authHeaders() }, T_FAST, 'Loading spend');
  if (res.status === 404 || res.status === 501) throw new EndpointPendingError('/costs');
  return json<CostSummary>(res);
}

/** The `<img src>` URL for a single rendered slide (§3.4). The `?v={deckRev}`
 *  cache-bust (NOT Date.now) keeps re-renders idempotent + CDN-cacheable; untouched
 *  slides keep their cached PNG. Token rides as a query param because an `<img>`
 *  can't send an Authorization header (same pattern as authedDownloadUrl).
 *
 *  Dev-only: the mock harness sets `window.__commandfMockPreview` to serve data-URI
 *  slide placeholders, since `<img>` loads bypass the stubbed window.fetch. */
export async function deckSlidePreviewUrl(
  jobId: string, slideIndex: number, deckRev: number,
): Promise<string> {
  // `slideIndex` is a 0-based array position; the /preview endpoint is 1-BASED
  // (matches pdftoppm paging + slide_dirty.slide_indices), so send slideIndex+1.
  const mock = (window as unknown as { __commandfMockPreview?: (i: number, rev: number) => string })
    .__commandfMockPreview;
  if (mock) return mock(slideIndex, deckRev);
  const url = requireUrl();
  const base = `${url}/generate-deck/${encodeURIComponent(jobId)}/preview/${slideIndex + 1}?v=${deckRev}`;
  const token = await currentToken();
  return token ? `${base}&token=${encodeURIComponent(token)}` : base;
}

/** Handlers for the deck edit-op stream. Each fires as its event line arrives;
 *  all optional so a caller can subscribe to only what it renders. */
export type DeckChatHandlers = {
  onBatchStart?: (e: { batch_id: string; planned: number; summary: string }) => void;
  onAssistantDelta?: (text: string) => void;
  onOp?: (op: DeckOp, index: number, status: 'applied' | 'failed', error?: string) => void;
  // `slideIndices` are 1-based as sent on the wire (the caller converts to 0-based).
  onSlideDirty?: (slideIds: string[], slideIndices: number[]) => void;
  onPhase?: (label: string, state: 'active' | 'done') => void;
  onError?: (message: string, recoverable: boolean) => void;
};

/** Streaming deck edit: POSTs a user message to the deck-chat endpoint and drives
 *  the §3.1 event handlers as ops apply, resolving with the terminal batch_done
 *  (carrying the new deck_rev). Same SSE framing + idle-timeout guard as
 *  sendChatStream. The backend commits once at batch_done (single doc write +
 *  whole-deck rebuild); the caller re-fetches only `affects_slides` previews. */
/** Shared SSE reader for the deck edit + undo streams — both speak the identical
 *  §3.1 event language (`data: {json}\n\n`, one batch of ops → new deck_rev +
 *  slide_order), so forward edits and undo reconcile through the same handlers.
 *  A recoverable `error` event still fires `onError` and then throws (the batch
 *  did not commit) — the caller distinguishes the recoverable case via the flag
 *  it sets inside `onError`. */
async function streamDeckSSE(
  path: string, body: unknown, handlers: DeckChatHandlers, signal?: AbortSignal,
): Promise<DeckBatchDone> {
  const IDLE_MS = 90_000;
  const url = requireUrl();

  const internalCtrl = new AbortController();
  const combined = signal
    ? (AbortSignal as any).any?.([signal, internalCtrl.signal]) ?? internalCtrl.signal
    : internalCtrl.signal;
  let externalAborted = false;
  signal?.addEventListener('abort', () => { externalAborted = true; internalCtrl.abort(); });

  let idleTimer = setTimeout(() => internalCtrl.abort(), IDLE_MS);
  const resetIdle = () => { clearTimeout(idleTimer); idleTimer = setTimeout(() => internalCtrl.abort(), IDLE_MS); };

  try {
    const res = await fetch(`${url}${path}`, {
      method: 'POST',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: combined,
    });
    if (res.status === 404 || res.status === 501) throw new EndpointPendingError(path);
    if (!res.ok || !res.body) throw new Error(`deck stream failed (${res.status})`);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let final: DeckBatchDone | null = null;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      resetIdle();
      buf += dec.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop() ?? '';
      for (const p of parts) {
        const line = p.split('\n').find((l) => l.startsWith('data: '));
        if (!line) continue;
        const evt = JSON.parse(line.slice(6)) as DeckStreamEvent;
        switch (evt.event) {
          case 'batch_start': handlers.onBatchStart?.(evt); break;
          case 'assistant_delta': handlers.onAssistantDelta?.(evt.text ?? ''); break;
          case 'op': handlers.onOp?.(evt.op, evt.index, evt.status, evt.error); break;
          case 'slide_dirty': handlers.onSlideDirty?.(evt.slide_ids ?? [], evt.slide_indices ?? []); break;
          case 'phase': handlers.onPhase?.(evt.label, evt.state); break;
          case 'batch_done': final = { batch_id: evt.batch_id, deck_rev: evt.deck_rev, applied: evt.applied, failed: evt.failed, slide_order: evt.slide_order }; break;
          case 'error': handlers.onError?.(evt.message, evt.recoverable); throw new Error(evt.message || 'deck edit failed');
        }
      }
    }
    if (!final) throw new Error('stream ended without a batch_done');
    return final;
  } catch (e: any) {
    if (e?.name === 'AbortError' || internalCtrl.signal.aborted || externalAborted) {
      throw new StreamAbortedError();
    }
    throw e;
  } finally {
    clearTimeout(idleTimer);
  }
}

/** Streaming deck edit: POSTs a user message to the deck-chat endpoint and drives
 *  the §3.1 event handlers as ops apply, resolving with the terminal batch_done
 *  (carrying the new deck_rev + slide_order). */
export async function sendDeckChatStream(
  jobId: string, message: string, handlers: DeckChatHandlers, signal?: AbortSignal,
): Promise<DeckBatchDone> {
  return streamDeckSSE(`/generate-deck/${encodeURIComponent(jobId)}/chat`, { message }, handlers, signal);
}

// ── Outline-generation stream (§3.5) ────────────────────────────────────────
// Replaces the dead synchronous wait on POST /generate-deck/outline. The event
// vocabulary is DIFFERENT from the §3.1 edit stream (phase/heartbeat/outline_ready/
// error, no ops), so it gets its own reader — but the SSE plumbing (abort combine,
// idle timer, `data: {json}\n\n` framing) is identical.
export type OutlineStreamEvent =
  | { event: 'phase'; phase: string; label: string }
  | { event: 'heartbeat' }
  | { event: 'outline_ready'; outline: DeckOutline }
  | { event: 'error'; recoverable: boolean; message: string };

/** Streaming outline draft (§3.5). Same request body + auth as the sync
 *  `generateDeckOutline`. Drives `onPhase(label)` off the `phase` events and
 *  resolves with the FULL outline dict from the terminal `outline_ready` (fed
 *  straight to <DeckOutline>). A terminal `error` throws.
 *
 *  Idle budget is 60s (≥ the ~30-45s Modal cold-start-to-first-byte window; the
 *  contract flushes `starting` ASAP once warm, then ~10s heartbeats keep it alive).
 *  The timer is reset on EVERY chunk read — heartbeats included — so a legitimately
 *  long planning call is never mistaken for a hang. */
export async function streamDeckOutline(
  input: {
    request: string; deliverable_type?: string; client_slug?: string; session_id?: string | null;
    file_ids?: string[]; target_slides?: number;
  },
  handlers: { onPhase?: (label: string) => void },
  signal?: AbortSignal,
): Promise<DeckOutline> {
  const IDLE_MS = 60_000;
  const path = '/generate-deck/outline/stream';
  const url = requireUrl();

  const internalCtrl = new AbortController();
  const combined = signal
    ? (AbortSignal as any).any?.([signal, internalCtrl.signal]) ?? internalCtrl.signal
    : internalCtrl.signal;
  let externalAborted = false;
  signal?.addEventListener('abort', () => { externalAborted = true; internalCtrl.abort(); });

  let idleTimer = setTimeout(() => internalCtrl.abort(), IDLE_MS);
  const resetIdle = () => { clearTimeout(idleTimer); idleTimer = setTimeout(() => internalCtrl.abort(), IDLE_MS); };

  try {
    const res = await fetch(`${url}${path}`, {
      method: 'POST',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: combined,
    });
    if (res.status === 404 || res.status === 501) throw new EndpointPendingError(path);
    if (!res.ok || !res.body) throw new Error(`outline stream failed (${res.status})`);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let outline: DeckOutline | null = null;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      resetIdle();  // reset on every event, heartbeat included
      buf += dec.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop() ?? '';
      for (const p of parts) {
        const line = p.split('\n').find((l) => l.startsWith('data: '));
        if (!line) continue;
        const evt = JSON.parse(line.slice(6)) as OutlineStreamEvent;
        switch (evt.event) {
          case 'phase': handlers.onPhase?.(evt.label); break;
          case 'heartbeat': break;  // keep-alive only; idle timer already reset
          case 'outline_ready': outline = evt.outline; break;  // TERMINAL success
          case 'error': throw new Error(evt.message || 'Could not draft the outline.');  // TERMINAL failure
        }
      }
      if (outline) return outline;  // terminal — stop reading
    }
    if (!outline) throw new Error('outline stream ended without an outline');
    return outline;
  } catch (e: any) {
    if (e?.name === 'AbortError' || internalCtrl.signal.aborted || externalAborted) {
      throw new StreamAbortedError();
    }
    throw e;
  } finally {
    clearTimeout(idleTimer);
  }
}

/** Undo a committed batch (`{batch_id}`) or a single op (`{op_id}`). Server-
 *  authoritative + $0 IR replay (R1): the backend streams the INVERSE ops back
 *  through the SAME §3.1 event shape, so the canvas reconciles exactly as it does
 *  for a forward edit. If a per-op undo can't be isolated (a dependent op), the
 *  backend emits a recoverable `error` event and the UI offers a whole-group undo.
 *
 *  NOTE (contract flag): the `POST /generate-deck/{job_id}/undo` route is a
 *  PROPOSED transport — the backend has the undo machinery (iterations + before/
 *  after envelopes) but not yet this endpoint. Built + mocked against this shape;
 *  confirm/adjust with the backend lane. */
export async function undoDeckStream(
  jobId: string, target: { batch_id?: string; op_id?: string },
  handlers: DeckChatHandlers, signal?: AbortSignal,
): Promise<DeckBatchDone> {
  return streamDeckSSE(`/generate-deck/${encodeURIComponent(jobId)}/undo`, target, handlers, signal);
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
  const res = await fetchWithTimeout(
    `${url}/survey-compendium/${encodeURIComponent(jobId)}/status`,
    { headers: await authHeaders() },
    T_GEN, 'Checking survey status',
  );
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
  const res = await fetchWithTimeout(
    `${url}/upload`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form },
    T_GEN, 'Uploading document',
  );
  if (res.status === 404 || res.status === 501) throw new EndpointPendingError('/upload');
  return json<{ file_id: string; file_name: string; status: string }>(res);
}

export async function uploadDocumentStatus(fileId: string): Promise<{ status: 'indexing' | 'complete' | 'error'; chunks_indexed?: number; error?: string }> {
  const url = requireUrl();
  const res = await fetchWithTimeout(
    `${url}/upload/${encodeURIComponent(fileId)}/status`,
    { headers: await authHeaders() },
    T_GEN, 'Checking upload status',
  );
  if (res.status === 404 || res.status === 501) throw new EndpointPendingError('/upload');
  return json<{ status: 'indexing' | 'complete' | 'error'; chunks_indexed?: number; error?: string }>(res);
}
