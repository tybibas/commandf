// Dev-only render harness — NOT part of the production build.
// Served at /mock.html by the Vite dev server. Stubs window.fetch and the
// Supabase session so the REAL CommandFPage + surfaces render with fixtures,
// with no network calls and no credentials. Playwright drives interactions
// (type a query, open panels, switch modes) for render-verification.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import { supabase } from '../lib/supabase';
import {
  MOCK_MODELS, MOCK_SESSIONS, MOCK_BRIEFING, MOCK_CHAT_RESPONSE, MOCK_HISTORY,
  MOCK_OUTLINE, MOCK_DECK_STATUS, MOCK_UPLOAD_STATUS,
  MOCK_STUDIO_SESSION, MOCK_DECK_EDIT_STREAM, MOCK_DECK_EDIT_STREAM_FAIL,
  MOCK_DECK_UNDO_STREAM, MOCK_DECK_UNDO_DEP_ERROR, mockSlidePreview,
  MOCK_COST_SUMMARY, MOCK_CASE_STUDY_CANDIDATES,
} from './fixtures';

// Senior advisor panel roster (GET /proposal-team-roster) — a small realistic
// set of real firm advisers so the proposal scoping multi-select renders.
const MOCK_ADVISER_ROSTER = [
  { name: 'David Ascher', title: 'Managing Partner' },
  { name: 'Seth Egorin', title: 'Partner' },
  { name: 'Felix Recht', title: 'Partner' },
  { name: 'Abhigna Mandavilli', title: 'Associate Partner' },
  { name: 'Jonathan Crane', title: 'Engagement Manager' },
];

// Parse a stubbed request's JSON body (deck /chat + /undo route on message/target).
const parseBody = (init?: RequestInit): Record<string, unknown> => {
  try { return init?.body ? JSON.parse(init.body as string) : {}; } catch { return {}; }
};

// Grounding trust-footer states for verifying F6, chosen by ?grounding=:
//  (default) populated · pending = null grounding (the real session-open shape) ·
//  fallback = fell_back_unfiltered (the "no category exemplars matched" warning).
const studioSessionFor = (mode: string | null, format?: string | null) => {
  let s = MOCK_STUDIO_SESSION;
  // Honor ?format= (the backend's intended re-issue-retrieval path): reflect the
  // chosen format + its target category in the returned session.
  if (format) {
    const opt = s.build_format_options.find((o) => o.format === format);
    if (opt) {
      s = {
        ...s,
        active_format: opt.format,
        active_target_category: opt.target_category,
        grounding: { ...s.grounding, target_category: opt.target_category },
      };
    }
  }
  if (mode === 'pending') {
    return { ...s, grounding: { ...s.grounding, content_pool: null,
      style_exemplars: { ...s.grounding.style_exemplars, n_matched: null, fell_back_unfiltered: null, exemplars: [] } } };
  }
  if (mode === 'fallback') {
    return { ...s, grounding: { ...s.grounding,
      style_exemplars: { ...s.grounding.style_exemplars, fell_back_unfiltered: true, exemplars: [] } } };
  }
  return s;
};

// Deck Studio previews: `<img>` loads bypass the fetch stub below, so the api
// client reads slide PNGs from this hook in the harness (see deckSlidePreviewUrl).
(window as unknown as { __commandfMockPreview?: (i: number, rev: number) => string })
  .__commandfMockPreview = mockSlidePreview;

// ── Stub the Supabase session (authHeaders/currentToken succeed) ─────────────
(supabase.auth as any).getSession = async () => ({
  data: {
    session: {
      access_token: 'mock-token',
      user: {
        id: 'mock-user',
        email: 'ty@actionistconsulting.com',
        user_metadata: { full_name: 'Ty Bibas' },
      },
    },
  },
  error: null,
});

