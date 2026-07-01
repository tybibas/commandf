import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { ClientStrategyProvider } from '../contexts/ClientStrategyContext';
import { isSupabaseConfigured } from '../lib/supabase';
import { CommandFPage } from '../components/CommandFPage';
import { SetPasswordScreen } from '../components/SetPasswordScreen';
import { CommandFLogin } from './CommandFLogin';

function FullScreen({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-bg-primary flex items-center justify-center px-4">{children}</div>;
}

/** Auth gate — mirrors the dashboard's App.tsx ordering exactly. */
function Gate() {
  const { user, session, loading, profileLoading, mustChangePassword, signOut } = useAuth();

  // Resilience: if the session check / profile fetch hasn't resolved in 10s
  // (e.g. a cold or degraded Supabase project timing out), stop spinning
  // forever and fall through to the login screen so the user can retry.
  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    if (!(loading || profileLoading)) { setGaveUp(false); return; }
    const t = setTimeout(() => setGaveUp(true), 10_000);
    return () => clearTimeout(t);
  }, [loading, profileLoading]);

  // Show spinner during initial session check OR while the profile row is
  // being fetched after sign-in. The second condition is critical: without it,
  // Gate keeps rendering CommandFLogin while the profile loads, leaving the
  // form stuck in "Signing in…" if the profile row is missing or slow.
  if ((loading || profileLoading) && !gaveUp) {
    return (
      <FullScreen>
        <div className="flex flex-col items-center gap-4">
          <span className="font-serif text-[22px] tracking-[-0.015em] text-text-primary leading-none">Command F</span>
          <span className="w-4 h-4 border-2 border-text-muted border-t-transparent rounded-full animate-spin" />
        </div>
      </FullScreen>
    );
  }
  if (session && mustChangePassword) return <SetPasswordScreen />;
  if (!user) return <CommandFLogin />;

  // Display name from auth metadata (full_name), email as the final fallback.
  const userName: string | undefined =
    (user as any)?.user_metadata?.full_name || undefined;

  // No planLabel: the workspace ("Actionist") already shows as the footer
  // wordmark, so the profile subtitle falls back to the email — name + email,
  // not name + a duplicate workspace label.
  return (
    <div className="h-screen flex flex-col bg-bg-primary overflow-hidden">
      <CommandFPage
        userName={userName}
        userEmail={user?.email ?? undefined}
        onSignOut={signOut}
      />
    </div>
  );
}

export default function StandaloneApp() {
  if (!isSupabaseConfigured) {
    return (
      <FullScreen>
        <div className="max-w-md text-center">
          <span className="font-serif text-[24px] tracking-[-0.015em] text-text-primary leading-none block mb-3">Command F</span>
          <h1 className="text-lg font-medium text-text-primary mb-1">Not configured</h1>
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
