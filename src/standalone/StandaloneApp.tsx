import { Command, LogOut } from 'lucide-react';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { ClientStrategyProvider } from '../contexts/ClientStrategyContext';
import { isSupabaseConfigured } from '../lib/supabase';
import { CommandFPage } from '../components/CommandFPage';
import { SetPasswordScreen } from '../components/SetPasswordScreen';
import { CommandFLogin } from './CommandFLogin';

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring';

function FullScreen({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-bg-primary flex items-center justify-center px-4">{children}</div>;
}

function SignOutButton() {
  const { signOut } = useAuth();
  return (
    <button
      onClick={() => signOut()}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-control text-body border border-border-light text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors duration-fast ease-out-expo ${FOCUS}`}
      title="Sign out"
    >
      <LogOut className="w-3.5 h-3.5" /> Sign out
    </button>
  );
}

/** Auth gate — mirrors the dashboard's App.tsx ordering exactly. */
function Gate() {
  const { user, session, loading, profileLoading, mustChangePassword } = useAuth();

  // Show spinner during initial session check OR while the profile row is
  // being fetched after sign-in. The second condition is critical: without it,
  // Gate keeps rendering CommandFLogin while the profile loads, leaving the
  // form stuck in "Signing in…" if the profile row is missing or slow.
  if (loading || profileLoading) {
    return (
      <FullScreen>
        <div className="flex items-center gap-2.5 text-text-muted">
          <Command className="w-4 h-4" />
          <span className="w-4 h-4 border-2 border-text-muted border-t-transparent rounded-full animate-spin" />
        </div>
      </FullScreen>
    );
  }
  if (session && mustChangePassword) return <SetPasswordScreen />;
  if (!user) return <CommandFLogin />;

  return (
    <div className="h-screen flex flex-col bg-bg-primary overflow-hidden">
      <CommandFPage headerExtra={<SignOutButton />} />
    </div>
  );
}

export default function StandaloneApp() {
  if (!isSupabaseConfigured) {
    return (
      <FullScreen>
        <div className="max-w-md text-center">
          <Command className="w-6 h-6 text-text-muted mx-auto mb-3" />
          <h1 className="text-lg font-medium text-text-primary mb-1">Command F isn’t configured</h1>
          <p className="text-body text-text-secondary">Supabase environment variables are missing for this deployment.</p>
        </div>
      </FullScreen>
    );
  }
  return (
    <AuthProvider>
      <ClientStrategyProvider>
        <Gate />
      </ClientStrategyProvider>
    </AuthProvider>
  );
}
