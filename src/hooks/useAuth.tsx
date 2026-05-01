import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  /**
   * True while we're attempting to silently recover a session (e.g., after
   * a transient TOKEN_REFRESHED-without-session event from sleep/wake or
   * flaky network). UI should show an inline "Session restoring…" banner
   * instead of bouncing the user to /auth.
   */
  restoring: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: Error | null }>;
  deleteAccount: () => Promise<{ error: Error | null }>;
  resendConfirmation: (email: string) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    let refreshRetryTimer: number | null = null;

    // Set up auth state listener FIRST (synchronous handler — never await inside).
    // Strict policy: only ever surrender the local session when supabase itself
    // emits SIGNED_OUT. We never call signOut() defensively from this hook —
    // doing so was the #1 cause of "I keep getting logged out" because a single
    // network blip during getSession() would tear the session down.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;

      if (event === 'TOKEN_REFRESHED' && !nextSession) {
        // Transient refresh failure (sleep/wake, flaky network). Don't drop
        // the user — schedule one silent retry; supabase will recover on the
        // next successful network call regardless.
        if (refreshRetryTimer) window.clearTimeout(refreshRetryTimer);
        refreshRetryTimer = window.setTimeout(() => {
          supabase.auth.getSession().catch(() => {/* ignore — listener will fire */});
        }, 4_000);
        return;
      }

      if (event === 'SIGNED_OUT') {
        // Honor explicit sign-out (user click) or a hard backend revocation.
        setSession(null);
        setUser(null);
        setLoading(false);
        return;
      }

      // INITIAL_SESSION, SIGNED_IN, TOKEN_REFRESHED (with session), USER_UPDATED, …
      if (nextSession) {
        setSession(nextSession);
        setUser(nextSession.user);
      }
      setLoading(false);
    });

    // Then hydrate the initial session. Critically: do NOT call signOut() on
    // a getSession error — that wipes a working refresh token whenever the
    // backend hiccups. Just surface as "not yet loaded" and let supabase's
    // own auto-refresh recover. Real revocation will arrive as SIGNED_OUT.
    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!mounted) return;
        if (error) {
          console.warn('[auth] getSession transient error (keeping session):', error.message);
          // Leave existing state alone — listener will reconcile.
          setLoading(false);
          return;
        }
        setSession(data?.session ?? null);
        setUser(data?.session?.user ?? null);
      } catch (err) {
        // Only handle the *unrecoverable* case: localStorage payload is so
        // corrupted that supabase-js threw before returning. Purge ONLY the
        // sb-*-auth-token keys and continue as signed-out — never touch
        // anything else in storage.
        console.error('[auth] getSession threw (corrupt token, purging):', err);
        try {
          Object.keys(localStorage)
            .filter((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))
            .forEach((k) => localStorage.removeItem(k));
        } catch { /* ignore */ }
        if (!mounted) return;
        setSession(null);
        setUser(null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
      if (refreshRetryTimer) window.clearTimeout(refreshRetryTimer);
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/dashboard`,
      },
    });
    return { error };
  };

  const signUp = async (email: string, password: string, fullName?: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: fullName },
      },
    });
    return { error };
  };

  const signOut = async () => {
    // `local` scope: revoke only this device's session. Prevents one tab
    // logout from invalidating refresh tokens on the user's other devices.
    await supabase.auth.signOut({ scope: 'local' });
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth?mode=reset`,
    });
    return { error };
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return { error };
  };

  const resendConfirmation = async (email: string) => {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    return { error };
  };

  const deleteAccount = async () => {
    if (!user) return { error: new Error('Not authenticated') };

    try {
      const { data, error } = await supabase.functions.invoke('delete-account');
      
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      // Sign out locally after server-side deletion
      await supabase.auth.signOut();
      
      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      session, 
      loading, 
      signIn,
      signInWithGoogle,
      signUp, 
      signOut, 
      resetPassword,
      updatePassword,
      deleteAccount,
      resendConfirmation,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}