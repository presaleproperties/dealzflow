import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
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

    // Set up auth state listener FIRST (synchronous handler — never await inside)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      // On a hard token-refresh failure, supabase emits SIGNED_OUT with null
      // session. We accept that and let the user re-authenticate. We do NOT
      // wipe localStorage here — that breaks "remember me" across reloads.
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);

      // If the refresh token is invalid/expired, surface it once so the next
      // network call doesn't hang silently. supabase-js handles the cleanup.
      if (event === 'TOKEN_REFRESHED' && !nextSession) {
        console.warn('[auth] token refresh returned no session');
      }
    });

    // Then hydrate the initial session. If supabase throws (e.g. corrupted
    // localStorage payload that fails JSON.parse), recover by clearing only
    // the auth keys and continuing as signed-out — never crash the app.
    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          // Common case on mobile: stored refresh token rejected by server
          // ("missing sub claim" / "bad_jwt"). Force a fresh sign-in cleanly.
          console.warn('[auth] getSession error, clearing local session:', error.message);
          await supabase.auth.signOut().catch(() => {});
        }
        if (!mounted) return;
        setSession(data?.session ?? null);
        setUser(data?.session?.user ?? null);
      } catch (err) {
        console.error('[auth] getSession threw:', err);
        try {
          // Purge any malformed sb-* token so the next boot starts clean.
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
    await supabase.auth.signOut();
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