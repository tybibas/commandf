import { Search, BookOpen, Sparkles, Loader2, Check } from 'lucide-react';

/**
 * Live "thinking" trail for the chat — a deliberately faded, smaller,
 * rail-indented block (Cursor / Claude / Perplexity style) so it never reads
 * as the answer. It shows the ACCUMULATED steps, not just the current one, so a
 * consultant can actually read what the agent searched instead of catching a
 * single line that flashes past. Driven by live SSE step events from the agent
 * loop (thinking / step / reading / synthesizing); before any land it shows a
 * neutral waiting line, never fabricated phases.
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

export default function ThinkingIndicator({ steps }: { steps?: ThinkingStep[] }) {
  const reduce =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const list = steps ?? [];
  const hasSteps = list.length > 0;
  const currentIdx = list.length - 1;

  return (
    <div className="animate-fade-in py-1" aria-live="polite" role="status">
      {/* Faded "Thinking" header — sets the whole block apart from answer text. */}
      <div className="flex items-center gap-2">
        <Loader2
          className={`w-3 h-3 text-text-muted shrink-0 ${!reduce ? 'animate-spin' : ''}`}
          strokeWidth={2}
          aria-hidden
        />
        <span className="text-caption font-medium text-text-muted">Thinking</span>
      </div>

      {/* The trail: rail-indented, small, faded. Each search stays on screen for
          the rest of the turn so it can be read, not just glimpsed. */}
      <div className="mt-1.5 ml-[5px] flex flex-col gap-1.5 border-l border-border-light pl-3">
        {!hasSteps && (
          <span className="text-caption text-text-muted leading-snug">
            Working through the firm's memory
          </span>
        )}
        {list.map((s, i) => {
          const isCurrent = i === currentIdx;
          const StepIcon = isCurrent ? PHASE_ICON[s.phase] : Check;
          const spin = isCurrent && !reduce; // the latest step is in progress
          return (
            <div key={`${s.phase}-${s.step}-${i}`} className="flex items-start gap-2">
              <StepIcon
                className={`w-3 h-3 mt-[3px] shrink-0 ${
                  isCurrent ? 'text-structure' : 'text-text-muted/60'
                } ${spin ? 'animate-spin' : ''}`}
                strokeWidth={2}
                aria-hidden
              />
              <span
                className={`text-caption leading-snug ${
                  isCurrent ? 'text-text-secondary' : 'text-text-muted'
                }`}
              >
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
