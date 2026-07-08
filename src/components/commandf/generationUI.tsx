import { useState, useEffect, type ReactNode } from 'react';
import { ArrowLeft, Download, Loader2, AlertCircle, FileWarning, RotateCcw, Check, Layers, Wand2, X, ChevronDown } from 'lucide-react';
import { authedDownloadUrl, type JobStatus } from './api';

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-0';
const MOTION = 'duration-fast ease-out-expo';
const PILL_BTN = `bg-structure text-structure-ink hover:bg-structure-hover active:scale-[0.98] transition-colors ${MOTION} ${FOCUS}`;
const GHOST_BTN = `border border-border-light text-text-primary hover:bg-bg-tertiary transition-colors ${MOTION} ${FOCUS}`;

export function SurfaceHeader({
  icon: Icon, title, subtitle, onBack, actions,
}: { icon: typeof ArrowLeft; title: string; subtitle: string; onBack: () => void; actions?: ReactNode }) {
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
        <h1 className="flex-1 min-w-0 text-body font-medium tracking-tight text-text-primary leading-tight truncate">{title}</h1>
        {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
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
          <p className="text-caption font-medium text-text-primary leading-snug">
            Service momentarily unavailable
          </p>
          <p className="mt-1 text-caption text-text-muted leading-relaxed">
            We couldn't reach the generator just now. Everything you entered is saved. Try again in a moment.
          </p>
          <p className="mt-2" title={`Backend endpoint pending: ${endpoint}`}>
            <span className="text-micro text-text-muted font-mono tabular-nums">{endpoint}</span>
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Working trace — an agentic changelog distilled from Listen Labs's build
 * narration (research_competitor_corpus.md §Section 4A / D1), but designed:
 * a collapsible group header ("Building your deck" + step count) with each
 * completed step as a check row, the current step spinning, upcoming ones
 * quiet. The final phase holds while the job keeps polling — honest: it
 * never claims completion the backend hasn't sent.
 *
 * When the backend sends a live `progress` string, it becomes the authoritative
 * status line — the canned `phases` timer is only the fallback while the backend
 * is silent, and only real backend phase labels ever populate it (no per-slide
 * counter is fabricated; the backend's deck job is terminal-only). `progress`
 * is optional and additive, so existing callers (Survey) keep working unchanged.
 */
export function RunningPanel({
  label, phases, progress,
}: { label: string; phases?: string[]; progress?: string }) {
  const pool = phases && phases.length > 0 ? phases : [label];
  const [active, setActive] = useState(0);
  // Collapsed by default once the trace is long (>6 steps); short pools (the
  // common case here) start open so the narration reads immediately.
  const [collapsed, setCollapsed] = useState(pool.length > 6);
  const live = progress?.trim();
  const headerLabel = label.replace(/[…\s]+$/, '').trim();

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
  const collapsible = !live && pool.length > 1;

  return (
    <div className="mt-5 rounded-surface border border-border-light bg-bg-secondary/60 px-4 py-3.5 animate-slide-up">
      <button
        type="button"
        onClick={() => collapsible && setCollapsed((v) => !v)}
        aria-expanded={collapsible ? !collapsed : undefined}
        className={`w-full flex items-center gap-2 ${collapsible ? '' : 'pointer-events-none'} ${FOCUS} rounded-control`}
      >
        <Loader2 className="w-3.5 h-3.5 animate-spin text-text-muted shrink-0 motion-reduce:animate-none" aria-hidden />
        <p className="flex-1 min-w-0 truncate text-left text-caption text-text-muted font-medium" aria-live="polite">
          {live ? headerLabel : `${headerLabel} · ${pool.length} step${pool.length === 1 ? '' : 's'}`}
        </p>
        {collapsible && (
          <ChevronDown
            className={`w-3.5 h-3.5 text-text-muted shrink-0 transition-transform duration-fast ease-out-expo ${collapsed ? '-rotate-90' : ''}`}
            aria-hidden
          />
        )}
      </button>

      {live ? (
        // Live backend line — first-class, calm, honest. No fake step counter.
        <p className="mt-2.5 text-caption text-text-primary leading-relaxed" aria-live="polite">
          {live}
        </p>
      ) : collapsed ? (
        // Collapsed trace — surface only the current step so the header stays
        // scannable; expand to see the full changelog.
        <p className="mt-2.5 flex items-center gap-2.5 text-caption text-text-primary">
          <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin text-structure motion-reduce:animate-none" aria-hidden />
          {pool[done]}
        </p>
      ) : (
        <ol className="mt-2.5 space-y-2">
          {pool.map((step, i) => {
            const isDone = i < active;
            const isActive = i === active;
            return (
              <li key={i} className="flex items-center gap-2.5">
                <span className="inline-flex items-center justify-center w-3.5 h-3.5 shrink-0" aria-hidden>
                  {isDone && <Check className="w-3.5 h-3.5 text-verified" strokeWidth={2.5} />}
                  {isActive && <Loader2 className="w-3.5 h-3.5 animate-spin text-structure motion-reduce:animate-none" />}
                  {!isDone && !isActive && <span className="block w-1.5 h-1.5 rounded-full bg-border-hover" />}
                </span>
                <span
                  className={[
                    'text-caption transition-colors',
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
          <p className="text-caption text-error leading-relaxed">{message}</p>
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

/**
 * Iterative in-place slide editing (post-draft). When ResultPanel is given a
 * `slideEdit` handler, each slide thumbnail gets an Edit affordance that opens a
 * prompt box ("make this a stacked bar by segment", "tighten the title"). The
 * host (DeckSurface) runs the per-slide regenerate backend and re-renders. This
 * whole block is additive: without `slideEdit` the panel behaves exactly as
 * before (view/download only), so callers that don't wire editing are unaffected.
 */
export type SlideEdit = {
  // Regenerate one slide (0-based, matching preview order) from an instruction.
  onEdit: (slideIndex: number, instruction: string) => Promise<void> | void;
  // The slide currently regenerating (shows a spinner + disables inputs), if any.
  busyIndex?: number | null;
  // Optional short error surfaced under the active editor.
  error?: string | null;
};

function SlideThumb({
  url, index, slideEdit,
}: { url: string; index: number; slideEdit?: SlideEdit }) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState('');
  const busy = slideEdit?.busyIndex === index;

  const submit = async () => {
    const text = instruction.trim();
    if (!text || !slideEdit || busy) return;
    await slideEdit.onEdit(index, text);
    setInstruction('');
    setOpen(false);
  };

  return (
    <div className="relative shrink-0 snap-start group/thumb">
      <img
        src={url}
        alt={`Slide ${index + 1}`}
        loading="lazy"
        className={`h-[88px] aspect-[16/9] object-cover rounded-control border bg-bg-primary transition-colors ${busy ? 'border-structure opacity-60' : 'border-border-light'}`}
      />
      <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded-sm bg-bg-primary/85 text-micro font-mono text-text-muted leading-none tabular-nums">
        {index + 1}
      </span>
      {slideEdit && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={busy}
          aria-label={`Edit slide ${index + 1}`}
          className={`absolute top-1 right-1 inline-flex items-center justify-center w-5 h-5 rounded-sm bg-bg-primary/90 text-text-secondary hover:text-text-primary opacity-0 group-hover/thumb:opacity-100 focus-visible:opacity-100 transition-opacity ${FOCUS} disabled:opacity-40`}
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" strokeWidth={1.75} />}
        </button>
      )}

      {open && slideEdit && (
        <div className="absolute z-10 top-[92px] left-0 w-[240px] rounded-surface border border-border-hover bg-bg-elevated shadow-float p-2.5 animate-slide-up">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-caption text-text-muted font-medium">Edit slide {index + 1}</p>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-text-muted hover:text-text-primary">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }}
            rows={2}
            autoFocus
            disabled={busy}
            placeholder="e.g. make this a stacked bar by segment, or tighten the title"
            className={`w-full resize-y rounded-control border border-border bg-bg-secondary px-2 py-1.5 text-caption text-text-primary placeholder:text-text-muted outline-none focus:border-border-hover transition-colors ${FOCUS} disabled:opacity-60`}
          />
          {slideEdit.error && slideEdit.busyIndex === index && (
            <p className="mt-1 text-micro text-error leading-snug">{slideEdit.error}</p>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={busy || !instruction.trim()}
            className={`mt-1.5 inline-flex w-full items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-control text-caption font-medium disabled:opacity-40 ${PILL_BTN}`}
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" strokeWidth={1.75} />}
            {busy ? 'Regenerating…' : 'Regenerate slide'}
          </button>
        </div>
      )}
    </div>
  );
}

/** Success state — the generated deck/compendium as a first-class object. */
export function ResultPanel({
  result, kindLabel, onReset, secondaryAction, slideEdit,
}: { result: JobStatus; kindLabel: string; onReset: () => void; secondaryAction?: { label: string; onClick: () => void }; slideEdit?: SlideEdit }) {
  // Prefer a real title; otherwise fall back to a slide count as the object's name.
  const countLabel =
    typeof result.slide_count === 'number' ? `${result.slide_count} slides` : null;
  const heading = result.title || countLabel || `Generated ${kindLabel.toLowerCase()}`;

  // The .pptx endpoints authenticate via `?token=` (an <a download> can't send a
  // Bearer header). Resolve the signed href once the result arrives.
  const [downloadHref, setDownloadHref] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!result.download_url) { setDownloadHref(null); return; }
    authedDownloadUrl(result.download_url).then((href) => { if (alive) setDownloadHref(href); });
    return () => { alive = false; };
  }, [result.download_url]);

  return (
    <div className="mt-5 rounded-surface border border-border-light bg-bg-elevated overflow-hidden animate-slide-up shadow-float">
      <div className="px-5 py-4 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Check className="w-3 h-3 text-success shrink-0" strokeWidth={3} aria-hidden />
            <p className="text-caption text-text-muted font-medium">{kindLabel} ready</p>
          </div>
          <h2 className="font-display text-body font-medium text-text-primary leading-snug truncate">
            {heading}
          </h2>
          <p className="mt-1 flex items-center gap-1.5 text-caption text-text-secondary">
            {(typeof result.slide_count === 'number' || (result.preview_urls && result.preview_urls.length > 0)) && (
              <Layers className="w-3.5 h-3.5 text-text-muted shrink-0" strokeWidth={1.75} aria-hidden />
            )}
            {result.title && countLabel && <span className="font-mono tabular-nums">{countLabel}</span>}
            {typeof result.sheet_count === 'number' && (
              <span className="font-mono tabular-nums">
                {result.title && countLabel ? ' · ' : ''}{result.sheet_count} sheets parsed
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {secondaryAction && (
            <button
              onClick={secondaryAction.onClick}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-control text-caption ${GHOST_BTN}`}
            >
              {secondaryAction.label}
            </button>
          )}
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
          {slideEdit && (
            <p className="mb-2 text-micro text-text-muted">Hover a slide to edit it by prompt.</p>
          )}
          <div className="flex gap-2 overflow-x-auto overflow-y-visible scrollbar-thin pb-1 snap-x">
            {result.preview_urls.map((u, i) => (
              <SlideThumb key={i} url={u} index={i} slideEdit={slideEdit} />
            ))}
          </div>
        </div>
      )}

      {/* Primary action — Download is the clear, dominant next step. */}
      {result.download_url && (
        <div className="px-5 py-4 border-t border-hairline">
          <a
            href={downloadHref ?? undefined}
            download
            aria-disabled={!downloadHref}
            className={`inline-flex w-full items-center justify-center gap-2 px-4 py-2.5 rounded-pill text-body font-medium ${PILL_BTN} ${downloadHref ? '' : 'opacity-60 pointer-events-none'}`}
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
            <p className="text-caption text-text-muted font-medium">
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
