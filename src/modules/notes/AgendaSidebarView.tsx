import React, { useState, useMemo } from 'react';
import {
  Calendar,
  CheckCircle2,
  Clock,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Layers,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import type { Reminder, ReminderPriority, ReminderControlLevel } from '../../types/reminders';
import type { CalendarEvent } from '../../hooks/useEvents';
import type { Note } from '../../types/notes';
import { useReminders } from '../../hooks/useReminders';
import { useEvents } from '../../hooks/useEvents';
import { ReminderCard } from '../reminders/ReminderCard';
import { EventCard } from '../reminders/EventCard';
import { AgendaQuickPreview } from '../agenda/AgendaQuickPreview';
import { ReminderModal } from '../reminders/ReminderModal';
import { EventModal } from '../agenda/EventModal';
import { parseRecurrenceRule } from '../../services/recurrence/recurrenceEngine';

export type AgendaFilter = 'all' | 'reminders' | 'events';

type UnifiedAgendaItem =
  | { type: 'reminder'; data: Reminder; timeMs: number }
  | { type: 'event'; data: CalendarEvent; timeMs: number };

function getUpcomingItemDayKey(item: UnifiedAgendaItem): string {
  if (
    item.type === 'event' &&
    item.data.is_all_day &&
    item.data.all_day_date &&
    /^\d{4}-\d{2}-\d{2}$/.test(item.data.all_day_date)
  ) {
    return item.data.all_day_date;
  }
  const d = new Date(item.timeMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatUpcomingDayLabel(dayKey: string): string {
  const [yStr, mStr, dStr] = dayKey.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return dayKey;
  }

  const target = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayDiff = Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));

  const includeYear = y !== now.getFullYear();
  const shortDate = target
    .toLocaleDateString('es-ES', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      ...(includeYear ? { year: 'numeric' } : {}),
    })
    .replace(/\./g, '');

  if (dayDiff === 1) {
    return `Mañana · ${shortDate}`;
  }
  return shortDate;
}

export interface AgendaSidebarViewProps {
  remindersHook?: ReturnType<typeof useReminders>;
  eventsHook?: ReturnType<typeof useEvents>;
  allNotes: Note[];
  onSelectNote: (noteId: string) => void;
  selectedNoteId: string | null;
  selectedEventId?: string | null;
  onSelectEvent?: (eventId: string) => void;
  selectedReminderId?: string | null;
  onSelectReminder?: (reminderId: string) => void;
  onOpenCalendar?: () => void;
  isCalendarOpen?: boolean;
  userId?: string;
}

