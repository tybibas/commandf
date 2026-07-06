import { useCallback, useEffect, useState } from 'react';
import { Presentation } from 'lucide-react';
import type { DeckOp, JobStatus, DeckChatHandlers, StudioSession } from './api';
import { undoDeckStream, fetchStudioSession } from './api';
import { SurfaceHeader } from './generationUI';
import DeckChat from './DeckChat';
import DeckCanvas from './DeckCanvas';
import DeckChangelog, { type ChangelogBatch } from './DeckChangelog';
import DeckGroundingBar from './DeckGroundingBar';

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Deck Studio — the split chat↔canvas surface (charter §C, contract
 * .agents/C2_DECKSTUDIO_CONTRACT.md). A built deck's `JobStatus` (carrying
 * `preview_urls` + `deck_rev`) seeds the session; every further edit flows
 * through DeckChat's streamed op batches, DeckCanvas re-renders only the slides a
 * batch touched, and DeckChangelog groups the batches for review + undo.
 *
 * State ownership: this component is the single source of truth for the studio
 * session (plain useState, matching DeckSurface's house pattern — no reducer/
 * context). The children are controlled: they read from this state and report
 * events upward, never fetching each other's data directly. Undo is server-
 * authoritative (R1) — the changelog's undo callbacks stream inverse ops through
 * the same reconcile path a forward edit uses.
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
  const [batches, setBatches] = useState<ChangelogBatch[]>([]);
  const [slideOrder, setSlideOrder] = useState<string[]>([]);
  const [phase, setPhase] = useState<{ label: string; state: 'active' | 'done' } | null>(null);
  const [sending, setSending] = useState(false);
  const [dirtySlides, setDirtySlides] = useState<Set<number>>(new Set());
  const [showChangelog, setShowChangelog] = useState(false);
  const [undoBusy, setUndoBusy] = useState<string | null>(null);
  const [studioSession, setStudioSession] = useState<StudioSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [activeFormat, setActiveFormat] = useState('');
  const [formatBusy, setFormatBusy] = useState(false);

  // B-reflection (§4): open the studio session for build-format options + grounding
  // provenance, and seed the authoritative slide_order (id→position) for the changelog.
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const s = await fetchStudioSession(jobId);
        if (!live) return;
        setStudioSession(s);
        setActiveFormat(s.active_format);
        if (s.slide_order?.length) setSlideOrder(s.slide_order);
      } catch {
        // Endpoint still landing / unreachable → the bar degrades gracefully (no
        // selector, no footer). The deck still edits; grounding is just not shown.
      } finally {
        if (live) setSessionLoading(false);
      }
    })();
    return () => { live = false; };
  }, [jobId]);

  const onSelectFormat = useCallback(async (format: string) => {
    setActiveFormat(format); // optimistic — the selector reflects immediately
    setFormatBusy(true);
    try {
      const s = await fetchStudioSession(jobId, format);
      setStudioSession(s);
      setActiveFormat(s.active_format);
    } catch {
      // Leave the optimistic selection; grounding just won't refresh.
    } finally {
      setFormatBusy(false);
    }
  }, [jobId]);

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

  // ── Forward-edit event handlers (from DeckChat) ──────────────────────────────
  const handleBatchStart = useCallback((batchId: string, summary: string) => {
    setBatches((prev) => [...prev, { batchId, summary, ops: [], undone: false }]);
  }, []);

  const handleOp = useCallback((op: DeckOp, status: 'applied' | 'failed', error?: string) => {
    setBatches((prev) => {
      const idx = prev.findIndex((b) => b.batchId === op.batch_id);
      if (idx === -1) return [...prev, { batchId: op.batch_id, summary: op.summary, ops: [{ op, status, error }], undone: false }];
      const next = [...prev];
      next[idx] = { ...next[idx], ops: [...next[idx].ops, { op, status, error }] };
      return next;
    });
  }, []);

  const dirtyFrom = useCallback((indices: number[]) => {
    setDirtySlides((prev) => {
      const next = new Set(prev);
      indices.forEach((i) => next.add(i));
      return next;
    });
  }, []);

  const handlePhase = useCallback((label: string, state: 'active' | 'done') => {
    setPhase(state === 'done' ? null : { label, state });
  }, []);

  // The stream doesn't guarantee a trailing `phase:{state:'done'}` before
  // `batch_done` — clear it here too, or the subtitle would freeze on the last label.
  const handleBatchDone = useCallback((_batchId: string, rev: number, order?: string[]) => {
    setDeckRev(rev);
    if (order) setSlideOrder(order);
    setPhase(null);
  }, []);

  // ── Canvas fetch results ─────────────────────────────────────────────────────
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

  // ── Undo (server-authoritative — inverse ops stream back the same way) ───────
  // Shared reconcile: an undo batch dirties + re-renders slides exactly like a
  // forward edit; wire indices are 1-based, the canvas uses 0-based positions.
  const undoHandlers: DeckChatHandlers = {
    onSlideDirty: (_ids, indices) => dirtyFrom(indices.map((i) => i - 1)),
    onPhase: handlePhase,
  };

  const undoBatch = useCallback(async (batchId: string) => {
    setUndoBusy(batchId);
    try {
      const result = await undoDeckStream(jobId, { batch_id: batchId }, undoHandlers);
      setDeckRev(result.deck_rev);
      if (result.slide_order) setSlideOrder(result.slide_order);
      setBatches((prev) => prev.map((b) =>
        b.batchId === batchId
          ? { ...b, undone: true, depNoticeOpId: undefined, ops: b.ops.map((o) => ({ ...o, undone: o.status === 'applied' ? true : o.undone })) }
          : b));
    } catch {
      // A non-recoverable failure leaves the group intact; the operator can retry.
    } finally {
      setUndoBusy(null);
      setPhase(null);
    }
    // undoHandlers is stable enough (only closes over stable setters/callbacks).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const undoOp = useCallback(async (batchId: string, opId: string) => {
    setUndoBusy(batchId);
    let recoverable = false;
    try {
      const result = await undoDeckStream(
        jobId, { op_id: opId },
        { ...undoHandlers, onError: (_m, r) => { recoverable = r; } },
      );
      setDeckRev(result.deck_rev);
      if (result.slide_order) setSlideOrder(result.slide_order);
      setBatches((prev) => prev.map((b) => {
        if (b.batchId !== batchId) return b;
        const ops = b.ops.map((o) => (o.op.op_id === opId ? { ...o, undone: true } : o));
        const allDone = ops.every((o) => o.undone || o.status === 'failed');
        return { ...b, ops, undone: allDone, depNoticeOpId: undefined };
      }));
    } catch {
      // Dependent op the backend can't isolate → steer to a whole-group undo.
      if (recoverable) {
        setBatches((prev) => prev.map((b) => (b.batchId === batchId ? { ...b, depNoticeOpId: opId } : b)));
      }
    } finally {
      setUndoBusy(null);
      setPhase(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const appliedChanges = batches.reduce(
    (n, b) => n + (b.undone ? 0 : b.ops.filter((o) => o.status === 'applied' && !o.undone).length), 0);

  const subtitle = phase
    ? phase.label
    : appliedChanges > 0
      ? `${appliedChanges} change${appliedChanges === 1 ? '' : 's'} applied so far. Every edit previews instantly.`
      : 'Chat to edit. Every change previews instantly.';

  return (
    <div className="relative flex-1 min-h-0 flex flex-col px-6 pt-4 md:px-7">
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
            onBatchStart={handleBatchStart}
            onOp={handleOp}
            onSlideDirty={dirtyFrom}
            onPhase={handlePhase}
            onBatchDone={handleBatchDone}
          />
        </div>
        <div
          className={`flex-1 min-w-0 flex flex-col transition-all duration-slow ease-out-spring motion-reduce:transition-none motion-reduce:opacity-100 motion-reduce:translate-y-0 ${
            compact ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
        >
          <DeckGroundingBar
            session={studioSession}
            loading={sessionLoading}
            activeFormat={activeFormat}
            onSelectFormat={onSelectFormat}
            formatBusy={formatBusy}
            changesCount={appliedChanges}
            changelogOpen={showChangelog}
            onToggleChangelog={() => setShowChangelog(true)}
          />
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
        {showChangelog && (
          <DeckChangelog
            batches={batches}
            slideOrder={slideOrder}
            busyBatchId={undoBusy}
            onUndoBatch={undoBatch}
            onUndoOp={undoOp}
            onClose={() => setShowChangelog(false)}
          />
        )}
      </div>
    </div>
  );
}
