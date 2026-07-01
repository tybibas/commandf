import { useEffect, useRef, useState } from 'react';
import { Search, BookOpen, Sparkles, Loader2, Check } from 'lucide-react';

/**
 * Live "active thinking" indicator for the chat.
 *
 * The agent loop (execution/commandf/agent.py) emits one step event per phase
 * while it works: it thinks, searches the firm's memory (possibly more than
 * once, with the query it used), reads the documents it found, and finally
 * synthesizes the answer. This component renders that stream the way Claude and
 * Perplexity do — a single current line plus a quiet "Completed N steps" count —
 * so a consultant can gauge progress instead of staring at a spinner.
 *
 * Resilience: the backend runs to completion and persists regardless of whether
 * this stream stays open (see the /chat/stream contract). If no live steps
 * arrive (the classic non-streaming /chat path, or a dropped stream), the
 * indicator falls back to a calm, timed progression through the expected phases
 * so the user still sees plausible motion — it never blocks the final answer.
 */

export type StepPhase = 'thinking' | 'step' | 'reading' | 'synthesizing';

export type ThinkingStep = {
  phase: StepPhase;
  /** Monotonic counter for tool steps (0 for non-counted phases). */
  step: number;
  /** Human-facing label, e.g. "Searching the firm's memory: consumer diligence". */
  label: string;
  tool?: string;
  count?: number;
};

const PHASE_ICON: Record<StepPhase, typeof Search> = {
  thinking: Loader2,
  step: Search,
  reading: BookOpen,
  synthesizing: Sparkles,
};

// Timed fallback shown when no live SSE steps are supplied. Mirrors the phases
// the agent loop actually emits, so the fallback and the real stream look the
// same. Durations are gentle; the real answer arriving cancels this entirely.
const FALLBACK_SEQUENCE: { after: number; step: ThinkingStep }[] = [
  { after: 0, step: { phase: 'thinking', step: 0, label: 'Thinking' } },
  { after: 550, step: { phase: 'step', step: 1, label: "Searching the firm's memory" } },
  { after: 1600, step: { phase: 'reading', step: 1, label: 'Reading the documents found', count: 8 } },
  { after: 2500, step: { phase: 'synthesizing', step: 1, label: 'Synthesizing the answer' } },
];

/** Count of discrete tool steps taken so far (the "Completed N steps" number). */
function stepsCompleted(history: ThinkingStep[]): number {
  let max = 0;
  for (const s of history) if (s.phase === 'step' && s.step > max) max = s.step;
  return max;
}

export default function ThinkingIndicator({ steps }: { steps?: ThinkingStep[] }) {
  const reduce =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // Timed fallback state — only used when no live `steps` are provided.
  const [fallback, setFallback] = useState<ThinkingStep[]>([FALLBACK_SEQUENCE[0].step]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const live = Boolean(steps && steps.length);

  useEffect(() => {
    if (live) return; // real stream drives the UI; no fallback timers
    // Reduced motion: reveal the phases immediately, no staggered timers.
    if (reduce) {
      setFallback(FALLBACK_SEQUENCE.map((s) => s.step));
      return;
    }
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setFallback([FALLBACK_SEQUENCE[0].step]);
    for (const { after, step } of FALLBACK_SEQUENCE.slice(1)) {
      timers.current.push(setTimeout(() => setFallback((prev) => [...prev, step]), after));
    }
    return () => timers.current.forEach(clearTimeout);
  }, [live, reduce]);

  const history = live ? steps! : fallback;
  const current = history[history.length - 1];
  const completed = stepsCompleted(history);
  const Icon = PHASE_ICON[current?.phase ?? 'thinking'];
  const spin = current?.phase === 'thinking' || current?.phase === 'synthesizing';

  return (
    <div className="flex flex-col gap-1.5 py-2 animate-fade-in" aria-live="polite" role="status">
      {/* Current line — the one thing the eye tracks. */}
      <div className="flex items-center gap-2.5">
        <Icon
          className={`w-3.5 h-3.5 text-accent-primary shrink-0 ${spin && !reduce ? 'animate-spin' : ''}`}
          strokeWidth={1.9}
          aria-hidden
        />
        <span className="text-caption font-medium text-text-secondary leading-none">
          {current?.label ?? 'Thinking'}
        </span>
        {/* Three-dot pulse trails the label — familiar "still working" affordance. */}
        <span className="flex gap-1 items-center">
          {[0, 160, 320].map((d) => (
            <span
              key={d}
              className="w-1 h-1 rounded-full bg-text-muted/50 typing-dot"
              style={{ animationDelay: `${d}ms` }}
            />
          ))}
        </span>
      </div>

      {/* Completed steps + subtle progress rail. Only once real steps exist. */}
      {completed > 0 && (
        <div className="flex items-center gap-2 pl-6">
          <span className="inline-flex items-center gap-1 text-[0.6875rem] leading-none text-text-muted">
            <Check className="w-3 h-3 text-accent-primary/70" strokeWidth={2.25} aria-hidden />
            Completed {completed} step{completed === 1 ? '' : 's'}
          </span>
          <span className="flex-1 max-w-[7rem] h-px bg-border-light overflow-hidden rounded-full">
            <span
              className="block h-full bg-accent-primary/40 animate-shimmer"
              style={{ width: '100%' }}
            />
          </span>
        </div>
      )}
    </div>
  );
}
