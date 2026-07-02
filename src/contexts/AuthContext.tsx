import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { supabase, User } from '../lib/supabase';
import { Session, AuthError } from '@supabase/supabase-js';

type AuthContextType = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  // True while loadUserProfile is running after a sign-in event. Gate should
  // show a spinner during this window so CommandFLogin is unmounted and its
  // local "Signing in…" state is never left stuck.
  profileLoading: boolean;
  // True when the account is on a temporary password and must set its own
  // before using the app. Sourced from Supabase auth user_metadata, NOT the
  // dashboard-user profile row — the flag lives in auth, set by the operator
  // script scripts/set_temp_password.py.
  mustChangePassword: boolean;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: AuthError | null }>;
  signInWithGoogle: () => Promise<{ error: AuthError | null }>;
  // Sets a new password for the logged-in user and clears the
  // must_change_password flag. Used by the forced-change screen.
  updatePassword: (newPassword: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  // Track the currently loaded user ID to avoid redundant profile fetches
  // when Supabase fires TOKEN_REFRESHED on Chrome tab visibility change.
  const loadedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Initial session check. getSession() reads the persisted session locally
    // (no network), so this resolves fast even when the DB is under load. The
    // profile fetch is deferred (see deferLoadProfile) so it can NEVER hang the
    // initial `loading` flag — sign-in state is known the moment we have a
    // session, independent of the secondary profile query.
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        setLoading(false);          // session known → stop the initial gate spinner immediately
        deferLoadProfile(session.user.id);
      } else {
        setLoading(false);
      }
    }).catch(() => setLoading(false)); // never leave `loading` stuck if getSession rejects

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // Supabase re-validates the session when the browser tab regains
      // focus/visibility (GoTrueClient._recoverAndRefresh). Depending on how
      // close the JWT is to expiry it emits EITHER `TOKEN_REFRESHED` (it
      // refreshed the token) OR `SIGNED_IN` (session still valid, re-notified) —
      // BOTH carry the SAME already-loaded user. If we react to those by calling
      // loadUserProfile() we flip `profileLoading`, which unmounts CommandFPage
      // behind the Gate spinner (chat blanks) and forces a slow refetch on
      // remount; a fresh setUser() object reference also cascades every
      // useEffect keyed on `user`. So: when the user id is UNCHANGED, treat the
      // event as a silent session update and do NOT re-fetch the profile.
      const isFocusRevalidation = event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN';
      if (isFocusRevalidation && session?.user && loadedUserIdRef.current === session.user.id) {
        // Same user, token/session just re-validated — update the session token
        // silently. No loadUserProfile → no profileLoading flip → no unmount.
        setSession(session);
        return;
      }

      setSession(session);
      if (session?.user) {
        setLoading(false);
        deferLoadProfile(session.user.id);
      } else {
        loadedUserIdRef.current = null;
        setUser(null);
        setLoading(false);
        setProfileLoading(false);
      }
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dispatch the profile fetch OUTSIDE the onAuthStateChange callback. supabase-js
  // serializes auth work behind an internal navigator lock; awaiting ANY supabase
  // call *inside* the callback deadlocks the client so the very next supabase
  // request (here: the profile query) hangs forever — the documented cause of the
  // "infinite spinner on sign-in." setTimeout(…, 0) lets the callback return and
  // release the lock before the query runs.
  // Ref: https://github.com/supabase/auth-js/issues/762
  function deferLoadProfile(authUserId: string) {
    setTimeout(() => { loadUserProfile(authUserId); }, 0);
  }

  async function loadUserProfile(authUserId: string) {
    setProfileLoading(true);
    try {
      // Hard cap the profile fetch. The profile row is SECONDARY (display name /
      // role); the session alone is enough to enter the app. If the DB is slow /
      // timing out under load, we must not block behind it — race the query
      // against a timeout so `profileLoading` always resolves.
      const withTimeout = <T,>(p: PromiseLike<T>, ms: number): Promise<T | null> =>
        Promise.race([
          Promise.resolve(p),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
        ]);

      // Primary lookup: by auth UUID
      const res = await withTimeout(
        supabase.from('quantifire_dashboard_users').select('*').eq('id', authUserId).maybeSingle(),
        8000,
      );
      if (res === null) {
        // Timed out — enter the app degraded rather than spin. A later
        // refreshUser() (or tab refocus) can populate the profile once the DB
        // recovers. loadedUserIdRef stays unset so it WILL retry.
        console.warn('Profile fetch timed out; entering app without profile row.');
        return;
      }
      const { data, error } = res;

      if (error) {
        console.error('Error loading user profile:', error);
        return;
      }

      if (data) {
        const newUser = data as User;
        setUser(prev => {
          if (prev && JSON.stringify(prev) === JSON.stringify(newUser)) return prev;
          return newUser;
        });
        loadedUserIdRef.current = authUserId;
        return;
      }

      // Fallback: look up by email (covers Google OAuth users whose row was
      // created before their auth UUID was known) and link the auth UUID.
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const email = authUser?.email;
      if (!email) return;

      const { data: byEmail } = await supabase
        .from('quantifire_dashboard_users')
        .select('*')
        .eq('email', email)
        .maybeSingle();

      if (byEmail) {
        // Link the auth UUID to this row so future lookups are instant
        await supabase
          .from('quantifire_dashboard_users')
          .update({ id: authUserId })
          .eq('email', email);

        const linked = { ...byEmail, id: authUserId } as User;
        setUser(prev => {
          if (prev && JSON.stringify(prev) === JSON.stringify(linked)) return prev;
          return linked;
        });
        loadedUserIdRef.current = authUserId;
      }
    } finally {
      setProfileLoading(false);
      setLoading(false);
    }
  }

  async function refreshUser() {
    const authUserId = session?.user?.id;
    if (authUserId) {
      await loadUserProfile(authUserId);
      return;
    }

    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser?.id) {
      await loadUserProfile(authUser.id);
    }
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  }

  async function signUp(email: string, password: string, fullName?: string) {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });
    return { error };
  }

  async function updatePassword(newPassword: string) {
    // Set the new password AND clear the force-change flag in one update so a
    // refreshed session no longer trips the gate. Supabase updates the local
    // session in place, so onAuthStateChange (USER_UPDATED) carries the
    // cleared metadata and the gate re-evaluates to false.
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
      data: { must_change_password: false },
    });
    return { error };
  }

  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}`,
        scopes: 'email profile https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly',
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });

    return { error };
  }

  function signOut(): Promise<void> {
    // INSTANT sign-out: clear local auth state FIRST so the Gate (which routes on
    // the session) drops to the login screen immediately — never blocking on the
    // network. supabase.auth.signOut() makes a GoTrue revoke call that can take
    // several seconds under load; awaiting it before clearing state is exactly
    // what made sign-out feel slow. We fire it in the background instead.
    loadedUserIdRef.current = null;
    setUser(null);
    setSession(null);
    setProfileLoading(false);
    try { localStorage.removeItem('qf_active_context'); } catch { /* ignore */ }

    // Revoke the token in the background. `scope:'local'` clears the local
    // session synchronously-ish (no server round-trip to block the UI); the
    // onAuthStateChange('SIGNED_OUT') fires regardless. Swallow failures — the
    // local state is already cleared, so the user is signed out from their view.
    void supabase.auth.signOut({ scope: 'local' }).catch(() => { /* already cleared locally */ });
    return Promise.resolve();
  }

  // Derive straight from the session so it updates the instant the session's
  // metadata changes (login, USER_UPDATED after the password is set).
  const mustChangePassword = session?.user?.user_metadata?.must_change_password === true;

  const value = {
    session,
    user,
    loading,
    profileLoading,
    mustChangePassword,
    signIn,
    signUp,
    signInWithGoogle,
    updatePassword,
    signOut,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
