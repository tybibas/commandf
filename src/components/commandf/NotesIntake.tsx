import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, NotebookPen, ShieldCheck, EyeOff, Sparkles, ListChecks, Layers,
} from 'lucide-react';
import {
  extractProposalFields, fetchSlideSelections, EndpointPendingError,
  type ExtractedFields, type SlideSelections,
} from './api';
import { RunningPanel, ErrorPanel, PendingNote } from './generationUI';

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-0';
const MOTION = 'duration-fast ease-out-expo';
const PILL_BTN = `bg-structure text-structure-ink hover:bg-structure-hover active:scale-[0.98] transition-colors ${MOTION} ${FOCUS}`;
const GHOST_BTN = `border border-border-light text-text-primary hover:bg-bg-tertiary transition-colors ${MOTION} ${FOCUS}`;

const CAPABILITIES = [
  { icon: NotebookPen, text: 'Paste notes from any call or intake form' },
  { icon: ShieldCheck, text: 'Every field is verified against your text' },
  { icon: EyeOff, text: "Never invents what it can't confirm" },
];

const EXTRACTING_PHASES = ['Reading your notes…', 'Verifying each fact against the source…'];
const SELECTIONS_PHASES = ['Mapping industry and services…', 'Selecting slides…'];

type Phase = 'idle' | 'extracting' | 'pending' | 'error';
type SelectionsPhase = 'idle' | 'loading' | 'pending' | 'error';

/** Renders a single value, or "—" when absent/empty — never invented text. */
function Field({ label, value }: { label: string; value?: string | null }) {
  const shown = value?.trim();
  return (
    <div>
      <p className="eyebrow text-text-muted">{label}</p>
      <p className={`mt-1 text-body-sm ${shown ? 'text-text-primary' : 'text-text-muted'}`}>
        {shown || '—'}
      </p>
    </div>
  );
}

