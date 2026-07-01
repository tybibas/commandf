import { useEffect, useRef } from 'react';
import { ArrowUp, Loader2 } from 'lucide-react';

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-0';
// Primary action = neutral ink (gold is reserved for "operator decision required").
const INK_BTN = 'bg-text-primary text-bg-primary hover:bg-text-primary/90 transition-colors duration-fast ease-out-expo';

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
  /** Quiet content rendered on the row beneath the field (mode chip, hint). */
  leading?: React.ReactNode;
}

/**
 * The Command F composer — a soft-elevated pill with an auto-growing field and a
 * circular ink send button. Shared across the landing and the conversation view
 * so the input feels like the same object the whole time.
 */
export default function Composer({
  value, onChange, onSubmit, placeholder = "Ask the firm's memory…",
  disabled = false, sending = false, autoFocus = false, focusKey, leading,
}: ComposerProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);

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

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && value.trim() && !sending) onSubmit();
    }
  };

  return (
    <div
      className="relative rounded-[26px] bg-bg-secondary px-5 py-3 border border-border transition-all duration-base ease-out-expo focus-within:bg-bg-elevated focus-within:border-text-primary/40 focus-within:shadow-float"
    >
      <div className="flex items-end gap-3">
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          disabled={disabled}
          placeholder={placeholder}
          aria-label="Message Command F"
          className="flex-1 min-w-0 resize-none bg-transparent outline-none focus:outline-none focus-visible:outline-none text-base text-text-primary placeholder:text-text-muted py-1 leading-relaxed disabled:opacity-50"
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled || !value.trim() || sending}
          className={`shrink-0 w-9 h-9 flex items-center justify-center rounded-full active:scale-95 disabled:opacity-40 disabled:active:scale-100 ${INK_BTN} ${FOCUS}`}
          aria-label="Send"
        >
          {sending
            ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.25} />
            : <ArrowUp className="w-4 h-4" strokeWidth={2.25} />
          }
        </button>
      </div>
      {leading && <div className="mt-2 flex items-center gap-2">{leading}</div>}
    </div>
  );
}
