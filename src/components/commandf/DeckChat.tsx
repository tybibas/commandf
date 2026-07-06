import { useEffect, useRef, useState } from 'react';
import {
  Sparkles, Loader2, Check, AlertCircle, PencilLine, Plus, Trash2, RefreshCw, ArrowUpDown, Copy, Wand2,
} from 'lucide-react';
import { sendDeckChatStream, StreamAbortedError, type DeckOp } from './api';
import Composer from './Composer';

let _turnSeq = 0;
const nextId = () => `t-${++_turnSeq}`;

type OpEntry = { op: DeckOp; status: 'applied' | 'failed'; error?: string };
type ChatTurn =
  | { id: string; role: 'user'; text: string }
  | {
      id: string; role: 'assistant'; batchId?: string; text: string; ops: OpEntry[];
      phase?: string; done: boolean; error?: string;
    };

/** Icon per op family — deterministic on the op-type prefix (contract §2.2). */
function opIcon(type: string) {
  if (type.startsWith('add_')) return Plus;
  if (type.startsWith('remove_')) return Trash2;
  if (type.startsWith('reorder_')) return ArrowUpDown;
  if (type.startsWith('duplicate_')) return Copy;
  if (type.startsWith('change_') || type.startsWith('replace_')) return RefreshCw;
  if (type.startsWith('rewrite_') || type.startsWith('edit_') || type.startsWith('set_')) return PencilLine;
  return Wand2;
}

function OpCard({ op, status, error }: OpEntry) {
  const Icon = opIcon(op.type);
  const ok = status === 'applied';
  return (
    <div
      className={`flex items-start gap-2 rounded-control border px-2.5 py-2 ${
        ok ? 'border-border-light bg-bg-secondary/60' : 'border-error/40 bg-error/[0.06]'
      }`}
    >
      <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0 text-text-muted" strokeWidth={1.75} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-caption text-text-primary leading-snug">{op.summary}</p>
        {/* A failed op keeps its summary (what was attempted) + why it didn't apply. */}
        {!ok && error && <p className="mt-0.5 text-micro text-error leading-snug">{error}</p>}
        <span className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-bg-tertiary text-micro font-mono text-text-muted">
          {op.target.slide_id}{op.target.element_id ? ` · ${op.target.element_id}` : ''}
        </span>
      </div>
      {ok
        ? <Check className="w-3.5 h-3.5 shrink-0 text-verified mt-0.5" strokeWidth={2.5} aria-hidden />
        : <AlertCircle className="w-3.5 h-3.5 shrink-0 text-error mt-0.5" aria-hidden />}
    </div>
  );
}

function UserTurn({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-surface rounded-br-control bg-structure text-structure-ink px-3.5 py-2 text-body-sm leading-relaxed whitespace-pre-wrap break-words">
        {text}
      </div>
    </div>
  );
}

function AssistantTurn({ t }: { t: Extract<ChatTurn, { role: 'assistant' }> }) {
  return (
    <div className="animate-slide-up">
      <div className="flex items-center gap-1.5 text-caption text-text-muted mb-1.5">
        <Sparkles className="w-3 h-3 text-accent-ink" strokeWidth={1.75} aria-hidden />
        <span>Command F</span>
      </div>
      {t.text && (
        <p
          className={`text-body-sm text-text-primary leading-relaxed ${
            !t.done ? "after:content-['▍'] after:inline-block after:ml-0.5 after:text-accent after:animate-pulse" : ''
          }`}
        >
          {t.text}
        </p>
      )}
      {t.phase && (
        <p className="mt-1.5 flex items-center gap-1.5 text-caption text-text-muted" aria-live="polite">
          <Loader2 className="w-3 h-3 animate-spin text-structure motion-reduce:animate-none" aria-hidden />
          {t.phase}
        </p>
      )}
      {t.ops.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {t.ops.map((e) => <OpCard key={e.op.op_id} {...e} />)}
        </div>
      )}
      {t.error && <p className="mt-1.5 text-caption text-error leading-relaxed">{t.error}</p>}
    </div>
  );
}

