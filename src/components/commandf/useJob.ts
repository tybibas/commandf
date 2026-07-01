import { useCallback, useEffect, useRef, useState } from 'react';
import { EndpointPendingError, type JobStatus } from './api';

export type JobPhase = 'idle' | 'starting' | 'running' | 'complete' | 'error' | 'pending';

/**
 * Drives a start → poll → result lifecycle for the generation endpoints.
 * If the backend returns 404/501 (endpoint not wired yet) the phase becomes
 * 'pending' so the surface can show its honest preview state instead of failing.
 */
export function useJob(poll: (jobId: string) => Promise<JobStatus>) {
  const [phase, setPhase] = useState<JobPhase>('idle');
  const [result, setResult] = useState<JobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);  // exposed for per-slide editing
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const clear = useCallback(() => {
    if (timer.current !== null) { clearInterval(timer.current); timer.current = null; }
  }, []);

  useEffect(() => clear, [clear]);

  const reset = useCallback(() => {
    clear();
    setPhase('idle'); setResult(null); setError(null); setJobId(null);
  }, [clear]);

  const run = useCallback(async (start: () => Promise<{ job_id: string }>) => {
    clear();
    setPhase('starting'); setResult(null); setError(null); setJobId(null);
    try {
      const { job_id } = await start();
      setJobId(job_id);
      setPhase('running');
      const deadline = Date.now() + 5 * 60_000; // 5-minute safety valve
      timer.current = setInterval(async () => {
        try {
          const s = await poll(job_id);
          setResult(s);
          if (s.status === 'complete' || s.status === 'done') { clear(); setPhase('complete'); }
          else if (s.status === 'error') { clear(); setPhase('error'); setError(s.error || 'Generation failed.'); }
          else if (Date.now() > deadline) { clear(); setPhase('error'); setError('Timed out — try again.'); }
        } catch (e: any) {
          clear();
          if (e instanceof EndpointPendingError) { setPhase('pending'); }
          else { setPhase('error'); setError(e?.message || 'Generation failed.'); }
        }
      }, 2500);
    } catch (e: any) {
      clear();
      if (e instanceof EndpointPendingError) setPhase('pending');
      else { setPhase('error'); setError(e?.message || 'Could not start.'); }
    }
  }, [clear, poll]);

  return { phase, result, error, jobId, run, reset };
}
