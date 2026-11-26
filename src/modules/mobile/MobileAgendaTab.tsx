import React, { useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Clock,
  MapPin,
  Check,
  Layers,
  CheckSquare,
  Calendar as CalendarIcon,
  Sparkles,
  Plus,
  Pencil,
  FileText,
} from 'lucide-react';
import type { CalendarEvent } from '../../hooks/useEvents';
import type { Reminder } from '../../types/reminders';
import type { Note } from '../../types/notes';
import { expandOccurrences } from '../../services/recurrence/recurrenceEngine';
import { useUserSettings } from '../../context/UserSettingsContext';
import { cn, toLocalYmd } from '../../lib/utils';
import { SwipeableCard } from './SwipeableCard';

type AgendaFilter = 'all' | 'reminders' | 'events' | 'birthdays';

export interface MobileAgendaTabProps {
  events: CalendarEvent[];
  reminders: Reminder[];
  allNotes: Note[];
  onSelectEvent: (eventId: string) => void;
  onSelectReminder: (reminderId: string) => void;
  onSelectNote: (noteId: string) => void;
  onToggleReminder: (id: string, currentStatus: 'pending' | 'completed') => void;
  onDeleteReminder: (id: string) => void;
  onDeleteEvent: (id: string) => void;
  onCreateEvent: () => void;
  onCreateReminder: () => void;
}

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

