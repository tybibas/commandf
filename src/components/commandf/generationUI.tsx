import { useState, useEffect } from 'react';
import { ArrowLeft, Download, Loader2, AlertCircle, FileWarning, RotateCcw, Check } from 'lucide-react';
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

/** Honest preview note — shown when the backend endpoint isn't wired yet. */
// Internal contract: execution/commandf/UI_ENDPOINT_CONTRACTS.md
export function PendingNote(_: { endpoint: string }) {
  return (
    <div className="mt-5 rounded-surface border border-border-light bg-bg-secondary px-4 py-3.5 animate-slide-up">
      <p className="text-[12px] text-text-muted leading-relaxed">
        This surface previews the flow; the backend pipeline isn't deployed yet. Your input is ready
        and works unchanged the moment it responds.
      </p>
    </div>
  );
}

/**
 * Working trace — an advancing "Completed N steps" affordance distilled from
 * Perplexity / Harvey. Steps below the active one read as done (check), the
 * current one spins, upcoming ones sit quiet. The final phase holds while the
 * job keeps polling — honest: it never claims completion the backend hasn't sent.
 */
export function RunningPanel({ label, phases }: { label: string; phases?: string[] }) {
  const pool = phases && phases.length > 0 ? phases : [label];
  const [active, setActive] = useState(0);

  useEffect(() => {
    setActive(0);
    if (pool.length <= 1) return;
    const id = setInterval(() => {
      // Advance up to — but not past — the last step; it holds until the job resolves.
      setActive((prev) => Math.min(prev + 1, pool.length - 1));
    }, 2200);
    return () => clearInterval(id);
  }, [pool.length]);

  const done = Math.min(active, pool.length - 1);

  return (
    <div className="mt-5 rounded-surface border border-border-light bg-bg-secondary/60 px-4 py-3.5 animate-slide-up">
      <div className="flex items-center gap-2 mb-2.5">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-text-muted shrink-0" aria-hidden />
        <p className="eyebrow text-text-muted" aria-live="polite">
          Working · step {done + 1} of {pool.length}
        </p>
      </div>
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
                {isActive && <Loader2 className="w-2.5 h-2.5 animate-spin text-text-muted" />}
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
  return (
    <div className="mt-5 rounded-surface border border-border-light bg-bg-elevated overflow-hidden animate-slide-up shadow-float">
      <div className="px-5 py-4 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Check className="w-3 h-3 text-success shrink-0" strokeWidth={3} aria-hidden />
            <p className="eyebrow text-text-muted">{kindLabel} ready</p>
          </div>
          <h2 className="font-outfit text-[16px] font-semibold text-text-primary leading-snug truncate">
            {result.title || 'Generated deck'}
          </h2>
          <p className="mt-1 text-[13px] text-text-secondary">
            {typeof result.slide_count === 'number' && <>{result.slide_count} slides</>}
            {typeof result.sheet_count === 'number' && <> · {result.sheet_count} sheets parsed</>}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onReset}
            className={`inline-flex items-center gap-1.5 px-2.5 py-2 rounded-control text-caption ${GHOST_BTN}`}
          >
            New
          </button>
          {result.download_url && (
            <a
              href={result.download_url}
              download
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-control text-body font-medium ${INK_BTN}`}
            >
              <Download className="w-4 h-4" /> Download .pptx
            </a>
          )}
        </div>
      </div>

      {/* Slide thumbnails — uniform aspect ratio regardless of returned dimensions */}
      {result.preview_urls && result.preview_urls.length > 0 && (
        <div className="px-5 pb-5 grid grid-cols-3 gap-2 border-t border-hairline pt-4">
          {result.preview_urls.slice(0, 6).map((u, i) => (
            <img
              key={i}
              src={u}
              alt={`Slide ${i + 1}`}
              loading="lazy"
              className="w-full aspect-[16/9] object-cover rounded-control border border-border-light bg-bg-primary"
            />
          ))}
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
