import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Loader2, Presentation } from 'lucide-react';
import type { DeckOp, JobStatus, DeckChatHandlers, StudioSession, BuildStreamEvent } from './api';
import {
  undoDeckStream, fetchStudioSession, streamDeckBuild, resolveBuildPreviewUrl,
  deckSlidePreviewUrl, StreamAbortedError, generateDeckStatus,
  authedDownloadUrl, deckDownloadUrl,
} from './api';
import { SurfaceHeader } from './generationUI';
import { preloadPreviewImage } from './previewPool';
import DeckChat from './DeckChat';
import DeckCanvas from './DeckCanvas';
import DeckChangelog, { type ChangelogBatch } from './DeckChangelog';
import DeckGroundingBar from './DeckGroundingBar';
import { BuildNarrationColumn, BuildCanvas, type BuildSlot } from './DeckBuildView';

// Resume cursors survive a DeckStudio remount (surface nav away/back, a
// refresh-driven re-open) — keyed by job id, module-scoped so it outlives any
// one component instance. Cleared once a build reaches its terminal state.
const buildResumeCursors = new Map<string, number>();

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
  buildStatus = 'ready', planTotalSlides,
}: {
  onBack: () => void;
  jobId: string;
  // Reserved for the [LLM] authoring ops (rewrite_slide / add_slide / change_layout)
  // once the deck-agent lane is live — not read in this slice.
  approvedPlan: Record<string, unknown> | null;
  // `seed` (the completed job's JobStatus) is only available once a deck has
  // finished building. Omitted (null) when the studio mounts DURING a live
  // build (§3.6) — the build-mode view below never reads it.
  seed: JobStatus | null;
  clientSlug?: string;
  sessionId?: string | null;
  // §3.6 build-time copilot: 'building' mounts the studio against an in-flight
  // build job and watches it stream in; 'ready' (default) is today's post-build
  // editor, unchanged. `planTotalSlides` sizes the skeleton grid while building.
  buildStatus?: 'building' | 'ready';
  planTotalSlides?: number;
}) {
  const [deckRev, setDeckRev] = useState(seed?.deck_rev ?? (buildStatus === 'building' ? 0 : 1));
  const [previewUrls, setPreviewUrls] = useState<string[]>(seed?.preview_urls ?? []);
  const [selectedSlide, setSelectedSlide] = useState(0);

  // ── §3.6 build-mode state — live while `buildStatus==='building'`, then the
  // component permanently flips to the existing interactive studio below. ──
  const [building, setBuilding] = useState(buildStatus === 'building');
  const [slots, setSlots] = useState<BuildSlot[]>(() => (
    buildStatus === 'building'
      ? Array.from({ length: planTotalSlides ?? 0 }, (_, i) => ({ index: i, status: 'pending' as const }))
      : []
  ));
  const [buildNarration, setBuildNarration] = useState<string[]>([]);
  const [buildPhaseLabel, setBuildPhaseLabel] = useState<string | null>(null);
  const [buildFatalError, setBuildFatalError] = useState<string | null>(null);
  // §3.6.1: true while the tail is between a dropped connection and a
  // successful reconnect (or the reconnect cap). Distinct from `buildFatalError`
  // — a drop is expected/recoverable, not an error, so it gets its own
  // transient "retrying" copy instead of the misleading "stalled" label.
  const [buildReconnecting, setBuildReconnecting] = useState(false);
  // Bumped by `retryBuild` to force the build-tail effect below to re-run even
  // though `building` never flipped false on the fatal path (a plain
  // `setBuilding(true)` when it's already `true` is a no-op and would not
  // re-fire the effect).
  const [retryNonce, setRetryNonce] = useState(0);
  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  // Auto-follow the live build cursor in the main canvas until the user
  // manually clicks a thumbnail, which pins the view for the rest of this
  // build. Reset on build_start so each new build auto-follows again.
  const userPinnedRef = useRef(false);

  const patchSlot = useCallback((index: number, patch: Partial<BuildSlot>) => {
    setSlots((prev) => {
      if (index >= prev.length) {
        // A plan_total_slides mismatch (stale/omitted count) — grow to fit
        // rather than silently drop the event.
        const grown = [...prev];
        while (grown.length <= index) grown.push({ index: grown.length, status: 'pending' });
        grown[index] = { ...grown[index], ...patch };
        return grown;
      }
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }, []);

  const handleBuildEvent = useCallback((evt: BuildStreamEvent) => {
    switch (evt.event) {
      case 'build_start':
        userPinnedRef.current = false;
        if (evt.plan_total_slides > 0 && slotsRef.current.length !== evt.plan_total_slides) {
          setSlots(Array.from({ length: evt.plan_total_slides }, (_, i) => ({ index: i, status: 'pending' as const })));
        }
        break;
      case 'slide_planned':
        patchSlot(evt.index, { status: 'planned', slideId: evt.slide_id, slideTemplate: evt.slide_template, lede: evt.lede });
        break;
      case 'slide_authoring':
        patchSlot(evt.index, { status: 'authoring', label: evt.label });
        setBuildPhaseLabel(evt.label);
        if (!userPinnedRef.current) setSelectedSlide(evt.index);
        break;
      case 'phase':
        if (typeof evt.index === 'number') patchSlot(evt.index, { label: evt.label });
        setBuildPhaseLabel(evt.state === 'done' ? null : evt.label);
        break;
      case 'slide_ready':
        (async () => {
          const url = await resolveBuildPreviewUrl(evt.preview_url).catch(() => evt.preview_url);
          patchSlot(evt.index, { status: 'ready', slideId: evt.slide_id, previewUrl: url, label: undefined });
        })();
        break;
      case 'narration':
        setBuildNarration((prev) => [...prev, evt.text]);
        break;
      case 'error':
        setBuildPhaseLabel(null);
        if (evt.recoverable) {
          if (typeof evt.index === 'number') patchSlot(evt.index, { status: 'skipped', error: evt.message });
          setBuildNarration((prev) => [...prev, evt.message]);
        } else {
          setBuildFatalError(evt.message);
        }
        break;
      case 'heartbeat':
      case 'build_done':
        break; // build_done handled by the tail loop (carries deck_rev/slide_order)
    }
  }, [patchSlot]);

  // §3.6.1: reconnect budget for a dropped/reconnect_required tail before we
  // fall back to a status check + a genuinely fatal state.
  const MAX_RECONNECT_ATTEMPTS = 8;
  const RECONNECT_BACKOFF_MS = 750;

  // Drives the resumable build tail: reconnects with the last cursor seen on
  // any non-terminal stream end (idle timeout, drop, ASGI ceiling,
  // reconnect_required) until `build_done`, a confirmed backend `error`, or a
  // confirmed-complete deck via `/status`. Runs once per job while building,
  // and again whenever `retryBuild` bumps `retryNonce`.
  useEffect(() => {
    if (buildStatus !== 'building' || !building) return;
    let cancelled = false;
    const ctrl = new AbortController();

    // Never show a fatal error over a deck that actually finished (or is
    // still going) server-side — the build runs in the spawned job and
    // outlives the client's connection (§3.6.1). Returns true once this has
    // reached a settled outcome (recovered-complete or truly fatal); false
    // means "still building, keep reconnecting."
    const resolveViaStatus = async (fallbackMessage: string): Promise<boolean> => {
      let status;
      try {
        status = await generateDeckStatus(jobId);
      } catch {
        // Status check itself failed — don't hang forever on an unreachable
        // backend; surface the caller's message instead.
        setBuildFatalError(fallbackMessage);
        return true;
      }
      if (status.status === 'complete' || status.status === 'done') {
        const builtThrough = status.built_through ?? status.slide_count ?? slotsRef.current.length;
        const rev = status.deck_rev ?? 0;
        const urls = status.preview_urls?.length
          ? status.preview_urls
          : await Promise.all(
              Array.from({ length: builtThrough }, (_, i) =>
                deckSlidePreviewUrl(jobId, i, rev).then(preloadPreviewImage)),
            );
        setDeckRev(rev);
        setPreviewUrls(urls);
        buildResumeCursors.delete(jobId);
        setBuildReconnecting(false);
        setBuilding(false); // recovered — falls through to the interactive studio
        return true;
      }
      if (status.status === 'error') {
        setBuildFatalError(status.error || fallbackMessage);
        return true;
      }
      return false; // still 'queued' | 'running' | 'building' — keep reconnecting
    };

    (async () => {
      let cursor = buildResumeCursors.get(jobId) ?? -1;
      let reconnectAttempts = 0;
      while (!cancelled) {
        try {
          const { terminal, lastCursor } = await streamDeckBuild(jobId, {
            fromCursor: cursor, onEvent: handleBuildEvent, signal: ctrl.signal,
          });
          cursor = lastCursor;
          buildResumeCursors.set(jobId, cursor);
          if (terminal) {
            reconnectAttempts = 0;
            setBuildReconnecting(false);
            buildResumeCursors.delete(jobId);
            setDeckRev(terminal.deck_rev);
            setSlideOrder(terminal.slide_order);
            // Reconstruct the canvas's previewUrls DETERMINISTICALLY from the
            // terminal event, NOT from slotsRef: pages 1..built_through are exactly
            // the successfully-rendered slides. Reading slotsRef here dropped the
            // final slide(s) whenever the last slide_ready's DETACHED preview
            // resolve + React commit hadn't landed before this flush (the slot
            // still had previewUrl: undefined and got filtered out). `deckSlidePreviewUrl`
            // takes a 0-based index and emits the 1-based /preview/{n} path, so
            // iterate 0..built_through-1 for exactly built_through entries in page order.
            const urls = await Promise.all(
              Array.from({ length: terminal.built_through }, (_, i) =>
                deckSlidePreviewUrl(jobId, i, terminal.deck_rev).then(preloadPreviewImage)),
            );
            setPreviewUrls(urls);
            setBuilding(false);
            break;
          }
          if (cancelled) break;
          // A clean drop (network error, ERR_HTTP2_PROTOCOL_ERROR, idle
          // timeout, or a `reconnect_required` handoff) — reconnectable, not
          // fatal. A single drop must not end this loop.
          setBuildReconnecting(true);
          reconnectAttempts += 1;
          if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
            const settled = await resolveViaStatus('Lost connection to the build and could not reconnect.');
            if (settled) break;
            reconnectAttempts = 0; // status confirms it's still building — keep going
          }
          await new Promise((r) => setTimeout(r, RECONNECT_BACKOFF_MS));
        } catch (e) {
          if (e instanceof StreamAbortedError) break; // unmount or deliberate cancel
          // A confirmed non-recoverable `error` event from the backend. Still
          // confirm against `/status` before showing fatal — the build may
          // have raced to `build_done` right as the terminal error arrived.
          setBuildReconnecting(false);
          await resolveViaStatus((e as Error)?.message || 'The build hit an error.');
          break;
        }
      }
    })();

    return () => { cancelled = true; ctrl.abort(); };
    // `handleBuildEvent` is stable (only closes over the setter functions +
    // the slots ref), so it's intentionally left out to avoid re-subscribing
    // the stream on every slot patch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, buildStatus, building, retryNonce]);

  const retryBuild = useCallback(() => {
    setBuildFatalError(null);
    setBuildReconnecting(false);
    setRetryNonce((n) => n + 1);
  }, []);

  // ── P0-2: .pptx download control (Deck Studio has no export affordance
  // today — the only download button lives on the one-shot ResultPanel, which
  // Deck Studio never mounts). The backend 409s until the job is `complete`,
  // so only resolve the signed href once the build has finished (`!building`);
  // while building it's disabled rather than pointing at a URL that 409s.
  const [downloadHref, setDownloadHref] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!jobId || building) { setDownloadHref(null); return; }
    authedDownloadUrl(deckDownloadUrl(jobId)).then((href) => { if (alive) setDownloadHref(href); });
    return () => { alive = false; };
  }, [jobId, building]);

  const downloadButton = jobId ? (
    <a
      href={downloadHref ?? undefined}
      download
      aria-disabled={!downloadHref}
      aria-label="Download .pptx"
      title={building ? 'Finishing the build…' : 'Download .pptx'}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-control text-caption border border-border-light text-text-primary hover:bg-bg-tertiary active:scale-[0.98] transition-colors duration-fast ease-out-expo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-0 ${downloadHref ? '' : 'opacity-40 pointer-events-none'}`}
    >
      {building ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" strokeWidth={1.75} />}
      Download
    </a>
  ) : null;
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
  // Re-runs once when `building` flips false: the mid-build fetch reflects an
  // under-populated content_pool/style_exemplars, so the grounding must be
  // refreshed once the deck finishes building. Normal (already-built) mounts start
  // with building=false and so fetch exactly once.
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
  }, [jobId, building]);

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
        // Per-op undo (contract §3.3.1): stamp only the op `undone`; the BATCH flag
        // stays false — a single reverted op is NOT the whole batch reverted (that
        // is undoBatch). So the group keeps its "undo group" affordance.
        const ops = b.ops.map((o) => (o.op.op_id === opId ? { ...o, undone: true } : o));
        return { ...b, ops, depNoticeOpId: undefined };
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

  // ── §3.6 build-mode view — watch it build, chat input disabled ──────────
  // Rendered while `building` is true; once `build_done` lands, `building`
  // flips false permanently and this component falls through to the existing
  // interactive studio below (DeckChat + DeckCanvas, untouched).
  if (building) {
    const builtCount = slots.filter((s) => s.status === 'ready').length;
    const buildSubtitle = buildFatalError
      ? buildFatalError
      : buildReconnecting
        ? 'Lost connection to the build — retrying…'
        : `Building slide ${Math.min(builtCount + 1, slots.length || 1)} of ${slots.length || '…'}…`;
    return (
      <div className="relative flex-1 min-h-0 flex flex-col px-6 pt-4 md:px-7">
        <SurfaceHeader icon={Presentation} title="Deck studio" subtitle={buildSubtitle} onBack={onBack} actions={downloadButton} />
        <div className="flex-1 min-h-0 flex -mx-6 md:-mx-7 border-t border-border-light">
          <div className="w-[380px] shrink-0 min-w-0 flex flex-col border-r border-border-light bg-bg-primary">
            <BuildNarrationColumn
              narration={buildNarration}
              phaseLabel={buildPhaseLabel}
              fatalError={buildFatalError}
              builtCount={builtCount}
              totalCount={slots.length}
            />
            {buildFatalError && (
              <div className="shrink-0 border-t border-border-light px-4 py-3">
                <button
                  type="button"
                  onClick={retryBuild}
                  className="w-full rounded-control bg-structure text-structure-ink px-3 py-2 text-caption font-medium hover:bg-structure-hover transition-colors"
                >
                  Retry build
                </button>
              </div>
            )}
          </div>
          <BuildCanvas
            slots={slots}
            selected={selectedSlide}
            onSelect={(index) => {
              userPinnedRef.current = true;
              setSelectedSlide(index);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex-1 min-h-0 flex flex-col px-6 pt-4 md:px-7">
      <SurfaceHeader icon={Presentation} title={seed?.title || 'Deck studio'} subtitle={subtitle} onBack={onBack} actions={downloadButton} />

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
