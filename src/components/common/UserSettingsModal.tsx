import React, { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import {
  LogOut,
  Check,
  Moon,
  Sun,
  Laptop,
  Download,
  FileText,
  Scroll,
  Bell,
  BellOff,
  Loader2,
  User,
  Palette,
  Clock,
  Smartphone,
  Volume2,
  CloudCheck,
  RotateCcw,
  Trash2,
  RefreshCw,
  Apple,
  AlertTriangle,
  Link2,
  ShieldCheck,
  Unlink,
  X,
} from 'lucide-react';
import type { UserIdentity } from '@supabase/supabase-js';
import { GoogleIcon } from './GoogleIcon';
import { IntegrationsSettingsPanel } from './IntegrationsSettingsPanel';
import { AUTH_INTENT_STORAGE_KEY, getAuthCallbackUrl } from '../../lib/googleDriveIntegration';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { PushService, detectBraveBrowser } from '../../lib/pushService';
import { DeviceService, type ConnectedDevice } from '../../lib/deviceService';
import { supabase } from '../../lib/supabase';
import { localDB } from '../../lib/db/local-db';
import { toast } from 'sonner';
import { ACCENT_PALETTES, type AccentTheme } from '../../theme/accentColors';
import { useTheme } from '../../theme/ThemeProvider';
import { cn } from '../../lib/utils';
import {
  useUserSettings,
  type ControlLevel,
  type EditorFontFamily,
} from '../../context/UserSettingsContext';
import { alertSoundPlayer } from '../../lib/audio/alertSounds';

type BrowserNotificationPermission = NotificationPermission | 'unsupported';

function readBrowserNotificationPermission(): BrowserNotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export interface UserSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId?: string;
  userEmail?: string;
  userName?: string;
  userAvatarUrl?: string;
  onSignOut?: () => void;
}

type TabType =
  | 'account'
  | 'integrations'
  | 'appearance'
  | 'notes'
  | 'reminders'
  | 'notifications'
  | 'devices';

