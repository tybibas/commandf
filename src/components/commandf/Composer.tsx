import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Loader2, ChevronDown, Check, X } from 'lucide-react';
import type { ModelOption } from './api';

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-0';

// Single source of truth for the auto-grow ceiling. Used both in the JS height
// calculation and as the JS-enforced cap (max-h-48 removed from className).
const MAX_COMPOSER_PX = 200;

export interface ComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  disabled?: boolean;
  sending?: boolean;
  autoFocus?: boolean;
  /** Bump this number to imperatively re-focus the field (e.g. from an "Ask" button). */
  focusKey?: number;
  models: ModelOption[];
  model: string;
  onModelChange: (id: string) => void;
  /** Left-of-row controls injected by the parent (the "+" menu + a Knowledge chip). */
  leadingControls?: React.ReactNode;
  /** When provided, a Cancel button is shown while `sending` is true. */
  onCancel?: () => void;
}

/**
 * The Command F composer — the command center. A rounded-2xl card with an
 * auto-growing field on top and a control row beneath: parent-injected leading
 * controls on the left, an inline model selector + circular ink send on the right.
 * Distilled from Claude (inline model), ChatGPT (controls-in-input) and Perplexity.
 */
export default function Composer({
  value, onChange, onSubmit, placeholder = "Ask the firm's memory…",
  disabled = false, sending = false, autoFocus = false, focusKey,
  models, model, onModelChange, leadingControls, onCancel,
}: ComposerProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const modelWrapRef = useRef<HTMLDivElement>(null);
  const [modelOpen, setModelOpen] = useState(false);

  // Auto-grow up to MAX_COMPOSER_PX ceiling, then scroll internally.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, MAX_COMPOSER_PX) + 'px';
  }, [value]);

  useEffect(() => {
    if (autoFocus) taRef.current?.focus();
  }, [autoFocus]);

  // Imperative re-focus when focusKey changes (cursor moved to end).
  useEffect(() => {
    if (focusKey === undefined) return;
    const ta = taRef.current;
    if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
  }, [focusKey]);

  // Close the model popover on outside-click and Escape.
  useEffect(() => {
    if (!modelOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!modelWrapRef.current?.contains(e.target as Node)) setModelOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setModelOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [modelOpen]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && value.trim() && !sending) onSubmit();
    }
  };

  const activeModel = models.find((m) => m.id === model);

  return (
    <div className="relative rounded-2xl bg-bg-secondary px-3 pt-3 pb-2.5 border border-border transition-all duration-base ease-out-expo focus-within:bg-bg-elevated focus-within:border-text-primary/40 focus-within:shadow-float">
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        rows={1}
        disabled={disabled}
        placeholder={placeholder}
        aria-label="Message Command F"
        className="block w-full resize-none bg-transparent px-2 pt-1 pb-2 outline-none focus:outline-none focus-visible:outline-none text-base text-text-primary placeholder:text-text-muted leading-relaxed disabled:opacity-50"
      />

      <div className="flex items-center gap-2">
        <div className="flex min-w-0 items-center gap-2">{leadingControls}</div>

        <div className="ml-auto flex items-center gap-1.5">
          {/* Inline model selector (Claude "Opus 4.8" + Perplexity "Model"). */}
          {models.length > 0 && (
            <div ref={modelWrapRef} className="relative">
              <button
                type="button"
                onClick={() => setModelOpen((o) => !o)}
                aria-haspopup="listbox"
                aria-expanded={modelOpen}
                aria-label="Select model"
                className={`flex items-center gap-1 rounded-control px-2 py-1 text-micro font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors duration-fast ease-out-expo ${FOCUS}`}
              >
                <span className="truncate max-w-[10rem]">{activeModel?.name ?? 'Model'}</span>
                <ChevronDown className="w-3 h-3 shrink-0" strokeWidth={2.25} />
              </button>
              {modelOpen && (
                <div
                  role="listbox"
                  className="absolute bottom-full right-0 mb-2 min-w-[13rem] rounded-surface border border-border-light bg-bg-elevated shadow-float overflow-hidden animate-slide-up p-1 z-20"
                >
                  {models.map((m) => {
                    const selected = m.id === model;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onClick={() => { onModelChange(m.id); setModelOpen(false); }}
                        className={`flex w-full items-center gap-2 rounded-control px-2.5 py-2 text-left text-body-sm transition-colors duration-fast ease-out-expo ${selected ? 'bg-surface-hover text-text-primary' : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'}`}
                      >
                        <Check className={`mt-0.5 w-3.5 h-3.5 shrink-0 ${selected ? 'opacity-100' : 'opacity-0'}`} strokeWidth={2.5} />
                        <span className="flex-1 min-w-0">
                          <span className="flex items-center gap-2">
                            <span className="truncate">{m.name}</span>
                            {m.cost && <span className="shrink-0 text-micro text-text-muted tabular-nums">{m.cost}</span>}
                          </span>
                          {m.description && <span className="block text-micro text-text-muted truncate">{m.description}</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {sending && onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className={`shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-bg-tertiary text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors duration-fast ease-out-expo active:scale-95 ${FOCUS}`}
              aria-label="Cancel response"
            >
              <X className="w-4 h-4" strokeWidth={2.25} />
            </button>
          )}
          <button
            type="button"
            onClick={onSubmit}
            disabled={disabled || !value.trim() || sending}
            className={`shrink-0 w-9 h-9 flex items-center justify-center rounded-full transition-colors duration-fast ease-out-expo active:scale-95 disabled:active:scale-100 ${
              !disabled && !sending && value.trim()
                ? 'bg-brand text-white hover:bg-brand-hover'   // Actionist orange — lit when ready to send
                : 'bg-bg-tertiary text-text-muted'             // quiet at rest
            } ${FOCUS}`}
            aria-label="Send"
          >
            {sending
              ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.25} />
              : <ArrowUp className="w-4 h-4" strokeWidth={2.25} />
            }
          </button>
        </div>
      </div>
    </div>
  );
}
