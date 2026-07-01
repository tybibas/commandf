// A pure, deterministic 16:9 wireframe of a slide, keyed ONLY on its archetype
// (slide_template). It takes no content — structurally it cannot fabricate a
// headline, number, or body line. It honestly previews the STRUCTURE a slide
// will render with ("this will be a scored comparison table"), never what it
// will say. Grey blocks only; the real slide image replaces it after render.

const BAR = 'rounded-[2px] bg-bg-tertiary';
const TINT = 'rounded-[2px] bg-brand-soft';
const FRAME = 'w-full aspect-[16/9] rounded-control border border-border-light bg-bg-primary p-2 flex flex-col gap-1.5 overflow-hidden';

// Collapse the renderer's many archetypes into a handful of honest shapes.
function shapeFor(t: string): string {
  const k = t.toLowerCase();
  if (/(matrix_2x2|venn|quad)/.test(k)) return 'quad'; // before table: matrix_2x2 must not match bare "matrix"
  if (/(scored_table|comparison_matrix|heat_matrix|^table$)/.test(k)) return 'table';
  if (/(kpi|status_dashboard|strip_plot|datastrip)/.test(k)) return 'kpi';
  if (/(bar|waterfall|mekko)/.test(k)) return 'bars';
  if (/(line|scenario_trend|trend)/.test(k)) return 'line';
  if (/(phased|chevron|value_chain|timeline)/.test(k)) return 'flow';
  if (/(profile|org_chart)/.test(k)) return 'profile';
  if (/(section_divider|divider)/.test(k)) return 'divider';
  return 'stack'; // exec_summary, context_objectives, framework, split_insight, next_steps, default
}

const Title = () => <div className={`${BAR} h-1.5 w-2/3`} />;

export default function SlideSkeleton({ template, className }: { template: string; className?: string }) {
  const shape = shapeFor(template || '');
  return (
    <div className={`${FRAME} ${className ?? ''}`} aria-hidden>
      {shape === 'divider' ? (
        <div className="flex-1 flex items-center justify-center bg-bg-tertiary rounded-[3px] -m-2">
          <div className={`${BAR} h-2 w-1/2`} />
        </div>
      ) : (
        <>
          <Title />
          {shape === 'stack' && (
            <div className="flex-1 flex flex-col justify-center gap-1.5">
              {[0, 1, 2].map((i) => <div key={i} className={`${BAR} h-1 ${i === 1 ? 'w-11/12' : 'w-full'}`} />)}
            </div>
          )}
          {shape === 'table' && (
            <div className="flex-1 grid grid-cols-4 grid-rows-3 gap-[3px] mt-0.5">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className={`rounded-[1px] ${i % 4 === 3 ? TINT : 'bg-border-hover/30'}`} />
              ))}
            </div>
          )}
          {shape === 'kpi' && (
            <div className="flex-1 flex items-stretch gap-1.5 mt-0.5">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex-1 rounded-[2px] bg-bg-tertiary flex flex-col justify-center items-center gap-1">
                  <div className={`${TINT} h-2 w-1/2`} /><div className={`${BAR} h-1 w-3/4`} />
                </div>
              ))}
            </div>
          )}
          {shape === 'bars' && (
            <div className="flex-1 flex items-end gap-1.5 mt-0.5">
              {[55, 80, 40, 95, 65].map((h, i) => <div key={i} className={`flex-1 ${i === 3 ? TINT : BAR}`} style={{ height: `${h}%` }} />)}
            </div>
          )}
          {shape === 'line' && (
            <div className="flex-1 relative mt-0.5">
              <div className="absolute inset-x-0 bottom-0 h-px bg-border-hover/50" />
              <div className="absolute left-0 right-0 top-1/2 h-px bg-brand-soft rotate-[-8deg]" />
              {[10, 35, 60, 85].map((l, i) => <div key={i} className={`absolute w-1 h-1 rounded-full ${TINT}`} style={{ left: `${l}%`, top: `${50 - i * 8}%` }} />)}
            </div>
          )}
          {shape === 'flow' && (
            <div className="flex-1 flex items-center gap-1 mt-0.5">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex-1 flex items-center gap-1">
                  <div className={`flex-1 h-3 ${i === 0 ? TINT : 'bg-bg-tertiary'} rounded-[2px]`} />
                  {i < 3 && <div className="w-1 h-1 border-t border-r border-border-hover rotate-45" />}
                </div>
              ))}
            </div>
          )}
          {shape === 'quad' && (
            <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-[3px] mt-0.5">
              {[0, 1, 2, 3].map((i) => <div key={i} className={`rounded-[2px] ${i === 1 ? TINT : 'bg-bg-tertiary'}`} />)}
            </div>
          )}
          {shape === 'profile' && (
            <div className="flex-1 flex items-center gap-2 mt-0.5">
              <div className="w-7 h-7 rounded-full bg-bg-tertiary shrink-0" />
              <div className="flex-1 flex flex-col gap-1">
                {[0, 1, 2].map((i) => <div key={i} className={`${BAR} h-1 ${i === 0 ? 'w-1/2' : 'w-full'}`} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
