# Command F — Performance, Load-Latency & Chat-Persistence Findings (Workstream-B / Agent B2)

Branch: `feat/ia-command-center` (frontend). **Nothing deployed** — commits are local for the
human's morning review. Backend keying change is owned by Agent B1 and must be deployed first for
the full end-to-end persistence test (steps at the bottom).

Scope: the FRONTEND persistence + load-latency + sign-out fixes. All three tasks below are
implemented, build-clean, and proven against **simulated slow/failing queries** (the DB was not
stressed by this agent).

---

## TL;DR — top wins

1. **"Disappeared conversations" root cause found and fixed.** `fetchSessions()` swallowed *every*
   error/timeout into `{ sessions: [] }`, and `loadSessions()` then treated that empty array as a
   successful result — **overwriting both the on-screen rail and the local cache with nothing.** A
   single slow query under DB load = "all my chats are gone." Now failure and empty are distinct
   types; a failure **never** wipes the cache and raises a "couldn't load — retry" affordance.
2. **Sign-out is now instant.** It awaited a GoTrue token-revoke network call (seconds under load)
   *before* clearing local state. Now local state clears first (Gate drops to login immediately),
   the revoke fires in the background with `scope:'local'`.
3. **Every network read is now bounded by a timeout.** `fetchHistory` / `fetchBriefing` /
   `fetchSessions` / `fetchModels` / `fetchSourcesStatus` had **no timeout** — a hung backend =
   infinite spinner. All now abort and degrade gracefully.

Auth deadlock fix and the timeout-safe count RPC are **preserved** (see Do-not-degrade below).

---

## Task 1 — Disappeared conversations (RESILIENCE + ROOT CAUSE)

### Root cause (with evidence)
`src/components/commandf/api.ts` (before):
```ts
export async function fetchSessions(): Promise<Session[]> {
  const r = await fetch(`${url}/sessions`, { headers: await authHeaders() })
    .then((x) => x.json()).catch(() => ({ sessions: [] }));   // ← ANY failure => []
  return r.sessions || [];
}
```
`src/components/CommandFPage.tsx` `loadSessions` (before):
```ts
const fresh = await fetchSessions().catch(() => null);
if (fresh) { setSessions(fresh); writeSessionsCache(userIdRef.current, fresh); }  // [] is truthy!
```
So under the transient Postgres statement-timeout (57014) the peer's bulk ingest was causing, a
`/sessions` timeout returned `[]`, `if (fresh)` passed (an empty array is truthy), and the code
**set the rail to empty AND persisted empty into `cf-sessions-<uid>`** — erasing the stale-while-
revalidate cache that was the whole safety net. That is the "disappeared conversations" symptom:
not data loss in the DB, a client that **couldn't tell a failure from an empty list.**

There is also an **identity-keying** dimension (email vs auth `sub`) that Agent B1 owns on the
backend. The frontend already sends the JWT (carrying `sub`) and keys its local cache on
`session.user.id` (the `sub`) — no frontend key change needed. This agent's job was the UI
resilience + re-fetch-on-sign-in, both done. See "Remaining human steps."

### Fixes (file + before/after)
- `api.ts`: added `fetchWithTimeout()` (AbortController + `RequestTimeoutError`), a `LoadResult<T>`
  discriminated union, and rewrote `fetchSessions()` to return
  `{ ok:true, data } | { ok:false, error }`. A 200 with `[]` is `ok:true` (a *real* empty history);
  an HTTP error, a 401, a network reject, or a timeout is `ok:false`. `fetchHistory` now has an 8s
  timeout and throws typed errors instead of hanging.
- `CommandFPage.tsx` `loadSessions`: **only `ok:true` may write the cache/rail.** On `ok:false` the
  cached list stays on screen and `sessionsError` is set. Added `historyError` state; `openSession`
  and the restore path no longer blank the thread on failure — they keep it and show a retry.
