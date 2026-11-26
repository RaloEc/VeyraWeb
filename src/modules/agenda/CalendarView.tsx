import React, { useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar as CalendarIcon,
  CheckCircle2,
  Clock,
  PanelLeft,
  X,
  LayoutDashboard,
} from 'lucide-react';
import type { useEvents } from '../../hooks/useEvents';
import type { useReminders } from '../../hooks/useReminders';
import type { Note } from '../../types/notes';
import { expandOccurrences } from '../../services/recurrence/recurrenceEngine';
import { useUserSettings } from '../../context/UserSettingsContext';
import { cn, toLocalYmd } from '../../lib/utils';
import { EventModal } from './EventModal';
import { ReminderModal } from '../reminders/ReminderModal';

export type CalendarViewMode = 'month' | 'week' | 'day';

export interface CalendarViewProps {
  eventsHook?: ReturnType<typeof useEvents>;
  remindersHook?: ReturnType<typeof useReminders>;
  allNotes: Note[];
  onSelectEvent?: (eventId: string) => void;
  onSelectReminder?: (reminderId: string) => void;
  onClose?: () => void;
  onOpenDashboard?: () => void;
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  hideViewSwitcher?: boolean;
}

interface CalendarOccurrenceItem {
  kind: 'event' | 'reminder';
  id: string;
  title: string;
  startMs: number;
  endMs: number;
  isAllDay: boolean;
  color: string;
  completed?: boolean;
  dateYmd: string;
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

function formatHour(hour: number, timeFormat24h: boolean): string {
  if (timeFormat24h) return `${String(hour).padStart(2, '0')}:00`;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 || 12;
  return `${h12} ${ampm}`;
}

function formatTimeMs(ms: number, timeFormat24h: boolean): string {
  const d = new Date(ms);
  return d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: !timeFormat24h,
  });
}

