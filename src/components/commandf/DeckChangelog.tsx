import { Undo2, Check, AlertCircle, Loader2, X } from 'lucide-react';
import { opIcon } from './DeckChat';
import type { DeckOp } from './api';

/**
 * The agentic changelog (DESIGN.md §3 / contract §3.3). One group per user turn
 * (batch_id), newest first, with per-op rows and undo. Undo is server-authoritative
 * (the UI never mutates the doc) — a row's "undo" calls back up to DeckStudio, which
 * streams the inverse ops. A per-op undo the backend can't isolate comes back as a
 * dependency notice steering the operator to "undo the whole group".
 */
export type ChangelogOp = { op: DeckOp; status: 'applied' | 'failed'; error?: string; undone?: boolean };
export type ChangelogBatch = {
  batchId: string;
  summary: string;
  ops: ChangelogOp[];
  undone: boolean;
  /** Set to an op_id when its isolated undo was refused — show the group-undo nudge. */
  depNoticeOpId?: string;
};

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring';

/** Resolve an op's target to a human slide position via the authoritative
 *  slide_order (id at index i is slide i+1); fall back to the raw id if unknown. */
function positionLabel(op: DeckOp, slideOrder: string[]): string {
  const i = slideOrder.indexOf(op.target.slide_id);
  const base = i >= 0 ? `Slide ${i + 1}` : op.target.slide_id;
  return op.target.element_id ? `${base} · ${op.target.element_id}` : base;
}

export default function DeckChangelog({
  batches, slideOrder, busyBatchId, onUndoBatch, onUndoOp, onClose,
}: {
  batches: ChangelogBatch[];
  slideOrder: string[];
  busyBatchId: string | null;
  onUndoBatch: (batchId: string) => void;
  onUndoOp: (batchId: string, opId: string) => void;
  onClose: () => void;
}) {
  return (
    <aside className="w-[320px] shrink-0 flex flex-col border-l border-border-light bg-bg-primary" aria-label="Change history">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-light">
        <span className="text-caption font-medium text-text-secondary">Changes</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close change history"
          className={`p-1 rounded-control text-text-muted hover:text-text-primary transition-colors ${FOCUS}`}
        >
          <X className="w-4 h-4" strokeWidth={1.75} aria-hidden />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-3 py-3 space-y-3">
        {batches.length === 0 && (
          <p className="text-caption text-text-muted leading-relaxed px-1">
            No changes yet. Edits you make appear here, grouped by turn, each one undoable.
          </p>
        )}
        {[...batches].reverse().map((b) => {
          const busy = busyBatchId === b.batchId;
          return (
            <div key={b.batchId} className={`rounded-card border border-border-light ${b.undone ? 'opacity-55' : ''}`}>
              <div className="flex items-start justify-between gap-2 px-3 pt-2.5 pb-2 border-b border-border-light">
                <div className="min-w-0">
                  <p className="text-caption text-text-primary leading-snug">{b.summary}</p>
                  <span className="text-micro text-text-muted">
                    {b.ops.length} change{b.ops.length === 1 ? '' : 's'}{b.undone ? ' · undone' : ''}
                  </span>
                </div>
                {!b.undone && (
                  <button
                    type="button"
                    onClick={() => onUndoBatch(b.batchId)}
                    disabled={busy}
                    className={`inline-flex items-center gap-1 shrink-0 text-micro text-text-secondary hover:text-text-primary px-1.5 py-1 rounded-control transition-colors disabled:opacity-50 ${FOCUS}`}
                  >
                    {busy ? <Loader2 className="w-3 h-3 animate-spin motion-reduce:animate-none" aria-hidden /> : <Undo2 className="w-3 h-3" strokeWidth={1.75} aria-hidden />}
                    Undo group
                  </button>
                )}
              </div>

              <ul className="px-3 py-2 space-y-1.5">
                {b.ops.map((e) => {
                  const Icon = e.status === 'failed' ? AlertCircle : opIcon(e.op.type);
                  const canUndoOp = e.status === 'applied' && !b.undone && !e.undone && e.op.reversible;
                  return (
                    <li key={e.op.op_id} className="flex items-start gap-2">
                      <Icon
                        className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${e.status === 'failed' ? 'text-error' : 'text-text-muted'}`}
                        strokeWidth={1.75}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p className={`text-caption leading-snug ${e.undone ? 'text-text-muted line-through' : 'text-text-primary'}`}>
                          {e.op.summary}
                        </p>
                        <span className="text-micro font-mono text-text-muted">{positionLabel(e.op, slideOrder)}</span>
                        {e.status === 'failed' && e.error && (
                          <p className="mt-0.5 text-micro text-error leading-snug">{e.error}</p>
                        )}
                        {b.depNoticeOpId === e.op.op_id && (
                          <p className="mt-1 text-micro text-warning leading-snug">
                            Can't undo on its own. A later change builds on it, so use "undo group" above.
                          </p>
                        )}
                      </div>
                      {canUndoOp && (
                        <button
                          type="button"
                          onClick={() => onUndoOp(b.batchId, e.op.op_id)}
                          disabled={busy}
                          aria-label={`Undo: ${e.op.summary}`}
                          title="Undo this change"
                          className={`shrink-0 p-1 rounded-control text-text-muted hover:text-text-primary transition-colors disabled:opacity-50 ${FOCUS}`}
                        >
                          <Undo2 className="w-3 h-3" strokeWidth={1.75} aria-hidden />
                        </button>
                      )}
                      {e.undone && <Check className="w-3.5 h-3.5 shrink-0 text-text-muted mt-0.5" aria-hidden />}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
