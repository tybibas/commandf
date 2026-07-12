import { useCallback, useEffect, useState } from 'react';
import { Download, Layers, Presentation, RefreshCw } from 'lucide-react';
import { SurfaceHeader } from './generationUI';
import { timeAgo } from './util';
import {
  fetchDeckBuilds, authedDownloadUrl, deckDownloadUrl, EndpointPendingError,
  type DeckBuild,
} from './api';

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-0';
const MOTION = 'duration-fast ease-out-expo';

/** Status chip tokens — mirrors the `JobStatus['status']` union. `queued`/
 *  `running` read as "still building" (structure/neutral), `complete`/`done`
 *  as success, `error` as error. Nothing here is fabricated — every label is
 *  read straight from the backend's `status` field. */
function statusChip(status: DeckBuild['status']) {
  switch (status) {
    case 'complete':
    case 'done':
      return { label: 'Ready', className: 'text-success bg-success/[0.10]' };
    case 'running':
    case 'queued':
      return { label: 'Building…', className: 'text-text-secondary bg-bg-tertiary' };
    case 'error':
      return { label: 'Failed', className: 'text-error bg-error/[0.08]' };
    default:
      return { label: status, className: 'text-text-secondary bg-bg-tertiary' };
  }
}

function DeckGlyph() {
  // Clean deck placeholder — no thumbnail backend exists yet (per spec: "no
  // new backend for thumbnails"), so this reads as a calm icon tile rather
  // than a broken image or a fake preview.
  return (
    <span
      aria-hidden
      className="shrink-0 inline-flex items-center justify-center w-14 h-10 rounded-control bg-bg-tertiary text-text-muted"
    >
      <Presentation className="w-5 h-5" strokeWidth={1.5} />
    </span>
  );
}

function DeckBuildRow({
  build, onOpenInStudio, opening,
}: {
  build: DeckBuild;
  onOpenInStudio: (build: DeckBuild) => void;
  opening: boolean;
}) {
  const [downloadHref, setDownloadHref] = useState<string | null>(null);
  const chip = statusChip(build.status);
  const canDownload = build.artifact_available !== false && (build.status === 'complete' || build.status === 'done');

  useEffect(() => {
    let alive = true;
    if (!canDownload) { setDownloadHref(null); return; }
    authedDownloadUrl(deckDownloadUrl(build.job_id)).then((href) => { if (alive) setDownloadHref(href); });
    return () => { alive = false; };
  }, [build.job_id, canDownload]);

  const title = build.title || build.prospect_company || 'Untitled deck';

  return (
    <div className="group flex items-center gap-3 rounded-surface border border-border-light bg-bg-secondary px-3.5 py-3 hover:border-border-hover hover:bg-bg-tertiary transition-colors">
      <DeckGlyph />
      <div className="flex-1 min-w-0">
        <p className="truncate text-body-sm font-medium text-text-primary">{title}</p>
        <p className="mt-0.5 flex items-center gap-2 text-micro text-text-muted">
          {build.prospect_company && build.title && (
            <span className="truncate">{build.prospect_company}</span>
          )}
          <span className="font-mono">{timeAgo(build.created_at)}</span>
          {typeof build.slide_count === 'number' && (
            <span className="font-mono">{build.slide_count} slide{build.slide_count === 1 ? '' : 's'}</span>
          )}
        </p>
      </div>
      <span className={`shrink-0 inline-flex items-center h-5 px-2 rounded-control text-micro font-medium ${chip.className}`}>
        {chip.label}
      </span>
      <a
        href={downloadHref ?? undefined}
        download
        aria-disabled={!downloadHref}
        aria-label="Download .pptx"
        title="Download .pptx"
        onClick={(e) => { if (!downloadHref) e.preventDefault(); }}
        className={`shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-control text-text-secondary hover:text-text-primary hover:bg-bg-primary transition-colors ${MOTION} ${FOCUS} ${downloadHref ? '' : 'opacity-40 pointer-events-none'}`}
      >
        <Download className="w-3.5 h-3.5" strokeWidth={1.75} />
      </a>
      <button
        type="button"
        onClick={() => onOpenInStudio(build)}
        disabled={opening}
        className={`shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-control bg-structure text-structure-ink text-caption font-medium hover:bg-structure-hover active:scale-[0.98] transition-colors ${MOTION} ${FOCUS} disabled:opacity-50 disabled:pointer-events-none`}
      >
        <Layers className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden />
        Open in studio
      </button>
    </div>
  );
}

