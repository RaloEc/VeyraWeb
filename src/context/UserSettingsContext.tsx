import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useTheme } from '../theme/ThemeProvider';
import type { AccentTheme } from '../theme/accentColors';
import { DeviceService } from '../lib/deviceService';
import { PushService } from '../lib/pushService';
import { clearAllWebLocalData } from '../lib/clearLocalData';
import { toast } from 'sonner';

export type UserProfileType = 'student' | 'work' | 'personal' | 'custom';
export type ControlLevel = 'normal' | 'critical';
export type NotePageFormat = 'infinite' | 'a4';
export type ExplorerSortMode = 'alphabetical' | 'manual';
export type EditorFontFamily = 'inter' | 'serif' | 'mono' | 'handwriting';

export interface SoundSettings {
  normal: string;
  critical: string;
}

export interface GlobalUserSettings {
  // Perfil & Cuenta
  userName: string;
  defaultControlLevel: ControlLevel;

  // Apariencia
  accentTheme: AccentTheme;
  themeMode: 'dark' | 'light' | 'system';
  amoledEnabled: boolean;
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
  defaultControlLevel: 'normal',

  accentTheme: 'blue',
  themeMode: 'dark',
  amoledEnabled: false,
  notePaperMode: 'auto',
  editorFontFamily: 'inter',

  notePageFormat: 'infinite',
  explorerSortMode: 'alphabetical',
  autoSaveDelayMs: 600,

  defaultLeadMinutes: 0,
  soundSettings: {
    normal: 'ping_brillante.wav',
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

const normalizeControlLevel = (raw?: string | null): ControlLevel => {
  return raw?.toLowerCase() === 'critical' ? 'critical' : 'normal';
};

export const UserSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { setAccentTheme, setMode, setAmoledEnabled, setNotePaperMode } = useTheme();

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
      const webThemeMode = localStorage.getItem('veyra_web_theme_mode') as 'dark' | 'light' | 'system' | null;

      return {
        ...DEFAULT_USER_SETTINGS,
        ...(legacyNoteFormat ? { notePageFormat: legacyNoteFormat } : {}),
        ...(legacySort ? { explorerSortMode: legacySort } : {}),
        ...(legacyPaper ? { notePaperMode: legacyPaper } : {}),
        ...parsed,
        ...(webThemeMode === 'dark' || webThemeMode === 'light' || webThemeMode === 'system'
          ? { themeMode: webThemeMode }
          : {}),
        defaultControlLevel: normalizeControlLevel(parsed.defaultControlLevel),
      };
    } catch {
      return DEFAULT_USER_SETTINGS;
    }
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const isSavingRef = useRef<boolean>(false);

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

  // Mantener ThemeProvider siempre sincronizado con el estado de UserSettingsContext
  useEffect(() => {
    setAmoledEnabled(Boolean(settings.amoledEnabled));
    setNotePaperMode(settings.notePaperMode);
    setMode(settings.themeMode);
  }, [settings.amoledEnabled, settings.notePaperMode, settings.themeMode, setAmoledEnabled, setNotePaperMode, setMode]);

