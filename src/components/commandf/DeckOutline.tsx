import { useEffect, useState } from 'react';
import {
  ArrowLeft, Sparkles, ChevronUp, ChevronDown, Trash2, FileText, Loader2,
} from 'lucide-react';
import type { DeckOutline as Outline, OutlineSlide } from './api';
import SlideSkeleton from './SlideSkeleton';

// Stable per-slide id for React keys — avoids index-keying when slides reorder/delete.
type SlidewithId = OutlineSlide & { _stableId: string };
let _slideIdCounter = 0;
const withId = (s: OutlineSlide): SlidewithId => ({ ...s, _stableId: `slide-${++_slideIdCounter}` });

const CHIP = 'px-2.5 py-1 rounded-control text-caption font-medium capitalize transition-colors';

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-0';
const MOTION = 'duration-fast ease-out-expo';
const PILL_BTN = `bg-structure text-structure-ink hover:bg-structure-hover active:scale-[0.98] transition-colors ${MOTION} ${FOCUS}`;
const ICON_BTN = `inline-flex items-center justify-center w-7 h-7 rounded-control text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors ${MOTION} ${FOCUS} disabled:opacity-30 disabled:pointer-events-none`;

const prettyTemplate = (t: string) => t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * The Stage-1 outline, made editable. Governing thought + one card per slide
 * (lede, archetype, source chips). The consultant reorders / deletes / retitles,
 * then approves — the edited plan posts back verbatim as `approved_plan`, so the
 * expensive render never re-plans. Reorder/delete/retitle only (no dnd dep); the
 * backend accepts any edited plan shape (emit_plan schema).
 */
