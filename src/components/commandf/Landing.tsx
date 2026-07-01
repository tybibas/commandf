import { Sparkles } from 'lucide-react';

const MOTION = 'duration-fast ease-out-expo';
const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-0';

type IconType = React.ComponentType<{ className?: string; strokeWidth?: number }>;

export interface QuickAction {
  label: string;
  icon: IconType;
  onClick: () => void;
}

interface LandingProps {
  loading: boolean;
  /** Time-aware serif greeting, e.g. "Good evening". */
  greeting: string;
  /** Workspace/context label, e.g. "Actionist Consulting". */
  contextLabel: string;
  composer: React.ReactNode;
  quickActions: QuickAction[];
  docCount: number;
  lastSync?: string | null;
}

/**
 * Empty-state home. Emulates Claude: a small workspace chip, a centered serif
 * greeting, the composer card as the hero, and a quiet row of quick-action
 * chips. No boxes, no clutter — the input is the only elevated object.
 */
export default function Landing({
  loading, greeting, contextLabel, composer, quickActions, docCount, lastSync,
}: LandingProps) {
  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto scrollbar-thin">
      <div className="min-h-full flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-2xl">
          {/* Workspace chip — distilled from Claude's org chip above the greeting */}
          {contextLabel && (
            <div className="flex justify-center mb-5 animate-fade-in">
              <span className="inline-flex items-center gap-1.5 rounded-pill bg-bg-secondary border border-border-light px-2.5 py-1 text-caption text-text-secondary">
                <Sparkles className="w-3 h-3 text-text-muted" strokeWidth={1.75} aria-hidden />
                {contextLabel}
              </span>
            </div>
          )}

          {/* Serif greeting — Claude "Evening, Ty" */}
          <div className="text-center mb-7 animate-fade-in" style={{ animationDelay: '40ms' }}>
            <h1 className="font-serif text-[32px] sm:text-[40px] font-normal tracking-[-0.02em] text-text-primary leading-tight">
              {greeting}
            </h1>
          </div>

          {/* The composer card — the centerpiece */}
          <div className="animate-slide-up">
            {composer}
          </div>

          {/* Quick actions — flat chips, distilled from Claude's Write / Strategize row */}
          {quickActions.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 animate-fade-in" style={{ animationDelay: '80ms' }}>
              {quickActions.map(({ label, icon: Icon, onClick }) => (
                <button
                  key={label}
                  type="button"
                  onClick={onClick}
                  className={`group inline-flex items-center gap-1.5 rounded-pill border border-border-light bg-bg-primary px-3 py-1.5 text-caption text-text-secondary hover:text-text-primary hover:border-border-hover hover:bg-bg-secondary transition-colors ${MOTION} ${FOCUS}`}
                >
                  <Icon className="w-3.5 h-3.5 text-text-muted group-hover:text-text-secondary transition-colors" strokeWidth={1.75} />
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Knowledge footnote — tiny, unobtrusive */}
          {!loading && (
            <p className="mt-10 text-center text-caption text-text-muted/80 animate-fade-in" style={{ animationDelay: '140ms' }}>
              {docCount.toLocaleString()} document{docCount === 1 ? '' : 's'} indexed
              {lastSync && <> · synced {lastSync}</>}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
