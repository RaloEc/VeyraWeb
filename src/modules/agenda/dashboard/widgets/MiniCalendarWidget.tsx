import React, { useState, useMemo } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { cn } from '../../../../lib/utils';
import type { CalendarEvent } from '../../../../hooks/useEvents';
import type { Reminder } from '../../../../types/reminders';

interface MiniCalendarWidgetProps {
  events: CalendarEvent[];
  reminders: Reminder[];
  onOpenFullCalendar?: () => void;
  onSelectEvent?: (eventId: string) => void;
  onSelectReminder?: (reminderId: string) => void;
}

const MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

const WEEKDAY_NAMES = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const MiniCalendarWidget: React.FC<MiniCalendarWidgetProps> = ({
  events,
  reminders,
  onOpenFullCalendar,
  onSelectEvent: _onSelectEvent,
  onSelectReminder: _onSelectReminder,
}) => {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedYmd, setSelectedYmd] = useState(() => toYmd(new Date()));

  const todayYmd = useMemo(() => toYmd(new Date()), []);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Pre-index events and reminders by YMD
  const activityMap = useMemo(() => {
    const map = new Map<string, { events: CalendarEvent[]; reminders: Reminder[] }>();

    events.forEach((e) => {
      const ymd = e.all_day_date || (e.start_time_ms ? toYmd(new Date(e.start_time_ms)) : null);
      if (ymd) {
        const item = map.get(ymd) || { events: [], reminders: [] };
        item.events.push(e);
        map.set(ymd, item);
      }
    });

    reminders.forEach((r) => {
      if (r.due_date_ms) {
        const ymd = toYmd(new Date(r.due_date_ms));
        const item = map.get(ymd) || { events: [], reminders: [] };
        item.reminders.push(r);
        map.set(ymd, item);
      }
    });

    return map;
  }, [events, reminders]);

  // Generate days grid for current month
  const days = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const startDayOfWeek = firstDay.getDay(); // 0 is Sunday
    const start = new Date(year, month, 1 - startDayOfWeek);

    const list: Array<{ date: Date; ymd: string; isCurrentMonth: boolean }> = [];
    // 35 days (5 weeks) or 42 (6 weeks) if month overflows
    const totalDays = 35;
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      list.push({
        date: d,
        ymd: toYmd(d),
        isCurrentMonth: d.getMonth() === month,
      });
    }
    return list;
  }, [year, month]);

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleToday = () => {
    const now = new Date();
    setCurrentDate(now);
    setSelectedYmd(toYmd(now));
  };

  const selectedActivity = activityMap.get(selectedYmd);
  const selectedEvents = selectedActivity?.events || [];
  const selectedReminders = selectedActivity?.reminders || [];
  const hasActivityOnSelected = selectedEvents.length > 0 || selectedReminders.length > 0;

  return (
    <div className="flex flex-col h-full rounded-xl bg-veyra-card border border-veyra-border p-3 sm:p-4 shadow-xs min-h-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-veyra-border/60 mb-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center shrink-0">
            <CalendarIcon className="w-3.5 h-3.5" />
          </div>
          <h3 className="text-xs sm:text-sm font-semibold text-veyra-text tracking-tight truncate">
            {MONTH_NAMES[month]} {year}
          </h3>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={handleToday}
            className="text-[10px] px-1.5 py-0.5 rounded bg-veyra-elevated hover:bg-veyra-border text-veyra-muted hover:text-veyra-text cursor-pointer"
          >
            Hoy
          </button>
          <button
            type="button"
            onClick={handlePrevMonth}
            title="Mes anterior"
            className="p-1 rounded text-veyra-muted hover:text-veyra-text hover:bg-veyra-elevated cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleNextMonth}
            title="Mes siguiente"
            className="p-1 rounded text-veyra-muted hover:text-veyra-text hover:bg-veyra-elevated cursor-pointer"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-veyra-subtle mb-1 shrink-0">
        {WEEKDAY_NAMES.map((w, idx) => (
          <span key={idx}>{w}</span>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 gap-0.5 sm:gap-1 flex-1 min-h-0">
        {days.map(({ date, ymd, isCurrentMonth }) => {
          const isToday = ymd === todayYmd;
          const isSelected = ymd === selectedYmd;
          const activity = activityMap.get(ymd);
          const hasEvents = activity && activity.events.length > 0;
          const hasReminders = activity && activity.reminders.length > 0;

          return (
            <button
              key={ymd}
              type="button"
              onClick={() => setSelectedYmd(ymd)}
              className={cn(
                'relative flex flex-col items-center justify-center p-0.5 rounded-md text-[11px] sm:text-xs transition-colors cursor-pointer w-full h-full min-h-[22px]',
                !isCurrentMonth ? 'opacity-30 text-veyra-subtle' : 'text-veyra-text',
                isToday && !isSelected && 'border border-accent/50 font-bold text-accent',
                isSelected ? 'bg-accent text-white font-bold shadow-xs' : 'hover:bg-veyra-elevated'
              )}
            >
              <span>{date.getDate()}</span>
              {/* Activity indicators */}
              <div className="flex items-center gap-0.5 mt-0.5 h-1">
                {hasEvents && (
                  <span
                    className={cn(
                      'w-1 h-1 rounded-full',
                      isSelected ? 'bg-white' : 'bg-blue-400'
                    )}
                  />
                )}
                {hasReminders && (
                  <span
                    className={cn(
                      'w-1 h-1 rounded-full',
                      isSelected ? 'bg-white/80' : 'bg-emerald-400'
                    )}
                  />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected day activity footer (shows if space allows) */}
      {hasActivityOnSelected && (
        <div className="mt-2 pt-1.5 border-t border-veyra-border/60 shrink-0 text-[10px] text-veyra-muted flex items-center justify-between gap-1 truncate">
          <span className="truncate">
            {selectedEvents.length} eventos, {selectedReminders.length} tareas
          </span>
          {onOpenFullCalendar && (
            <button
              type="button"
              onClick={onOpenFullCalendar}
              title="Abrir en calendario"
              className="text-accent hover:underline flex items-center gap-0.5 shrink-0 cursor-pointer"
            >
              <span>Ver</span>
              <ExternalLink className="w-2.5 h-2.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};
