import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ACCENT_PALETTES, type AccentTheme, type AccentPalette } from './accentColors';

export type ThemeMode = 'light' | 'dark' | 'system';
export type NotePaperMode = 'auto' | 'light';

export interface ThemeContextType {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  accentTheme: AccentTheme;
  setAccentTheme: (theme: AccentTheme) => Promise<void>;
  isDark: boolean;
  palette: AccentPalette;
  notePaperMode: NotePaperMode;
  setNotePaperMode: (mode: NotePaperMode) => void;
  isPaperLight: boolean;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // 1. Modo Claro / Oscuro: INDEPENDIENTE para la Web (guardado en localStorage web)
  const [mode, setModeState] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'dark';
    return (localStorage.getItem('veyra_web_theme_mode') as ThemeMode) || 'dark';
  });

  // 1.1 Apariencia de la hoja en Modo Oscuro (auto = oscura como el tema, light = hoja blanca)
  const [notePaperMode, setNotePaperModeState] = useState<NotePaperMode>(() => {
    if (typeof window === 'undefined') return 'auto';
    return (localStorage.getItem('veyra_note_paper_mode') as NotePaperMode) || 'auto';
  });

  const setNotePaperMode = (newMode: NotePaperMode) => {
    setNotePaperModeState(newMode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('veyra_note_paper_mode', newMode);
      window.dispatchEvent(new CustomEvent('veyra_note_paper_mode_changed', { detail: newMode }));
    }
  };

  // 2. Color de acento: Sincronizado en tiempo real con el móvil
  const [accentTheme, setAccentThemeState] = useState<AccentTheme>('blue');
  const [userId, setUserId] = useState<string | null>(null);

  const setMode = (newMode: ThemeMode) => {
    setModeState(newMode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('veyra_web_theme_mode', newMode);
    }
  };

  // Carga inicial y escucha de WebSockets en tiempo real
  useEffect(() => {
    let activeChannel: any = null;

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setUserId(user.id);

      // Acento inicial guardado en la cuenta
      const cloudAccent = user.user_metadata?.settings?.accentTheme || user.user_metadata?.accentTheme;
      if (cloudAccent && ACCENT_PALETTES[cloudAccent as AccentTheme]) {
        setAccentThemeState(cloudAccent as AccentTheme);
      }

      // Canal WebSocket compartido con el móvil (collab_sync_${userId})
      activeChannel = supabase.channel(`collab_sync_${user.id}`)
        .on('broadcast', { event: 'THEME_CHANGED' }, ({ payload }) => {
          if (payload?.accentTheme && ACCENT_PALETTES[payload.accentTheme as AccentTheme]) {
            console.log('🎨 [Realtime Theme] Nuevo acento recibido desde el móvil:', payload.accentTheme);
            setAccentThemeState(payload.accentTheme as AccentTheme);
          }
        })
        .subscribe();
    });

    return () => {
      if (activeChannel) {
        supabase.removeChannel(activeChannel).catch(() => {});
      }
    };
  }, []);

  // Cambiar el color desde la Web (emite a la app móvil y guarda en Supabase)
  const setAccentTheme = async (newAccent: AccentTheme) => {
    setAccentThemeState(newAccent);
    if (!userId) return;

    // 1. Emitir por WebSocket para actualización instantánea en el móvil (100–250ms)
    supabase.channel(`collab_sync_${userId}`).send({
      type: 'broadcast',
      event: 'THEME_CHANGED',
      payload: { accentTheme: newAccent },
    }).catch(() => {});

    // 2. Persistir en la cuenta en la nube
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.auth.updateUser({
        data: {
          settings: {
            ...(user.user_metadata?.settings || {}),
            accentTheme: newAccent,
          },
        },
      });
    }
  };

  // Resolver si la vista es oscura según modo o preferencias del sistema
  const isDark = mode === 'system'
    ? (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    : mode === 'dark';

  const palette = (ACCENT_PALETTES[accentTheme] || ACCENT_PALETTES.blue)[isDark ? 'dark' : 'light'];

  // Inyectar variables CSS en el DOM
  useEffect(() => {
    const root = document.documentElement;

    root.style.setProperty('--accent-primary', palette.primary);
    root.style.setProperty('--accent-muted', palette.primaryMuted);
    root.style.setProperty('--accent-bg', palette.primaryBg);

    if (isDark) {
      root.classList.add('dark');
      root.style.colorScheme = 'dark';
      root.style.setProperty('--bg-main', '#0B0B0C');
      root.style.setProperty('--bg-surface', '#111113');
      root.style.setProperty('--bg-elevated', '#18181B');
      root.style.setProperty('--bg-hover', 'rgba(255, 255, 255, 0.04)');
      root.style.setProperty('--border-main', 'rgba(255, 255, 255, 0.06)');
      root.style.setProperty('--border-subtle', 'rgba(255, 255, 255, 0.03)');
      root.style.setProperty('--text-main', '#EDEDEF');
      root.style.setProperty('--text-muted', '#8A8A93');
      root.style.setProperty('--text-subtle', '#52525B');
    } else {
      root.classList.remove('dark');
      root.style.colorScheme = 'light';
      root.style.setProperty('--bg-main', '#FAFAFA');
      root.style.setProperty('--bg-surface', '#FFFFFF');
      root.style.setProperty('--bg-elevated', '#F4F4F5');
      root.style.setProperty('--bg-hover', 'rgba(0, 0, 0, 0.04)');
      root.style.setProperty('--border-main', 'rgba(0, 0, 0, 0.08)');
      root.style.setProperty('--border-subtle', 'rgba(0, 0, 0, 0.04)');
      root.style.setProperty('--text-main', '#18181B');
      root.style.setProperty('--text-muted', '#71717A');
      root.style.setProperty('--text-subtle', '#A1A1AA');
    }
  }, [accentTheme, isDark, palette]);

  const isPaperLight = isDark && notePaperMode === 'light';

  return (
    <ThemeContext.Provider
      value={{
        mode,
        setMode,
        accentTheme,
        setAccentTheme,
        isDark,
        palette,
        notePaperMode,
        setNotePaperMode,
        isPaperLight,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme debe usarse dentro de ThemeProvider');
  return context;
};
