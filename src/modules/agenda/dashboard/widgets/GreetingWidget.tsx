import React, { useState, useEffect, useMemo } from 'react';
import { ArrowRight, Calendar } from 'lucide-react';
import type { CalendarEvent } from '../../../../hooks/useEvents';
import type { Reminder } from '../../../../types/reminders';

interface GreetingWidgetProps {
  userName?: string;
  userEmail?: string;
  todayEvents: CalendarEvent[];
  todayReminders: Reminder[];
  onSelectEvent?: (eventId: string) => void;
  onSelectReminder?: (reminderId: string) => void;
  onOpenFullCalendar?: () => void;
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export const GreetingWidget: React.FC<GreetingWidgetProps> = ({
  userName,
  userEmail,
  todayEvents,
  todayReminders,
  onSelectEvent,
  onSelectReminder,
  onOpenFullCalendar,
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

  const activeReminders = useMemo(
    () => todayReminders.filter((r) => r.status !== 'completed'),
    [todayReminders]
  );

  // Build unified chronological items for today's clean top strip
  const todayItems = useMemo(() => {
    const list: Array<
      | { kind: 'event'; id: string; timeMs: number; label: string; timeLabel: string; color?: string | null }
      | { kind: 'reminder'; id: string; timeMs: number; label: string; timeLabel: string; color?: string | null }
    > = [];

    todayEvents.forEach((ev) => {
      list.push({
        kind: 'event',
        id: ev.id,
        timeMs: Number(ev.start_time_ms) || 0,
        label: ev.title,
        timeLabel: ev.is_all_day ? 'todo el día' : `a las ${formatTime(ev.start_time_ms)}`,
        color: ev.color,
      });
    });

    activeReminders.forEach((rem) => {
      list.push({
        kind: 'reminder',
        id: rem.id,
        timeMs: Number(rem.due_date_ms) || 0,
        label: rem.title,
        timeLabel: rem.due_date_ms ? `a las ${formatTime(rem.due_date_ms)}` : 'hoy',
      });
    });

    return list.sort((a, b) => a.timeMs - b.timeMs);
  }, [todayEvents, activeReminders]);

  const primaryItem = todayItems[0];
  const remainingCount = todayItems.length - 1;

  return (
    <header className="flex flex-col gap-2 min-w-0">
      <p className="text-xs font-medium text-veyra-muted capitalize truncate">
        {formattedDate}
      </p>

      <h1 className="text-2xl xl:text-3xl 2xl:text-4xl font-bold text-veyra-text tracking-tight truncate leading-tight">
        {greeting}, {displayName}
      </h1>

      {/* Clean single-line "Hoy" strip */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-1 text-xs text-veyra-muted">
        {primaryItem ? (
          <button
            type="button"
            onClick={() => {
              if (primaryItem.kind === 'event') {
                onSelectEvent?.(primaryItem.id);
              } else {
                onSelectReminder?.(primaryItem.id);
              }
            }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-veyra-card/70 hover:bg-veyra-card text-veyra-text transition-colors cursor-pointer max-w-full"
          >
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: primaryItem.color || 'var(--accent-primary)' }}
            />
            <span className="truncate">
              <span className="text-veyra-muted">Hoy {primaryItem.timeLabel} · </span>
              <span className="font-medium text-veyra-text">{primaryItem.label}</span>
            </span>
            {remainingCount > 0 && (
              <span className="text-[11px] text-veyra-muted shrink-0">
                (+{remainingCount} más)
              </span>
            )}
          </button>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-veyra-muted">
            <Calendar className="w-3.5 h-3.5 text-veyra-subtle shrink-0" />
            <span>Sin eventos ni tareas pendientes hoy</span>
          </span>
        )}

        {onOpenFullCalendar && (
          <button
            type="button"
            onClick={onOpenFullCalendar}
            className="inline-flex items-center gap-1 text-xs font-medium text-veyra-muted hover:text-accent transition-colors cursor-pointer"
          >
            <span>Ver agenda</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </div>
    </header>
  );
};