function parseEventTags(tags: unknown): string[] {
  if (Array.isArray(tags)) return tags.map((t) => String(t).replace(/^#/, '').trim()).filter(Boolean);
  if (typeof tags === 'string' && tags.trim()) {
    try {
      const parsed = JSON.parse(tags);
      if (Array.isArray(parsed)) return parsed.map((t) => String(t).replace(/^#/, '').trim()).filter(Boolean);
    } catch {
      return tags.split(',').map((t) => t.replace(/^#/, '').trim()).filter(Boolean);
    }
  }
  return [];
}

function formatDaySectionTitle(ymd: string, todayYmd: string, tomorrowYmd: string): string {
  if (ymd === todayYmd) return 'HOY';
  if (ymd === tomorrowYmd) return 'Mañana';
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const formatted = date.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return formatted.replace(/\b\w/g, (l) => l.toUpperCase());
}

function formatRelativeDays(targetMs: number): string {
  const diffDays = Math.ceil((startOfDay(new Date(targetMs)).getTime() - startOfDay(new Date()).getTime()) / 86400000);
  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return '1d';
  if (diffDays > 1) return `${diffDays}d`;
  return `${Math.abs(diffDays)}d atrás`;
}

export const MobileAgendaTab: React.FC<MobileAgendaTabProps> = ({
  events,
  reminders,
  allNotes,
  onSelectEvent,
  onSelectReminder,
  onSelectNote,
  onToggleReminder,
  onDeleteReminder,
  onDeleteEvent,
  onCreateEvent,
  onCreateReminder,
}) => {
  const { settings } = useUserSettings();
  const [selectedDate, setSelectedDate] = useState<Date>(() => startOfDay(new Date()));
  const [isCalendarExpanded, setIsCalendarExpanded] = useState(false);
  const [filter, setFilter] = useState<AgendaFilter>('all');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const today = startOfDay(new Date());
  const todayYmd = toLocalYmd(today);
  const tomorrowYmd = toLocalYmd(addDays(today, 1));
  const selectedYmd = toLocalYmd(selectedDate);
  const isSelectedToday = selectedYmd === todayYmd;

  // Compact header label like "Hoy • miércoles, 25 de noviembre"
  const compactHeaderLabel = useMemo(() => {
    const dateStr = selectedDate.toLocaleDateString('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    if (isSelectedToday) return `Hoy • ${dateStr}`;
    if (selectedYmd === tomorrowYmd) return `Mañana • ${dateStr}`;
    return dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
  }, [selectedDate, isSelectedToday, selectedYmd, tomorrowYmd]);

  // Expandable month calendar days
  const calendarDays = useMemo(() => {
    const firstOfMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    const dow = firstOfMonth.getDay();
    const offset = settings.firstDayMonday ? (dow + 6) % 7 : dow;
    const start = addDays(firstOfMonth, -offset);
    const days: Date[] = [];
    for (let i = 0; i < 42; i++) days.push(addDays(start, i));
    return days;
  }, [selectedDate, settings.firstDayMonday]);

  const weekdayLabels = useMemo(
    () => (settings.firstDayMonday ? ['L', 'M', 'X', 'J', 'V', 'S', 'D'] : ['D', 'L', 'M', 'X', 'J', 'V', 'S']),
    [settings.firstDayMonday]
  );

  // Project next 14 days from selectedDate (plus month calendar dots if expanded)
  const rangeStart = isCalendarExpanded ? startOfDay(calendarDays[0]) : startOfDay(selectedDate);
  const rangeEnd = isCalendarExpanded
    ? endOfDay(calendarDays[41])
    : endOfDay(addDays(selectedDate, 14));

  const { daySections, counts, tagCounts, dotsByDate } = useMemo(() => {
    type TimelineItem =
      | { kind: 'event'; event: CalendarEvent; startMs: number; endMs: number; isAllDay: boolean; tags: string[]; linkedNoteId?: string | null }
      | { kind: 'reminder'; reminder: Reminder; timeMs: number };

    const map = new Map<string, TimelineItem[]>();
    const dots = new Map<string, { ev: boolean; rem: boolean }>();
    const tagsMap = new Map<string, number>();

    let evCount = 0;
    let remCount = 0;
    let bdayCount = 0;

    const noteByEventId = new Map<string, string>();
    for (const n of allNotes) {
      if (!n.deleted && n.event_id && !noteByEventId.has(n.event_id)) {
        noteByEventId.set(n.event_id, n.id);
      }
    }

    const timelineStartMs = startOfDay(selectedDate).getTime();
    const timelineEndMs = endOfDay(addDays(selectedDate, 14)).getTime();

    for (const ev of events) {
      if (ev.deleted === 1) continue;
      const evTags = parseEventTags(ev.tags);
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
        const ymd = occ.occurrenceDate || toLocalYmd(new Date(occ.startTimeMs));
        const dEntry = dots.get(ymd) || { ev: false, rem: false };
        dEntry.ev = true;
        dots.set(ymd, dEntry);

        if (occ.startTimeMs < timelineStartMs || occ.startTimeMs > timelineEndMs) continue;

        if (ev.is_birthday_like) bdayCount++;
        evCount++;
        for (const t of evTags) {
          tagsMap.set(t, (tagsMap.get(t) || 0) + 1);
        }

        const matchesFilter =
          filter === 'all' ||
          filter === 'events' ||
          (filter === 'birthdays' && Boolean(ev.is_birthday_like));
        const matchesTag = !selectedTag || evTags.includes(selectedTag);

        if (matchesFilter && matchesTag) {
          const list = map.get(ymd) || [];
          list.push({
            kind: 'event',
            event: ev,
            startMs: occ.startTimeMs,
            endMs: occ.endTimeMs,
            isAllDay: occ.isAllDay,
            tags: evTags,
            linkedNoteId: ev.note_id || noteByEventId.get(ev.id) || null,
          });
          map.set(ymd, list);
        }
      }
    }

    for (const rem of reminders) {
      if (rem.deleted === 1 || rem.status === 'completed') continue;
      const ms = rem.snooze_until_ms && rem.snooze_until_ms > 0 ? rem.snooze_until_ms : rem.due_date_ms;
      if (!ms) continue;
      const ymd = toLocalYmd(new Date(ms));
      const dEntry = dots.get(ymd) || { ev: false, rem: false };
      dEntry.rem = true;
      dots.set(ymd, dEntry);

      if (ms < timelineStartMs || ms > timelineEndMs) continue;
      remCount++;

      const matchesFilter = filter === 'all' || filter === 'reminders';
      if (matchesFilter && !selectedTag) {
        const list = map.get(ymd) || [];
        list.push({ kind: 'reminder', reminder: rem, timeMs: ms });
        map.set(ymd, list);
      }
    }

    // Always ensure selectedYmd exists as first section (HOY)
    if (!map.has(selectedYmd)) {
      map.set(selectedYmd, []);
    }

    const sortedKeys = Array.from(map.keys()).sort();
    const sections = sortedKeys.map((ymd) => {
      const items = map.get(ymd) || [];
      items.sort((a, b) => {
        const ta = a.kind === 'event' ? a.startMs : a.timeMs;
        const tb = b.kind === 'event' ? b.startMs : b.timeMs;
        return ta - tb;
      });
      return { ymd, items };
    });

    return {
      daySections: sections,
      counts: { all: evCount + remCount, reminders: remCount, events: evCount, birthdays: bdayCount },
      tagCounts: Array.from(tagsMap.entries()).sort((a, b) => b[1] - a[1]),
      dotsByDate: dots,
    };
  }, [events, reminders, allNotes, selectedDate, rangeStart, rangeEnd, filter, selectedTag, selectedYmd]);

  const formatTime = (ms: number) =>
    new Date(ms).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: !settings.timeFormat24h,
    });

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-y-auto pt-1 pb-28 px-4 space-y-3">
      {/* Compact Collapsible Date Row */}
      <div>
        <button
          type="button"
          onClick={() => setIsCalendarExpanded((prev) => !prev)}
          className="flex items-center gap-2 py-1 text-left cursor-pointer"
        >
          <span className="w-6 h-6 rounded-lg bg-accent/15 text-accent flex items-center justify-center shrink-0">
            <CalendarIcon className="w-3.5 h-3.5" />
          </span>
          <span className="text-xs font-semibold text-veyra-text">{compactHeaderLabel}</span>
          {isCalendarExpanded ? (
            <ChevronUp className="w-3.5 h-3.5 text-veyra-muted" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-veyra-muted" />
          )}
        </button>

        {isCalendarExpanded && (
          <div className="mt-2 rounded-2xl bg-veyra-card border border-veyra-border p-3 space-y-2 animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-veyra-text capitalize">
                {selectedDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
              </span>
              <div className="flex items-center gap-1">
                {!isSelectedToday && (
                  <button
                    type="button"
                    onClick={() => setSelectedDate(today)}
                    className="px-2 py-0.5 rounded bg-accent/15 text-accent text-[11px] font-semibold cursor-pointer mr-1"
                  >
                    Hoy
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1, 1))
                  }
                  className="p-1 rounded bg-veyra-elevated text-veyra-muted cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1))
                  }
                  className="p-1 rounded bg-veyra-elevated text-veyra-muted cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 text-center text-[10px] font-semibold text-veyra-subtle">
              {weekdayLabels.map((lbl) => (
                <span key={lbl}>{lbl}</span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-y-1">
              {calendarDays.map((day) => {
                const ymd = toLocalYmd(day);
                const isSelected = ymd === selectedYmd;
                const isTodayCell = ymd === todayYmd;
                const inMonth = day.getMonth() === selectedDate.getMonth();
                const d = dotsByDate.get(ymd);
                return (
                  <button
                    key={ymd}
                    type="button"
                    onClick={() => {
                      setSelectedDate(startOfDay(day));
                      setIsCalendarExpanded(false);
                    }}
                    className={cn(
                      'flex flex-col items-center justify-center py-1 rounded-xl text-xs cursor-pointer',
                      isSelected
                        ? 'bg-accent text-white font-bold'
                        : isTodayCell
                        ? 'bg-accent/15 text-accent font-bold'
                        : inMonth
                        ? 'text-veyra-text'
                        : 'text-veyra-subtle opacity-40'
                    )}
                  >
                    <span>{day.getDate()}</span>
                    <span className="flex gap-0.5 h-1 mt-0.5">
                      {d?.ev && <span className={cn('w-1 h-1 rounded-full', isSelected ? 'bg-white' : 'bg-blue-400')} />}
                      {d?.rem && <span className={cn('w-1 h-1 rounded-full', isSelected ? 'bg-white/80' : 'bg-emerald-400')} />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Primary Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-none py-0.5 shrink-0">
        {[
          { id: 'all' as AgendaFilter, label: 'Todo', count: counts.all, icon: Layers },
          { id: 'reminders' as AgendaFilter, label: 'Tareas', count: counts.reminders, icon: CheckSquare },
          { id: 'events' as AgendaFilter, label: 'Eventos', count: counts.events, icon: CalendarIcon },
          { id: 'birthdays' as AgendaFilter, label: 'Cumpleaños', count: counts.birthdays, icon: Sparkles },
        ].map((chip) => {
          const Icon = chip.icon;
          const active = filter === chip.id && !selectedTag;
          return (
            <button
              key={chip.id}
              type="button"
              onClick={() => {
                setFilter(chip.id);
                setSelectedTag(null);
              }}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition-colors shrink-0 cursor-pointer',
                active
                  ? 'bg-accent/10 border-accent text-veyra-text font-semibold'
                  : 'bg-veyra-card border-veyra-border text-veyra-muted'
              )}
            >
              <Icon className={cn('w-3.5 h-3.5', active ? 'text-accent' : 'text-veyra-subtle')} />
              <span>{chip.label}</span>
              <span
                className={cn(
                  'px-1.5 py-0.2 rounded-full text-[10px] font-semibold',
                  active ? 'bg-accent/20 text-accent' : 'bg-veyra-elevated text-veyra-subtle'
                )}
              >
                {chip.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tag Filter Pills */}
      {tagCounts.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none shrink-0">
          {tagCounts.map(([tag, count]) => {
            const active = selectedTag === tag;
            return (
              <button
                key={tag}
                type="button"
                onClick={() => setSelectedTag(active ? null : tag)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] border transition-colors shrink-0 cursor-pointer',
                  active
                    ? 'bg-accent/15 border-accent text-accent font-semibold'
                    : 'bg-veyra-card border-veyra-border text-veyra-muted'
                )}
              >
                <span>#{tag}</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-veyra-elevated text-veyra-subtle">
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Timeline Sections */}
      <div className="space-y-4 pt-1">
        {daySections.map(({ ymd, items }) => {
          const sectionTitle = formatDaySectionTitle(ymd, todayYmd, tomorrowYmd);
          const isTodaySection = ymd === selectedYmd;

          return (
            <section key={ymd} className="space-y-2.5">
              <div className="flex items-center justify-between px-0.5">
                <h2
                  className={cn(
                    'text-xs font-semibold',
                    isTodaySection ? 'uppercase tracking-wider text-veyra-muted' : 'text-veyra-muted'
                  )}
                >
                  {sectionTitle}
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-veyra-elevated text-[10.5px] font-semibold text-veyra-subtle">
                  {items.length}
                </span>
              </div>

              {items.length === 0 && isTodaySection ? (
                <div className="py-7 px-4 text-center space-y-3">
                  <div className="w-11 h-11 rounded-full bg-accent/10 border border-accent/20 mx-auto flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-accent" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-veyra-text">Todo despejado por hoy</p>
                    <p className="text-xs text-veyra-muted mt-0.5">
                      No tienes eventos ni recordatorios pendientes
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={onCreateReminder}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-veyra-elevated border border-veyra-border text-xs font-semibold text-veyra-text cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Recordatorio</span>
                    </button>
                    <button
                      type="button"
                      onClick={onCreateEvent}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-accent/15 border border-accent/40 text-xs font-semibold text-accent cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Evento</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {items.map((item) => {
                    if (item.kind === 'event') {
                      const ev = item.event;
                      const color = ev.color || '#60A5FA';
                      return (
                        <SwipeableCard
                          key={`${ev.id}-${item.startMs}`}
                          onTap={() => onSelectEvent(ev.id)}
                          onSwipeLeft={() => onDeleteEvent(ev.id)}
                          leftLabel="Eliminar"
                        >
                        <div
                          className="p-3.5 rounded-2xl bg-veyra-card border border-veyra-border flex items-center justify-between gap-3 cursor-pointer"
                        >
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <p className="text-sm font-semibold text-veyra-text truncate">
                              {ev.title}
                            </p>
                            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px]">
                              <span
                                className="flex items-center gap-1 font-medium shrink-0"
                                style={{ color }}
                              >
                                <CalendarIcon className="w-3 h-3" />
                                {item.isAllDay
                                  ? 'Todo el día'
                                  : `${formatTime(item.startMs)} - ${formatTime(item.endMs)}`}
                              </span>
                              {ev.location && (
                                <span className="flex items-center gap-1 text-veyra-muted truncate max-w-[160px]">
                                  <MapPin className="w-3 h-3 shrink-0" />
                                  <span className="truncate">{ev.location}</span>
                                </span>
                              )}
                              {item.linkedNoteId && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onSelectNote(item.linkedNoteId!);
                                  }}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-accent/15 text-accent font-medium text-[10px] cursor-pointer"
                                >
                                  <FileText className="w-2.5 h-2.5" />
                                  <span>Nota</span>
                                </button>
                              )}
                              {item.tags.slice(0, 2).map((t) => (
                                <span
                                  key={t}
                                  className="px-1.5 py-0.5 rounded bg-veyra-elevated text-veyra-muted text-[10px] font-medium"
                                >
                                  #{t}
                                </span>
                              ))}
                            </div>
                          </div>

                          <Pencil className="w-3.5 h-3.5 text-veyra-subtle shrink-0" />
                        </div>
                        </SwipeableCard>
                      );
                    }

                    const rem = item.reminder;
                    const isCompleted = rem.status === 'completed';
                    const isCritical = rem.control_level === 'critical' || rem.priority === 3;
                    return (
                      <SwipeableCard
                        key={rem.id}
                        onTap={() => onSelectReminder(rem.id)}
                        onSwipeRight={() =>
                          onToggleReminder(rem.id, isCompleted ? 'completed' : 'pending')
                        }
                        onSwipeLeft={() => onDeleteReminder(rem.id)}
                        rightLabel={isCompleted ? 'Pendiente' : 'Completar'}
                        leftLabel="Eliminar"
                      >
                      <div
                        className="p-3.5 rounded-2xl bg-veyra-card border border-veyra-border flex items-center gap-3 cursor-pointer"
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleReminder(rem.id, isCompleted ? 'completed' : 'pending');
                          }}
                          aria-label="Completar recordatorio"
                          className={cn(
                            'w-1.5 h-8 rounded-full shrink-0 cursor-pointer transition-colors flex items-center justify-center',
                            isCompleted
                              ? 'bg-emerald-500'
                              : isCritical
                              ? 'bg-rose-400'
                              : 'bg-veyra-subtle/50 hover:bg-accent'
                          )}
                        >
                          {isCompleted && <Check className="w-2.5 h-2.5 text-white" />}
                        </button>

                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              'text-sm font-semibold text-veyra-text truncate',
                              isCompleted && 'line-through opacity-60'
                            )}
                          >
                            {rem.title}
                          </p>
                          <p className="text-[11px] text-veyra-muted mt-0.5 flex items-center gap-1.5">
                            <Clock className="w-3 h-3" />
                            <span>{formatTime(item.timeMs)}</span>
                            <span>•</span>
                            <span>{formatRelativeDays(item.timeMs)}</span>
                          </p>
                        </div>
                      </div>
                      </SwipeableCard>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
};
