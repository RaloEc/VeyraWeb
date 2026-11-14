import React, { useState } from 'react';
import {
  GraduationCap,
  Briefcase,
  User,
  Sliders,
  Bell,
  AlertCircle,
  ShieldAlert,
  ArrowRight,
  Check,
  Sparkles,
} from 'lucide-react';
import { Button } from './Button';
import { supabase } from '../../lib/supabase';
import { cn } from '../../lib/utils';
import confetti from 'canvas-confetti';

export interface OnboardingModalProps {
  userId: string;
  userEmail?: string;
  onComplete: () => void;
}

export type ProfileChoice = 'student' | 'work' | 'personal' | 'custom';
export type ControlLevelChoice = 'gentle' | 'strict' | 'critical';

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  userId,
  userEmail: _userEmail,
  onComplete,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedProfile, setSelectedProfile] = useState<ProfileChoice>('personal');
  const [selectedControlLevel, setSelectedControlLevel] = useState<ControlLevelChoice>('gentle');
  const [notificationStatus, setNotificationStatus] = useState<NotificationPermission>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'default';
  });
  const [saving, setSaving] = useState(false);

  const profileOptions = [
    {
      id: 'student' as ProfileChoice,
      title: 'Estudiante',
      desc: 'Clases, exámenes, apuntes y entregas académicas',
      icon: GraduationCap,
      color: '#3B82F6',
    },
    {
      id: 'work' as ProfileChoice,
      title: 'Profesional / Trabajo',
      desc: 'Proyectos, reuniones, clientes y tareas de alto impacto',
      icon: Briefcase,
      color: '#10B981',
    },
    {
      id: 'personal' as ProfileChoice,
      title: 'Vida Personal',
      desc: 'Hábitos diarios, finanzas, recordatorios y metas personales',
      icon: User,
      color: '#8B5CF6',
    },
    {
      id: 'custom' as ProfileChoice,
      title: 'Personalizado',
      desc: 'Configuración libre adaptada exactamente a tu flujo de trabajo',
      icon: Sliders,
      color: '#F59E0B',
    },
  ];

  const controlLevelOptions = [
    {
      id: 'gentle' as ControlLevelChoice,
      title: 'Estándar / Suave',
      desc: 'Aviso puntual al vencer la tarea, ideal para un ritmo sin presiones.',
      icon: Bell,
      color: '#64748B',
    },
    {
      id: 'strict' as ControlLevelChoice,
      title: 'Estricto',
      desc: 'Insistente: notificación principal + 2 repeticiones cada 15 min si no confirmas.',
      icon: AlertCircle,
      color: '#F59E0B',
    },
    {
      id: 'critical' as ControlLevelChoice,
      title: 'Crítico',
      desc: 'Máxima prioridad: alerta persistente con repeticiones cada 5 min.',
      icon: ShieldAlert,
      color: '#EF4444',
    },
  ];

  const handleRequestNotification = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const perm = await Notification.requestPermission();
        setNotificationStatus(perm);
      } catch (err) {
        console.error('[Onboarding] Error requesting notification permission:', err);
      }
    }
  };

  const handleFinish = async () => {
    try {
      setSaving(true);
      const { error } = await supabase
        .from('profiles')
        .update({
          user_profile: selectedProfile,
          default_control_level: selectedControlLevel,
          onboarding_completed: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (error) {
        console.error('[Onboarding] Failed to update profile:', error);
      }

      confetti({
        particleCount: 60,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#3ab0b0', '#5ce1e6', '#2b8f8f'],
      });

      onComplete();
    } catch (err) {
      console.error('[Onboarding] Exception on finish:', err);
      onComplete();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-lg bg-veyra-card border border-veyra-border rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]">
        {/* Progress indicator */}
        <div className="flex items-center gap-1.5 mb-6">
          <div
            className={cn(
              'h-1 flex-1 rounded-full transition-all duration-300',
              step >= 1 ? 'bg-accent' : 'bg-veyra-border'
            )}
          />
          <div
            className={cn(
              'h-1 flex-1 rounded-full transition-all duration-300',
              step >= 2 ? 'bg-accent' : 'bg-veyra-border'
            )}
          />
          <div
            className={cn(
              'h-1 flex-1 rounded-full transition-all duration-300',
              step >= 3 ? 'bg-accent' : 'bg-veyra-border'
            )}
          />
        </div>

        {/* Step 1: Profile */}
        {step === 1 && (
          <div className="space-y-5 flex-1 overflow-y-auto pr-1">
            <div className="text-center sm:text-left">
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-accent uppercase tracking-wider mb-1">
                <Sparkles className="w-3.5 h-3.5" />
                Paso 1 de 3
              </span>
              <h2 className="text-xl font-bold text-veyra-text tracking-tight">
                ¿Cómo planeas usar Veyra?
              </h2>
              <p className="text-xs text-veyra-muted mt-1">
                Adaptaremos tu experiencia y prioridades a tu enfoque principal.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              {profileOptions.map((opt) => {
                const isSelected = selectedProfile === opt.id;
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSelectedProfile(opt.id)}
                    className={cn(
                      'p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-2 relative',
                      isSelected
                        ? 'border-accent bg-accent/10 shadow-sm'
                        : 'border-veyra-border bg-veyra-elevated/40 hover:border-veyra-border/80'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-white"
                        style={{ backgroundColor: opt.color }}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      {isSelected && (
                        <div className="w-5 h-5 rounded-full bg-accent text-white flex items-center justify-center">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </div>
                      )}
                    </div>
                    <div>
                      <h3 className="text-xs font-semibold text-veyra-text">{opt.title}</h3>
                      <p className="text-[11px] text-veyra-muted mt-0.5 leading-relaxed">
                        {opt.desc}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="pt-4 flex justify-end">
              <Button type="button" onClick={() => setStep(2)} size="md">
                <span>Continuar</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Control Level */}
        {step === 2 && (
          <div className="space-y-5 flex-1 overflow-y-auto pr-1">
            <div className="text-center sm:text-left">
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-accent uppercase tracking-wider mb-1">
                <Sparkles className="w-3.5 h-3.5" />
                Paso 2 de 3
              </span>
              <h2 className="text-xl font-bold text-veyra-text tracking-tight">
                Nivel de control predeterminado
              </h2>
              <p className="text-xs text-veyra-muted mt-1">
                Define la insistencia con la que Veyra cuidará tus tareas pendientes.
              </p>
            </div>

            <div className="space-y-2.5 pt-2">
              {controlLevelOptions.map((opt) => {
                const isSelected = selectedControlLevel === opt.id;
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSelectedControlLevel(opt.id)}
                    className={cn(
                      'w-full p-3.5 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-3 relative',
                      isSelected
                        ? 'border-accent bg-accent/10 shadow-sm'
                        : 'border-veyra-border bg-veyra-elevated/40 hover:border-veyra-border/80'
                    )}
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                      style={{
                        backgroundColor: `${opt.color}20`,
                        color: opt.color,
                      }}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-semibold text-veyra-text">{opt.title}</h3>
                        {isSelected && (
                          <div className="w-4 h-4 rounded-full bg-accent text-white flex items-center justify-center">
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                          </div>
                        )}
                      </div>
                      <p className="text-[11px] text-veyra-muted mt-0.5 leading-relaxed">
                        {opt.desc}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="pt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-xs text-veyra-muted hover:text-veyra-text transition-colors"
              >
                Volver
              </button>
              <Button type="button" onClick={() => setStep(3)} size="md">
                <span>Continuar</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Notifications & Done */}
        {step === 3 && (
          <div className="space-y-5 flex-1 overflow-y-auto pr-1">
            <div className="text-center sm:text-left">
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-accent uppercase tracking-wider mb-1">
                <Sparkles className="w-3.5 h-3.5" />
                Paso 3 de 3
              </span>
              <h2 className="text-xl font-bold text-veyra-text tracking-tight">
                Permiso de Notificaciones
              </h2>
              <p className="text-xs text-veyra-muted mt-1">
                Para que Veyra pueda alertarte cuando tus recordatorios y eventos venzan.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-veyra-elevated/50 border border-veyra-border flex flex-col items-center text-center gap-3">
              <div className="w-12 h-12 rounded-full bg-accent/15 text-accent flex items-center justify-center">
                <Bell className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xs font-semibold text-veyra-text">
                  Avisos en tu escritorio
                </h3>
                <p className="text-[11px] text-veyra-muted mt-1 max-w-xs">
                  Recibirás alertas nativas en tu pantalla según el nivel de control elegido.
                </p>
              </div>

              {notificationStatus === 'granted' ? (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
                  <Check className="w-3.5 h-3.5" />
                  <span>Notificaciones habilitadas</span>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleRequestNotification}
                >
                  <Bell className="w-3.5 h-3.5" />
                  <span>Activar notificaciones ahora</span>
                </Button>
              )}
            </div>

            <div className="pt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="text-xs text-veyra-muted hover:text-veyra-text transition-colors"
              >
                Volver
              </button>
              <Button
                type="button"
                onClick={handleFinish}
                loading={saving}
                size="md"
              >
                <span>Comenzar a usar Veyra</span>
                <Check className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