export const AgendaSidebarView: React.FC<AgendaSidebarViewProps> = ({
  remindersHook,
  eventsHook,
  allNotes,
  onSelectNote,
  selectedNoteId,
  selectedEventId,
  onSelectEvent,
  selectedReminderId,
  onSelectReminder,
  onOpenCalendar: _onOpenCalendar,
  isCalendarOpen: _isCalendarOpen,
  userId: _userId,
}) => {
  const [filter, setFilter] = useState<AgendaFilter>('all');
  const [showCompleted, setShowCompleted] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);

  // Quick preview popover state when viewing a note
  const [previewItem, setPreviewItem] = useState<{
    type: 'reminder' | 'event';
    id: string;
    targetRect: DOMRect;
    data?: Reminder | CalendarEvent;
  } | null>(null);

  const isViewingNote = Boolean(selectedNoteId);

  // Modals for creating / editing items
  const [isReminderModalOpen, setIsReminderModalOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);

  // Real Database Reminders & Events
  const reminders = remindersHook?.reminders || [];
  const todayReminders = remindersHook?.todayReminders || [];
  const upcomingReminders = remindersHook?.upcomingReminders || [];
  const completedReminders = remindersHook?.completedReminders || [];

  const events = eventsHook?.events || [];
  const todayEvents = eventsHook?.todayEvents || [];
  const upcomingEvents = eventsHook?.upcomingEvents || [];
  const pastEvents = eventsHook?.pastEvents || [];

  // Handlers for Saving
  const handleSaveReminder = async (payload: {
    id?: string;
    title: string;
    description?: string;
    due_date_ms: number;
    priority?: ReminderPriority;
    control_level?: ReminderControlLevel;
    subtasks?: any[];
    repeat_rule?: string | null;
    attachments?: string | null;
    links?: string | null;
    event_id?: string | null;
    offset_minutes?: number | null;
  }) => {
    if (payload.id) {
      await remindersHook?.updateReminder(payload.id, {
        title: payload.title,
        description: payload.description,
        due_date_ms: payload.due_date_ms,
        priority: payload.priority,
        control_level: payload.control_level,
        subtasks: payload.subtasks,
        repeat_rule: payload.repeat_rule,
        attachments: payload.attachments,
        links: payload.links,
        event_id: payload.event_id,
        offset_minutes: payload.offset_minutes,
      });
    } else {
      return await remindersHook?.createReminder({
        title: payload.title,
        description: payload.description,
        due_date_ms: payload.due_date_ms,
        priority: payload.priority,
        control_level: payload.control_level,
        subtasks: payload.subtasks,
        repeat_rule: payload.repeat_rule,
        attachments: payload.attachments,
        links: payload.links,
        event_id: payload.event_id,
        offset_minutes: payload.offset_minutes,
      });
    }
  };

  const handleSaveEvent = async (payload: {
    id?: string;
    title: string;
    description?: string;
    start_time_ms: number;
    end_time_ms: number;
    location?: string;
    color?: string;
    is_all_day?: boolean;
    all_day_date?: string | null;
    timezone?: string;
    tags?: string[] | null;
    repeat_rule?: string | null;
    recurrence_rule?: string | null;
    is_birthday_like?: boolean;
    notification_offset_min?: number | null;
    notification_offsets?: string | null;
    note_id?: string | null;
    attachments?: string | null;
  }) => {
    if (payload.id) {
      await eventsHook?.updateEvent(payload.id, {
        title: payload.title,
        description: payload.description,
        start_time_ms: payload.start_time_ms,
        end_time_ms: payload.end_time_ms,
        location: payload.location,
        color: payload.color,
        is_all_day: payload.is_all_day,
        all_day_date: payload.all_day_date,
        timezone: payload.timezone,
        tags: payload.tags,
        repeat_rule: payload.repeat_rule,
        recurrence_rule: payload.recurrence_rule,
        is_birthday_like: Boolean(payload.is_birthday_like),
        notification_offset_min: payload.notification_offset_min,
        notification_offsets: payload.notification_offsets,
        note_id: payload.note_id,
        attachments: payload.attachments,
      });
    } else {
      return await eventsHook?.createEvent({
        title: payload.title,
        description: payload.description,
        start_time_ms: payload.start_time_ms,
        end_time_ms: payload.end_time_ms,
        location: payload.location,
        color: payload.color,
        is_all_day: payload.is_all_day,
        all_day_date: payload.all_day_date,
        timezone: payload.timezone,
        tags: payload.tags,
        repeat_rule: payload.repeat_rule,
        recurrence_rule: payload.recurrence_rule,
        is_birthday_like: payload.is_birthday_like,
        notification_offset_min: payload.notification_offset_min,
        notification_offsets: payload.notification_offsets,
        note_id: payload.note_id,
        attachments: payload.attachments,
      });
    }
  };

  // Helper to find linked note for a reminder
  const getLinkedNote = (reminder: Reminder): Note | undefined => {
    if (reminder.links) {
      try {
        const parsed = JSON.parse(reminder.links);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const match = allNotes.find((n) => parsed.includes(n.id) || parsed.includes(n.title));
          if (match) return match;
        }
      } catch {
        // ignore
      }
    }
    // Match by title mentioned in reminder
    const found = allNotes.find(
      (n) =>
        n.title &&
        n.title.length > 3 &&
        (reminder.title.toLowerCase().includes(n.title.toLowerCase()) ||
          (reminder.description && reminder.description.toLowerCase().includes(n.title.toLowerCase())))
    );
    return found;
  };

  // Helper to find linked note for an event
  const getEventLinkedNote = (event: CalendarEvent): Note | undefined => {
    if (event.note_id) {
      return allNotes.find((n) => n.id === event.note_id);
    }
    return undefined;
  };

  // Filter counts calculation based strictly on Supabase data
  const counts = useMemo(() => {
    const activeRemindersCount = reminders.filter((r) => r.status !== 'completed').length;
    const eventsCount = events.length;

    return {
      all: activeRemindersCount + eventsCount,
      reminders: activeRemindersCount,
      events: eventsCount,
    };
  }, [reminders, events]);

  // Action: Marcar todo completado
  const handleMarkAllCompleted = () => {
    if (!remindersHook) return;
    todayReminders.forEach((r) => {
      if (r.status !== 'completed') {
        remindersHook.toggleReminder(r.id, r.status);
      }
    });
  };

  // Action: Sincronizar
  const handleSync = async () => {
    setIsSyncing(true);
    setSyncSuccess(false);
    try {
      await Promise.all([
        remindersHook?.refresh ? remindersHook.refresh() : Promise.resolve(),
        eventsHook?.refresh ? eventsHook.refresh() : Promise.resolve(),
      ]);
      setSyncSuccess(true);
      setTimeout(() => setSyncSuccess(false), 2000);
    } catch (err) {
      console.error('[Agenda] Sync error:', err);
    } finally {
      setIsSyncing(false);
    }
  };



  // Unified Today Items (Reminders + Events sorted chronologically)
  const displayedTodayUnified = useMemo(() => {
    const list: Array<
      | { type: 'reminder'; data: Reminder; timeMs: number }
      | { type: 'event'; data: CalendarEvent; timeMs: number }
    > = [];

    todayReminders.forEach((r) => {
      list.push({
        type: 'reminder',
        data: r,
        timeMs: r.due_date_ms || 0,
      });
    });

    todayEvents.forEach((e) => {
      list.push({
        type: 'event',
        data: e,
        timeMs: e.start_time_ms || 0,
      });
    });

    return list.sort((a, b) => a.timeMs - b.timeMs);
  }, [todayReminders, todayEvents]);

  // Unified Upcoming Items (Reminders + Events sorted chronologically)
  const displayedUpcomingUnified = useMemo(() => {
    const list: UnifiedAgendaItem[] = [];

    upcomingReminders.forEach((r) => {
      list.push({
        type: 'reminder',
        data: r,
        timeMs: r.due_date_ms || 0,
      });
    });

    upcomingEvents.forEach((e) => {
      list.push({
        type: 'event',
        data: e,
        timeMs: e.start_time_ms || 0,
      });
    });

    return list.sort((a, b) => a.timeMs - b.timeMs);
  }, [upcomingReminders, upcomingEvents]);

  // Group Upcoming Items by day for per-day separators in "Todo" tab
  const upcomingUnifiedByDay = useMemo(() => {
    const groupsMap = new Map<string, UnifiedAgendaItem[]>();

    for (const item of displayedUpcomingUnified) {
      const key = getUpcomingItemDayKey(item);
      const bucket = groupsMap.get(key);
      if (bucket) {
        bucket.push(item);
      } else {
        groupsMap.set(key, [item]);
      }
    }

    return Array.from(groupsMap.entries())
      .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
      .map(([dayKey, items]) => ({
        dayKey,
        label: formatUpcomingDayLabel(dayKey),
        items,
      }));
  }, [displayedUpcomingUnified]);

  // Handlers for single-click (preview if viewing note) vs double-click (always full view)
  const handleReminderClick = (reminder: Reminder, e?: React.MouseEvent) => {
    if (isViewingNote && e) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setPreviewItem({ type: 'reminder', id: reminder.id, targetRect: rect, data: reminder });
    } else {
      onSelectReminder?.(reminder.id);
    }
  };

  const handleReminderDoubleClick = (reminder: Reminder) => {
    setPreviewItem(null);
    onSelectReminder?.(reminder.id);
  };

  const handleEventClick = (event: CalendarEvent) => {
    setPreviewItem(null);
    onSelectEvent?.(event.id);
  };

  const handleEventDoubleClick = (event: CalendarEvent) => {
    setPreviewItem(null);
    onSelectEvent?.(event.id);
  };

  // Preview object lookup
  const previewObject = useMemo(() => {
    if (!previewItem) return null;
    if (previewItem.data) {
      return previewItem.type === 'reminder'
        ? { type: 'reminder' as const, data: previewItem.data as Reminder }
        : { type: 'event' as const, data: previewItem.data as CalendarEvent };
    }
    if (previewItem.type === 'reminder') {
      const found = reminders.find((r) => r.id === previewItem.id);
      return found ? { type: 'reminder' as const, data: found } : null;
    } else {
      const found = events.find((e) => e.id === previewItem.id);
      return found ? { type: 'event' as const, data: found } : null;
    }
  }, [previewItem, reminders, events]);

  // Render a reminder card using the exact mobile Veyra ReminderCard
  const renderReminderItem = (reminder: Reminder) => {
    const linkedNote = getLinkedNote(reminder);
    const linkedEvent = events.find((e) => e.id === reminder.event_id);
    return (
      <ReminderCard
        key={`${reminder.id}-${reminder.due_date_ms}`}
        reminder={reminder}
        onToggle={(id, status) => remindersHook?.toggleReminder(id, status)}
        onToggleSubtask={(rid, stid) => remindersHook?.toggleSubtask(rid, stid)}
        onEdit={(r, e) => handleReminderClick(r, e)}
        onDoubleClick={(r) => handleReminderDoubleClick(r)}
        onDelete={(id) => remindersHook?.deleteReminder(id)}
        onSnooze={(id) => {
          remindersHook?.updateReminder(id, {
            due_date_ms: reminder.due_date_ms + 24 * 60 * 60 * 1000,
          });
        }}
        onSelectNote={onSelectNote}
        linkedNoteTitle={linkedNote?.title || undefined}
        linkedNoteId={linkedNote?.id}
        linkedEventTitle={linkedEvent?.title}
        linkedEventColor={linkedEvent?.color || undefined}
        linkedEventId={linkedEvent?.id}
        onSelectEvent={onSelectEvent}
        isSelected={selectedReminderId === reminder.id}
      />
    );
  };

  // Render an event card using the exact mobile Veyra EventCard
  const renderEventItem = (event: CalendarEvent) => {
    const linkedNote = getEventLinkedNote(event);
    return (
      <EventCard
        key={`${event.id}-${event.start_time_ms}`}
        event={event}
        onEdit={(ev) => handleEventClick(ev)}
        onDoubleClick={(ev) => handleEventDoubleClick(ev)}
        onDelete={(id) => eventsHook?.deleteEvent(id)}
        onSnooze={(id) => {
          const current = events.find((e) => e.id === id);
          if (!current) return;
          const isRec =
            parseRecurrenceRule(current.recurrence_rule || current.repeat_rule).type !== 'none';
          if (isRec) return;
          const oneDayMs = 24 * 60 * 60 * 1000;
          eventsHook?.updateEvent(id, {
            start_time_ms: current.start_time_ms + oneDayMs,
            end_time_ms: current.end_time_ms + oneDayMs,
          });
        }}
        onSelectNote={onSelectNote}
        linkedNoteTitle={linkedNote?.title || undefined}
        isSelected={selectedEventId === event.id}
      />
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden text-xs">
      {/* 1. Filtros rápidos: Selector compacto [Todo | Tareas | Eventos] */}
      <div className="p-2 border-b border-veyra-border shrink-0 bg-veyra-canvas/40">
        <div className="grid grid-cols-3 gap-1 p-0.5 rounded-lg bg-veyra-elevated/40 border border-veyra-border text-[11px]">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={cn(
              'py-1.5 px-1 rounded-md text-center truncate font-medium transition-colors cursor-pointer flex items-center justify-center gap-1',
              filter === 'all'
                ? 'bg-accent/20 text-accent font-semibold shadow-xs border border-accent/30'
                : 'text-veyra-muted hover:text-veyra-text hover:bg-white/5'
            )}
          >
            <Layers className="w-3 h-3 shrink-0" />
            <span className="truncate">Todo ({counts.all})</span>
          </button>

          <button
            type="button"
            onClick={() => setFilter('reminders')}
            className={cn(
              'py-1.5 px-1 rounded-md text-center truncate font-medium transition-colors cursor-pointer flex items-center justify-center gap-1',
              filter === 'reminders'
                ? 'bg-accent/20 text-accent font-semibold shadow-xs border border-accent/30'
                : 'text-veyra-muted hover:text-veyra-text hover:bg-white/5'
            )}
          >
            <CheckCircle2 className="w-3 h-3 shrink-0" />
            <span className="truncate">Tareas ({counts.reminders})</span>
          </button>

          <button
            type="button"
            onClick={() => setFilter('events')}
            className={cn(
              'py-1.5 px-1 rounded-md text-center truncate font-medium transition-colors cursor-pointer flex items-center justify-center gap-1',
              filter === 'events'
                ? 'bg-accent/20 text-accent font-semibold shadow-xs border border-accent/30'
                : 'text-veyra-muted hover:text-veyra-text hover:bg-white/5'
            )}
          >
            <Calendar className="w-3 h-3 shrink-0" />
            <span className="truncate">Eventos ({counts.events})</span>
          </button>
        </div>
      </div>

      {/* 2. Contenido: Todo, Recordatorios o Eventos */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {filter === 'all' ? (
          /* VISTA UNIFICADA (TODO) */
          <>
            {counts.all === 0 && completedReminders.length === 0 ? (
              <div className="p-5 rounded-lg bg-veyra-elevated/20 border border-veyra-border text-center text-veyra-subtle text-xs flex flex-col items-center gap-2">
                <Layers className="w-6 h-6 text-accent/40" />
                <span>No hay eventos ni tareas registrados en la agenda.</span>
                <button
                  type="button"
                  onClick={() => {
                    setEditingReminder(null);
                    setIsReminderModalOpen(true);
                  }}
                  className="mt-1 px-3 py-1 rounded-md bg-accent text-white text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer"
                >
                  + Crear actividad
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* 1. Bloque Hoy (Eventos + Recordatorios combinados por hora) */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold tracking-wider uppercase text-accent flex items-center gap-1.5">
                      <Clock className="w-3 h-3 text-accent" />
                      HOY · {displayedTodayUnified.length} ACTIVIDADES
                    </span>
                  </div>

                  {displayedTodayUnified.length === 0 ? (
                    <div className="p-3 rounded-lg bg-veyra-elevated/20 border border-veyra-border text-center text-veyra-subtle text-xs">
                      ¡No hay actividades pendientes para hoy!
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {displayedTodayUnified.map((item) =>
                        item.type === 'reminder'
                          ? renderReminderItem(item.data)
                          : renderEventItem(item.data)
                      )}
                    </div>
                  )}
                </div>

                {/* 2. Bloques Próximos separados por día */}
                {upcomingUnifiedByDay.map((group) => (
                  <div key={group.dayKey}>
                    <div className="flex items-center gap-2 mb-2 pt-1.5">
                      <span className="text-[10px] font-bold tracking-wider uppercase text-veyra-muted flex items-center gap-1.5 shrink-0">
                        <Calendar className="w-3 h-3 text-accent shrink-0" />
                        <span>{group.label}</span>
                      </span>
                      <div className="flex-1 h-px bg-veyra-border/60" />
                      <span className="text-[10px] font-mono text-veyra-subtle shrink-0">
                        {group.items.length}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {group.items.map((item) =>
                        item.type === 'reminder'
                          ? renderReminderItem(item.data)
                          : renderEventItem(item.data)
                      )}
                    </div>
                  </div>
                ))}

                {/* 3. Bloque Eventos Registrados si no hay eventos hoy ni en próximos */}
                {todayEvents.length === 0 &&
                  upcomingEvents.length === 0 &&
                  events.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold tracking-wider uppercase text-accent flex items-center gap-1.5">
                          <Calendar className="w-3 h-3 text-accent" />
                          EVENTOS REGISTRADOS · {events.length}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {events.map(renderEventItem)}
                      </div>
                    </div>
                  )}

                {/* 4. Bloque Completados (Colapsable) */}
                {completedReminders.length > 0 && (
                  <div className="pt-2 border-t border-veyra-border/40">
                    <button
                      type="button"
                      onClick={() => setShowCompleted(!showCompleted)}
                      className="w-full flex items-center justify-between py-1 px-1.5 rounded text-[11px] font-medium text-veyra-muted hover:text-veyra-text hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        Completados ({completedReminders.length})
                      </span>
                      {showCompleted ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>

                    {showCompleted && (
                      <div className="space-y-2 mt-2">
                        {completedReminders.map(renderReminderItem)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        ) : filter === 'reminders' ? (
          /* VISTA DE RECORDATORIOS */
          <>
            {/* Bloque Hoy / Pendientes */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold tracking-wider uppercase text-veyra-muted flex items-center gap-1.5">
                  <Clock className="w-3 h-3 text-accent" />
                  HOY · {todayReminders.length} PENDIENTES
                </span>
              </div>

              {todayReminders.length === 0 ? (
                <div className="p-4 rounded-lg bg-veyra-elevated/20 border border-veyra-border text-center text-veyra-subtle text-xs">
                  ¡No hay recordatorios pendientes para hoy!
                </div>
              ) : (
                <div className="space-y-2">
                  {todayReminders.map(renderReminderItem)}
                </div>
              )}
            </div>

            {/* Bloque Próximos Días */}
            {upcomingReminders.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2 pt-1">
                  <span className="text-[10px] font-bold tracking-wider uppercase text-veyra-muted flex items-center gap-1.5">
                    <Calendar className="w-3 h-3 text-accent" />
                    PRÓXIMOS DÍAS · {upcomingReminders.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {upcomingReminders.map(renderReminderItem)}
                </div>
              </div>
            )}

            {/* Bloque Completados (Colapsable) */}
            {completedReminders.length > 0 && (
              <div className="pt-2 border-t border-veyra-border/40">
                <button
                  type="button"
                  onClick={() => setShowCompleted(!showCompleted)}
                  className="w-full flex items-center justify-between py-1 px-1.5 rounded text-[11px] font-medium text-veyra-muted hover:text-veyra-text hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    Completados ({completedReminders.length})
                  </span>
                  {showCompleted ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>

                {showCompleted && (
                  <div className="space-y-2 mt-2">
                    {completedReminders.map(renderReminderItem)}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          /* VISTA DE EVENTOS */
          <>
            {events.length === 0 ? (
              <div className="p-5 rounded-lg bg-veyra-elevated/20 border border-veyra-border text-center text-veyra-subtle text-xs flex flex-col items-center gap-2">
                <Calendar className="w-6 h-6 text-emerald-400/40" />
                <span>No hay eventos registrados en el calendario.</span>
                <button
                  type="button"
                  onClick={() => {
                    setEditingEvent(null);
                    setIsEventModalOpen(true);
                  }}
                  className="mt-1 px-3 py-1 rounded-md bg-accent text-white text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer"
                >
                  + Crear evento
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* 1. Bloque Hoy (si hay eventos programados hoy) */}
                {todayEvents.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold tracking-wider uppercase text-accent flex items-center gap-1.5">
                        <Clock className="w-3 h-3 text-accent" />
                        HOY · {todayEvents.length} EVENTOS
                      </span>
                    </div>
                    <div className="space-y-2">
                      {todayEvents.map(renderEventItem)}
                    </div>
                  </div>
                )}

                {/* 2. Bloque Próximos Eventos (si hay eventos futuros) */}
                {upcomingEvents.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2 pt-1">
                      <span className="text-[10px] font-bold tracking-wider uppercase text-accent flex items-center gap-1.5">
                        <Calendar className="w-3 h-3 text-accent" />
                        PRÓXIMOS EVENTOS · {upcomingEvents.length}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {upcomingEvents.map(renderEventItem)}
                    </div>
                  </div>
                )}

                {/* 3. Bloque Todos / Eventos Registrados si no hay hoy ni próximos */}
                {todayEvents.length === 0 && upcomingEvents.length === 0 ? (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold tracking-wider uppercase text-accent flex items-center gap-1.5">
                        <Calendar className="w-3 h-3 text-accent" />
                        EVENTOS REGISTRADOS · {events.length}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {events.map(renderEventItem)}
                    </div>
                  </div>
                ) : pastEvents.length > 0 ? (
                  <div>
                    <div className="flex items-center justify-between mb-2 pt-1">
                      <span className="text-[10px] font-bold tracking-wider uppercase text-veyra-muted flex items-center gap-1.5">
                        <Calendar className="w-3 h-3 text-veyra-subtle" />
                        EVENTOS ANTERIORES · {pastEvents.length}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {pastEvents.map(renderEventItem)}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </>
        )}
      </div>

      {/* 4. Pie del sidebar: Acceso rápido para Marcar todo completado y sincronización */}
      <div className="p-2.5 border-t border-veyra-border shrink-0 bg-veyra-card/70 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={handleMarkAllCompleted}
          disabled={todayReminders.length === 0}
          title="Marcar todas las tareas de hoy como completadas en Supabase"
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-veyra-elevated border border-veyra-border text-veyra-text hover:bg-white/5 hover:border-accent/40 transition-colors text-xs font-medium cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-accent" />
          <span>Marcar todo</span>
        </button>

        <button
          type="button"
          onClick={handleSync}
          disabled={isSyncing}
          title="Sincronizar agenda con Supabase"
          className={cn(
            'flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg border text-xs font-medium transition-colors cursor-pointer',
            syncSuccess
              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
              : 'bg-veyra-elevated border-veyra-border text-veyra-muted hover:text-veyra-text hover:bg-white/5'
          )}
        >
          <RefreshCw
            className={cn('w-3.5 h-3.5', isSyncing && 'animate-spin text-accent')}
          />
          <span>{syncSuccess ? 'Al día' : 'Sincronizar'}</span>
        </button>
      </div>

      {/* Modal de Recordatorios Completo (Congruente con Android) */}
      <ReminderModal
        isOpen={isReminderModalOpen}
        onClose={() => setIsReminderModalOpen(false)}
        reminder={editingReminder}
        events={eventsHook?.events}
        onSave={handleSaveReminder}
        onDelete={(id) => remindersHook?.deleteReminder(id)}
      />

      {/* Modal de Eventos Completo (Congruente con Android) */}
      <EventModal
        isOpen={isEventModalOpen}
        onClose={() => setIsEventModalOpen(false)}
        event={editingEvent}
        allNotes={allNotes}
        onSave={handleSaveEvent}
        onDelete={(id) => eventsHook?.deleteEvent(id)}
      />

      {/* Floating Quick Preview Tooltip when viewing a note */}
      {previewObject && previewItem && (
        <AgendaQuickPreview
          item={previewObject}
          targetRect={previewItem.targetRect}
          onClose={() => setPreviewItem(null)}
          onOpenFull={() => {
            const currentItem = previewItem;
            setPreviewItem(null);
            if (currentItem.type === 'reminder') {
              onSelectReminder?.(currentItem.id);
            } else {
              onSelectEvent?.(currentItem.id);
            }
          }}
          onToggleReminder={(id, status) => remindersHook?.toggleReminder(id, status)}
          onToggleSubtask={(rid, stid) => remindersHook?.toggleSubtask(rid, stid)}
          onSnoozeReminder={(id, minutes) => {
            const current = reminders.find((r) => r.id === id);
            if (current) {
              const currentDue = current.due_date_ms || Date.now();
              remindersHook?.updateReminder(id, {
                due_date_ms: currentDue + minutes * 60 * 1000,
              });
            }
          }}
          onSnoozeEvent={(id) => {
            const current = events.find((e) => e.id === id);
            if (current) {
              const isRec =
                parseRecurrenceRule(current.recurrence_rule || current.repeat_rule).type !== 'none';
              if (isRec) return;
              const oneDayMs = 24 * 60 * 60 * 1000;
              eventsHook?.updateEvent(id, {
                start_time_ms: current.start_time_ms + oneDayMs,
                end_time_ms: current.end_time_ms + oneDayMs,
              });
            }
          }}
          onSelectNote={onSelectNote}
          allNotes={allNotes}
        />
      )}
    </div>
  );
};
