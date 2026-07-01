import { useCallback, useEffect, useRef, useState } from 'react';

// WhisperFlow-style live dictation for the composer, built on the browser's
// Web Speech API — zero dependencies, zero API keys, on-device streaming.
// As the user speaks it transcribes AND cleans in real time (tier-1): strips
// vocalized fillers + stutters, tidies spacing/casing — WITHOUT dropping content.
// Deeper polish is deferred to the separate "Optimize" action (tier-2).

export type DictationError = 'unsupported' | 'not-allowed' | 'no-speech' | 'network' | null;

// Conservative filler removal. Only patterns that are essentially never
// load-bearing; word boundaries protect real words (e.g. "umami", "like-for-like",
// numbers, client names, jargon are all untouched).
const FILLERS: RegExp[] = [
  /\b(?:um+|uh+|er+|erm+|ah+|hmm+)\b/gi,       // vocalized hesitations
  /\b(?:you know|ya know)\b/gi,                 // meta-filler
  /\bi mean\b/gi,                               // redirector
  /\b(?:basically|literally|honestly|actually)\b/gi, // softeners
  /\blike,/gi,                                  // filler "like" ONLY when comma-trailed
];

/** Instant, lossless-of-content cleanup for a dictated chunk. */
export function cleanDictation(raw: string): string {
  let t = ` ${raw} `;
  for (const re of FILLERS) t = t.replace(re, ' ');
  t = t.replace(/\b(\w+)(\s+\1\b)+/gi, '$1'); // collapse stutters: "the the" -> "the"
  t = t.replace(/\s+([,.;:!?])/g, '$1');       // no space before punctuation
  t = t.replace(/\s+/g, ' ').trim();           // collapse whitespace
  // Sentence-case: capitalize the first letter and after . ! ?
  t = t.replace(/(^|[.!?]\s+)([a-z])/g, (_m, p, c) => p + c.toUpperCase());
  return t;
}

export function useDictation(opts: { onTranscript?: (fullText: string) => void; silenceMs?: number } = {}) {
  const { onTranscript, silenceMs = 6000 } = opts;
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<DictationError>(null);

  const recRef = useRef<any>(null);
  const finalRef = useRef('');            // accumulated FINAL text this session
  const listeningRef = useRef(false);
  const lastResultAt = useRef(0);
  const silenceTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const cbRef = useRef(onTranscript);
  cbRef.current = onTranscript;

  const supported = typeof window !== 'undefined'
    && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const clearSilence = () => { if (silenceTimer.current) { clearInterval(silenceTimer.current); silenceTimer.current = null; } };

  const stop = useCallback(() => {
    listeningRef.current = false;
    clearSilence();
    try { recRef.current?.stop(); } catch { /* noop */ }
    setIsListening(false);
  }, []);

  const start = useCallback(() => {
    if (!supported || listeningRef.current) return;
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    rec.maxAlternatives = 1;

    rec.onresult = (event: any) => {
      lastResultAt.current = Date.now();
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalRef.current += chunk + ' ';
        else interim += chunk;
      }
      cbRef.current?.(cleanDictation(finalRef.current + interim));
    };
    rec.onerror = (e: any) => {
      const code = e?.error;
      if (code === 'not-allowed' || code === 'service-not-allowed') { setError('not-allowed'); stop(); }
      else if (code === 'network') setError('network');
      else if (code === 'no-speech') setError('no-speech');
    };
    rec.onend = () => {
      // Chrome auto-stops after ~60s; restart while the user still wants to listen.
      if (listeningRef.current) { try { rec.start(); } catch { /* noop */ } }
    };

    finalRef.current = '';
    setError(null);
    listeningRef.current = true;
    try { rec.start(); } catch { /* already started */ }
    recRef.current = rec;
    setIsListening(true);
    lastResultAt.current = Date.now();
    clearSilence();
    silenceTimer.current = setInterval(() => {
      if (Date.now() - lastResultAt.current > silenceMs) stop();
    }, 1000);
  }, [supported, silenceMs, stop]);

  useEffect(() => () => { listeningRef.current = false; clearSilence(); try { recRef.current?.abort(); } catch { /* noop */ } }, []);

  return { isListening, supported, error, start, stop };
}
