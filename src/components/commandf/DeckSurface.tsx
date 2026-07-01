import { useState, type ReactNode } from 'react';
import {
  Presentation, Sparkles, ArrowLeft, ArrowRight, ArrowUpRight, Database, Layers, FileText, Info,
} from 'lucide-react';
import {
  generateDeck, generateDeckStatus, generateDeckOutline,
  DECK_ENUM_TYPES, EndpointPendingError, type DeckOutline as Outline,
} from './api';
import { useJob } from './useJob';
import { RunningPanel, ErrorPanel, ResultPanel } from './generationUI';
import DeckOutline from './DeckOutline';

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-0';
const MOTION = 'duration-fast ease-out-expo';
const INK_BTN = `bg-text-primary text-bg-primary hover:bg-text-primary/90 transition-colors ${MOTION} ${FOCUS}`;
const CHIP = `px-3 py-1.5 rounded-control text-caption font-medium transition-colors ${MOTION} ${FOCUS}`;
const CHIP_OFF = 'border border-border-light text-text-secondary hover:text-text-primary hover:border-border-hover';
const CHIP_ON = 'bg-text-primary text-bg-primary';
const NUM_INPUT = `w-16 rounded-control border border-border bg-bg-secondary px-2 py-1 text-caption font-num text-text-primary text-center outline-none focus:border-border-hover transition-colors ${MOTION} ${FOCUS}`;

// Deliverable types + their natural brief. Three (proposal, engagement_recap,
// pov_memo) are the generator's validated enum → sent as `deliverable_type`.
// The rest are grounded in Actionist's indexed work but NOT enum values, so their
// intent is folded into the request prose (`intent`) — the planner is LLM-driven
// and adapts. Examples are archetypal (no named clients) → universal templates.
type DeckType = { id: string; label: string; example: string; intent?: string };
const TYPES: DeckType[] = [
  { id: '', label: 'Auto-detect', example: 'A 90-day operating-model review for a mid-market insurer CFO. Lead with the value-creation thesis, then the workplan and the team.' },
  { id: 'proposal', label: 'Proposal', example: 'A proposal for a 10-week commercial diligence on a specialty-insurance target: our approach, the workplan, the team, and fees.' },
  { id: 'engagement_recap', label: 'Engagement recap', example: 'A closing readout for the engagement: what we set out to do, what changed along the way, the results, and the handoff plan.' },
  { id: 'pov_memo', label: 'POV memo', example: 'A point-of-view memo on where the specialty-insurance market is heading, and what it means for a mid-market carrier over the next 24 months.' },
  { id: 'board_update', label: 'Board / SteerCo', intent: 'a board / SteerCo update deck', example: 'A Q3 SteerCo update: progress against the value-creation plan, the two decisions we need from the board, and the risks we are tracking.' },
  { id: 'diagnostic', label: 'Diagnostic', intent: 'a diagnostic deck', example: 'An operating-model diagnostic for a mid-market insurer: where margin leaks today, the root causes, and the three highest-impact fixes.' },
  { id: 'strategy', label: 'Strategy', intent: 'a strategy deck', example: 'Strategic options for a distribution business facing channel shift: three paths, the trade-offs of each, and our recommendation.' },
  { id: 'market_landscape', label: 'Market landscape', intent: 'a market-landscape deck', example: 'A market landscape for the E&S insurance segment: size and growth, the competitive map, and where the white space is for a new entrant.' },
  { id: 'due_diligence', label: 'Due diligence', intent: 'a commercial due-diligence readout', example: 'A commercial due-diligence readout on a specialty-insurance target: market attractiveness, competitive position, and the key risks to the thesis.' },
];

const DECK_PHASES = ['Retrieving evidence…', 'Drafting the storyline…', 'Laying out slides…', 'Assembling the .pptx…'];
const CAPABILITIES = [
  { icon: Database, text: 'Grounded in your indexed work' },
  { icon: Layers, text: 'Partner-grade storyline, not just slides' },
  { icon: FileText, text: 'Editable .pptx, ready to hand off' },
];

