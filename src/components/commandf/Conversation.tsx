import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { AlertCircle, Sparkles, Copy, Check, PencilLine } from 'lucide-react';
import CommandFMarkdown from '../CommandFMarkdown';
import { SourceList } from './SourceCard';
import { groupSources } from './util';
import type { Message } from './api';
import ThinkingIndicator, { type ThinkingStep } from './ThinkingIndicator';

/**
 * One assistant answer. Owns its own citation coordination: the set of citation
 * numbers that map to a real source card, a click handler that scrolls the
 * matching card into view and pulses it, and the transient highlight target.
 */
function AssistantMessage({
  m,
  onReuse,
  onBuildDeck,
  isStreaming,
}: { m: Message; onReuse?: (prompt: string) => void; onBuildDeck?: () => void; isStreaming?: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [highlightN, setHighlightN] = useState<number | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout>>();
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout>>();

  const copyResponse = useCallback(() => {
    navigator.clipboard?.writeText(m.content).then(() => {
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1400);
    }).catch(() => {});
  }, [m.content]);

  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);

  // Which citation numbers actually resolve to a grouped source card.
  const citable = useMemo(() => {
    const set = new Set<number>();
    if (m.sources) for (const g of groupSources(m.sources)) if (typeof g.n === 'number') set.add(g.n);
    return set;
  }, [m.sources]);

  const onCiteClick = useCallback((n: number) => {
    const card = rootRef.current?.querySelector<HTMLElement>(`[data-cite="${n}"]`);
    if (!card) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    card.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    setHighlightN(n);
    if (clearTimer.current) clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => setHighlightN(null), 1200);
  }, []);

  useEffect(() => () => { if (clearTimer.current) clearTimeout(clearTimer.current); }, []);

  const hasSources = Boolean(m.sources && m.sources.length > 0);

  return (
    <div ref={rootRef} className="group/turn animate-slide-up">
      {m.error ? (
        <span className="flex items-start gap-2 text-body leading-relaxed text-text-primary">
          <AlertCircle className="w-4 h-4 text-error shrink-0 mt-1" aria-hidden />
          <span className="whitespace-pre-wrap">{m.content}</span>
        </span>
      ) : (
        <>
          {/* Attribution marker — quiet left-aligned label mirrors the right-aligned user bubble.
              The copy affordance surfaces only on hover of this turn. */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5 text-caption text-text-muted">
              <Sparkles className="w-3 h-3 text-accent-ink" strokeWidth={1.75} aria-hidden />
              <span>Command F</span>
            </div>
            {!isStreaming && (
              <button
                type="button"
                onClick={copyResponse}
                aria-label={copied ? 'Copied' : 'Copy response'}
                title="Copy response"
                className="p-1 rounded-control text-text-muted opacity-0 group-hover/turn:opacity-100 focus-visible:opacity-100 hover:text-text-primary hover:bg-bg-tertiary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                {copied ? <Check className="w-3.5 h-3.5" strokeWidth={2} aria-hidden /> : <Copy className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden />}
              </button>
            )}
          </div>
          <div className={`max-w-[72ch] ${isStreaming ? "[&_p:last-child]:after:content-['▍'] [&_p:last-child]:after:inline-block [&_p:last-child]:after:ml-0.5 [&_p:last-child]:after:text-accent [&_p:last-child]:after:animate-pulse" : ''}`}>
            <CommandFMarkdown
              content={m.content}
              onCiteClick={hasSources ? onCiteClick : undefined}
              citable={citable}
            />
          </div>
        </>
      )}
      {hasSources && (
        <SourceList sources={m.sources!} onReuse={onReuse} onBuildDeck={onBuildDeck} highlightN={highlightN} />
      )}
    </div>
  );
}

/**
 * The user's turn. Mirrors Claude/Perplexity: a right-aligned bubble that keeps
 * its line breaks, collapses a long message behind a "Show more" fade so it
 * never dominates the transcript, and reveals quiet copy / edit affordances on
 * hover. "Edit" drops the text back into the composer to re-ask.
 */
