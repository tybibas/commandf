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
} from './fixtures';

// ── Stub the Supabase session (authHeaders/currentToken succeed) ─────────────
(supabase.auth as any).getSession = async () => ({
  data: { session: { access_token: 'mock-token', user: { id: 'mock-user' } } },
  error: null,
});

// ── Stub fetch for the Command F backend ─────────────────────────────────────
const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const realFetch = window.fetch.bind(window);
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.includes('modal.run') || url.includes('mock.local')) {
    const path = url.split('modal.run').pop() || url;
    if (path.includes('/models')) return jsonRes({ models: MOCK_MODELS });
    if (path.includes('/sessions') && (init?.method ?? 'GET') === 'DELETE') return jsonRes({ ok: true });
    if (path.includes('/sessions')) return jsonRes({ sessions: MOCK_SESSIONS });
    if (path.includes('/briefing')) return jsonRes(MOCK_BRIEFING);
    if (path.includes('/history')) return jsonRes({ history: MOCK_HISTORY });
    if (path.includes('/chat')) {
      await new Promise((r) => setTimeout(r, 650)); // let the typing indicator show
      return jsonRes(MOCK_CHAT_RESPONSE);
    }
    if (path.includes('/sources/status')) return jsonRes({ google_drive: true, dropbox: false });
    if (path.includes('/sync/status')) return jsonRes({ status: 'complete' });
    if (path.includes('/sync')) return jsonRes({ ok: true });
    // Deck: outline (sync) → build (job) → status.
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
