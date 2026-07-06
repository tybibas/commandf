import { Sparkles } from 'lucide-react';

const MOTION = 'duration-fast ease-out-expo';
const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-0';

/**
 * The Actionist mark, inlined (not an <img>) so it can take `currentColor` —
 * the only clean way to land it on the accent orange without a lossy CSS
 * filter hack. Geometry copied verbatim from public/actionist-logo.svg;
 * fill swapped to currentColor. Used ONLY here on the landing hero — the
 * sidebar footer keeps the neutral <img> wordmark at rest.
 */
function ActionistMark({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 451.7 66.2" role="img" aria-label="Actionist" className={className}>
      <svg x="0" y="3.55" width="71.7" height="59.1" viewBox="0 0 71.7 59.1"><path fill="currentColor" d="M29.5 59.1h-8.4V44.6c0-1.3 1.1-2.4 2.4-2.4H38v8.4h-6.1c-1.3 0-2.4 1.1-2.4 2.4v6.1zM29.5 38h-8.4V23.5c0-1.3 1.1-2.4 2.4-2.4H38v8.4h-6.1c-1.3 0-2.4 1.1-2.4 2.4V38zM50.6 38h-8.4V23.5c0-1.3 1.1-2.4 2.4-2.4h14.5v8.4H53c-1.3 0-2.4 1.1-2.4 2.4V38zM71.7 38h-8.4V21.1h6.1c1.3 0 2.4 1.1 2.4 2.4V38zM50.6 59.1h-8.4V44.6c0-1.3 1.1-2.4 2.4-2.4h14.5v8.4H53c-1.3 0-2.4 1.1-2.4 2.4v6.1zM8.4 59.1H0V44.6c0-1.3 1.1-2.4 2.4-2.4h14.5v8.4h-6.1c-1.3 0-2.4 1.1-2.4 2.4v6.1zM71.7 59.1h-8.4V42.2h6.1c1.3 0 2.4 1.1 2.4 2.4v14.5zM50.6 16.9h-8.4V2.4c0-1.3 1.1-2.4 2.4-2.4h14.5v8.4H53c-1.3 0-2.4 1.1-2.4 2.4v6.1zM71.7 16.9h-8.4V0h6.1c1.3 0 2.4 1.1 2.4 2.4v14.5z"></path></svg>
      <svg x="93.7" y="0" width="358" height="66.2" viewBox="0 0 358 66.2"><g fill="currentColor"><path d="M48.6 65.2l-6.8-18.1H16.9L10 65.2H0L23.7 4.5H35l23.7 60.6H48.6zM20.4 38.7h17.9l-9-24.9-8.9 24.9zM105.7 51c-.6 3.9-2.3 7.4-5.5 10.3-3.1 2.9-8.4 4.8-14.5 4.8-8 0-14.3-2.9-17.9-7.4-3.5-4.6-5.2-10-5.2-16 0-5.9 1.7-11.4 5.2-15.9 3.6-4.5 9.7-7.3 17.5-7.3 6.3 0 11.4 1.7 14.5 4.8 3.1 3 4.9 6.3 5.7 10.2l-9 2.1c-.5-2.7-1.7-4.8-3.5-6.5-1.8-1.7-4.3-2.6-7.6-2.6-4.3 0-7.6 1.9-9.5 4.8-1.9 2.9-2.7 6.4-2.7 10.4S74 50 76 53c1.9 2.9 5.4 4.8 9.9 4.8 6 0 9.6-3 10.7-9l9.1 2.2zM119.6 7.6h8.8v13h10.5V29h-10.5v18c0 4.2.6 6.9 1.8 8.3 1.2 1.4 3.3 2 6.4 2h2.3v8.3h-2.6c-1.9 0-3.6-.1-5-.3-1.4-.2-2.9-.6-4.5-1.1-1.7-.6-3-1.5-4.1-2.6-2.2-2.2-3.7-6.3-3.7-11.9V28.9h-8v-8.4c4 0 6.1-.4 7.3-1.9 1.2-1.5 1.4-3.1 1.4-6.3V7.6zM158.3 6.5c0 1.8-.6 3.3-2 4.6-1.3 1.3-2.8 1.9-4.5 1.9-1.7 0-3.3-.6-4.6-1.9-1.3-1.3-1.9-2.8-1.9-4.6 0-1.8.6-3.4 1.9-4.6C148.5.7 150 0 151.8 0c1.7 0 3.3.6 4.5 1.9 1.4 1.2 2 2.7 2 4.6zm-1.7 14v44.6h-9.5V20.5h9.5zM188.4 19.6c3.8 0 7.2.7 10.2 2 6 2.7 9.3 7.4 11.2 12.8s1.8 11.4 0 16.8-5.2 10.1-11.2 12.9c-3 1.4-6.4 2-10.2 2-3.8 0-7.2-.7-10.2-2-5.9-2.8-9.3-7.5-11.1-12.9-1.7-5.4-1.7-11.4 0-16.8 1.8-5.4 5.2-10.2 11.1-12.8 3-1.3 6.4-2 10.2-2zm0 38.3c2.7 0 5.1-.8 7-2.3 1.9-1.6 3.3-3.4 4-5.6.8-2.2 1.2-4.6 1.2-7.2 0-5.3-1.4-9.8-5.2-12.8-1.9-1.6-4.2-2.3-7-2.3-2.7 0-5.1.8-7 2.3-1.9 1.5-3.2 3.4-4 5.6-.8 2.2-1.2 4.6-1.2 7.2 0 5.2 1.4 9.7 5.2 12.8 1.9 1.5 4.3 2.3 7 2.3zM255.1 25.9c2.7 3.9 3.8 8.5 3.8 14v25.3h-9.6V41.7c0-9-3.4-13.6-10.1-13.6-7.3 0-11.2 6.2-11.2 17v20h-9.6V20.5h9.6v5.9c3-4.6 7.3-6.9 12.9-6.9 6.7 0 11.5 2.4 14.2 6.4zM280.6 6.5c0 1.8-.6 3.3-2 4.6-1.3 1.3-2.8 1.9-4.5 1.9-1.7 0-3.3-.6-4.6-1.9-1.3-1.3-1.9-2.8-1.9-4.6 0-1.8.6-3.4 1.9-4.6 1.3-1.2 2.8-1.9 4.6-1.9 1.7 0 3.3.6 4.5 1.9 1.4 1.2 2 2.7 2 4.6zm-1.7 14v44.6h-9.5V20.5h9.5zM301.2 35.5c2.5 1.9 6.5 2.5 10.9 4 2.2.7 4.2 1.5 6.1 2.4 3.8 1.7 6.7 5.6 6.7 10.8 0 3.7-1.5 6.9-4.4 9.6-2.9 2.6-7.3 4-13.2 4-10.5 0-16.9-4.3-19.3-13l8.4-2.8c2 5.4 4.8 8.1 10.5 8.1 4.8 0 8.2-1.8 8.2-5.7 0-1.6-.6-2.8-1.9-3.9-1.3-1-2.9-1.8-4.8-2.3-1.9-.5-4-1.1-6.2-1.7-2.2-.7-4.3-1.4-6.2-2.2-3.8-1.6-6.7-5-6.7-9.9 0-4.4 1.6-7.7 4.8-10 3.2-2.3 7.4-3.4 12.4-3.4 8.9 0 14.5 3.8 16.9 11.3l-8.3 2.8c-.9-2.2-1.9-3.9-3.1-5-1.2-1.1-3-1.7-5.3-1.7-2 0-3.8.4-5.2 1.3-1.4.9-2.1 2.2-2.1 3.8-.1 1.4.5 2.5 1.8 3.5zM338.7 7.6h8.8v13H358V29h-10.5v18c0 4.2.6 6.9 1.8 8.3 1.2 1.4 3.3 2 6.4 2h2.3v8.3h-2.6c-1.9 0-3.6-.1-5-.3-1.4-.2-2.9-.6-4.5-1.1-1.7-.6-3-1.5-4.1-2.6-2.2-2.2-3.7-6.3-3.7-11.9V28.9h-8v-8.4c4 0 6.1-.4 7.3-1.9 1.2-1.5 1.4-3.1 1.4-6.3V7.6z"></path></g></svg>
    </svg>
  );
}