function UserMessage({ m, onEdit }: { m: Message; onEdit?: (prompt: string) => void }) {
  const collapsible = m.content.length > 320 || m.content.split('\n').length > 6;
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout>>();
  const collapsed = collapsible && !expanded;

  const copy = useCallback(() => {
    navigator.clipboard?.writeText(m.content).then(() => {
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1400);
    }).catch(() => {});
  }, [m.content]);

  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);

  return (
    <div className="group flex flex-col items-end gap-1 animate-fade-in">
      <div className="relative max-w-[60ch] rounded-surface rounded-br-control px-4 py-2.5 text-body leading-relaxed bg-structure text-structure-ink">
        <div className={`whitespace-pre-wrap break-words ${collapsed ? 'max-h-[8.5rem] overflow-hidden' : ''}`}>
          {m.content}
        </div>
        {collapsed && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="absolute inset-x-0 bottom-0 flex items-end justify-center pb-2 pt-12 rounded-b-surface rounded-br-control bg-gradient-to-t from-structure via-structure to-transparent"
          >
            <span className="text-caption font-medium text-text-secondary hover:text-text-primary bg-bg-elevated px-2 py-0.5 rounded-full border border-border-light shadow-sm transition-colors">Show more</span>
          </button>
        )}
      </div>
      {/* Quiet action row — collapse toggle always available when long; copy/edit on hover. */}
      <div className="flex items-center gap-1 pr-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        {collapsible && expanded && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="text-caption text-text-muted hover:text-text-primary px-1.5 py-0.5 rounded-control transition-colors"
          >
            Show less
          </button>
        )}
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? 'Copied' : 'Copy message'}
          className="p-1 rounded-control text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors"
        >
          {copied ? <Check className="w-3.5 h-3.5" strokeWidth={2} aria-hidden /> : <Copy className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden />}
        </button>
        {onEdit && (
          <button
            type="button"
            onClick={() => onEdit(m.content)}
            aria-label="Edit and re-ask"
            className="p-1 rounded-control text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors"
          >
            <PencilLine className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}

function MessageRow({ m, onReuse, onBuildDeck }: { m: Message; onReuse?: (prompt: string) => void; onBuildDeck?: () => void }) {
  if (m.role === 'user') return <UserMessage m={m} onEdit={onReuse} />;
  return <AssistantMessage m={m} onReuse={onReuse} onBuildDeck={onBuildDeck} />;
}

/** The scrolling transcript. Auto-sticks to the bottom on new content. */
export default function Conversation({ messages, sending, steps, streamDraft, onReuse, onBuildDeck }: { messages: Message[]; sending: boolean; steps?: ThinkingStep[]; streamDraft?: string; onReuse?: (prompt: string) => void; onBuildDeck?: () => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: reduce ? 'auto' : 'smooth',
      });
    });
  }, [messages, sending, steps, streamDraft]);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-8 scrollbar-thin">
      <div className="max-w-prose-tight mx-auto">
        {messages.map((m, i) => {
          // Rhythm: the reply that answers a question sits close to it (tight gap);
          // a new question opens a new exchange (loose gap) — the transcript reads
          // in exchanges, not as one undifferentiated stream.
          const prev = messages[i - 1];
          const gapClass = i === 0
            ? ''
            : prev.role === 'user' && m.role === 'assistant'
              ? 'mt-3'
              : prev.role === 'assistant' && m.role === 'user'
                ? 'mt-10'
                : 'mt-6';
          return (
            <div key={m._key ?? `${m.role}-${i}`} className={gapClass}>
              <MessageRow m={m} onReuse={onReuse} onBuildDeck={onBuildDeck} />
            </div>
          );
        })}
        {sending && (
          <div className={messages.length > 0 ? 'mt-3' : ''}>
            {/* The thinking trail stays visible above the forming answer so the
                two never blur together: faded/indented trail = process, the
                bubble below = the answer streaming in. */}
            {(steps?.length ?? 0) > 0 && (
              <div className="flex justify-start">
                <ThinkingIndicator steps={steps} />
              </div>
            )}
            {streamDraft ? (
              <div className={(steps?.length ?? 0) > 0 ? 'mt-2' : ''}>
                <AssistantMessage
                  m={{ role: 'assistant', content: streamDraft, _key: 'stream-draft' }}
                  onReuse={onReuse}
                  onBuildDeck={onBuildDeck}
                  isStreaming
                />
              </div>
            ) : (steps?.length ?? 0) === 0 ? (
              // Nothing has streamed yet — neutral waiting trail.
              <div className="flex justify-start">
                <ThinkingIndicator steps={steps} />
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
