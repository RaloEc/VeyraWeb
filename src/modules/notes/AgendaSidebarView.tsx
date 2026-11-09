import React, { useState, useMemo } from 'react';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Plus,
  Search,
  RefreshCw,
  X,
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

export type AgendaFilter = 'all' | 'reminders' | 'events';

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
}) => {
  const [search, setSearch] = useState('');
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

  // Modal for creating new item
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createType, setCreateType] = useState<'reminder' | 'event'>('reminder');
  const [newTitle, setNewTitle] = useState('');
  const [newTime, setNewTime] = useState('12:00');
  const [newPriority, setNewPriority] = useState<number>(2); // Media
  const [newLocation, setNewLocation] = useState('Google Meet');
  const [newLinkedNoteId, setNewLinkedNoteId] = useState<string>('');
  const [newEventColor, setNewEventColor] = useState<string>('#3B82F6');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Real Database Reminders & Events
  const reminders = remindersHook?.reminders || [];
  const todayReminders = remindersHook?.todayReminders || [];
  const upcomingReminders = remindersHook?.upcomingReminders || [];
  const completedReminders = remindersHook?.completedReminders || [];

  const events = eventsHook?.events || [];
  const todayEvents = eventsHook?.todayEvents || [];
  const upcomingEvents = eventsHook?.upcomingEvents || [];
  const pastEvents = eventsHook?.pastEvents || [];

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

  // Action: Create Reminder or Event in Supabase
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    setIsSubmitting(true);
    try {
      const now = new Date();
      const [hours, mins] = newTime.split(':').map(Number);
      const dueDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours || 12, mins || 0);

      if (createType === 'reminder') {
        if (remindersHook) {
          await remindersHook.createReminder({
            title: newTitle.trim(),
            due_date_ms: dueDate.getTime(),
            priority: newPriority as ReminderPriority,
            control_level: (newPriority === 3 ? 'critical' : newPriority === 2 ? 'strict' : 'normal') as ReminderControlLevel,
          });
        }
      } else {
        if (eventsHook) {
          await eventsHook.createEvent({
            title: newTitle.trim(),
            start_time_ms: dueDate.getTime(),
            end_time_ms: dueDate.getTime() + 60 * 60 * 1000,
            location: newLocation,
            color: newEventColor,
            note_id: newLinkedNoteId || undefined,
          });
        }
      }

      setNewTitle('');
      setIsCreateModalOpen(false);
    } catch (err) {
      console.error('[Agenda] Create error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Search filter
  const q = search.trim().toLowerCase();

  // Filtered Today items from Supabase
  const displayedTodayReminders = useMemo(() => {
    if (!q) return todayReminders;
    return todayReminders.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        (r.description && r.description.toLowerCase().includes(q))
    );
  }, [todayReminders, q]);

  const displayedUpcomingReminders = useMemo(() => {
    if (!q) return upcomingReminders;
    return upcomingReminders.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        (r.description && r.description.toLowerCase().includes(q))
    );
  }, [upcomingReminders, q]);

  const displayedCompletedReminders = useMemo(() => {
    if (!q) return completedReminders;
    return completedReminders.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        (r.description && r.description.toLowerCase().includes(q))
    );
  }, [completedReminders, q]);

  const displayedTodayEvents = useMemo(() => {
    if (!q) return todayEvents;
    return todayEvents.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        (e.location && e.location.toLowerCase().includes(q))
    );
  }, [todayEvents, q]);

  const displayedUpcomingEvents = useMemo(() => {
    if (!q) return upcomingEvents;
    return upcomingEvents.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        (e.location && e.location.toLowerCase().includes(q))
    );
  }, [upcomingEvents, q]);

  const displayedPastEvents = useMemo(() => {
    if (!q) return pastEvents;
    return pastEvents.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        (e.location && e.location.toLowerCase().includes(q))
    );
  }, [pastEvents, q]);

  const displayedAllEvents = useMemo(() => {
    if (!q) return events;
    return events.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        (e.location && e.location.toLowerCase().includes(q))
    );
  }, [events, q]);

  // Unified Today Items (Reminders + Events sorted chronologically)
  const displayedTodayUnified = useMemo(() => {
    const list: Array<
      | { type: 'reminder'; data: Reminder; timeMs: number }
      | { type: 'event'; data: CalendarEvent; timeMs: number }
    > = [];

    displayedTodayReminders.forEach((r) => {
      list.push({
        type: 'reminder',
        data: r,
        timeMs: r.due_date_ms || 0,
      });
    });

    displayedTodayEvents.forEach((e) => {
      list.push({
        type: 'event',
        data: e,
        timeMs: e.start_time_ms || 0,
      });
    });

    return list.sort((a, b) => a.timeMs - b.timeMs);
  }, [displayedTodayReminders, displayedTodayEvents]);

  // Unified Upcoming Items (Reminders + Events sorted chronologically)
  const displayedUpcomingUnified = useMemo(() => {
    const list: Array<
      | { type: 'reminder'; data: Reminder; timeMs: number }
      | { type: 'event'; data: CalendarEvent; timeMs: number }
    > = [];

    displayedUpcomingReminders.forEach((r) => {
      list.push({
        type: 'reminder',
        data: r,
        timeMs: r.due_date_ms || 0,
      });
    });

    displayedUpcomingEvents.forEach((e) => {
      list.push({
        type: 'event',
        data: e,
        timeMs: e.start_time_ms || 0,
      });
    });

    return list.sort((a, b) => a.timeMs - b.timeMs);
  }, [displayedUpcomingReminders, displayedUpcomingEvents]);

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

  const handleEventClick = (event: CalendarEvent, e?: React.MouseEvent) => {
    if (isViewingNote && e) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setPreviewItem({ type: 'event', id: event.id, targetRect: rect, data: event });
    } else {
      onSelectEvent?.(event.id);
    }
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
        onEdit={(ev, e) => handleEventClick(ev, e)}
        onDoubleClick={(ev) => handleEventDoubleClick(ev)}
        onDelete={(id) => eventsHook?.deleteEvent(id)}
        onSnooze={(id) => {
          eventsHook?.updateEvent(id, {
            start_time_ms: event.start_time_ms + 24 * 60 * 60 * 1000,
            end_time_ms: event.end_time_ms + 24 * 60 * 60 * 1000,
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
      {/* 1. Buscador y botón + Nuevo */}
      <div className="p-2.5 border-b border-veyra-border shrink-0 flex items-center gap-1.5 bg-veyra-card/50">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-veyra-subtle absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder={
              filter === 'all'
                ? 'Buscar en agenda...'
                : filter === 'reminders'
                ? 'Buscar recordatorios...'
                : 'Buscar eventos...'
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-veyra-elevated text-veyra-text placeholder:text-veyra-subtle rounded-lg pl-8 pr-7 py-1.5 text-xs border border-veyra-border focus:border-accent/60 outline-none transition-colors"
          />
          {search.trim().length > 0 && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-veyra-subtle hover:text-veyra-text p-0.5 rounded cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Compact + Nuevo Button */}
        <button
          type="button"
          onClick={() => {
            setCreateType(filter === 'events' ? 'event' : 'reminder');
            setIsCreateModalOpen(true);
          }}
          title={
            filter === 'events'
              ? 'Nuevo evento'
              : filter === 'reminders'
              ? 'Nuevo recordatorio'
              : 'Nuevo recordatorio o evento'
          }
          className="h-[30px] w-[30px] rounded-lg bg-accent text-white flex items-center justify-center hover:opacity-90 transition-opacity shadow-sm shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
        </button>
      </div>

      {/* 2. Filtros rápidos: Selector compacto [Todo | Recordatorios | Eventos] */}
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

      {/* 3. Contenido: Todo, Recordatorios o Eventos */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {filter === 'all' ? (
          /* VISTA UNIFICADA (TODO) */
          <>
            {counts.all === 0 && displayedCompletedReminders.length === 0 ? (
              <div className="p-5 rounded-lg bg-veyra-elevated/20 border border-veyra-border text-center text-veyra-subtle text-xs flex flex-col items-center gap-2">
                <Layers className="w-6 h-6 text-accent/40" />
                <span>No hay eventos ni tareas registrados en la agenda.</span>
                <button
                  type="button"
                  onClick={() => {
                    setCreateType('reminder');
                    setIsCreateModalOpen(true);
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

                {/* 2. Bloque Próximos Días (Eventos + Recordatorios futuros) */}
                {displayedUpcomingUnified.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2 pt-1">
                      <span className="text-[10px] font-bold tracking-wider uppercase text-veyra-muted flex items-center gap-1.5">
                        <Calendar className="w-3 h-3 text-accent" />
                        PRÓXIMOS DÍAS · {displayedUpcomingUnified.length}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {displayedUpcomingUnified.map((item) =>
                        item.type === 'reminder'
                          ? renderReminderItem(item.data)
                          : renderEventItem(item.data)
                      )}
                    </div>
                  </div>
                )}

                {/* 3. Bloque Eventos Registrados si no hay eventos hoy ni en próximos */}
                {displayedTodayEvents.length === 0 &&
                  displayedUpcomingEvents.length === 0 &&
                  displayedAllEvents.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold tracking-wider uppercase text-accent flex items-center gap-1.5">
                          <Calendar className="w-3 h-3 text-accent" />
                          EVENTOS REGISTRADOS · {displayedAllEvents.length}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {displayedAllEvents.map(renderEventItem)}
                      </div>
                    </div>
                  )}

                {/* 4. Bloque Completados (Colapsable) */}
                {displayedCompletedReminders.length > 0 && (
                  <div className="pt-2 border-t border-veyra-border/40">
                    <button
                      type="button"
                      onClick={() => setShowCompleted(!showCompleted)}
                      className="w-full flex items-center justify-between py-1 px-1.5 rounded text-[11px] font-medium text-veyra-muted hover:text-veyra-text hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        Completados ({displayedCompletedReminders.length})
                      </span>
                      {showCompleted ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>

                    {showCompleted && (
                      <div className="space-y-2 mt-2">
                        {displayedCompletedReminders.map(renderReminderItem)}
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
                  HOY · {displayedTodayReminders.length} PENDIENTES
                </span>
              </div>

              {displayedTodayReminders.length === 0 ? (
                <div className="p-4 rounded-lg bg-veyra-elevated/20 border border-veyra-border text-center text-veyra-subtle text-xs">
                  ¡No hay recordatorios pendientes para hoy!
                </div>
              ) : (
                <div className="space-y-2">
                  {displayedTodayReminders.map(renderReminderItem)}
                </div>
              )}
            </div>

            {/* Bloque Próximos Días */}
            {displayedUpcomingReminders.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2 pt-1">
                  <span className="text-[10px] font-bold tracking-wider uppercase text-veyra-muted flex items-center gap-1.5">
                    <Calendar className="w-3 h-3 text-accent" />
                    PRÓXIMOS DÍAS · {displayedUpcomingReminders.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {displayedUpcomingReminders.map(renderReminderItem)}
                </div>
              </div>
            )}

            {/* Bloque Completados (Colapsable) */}
            {displayedCompletedReminders.length > 0 && (
              <div className="pt-2 border-t border-veyra-border/40">
                <button
                  type="button"
                  onClick={() => setShowCompleted(!showCompleted)}
                  className="w-full flex items-center justify-between py-1 px-1.5 rounded text-[11px] font-medium text-veyra-muted hover:text-veyra-text hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    Completados ({displayedCompletedReminders.length})
                  </span>
                  {showCompleted ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>

                {showCompleted && (
                  <div className="space-y-2 mt-2">
                    {displayedCompletedReminders.map(renderReminderItem)}
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
                    setCreateType('event');
                    setIsCreateModalOpen(true);
                  }}
                  className="mt-1 px-3 py-1 rounded-md bg-accent text-white text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer"
                >
                  + Crear evento
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* 1. Bloque Hoy (si hay eventos programados hoy) */}
                {displayedTodayEvents.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold tracking-wider uppercase text-accent flex items-center gap-1.5">
                        <Clock className="w-3 h-3 text-accent" />
                        HOY · {displayedTodayEvents.length} EVENTOS
                      </span>
                    </div>
                    <div className="space-y-2">
                      {displayedTodayEvents.map(renderEventItem)}
                    </div>
                  </div>
                )}

                {/* 2. Bloque Próximos Eventos (si hay eventos futuros) */}
                {displayedUpcomingEvents.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2 pt-1">
                      <span className="text-[10px] font-bold tracking-wider uppercase text-accent flex items-center gap-1.5">
                        <Calendar className="w-3 h-3 text-accent" />
                        PRÓXIMOS EVENTOS · {displayedUpcomingEvents.length}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {displayedUpcomingEvents.map(renderEventItem)}
                    </div>
                  </div>
                )}

                {/* 3. Bloque Todos / Eventos Registrados si no hay hoy ni próximos */}
                {displayedTodayEvents.length === 0 && displayedUpcomingEvents.length === 0 ? (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold tracking-wider uppercase text-accent flex items-center gap-1.5">
                        <Calendar className="w-3 h-3 text-accent" />
                        EVENTOS REGISTRADOS · {displayedAllEvents.length}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {displayedAllEvents.map(renderEventItem)}
                    </div>
                  </div>
                ) : displayedPastEvents.length > 0 ? (
                  <div>
                    <div className="flex items-center justify-between mb-2 pt-1">
                      <span className="text-[10px] font-bold tracking-wider uppercase text-veyra-muted flex items-center gap-1.5">
                        <Calendar className="w-3 h-3 text-veyra-subtle" />
                        EVENTOS ANTERIORES · {displayedPastEvents.length}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {displayedPastEvents.map(renderEventItem)}
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

      {/* Modal / Popover de Creación Rápida */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-veyra-card border border-veyra-border rounded-xl p-5 shadow-elevated">
            <div className="flex items-center justify-between pb-3 border-b border-veyra-border mb-4">
              <h3 className="font-bold text-sm text-veyra-text">Nuevo Registro de Agenda</h3>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 rounded text-veyra-subtle hover:text-veyra-text cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-3.5">
              {/* Type selector */}
              <div className="grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-veyra-elevated border border-veyra-border text-xs">
                <button
                  type="button"
                  onClick={() => setCreateType('reminder')}
                  className={cn(
                    'py-1 rounded font-medium transition-colors cursor-pointer',
                    createType === 'reminder'
                      ? 'bg-accent/20 text-accent font-semibold'
                      : 'text-veyra-muted'
                  )}
                >
                  Recordatorio / Tarea
                </button>
                <button
                  type="button"
                  onClick={() => setCreateType('event')}
                  className={cn(
                    'py-1 rounded font-medium transition-colors cursor-pointer',
                    createType === 'event'
                      ? 'bg-emerald-500/20 text-emerald-400 font-semibold'
                      : 'text-veyra-muted'
                  )}
                >
                  Evento / Reunión
                </button>
              </div>

              {/* Title input */}
              <div>
                <label className="block text-[11px] font-medium text-veyra-muted mb-1">
                  Título
                </label>
                <input
                  type="text"
                  required
                  placeholder={
                    createType === 'reminder'
                      ? 'Ej. Enviar propuesta a Marketing'
                      : 'Ej. Sync con equipo de diseño'
                  }
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-veyra-elevated border border-veyra-border rounded-lg px-3 py-1.5 text-xs text-veyra-text placeholder:text-veyra-subtle focus:border-accent outline-none"
                />
              </div>

              {/* Time & Priority / Location */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-veyra-muted mb-1">
                    Hora
                  </label>
                  <input
                    type="time"
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    className="w-full bg-veyra-elevated border border-veyra-border rounded-lg px-2.5 py-1.5 text-xs text-veyra-text focus:border-accent outline-none font-mono"
                  />
                </div>

                {createType === 'reminder' ? (
                  <div>
                    <label className="block text-[11px] font-medium text-veyra-muted mb-1">
                      Prioridad
                    </label>
                    <select
                      value={newPriority}
                      onChange={(e) => setNewPriority(Number(e.target.value))}
                      className="w-full bg-veyra-elevated border border-veyra-border rounded-lg px-2 py-1.5 text-xs text-veyra-text focus:border-accent outline-none"
                    >
                      <option value={3}>Alta</option>
                      <option value={2}>Media</option>
                      <option value={1}>Baja</option>
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-[11px] font-medium text-veyra-muted mb-1">
                      Plataforma
                    </label>
                    <input
                      type="text"
                      value={newLocation}
                      onChange={(e) => setNewLocation(e.target.value)}
                      placeholder="Google Meet"
                      className="w-full bg-veyra-elevated border border-veyra-border rounded-lg px-2.5 py-1.5 text-xs text-veyra-text focus:border-accent outline-none"
                    />
                  </div>
                )}
              </div>

              {/* Color selector for events */}
              {createType === 'event' && (
                <div>
                  <label className="block text-[11px] font-medium text-veyra-muted mb-1.5">
                    Color de Acento del Evento
                  </label>
                  <div className="flex items-center gap-2">
                    {[
                      { label: 'Azul', value: '#3B82F6' },
                      { label: 'Esmeralda', value: '#10B981' },
                      { label: 'Violeta', value: '#8B5CF6' },
                      { label: 'Ámbar', value: '#F59E0B' },
                      { label: 'Rosa', value: '#EC4899' },
                      { label: 'Rojo', value: '#EF4444' },
                      { label: 'Cian', value: '#06B6D4' },
                    ].map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => setNewEventColor(c.value)}
                        title={c.label}
                        style={{ backgroundColor: c.value }}
                        className={cn(
                          'w-5 h-5 rounded-full transition-all cursor-pointer flex items-center justify-center shrink-0',
                          newEventColor === c.value
                            ? 'ring-2 ring-white ring-offset-2 ring-offset-[#1C1F26] scale-110'
                            : 'opacity-70 hover:opacity-100 hover:scale-105'
                        )}
                      >
                        {newEventColor === c.value && (
                          <span className="text-[10px] text-white font-bold leading-none">✓</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Link to note selector */}
              {allNotes.length > 0 && (
                <div>
                  <label className="block text-[11px] font-medium text-veyra-muted mb-1">
                    Vincular a una Nota (Opcional)
                  </label>
                  <select
                    value={newLinkedNoteId}
                    onChange={(e) => setNewLinkedNoteId(e.target.value)}
                    className="w-full bg-veyra-elevated border border-veyra-border rounded-lg px-2.5 py-1.5 text-xs text-veyra-text focus:border-accent outline-none"
                  >
                    <option value="">Sin nota vinculada</option>
                    {allNotes.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.title || 'Nota sin título'}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Actions */}
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg border border-veyra-border text-veyra-muted hover:text-veyra-text text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-3.5 py-1.5 rounded-lg bg-accent text-white font-medium hover:opacity-90 text-xs shadow-sm"
                >
                  {isSubmitting ? 'Guardando...' : 'Crear en Supabase'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
