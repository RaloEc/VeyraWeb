import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { Modal } from './Modal';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { PushService } from '../../lib/pushService';
import { DeviceService, type ConnectedDevice } from '../../lib/deviceService';
import { toast } from 'sonner';
import { ACCENT_PALETTES, type AccentTheme } from '../../theme/accentColors';
import { useTheme } from '../../theme/ThemeProvider';
import { cn } from '../../lib/utils';
import {
  useUserSettings,
  type UserProfileType,
  type ControlLevel,
  type EditorFontFamily,
} from '../../context/UserSettingsContext';
import { alertSoundPlayer } from '../../lib/audio/alertSounds';

export interface UserSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId?: string;
  userEmail?: string;
  userName?: string;
  onSignOut?: () => void;
}

type TabType = 'account' | 'appearance' | 'notes' | 'reminders' | 'notifications' | 'devices';

export const UserSettingsModal: React.FC<UserSettingsModalProps> = ({
  isOpen,
  onClose,
  userId,
  userEmail,
  userName: initialUserName,
  onSignOut,
}) => {
  const { isDark } = useTheme();
  const { isInstallable, isInstalled, promptInstall } = usePWAInstall();
  const { settings, isSaving, updateSetting, resetToDefaults } = useUserSettings();

  const [activeTab, setActiveTab] = useState<TabType>('account');
  const [localName, setLocalName] = useState(settings.userName || initialUserName || '');
  const [isUpdatingName, setIsUpdatingName] = useState(false);

  // Push notification state
  const [pushSubscribed, setPushSubscribed] = useState<boolean>(false);
  const [pushLoading, setPushLoading] = useState<boolean>(false);
  const isPushSupported = PushService.isSupported();

  // Dispositivos conectados
  const [devices, setDevices] = useState<ConnectedDevice[]>([]);
  const [devicesLoading, setDevicesLoading] = useState<boolean>(false);
  const [removingDeviceId, setRemovingDeviceId] = useState<string | null>(null);

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
    if (!isOpen || !isPushSupported) return;
    PushService.getExistingSubscription().then((sub) => {
      setPushSubscribed(!!sub);
    });
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

  const handleTogglePush = async () => {
    if (!userId) {
      toast.error('Inicia sesión para activar las notificaciones');
      return;
    }
    setPushLoading(true);
    try {
      if (pushSubscribed) {
        const res = await PushService.unsubscribe(userId);
        if (res.success) {
          setPushSubscribed(false);
          toast.success('Notificaciones web desactivadas');
        } else {
          toast.error(res.error || 'Error al desactivar notificaciones');
        }
      } else {
        const res = await PushService.subscribe(userId);
        if (res.success) {
          setPushSubscribed(true);
          toast.success('¡Notificaciones web activadas! Recibirás avisos aun con la pestaña cerrada.');
        } else {
          toast.error(res.error || 'Error al activar notificaciones');
        }
      }
    } catch {
      toast.error('Ocurrió un error inesperado');
    } finally {
      setPushLoading(false);
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

  const profileOptions: { id: UserProfileType; label: string; desc: string; impact: string }[] = [
    {
      id: 'personal',
      label: 'Vida Personal',
      desc: 'Hábitos diarios, listas de compras, salud y proyectos personales.',
      impact: 'Prioriza vistas simplificadas de notas y recordatorios directos sin sobrecarga de fechas corporativas.',
    },
    {
      id: 'work',
      label: 'Profesional / Trabajo',
      desc: 'Proyectos con entregables, reuniones de equipo y tareas de alto impacto.',
      impact: 'Enfoca la agenda en plazos de entrega, filtros estrictos por proyecto y seguimiento de colaboraciones.',
    },
    {
      id: 'student',
      label: 'Estudiante / Académico',
      desc: 'Clases, materias, exámenes y entregas de tareas escolares o universitarias.',
      impact: 'En la app móvil habilita la integración con el Widget de Horario de Clases y organización por asignaturas.',
    },
  ];

  const controlLevelOptions: { id: ControlLevel; label: string; desc: string; color: string }[] = [
    { id: 'normal', label: 'Normal', desc: 'Alerta sutil y no invasiva', color: '#10B981' },
    { id: 'strict', label: 'Estricto', desc: 'Aviso prioritario y sonoro para no olvidar', color: '#F59E0B' },
    { id: 'critical', label: 'Crítico', desc: 'Alarma persistente hasta confirmación manual', color: '#EF4444' },
  ];

  const tabs = [
    { id: 'account' as TabType, label: 'Cuenta y Perfil', icon: User },
    { id: 'appearance' as TabType, label: 'Apariencia', icon: Palette },
    { id: 'reminders' as TabType, label: 'Recordatorios & Agenda', icon: Clock },
    { id: 'notes' as TabType, label: 'Notas & Editor', icon: FileText },
    { id: 'notifications' as TabType, label: 'Notificaciones', icon: Bell },
    { id: 'devices' as TabType, label: 'Dispositivos & PWA', icon: Smartphone },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Ajustes de Veyra" maxWidth="5xl" className="overflow-hidden">
      <div className="flex flex-col md:flex-row -mx-4 -mb-4 -mt-2 min-h-[520px] md:h-[580px] overflow-hidden">
        {/* Sidebar de pestañas */}
        <aside className="w-full md:w-64 shrink-0 border-b md:border-b-0 md:border-r border-veyra-border p-4 space-y-2 bg-veyra-elevated/40 flex flex-col">
          <div className="px-3 py-2.5 rounded-lg bg-veyra-card/70 border border-veyra-border/60">
            <p className="text-[10px] text-veyra-subtle uppercase tracking-wider font-semibold">Conectado como</p>
            <p className="text-xs font-semibold text-veyra-text truncate mt-0.5">{settings.userName || userEmail || 'Usuario'}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] text-emerald-400 font-medium">Sincronización activa</span>
            </div>
          </div>

          <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-1 md:pb-0 scrollbar-none flex-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium transition-all text-left whitespace-nowrap cursor-pointer w-full',
                    isActive
                      ? 'bg-accent/15 text-accent font-semibold shadow-xs'
                      : 'text-veyra-muted hover:text-veyra-text hover:bg-veyra-elevated/80'
                  )}
                >
                  <Icon className={cn('w-4 h-4 shrink-0', isActive ? 'text-accent' : 'text-veyra-subtle')} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="hidden md:block pt-3 mt-auto border-t border-veyra-border space-y-1.5">
            <button
              onClick={resetToDefaults}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] text-veyra-subtle hover:text-veyra-text hover:bg-white/5 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restablecer ajustes</span>
            </button>

            {onSignOut && (
              <button
                onClick={() => {
                  onClose();
                  onSignOut();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-red-400/90 hover:text-red-300 hover:bg-red-500/10 transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Cerrar sesión</span>
              </button>
            )}
          </div>
        </aside>

        {/* Panel de contenido de la pestaña */}
        <div className="flex-1 p-5 md:p-6 overflow-y-auto overflow-x-hidden h-full space-y-6 text-xs">
          {/* Indicador de guardado en la nube */}
          <div className="flex items-center justify-between text-[11px] text-veyra-subtle pb-2 border-b border-veyra-border/50">
            <span className="font-medium text-veyra-muted">Los cambios globales se sincronizan al instante con tu app móvil</span>
            {isSaving ? (
              <span className="flex items-center gap-1.5 text-accent font-medium">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Guardando...</span>
              </span>
            ) : (
              <span className="flex items-center gap-1 text-emerald-400 font-medium">
                <CloudCheck className="w-3.5 h-3.5" />
                <span>En la nube</span>
              </span>
            )}
          </div>

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* PESTAÑA: CUENTA Y PERFIL                                      */}
          {/* ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'account' && (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold text-veyra-text">Identidad y Perfil</h4>
                <p className="text-[11px] text-veyra-muted mt-0.5">
                  Personaliza cómo te identificas y tu modo de trabajo prioritario.
                </p>
              </div>

              {/* Nombre de usuario */}
              <div className="p-3.5 rounded-lg bg-veyra-card/70 border border-veyra-border space-y-2">
                <label className="block text-[11px] font-semibold text-veyra-muted uppercase tracking-wider">
                  Nombre visible
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={localName}
                    onChange={(e) => setLocalName(e.target.value)}
                    placeholder="Tu nombre o alias"
                    className="flex-1 px-3 py-1.5 rounded-lg bg-veyra-elevated border border-veyra-border text-veyra-text placeholder:text-veyra-subtle focus:outline-none focus:border-accent text-xs"
                  />
                  <button
                    onClick={handleSaveName}
                    disabled={isUpdatingName || localName.trim() === settings.userName}
                    className="px-3.5 py-1.5 rounded-lg bg-accent text-white font-medium hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {isUpdatingName ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Guardar'}
                  </button>
                </div>
                <p className="text-[10px] text-veyra-subtle">
                  Email vinculado: <span className="text-veyra-text font-mono">{userEmail || 'Sin email'}</span>
                </p>
              </div>

              {/* Modo de uso / Enfoque */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[11px] font-semibold text-veyra-muted uppercase tracking-wider">
                    Enfoque de uso principal
                  </label>
                  <span className="text-[10px] text-veyra-subtle italic">Adapta sugerencias y módulos prioritarios</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {profileOptions.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => updateSetting('userProfile', opt.id)}
                      className={cn(
                        'p-3.5 rounded-lg border text-left transition-all cursor-pointer flex flex-col justify-between',
                        settings.userProfile === opt.id
                          ? 'bg-accent/10 border-accent shadow-xs ring-1 ring-accent/30'
                          : 'bg-veyra-card/60 border-veyra-border hover:border-veyra-subtle'
                      )}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-semibold text-xs text-veyra-text">{opt.label}</span>
                          {settings.userProfile === opt.id && <Check className="w-3.5 h-3.5 text-accent" />}
                        </div>
                        <p className="text-[11px] text-veyra-muted leading-relaxed mb-2">{opt.desc}</p>
                      </div>
                      <div className="pt-2 border-t border-veyra-border/50">
                        <p className="text-[9.5px] text-veyra-subtle leading-normal">
                          <span className="font-medium text-veyra-muted">Diferencial:</span> {opt.impact}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Nivel de Control por Defecto */}
              <div>
                <label className="block text-[11px] font-semibold text-veyra-muted uppercase tracking-wider mb-2">
                  Nivel de control predeterminado en recordatorios
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {controlLevelOptions.map((lvl) => (
                    <button
                      key={lvl.id}
                      type="button"
                      onClick={() => updateSetting('defaultControlLevel', lvl.id)}
                      className={cn(
                        'p-3 rounded-lg border text-left transition-all cursor-pointer',
                        settings.defaultControlLevel === lvl.id
                          ? 'bg-accent/10 border-accent shadow-xs'
                          : 'bg-veyra-card/60 border-veyra-border hover:border-veyra-subtle'
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
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* PESTAÑA: APARIENCIA                                           */}
          {/* ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'appearance' && (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold text-veyra-text">Estilo e Interfaz</h4>
                <p className="text-[11px] text-veyra-muted mt-0.5">
                  El color de acento se sincroniza en tiempo real tanto en la Web como en la App móvil.
                </p>
              </div>

              {/* Modo de Tema */}
              <div>
                <label className="block text-[11px] font-semibold text-veyra-muted uppercase tracking-wider mb-1.5">
                  Tema de la interfaz
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => updateSetting('themeMode', 'dark')}
                    className={cn(
                      'flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border font-medium transition-colors cursor-pointer',
                      settings.themeMode === 'dark'
                        ? 'bg-accent/15 border-accent text-accent font-semibold'
                        : 'bg-veyra-card/60 border-veyra-border text-veyra-muted hover:text-veyra-text'
                    )}
                  >
                    <Moon className="w-3.5 h-3.5" />
                    <span>Oscuro</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSetting('themeMode', 'light')}
                    className={cn(
                      'flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border font-medium transition-colors cursor-pointer',
                      settings.themeMode === 'light'
                        ? 'bg-accent/15 border-accent text-accent font-semibold'
                        : 'bg-veyra-card/60 border-veyra-border text-veyra-muted hover:text-veyra-text'
                    )}
                  >
                    <Sun className="w-3.5 h-3.5" />
                    <span>Claro</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSetting('themeMode', 'system')}
                    className={cn(
                      'flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border font-medium transition-colors cursor-pointer',
                      settings.themeMode === 'system'
                        ? 'bg-accent/15 border-accent text-accent font-semibold'
                        : 'bg-veyra-card/60 border-veyra-border text-veyra-muted hover:text-veyra-text'
                    )}
                  >
                    <Laptop className="w-3.5 h-3.5" />
                    <span>Sistema</span>
                  </button>
                </div>
              </div>

              {/* Color de Acento */}
              <div>
                <label className="block text-[11px] font-semibold text-veyra-muted uppercase tracking-wider mb-2">
                  Color de Acento en Vivo
                </label>
                <div className="grid grid-cols-6 gap-2 p-3 rounded-lg bg-veyra-card/60 border border-veyra-border">
                  {availableAccents.map((item) => (
                    <button
                      key={item.theme}
                      type="button"
                      onClick={() => updateSetting('accentTheme', item.theme)}
                      title={item.label}
                      className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:scale-110 cursor-pointer mx-auto',
                        settings.accentTheme === item.theme && 'ring-2 ring-offset-2 ring-offset-veyra-card ring-accent'
                      )}
                      style={{ backgroundColor: item.hex }}
                    >
                      {settings.accentTheme === item.theme && <Check className="w-3.5 h-3.5 text-white stroke-[3]" />}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-veyra-subtle mt-1.5">
                  Cambiar este color transmite una señal instantánea por WebSocket al móvil para colorear iconos, bordes y botones en vivo.
                </p>
              </div>

              {/* Papel en modo oscuro */}
              <div>
                <label className="block text-[11px] font-semibold text-veyra-muted uppercase tracking-wider mb-1.5">
                  Papel de la nota en modo oscuro
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => updateSetting('notePaperMode', 'auto')}
                    className={cn(
                      'flex items-center justify-center gap-2 py-2 px-3 rounded-lg border font-medium transition-colors cursor-pointer',
                      settings.notePaperMode === 'auto'
                        ? 'bg-accent/15 border-accent text-accent font-semibold'
                        : 'bg-veyra-card/60 border-veyra-border text-veyra-muted hover:text-veyra-text'
                    )}
                  >
                    <Moon className="w-3.5 h-3.5" />
                    <span>Papel Oscuro (Auto)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSetting('notePaperMode', 'light')}
                    className={cn(
                      'flex items-center justify-center gap-2 py-2 px-3 rounded-lg border font-medium transition-colors cursor-pointer',
                      settings.notePaperMode === 'light'
                        ? 'bg-accent/15 border-accent text-accent font-semibold'
                        : 'bg-veyra-card/60 border-veyra-border text-veyra-muted hover:text-veyra-text'
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
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold text-veyra-text">Recordatorios y Agenda Compartida</h4>
                <p className="text-[11px] text-veyra-muted mt-0.5">
                  Alinea los tiempos de aviso, calendario y sonidos audibles con tu dispositivo móvil.
                </p>
              </div>

              {/* Anticipación por defecto */}
              <div className="p-3.5 rounded-lg bg-veyra-card/60 border border-veyra-border space-y-2">
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
                        'py-2 px-2.5 rounded-lg border font-medium text-center transition-colors cursor-pointer text-xs',
                        settings.defaultLeadMinutes === lead.val
                          ? 'bg-accent/15 border-accent text-accent font-semibold'
                          : 'bg-veyra-elevated/70 border-veyra-border text-veyra-muted hover:text-veyra-text'
                      )}
                    >
                      {lead.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Formato Horario & Primer día de la semana */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-veyra-card/60 border border-veyra-border flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-veyra-text">Formato 24 Horas</p>
                    <p className="text-[10px] text-veyra-muted">Mostrar 14:00 en lugar de 2:00 PM</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.timeFormat24h}
                    onChange={(e) => updateSetting('timeFormat24h', e.target.checked)}
                    className="w-4 h-4 rounded border-veyra-border text-accent focus:ring-accent accent-accent cursor-pointer"
                  />
                </div>

                <div className="p-3 rounded-lg bg-veyra-card/60 border border-veyra-border flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-veyra-text">Primer día: Lunes</p>
                    <p className="text-[10px] text-veyra-muted">En caso contrario comenzará el Domingo</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.firstDayMonday}
                    onChange={(e) => updateSetting('firstDayMonday', e.target.checked)}
                    className="w-4 h-4 rounded border-veyra-border text-accent focus:ring-accent accent-accent cursor-pointer"
                  />
                </div>
              </div>

              {/* Sonidos y Tono de Alertas */}
              <div className="p-3.5 rounded-lg bg-veyra-card/60 border border-veyra-border space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-veyra-text flex items-center gap-1.5">
                      <Volume2 className="w-3.5 h-3.5 text-accent" />
                      <span>Alertas Audibles Web</span>
                    </p>
                    <p className="text-[10px] text-veyra-muted">Reproducir tonos sonoros al vencer un recordatorio</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.soundAlertsEnabled}
                    onChange={(e) => updateSetting('soundAlertsEnabled', e.target.checked)}
                    className="w-4 h-4 rounded border-veyra-border text-accent focus:ring-accent accent-accent cursor-pointer"
                  />
                </div>

                {settings.soundAlertsEnabled && (
                  <div className="pt-2 border-t border-veyra-border/60 flex items-center gap-2">
                    <span className="text-[11px] text-veyra-muted">Probar tonos:</span>
                    <button
                      type="button"
                      onClick={() => alertSoundPlayer.play('normal')}
                      className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-[10px] font-medium"
                    >
                      Normal
                    </button>
                    <button
                      type="button"
                      onClick={() => alertSoundPlayer.play('strict')}
                      className="px-2 py-1 rounded bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 text-[10px] font-medium"
                    >
                      Estricto
                    </button>
                    <button
                      type="button"
                      onClick={() => alertSoundPlayer.play('critical')}
                      className="px-2 py-1 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 text-[10px] font-medium"
                    >
                      Crítico
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* PESTAÑA: NOTAS & EDITOR                                       */}
          {/* ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'notes' && (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold text-veyra-text">Notas y Flujo de Trabajo</h4>
                <p className="text-[11px] text-veyra-muted mt-0.5">
                  Define las preferencias iniciales para notas nuevas y la organización de carpetas.
                </p>
              </div>

              {/* Formato de Hoja */}
              <div>
                <label className="block text-[11px] font-semibold text-veyra-muted uppercase tracking-wider mb-1.5">
                  Formato de hoja por defecto
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => updateSetting('notePageFormat', 'infinite')}
                    className={cn(
                      'flex items-center justify-center gap-2 py-2 px-3 rounded-lg border font-medium transition-colors cursor-pointer',
                      settings.notePageFormat === 'infinite'
                        ? 'bg-accent/15 border-accent text-accent font-semibold'
                        : 'bg-veyra-card/60 border-veyra-border text-veyra-muted hover:text-veyra-text'
                    )}
                  >
                    <Scroll className="w-3.5 h-3.5" />
                    <span>Lienzo Infinito</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSetting('notePageFormat', 'a4')}
                    className={cn(
                      'flex items-center justify-center gap-2 py-2 px-3 rounded-lg border font-medium transition-colors cursor-pointer',
                      settings.notePageFormat === 'a4'
                        ? 'bg-accent/15 border-accent text-accent font-semibold'
                        : 'bg-veyra-card/60 border-veyra-border text-veyra-muted hover:text-veyra-text'
                    )}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Hojas Paginadas A4</span>
                  </button>
                </div>
              </div>

              {/* Orden del Explorador */}
              <div>
                <label className="block text-[11px] font-semibold text-veyra-muted uppercase tracking-wider mb-1.5">
                  Orden por defecto en el explorador
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => updateSetting('explorerSortMode', 'alphabetical')}
                    className={cn(
                      'flex items-center justify-center gap-2 py-2 px-3 rounded-lg border font-medium transition-colors cursor-pointer',
                      settings.explorerSortMode === 'alphabetical'
                        ? 'bg-accent/15 border-accent text-accent font-semibold'
                        : 'bg-veyra-card/60 border-veyra-border text-veyra-muted hover:text-veyra-text'
                    )}
                  >
                    <span>Alfabético (A - Z)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSetting('explorerSortMode', 'manual')}
                    className={cn(
                      'flex items-center justify-center gap-2 py-2 px-3 rounded-lg border font-medium transition-colors cursor-pointer',
                      settings.explorerSortMode === 'manual'
                        ? 'bg-accent/15 border-accent text-accent font-semibold'
                        : 'bg-veyra-card/60 border-veyra-border text-veyra-muted hover:text-veyra-text'
                    )}
                  >
                    <span>Manual (Arrastrar y Soltar)</span>
                  </button>
                </div>
              </div>

              {/* Fuente del Editor */}
              <div>
                <label className="block text-[11px] font-semibold text-veyra-muted uppercase tracking-wider mb-1.5">
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
                        'py-2 px-2.5 rounded-lg border font-medium text-center transition-colors cursor-pointer text-xs',
                        settings.editorFontFamily === font.id
                          ? 'bg-accent/15 border-accent text-accent font-semibold'
                          : 'bg-veyra-card/60 border-veyra-border text-veyra-muted hover:text-veyra-text'
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
              <div>
                <h4 className="text-sm font-semibold text-veyra-text">Canales de Notificación</h4>
                <p className="text-[11px] text-veyra-muted mt-0.5">
                  Gestiona cómo y cuándo recibes alertas en este navegador y en tus dispositivos.
                </p>
              </div>

              {/* Web Push Notifications */}
              {isPushSupported ? (
                <div className="flex items-center justify-between p-3.5 rounded-lg bg-veyra-card/60 border border-veyra-border">
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
              ) : (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
                  Tu navegador no soporta el estándar Web Push Notifications o las tiene bloqueadas.
                </div>
              )}

              {/* Horas de Silencio (No Molestar) */}
              <div className="p-3.5 rounded-lg bg-veyra-card/60 border border-veyra-border space-y-3">
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
          )}

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* PESTAÑA: DISPOSITIVOS & ACCESO                                */}
          {/* ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'devices' && (
            <div className="space-y-4">
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

              {/* Botón de Instalación PWA Desktop si aplica */}
              {isInstallable && (
                <div className="p-3.5 rounded-lg bg-accent/10 border border-accent/30 text-accent">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center shrink-0">
                        <Laptop className="w-4 h-4 text-accent" />
                      </div>
                      <div>
                        <p className="font-semibold text-xs text-veyra-text">Instalar app de escritorio</p>
                        <p className="text-[10px] text-veyra-muted">Acceso directo como ventana nativa independiente</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={promptInstall}
                      className="px-3 py-1.5 rounded-lg bg-accent text-white font-medium hover:bg-accent/90 transition-colors flex items-center gap-1.5 cursor-pointer text-xs"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Instalar</span>
                    </button>
                  </div>
                </div>
              )}

              {isInstalled && (
                <div className="flex items-center gap-2.5 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs">
                  <Laptop className="w-4 h-4 shrink-0" />
                  <span>Ejecutándose en modo aplicación de escritorio instalada</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
