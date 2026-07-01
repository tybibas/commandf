import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-0';

/**
 * Sign-in for the standalone Command F app. Product-branded (not the dashboard's
 * "Triggered Leads Platform"), sign-in only — accounts are provisioned by the
 * operator. Uses the same Supabase auth as the dashboard.
 */
export function CommandFLogin() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { error } = await signIn(email.trim(), password);
      if (error) {
        // A 504/gateway timeout returns an empty body, so supabase-js hands back
        // an error whose message is blank or "{}". Show something human instead.
        const raw = (error.message ?? '').trim();
        const unhelpful = !raw || raw === '{}' || /gateway|timeout|504|failed to fetch/i.test(raw);
        setError(unhelpful
          ? 'Sign-in timed out — the service may be waking up. Wait a moment and try again.'
          : raw);
      }
    } catch {
      setError('Could not reach the sign-in service. Check your connection and try again.');
    } finally {
      // Gate swaps to a spinner (profileLoading) then the app on success; always
      // reset local loading so this form is never left stuck.
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Wordmark — editorial serif, stacked and centered for a calm first impression */}
        <div className="mb-9 flex flex-col items-center text-center">
          <span className="font-serif text-[30px] tracking-[-0.015em] text-text-primary leading-none">Command F</span>
          <p className="mt-2.5 text-[14px] text-text-secondary">
            Your firm's institutional memory.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-5 bg-bg-elevated border border-border-light rounded-surface shadow-float p-7">
          <div>
            <label htmlFor="email" className="block text-[11px] uppercase tracking-[0.06em] text-text-muted mb-1.5">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={`w-full rounded-control border border-border bg-bg-secondary px-3.5 py-2.5 text-[14px] text-text-primary placeholder:text-text-muted outline-none focus:border-border-hover transition-colors duration-fast ease-out-expo ${FOCUS}`}
              placeholder="you@firm.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-[11px] uppercase tracking-[0.06em] text-text-muted mb-1.5">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className={`w-full rounded-control border border-border bg-bg-secondary px-3.5 py-2.5 text-[14px] text-text-primary placeholder:text-text-muted outline-none focus:border-border-hover transition-colors duration-fast ease-out-expo ${FOCUS}`}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="text-[12px] text-error bg-error-soft border border-border-light rounded-control px-3 py-2.5">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !email.trim() || !password}
            className={`w-full py-2.5 rounded-control bg-text-primary text-[13px] font-medium text-bg-primary hover:bg-accent-hover disabled:opacity-40 transition-colors duration-fast ease-out-expo ${FOCUS}`}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Signing in…
              </span>
            ) : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-caption text-text-muted text-center">
          Trouble signing in? Contact your operator to reset access.
        </p>
      </div>
    </div>
  );
}

export default CommandFLogin;
