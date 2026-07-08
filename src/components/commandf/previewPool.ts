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

/**
 * Resolve `url` through the pool via a throwaway `Image()` load, warming the
 * browser cache for it, then return the same `url` unchanged. Never rejects —
 * a failed preload just means the eventual `<img>` tag makes its own request
 * (same as today), so one bad slide can't hang a `Promise.all` for the deck.
 */
export function preloadPreviewImage(url: string): Promise<string> {
  return withPreviewPool(() => new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(url);
    img.onerror = () => resolve(url);
    img.src = url;
  }));
}
