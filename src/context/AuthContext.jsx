import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/SupabaseClient';
import { fetchProfile } from '../lib/profileAPI';

/* ------------------------------------------------------------------ */
/* AuthContext — wraps Supabase auth AND the profiles row so any        */
/* component can read who's logged in via useAuth(). The profiles row  */
/* (fields like designation, centre, department) is fetched once per   */
/* login and kept in sync via refreshProfile() after edits.            */
/* ------------------------------------------------------------------ */

const AuthContext = createContext(undefined);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (u) => {
    if (!u) {
      setProfile(null);
      return;
    }
    try {
      const p = await fetchProfile(u.id);
      setProfile(p);
    } catch (e) {
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setUser(session?.user ?? null);
      await loadProfile(session?.user ?? null);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      loadProfile(session?.user ?? null);
    });

    return () => listener.subscription.unsubscribe();
  }, [loadProfile]);

  const signUp = async (email, password, fullName) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    });
    return { data, error };
  };

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    return { data, error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const refreshProfile = () => loadProfile(user);

  const value = {
    user,
    profile,
    loading,
    signUp,
    signIn,
    signOut,
    refreshProfile,
    // Profile row is the source of truth once it's loaded; auth metadata
    // and email are fallbacks for the brief window before it loads.
    displayName: profile?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || '',
    avatarUrl: profile?.avatar_url || null,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}