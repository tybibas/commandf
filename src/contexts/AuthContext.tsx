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
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        loadUserProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // TOKEN_REFRESHED fires when the browser tab regains focus.
      // If we already have this user loaded, skip the redundant profile
      // fetch — otherwise a new object reference from setUser() causes
      // every useEffect keyed on `user` to re-fire across all pages,
      // resetting scanning spinners and other ephemeral state.
      if (event === 'TOKEN_REFRESHED' && session?.user && loadedUserIdRef.current === session.user.id) {
        // Session token updated but user hasn't changed — just update session silently.
        setSession(session);
        return;
      }

      setSession(session);
      if (session?.user) {
        loadUserProfile(session.user.id);
      } else {
        loadedUserIdRef.current = null;
        setUser(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function loadUserProfile(authUserId: string) {
    setProfileLoading(true);
    try {
      // Primary lookup: by auth UUID
      const { data, error } = await supabase
        .from('quantifire_dashboard_users')
        .select('*')
        .eq('id', authUserId)
        .maybeSingle();

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

  async function signOut() {
    await supabase.auth.signOut();
    // Clear the persisted context so the next user starts fresh
    try { localStorage.removeItem('qf_active_context'); } catch { /* ignore */ }
    setUser(null);
    setSession(null);
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