export default function DeckOutline({
  outline, onBack, onBuild, building,
}: {
  outline: Outline;
  onBack: () => void;
  onBuild: (approvedPlan: Record<string, unknown>) => void;
  building?: boolean;
}) {
  const [thought, setThought] = useState(outline.governing_thought);
  const [slides, setSlides] = useState<SlidewithId[]>(() => outline.slides.map(withId));
  const [view, setView] = useState<'storyline' | 'layout'>('storyline');
  const [focusIndex, setFocusIndex] = useState<number | null>(null);

  // Clicking a layout thumbnail jumps to its editable card in the storyline view.
  useEffect(() => {
    if (view !== 'storyline' || focusIndex == null) return;
    const el = document.getElementById(`sl-${focusIndex}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const clear = setTimeout(() => setFocusIndex(null), 1400);
    return () => clearTimeout(clear);
  }, [view, focusIndex]);

  const layoutCount = new Set(slides.map((s) => s.slide_template)).size;

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= slides.length) return;
    setSlides((prev) => { const next = [...prev]; [next[i], next[j]] = [next[j], next[i]]; return next; });
  };
  const remove = (i: number) => setSlides((prev) => prev.filter((_, k) => k !== i));
  const retitle = (i: number, lede: string) => setSlides((prev) => prev.map((s, k) => (k === i ? { ...s, lede } : s)));

  const build = () => {
    if (building || slides.length === 0) return;
    // Post the edited plan back in the emit_plan shape the backend expects.
    onBuild({
      governing_thought: thought.trim(),
      organizing_construct: outline.organizing_construct,
      lines_of_argument: outline.lines_of_argument,
      slides: slides.map((s) => ({
        slide_template: s.slide_template,
        lede: s.lede,
        evidence_ns: s.evidence_ns ?? [],
        must_show: s.must_show ?? '',
      })),
    });
  };

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="min-h-full flex items-start justify-center px-6 py-10">
        <div className="w-full max-w-3xl rounded-card border border-border-light bg-bg-elevated shadow-float overflow-hidden">
          {/* Header */}
          <div className="px-6 pt-4 pb-5 md:px-7 border-b border-border-light">
            <div className="flex items-center gap-3 mb-4">
              <button type="button" onClick={onBack} disabled={building} aria-label="Back to brief"
                className={`inline-flex items-center justify-center w-8 h-8 rounded-control text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors ${MOTION} ${FOCUS} disabled:opacity-40`}>
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              </button>
              <span className="text-caption text-text-muted font-medium">Outline · approve before building</span>
            </div>
            <label htmlFor="deck-thought" className="text-caption text-text-muted font-medium">The one thing this deck proves</label>
            <textarea id="deck-thought" value={thought} onChange={(e) => setThought(e.target.value)} rows={2} disabled={building}
              className={`mt-1.5 w-full resize-y rounded-surface border border-border bg-bg-secondary px-3.5 py-2.5 font-display text-lg font-light leading-snug text-text-primary outline-none focus:border-border-hover focus:bg-bg-elevated transition-colors ${MOTION} ${FOCUS} disabled:opacity-60`} />
            {outline.lines_of_argument.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {outline.lines_of_argument.map((l, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-control bg-bg-tertiary text-caption text-text-secondary">
                    <span className="font-mono tabular-nums text-micro text-text-muted">{i + 1}</span>{l}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Slides — Storyline (editable arguments) vs Layout (structure straw-man) */}
          <div className="px-6 py-5 md:px-7">
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="text-caption text-text-muted truncate">
                {prettyTemplate(outline.organizing_construct)} · {slides.length} slide{slides.length === 1 ? '' : 's'} · {layoutCount} layout{layoutCount === 1 ? '' : 's'} · grounded in {outline.sources_pool.length} source{outline.sources_pool.length === 1 ? '' : 's'}
              </p>
              <div className="shrink-0 inline-flex rounded-control border border-border-light p-0.5" role="tablist" aria-label="Outline view">
                {(['storyline', 'layout'] as const).map((v) => (
                  <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}
                    className={`${CHIP} ${FOCUS} ${view === v ? 'bg-structure text-structure-ink' : 'text-text-secondary hover:text-text-primary'}`}>
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {view === 'layout' ? (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {slides.map((s, i) => {
                  const grounded = (s.sources?.length ?? 0) > 0;
                  return (
                    <button key={s._stableId} type="button" onClick={() => { setView('storyline'); setFocusIndex(i); }}
                      className={`group text-left rounded-surface p-1.5 border border-transparent hover:border-border-light hover:bg-bg-secondary/40 transition-colors ${MOTION} ${FOCUS}`}>
                      <div className="relative">
                        <SlideSkeleton template={s.slide_template} />
                        <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded-sm bg-bg-primary/85 text-micro font-mono tabular-nums text-text-muted leading-none">{i + 1}</span>
                        <span className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${grounded ? 'bg-success' : 'bg-warning'}`}
                          title={grounded ? 'Source found at plan time' : 'No source yet'} aria-hidden />
                      </div>
                      <p className="mt-1.5 text-caption text-text-primary leading-snug line-clamp-2">{s.lede}</p>
                      <span className="text-micro text-text-muted">{prettyTemplate(s.slide_template)}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
            <div className="space-y-2">
            {slides.map((s, i) => (
              <div key={s._stableId} id={`sl-${i}`} className={`group rounded-surface border border-l-2 bg-bg-secondary/40 pl-3 pr-3.5 py-3 flex items-start gap-3 animate-slide-up transition-colors ${focusIndex === i ? 'border-border-light border-l-structure' : 'border-border-light'}`}>
                <span className="mt-0.5 shrink-0 inline-flex items-center justify-center w-7 h-6 rounded-control bg-bg-tertiary font-mono text-micro text-text-secondary" aria-hidden>
                  S{i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <input value={s.lede} onChange={(e) => retitle(i, e.target.value)} disabled={building} aria-label={`Slide ${i + 1} title`}
                    className={`w-full bg-transparent text-body text-text-primary leading-snug outline-none border-b border-transparent focus:border-border-hover transition-colors ${MOTION} disabled:opacity-60`} />
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm bg-bg-tertiary text-micro text-text-muted">{prettyTemplate(s.slide_template)}</span>
                    {(s.sources ?? []).slice(0, 3).map((src) => (
                      <span key={src.n} title={src.file} className="inline-flex items-center gap-1 max-w-[180px] px-1.5 py-0.5 rounded-sm border border-border-light text-micro text-text-muted">
                        <FileText className="w-3 h-3 shrink-0" strokeWidth={1.75} aria-hidden />
                        <span className="truncate">{src.file}</span>
                      </span>
                    ))}
                    {(s.sources?.length ?? 0) === 0 && (
                      <span className="text-micro text-warning">no source yet</span>
                    )}
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                  <button type="button" onClick={() => move(i, -1)} disabled={building || i === 0} className={ICON_BTN} aria-label="Move up"><ChevronUp className="w-4 h-4" /></button>
                  <button type="button" onClick={() => move(i, 1)} disabled={building || i === slides.length - 1} className={ICON_BTN} aria-label="Move down"><ChevronDown className="w-4 h-4" /></button>
                  <button type="button" onClick={() => remove(i)} disabled={building} className={ICON_BTN} aria-label="Delete slide"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
            </div>
            )}
          </div>

          {/* Build */}
          <div className="px-6 py-4 md:px-7 border-t border-border-light flex items-center justify-between gap-3">
            <span className="text-caption text-text-muted truncate">Edit the plan, then build. One render, no re-planning.</span>
            <button type="button" onClick={build} disabled={building || slides.length === 0}
              className={`shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-pill text-caption font-medium disabled:opacity-40 ${PILL_BTN}`}>
              {building ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" strokeWidth={1.75} />}
              {building ? 'Building…' : 'Build deck →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