/**
 * Deck library — a chat-history-style list of past deck builds. Opening one
 * drives the SAME session→job rehydration path the "Resume deck" chip uses
 * (see CommandFPage's `openBuildInStudio`), so the filmstrip + copilot land
 * back exactly where a normal "Edit in studio →" hand-off would.
 */
export default function DeckLibrary({
  onBack, onOpenInStudio,
}: {
  onBack: () => void;
  onOpenInStudio: (build: DeckBuild) => void | Promise<void>;
}) {
  const [builds, setBuilds] = useState<DeckBuild[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'pending' | 'error'>('loading');
  const [openingJobId, setOpeningJobId] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let live = true;
    setState((s) => (builds.length ? s : 'loading'));
    fetchDeckBuilds()
      .then((data) => { if (live) { setBuilds(data); setState('ready'); } })
      .catch((e) => {
        if (!live) return;
        // 404/501 (backend lane not deployed yet) reads as a quiet "no decks
        // yet" rather than an error banner — the endpoint being unreachable
        // isn't the operator's problem to fix.
        setState(e instanceof EndpointPendingError ? 'pending' : 'error');
      });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce]);

  const reload = () => setNonce((n) => n + 1);

  const handleOpen = useCallback(async (build: DeckBuild) => {
    if (openingJobId) return;
    setOpeningJobId(build.job_id);
    try {
      await onOpenInStudio(build);
    } finally {
      setOpeningJobId(null);
    }
  }, [onOpenInStudio, openingJobId]);

  return (
    <div className="flex-1 min-h-0 flex flex-col px-6 pt-4 md:px-7">
      <SurfaceHeader icon={Layers} title="Decks" subtitle="Every deck you've built, newest first." onBack={onBack} />

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
        <div className="max-w-2xl mx-auto pb-12 space-y-2">
          {state === 'loading' && (
            <div className="space-y-2" aria-busy>
              {[0, 1, 2].map((i) => <div key={i} className="h-16 w-full rounded-surface skeleton" />)}
            </div>
          )}

          {state === 'error' && (
            <div className="mt-8 flex flex-col items-center text-center gap-2">
              <p className="text-body text-text-secondary">Couldn't load your decks.</p>
              <button
                type="button"
                onClick={reload}
                className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-control border border-border-light text-caption text-text-primary hover:bg-bg-tertiary transition-colors ${MOTION} ${FOCUS}`}
              >
                <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden />
                Retry
              </button>
            </div>
          )}

          {(state === 'pending' || (state === 'ready' && builds.length === 0)) && (
            <div className="mt-12 flex flex-col items-center text-center gap-2">
              <span className="inline-flex items-center justify-center w-11 h-11 rounded-surface bg-bg-tertiary text-text-secondary" aria-hidden>
                <Presentation className="w-5 h-5" strokeWidth={1.5} />
              </span>
              <p className="text-body font-medium text-text-primary">No decks yet</p>
              <p className="text-body-sm text-text-muted max-w-xs">
                Decks you build will show up here so you can reopen and keep editing them.
              </p>
            </div>
          )}

          {state === 'ready' && builds.length > 0 && (
            builds.map((b) => (
              <DeckBuildRow key={b.job_id} build={b} onOpenInStudio={handleOpen} opening={openingJobId === b.job_id} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
