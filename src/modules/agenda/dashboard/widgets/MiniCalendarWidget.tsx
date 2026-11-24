import React, { useState, useMemo } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { cn, toLocalYmd } from '../../../../lib/utils';
import { useUserSettings } from '../../../../context/UserSettingsContext';
import { expandOccurrences } from '../../../../services/recurrence/recurrenceEngine';
import type { CalendarEvent } from '../../../../hooks/useEvents';
import type { Reminder } from '../../../../types/reminders';
import { WidgetCard } from '../WidgetCard';

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

export const MiniCalendarWidget: React.FC<MiniCalendarWidgetProps> = ({
  events,
  reminders,
  onOpenFullCalendar,
  onSelectEvent,
  onSelectReminder,
}) => {
  const { settings } = useUserSettings();
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedYmd, setSelectedYmd] = useState(() => toLocalYmd(new Date()));

  const todayYmd = useMemo(() => toLocalYmd(new Date()), []);
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const weekdayNames = useMemo(
    () => (settings.firstDayMonday ? ['L', 'M', 'M', 'J', 'V', 'S', 'D'] : ['D', 'L', 'M', 'M', 'J', 'V', 'S']),
    [settings.firstDayMonday]
  );

  const { days, rangeStart, rangeEnd } = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const rawDow = firstDay.getDay();
    const leadingOffset = settings.firstDayMonday ? (rawDow === 0 ? 6 : rawDow - 1) : rawDow;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const totalDays = leadingOffset + daysInMonth > 35 ? 42 : 35;

    const start = new Date(year, month, 1 - leadingOffset, 0, 0, 0, 0);
    const list: Array<{ date: Date; ymd: string; isCurrentMonth: boolean }> = [];

    for (let i = 0; i < totalDays; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      list.push({
        date: d,
        ymd: toLocalYmd(d),
        isCurrentMonth: d.getMonth() === month,
      });
    }

    const lastDate = list[list.length - 1].date;
    const end = new Date(
      lastDate.getFullYear(),
      lastDate.getMonth(),
      lastDate.getDate(),
      23,
      59,
      59,
      999
    );

    return { days: list, rangeStart: start, rangeEnd: end };
  }, [year, month, settings.firstDayMonday]);

  const weekRows = days.length / 7;

  const activityMap = useMemo(() => {
    const map = new Map<string, { events: CalendarEvent[]; reminders: Reminder[] }>();

    for (const ev of events) {
      if (ev.deleted === 1) continue;
      const occs = expandOccurrences(
        {
          id: ev.id,
          start_time_ms: Number(ev.start_time_ms),
          end_time_ms: Number(ev.end_time_ms),
          repeat_rule: ev.repeat_rule,
          recurrence_rule: ev.recurrence_rule,
          timezone: ev.timezone,
          is_all_day: ev.is_all_day,
          all_day_date: ev.all_day_date,
        },
        rangeStart,
        rangeEnd
      );

      for (const occ of occs) {
        const ymd = occ.occurrenceDate || toLocalYmd(occ.startTimeMs);
        if (!ymd) continue;
        const item = map.get(ymd) || { events: [], reminders: [] };
        if (!item.events.some((existing) => existing.id === ev.id)) {
          item.events.push(ev);
        }
        map.set(ymd, item);
      }
    }

    const rStartMs = rangeStart.getTime();
    const rEndMs = rangeEnd.getTime();
    for (const r of reminders) {
      if (r.deleted === 1) continue;
      const ms = r.snooze_until_ms && r.snooze_until_ms > 0 ? r.snooze_until_ms : r.due_date_ms;
      if (!ms || ms < rStartMs || ms > rEndMs) continue;
      const ymd = toLocalYmd(ms);
      if (!ymd) continue;
      const item = map.get(ymd) || { events: [], reminders: [] };
      item.reminders.push(r);
      map.set(ymd, item);
    }

    return map;
  }, [events, reminders, rangeStart, rangeEnd]);

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleToday = () => {
    const now = new Date();
    setCurrentDate(now);
    setSelectedYmd(toLocalYmd(now));
  };

  const selectedActivity = activityMap.get(selectedYmd);
  const selectedEvents = selectedActivity?.events || [];
  const selectedReminders = selectedActivity?.reminders || [];

  const footerContent = (
    <div className="flex items-center justify-between gap-2 text-[11px] min-h-[20px]">
      {selectedEvents.length === 0 && selectedReminders.length === 0 ? (
        <span className="text-veyra-muted truncate">
          Sin actividad el {selectedYmd.split('-').reverse().slice(0, 2).join('/')}
        </span>
      ) : (
        <div className="flex items-center gap-2.5 min-w-0 flex-1 overflow-hidden">
          {selectedEvents.slice(0, 1).map((ev) => (
            <button
              key={ev.id}
              type="button"
              onClick={() => onSelectEvent?.(ev.id)}
              className="inline-flex items-center gap-1.5 text-veyra-text hover:text-blue-400 truncate max-w-[140px] text-[11px] font-medium cursor-pointer transition-colors"
              title={ev.title}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
              <span className="truncate">{ev.title}</span>
            </button>
          ))}
          {selectedReminders.slice(0, 1).map((rem) => (
            <button
              key={rem.id}
              type="button"
              onClick={() => onSelectReminder?.(rem.id)}
              className="inline-flex items-center gap-1.5 text-veyra-text hover:text-emerald-400 truncate max-w-[140px] text-[11px] font-medium cursor-pointer transition-colors"
              title={rem.title}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
              <span className="truncate">{rem.title}</span>
            </button>
          ))}
          {selectedEvents.length + selectedReminders.length > 2 && (
            <span className="text-[10.5px] text-veyra-muted shrink-0">
              +{selectedEvents.length + selectedReminders.length - 2}
            </span>
          )}
        </div>
      )}

      {onOpenFullCalendar && (
        <button
          type="button"
          onClick={onOpenFullCalendar}
          title="Abrir en calendario"
          className="text-accent hover:underline flex items-center gap-1 shrink-0 cursor-pointer text-[11px] font-medium"
        >
          <span>Ver</span>
          <ExternalLink className="w-2.5 h-2.5" />
        </button>
      )}
    </div>
  );

  return (
    <WidgetCard
      title={`${MONTH_NAMES[month]} ${year}`}
      icon={<CalendarIcon className="w-4 h-4" />}
      iconClassName="text-indigo-400"
      headerRight={
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={handleToday}
            className="text-[11px] px-2 py-0.5 rounded-md hover:bg-veyra-elevated/70 text-veyra-muted hover:text-veyra-text transition-colors cursor-pointer"
          >
            Hoy
          </button>
          <button
            type="button"
            onClick={handlePrevMonth}
            title="Mes anterior"
            className="p-1 rounded-md text-veyra-muted hover:text-veyra-text hover:bg-veyra-elevated/70 transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleNextMonth}
            title="Mes siguiente"
            className="p-1 rounded-md text-veyra-muted hover:text-veyra-text hover:bg-veyra-elevated/70 transition-colors cursor-pointer"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      }
      footer={footerContent}
    >
      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-veyra-subtle mb-1 shrink-0">
        {weekdayNames.map((w, idx) => (
          <span key={idx}>{w}</span>
        ))}
      </div>

      {/* Days grid */}
      <div
        style={{ gridTemplateRows: `repeat(${weekRows}, minmax(0, 1fr))` }}
        className="grid grid-cols-7 gap-0.5 flex-1 min-h-0"
      >
        {days.map(({ date, ymd, isCurrentMonth }) => {
          const isToday = ymd === todayYmd;
          const isSelected = ymd === selectedYmd;
          const activity = activityMap.get(ymd);
          const hasEvents = Boolean(activity && activity.events.length > 0);
          const hasReminders = Boolean(activity && activity.reminders.length > 0);

          return (
            <button
              key={ymd}
              type="button"
              onClick={() => setSelectedYmd(ymd)}
              className={cn(
                'relative flex flex-col items-center justify-center rounded-lg text-[11px] transition-colors cursor-pointer w-full h-full min-h-[22px]',
                !isCurrentMonth ? 'opacity-30 text-veyra-subtle' : 'text-veyra-text',
                isToday && !isSelected && 'ring-1 ring-accent/55 font-bold text-accent',
                isSelected ? 'bg-accent text-white font-semibold' : 'hover:bg-veyra-elevated/60'
              )}
            >
              <span className="leading-none">{date.getDate()}</span>
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
    </WidgetCard>
  );
};
