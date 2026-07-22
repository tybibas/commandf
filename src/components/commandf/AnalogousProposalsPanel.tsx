import { useState } from 'react';
import { FileText, ArrowUpRight, ChevronDown } from 'lucide-react';
import type { AnalogousProposal } from './api';

const MOTION = 'duration-fast ease-out-expo';
const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring';

/**
 * The reference trail behind a built deck's scope section: real past Actionist
 * proposals whose scope-of-activities language grounded the generated scope.
 * A quiet, collapsible strip under the grounding bar — a supporting reference
 * element, not a hero (DESIGN.md: one orange per view, this uses source-blue,
 * matching the citation semantics SourceCard already established).
 *
 * Absent/empty `proposals` renders nothing but a single quiet line — never a
 * fabricated entry, never an empty box. `deck_ref` is a real Drive link/ref
 * from the backend; it is only wrapped as a clickable link when it looks like
 * a URL (defends against a bare id/path rendering as a broken anchor).
 */
export default function AnalogousProposalsPanel({ proposals }: { proposals?: AnalogousProposal[] }) {
  const [open, setOpen] = useState(false);

  if (!proposals || proposals.length === 0) return null;

  const n = proposals.length;

  return (
    <div className="border-b border-border-light bg-bg-primary">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex w-full items-center gap-1.5 px-4 py-2 text-caption text-text-muted hover:text-text-secondary transition-colors ${MOTION} ${FOCUS}`}
      >
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${MOTION} ${open ? 'rotate-180' : ''}`} strokeWidth={1.75} aria-hidden />
        <span>Analogous past proposals</span>
        <span className="font-mono tabular-nums">{n}</span>
      </button>

      {open && (
        <div className="px-4 pb-3 animate-slide-up">
          <p className="mb-2 text-caption text-text-muted">
            The scope section drew on language from these past engagements.
          </p>
          <div className="rounded-surface border border-border-light bg-bg-elevated divide-y divide-hairline [&>*:first-child]:rounded-t-surface [&>*:last-child]:rounded-b-surface">
            {proposals.map((p, i) => (
              <AnalogousProposalRow key={p.deck_ref || i} proposal={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AnalogousProposalRow({ proposal }: { proposal: AnalogousProposal }) {
  const isLink = /^https?:\/\//.test(proposal.deck_ref || '');

  return (
    <div className="group flex items-start gap-3 px-3.5 py-2.5">
      <span className="shrink-0 mt-0.5 inline-flex items-center justify-center w-6 h-6 rounded-control bg-source-soft">
        <FileText className="w-3.5 h-3.5 text-source" strokeWidth={1.75} aria-hidden />
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex-1 min-w-0 truncate text-body-sm font-medium text-text-primary leading-snug">
            {proposal.title}
          </span>
          {isLink && (
            <a
              href={proposal.deck_ref}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open ${proposal.title}`}
              className={`shrink-0 inline-flex ${FOCUS} rounded-control`}
            >
              <ArrowUpRight
                className={`w-4 h-4 text-text-muted opacity-0 group-hover:opacity-100 hover:text-text-primary transition-all ${MOTION}`}
                strokeWidth={1.75}
                aria-hidden
              />
            </a>
          )}
        </div>
        {proposal.why_matched && (
          <p className="mt-1 text-caption text-text-secondary leading-relaxed">{proposal.why_matched}</p>
        )}
      </div>
    </div>
  );
}