/**
 * The left half of Deck Studio. A chat column that streams edit-op batches
 * (contract §3.1) as compact op cards inline with the assistant's narration.
 *
 * State ownership: `turns` (the rendered transcript) is local — it exists only
 * to render this column. The three cross-cutting signals a batch produces
 * (accumulated ops, dirty slide indices, live deck_rev) are lifted to DeckStudio
 * via the `onOp`/`onSlideDirty`/`onBatchDone` callbacks so the canvas can react
 * without this component knowing about previews at all.
 *
 * Ops are kept per-turn AND flat (via `onOp`) grouped implicitly by `batch_id`
 * on each envelope — F5 (changelog + per-op undo) groups on that field; this
 * slice only renders a running list.
 */
export default function DeckChat({
  jobId, sending, onSendingChange, onOp, onSlideDirty, onPhase, onBatchDone,
}: {
  jobId: string;
  sending: boolean;
  onSendingChange: (v: boolean) => void;
  onOp: (op: DeckOp) => void;
  onSlideDirty: (indices: number[]) => void;
  onPhase: (label: string, state: 'active' | 'done') => void;
  onBatchDone: (deckRev: number) => void;
}) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const ctrlRef = useRef<AbortController | null>(null);

  useEffect(() => {
    requestAnimationFrame(() => {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: reduce ? 'auto' : 'smooth' });
    });
  }, [turns]);

  useEffect(() => () => ctrlRef.current?.abort(), []);

  const updateAssistant = (id: string, fn: (t: Extract<ChatTurn, { role: 'assistant' }>) => Extract<ChatTurn, { role: 'assistant' }>) => {
    setTurns((prev) => prev.map((t) => (t.id === id && t.role === 'assistant' ? fn(t) : t)));
  };

  const submit = async () => {
    const text = input.trim();
    if (!text || sending || !jobId) return;
    setInput('');
    const assistantId = nextId();
    setTurns((prev) => [
      ...prev,
      { id: nextId(), role: 'user', text },
      { id: assistantId, role: 'assistant', text: '', ops: [], done: false },
    ]);
    onSendingChange(true);
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    try {
      const result = await sendDeckChatStream(jobId, text, {
        onBatchStart: (e) => updateAssistant(assistantId, (t) => ({ ...t, batchId: e.batch_id })),
        onAssistantDelta: (chunk) => updateAssistant(assistantId, (t) => ({ ...t, text: t.text + chunk })),
        onOp: (op, _index, status, error) => {
          onOp(op);
          updateAssistant(assistantId, (t) => ({ ...t, ops: [...t.ops, { op, status, error }] }));
        },
        // Wire indices are 1-based; the studio state uses 0-based array positions.
        onSlideDirty: (_ids, indices) => onSlideDirty(indices.map((i) => i - 1)),
        onPhase: (label, state) => {
          onPhase(label, state);
          updateAssistant(assistantId, (t) => ({ ...t, phase: state === 'done' ? undefined : label }));
        },
        onError: (message) => updateAssistant(assistantId, (t) => ({ ...t, error: message })),
      }, ctrl.signal);
      onBatchDone(result.deck_rev);
      updateAssistant(assistantId, (t) => ({ ...t, done: true, phase: undefined }));
    } catch (e: any) {
      const message = e instanceof StreamAbortedError ? 'Cancelled.' : (e?.message || 'Could not apply that edit.');
      updateAssistant(assistantId, (t) => ({ ...t, done: true, phase: undefined, error: t.error || message }));
    } finally {
      onSendingChange(false);
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-4 py-4 space-y-3">
        {turns.length === 0 && (
          <p className="text-caption text-text-muted leading-relaxed">
            Describe an edit: "tighten the executive summary", "make the risk chart a donut",
            "add a slide on the timeline".
          </p>
        )}
        {turns.map((t) => (t.role === 'user'
          ? <UserTurn key={t.id} text={t.text} />
          : <AssistantTurn key={t.id} t={t} />
        ))}
      </div>
      <div className="shrink-0 border-t border-border-light p-3">
        <Composer
          value={input}
          onChange={setInput}
          onSubmit={submit}
          placeholder="Describe an edit…"
          sending={sending}
          disabled={!jobId}
          models={[]}
          model=""
          onModelChange={() => {}}
          onCancel={() => ctrlRef.current?.abort()}
        />
      </div>
    </div>
  );
}
