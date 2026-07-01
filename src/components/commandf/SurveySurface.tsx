import { useRef, useState } from 'react';
import { Table2, UploadCloud, FileSpreadsheet, X, Sparkles, ArrowLeft, BarChart3, FileText } from 'lucide-react';
import { generateSurveyCompendium, surveyCompendiumStatus } from './api';
import { useJob } from './useJob';
import { PendingNote, RunningPanel, ErrorPanel, ResultPanel } from './generationUI';

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-0';
const MOTION = 'duration-fast ease-out-expo';
const INK_BTN = `bg-text-primary text-bg-primary hover:bg-text-primary/90 transition-colors ${MOTION} ${FOCUS}`;

const ACCEPT = '.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const SURVEY_PHASES = ['Parsing the workbook…', 'Cross-tabbing responses…', 'Laying out slides…'];
const CAPABILITIES = [
  { icon: FileSpreadsheet, text: 'Reads every sheet in your workbook' },
  { icon: BarChart3, text: 'Charts, cross-tabs, and NPS, laid out' },
  { icon: FileText, text: 'Editable .pptx, ready to hand off' },
];

const isXlsx = (f: File) => /\.xlsx?$/i.test(f.name);

export default function SurveySurface({ onBack }: { onBack: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [dragging, setDragging] = useState(false);
  const [pickError, setPickError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const job = useJob(surveyCompendiumStatus);
  const busy = job.phase === 'starting' || job.phase === 'running';
  const idle = job.phase === 'idle';

  const pick = (f: File | null) => {
    if (!f) return;
    if (!isXlsx(f)) { setPickError('That is not an .xlsx. Drop an Excel workbook.'); return; }
    setPickError(''); setFile(f);
  };
  const onDrop = (e: React.DragEvent) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files?.[0] ?? null); };
  const generate = () => { if (!file || busy) return; job.run(() => generateSurveyCompendium(file, title.trim() || undefined)); };

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="min-h-full flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-4xl rounded-2xl border border-border-light bg-bg-elevated shadow-float overflow-hidden">
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
                <Table2 className="w-5 h-5" strokeWidth={1.5} />
              </span>
              <h1 className="mt-4 font-serif text-[24px] tracking-tight text-text-primary leading-tight">Survey compendium</h1>
              <p className="mt-2 text-body text-text-secondary leading-relaxed">
                Turn raw survey results into a clean slide compendium, straight from your workbook.
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
                  <p className="eyebrow text-text-muted mb-2.5">Survey workbook</p>
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
                      <p className="text-base text-text-primary font-medium">{dragging ? 'Drop to upload' : 'Drop an Excel workbook here'}</p>
                      <p className="mt-1 text-caption text-text-muted">or click to browse</p>
                      <p className="mt-1 text-caption text-text-muted">.xlsx, one sheet per survey question</p>
                    </button>
                  ) : (
                    <div className="w-full rounded-surface border border-border-light bg-bg-secondary px-4 py-3.5 flex items-center gap-3">
                      <FileSpreadsheet className="w-5 h-5 text-text-secondary shrink-0" strokeWidth={1.75} aria-hidden />
                      <div className="flex-1 min-w-0">
                        <p className="text-body text-text-primary truncate">{file.name}</p>
                        <p className="text-caption text-text-muted">{(file.size / 1024).toFixed(0)} KB</p>
                      </div>
                      <button onClick={() => { setFile(null); setPickError(''); }} disabled={busy}
                        className={`shrink-0 w-7 h-7 inline-flex items-center justify-center rounded-control text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors ${MOTION} ${FOCUS} disabled:opacity-50`} aria-label="Remove file">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                  {pickError && <p className="mt-2 text-caption text-error">{pickError}</p>}
                  <input ref={inputRef} type="file" accept={ACCEPT} className="sr-only" onChange={(e) => pick(e.target.files?.[0] ?? null)} />

                  {/* Deck title */}
                  <div className={`mt-5 ${!file ? 'opacity-50 pointer-events-none' : ''}`}>
                    <label htmlFor="survey-title" className="eyebrow text-text-muted">Deck title (optional)</label>
                    <input id="survey-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Survey Compendium" disabled={busy || !file} aria-disabled={!file}
                      className={`mt-1.5 w-full rounded-surface border border-border bg-bg-secondary px-3.5 py-2.5 text-[14px] text-text-primary placeholder:text-text-muted outline-none focus:border-border-hover transition-colors ${MOTION} ${FOCUS} disabled:opacity-50`} />
                  </div>

                  <div className="mt-auto pt-6 flex items-center justify-between gap-3">
                    <span className="text-caption text-text-muted truncate">{file ? file.name : 'Upload a workbook to begin'}</span>
                    <button type="button" onClick={generate} disabled={!file}
                      className={`shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-control text-[13px] font-medium disabled:opacity-40 ${INK_BTN}`}>
                      <Sparkles className="w-4 h-4" strokeWidth={1.75} /> Build compendium
                    </button>
                  </div>
                </>
              ) : job.phase === 'pending' ? (
                <PendingNote endpoint="POST /survey-compendium" />
              ) : job.phase === 'error' ? (
                <ErrorPanel message={job.error || 'Generation failed.'} onRetry={generate} />
              ) : job.phase === 'complete' && job.result ? (
                <ResultPanel result={job.result} kindLabel="Compendium" onReset={() => { job.reset(); setFile(null); setTitle(''); }} />
              ) : (
                <RunningPanel label="Parsing the workbook and laying out slides…" phases={SURVEY_PHASES} progress={job.result?.progress} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
