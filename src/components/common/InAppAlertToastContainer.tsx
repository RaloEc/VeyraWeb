import React, { useEffect, useRef, useState } from 'react';
import {
  Bell,
  Calendar,
  Check,
  Clock,
  MapPin,
  ShieldAlert,
  X,
} from 'lucide-react';
import { Button } from './Button';
import { cn } from '../../lib/utils';
import {
  type AlertItem,
  classifyInAppAlert,
  formatAlertTime,
  formatEventSchedule,
  formatLeadTimeLabel,
} from '../../lib/inAppAlertLogic';

export interface InAppAlertToastContainerProps {
  items: AlertItem[];
  use24h?: boolean;
  onComplete: (id: string) => void;
  onSnooze: (id: string, minutes: number) => void;
  onDismiss: (alertKey: string) => void;
}

const EVENT_TOAST_DURATION_MS = 20_000;
const REMINDER_TOAST_DURATION_MS = 25_000;

interface AlertToastCardProps {
  item: AlertItem;
  use24h: boolean;
  onComplete: (id: string) => void;
  onSnooze: (id: string, minutes: number) => void;
  onDismiss: (alertKey: string) => void;
}

const AlertToastCard: React.FC<AlertToastCardProps> = ({
  item,
  use24h,
  onComplete,
  onSnooze,
  onDismiss,
}) => {
  const kind = classifyInAppAlert(item);
  const isEvent = kind === 'event-toast';
  const durationMs = isEvent ? EVENT_TOAST_DURATION_MS : REMINDER_TOAST_DURATION_MS;

  const [isHovered, setIsHovered] = useState(false);
  const [showSnoozeOptions, setShowSnoozeOptions] = useState(false);

  const isPaused = isHovered || showSnoozeOptions;
  const remainingRef = useRef<number>(durationMs);
  const startedAtRef = useRef<number>(0);
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  // Reset countdown if the toast's alertKey changes
  useEffect(() => {
    remainingRef.current = durationMs;
    startedAtRef.current = Date.now();
  }, [item.alertKey, durationMs]);

  // Hover-pausable auto-dismiss timer
  useEffect(() => {
    if (isPaused) {
      return;
    }

    startedAtRef.current = Date.now();
    const timer = window.setTimeout(() => {
      onDismissRef.current(item.alertKey);
    }, Math.max(0, remainingRef.current));

    return () => {
      window.clearTimeout(timer);
      const elapsed = Date.now() - startedAtRef.current;
      remainingRef.current = Math.max(0, remainingRef.current - elapsed);
    };
  }, [isPaused, item.alertKey]);

  const leadLabel = formatLeadTimeLabel(item.leadMinutes);

  if (isEvent) {
    const eventColor = item.color || 'var(--accent-primary, #60A5FA)';
    const scheduleLabel = formatEventSchedule(
      item.dueDateMs,
      item.endDateMs,
      item.isAllDay,
      use24h
    );

    return (
      <div
        role="status"
        aria-live="polite"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="pointer-events-auto relative overflow-hidden rounded-2xl bg-veyra-card/95 backdrop-blur-md border border-veyra-border shadow-2xl animate-veyra-toast-in"
      >
        {/* Left event color accent stripe */}
        <div
          className="absolute left-0 top-0 bottom-0 w-1.5"
          style={{ backgroundColor: eventColor }}
        />

        <div className="p-4 sm:p-5 pl-5 sm:pl-6">
          {/* Header row */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border"
                style={{
                  backgroundColor: `color-mix(in srgb, ${eventColor} 15%, transparent)`,
                  borderColor: `color-mix(in srgb, ${eventColor} 35%, transparent)`,
                  color: eventColor,
                }}
              >
                <Calendar className="w-5 h-5" />
              </div>

              <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-veyra-muted">
                  Aviso de Evento
                </span>
                {leadLabel && (
                  <span
                    className="text-[11px] font-semibold px-2 py-0.5 rounded-full border"
                    style={{
                      backgroundColor: `color-mix(in srgb, ${eventColor} 14%, transparent)`,
                      borderColor: `color-mix(in srgb, ${eventColor} 30%, transparent)`,
                      color: eventColor,
                    }}
                  >
                    {leadLabel}
                  </span>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => onDismiss(item.alertKey)}
              className="p-1.5 -mr-1 -mt-1 rounded-lg text-veyra-muted hover:text-veyra-text hover:bg-white/5 transition-colors cursor-pointer shrink-0"
              aria-label="Cerrar aviso"
              title="Cerrar aviso"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Generous event details */}
          <div className="mt-3 space-y-2.5">
            <h3 className="text-base font-bold text-veyra-text leading-snug break-words">
              {item.title}
            </h3>

            <div className="space-y-1.5 text-xs text-veyra-muted">
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 shrink-0 opacity-80" style={{ color: eventColor }} />
                <span className="font-medium text-veyra-text/90">{scheduleLabel}</span>
              </div>

              {item.location && (
                <div className="flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 shrink-0 opacity-80" style={{ color: eventColor }} />
                  <span className="truncate">{item.location}</span>
                </div>
              )}
            </div>

            {item.description && (
              <p className="pt-2.5 border-t border-veyra-border/60 text-xs text-veyra-muted leading-relaxed line-clamp-3">
                {item.description}
              </p>
            )}
          </div>
        </div>

        {/* Auto-dismiss progress bar */}
        <div className="h-0.5 w-full bg-veyra-border/30">
          <div
            className="h-full w-full animate-veyra-toast-progress"
            style={{
              backgroundColor: eventColor,
              opacity: 0.65,
              animationDuration: `${durationMs}ms`,
              animationPlayState: isPaused ? 'paused' : 'running',
            }}
          />
        </div>
      </div>
    );
  }

  // Normal reminder (or advance lead notice for a reminder)
  const isCriticalLead = item.controlLevel === 'critical';
  const timeStr = formatAlertTime(item.dueDateMs, use24h);

  return (
    <div
      role="status"
      aria-live="polite"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="pointer-events-auto relative overflow-hidden rounded-2xl bg-veyra-card/95 backdrop-blur-md border border-veyra-border shadow-2xl animate-veyra-toast-in"
    >
      {/* Left accent stripe */}
      <div
        className={cn(
          'absolute left-0 top-0 bottom-0 w-1.5',
          isCriticalLead ? 'bg-rose-500' : 'bg-accent'
        )}
      />

      <div className="p-4 pl-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={cn(
                'w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border',
                isCriticalLead
                  ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                  : 'bg-accent/15 text-accent border-accent/30'
              )}
            >
              {isCriticalLead ? (
                <ShieldAlert className="w-4 h-4" />
              ) : (
                <Bell className="w-4 h-4" />
              )}
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={cn(
                    'text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded',
                    isCriticalLead
                      ? 'bg-rose-500/20 text-rose-300'
                      : 'bg-accent/15 text-accent'
                  )}
                >
                  {item.isLeadNotice ? 'Próximo recordatorio' : 'Recordatorio'}
                </span>
                {item.isLeadNotice && leadLabel && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-veyra-elevated text-veyra-text border border-veyra-border">
                    {leadLabel}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1 text-[11px] text-veyra-muted mt-0.5 font-mono">
                <Clock className="w-3 h-3" />
                <span>{timeStr}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onDismiss(item.alertKey)}
            className="p-1.5 -mr-1 -mt-1 rounded-lg text-veyra-muted hover:text-veyra-text hover:bg-white/5 transition-colors cursor-pointer shrink-0"
            aria-label="Cerrar recordatorio"
            title="Cerrar aviso"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="mt-2.5 space-y-1">
          <h3 className="text-sm sm:text-[15px] font-semibold text-veyra-text leading-snug break-words">
            {item.title}
          </h3>
          {item.description && (
            <p className="text-xs text-veyra-muted leading-relaxed line-clamp-2">
              {item.description}
            </p>
          )}
        </div>

        {/* Compact Action Footer */}
        <div className="mt-3 pt-2.5 border-t border-veyra-border/60 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setShowSnoozeOptions((prev) => !prev)}
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-colors cursor-pointer',
              showSnoozeOptions
                ? 'bg-veyra-elevated border-accent/40 text-veyra-text'
                : 'bg-veyra-elevated/70 hover:bg-veyra-elevated border-veyra-border text-veyra-muted hover:text-veyra-text'
            )}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Posponer</span>
          </button>

          <Button
            type="button"
            size="sm"
            onClick={() => onComplete(item.id)}
            className="px-3"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Completar</span>
          </Button>
        </div>

        {/* Inline snooze strip (avoids overflow clipping inside rounded toast) */}
        {showSnoozeOptions && (
          <div className="mt-2 flex items-center gap-1.5 pt-1 animate-veyra-fade-in">
            {[
              { label: '+10 min', minutes: 10 },
              { label: '+30 min', minutes: 30 },
              { label: '+1 hora', minutes: 60 },
            ].map((opt) => (
              <button
                key={opt.minutes}
                type="button"
                onClick={() => {
                  setShowSnoozeOptions(false);
                  onSnooze(item.id, opt.minutes);
                }}
                className="flex-1 px-2 py-1.5 rounded-lg bg-veyra-elevated hover:bg-white/10 border border-veyra-border text-[11px] font-medium text-veyra-text hover:text-accent transition-colors cursor-pointer"
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Auto-dismiss progress bar */}
      <div className="h-0.5 w-full bg-veyra-border/30">
        <div
          className={cn(
            'h-full w-full animate-veyra-toast-progress opacity-65',
            isCriticalLead ? 'bg-rose-500' : 'bg-accent'
          )}
          style={{
            animationDuration: `${durationMs}ms`,
            animationPlayState: isPaused ? 'paused' : 'running',
          }}
        />
      </div>
    </div>
  );
};

export const InAppAlertToastContainer: React.FC<InAppAlertToastContainerProps> = ({
  items,
  use24h = true,
  onComplete,
  onSnooze,
  onDismiss,
}) => {
  if (!items || items.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 left-4 sm:left-auto sm:w-[400px] sm:max-w-[calc(100vw-2.5rem)] z-50 flex flex-col gap-3 pointer-events-none">
      {items.map((item) => (
        <AlertToastCard
          key={item.alertKey}
          item={item}
          use24h={use24h}
          onComplete={onComplete}
          onSnooze={onSnooze}
          onDismiss={onDismiss}
        />
      ))}
    </div>
  );
};
