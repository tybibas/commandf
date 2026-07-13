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
  // Normally a string (the planner's own shape). A whiteboard-intake slide's
  // `must_show` arrives as a string[] of transcribed bullets instead — widened
  // here rather than narrowed on the backend; DeckOutline's build() normalizes
  // either shape back to a string before it round-trips as `approved_plan`.
  must_show?: string | string[];
  evidence_ns?: number[];
  sources?: OutlineSource[];
  // Whiteboard-intake only: the vision model's self-reported transcription
  // confidence (0-1) for this slide. Absent (undefined) on every normal
  // /generate-deck/outline slide — existing callers see no change.
  confidence?: number;
};
export type DeckOutline = {
  deliverable_type?: string;
  governing_thought: string;
  organizing_construct: string;
  lines_of_argument: string[];
  slides: OutlineSlide[];
  sources_pool: OutlineSource[];
  plan: Record<string, unknown>;
  // Whiteboard-intake only (POST /whiteboard-intake) — both absent on the
  // normal outline endpoint. `illegible` lists regions/notes the vision model
  // could not transcribe (never invented); `source` tags provenance so the UI
  // can tell a photo-derived outline from a retrieval-grounded one.
  illegible?: string[];
  source?: string;
};

/** The three deliverable types the deck generator validates as a structured enum
 * — any other value returns HTTP 400. Every other UI chip is folded into the
 * request prose instead (the planner is LLM-driven and adapts). See DeckSurface. */
export const DECK_ENUM_TYPES = new Set(['proposal', 'engagement_recap', 'pov_memo']);

/** Client-side size guard for POST /whiteboard-intake, mirroring the backend's
 * OWN threshold exactly: `_MAX_UPLOAD_BYTES` in modal_commandf.py (40 MB) is
 * what actually 400s the request (`whiteboard_intake_endpoint` checks against
 * that constant, not the smaller 20 MB `_MAX_IMAGE_BYTES` the vision call itself
 * guards with, which would surface as a 422 instead). Failing fast client-side
 * on the SAME number avoids a pointless upload only to be told "file too large". */
export const WHITEBOARD_MAX_BYTES = 40 * 1024 * 1024;

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

/** Thrown on the whiteboard-intake endpoint's 422 (`whiteboard_intake_failed`)
 * — an empty/unusable photo or a model reply the backend couldn't normalize
 * into an outline. `message` is the backend's own `detail` text, safe to show
 * verbatim (already human-phrased, e.g. "the photo may be too blurry, dark, or
 * not actually a storyboard sketch"). Distinct from EndpointPendingError (which
 * means "unreachable") — this means "reached it, and it genuinely couldn't
 * read that photo," which the UI offers a retry for, not a "try later" note. */
