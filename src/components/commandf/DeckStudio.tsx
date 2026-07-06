import { useCallback, useEffect, useState } from 'react';
import { Presentation } from 'lucide-react';
import type { DeckOp, JobStatus } from './api';
import { SurfaceHeader } from './generationUI';
import DeckChat from './DeckChat';
import DeckCanvas from './DeckCanvas';

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Deck Studio — the split chat↔canvas surface (charter §C, contract
 * .agents/C2_DECKSTUDIO_CONTRACT.md). A built deck's `JobStatus` (carrying
 * `preview_urls` + `deck_rev`) seeds the session; every further edit flows
 * through DeckChat's streamed op batches, and DeckCanvas re-renders only the
 * slides a batch actually touched.
 *
 * State ownership: this component is the single source of truth for the
 * studio session (plain useState, matching DeckSurface's house pattern — no
 * reducer/context). DeckChat and DeckCanvas are both controlled: they read
 * from this state and report events upward via callbacks, never fetching each
 * other's data directly.
 */
export default function DeckStudio({
  onBack, jobId, approvedPlan: _approvedPlan, seed, clientSlug: _clientSlug, sessionId: _sessionId,
}: {
  onBack: () => void;
  jobId: string;
  // Reserved for the [LLM] authoring ops (rewrite_slide / add_slide / change_layout)
  // once the deck-agent lane is live — not read in this slice.
  approvedPlan: Record<string, unknown> | null;
  seed: JobStatus;
  clientSlug?: string;
  sessionId?: string | null;
}) {
  const [deckRev, setDeckRev] = useState(seed.deck_rev ?? 1);
  const [previewUrls, setPreviewUrls] = useState<string[]>(seed.preview_urls ?? []);
  const [selectedSlide, setSelectedSlide] = useState(0);
  const [ops, setOps] = useState<DeckOp[]>([]);
  const [phase, setPhase] = useState<{ label: string; state: 'active' | 'done' } | null>(null);
  const [sending, setSending] = useState(false);
  const [dirtySlides, setDirtySlides] = useState<Set<number>>(new Set());

  // Chat-to-canvas seam (DESIGN.md §3): the chat column starts full width, then
  // settles to 380px while the canvas fades/slides in +16px. Both driven by the
  // same `compact` flip so they read as one motion. Reduced motion → instant.
  const [compact, setCompact] = useState(reducedMotion);
  useEffect(() => {
    if (compact) return;
    const t = setTimeout(() => setCompact(true), 30);
    return () => clearTimeout(t);
    // Run once on mount — this is an entrance transition, not a live toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOp = useCallback((op: DeckOp) => setOps((prev) => [...prev, op]), []);

  const handleSlideDirty = useCallback((indices: number[]) => {
    setDirtySlides((prev) => {
      const next = new Set(prev);
      indices.forEach((i) => next.add(i));
      return next;
    });
  }, []);

  const handlePhase = useCallback((label: string, state: 'active' | 'done') => {
    setPhase(state === 'done' ? null : { label, state });
  }, []);

  // The mock/backend stream doesn't guarantee a trailing `phase: {state:'done'}`
  // for the last active phase before `batch_done` fires — clear it here too, or
  // the header subtitle would freeze on "Reworking the risk chart" forever.
  const handleBatchDone = useCallback((rev: number) => { setDeckRev(rev); setPhase(null); }, []);

  const handleSlidesUpdated = useCallback((updates: [number, string][]) => {
    setPreviewUrls((prev) => {
      const next = [...prev];
      updates.forEach(([i, url]) => { next[i] = url; });
      return next;
    });
  }, []);

  const handleDirtyResolved = useCallback((indices: number[]) => {
    setDirtySlides((prev) => {
      const next = new Set(prev);
      indices.forEach((i) => next.delete(i));
      return next;
    });
  }, []);

  const subtitle = phase
    ? phase.label
    : ops.length > 0
      ? `${ops.length} change${ops.length === 1 ? '' : 's'} applied so far. Every edit previews instantly.`
      : 'Chat to edit. Every change previews instantly.';

  return (
    <div className="flex-1 min-h-0 flex flex-col px-6 pt-4 md:px-7">
      <SurfaceHeader icon={Presentation} title={seed.title || 'Deck studio'} subtitle={subtitle} onBack={onBack} />
      <div className="flex-1 min-h-0 flex -mx-6 md:-mx-7 border-t border-border-light">
        <div
          style={{ width: compact ? '380px' : '100%' }}
          className="shrink-0 min-w-0 flex flex-col border-r border-border-light bg-bg-primary transition-[width] duration-slow ease-out-spring motion-reduce:transition-none"
        >
          <DeckChat
            jobId={jobId}
            sending={sending}
            onSendingChange={setSending}
            onOp={handleOp}
            onSlideDirty={handleSlideDirty}
            onPhase={handlePhase}
            onBatchDone={handleBatchDone}
          />
        </div>
        <div
          className={`flex-1 min-w-0 flex flex-col transition-all duration-slow ease-out-spring motion-reduce:transition-none motion-reduce:opacity-100 motion-reduce:translate-y-0 ${
            compact ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
        >
          <DeckCanvas
            jobId={jobId}
            deckRev={deckRev}
            previewUrls={previewUrls}
            dirtySlides={dirtySlides}
            onSlidesUpdated={handleSlidesUpdated}
            onDirtyResolved={handleDirtyResolved}
            selectedSlide={selectedSlide}
            onSelectSlide={setSelectedSlide}
          />
        </div>
      </div>
    </div>
  );
}
