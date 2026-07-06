import { useRef, useState } from 'react';
import { Wand2, Loader2 } from 'lucide-react';
import { useDictation } from '../../hooks/useDictation';
import { optimizePrompt } from './api';
import MicButton from './MicButton';

// Warm-minimal tokens — byte-identical to CommandFPage so the pill matches the
// main composer exactly.
const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-0';
const MOTION = 'duration-fast ease-out-expo';

export interface ComposerToolsProps {
  /** Current text-box value (controlled). */
  value: string;
  /** Setter for the text-box value. Receives the new full string. */
  onChange: (v: string) => void;
  /** Disable both controls (e.g. while the field is read-only or busy). */
  disabled?: boolean;
  /**
   * Called after "Optimize" rewrites the value, so the host can re-focus the
   * textarea and move the caret to the end (mirrors CommandFPage's focusKey++).
   */
  onFocusRestore?: () => void;
  /**
   * Called if "Optimize" fails, so the host can surface a toast with its OWN
   * toast instance. (useToast() is not context-backed here — only the instance
   * that renders <ToastContainer> shows anything — so ComposerTools must not
   * own a toast; it delegates feedback to the host.) Defaults to console.warn.
   */
  onError?: (message: string) => void;
  /** Optional extra classes for the wrapper (e.g. layout/alignment). */
  className?: string;
}

/**
 * Reusable voice + optimize controls for ANY text box. Drops the same
 * dictation (Web Speech, zero deps) and "Optimize" (optimizePrompt) behavior
 * the main chat composer already has onto any controlled { value, onChange }
 * field. Self-contained: owns its own dictation + optimizing state so a host
 * only wires value/onChange.
 */
export default function ComposerTools({
  value, onChange, disabled = false, onFocusRestore, onError, className = '',
}: ComposerToolsProps) {
  const [optimizing, setOptimizing] = useState(false);
  // Base text captured when dictation starts, so live transcript appends
  // instead of overwriting what's already typed (matches CommandFPage).
  const dictBaseRef = useRef('');
  const dictation = useDictation({
    onTranscript: (t) => onChange(dictBaseRef.current + t),
  });

  const handleMic = () => {
    if (disabled) return;
    if (dictation.isListening) { dictation.stop(); return; }
    dictBaseRef.current = value.trim() ? value.replace(/\s*$/, '') + ' ' : '';
    dictation.start();
  };

  const optimize = async () => {
    const text = value.trim();
    if (disabled || !text || optimizing || dictation.isListening) return;
    setOptimizing(true);
    try {
      const { optimized } = await optimizePrompt(text);
      if (optimized && optimized.trim()) {
        onChange(optimized.trim());
        onFocusRestore?.();
      }
    } catch {
      (onError ?? ((m: string) => console.warn(m)))('Could not optimize your prompt. Try again.');
    } finally {
      setOptimizing(false);
    }
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <MicButton
        isListening={dictation.isListening}
        supported={dictation.supported}
        error={dictation.error}
        onClick={handleMic}
      />
      <button
        type="button"
        onClick={optimize}
        disabled={disabled || !value.trim() || optimizing || dictation.isListening}
        className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-pill border border-border-light text-caption text-text-secondary hover:text-text-primary hover:border-border-hover transition-colors ${MOTION} ${FOCUS} disabled:opacity-40 disabled:pointer-events-none`}
        title="Clean up my text: restructure your notes into a sharp, well-formed prompt"
      >
        {optimizing
          ? <Loader2 className="w-3.5 h-3.5 animate-spin text-text-muted" aria-hidden />
          : <Wand2 className="w-3.5 h-3.5 text-accent-ink" strokeWidth={1.75} aria-hidden />}
        {optimizing ? 'Optimizing…' : 'Optimize'}
      </button>
    </div>
  );
}
