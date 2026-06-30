import { Search, Presentation, Table2, Sparkles, ArrowUpRight } from 'lucide-react';
import type { Briefing } from './api';
import { timeAgo } from './util';

const MOTION = 'duration-fast ease-out-expo';
const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-0';

export type LandingMode = 'ask' | 'deck' | 'survey';

interface LandingProps {
  loading: boolean;
  briefing: Briefing | null;
  composer: React.ReactNode;          // the shared composer, pinned at the bottom
  suggestions: string[];
  onSelectPrompt: (text: string) => void;
  onMode: (mode: LandingMode) => void;
}

/**
 * The three entry verbs. Deliberately NOT a uniform card grid: Ask is the home
 * action (filled ink), Build and Survey are quieter outlines carrying a format
 * chip (PPTX / XLSX) that signals their input. Each is a distinct product verb,
 * not decorative filler.
 */
function ModeButton({
  icon: Icon, title, sub, chip, primary, onClick,
}: {
  icon: typeof Search; title: string; sub: string; chip?: string; primary?: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'group relative h-full text-left rounded-surface px-4 py-3.5 border transition-all',
        MOTION, FOCUS,
        primary
          ? 'bg-text-primary border-text-primary text-bg-primary hover:bg-text-primary/90'
          : 'bg-bg-secondary border-border-light text-text-primary hover:border-border-hover',
      ].join(' ')}
    >
      <div className="flex items-center gap-2.5">
        <Icon
          className={`w-4 h-4 shrink-0 ${primary ? 'text-bg-primary' : 'text-text-secondary'}`}
          strokeWidth={1.75}
          aria-hidden
        />
        <span className="text-base font-medium leading-none">{title}</span>
        {chip && (
          <span className={`ml-auto font-mono text-micro px-1.5 py-0.5 rounded-control ${
            primary ? 'bg-bg-primary/15 text-bg-primary' : 'bg-bg-tertiary text-text-muted'
          }`}>
            {chip}
          </span>
        )}
      </div>
      <p className={`mt-1.5 text-caption leading-snug ${primary ? 'text-bg-primary/70' : 'text-text-muted'}`}>
        {sub}
      </p>
    </button>
  );
}

export default function Landing({
  loading, briefing, composer, suggestions, onSelectPrompt, onMode,
}: LandingProps) {
  const docs = briefing?.knowledge?.doc_count ?? 0;
  const chunks = briefing?.knowledge?.chunk_count ?? 0;
  const lastSync = briefing?.knowledge?.last_sync_at;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Centred hero — eyebrow, headline, three verbs */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="min-h-full flex flex-col items-center justify-center px-6 py-12">
          <div className="w-full max-w-2xl">
            <div className="text-left mb-9 animate-fade-in">
              <p className="eyebrow text-text-muted mb-3.5">Command F · Institutional memory</p>
              <h1 className="font-outfit text-display font-semibold tracking-tight leading-tight text-text-primary text-balance">
                The firm&#39;s body of work, on call.
              </h1>
              <p className="text-lg text-text-muted mt-3.5 max-w-xl">
                Ask it anything, turn notes into a deck, or build a survey compendium —
                grounded in everything the firm has shipped.
              </p>
              {loading ? (
                <div className="mt-3 h-4 w-64 rounded-control skeleton" aria-hidden />
              ) : (
                <p className="mt-3 text-caption text-text-muted">
                  {docs.toLocaleString()} document{docs === 1 ? '' : 's'} indexed
                  {chunks > 0 && <> · {chunks.toLocaleString()} passages searchable</>}
                  {lastSync && <> · synced {timeAgo(lastSync)}</>}
                </p>
              )}
            </div>

            {/* Three verbs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-stretch animate-slide-up">
              <ModeButton
                icon={Search}
                title="Ask the memory"
                sub="Have we done something like this before?"
                primary
                onClick={() => onMode('ask')}
              />
              <ModeButton
                icon={Presentation}
                title="Build a deck"
                sub="Turn notes into a partner-grade deck"
                chip="PPTX"
                onClick={() => onMode('deck')}
              />
              <ModeButton
                icon={Table2}
                title="Survey deck"
                sub="Excel results into a slide compendium"
                chip="XLSX"
                onClick={() => onMode('survey')}
              />
            </div>

            {/* Suggested prompts — quiet, clickable rows */}
            {suggestions.length > 0 && (
              <div className="mt-8 animate-fade-in" style={{ animationDelay: '120ms' }}>
                <p className="eyebrow text-text-muted mb-2 px-1">Try asking</p>
                <div className="rounded-surface border border-border-light bg-bg-secondary/40 overflow-hidden divide-y divide-border-light">
                  {suggestions.slice(0, 4).map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => onSelectPrompt(q)}
                      className={`group w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-bg-secondary/70 transition-colors ${MOTION} ${FOCUS}`}
                    >
                      <Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0 text-text-muted group-hover:text-text-secondary transition-colors" strokeWidth={1.5} aria-hidden />
                      <span className="flex-1 min-w-0 text-body text-text-secondary group-hover:text-text-primary leading-snug transition-colors">
                        {q}
                      </span>
                      <ArrowUpRight className="w-3.5 h-3.5 mt-0.5 shrink-0 text-text-muted/0 group-hover:text-text-muted transition-colors" strokeWidth={1.5} aria-hidden />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chat bar — pinned at the bottom */}
      <div className="px-6 pb-6 pt-3 shrink-0">
        <div className="max-w-2xl mx-auto">{composer}</div>
      </div>
    </div>
  );
}
