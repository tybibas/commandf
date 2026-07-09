import { useState, useEffect, type ReactNode } from 'react';
import {
  Presentation, Sparkles, ArrowLeft, ArrowUpRight, Database, Layers, FileText, Info,
} from 'lucide-react';

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
import {
  generateDeck, generateDeckStatus, streamDeckOutline, editDeckSlide, startDeckBuild,
  DECK_ENUM_TYPES, EndpointPendingError, StreamAbortedError, type DeckOutline as Outline,
} from './api';
import { writeDeckPointer } from './sessionsCache';
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

// Deliverable types + their natural briefs. Three (proposal, engagement_recap,
// pov_memo) are the generator's validated enum → sent as `deliverable_type`.
// The rest are grounded in Actionist's indexed work but NOT enum values, so their
// intent is folded into the request prose (`intent`) — the planner is LLM-driven
// and adapts. Each type carries a few archetypal briefs (no named clients) that
// teach what it can produce; the left panel rotates through them per selected type.
type DeckType = { id: string; label: string; examples: string[]; intent?: string };
const TYPES: DeckType[] = [
  { id: '', label: 'Auto-detect', examples: [
    'A 90-day operating-model review for a mid-market insurer CFO. Lead with the value-creation thesis, then the workplan and the team.',
    'A working session for the client ops leads on why cycle times slipped last quarter, and the two changes we would make first.',
    'A short update for a PE deal team on where our work stands and what still worries us.',
  ] },
  { id: 'proposal', label: 'Proposal', examples: [
    'A proposal for a 10-week commercial diligence on a specialty-insurance target: our approach, the workplan, the team, and fees.',
    'A pitch to run a cost-to-serve teardown for a distribution business, framed around the margin we think is recoverable.',
    'A proposal to stand up a PMO for a post-merger integration, with the first 100 days mapped out.',
  ] },
  { id: 'engagement_recap', label: 'Engagement recap', examples: [
    'A closing readout for the engagement: what we set out to do, what changed along the way, the results, and the handoff plan.',
    'A recap for the sponsor showing the three decisions that moved the number, and what we would watch over the next two quarters.',
    'A wrap-up for the client team that credits their people, names what worked, and is honest about what we would do differently.',
  ] },
  { id: 'pov_memo', label: 'POV memo', examples: [
    'A point-of-view memo on where the specialty-insurance market is heading, and what it means for a mid-market carrier over the next 24 months.',
    'A short memo arguing the client is under-pricing risk in one segment, with the evidence and the fix.',
    'A partner take on whether to build or buy the analytics capability, and why we lean one way.',
  ] },
  { id: 'board_update', label: 'Board / SteerCo', intent: 'a board / SteerCo update deck', examples: [
    'A Q3 SteerCo update: progress against the value-creation plan, the two decisions we need from the board, and the risks we are tracking.',
    'A board update that opens with the one number that matters this quarter, then the story behind it.',
    'A SteerCo pack that flags a slipped milestone early, with the recovery plan and what it costs.',
  ] },
  { id: 'diagnostic', label: 'Diagnostic', intent: 'a diagnostic deck', examples: [
    'An operating-model diagnostic for a mid-market insurer: where margin leaks today, the root causes, and the three highest-impact fixes.',
    'A diagnostic of why win rates fell in one region, tracing it back to pricing and rep coverage.',
    'A cost diagnostic that separates the spend we can cut this year from the spend that needs a longer fix.',
  ] },
  { id: 'strategy', label: 'Strategy', intent: 'a strategy deck', examples: [
    'Strategic options for a distribution business facing channel shift: three paths, the trade-offs of each, and our recommendation.',
    'A growth strategy for a carrier that has run out of room in its home market, ranked by how fast each move pays back.',
    'A five-year plan that starts from where the client actually wins today, not a blank sheet.',
  ] },
  { id: 'market_landscape', label: 'Market landscape', intent: 'a market-landscape deck', examples: [
    'A market landscape for the E&S insurance segment: size and growth, the competitive map, and where the white space is for a new entrant.',
    'A landscape of the players in embedded insurance, sorted by who is actually taking share.',
    'A scan of an adjacent market the client is eyeing, with an honest read on whether it is worth entering.',
  ] },
  { id: 'due_diligence', label: 'Due diligence', intent: 'a commercial due-diligence readout', examples: [
    'A commercial due-diligence readout on a specialty-insurance target: market attractiveness, competitive position, and the key risks to the thesis.',
    'A diligence readout that stress-tests the seller growth story against what customers told us.',
    'A red-flag summary for a deal team: the three things that could break the thesis, and how confident we are in each.',
  ] },
];

