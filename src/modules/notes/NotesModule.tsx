import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { NotesSidebar } from './NotesSidebar';
import { NoteEditor } from './NoteEditor';
import { EventDetailView } from '../agenda/EventDetailView';
import { ReminderDetailView } from '../agenda/ReminderDetailView';
import { CalendarView } from '../agenda/CalendarView';
import { AgendaDashboardView } from '../agenda/dashboard/AgendaDashboardView';
import { useNotes } from '../../hooks/useNotes';
import { useReminders } from '../../hooks/useReminders';
import { useEvents } from '../../hooks/useEvents';
import { cn } from '../../lib/utils';

export interface NotesModuleProps {
  userId: string;
  userEmail: string;
  userName?: string;
  notesHook?: ReturnType<typeof useNotes>;
  remindersHook?: ReturnType<typeof useReminders>;
  initialEventId?: string | null;
  initialReminderId?: string | null;
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  onSignOut?: () => void;
}

const MIN_SIDEBAR_WIDTH = 210;
const MAX_SIDEBAR_WIDTH = 480;
const DEFAULT_SIDEBAR_WIDTH = 245;

export const NotesModule: React.FC<NotesModuleProps> = ({
  userId,
  userEmail,
  userName,
  notesHook,
  remindersHook,
  initialEventId,
  initialReminderId,
  isSidebarOpen = true,
  onToggleSidebar,
  onSignOut,
}) => {
  const localHook = useNotes(notesHook ? undefined : userId);
  const eventsHook = useEvents(userId);
  const {
    folders,
    notes,
    allNotes,
    deletedNotes,
    selectedFolderId,
    setSelectedFolderId,
    selectedNoteId,
    setSelectedNoteId,
    selectedNote,
    createFolder,
    updateFolder,
    deleteFolder,
    moveFolder,
    createNote,
    duplicateNote,
    saveNote,
    deleteNote,
    restoreNote,
    deleteNoteForever,
    emptyTrash,
    togglePinNote,
    moveNote,
    moveNoteToEvent,
  } = notesHook || localHook;

  // State for active Event or Reminder selected in central view
  const [selectedEventId, setSelectedEventId] = useState<string | null>(() => {
    if (initialEventId) return initialEventId;
    if (typeof window !== 'undefined') {
      const match = window.location.pathname.match(/^\/events\/([^/?#]+)/);
      return match ? match[1] : null;
    }
    return null;
  });

  const [selectedReminderId, setSelectedReminderId] = useState<string | null>(() => {
    if (initialReminderId) return initialReminderId;
    if (typeof window !== 'undefined') {
      const match = window.location.pathname.match(/^\/reminders\/([^/?#]+)/);
      return match ? match[1] : null;
    }
    return null;
  });

  const [sidebarSection, setSidebarSection] = useState<'notes' | 'agenda'>(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      if (path.startsWith('/notes')) {
        return 'notes';
      }
    }
    // Por defecto al entrar a la página principal, la tab activa es 'agenda'
    return 'agenda';
  });

  const [agendaViewMode, setAgendaViewMode] = useState<'dashboard' | 'calendar'>(() => {
    if (typeof window !== 'undefined') {
      if (window.location.pathname.startsWith('/calendar')) {
        return 'calendar';
      }
    }
    return 'dashboard';
  });

  const [isCalendarOpen, setIsCalendarOpen] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      if (path.startsWith('/notes')) {
        return false;
      }
    }
    return true;
  });

  // Ensure note is not selected simultaneously if an event, reminder or calendar was deep-linked
  useEffect(() => {
    if (selectedEventId || selectedReminderId || isCalendarOpen) {
      setSelectedNoteId(null);
    }
  }, []);

  const selectedEvent = useMemo(
    () => (selectedEventId ? eventsHook.events.find((e) => e.id === selectedEventId) || null : null),
    [selectedEventId, eventsHook.events]
  );

  const selectedReminder = useMemo(
    () =>
      selectedReminderId
        ? remindersHook?.reminders.find((r) => r.id === selectedReminderId) || null
        : null,
    [selectedReminderId, remindersHook?.reminders]
  );

  const handleSectionChange = (section: 'notes' | 'agenda') => {
    setSidebarSection(section);
  };

  const handleSelectNote = (id: string | null) => {
    setIsCalendarOpen(false);
    setSelectedEventId(null);
    setSelectedReminderId(null);
    setSelectedNoteId(id);
    if (typeof window !== 'undefined') {
      if (id) {
        window.history.pushState({ type: 'note', id }, '', `/notes/${id}`);
      } else {
        window.history.pushState({}, '', '/');
      }
    }
  };

  const handleSelectEvent = (id: string | null) => {
    setSelectedReminderId(null);
    setSelectedEventId(id);
    if (typeof window !== 'undefined') {
      if (id) {
        setIsCalendarOpen(false);
        setSelectedNoteId(null);
        window.history.pushState({ type: 'event', id }, '', `/events/${id}`);
      } else {
        window.history.pushState({}, '', '/');
      }
    }
  };

  const handleSelectReminder = (id: string | null) => {
    setSelectedEventId(null);
    setSelectedReminderId(id);
    if (typeof window !== 'undefined') {
      if (id) {
        setIsCalendarOpen(false);
        setSelectedNoteId(null);
        window.history.pushState({ type: 'reminder', id }, '', `/reminders/${id}`);
      } else {
        window.history.pushState({}, '', '/');
      }
    }
  };

  const handleOpenCalendar = () => {
    setSelectedEventId(null);
    setSelectedReminderId(null);
    setSelectedNoteId(null);
    setAgendaViewMode('calendar');
    setIsCalendarOpen(true);
    if (typeof window !== 'undefined') {
      window.history.pushState({ type: 'calendar' }, '', '/calendar');
    }
  };

  const handleOpenDashboard = () => {
    setSelectedEventId(null);
    setSelectedReminderId(null);
    setSelectedNoteId(null);
    setAgendaViewMode('dashboard');
    setIsCalendarOpen(false);
    if (typeof window !== 'undefined') {
      window.history.pushState({ type: 'dashboard' }, '', '/');
    }
  };

  const handleCloseCalendar = () => {
    setIsCalendarOpen(false);
    setAgendaViewMode('dashboard');
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', '/');
    }
  };

  // Sync state when browser Back / Forward (popstate) occurs
  useEffect(() => {
    const handlePopState = () => {
      if (typeof window === 'undefined') return;
      const path = window.location.pathname;

      if (path.startsWith('/calendar')) {
        setSidebarSection('agenda');
        setAgendaViewMode('calendar');
        setIsCalendarOpen(true);
        setSelectedEventId(null);
        setSelectedReminderId(null);
        setSelectedNoteId(null);
        return;
      }

      if (path.startsWith('/agenda')) {
        setSidebarSection('agenda');
        setAgendaViewMode('dashboard');
        setIsCalendarOpen(true);
        setSelectedEventId(null);
        setSelectedReminderId(null);
        setSelectedNoteId(null);
        return;
      }

      const eventMatch = path.match(/^\/events\/([^/?#]+)/);
      if (eventMatch) {
        setSidebarSection('agenda');
        setIsCalendarOpen(false);
        setSelectedEventId(eventMatch[1]);
        setSelectedReminderId(null);
        setSelectedNoteId(null);
        return;
      }

      const reminderMatch = path.match(/^\/reminders\/([^/?#]+)/);
      if (reminderMatch) {
        setSidebarSection('agenda');
        setIsCalendarOpen(false);
        setSelectedReminderId(reminderMatch[1]);
        setSelectedEventId(null);
        setSelectedNoteId(null);
        return;
      }

      const noteMatch = path.match(/^\/notes\/([^/?#]+)/);
      if (noteMatch) {
        setSidebarSection('notes');
        setIsCalendarOpen(false);
        setSelectedNoteId(noteMatch[1]);
        setSelectedEventId(null);
        setSelectedReminderId(null);
        return;
      }

      if (path === '/') {
        setSidebarSection('agenda');
        setAgendaViewMode('dashboard');
        setIsCalendarOpen(true);
        setSelectedEventId(null);
        setSelectedReminderId(null);
        setSelectedNoteId(null);
        return;
      }

      if (path === '/notes') {
        setSidebarSection('notes');
        setIsCalendarOpen(false);
        setSelectedEventId(null);
        setSelectedReminderId(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [setSelectedNoteId]);

  // Sidebar width state with localStorage persistence
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return DEFAULT_SIDEBAR_WIDTH;
    const stored = localStorage.getItem('veyra_sidebar_width');
    const parsed = stored ? parseInt(stored, 10) : DEFAULT_SIDEBAR_WIDTH;
    return isNaN(parsed)
      ? DEFAULT_SIDEBAR_WIDTH
      : Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, parsed));
  });

  const [isResizing, setIsResizing] = useState(false);

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, e.clientX));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = (e: MouseEvent) => {
      setIsResizing(false);
      const finalWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, e.clientX));
      if (typeof window !== 'undefined') {
        localStorage.setItem('veyra_sidebar_width', String(finalWidth));
      }
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  const handleCreateNoteInFolder = async () => {
    await createNote(selectedFolderId);
  };

  const handleCreateNoteForEvent = async (eventId: string, folderId?: string | null) => {
    const targetEvent = eventsHook.events.find((e) => e.id === eventId);
    const title = targetEvent ? `Apuntes - ${targetEvent.title}` : 'Apuntes';
    const newNote = await createNote(folderId || null, eventId, title);
    if (newNote) {
      handleSelectNote(newNote.id);
    }
  };

  const handleDeleteNote = async (id: string) => {
    const isCurrent = selectedNoteId === id;
    await deleteNote(id);
    if (isCurrent) {
      const remaining = allNotes.filter((n) => n.id !== id);
      if (remaining.length > 0) {
        handleSelectNote(remaining[0].id);
      } else {
        handleSelectNote(null);
      }
    }
  };

  const isCalendarActive = isCalendarOpen && agendaViewMode === 'calendar';

  return (
    <div className="flex-1 flex h-full overflow-hidden">
      {/* Super Smooth Animated & Resizable Left Sidebar */}
      <div
        className={cn(
          'h-full shrink-0 relative overflow-hidden',
          isResizing
            ? 'transition-none'
            : 'transition-[width,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
          isSidebarOpen ? 'opacity-100' : 'w-0 opacity-0 pointer-events-none'
        )}
        style={{ width: isSidebarOpen ? `${sidebarWidth}px` : 0 }}
      >
        <div style={{ width: `${sidebarWidth}px` }} className="h-full relative">
          <NotesSidebar
            folders={folders}
            notes={notes}
            allNotes={allNotes}
            deletedNotes={deletedNotes}
            selectedFolderId={selectedFolderId}
            onSelectFolder={setSelectedFolderId}
            selectedNoteId={selectedNoteId}
            onSelectNote={handleSelectNote}
            selectedEventId={selectedEventId}
            onSelectEvent={handleSelectEvent}
            selectedReminderId={selectedReminderId}
            onSelectReminder={handleSelectReminder}
            onOpenCalendar={handleOpenCalendar}
            isCalendarOpen={isCalendarActive}
            sidebarSection={sidebarSection}
            onSectionChange={handleSectionChange}
            onCreateNote={handleCreateNoteInFolder}
            onCreateFolder={createFolder}
            onUpdateFolder={updateFolder}
            onDeleteFolder={deleteFolder}
            onCreateNoteForEvent={handleCreateNoteForEvent}
            onMoveNote={moveNote}
            onMoveFolder={moveFolder}
            onMoveNoteToEvent={moveNoteToEvent}
            onDuplicateNote={duplicateNote}
            onDeleteNote={handleDeleteNote}
            onRestoreNote={restoreNote}
            onDeleteForever={deleteNoteForever}
            onEmptyTrash={emptyTrash}
            onTogglePinNote={togglePinNote}
            onToggleSidebar={onToggleSidebar}
            remindersHook={remindersHook}
            eventsHook={eventsHook}
            userId={userId}
            userEmail={userEmail}
            userName={userName}
            onSignOut={onSignOut}
          />

          {/* Draggable Resizer Edge */}
          <div
            onMouseDown={startResizing}
            title="Arrastra para cambiar el ancho"
            className={cn(
              'absolute top-0 right-0 w-1.5 h-full cursor-col-resize z-30 transition-colors',
              isResizing ? 'bg-accent' : 'hover:bg-accent/50'
            )}
          />
        </div>
      </div>

      {/* Main Center Stage: CalendarView, EventDetailView, ReminderDetailView, or NoteEditor */}
      {selectedEventId && eventsHook.loading ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-veyra-muted bg-veyra-canvas">
          <Loader2 className="w-6 h-6 text-accent animate-spin mb-3" />
          <h3 className="text-sm font-medium text-veyra-text">Cargando evento...</h3>
        </div>
      ) : selectedEvent ? (
        <EventDetailView
          event={selectedEvent}
          allNotes={allNotes}
          folders={folders}
          remindersHook={remindersHook}
          eventsHook={eventsHook}
          onSelectNote={handleSelectNote}
          onCreateNoteForEvent={async (folderId, title) => {
            const newNote = await createNote(folderId || null, selectedEvent.id, title);
            if (newNote) {
              handleSelectNote(newNote.id);
            }
          }}
          onDeleteNote={handleDeleteNote}
          onSelectReminder={handleSelectReminder}
          onClose={() => handleSelectEvent(null)}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={onToggleSidebar}
          currentUserId={userId}
        />
      ) : selectedReminderId && remindersHook?.loading ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-veyra-muted bg-veyra-canvas">
          <Loader2 className="w-6 h-6 text-accent animate-spin mb-3" />
          <h3 className="text-sm font-medium text-veyra-text">Cargando recordatorio...</h3>
        </div>
      ) : selectedReminder ? (
        <ReminderDetailView
          reminder={selectedReminder}
          allNotes={allNotes}
          eventsHook={eventsHook}
          remindersHook={remindersHook}
          onSelectNote={handleSelectNote}
          onSelectEvent={handleSelectEvent}
          onClose={() => handleSelectReminder(null)}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={onToggleSidebar}
          currentUserId={userId}
        />
      ) : selectedNote ? (
        <NoteEditor
          note={selectedNote}
          currentUserId={userId}
          userEmail={userEmail}
          userName={userName}
          onSaveNote={saveNote}
          onRestoreNote={restoreNote}
          onCloseNote={() => handleSelectNote(null)}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={onToggleSidebar}
          folders={folders}
          events={eventsHook.events}
          onSelectFolder={setSelectedFolderId}
          onSelectEvent={handleSelectEvent}
        />
      ) : isCalendarActive ? (
        <CalendarView
          eventsHook={eventsHook}
          remindersHook={remindersHook}
          allNotes={allNotes}
          onSelectEvent={handleSelectEvent}
          onSelectReminder={handleSelectReminder}
          onClose={handleCloseCalendar}
          onOpenDashboard={handleOpenDashboard}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={onToggleSidebar}
        />
      ) : (
        <AgendaDashboardView
          eventsHook={eventsHook}
          remindersHook={remindersHook}
          allNotes={allNotes}
          folders={folders}
          userName={userName}
          userEmail={userEmail}
          onSelectEvent={handleSelectEvent}
          onSelectReminder={handleSelectReminder}
          onSelectNote={handleSelectNote}
          onCreateNote={async (folderId, eventId, title, contentJson) => {
            const newNote = await createNote(folderId || null, eventId || null, title);
            if (newNote) {
              if (contentJson) {
                const pageId = crypto.randomUUID();
                const paginated = {
                  isPaginated: true,
                  version: 2,
                  layout: 'vertical',
                  pages: [{ id: pageId, content: contentJson }],
                };
                await saveNote(newNote.id, { content: JSON.stringify(paginated) });
              }
              return newNote;
            }
            return null;
          }}
          onOpenFullCalendar={handleOpenCalendar}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={onToggleSidebar}
        />
      )}
    </div>
  );
};
