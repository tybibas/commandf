import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, Camera, UploadCloud, FileImage, X, Sparkles, ScanText, EyeOff, Layers,
} from 'lucide-react';
import {
  whiteboardIntake, WhiteboardIntakeFailedError, EndpointPendingError,
  WHITEBOARD_MAX_BYTES, type DeckOutline as Outline,
} from './api';
import { RunningPanel, ErrorPanel, PendingNote } from './generationUI';

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-0';
const MOTION = 'duration-fast ease-out-expo';
const PILL_BTN = `bg-structure text-structure-ink hover:bg-structure-hover active:scale-[0.98] transition-colors ${MOTION} ${FOCUS}`;

// Accepted straight off a phone camera roll. The backend's own supported set
// is png/jpeg/jpg/gif/webp (see whiteboard_intake.py's _MIME_TO_EXT) — it does
// NOT include HEIC. HEIC is still offered here because most mobile browsers
// (notably iOS Safari) re-encode a HEIC file to image/jpeg on upload anyway;
// on the rare device that uploads a true image/heic blob, the backend's own
// 422 ("Unsupported image type…") surfaces cleanly through the error state
// below with a retry affordance — never a silent failure.
const ACCEPT = 'image/png,image/jpeg,image/webp,image/heic,.heic';

const READING_PHASES = ['Reading your whiteboard…', 'Mapping it to slides…'];

const CAPABILITIES = [
  { icon: Camera, text: 'Snap a whiteboard or paper sketch' },
  { icon: ScanText, text: 'Reads headings, bullets, and rough charts' },
  { icon: EyeOff, text: "Never invents what it can't read" },
];

const isAcceptedImage = (f: File) =>
  /^image\/(png|jpe?g|webp|heic)$/i.test(f.type) || /\.heic$/i.test(f.name);

type Phase = 'idle' | 'reading' | 'pending' | 'error';

/**
 * Whiteboard/storyboard photo intake (Workstream C, Phase 4). A consultant
 * photographs a rough sketch of a deck; POST /whiteboard-intake transcribes
 * it (Claude vision) into the SAME DeckOutline shape /generate-deck/outline
 * returns. This component owns ONLY the photo -> outline step — once the
 * outline comes back, `onOutlineReady` hands it straight to DeckSurface's
 * existing outline-approval screen (initialOutline), so approval and the
 * build itself reuse that machinery completely unchanged.
 */
