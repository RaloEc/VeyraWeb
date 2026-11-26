import React, { useState, useRef, useEffect } from 'react';
import {
  PanelLeft,
  Calendar as CalendarIcon,
  LayoutDashboard,
  Search,
  X,
  Sparkles,
} from 'lucide-react';
import type { useEvents } from '../../../hooks/useEvents';
import type { useReminders } from '../../../hooks/useReminders';
import type { Note, Folder } from '../../../types/notes';
import type { ReminderPriority, ReminderControlLevel } from '../../../types/reminders';
import type { NoteTemplate } from '../../notes/templates/templatesData';
import { GreetingWidget } from './widgets/GreetingWidget';
import { MiniCalendarWidget } from './widgets/MiniCalendarWidget';
import { QuickScratchpadWidget } from './widgets/QuickScratchpadWidget';
import { PinnedNotesWidget } from './widgets/PinnedNotesWidget';
import { FocusTimerWidget } from './widgets/FocusTimerWidget';
import { FoldersTemplatesWidget } from './widgets/FoldersTemplatesWidget';
import { SharedNotesWidget } from './widgets/SharedNotesWidget';
import { useSharedNotes } from './useSharedNotes';
import { EventModal } from '../EventModal';
import { ReminderModal } from '../../reminders/ReminderModal';
import { CreateWithVeyraAssistant } from '../../../components/common/CreateWithVeyraAssistant';

