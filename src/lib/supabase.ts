import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://rrwoompvuggcczggfgiq.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_5y3OReimX6RP2Tcpl8Ailw_V52PADlk';

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

