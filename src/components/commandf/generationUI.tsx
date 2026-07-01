import { useState, useEffect } from 'react';
import { ArrowLeft, Download, Loader2, AlertCircle, FileWarning, RotateCcw, Check, Layers } from 'lucide-react';
import type { JobStatus } from './api';

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-0';
const MOTION = 'duration-fast ease-out-expo';
const INK_BTN = `bg-text-primary text-bg-primary hover:bg-text-primary/90 transition-colors ${MOTION} ${FOCUS}`;
const GHOST_BTN = `border border-border-light text-text-primary hover:bg-bg-tertiary transition-colors ${MOTION} ${FOCUS}`;

export function SurfaceHeader({
  icon: Icon, title, subtitle, onBack,
}: { icon: typeof ArrowLeft; title: string; subtitle: string; onBack: () => void }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className={`shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-control ${GHOST_BTN}`}
          aria-label="Back"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <Icon className="w-4 h-4 text-text-secondary shrink-0" strokeWidth={1.75} aria-hidden />
        <h1 className="text-[15px] font-medium tracking-tight text-text-primary leading-tight">{title}</h1>
      </div>
      <p className="text-body text-text-muted mt-1 ml-11">{subtitle}</p>
    </div>
  );
}

/** Honest preview note — shown when the backend endpoint isn't wired yet.
 *  Reads as a reassuring "goes live shortly" preview, with the endpoint kept as
 *  a subtle dev reference (title attribute + faint tag). */