export interface AgendaDashboardViewProps {
  eventsHook?: ReturnType<typeof useEvents>;
  remindersHook?: ReturnType<typeof useReminders>;
  allNotes: Note[];
  folders: Folder[];
  userName?: string;
  userEmail?: string;
  currentUserId?: string;
  templates?: NoteTemplate[];
  onSelectEvent: (eventId: string) => void;
  onSelectReminder: (reminderId: string) => void;
  onSelectNote: (noteId: string) => void;
  onSelectFolder?: (folderId: string) => void;
  onCreateFromTemplate?: (template: NoteTemplate) => Promise<void> | void;
  onOpenGlobalSearch?: () => void;
  onCreateNote: (folderId?: string | null, eventId?: string | null, title?: string, contentJson?: string) => Promise<{ id: string } | null | void>;
  onOpenFullCalendar: () => void;
  onClose?: () => void;
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

type LayoutMode = 'wide' | 'medium' | 'compact';

export const AgendaDashboardView: React.FC<AgendaDashboardViewProps> = ({
  eventsHook,
  remindersHook,
  allNotes,
  folders,
  userName,
  userEmail,
  currentUserId,
  templates = [],
  onSelectEvent,
  onSelectReminder,
  onSelectNote,
  onSelectFolder,
  onCreateFromTemplate,
  onOpenGlobalSearch,
  onCreateNote,
  onOpenFullCalendar,
  onClose,
  isSidebarOpen,
  onToggleSidebar,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('wide');

  // Creation modals
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [isReminderModalOpen, setIsReminderModalOpen] = useState(false);
  const [isQuickAIModalOpen, setIsQuickAIModalOpen] = useState(false);

  const { sharedNotes } = useSharedNotes(currentUserId, allNotes);
  const hasSharedNotes = sharedNotes.length > 0;

  // Adapt layout to real available container width (accounts for resizable sidebar)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateMode = (width: number) => {
      if (width >= 960) {
        setLayoutMode('wide');
      } else if (width >= 640) {
        setLayoutMode('medium');
      } else {
        setLayoutMode('compact');
      }
    };

    updateMode(el.getBoundingClientRect().width);

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        updateMode(entry.contentRect.width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const events = eventsHook?.events || [];
  const todayEvents = eventsHook?.todayEvents || [];
  const todayReminders = remindersHook?.todayReminders || [];
  const allReminders = remindersHook?.reminders || [];

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
  };

  const handleSaveReminder = async (payload: {
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
  };

  const handleOpenNewNote = () => onCreateNote(null, null, 'Nota rápida');

  const greetingNode = (isCompact: boolean, rowSpan: number) => (
    <GreetingWidget
      userName={userName}
      userEmail={userEmail}
      todayEvents={todayEvents}
      todayReminders={todayReminders}
      onOpenNewEvent={() => setIsEventModalOpen(true)}
      onOpenNewReminder={() => setIsReminderModalOpen(true)}
      onOpenNewNote={handleOpenNewNote}
      isCompact={isCompact}
      rowSpan={rowSpan}
    />
  );

  const foldersTemplatesNode = (
    <FoldersTemplatesWidget
      folders={folders}
      notes={allNotes}
      events={events}
      templates={templates}
      currentUserId={currentUserId}
      onSelectFolder={(folderId) => onSelectFolder?.(folderId)}
      onSelectEvent={onSelectEvent}
      onCreateFromTemplate={async (tpl) => {
        if (onCreateFromTemplate) {
          await onCreateFromTemplate(tpl);
        }
      }}
    />
  );

  const scratchpadNode = (
    <QuickScratchpadWidget
      onCreateNote={async (title, contentHtml) => {
        const res = await onCreateNote(null, null, title, contentHtml);
        return res;
      }}
      onSelectNote={onSelectNote}
    />
  );

  const miniCalendarNode = (
    <MiniCalendarWidget
      events={events}
      reminders={allReminders}
      onOpenFullCalendar={onOpenFullCalendar}
      onSelectEvent={onSelectEvent}
      onSelectReminder={onSelectReminder}
    />
  );

  const pinnedNotesNode = (
    <PinnedNotesWidget
      notes={allNotes}
      folders={folders}
      onSelectNote={onSelectNote}
      onCreateNote={() => onCreateNote(null, null, 'Nueva nota')}
    />
  );

  const sharedNotesNode = hasSharedNotes ? (
    <SharedNotesWidget
      sharedNotes={sharedNotes}
      folders={folders}
      onSelectNote={onSelectNote}
    />
  ) : null;

  return (
    <div className="flex-1 flex flex-col h-full bg-veyra-canvas overflow-hidden">
      {/* Top Header Bar */}
      <header className="h-12 border-b border-veyra-border px-4 md:px-6 flex items-center justify-between gap-3 shrink-0 bg-veyra-canvas/90 backdrop-blur-md z-20">
        <div className="flex items-center gap-3 shrink-0">
          {onToggleSidebar && !isSidebarOpen && (
            <button
              type="button"
              onClick={onToggleSidebar}
              title="Mostrar barra lateral"
              className="p-1.5 rounded-lg text-veyra-muted hover:text-veyra-text hover:bg-veyra-elevated transition-colors cursor-pointer"
            >
              <PanelLeft className="w-4 h-4 text-accent" />
            </button>
          )}

          {/* View switcher: Dashboard vs Full Calendar */}
          <div className="flex items-center p-0.5 rounded-lg bg-veyra-elevated/60 border border-veyra-border/70 text-xs">
            <button
              type="button"
              className="flex items-center gap-1.5 px-3 py-1 rounded-md font-semibold bg-accent/15 text-accent cursor-default"
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Dashboard</span>
            </button>

            <button
              type="button"
              onClick={onOpenFullCalendar}
              className="flex items-center gap-1.5 px-3 py-1 rounded-md font-medium text-veyra-muted hover:text-veyra-text transition-colors cursor-pointer"
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Calendario Completo</span>
              <span className="sm:hidden">Calendario</span>
            </button>
          </div>
        </div>

        {/* Global Intelligent Search Trigger & Crear con Veyra */}
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => setIsQuickAIModalOpen(true)}
            title="Crear con Veyra IA (Texto, Voz o Imagen)"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent/15 border border-accent/35 hover:bg-accent/25 text-xs font-semibold text-accent transition-colors cursor-pointer shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Crear con Veyra</span>
          </button>

          {onOpenGlobalSearch && (
            <button
              type="button"
              onClick={onOpenGlobalSearch}
              title="Buscar en todo Veyra (Ctrl+K)"
              className="flex items-center justify-between gap-3 px-3 py-1.5 rounded-lg bg-veyra-elevated/50 border border-veyra-border/80 hover:bg-veyra-elevated hover:border-accent/40 text-xs text-veyra-muted hover:text-veyra-text transition-colors cursor-pointer sm:w-56 md:w-64"
            >
              <span className="flex items-center gap-2 min-w-0 truncate">
                <Search className="w-3.5 h-3.5 text-accent shrink-0" />
                <span className="truncate hidden sm:inline">Buscar en Veyra...</span>
              </span>
              <kbd className="hidden md:inline-flex items-center px-1.5 py-0.2 rounded bg-veyra-canvas border border-veyra-border text-[10px] font-mono text-veyra-subtle shrink-0">
                Ctrl K
              </kbd>
            </button>
          )}

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Cerrar"
              className="p-1.5 rounded-lg text-veyra-muted hover:text-veyra-text hover:bg-veyra-hover cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* Main Flat Editorial Workspace */}
      <main className="flex-1 overflow-y-auto px-5 py-5 md:px-8 md:py-6 custom-scrollbar">
        <div ref={containerRef} className="max-w-[1360px] mx-auto flex flex-col">
          {layoutMode === 'wide' && (
            <>
              {/* Band 1: Greeting (8) + Compact Pomodoro (4) */}
              <div className="pb-6 border-b border-veyra-border grid grid-cols-12 items-stretch">
                <div className="col-span-8 pr-6 min-w-0">
                  {greetingNode(false, 3)}
                </div>
                <div className="col-span-4 pl-6 border-l border-veyra-border min-w-0">
                  <FocusTimerWidget isCompactHeight={true} />
                </div>
              </div>

              {/* Band 2: Folders & Templates (7) + Quick Scratchpad (5) */}
              <div className="py-6 border-b border-veyra-border grid grid-cols-12">
                <div className="col-span-7 pr-6 h-[310px] min-w-0">
                  {foldersTemplatesNode}
                </div>
                <div className="col-span-5 pl-6 border-l border-veyra-border h-[310px] min-w-0">
                  {scratchpadNode}
                </div>
              </div>

              {/* Band 3: Mini Calendar + Pinned Notes (+ Shared Notes if present) */}
              <div className="pt-6 grid grid-cols-12">
                {hasSharedNotes ? (
                  <>
                    <div className="col-span-4 pr-5 h-[295px] min-w-0">
                      {miniCalendarNode}
                    </div>
                    <div className="col-span-4 px-5 border-l border-veyra-border h-[295px] min-w-0">
                      {pinnedNotesNode}
                    </div>
                    <div className="col-span-4 pl-5 border-l border-veyra-border h-[295px] min-w-0">
                      {sharedNotesNode}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="col-span-5 pr-6 h-[295px] min-w-0">
                      {miniCalendarNode}
                    </div>
                    <div className="col-span-7 pl-6 border-l border-veyra-border h-[295px] min-w-0">
                      {pinnedNotesNode}
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          {layoutMode === 'medium' && (
            <>
              <div className="pb-5 border-b border-veyra-border min-w-0">
                {greetingNode(false, 2)}
              </div>

              <div className="py-5 border-b border-veyra-border grid grid-cols-2">
                <div className="pr-5 h-[300px] min-w-0">{foldersTemplatesNode}</div>
                <div className="pl-5 border-l border-veyra-border h-[300px] min-w-0">{scratchpadNode}</div>
              </div>

              <div className="py-5 border-b border-veyra-border grid grid-cols-2">
                <div className="pr-5 h-[290px] min-w-0">{miniCalendarNode}</div>
                <div className="pl-5 border-l border-veyra-border h-[290px] min-w-0">
                  <FocusTimerWidget isCompactHeight={false} />
                </div>
              </div>

              <div className="pt-5">
                {hasSharedNotes ? (
                  <div className="grid grid-cols-2">
                    <div className="pr-5 h-[265px] min-w-0">{pinnedNotesNode}</div>
                    <div className="pl-5 border-l border-veyra-border h-[265px] min-w-0">{sharedNotesNode}</div>
                  </div>
                ) : (
                  <div className="h-[240px] min-w-0">{pinnedNotesNode}</div>
                )}
              </div>
            </>
          )}

          {layoutMode === 'compact' && (
            <div className="flex flex-col divide-y divide-veyra-border">
              <div className="pb-5 min-w-0">{greetingNode(true, 3)}</div>
              <div className="py-5 h-[320px] min-w-0">{foldersTemplatesNode}</div>
              <div className="py-5 h-[260px] min-w-0">{scratchpadNode}</div>
              <div className="py-5 h-[310px] min-w-0">{miniCalendarNode}</div>
              <div className="py-5 min-w-0">
                <FocusTimerWidget isCompactHeight={true} />
              </div>
              <div className="py-5 h-[260px] min-w-0">{pinnedNotesNode}</div>
              {hasSharedNotes && (
                <div className="pt-5 h-[260px] min-w-0">{sharedNotesNode}</div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Modals for new event & reminder */}
      <EventModal
        isOpen={isEventModalOpen}
        onClose={() => setIsEventModalOpen(false)}
        allNotes={allNotes}
        onSave={handleSaveEvent}
      />

      <ReminderModal
        isOpen={isReminderModalOpen}
        onClose={() => setIsReminderModalOpen(false)}
        events={events}
        onSave={handleSaveReminder}
      />

      {isQuickAIModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-[2px] animate-in fade-in duration-150"
            onClick={() => setIsQuickAIModalOpen(false)}
          />
          <div className="relative z-10 w-full max-w-lg rounded-[28px] bg-veyra-card border border-veyra-border shadow-2xl p-5 animate-in fade-in zoom-in-95 duration-200">
            <CreateWithVeyraAssistant
              onClose={() => setIsQuickAIModalOpen(false)}
              onManualReminder={() => setIsReminderModalOpen(true)}
              onManualEvent={() => setIsEventModalOpen(true)}
              onManualNote={handleOpenNewNote}
              onSaveReminder={async (payload) => await remindersHook?.createReminder(payload)}
              onSaveEvent={async (payload) => await eventsHook?.createEvent(payload)}
              onSaveNote={async (title, contentHtml) => {
                const created = await onCreateNote(null, null, title, contentHtml);
                if (created && typeof created === 'object' && 'id' in created && created.id) {
                  onSelectNote(created.id);
                }
              }}
              autoFocus={true}
            />
          </div>
        </div>
      )}
    </div>
  );
};