- `CommandFPage.tsx`: **re-fetch sessions on a genuine `SIGNED_IN`** (uid change only — ignores
  `TOKEN_REFRESHED` / same-user re-notifications so it doesn't fight the auth-deadlock fix). This is
  what makes conversations reappear the instant the backend's `sub`-keying takes effect.
- `Sidebar.tsx`: renders the retry affordance — "Couldn't load your conversations. [Retry]" when the
  list is empty *and* errored (never the silent "No conversations yet"), plus a subtle "Couldn't
  refresh — retry" chip when a cached list is shown but the last refresh failed.
- `CommandFPage.tsx` chat surface: a "Couldn't load this conversation — [Retry]" banner when
  `historyError` is set, instead of a blank/stale thread.

### The invariant, in one line
`FAILURE ≠ EMPTY`. A null/empty is only trusted when the response was a real 200; anything else is a
claim that gets a retry, never silent data loss.

---

## Task 2 — Slow sign-out (INSTANT)

### Root cause
`AuthContext.signOut` (before):
```ts
async function signOut() {
  await supabase.auth.signOut();            // ← GoTrue global revoke, seconds under load
  ...clear local state...                    // ← UI only updates AFTER the network call
}
```
The Gate routes on `session`; because state cleared only *after* the awaited revoke, the login
screen appeared only after the round-trip finished.

### Fix
`AuthContext.signOut` (after): clear `user`/`session`/`profileLoading`/`loadedUserIdRef` and the
persisted context **first** (Gate drops to login on the next tick), then fire
`supabase.auth.signOut({ scope:'local' })` in the background (`void`, `.catch` swallowed). `local`
scope avoids the global server round-trip; the local session is cleared and `SIGNED_OUT` still
fires. Sign-out is now bounded by a React re-render, not the network.

Trade-off (acceptable for this single-operator internal tool): `scope:'local'` doesn't revoke the
refresh token server-side. If global revoke is ever required, keep the optimistic clear and change
the background call to `scope:'global'` — the UI stays instant either way.

---

## Task 3 — Full load-latency audit + permanent fixes

Method: static trace of every feature's load path + the simulated-failure harness
(`scripts/sim_resilience.mjs`). The DB was not stressed by this agent (no paid runs), so absolute
"before" wall-times aren't measured live; the deltas below are the **structural** latency ceilings —
what the code *guarantees* now vs. what it allowed before.

| Surface | Before: where time went / worst case | After |
|---|---|---|
| **Initial app load** | Gate spins on `loading` (session check) only — already correct (getSession is local, ~0ms). `gaveUp` 10s backstop present. | Unchanged (kept). First paint never blocks on profile/data. |
| **Sign-in** | Session flips `loading=false` immediately; profile deferred + 8s cap. Correct. | Unchanged (kept). |
| **Sign-out** | **Blocked on GoTrue revoke — seconds under load.** | **Instant** (optimistic local clear; revoke backgrounded). |
| **Sessions list** | `fetch` with **no timeout** → hang; and any failure silently blanked rail + cache. | Bounded 6s; failure typed → keeps cache + retry, never blanks. |
| **Open a chat** | `fetchHistory` **no timeout** → infinite spinner on a slow query; failure blanked thread. | Bounded 8s; failure → keeps thread + retry banner. |
| **Knowledge panel / briefing** | `fetchBriefing` **no timeout**; count RPC already timeout-safe on backend. Sidecar retries once after 4s. | Bounded 10s; degrades to `null` (page works without it). Retry-once kept. |
| **Sidecar loader** | Two back-to-back `getSession()` reads (token, then uid). Independent fetches already `Promise.all`'d. | One `currentAuth()` read for both; parallelization kept. |
| **Model list** | `fetch` no timeout; already `.catch(()=>[])`. | Bounded 6s; composer falls back to default model. |
| **Deck / survey surfaces** | Poll-based with their own deadlines (240s deck, 3min upload) — already bounded; out of the persistence scope. | Left as-is (already bounded; no infinite spinner). |

**Timeout budgets** (in `api.ts`): lists/status `6s`, history `8s`, briefing `10s`. Chosen to sit
above p99 healthy latency but well under human patience, so a degraded backend fails *fast and
visibly* instead of hanging.

**Not changed on purpose:** the two back-to-back deck/survey pollers already have deadlines; the
Gate's session-only spinner + 10s `gaveUp` is correct and load-bearing (auth-deadlock fix); the
sidecar's `Promise.all` was already parallel.

---

## Verification evidence

### Build (the real gate)
```
> vite build
✓ 1794 modules transformed.
dist/assets/index-BQSMuSMH.js   659.95 kB │ gzip: 186.00 kB
✓ built in 1.29s
```
`tsc` reports the **same 10 pre-existing errors** as the untouched baseline commit `2ff59a3`
(LucideIcon prop-type noise in `quickActions`/`paletteCommands`, one unused `React` import in
`SourceCard.tsx`) — **this change adds zero new type errors** and Vite's production build is clean.
Fixing that baseline noise is out of scope for a persistence/perf task.

### Simulated slow/failing queries — `scripts/sim_resilience.mjs`
Re-implements the exact shipped `fetchWithTimeout` + `fetchSessions` `LoadResult` logic and the
`loadSessions` cache-write rule, driven against a mocked `fetch`:
```
A) 200 + []  -> {"ok":true,"data":[]}
  ✓ empty is ok:true with []
  ✓ empty does NOT raise the error banner
  ✓ a REAL empty legitimately clears the cache
B) HTTP 500  -> false HTTP 500
  ✓ HTTP 500 is ok:false (a failure, NOT empty)
  ✓ failure raises the retry banner
  ✓ CACHE UNTOUCHED on failure — chats do NOT disappear
C) slow      -> false RequestTimeoutError in 301ms
  ✓ slow query aborts as RequestTimeoutError (no infinite spinner)
  ✓ resolved in 301ms — bounded by the 300ms timeout, did NOT wait 5s
  ✓ CACHE UNTOUCHED on timeout — chats do NOT disappear
D) reject    -> false ECONNRESET
  ✓ network reject is ok:false
  ✓ CACHE UNTOUCHED on reject
RESULT: ALL RESILIENCE CASES PASS
```
Run it: `node scripts/sim_resilience.mjs`. This proves the UI-facing contract — a slow or failing
query degrades to a bounded, typed failure with a retry, and **never** blanks the conversation list
or spins forever.

---

## Do-not-degrade — confirmed intact
- **No awaited supabase call inside `onAuthStateChange`.** AuthContext's callback stays non-async
  (profile fetch deferred via `setTimeout(0)`); the new CommandFPage `onAuthStateChange` callback is
  also non-async and fires `loadSessions()` without awaiting — it never holds the navigator lock.
- **Gate routes on the SESSION, not the profile.** Unchanged.
- **Profile fetch keeps its 8s timeout;** `getSession()` still flips `loading=false` immediately.
- **Timeout-safe count RPC** (backend) untouched.
- **Sign-in does not depend on a heavy query.** Unchanged.
- **Query-error is never silently treated as empty-data.** This is now enforced by the `LoadResult`
  type at the API boundary.

---

## Remaining human steps (end-to-end persistence needs the backend deploy first)
The frontend is resilient now, but the *full* "logout → login → chats persist" guarantee depends on
Agent B1's backend keying change (sessions keyed on the stable auth `sub`, not email) being
deployed. To confirm end to end once B1 deploys:
1. Deploy the backend keying change (Agent B1) and, if any existing `commandf_sessions.user_id`
   rows are under an email or a stale id, run B1's idempotent migration so no history is orphaned.
2. In the app: sign in as `tbibas@actionistconsulting.com`, open/create a chat, **sign out**
   (should be instant), **sign back in** — the conversation list should reappear (it also re-fetches
   automatically on `SIGNED_IN`).
3. To exercise the resilience UI live, temporarily point `VITE_MODAL_COMMANDF_URL` at an
   unreachable host (or throttle in devtools): the sidebar shows "Couldn't load — Retry" and opening
   a chat shows the history retry banner — **never** an empty rail or an infinite spinner.

### Deferred / not in this workstream
- Backend `sub`-keying + any orphan-row migration (Agent B1).
- The 10 pre-existing `tsc` type-noise errors (LucideIcon prop types, unused `React`) — unrelated to
  perf/persistence; left untouched to keep the diff minimal.
- Bundle is 660kB (186kB gzip) in one chunk — a code-split would speed cold first-load, but it's a
  separate optimization from the hang/persistence work and out of scope here.
