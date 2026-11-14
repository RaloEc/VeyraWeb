import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useTheme } from '../theme/ThemeProvider';
import type { AccentTheme } from '../theme/accentColors';
import { toast } from 'sonner';

export type UserProfileType = 'student' | 'work' | 'personal' | 'custom';
export type ControlLevel = 'normal' | 'strict' | 'critical';
export type NotePageFormat = 'infinite' | 'a4';
export type ExplorerSortMode = 'alphabetical' | 'manual';
export type EditorFontFamily = 'inter' | 'serif' | 'mono' | 'handwriting';

export interface SoundSettings {
  normal: string;
  strict: string;
  critical: string;
}

export interface GlobalUserSettings {
  // Perfil & Cuenta
  userName: string;
  userProfile: UserProfileType;
  defaultControlLevel: ControlLevel;

  // Apariencia
  accentTheme: AccentTheme;
  themeMode: 'dark' | 'light' | 'system';
  notePaperMode: 'auto' | 'light';
  editorFontFamily: EditorFontFamily;

  // Notas
  notePageFormat: NotePageFormat;
  explorerSortMode: ExplorerSortMode;
  autoSaveDelayMs: number;

  // Recordatorios & Agenda
  defaultLeadMinutes: number; // 0 = exacto, 5, 10, 15, 30, 60
  soundSettings: SoundSettings;
  soundAlertsEnabled: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string; // "22:00"
  quietHoursEnd: string; // "07:00"
  timeFormat24h: boolean;
  firstDayMonday: boolean;
}

export const DEFAULT_USER_SETTINGS: GlobalUserSettings = {
  userName: '',
  userProfile: 'personal',
  defaultControlLevel: 'normal',

  accentTheme: 'blue',
  themeMode: 'dark',
  notePaperMode: 'auto',
  editorFontFamily: 'inter',

  notePageFormat: 'infinite',
  explorerSortMode: 'alphabetical',
  autoSaveDelayMs: 600,

  defaultLeadMinutes: 0,
  soundSettings: {
    normal: 'ping_brillante.wav',
    strict: 'clicks_tech.wav',
    critical: 'alarma_incendio.mp3',
  },
  soundAlertsEnabled: true,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
  timeFormat24h: true,
  firstDayMonday: true,
};

interface UserSettingsContextType {
  settings: GlobalUserSettings;
  isLoading: boolean;
  isSaving: boolean;
  updateSetting: <K extends keyof GlobalUserSettings>(key: K, value: GlobalUserSettings[K]) => Promise<void>;
  updateSettings: (partial: Partial<GlobalUserSettings>) => Promise<void>;
  resetToDefaults: () => Promise<void>;
}

const UserSettingsContext = createContext<UserSettingsContextType | null>(null);

const STORAGE_KEY = 'veyra_user_settings_cache_v1';

