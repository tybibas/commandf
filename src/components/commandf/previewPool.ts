/**
 * Concurrency-limited pool for slide-preview loads (P2-A). The backend's
 * `/generate-deck/{id}/preview/{n}` handler calls `Volume.reload()`, which
 * raises `FAILED_PRECONDITION: there are open files` when another request's
 * `FileResponse` still holds a file open on the same Volume — so letting all
 * ~25 previews for a deck fire in one browser tick (Deck Studio's
 * build-done/status-recovery reconstruction) reliably triggers that race and
 * slides blank/error in the editor.
 *
 * `loading="lazy"` on the filmstrip `<img>` tags helps for genuinely
 * offscreen slides, but browsers preload lazy images well ahead of the
 * viewport on a fast connection, so it alone did not cap the burst (see
 * Actionist/COMMANDF_DEMO_RUN_PROBLEMS_2026-07-07.md P2-A). This pool caps
 * real concurrent HTTP requests at the source: callers preload each preview
 * URL through it before handing the URL to React, so the browser's HTTP
 * cache is already warm (throttled to POOL_LIMIT in flight at a time) by the
 * time the `<img>` tags render and request the same URL.
 *
 * P2-A follow-up (2026-07-10, prod logs): even with the concurrency cap, the
 * backend's `studio_render_job` rasterizes slides SERIALLY after a build
 * completes, so a slide near the back of the queue 404s (not built yet) on
 * its first request regardless of how many requests are in flight at once —
 * observed 11/27 slides 404 with 57-93s waits before the render caught up,
 * each then succeeding within 2-4s of a retry. A single attempt per slide
 * can never fix that; only a retry loop that outlasts the backend's render
 * tail can.
 */
const POOL_LIMIT = 4;
let active = 0;
const queue: Array<() => void> = [];

function acquire(): Promise<void> {
  if (active < POOL_LIMIT) {
    active += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => queue.push(resolve));
}

function release(): void {
  active -= 1;
  const next = queue.shift();
  if (next) {
    active += 1;
    next();
  }
}

/** Run `task` once a pool slot is free; always releases the slot after. */
export async function withPreviewPool<T>(task: () => Promise<T>): Promise<T> {
  await acquire();
  try {
    return await task();
  } finally {
    release();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** One `Image()` load attempt through the pool. Resolves `true`/`false` —
 * never rejects, never throws — so the retry loop below is the only place
 * that decides when to give up. */
function loadOnce(url: string): Promise<boolean> {
  return withPreviewPool(() => new Promise<boolean>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  }));
}

// Up to 6 retries after the first attempt (7 attempts total), waiting between
// each: 2s/4s/8s/16s/25s/30s ≈ 85s cumulative — comfortably past the 93s worst
// case observed in prod. The pool slot is released during each wait (loadOnce
// re-acquires per attempt) so a stuck slide doesn't hold up slides that ARE
// ready. Capped at 30s per wait so no single retry hangs disproportionately.
const RETRY_DELAYS_MS = [2000, 4000, 8000, 16000, 25000, 30000];

/**
 * Resolve `url` through the pool via a throwaway `Image()` load, warming the
 * browser cache for it, then return the same `url` unchanged. Retries with
 * backoff on a failed load (see header) — the backend renders slides
 * serially, so a 404 right after a build completes usually just means "not
 * rastered yet," not "broken." Each retry appends a cache-busting `_r=N`
 * param so a browser that cached the 404 response makes a fresh request
 * instead of replaying it.
 *
 * Never rejects — even after every retry is exhausted, this resolves the
 * ORIGINAL `url` (same contract as before), so one truly broken slide can't
 * hang a caller's `Promise.all` for the whole deck; the eventual `<img>` tag
 * just makes its own (likely still-failing) request, same as pre-retry
 * behavior. `startDelayMs` optionally staggers the FIRST attempt (e.g. a
 * small per-index offset on the initial fan-out) so 27 slides don't all make
 * their first request in the same tick.
 */
export async function preloadPreviewImage(url: string, startDelayMs = 0): Promise<string> {
  if (startDelayMs > 0) await sleep(startDelayMs);
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    const attemptUrl = attempt === 0 ? url : `${url}${url.includes('?') ? '&' : '?'}_r=${attempt}`;
    const ok = await loadOnce(attemptUrl);
    if (ok) return url;
    if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt]);
  }
  return url; // exhausted every retry — degrade to the plain <img> request, as before
}