export class WhiteboardIntakeFailedError extends Error {
  constructor(detail: string) {
    super(detail || 'Could not read that photo.');
    this.name = 'WhiteboardIntakeFailedError';
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
// Outline stream idle budget (§3.5): belt-and-suspenders vs. a cold Modal wake
// (~30-45s to first byte) ON TOP OF a real planning call. Reset on every SSE
// event (heartbeats included), so this is a hang guard, not a hard call ceiling.
const T_OUTLINE = 90000;
// Whiteboard intake (POST /whiteboard-intake) is a single synchronous call —
// no SSE progress to reset against — but shares the SAME cold-start-plus-one-
// real-model-call profile as the outline endpoint (a cold Modal container adds
// ~30-45s before the vision call itself even starts), so it gets the same budget
// rather than the shorter T_GEN.
const T_WHITEBOARD = 90000;

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

// A cached access_token is only as good as its expiry. A long-lived tab or a
// laptop sleep can leave `getSession()` returning a token that's already dead
// by the time it reaches the backend (401 "Authentication failed" even though
// the user never signed out). `freshSession()` is the ONE place every token
// consumer below goes through: it checks `expires_at` and proactively calls
// `refreshSession()` when the token is missing/expired/within a minute of
// expiring, single-flighted so a burst of concurrent callers (auth headers +
// slide previews + a download) share one refresh instead of firing N.
const TOKEN_REFRESH_SKEW_S = 60;
let refreshInFlight: Promise<Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session']> | null = null;

async function freshSession() {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return session;
  const expiresAt = session.expires_at;
  const freshEnough = typeof expiresAt === 'number' && expiresAt - Date.now() / 1000 > TOKEN_REFRESH_SKEW_S;
  if (freshEnough) return session;
  if (!refreshInFlight) {
    refreshInFlight = supabase.auth.refreshSession()
      .then(({ data, error }) => (error ? null : data.session))
      .catch(() => null)
      .finally(() => { refreshInFlight = null; });
  }
  // Refresh failure never makes things worse than before this fix: fall back
  // to the (possibly stale) session getSession() already returned.
  return (await refreshInFlight) ?? session;
}

async function authHeaders(): Promise<Record<string, string>> {
  const session = await freshSession();
  const token = session?.access_token;
  if (!token) throw new NotSignedInError();
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

async function bearer(): Promise<string> {
  const session = await freshSession();
  const token = session?.access_token;
  if (!token) throw new NotSignedInError();
  return token;
}

/** Returns the current access token, or null if not signed in (never throws).
 * Expiry-aware: refreshes through `freshSession()` before returning. */
export async function currentToken(): Promise<string | null> {
  const session = await freshSession();
  return session?.access_token ?? null;
}

/** Stable per-user id (JWT sub) for keying the local sessions cache; null if
 * not signed in. Never throws. */
export async function currentUserId(): Promise<string | null> {
  const session = await freshSession();
  return session?.user?.id ?? null;
}

/** Token + stable uid in ONE freshSession() read. Avoids the two back-to-back
 * getSession() calls the sidecar loader used to make. Never throws; both
 * fields are null when not signed in. */
export async function currentAuth(): Promise<{ token: string | null; uid: string | null }> {
  const session = await freshSession();
  return {
    token: session?.access_token ?? null,
    uid: session?.user?.id ?? null,
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
  // Proposal cover data (harmless on the outline call; the build call is the
  // one the backend actually reads these from — see generateDeck below).
  prospect_company?: string;
  prospect_website?: string;
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
  // Proposal cover data: drives the "Prepared for {company}" cover line and the
  // scraped-logo lookup (falls back to company name; degrades to no logo on
  // fetch failure). Optional — the build proceeds fine without them.
  prospect_company?: string;
  prospect_website?: string;
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

// ── P0-1: session→job rehydration (Actionist/COMMANDF_DEMO_RUN_PROBLEMS_2026-07-07.md) ──
// The BE now persists `session_id` on `commandf_jobs` (sent in generateDeck's /
// startDeckBuild's request bodies below) and exposes a by-session lookup so a
// reopened/reloaded session can find its deck job again — the only key that
// unlocks Deck Studio (`job_id`) previously lived in React state only.
export type DeckJobBySession = {
  job_id: string;
  session_id: string;
  status: JobStatus['status'];
  slide_count?: number;
  title?: string;
  download_url?: string | null;
  placeholders?: string[];
  plan?: Record<string, unknown>;
  deck_scope?: 'full' | 'section';
  section_start?: number;
  built_through?: number;
  plan_total_slides?: number;
  error?: string;
};

/** `GET /generate-deck/by-session/{session_id}` — the latest deck job tied to a
 *  chat session, for rehydrating Deck Studio on session-open/reload (P0-1).
 *  404 (no deck job for this session) resolves to `null`, NOT a throw — this is
 *  an expected, common case (most sessions never build a deck), unlike the
 *  EndpointPendingError convention used for genuinely-missing routes. Any other
 *  failure (network, 5xx, auth) still throws so a rehydrate call-site can tell
 *  "no deck" apart from "couldn't check right now". */
export async function getDeckJobBySession(sessionId: string): Promise<DeckJobBySession | null> {
  const url = requireUrl();
  const res = await fetchWithTimeout(
    `${url}/generate-deck/by-session/${encodeURIComponent(sessionId)}`,
    { headers: await authHeaders() }, T_FAST, 'Checking for a saved deck',
  );
  if (res.status === 404) return null;
  return json<DeckJobBySession>(res);
}

// ── Deck library (chat-history-style list of past deck builds) ──────────────
// NOTE (contract flag): `GET /deck-builds` is being built in parallel on the
// backend lane — this client is written against the agreed shape below and
// degrades gracefully (EndpointPendingError) while the route is still landing.
export type DeckBuild = {
  job_id: string;
  created_at: string;
  status: JobStatus['status'];
  title?: string;
  prospect_company?: string;
  slide_count?: number;
  artifact_available?: boolean;
  session_id?: string | null;
};

/** `GET /deck-builds?limit=&offset=` — newest-first list of past deck builds for
 *  the "Decks" library surface. Throws EndpointPendingError on 404/501 so the
 *  surface can show a quiet "coming soon" empty state instead of a crash. */
export async function fetchDeckBuilds(limit = 20, offset = 0): Promise<DeckBuild[]> {
  const url = requireUrl();
  const res = await fetchWithTimeout(
    `${url}/deck-builds?limit=${limit}&offset=${offset}`,
    { headers: await authHeaders() }, T_FAST, 'Loading deck library',
  );
  if (res.status === 404 || res.status === 501) throw new EndpointPendingError('/deck-builds');
  const r = await json<{ builds: DeckBuild[] }>(res);
  return r.builds || [];
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
    prospect_company?: string; prospect_website?: string;
  },
  handlers: { onPhase?: (label: string) => void },
  signal?: AbortSignal,
): Promise<DeckOutline> {
  const IDLE_MS = T_OUTLINE;
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

// ── Build-time copilot (§3.6) — live, resumable build stream ────────────────
// Replaces the one-shot `POST /generate-deck` + post-hoc studio open. The
// studio now mounts the INSTANT the build job exists and watches it author
// slide-by-slide. Event vocabulary is build-specific (build_start/slide_planned/
// slide_authoring/slide_ready/narration), each carrying a monotonic `cursor` —
// the resume key for `?from_cursor=` after a dropped connection, a page
// refresh, or the 600s ASGI ceiling (the build itself runs in the spawned job
// and is unaffected). Terminal is exactly one of `build_done` / non-recoverable
// `error`, mirroring §3.5's discipline.
export type BuildStreamEvent =
  | { event: 'build_start'; job_id: string; plan_total_slides: number; deck_rev: number; cursor: number }
  | { event: 'slide_planned'; index: number; slide_id: string; slide_template: string; lede: string; cursor: number }
  | { event: 'slide_authoring'; index: number; label: string; cursor: number }
  | { event: 'phase'; index?: number; label: string; state: 'active' | 'done'; cursor: number }
  | { event: 'slide_ready'; index: number; slide_id: string; built_through: number; preview_url: string; cursor: number }
  | { event: 'narration'; index: number; text: string; cursor: number }
  | { event: 'heartbeat' }
  | { event: 'build_done'; deck_rev: number; built_through: number; plan_total_slides: number; slide_order: string[]; cursor: number }
  | { event: 'error'; recoverable: boolean; index?: number; message: string; cursor?: number }
  // §3.6.1: the backend voluntarily closes the stream ~570s in (ahead of the
  // 600s ASGI ceiling) rather than let it die abruptly. NOT terminal, NOT an
  // error — the client reconnects with `from_cursor: cursor`.
  | { event: 'reconnect_required'; cursor: number };

export type BuildDoneResult = { deck_rev: number; built_through: number; plan_total_slides: number; slide_order: string[] };

/** `POST /generate-deck/build` — thin, non-streaming. Body mirrors `generateDeck`'s
 *  request shape (the approved outline plan + the same framing fields) minus the
 *  chunked-build `deck_scope`/`section_*` params, which don't apply here: the
 *  build loop always authors the WHOLE approved plan, slide by slide, live.
 *  Returns immediately (202) with the job id; the studio mounts against it right
 *  away and the build streams in via `streamDeckBuild`. */
export async function startDeckBuild(approvedPlan: Record<string, unknown>, opts?: {
  request?: string; deliverable_type?: string; client_slug?: string; session_id?: string | null;
  file_ids?: string[]; target_slides?: number;
  prospect_company?: string; prospect_website?: string;
}): Promise<{ job_id: string }> {
  return postJob('/generate-deck/build', JSON.stringify({ approved_plan: approvedPlan, ...opts }), false);
}

/** Tails the live build (§3.6) from `fromCursor` (-1 = from the start) via
 *  `GET /generate-deck/{jobId}/build/stream?from_cursor=N`. Fires `onEvent` for
 *  every event line (including `heartbeat`, which the caller can ignore).
 *
 *  Resumability contract: this call can END WITHOUT a terminal event (an idle
 *  timeout, a network drop, the ASGI ceiling, a clean `reconnect_required`) —
 *  that is NOT a failure. It resolves with `{ terminal: null, lastCursor }` so
 *  the caller reconnects with `fromCursor: lastCursor`. It resolves with
 *  `{ terminal: {...}, lastCursor }` only once `build_done` arrives. It THROWS
 *  only on a deliberate abort (StreamAbortedError, from either the caller's
 *  `signal` or the internal idle timeout) — a recoverable per-slide `error` is
 *  delivered via `onEvent` and the tail keeps going, and ANY OTHER thrown error
 *  (a dropped fetch, `ERR_HTTP2_PROTOCOL_ERROR`, a network failure) is treated
 *  as a reconnectable drop and resolves `{ terminal: null, lastCursor }` too —
 *  never rethrown as fatal (§3.6.1: the 600s ASGI ceiling guarantees a stream
 *  this abrupt on any build past ~10 minutes; the build itself is unaffected,
 *  it keeps running in the spawned job). */
export async function streamDeckBuild(
  jobId: string,
  opts: { fromCursor?: number; onEvent: (evt: BuildStreamEvent) => void; signal?: AbortSignal },
): Promise<{ terminal: BuildDoneResult | null; lastCursor: number }> {
  const IDLE_MS = 90_000;
  const { fromCursor = -1, onEvent, signal } = opts;
  const url = requireUrl();
  const path = `/generate-deck/${encodeURIComponent(jobId)}/build/stream?from_cursor=${fromCursor}`;

  const internalCtrl = new AbortController();
  const anyAbortSignal = AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal };
  const combined = signal
    ? anyAbortSignal.any?.([signal, internalCtrl.signal]) ?? internalCtrl.signal
    : internalCtrl.signal;
  let externalAborted = false;
  signal?.addEventListener('abort', () => { externalAborted = true; internalCtrl.abort(); });

  let idleTimer = setTimeout(() => internalCtrl.abort(), IDLE_MS);
  const resetIdle = () => { clearTimeout(idleTimer); idleTimer = setTimeout(() => internalCtrl.abort(), IDLE_MS); };

  let lastCursor = fromCursor;
  let terminal: BuildDoneResult | null = null;
  try {
    const token = await bearer();
    const res = await fetch(`${url}${path}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      signal: combined,
    });
    if (res.status === 404 || res.status === 501) throw new EndpointPendingError(path);
    if (!res.ok || !res.body) throw new Error(`build stream failed (${res.status})`);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
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
        const evt = JSON.parse(line.slice(6)) as BuildStreamEvent;
        if ('cursor' in evt && typeof evt.cursor === 'number') lastCursor = evt.cursor;
        if (evt.event === 'reconnect_required') {
          // Clean, expected handoff ahead of the 600s ASGI ceiling — NOT
          // forwarded to onEvent (nothing for the UI to render), just ends
          // this tail non-terminally so the caller reconnects from lastCursor.
          return { terminal: null, lastCursor };
        }
        onEvent(evt);
        if (evt.event === 'build_done') {
          terminal = {
            deck_rev: evt.deck_rev, built_through: evt.built_through,
            plan_total_slides: evt.plan_total_slides, slide_order: evt.slide_order,
          };
        } else if (evt.event === 'error' && !evt.recoverable) {
          throw new Error(evt.message || 'Build failed.');
        }
      }
      if (terminal) break;
    }
    return { terminal, lastCursor };
  } catch (e: unknown) {
    if ((e as { name?: string })?.name === 'AbortError' || internalCtrl.signal.aborted || externalAborted) {
      throw new StreamAbortedError();
    }
    // Any other thrown error (dropped fetch, ERR_HTTP2_PROTOCOL_ERROR, a
    // network failure) is a reconnectable drop, not a fatal failure — the
    // build runs server-side in the spawned job and is unaffected by the
    // client's connection dying (§3.6.1). Resolve non-terminal with the last
    // cursor seen so the caller reconnects instead of surfacing an error.
    return { terminal: null, lastCursor };
  } finally {
    clearTimeout(idleTimer);
  }
}

/** Resolves a `slide_ready.preview_url` (a server-relative path, e.g.
 *  `/generate-deck/{job_id}/preview/1`) into an absolute, token-authed URL an
 *  `<img>` can load — same `?token=` pattern as `deckSlidePreviewUrl` (an `<img>`
 *  can't send an Authorization header). Dev harness: `__commandfMockPreview`
 *  fixtures already return loadable urls/data-URIs, so they pass through as-is. */
export async function resolveBuildPreviewUrl(previewUrl: string): Promise<string> {
  const mock = (window as unknown as { __commandfMockPreview?: (i: number, rev: number) => string })
    .__commandfMockPreview;
  if (mock) return previewUrl;
  const url = requireUrl();
  const abs = previewUrl.startsWith('http') ? previewUrl : `${url}${previewUrl}`;
  const token = await currentToken();
  if (!token) return abs;
  const sep = abs.includes('?') ? '&' : '?';
  return `${abs}${sep}token=${encodeURIComponent(token)}`;
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

/** Absolute `.pptx` download URL for a deck job (P0-2 Deck Studio download
 *  control). Mirrors the shape of a one-shot job's `result.download_url`, but
 *  built locally since Deck Studio only ever holds a bare `jobId` prop — pass
 *  the result through `authedDownloadUrl` for the signed `<a download>` href. */
export function deckDownloadUrl(jobId: string): string {
  const url = requireUrl();
  return `${url}/generate-deck/${encodeURIComponent(jobId)}/download`;
}

/** Click-time file download, shared by every `.pptx` (and similar) download
 *  control. Precomputing an `<a href>` at render time bakes a token that can
 *  go stale long before the user clicks (the original bug: laptop sleep /
 *  long-lived tab → cached token expired → 401 "Authentication failed").
 *  This instead fetches fresh, on click, with a real Authorization header
 *  (routed through `authHeaders` → `freshSession`, so it's proactively
 *  refreshed already); if the backend still 401s (token expired in the gap
 *  between freshness-check and request), it forces one `refreshSession()`
 *  and retries exactly once. The file is pulled as a blob and "clicked" via
 *  a throwaway object URL so the browser download dialog behaves exactly
 *  like a normal `<a download>`.
 *
 *  Only falls back to the legacy `?token=` href (which can itself be stale)
 *  if the blob path fails for a reason that isn't a 401 we already retried —
 *  e.g. a network/CORS error — so a click is never a silent no-op. */
export async function downloadFileFresh(url: string, filename: string): Promise<void> {
  try {
    let res = await fetch(url, { headers: await authHeaders() });
    if (res.status === 401) {
      await supabase.auth.refreshSession();
      res = await fetch(url, { headers: await authHeaders() });
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } catch {
    // Blob path failed unexpectedly (network/CORS, or signed-out) — fall back
    // to the old token-in-query href rather than leaving the click dead.
    const href = await authedDownloadUrl(url);
    window.location.assign(href);
  }
}

/** Click-time `.pptx` download for Deck Studio — thin wrapper over
 *  `downloadFileFresh` that also builds the deck's download URL from a
 *  bare `jobId` (Deck Studio only ever holds that, not a full URL). */
export async function downloadDeckPptx(jobId: string, title?: string): Promise<void> {
  const url = deckDownloadUrl(jobId);
  const filename = `${(title || jobId).trim().replace(/[\\/:*?"<>|]+/g, '_') || jobId}.pptx`;
  return downloadFileFresh(url, filename);
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

// ── Whiteboard intake (C1) — photo → DeckOutline, no RAG retrieval ──────────
// Backend: execution/commandf/whiteboard_intake.py + POST /whiteboard-intake
// (modal_commandf.py, v64). Single synchronous multipart call — no job/poll,
// the outline comes back in the response body, in the SAME shape
// generateDeckOutline/streamDeckOutline return (plus `illegible` + `source`;
// see the DeckOutline type above), so the caller feeds it straight to the
// existing outline-approval UI.

/** Photo (+ optional free-text hint) → an approvable DeckOutline. Auth mirrors
 *  every other endpoint here (Bearer JWT via `bearer()`), with ONE difference:
 *  a 401 gets exactly one retry after a forced `refreshSession()` — the same
 *  belt-and-suspenders a cached-but-expired token needs that `downloadFileFresh`
 *  already applies to downloads, since this call can sit on a slow vision
 *  round-trip long enough for a borderline-fresh token to expire mid-flight.
 *
 *  Error mapping:
 *    404/501 → EndpointPendingError (unreachable, not a real rejection).
 *    422 `{error:"whiteboard_intake_failed", detail}` → WhiteboardIntakeFailedError(detail).
 *    400 `{detail:"empty file"|"file too large"}` → plain Error(detail) (the
 *      caller should mostly pre-empt this with a client-side size check, but
 *      the backend's own 400 is still surfaced verbatim as a fallback).
 *    any other non-2xx → plain Error(detail ?? `HTTP ${status}`). */
export async function whiteboardIntake(file: File, requestHint?: string): Promise<DeckOutline> {
  const url = requireUrl();
  const form = new FormData();
  form.append('file', file);
  const hint = (requestHint ?? '').trim();
  if (hint) form.append('request_hint', hint);

  const post = (token: string) => fetchWithTimeout(
    `${url}/whiteboard-intake`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form },
    T_WHITEBOARD, 'Reading your whiteboard',
  );

  let res = await post(await bearer());
  if (res.status === 401) {
    await supabase.auth.refreshSession();
    res = await post(await bearer());
  }
  if (res.status === 404 || res.status === 501) throw new EndpointPendingError('/whiteboard-intake');
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: string; detail?: string } | null;
    if (res.status === 401) throw new NotSignedInError();
    if (res.status === 422 && body?.error === 'whiteboard_intake_failed') {
      throw new WhiteboardIntakeFailedError(body.detail || '');
    }
    throw new Error(body?.detail || `HTTP ${res.status}`);
  }
  return json<DeckOutline>(res);
}