type IconType = React.ComponentType<{ className?: string; strokeWidth?: number }>;

export interface QuickAction {
  label: string;
  icon: IconType;
  onClick: () => void;
}

/** One landing example card (W6.1) — a real question, not a fabricated one,
 * that pre-fills the composer on click. See DESIGN.md §3 "Example card". */
export interface ExampleCard {
  category: string;
  question: string;
  description: string;
  onClick: () => void;
}

interface LandingProps {
  loading: boolean;
  /** Time-aware serif greeting, e.g. "Good evening". */
  greeting: string;
  /** Workspace/context label, e.g. "Actionist Consulting". */
  contextLabel: string;
  /** Workspace logo (Actionist wordmark) — shown in the chip when provided. */
  logoSrc?: string;
  composer: React.ReactNode;
  /** The tool's single primary action — house rule: one primary per view. */
  buildDeckAction: QuickAction;
  /** Three example questions under the composer, replacing the old chip row. */
  exampleCards: ExampleCard[];
  docCount: number;
  lastSync?: string | null;
}

/**
 * Empty-state home. Emulates Claude: a small workspace chip, a centered serif
 * greeting, the composer card as the hero, and a quiet row of quick-action
 * chips. No boxes, no clutter — the input is the only elevated object.
 */
export default function Landing({
  loading, greeting, contextLabel, logoSrc, composer, buildDeckAction, exampleCards, docCount, lastSync,
}: LandingProps) {
  const DeckIcon = buildDeckAction.icon;
  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto scrollbar-thin">
      <div className="min-h-full flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-2xl">
          {/* Workspace identity — the tenant's logo when we have one, else a quiet
              chip. Distilled from Claude's org chip above the greeting. */}
          {logoSrc ? (
            <div className="flex justify-center mb-6 animate-fade-in">
              {/* W5.4 — the mark reads plum chrome at rest everywhere else in the
                  app; here on the hero it carries the one accent orange, inlined
                  as SVG (currentColor) rather than a filter hack on the <img>. */}
              <ActionistMark className="h-5 w-auto text-accent-ink select-none" />
            </div>
          ) : contextLabel && (
            <div className="flex justify-center mb-5 animate-fade-in">
              <span className="inline-flex items-center gap-1.5 rounded-pill bg-bg-secondary border border-border-light px-2.5 py-1 text-caption text-text-secondary">
                <Sparkles className="w-3 h-3 text-accent" strokeWidth={1.75} aria-hidden />
                {contextLabel}
              </span>
            </div>
          )}

          {/* Serif greeting — Claude "Evening, Ty" */}
          <div className="text-center mb-7 animate-fade-in" style={{ animationDelay: '40ms' }}>
            <h1 className="font-display font-light text-2xl tracking-[-0.02em] text-text-primary leading-tight">
              {greeting}
            </h1>
          </div>

          {/* The composer card — the centerpiece */}
          <div className="animate-slide-up">
            {composer}
          </div>

          {/* The one primary action (house rule): "Build a deck" leads in plum
              (the structure color), distinct from everything below it. */}
          <div className="mt-4 flex justify-center animate-fade-in" style={{ animationDelay: '80ms' }}>
            <button
              type="button"
              onClick={buildDeckAction.onClick}
              className={`group inline-flex items-center gap-1.5 rounded-pill bg-structure px-3.5 py-1.5 text-caption font-medium text-structure-ink hover:bg-structure-hover transition-colors ${MOTION} ${FOCUS}`}
            >
              <DeckIcon className="w-3.5 h-3.5 text-structure-ink" strokeWidth={1.75} />
              {buildDeckAction.label}
            </button>
          </div>

          {/* Example cards (W6.1) — real questions, not chips, that teach what
              the firm's memory can answer. Click pre-fills the composer. */}
          {exampleCards.length > 0 && (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 animate-fade-in" style={{ animationDelay: '110ms' }}>
              {exampleCards.map(({ category, question, description, onClick }) => (
                <button
                  key={question}
                  type="button"
                  onClick={onClick}
                  className={`group text-left bg-bg-elevated border border-border-light rounded-surface p-4 hover:border-border-hover hover:-translate-y-px transition-all ${MOTION} ${FOCUS}`}
                >
                  <p className="text-caption text-text-muted">{category}</p>
                  <p className="mt-1.5 text-body-sm font-medium text-text-primary leading-snug line-clamp-2">{question}</p>
                  <p className="mt-1 text-caption text-text-muted leading-relaxed">{description}</p>
                </button>
              ))}
            </div>
          )}

          {/* Knowledge footnote — tiny, unobtrusive */}
          {!loading && (
            <p className="mt-10 text-center text-caption text-text-muted animate-fade-in" style={{ animationDelay: '140ms' }}>
              <span className="font-mono tabular-nums">{docCount.toLocaleString()}</span> document{docCount === 1 ? '' : 's'} indexed
              {lastSync && <> · synced {lastSync}</>}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
