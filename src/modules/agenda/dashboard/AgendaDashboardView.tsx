import React, { useState } from 'react';
import type { useEvents } from '../../../hooks/useEvents';
import type { useReminders } from '../../../hooks/useReminders';
import type { Note, Folder } from '../../../types/notes';
import type { ReminderPriority, ReminderControlLevel } from '../../../types/reminders';
import type { NoteTemplate } from '../../notes/templates/templatesData';
import { GreetingWidget } from './widgets/GreetingWidget';
import { QuickScratchpadWidget } from './widgets/QuickScratchpadWidget';
import { UnifiedNotesWidget } from './widgets/UnifiedNotesWidget';
import { QuickTemplatesWidget } from './widgets/QuickTemplatesWidget';
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
  onCreateNote: (
    folderId?: string | null,
    eventId?: string | null,
    title?: string,
    contentJson?: string
  ) => Promise<{ id: string } | null | void>;
  onOpenFullCalendar: () => void;
  onClose?: () => void;
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

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
  onCreateFromTemplate,
  onCreateNote,
  onOpenFullCalendar,
}) => {
  // Creation modals
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [isReminderModalOpen, setIsReminderModalOpen] = useState(false);
  const [isQuickAIModalOpen, setIsQuickAIModalOpen] = useState(false);
  const [isQuickAIExpanded, setIsQuickAIExpanded] = useState(false);

  const { sharedNotes } = useSharedNotes(currentUserId, allNotes);

  const events = eventsHook?.events || [];
  const todayEvents = eventsHook?.todayEvents || [];
  const todayReminders = remindersHook?.todayReminders || [];

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

  return (
    <div className="flex-1 flex flex-col h-full bg-veyra-canvas overflow-hidden">
      <main className="flex-1 overflow-y-auto px-6 xl:px-10 pt-8 xl:pt-12 2xl:pt-16 pb-12 custom-scrollbar">
        <div className="max-w-4xl xl:max-w-5xl 2xl:max-w-[1180px] mx-auto flex flex-col space-y-8 xl:space-y-10 2xl:space-y-12">
          {/* Header + Single-line Today Strip */}
          <GreetingWidget
            userName={userName}
            userEmail={userEmail}
            todayEvents={todayEvents}
            todayReminders={todayReminders}
            onSelectEvent={onSelectEvent}
            onSelectReminder={onSelectReminder}
            onOpenFullCalendar={onOpenFullCalendar}
          />

          {/* Quick Scratchpad (Borderless, compact & auto-growing) */}
          <QuickScratchpadWidget
            onCreateNote={async (title, contentHtml) => {
              const res = await onCreateNote(null, null, title, contentHtml);
              return res;
            }}
            onSelectNote={onSelectNote}
          />

          {/* Unified Notes (4 horizontal cards) */}
          <UnifiedNotesWidget
            notes={allNotes}
            sharedNotes={sharedNotes}
            folders={folders}
            onSelectNote={onSelectNote}
            onCreateNote={() => onCreateNote(null, null, 'Nueva nota')}
          />

          {/* Templates (Clean readable row without truncation) */}
          <QuickTemplatesWidget
            templates={templates}
            onCreateFromTemplate={async (tpl) => {
              if (onCreateFromTemplate) {
                await onCreateFromTemplate(tpl);
              }
            }}
          />
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
        <aside
          aria-label="Crear con Veyra"
          className={`fixed bottom-4 right-4 left-4 sm:left-auto z-50 sm:w-full max-h-[calc(100vh-2rem)] rounded-[24px] bg-veyra-card border border-veyra-border shadow-2xl p-5 flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-200 transition-[max-width] ease-[cubic-bezier(0.16,1,0.3,1)] ${
            isQuickAIExpanded ? 'sm:max-w-[560px]' : 'sm:max-w-[440px]'
          }`}
        >
          <CreateWithVeyraAssistant
            variant="sidebar"
            onClose={() => {
              setIsQuickAIModalOpen(false);
              setIsQuickAIExpanded(false);
            }}
            onHasProposalChange={setIsQuickAIExpanded}
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
        </aside>
      )}
    </div>
  );
};
