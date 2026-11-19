import { useState, useEffect } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Database } from '../types/database';

type Profile = Database['public']['Tables']['profiles']['Row'];

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;

    // Failsafe timeout to prevent infinite black/splash screen if network is slow
    const failsafeTimeout = setTimeout(() => {
      if (isMounted) {
        setLoading(false);
      }
    }, 1500);

    // 1. Get initial session
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (!isMounted) return;
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          clearTimeout(failsafeTimeout);
          fetchProfile(session.user.id, session.user.email);
        } else {
          clearTimeout(failsafeTimeout);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('[useAuth] getSession error:', err);
        if (isMounted) {
          clearTimeout(failsafeTimeout);
          setLoading(false);
        }
      });

    // 2. Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!isMounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchProfile(session.user.id, session.user.email);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      clearTimeout(failsafeTimeout);
      subscription.unsubscribe();
    };
  }, []);

  const fetchProfile = async (userId: string, userEmail?: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (!error && data) {
        setProfile(data);
      } else if (!error && data === null) {
        const { data: created, error: upsertErr } = await supabase
          .from('profiles')
          .upsert(
            {
              id: userId,
              email: userEmail ?? null,
              default_control_level: 'normal',
              onboarding_completed: false,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'id' }
          )
          .select('*')
          .single();

        if (!upsertErr && created) {
          setProfile(created);
        }
      }
    } catch (err) {
      console.error('[useAuth] Error fetching profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const signInWithPassword = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return data;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setUser(null);
    setSession(null);
    setProfile(null);
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id, user.email);
    }
  };

  return {
    user,
    session,
    profile,
    loading,
    signInWithPassword,
    signOut,
    refreshProfile,
  };
}
