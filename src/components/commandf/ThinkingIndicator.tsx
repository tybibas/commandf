import { Search, BookOpen, Sparkles, Loader2, Check } from 'lucide-react';

/**
 * Live "active thinking" indicator for the chat.
 *
 * When live SSE step events arrive from the agent loop, they drive the label
 * (the backend emits: thinking, step/search, reading, synthesizing). When no
 * live steps have arrived yet, a neutral "Working on it..." waiting line is
 * shown — no fabricated narration about phases that haven't been confirmed.
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

  const live = Boolean(steps && steps.length);
  const current = live ? steps![steps!.length - 1] : null;
  const completed = live ? stepsCompleted(steps!) : 0;
  const Icon = current ? PHASE_ICON[current.phase] : Loader2;
  const spin = !current || current.phase === 'thinking' || current.phase === 'synthesizing';

  return (
    <div className="flex flex-col gap-1.5 py-2 animate-fade-in" aria-live="polite" role="status">
      {/* Current line — the one thing the eye tracks. */}
      <div className="flex items-center gap-2.5">
        <Icon
          className={`w-3.5 h-3.5 text-structure shrink-0 ${spin && !reduce ? 'animate-spin' : ''}`}
          strokeWidth={1.9}
          aria-hidden
        />
        <span className="text-caption font-medium text-text-secondary leading-none">
          {current?.label ?? 'Working on it'}
        </span>
        {/* Three-dot pulse trails the label — familiar "still working" affordance. */}
        <span className="flex gap-1 items-center" aria-hidden>
          {[0, 160, 320].map((d) => (
            <span
              key={d}
              className="w-1 h-1 rounded-full bg-text-muted/50 typing-dot"
              style={{ animationDelay: `${d}ms` }}
            />
          ))}
        </span>
      </div>

      {/* Completed steps + subtle progress rail. Only once real live steps exist. */}
      {completed > 0 && (
        <div className="flex items-center gap-2 pl-6">
          <span className="inline-flex items-center gap-1 text-micro leading-none text-text-muted">
            <Check className="w-3 h-3 text-verified" strokeWidth={2.25} aria-hidden />
            Completed {completed} step{completed === 1 ? '' : 's'}
          </span>
          <span className="flex-1 max-w-[7rem] h-px bg-border-light overflow-hidden rounded-full">
            <span
              className="block h-full bg-accent/40 animate-shimmer"
              style={{ width: '100%' }}
            />
          </span>
        </div>
      )}
    </div>
  );
}
