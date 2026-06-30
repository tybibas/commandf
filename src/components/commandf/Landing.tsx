import { Search, Presentation, Table2, ArrowUpRight } from 'lucide-react';
import type { Briefing } from './api';
import { timeAgo } from './util';

const MOTION = 'duration-fast ease-out-expo';
const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-0';

export type LandingMode = 'ask' | 'deck' | 'survey';

interface LandingProps {
  loading: boolean;
  briefing: Briefing | null;
  composer: React.ReactNode;          // the shared composer — the centerpiece on home
  suggestions: string[];
  onSelectPrompt: (text: string) => void;
  onMode: (mode: LandingMode) => void;
}

/**
 * Empty-state home, modeled on ChatGPT / Claude / Perplexity: the composer IS
 * the hero, centered in the viewport. No marketing headline, no large cards —
 * a quiet greeting, the input, then small tool chips and example prompts. When
 * a conversation starts the same composer drops to the bottom (handled by the
 * parent), so the input feels like one continuous object.
 */
function ModeChip({
  icon: Icon, label, chip, onClick,
}: {
  icon: typeof Search; label: string; chip?: string; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'group inline-flex items-center gap-1.5 rounded-full border border-border-light bg-bg-secondary/50',
        'px-3 py-1.5 text-caption text-text-secondary',
        'hover:text-text-primary hover:border-border-hover hover:bg-bg-secondary transition-colors',
        MOTION, FOCUS,
      ].join(' ')}
    >
      <Icon className="w-3.5 h-3.5 text-text-muted group-hover:text-text-secondary transition-colors" strokeWidth={1.75} aria-hidden />
      <span>{label}</span>
      {chip && <span className="font-mono text-micro text-text-muted">{chip}</span>}
    </button>
  );
}

export default function Landing({
  loading, briefing, composer, suggestions, onSelectPrompt, onMode,
}: LandingProps) {
  const docs = briefing?.knowledge?.doc_count ?? 0;
  const lastSync = briefing?.knowledge?.last_sync_at;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto scrollbar-thin">
      <div className="min-h-full flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-2xl">
          {/* Quiet greeting — small and sans, not a marketing hero */}
          <div className="text-center mb-6 animate-fade-in">
            <h1 className="text-xl sm:text-2xl font-medium tracking-tight text-text-primary text-balance">
              What can the firm&#39;s memory tell you?
            </h1>
          </div>

          {/* The composer — the centerpiece */}
          <div className="animate-slide-up">
            {composer}
          </div>

          {/* Tool chips, directly under the input */}
          <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2 animate-fade-in" style={{ animationDelay: '60ms' }}>
            <ModeChip icon={Search} label="Ask the memory" onClick={() => onMode('ask')} />
            <ModeChip icon={Presentation} label="Build a deck" chip="PPTX" onClick={() => onMode('deck')} />
            <ModeChip icon={Table2} label="Survey deck" chip="XLSX" onClick={() => onMode('survey')} />
          </div>

          {/* Example prompts — quiet, clickable rows */}
          {suggestions.length > 0 && (
            <div className="mt-9 animate-fade-in" style={{ animationDelay: '120ms' }}>
              <div className="rounded-surface border border-border-light overflow-hidden divide-y divide-border-light">
                {suggestions.slice(0, 4).map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => onSelectPrompt(q)}
                    className={`group w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-bg-secondary/60 transition-colors ${MOTION} ${FOCUS}`}
                  >
                    <span className="flex-1 min-w-0 text-body text-text-secondary group-hover:text-text-primary leading-snug transition-colors">
                      {q}
                    </span>
                    <ArrowUpRight className="w-3.5 h-3.5 mt-0.5 shrink-0 text-text-muted/0 group-hover:text-text-muted transition-colors" strokeWidth={1.5} aria-hidden />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Knowledge footnote — tiny, unobtrusive */}
          {!loading && (
            <p className="mt-8 text-center text-caption text-text-muted animate-fade-in" style={{ animationDelay: '160ms' }}>
              {docs.toLocaleString()} document{docs === 1 ? '' : 's'} indexed
              {lastSync && <> · synced {timeAgo(lastSync)}</>}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
