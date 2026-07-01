import React from 'react';
import { FileText, ArrowUpRight } from 'lucide-react';
import type { Source } from './api';
import { parseDeliverableName, confidenceBand } from './util';

const MOTION = 'duration-fast ease-out-expo';

/**
 * A single retrieved deliverable, rendered as a compact list row —
 * deliverable title, parsed engagement / type / date, an optional one-line
 * snippet, and a relevance caption. Sits inside the divided SourceList
 * container; no per-row border or background (those come from the container).
 */
export function SourceCard({ source }: { source: Source }) {
  const parsed = parseDeliverableName(source.file_name);
  const band = confidenceBand(source.similarity);
  const hasLink = Boolean(source.link);

  // Meta line: only the parts we actually have.
  const meta = [parsed.client, parsed.type, parsed.date, parsed.version].filter(Boolean) as string[];

  // Explicit element-type branches avoid `any` without a type change.
  const Wrapper: React.ElementType = hasLink ? 'a' : 'div';
  const wrapperProps = hasLink
    ? { href: source.link, target: '_blank', rel: 'noreferrer' }
    : {};

  return (
    <Wrapper
      {...wrapperProps}
      className={[
        'group relative flex items-center gap-3 px-3.5 py-2.5',
        hasLink
          ? `hover:bg-bg-secondary cursor-pointer transition-colors ${MOTION}`
          : '',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
      ].join(' ')}
    >
      {/* Citation index badge — crisp numbered chip */}
      <span className="shrink-0 inline-flex items-center justify-center h-5 min-w-5 px-1 rounded-control border border-border-light bg-bg-elevated font-num text-micro font-medium text-text-secondary tabular-nums group-hover:border-border-hover transition-colors">
        {source.n ?? '·'}
      </span>

      {/* File icon */}
      <FileText className="w-3.5 h-3.5 text-text-muted shrink-0 group-hover:text-text-secondary transition-colors" strokeWidth={1.75} aria-hidden />

      {/* Row body: title + meta on two lines, flex-1 so it stretches */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex-1 min-w-0 truncate text-body font-medium text-text-primary leading-snug">
            {parsed.client || parsed.title}
          </span>
          {parsed.ext && (
            <span className="shrink-0 font-mono text-micro text-text-muted px-1.5 py-0.5 rounded-control bg-bg-tertiary">
              {parsed.ext}
            </span>
          )}
        </div>

        {meta.length > 0 && (
          <p className="mt-0.5 text-caption text-text-secondary truncate">
            {meta.join(' · ')}
          </p>
        )}

        {source.snippet && (
          <p className="mt-1 text-caption text-text-secondary leading-relaxed line-clamp-2">
            {source.snippet}
          </p>
        )}
      </div>

      {/* Relevance — quiet right-aligned caption instead of low-contrast micro-bars */}
      {band && (
        <span className="shrink-0 text-micro text-text-muted">{band} relevance</span>
      )}

      {/* Link affordance — revealed on hover */}
      {hasLink && (
        <ArrowUpRight
          className={`w-4 h-4 shrink-0 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity ${MOTION}`}
          strokeWidth={1.75}
          aria-hidden
        />
      )}
    </Wrapper>
  );
}

/** The "Sources" block rendered beneath an assistant answer. */
export function SourceList({ sources }: { sources: Source[] }) {
  const valid = sources.filter((s) => s.file_name || s.link);
  if (valid.length === 0) return null;

  return (
    <div className="mt-5 pt-4 hairline-t">
      <p className="eyebrow text-text-muted mb-2.5 flex items-center gap-1.5">
        <span>Sources</span>
        <span className="font-num tabular-nums text-text-muted/70">{valid.length}</span>
        <span className="text-text-muted/60">from the firm&#39;s work</span>
      </p>
      {/* Divided list — single elevated container with hairline dividers between rows */}
      <div className="rounded-surface border border-border-light bg-bg-elevated divide-y divide-hairline overflow-hidden">
        {valid.map((s, i) => (
          <SourceCard key={s.file_id ?? `${s.n}-${i}`} source={s} />
        ))}
      </div>
    </div>
  );
}

export default SourceList;
