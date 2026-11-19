import React from 'react';
import { Calendar, CheckCircle2, Clock, Plus, Sparkles, AlertCircle } from 'lucide-react';
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
}

export const GreetingWidget: React.FC<GreetingWidgetProps> = ({
  userName,
  userEmail,
  todayEvents,
  todayReminders,
  onOpenNewEvent,
  onOpenNewReminder,
  onOpenNewNote,
}) => {
  const now = new Date();
  const hour = now.getHours();

  let greeting = 'Buenos días';
  if (hour >= 12 && hour < 19) {
    greeting = 'Buenas tardes';
  } else if (hour >= 19 || hour < 6) {
    greeting = 'Buenas noches';
  }

  const displayName = userName?.trim() || userEmail?.split('@')[0] || 'Usuario';

  // Format date e.g. "Miércoles, 18 de noviembre"
  const formattedDate = new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(now);

  const activeReminders = todayReminders.filter((r) => r.status !== 'completed');
  const highPriorityCount = activeReminders.filter(
    (r) => r.priority === 3 || r.control_level === 'critical'
  ).length;

  return (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-veyra-card via-veyra-card/90 to-accent/10 border border-veyra-border p-3.5 sm:p-5 shadow-xs h-full flex flex-col justify-center min-h-0">
      {/* Subtle ambient light glow */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-accent/5 rounded-full blur-3xl pointer-events-none -mr-16 -mt-16" />

      <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-3 min-h-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[11px] sm:text-xs uppercase tracking-wider font-semibold text-accent capitalize flex items-center gap-1.5 truncate">
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{formattedDate}</span>
            </span>
          </div>
          <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-veyra-text tracking-tight truncate">
            {greeting}, <span className="text-accent">{displayName}</span>
          </h2>
          <div className="text-[11px] sm:text-xs text-veyra-muted mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="flex items-center gap-1 truncate">
              <Clock className="w-3 h-3 text-blue-400 shrink-0" />
              <strong className="text-veyra-text font-medium">{todayEvents.length}</strong>
              <span className="truncate"> {todayEvents.length === 1 ? 'evento' : 'eventos'}</span>
            </span>
            <span className="text-veyra-subtle">•</span>
            <span className="flex items-center gap-1 truncate">
              <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
              <strong className="text-veyra-text font-medium">{activeReminders.length}</strong>
              <span className="truncate"> {activeReminders.length === 1 ? 'tarea' : 'tareas'}</span>
            </span>
            {highPriorityCount > 0 && (
              <>
                <span className="text-veyra-subtle">•</span>
                <span className="flex items-center gap-1 text-rose-400 font-medium truncate">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  <span>{highPriorityCount} urgentes</span>
                </span>
              </>
            )}
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap mt-1 md:mt-0">
          <button
            type="button"
            onClick={onOpenNewEvent}
            title="Programar nuevo evento"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold hover:opacity-90 transition-opacity shadow-xs cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">Evento</span>
          </button>

          <button
            type="button"
            onClick={onOpenNewReminder}
            title="Crear nuevo recordatorio"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-veyra-elevated border border-veyra-border text-veyra-text text-xs font-medium hover:border-accent/50 transition-colors shadow-xs cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5 text-accent shrink-0" />
            <span className="hidden sm:inline">Recordatorio</span>
          </button>

          {onOpenNewNote && (
            <button
              type="button"
              onClick={onOpenNewNote}
              title="Crear nueva nota rápida"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-veyra-elevated border border-veyra-border text-veyra-muted hover:text-veyra-text text-xs font-medium hover:border-accent/40 transition-colors cursor-pointer shrink-0"
            >
              <Calendar className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden md:inline">Nota</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
