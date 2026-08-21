// @ts-nocheck
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabaseClient';
import {
  DENIABILITY_SESSION_CHANGED_EVENT,
  isDeniabilityOrDemoActive,
} from '@/wallet-core/deniabilitySession';

const SupabaseAuthContext = createContext(null);

function readDeniability() {
  try {
    return isDeniabilityOrDemoActive();
  } catch {
    return true;
  }
}

export function SupabaseAuthProvider({ children }) {
  const [deniable, setDeniable] = useState(() => readDeniability());
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(() => isSupabaseConfigured && !readDeniability());
  const [error, setError] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const syncDeniability = () => setDeniable(readDeniability());
    syncDeniability();
    window.addEventListener(DENIABILITY_SESSION_CHANGED_EVENT, syncDeniability);
    window.addEventListener('storage', syncDeniability);
    return () => {
      window.removeEventListener(DENIABILITY_SESSION_CHANGED_EVENT, syncDeniability);
      window.removeEventListener('storage', syncDeniability);
    };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || deniable) {
      setSession(null);
      setLoading(false);
      setError('');
      return undefined;
    }

    let active = true;
    setLoading(true);

    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      setSession(data.session ?? null);
      setError(sessionError?.message ?? '');
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession ?? null);
      setLoading(false);
      setError('');
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [deniable]);

  const value = useMemo(() => {
    const suspended = deniable;
    const user = session?.user ?? null;

    async function signInWithPassword({ email, password }) {
      if (!isSupabaseConfigured || suspended) {
        return { error: { message: 'Cloud account sign-in is unavailable in this session.' } };
      }
      return supabase.auth.signInWithPassword({ email, password });
    }

    async function signUpWithPassword({ email, password }) {
      if (!isSupabaseConfigured || suspended) {
        return { error: { message: 'Cloud account sign-up is unavailable in this session.' } };
      }
      return supabase.auth.signUp({ email, password });
    }

    async function sendPasswordReset({ email }) {
      if (!isSupabaseConfigured || suspended) {
        return { error: { message: 'Password reset is unavailable in this session.' } };
      }
      return supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/account/login`,
      });
    }

    async function signOut() {
      if (!isSupabaseConfigured) return { error: null };
      return supabase.auth.signOut();
    }

    async function updatePassword(password) {
      if (!isSupabaseConfigured || suspended) {
        return { error: { message: 'Password update is unavailable in this session.' } };
      }
      return supabase.auth.updateUser({ password });
    }

    return {
      error,
      isAuthenticated: Boolean(user),
      isConfigured: isSupabaseConfigured,
      isLoading: loading,
      session,
      suspended,
      user,
      sendPasswordReset,
      signInWithPassword,
      signOut,
      signUpWithPassword,
      updatePassword,
    };
  }, [deniable, error, loading, session]);

  return (
    <SupabaseAuthContext.Provider value={value}>
      {children}
    </SupabaseAuthContext.Provider>
  );
}

export function useSupabaseAuth() {
  const ctx = useContext(SupabaseAuthContext);
  if (!ctx) {
    throw new Error('useSupabaseAuth must be used within SupabaseAuthProvider');
  }
  return ctx;
}
