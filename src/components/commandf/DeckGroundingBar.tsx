import { Sparkles, Info, AlertTriangle, History } from 'lucide-react';
import type { StudioSession } from './api';

/**
 * The B-reflection strip (contract §4) at the top of the canvas: a build-format
 * selector on the left and a grounding trust footer on the right, plus the
 * changelog toggle. The trust footer makes the operator's exact complaint visible
 * instead of silent — a client-deliverable build that fell back to general style
 * (fell_back_unfiltered) shows a soft warning rather than quietly using the wrong
 * exemplars. Grounding is NULL on session-open ("pending" — it runs on the next
 * authoring edit); the footer says so instead of implying zero matches.
 */
const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring';

const humanCategory = (c: string) => c.replace(/_/g, ' ');

export default function DeckGroundingBar({
  session, loading, activeFormat, onSelectFormat, formatBusy,
  changesCount, changelogOpen, onToggleChangelog,
}: {
  session: StudioSession | null;
  loading: boolean;
  activeFormat: string;
  onSelectFormat: (format: string) => void;
  formatBusy: boolean;
  changesCount: number;
  changelogOpen: boolean;
  onToggleChangelog: () => void;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-border-light bg-bg-primary px-4 py-2">
      <div className="flex items-center gap-1.5 min-w-0">
        {loading && !session ? (
          <span className="h-6 w-44 rounded-pill skeleton" aria-hidden />
        ) : session ? (
          session.build_format_options.map((o) => {
            const active = o.format === activeFormat;
            return (
              <button
                key={o.format}
                type="button"
                onClick={() => onSelectFormat(o.format)}
                disabled={formatBusy}
                aria-pressed={active}
                className={`text-micro px-2 py-1 rounded-pill border transition-colors disabled:opacity-50 ${FOCUS} ${
                  active
                    ? 'border-structure bg-structure text-structure-ink'
                    : 'border-border-light text-text-secondary hover:text-text-primary hover:border-border-hover'
                }`}
              >
                {o.label}
              </button>
            );
          })
        ) : null}
      </div>

      <div className="flex-1 min-w-0 flex justify-end">
        <TrustFooter session={session} loading={loading} />
      </div>

      {!changelogOpen && (
        <button
          type="button"
          onClick={onToggleChangelog}
          className={`inline-flex items-center gap-1.5 shrink-0 rounded-pill border border-border-light px-2.5 py-1 text-caption text-text-secondary hover:text-text-primary hover:border-border-hover transition-colors ${FOCUS}`}
        >
          <History className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden />
          Changes{changesCount > 0 ? ` (${changesCount})` : ''}
        </button>
      )}
    </div>
  );
}

function TrustFooter({ session, loading }: { session: StudioSession | null; loading: boolean }) {
  if (loading && !session) return <span className="text-micro text-text-muted">Checking grounding…</span>;
  if (!session) return null;

  const g = session.grounding;
  const cat = humanCategory(g.target_category);
  // NULL content_pool / n_matched = grounding hasn't run yet (session-open default).
  const pending = g.content_pool === null || g.style_exemplars.n_matched === null;
  if (pending) {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-micro text-text-muted"
        title="Style grounding runs when you make an edit that authors new content."
      >
        <Info className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden />
        Grounding pending. Runs on the next edit.
      </span>
    );
  }

  if (g.style_exemplars.fell_back_unfiltered === true) {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-micro text-warning"
        title={`No ${cat} exemplars matched, so this build uses general house style.`}
      >
        <AlertTriangle className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden />
        Showing general style. No {cat} exemplars matched.
      </span>
    );
  }

  const n = g.style_exemplars.n_matched ?? 0;
  const names = g.style_exemplars.exemplars.map((e) => e.deck_name).join(', ');
  return (
    <span
      className="inline-flex items-center gap-1.5 text-micro text-verified"
      title={names ? `Grounded in: ${names}` : undefined}
    >
      <Sparkles className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden />
      Grounded in {n} {cat} exemplar{n === 1 ? '' : 's'}
    </span>
  );
}
