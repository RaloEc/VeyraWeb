import React, { useState } from 'react';
import {
  Bell,
  AlertCircle,
  ShieldAlert,
  Check,
  Clock,
  X,
  ChevronDown,
} from 'lucide-react';
import { Button } from './Button';
import { cn } from '../../lib/utils';

export interface AlertItem {
  id: string;
  title: string;
  description?: string | null;
  controlLevel: 'normal' | 'strict' | 'critical' | string;
  dueDateMs: number;
  isEvent?: boolean;
}

export interface InAppReminderAlertModalProps {
  item: AlertItem | null;
  onComplete: (id: string) => void;
  onSnooze: (id: string, minutes: number) => void;
  onDismiss: () => void;
}

export const InAppReminderAlertModal: React.FC<InAppReminderAlertModalProps> = ({
  item,
  onComplete,
  onSnooze,
  onDismiss,
}) => {
  const [showSnoozeOptions, setShowSnoozeOptions] = useState(false);

  if (!item) return null;

  const isCritical = item.controlLevel === 'critical';
  const isStrict = item.controlLevel === 'strict';

  const timeStr = new Date(item.dueDateMs).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div
        className={cn(
          'w-full max-w-md bg-veyra-card border rounded-2xl p-6 shadow-2xl relative overflow-hidden flex flex-col gap-4 animate-scale-in',
          isCritical
            ? 'border-rose-500/40 shadow-rose-500/10'
            : isStrict
            ? 'border-amber-500/40 shadow-amber-500/10'
            : 'border-veyra-border shadow-elevated'
        )}
      >
        {/* Top ambient glow */}
        <div
          className={cn(
            'absolute top-0 left-0 right-0 h-1.5',
            isCritical ? 'bg-rose-500 animate-pulse' : isStrict ? 'bg-amber-500' : 'bg-accent'
          )}
        />

        {/* Header row */}
        <div className="flex items-start justify-between gap-3 pt-1">
          <div className="flex items-center gap-2.5">
            <div
              className={cn(
                'w-9 h-9 rounded-xl flex items-center justify-center shrink-0',
                isCritical
                  ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                  : isStrict
                  ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                  : 'bg-accent/15 text-accent border border-accent/30'
              )}
            >
              {isCritical ? (
                <ShieldAlert className="w-5 h-5 animate-bounce" />
              ) : isStrict ? (
                <AlertCircle className="w-5 h-5" />
              ) : (
                <Bell className="w-5 h-5" />
              )}
            </div>

            <div>
              <span
                className={cn(
                  'text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded',
                  isCritical
                    ? 'bg-rose-500/20 text-rose-300'
                    : isStrict
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'bg-accent/20 text-accent'
                )}
              >
                {isCritical
                  ? 'Alarma Crítica'
                  : isStrict
                  ? 'Recordatorio Estricto'
                  : item.isEvent
                  ? 'Aviso de Evento'
                  : 'Recordatorio'}
              </span>
              <div className="flex items-center gap-1 text-xs text-veyra-muted mt-0.5 font-mono">
                <Clock className="w-3 h-3" />
                <span>{timeStr}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onDismiss}
            className="p-1.5 rounded-lg text-veyra-muted hover:text-veyra-text hover:bg-white/5 transition-colors cursor-pointer"
            title="Cerrar aviso"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-1 py-1">
          <h2 className="text-base sm:text-lg font-bold text-veyra-text leading-snug">
            {item.title}
          </h2>
          {item.description && (
            <p className="text-xs text-veyra-muted leading-relaxed line-clamp-3">
              {item.description}
            </p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="pt-2 border-t border-veyra-border flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
          {/* Snooze button / selector */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowSnoozeOptions((prev) => !prev)}
              className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-veyra-elevated hover:bg-veyra-card border border-veyra-border text-xs text-veyra-muted hover:text-veyra-text transition-colors cursor-pointer"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Posponer</span>
              <ChevronDown className="w-3 h-3 opacity-60" />
            </button>

            {showSnoozeOptions && (
              <div className="absolute left-0 bottom-full mb-1.5 z-50 bg-veyra-card border border-veyra-border rounded-xl shadow-elevated p-1 min-w-[130px] space-y-0.5 text-xs animate-fade-in">
                <button
                  type="button"
                  onClick={() => {
                    onSnooze(item.id, 10);
                    setShowSnoozeOptions(false);
                    onDismiss();
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-white/5 hover:text-accent text-veyra-text transition-colors"
                >
                  +10 minutos
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSnooze(item.id, 30);
                    setShowSnoozeOptions(false);
                    onDismiss();
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-white/5 hover:text-accent text-veyra-text transition-colors"
                >
                  +30 minutos
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSnooze(item.id, 60);
                    setShowSnoozeOptions(false);
                    onDismiss();
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-white/5 hover:text-accent text-veyra-text transition-colors"
                >
                  +1 hora
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onDismiss}
              className="flex-1 sm:flex-none px-3 py-2 rounded-lg text-xs text-veyra-muted hover:text-veyra-text transition-colors"
            >
              Ignorar
            </button>
            <Button
              type="button"
              onClick={() => {
                onComplete(item.id);
                onDismiss();
              }}
              size="md"
              className={cn(
                'flex-1 sm:flex-none',
                isCritical && 'bg-rose-500 hover:bg-rose-600 text-white'
              )}
            >
              <Check className="w-4 h-4" />
              <span>Completar</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