export const UserSettingsModal: React.FC<UserSettingsModalProps> = ({
  isOpen,
  onClose,
  userId,
  userEmail,
  userName: initialUserName,
  onSignOut,
}) => {
  const { isDark } = useTheme();
  const { isInstallable, isInstalled, isIOS, promptInstall } = usePWAInstall();
  const { settings, isSaving, updateSetting, resetToDefaults } = useUserSettings();

  const [activeTab, setActiveTab] = useState<TabType>('account');
  const [tabDirection, setTabDirection] = useState<'next' | 'prev'>('next');
  const navRef = useRef<HTMLElement>(null);
  const tabButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [indicatorStyle, setIndicatorStyle] = useState<{ left: number; width: number; ready: boolean }>({
    left: 0,
    width: 0,
    ready: false,
  });

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);
  const [localName, setLocalName] = useState(settings.userName || initialUserName || '');
  const [isUpdatingName, setIsUpdatingName] = useState(false);

  // Push notification state
  const [pushSubscribed, setPushSubscribed] = useState<boolean>(false);
  const [pushLoading, setPushLoading] = useState<boolean>(false);
  const [testPushLoading, setTestPushLoading] = useState<boolean>(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [isBraveBrowser, setIsBraveBrowser] = useState<boolean>(false);
  const isPushSupported = PushService.isSupported();
  const [notificationPermission, setNotificationPermission] = useState<BrowserNotificationPermission>(() =>
    readBrowserNotificationPermission()
  );
  const isSecureContext = typeof window !== 'undefined' ? window.isSecureContext : true;

  // Dispositivos conectados
  const [devices, setDevices] = useState<ConnectedDevice[]>([]);
  const [devicesLoading, setDevicesLoading] = useState<boolean>(false);
  const [removingDeviceId, setRemovingDeviceId] = useState<string | null>(null);

  // Identidades vinculadas (Fase 3: linkIdentity)
  const [identities, setIdentities] = useState<UserIdentity[]>([]);
  const [identitiesLoading, setIdentitiesLoading] = useState<boolean>(false);
  const [linkingGoogle, setLinkingGoogle] = useState<boolean>(false);

  // Eliminación de cuenta
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState<string>('');
  const [isDeletingAccount, setIsDeletingAccount] = useState<boolean>(false);

  const handleDeleteAccount = async () => {
    if (deleteConfirmText.trim().toUpperCase() !== 'ELIMINAR') {
      toast.error('Escribe ELIMINAR para confirmar el borrado permanente.');
      return;
    }

    setIsDeletingAccount(true);
    try {
      if (userId) {
        await PushService.unsubscribe(userId).catch(() => {});

        const { error: rpcError } = await supabase.rpc('delete_user_account');
        if (rpcError) {
          console.error('[UserSettingsModal] Error en RPC delete_user_account:', rpcError.message);
          toast.error(`No se pudo eliminar la cuenta en el servidor: ${rpcError.message}`);
          return;
        }
      }

      try {
        await localDB.delete();
      } catch {
        // ignore localDB delete error
      }

      // Eliminar todas las bases IndexedDB locales de Yjs (veyra-yjs-*)
      if (typeof window !== 'undefined' && typeof indexedDB !== 'undefined') {
        try {
          const dbs = typeof indexedDB.databases === 'function' ? await indexedDB.databases() : [];
          for (const dbInfo of dbs) {
            if (dbInfo.name && dbInfo.name.startsWith('veyra-yjs-')) {
              await new Promise<void>((resolve) => {
                const req = indexedDB.deleteDatabase(dbInfo.name!);
                req.onsuccess = () => resolve();
                req.onerror = () => resolve();
                req.onblocked = () => resolve();
              });
            }
          }
        } catch {
          // ignore indexedDB enumeration errors
        }
        try {
          localStorage.clear();
          sessionStorage.clear();
        } catch {
          // ignore storage clear errors
        }
      }

      await supabase.auth.signOut().catch(() => {});

      toast.success('Tu cuenta y todos tus datos han sido eliminados.');
      onClose();
      if (onSignOut) {
        onSignOut();
      } else {
        window.location.href = '/';
      }
    } catch (err: any) {
      console.error('[UserSettingsModal] Error deleting account:', err);
      toast.error(err?.message || 'No se pudo eliminar la cuenta. Intenta de nuevo.');
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const loadDevices = async () => {
    if (!userId) return;
    setDevicesLoading(true);
    try {
      const list = await DeviceService.fetchConnectedDevices(userId);
      setDevices(list);
    } catch {
      toast.error('Error al cargar dispositivos');
    } finally {
      setDevicesLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen || activeTab !== 'devices') return;
    loadDevices();
  }, [isOpen, activeTab, userId]);

  const handleRemoveDevice = async (device: ConnectedDevice) => {
    if (device.isCurrent) return;
    setRemovingDeviceId(device.id);
    try {
      const res = await DeviceService.removeDevice(device, userId);
      if (res.success) {
        setDevices((prev) => prev.filter((d) => d.id !== device.id));
        toast.success(`Dispositivo "${device.name}" desvinculado y sesión remota cerrada`);
      } else {
        toast.error(res.error || 'No se pudo desvincular');
      }
    } catch {
      toast.error('Error inesperado al desvincular');
    } finally {
      setRemovingDeviceId(null);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    let permStatus: PermissionStatus | null = null;
    const syncPermission = () => {
      if (active) {
        setNotificationPermission(readBrowserNotificationPermission());
      }
    };

    window.addEventListener('focus', syncPermission);

    detectBraveBrowser().then((isBrave) => {
      if (active) setIsBraveBrowser(isBrave);
    });

    if (typeof navigator !== 'undefined' && 'permissions' in navigator) {
      try {
        navigator.permissions
          .query({ name: 'notifications' as PermissionName })
          .then((status) => {
            if (!active) return;
            permStatus = status;
            setNotificationPermission(readBrowserNotificationPermission());
            status.onchange = syncPermission;
          })
          .catch(() => {});
      } catch {
        // Ignore browsers that reject permissions.query for notifications
      }
    }

    if (isPushSupported) {
      PushService.getExistingSubscription().then((sub) => {
        if (!active) return;
        setPushSubscribed(!!sub);
        setNotificationPermission(readBrowserNotificationPermission());
      });
    }

    return () => {
      active = false;
      window.removeEventListener('focus', syncPermission);
      if (permStatus) {
        permStatus.onchange = null;
      }
    };
  }, [isOpen, isPushSupported]);

  useEffect(() => {
    if (settings.userName) {
      setLocalName(settings.userName);
    } else if (initialUserName) {
      setLocalName(initialUserName);
    }
  }, [settings.userName, initialUserName]);

  const handleSaveName = async () => {
    if (localName.trim() === settings.userName) return;
    setIsUpdatingName(true);
    try {
      await updateSetting('userName', localName.trim());
      toast.success('Nombre actualizado');
    } catch {
      toast.error('Error al actualizar el nombre');
    } finally {
      setIsUpdatingName(false);
    }
  };

  const handleEnableNotifications = async () => {
    setPushError(null);
    const currentPerm = readBrowserNotificationPermission();
    setNotificationPermission(currentPerm);

    if (currentPerm === 'unsupported') {
      const msg = 'Este navegador no soporta notificaciones web.';
      setPushError(msg);
      toast.error(msg);
      return;
    }

    if (currentPerm === 'denied') {
      const msg =
        'Las notificaciones están bloqueadas en el navegador. Habilítalas desde el candado de la barra de direcciones.';
      setPushError(msg);
      toast.error(msg);
      return;
    }

    setPushLoading(true);
    try {
      if (isPushSupported && userId) {
        const res = await PushService.subscribe(userId);
        setNotificationPermission(readBrowserNotificationPermission());
        if (res.success) {
          setPushSubscribed(true);
          setPushError(null);
          toast.success('¡Notificaciones activadas! Recibirás avisos aun con la pestaña cerrada.');
        } else {
          const errMsg = res.error || 'No se pudieron activar las notificaciones';
          setPushError(errMsg);
          toast.error(errMsg);
        }
      } else if (typeof window !== 'undefined' && 'Notification' in window) {
        const perm = await Notification.requestPermission();
        setNotificationPermission(perm);
        if (perm === 'granted') {
          setPushError(null);
          toast.success('Permiso de notificaciones concedido.');
        } else {
          const msg = 'No se otorgó permiso de notificaciones.';
          setPushError(msg);
          toast.error(msg);
        }
      }
    } catch {
      const msg = 'Ocurrió un error al solicitar permiso de notificaciones';
      setPushError(msg);
      toast.error(msg);
    } finally {
      setNotificationPermission(readBrowserNotificationPermission());
      setPushLoading(false);
    }
  };

  const handleRefreshPermission = () => {
    const nextPerm = readBrowserNotificationPermission();
    setNotificationPermission(nextPerm);
    if (nextPerm === 'granted') {
      setPushError(null);
      toast.success('¡Permiso concedido! Ya puedes activar o probar las notificaciones.');
    } else if (nextPerm === 'denied') {
      toast.error('Siguen bloqueadas en este navegador. Revísalo en la configuración del sitio.');
    }
  };

  const handleTogglePush = async () => {
    if (!userId) {
      toast.error('Inicia sesión para activar las notificaciones');
      return;
    }
    setPushError(null);
    setPushLoading(true);
    try {
      if (pushSubscribed) {
        const res = await PushService.unsubscribe(userId);
        if (res.success) {
          setPushSubscribed(false);
          toast.success('Notificaciones web desactivadas');
        } else {
          const errMsg = res.error || 'Error al desactivar notificaciones';
          setPushError(errMsg);
          toast.error(errMsg);
        }
      } else {
        const res = await PushService.subscribe(userId);
        if (res.success) {
          setPushSubscribed(true);
          setPushError(null);
          toast.success('¡Notificaciones web activadas! Recibirás avisos aun con la pestaña cerrada.');
        } else {
          const errMsg = res.error || 'Error al activar notificaciones';
          setPushError(errMsg);
          toast.error(errMsg);
        }
      }
    } catch {
      const msg = 'Ocurrió un error inesperado';
      setPushError(msg);
      toast.error(msg);
    } finally {
      setNotificationPermission(readBrowserNotificationPermission());
      setPushLoading(false);
    }
  };

  const handleSendTestPush = async () => {
    setTestPushLoading(true);
    try {
      const res = await PushService.sendTestNotification();
      if (res.success) {
        toast.success(
          res.sent > 1
            ? `Notificación de prueba enviada a ${res.sent} dispositivos`
            : 'Notificación de prueba enviada. Debería aparecer en tu navegador en segundos.'
        );
      } else {
        toast.error(res.error || 'No se pudo enviar la notificación de prueba');
      }
    } catch {
      toast.error('Error al solicitar notificación de prueba');
    } finally {
      setTestPushLoading(false);
    }
  };

  const availableAccents: { theme: AccentTheme; label: string; hex: string }[] = [
    { theme: 'blue', label: 'Azul', hex: ACCENT_PALETTES.blue[isDark ? 'dark' : 'light'].primary },
    { theme: 'purple', label: 'Púrpura', hex: ACCENT_PALETTES.purple[isDark ? 'dark' : 'light'].primary },
    { theme: 'green', label: 'Verde', hex: ACCENT_PALETTES.green[isDark ? 'dark' : 'light'].primary },
    { theme: 'red', label: 'Rojo', hex: ACCENT_PALETTES.red[isDark ? 'dark' : 'light'].primary },
    { theme: 'amber', label: 'Ámbar', hex: ACCENT_PALETTES.amber[isDark ? 'dark' : 'light'].primary },
    { theme: 'pink', label: 'Rosa', hex: ACCENT_PALETTES.pink[isDark ? 'dark' : 'light'].primary },
  ];

  const controlLevelOptions: { id: ControlLevel; label: string; desc: string; color: string }[] = [
    { id: 'normal', label: 'Normal', desc: 'Alerta sutil y no invasiva', color: '#10B981' },
    { id: 'critical', label: 'Crítico', desc: 'Alarma persistente hasta confirmación manual', color: '#EF4444' },
  ];

  useEffect(() => {
    if (!isOpen || activeTab !== 'account' || !userId) return;
    let active = true;
    setIdentitiesLoading(true);
    supabase.auth
      .getUserIdentities()
      .then(({ data, error }) => {
        if (!active) return;
        if (!error && data?.identities) {
          setIdentities(data.identities);
        }
      })
      .finally(() => {
        if (active) setIdentitiesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isOpen, activeTab, userId]);

  const googleIdentity = identities.find((id) => id.provider === 'google');

  const handleLinkGoogleIdentity = async () => {
    setLinkingGoogle(true);
    try {
      sessionStorage.setItem(AUTH_INTENT_STORAGE_KEY, 'link_google');
      const { error } = await supabase.auth.linkIdentity({
        provider: 'google',
        options: {
          redirectTo: getAuthCallbackUrl(),
        },
      });
      if (error) throw error;
    } catch (err: unknown) {
      sessionStorage.removeItem(AUTH_INTENT_STORAGE_KEY);
      console.error('[UserSettingsModal] linkIdentity error:', err);
      toast.error((err as Error).message || 'No se pudo vincular la cuenta de Google.');
      setLinkingGoogle(false);
    }
  };

  const handleUnlinkGoogleIdentity = async () => {
    if (!googleIdentity || identities.length <= 1) return;
    setLinkingGoogle(true);
    try {
      const { error } = await supabase.auth.unlinkIdentity(googleIdentity);
      if (error) throw error;
      setIdentities((prev) => prev.filter((item) => item.id !== googleIdentity.id));
      toast.success('Cuenta de Google desvinculada del inicio de sesión.');
    } catch (err: unknown) {
      console.error('[UserSettingsModal] unlinkIdentity error:', err);
      toast.error((err as Error).message || 'No se pudo desvincular la cuenta de Google.');
    } finally {
      setLinkingGoogle(false);
    }
  };

  const tabs = [
    { id: 'account' as TabType, label: 'Cuenta y Perfil', icon: User },
    { id: 'integrations' as TabType, label: 'Integraciones', icon: Link2 },
    { id: 'appearance' as TabType, label: 'Apariencia', icon: Palette },
    { id: 'reminders' as TabType, label: 'Recordatorios & Agenda', icon: Clock },
    { id: 'notes' as TabType, label: 'Notas & Editor', icon: FileText },
    { id: 'notifications' as TabType, label: 'Notificaciones', icon: Bell },
    { id: 'devices' as TabType, label: 'Dispositivos & PWA', icon: Smartphone },
  ];

  const handleTabChange = (nextTab: TabType) => {
    if (nextTab === activeTab) return;
    const prevIdx = tabs.findIndex((t) => t.id === activeTab);
    const nextIdx = tabs.findIndex((t) => t.id === nextTab);
    setTabDirection(nextIdx >= prevIdx ? 'next' : 'prev');
    setActiveTab(nextTab);
  };

  const updateIndicator = useCallback(() => {
    const activeEl = tabButtonRefs.current[activeTab];
    if (!activeEl) return;
    setIndicatorStyle({
      left: activeEl.offsetLeft,
      width: activeEl.offsetWidth,
      ready: true,
    });
  }, [activeTab]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    updateIndicator();
  }, [isOpen, activeTab, updateIndicator]);

  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener('resize', updateIndicator);
    return () => window.removeEventListener('resize', updateIndicator);
  }, [isOpen, updateIndicator]);

  if (!isOpen) return null;

  return (
    <div
      role="region"
      aria-label="Ajustes de Veyra"
      className="flex-1 min-w-0 w-full h-full bg-veyra-canvas text-veyra-text flex flex-col overflow-hidden"
    >
      {/* Horizontal Minimalist Tab Bar */}
      <div className="border-b border-veyra-border bg-veyra-canvas/90 px-5 sm:px-8 flex items-center justify-between gap-4 shrink-0">
        <nav
          ref={navRef}
          aria-label="Secciones de ajustes"
          className="relative flex items-center gap-5 sm:gap-6 overflow-x-auto scrollbar-none -mb-px"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                ref={(el) => {
                  tabButtonRefs.current[tab.id] = el;
                }}
                type="button"
                onClick={() => handleTabChange(tab.id)}
                className={cn(
                  'relative flex items-center gap-2 py-3 text-xs sm:text-[13px] whitespace-nowrap transition-colors duration-200 cursor-pointer shrink-0',
                  isActive
                    ? 'text-veyra-text font-semibold'
                    : 'text-veyra-muted hover:text-veyra-text font-medium'
                )}
              >
                <Icon className={cn('w-3.5 h-3.5 shrink-0 transition-colors duration-200', isActive ? 'text-accent' : 'text-veyra-subtle')} />
                <span>{tab.label}</span>
                {tab.id === 'notifications' &&
                  (notificationPermission === 'default' || notificationPermission === 'denied') && (
                    <span
                      className={cn(
                        'w-1.5 h-1.5 rounded-full shrink-0',
                        notificationPermission === 'denied' ? 'bg-amber-400' : 'bg-accent'
                      )}
                    />
                  )}
                {tab.id === 'devices' && isInstallable && (
                  <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-accent" />
                )}
              </button>
            );
          })}

          {indicatorStyle.ready && (
            <span
              aria-hidden="true"
              style={{
                transform: `translate3d(${indicatorStyle.left}px, 0, 0)`,
                width: `${indicatorStyle.width}px`,
              }}
              className="pointer-events-none absolute bottom-0 left-0 h-[2px] bg-accent rounded-full transition-[transform,width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
            />
          )}
        </nav>

        {/* Right: Sync Status & Close Settings Button */}
        <div className="flex items-center gap-2 shrink-0 py-1.5">
          {isSaving ? (
            <span className="hidden sm:flex items-center gap-1.5 px-2 py-1 text-[11px] text-accent font-medium">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Guardando...</span>
            </span>
          ) : (
            <span
              title="Sincronización activa en la nube"
              className="hidden sm:flex items-center gap-1.5 px-2 py-1 text-[11px] text-veyra-subtle font-medium"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>Sincronizado</span>
            </span>
          )}

          <button
            type="button"
            onClick={onClose}
            title="Cerrar ajustes (Esc)"
            aria-label="Cerrar ajustes"
            className="p-1.5 rounded-md bg-red-500/10 hover:bg-red-500/20 text-red-500 transition-colors cursor-pointer flex items-center justify-center"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Single-Column Tab Content */}
      <div className="flex-1 min-h-0 p-5 sm:p-7 lg:px-10 lg:py-8 overflow-y-auto overflow-x-hidden">
        <div
          key={activeTab}
          className={cn(
            'max-w-3xl mx-auto space-y-6 text-xs pb-8',
            tabDirection === 'next' ? 'veyra-settings-tab-next' : 'veyra-settings-tab-prev'
          )}
        >

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* PESTAÑA: CUENTA Y PERFIL                                      */}
          {/* ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'account' && (
            <div className="divide-y divide-veyra-border/60">
              <div className="pb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-veyra-text">Identidad y Perfil</h4>
                  <p className="text-[11px] text-veyra-muted mt-0.5">
                    Personaliza cómo te identificas y tu modo de trabajo prioritario.
                  </p>
                </div>
                {onSignOut && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onSignOut();
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-veyra-border text-[11px] font-medium text-veyra-muted hover:text-veyra-text hover:bg-veyra-elevated/50 transition-colors cursor-pointer shrink-0"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Cerrar sesión</span>
                  </button>
                )}
              </div>

              {/* Nombre de usuario */}
              <div className="py-5 space-y-2.5">
                <label className="block text-[11px] font-semibold text-veyra-muted uppercase tracking-wider">
                  Nombre visible
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={localName}
                    onChange={(e) => setLocalName(e.target.value)}
                    placeholder="Tu nombre o alias"
                    className="flex-1 min-w-0 px-3 py-1.5 rounded-md bg-transparent border border-veyra-border text-veyra-text placeholder:text-veyra-subtle focus:outline-none focus:border-accent text-xs"
                  />
                  <button
                    onClick={handleSaveName}
                    disabled={isUpdatingName || localName.trim() === settings.userName}
                    className="px-3.5 py-1.5 rounded-md bg-accent text-white font-medium hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0 cursor-pointer"
                  >
                    {isUpdatingName ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Guardar'}
                  </button>
                </div>
                <p className="text-[10.5px] text-veyra-subtle">
                  Email vinculado: <span className="text-veyra-text font-mono">{userEmail || 'Sin email'}</span>
                </p>
              </div>

              {/* Nivel de Control por Defecto */}
              <div className="py-5 space-y-2.5">
                <label className="block text-[11px] font-semibold text-veyra-muted uppercase tracking-wider">
                  Nivel de control predeterminado en recordatorios
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {controlLevelOptions.map((lvl) => (
                    <button
                      key={lvl.id}
                      type="button"
                      onClick={() => updateSetting('defaultControlLevel', lvl.id)}
                      className={cn(
                        'p-3 rounded-md border text-left transition-colors cursor-pointer',
                        settings.defaultControlLevel === lvl.id
                          ? 'bg-accent/10 border-accent'
                          : 'bg-transparent border-veyra-border hover:border-veyra-subtle'
                      )}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: lvl.color }} />
                        <span className="font-semibold text-xs text-veyra-text">{lvl.label}</span>
                      </div>
                      <p className="text-[10px] text-veyra-muted leading-relaxed">{lvl.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Métodos de inicio de sesión y vinculación (Fase 3: linkIdentity) */}
              <div className="py-5 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h5 className="text-xs font-semibold text-veyra-text flex items-center gap-1.5">
                      <GoogleIcon className="w-3.5 h-3.5" />
                      <span>Métodos de inicio de sesión</span>
                    </h5>
                    <p className="text-[10.5px] text-veyra-muted mt-0.5">
                      Vincula Google para iniciar sesión. Independiente de Google Drive (Integraciones).
                    </p>
                  </div>

                  {identitiesLoading ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-veyra-muted">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Cargando...
                    </span>
                  ) : googleIdentity ? (
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                        <ShieldCheck className="w-3 h-3" />
                        Google vinculado
                      </span>
                      {identities.length > 1 ? (
                        <button
                          type="button"
                          onClick={handleUnlinkGoogleIdentity}
                          disabled={linkingGoogle}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-veyra-border hover:border-red-500/30 hover:bg-red-500/10 text-veyra-muted hover:text-red-400 text-[11px] font-medium transition-colors cursor-pointer disabled:opacity-40"
                        >
                          {linkingGoogle ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Unlink className="w-3 h-3" />
                          )}
                          <span>Desvincular</span>
                        </button>
                      ) : (
                        <span className="text-[10px] text-veyra-subtle">
                          Método único de acceso
                        </span>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleLinkGoogleIdentity}
                      disabled={linkingGoogle}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-veyra-border hover:bg-veyra-elevated/50 text-veyra-text text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {linkingGoogle ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <GoogleIcon className="w-3.5 h-3.5" />
                      )}
                      <span>Vincular con Google</span>
                    </button>
                  )}
                </div>

                {googleIdentity && (googleIdentity.identity_data?.email as string | undefined) && (
                  <p className="text-[10.5px] text-veyra-subtle">
                    Cuenta Google vinculada:{' '}
                    <span className="font-mono text-veyra-text">
                      {googleIdentity.identity_data?.email as string}
                    </span>
                  </p>
                )}
              </div>

              {/* Legal y Privacidad */}
              <div className="py-5 space-y-2.5">
                <div>
                  <h5 className="text-xs font-semibold text-veyra-text flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
                    <span>Legal y Privacidad</span>
                  </h5>
                  <p className="text-[10.5px] text-veyra-muted mt-0.5">
                    Consulta nuestra información legal vigente y las opciones públicas de gestión de cuenta.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <a
                    href="/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-veyra-border text-[11px] font-medium text-veyra-muted hover:text-veyra-text hover:border-teal-500/40 transition-colors"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
                    <span>Política de Privacidad</span>
                  </a>
                  <a
                    href="/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-veyra-border text-[11px] font-medium text-veyra-muted hover:text-veyra-text hover:border-teal-500/40 transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5 text-teal-400" />
                    <span>Términos de Servicio</span>
                  </a>
                  <a
                    href="/delete-account"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-veyra-border text-[11px] font-medium text-veyra-muted hover:text-red-400 hover:border-red-500/30 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    <span>Eliminación de Cuenta</span>
                  </a>
                </div>
              </div>

              {/* Valores predeterminados */}
              <div className="py-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h5 className="text-xs font-semibold text-veyra-text">Valores predeterminados</h5>
                  <p className="text-[10.5px] text-veyra-muted mt-0.5">
                    Restaura todas las preferencias globales a su configuración inicial.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={resetToDefaults}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-veyra-border text-[11px] font-medium text-veyra-muted hover:text-veyra-text hover:bg-veyra-elevated/50 transition-colors cursor-pointer shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Restablecer ajustes</span>
                </button>
              </div>

              {/* Zona de peligro: Eliminación permanente de cuenta */}
              <div className="py-5 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h5 className="text-xs font-semibold text-red-400 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Zona de peligro</span>
                    </h5>
                    <p className="text-[10.5px] text-veyra-muted mt-0.5">
                      Elimina permanentemente tu cuenta, notas, recordatorios, eventos y datos locales.
                    </p>
                  </div>
                  {!showDeleteConfirm && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowDeleteConfirm(true);
                        setDeleteConfirmText('');
                      }}
                      className="px-3 py-1.5 rounded-md border border-red-500/35 hover:bg-red-500/10 text-red-400 font-semibold transition-colors cursor-pointer shrink-0"
                    >
                      Eliminar cuenta
                    </button>
                  )}
                </div>

                {showDeleteConfirm && (
                  <div className="pt-2.5 border-t border-red-500/20 space-y-2.5">
                    <p className="text-[11px] text-red-300">
                      Esta acción es irreversible. Escribe <strong>ELIMINAR</strong> para confirmar:
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={deleteConfirmText}
                        onChange={(e) => setDeleteConfirmText(e.target.value)}
                        placeholder="ELIMINAR"
                        className="flex-1 px-3 py-1.5 rounded-md bg-transparent border border-red-500/30 text-veyra-text placeholder:text-veyra-subtle focus:outline-none focus:border-red-400 text-xs font-mono"
                      />
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setShowDeleteConfirm(false);
                            setDeleteConfirmText('');
                          }}
                          disabled={isDeletingAccount}
                          className="px-3 py-1.5 rounded-md border border-veyra-border text-veyra-muted hover:text-veyra-text transition-colors cursor-pointer"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={handleDeleteAccount}
                          disabled={isDeletingAccount || deleteConfirmText.trim().toUpperCase() !== 'ELIMINAR'}
                          className="px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-500 text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center gap-1.5"
                        >
                          {isDeletingAccount && <Loader2 className="w-3 h-3 animate-spin" />}
                          <span>Confirmar borrado</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* PESTAÑA: INTEGRACIONES                                        */}
          {/* ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'integrations' && <IntegrationsSettingsPanel />}

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* PESTAÑA: APARIENCIA                                           */}
          {/* ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'appearance' && (
            <div className="divide-y divide-veyra-border/60">
              <div className="pb-4">
                <h4 className="text-sm font-semibold text-veyra-text">Estilo e Interfaz</h4>
                <p className="text-[11px] text-veyra-muted mt-0.5">
                  El tema claro/oscuro es independiente en este navegador; el color de acento se sincroniza en tiempo real entre Web y Móvil.
                </p>
              </div>

              {/* Modo de Tema + AMOLED */}
              <div className="py-5 space-y-3">
                <label className="block text-[11px] font-semibold text-veyra-muted uppercase tracking-wider">
                  Tema de la interfaz
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => updateSetting('themeMode', 'dark')}
                    className={cn(
                      'flex items-center justify-center gap-2 py-2 px-3 rounded-md border font-medium transition-colors cursor-pointer',
                      settings.themeMode === 'dark'
                        ? 'bg-accent/10 border-accent text-accent font-semibold'
                        : 'bg-transparent border-veyra-border text-veyra-muted hover:text-veyra-text'
                    )}
                  >
                    <Moon className="w-3.5 h-3.5" />
                    <span>Oscuro</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSetting('themeMode', 'light')}
                    className={cn(
                      'flex items-center justify-center gap-2 py-2 px-3 rounded-md border font-medium transition-colors cursor-pointer',
                      settings.themeMode === 'light'
                        ? 'bg-accent/10 border-accent text-accent font-semibold'
                        : 'bg-transparent border-veyra-border text-veyra-muted hover:text-veyra-text'
                    )}
                  >
                    <Sun className="w-3.5 h-3.5" />
                    <span>Claro</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSetting('themeMode', 'system')}
                    className={cn(
                      'flex items-center justify-center gap-2 py-2 px-3 rounded-md border font-medium transition-colors cursor-pointer',
                      settings.themeMode === 'system'
                        ? 'bg-accent/10 border-accent text-accent font-semibold'
                        : 'bg-transparent border-veyra-border text-veyra-muted hover:text-veyra-text'
                    )}
                  >
                    <Laptop className="w-3.5 h-3.5" />
                    <span>Sistema</span>
                  </button>
                </div>

                {/* Modo Negro AMOLED (Solo en tema oscuro) */}
                {settings.themeMode !== 'light' && (
                  <label className="pt-2 flex items-center justify-between gap-4 cursor-pointer group select-none">
                    <div className="min-w-0 flex-1">
                      <span className="font-semibold text-xs text-veyra-text block">Modo Negro AMOLED</span>
                      <span className="text-[10.5px] text-veyra-muted leading-relaxed block mt-0.5">
                        Usa negro puro (#000000) en la interfaz y en el fondo de las notas en formato infinito
                      </span>
                    </div>
                    <button
                      type="button"
                      role="checkbox"
                      aria-label="Activar Modo Negro AMOLED"
                      aria-checked={Boolean(settings.amoledEnabled)}
                      onClick={() => updateSetting('amoledEnabled', !settings.amoledEnabled)}
                      className={cn(
                        'w-5 h-5 rounded-md border flex items-center justify-center transition-colors shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                        settings.amoledEnabled
                          ? 'bg-accent border-accent text-white'
                          : 'bg-veyra-elevated border-veyra-border group-hover:border-accent/60'
                      )}
                    >
                      {settings.amoledEnabled && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </button>
                  </label>
                )}
              </div>

              {/* Color de Acento */}
              <div className="py-5 space-y-2.5">
                <label className="block text-[11px] font-semibold text-veyra-muted uppercase tracking-wider">
                  Color de Acento en Vivo
                </label>
                <div className="flex items-center gap-3 pt-1">
                  {availableAccents.map((item) => (
                    <button
                      key={item.theme}
                      type="button"
                      onClick={() => updateSetting('accentTheme', item.theme)}
                      title={item.label}
                      className={cn(
                        'w-7 h-7 rounded-full flex items-center justify-center transition-transform hover:scale-110 cursor-pointer',
                        settings.accentTheme === item.theme && 'ring-2 ring-offset-2 ring-offset-veyra-canvas ring-accent'
                      )}
                      style={{ backgroundColor: item.hex }}
                    >
                      {settings.accentTheme === item.theme && <Check className="w-3.5 h-3.5 text-white stroke-[3]" />}
                    </button>
                  ))}
                </div>
                <p className="text-[10.5px] text-veyra-subtle">
                  Transmite una señal instantánea por WebSocket a tus demás dispositivos conectados.
                </p>
              </div>

              {/* Papel en modo oscuro */}
              <div className="py-5 space-y-2.5">
                <label className="block text-[11px] font-semibold text-veyra-muted uppercase tracking-wider">
                  Papel de la nota en modo oscuro
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => updateSetting('notePaperMode', 'auto')}
                    className={cn(
                      'flex items-center justify-center gap-2 py-2 px-3 rounded-md border font-medium transition-colors cursor-pointer',
                      settings.notePaperMode === 'auto'
                        ? 'bg-accent/10 border-accent text-accent font-semibold'
                        : 'bg-transparent border-veyra-border text-veyra-muted hover:text-veyra-text'
                    )}
                  >
                    <Moon className="w-3.5 h-3.5" />
                    <span>Papel Oscuro (Auto)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSetting('notePaperMode', 'light')}
                    className={cn(
                      'flex items-center justify-center gap-2 py-2 px-3 rounded-md border font-medium transition-colors cursor-pointer',
                      settings.notePaperMode === 'light'
                        ? 'bg-accent/10 border-accent text-accent font-semibold'
                        : 'bg-transparent border-veyra-border text-veyra-muted hover:text-veyra-text'
                    )}
                  >
                    <Sun className="w-3.5 h-3.5" />
                    <span>Papel Blanco (Impresión)</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* PESTAÑA: RECORDATORIOS & AGENDA                               */}
          {/* ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'reminders' && (
            <div className="divide-y divide-veyra-border/60">
              <div className="pb-4">
                <h4 className="text-sm font-semibold text-veyra-text">Recordatorios y Agenda Compartida</h4>
                <p className="text-[11px] text-veyra-muted mt-0.5">
                  Alinea los tiempos de aviso, calendario y sonidos audibles en todos tus dispositivos conectados.
                </p>
              </div>

              {/* Anticipación por defecto */}
              <div className="py-5 space-y-2.5">
                <label className="block text-[11px] font-semibold text-veyra-muted uppercase tracking-wider">
                  Avisar con anticipación por defecto
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { val: 0, label: 'En el momento' },
                    { val: 5, label: '5 min antes' },
                    { val: 10, label: '10 min antes' },
                    { val: 15, label: '15 min antes' },
                  ].map((lead) => (
                    <button
                      key={lead.val}
                      type="button"
                      onClick={() => updateSetting('defaultLeadMinutes', lead.val)}
                      className={cn(
                        'py-2 px-2.5 rounded-md border font-medium text-center transition-colors cursor-pointer text-xs',
                        settings.defaultLeadMinutes === lead.val
                          ? 'bg-accent/10 border-accent text-accent font-semibold'
                          : 'bg-transparent border-veyra-border text-veyra-muted hover:text-veyra-text'
                      )}
                    >
                      {lead.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sonidos y Tono de Alertas */}
              <div className="py-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-veyra-text flex items-center gap-1.5">
                      <Volume2 className="w-3.5 h-3.5 text-accent" />
                      <span>Alertas Audibles Web</span>
                    </p>
                    <p className="text-[10.5px] text-veyra-muted mt-0.5">Reproducir tonos sonoros al vencer un recordatorio</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.soundAlertsEnabled}
                    onChange={(e) => updateSetting('soundAlertsEnabled', e.target.checked)}
                    className="w-4 h-4 rounded border-veyra-border text-accent focus:ring-accent accent-accent cursor-pointer"
                  />
                </div>

                {settings.soundAlertsEnabled && (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-veyra-muted">Probar tonos:</span>
                    <button
                      type="button"
                      onClick={() => alertSoundPlayer.play('normal')}
                      className="px-2.5 py-1 rounded-md border border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/10 text-[10px] font-medium cursor-pointer"
                    >
                      Normal
                    </button>
                    <button
                      type="button"
                      onClick={() => alertSoundPlayer.play('critical')}
                      className="px-2.5 py-1 rounded-md border border-red-500/25 text-red-400 hover:bg-red-500/10 text-[10px] font-medium cursor-pointer"
                    >
                      Crítico
                    </button>
                  </div>
                )}
              </div>

              {/* Formato Horario */}
              <div className="py-4 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-veyra-text">Formato 24 Horas</p>
                  <p className="text-[10.5px] text-veyra-muted mt-0.5">Mostrar 14:00 en lugar de 2:00 PM</p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.timeFormat24h}
                  onChange={(e) => updateSetting('timeFormat24h', e.target.checked)}
                  className="w-4 h-4 rounded border-veyra-border text-accent focus:ring-accent accent-accent cursor-pointer"
                />
              </div>

              {/* Primer día de la semana */}
              <div className="py-4 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-veyra-text">Primer día: Lunes</p>
                  <p className="text-[10.5px] text-veyra-muted mt-0.5">En caso contrario comenzará el Domingo</p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.firstDayMonday}
                  onChange={(e) => updateSetting('firstDayMonday', e.target.checked)}
                  className="w-4 h-4 rounded border-veyra-border text-accent focus:ring-accent accent-accent cursor-pointer"
                />
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* PESTAÑA: NOTAS & EDITOR                                       */}
          {/* ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'notes' && (
            <div className="divide-y divide-veyra-border/60">
              <div className="pb-4">
                <h4 className="text-sm font-semibold text-veyra-text">Notas y Flujo de Trabajo</h4>
                <p className="text-[11px] text-veyra-muted mt-0.5">
                  Define las preferencias iniciales para notas nuevas y la organización de carpetas.
                </p>
              </div>

              {/* Formato de Hoja */}
              <div className="py-5 space-y-2.5">
                <label className="block text-[11px] font-semibold text-veyra-muted uppercase tracking-wider">
                  Formato de hoja por defecto
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => updateSetting('notePageFormat', 'infinite')}
                    className={cn(
                      'flex items-center justify-center gap-2 py-2 px-3 rounded-md border font-medium transition-colors cursor-pointer',
                      settings.notePageFormat === 'infinite'
                        ? 'bg-accent/10 border-accent text-accent font-semibold'
                        : 'bg-transparent border-veyra-border text-veyra-muted hover:text-veyra-text'
                    )}
                  >
                    <Scroll className="w-3.5 h-3.5" />
                    <span>Lienzo Infinito</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSetting('notePageFormat', 'a4')}
                    className={cn(
                      'flex items-center justify-center gap-2 py-2 px-3 rounded-md border font-medium transition-colors cursor-pointer',
                      settings.notePageFormat === 'a4'
                        ? 'bg-accent/10 border-accent text-accent font-semibold'
                        : 'bg-transparent border-veyra-border text-veyra-muted hover:text-veyra-text'
                    )}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Hojas Paginadas A4</span>
                  </button>
                </div>
              </div>

              {/* Orden del Explorador */}
              <div className="py-5 space-y-2.5">
                <label className="block text-[11px] font-semibold text-veyra-muted uppercase tracking-wider">
                  Orden por defecto en el explorador
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => updateSetting('explorerSortMode', 'alphabetical')}
                    className={cn(
                      'flex items-center justify-center gap-2 py-2 px-3 rounded-md border font-medium transition-colors cursor-pointer',
                      settings.explorerSortMode === 'alphabetical'
                        ? 'bg-accent/10 border-accent text-accent font-semibold'
                        : 'bg-transparent border-veyra-border text-veyra-muted hover:text-veyra-text'
                    )}
                  >
                    <span>Alfabético (A - Z)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSetting('explorerSortMode', 'manual')}
                    className={cn(
                      'flex items-center justify-center gap-2 py-2 px-3 rounded-md border font-medium transition-colors cursor-pointer',
                      settings.explorerSortMode === 'manual'
                        ? 'bg-accent/10 border-accent text-accent font-semibold'
                        : 'bg-transparent border-veyra-border text-veyra-muted hover:text-veyra-text'
                    )}
                  >
                    <span>Manual (Arrastrar y Soltar)</span>
                  </button>
                </div>
              </div>

              {/* Fuente del Editor */}
              <div className="py-5 space-y-2.5">
                <label className="block text-[11px] font-semibold text-veyra-muted uppercase tracking-wider">
                  Tipografía preferida en editor
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'inter', label: 'Inter (Sans)' },
                    { id: 'serif', label: 'Lora (Serif)' },
                    { id: 'mono', label: 'JetBrains (Mono)' },
                    { id: 'handwriting', label: 'Caveat (Manuscrita)' },
                  ].map((font) => (
                    <button
                      key={font.id}
                      type="button"
                      onClick={() => updateSetting('editorFontFamily', font.id as EditorFontFamily)}
                      className={cn(
                        'py-2 px-3 rounded-md border font-medium text-center transition-colors cursor-pointer text-xs',
                        settings.editorFontFamily === font.id
                          ? 'bg-accent/10 border-accent text-accent font-semibold'
                          : 'bg-transparent border-veyra-border text-veyra-muted hover:text-veyra-text'
                      )}
                    >
                      {font.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* PESTAÑA: NOTIFICACIONES                                       */}
          {/* ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'notifications' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h4 className="text-sm font-semibold text-veyra-text">Canales de Notificación</h4>
                  <p className="text-[11px] text-veyra-muted mt-0.5">
                    Gestiona cómo y cuándo recibes alertas en este navegador y en tus dispositivos.
                  </p>
                </div>

                <span
                  className={cn(
                    'px-2 py-0.5 rounded-full text-[10px] font-semibold border shrink-0',
                    notificationPermission === 'granted'
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                      : notificationPermission === 'default'
                      ? 'bg-accent/15 text-accent border-accent/30'
                      : notificationPermission === 'denied'
                      ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                      : 'bg-veyra-elevated text-veyra-muted border-veyra-border'
                  )}
                >
                  {notificationPermission === 'granted'
                    ? 'Permitidas'
                    : notificationPermission === 'default'
                    ? 'Sin permiso'
                    : notificationPermission === 'denied'
                    ? 'Bloqueadas'
                    : 'No soportado'}
                </span>
              </div>

              <div className="space-y-4">
                <div className="space-y-4">
                  {/* Estado del permiso del navegador */}
              {notificationPermission === 'default' && (
                <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-accent/10 border border-accent/30">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-accent/20 text-accent flex items-center justify-center shrink-0 mt-0.5">
                      <Bell className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-semibold text-xs text-veyra-text">
                        Permiso de notificaciones pendiente
                      </p>
                      <p className="text-[11px] text-veyra-muted mt-0.5">
                        Todavía no has dado permiso al navegador. Actívalo para recibir avisos de recordatorios y eventos.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleEnableNotifications}
                    disabled={pushLoading}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-accent text-white hover:bg-accent/90 transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                  >
                    {pushLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bell className="w-3.5 h-3.5" />}
                    <span>Permitir y activar</span>
                  </button>
                </div>
              )}

              {notificationPermission === 'denied' && (
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 space-y-2.5">
                  <div className="flex items-start gap-2.5 text-amber-300 text-[11px] leading-relaxed">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-xs text-amber-200">Notificaciones bloqueadas en este navegador</p>
                      <p className="mt-0.5">
                        El navegador tiene bloqueadas las notificaciones para este sitio. Haz clic en el ícono de configuración o candado junto a la barra de direcciones, permite las notificaciones y pulsa <strong>Comprobar permiso</strong>.
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleRefreshPermission}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-200 transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Comprobar permiso</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Web Push Notifications */}
              {notificationPermission === 'granted' &&
                (isPushSupported ? (
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-lg bg-veyra-card/60 border border-veyra-border">
                      <div className="flex items-center gap-3 pr-2">
                        <div
                          className={cn(
                            'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                            pushSubscribed ? 'bg-emerald-500/20 text-emerald-400' : 'bg-veyra-elevated text-veyra-muted'
                          )}
                        >
                          {pushSubscribed ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                        </div>
                        <div>
                          <p className="font-semibold text-xs text-veyra-text">Notificaciones Push Web</p>
                          <p className="text-[10px] text-veyra-muted">
                            {pushSubscribed
                              ? 'Activas: recibirás avisos del sistema aun con el navegador cerrado'
                              : 'Actívalas para no perder ninguna alarma mientras estás fuera'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {pushSubscribed && (
                          <button
                            type="button"
                            onClick={handleSendTestPush}
                            disabled={testPushLoading || pushLoading}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-veyra-elevated hover:bg-veyra-elevated/80 border border-veyra-border text-veyra-text transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                          >
                            {testPushLoading ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Bell className="w-3 h-3 text-accent" />
                            )}
                            <span>Enviar prueba</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={handleTogglePush}
                          disabled={pushLoading}
                          className={cn(
                            'px-3.5 py-1.5 rounded-lg text-xs font-semibold shrink-0 transition-colors cursor-pointer flex items-center gap-1.5',
                            pushSubscribed
                              ? 'bg-veyra-border/60 hover:bg-veyra-border text-veyra-muted hover:text-veyra-text'
                              : 'bg-accent text-white hover:bg-accent/90'
                          )}
                        >
                          {pushLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                          <span>{pushSubscribed ? 'Desactivar' : 'Activar'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs">
                    Permiso concedido para mostrar avisos mientras Veyra está abierta. Este navegador no soporta notificaciones Push en segundo plano.
                  </div>
                ))}

              {notificationPermission === 'unsupported' && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
                  Tu navegador no soporta el estándar de notificaciones Web o las tiene deshabilitadas a nivel del sistema.
                </div>
              )}

              {isBraveBrowser && !pushSubscribed && (
                <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-veyra-card/70 border border-amber-500/25 text-[11px] leading-relaxed text-veyra-muted">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-xs text-veyra-text">Usar Brave</p>
                    <p className="mt-0.5">
                      Brave bloquea por defecto los servicios de mensajería Push de Google. Para habilitarlo: ve a{' '}
                      <code className="px-1.5 py-0.5 rounded bg-veyra-elevated text-amber-300 font-mono text-[10px]">
                        brave://settings/privacy
                      </code>
                      , activa <strong className="text-veyra-text">&quot;Usar los servicios de Google para mensajería push&quot;</strong> y recarga la app.
                    </p>
                  </div>
                </div>
              )}

              {pushError && (
                <div className="flex items-start justify-between gap-2.5 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-200 text-[11px] leading-relaxed">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                    <p>{pushError}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPushError(null)}
                    className="p-1 rounded text-amber-300/80 hover:text-amber-100 hover:bg-amber-500/15 transition-colors cursor-pointer shrink-0"
                    aria-label="Cerrar aviso de error"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              </div>

              {/* Horas de Silencio (No Molestar) */}
              <div className="py-5 border-t border-veyra-border/60 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-veyra-text">Horas de Silencio (No molestar)</p>
                    <p className="text-[10px] text-veyra-muted">Silencia sonidos no críticos durante la noche</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.quietHoursEnabled}
                    onChange={(e) => updateSetting('quietHoursEnabled', e.target.checked)}
                    className="w-4 h-4 rounded border-veyra-border text-accent focus:ring-accent accent-accent cursor-pointer"
                  />
                </div>

                {settings.quietHoursEnabled && (
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-veyra-border/60">
                    <div>
                      <label className="block text-[10px] text-veyra-subtle mb-1">Inicio de silencio</label>
                      <input
                        type="time"
                        value={settings.quietHoursStart}
                        onChange={(e) => updateSetting('quietHoursStart', e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded bg-veyra-elevated border border-veyra-border text-xs text-veyra-text"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-veyra-subtle mb-1">Fin de silencio</label>
                      <input
                        type="time"
                        value={settings.quietHoursEnd}
                        onChange={(e) => updateSetting('quietHoursEnd', e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded bg-veyra-elevated border border-veyra-border text-xs text-veyra-text"
                      />
                    </div>
                  </div>
                )}
              </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* PESTAÑA: DISPOSITIVOS & ACCESO                                */}
          {/* ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'devices' && (
            <div className="space-y-4">
              {/* Tarjeta siempre visible de Instalación PWA */}
              {isInstalled ? (
                <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                      <Laptop className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-xs text-veyra-text">Aplicación Web (PWA)</p>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-500/20 text-emerald-400">
                          Instalada
                        </span>
                      </div>
                      <p className="text-[11px] text-emerald-300/90 mt-0.5">
                        Veyra se está ejecutando como aplicación instalada en este dispositivo.
                      </p>
                    </div>
                  </div>
                </div>
              ) : isInstallable ? (
                <div className="p-3.5 rounded-xl bg-accent/10 border border-accent/30">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-accent/20 text-accent flex items-center justify-center shrink-0">
                        <Download className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-xs text-veyra-text">Instalar Veyra en la web (PWA)</p>
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-accent/20 text-accent">
                            Lista para instalar
                          </span>
                        </div>
                        <p className="text-[11px] text-veyra-muted mt-0.5">
                          Acceso directo como app independiente sin barra de navegador y mejor soporte offline.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={promptInstall}
                      className="px-3.5 py-1.5 rounded-lg bg-accent text-white font-semibold hover:bg-accent/90 transition-colors flex items-center gap-1.5 cursor-pointer text-xs shrink-0"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Instalar PWA</span>
                    </button>
                  </div>
                </div>
              ) : isIOS ? (
                <div className="flex items-start gap-3 p-3.5 rounded-xl bg-veyra-card/70 border border-veyra-border">
                  <div className="w-9 h-9 rounded-lg bg-accent/15 text-accent flex items-center justify-center shrink-0">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-xs text-veyra-text">Instalar Veyra en iPhone / iPad</p>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-veyra-elevated text-veyra-muted border border-veyra-border">
                        Safari iOS
                      </span>
                    </div>
                    <p className="text-[11px] text-veyra-muted mt-0.5 leading-relaxed">
                      En Safari, pulsa <strong className="text-veyra-text">Compartir</strong> y selecciona{' '}
                      <strong className="text-veyra-text">Añadir a pantalla de inicio</strong>.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3 p-3.5 rounded-xl bg-veyra-card/70 border border-veyra-border">
                  <div className="w-9 h-9 rounded-lg bg-veyra-elevated text-accent flex items-center justify-center shrink-0">
                    <Laptop className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-xs text-veyra-text">Aplicación Web Instalable (PWA)</p>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-veyra-elevated text-veyra-muted border border-veyra-border">
                        {isSecureContext ? 'Instalación desde navegador' : 'Requiere HTTPS'}
                      </span>
                    </div>
                    <p className="text-[11px] text-veyra-muted mt-0.5 leading-relaxed">
                      {isSecureContext
                        ? 'Puedes instalar Veyra desde el ícono de instalar en la barra de direcciones o desde el menú del navegador (Instalar Veyra / Guardar y compartir → Instalar página como aplicación).'
                        : 'La instalación PWA directa requiere abrir la web mediante HTTPS o localhost.'}
                    </p>
                  </div>
                </div>
              )}

              {/* Acceso rápido a permiso de notificaciones si aún falta */}
              {(notificationPermission === 'default' || notificationPermission === 'denied') && (
                <div
                  className={cn(
                    'flex flex-wrap items-center justify-between gap-2.5 p-3 rounded-xl border text-xs',
                    notificationPermission === 'denied'
                      ? 'bg-amber-500/10 border-amber-500/25'
                      : 'bg-veyra-card/60 border-veyra-border'
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <Bell
                      className={cn(
                        'w-4 h-4 shrink-0',
                        notificationPermission === 'denied' ? 'text-amber-300' : 'text-accent'
                      )}
                    />
                    <span className="text-[11px] text-veyra-text">
                      {notificationPermission === 'denied'
                        ? 'Las notificaciones están bloqueadas en este navegador.'
                        : 'Las notificaciones del navegador aún no tienen permiso.'}
                    </span>
                  </div>
                  {notificationPermission === 'default' ? (
                    <button
                      type="button"
                      onClick={handleEnableNotifications}
                      disabled={pushLoading}
                      className="px-3 py-1.5 rounded-lg bg-accent text-white font-semibold hover:bg-accent/90 transition-colors cursor-pointer text-[11px] flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {pushLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                      <span>Activar notificaciones</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setActiveTab('notifications')}
                      className="px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-200 font-medium transition-colors cursor-pointer text-[11px]"
                    >
                      Ver ajustes
                    </button>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-veyra-text">Dispositivos y Sesiones Conectadas</h4>
                  <p className="text-[11px] text-veyra-muted mt-0.5">
                    Equipos donde tu cuenta está activa o recibiendo sincronización en tiempo real.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={loadDevices}
                  disabled={devicesLoading}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-veyra-card hover:bg-veyra-elevated border border-veyra-border text-veyra-muted hover:text-veyra-text text-[11px] transition-colors cursor-pointer"
                >
                  <RefreshCw className={cn('w-3.5 h-3.5', devicesLoading && 'animate-spin text-accent')} />
                  <span>Actualizar</span>
                </button>
              </div>

              {/* Lista de dispositivos */}
              <div className="space-y-2.5">
                {devicesLoading && devices.length === 0 ? (
                  <div className="p-8 text-center text-veyra-muted flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-accent" />
                    <span>Buscando dispositivos registrados...</span>
                  </div>
                ) : (
                  devices.map((dev) => {
                    const isApple = dev.type === 'mobile_ios' || dev.os.includes('iOS') || dev.os.includes('macOS');
                    const isAndroid = dev.type === 'mobile_android' || dev.os.includes('Android');
                    const isDesktop = dev.type === 'desktop_pwa' || dev.type === 'web_browser';

                    return (
                      <div
                        key={dev.id}
                        className={cn(
                          'p-3.5 rounded-xl border transition-all flex items-center justify-between',
                          dev.isCurrent
                            ? 'bg-accent/10 border-accent/40 shadow-xs'
                            : 'bg-veyra-card/70 border-veyra-border hover:border-veyra-subtle'
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
                              dev.isCurrent
                                ? 'bg-accent/20 text-accent'
                                : isApple
                                ? 'bg-slate-700/20 text-slate-200'
                                : isAndroid
                                ? 'bg-emerald-500/15 text-emerald-400'
                                : 'bg-veyra-elevated text-veyra-muted'
                            )}
                          >
                            {isApple ? (
                              <Apple className="w-4 h-4" />
                            ) : isAndroid ? (
                              <Smartphone className="w-4 h-4" />
                            ) : isDesktop ? (
                              <Laptop className="w-4 h-4" />
                            ) : (
                              <Smartphone className="w-4 h-4" />
                            )}
                          </div>

                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-xs text-veyra-text">{dev.name}</span>
                              {dev.isCurrent ? (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-500/20 text-emerald-400">
                                  ESTE DISPOSITIVO
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-veyra-elevated text-veyra-subtle border border-veyra-border/60">
                                  {dev.source === 'push_tokens' ? 'App Móvil' : 'Web Remota'}
                                </span>
                              )}
                            </div>

                            <p className="text-[10.5px] text-veyra-muted mt-0.5">
                              <span>Sistema: <strong className="text-veyra-text font-medium">{dev.os}</strong></span>
                              {dev.browser && <span> · Navegador: {dev.browser}</span>}
                              {dev.model && <span> · {dev.model}</span>}
                            </p>

                            <p className="text-[9.5px] text-veyra-subtle mt-0.5">
                              Última actividad: {new Date(dev.lastActive).toLocaleDateString()} a las {new Date(dev.lastActive).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>

                        {/* Botón de desvincular */}
                        {!dev.isCurrent && (
                          <button
                            type="button"
                            onClick={() => handleRemoveDevice(dev)}
                            disabled={removingDeviceId === dev.id}
                            title="Desvincular este dispositivo"
                            className="p-2 rounded-lg text-veyra-subtle hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer shrink-0 disabled:opacity-40"
                          >
                            {removingDeviceId === dev.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
