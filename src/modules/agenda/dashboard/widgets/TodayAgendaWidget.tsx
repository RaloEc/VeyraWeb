import React, { useMemo } from 'react';
import { Calendar, ArrowRight, CheckCircle2, Circle } from 'lucide-react';
import type { CalendarEvent } from '../../../../hooks/useEvents';
import type { Reminder } from '../../../../types/reminders';
import { WidgetCard } from '../WidgetCard';

interface TodayAgendaWidgetProps {
  todayEvents: CalendarEvent[];
  todayReminders: Reminder[];
  onSelectEvent: (eventId: string) => void;
  onSelectReminder: (reminderId: string) => void;
  onOpenFullCalendar: () => void;
}

type TodayItem =
  | { kind: 'event'; timeMs: number; data: CalendarEvent }
  | { kind: 'reminder'; timeMs: number; data: Reminder };

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function getEventModalityLabel(event: CalendarEvent): string | null {
  if (event.is_all_day) return 'Todo el día';
  const loc = event.location?.trim();
  if (!loc) return null;
  if (/^https?:\/\//i.test(loc) || /meet\.google|zoom\.us|teams\.microsoft/i.test(loc)) {
    return 'Virtual';
  }
  return loc;
}

export const TodayAgendaWidget: React.FC<TodayAgendaWidgetProps> = ({
  todayEvents,
  todayReminders,
  onSelectEvent,
  onSelectReminder,
  onOpenFullCalendar,
}) => {
  const items = useMemo<TodayItem[]>(() => {
    const list: TodayItem[] = [];

    todayEvents.forEach((ev) => {
      list.push({
        kind: 'event',
        timeMs: Number(ev.start_time_ms) || 0,
        data: ev,
      });
    });

    todayReminders
      .filter((r) => r.status !== 'completed')
      .forEach((rem) => {
        list.push({
          kind: 'reminder',
          timeMs: Number(rem.due_date_ms) || 0,
          data: rem,
        });
      });

    return list.sort((a, b) => a.timeMs - b.timeMs);
  }, [todayEvents, todayReminders]);

  return (
    <WidgetCard
      title="Hoy"
      subtitle={`${items.length} ${items.length === 1 ? 'actividad' : 'actividades'}`}
      icon={<Calendar className="w-4 h-4" />}
      iconClassName="text-veyra-muted"
      footer={
        <button
          type="button"
          onClick={onOpenFullCalendar}
          className="inline-flex items-center gap-1 text-xs font-medium text-veyra-muted hover:text-accent transition-colors cursor-pointer"
        >
          <span>Ver agenda completa</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      }
    >
      {items.length === 0 ? (
        <div className="py-6 flex flex-col items-center justify-center text-center">
          <CheckCircle2 className="w-5 h-5 text-veyra-subtle mb-2 opacity-70" />
          <p className="text-xs font-medium text-veyra-text">Día despejado</p>
          <p className="text-[11px] text-veyra-muted mt-0.5">
            No tienes eventos ni tareas pendientes para hoy.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5 overflow-y-auto max-h-[260px] custom-scrollbar -mx-1 px-1">
          {items.map((item) => {
            if (item.kind === 'event') {
              const ev = item.data;
              const timeStr = ev.is_all_day ? 'Todo el día' : formatTime(ev.start_time_ms);
              const modality = getEventModalityLabel(ev);

              return (
                <button
                  key={`ev-${ev.id}`}
                  type="button"
                  onClick={() => onSelectEvent(ev.id)}
                  className="w-full text-left group flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-veyra-hover transition-colors cursor-pointer min-w-0"
                >
                  <span
                    className="w-1 h-7 rounded-full shrink-0"
                    style={{ backgroundColor: ev.color || 'var(--accent-primary)' }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-veyra-text truncate group-hover:text-accent transition-colors">
                      {ev.title}
                    </p>
                    <p className="text-[11px] text-veyra-muted truncate mt-0.5">
                      <span className="font-mono">{timeStr}</span>
                      {modality && modality !== 'Todo el día' && (
                        <>
                          <span> · </span>
                          <span>{modality}</span>
                        </>
                      )}
                    </p>
                  </div>
                </button>
              );
            }

            const rem = item.data;
            const timeStr = rem.due_date_ms ? formatTime(rem.due_date_ms) : 'Hoy';

            return (
              <button
                key={`rem-${rem.id}`}
                type="button"
                onClick={() => onSelectReminder(rem.id)}
                className="w-full text-left group flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-veyra-hover transition-colors cursor-pointer min-w-0"
              >
                <Circle className="w-3.5 h-3.5 text-veyra-subtle group-hover:text-accent shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-veyra-text truncate group-hover:text-accent transition-colors">
                    {rem.title}
                  </p>
                  <p className="text-[11px] text-veyra-muted truncate mt-0.5">
                    <span className="font-mono">{timeStr}</span>
                    <span> · Tarea</span>
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </WidgetCard>
  );
};
