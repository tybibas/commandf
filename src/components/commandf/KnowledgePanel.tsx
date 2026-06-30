import { useRef, useState } from 'react';
import {
  RefreshCw, Link2, FileText, UploadCloud, CheckCircle2, Loader2, Info, Cloud,
} from 'lucide-react';
import Sheet from '../ui/Sheet';
import { uploadDocument, EndpointPendingError, type Briefing, type SourcesStatus } from './api';
import { timeAgo } from './util';

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-0';
const MOTION = 'duration-fast ease-out-expo';
const GHOST_BTN = `border border-border-light text-text-primary hover:bg-bg-tertiary transition-colors ${MOTION} ${FOCUS}`;

const UPLOAD_ACCEPT = '.pdf,.docx,.pptx';
type UploadState = 'idle' | 'uploading' | 'done' | 'pending' | 'error';

export default function KnowledgePanel({
  open, onClose, briefing, sourcesStatus, syncing, onConnectDrive, onReindex,
}: {
  open: boolean;
  onClose: () => void;
  briefing: Briefing | null;
  sourcesStatus: SourcesStatus | null;
  syncing: boolean;
  onConnectDrive: () => void;
  onReindex: () => void;
}) {
  const k = briefing?.knowledge;
  const driveConnected = sourcesStatus?.google_drive ?? k?.drive_connected ?? false;
  const files = k?.files ?? [];

  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [uploadMsg, setUploadMsg] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const doUpload = async (f: File | null) => {
    if (!f) return;
    setUploadState('uploading'); setUploadMsg(f.name);
    try {
      await uploadDocument(f);
      setUploadState('done');
    } catch (e: any) {
      if (e instanceof EndpointPendingError) setUploadState('pending');
      else { setUploadState('error'); setUploadMsg(e?.message || 'Upload failed.'); }
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Knowledge base" width={460}>
      <div className="px-5 py-5 space-y-7">

        {/* Stat line */}
        <div className="flex items-stretch divide-x divide-border-light rounded-surface border border-border-light overflow-hidden">
          <div className="flex-1 px-4 py-3">
            <p className="eyebrow text-text-muted mb-1">Documents</p>
            <p className="font-num text-2xl tabular-nums leading-none text-text-primary">{(k?.doc_count ?? 0).toLocaleString()}</p>
          </div>
          <div className="flex-1 px-4 py-3">
            <p className="eyebrow text-text-muted mb-1">Passages</p>
            <p className="font-num text-2xl tabular-nums leading-none text-text-primary">{(k?.chunk_count ?? 0).toLocaleString()}</p>
          </div>
        </div>

        {/* Sources */}
        <section>
          <p className="eyebrow text-text-muted mb-2.5">Connected sources</p>
          <div className="rounded-surface border border-border-light divide-y divide-border-light">
            <div className="flex items-center gap-3 px-4 py-3">
              <Cloud className="w-4 h-4 text-text-secondary shrink-0" strokeWidth={1.75} aria-hidden />
              <div className="flex-1 min-w-0">
                <p className="text-body text-text-primary">Google Drive</p>
                <p className="text-caption text-text-muted">
                  {driveConnected
                    ? <>Connected · synced {timeAgo(k?.last_sync_at)}</>
                    : 'Not connected'}
                </p>
              </div>
              {driveConnected ? (
                <button
                  onClick={onReindex}
                  disabled={syncing}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-control text-caption ${GHOST_BTN} disabled:opacity-50`}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} /> {syncing ? 'Indexing…' : 'Re-index'}
                </button>
              ) : (
                <button onClick={onConnectDrive} className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-control text-caption ${GHOST_BTN}`}>
                  <Link2 className="w-3.5 h-3.5" /> Connect
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Upload */}
        <section>
          <p className="eyebrow text-text-muted mb-2.5">Add a document</p>
          {uploadState === 'idle' && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className={`w-full rounded-surface border border-dashed border-border-light hover:border-border-hover bg-bg-secondary/40 px-5 py-7 flex flex-col items-center text-center transition-colors ${MOTION} ${FOCUS}`}
            >
              <UploadCloud className="w-6 h-6 text-text-muted mb-2" strokeWidth={1.5} aria-hidden />
              <p className="text-body text-text-primary">Upload a file</p>
              <p className="text-caption text-text-muted mt-0.5">PDF, DOCX, or PPTX</p>
            </button>
          )}
          {uploadState === 'uploading' && (
            <div className="rounded-surface border border-border-light px-4 py-3.5 flex items-center gap-2.5">
              <Loader2 className="w-4 h-4 animate-spin text-text-muted" aria-hidden />
              <span className="text-body text-text-secondary truncate">Uploading {uploadMsg}…</span>
            </div>
          )}
          {uploadState === 'done' && (
            <div className="rounded-surface border border-border-light px-4 py-3.5 flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-success" aria-hidden />
              <span className="text-body text-text-secondary">Uploaded — indexing in the background.</span>
            </div>
          )}
          {uploadState === 'pending' && (
            <div className="rounded-surface border border-border-light bg-bg-secondary/60 px-4 py-3.5">
              <div className="flex items-start gap-2.5">
                <Info className="w-4 h-4 text-info shrink-0 mt-0.5" strokeWidth={1.75} aria-hidden />
                <p className="text-caption leading-relaxed text-text-secondary">
                  <span className="font-medium text-text-primary">Preview — upload endpoint pending.</span>{' '}
                  Direct upload is wired to <code className="font-mono text-micro bg-bg-tertiary rounded-control px-1 py-0.5">POST /upload</code> but
                  isn’t deployed yet. For now, add files to the connected Drive and re-index.
                  Contract: <code className="font-mono text-micro text-text-muted">UI_ENDPOINT_CONTRACTS.md</code>.
                </p>
              </div>
            </div>
          )}
          {uploadState === 'error' && (
            <div className="rounded-surface border border-border-light px-4 py-3.5">
              <p className="text-body text-error">{uploadMsg}</p>
              <button onClick={() => setUploadState('idle')} className={`mt-2 px-2.5 py-1.5 rounded-control text-caption ${GHOST_BTN}`}>Try again</button>
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={UPLOAD_ACCEPT}
            className="sr-only"
            onChange={(e) => doUpload(e.target.files?.[0] ?? null)}
          />
        </section>

        {/* Indexed files */}
        <section>
          <p className="eyebrow text-text-muted mb-2.5">Indexed files · {files.length}</p>
          {files.length === 0 ? (
            <p className="text-caption text-text-muted">Nothing indexed yet. Connect a source or upload a file.</p>
          ) : (
            <div className="space-y-0.5 max-h-72 overflow-y-auto scrollbar-thin -mx-1 px-1">
              {files.map((f, i) => (
                <div key={`${f.file_name}-${i}`} className="flex items-center gap-2.5 px-2 py-2 rounded-control hover:bg-bg-secondary transition-colors">
                  <FileText className="w-3.5 h-3.5 text-text-muted shrink-0" strokeWidth={1.5} aria-hidden />
                  <span className="flex-1 min-w-0 truncate text-caption text-text-secondary">{f.file_name}</span>
                  <span className="shrink-0 font-num text-micro text-text-muted tabular-nums">{f.chunks}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </Sheet>
  );
}
