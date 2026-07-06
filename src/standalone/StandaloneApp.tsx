import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { ActionistStrategyProvider } from '../contexts/ActionistStrategyContext';
import { isSupabaseConfigured } from '../lib/supabase';
import { CommandFPage } from '../components/CommandFPage';
import { SetPasswordScreen } from '../components/SetPasswordScreen';
import { CommandFLogin } from './CommandFLogin';

function FullScreen({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-bg-primary flex items-center justify-center px-4">{children}</div>;
}

/** Auth gate — mirrors the dashboard's App.tsx ordering exactly. */
function Gate() {
  const { user, session, loading, mustChangePassword, signOut } = useAuth();

  // Resilience: if the INITIAL session check hasn't resolved in 10s (a cold or
  // degraded Supabase project), stop spinning forever and fall through so the
  // user can act. Note we only guard on `loading` (the session check) — NOT on
  // profileLoading, because a signed-in session is enough to enter the app; the
  // profile row is secondary and loads async (see below).
  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    if (!loading) { setGaveUp(false); return; }
    const t = setTimeout(() => setGaveUp(true), 10_000);
    return () => clearTimeout(t);
  }, [loading]);

  // Spinner ONLY during the initial session check. Once we know whether there is
  // a session, we render immediately. We deliberately do NOT block on
  // profileLoading: the session is sufficient to enter the app, and blocking the
  // whole app behind a secondary profile query is exactly what caused the
  // infinite spinner when that query timed out under DB load.
  if (loading && !gaveUp) {
    return (
      <FullScreen>
        <div className="flex flex-col items-center gap-4">
          <span className="font-display text-xl tracking-[-0.015em] text-text-primary leading-none">Command F</span>
          <span className="w-4 h-4 border-2 border-text-muted border-t-transparent rounded-full animate-spin" />
        </div>
      </FullScreen>
    );
  }
  if (session && mustChangePassword) return <SetPasswordScreen />;
  // A valid session is the source of truth for "signed in." Route to the app on
  // the SESSION, not the profile row: if the profile query is still in flight or
  // timed out, we still show the app (degraded — falls back to the email for the
  // display name) rather than bouncing the user back to the login screen.
  if (!session) return <CommandFLogin />;

  // Display name: prefer the profile row's full_name, then the auth session's
  // user_metadata.full_name, else undefined (the UI falls back to the email).
  // Read from the session too so the header still names the user even when the
  // profile row hasn't loaded (or timed out) yet.
  const userName: string | undefined =
    user?.full_name ||
    (session.user?.user_metadata?.full_name as string | undefined) ||
    undefined;
  const userEmail: string | undefined =
    user?.email ?? session.user?.email ?? undefined;

  // No planLabel: the workspace ("Actionist") already shows as the footer
  // wordmark, so the profile subtitle falls back to the email — name + email,
  // not name + a duplicate workspace label.
  return (
    <div className="h-screen flex flex-col bg-bg-primary overflow-hidden">
      <CommandFPage
        userName={userName}
        userEmail={userEmail}
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
          <span className="font-display text-xl tracking-[-0.015em] text-text-primary leading-none block mb-3">Command F</span>
          <h1 className="text-lg font-medium text-text-primary mb-1">Not configured</h1>
          <p className="text-body text-text-secondary">Supabase environment variables are missing for this deployment.</p>
        </div>
      </FullScreen>
    );
  }
  return (
    <AuthProvider>
      <ActionistStrategyProvider>
        <Gate />
      </ActionistStrategyProvider>
    </AuthProvider>
  );
}
