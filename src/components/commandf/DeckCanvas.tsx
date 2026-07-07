import { useEffect, useRef, useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { deckSlidePreviewUrl } from './api';

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-0';
const MOTION = 'duration-fast ease-out-expo';

/**
 * The right half of Deck Studio (contract §3.4). Renders the selected slide as
 * a full-size page floating on the studio tray, plus an 88px filmstrip below.
 *
 * Re-render contract: `deck_rev` only bumps at `batch_done` (server-authoritative,
 * R1/R5). When it does, this component re-fetches ONLY the slides carried in
 * `dirtySlides` via `deckSlidePreviewUrl(jobId, i, deckRev)` — untouched slides
 * keep their cached url, so a "tighten the summary" edit never re-downloads the
 * other four slides. `dirtySlides`/`previewUrls` are owned by DeckStudio (the
 * shared studio state); this component only reads them + reports fetch results
 * back up via `onSlidesUpdated`/`onDirtyResolved`.
 */
export default function DeckCanvas({
  jobId, deckRev, previewUrls, dirtySlides, onSlidesUpdated, onDirtyResolved,
  selectedSlide, onSelectSlide,
}: {
  jobId: string;
  deckRev: number;
  previewUrls: string[];
  dirtySlides: Set<number>;
  onSlidesUpdated: (updates: [number, string][]) => void;
  onDirtyResolved: (indices: number[]) => void;
  selectedSlide: number;
  onSelectSlide: (index: number) => void;
}) {
  // A slide whose targeted re-fetch failed keeps an error badge until it goes
  // dirty again (a retry) — visual-only, local to the canvas.
  const [erroredSlides, setErroredSlides] = useState<Set<number>>(new Set());
  const lastFetchedRev = useRef(deckRev);

  useEffect(() => {
    if (deckRev === lastFetchedRev.current) return;
    const rev = deckRev;
    const toFetch = Array.from(dirtySlides);
    lastFetchedRev.current = rev;
    if (toFetch.length === 0) return;
    let cancelled = false;
    (async () => {
      const settled = await Promise.allSettled(
        toFetch.map(async (i) => [i, await deckSlidePreviewUrl(jobId, i, rev)] as const),
      );
      if (cancelled) return;
      const updates: [number, string][] = [];
      const failed: number[] = [];
      settled.forEach((r, k) => {
        if (r.status === 'fulfilled') updates.push(r.value);
        else failed.push(toFetch[k]);
      });
      if (updates.length > 0) onSlidesUpdated(updates);
      onDirtyResolved(toFetch);
      if (failed.length > 0) setErroredSlides((prev) => new Set([...prev, ...failed]));
    })();
    return () => { cancelled = true; };
    // Only the rev transition drives a refetch — dirtySlides is read at the
    // moment the rev changes, not a separate trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckRev, jobId]);

  // A slide re-entering the dirty set (another edit, a retry) clears any stale
  // error badge — it's regenerating again, not still broken.
  useEffect(() => {
    if (dirtySlides.size === 0) return;
    setErroredSlides((prev) => {
      let changed = false;
      const next = new Set(prev);
      dirtySlides.forEach((i) => { if (next.delete(i)) changed = true; });
      return changed ? next : prev;
    });
  }, [dirtySlides]);

  const selected = Math.min(selectedSlide, Math.max(previewUrls.length - 1, 0));
  const selectedUrl = previewUrls[selected];
  const selectedDirty = dirtySlides.has(selected);

  return (
    // `min-w-0` mirrors BuildCanvas's containment fix (DeckBuildView.tsx): this
    // component is currently only used inside a `flex-1 min-w-0` wrapper (DeckStudio's
    // ready-mode branch), which already breaks the min-content chain — but declaring
    // it here too means this "twin" of BuildCanvas can't regress if that wrapper is
    // ever simplified away, since the filmstrip's shrink-0 tiles would otherwise
    // force this column past the viewport instead of scrolling.
    <div className="flex-1 min-h-0 min-w-0 flex flex-col bg-studio-canvas">
      <div className="flex-1 min-h-0 flex items-center justify-center px-8 py-6 overflow-auto scrollbar-thin">
        <div className="relative w-full max-w-3xl aspect-video shrink-0 rounded-image overflow-hidden bg-studio-slide border border-hairline shadow-float">
          {selectedUrl ? (
            <img
              src={selectedUrl}
              alt={`Slide ${selected + 1}`}
              className={`w-full h-full object-cover transition-opacity ${MOTION} ${selectedDirty ? 'opacity-50' : 'opacity-100'}`}
            />
          ) : (
            // The slide page is ALWAYS paper (studio-slide is never overridden in
            // dark theme), so its text must stay paper-ink regardless of theme —
            // `text-text-muted` would flip to the dark theme's light-on-dark ink
            // and go invisible on this surface. `--ink-500` is a theme-invariant
            // primitive (never redefined under .theme-quantifire).
            <div className="w-full h-full flex items-center justify-center text-caption" style={{ color: 'var(--ink-500)' }}>
              No slide selected
            </div>
          )}
          {selectedDirty && (
            <div className="absolute inset-0 flex items-center justify-center bg-studio-slide/40" aria-live="polite">
              <span className="inline-flex items-center gap-1.5 rounded-pill bg-bg-elevated/90 border border-border-light px-3 py-1.5 text-caption text-text-secondary shadow-float">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-structure motion-reduce:animate-none" aria-hidden />
                Re-rendering…
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-border-light bg-bg-primary px-4 py-3">
        <div
          role="listbox"
          aria-label="Slides"
          aria-activedescendant={`studio-thumb-${selected}`}
          className="flex items-center gap-2 overflow-x-auto scrollbar-thin snap-x pb-1"
        >
          {previewUrls.map((url, i) => (
            <SlideThumbTile
              key={i}
              url={url}
              index={i}
              selected={i === selected}
              generating={dirtySlides.has(i)}
              error={erroredSlides.has(i)}
              onSelect={() => onSelectSlide(i)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/** One filmstrip tile. States per DESIGN.md §3 (Deck studio hooks):
 *  selected = 2px structure border; generating = shimmer over a dimmed thumb;
 *  error = error-colored border + badge. */
function SlideThumbTile({
  url, index, selected, generating, error, onSelect,
}: {
  url: string; index: number; selected: boolean; generating: boolean; error: boolean; onSelect: () => void;
}) {
  const border = error
    ? 'border border-error'
    : selected
      ? 'border-2 border-structure'
      : 'border border-border-light hover:border-border-hover';
  return (
    <button
      type="button"
      id={`studio-thumb-${index}`}
      role="option"
      aria-selected={selected}
      aria-label={`Slide ${index + 1}${generating ? ' (re-rendering)' : ''}${error ? ' (failed to refresh)' : ''}`}
      onClick={onSelect}
      className={`relative shrink-0 snap-start h-[88px] aspect-[16/9] rounded-image overflow-hidden bg-bg-primary transition-colors ${MOTION} ${border} ${FOCUS}`}
    >
      <img
        src={url}
        alt=""
        loading="lazy"
        className={`w-full h-full object-cover ${generating ? 'opacity-40' : ''}`}
      />
      {generating && <span className="absolute inset-0 animate-shimmer" aria-hidden />}
      <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded-sm bg-bg-primary/85 text-micro font-mono text-text-muted leading-none tabular-nums">
        {index + 1}
      </span>
      {error && (
        <span className="absolute top-1 right-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-error text-white" aria-hidden>
          <AlertCircle className="w-2.5 h-2.5" strokeWidth={2.5} />
        </span>
      )}
    </button>
  );
}
