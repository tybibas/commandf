import React, { useState, useRef, useEffect } from 'react';
import { FileText, ArrowUpRight, ChevronRight, MoreHorizontal, PenLine, GitCompare, Presentation } from 'lucide-react';
import type { Source } from './api';
import { parseDeliverableName, confidenceBand, groupSources, reusePrompt, type GroupedSource } from './util';

const MOTION = 'duration-fast ease-out-expo';
const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring';

// "Use as template" was removed (no-clutter mandate): for the many sources that
// are call notes / interviews / transcripts, "template" is a misnomer, and the
// action was just a composer prefill. "Draft from this" + "Compare to current"
// are honest for any document.
const REUSE_ACTIONS = [
  { key: 'draft' as const, label: 'Draft from this', Icon: PenLine },
  { key: 'compare' as const, label: 'Compare to current', Icon: GitCompare },
];

/** Quiet reuse menu — muted "⋯" trigger that opens the three next-move actions. */
function ReuseMenu({ source, onReuse, flipUp }: { source: Source; onReuse: (prompt: string) => void; flipUp?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Reuse this document"
        className={`inline-flex items-center justify-center h-6 w-6 rounded-control text-text-muted opacity-0 group-hover:opacity-100 data-[open=true]:opacity-100 hover:text-text-primary hover:bg-bg-secondary transition-all ${MOTION} ${FOCUS}`}
        data-open={open}
      >
        <MoreHorizontal className="w-4 h-4" strokeWidth={1.75} aria-hidden />
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute right-0 min-w-[12rem] rounded-surface border border-border-light bg-bg-elevated shadow-float overflow-hidden animate-slide-up p-1 z-20 ${flipUp ? 'bottom-full mb-1.5' : 'top-full mt-1.5'}`}
        >
          {REUSE_ACTIONS.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              role="menuitem"
              onClick={() => { onReuse(reusePrompt(source, key)); setOpen(false); }}
              className={`flex w-full items-center gap-2.5 rounded-control px-2.5 py-2 text-left text-caption text-text-secondary hover:bg-bg-secondary hover:text-text-primary transition-colors ${MOTION} ${FOCUS}`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0 text-text-muted" strokeWidth={1.75} aria-hidden />
              <span>{label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One retrieved DOCUMENT, rendered as a compact row — parsed title / engagement /
 * type / date, the file-type tag, the single best passage, and a relevance
 * caption. When a document contributed more than one passage, a quiet "N passages"
 * affordance expands to list the rest. A muted reuse menu turns the citation into
 * a next move. Sits inside the divided SourceList container.
 */
export function SourceCard({ group, onReuse, highlighted, flipMenuUp }: { group: GroupedSource; onReuse?: (prompt: string) => void; highlighted?: boolean; flipMenuUp?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const best = group.passages[0] ?? ({ file_name: group.file_name } as Source);
  const parsed = parseDeliverableName(group.file_name);
  const band = confidenceBand(group.topSimilarity);
  const hasLink = Boolean(group.link);
  const snippet = best.content ?? best.snippet;
  const extra = group.passages.length - 1; // passages beyond the best one

  const meta = [parsed.client && parsed.title !== parsed.client ? parsed.title : null, parsed.type, parsed.date, parsed.version]
    .filter(Boolean) as string[];

  return (
    <div
      data-cite={group.n ?? undefined}
      className={`group relative px-3.5 py-2.5 transition-all duration-fast cite-target hover:border-border-hover hover:-translate-y-px motion-reduce:hover:translate-y-0 ${highlighted ? 'is-cited bg-source-soft ring-1 ring-inset ring-source' : ''}`}
      style={{ transitionDuration: 'var(--motion-duration-base)' }}
    >
      <div className="flex items-center gap-3">
        {/* Citation index badge */}
        <span className="shrink-0 inline-flex items-center justify-center h-5 min-w-5 px-1 rounded-control border border-border-light bg-bg-elevated font-mono text-micro font-medium text-text-secondary tabular-nums group-hover:border-border-hover transition-colors">
          {group.n ?? '·'}
        </span>

        <FileText className="w-3.5 h-3.5 text-text-muted shrink-0 group-hover:text-text-secondary transition-colors" strokeWidth={1.75} aria-hidden />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex-1 min-w-0 truncate text-body-sm font-medium text-text-primary leading-snug">
              {parsed.client || parsed.title}
            </span>
            {parsed.ext && (
              <span className="shrink-0 font-mono text-micro text-text-muted px-1.5 py-0.5 rounded-control bg-bg-tertiary">
                {parsed.ext}
              </span>
            )}
          </div>

          {meta.length > 0 && (
            <p className="mt-0.5 text-caption text-text-secondary truncate">{meta.join(' · ')}</p>
          )}

          {snippet && (
            <p className="mt-1 text-caption text-text-secondary leading-relaxed line-clamp-2">{snippet}</p>
          )}

          {extra > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className={`mt-1.5 inline-flex items-center gap-1 text-micro text-text-muted hover:text-text-secondary rounded-control transition-colors ${MOTION} ${FOCUS}`}
            >
              <ChevronRight className={`w-3 h-3 transition-transform ${MOTION} ${expanded ? 'rotate-90' : ''}`} strokeWidth={2} aria-hidden />
              {extra + 1} passages
            </button>
          )}
        </div>

        {band && <span className={`shrink-0 text-micro ${band === 'High' ? 'text-verified' : 'text-text-muted'}`}>{band} relevance</span>}

        {onReuse && <ReuseMenu source={best} onReuse={onReuse} flipUp={flipMenuUp} />}

        {hasLink && (
          <a
            href={group.link}
            target="_blank"
            rel="noreferrer"
            aria-label="Open source"
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

      {/* Additional passages — smooth, unobtrusive reveal */}
      {expanded && extra > 0 && (
        <ul className="mt-2 ml-8 pl-3 hairline-l space-y-2 animate-slide-up">
          {group.passages.slice(1).map((p, i) => {
            const text = p.content ?? p.snippet;
            if (!text) return null;
            return (
              <li key={p.chunk_index ?? i} className="text-caption text-text-secondary leading-relaxed">
                {typeof p.chunk_index === 'number' && (
                  <span className="mr-1.5 font-mono text-micro text-text-muted tabular-nums">#{p.chunk_index}</span>
                )}
                <span className="line-clamp-3">{text}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** The "Sources" block rendered beneath an assistant answer. */
export function SourceList({
  sources,
  onReuse,
  onBuildDeck,
  highlightN,
}: {
  sources: Source[];
  onReuse?: (prompt: string) => void;
  // Source-pinning (item 5): hand the deck builder the specific document ids
  // shown here so the deck GROUNDS in these sources instead of re-retrieving the
  // whole corpus. Back-compatible: callers may ignore the argument.
  onBuildDeck?: (fileIds: string[]) => void;
  highlightN?: number | null;
}) {
  const groups = groupSources(sources);
  if (groups.length === 0) return null;

  // Deduped Drive file_ids backing these sources (order preserved).
  const pinnedFileIds = Array.from(
    new Set(sources.map((s) => s.file_id).filter((id): id is string => !!id)),
  );

  return (
    <div className="mt-5 pt-4 hairline-t">
      <p className="text-caption text-text-muted mb-2.5 flex items-center gap-1.5">
        <span>Sources</span>
        <span className="font-mono tabular-nums">{groups.length}</span>
        <span>{groups.length === 1 ? "document from the firm's work" : "documents from the firm's work"}</span>
      </p>
      {/* No `overflow-hidden` here: it clipped the LAST source's reuse menu
          (it opens downward past the container edge). Corners are instead rounded
          on the first/last row so the box still reads as one clean card. */}
      <div className="rounded-surface border border-border-light bg-bg-elevated divide-y divide-hairline [&>*:first-child]:rounded-t-surface [&>*:last-child]:rounded-b-surface">
        {groups.map((g, i) => (
          <SourceCard
            key={g.key}
            group={g}
            onReuse={onReuse}
            highlighted={typeof highlightN === 'number' && g.n === highlightN}
            flipMenuUp={groups.length > 2 && i >= groups.length - 2}
          />
        ))}
      </div>

      {onBuildDeck && (
        <div className="mt-2.5 flex justify-end">
          <button
            type="button"
            onClick={() => onBuildDeck(pinnedFileIds)}
            className={`inline-flex items-center gap-1.5 rounded-control px-1.5 py-1 text-caption text-text-muted hover:text-text-secondary transition-colors ${MOTION} ${FOCUS}`}
          >
            <Presentation className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden />
            <span>Build a deck from these sources</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default SourceList;