export default function WhiteboardIntake({
  onBack, onOutlineReady,
}: {
  onBack: () => void;
  onOutlineReady: (outline: Outline) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [hint, setHint] = useState('');
  const [dragging, setDragging] = useState(false);
  const [pickError, setPickError] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Revoke the object URL whenever the file changes or the component unmounts
  // — object URLs otherwise leak for the life of the document.
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const pick = (f: File | null) => {
    if (!f) return;
    if (!isAcceptedImage(f)) {
      setPickError('That doesn’t look like a photo. Use PNG, JPG, WEBP, or HEIC.');
      return;
    }
    if (f.size === 0) { setPickError('That file is empty.'); return; }
    if (f.size > WHITEBOARD_MAX_BYTES) {
      setPickError(`That photo is over the ${Math.round(WHITEBOARD_MAX_BYTES / (1024 * 1024))} MB limit.`);
      return;
    }
    setPickError('');
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  };

  const clearFile = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setPickError('');
  };

  const onDrop = (e: React.DragEvent) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files?.[0] ?? null); };

  const submit = async () => {
    if (!file || phase === 'reading') return;
    setPhase('reading'); setError('');
    try {
      const outline = await whiteboardIntake(file, hint.trim() || undefined);
      onOutlineReady(outline);
    } catch (e: unknown) {
      if (e instanceof EndpointPendingError) { setPhase('pending'); return; }
      const message = e instanceof WhiteboardIntakeFailedError
        ? e.message
        : (e as Error)?.message || 'Could not read that photo.';
      setError(message);
      setPhase('error');
    }
  };

  const idle = phase === 'idle';

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="min-h-full flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-4xl rounded-card border border-border-light bg-bg-elevated shadow-float overflow-hidden">
          <div className="px-5 pt-4">
            <button
              type="button" onClick={onBack} aria-label="Back"
              className={`inline-flex items-center justify-center w-8 h-8 rounded-control text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors ${MOTION} ${FOCUS}`}
            >
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            </button>
          </div>

          <div className="grid md:grid-cols-[minmax(0,0.4fr)_minmax(0,0.6fr)] md:min-h-[460px]">
            {/* Left rail */}
            <aside className="flex flex-col px-6 pt-3 pb-6 md:px-7 md:pb-7 md:border-r border-border-light">
              <span className="inline-flex items-center justify-center w-11 h-11 rounded-surface bg-bg-tertiary text-text-secondary" aria-hidden>
                <Camera className="w-5 h-5" strokeWidth={1.5} />
              </span>
              <h1 className="mt-4 font-display text-xl font-light text-text-primary leading-tight">Start from a whiteboard photo</h1>
              <p className="mt-2 text-body text-text-secondary leading-relaxed">
                Photograph a rough sketch of the deck and we&#39;ll transcribe it into an editable outline &mdash; same approval screen, same build.
              </p>
              <ul className="mt-auto pt-8 space-y-3">
                {CAPABILITIES.map(({ icon: Icon, text }) => (
                  <li key={text} className="flex items-center gap-2.5 text-caption text-text-secondary">
                    <Icon className="w-4 h-4 shrink-0 text-text-muted" strokeWidth={1.75} aria-hidden />
                    {text}
                  </li>
                ))}
              </ul>
            </aside>

            {/* Right rail */}
            <div className="flex flex-col px-6 pt-3 pb-6 md:px-7 md:pb-7">
              {idle ? (
                <>
                  <p className="eyebrow text-text-muted mb-2.5">Whiteboard photo</p>
                  {!file ? (
                    <button
                      type="button"
                      onClick={() => inputRef.current?.click()}
                      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={onDrop}
                      className={[
                        'w-full rounded-surface border border-dashed px-6 py-10 flex flex-col items-center justify-center text-center transition-colors', MOTION, FOCUS,
                        dragging ? 'border-text-primary/50 bg-bg-secondary' : 'border-border-light hover:border-border-hover bg-bg-secondary/40',
                      ].join(' ')}
                    >
                      <UploadCloud className={`w-7 h-7 mb-3 ${dragging ? 'text-text-secondary' : 'text-text-muted'}`} strokeWidth={1.5} aria-hidden />
                      <p className="text-base text-text-primary font-medium">{dragging ? 'Drop to upload' : 'Drop a whiteboard photo here'}</p>
                      <p className="mt-1 text-caption text-text-muted">or click to browse</p>
                      <p className="mt-1 text-caption text-text-muted">
                        PNG, JPG, WEBP, or HEIC &middot; up to {Math.round(WHITEBOARD_MAX_BYTES / (1024 * 1024))} MB
                      </p>
                    </button>
                  ) : (
                    <div className="w-full rounded-surface border border-border-light bg-bg-secondary overflow-hidden">
                      <div className="relative bg-bg-primary">
                        <img
                          src={previewUrl!}
                          alt="Whiteboard photo preview"
                          className="w-full max-h-64 object-contain"
                        />
                        <button
                          type="button"
                          onClick={clearFile}
                          aria-label="Remove photo"
                          className={`absolute top-2 right-2 w-7 h-7 inline-flex items-center justify-center rounded-control bg-bg-primary/85 text-text-secondary hover:text-text-primary transition-colors ${MOTION} ${FOCUS}`}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="px-4 py-3 flex items-center gap-3 border-t border-border-light">
                        <FileImage className="w-4 h-4 text-text-secondary shrink-0" strokeWidth={1.75} aria-hidden />
                        <div className="flex-1 min-w-0">
                          <p className="text-body text-text-primary truncate">{file.name}</p>
                          <p className="text-caption text-text-muted">{(file.size / (1024 * 1024)).toFixed(1)} MB</p>
                        </div>
                      </div>
                    </div>
                  )}
                  {pickError && <p className="mt-2 text-caption text-error">{pickError}</p>}
                  <input ref={inputRef} type="file" accept={ACCEPT} className="sr-only" onChange={(e) => pick(e.target.files?.[0] ?? null)} />

                  {/* Optional intent hint — folded into the vision prompt server-side. */}
                  <div className={`mt-5 ${!file ? 'opacity-50 pointer-events-none' : ''}`}>
                    <label htmlFor="wb-hint" className="eyebrow text-text-muted">What&#39;s this deck for? (optional)</label>
                    <input
                      id="wb-hint" value={hint} onChange={(e) => setHint(e.target.value)}
                      placeholder="e.g. a proposal for a distribution client" disabled={!file} aria-disabled={!file}
                      className={`mt-1.5 w-full rounded-surface border border-border bg-bg-secondary px-3.5 py-2.5 text-body-sm text-text-primary placeholder:text-text-muted outline-none focus:border-border-hover transition-colors ${MOTION} ${FOCUS} disabled:opacity-50`}
                    />
                  </div>

                  <div className="mt-auto pt-6 flex items-center justify-between gap-3">
                    <span className="text-caption text-text-muted truncate flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
                      {file ? file.name : 'Add a photo to begin'}
                    </span>
                    <button type="button" onClick={submit} disabled={!file}
                      className={`shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-pill text-caption font-medium disabled:opacity-40 ${PILL_BTN}`}>
                      <Sparkles className="w-4 h-4" strokeWidth={1.75} /> Read whiteboard &rarr;
                    </button>
                  </div>
                </>
              ) : phase === 'pending' ? (
                <PendingNote endpoint="POST /whiteboard-intake" />
              ) : phase === 'error' ? (
                <ErrorPanel message={error} onRetry={submit} />
              ) : (
                <RunningPanel label="Reading your whiteboard…" phases={READING_PHASES} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
