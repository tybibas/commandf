import { useState } from 'react';
import { Presentation, Sparkles } from 'lucide-react';
import { generateDeck, generateDeckStatus } from './api';
import { useJob } from './useJob';
import { SurfaceHeader, PendingNote, RunningPanel, ErrorPanel, ResultPanel } from './generationUI';

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-0';
const MOTION = 'duration-fast ease-out-expo';
const INK_BTN = `bg-text-primary text-bg-primary hover:bg-text-primary/90 transition-colors ${MOTION} ${FOCUS}`;

const TYPES = [
  { id: '', label: 'Auto-detect' },
  { id: 'proposal', label: 'Proposal' },
  { id: 'engagement_recap', label: 'Engagement recap' },
  { id: 'pov_memo', label: 'POV memo' },
];

// Full example available as helper text below the textarea
const EXAMPLE =
  "e.g. New mid-market insurer CFO wants a 90-day operating-model review. Pull our Cardinal Mutual and AMERISAFE work; lead with the value-creation thesis, then the workplan and the team.";

const DECK_PHASES = [
  'Drafting the storyline…',
  'Pulling evidence from past work…',
  'Laying out slides…',
];

export default function DeckSurface({
  onBack, clientSlug, sessionId,
}: { onBack: () => void; clientSlug?: string; sessionId?: string | null }) {
  const [brief, setBrief] = useState('');
  const [type, setType] = useState('');
  const job = useJob(generateDeckStatus);
  const busy = job.phase === 'starting' || job.phase === 'running';

  const generate = () => {
    if (!brief.trim() || busy) return;
    job.run(() => generateDeck({
      request: brief.trim(),
      deliverable_type: type || undefined,
      client_slug: clientSlug,
      session_id: sessionId,
    }));
  };

  // Tenant-aware subtitle — neutral fallback for non-Actionist deployments
  const subtitle =
    clientSlug === 'actionist'
      ? "Turn rough notes into a partner-grade Actionist deck, grounded in past work."
      : "Turn rough notes into a partner-grade deck, grounded in past work.";

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="max-w-xl mx-auto px-6 pt-10 pb-6">
        <SurfaceHeader
          icon={Presentation}
          title="Build a deck"
          subtitle={subtitle}
          onBack={onBack}
        />

        <label className="block">
          <span className="text-[11px] uppercase tracking-[0.06em] text-text-muted mb-1.5 block">
            Your notes
          </span>
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={6}
            placeholder="e.g. 90-day operating-model review for a mid-market insurer CFO — pull our Cardinal Mutual work, lead with the value-creation thesis."
            disabled={busy}
            className={`mt-1 w-full resize-y max-h-[50vh] rounded-surface border border-border bg-bg-secondary px-3.5 py-2.5 text-[14px] text-text-primary placeholder:text-text-muted leading-relaxed outline-none focus:border-border-hover transition-colors ${MOTION} ${FOCUS} disabled:opacity-50`}
          />
          <p className="mt-1.5 text-caption text-text-muted">{EXAMPLE}</p>
        </label>

        <div className="mt-4">
          <p className="text-[11px] uppercase tracking-[0.06em] text-text-muted mb-2">Type</p>
          <div className="flex flex-wrap gap-2">
            {TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setType(t.id)}
                disabled={busy}
                className={[
                  'px-3 py-1.5 rounded-control text-caption border transition-colors', MOTION, FOCUS,
                  type === t.id
                    ? 'bg-bg-tertiary border-border-hover text-text-primary'
                    : 'bg-transparent border-border-light text-text-secondary hover:border-border-hover',
                ].join(' ')}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <button
            onClick={generate}
            disabled={!brief.trim() || busy}
            className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-control text-[13px] font-medium disabled:opacity-40 ${INK_BTN}`}
          >
            <Sparkles className="w-4 h-4" /> Generate deck
          </button>
        </div>

        {(job.phase === 'starting' || job.phase === 'running') && (
          <RunningPanel
            label="Building your deck…"
            phases={DECK_PHASES}
          />
        )}
        {job.phase === 'pending' && <PendingNote endpoint="POST /generate-deck" />}
        {job.phase === 'error' && (
          <ErrorPanel message={job.error || 'Generation failed.'} onRetry={generate} />
        )}
        {job.phase === 'complete' && job.result && (
          <ResultPanel result={job.result} kindLabel="Deck" onReset={job.reset} />
        )}
      </div>
    </div>
  );
}
