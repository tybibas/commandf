import { useState, type ReactNode } from 'react';
import {
  Presentation, Sparkles, ArrowLeft, ArrowUpRight, Database, Layers, FileText, Info,
} from 'lucide-react';
import {
  generateDeck, generateDeckStatus, generateDeckOutline, editDeckSlide,
  DECK_ENUM_TYPES, EndpointPendingError, type DeckOutline as Outline,
} from './api';
import { useJob } from './useJob';
import ComposerTools from './ComposerTools';
import { RunningPanel, ErrorPanel, ResultPanel, type SlideEdit } from './generationUI';
import DeckOutline from './DeckOutline';

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-0';
const MOTION = 'duration-fast ease-out-expo';
const PILL_BTN = `bg-structure text-structure-ink hover:bg-structure-hover active:scale-[0.98] transition-colors ${MOTION} ${FOCUS}`;
const CHIP = `px-3 py-1.5 rounded-control text-caption font-medium transition-colors ${MOTION} ${FOCUS}`;
const CHIP_OFF = 'border border-border-light text-text-secondary hover:text-text-primary hover:border-border-hover';
const CHIP_ON = 'bg-structure text-structure-ink';
const NUM_INPUT = `w-16 rounded-control border border-border bg-bg-secondary px-2 py-1 text-caption font-mono text-text-primary text-center outline-none focus:border-border-hover transition-colors ${MOTION} ${FOCUS}`;

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
  onBack, clientSlug, sessionId, initialBrief, initialFileIds, onOpenSurvey,
}: {
  onBack: () => void;
  clientSlug?: string;
  sessionId?: string | null;
  initialBrief?: string;
  // Source-pinning (item 5): when the deck was launched from "Build a deck from
  // these sources", these Drive file_ids scope/seed retrieval to those documents.
  initialFileIds?: string[];
  onOpenSurvey?: () => void;
}) {
  const [type, setType] = useState('');
  const [brief, setBrief] = useState(initialBrief ?? '');
  const [length, setLength] = useState('');
  const [lenCustom, setLenCustom] = useState('');
  // Build mode: 'full' authors the whole deck; 'sections' authors it in chunks of
  // `sectionSize`, one at a time, with a "build next N slides" continue action.
  const [deckMode, setDeckMode] = useState<'full' | 'sections'>('full');
  const [sectionSize, setSectionSize] = useState(5);

  const [outline, setOutline] = useState<Outline | null>(null);
  const [outlinePhase, setOutlinePhase] = useState<OutlinePhase>('idle');
  const [outlineError, setOutlineError] = useState('');

  // The approved plan the current deck was built from — needed so a per-slide
  // edit can re-author one slide in the SAME plan context (no re-plan).
  const [builtPlan, setBuiltPlan] = useState<Record<string, unknown> | null>(null);
  const [editBusy, setEditBusy] = useState<number | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  // Local override of the completed result after a per-slide edit (a fresh
  // download_url + preview_urls). Kept in DeckSurface (not useJob) so slide
  // editing needs no change to the shared job hook.
  const [editedResult, setEditedResult] = useState<import('./api').JobStatus | null>(null);

  const fileIds = initialFileIds && initialFileIds.length > 0 ? initialFileIds : undefined;

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

  // In-sections mode authors the FIRST chunk on the initial build; the size <= 0
  // sentinel (or 'full' mode) authors the whole deck.
  const chunkSize = deckMode === 'sections' && sectionSize > 0 ? sectionSize : 0;

  const draftOutline = async () => {
    if (!canGo || outlinePhase === 'loading') return;
    setOutlinePhase('loading'); setOutlineError('');
    try {
      const o = await generateDeckOutline({
        request: buildRequest(), deliverable_type: enumType, client_slug: clientSlug,
        session_id: sessionId, file_ids: fileIds, target_slides: fullCount,
      });
      setOutline(o); setOutlinePhase('idle');
    } catch (e: any) {
      if (e instanceof EndpointPendingError) setOutlinePhase('pending');
      else { setOutlinePhase('error'); setOutlineError(e?.message || 'Could not draft the outline.'); }
    }
  };

  const buildFromPlan = (approvedPlan: Record<string, unknown>) => {
    setBuiltPlan(approvedPlan);
    job.run(() => generateDeck({
      request: buildRequest(), deliverable_type: enumType, client_slug: clientSlug,
      session_id: sessionId, approved_plan: approvedPlan, target_slides: fullCount,
      deck_scope: deckMode === 'sections' ? 'section' : 'full',
      section_start: 0, section_size: chunkSize, file_ids: fileIds,
    }));
  };

  const buildDirect = () => {
    if (!canGo) return;
    // Direct build has no human-approved plan; per-slide edit becomes available
    // once the outline echoes its plan (it is carried on the job result too).
    // Sections mode needs an approved plan to slice — a direct build always
    // authors the whole deck (no plan to chunk).
    setBuiltPlan((job.result?.plan as Record<string, unknown>) ?? null);
    job.run(() => generateDeck({
      request: buildRequest(), deliverable_type: enumType, client_slug: clientSlug,
      session_id: sessionId, target_slides: fullCount, file_ids: fileIds,
    }));
  };

  // ── Server-side continuity: author the NEXT slice of the SAME approved plan ──
  // No re-plan — carries the stored builtPlan + the next section_start (the built-
  // through marker the last build returned). Available until the full plan is authored.
  const buildNextSlice = () => {
    const plan = builtPlan ?? (job.result?.plan as Record<string, unknown> | undefined);
    const nextStart = (job.result?.built_through as number | undefined) ?? 0;
    if (!plan) return;
    setEditedResult(null);
    job.run(() => generateDeck({
      request: buildRequest(), deliverable_type: enumType, client_slug: clientSlug,
      session_id: sessionId, approved_plan: plan, deck_scope: 'section',
      section_start: nextStart, section_size: sectionSize, file_ids: fileIds,
    }));
  };

  // ── Iterative in-place editing: regenerate ONE slide from a prompt ──
  const editSlide = async (slideIndex: number, instruction: string) => {
    const plan = builtPlan ?? (job.result?.plan as Record<string, unknown> | undefined);
    if (!plan) {
      setEditError('Slide editing needs the deck plan; rebuild from an outline to edit slides.');
      return;
    }
    if (!job.jobId) {
      setEditError('Slide editing is available once the deck has finished building.');
      return;
    }
    setEditBusy(slideIndex); setEditError(null);
    try {
      // Backend re-authors the one slide, re-renders the deck in place (splicing
      // into the saved doc so other slides don't drift), and returns a fresh
      // result + updated plan. We hold it as a local override so the panel + its
      // thumbnails refresh in place.
      const updated = await editDeckSlide({
        job_id: job.jobId, request: buildRequest(), approved_plan: plan, slide_index: slideIndex,
        edit_instruction: instruction, deliverable_type: enumType,
        client_slug: clientSlug, session_id: sessionId, file_ids: fileIds,
      });
      if (updated.plan) setBuiltPlan(updated.plan as Record<string, unknown>);
      setEditedResult(updated);
    } catch (e: any) {
      setEditError(e?.message || 'Could not regenerate that slide.');
    } finally {
      setEditBusy(null);
    }
  };
  const slideEdit: SlideEdit = { onEdit: editSlide, busyIndex: editBusy, error: editError };

  // ── Build / result panel (two-panel shell) — from either the outline or one-shot ──
  if (jobActive) {
    return (
      <Shell onBack={onBack}>
        <div className="flex flex-col px-6 pt-3 pb-6 md:px-7 md:pb-7 justify-center">
          {job.phase === 'error' ? (
            <ErrorPanel message={job.error || 'Generation failed.'} onRetry={() => job.reset()} />
          ) : job.phase === 'complete' && (editedResult ?? job.result) ? (
            <ResultPanel
              result={(editedResult ?? job.result)!}
              kindLabel="Deck"
              onReset={resetAll}
              slideEdit={slideEdit}
              secondaryAction={continueAction()}
            />
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
        <p className="text-caption text-text-muted font-medium mb-2.5">Deliverable type</p>
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
          <span className="text-caption text-text-muted font-medium mr-1">Target length</span>
          {LENGTHS.map((l) => (
            <button key={l.id} type="button" onClick={() => { setLength(l.id); setLenCustom(''); }} aria-pressed={length === l.id}
              className={`px-2.5 py-1 rounded-control text-caption font-mono tabular-nums transition-colors ${MOTION} ${FOCUS} ${length === l.id ? CHIP_ON : CHIP_OFF}`}>
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

        {/* Build mode: full deck vs. in sections (chunked, continue-able) */}
        <div className="mt-4 flex items-center gap-2 flex-wrap">
          <span className="text-caption text-text-muted font-medium mr-1">Build</span>
          {([['full', 'Full deck'], ['sections', 'In sections']] as const).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setDeckMode(id)} aria-pressed={deckMode === id}
              className={`px-2.5 py-1 rounded-control text-caption font-medium transition-colors ${MOTION} ${FOCUS} ${deckMode === id ? CHIP_ON : CHIP_OFF}`}>
              {label}
            </button>
          ))}
          {deckMode === 'sections' && (
            <span className="inline-flex items-center gap-1.5 text-caption text-text-secondary">
              <span className="text-text-muted">slides per section</span>
              <input type="number" min={1} inputMode="numeric" value={sectionSize}
                onChange={(e) => setSectionSize(Math.max(1, Number(e.target.value) || 1))}
                aria-label="Slides per section" className={NUM_INPUT} />
            </span>
          )}
        </div>
        {deckMode === 'sections' && (
          <p className="mt-2 text-caption text-text-muted leading-relaxed">
            Section 1: slides 1–{fullCount ? Math.min(sectionSize, fullCount) : sectionSize}
            {fullCount ? ` of ~${fullCount}` : ''}. The full deck is planned; you build and
            review one section at a time, then continue to the next.
          </p>
        )}

        {/* Brief */}
        <div className="mt-5">
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="deck-brief" className="text-caption text-text-muted font-medium">Brief</label>
            <button type="button" onClick={() => setBrief(activeType.example)}
              className={`text-caption text-accent-ink hover:text-accent transition-colors ${FOCUS} rounded-control`}>
              Use an example
            </button>
          </div>
          <p className="text-caption text-text-muted mb-2 leading-relaxed">Name the audience, the angle, and which past work to draw on.</p>
          <textarea id="deck-brief" value={brief} onChange={(e) => setBrief(e.target.value)} rows={6} placeholder="Build a [deck type] for [client] covering [topic and key questions]…"
            className={`w-full resize-y max-h-[40vh] rounded-surface border border-border bg-bg-secondary px-3.5 py-3 text-body-sm text-text-primary placeholder:text-text-muted leading-relaxed outline-none focus:border-border-hover focus:bg-bg-elevated transition-colors ${MOTION} ${FOCUS}`} />
          {/* Same voice + optimize controls as the main composer (reused). */}
          <div className="mt-2 flex justify-end">
            <ComposerTools value={brief} onChange={setBrief}
              onFocusRestore={() => document.getElementById('deck-brief')?.focus()} />
          </div>
        </div>

        {outlinePhase === 'error' && <p className="mt-3 text-caption text-error leading-relaxed">{outlineError}</p>}
        {outlinePhase === 'pending' && (
          <div className="mt-3 rounded-surface border border-border-light bg-bg-secondary/60 px-4 py-3">
            <div className="flex items-start gap-2.5">
              <Info className="w-4 h-4 text-info shrink-0 mt-0.5" strokeWidth={1.75} aria-hidden />
              <p className="text-caption leading-relaxed text-text-secondary">
                <span className="font-medium text-text-primary">Couldn't reach the outline service.</span>{' '}
                Your brief is saved. Try again in a moment, or skip straight to building the deck.
              </p>
            </div>
          </div>
        )}

        {/* Actions: outline-first, with a direct-build bypass */}
        <div className="mt-auto pt-6 flex items-center justify-between gap-3">
          <button type="button" onClick={buildDirect} disabled={!canGo}
            className={`text-caption text-text-muted hover:text-text-primary transition-colors ${FOCUS} rounded-control disabled:opacity-40 disabled:pointer-events-none`}>
            Skip to build
          </button>
          <button type="button" onClick={draftOutline} disabled={!canGo || outlinePhase === 'loading'}
            className={`shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-pill text-caption font-medium disabled:opacity-40 ${PILL_BTN}`}>
            {outlinePhase === 'loading' ? <Sparkles className="w-4 h-4 animate-pulse" strokeWidth={1.75} /> : <Sparkles className="w-4 h-4" strokeWidth={1.75} />}
            {outlinePhase === 'loading' ? 'Drafting outline…' : 'Draft outline →'}
          </button>
        </div>
      </div>
    </Shell>
  );

  // "Build next N slides" — offered only while the approved plan has unbuilt
  // slides (built_through < plan_total_slides) and a per-slide edit isn't running.
  function continueAction(): { label: string; onClick: () => void } | undefined {
    const r = editedResult ?? job.result;
    const builtThrough = r?.built_through;
    const total = r?.plan_total_slides;
    if (typeof builtThrough !== 'number' || typeof total !== 'number') return undefined;
    if (builtThrough >= total) return undefined;
    if (editBusy !== null) return undefined;
    const remaining = total - builtThrough;
    const n = Math.min(sectionSize, remaining);
    return { label: `Build next ${n} slide${n === 1 ? '' : 's'}`, onClick: buildNextSlice };
  }

  function resetAll() {
    setOutline(null); setOutlinePhase('idle'); setOutlineError('');
    setBuiltPlan(null); setEditBusy(null); setEditError(null); setEditedResult(null); job.reset();
  }
}

// Shared two-panel shell (back button + left rail identity + right-rail children).
function Shell({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="min-h-full flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-4xl rounded-card border border-border-light bg-bg-elevated shadow-float overflow-hidden">
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
              <h1 className="mt-4 font-display text-xl font-light text-text-primary leading-tight">Build a deck</h1>
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
          <span className="font-medium text-text-primary">Couldn't reach the deck builder.</span>{' '}
          Your outline is saved. Try again in a moment.
        </p>
      </div>
    </div>
  );
}
