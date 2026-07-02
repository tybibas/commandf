// Simulated slow/failing-query proof for the Command F persistence hardening.
// Re-implements the EXACT resilience logic shipped in api.ts (fetchWithTimeout +
// the LoadResult discrimination in fetchSessions) and drives it against a mocked
// global.fetch to prove the UI-facing contract holds under each failure mode:
//   A) 200 with []      -> { ok:true, data:[] }  (real "no conversations yet")
//   B) HTTP 500 / 503   -> { ok:false }           (surface "couldn't load — retry")
//   C) slow (> timeout) -> { ok:false, RequestTimeoutError } (NEVER an infinite spinner, NEVER empty)
//   D) network reject   -> { ok:false }
// The whole point: FAILURE and EMPTY are DISTINCT, so a timeout can never be
// mistaken for "all chats gone".

class NotSignedInError extends Error { constructor(){ super('Not signed in'); this.name='NotSignedInError'; } }
class RequestTimeoutError extends Error { constructor(w){ super(`${w} timed out.`); this.name='RequestTimeoutError'; } }

async function fetchWithTimeout(input, init, ms, label) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } catch (e) {
    if (e?.name === 'AbortError') throw new RequestTimeoutError(label);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchSessions() {
  try {
    const res = await fetchWithTimeout('http://x/sessions', {}, 300, 'Loading conversations');
    if (!res.ok) {
      if (res.status === 401) return { ok: false, error: new NotSignedInError() };
      return { ok: false, error: new Error(`HTTP ${res.status}`) };
    }
    const r = await res.json();
    return { ok: true, data: r.sessions || [] };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e : new Error(String(e)) };
  }
}

// --- the cache-write rule from CommandFPage.loadSessions ---
let CACHE = ['old-chat-1', 'old-chat-2']; // pretend the operator has 2 cached chats
function applyLoadResult(res) {
  if (res.ok) { CACHE = res.data.map(s => s.id); return { wrote: true, sessionsError: false }; }
  return { wrote: false, sessionsError: true }; // cache UNTOUCHED on failure
}

function mockFetch(mode) {
  global.fetch = async (_url, init) => {
    if (mode === 'empty')   return { ok: true, status: 200, json: async () => ({ sessions: [] }) };
    if (mode === 'http500') return { ok: false, status: 500, json: async () => ({}) };
    if (mode === 'reject')  throw new Error('ECONNRESET');
    if (mode === 'slow') {
      return await new Promise((resolve, reject) => {
        const id = setTimeout(() => resolve({ ok: true, status: 200, json: async () => ({ sessions: [{ id: 'x' }] }) }), 5000);
        init?.signal?.addEventListener('abort', () => { clearTimeout(id); const e = new Error('aborted'); e.name = 'AbortError'; reject(e); });
      });
    }
  };
}

function assert(cond, msg) { if (!cond) { console.error('  ✗ FAIL:', msg); process.exitCode = 1; } else { console.log('  ✓', msg); } }

const run = async () => {
  // A) genuine empty
  CACHE = ['old-chat-1', 'old-chat-2']; mockFetch('empty');
  let r = await fetchSessions(); let a = applyLoadResult(r);
  console.log('A) 200 + []  ->', JSON.stringify(r));
  assert(r.ok === true && r.data.length === 0, 'empty is ok:true with []');
  assert(a.sessionsError === false, 'empty does NOT raise the error banner');
  assert(a.wrote === true && CACHE.length === 0, 'a REAL empty legitimately clears the cache');

  // B) HTTP 500
  CACHE = ['old-chat-1', 'old-chat-2']; mockFetch('http500');
  r = await fetchSessions(); a = applyLoadResult(r);
  console.log('B) HTTP 500  ->', r.ok, r.error?.message);
  assert(r.ok === false, 'HTTP 500 is ok:false (a failure, NOT empty)');
  assert(a.sessionsError === true, 'failure raises the retry banner');
  assert(CACHE.length === 2, 'CACHE UNTOUCHED on failure — chats do NOT disappear');

  // C) slow -> our timeout fires first
  CACHE = ['old-chat-1', 'old-chat-2']; mockFetch('slow');
  const t0 = Date.now(); r = await fetchSessions(); const dt = Date.now() - t0; a = applyLoadResult(r);
  console.log(`C) slow      -> ${r.ok} ${r.error?.name} in ${dt}ms`);
  assert(r.ok === false && r.error?.name === 'RequestTimeoutError', 'slow query aborts as RequestTimeoutError (no infinite spinner)');
  assert(dt < 1000, `resolved in ${dt}ms — bounded by the 300ms timeout, did NOT wait 5s`);
  assert(CACHE.length === 2, 'CACHE UNTOUCHED on timeout — chats do NOT disappear');

  // D) network reject
  CACHE = ['old-chat-1', 'old-chat-2']; mockFetch('reject');
  r = await fetchSessions(); a = applyLoadResult(r);
  console.log('D) reject    ->', r.ok, r.error?.message);
  assert(r.ok === false, 'network reject is ok:false');
  assert(CACHE.length === 2, 'CACHE UNTOUCHED on reject');

  console.log(process.exitCode ? '\nRESULT: FAILURES ABOVE' : '\nRESULT: ALL RESILIENCE CASES PASS');
};
run();