/** Renders a list as chips, or "—" when absent/empty. */
function ChipList({ label, items }: { label: string; items?: string[] | null }) {
  const list = (items ?? []).filter((s) => s?.trim());
  return (
    <div>
      <p className="eyebrow text-text-muted">{label}</p>
      {list.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {list.map((s, i) => (
            <span
              key={`${s}-${i}`}
              className="inline-flex items-center px-2 py-0.5 rounded-control bg-bg-tertiary text-caption text-text-secondary"
            >
              {s}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-body-sm text-text-muted">—</p>
      )}
    </div>
  );
}

/**
 * Call-notes intake — a sibling to WhiteboardIntake (Workstream C): instead of
 * a whiteboard photo, the consultant pastes raw call/intake notes and
 * POST /proposal-extract-fields turns them into span-verified structured
 * fields. This component owns the FULL two-step flow itself (extract, then
 * optionally fetch slide selections) rather than handing off to DeckSurface —
 * there is no DeckOutline shape here, just a review panel proving what was
 * (and wasn't) verified from the pasted text.
 */
export default function NotesIntake({ onBack }: { onBack: () => void }) {
  const [notes, setNotes] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const [fields, setFields] = useState<ExtractedFields | null>(null);

  const [selectionsPhase, setSelectionsPhase] = useState<SelectionsPhase>('idle');
  const [selectionsError, setSelectionsError] = useState('');
  const [selections, setSelections] = useState<SlideSelections | null>(null);

  // Guards the cancel-ambush (same pattern as WhiteboardIntake): Back is
  // clickable mid-extraction; without this, a resolved extraction after the
  // user already left would still setState into an unmounted surface.
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);

  const canSubmit = notes.trim().length > 0 && phase !== 'extracting';

  const submit = async () => {
    if (!canSubmit) return;
    setPhase('extracting'); setError('');
    setSelections(null); setSelectionsPhase('idle'); setSelectionsError('');
    try {
      const result = await extractProposalFields(notes.trim());
      if (!aliveRef.current) return;
      setFields(result);
      setPhase('idle');
    } catch (e: unknown) {
      if (!aliveRef.current) return;
      if (e instanceof EndpointPendingError) { setPhase('pending'); return; }
      setError((e as Error)?.message || 'Could not extract fields from those notes.');
      setPhase('error');
    }
  };

  const loadSelections = async () => {
    if (!fields || selectionsPhase === 'loading') return;
    const industry = fields.fields?.industry?.trim();
    const serviceNeeds = (fields.fields?.service_needs ?? []).filter((s) => s?.trim());
    if (!industry && serviceNeeds.length === 0) {
      setSelectionsError('No industry or service needs were verified in these notes to map slide selections from.');
      setSelectionsPhase('error');
      return;
    }
    setSelectionsPhase('loading'); setSelectionsError('');
    try {
      const result = await fetchSlideSelections(industry || '', serviceNeeds);
      if (!aliveRef.current) return;
      setSelections(result);
      setSelectionsPhase('idle');
    } catch (e: unknown) {
      if (!aliveRef.current) return;
      if (e instanceof EndpointPendingError) { setSelectionsPhase('pending'); return; }
      setSelectionsError((e as Error)?.message || 'Could not load slide selections.');
      setSelectionsPhase('error');
    }
  };

  const reset = () => {
    setFields(null);
    setSelections(null);
    setSelectionsPhase('idle');
    setSelectionsError('');
  };

  // The textarea view is shown until fields have actually come back — it also
  // owns the extracting/pending/error states for THIS step, since they all
  // happen before there's anything to review.
  const showComposer = !fields;
  const unverified = (fields?.unverified ?? []).filter((s) => s?.trim());

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
                <NotebookPen className="w-5 h-5" strokeWidth={1.5} />
              </span>
              <h1 className="mt-4 font-display text-xl font-light text-text-primary leading-tight">Start from call notes</h1>
              <p className="mt-2 text-body text-text-secondary leading-relaxed">
                Paste raw notes from a client/prospect call. We&#39;ll extract the verified facts &mdash; nothing is invented.
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
              {showComposer ? (
                phase === 'extracting' ? (
                  <RunningPanel label="Extracting fields…" phases={EXTRACTING_PHASES} />
                ) : (
                  <>
                    <label htmlFor="call-notes" className="eyebrow text-text-muted mb-2.5">Paste call notes</label>
                    <textarea
                      id="call-notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={12}
                      placeholder="e.g. Spoke with Jordan Ellis (VP Finance) at Meridian Freight re: a $12M fleet refinance, targeting close by Q1. They run a 40-truck long-haul operation out of Reno…"
                      className={`w-full flex-1 min-h-[220px] resize-y rounded-surface border border-border bg-bg-secondary px-3.5 py-3 text-body-sm text-text-primary placeholder:text-text-muted outline-none focus:border-border-hover transition-colors ${MOTION} ${FOCUS}`}
                    />
                    {phase === 'error' && <div className="mt-1"><ErrorPanel message={error} onRetry={submit} /></div>}
                    {phase === 'pending' && <PendingNote endpoint="POST /proposal-extract-fields" />}

                    <div className="mt-5 flex items-center justify-between gap-3">
                      <span className="text-caption text-text-muted truncate flex items-center gap-1.5">
                        <ListChecks className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
                        {notes.trim() ? `${notes.trim().length.toLocaleString()} characters` : 'Paste notes to begin'}
                      </span>
                      <button
                        type="button" onClick={submit} disabled={!canSubmit}
                        className={`shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-pill text-caption font-medium disabled:opacity-40 ${PILL_BTN}`}
                      >
                        <Sparkles className="w-4 h-4" strokeWidth={1.75} /> Extract fields &rarr;
                      </button>
                    </div>
                  </>
                )
              ) : (
                <div className="flex-1 overflow-y-auto scrollbar-thin -mx-1 px-1">
                  {/* Review panel */}
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <p className="text-caption text-text-muted font-medium">Verified fields</p>
                    <button type="button" onClick={reset} className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-control text-caption ${GHOST_BTN}`}>
                      Start over
                    </button>
                  </div>

                  <div className="rounded-surface border border-border-light bg-bg-secondary/60 p-4 space-y-4">
                    <Field label="Client" value={fields?.fields?.client_name} />

                    <div>
                      <p className="eyebrow text-text-muted">Contacts</p>
                      {(fields?.fields?.client_contacts ?? []).length > 0 ? (
                        <ul className="mt-1.5 space-y-1.5">
                          {(fields?.fields?.client_contacts ?? []).map((c, i) => (
                            <li key={i} className="text-body-sm text-text-primary">
                              {c.name || '—'}
                              {c.title ? <span className="text-text-secondary"> &middot; {c.title}</span> : null}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1 text-body-sm text-text-muted">—</p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <Field label="Deal size" value={fields?.fields?.deal_size} />
                      <Field label="Timeline" value={fields?.fields?.timeline} />
                    </div>
                    <Field label="Financing need" value={fields?.fields?.financing_need} />
                    <Field label="Industry" value={fields?.fields?.industry} />
                    <ChipList label="Segments" items={fields?.fields?.segments} />
                    <ChipList label="Service needs" items={fields?.fields?.service_needs} />
                    <ChipList label="Company facts" items={fields?.fields?.company_facts} />
                  </div>

                  {/* Unverified/dropped — the trust surface. Always rendered once
                      fields have come back, even when empty, so the review panel
                      itself proves the span-gate ran. */}
                  <div className="mt-4 rounded-surface border border-border-light bg-bg-secondary/40 p-4">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <EyeOff className="w-3.5 h-3.5 text-text-muted" strokeWidth={1.75} aria-hidden />
                      <p className="text-caption text-text-muted font-medium">
                        Unverified / dropped ({unverified.length})
                      </p>
                    </div>
                    {unverified.length > 0 ? (
                      <ul className="space-y-1">
                        {unverified.map((u, i) => (
                          <li key={i} className="text-caption text-text-secondary leading-relaxed">{u}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-caption text-text-muted leading-relaxed">
                        Nothing was dropped — every extracted field above was confirmed against the pasted text.
                      </p>
                    )}
                  </div>

                  {/* Step 2 — slide selections */}
                  <div className="mt-6 pt-5 border-t border-hairline">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-caption text-text-muted font-medium">Slide selections</p>
                      {!selections && (
                        <button
                          type="button" onClick={loadSelections} disabled={selectionsPhase === 'loading'}
                          className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-pill text-caption font-medium disabled:opacity-40 ${PILL_BTN}`}
                        >
                          <Layers className="w-3.5 h-3.5" strokeWidth={1.75} />
                          Get slide selections &rarr;
                        </button>
                      )}
                    </div>

                    {selectionsPhase === 'loading' && <RunningPanel label="Loading slide selections…" phases={SELECTIONS_PHASES} />}
                    {selectionsPhase === 'pending' && <PendingNote endpoint="POST /proposal-slide-selections" />}
                    {selectionsPhase === 'error' && <ErrorPanel message={selectionsError} onRetry={loadSelections} />}

                    {selections && (
                      <div className="mt-3 rounded-surface border border-border-light bg-bg-secondary/60 p-4 space-y-4">
                        <ChipList label="Verticals order" items={selections.verticals_order} />
                        <ChipList label="Pillars" items={selections.pillars} />
                        <ChipList label="Bolded services" items={selections.bolded_services} />
                        {selections.pillars_unmapped && (
                          <div className="flex items-center gap-1.5">
                            <EyeOff className="w-3.5 h-3.5 text-warning" strokeWidth={1.75} aria-hidden />
                            <p className="text-caption text-warning leading-relaxed">
                              Industry not mapped &mdash; donor pillars kept
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