// ── Stub fetch for the Command F backend ─────────────────────────────────────
const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Streams SSE `data: {json}\n\n` frames with a gap between them, so the reader's
// incremental parse and the UI's live op rendering are exercised — not a single blob.
const sseRes = (events: unknown[], gap = 240) =>
  new Response(
    new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        for (const evt of events) {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(evt)}\n\n`));
          await new Promise((r) => setTimeout(r, gap));
        }
        controller.close();
      },
    }),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
  );

const realFetch = window.fetch.bind(window);
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.includes('modal.run') || url.includes('mock.local')) {
    const path = url.split('modal.run').pop() || url;
    if (path.includes('/models')) return jsonRes({ models: MOCK_MODELS });
    if (path.includes('/costs')) return jsonRes(MOCK_COST_SUMMARY);
    if (path.includes('/sessions') && (init?.method ?? 'GET') === 'DELETE') return jsonRes({ ok: true });
    // Harness flag: ?sessions=empty simulates a first-run user (no history) so the
    // empty-state example cards can be verified without clearing the fixture.
    if (path.includes('/sessions')) {
      const empty = new URLSearchParams(window.location.search).get('sessions') === 'empty';
      return jsonRes({ sessions: empty ? [] : MOCK_SESSIONS });
    }
    if (path.includes('/briefing')) return jsonRes(MOCK_BRIEFING);
    if (path.includes('/proposal-team-roster')) return jsonRes({ advisers: MOCK_ADVISER_ROSTER });
    // Case-study candidate search (POST /proposal-case-study-candidates).
    // ?casestudies=empty simulates a brief with no matching indexed engagements,
    // for verifying the "couldn't find matches" honest-empty state.
    if (path.includes('/proposal-case-study-candidates')) {
      const empty = new URLSearchParams(window.location.search).get('casestudies') === 'empty';
      await new Promise((r) => setTimeout(r, 450)); // let the "Searching…" state show
      return jsonRes({ candidates: empty ? [] : MOCK_CASE_STUDY_CANDIDATES });
    }
    if (path.includes('/history')) return jsonRes({ history: MOCK_HISTORY });
    if (path.includes('/optimize-prompt')) {
      await new Promise((r) => setTimeout(r, 500));
      return jsonRes({ optimized: 'Build a board/SteerCo update deck for the Q3 value-creation review.\n\nAudience: the board (partner-level, answer-first).\nDecision to drive: approve the remaining structural change.\nCover: quick wins banked to date, the structural decision and its de-risking, and the two tracked risks with mitigations.' });
    }
    // Deck Studio (C-2): studio session (B/A) + streaming edit-op chat. These MUST
    // precede the generic /chat handler — the deck-chat URL also contains '/chat'.
    if (path.includes('/generate-deck') && path.includes('/studio')) {
      const mode = new URLSearchParams(window.location.search).get('grounding');
      const fmt = (() => { try { return new URL(url).searchParams.get('format'); } catch { return null; } })();
      return jsonRes(studioSessionFor(mode, fmt));
    }
    if (path.includes('/generate-deck') && path.includes('/undo')) {
      // Per-op undo of the dependent bullet op (op_a2) can't be isolated -> the
      // backend emits a recoverable error and the UI offers a whole-group undo.
      const b = parseBody(init);
      if (b.op_id === 'op_a2') return sseRes(MOCK_DECK_UNDO_DEP_ERROR);
      return sseRes(MOCK_DECK_UNDO_STREAM);
    }
    if (path.includes('/generate-deck') && path.includes('/chat')) {
      const b = parseBody(init);
      return sseRes(/fail/i.test(String(b.message ?? '')) ? MOCK_DECK_EDIT_STREAM_FAIL : MOCK_DECK_EDIT_STREAM);
    }
    if (path.includes('/chat')) {
      await new Promise((r) => setTimeout(r, 650)); // let the typing indicator show
      return jsonRes(MOCK_CHAT_RESPONSE);
    }
    if (path.includes('/sources/status')) return jsonRes({ google_drive: true, dropbox: false });
    if (path.includes('/sync/status')) return jsonRes({ status: 'complete' });
    if (path.includes('/sync')) return jsonRes({ ok: true });
    // Deck: outline stream (§3.5) → phases → outline_ready. Must precede the sync
    // handler (the stream path also contains '/generate-deck/outline').
    if (path.includes('/generate-deck/outline/stream')) {
      const b = parseBody(init);
      if (/fail/i.test(String(b.request ?? ''))) {
        return sseRes([
          { event: 'phase', phase: 'starting', label: 'Starting…' },
          { event: 'phase', phase: 'retrieving', label: 'Retrieving evidence…' },
          { event: 'error', recoverable: false, message: 'No evidence matched this brief. Try naming the client or topic more specifically.' },
        ], 400);
      }
      return sseRes([
        { event: 'phase', phase: 'starting', label: 'Starting…' },
        { event: 'phase', phase: 'retrieving', label: 'Retrieving evidence…' },
        { event: 'phase', phase: 'planning', label: 'Planning the slides…' },
        { event: 'heartbeat' },
        { event: 'outline_ready', outline: MOCK_OUTLINE },
      ], 500);
    }
    // Deck: outline (sync fallback) → build (job) → status.
    if (path.includes('/generate-deck/outline')) {
      await new Promise((r) => setTimeout(r, 600)); // let the "Drafting outline…" state show
      return jsonRes(MOCK_OUTLINE);
    }
    if (path.includes('/generate-deck') && path.includes('/status')) return jsonRes(MOCK_DECK_STATUS);
    if (path.includes('/generate-deck')) return jsonRes({ job_id: 'mock-deck-job', status: 'queued' }, 202);
    // Survey compendium: job → status (reuses the deck status shape + sheet_count).
    if (path.includes('/survey-compendium') && path.includes('/status')) return jsonRes({ ...MOCK_DECK_STATUS, sheet_count: 8, title: 'Survey Compendium' });
    if (path.includes('/survey-compendium')) return jsonRes({ job_id: 'mock-survey-job', status: 'queued' }, 202);
    // Upload: 202 indexing → status complete.
    if (path.includes('/upload') && path.includes('/status')) return jsonRes(MOCK_UPLOAD_STATUS);
    if (path.includes('/upload')) return jsonRes({ file_id: 'mock-file', file_name: 'upload.pdf', status: 'indexing' }, 202);
    // Anything still unwired → honest "preview" state.
    return jsonRes({ detail: 'pending' }, 404);
  }
  return realFetch(input as any, init);
}) as typeof window.fetch;

// ── Theme + view routing ─────────────────────────────────────────────────────
const params = new URLSearchParams(window.location.search);
// Dev harness: default to the Actionist tenant so brand/logo render (override
// with ?ctx=operator). Real app resolves this from the signed-in operator.
try { localStorage.setItem('qf_active_context', params.get('ctx') || 'actionist'); } catch { /* ignore */ }
if (params.get('theme') === 'dark') document.documentElement.classList.add('theme-quantifire');
const view = params.get('view') || 'app';

import('./HarnessRoot').then(({ HarnessRoot }) => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <HarnessRoot view={view} />
    </StrictMode>,
  );
});