export const CalendarView: React.FC<CalendarViewProps> = ({
  eventsHook,
  remindersHook,
  allNotes,
  onSelectEvent,
  onSelectReminder,
  onClose,
  onOpenDashboard,
  isSidebarOpen,
  onToggleSidebar,
  hideViewSwitcher = false,
}) => {
  const { settings } = useUserSettings();
  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
  const [cursorDate, setCursorDate] = useState<Date>(() => startOfDay(new Date()));

  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [isReminderModalOpen, setIsReminderModalOpen] = useState(false);
  const [modalInitialDate, setModalInitialDate] = useState<string | undefined>(undefined);
  const [modalInitialTime, setModalInitialTime] = useState<string | undefined>(undefined);

  const events = eventsHook?.events || [];
  const reminders = remindersHook?.reminders || [];
  const todayYmd = toLocalYmd(new Date());

  const weekdayHeaders = useMemo(() => {
    const sunFirst = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const monFirst = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    return settings.firstDayMonday ? monFirst : sunFirst;
  }, [settings.firstDayMonday]);

  // Compute visible grid days and range
  const { gridDays, rangeStart, rangeEnd, headerLabel } = useMemo(() => {
    const year = cursorDate.getFullYear();
    const month = cursorDate.getMonth();

    if (viewMode === 'month') {
      const firstOfMonth = new Date(year, month, 1);
      const dayOfWeek = firstOfMonth.getDay();
      const offset = settings.firstDayMonday ? (dayOfWeek + 6) % 7 : dayOfWeek;
      const start = addDays(firstOfMonth, -offset);
      const days: Date[] = [];
      for (let i = 0; i < 42; i++) {
        days.push(addDays(start, i));
      }
      return {
        gridDays: days,
        rangeStart: startOfDay(days[0]),
        rangeEnd: endOfDay(days[41]),
        headerLabel: `${MONTH_NAMES[month]} ${year}`,
      };
    }

    if (viewMode === 'week') {
      const dow = cursorDate.getDay();
      const offset = settings.firstDayMonday ? (dow + 6) % 7 : dow;
      const weekStart = addDays(cursorDate, -offset);
      const days: Date[] = [];
      for (let i = 0; i < 7; i++) {
        days.push(addDays(weekStart, i));
      }
      const firstLabel = `${days[0].getDate()} ${MONTH_NAMES[days[0].getMonth()].slice(0, 3)}`;
      const lastLabel = `${days[6].getDate()} ${MONTH_NAMES[days[6].getMonth()].slice(0, 3)} ${days[6].getFullYear()}`;
      return {
        gridDays: days,
        rangeStart: startOfDay(days[0]),
        rangeEnd: endOfDay(days[6]),
        headerLabel: `${firstLabel} – ${lastLabel}`,
      };
    }

    return {
      gridDays: [cursorDate],
      rangeStart: startOfDay(cursorDate),
      rangeEnd: endOfDay(cursorDate),
      headerLabel: cursorDate.toLocaleDateString('es-ES', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    };
  }, [cursorDate, viewMode, settings.firstDayMonday]);

  // Project events (via expandOccurrences) and reminders into visible range
  const itemsByDate = useMemo(() => {
    const map = new Map<string, CalendarOccurrenceItem[]>();

    const pushItem = (item: CalendarOccurrenceItem) => {
      const list = map.get(item.dateYmd) || [];
      list.push(item);
      map.set(item.dateYmd, list);
    };

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
        pushItem({
          kind: 'event',
          id: ev.id,
          title: ev.title,
          startMs: occ.startTimeMs,
          endMs: occ.endTimeMs,
          isAllDay: occ.isAllDay,
          color: ev.color || '#3B82F6',
          dateYmd: occ.occurrenceDate || toLocalYmd(new Date(occ.startTimeMs)),
        });
      }
    }

    const rStartMs = rangeStart.getTime();
    const rEndMs = rangeEnd.getTime();
    for (const rem of reminders) {
      if (rem.deleted === 1) continue;
      const ms = rem.snooze_until_ms && rem.snooze_until_ms > 0 ? rem.snooze_until_ms : rem.due_date_ms;
      if (!ms || ms < rStartMs || ms > rEndMs) continue;
      const color =
        rem.control_level === 'critical' || rem.priority === 3
          ? '#EF4444'
          : '#10B981';

      pushItem({
        kind: 'reminder',
        id: rem.id,
        title: rem.title,
        startMs: ms,
        endMs: ms + 30 * 60 * 1000,
        isAllDay: false,
        color,
        completed: rem.status === 'completed',
        dateYmd: toLocalYmd(new Date(ms)),
      });
    }

    for (const [k, list] of map.entries()) {
      list.sort((a, b) => a.startMs - b.startMs);
      map.set(k, list);
    }

    return map;
  }, [events, reminders, rangeStart, rangeEnd]);

  const handlePrev = () => {
    if (viewMode === 'month') {
      setCursorDate(new Date(cursorDate.getFullYear(), cursorDate.getMonth() - 1, 1));
    } else if (viewMode === 'week') {
      setCursorDate(addDays(cursorDate, -7));
    } else {
      setCursorDate(addDays(cursorDate, -1));
    }
  };

  const handleNext = () => {
    if (viewMode === 'month') {
      setCursorDate(new Date(cursorDate.getFullYear(), cursorDate.getMonth() + 1, 1));
    } else if (viewMode === 'week') {
      setCursorDate(addDays(cursorDate, 7));
    } else {
      setCursorDate(addDays(cursorDate, 1));
    }
  };

  const openNewEventAt = (dateYmd: string, hour?: number) => {
    setModalInitialDate(dateYmd);
    setModalInitialTime(hour !== undefined ? `${String(hour).padStart(2, '0')}:00` : '09:00');
    setIsEventModalOpen(true);
  };

  const openNewReminderAt = (dateYmd: string, hour?: number) => {
    setModalInitialDate(dateYmd);
    setModalInitialTime(hour !== undefined ? `${String(hour).padStart(2, '0')}:00` : '12:00');
    setIsReminderModalOpen(true);
  };

  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div className="flex-1 flex flex-col h-full bg-veyra-canvas overflow-hidden select-none text-xs">
      {/* Top Toolbar */}
      <div className="min-h-12 py-2 border-b border-veyra-border px-3 sm:px-4 flex flex-wrap items-center justify-between gap-2 bg-veyra-card/70 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {!isSidebarOpen && onToggleSidebar && (
            <button
              type="button"
              onClick={onToggleSidebar}
              title="Mostrar barra lateral (Ctrl+\)"
              className="p-1.5 rounded-lg text-veyra-muted hover:text-veyra-text hover:bg-veyra-elevated transition-colors cursor-pointer shrink-0"
            >
              <PanelLeft className="w-4 h-4 text-accent" />
            </button>
          )}

          {/* View switcher: Dashboard vs Calendario Completo (Consistente en ambas vistas) */}
          {!hideViewSwitcher && (
            <>
              <div className="flex items-center p-0.5 rounded-lg bg-veyra-elevated border border-veyra-border text-xs shrink-0">
                <button
                  type="button"
                  onClick={onOpenDashboard}
                  title="Volver al Dashboard dinámico"
                  className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-md font-medium text-veyra-muted hover:text-veyra-text transition-colors cursor-pointer"
                >
                  <LayoutDashboard className="w-3.5 h-3.5" />
                  <span className="hidden xs:inline sm:inline">Dashboard</span>
                </button>

                <button
                  type="button"
                  className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-md font-semibold bg-accent/15 text-accent shadow-xs cursor-default"
                >
                  <CalendarIcon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Calendario Completo</span>
                  <span className="sm:hidden">Calendario</span>
                </button>
              </div>

              <div className="h-4 w-px bg-veyra-border shrink-0 hidden md:block" />
            </>
          )}

          {/* Date navigation */}
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <h2 className="text-xs sm:text-sm font-bold text-veyra-text capitalize truncate hidden sm:block">{headerLabel}</h2>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={handlePrev}
                className="p-1 rounded bg-veyra-elevated hover:bg-veyra-border text-veyra-muted hover:text-veyra-text cursor-pointer"
                title="Anterior"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setCursorDate(startOfDay(new Date()))}
                className="px-2 py-0.5 rounded bg-veyra-elevated hover:bg-veyra-border text-veyra-text font-medium text-[11px] cursor-pointer"
              >
                Hoy
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="p-1 rounded bg-veyra-elevated hover:bg-veyra-border text-veyra-muted hover:text-veyra-text cursor-pointer"
                title="Siguiente"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto shrink-0">
          <h2 className="text-xs font-bold text-veyra-text capitalize truncate sm:hidden">{headerLabel}</h2>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-auto sm:ml-0">
            {/* View mode switcher (Mes / Semana / Día) */}
            <div className="flex items-center p-0.5 rounded-lg bg-veyra-elevated border border-veyra-border">
              {(
                [
                  { id: 'month', label: 'Mes' },
                  { id: 'week', label: 'Semana' },
                  { id: 'day', label: 'Día' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setViewMode(m.id)}
                  className={cn(
                    'px-2 sm:px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer text-[11px] sm:text-xs',
                    viewMode === m.id
                      ? 'bg-accent/15 text-accent font-semibold'
                      : 'text-veyra-muted hover:text-veyra-text'
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => openNewEventAt(toLocalYmd(cursorDate))}
              title="Nuevo evento"
              className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-md bg-accent text-white font-semibold hover:opacity-90 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Evento</span>
            </button>

            <button
              type="button"
              onClick={() => openNewReminderAt(toLocalYmd(cursorDate))}
              title="Nuevo recordatorio"
              className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-veyra-elevated border border-veyra-border text-veyra-text font-medium hover:border-accent/50 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-accent" />
              <span>Recordatorio</span>
            </button>

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                title="Cerrar calendario"
                className="p-1.5 rounded text-veyra-muted hover:text-veyra-text hover:bg-white/5 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* MONTH VIEW */}
      {viewMode === 'month' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="grid grid-cols-7 border-b border-veyra-border bg-veyra-card/40 shrink-0">
            {weekdayHeaders.map((label) => (
              <div
                key={label}
                className="py-2 px-2 text-center text-[11px] font-semibold uppercase tracking-wider text-veyra-muted border-r last:border-r-0 border-veyra-border/50"
              >
                {label}
              </div>
            ))}
          </div>

          <div className="flex-1 grid grid-cols-7 grid-rows-6 overflow-y-auto">
            {gridDays.map((day) => {
              const ymd = toLocalYmd(day);
              const isCurrentMonth = day.getMonth() === cursorDate.getMonth();
              const isToday = ymd === todayYmd;
              const dayItems = itemsByDate.get(ymd) || [];
              const visibleItems = dayItems.slice(0, 3);
              const overflowCount = dayItems.length - visibleItems.length;

              return (
                <div
                  key={ymd}
                  onClick={() => openNewEventAt(ymd)}
                  className={cn(
                    'border-r border-b border-veyra-border/60 p-1 sm:p-1.5 flex flex-col gap-0.5 sm:gap-1 min-h-[64px] sm:min-h-[92px] cursor-pointer hover:bg-veyra-elevated/30 transition-colors overflow-hidden',
                    !isCurrentMonth && 'opacity-45 bg-veyra-canvas/50'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        'w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold',
                        isToday ? 'bg-accent text-white' : 'text-veyra-text'
                      )}
                    >
                      {day.getDate()}
                    </span>
                  </div>

                  <div className="space-y-0.5 overflow-hidden">
                    {visibleItems.map((item) => (
                      <button
                        key={`${item.kind}-${item.id}-${item.startMs}`}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (item.kind === 'event') onSelectEvent?.(item.id);
                          else onSelectReminder?.(item.id);
                        }}
                        className={cn(
                          'w-full text-left px-1.5 py-0.5 rounded text-[10.5px] truncate flex items-center gap-1 cursor-pointer transition-opacity hover:opacity-85',
                          item.completed && 'line-through opacity-60'
                        )}
                        style={{
                          backgroundColor: `${item.color}20`,
                          color: item.color,
                          borderLeft: `2px solid ${item.color}`,
                        }}
                      >
                        {item.kind === 'reminder' && (
                          <CheckCircle2 className="w-2.5 h-2.5 shrink-0" />
                        )}
                        <span className="truncate font-medium">
                          {!item.isAllDay ? `${formatTimeMs(item.startMs, settings.timeFormat24h)} ` : ''}
                          {item.title}
                        </span>
                      </button>
                    ))}
                    {overflowCount > 0 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCursorDate(day);
                          setViewMode('day');
                        }}
                        className="text-[10px] text-accent font-semibold px-1 hover:underline cursor-pointer"
                      >
                        +{overflowCount} más
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* WEEK VIEW */}
      {viewMode === 'week' && (
        <div className="flex-1 flex flex-col overflow-x-auto overflow-y-hidden">
          <div className="min-w-[640px] flex-1 flex flex-col overflow-hidden">
          <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-veyra-border bg-veyra-card/40 shrink-0">
            <div className="p-2 border-r border-veyra-border/50" />
            {gridDays.map((day) => {
              const ymd = toLocalYmd(day);
              const isToday = ymd === todayYmd;
              return (
                <button
                  key={ymd}
                  type="button"
                  onClick={() => {
                    setCursorDate(day);
                    setViewMode('day');
                  }}
                  className="py-2 px-1 text-center border-r last:border-r-0 border-veyra-border/50 hover:bg-white/5 cursor-pointer"
                >
                  <div className="text-[10px] uppercase text-veyra-muted">
                    {day.toLocaleDateString('es-ES', { weekday: 'short' })}
                  </div>
                  <div
                    className={cn(
                      'w-6 h-6 mx-auto mt-0.5 rounded-full flex items-center justify-center text-xs font-bold',
                      isToday ? 'bg-accent text-white' : 'text-veyra-text'
                    )}
                  >
                    {day.getDate()}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex-1 overflow-y-auto">
            {hours.map((hour) => (
              <div
                key={hour}
                className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-veyra-border/40 min-h-[48px]"
              >
                <div className="p-1.5 text-right text-[10px] text-veyra-subtle border-r border-veyra-border/50">
                  {formatHour(hour, settings.timeFormat24h)}
                </div>
                {gridDays.map((day) => {
                  const ymd = toLocalYmd(day);
                  const slotItems = (itemsByDate.get(ymd) || []).filter((it) => {
                    if (it.isAllDay) return hour === 0;
                    return new Date(it.startMs).getHours() === hour;
                  });
                  return (
                    <div
                      key={`${ymd}-${hour}`}
                      onClick={() => openNewEventAt(ymd, hour)}
                      className="p-1 border-r last:border-r-0 border-veyra-border/40 hover:bg-veyra-elevated/30 cursor-pointer space-y-1"
                    >
                      {slotItems.map((item) => (
                        <button
                          key={`${item.kind}-${item.id}-${item.startMs}`}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (item.kind === 'event') onSelectEvent?.(item.id);
                            else onSelectReminder?.(item.id);
                          }}
                          className={cn(
                            'w-full text-left px-1.5 py-0.5 rounded text-[10.5px] truncate cursor-pointer',
                            item.completed && 'line-through opacity-60'
                          )}
                          style={{
                            backgroundColor: `${item.color}22`,
                            color: item.color,
                            borderLeft: `2px solid ${item.color}`,
                          }}
                        >
                          {item.title}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          </div>
        </div>
      )}

      {/* DAY VIEW */}
      {viewMode === 'day' && (
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 max-w-3xl mx-auto w-full space-y-4">
          {(() => {
            const ymd = toLocalYmd(cursorDate);
            const dayItems = itemsByDate.get(ymd) || [];
            if (dayItems.length === 0) {
              return (
                <div className="p-8 rounded-xl border border-dashed border-veyra-border text-center space-y-3">
                  <CalendarIcon className="w-8 h-8 text-veyra-subtle mx-auto" />
                  <p className="text-sm font-medium text-veyra-text">Sin actividades para este día</p>
                  <div className="flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => openNewEventAt(ymd)}
                      className="px-3 py-1.5 rounded-md bg-accent text-white font-semibold cursor-pointer"
                    >
                      + Crear evento
                    </button>
                    <button
                      type="button"
                      onClick={() => openNewReminderAt(ymd)}
                      className="px-3 py-1.5 rounded-md bg-veyra-card border border-veyra-border text-veyra-text font-medium cursor-pointer"
                    >
                      + Crear recordatorio
                    </button>
                  </div>
                </div>
              );
            }
            return (
              <div className="space-y-2">
                {dayItems.map((item) => (
                  <div
                    key={`${item.kind}-${item.id}-${item.startMs}`}
                    onClick={() => {
                      if (item.kind === 'event') onSelectEvent?.(item.id);
                      else onSelectReminder?.(item.id);
                    }}
                    className="p-3 rounded-lg bg-veyra-card border border-veyra-border hover:border-accent/50 flex items-center justify-between gap-3 cursor-pointer transition-colors"
                    style={{ borderLeft: `3px solid ${item.color}` }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {item.kind === 'reminder' ? (
                        <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: item.color }} />
                      ) : (
                        <Clock className="w-4 h-4 shrink-0" style={{ color: item.color }} />
                      )}
                      <div className="min-w-0">
                        <p className={cn('font-semibold text-veyra-text truncate', item.completed && 'line-through opacity-60')}>
                          {item.title}
                        </p>
                        <p className="text-[11px] text-veyra-muted">
                          {item.isAllDay
                            ? 'Todo el día'
                            : `${formatTimeMs(item.startMs, settings.timeFormat24h)}`}
                          {' · '}
                          {item.kind === 'event' ? 'Evento' : 'Recordatorio'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* Creation Modals */}
      <EventModal
        isOpen={isEventModalOpen}
        onClose={() => setIsEventModalOpen(false)}
        allNotes={allNotes}
        initialDateStr={modalInitialDate}
        initialTimeStr={modalInitialTime}
        onSave={async (payload) => {
          return await eventsHook?.createEvent(payload);
        }}
      />

      <ReminderModal
        isOpen={isReminderModalOpen}
        onClose={() => setIsReminderModalOpen(false)}
        events={eventsHook?.events}
        initialDateStr={modalInitialDate}
        initialTimeStr={modalInitialTime}
        onSave={async (payload) => {
          return await remindersHook?.createReminder(payload);
        }}
      />
    </div>
  );
};
