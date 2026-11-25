import { useState, useEffect } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { clearAllWebLocalData } from '../lib/clearLocalData';
import type { Database } from '../types/database';

type Profile = Database['public']['Tables']['profiles']['Row'];

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;

    // Failsafe timeout to prevent infinite black/splash screen
    const failsafeTimeout = setTimeout(() => {
      if (isMounted) {
        setLoading(false);
      }
    }, 2500);

    const initAuth = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!isMounted) return;

        if (!session?.user) {
          setUser(null);
          setSession(null);
          setProfile(null);
          setLoading(false);
          return;
        }

        // Verificar validez real del usuario y token contra Supabase Auth
        const {
          data: { user: verifiedUser },
          error: userError,
        } = await supabase.auth.getUser();

        if (!isMounted) return;

        if (userError || !verifiedUser) {
          console.warn('[useAuth] Sesión expirada o inválida, cerrando sesión localmente...');
          await supabase.auth.signOut().catch(() => {});
          if (typeof window !== 'undefined') {
            try {
              localStorage.removeItem('veyra_web_auth_token');
            } catch (_) {}
          }
          setUser(null);
          setSession(null);
          setProfile(null);
          setLoading(false);
          return;
        }

        setUser(verifiedUser);
        setSession(session);
        await fetchProfile(verifiedUser.id, verifiedUser.email);
      } catch (err) {
        console.warn('[useAuth] Fallo en verificación de sesión:', err);
        if (isMounted) {
          setUser(null);
          setSession(null);
          setProfile(null);
        }
      } finally {
        if (isMounted) {
          clearTimeout(failsafeTimeout);
          setLoading(false);
        }
      }
    };

    initAuth();

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
      } else if (error) {
        console.warn('[useAuth] Error consultando perfil:', error);
        if (error.code === 'PGRST301' || (error as any).status === 401 || (error as any).status === 521) {
          await clearAllWebLocalData();
          await supabase.auth.signOut().catch(() => {});
          setUser(null);
          setSession(null);
          setProfile(null);
        }
      }
    } catch (err) {
      console.warn('[useAuth] Excepción obteniendo perfil:', err);
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
    await clearAllWebLocalData();
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