  // 2. Cargar ajustes desde Supabase al autenticarse y suscribirse a Realtime
  useEffect(() => {
    let activeChannel: ReturnType<typeof supabase.channel> | null = null;

    const initSettings = async () => {
      try {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        const user = userData?.user;
        if (userError || !user) {
          setIsLoading(false);
          return;
        }

        setCurrentUserId(user.id);

        // A) Leer metadata de auth (donde syncService y useStore de la app móvil guardan)
        const remoteSettings = user.user_metadata?.settings || {};
        const profileName = user.user_metadata?.full_name || user.user_metadata?.name || '';

        // B) Leer tabla profiles para default_control_level (con fallback seguro)
        let profileRow: { default_control_level?: string | null } | null = null;
        try {
          const { data } = await supabase
            .from('profiles')
            .select('default_control_level')
            .eq('id', user.id)
            .maybeSingle();
          profileRow = data;
        } catch {
          // Ignorar fallas de red silenciosamente
        }

        setSettings((prev) => {
          const resolvedAmoled = typeof remoteSettings.amoledEnabled === 'boolean' ? remoteSettings.amoledEnabled : prev.amoledEnabled;
          const resolvedNotePaperMode: 'auto' | 'light' =
            remoteSettings.notePaperMode === 'light' || remoteSettings.notePaperMode === 'auto'
              ? remoteSettings.notePaperMode
              : prev.notePaperMode;
          const merged: GlobalUserSettings = {
            ...prev,
            ...remoteSettings,
            userName: remoteSettings.userName || profileName || prev.userName,
            defaultControlLevel: normalizeControlLevel(
              profileRow?.default_control_level || remoteSettings.defaultControlLevel || prev.defaultControlLevel
            ),
            accentTheme: remoteSettings.accentTheme || prev.accentTheme,
            // themeMode es independiente por dispositivo (Web vs Móvil)
            themeMode: prev.themeMode,
            amoledEnabled: Boolean(resolvedAmoled),
            notePaperMode: resolvedNotePaperMode,
          };
          return merged;
        });

        // C) Suscripción Realtime por WebSocket (canal `collab_sync_${user.id}`) para sincronización instantánea con el móvil
        activeChannel = supabase.channel(`collab_sync_${user.id}`, { config: { private: true } })
          .on('broadcast', { event: 'THEME_CHANGED' }, ({ payload }) => {
            if (payload?.accentTheme) {
              setSettings((s) => ({ ...s, accentTheme: payload.accentTheme }));
            }
          })
          .on('broadcast', { event: 'SETTINGS_CHANGED' }, ({ payload }) => {
            if (payload?.settings) {
              const { theme: _ignoredMobileTheme, ...otherRemoteSettings } = payload.settings;
              setSettings((s) => ({
                ...s,
                ...otherRemoteSettings,
                ...(payload.settings.notePaperMode === 'light' || payload.settings.notePaperMode === 'auto'
                  ? { notePaperMode: payload.settings.notePaperMode }
                  : {}),
                ...(payload.settings.defaultControlLevel
                  ? { defaultControlLevel: normalizeControlLevel(payload.settings.defaultControlLevel) }
                  : {}),
              }));
            }
          })
          .on('broadcast', { event: 'FORCE_SIGNOUT_DEVICE' }, async ({ payload }) => {
            try {
              const myDeviceId = DeviceService.getOrCreateDeviceId();
              const myEndpoint = (await PushService.getExistingSubscription())?.endpoint;
              const isTarget =
                payload?.targetDeviceId === '*' ||
                (payload?.targetDeviceId && payload.targetDeviceId === myDeviceId) ||
                (payload?.targetEndpoint && myEndpoint && payload.targetEndpoint === myEndpoint);
              if (isTarget) {
                await clearAllWebLocalData();
                await supabase.auth.signOut();
                if (typeof window !== 'undefined') {
                  window.location.href = '/';
                }
              }
            } catch (err) {
              console.warn('[UserSettings] Error handling FORCE_SIGNOUT_DEVICE:', err);
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
      if (event === 'SIGNED_IN') {
        initSettings();
      } else if (event === 'USER_UPDATED' && !isSavingRef.current) {
        initSettings();
      } else if (event === 'SIGNED_OUT') {
        setCurrentUserId(null);
      }
    });

    return () => {
      authListener?.subscription?.unsubscribe();
      if (activeChannel) {
        supabase.removeChannel(activeChannel).catch(() => { });
      }
    };
  }, []);

  // 3. Persistir ajustes combinando Supabase Auth metadata + Postgres Profiles + Realtime Broadcast
  const saveSettingsToCloud = useCallback(async (newSettings: GlobalUserSettings) => {
    isSavingRef.current = true;
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const resolvedUserId = currentUserId || user.id;

      const currentRemoteSettings = user.user_metadata?.settings || {};

      const settingsPayload = {
        ...currentRemoteSettings,
        userName: newSettings.userName,
        defaultControlLevel: newSettings.defaultControlLevel,
        accentTheme: newSettings.accentTheme,
        // No sobrescribir `theme` para mantener el modo claro/oscuro independiente entre Web y Móvil
        amoledEnabled: newSettings.amoledEnabled,
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
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      };

      // 1. Guardar en user_metadata (rápido, sin migración de esquema)
      await supabase.auth.updateUser({
        data: {
          full_name: newSettings.userName || undefined,
          name: newSettings.userName || undefined,
          settings: settingsPayload,
        },
      });

      // 2. Reflejar en la tabla profiles usando UPDATE por id (evita 403 en INSERT/upsert)
      await supabase
        .from('profiles')
        .update({
          default_control_level: newSettings.defaultControlLevel,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      // 3. Broadcast instantáneo por WebSocket hacia la App Móvil
      supabase
        .channel(`collab_sync_${resolvedUserId}`, { config: { private: true } })
        .send({
          type: 'broadcast',
          event: 'SETTINGS_CHANGED',
          payload: { settings: settingsPayload },
        })
        .catch(() => { });

      // Si cambió el color de acento, emitir también el evento THEME_CHANGED que escucha nativamente la app móvil
      if (newSettings.accentTheme) {
        supabase
          .channel(`collab_sync_${resolvedUserId}`, { config: { private: true } })
          .send({
            type: 'broadcast',
            event: 'THEME_CHANGED',
            payload: { accentTheme: newSettings.accentTheme },
          })
          .catch(() => { });
      }
    } catch (err: any) {
      console.error('[UserSettings] Error saving settings to cloud:', err);
      toast.error('No se pudieron guardar algunos ajustes en la nube');
    } finally {
      isSavingRef.current = false;
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
        setMode(value as 'dark' | 'light' | 'system');
        // El tema claro/oscuro es local a la Web y no se sincroniza con Android
        return;
      } else if (key === 'amoledEnabled') {
        setAmoledEnabled(Boolean(value));
      } else if (key === 'notePaperMode') {
        setNotePaperMode(value as 'auto' | 'light');
      }

      await saveSettingsToCloud(next);
    },
    [settings, saveSettingsToCloud, setAccentTheme, setMode, setAmoledEnabled, setNotePaperMode]
  );

  const updateSettings = useCallback(
    async (partial: Partial<GlobalUserSettings>) => {
      const next = { ...settings, ...partial };
      setSettings(next);

      if (partial.accentTheme) {
        setAccentTheme(partial.accentTheme);
      }
      if (partial.themeMode) {
        setMode(partial.themeMode);
      }
      if (typeof partial.amoledEnabled === 'boolean') {
        setAmoledEnabled(partial.amoledEnabled);
      }
      if (partial.notePaperMode) {
        setNotePaperMode(partial.notePaperMode);
      }

      const hasCloudKeys = Object.keys(partial).some((k) => k !== 'themeMode');
      if (hasCloudKeys) {
        await saveSettingsToCloud(next);
      }
    },
    [settings, saveSettingsToCloud, setAccentTheme, setMode, setAmoledEnabled, setNotePaperMode]
  );

  const resetToDefaults = useCallback(async () => {
    setSettings(DEFAULT_USER_SETTINGS);
    setAccentTheme(DEFAULT_USER_SETTINGS.accentTheme);
    setMode(DEFAULT_USER_SETTINGS.themeMode === 'system' ? 'dark' : DEFAULT_USER_SETTINGS.themeMode);
    setAmoledEnabled(DEFAULT_USER_SETTINGS.amoledEnabled);
    setNotePaperMode(DEFAULT_USER_SETTINGS.notePaperMode);
    await saveSettingsToCloud(DEFAULT_USER_SETTINGS);
    toast.success('Ajustes restablecidos por defecto');
  }, [saveSettingsToCloud, setAccentTheme, setMode, setAmoledEnabled, setNotePaperMode]);

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
