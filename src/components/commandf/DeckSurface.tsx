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
const CHIP = `px-3 py-1.5 rounded-control text-caption font-medium transition-colors ${MOTION} ${FOCUS}`;
const CHIP_OFF = 'border border-border-light text-text-secondary hover:text-text-primary hover:border-border-hover';
const CHIP_ON = 'bg-text-primary text-bg-primary';
const NUM_INPUT = `w-16 rounded-control border border-border bg-bg-secondary px-2 py-1 text-caption font-num text-text-primary text-center outline-none focus:border-border-hover transition-colors ${MOTION} ${FOCUS}`;

// Deliverable types + their natural brief — grounded in Actionist's own indexed
// work (title-frequency: Board/SteerCo, diagnostic, strategy, market landscape
// lead; then recap, proposal, diligence). Examples are archetypal (no named
// clients) so they read as universal templates (lever 1).
type DeckType = { id: string; label: string; example: string };
const TYPES: DeckType[] = [
  { id: '', label: 'Auto-detect', example: 'A 90-day operating-model review for a mid-market insurer CFO. Lead with the value-creation thesis, then the workplan and the team.' },
  { id: 'board_update', label: 'Board / SteerCo', example: 'A Q3 SteerCo update: progress against the value-creation plan, the two decisions we need from the board, and the risks we are tracking.' },
  { id: 'diagnostic', label: 'Diagnostic', example: 'An operating-model diagnostic for a mid-market insurer: where margin leaks today, the root causes, and the three highest-impact fixes.' },
  { id: 'strategy', label: 'Strategy', example: 'Strategic options for a distribution business facing channel shift: three paths, the trade-offs of each, and our recommendation.' },
  { id: 'market_landscape', label: 'Market landscape', example: 'A market landscape for the E&S insurance segment: size and growth, the competitive map, and where the white space is for a new entrant.' },
  { id: 'due_diligence', label: 'Due diligence', example: 'A commercial due diligence readout on a specialty-insurance target: market attractiveness, competitive position, and the key risks to the thesis.' },
  { id: 'engagement_recap', label: 'Engagement recap', example: 'A closing readout for the engagement: what we set out to do, what changed along the way, the results, and the handoff plan.' },
  { id: 'proposal', label: 'Proposal', example: 'A proposal for a 10-week commercial diligence on a specialty-insurance target: our approach, the workplan, the team, and fees.' },
];

const DECK_PHASES = ['Drafting the storyline…', 'Pulling evidence from past work…', 'Laying out slides…'];
const CAPABILITIES = [
  { icon: Database, text: 'Grounded in your indexed work' },
  { icon: Layers, text: 'Partner-grade storyline, not just slides' },
  { icon: FileText, text: 'Editable .pptx, ready to hand off' },
];

const LENGTHS: { id: string; label: string }[] = [
  { id: '', label: 'Auto' }, { id: '10', label: '~10' }, { id: '15', label: '~15' }, { id: '20', label: '~20' },
];
const SECTION_SIZES = [10, 15, 20];

