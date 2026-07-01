import { useState } from 'react';
import {
  Presentation, Sparkles, ArrowLeft, ArrowUpRight, Database, Layers, FileText,
} from 'lucide-react';
import { generateDeck, generateDeckStatus } from './api';
import { useJob } from './useJob';
import { PendingNote, RunningPanel, ErrorPanel, ResultPanel } from './generationUI';

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-0';
const MOTION = 'duration-fast ease-out-expo';
const INK_BTN = `bg-text-primary text-bg-primary hover:bg-text-primary/90 transition-colors ${MOTION} ${FOCUS}`;

// Grounded in what the engine actually produces (POST /generate + deliverable_type).
const TYPES = [
  { id: '', label: 'Auto-detect' },
  { id: 'proposal', label: 'Proposal' },
  { id: 'engagement_recap', label: 'Engagement recap' },
  { id: 'pov_memo', label: 'POV memo' },
  { id: 'case_study', label: 'Case study' },
];

// One targeted, complete example — names the audience, the angle, and the past work.
const EXAMPLE =
  'A 90-day operating-model review for a mid-market insurer CFO. Lead with the value-creation thesis from our Cardinal Mutual work, then the workplan and the team.';

const DECK_PHASES = [
  'Drafting the storyline…',
  'Pulling evidence from past work…',
  'Laying out slides…',
];

const CAPABILITIES = [
  { icon: Database, text: 'Grounded in your indexed work' },
  { icon: Layers, text: 'Partner-grade storyline, not just slides' },
  { icon: FileText, text: 'Editable .pptx, ready to hand off' },
];

export default function DeckSurface({
  onBack, clientSlug, sessionId, initialBrief, onOpenSurvey,
}: {
  onBack: () => void;
  clientSlug?: string;
  sessionId?: string | null;
  initialBrief?: string;
  onOpenSurvey?: () => void;
}) {
  const [brief, setBrief] = useState(initialBrief ?? '');
  const [type, setType] = useState('');
  const job = useJob(generateDeckStatus);
  const busy = job.phase === 'starting' || job.phase === 'running';
  const idle = job.phase === 'idle';

  const generate = () => {
    if (!brief.trim() || busy) return;
    job.run(() => generateDeck({
      request: brief.trim(),
      deliverable_type: type || undefined,
      client_slug: clientSlug,
      session_id: sessionId,
    }));
  };

  const typeLabel = TYPES.find((t) => t.id === type)?.label ?? 'Auto-detect';

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="min-h-full flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-4xl rounded-2xl border border-border-light bg-bg-elevated shadow-float overflow-hidden">
          {/* Back */}
          <div className="px-5 pt-4">
            <button
              type="button"
              onClick={onBack}
              aria-label="Back"
              className={`inline-flex items-center justify-center w-8 h-8 rounded-control text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors ${MOTION} ${FOCUS}`}
            >
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            </button>
          </div>

          <div className="grid md:grid-cols-[minmax(0,0.4fr)_minmax(0,0.6fr)] md:min-h-[420px]">
            {/* ── Left rail: what this is ─────────────────────────────── */}
            <aside className="flex flex-col px-6 pt-3 pb-6 md:px-7 md:pb-7 md:border-r border-border-light">
              <span className="inline-flex items-center justify-center w-11 h-11 rounded-surface bg-bg-tertiary text-text-secondary" aria-hidden>
                <Presentation className="w-5 h-5" strokeWidth={1.5} />
              </span>
              <h1 className="mt-4 font-serif text-[24px] tracking-tight text-text-primary leading-tight">Build a deck</h1>
              <p className="mt-2 text-body text-text-secondary leading-relaxed">
                Turn a rough brief into a partner-grade deck, grounded in your firm&#39;s past work.
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

            {/* ── Right rail: only the inputs the workflow needs ──────── */}
            <div className="flex flex-col px-6 pt-3 pb-6 md:px-7 md:pb-7">
              {idle ? (
                <>
                  {/* Deliverable type */}
                  <p className="eyebrow text-text-muted mb-2.5">Deliverable type</p>
                  <div className="flex flex-wrap gap-1.5">
                    {TYPES.map((t) => {
                      const on = type === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setType(t.id)}
                          aria-pressed={on}
                          className={[
                            'px-3 py-1.5 rounded-control text-caption font-medium transition-colors', MOTION, FOCUS,
                            on
                              ? 'bg-text-primary text-bg-primary'
                              : 'border border-border-light text-text-secondary hover:text-text-primary hover:border-border-hover',
                          ].join(' ')}
                        >
                          {t.label}
                        </button>
                      );
                    })}
                    {/* Survey compendium lives in its own tool (spreadsheet upload) — route there. */}
                    {onOpenSurvey && (
                      <button
                        type="button"
                        onClick={onOpenSurvey}
                        title="Opens the survey compendium tool (upload a spreadsheet)"
                        className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-control text-caption font-medium border border-border-light text-text-secondary hover:text-text-primary hover:border-border-hover transition-colors ${MOTION} ${FOCUS}`}
                      >
                        Survey compendium
                        <ArrowUpRight className="w-3 h-3 text-text-muted" strokeWidth={2} aria-hidden />
                      </button>
                    )}
                  </div>

                  {/* Brief */}
                  <div className="mt-6">
                    <div className="flex items-center justify-between mb-1.5">
                      <label htmlFor="deck-brief" className="eyebrow text-text-muted">Brief</label>
                      <button
                        type="button"
                        onClick={() => setBrief(EXAMPLE)}
                        className={`text-caption text-brand-ink hover:text-brand transition-colors ${FOCUS} rounded-control`}
                      >
                        Use an example
                      </button>
                    </div>
                    <p className="text-caption text-text-muted mb-2 leading-relaxed">
                      Name the audience, the angle, and which past work to draw on.
                    </p>
                    <textarea
                      id="deck-brief"
                      value={brief}
                      onChange={(e) => setBrief(e.target.value)}
                      rows={6}
                      placeholder={EXAMPLE}
                      className={`w-full resize-y max-h-[40vh] rounded-surface border border-border bg-bg-secondary px-3.5 py-3 text-[14px] text-text-primary placeholder:text-text-muted leading-relaxed outline-none focus:border-border-hover focus:bg-bg-elevated transition-colors ${MOTION} ${FOCUS}`}
                    />
                  </div>

                  {/* Primary action — anchored bottom-right */}
                  <div className="mt-auto pt-6 flex items-center justify-between gap-3">
                    <span className="text-caption text-text-muted truncate">
                      {type ? typeLabel : 'Type auto-detected from your brief'}
                    </span>
                    <button
                      type="button"
                      onClick={generate}
                      disabled={!brief.trim()}
                      className={`shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-control text-[13px] font-medium disabled:opacity-40 ${INK_BTN}`}
                    >
                      <Sparkles className="w-4 h-4" strokeWidth={1.75} /> Generate deck
                    </button>
                  </div>
                </>
              ) : job.phase === 'pending' ? (
                <PendingNote endpoint="POST /generate" />
              ) : job.phase === 'error' ? (
                <ErrorPanel message={job.error || 'Generation failed.'} onRetry={generate} />
              ) : job.phase === 'complete' && job.result ? (
                <ResultPanel result={job.result} kindLabel="Deck" onReset={job.reset} />
              ) : (
                <RunningPanel label="Building your deck…" phases={DECK_PHASES} progress={job.result?.progress} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
