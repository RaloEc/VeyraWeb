import React, { useState, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  User,
  Bell,
  Sparkles,
  Layers,
  Cloud,
  Link2,
  Smartphone,
  Shield,
  LogOut,
  Check,
  Sun,
  Moon,
  Laptop,
  Download,
  FileText,
  Calendar,
  CheckSquare,
  ExternalLink,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import { useTheme } from '../../theme/ThemeProvider';
import { ACCENT_PALETTES, type AccentTheme } from '../../theme/accentColors';
import {
  useUserSettings,
  type ControlLevel,
  type NotePageFormat,
} from '../../context/UserSettingsContext';
import { IntegrationsSettingsPanel } from '../../components/common/IntegrationsSettingsPanel';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { PushService } from '../../lib/pushService';
import { useRealtimeConnection } from '../../hooks/useRealtimeConnection';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';

export type MobileSettingsSection =
  | 'main'
  | 'profile'
  | 'notifications'
  | 'general'
  | 'notes'
  | 'integrations'
  | 'devices'
  | 'legal'
  | 'stats';

export interface MobileSettingsPageProps {
  userId: string;
  userEmail: string;
  userName?: string;
  initialSection?: MobileSettingsSection;
  stats?: {
    notesCount: number;
    pendingRemindersCount: number;
    completedRemindersCount: number;
    eventsCount: number;
  };
  onClose: () => void;
  onSignOut: () => void;
}

const ACCENT_LABELS: Record<AccentTheme, string> = {
  blue: 'Azul',
  purple: 'Púrpura',
  green: 'Verde',
  red: 'Rojo',
  amber: 'Ámbar',
  pink: 'Rosa',
};

export const MobileSettingsPage: React.FC<MobileSettingsPageProps> = ({
  userId,
  userEmail,
  userName,
  initialSection = 'main',
  stats,
  onClose,
  onSignOut,
}) => {
  const [section, setSection] = useState<MobileSettingsSection>(initialSection);
  const { isDark, mode, setMode, amoledEnabled, setAmoledEnabled, accentTheme, setAccentTheme, notePaperMode, setNotePaperMode } = useTheme();
  const { settings, updateSetting, resetToDefaults } = useUserSettings();
  const { isInstallable, isInstalled, isIOS, promptInstall } = usePWAInstall();
  const { isConnected } = useRealtimeConnection();

  const [localName, setLocalName] = useState(settings.userName || userName || '');
  const [savingName, setSavingName] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

  const displayName = settings.userName || userName || userEmail.split('@')[0] || 'Usuario';

  useEffect(() => {
    setSection(initialSection);
  }, [initialSection]);

  useEffect(() => {
    if (!userId || !PushService.isSupported()) return;
    PushService.getExistingSubscription()
      .then((sub) => setPushSubscribed(Boolean(sub)))
      .catch(() => {});
  }, [userId]);

  const handleBack = () => {
    if (section !== 'main' && initialSection === 'main') {
      setSection('main');
    } else {
      onClose();
    }
  };

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingName(true);
    try {
      await updateSetting('userName', localName.trim());
      toast.success('Nombre actualizado');
    } finally {
      setSavingName(false);
    }
  };

  const handleTogglePush = async () => {
    if (!PushService.isSupported()) {
      toast.error('Este navegador no soporta notificaciones Web Push.');
      return;
    }
    setPushLoading(true);
    try {
      if (pushSubscribed) {
        await PushService.unsubscribe(userId);
        setPushSubscribed(false);
        toast.info('Notificaciones push desactivadas en este dispositivo');
      } else {
        await PushService.subscribe(userId);
        setPushSubscribed(true);
        toast.success('Notificaciones push activadas');
      }
    } catch (err: any) {
      toast.error(err?.message || 'No se pudo cambiar el estado de notificaciones.');
    } finally {
      setPushLoading(false);
    }
  };

  const sectionTitles: Record<MobileSettingsSection, string> = {
    main: 'Ajustes',
    profile: 'Perfil y Cuenta',
    notifications: 'Notificaciones',
    general: 'General',
    notes: 'Notas & Editor',
    integrations: 'Integraciones',
    devices: 'Dispositivos & PWA',
    legal: 'Información y Legal',
    stats: 'Estadísticas',
  };

  const themeSummary = `${
    mode === 'light'
      ? 'Claro'
      : amoledEnabled
      ? 'Oscuro (AMOLED)'
      : 'Oscuro'
  } · ${ACCENT_LABELS[accentTheme] || 'Azul'}`;

  const availableAccents: { theme: AccentTheme; label: string; hex: string }[] = [
    { theme: 'blue', label: 'Azul', hex: ACCENT_PALETTES.blue[isDark ? 'dark' : 'light'].primary },
    { theme: 'purple', label: 'Púrpura', hex: ACCENT_PALETTES.purple[isDark ? 'dark' : 'light'].primary },
    { theme: 'green', label: 'Verde', hex: ACCENT_PALETTES.green[isDark ? 'dark' : 'light'].primary },
    { theme: 'red', label: 'Rojo', hex: ACCENT_PALETTES.red[isDark ? 'dark' : 'light'].primary },
    { theme: 'amber', label: 'Ámbar', hex: ACCENT_PALETTES.amber[isDark ? 'dark' : 'light'].primary },
    { theme: 'pink', label: 'Rosa', hex: ACCENT_PALETTES.pink[isDark ? 'dark' : 'light'].primary },
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-veyra-canvas text-veyra-text overflow-hidden select-none">
      {/* Top Header */}
      <header className="relative h-12 px-3 flex items-center justify-center border-b border-veyra-border/60 shrink-0 bg-veyra-canvas">
        <button
          type="button"
          onClick={handleBack}
          aria-label="Volver"
          className="absolute left-3 p-1.5 rounded-full text-veyra-text hover:bg-veyra-elevated transition-colors cursor-pointer"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-sm font-bold tracking-tight">{sectionTitles[section]}</h1>
      </header>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5 pb-10">
        {section === 'main' && (
          <>
            {/* Profile Card */}
            <button
              type="button"
              onClick={() => setSection('profile')}
              className="w-full p-3.5 rounded-2xl bg-veyra-card border border-veyra-border flex items-center justify-between gap-3 text-left cursor-pointer active:scale-[0.99] transition-transform"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center shrink-0">
                  <User className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-veyra-text truncate">{displayName}</p>
                  <p className="text-[11px] text-veyra-muted truncate">{userEmail}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs text-veyra-muted">Perfil</span>
                <ChevronRight className="w-4 h-4 text-veyra-subtle" />
              </div>
            </button>

            {/* PREFERENCIAS PRINCIPALES */}
            <section className="space-y-2">
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-veyra-subtle px-1">
                PREFERENCIAS PRINCIPALES
              </h2>
              <div className="rounded-2xl bg-veyra-card border border-veyra-border divide-y divide-veyra-border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setSection('notifications')}
                  className="w-full p-3.5 flex items-center justify-between gap-3 text-left cursor-pointer hover:bg-veyra-elevated/40"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center shrink-0">
                      <Bell className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-wide text-veyra-text">
                        NOTIFICACIONES
                      </p>
                      <p className="text-[11px] text-veyra-muted truncate">
                        Push, alertas y niveles de control
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs text-veyra-muted">
                      {pushSubscribed ? 'Activo' : 'Web'}
                    </span>
                    <ChevronRight className="w-4 h-4 text-veyra-subtle" />
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setSection('general')}
                  className="w-full p-3.5 flex items-center justify-between gap-3 text-left cursor-pointer hover:bg-veyra-elevated/40"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-pink-500/15 text-pink-400 flex items-center justify-center shrink-0">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-wide text-veyra-text">
                        GENERAL
                      </p>
                      <p className="text-[11px] text-veyra-muted truncate">
                        Modo oscuro/claro, color de acento y formato
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 max-w-[130px]">
                    <span className="text-[11px] text-veyra-muted truncate">{themeSummary}</span>
                    <ChevronRight className="w-4 h-4 text-veyra-subtle shrink-0" />
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setSection('notes')}
                  className="w-full p-3.5 flex items-center justify-between gap-3 text-left cursor-pointer hover:bg-veyra-elevated/40"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-cyan-500/15 text-cyan-400 flex items-center justify-center shrink-0">
                      <Layers className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-veyra-text">Notas & Editor</p>
                      <p className="text-[11px] text-veyra-muted truncate">
                        Hoja A4/Infinita y apariencia del papel
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs text-veyra-muted">
                      {settings.notePageFormat === 'a4' ? 'Hoja A4' : 'Infinita'}
                    </span>
                    <ChevronRight className="w-4 h-4 text-veyra-subtle" />
                  </div>
                </button>
              </div>
            </section>

            {/* DATOS Y SINCRONIZACIÓN */}
            <section className="space-y-2">
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-veyra-subtle px-1">
                DATOS Y SINCRONIZACIÓN
              </h2>
              <div className="rounded-2xl bg-veyra-card border border-veyra-border divide-y divide-veyra-border overflow-hidden">
                <div className="p-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center shrink-0">
                      <Cloud className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-wide text-veyra-text">
                        SINCRONIZACIÓN EN LA NUBE
                      </p>
                      <p className="text-[11px] text-veyra-muted truncate">
                        Copia de seguridad en tiempo real
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-medium text-emerald-400 shrink-0">
                    {isConnected ? 'Sincronizado' : 'Conectando...'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setSection('integrations')}
                  className="w-full p-3.5 flex items-center justify-between gap-3 text-left cursor-pointer hover:bg-veyra-elevated/40"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
                      <Link2 className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-veyra-text">Integraciones</p>
                      <p className="text-[11px] text-veyra-muted truncate">
                        Conectar o desconectar Google Drive
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs text-veyra-muted">Google Drive</span>
                    <ChevronRight className="w-4 h-4 text-veyra-subtle" />
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setSection('devices')}
                  className="w-full p-3.5 flex items-center justify-between gap-3 text-left cursor-pointer hover:bg-veyra-elevated/40"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
                      <Smartphone className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-veyra-text">Dispositivos & PWA</p>
                      <p className="text-[11px] text-veyra-muted truncate">
                        Instalar como app en iOS o Android
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs text-veyra-muted">
                      {isInstalled ? 'Instalada' : 'PWA'}
                    </span>
                    <ChevronRight className="w-4 h-4 text-veyra-subtle" />
                  </div>
                </button>
              </div>
            </section>

            {/* SISTEMA Y LEGAL */}
            <section className="space-y-2">
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-veyra-subtle px-1">
                SISTEMA Y LEGAL
              </h2>
              <div className="rounded-2xl bg-veyra-card border border-veyra-border divide-y divide-veyra-border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setSection('legal')}
                  className="w-full p-3.5 flex items-center justify-between gap-3 text-left cursor-pointer hover:bg-veyra-elevated/40"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
                      <Shield className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-veyra-text">Información y Legal</p>
                      <p className="text-[11px] text-veyra-muted truncate">
                        Políticas de privacidad y condiciones de uso
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs text-veyra-muted">v1.0.0</span>
                    <ChevronRight className="w-4 h-4 text-veyra-subtle" />
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    resetToDefaults();
                    toast.success('Ajustes restablecidos');
                  }}
                  className="w-full p-3.5 flex items-center gap-3 text-left cursor-pointer hover:bg-veyra-elevated/40"
                >
                  <div className="w-9 h-9 rounded-xl bg-zinc-500/15 text-veyra-muted flex items-center justify-center shrink-0">
                    <RotateCcw className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-semibold text-veyra-text">
                    Restablecer preferencias
                  </span>
                </button>

                <button
                  type="button"
                  onClick={onSignOut}
                  className="w-full p-3.5 flex items-center gap-3 text-left cursor-pointer hover:bg-rose-500/10"
                >
                  <div className="w-9 h-9 rounded-xl bg-rose-500/15 text-rose-400 flex items-center justify-center shrink-0">
                    <LogOut className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-semibold text-rose-400">Cerrar sesión</span>
                </button>
              </div>
            </section>
          </>
        )}

        {/* SUBPAGE: PROFILE */}
        {section === 'profile' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-veyra-card border border-veyra-border flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-full bg-accent text-white text-lg font-bold flex items-center justify-center shrink-0">
                {(displayName[0] || 'V').toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-veyra-text truncate">{displayName}</p>
                <p className="text-xs text-veyra-muted truncate">{userEmail}</p>
              </div>
            </div>

            <form
              onSubmit={handleSaveName}
              className="p-4 rounded-2xl bg-veyra-card border border-veyra-border space-y-3"
            >
              <label className="block text-xs font-semibold text-veyra-text">
                Nombre para mostrar
              </label>
              <input
                type="text"
                value={localName}
                onChange={(e) => setLocalName(e.target.value)}
                placeholder="Tu nombre..."
                className="w-full bg-veyra-elevated border border-veyra-border rounded-xl px-3.5 py-2.5 text-sm text-veyra-text focus:outline-none focus:border-accent"
              />
              <button
                type="submit"
                disabled={savingName}
                className="w-full py-2.5 rounded-xl bg-accent text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                {savingName ? 'Guardando...' : 'Guardar nombre'}
              </button>
            </form>
          </div>
        )}

        {/* SUBPAGE: GENERAL */}
        {section === 'general' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-veyra-card border border-veyra-border space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-veyra-subtle">Tema</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'dark' as const, label: 'Oscuro', icon: Moon },
                  { id: 'light' as const, label: 'Claro', icon: Sun },
                  { id: 'system' as const, label: 'Sistema', icon: Laptop },
                ].map((opt) => {
                  const Icon = opt.icon;
                  const active = mode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setMode(opt.id)}
                      className={cn(
                        'py-2.5 px-2 rounded-xl border text-xs font-medium flex flex-col items-center gap-1.5 cursor-pointer',
                        active
                          ? 'bg-accent/15 border-accent text-accent font-semibold'
                          : 'bg-veyra-elevated/60 border-veyra-border text-veyra-muted'
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>

              {isDark && (
                <label className="flex items-center justify-between pt-2 cursor-pointer">
                  <span className="text-xs font-medium text-veyra-text">
                    Modo Negro Puro (AMOLED)
                  </span>
                  <input
                    type="checkbox"
                    checked={amoledEnabled}
                    onChange={(e) => setAmoledEnabled(e.target.checked)}
                    className="w-4 h-4 accent-accent"
                  />
                </label>
              )}
            </div>

            <div className="p-4 rounded-2xl bg-veyra-card border border-veyra-border space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-veyra-subtle">
                Color de acento
              </p>
              <div className="grid grid-cols-6 gap-2.5">
                {availableAccents.map((item) => (
                  <button
                    key={item.theme}
                    type="button"
                    onClick={() => setAccentTheme(item.theme)}
                    title={item.label}
                    className={cn(
                      'w-9 h-9 rounded-full flex items-center justify-center mx-auto cursor-pointer',
                      accentTheme === item.theme &&
                        'ring-2 ring-offset-2 ring-offset-veyra-card ring-accent'
                    )}
                    style={{ backgroundColor: item.hex }}
                  >
                    {accentTheme === item.theme && <Check className="w-4 h-4 text-white stroke-[3]" />}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-veyra-card border border-veyra-border space-y-3">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs font-medium text-veyra-text">Formato de 24 horas</span>
                <input
                  type="checkbox"
                  checked={settings.timeFormat24h}
                  onChange={(e) => updateSetting('timeFormat24h', e.target.checked)}
                  className="w-4 h-4 accent-accent"
                />
              </label>
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs font-medium text-veyra-text">
                  Semana empieza en lunes
                </span>
                <input
                  type="checkbox"
                  checked={settings.firstDayMonday}
                  onChange={(e) => updateSetting('firstDayMonday', e.target.checked)}
                  className="w-4 h-4 accent-accent"
                />
              </label>
            </div>
          </div>
        )}

        {/* SUBPAGE: NOTIFICATIONS */}
        {section === 'notifications' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-veyra-card border border-veyra-border space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-veyra-text">Notificaciones Web Push</p>
                  <p className="text-[11px] text-veyra-muted mt-0.5">
                    {pushSubscribed
                      ? 'Activadas en este dispositivo'
                      : 'Recibe avisos aunque cierres la app'}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={pushLoading}
                  onClick={handleTogglePush}
                  className={cn(
                    'px-3.5 py-1.5 rounded-full text-xs font-semibold cursor-pointer shrink-0',
                    pushSubscribed
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : 'bg-accent text-white'
                  )}
                >
                  {pushLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : pushSubscribed ? (
                    'Activado'
                  ) : (
                    'Activar'
                  )}
                </button>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-veyra-card border border-veyra-border space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-veyra-subtle">
                Nivel de control predeterminado
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(['normal', 'critical'] as ControlLevel[]).map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => updateSetting('defaultControlLevel', lvl)}
                    className={cn(
                      'py-2.5 px-3 rounded-xl border text-xs font-semibold cursor-pointer',
                      settings.defaultControlLevel === lvl
                        ? 'bg-accent/15 border-accent text-accent'
                        : 'bg-veyra-elevated/60 border-veyra-border text-veyra-muted'
                    )}
                  >
                    {lvl === 'normal' ? 'Normal' : 'Crítico'}
                  </button>
                ))}
              </div>

              <label className="flex items-center justify-between pt-1 cursor-pointer">
                <span className="text-xs font-medium text-veyra-text">Sonidos de alerta</span>
                <input
                  type="checkbox"
                  checked={settings.soundAlertsEnabled}
                  onChange={(e) => updateSetting('soundAlertsEnabled', e.target.checked)}
                  className="w-4 h-4 accent-accent"
                />
              </label>
            </div>
          </div>
        )}

        {/* SUBPAGE: NOTES */}
        {section === 'notes' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-veyra-card border border-veyra-border space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-veyra-subtle">
                Formato predeterminado de hoja
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(['infinite', 'a4'] as NotePageFormat[]).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => updateSetting('notePageFormat', fmt)}
                    className={cn(
                      'py-2.5 px-3 rounded-xl border text-xs font-semibold cursor-pointer',
                      settings.notePageFormat === fmt
                        ? 'bg-accent/15 border-accent text-accent'
                        : 'bg-veyra-elevated/60 border-veyra-border text-veyra-muted'
                    )}
                  >
                    {fmt === 'a4' ? 'Hoja A4' : 'Vista Infinita'}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-veyra-card border border-veyra-border space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-veyra-subtle">
                Fondo de hoja en modo oscuro
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(['auto', 'light'] as const).map((pm) => (
                  <button
                    key={pm}
                    type="button"
                    onClick={() => setNotePaperMode(pm)}
                    className={cn(
                      'py-2.5 px-3 rounded-xl border text-xs font-semibold cursor-pointer',
                      notePaperMode === pm
                        ? 'bg-accent/15 border-accent text-accent'
                        : 'bg-veyra-elevated/60 border-veyra-border text-veyra-muted'
                    )}
                  >
                    {pm === 'auto' ? 'Oscuro (Tema)' : 'Papel Blanco'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* SUBPAGE: INTEGRATIONS */}
        {section === 'integrations' && (
          <div className="p-4 rounded-2xl bg-veyra-card border border-veyra-border">
            <IntegrationsSettingsPanel />
          </div>
        )}

        {/* SUBPAGE: DEVICES & PWA */}
        {section === 'devices' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-veyra-card border border-veyra-border space-y-3">
              <div className="flex items-center gap-2.5">
                <Download className="w-4 h-4 text-accent" />
                <p className="text-xs font-bold text-veyra-text">Instalar Veyra como App (PWA)</p>
              </div>
              {isInstalled ? (
                <p className="text-xs text-emerald-400">
                  Veyra ya está instalada en este dispositivo.
                </p>
              ) : isIOS ? (
                <p className="text-xs text-veyra-muted leading-relaxed">
                  En Safari de iOS, toca el botón <strong>Compartir</strong> y selecciona{' '}
                  <strong>Añadir a la pantalla de inicio</strong> para usar Veyra como aplicación
                  independiente y activar notificaciones Push.
                </p>
              ) : isInstallable ? (
                <button
                  type="button"
                  onClick={promptInstall}
                  className="w-full py-2.5 rounded-xl bg-accent text-white text-xs font-semibold cursor-pointer"
                >
                  Instalar aplicación
                </button>
              ) : (
                <p className="text-xs text-veyra-muted">
                  Abre el menú de tu navegador y selecciona "Instalar aplicación" o "Añadir a la
                  pantalla de inicio".
                </p>
              )}
            </div>
          </div>
        )}

        {/* SUBPAGE: LEGAL */}
        {section === 'legal' && (
          <div className="rounded-2xl bg-veyra-card border border-veyra-border divide-y divide-veyra-border overflow-hidden">
            {[
              { label: 'Política de Privacidad', href: '/privacy' },
              { label: 'Términos de Servicio', href: '/terms' },
              { label: 'Eliminar cuenta', href: '/delete-account' },
            ].map((item) => (
              <a
                key={item.href}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="p-3.5 flex items-center justify-between text-xs font-medium text-veyra-text hover:bg-veyra-elevated/40"
              >
                <span>{item.label}</span>
                <ExternalLink className="w-3.5 h-3.5 text-veyra-subtle" />
              </a>
            ))}
          </div>
        )}

        {/* SUBPAGE: STATS */}
        {section === 'stats' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-2xl bg-veyra-card border border-veyra-border space-y-1">
              <FileText className="w-4 h-4 text-accent" />
              <p className="text-2xl font-bold text-veyra-text">{stats?.notesCount ?? 0}</p>
              <p className="text-[11px] text-veyra-muted">Notas activas</p>
            </div>
            <div className="p-4 rounded-2xl bg-veyra-card border border-veyra-border space-y-1">
              <Calendar className="w-4 h-4 text-blue-400" />
              <p className="text-2xl font-bold text-veyra-text">{stats?.eventsCount ?? 0}</p>
              <p className="text-[11px] text-veyra-muted">Eventos</p>
            </div>
            <div className="p-4 rounded-2xl bg-veyra-card border border-veyra-border space-y-1">
              <CheckSquare className="w-4 h-4 text-amber-400" />
              <p className="text-2xl font-bold text-veyra-text">
                {stats?.pendingRemindersCount ?? 0}
              </p>
              <p className="text-[11px] text-veyra-muted">Tareas pendientes</p>
            </div>
            <div className="p-4 rounded-2xl bg-veyra-card border border-veyra-border space-y-1">
              <Check className="w-4 h-4 text-emerald-400" />
              <p className="text-2xl font-bold text-veyra-text">
                {stats?.completedRemindersCount ?? 0}
              </p>
              <p className="text-[11px] text-veyra-muted">Tareas completadas</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