const LENGTHS: { id: string; label: string }[] = [
  { id: '', label: 'Auto' }, { id: '10', label: '~10' }, { id: '15', label: '~15' }, { id: '20', label: '~20' },
];

type OutlinePhase = 'idle' | 'loading' | 'error' | 'pending';

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
  const [brief, setBrief] = useState(initialBrief ?? '');
  const [length, setLength] = useState('');
  const [lenCustom, setLenCustom] = useState('');

  const [outline, setOutline] = useState<Outline | null>(null);
  const [outlinePhase, setOutlinePhase] = useState<OutlinePhase>('idle');
  const [outlineError, setOutlineError] = useState('');

  const job = useJob(generateDeckStatus);
  const jobActive = job.phase !== 'idle';

  const activeType = TYPES.find((t) => t.id === type) ?? TYPES[0];
  const enumType = DECK_ENUM_TYPES.has(type) ? type : undefined;
  const fullCount = length === 'custom'
    ? (Number(lenCustom) > 0 ? Number(lenCustom) : undefined)
    : (length ? Number(length) : undefined);
  const canGo = !!brief.trim();

  // Non-enum types steer the LLM planner through prose; enum types go structured.
  const buildRequest = () => {
    const prefix = type && !enumType && activeType.intent ? `Produce ${activeType.intent}. ` : '';
    const lengthProse = fullCount ? ` Aim for roughly ${fullCount} slides.` : '';
    return `${prefix}${brief.trim()}${lengthProse}`;
  };

  const draftOutline = async () => {
    if (!canGo || outlinePhase === 'loading') return;
    setOutlinePhase('loading'); setOutlineError('');
    try {
      const o = await generateDeckOutline({
        request: buildRequest(), deliverable_type: enumType, client_slug: clientSlug, session_id: sessionId,
      });
      setOutline(o); setOutlinePhase('idle');
    } catch (e: any) {
      if (e instanceof EndpointPendingError) setOutlinePhase('pending');
      else { setOutlinePhase('error'); setOutlineError(e?.message || 'Could not draft the outline.'); }
    }
  };

  const buildFromPlan = (approvedPlan: Record<string, unknown>) => {
    job.run(() => generateDeck({
      request: buildRequest(), deliverable_type: enumType, client_slug: clientSlug,
      session_id: sessionId, approved_plan: approvedPlan, slide_count: fullCount,
    }));
  };

  const buildDirect = () => {
    if (!canGo) return;
    job.run(() => generateDeck({
      request: buildRequest(), deliverable_type: enumType, client_slug: clientSlug,
      session_id: sessionId, slide_count: fullCount,
    }));
  };

  // ── Build / result panel (two-panel shell) — from either the outline or one-shot ──
  if (jobActive) {
    return (
      <Shell onBack={onBack}>
        <div className="flex flex-col px-6 pt-3 pb-6 md:px-7 md:pb-7 justify-center">
          {job.phase === 'error' ? (
            <ErrorPanel message={job.error || 'Generation failed.'} onRetry={() => job.reset()} />
          ) : job.phase === 'complete' && job.result ? (
            <ResultPanel result={job.result} kindLabel="Deck" onReset={resetAll} />
          ) : job.phase === 'pending' ? (
            <PendingBuildNote />
          ) : (
            <RunningPanel label="Building your deck…" phases={DECK_PHASES} progress={job.result?.progress} />
          )}
        </div>
      </Shell>
    );
  }

  // ── Outline editor ──
  if (outline) {
    return <DeckOutline outline={outline} onBack={() => setOutline(null)} onBuild={buildFromPlan} />;
  }

  // ── Intent ──
  return (
    <Shell onBack={onBack}>
      <div className="flex flex-col px-6 pt-3 pb-6 md:px-7 md:pb-7">
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

        {/* Length */}
        <div className="mt-6 flex items-center gap-2 flex-wrap">
          <span className="eyebrow text-text-muted mr-1">Target length</span>
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
              placeholder="40" aria-label="Custom slide count" className={NUM_INPUT} />
          )}
        </div>

        {/* Brief */}
        <div className="mt-5">
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="deck-brief" className="eyebrow text-text-muted">Brief</label>
            <button type="button" onClick={() => setBrief(activeType.example)}
              className={`text-caption text-brand-ink hover:text-brand transition-colors ${FOCUS} rounded-control`}>
              Use an example
            </button>
          </div>
          <p className="text-caption text-text-muted mb-2 leading-relaxed">Name the audience, the angle, and which past work to draw on.</p>
          <textarea id="deck-brief" value={brief} onChange={(e) => setBrief(e.target.value)} rows={6} placeholder={activeType.example}
            className={`w-full resize-y max-h-[40vh] rounded-surface border border-border bg-bg-secondary px-3.5 py-3 text-[14px] text-text-primary placeholder:text-text-muted leading-relaxed outline-none focus:border-border-hover focus:bg-bg-elevated transition-colors ${MOTION} ${FOCUS}`} />
        </div>

        {outlinePhase === 'error' && <p className="mt-3 text-caption text-error leading-relaxed">{outlineError}</p>}
        {outlinePhase === 'pending' && (
          <div className="mt-3 rounded-surface border border-border-light bg-bg-secondary/60 px-4 py-3">
            <div className="flex items-start gap-2.5">
              <Info className="w-4 h-4 text-info shrink-0 mt-0.5" strokeWidth={1.75} aria-hidden />
              <p className="text-caption leading-relaxed text-text-secondary">
                <span className="font-medium text-text-primary">Preview — outline endpoint pending.</span>{' '}
                The deck flow is wired to <code className="font-mono text-micro bg-bg-tertiary rounded-control px-1 py-0.5">POST /generate-deck/outline</code>; it will light up the moment the backend responds.
              </p>
            </div>
          </div>
        )}

        {/* Actions: outline-first, with a direct-build bypass */}
        <div className="mt-auto pt-6 flex items-center justify-between gap-3">
          <button type="button" onClick={buildDirect} disabled={!canGo}
            className={`text-caption text-text-muted hover:text-text-primary transition-colors ${FOCUS} rounded-control disabled:opacity-40 disabled:pointer-events-none`}>
            Skip — build directly
          </button>
          <button type="button" onClick={draftOutline} disabled={!canGo || outlinePhase === 'loading'}
            className={`shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-control text-[13px] font-medium disabled:opacity-40 ${INK_BTN}`}>
            {outlinePhase === 'loading' ? <Sparkles className="w-4 h-4 animate-pulse" strokeWidth={1.75} /> : <Sparkles className="w-4 h-4" strokeWidth={1.75} />}
            {outlinePhase === 'loading' ? 'Drafting outline…' : 'Draft outline'}
            {outlinePhase !== 'loading' && <ArrowRight className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />}
          </button>
        </div>
      </div>
    </Shell>
  );

  function resetAll() { setOutline(null); setOutlinePhase('idle'); setOutlineError(''); job.reset(); }
}

// Shared two-panel shell (back button + left rail identity + right-rail children).
function Shell({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="min-h-full flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-4xl rounded-2xl border border-border-light bg-bg-elevated shadow-float overflow-hidden">
          <div className="px-5 pt-4">
            <button type="button" onClick={onBack} aria-label="Back"
              className={`inline-flex items-center justify-center w-8 h-8 rounded-control text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors ${MOTION} ${FOCUS}`}>
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            </button>
          </div>
          <div className="grid md:grid-cols-[minmax(0,0.4fr)_minmax(0,0.6fr)] md:min-h-[460px]">
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
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function PendingBuildNote() {
  return (
    <div className="rounded-surface border border-border-light bg-bg-secondary/60 px-4 py-4">
      <div className="flex items-start gap-2.5">
        <Info className="w-4 h-4 text-info shrink-0 mt-0.5" strokeWidth={1.75} aria-hidden />
        <p className="text-caption leading-relaxed text-text-secondary">
          <span className="font-medium text-text-primary">Preview — build endpoint pending.</span>{' '}
          Wired to <code className="font-mono text-micro bg-bg-tertiary rounded-control px-1 py-0.5">POST /generate-deck</code>; it goes live the moment the backend responds.
        </p>
      </div>
    </div>
  );
}