export const UserSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { setAccentTheme, setMode, setNotePaperMode } = useTheme();

  // 1. Inicializar desde caché local instantánea (sin delay)
  const [settings, setSettings] = useState<GlobalUserSettings>(() => {
    if (typeof window === 'undefined') return DEFAULT_USER_SETTINGS;
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      const parsed = cached ? JSON.parse(cached) : {};

      // Respaldo de claves históricas de localStorage si aún no existía la caché unificada
      const legacyNoteFormat = localStorage.getItem('veyra_note_page_format') as NotePageFormat | null;
      const legacySort = localStorage.getItem('veyra_explorer_sort_mode') as ExplorerSortMode | null;
      const legacyPaper = localStorage.getItem('veyra_note_paper_mode') as 'auto' | 'light' | null;

      return {
        ...DEFAULT_USER_SETTINGS,
        ...(legacyNoteFormat ? { notePageFormat: legacyNoteFormat } : {}),
        ...(legacySort ? { explorerSortMode: legacySort } : {}),
        ...(legacyPaper ? { notePaperMode: legacyPaper } : {}),
        ...parsed,
      };
    } catch {
      return DEFAULT_USER_SETTINGS;
    }
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Guardar en localStorage cada vez que cambien
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      } catch (err) {
        console.warn('[UserSettings] Could not cache to localStorage:', err);
      }
    }
  }, [settings]);

  // Sincronizar hacia fuentes locales de compatibilidad (ej: notas, temas)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('veyra_note_page_format', settings.notePageFormat);
    localStorage.setItem('veyra_explorer_sort_mode', settings.explorerSortMode);
    localStorage.setItem('veyra_note_paper_mode', settings.notePaperMode);
    window.dispatchEvent(new CustomEvent('veyra_note_page_format_changed', { detail: settings.notePageFormat }));
  }, [settings.notePageFormat, settings.explorerSortMode, settings.notePaperMode]);

  // 2. Cargar ajustes desde Supabase al autenticarse y suscribirse a Realtime
  useEffect(() => {
    let activeChannel: ReturnType<typeof supabase.channel> | null = null;

    const initSettings = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) {
          setIsLoading(false);
          return;
        }

        setCurrentUserId(user.id);

        // A) Leer metadata de auth (donde syncService y useStore de la app móvil guardan)
        const remoteSettings = user.user_metadata?.settings || {};
        const profileName = user.user_metadata?.full_name || user.user_metadata?.name || '';

        // B) Leer tabla profiles para default_control_level y user_profile
        const { data: profileRow } = await supabase
          .from('profiles')
          .select('user_profile, default_control_level')
          .eq('id', user.id)
          .maybeSingle();

        setSettings((prev) => {
          const merged: GlobalUserSettings = {
            ...prev,
            ...remoteSettings,
            userName: remoteSettings.userName || profileName || prev.userName,
            userProfile: (profileRow?.user_profile as UserProfileType) || remoteSettings.userProfile || prev.userProfile,
            defaultControlLevel: (profileRow?.default_control_level as ControlLevel) || remoteSettings.defaultControlLevel || prev.defaultControlLevel,
            accentTheme: remoteSettings.accentTheme || prev.accentTheme,
            themeMode: remoteSettings.theme || prev.themeMode,
          };
          return merged;
        });

        // C) Suscripción Realtime por WebSocket (canal `collab_sync_${user.id}`) para sincronización instantánea con el móvil
        activeChannel = supabase.channel(`collab_sync_${user.id}`)
          .on('broadcast', { event: 'THEME_CHANGED' }, ({ payload }) => {
            if (payload?.accentTheme) {
              setSettings((s) => ({ ...s, accentTheme: payload.accentTheme }));
            }
          })
          .on('broadcast', { event: 'SETTINGS_CHANGED' }, ({ payload }) => {
            if (payload?.settings) {
              setSettings((s) => ({ ...s, ...payload.settings }));
            }
          })
          .subscribe();
      } catch (err) {
        console.warn('[UserSettings] Error loading remote settings:', err);
      } finally {
        setIsLoading(false);
      }
    };

    initSettings();

    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        initSettings();
      } else if (event === 'SIGNED_OUT') {
        setCurrentUserId(null);
      }
    });

    return () => {
      authListener?.subscription?.unsubscribe();
      if (activeChannel) {
        supabase.removeChannel(activeChannel).catch(() => {});
      }
    };
  }, []);

  // 3. Persistir ajustes combinando Supabase Auth metadata + Postgres Profiles + Realtime Broadcast
  const saveSettingsToCloud = useCallback(async (newSettings: GlobalUserSettings) => {
    if (!currentUserId) return;
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const currentRemoteSettings = user.user_metadata?.settings || {};

      const settingsPayload = {
        ...currentRemoteSettings,
        userName: newSettings.userName,
        userProfile: newSettings.userProfile,
        defaultControlLevel: newSettings.defaultControlLevel,
        accentTheme: newSettings.accentTheme,
        theme: newSettings.themeMode,
        soundSettings: newSettings.soundSettings,
        soundAlertsEnabled: newSettings.soundAlertsEnabled,
        defaultLeadMinutes: newSettings.defaultLeadMinutes,
        quietHoursEnabled: newSettings.quietHoursEnabled,
        quietHoursStart: newSettings.quietHoursStart,
        quietHoursEnd: newSettings.quietHoursEnd,
        timeFormat24h: newSettings.timeFormat24h,
        firstDayMonday: newSettings.firstDayMonday,
        notePageFormat: newSettings.notePageFormat,
        explorerSortMode: newSettings.explorerSortMode,
        editorFontFamily: newSettings.editorFontFamily,
        autoSaveDelayMs: newSettings.autoSaveDelayMs,
        notePaperMode: newSettings.notePaperMode,
      };

      // 1. Guardar en user_metadata (rápido, sin migración de esquema)
      await supabase.auth.updateUser({
        data: {
          full_name: newSettings.userName || undefined,
          name: newSettings.userName || undefined,
          settings: settingsPayload,
        },
      });

      // 2. Reflejar en la tabla profiles para consultas relacionales
      await supabase.from('profiles').upsert(
        {
          id: currentUserId,
          user_profile: newSettings.userProfile,
          default_control_level: newSettings.defaultControlLevel,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );

      // 3. Broadcast instantáneo por WebSocket hacia la App Móvil
      supabase
        .channel(`collab_sync_${currentUserId}`)
        .send({
          type: 'broadcast',
          event: 'SETTINGS_CHANGED',
          payload: { settings: settingsPayload },
        })
        .catch(() => {});

      // Si cambió el color de acento, emitir también el evento THEME_CHANGED que escucha nativamente la app móvil
      if (newSettings.accentTheme) {
        supabase
          .channel(`collab_sync_${currentUserId}`)
          .send({
            type: 'broadcast',
            event: 'THEME_CHANGED',
            payload: { accentTheme: newSettings.accentTheme },
          })
          .catch(() => {});
      }
    } catch (err: any) {
      console.error('[UserSettings] Error saving settings to cloud:', err);
      toast.error('No se pudieron guardar algunos ajustes en la nube');
    } finally {
      setIsSaving(false);
    }
  }, [currentUserId]);

  const updateSetting = useCallback(
    async <K extends keyof GlobalUserSettings>(key: K, value: GlobalUserSettings[K]) => {
      // Optimistic update
      const next = { ...settings, [key]: value };
      setSettings(next);

      // Sincronizar estados visuales inmediatos
      if (key === 'accentTheme') {
        setAccentTheme(value as AccentTheme);
      } else if (key === 'themeMode') {
        if (value === 'system') {
          const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          setMode(prefersDark ? 'dark' : 'light');
        } else {
          setMode(value as 'dark' | 'light');
        }
      } else if (key === 'notePaperMode') {
        setNotePaperMode(value as 'auto' | 'light');
      }

      await saveSettingsToCloud(next);
    },
    [settings, saveSettingsToCloud, setAccentTheme, setMode, setNotePaperMode]
  );

  const updateSettings = useCallback(
    async (partial: Partial<GlobalUserSettings>) => {
      const next = { ...settings, ...partial };
      setSettings(next);

      if (partial.accentTheme) {
        setAccentTheme(partial.accentTheme);
      }
      if (partial.themeMode) {
        if (partial.themeMode === 'system') {
          const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          setMode(prefersDark ? 'dark' : 'light');
        } else {
          setMode(partial.themeMode);
        }
      }
      if (partial.notePaperMode) {
        setNotePaperMode(partial.notePaperMode);
      }

      await saveSettingsToCloud(next);
    },
    [settings, saveSettingsToCloud, setAccentTheme, setMode, setNotePaperMode]
  );

  const resetToDefaults = useCallback(async () => {
    setSettings(DEFAULT_USER_SETTINGS);
    setAccentTheme(DEFAULT_USER_SETTINGS.accentTheme);
    setMode(DEFAULT_USER_SETTINGS.themeMode === 'system' ? 'dark' : DEFAULT_USER_SETTINGS.themeMode);
    setNotePaperMode(DEFAULT_USER_SETTINGS.notePaperMode);
    await saveSettingsToCloud(DEFAULT_USER_SETTINGS);
    toast.success('Ajustes restablecidos por defecto');
  }, [saveSettingsToCloud, setAccentTheme, setMode, setNotePaperMode]);

  const value = useMemo(
    () => ({
      settings,
      isLoading,
      isSaving,
      updateSetting,
      updateSettings,
      resetToDefaults,
    }),
    [settings, isLoading, isSaving, updateSetting, updateSettings, resetToDefaults]
  );

  return <UserSettingsContext.Provider value={value}>{children}</UserSettingsContext.Provider>;
};

export const useUserSettings = () => {
  const ctx = useContext(UserSettingsContext);
  if (!ctx) {
    throw new Error('useUserSettings must be used within a UserSettingsProvider');
  }
  return ctx;
};
