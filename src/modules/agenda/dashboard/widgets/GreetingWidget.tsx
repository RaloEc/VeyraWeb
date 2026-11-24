import React, { useState, useEffect } from 'react';
import { FileText, CheckCircle2, Clock, Plus, Sparkles, AlertCircle } from 'lucide-react';
import { cn } from '../../../../lib/utils';
import type { CalendarEvent } from '../../../../hooks/useEvents';
import type { Reminder } from '../../../../types/reminders';

interface GreetingWidgetProps {
  userName?: string;
  userEmail?: string;
  todayEvents: CalendarEvent[];
  todayReminders: Reminder[];
  onOpenNewEvent: () => void;
  onOpenNewReminder: () => void;
  onOpenNewNote?: () => void;
  isCompact?: boolean;
  rowSpan?: number;
}

export const GreetingWidget: React.FC<GreetingWidgetProps> = ({
  userName,
  userEmail,
  todayEvents,
  todayReminders,
  onOpenNewEvent,
  onOpenNewReminder,
  onOpenNewNote,
  isCompact = false,
  rowSpan = 3,
}) => {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(new Date());
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  const hour = now.getHours();
  let greeting = 'Buenos días';
  if (hour >= 12 && hour < 19) {
    greeting = 'Buenas tardes';
  } else if (hour >= 19 || hour < 6) {
    greeting = 'Buenas noches';
  }

  const displayName = userName?.trim() || userEmail?.split('@')[0] || 'Usuario';

  const formattedDate = new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(now);

  const activeReminders = todayReminders.filter((r) => r.status !== 'completed');
  const highPriorityCount = activeReminders.filter(
    (r) => r.priority === 3 || r.control_level === 'critical'
  ).length;

  const isUltraCompact = rowSpan <= 2 && !isCompact;

  return (
    <section className="h-full flex flex-col justify-center min-h-0">
      <div
        className={cn(
          'flex justify-between gap-4 min-h-0',
          isCompact ? 'flex-col items-start' : 'flex-row items-center'
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-accent capitalize flex items-center gap-1.5 truncate">
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{formattedDate}</span>
            </span>
          </div>

          <h2
            className={cn(
              'font-bold text-veyra-text tracking-tight truncate leading-tight',
              isUltraCompact ? 'text-lg sm:text-xl' : 'text-xl sm:text-2xl'
            )}
          >
            {greeting}, <span className="text-accent">{displayName}</span>
          </h2>

          <div className="text-xs text-veyra-muted mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <strong className="text-veyra-text font-semibold">{todayEvents.length}</strong>
              <span>{todayEvents.length === 1 ? 'evento' : 'eventos'}</span>
            </span>

            <span className="text-veyra-subtle">·</span>

            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <strong className="text-veyra-text font-semibold">{activeReminders.length}</strong>
              <span>{activeReminders.length === 1 ? 'tarea' : 'tareas'}</span>
            </span>

            {highPriorityCount > 0 && (
              <>
                <span className="text-veyra-subtle">·</span>
                <span className="inline-flex items-center gap-1 text-rose-400 font-medium">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {highPriorityCount} {highPriorityCount === 1 ? 'urgente' : 'urgentes'}
                  </span>
                </span>
              </>
            )}
          </div>
        </div>

        {/* Flat quick actions */}
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
          <button
            type="button"
            onClick={onOpenNewEvent}
            title="Programar nuevo evento"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold hover:bg-accent/90 transition-colors cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            <span>Evento</span>
          </button>

          <button
            type="button"
            onClick={onOpenNewReminder}
            title="Crear nuevo recordatorio"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-veyra-elevated/60 hover:bg-veyra-elevated border border-transparent hover:border-veyra-border text-veyra-text text-xs font-medium transition-colors cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5 text-accent shrink-0" />
            <span>Recordatorio</span>
          </button>

          {onOpenNewNote && (
            <button
              type="button"
              onClick={onOpenNewNote}
              title="Crear nueva nota rápida"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-veyra-elevated/60 hover:bg-veyra-elevated border border-transparent hover:border-veyra-border text-veyra-muted hover:text-veyra-text text-xs font-medium transition-colors cursor-pointer shrink-0"
            >
              <FileText className="w-3.5 h-3.5 shrink-0" />
              {!isCompact && <span>Nota</span>}
            </button>
          )}
        </div>
      </div>
    </section>
  );
};
