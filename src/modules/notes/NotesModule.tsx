import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader2, PanelLeft, Search, Sparkles, Timer, Play, Pause, RotateCcw, LayoutDashboard, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { NotesSidebar } from './NotesSidebar';
import { NoteEditor } from './NoteEditor';
import { EventDetailView } from '../agenda/EventDetailView';
import { ReminderDetailView } from '../agenda/ReminderDetailView';
import { CalendarView } from '../agenda/CalendarView';
import { AgendaDashboardView } from '../agenda/dashboard/AgendaDashboardView';
import { GlobalSearchModal } from '../agenda/dashboard/GlobalSearchModal';
import { CreateWithVeyraAssistant } from '../../components/common/CreateWithVeyraAssistant';
import { EventModal } from '../agenda/EventModal';
import { ReminderModal } from '../reminders/ReminderModal';
import { useTemplates } from './templates/useTemplates';
import type { NoteTemplate } from './templates/templatesData';
import { useNotes } from '../../hooks/useNotes';
import { useReminders } from '../../hooks/useReminders';
import { useEvents } from '../../hooks/useEvents';
import { usePomodoro } from '../../context/PomodoroContext';
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
  const pomodoro = usePomodoro();
  const { allTemplates } = useTemplates(userId);
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);
  const [isQuickAIModalOpen, setIsQuickAIModalOpen] = useState(false);
  const [isQuickAIExpanded, setIsQuickAIExpanded] = useState(false);
  const [isQuickEventModalOpen, setIsQuickEventModalOpen] = useState(false);
  const [isQuickReminderModalOpen, setIsQuickReminderModalOpen] = useState(false);
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

  const closeSidebarOnMobile = useCallback(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768 && isSidebarOpen && onToggleSidebar) {
      onToggleSidebar();
    }
  }, [isSidebarOpen, onToggleSidebar]);

  const handleSelectNote = (id: string | null) => {
    setIsCalendarOpen(false);
    setSelectedEventId(null);
    setSelectedReminderId(null);
    setSelectedNoteId(id);
    if (id) closeSidebarOnMobile();
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
    if (id) closeSidebarOnMobile();
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
    if (id) closeSidebarOnMobile();
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
    closeSidebarOnMobile();
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
    closeSidebarOnMobile();
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
    const newNote = await createNote(selectedFolderId);
    if (newNote) {
      handleSelectNote(newNote.id);
    }
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

  // Global search shortcut (Ctrl+K / Cmd+K)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsGlobalSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  const handleSelectFolderFromDashboard = useCallback(
    (folderId: string) => {
      setSelectedFolderId(folderId);
      setSidebarSection('notes');
      if (!isSidebarOpen && onToggleSidebar) {
        onToggleSidebar();
      }
    },
    [setSelectedFolderId, isSidebarOpen, onToggleSidebar]
  );

  const handleCreateNoteFromTemplate = useCallback(
    async (template: NoteTemplate) => {
      const html = template.getContent({ userName });
      const newNote = await createNote(selectedFolderId || null, null, template.title, html);
      if (!newNote) return;
      toast.success(`Nota creada con "${template.title}"`);
      handleSelectNote(newNote.id);
    },
    [createNote, selectedFolderId, userName, handleSelectNote]
  );

  return (
    <div className="flex-1 flex h-full overflow-hidden relative">
      {/* Mobile Sidebar Backdrop */}
      {isSidebarOpen && onToggleSidebar && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-[1px] z-40 md:hidden"
          onClick={onToggleSidebar}
          aria-hidden="true"
        />
      )}

      {/* Super Smooth Animated & Resizable Left Sidebar (Drawer on mobile, inline on md+) */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 md:static md:z-auto h-full shrink-0 overflow-hidden max-w-[85vw] md:max-w-none shadow-2xl md:shadow-none',
          isResizing
            ? 'transition-none'
            : 'transition-[width,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
          isSidebarOpen ? 'opacity-100' : 'w-0 opacity-0 pointer-events-none'
        )}
        style={{ width: isSidebarOpen ? `${sidebarWidth}px` : 0 }}
      >
        <div style={{ width: `${sidebarWidth}px` }} className="h-full max-w-[85vw] md:max-w-none relative">
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
            isCalendarOpen={isCalendarActive && !selectedNote && !selectedEvent && !selectedReminder}
            onOpenDashboard={handleOpenDashboard}
            isDashboardActive={!isCalendarActive && !selectedNote && !selectedEvent && !selectedReminder}
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

          {/* Draggable Resizer Edge (Desktop only) */}
          <div
            onMouseDown={startResizing}
            title="Arrastra para cambiar el ancho"
            className={cn(
              'hidden md:block absolute top-0 right-0 w-1.5 h-full cursor-col-resize z-30 transition-colors',
              isResizing ? 'bg-accent' : 'hover:bg-accent/50'
            )}
          />
        </div>
      </div>

      {/* Main Center Stage with Permanent Clean Top Header */}
      <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden bg-veyra-canvas">
        <header className="h-12 border-b border-veyra-border px-4 md:px-6 flex items-center justify-between gap-3 shrink-0 bg-veyra-canvas/90 backdrop-blur-md z-20">
          <div className="flex items-center gap-2.5 min-w-0">
            {!isSidebarOpen && (
              <>
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-6 h-6 rounded-md bg-accent flex items-center justify-center font-bold text-white text-xs shadow-sm shrink-0">
                    V
                  </div>
                  <span className="font-bold text-sm tracking-wider text-veyra-text truncate">
                    VEYRA
                  </span>
                </div>
                {onToggleSidebar && (
                  <button
                    type="button"
                    onClick={onToggleSidebar}
                    title="Mostrar barra lateral (Ctrl+\)"
                    className="p-1.5 rounded-lg text-veyra-muted hover:text-veyra-text hover:bg-veyra-elevated transition-colors cursor-pointer"
                  >
                    <PanelLeft className="w-4 h-4 text-accent" />
                  </button>
                )}
              </>
            )}

            <div className="flex items-center p-0.5 rounded-lg bg-veyra-elevated/70 border border-veyra-border/80 shrink-0">
              <button
                type="button"
                onClick={handleOpenDashboard}
                title="Dashboard"
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer',
                  !isCalendarActive && !selectedNote && !selectedEvent && !selectedReminder
                    ? 'bg-accent/15 text-accent'
                    : 'text-veyra-muted hover:text-veyra-text hover:bg-white/5'
                )}
              >
                <LayoutDashboard className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden md:inline">Dashboard</span>
              </button>
              <button
                type="button"
                onClick={handleOpenCalendar}
                title="Calendario Completo"
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer',
                  isCalendarActive && !selectedNote && !selectedEvent && !selectedReminder
                    ? 'bg-accent/15 text-accent'
                    : 'text-veyra-muted hover:text-veyra-text hover:bg-white/5'
                )}
              >
                <Calendar className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden md:inline">Calendario</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 min-w-0 ml-auto">
            {pomodoro.isActive && (selectedNoteId || selectedReminderId || selectedEventId || isCalendarActive) && (
              <div
                title={
                  pomodoro.mode === 'work'
                    ? 'Sesión de enfoque en curso'
                    : 'Descanso Pomodoro en curso'
                }
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs animate-veyra-inline-reveal shrink-0',
                  pomodoro.mode === 'work'
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                )}
              >
                <Timer className={cn('w-3.5 h-3.5 shrink-0', pomodoro.isRunning && 'animate-pulse')} />
                <span className="font-mono font-bold tabular-nums text-veyra-text">
                  {pomodoro.formattedTime}
                </span>
                <button
                  type="button"
                  onClick={pomodoro.toggleRunning}
                  title={pomodoro.isRunning ? 'Pausar Pomodoro' : 'Reanudar Pomodoro'}
                  className="p-0.5 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
                >
                  {pomodoro.isRunning ? (
                    <Pause className="w-3 h-3 fill-current" />
                  ) : (
                    <Play className="w-3 h-3 fill-current" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={pomodoro.reset}
                  title="Reiniciar Pomodoro"
                  className="p-0.5 rounded-full text-veyra-muted hover:text-veyra-text hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setIsQuickAIModalOpen(true)}
              title="Crear con Veyra IA (Texto, Voz o Imagen)"
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-accent text-white hover:brightness-110 active:scale-[0.98] text-xs font-semibold shadow-[0_4px_14px_-2px_color-mix(in_srgb,var(--accent-primary)_50%,transparent),inset_0_1px_0_rgba(255,255,255,0.22)] ring-1 ring-white/15 transition-all duration-200 cursor-pointer shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Crear con Veyra</span>
            </button>

            <button
              type="button"
              onClick={() => setIsGlobalSearchOpen(true)}
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
          </div>
        </header>

        <div className="flex-1 min-h-0 flex overflow-hidden">
          {selectedEventId && eventsHook.loading ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-veyra-muted bg-veyra-canvas">
              <Loader2 className="w-6 h-6 text-accent animate-spin mb-3" />
              <h3 className="text-sm font-medium text-veyra-text">Cargando evento...</h3>
            </div>
          ) : selectedEvent ? (
            <div
              key={`event-stage-${(selectedEvent.title || '').trim().toLowerCase() || selectedEvent.id}`}
              className="flex-1 min-w-0 flex h-full overflow-hidden veyra-stage-enter"
            >
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
                isSidebarOpen={true}
                onToggleSidebar={onToggleSidebar}
                currentUserId={userId}
              />
            </div>
          ) : selectedReminderId && remindersHook?.loading ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-veyra-muted bg-veyra-canvas">
              <Loader2 className="w-6 h-6 text-accent animate-spin mb-3" />
              <h3 className="text-sm font-medium text-veyra-text">Cargando recordatorio...</h3>
            </div>
          ) : selectedReminder ? (
            <div
              key={`reminder-stage-${selectedReminder.id}`}
              className="flex-1 min-w-0 flex h-full overflow-hidden veyra-stage-enter"
            >
              <ReminderDetailView
                reminder={selectedReminder}
                allNotes={allNotes}
                eventsHook={eventsHook}
                remindersHook={remindersHook}
                onSelectNote={handleSelectNote}
                onSelectEvent={handleSelectEvent}
                onClose={() => handleSelectReminder(null)}
                isSidebarOpen={true}
                onToggleSidebar={onToggleSidebar}
                currentUserId={userId}
              />
            </div>
          ) : selectedNote ? (
            <NoteEditor
              note={selectedNote}
              currentUserId={userId}
              userEmail={userEmail}
              userName={userName}
              onSaveNote={saveNote}
              onRestoreNote={restoreNote}
              onCloseNote={() => handleSelectNote(null)}
              isSidebarOpen={true}
              onToggleSidebar={onToggleSidebar}
              folders={folders}
              events={eventsHook.events}
              onSelectFolder={setSelectedFolderId}
              onSelectEvent={handleSelectEvent}
            />
          ) : isCalendarActive ? (
            <div key="calendar-stage" className="flex-1 min-w-0 flex h-full overflow-hidden veyra-stage-enter">
              <CalendarView
                eventsHook={eventsHook}
                remindersHook={remindersHook}
                allNotes={allNotes}
                onSelectEvent={handleSelectEvent}
                onSelectReminder={handleSelectReminder}
                onClose={handleCloseCalendar}
                onOpenDashboard={handleOpenDashboard}
                isSidebarOpen={true}
                onToggleSidebar={onToggleSidebar}
                hideViewSwitcher={true}
              />
            </div>
          ) : (
            <div key="dashboard-stage" className="flex-1 min-w-0 flex h-full overflow-hidden veyra-stage-enter">
              <AgendaDashboardView
                eventsHook={eventsHook}
                remindersHook={remindersHook}
                allNotes={allNotes}
                folders={folders}
                userName={userName}
                userEmail={userEmail}
                currentUserId={userId}
                templates={allTemplates}
                onSelectEvent={handleSelectEvent}
                onSelectReminder={handleSelectReminder}
                onSelectNote={handleSelectNote}
                onSelectFolder={handleSelectFolderFromDashboard}
                onCreateFromTemplate={handleCreateNoteFromTemplate}
                onOpenGlobalSearch={() => setIsGlobalSearchOpen(true)}
                onCreateNote={async (folderId, eventId, title, contentHtml) => {
                  const newNote = await createNote(folderId || null, eventId || null, title, contentHtml);
                  return newNote || null;
                }}
                onOpenFullCalendar={handleOpenCalendar}
                isSidebarOpen={isSidebarOpen}
                onToggleSidebar={onToggleSidebar}
              />
            </div>
          )}
        </div>
      </div>

      <EventModal
        isOpen={isQuickEventModalOpen}
        onClose={() => setIsQuickEventModalOpen(false)}
        onSave={async (payload) => await eventsHook?.createEvent(payload)}
      />

      <ReminderModal
        isOpen={isQuickReminderModalOpen}
        onClose={() => setIsQuickReminderModalOpen(false)}
        events={eventsHook.events}
        onSave={async (payload) => await remindersHook?.createReminder(payload)}
      />

      {isQuickAIModalOpen && (
        <aside
          aria-label="Crear con Veyra"
          className={`fixed bottom-4 right-4 left-4 sm:left-auto z-50 sm:w-full max-h-[calc(100vh-2rem)] rounded-[24px] bg-veyra-card border border-veyra-border shadow-2xl p-5 flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-200 transition-[max-width] ease-[cubic-bezier(0.16,1,0.3,1)] ${isQuickAIExpanded ? 'sm:max-w-[560px]' : 'sm:max-w-[440px]'
            }`}
        >
          <CreateWithVeyraAssistant
            variant="sidebar"
            onClose={() => {
              setIsQuickAIModalOpen(false);
              setIsQuickAIExpanded(false);
            }}
            onHasProposalChange={setIsQuickAIExpanded}
            onManualReminder={() => setIsQuickReminderModalOpen(true)}
            onManualEvent={() => setIsQuickEventModalOpen(true)}
            onManualNote={async () => {
              const newNote = await createNote(null, null, 'Nota rápida');
              if (newNote) handleSelectNote(newNote.id);
            }}
            onSaveReminder={async (payload) => await remindersHook?.createReminder(payload)}
            onSaveEvent={async (payload) => await eventsHook?.createEvent(payload)}
            onSaveNote={async (title, contentHtml) => {
              const created = await createNote(null, null, title, contentHtml);
              if (created && created.id) {
                handleSelectNote(created.id);
              }
            }}
            autoFocus={true}
          />
        </aside>
      )}

      <GlobalSearchModal
        isOpen={isGlobalSearchOpen}
        onClose={() => setIsGlobalSearchOpen(false)}
        notes={allNotes}
        folders={folders}
        events={eventsHook.events}
        reminders={remindersHook?.reminders || []}
        templates={allTemplates}
        onSelectNote={handleSelectNote}
        onSelectFolder={handleSelectFolderFromDashboard}
        onSelectEvent={handleSelectEvent}
        onSelectReminder={handleSelectReminder}
        onCreateFromTemplate={handleCreateNoteFromTemplate}
        onCreateBlankNote={async () => {
          const newNote = await createNote(null, null, 'Nueva nota');
          if (newNote) handleSelectNote(newNote.id);
        }}
        onOpenCalendar={handleOpenCalendar}
      />
    </div>
  );
};