const DECK_PHASES = ['Retrieving evidence…', 'Drafting the storyline…', 'Laying out slides…', 'Assembling the .pptx…'];
// Fallback narration for the cold-start window BEFORE the first §3.5 phase event
// arrives (the ~30-45s Modal wake). Mirrors the contract's phase labels; once the
// real stream speaks, `outlineProgress` leads and this canned timer stops.
const OUTLINE_PHASES = ['Waking the planner…', 'Retrieving evidence…', 'Planning the slides…'];
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
  onBack, clientSlug, sessionId, initialBrief, initialFileIds, onOpenSurvey, onOpenStudio,
}: {
  onBack: () => void;
  clientSlug?: string;
  sessionId?: string | null;
  initialBrief?: string;
  // Source-pinning (item 5): when the deck was launched from "Build a deck from
  // these sources", these Drive file_ids scope/seed retrieval to those documents.
  initialFileIds?: string[];
  onOpenSurvey?: () => void;
  // Deck Studio (C-2) handoff. `seed`+`buildStatus` omitted (undefined/null) means
  // "open against an in-flight build" (§3.6) — the default approved-plan flow now
  // goes through this path. When absent entirely, DeckSurface falls back to the
  // legacy one-shot `generateDeck` job (kept for rollback; see buildFromPlan).
  onOpenStudio?: (args: {
    jobId: string; seed: import('./api').JobStatus | null; approvedPlan: Record<string, unknown> | null;
    buildStatus?: 'building'; planTotalSlides?: number;
  }) => void;
}) {
  const [type, setType] = useState('');
  const [brief, setBrief] = useState(initialBrief ?? '');
  // Proposal-only cover data: the backend uses these to render "Prepared for
  // {company}" on the cover slide and to scrape the prospect's site for a logo.
  // Both optional — omitted entirely (not sent as empty strings) when blank.
  const [prospectCompany, setProspectCompany] = useState('');
  const [prospectWebsite, setProspectWebsite] = useState('');
  const [length, setLength] = useState('');
  const [lenCustom, setLenCustom] = useState('');
  // Build mode: 'full' authors the whole deck; 'sections' authors it in chunks of
  // `sectionSize`, one at a time, with a "build next N slides" continue action.
  const [deckMode, setDeckMode] = useState<'full' | 'sections'>('full');
  const [sectionSize, setSectionSize] = useState(5);
  // Which of the selected type's archetypal briefs the teaching panel is showing.
  const [exampleIdx, setExampleIdx] = useState(0);

  const [outline, setOutline] = useState<Outline | null>(null);
  const [outlinePhase, setOutlinePhase] = useState<OutlinePhase>('idle');
  const [outlineError, setOutlineError] = useState('');
  // Live "agent thinking" line, driven off the §3.5 stream's phase events. Empty
  // until the first phase arrives (during the cold-start wake, RunningPanel's
  // canned phases step as the fallback), then the real label leads.
  const [outlineProgress, setOutlineProgress] = useState('');

  // The approved plan the current deck was built from — needed so a per-slide
  // edit can re-author one slide in the SAME plan context (no re-plan).
  const [builtPlan, setBuiltPlan] = useState<Record<string, unknown> | null>(null);
  const [editBusy, setEditBusy] = useState<number | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  // Local override of the completed result after a per-slide edit (a fresh
  // download_url + preview_urls). Kept in DeckSurface (not useJob) so slide
  // editing needs no change to the shared job hook.
  const [editedResult, setEditedResult] = useState<import('./api').JobStatus | null>(null);

  // §3.6: starting a live build is a thin POST (returns a job id fast) before
  // the studio mounts — separate from the one-shot `job` (useJob) lifecycle
  // below, which the rollback/no-studio-handoff path still uses.
  const [buildStarting, setBuildStarting] = useState(false);
  const [buildStartError, setBuildStartError] = useState('');

  const fileIds = initialFileIds && initialFileIds.length > 0 ? initialFileIds : undefined;

  const job = useJob(generateDeckStatus);
  const jobActive = job.phase !== 'idle';

  // P0-1 belt-and-braces (legacy one-shot path): mirror the job's id/rev into the
  // per-session local pointer as soon as each becomes known, so a reload/navigate
  // -away-and-back can show "Resume deck" instantly before the by-session network
  // confirm resolves. The live-build handoff (buildFromPlan → startDeckBuild) never
  // touches this `job` hook, so it writes its own pointer at hand-off time below.
  useEffect(() => {
    if (job.jobId) writeDeckPointer(sessionId ?? null, { job_id: job.jobId, deck_rev: (job.result?.deck_rev as number | undefined) ?? 1 });
  }, [job.jobId, job.result?.deck_rev, sessionId]);

  const activeType = TYPES.find((t) => t.id === type) ?? TYPES[0];
  const enumType = DECK_ENUM_TYPES.has(type) ? type : undefined;
  const fullCount = length === 'custom'
    ? (Number(lenCustom) > 0 ? Number(lenCustom) : undefined)
    : (length ? Number(length) : undefined);
  const canGo = !!brief.trim();

  // Teaching panel: restart at the first brief when the deck type changes, then
  // gently cycle through that type's briefs while the field is empty (mirrors the
  // main composer's rotating placeholder). Stops the moment there's a brief so it
  // never distracts once the user is writing; skipped under reduced-motion.
  useEffect(() => { setExampleIdx(0); }, [type]);
  const rotateExamples = !brief.trim() && activeType.examples.length > 1 && !reducedMotion();
  useEffect(() => {
    if (!rotateExamples) return;
    const id = setInterval(() => setExampleIdx((i) => (i + 1) % activeType.examples.length), 5200);
    return () => clearInterval(id);
  }, [rotateExamples, activeType]);

  const useExample = (text: string) => {
    setBrief(text);
    requestAnimationFrame(() => {
      const el = document.getElementById('deck-brief') as HTMLTextAreaElement | null;
      el?.focus();
      el?.setSelectionRange(el.value.length, el.value.length);
    });
  };

  // Non-enum types steer the LLM planner through prose; enum types go structured.
  const buildRequest = () => {
    const prefix = type && !enumType && activeType.intent ? `Produce ${activeType.intent}. ` : '';
    const lengthProse = fullCount ? ` Aim for roughly ${fullCount} slides.` : '';
    return `${prefix}${brief.trim()}${lengthProse}`;
  };

  // In-sections mode authors the FIRST chunk on the initial build; the size <= 0
  // sentinel (or 'full' mode) authors the whole deck.
  const chunkSize = deckMode === 'sections' && sectionSize > 0 ? sectionSize : 0;

  // Optional cover fields, shown only for the proposal deliverable. Trimmed and
  // omitted (undefined, never "") when blank so the backend sees them as absent.
  const showProspectFields = type === 'proposal';
  const prospectFields = () => {
    const company = prospectCompany.trim();
    const site = prospectWebsite.trim();
    if (!showProspectFields || (!company && !site)) return {};
    return {
      prospect_company: company || undefined,
      // Accept with or without a scheme; prepend https:// so the backend gets
      // a fetchable URL without hard-blocking submission on validation.
      prospect_website: site ? (/^https?:\/\//i.test(site) ? site : `https://${site}`) : undefined,
    };
  };

  const draftOutline = async () => {
    if (!canGo || outlinePhase === 'loading') return;
    setOutlinePhase('loading'); setOutlineError(''); setOutlineProgress('');
    try {
      const o = await streamDeckOutline(
        {
          request: buildRequest(), deliverable_type: enumType, client_slug: clientSlug,
          session_id: sessionId, file_ids: fileIds, target_slides: fullCount,
          ...prospectFields(),
        },
        { onPhase: (label) => setOutlineProgress(label) },
      );
      setOutline(o); setOutlinePhase('idle');
    } catch (e: any) {
      if (e instanceof StreamAbortedError) { setOutlinePhase('idle'); return; }  // user/idle cancel — no error state
      if (e instanceof EndpointPendingError) setOutlinePhase('pending');
      else { setOutlinePhase('error'); setOutlineError(e?.message || 'Could not draft the outline.'); }
    }
  };

  // Approved-plan build (§3.6): the DEFAULT path now opens the studio the
  // instant the build job exists and watches it author live, instead of
  // waiting for a one-shot `generateDeck` job to finish. Only when the host
  // hasn't wired a studio handoff (`onOpenStudio` absent) does this fall back
  // to the legacy one-shot job (kept importable for rollback, not deleted).
  // In-sections mode has no live-build equivalent yet (it needs the chunked
  // continuity `job.result.built_through` this surface already tracks), so it
  // always takes the one-shot path.
  const buildFromPlan = (approvedPlan: Record<string, unknown>) => {
    setBuiltPlan(approvedPlan);
    if (!onOpenStudio || deckMode === 'sections') {
      job.run(() => generateDeck({
        request: buildRequest(), deliverable_type: enumType, client_slug: clientSlug,
        session_id: sessionId, approved_plan: approvedPlan, target_slides: fullCount,
        deck_scope: deckMode === 'sections' ? 'section' : 'full',
        section_start: 0, section_size: chunkSize, file_ids: fileIds,
        ...prospectFields(),
      }));
      return;
    }
    setBuildStarting(true); setBuildStartError('');
    startDeckBuild(approvedPlan, {
      request: buildRequest(), deliverable_type: enumType, client_slug: clientSlug,
      session_id: sessionId, target_slides: fullCount, file_ids: fileIds,
      ...prospectFields(),
    }).then(({ job_id }) => {
      const planSlides = (approvedPlan as { slides?: unknown[] }).slides;
      writeDeckPointer(sessionId ?? null, { job_id, deck_rev: 0 }); // overwrites any prior job for this session
      onOpenStudio({
        jobId: job_id, seed: null, approvedPlan, buildStatus: 'building',
        planTotalSlides: Array.isArray(planSlides) ? planSlides.length : undefined,
      });
    }).catch((e: unknown) => {
      setBuildStartError((e as Error)?.message || 'Could not start the build.');
    }).finally(() => {
      setBuildStarting(false);
    });
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
      ...prospectFields(),
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
              secondaryAction={continueAction() ?? studioAction()}
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
    return (
      <>
        <DeckOutline
          outline={outline}
          onBack={() => setOutline(null)}
          onBuild={buildFromPlan}
          building={buildStarting}
        />
        {buildStartError && (
          <div className="fixed bottom-4 right-4 z-20 max-w-sm rounded-surface border border-error/40 bg-bg-elevated shadow-float px-4 py-3 text-caption text-error animate-slide-up">
            {buildStartError}
          </div>
        )}
      </>
    );
  }

  // ── Intent ──
  return (
    <Shell onBack={onBack} intel={
      <ExamplePrompts typeLabel={activeType.label === 'Auto-detect' ? 'deck' : activeType.label}
        examples={activeType.examples} idx={exampleIdx} onPick={setExampleIdx} onUse={useExample} />
    }>
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

        {/* Prospect (optional) — proposal-only cover data: name + logo on the
            cover slide. Sent as prospect_company / prospect_website. */}
        {showProspectFields && (
          <div className="mt-5">
            <p className="text-caption text-text-muted font-medium mb-1.5">Prospect (optional)</p>
            <p className="text-caption text-text-muted mb-2 leading-relaxed">
              Adds the prospect&#39;s name and logo to the cover.
            </p>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <div className="flex-1">
                <label htmlFor="prospect-company" className="sr-only">Prospect company</label>
                <input id="prospect-company" type="text" value={prospectCompany}
                  onChange={(e) => setProspectCompany(e.target.value)}
                  placeholder="e.g. Meridian Mutual Insurance"
                  className={`w-full rounded-control border border-border bg-bg-secondary px-3.5 py-2 text-body-sm text-text-primary placeholder:text-text-muted outline-none focus:border-border-hover focus:bg-bg-elevated transition-colors ${MOTION} ${FOCUS}`} />
              </div>
              <div className="flex-1">
                <label htmlFor="prospect-website" className="sr-only">Website URL</label>
                <input id="prospect-website" type="text" value={prospectWebsite}
                  onChange={(e) => setProspectWebsite(e.target.value)}
                  placeholder="e.g. https://meridianmutual.com"
                  className={`w-full rounded-control border border-border bg-bg-secondary px-3.5 py-2 text-body-sm text-text-primary placeholder:text-text-muted outline-none focus:border-border-hover focus:bg-bg-elevated transition-colors ${MOTION} ${FOCUS}`} />
              </div>
            </div>
          </div>
        )}

        {/* Brief */}
        <div className="mt-5">
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="deck-brief" className="text-caption text-text-muted font-medium">Brief</label>
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

        {/* Live "agent thinking" — §3.5 phase events drive the status line; the
            canned OUTLINE_PHASES step only during the cold-start gap before the
            first phase arrives. Button → live phases → outline approval, one flow. */}
        {outlinePhase === 'loading' && (
          <RunningPanel label="Drafting the outline…" phases={OUTLINE_PHASES} progress={outlineProgress} />
        )}
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

  // "Edit in studio →" — only once the plan-building continuation is done (it
  // takes priority on the single secondary-action slot) and the caller wired
  // the handoff. Needs the job id (for the edit-op stream) + the result (for
  // the studio's seed: preview_urls + deck_rev).
  function studioAction(): { label: string; onClick: () => void } | undefined {
    if (!onOpenStudio) return undefined;
    const r = editedResult ?? job.result;
    const id = job.jobId;
    if (!r || !id) return undefined;
    return {
      label: 'Edit in studio →',
      onClick: () => onOpenStudio({ jobId: id, seed: r, approvedPlan: builtPlan }),
    };
  }

  function resetAll() {
    setOutline(null); setOutlinePhase('idle'); setOutlineError(''); setOutlineProgress('');
    setBuiltPlan(null); setEditBusy(null); setEditError(null); setEditedResult(null); job.reset();
  }
}

// Shared two-panel shell (back button + left rail identity + right-rail children).
function Shell({ onBack, children, intel }: { onBack: () => void; children: ReactNode; intel?: ReactNode }) {
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
              {intel}
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

/** Tailored teaching panel in the left column: a rotating, clickable example
 *  brief for the selected deck type. Click fills the brief on the right; the dots
 *  page through the type's angles and pin the selection. Teaches, per type, what
 *  a good brief looks like — the deck-builder parallel to the composer's rotating
 *  placeholder. Decorative rotation stops once the field has content. */
function ExamplePrompts({ typeLabel, examples, idx, onPick, onUse }: {
  typeLabel: string;
  examples: string[];
  idx: number;
  onPick: (i: number) => void;
  onUse: (text: string) => void;
}) {
  const safeIdx = Math.min(idx, examples.length - 1);
  const current = examples[safeIdx];
  return (
    <div className="mt-7">
      <p className="text-caption text-text-muted font-medium mb-2">Try a {typeLabel.toLowerCase()} brief</p>
      <button
        type="button"
        onClick={() => onUse(current)}
        aria-label="Use this example brief"
        className={`group block w-full text-left rounded-surface border border-border-light bg-bg-secondary px-3.5 py-3 hover:border-border-hover hover:bg-bg-tertiary transition-colors ${MOTION} ${FOCUS}`}
      >
        <span key={safeIdx} className="animate-placeholder-fade block text-body-sm text-text-secondary leading-relaxed">
          {current}
        </span>
        <span className="mt-2 inline-flex items-center gap-1 text-caption text-text-muted group-hover:text-text-primary transition-colors">
          <Sparkles className="w-3 h-3" strokeWidth={1.75} aria-hidden />
          Use this brief
        </span>
      </button>
      {examples.length > 1 && (
        <div className="mt-2.5 flex items-center gap-1.5" role="tablist" aria-label="Example briefs">
          {examples.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === safeIdx}
              aria-label={`Example ${i + 1}`}
              onClick={() => onPick(i)}
              className={`h-1.5 rounded-full transition-all ${MOTION} ${FOCUS} ${i === safeIdx ? 'w-4 bg-text-muted' : 'w-1.5 bg-border hover:bg-border-hover'}`}
            />
          ))}
        </div>
      )}
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
