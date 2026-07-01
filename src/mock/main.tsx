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
    // Generation + upload endpoints intentionally 404 → honest "preview" state.
    return jsonRes({ detail: 'pending' }, 404);
  }
  return realFetch(input as any, init);
}) as typeof window.fetch;

// ── Theme + view routing ─────────────────────────────────────────────────────
const params = new URLSearchParams(window.location.search);
if (params.get('theme') === 'dark') document.documentElement.classList.add('theme-quantifire');
const view = params.get('view') || 'app';

import('./HarnessRoot').then(({ HarnessRoot }) => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <HarnessRoot view={view} />
    </StrictMode>,
  );
});