export default function DeckSurface({
  onBack, clientSlug, sessionId, initialBrief, onOpenSurvey,
}: {
  onBack: () => void;
  clientSlug?: string;
  sessionId?: string | null;
  initialBrief?: string;
  onOpenSurvey?: () => void;
}) {
  const [type, setType] = useState('');
  const [scope, setScope] = useState<'full' | 'sections'>('full');
  const [brief, setBrief] = useState(initialBrief ?? '');
  const [sectionFocus, setSectionFocus] = useState('');

  // Full-deck length: a preset id ('' = auto) or 'custom' with a free number.
  const [length, setLength] = useState('');
  const [lenCustom, setLenCustom] = useState('');
  // Per-section size: a preset or a free number; plus an optional total-deck target.
  const [sectionSize, setSectionSize] = useState(10);
  const [secCustom, setSecCustom] = useState('');
  const [total, setTotal] = useState('');
  const [built, setBuilt] = useState(0);

  const job = useJob(generateDeckStatus);
  const busy = job.phase === 'starting' || job.phase === 'running';
  const idle = job.phase === 'idle';

  const activeType = TYPES.find((t) => t.id === type) ?? TYPES[0];
  const sections = scope === 'sections';

  const secSize = secCustom.trim() ? Math.max(1, Number(secCustom) || 0) : sectionSize;
  const fullCount = length === 'custom'
    ? (Number(lenCustom) > 0 ? Number(lenCustom) : undefined)
    : (length ? Number(length) : undefined);
  const totalN = Number(total) > 0 ? Number(total) : undefined;
  const start = built + 1;
  const end = built + secSize;

  const generate = () => {
    if (!brief.trim() || busy) return;
    if (sections && !sectionFocus.trim()) return;

    const request = sections
      ? [
          `Full deck: ${brief.trim()}`,
          totalN ? `The full deck is about ${totalN} slides in total.` : '',
          `\nBuild slides ${start}-${end}${built > 0 ? ` (slides 1-${built} are already built; continue the same deck without repeating them)` : ''}. This section should: ${sectionFocus.trim()}`,
        ].filter(Boolean).join(' ')
      : brief.trim();

    job.run(() => generateDeck({
      request,
      deliverable_type: type || undefined,
      client_slug: clientSlug,
      session_id: sessionId,
      slide_count: sections ? secSize : fullCount,
      deck_scope: sections ? 'section' : 'full',
      section_start: sections ? start : undefined,
    }));
  };

  const continueNext = () => { setBuilt((b) => b + secSize); setSectionFocus(''); job.reset(); };
  const canGenerate = brief.trim() && (!sections || sectionFocus.trim());

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

            {/* Right rail */}
            <div className="flex flex-col px-6 pt-3 pb-6 md:px-7 md:pb-7">
              {idle ? (
                <>
                  {/* Deliverable type */}
                  <p className="eyebrow text-text-muted mb-2.5">Deliverable type</p>
                  <div className="flex flex-wrap gap-1.5">
                    {TYPES.map((t) => (
                      <button key={t.id} type="button" onClick={() => setType(t.id)} aria-pressed={type === t.id}
                        className={`${CHIP} ${type === t.id ? CHIP_ON : CHIP_OFF}`}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                  {onOpenSurvey && (
                    <button type="button" onClick={onOpenSurvey}
                      className={`mt-2 inline-flex items-center gap-1 text-caption text-text-muted hover:text-text-primary transition-colors ${FOCUS} rounded-control`}>
                      Building a survey compendium? Open that tool
                      <ArrowUpRight className="w-3 h-3" strokeWidth={2} aria-hidden />
                    </button>
                  )}

                  {/* Scope */}
                  <div className="mt-6 inline-flex self-start rounded-control border border-border-light p-0.5" role="radiogroup" aria-label="Deck scope">
                    {([['full', 'Full deck'], ['sections', 'In sections']] as const).map(([id, label]) => (
                      <button key={id} type="button" role="radio" aria-checked={scope === id} onClick={() => setScope(id)}
                        className={`px-3 py-1 rounded-[5px] text-caption font-medium transition-colors ${MOTION} ${FOCUS} ${scope === id ? 'bg-bg-tertiary text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}>
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Length (full) / Slides + total (sections) */}
                  <div className="mt-4 flex items-center gap-2 flex-wrap">
                    <span className="eyebrow text-text-muted mr-1">{sections ? 'Slides this section' : 'Length'}</span>
                    {sections ? (
                      <>
                        {SECTION_SIZES.map((n) => (
                          <button key={n} type="button" onClick={() => { setSectionSize(n); setSecCustom(''); }} aria-pressed={!secCustom && sectionSize === n}
                            className={`px-2.5 py-1 rounded-control text-caption font-num transition-colors ${MOTION} ${FOCUS} ${!secCustom && sectionSize === n ? CHIP_ON : CHIP_OFF}`}>
                            {n}
                          </button>
                        ))}
                        <input type="number" min={1} inputMode="numeric" value={secCustom} onChange={(e) => setSecCustom(e.target.value)}
                          placeholder="Custom" aria-label="Custom slides this section"
                          className={secCustom ? `${NUM_INPUT} w-20` : `${NUM_INPUT} w-20 border-border-light`} />
                        <span className="text-caption text-text-muted ml-1">of</span>
                        <input type="number" min={1} inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value)}
                          placeholder="~total" aria-label="Approx total slides in full deck"
                          className={`${NUM_INPUT} w-20 border-border-light`} title="Optional: about how many slides the full deck will be" />
                      </>
                    ) : (
                      <>
                        {LENGTHS.map((l) => (
                          <button key={l.id} type="button" onClick={() => { setLength(l.id); setLenCustom(''); }} aria-pressed={length === l.id}
                            className={`px-2.5 py-1 rounded-control text-caption font-num transition-colors ${MOTION} ${FOCUS} ${length === l.id ? CHIP_ON : CHIP_OFF}`}>
                            {l.label}
                          </button>
                        ))}
                        <button type="button" onClick={() => setLength('custom')} aria-pressed={length === 'custom'}
                          className={`px-2.5 py-1 rounded-control text-caption font-medium transition-colors ${MOTION} ${FOCUS} ${length === 'custom' ? CHIP_ON : CHIP_OFF}`}>
                          Custom
                        </button>
                        {length === 'custom' && (
                          <input type="number" min={1} inputMode="numeric" autoFocus value={lenCustom} onChange={(e) => setLenCustom(e.target.value)}
                            placeholder="40" aria-label="Custom slide count"
                            className={NUM_INPUT} />
                        )}
                      </>
                    )}
                  </div>

                  {/* Brief */}
                  <div className="mt-5">
                    <div className="flex items-center justify-between mb-1.5">
                      <label htmlFor="deck-brief" className="eyebrow text-text-muted">{sections ? 'The full deck' : 'Brief'}</label>
                      <button type="button" onClick={() => setBrief(activeType.example)}
                        className={`text-caption text-brand-ink hover:text-brand transition-colors ${FOCUS} rounded-control`}>
                        Use an example
                      </button>
                    </div>
                    <p className="text-caption text-text-muted mb-2 leading-relaxed">
                      {sections
                        ? 'The whole deliverable: its goal, the audience, and the arc. This context carries into every section.'
                        : 'Name the audience, the angle, and which past work to draw on.'}
                    </p>
                    <textarea id="deck-brief" value={brief} onChange={(e) => setBrief(e.target.value)} rows={sections ? 4 : 6} placeholder={activeType.example}
                      className={`w-full resize-y max-h-[40vh] rounded-surface border border-border bg-bg-secondary px-3.5 py-3 text-[14px] text-text-primary placeholder:text-text-muted leading-relaxed outline-none focus:border-border-hover focus:bg-bg-elevated transition-colors ${MOTION} ${FOCUS}`} />
                  </div>

                  {/* This section (chunked) */}
                  {sections && (
                    <div className="mt-4 animate-slide-up">
                      <label htmlFor="deck-section" className="eyebrow text-text-muted">
                        This section · slides {start}-{end}{totalN ? ` of ~${totalN}` : ''}
                      </label>
                      <p className="text-caption text-text-muted mb-2 mt-1.5 leading-relaxed">What should these {secSize} slides achieve?</p>
                      <textarea id="deck-section" value={sectionFocus} onChange={(e) => setSectionFocus(e.target.value)} rows={3}
                        placeholder="e.g. Set up the problem and the diagnostic findings, before the recommendations."
                        className={`w-full resize-y max-h-[30vh] rounded-surface border border-border bg-bg-secondary px-3.5 py-3 text-[14px] text-text-primary placeholder:text-text-muted leading-relaxed outline-none focus:border-border-hover focus:bg-bg-elevated transition-colors ${MOTION} ${FOCUS}`} />
                    </div>
                  )}

                  {/* Primary */}
                  <div className="mt-auto pt-6 flex items-center justify-between gap-3">
                    <span className="text-caption text-text-muted truncate">
                      {sections
                        ? `Slides ${start}-${end}${totalN ? ` of ~${totalN}` : ''}${built > 0 ? ' · continuing' : ''}`
                        : (type ? activeType.label : 'Type auto-detected from your brief')}
                    </span>
                    <button type="button" onClick={generate} disabled={!canGenerate}
                      className={`shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-control text-[13px] font-medium disabled:opacity-40 ${INK_BTN}`}>
                      <Sparkles className="w-4 h-4" strokeWidth={1.75} />
                      {sections ? `Generate slides ${start}-${end}` : 'Generate deck'}
                    </button>
                  </div>
                </>
              ) : job.phase === 'pending' ? (
                <PendingNote endpoint="POST /generate" />
              ) : job.phase === 'error' ? (
                <ErrorPanel message={job.error || 'Generation failed.'} onRetry={generate} />
              ) : job.phase === 'complete' && job.result ? (
                <ResultPanel
                  result={job.result}
                  kindLabel={sections ? `Slides ${start}-${end}` : 'Deck'}
                  onReset={() => { setBuilt(0); setSectionFocus(''); job.reset(); }}
                  secondaryAction={sections ? { label: `Build slides ${end + 1}-${end + secSize}`, onClick: continueNext } : undefined}
                />
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
