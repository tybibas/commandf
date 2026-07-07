import { Sparkles, Loader2, Check, AlertTriangle } from 'lucide-react';
import Composer from './Composer';

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-0';
const MOTION = 'duration-fast ease-out-expo';

/** One plan slot's live build status (§3.6). Index-addressed against the
 *  approved plan (`plan_total_slides` slots), independent of `slide_order`
 *  (which only becomes authoritative at `build_done`). */
export type BuildSlot = {
  index: number;
  status: 'pending' | 'planned' | 'authoring' | 'ready' | 'skipped';
  slideId?: string;
  slideTemplate?: string;
  lede?: string;
  label?: string;
  previewUrl?: string;
  error?: string;
};

const prettyTemplate = (t: string) => t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Build-mode narration column (left half of Deck Studio while `build_status`
 * is `"building"`). Visually mirrors DeckChat's transcript (Sparkles header,
 * assistant-style bubbles) so the transition into the interactive chat at
 * `build_done` reads as one surface, not a swap — but this column is driven by
 * the build stream's `narration`/`phase` events, not the edit-op protocol, so
 * it stays a separate, purpose-built component rather than overloading DeckChat
 * with a second event vocabulary.
 *
 * Phase 1: the composer is always disabled here (mid-build steering is §3.6
 * Phase 2, out of scope) — it's shown, quiet and inert, so the layout doesn't
 * jump the instant the real chat takes over post-build.
 */
export function BuildNarrationColumn({
  narration, phaseLabel, fatalError, builtCount, totalCount,
}: {
  narration: string[];
  phaseLabel: string | null;
  fatalError: string | null;
  builtCount: number;
  totalCount: number;
}) {
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-4 py-4 space-y-3">
        <div className="animate-slide-up">
          <div className="flex items-center gap-1.5 text-caption text-text-muted mb-1.5">
            <Sparkles className="w-3 h-3 text-accent-ink" strokeWidth={1.75} aria-hidden />
            <span>Command F</span>
          </div>
          <p className="text-body-sm text-text-primary leading-relaxed">
            Building your deck — watching it author {totalCount > 0 ? `${totalCount} slides` : 'the plan'} live.
          </p>
          {narration.length === 0 && !fatalError && (
            <p className="mt-1.5 flex items-center gap-1.5 text-caption text-text-muted" aria-live="polite">
              <Loader2 className="w-3 h-3 animate-spin text-structure motion-reduce:animate-none" aria-hidden />
              This can take a moment on the first slide.
            </p>
          )}
        </div>

        {narration.map((text, i) => (
          <p key={i} className="text-caption text-text-secondary leading-relaxed animate-slide-up">
            {text}
          </p>
        ))}

        {phaseLabel && !fatalError && (
          <p className="flex items-center gap-1.5 text-caption text-text-muted" aria-live="polite">
            <Loader2 className="w-3 h-3 animate-spin text-structure motion-reduce:animate-none" aria-hidden />
            {phaseLabel}
          </p>
        )}

        {fatalError && (
          <div className="flex items-start gap-2 rounded-control border border-error/40 bg-error/[0.06] px-2.5 py-2">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-error" aria-hidden />
            <p className="text-caption text-error leading-relaxed">{fatalError}</p>
          </div>
        )}
      </div>
      <div className="shrink-0 border-t border-border-light p-3">
        <Composer
          value=""
          onChange={() => {}}
          onSubmit={() => {}}
          placeholder={fatalError ? 'Build stalled — retry to continue.' : `Watching the build… (${builtCount}/${totalCount || '?'})`}
          disabled
          models={[]}
          model=""
          onModelChange={() => {}}
        />
      </div>
    </div>
  );
}

/** Build-mode canvas (right half): a skeleton grid of the plan's slots that
 *  fills in as `slide_ready` events arrive. Deliberately separate from
 *  DeckCanvas (which fetches PNGs by index off a bumped `deck_rev` — a concept
 *  that doesn't exist yet during a build, since `deck_rev` stays 0 until
 *  `build_done`); once the build finishes, DeckStudio hands off to the real
 *  DeckCanvas unchanged. */
export function BuildCanvas({
  slots, selected, onSelect,
}: {
  slots: BuildSlot[];
  selected: number;
  onSelect: (index: number) => void;
}) {
  const current = slots[Math.min(selected, Math.max(slots.length - 1, 0))];

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-studio-canvas">
      <div className="flex-1 min-h-0 flex items-center justify-center px-8 py-6 overflow-auto scrollbar-thin">
        <div className="relative w-full max-w-3xl aspect-video shrink-0 rounded-image overflow-hidden bg-studio-slide border border-hairline shadow-float">
          {current?.status === 'ready' && current.previewUrl ? (
            <img
              src={current.previewUrl}
              alt={`Slide ${current.index + 1}`}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-caption" style={{ color: 'var(--ink-500)' }}>
              {current?.status === 'skipped' ? (
                <>
                  <AlertTriangle className="w-4 h-4" aria-hidden />
                  <span>Slide {(current?.index ?? 0) + 1} was skipped{current?.error ? ` — ${current.error}` : ''}</span>
                </>
              ) : current?.status === 'authoring' || current?.status === 'planned' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden />
                  <span>{current?.label || `Authoring slide ${(current?.index ?? 0) + 1}…`}</span>
                </>
              ) : (
                <span>Not built yet</span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-border-light bg-bg-primary px-4 py-3">
        <div
          role="listbox"
          aria-label="Slides"
          className="flex items-center gap-2 overflow-x-auto scrollbar-thin snap-x pb-1"
        >
          {slots.map((s) => (
            <BuildSlotTile key={s.index} slot={s} selected={s.index === selected} onSelect={() => onSelect(s.index)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function BuildSlotTile({ slot, selected, onSelect }: { slot: BuildSlot; selected: boolean; onSelect: () => void }) {
  const border = slot.status === 'skipped'
    ? 'border border-error'
    : selected
      ? 'border-2 border-structure'
      : 'border border-border-light hover:border-border-hover';
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      aria-label={`Slide ${slot.index + 1} — ${slot.status}`}
      onClick={onSelect}
      className={`relative shrink-0 snap-start h-[88px] aspect-[16/9] rounded-image overflow-hidden bg-bg-tertiary transition-colors ${MOTION} ${border} ${FOCUS}`}
    >
      {slot.status === 'ready' && slot.previewUrl ? (
        <img src={slot.previewUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          {slot.status === 'authoring' || slot.status === 'planned' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-text-muted motion-reduce:animate-none" aria-hidden />
          ) : slot.status === 'skipped' ? (
            <AlertTriangle className="w-3.5 h-3.5 text-error" aria-hidden />
          ) : (
            <span className="animate-shimmer absolute inset-0" aria-hidden />
          )}
        </div>
      )}
      {slot.status === 'ready' && (
        <span className="absolute top-1 right-1 inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-verified/90 text-white" aria-hidden>
          <Check className="w-2 h-2" strokeWidth={3} />
        </span>
      )}
      <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded-sm bg-bg-primary/85 text-micro font-mono text-text-muted leading-none tabular-nums">
        {slot.index + 1}
      </span>
      {slot.slideTemplate && (
        <span className="sr-only">{prettyTemplate(slot.slideTemplate)}</span>
      )}
    </button>
  );
}
