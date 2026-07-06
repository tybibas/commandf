import { Mic } from 'lucide-react';
import type { DictationError } from '../../hooks/useDictation';

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-0';
const MOTION = 'duration-fast ease-out-expo';

// Matches the composer's round "+" control. Listening = brand-tinted with a
// quiet pulsing ring; unsupported = disabled with an explanatory tooltip.
export default function MicButton({
  isListening, supported, error, onClick,
}: { isListening: boolean; supported: boolean; error: DictationError; onClick: () => void }) {
  const title = !supported
    ? 'Voice input needs Chrome or Edge'
    : error === 'not-allowed'
      ? 'Microphone blocked. Enable it in your browser.'
      : isListening ? 'Stop dictation' : 'Dictate';

  return (
    <div className="relative">
      {isListening && (
        <span className="absolute inset-0 rounded-full bg-accent/25 animate-ping motion-reduce:hidden" aria-hidden />
      )}
      <button
        type="button"
        onClick={onClick}
        disabled={!supported}
        aria-label={title}
        aria-pressed={isListening}
        title={title}
        className={[
          'relative w-8 h-8 flex items-center justify-center rounded-full border transition-colors',
          MOTION, FOCUS,
          isListening
            ? 'border-accent/40 bg-accent/15 text-accent-ink'
            : error === 'not-allowed'
              ? 'border-error/30 text-error'
              : 'border-border-light text-text-secondary hover:text-text-primary hover:bg-bg-tertiary',
          !supported ? 'opacity-40 cursor-not-allowed' : '',
        ].join(' ')}
      >
        <Mic className="w-4 h-4" strokeWidth={1.75} />
      </button>
    </div>
  );
}
