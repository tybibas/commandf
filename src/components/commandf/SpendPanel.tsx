import { useEffect, useState } from 'react';
import { Coins, RefreshCw, Lightbulb, AlertCircle } from 'lucide-react';
import { fetchCostSummary, EndpointPendingError, type CostSummary } from './api';
import { SurfaceHeader } from './generationUI';

/**
 * Spend — a discrete, read-only view of Anthropic usage from the cost ledger
 * (commandf_query_costs). Leads with RECURRING Anthropic spend (chat + deck) as the
 * live number; the one-time corpus-embedding cost is shown separately so it never
 * inflates the run-rate. Forecast + the single recommendation are DERIVED from the
 * payload (not hardcoded) so they stay accurate as the ledger grows. Consumes the
 * proposed GET /costs; degrades to a calm "pending" state until the backend ships it.
 */
const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring';
const usd = (n: number) => `$${n.toFixed(2)}`;
const usd3 = (n: number) => `$${n.toFixed(3)}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDate = (iso: string) => {
  const [, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${MONTHS[(m || 1) - 1]} ${d}`;
};

function forecastMonthly(s: CostSummary): number | null {
  const start = Date.parse(s.since), end = Date.parse(s.updated_at);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const days = Math.max(1, (end - start) / 86_400_000);
  return (s.totals.anthropic / days) * 30; // recurring only — excludes one-time embeddings
}

function recommendation(s: CostSummary): string {
  const haiku = s.by_model.find((m) => m.label.startsWith('Haiku'));
  const sonnet = s.by_model.find((m) => m.label.startsWith('Sonnet'));
  const parts: string[] = [];
  if (sonnet && sonnet.rows > 0 && haiku && haiku.rows > 0) {
    parts.push(`Deck edits (Sonnet) are the priciest action at ~${usd3(sonnet.usd / sonnet.rows)}/call vs ~${usd3(haiku.usd / haiku.rows)} on Haiku; batch edits into one turn to amortize.`);
  }
  if (haiku && haiku.cache_write_tokens > 0) {
    const ratio = haiku.cache_read_tokens / haiku.cache_write_tokens;
    parts.push(ratio >= 3
      ? `Cache reuse is ${ratio.toFixed(1)}:1, healthy.`
      : `Cache reuse is ${ratio.toFixed(1)}:1; a turn-level cache breakpoint would cut chat cost.`);
  }
  return parts.join(' ') || 'Spend is well within budget.';
}

