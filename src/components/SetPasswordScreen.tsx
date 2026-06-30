import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Zap, ShieldCheck } from 'lucide-react';

/**
 * Shown when a user is on a temporary password (auth user_metadata
 * must_change_password === true). Gates the entire app until they set their
 * own password. Mirrors LoginScreen's design tokens for a consistent feel.
 *
 * The operator never sees the password chosen here — it is set directly
 * against Supabase from the authenticated session.
 */
export function SetPasswordScreen() {
  const { updatePassword, signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    const { error } = await updatePassword(password);
    if (error) {
      // If the session expired while they lingered on this screen, updateUser
      // fails with an auth-session error and there's no in-place recovery —
      // bounce them back to login rather than stranding them on a dead screen.
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('session') || msg.includes('jwt') || msg.includes('token')) {
        await signOut();
        return;
      }
      setError(error.message);
      setLoading(false);
    }
    // On success the session's metadata flips must_change_password to false,
    // the gate re-evaluates, and the dashboard renders automatically.
  }

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="bg-bg-elevated rounded-2xl border border-border-light p-8">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-3 mb-4">
              <Zap className="h-10 w-10 text-warning" />
              <h1 className="text-3xl font-medium text-text-primary tracking-tight leading-none">PULSEPOINT</h1>
            </div>
            <div className="mt-4 flex items-center justify-center gap-2 text-text-secondary">
              <ShieldCheck className="h-4 w-4 text-success" />
              <p className="text-sm font-medium text-text-primary">Set your password</p>
            </div>
            <p className="mt-2 text-sm text-text-secondary">
              You're signed in with a temporary password. Choose a new one to secure your account.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="new-password" className="block text-sm font-medium text-text-secondary mb-1.5">
                New password
              </label>
              <input
                id="new-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full rounded-control border border-border-light bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:border-border-strong transition-colors"
                placeholder="At least 8 characters"
              />
            </div>

            <div>
              <label htmlFor="confirm-password" className="block text-sm font-medium text-text-secondary mb-1.5">
                Confirm password
              </label>
              <input
                id="confirm-password"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full rounded-control border border-border-light bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:border-border-strong transition-colors"
                placeholder="Re-enter your new password"
              />
            </div>

            {error && (
              <div className="text-sm text-error bg-error-soft border border-border-light rounded-control p-3">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-9 px-4 rounded-control text-sm font-medium bg-warning text-warning-fg hover:bg-warning/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-fast ease-out-expo"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-warning-fg border-t-transparent rounded-full animate-spin" />
                  Saving...
                </span>
              ) : (
                'Set password & continue'
              )}
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => signOut()}
                className="text-sm text-text-secondary hover:text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded-sm"
              >
                Sign out
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
