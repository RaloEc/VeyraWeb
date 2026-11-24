import React from 'react';
import { ShieldAlert, Check, Clock, Lock } from 'lucide-react';
import { Button } from './Button';
import {
  type AlertItem,
  classifyInAppAlert,
  formatAlertTime,
} from '../../lib/inAppAlertLogic';

export type { AlertItem };

export interface InAppReminderAlertModalProps {
  item: AlertItem | null;
  queueCount?: number;
  use24h?: boolean;
  onComplete: (id: string) => void;
}

export const InAppReminderAlertModal: React.FC<InAppReminderAlertModalProps> = ({
  item,
  queueCount = 1,
  use24h = true,
  onComplete,
}) => {
  if (!item || classifyInAppAlert(item) !== 'critical-modal') {
    return null;
  }

  const timeStr = formatAlertTime(item.dueDateMs, use24h);

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="veyra-critical-alert-title"
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-veyra-fade-in"
    >
      <div className="w-full max-w-md bg-veyra-card border border-rose-500/45 rounded-2xl p-6 shadow-2xl shadow-rose-500/15 relative overflow-hidden flex flex-col gap-4 animate-veyra-scale-in">
        {/* Top pulsing critical bar */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-rose-500 animate-pulse" />

        {/* Header row */}
        <div className="flex items-start justify-between gap-3 pt-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-rose-500/15 text-rose-400 border border-rose-500/35">
              <ShieldAlert className="w-5 h-5 animate-bounce" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  Alarma Crítica
                </span>
                {queueCount > 1 && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-veyra-elevated text-veyra-muted border border-veyra-border">
                    1 de {queueCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-veyra-muted mt-1 font-mono">
                <Clock className="w-3.5 h-3.5 text-rose-400/80" />
                <span>{timeStr}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-1.5 py-1">
          <h2
            id="veyra-critical-alert-title"
            className="text-lg font-bold text-veyra-text leading-snug"
          >
            {item.title}
          </h2>
          {item.description && (
            <p className="text-sm text-veyra-muted leading-relaxed line-clamp-4">
              {item.description}
            </p>
          )}
        </div>

        {/* Persistent Action Footer (completion-only) */}
        <div className="pt-3 border-t border-veyra-border flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-[11px] text-veyra-muted">
            <Lock className="w-3.5 h-3.5 text-rose-400/80 shrink-0" />
            <span>Confirmación obligatoria para cerrar</span>
          </div>

          <Button
            type="button"
            onClick={() => onComplete(item.id)}
            size="md"
            className="w-full sm:w-auto bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-500/20"
          >
            <Check className="w-4 h-4" />
            <span>Completar</span>
          </Button>
        </div>
      </div>
    </div>
  );
};