// Internal contract: execution/commandf/UI_ENDPOINT_CONTRACTS.md
export function PendingNote({ endpoint }: { endpoint: string }) {
  return (
    <div className="mt-5 rounded-surface border border-border-light bg-bg-secondary/60 px-4 py-4 animate-slide-up">
      <div className="flex items-start gap-2.5">
        <span
          className="mt-0.5 inline-flex items-center justify-center w-5 h-5 shrink-0 rounded-full border border-border-hover"
          aria-hidden
        >
          <Loader2 className="w-2.5 h-2.5 text-text-muted" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-text-primary leading-snug">
            Preview: generation goes live shortly
          </p>
          <p className="mt-1 text-[12px] text-text-muted leading-relaxed">
            Everything you enter here is ready and runs unchanged the moment the pipeline is live.
            Nothing you write is lost.
          </p>
          <p className="mt-2" title={`Backend endpoint pending: ${endpoint}`}>
            <span className="eyebrow text-text-muted/70 font-num">{endpoint}</span>
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Working trace — an advancing "Completed N steps" affordance distilled from
 * Perplexity / Harvey. Steps below the active one read as done (check), the
 * current one spins, upcoming ones sit quiet. The final phase holds while the
 * job keeps polling — honest: it never claims completion the backend hasn't sent.
 *
 * When the backend sends a live `progress` string, it becomes the authoritative
 * status line — the canned `phases` timer is only the fallback while the backend
 * is silent. `progress` is optional and additive, so existing callers (Survey)
 * keep working unchanged.
 */
export function RunningPanel({
  label, phases, progress,
}: { label: string; phases?: string[]; progress?: string }) {
  const pool = phases && phases.length > 0 ? phases : [label];
  const [active, setActive] = useState(0);
  const live = progress?.trim();

  useEffect(() => {
    // When the backend is driving the status line we stop the local timer and
    // let it lead — no fabricated stepping over real progress.
    if (live) return;
    setActive(0);
    if (pool.length <= 1) return;
    const id = setInterval(() => {
      // Advance up to — but not past — the last step; it holds until the job resolves.
      setActive((prev) => Math.min(prev + 1, pool.length - 1));
    }, 2200);
    return () => clearInterval(id);
  }, [pool.length, live]);

  const done = Math.min(active, pool.length - 1);

  return (
    <div className="mt-5 rounded-surface border border-border-light bg-bg-secondary/60 px-4 py-3.5 animate-slide-up">
      <div className="flex items-center gap-2 mb-2.5">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-text-muted shrink-0 motion-reduce:animate-none" aria-hidden />
        <p className="eyebrow text-text-muted" aria-live="polite">
          {live ? 'Working' : `Working · step ${done + 1} of ${pool.length}`}
        </p>
      </div>

      {live ? (
        // Live backend line — first-class, calm, honest. No fake step counter.
        <p className="text-[13px] text-text-primary leading-relaxed" aria-live="polite">
          {live}
        </p>
      ) : (
        <ol className="space-y-2">
          {pool.map((step, i) => {
            const isDone = i < active;
            const isActive = i === active;
            return (
              <li key={i} className="flex items-center gap-2.5">
                <span
                  className={[
                    'inline-flex items-center justify-center w-4 h-4 shrink-0 rounded-full',
                    isDone ? 'bg-text-primary text-bg-primary'
                      : isActive ? 'border border-border-hover'
                      : 'border border-border-light',
                  ].join(' ')}
                  aria-hidden
                >
                  {isDone && <Check className="w-2.5 h-2.5" strokeWidth={3} />}
                  {isActive && <Loader2 className="w-2.5 h-2.5 animate-spin text-text-muted motion-reduce:animate-none" />}
                </span>
                <span
                  className={[
                    'text-[13px] transition-colors',
                    isActive ? 'text-text-primary' : isDone ? 'text-text-secondary' : 'text-text-muted',
                  ].join(' ')}
                >
                  {step}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

export function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mt-5 animate-slide-up">
      <div className="flex items-start gap-2">
        <AlertCircle className="w-4 h-4 text-error shrink-0 mt-0.5" aria-hidden />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] text-error leading-relaxed">{message}</p>
          <button
            onClick={onRetry}
            className={`mt-2 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-control text-caption ${GHOST_BTN}`}
          >
            <RotateCcw className="w-3.5 h-3.5" /> Try again
          </button>
        </div>
      </div>
    </div>
  );
}

/** Success state — the generated deck/compendium as a first-class object. */
export function ResultPanel({
  result, kindLabel, onReset,
}: { result: JobStatus; kindLabel: string; onReset: () => void }) {
  // Prefer a real title; otherwise fall back to a slide count as the object's name.
  const countLabel =
    typeof result.slide_count === 'number' ? `${result.slide_count} slides` : null;
  const heading = result.title || countLabel || `Generated ${kindLabel.toLowerCase()}`;

  return (
    <div className="mt-5 rounded-surface border border-border-light bg-bg-elevated overflow-hidden animate-slide-up shadow-float">
      <div className="px-5 py-4 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Check className="w-3 h-3 text-success shrink-0" strokeWidth={3} aria-hidden />
            <p className="eyebrow text-text-muted">{kindLabel} ready</p>
          </div>
          <h2 className="font-outfit text-[16px] font-semibold text-text-primary leading-snug truncate">
            {heading}
          </h2>
          <p className="mt-1 flex items-center gap-1.5 text-[13px] text-text-secondary">
            {(typeof result.slide_count === 'number' || (result.preview_urls && result.preview_urls.length > 0)) && (
              <Layers className="w-3.5 h-3.5 text-text-muted shrink-0" strokeWidth={1.75} aria-hidden />
            )}
            {result.title && countLabel && <span className="font-num">{countLabel}</span>}
            {typeof result.sheet_count === 'number' && (
              <span className="font-num">
                {result.title && countLabel ? ' · ' : ''}{result.sheet_count} sheets parsed
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onReset}
            className={`inline-flex items-center gap-1.5 px-2.5 py-2 rounded-control text-caption ${GHOST_BTN}`}
          >
            New
          </button>
        </div>
      </div>

      {/* Slide thumbnails — uniform aspect ratio regardless of returned dimensions.
          A quiet horizontal rail so decks of any length stay one calm row. */}
      {result.preview_urls && result.preview_urls.length > 0 && (
        <div className="px-5 border-t border-hairline pt-4">
          <div className="flex gap-2 overflow-x-auto scrollbar-thin pb-1 snap-x">
            {result.preview_urls.map((u, i) => (
              <div key={i} className="relative shrink-0 snap-start">
                <img
                  src={u}
                  alt={`Slide ${i + 1}`}
                  loading="lazy"
                  className="h-[88px] aspect-[16/9] object-cover rounded-control border border-border-light bg-bg-primary"
                />
                <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded-[4px] bg-bg-primary/85 text-[10px] font-num text-text-muted leading-none">
                  {i + 1}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Primary action — Download is the clear, dominant next step. */}
      {result.download_url && (
        <div className="px-5 py-4 border-t border-hairline">
          <a
            href={result.download_url}
            download
            className={`inline-flex w-full items-center justify-center gap-2 px-4 py-2.5 rounded-control text-body font-medium ${INK_BTN}`}
          >
            <Download className="w-4 h-4" /> Download .pptx
          </a>
        </div>
      )}

      {/* Surfaced [PLACEHOLDER: …] gaps the pipeline flagged */}
      {result.placeholders && result.placeholders.length > 0 && (
        <div className="px-5 pb-5 border-t border-hairline pt-4">
          <div className="flex items-center gap-1.5 mb-2">
            <FileWarning className="w-3.5 h-3.5 text-warning" aria-hidden />
            <p className="eyebrow text-text-muted">
              {result.placeholders.length} gap{result.placeholders.length === 1 ? '' : 's'} to fill
            </p>
          </div>
          <ul className="space-y-1">
            {result.placeholders.map((p, i) => (
              <li key={i} className="text-caption text-text-secondary leading-relaxed">{p}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
