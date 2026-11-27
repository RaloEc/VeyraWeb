import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

export const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || 'https://rrwoompvuggcczggfgiq.supabase.co';
export const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJyd29vbXB2dWdnY2N6Z2dmZ2lxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5MzQ0MTQsImV4cCI6MjEwNzUxMDQxNH0.aRpjMpXflAOfh-hWIG6XBGW0FPoN91IoYR9FIQsE4fo';

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'veyra_web_auth_token',
  },
  realtime: {
    params: {
      eventsPerSecond: 20,
    },
  },
});

// Sincronizar token de autenticación con el socket de Supabase Realtime para canales privados (RLS)
supabase.auth.onAuthStateChange((_event, session) => {
  if (session?.access_token) {
    supabase.realtime.setAuth(session.access_token).catch(() => {});
  }
});
supabase.auth.getSession().then(({ data: { session } }) => {
  if (session?.access_token) {
    supabase.realtime.setAuth(session.access_token).catch(() => {});
  }
}).catch(() => {});