export default function SpendPanel({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<CostSummary | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'pending' | 'error'>('loading');
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let live = true;
    fetchCostSummary()
      .then((d) => { if (live) { setData(d); setState('ready'); } })
      .catch((e) => { if (live) setState(e instanceof EndpointPendingError ? 'pending' : 'error'); });
    return () => { live = false; };
  }, [nonce]);

  const reload = () => { if (!data) setState('loading'); setNonce((n) => n + 1); };
  const monthly = data ? forecastMonthly(data) : null;
  const maxDaily = data ? Math.max(...data.daily.map((d) => d.anthropic_usd), 0.0001) : 1;

  return (
    <div className="flex-1 min-h-0 flex flex-col px-6 pt-4 md:px-7">
      <SurfaceHeader
        icon={Coins}
        title="Spend"
        subtitle={data ? `Anthropic usage since ${shortDate(data.since)}` : 'Anthropic usage'}
        onBack={onBack}
      />

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
        <div className="max-w-xl mx-auto pb-12">
          {state === 'loading' && (
            <div className="mt-8 space-y-4" aria-busy>
              <div className="h-12 w-40 rounded-surface skeleton" />
              <div className="h-16 w-full rounded-surface skeleton" />
            </div>
          )}

          {state === 'pending' && (
            <p className="mt-8 text-body-sm text-text-muted leading-relaxed">
              Spend tracking lights up once the ledger endpoint is live. The data is being recorded now; this view will populate automatically.
            </p>
          )}

          {state === 'error' && (
            <div className="mt-8 flex items-center justify-between gap-3 rounded-surface border border-border-light bg-bg-secondary px-4 py-3">
              <span className="flex items-center gap-2 text-body-sm text-text-secondary">
                <AlertCircle className="w-4 h-4 text-error" strokeWidth={1.75} aria-hidden />
                Couldn't load spend. It may be a temporary connection issue.
              </span>
              <button type="button" onClick={reload} className={`shrink-0 text-caption text-text-primary hover:text-accent-ink px-2 py-1 rounded-control ${FOCUS}`}>Retry</button>
            </div>
          )}

          {state === 'ready' && data && (
            <>
              {/* Hero — recurring Anthropic spend is the live figure. */}
              <div className="mt-7 flex items-start justify-between gap-4">
                <div>
                  <p className="eyebrow">Anthropic spend</p>
                  <p className="data-value text-text-primary mt-1">{usd(data.totals.anthropic)}</p>
                  <p className="text-caption text-text-muted mt-1.5">
                    {usd(data.totals.all_time)} all-time · {usd(data.totals.embedding)} one-time corpus embeddings · {usd(data.totals.last_24h)} last 24h
                  </p>
                </div>
                <button type="button" onClick={reload} aria-label="Refresh spend" title="Refresh"
                  className={`shrink-0 p-1.5 rounded-control text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors ${FOCUS}`}>
                  <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden />
                </button>
              </div>

              {/* Daily trend — recurring Anthropic only (the embedding day is excluded from the bars). */}
              <div className="mt-8">
                <div className="flex items-baseline justify-between">
                  <p className="eyebrow">Daily · recurring</p>
                  <p className="text-micro text-text-muted">{data.daily.length} days</p>
                </div>
                <div className="mt-3 flex items-end gap-1.5 h-16">
                  {data.daily.map((d) => (
                    <div key={d.date} className="flex-1 flex flex-col justify-end h-full" title={`${shortDate(d.date)}: ${usd3(d.anthropic_usd)}`}>
                      <div
                        className="w-full rounded-t-sm bg-structure hover:bg-structure-hover transition-colors"
                        style={{ height: `${Math.max(3, (d.anthropic_usd / maxDaily) * 100)}%` }}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-1.5 flex justify-between text-micro text-text-muted">
                  <span>{shortDate(data.daily[0].date)}</span>
                  <span>{shortDate(data.daily[data.daily.length - 1].date)}</span>
                </div>
                {monthly != null && (
                  <p className="mt-3 text-caption text-text-secondary">
                    ≈ {usd(monthly)}/mo at the current pace{' '}
                    <span className="text-text-muted">(recurring only; early estimate, dev usage is bursty)</span>
                  </p>
                )}
              </div>

              {/* By model — where the money went (share of all-time). */}
              <div className="mt-8">
                <p className="eyebrow">By model</p>
                <div className="mt-3 space-y-3">
                  {data.by_model.map((m) => {
                    const oneTime = m.model === null;
                    const share = data.totals.all_time > 0 ? (m.usd / data.totals.all_time) * 100 : 0;
                    return (
                      <div key={m.label}>
                        <div className="flex items-baseline justify-between text-body-sm">
                          <span className="text-text-primary">{m.label}{oneTime ? <span className="text-text-muted"> · one-time</span> : ''}</span>
                          <span className="font-mono tabular-nums text-text-secondary">{usd(m.usd)}</span>
                        </div>
                        <div className="mt-1 h-1 rounded-pill bg-bg-tertiary overflow-hidden">
                          <div className={`h-full ${oneTime ? 'bg-border-strong' : 'bg-structure'}`} style={{ width: `${share}%` }} />
                        </div>
                        <p className="text-micro text-text-muted mt-1">
                          {m.rows} call{m.rows === 1 ? '' : 's'}{m.rows > 0 && !oneTime ? ` · ~${usd3(m.usd / m.rows)}/call` : ''}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* One derived recommendation — the single orange accent for this view. */}
              <div className="mt-8 flex items-start gap-2.5 rounded-card border border-border-light bg-bg-secondary px-4 py-3">
                <Lightbulb className="w-4 h-4 text-accent-ink shrink-0 mt-0.5" strokeWidth={1.75} aria-hidden />
                <p className="text-caption text-text-secondary leading-relaxed">{recommendation(data)}</p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
