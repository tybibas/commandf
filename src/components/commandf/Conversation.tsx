import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { AlertCircle, Sparkles } from 'lucide-react';
import CommandFMarkdown from '../CommandFMarkdown';
import { SourceList } from './SourceCard';
import { groupSources } from './util';
import type { Message } from './api';

/**
 * One assistant answer. Owns its own citation coordination: the set of citation
 * numbers that map to a real source card, a click handler that scrolls the
 * matching card into view and pulses it, and the transient highlight target.
 */
function AssistantMessage({
  m,
  onReuse,
  onBuildDeck,
}: { m: Message; onReuse?: (prompt: string) => void; onBuildDeck?: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [highlightN, setHighlightN] = useState<number | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout>>();

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
    <div ref={rootRef} className="animate-slide-up">
      {m.error ? (
        <span className="flex items-start gap-2 text-base leading-relaxed text-text-primary">
          <AlertCircle className="w-4 h-4 text-error shrink-0 mt-1" aria-hidden />
          <span className="whitespace-pre-wrap">{m.content}</span>
        </span>
      ) : (
        <>
          {/* Attribution marker — quiet left-aligned label mirrors the right-aligned user bubble */}
          <div className="flex items-center gap-1.5 mb-2 eyebrow text-text-muted">
            <Sparkles className="w-3 h-3" strokeWidth={1.75} aria-hidden />
            <span>Command F</span>
          </div>
          <CommandFMarkdown
            content={m.content}
            onCiteClick={hasSources ? onCiteClick : undefined}
            citable={citable}
          />
        </>
      )}
      {hasSources && (
        <SourceList sources={m.sources!} onReuse={onReuse} onBuildDeck={onBuildDeck} highlightN={highlightN} />
      )}
    </div>
  );
}

function MessageRow({ m, onReuse, onBuildDeck }: { m: Message; onReuse?: (prompt: string) => void; onBuildDeck?: () => void }) {
  if (m.role === 'user') {
    return (
      <div className="flex justify-end animate-fade-in">
        <div className="max-w-[85%] rounded-surface px-4 py-2.5 text-base leading-relaxed bg-bg-secondary text-text-primary border border-border-light">
          {m.content}
        </div>
      </div>
    );
  }

  return <AssistantMessage m={m} onReuse={onReuse} onBuildDeck={onBuildDeck} />;
}

function TypingIndicator() {
  return (
    <div className="flex justify-start py-2 animate-fade-in">
      <div className="flex items-center gap-2.5 text-caption text-text-muted">
        <span className="flex gap-1">
          {[0, 160, 320].map((d) => (
            <span
              key={d}
              className="w-1.5 h-1.5 rounded-full bg-text-muted/50 typing-dot"
              style={{ animationDelay: `${d}ms` }}
            />
          ))}
        </span>
        <span>searching the firm's work…</span>
      </div>
    </div>
  );
}

/** The scrolling transcript. Auto-sticks to the bottom on new content. */
export default function Conversation({ messages, sending, onReuse, onBuildDeck }: { messages: Message[]; sending: boolean; onReuse?: (prompt: string) => void; onBuildDeck?: () => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: reduce ? 'auto' : 'smooth',
      });
    });
  }, [messages, sending]);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-8 scrollbar-thin">
      <div className="max-w-prose-tight mx-auto space-y-8">
        {messages.map((m, i) => (
          <MessageRow key={`${m.role}-${i}-${m.content.length}`} m={m} onReuse={onReuse} onBuildDeck={onBuildDeck} />
        ))}
        {sending && <TypingIndicator />}
      </div>
    </div>
  );
}
