import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { MobileTopBar } from './MobileTopBar';
import { MobileBottomTabBar, type MobileTab, type MobileBottomMorph } from './MobileBottomTabBar';
import { MobileAgendaTab } from './MobileAgendaTab';
import { MobileNotesTab } from './MobileNotesTab';
import { MobileSettingsPage, type MobileSettingsSection } from './MobileSettingsPage';
import { NoteEditor } from '../notes/NoteEditor';
import { EventDetailView } from '../agenda/EventDetailView';
import { ReminderDetailView } from '../agenda/ReminderDetailView';
import { CalendarView } from '../agenda/CalendarView';
import { EventModal } from '../agenda/EventModal';
import { ReminderModal } from '../reminders/ReminderModal';
import { GlobalSearchModal } from '../agenda/dashboard/GlobalSearchModal';
import { Modal } from '../../components/common/Modal';
import { navigateTo } from '../../lib/navigation';
import { useTemplates } from '../notes/templates/useTemplates';
import type { NoteTemplate } from '../notes/templates/templatesData';
import type { useNotes } from '../../hooks/useNotes';
import type { useReminders } from '../../hooks/useReminders';
import type { useEvents } from '../../hooks/useEvents';

export interface MobileAppShellProps {
  userId: string;
  userEmail: string;
  userName?: string;
  notesHook: ReturnType<typeof useNotes>;
  remindersHook: ReturnType<typeof useReminders>;
  eventsHook: ReturnType<typeof useEvents>;
  initialEventId?: string | null;
  initialReminderId?: string | null;
  onSignOut: () => void;
}

export const MobileAppShell: React.FC<MobileAppShellProps> = ({
  userId,
  userEmail,
  userName,
  notesHook,
  remindersHook,
  eventsHook,
  initialEventId,
  initialReminderId,
  onSignOut,
}) => {
  const { allTemplates } = useTemplates(userId);
  const {
    folders,
    allNotes,
    setSelectedNoteId,
    selectedNote,
    setSelectedFolderId,
    createFolder,
    deleteFolder,
    createNote,
    saveNote,
    deleteNote,
    restoreNote,
  } = notesHook;

  const [activeTab, setActiveTab] = useState<MobileTab>(() => {
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/notes')) {
      return 'notes';
    }
    return 'agenda';
  });

  const [selectedEventId, setSelectedEventId] = useState<string | null>(initialEventId || null);
  const [selectedReminderId, setSelectedReminderId] = useState<string | null>(
    initialReminderId || null
  );
  const [isCalendarOpen, setIsCalendarOpen] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.location.pathname.startsWith('/calendar');
    }
    return false;
  });

  const [activeMorph, setActiveMorph] = useState<MobileBottomMorph>('none');
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [isReminderModalOpen, setIsReminderModalOpen] = useState(false);
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [settingsPageSection, setSettingsPageSection] = useState<MobileSettingsSection | null>(null);
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);

  const selectedEvent = useMemo(
    () => (selectedEventId ? eventsHook.events.find((e) => e.id === selectedEventId) || null : null),
    [selectedEventId, eventsHook.events]
  );

  const selectedReminder = useMemo(
    () =>
      selectedReminderId
        ? remindersHook.reminders.find((r) => r.id === selectedReminderId) || null
        : null,
    [selectedReminderId, remindersHook.reminders]
  );

  const handleSelectNote = useCallback(
    (id: string | null) => {
      setIsCalendarOpen(false);
      setSelectedEventId(null);
      setSelectedReminderId(null);
      setSelectedNoteId(id);
      if (typeof window !== 'undefined') {
        if (id) {
          window.history.pushState({ type: 'note', id }, '', `/notes/${id}`);
        } else if (window.history.state?.type) {
          window.history.back();
        } else {
          window.history.pushState({}, '', '/');
        }
      }
    },
    [setSelectedNoteId]
  );

  const handleSelectEvent = useCallback(
    (id: string | null) => {
      setIsCalendarOpen(false);
      setSelectedReminderId(null);
      setSelectedNoteId(null);
      setSelectedEventId(id);
      if (typeof window !== 'undefined') {
        if (id) {
          window.history.pushState({ type: 'event', id }, '', `/events/${id}`);
        } else if (window.history.state?.type) {
          window.history.back();
        } else {
          window.history.pushState({}, '', '/');
        }
      }
    },
    [setSelectedNoteId]
  );

  const handleSelectReminder = useCallback(
    (id: string | null) => {
      setIsCalendarOpen(false);
      setSelectedEventId(null);
      setSelectedNoteId(null);
      setSelectedReminderId(id);
      if (typeof window !== 'undefined') {
        if (id) {
          window.history.pushState({ type: 'reminder', id }, '', `/reminders/${id}`);
        } else if (window.history.state?.type) {
          window.history.back();
        } else {
          window.history.pushState({}, '', '/');
        }
      }
    },
    [setSelectedNoteId]
  );

  const handleOpenCalendar = useCallback(() => {
    setSelectedEventId(null);
    setSelectedReminderId(null);
    setSelectedNoteId(null);
    setIsCalendarOpen(true);
    if (typeof window !== 'undefined') {
      window.history.pushState({ type: 'calendar' }, '', '/calendar');
    }
  }, [setSelectedNoteId]);

  const handleCloseCalendar = useCallback(() => {
    setIsCalendarOpen(false);
    if (typeof window !== 'undefined') {
      if (window.history.state?.type === 'calendar') {
        window.history.back();
      } else {
        window.history.pushState({}, '', '/');
      }
    }
  }, []);

  const handleOpenSettingsPage = useCallback((section: MobileSettingsSection = 'main') => {
    setSettingsPageSection(section);
    if (typeof window !== 'undefined') {
      window.history.pushState({ type: 'settings', section }, '', '/settings');
    }
  }, []);

  const handleCloseSettingsPage = useCallback(() => {
    setSettingsPageSection(null);
    if (typeof window !== 'undefined') {
      if (window.history.state?.type === 'settings') {
        window.history.back();
      } else {
        window.history.pushState({}, '', '/');
      }
    }
  }, []);

  // Sync mobile navigation when user presses browser/phone Back button
  useEffect(() => {
    const handlePopState = () => {
      if (typeof window === 'undefined') return;
      const path = window.location.pathname;

      if (path.startsWith('/settings')) {
        setSettingsPageSection('main');
        return;
      }

      setSettingsPageSection(null);

      if (path.startsWith('/calendar')) {
        setIsCalendarOpen(true);
        setSelectedEventId(null);
        setSelectedReminderId(null);
        setSelectedNoteId(null);
        return;
      }

      const eventMatch = path.match(/^\/events\/([^/?#]+)/);
      if (eventMatch) {
        setIsCalendarOpen(false);
        setSelectedReminderId(null);
        setSelectedNoteId(null);
        setSelectedEventId(eventMatch[1]);
        return;
      }

      const reminderMatch = path.match(/^\/reminders\/([^/?#]+)/);
      if (reminderMatch) {
        setIsCalendarOpen(false);
        setSelectedEventId(null);
        setSelectedNoteId(null);
        setSelectedReminderId(reminderMatch[1]);
        return;
      }

      const noteMatch = path.match(/^\/notes\/([^/?#]+)/);
      if (noteMatch) {
        setIsCalendarOpen(false);
        setSelectedEventId(null);
        setSelectedReminderId(null);
        setSelectedNoteId(noteMatch[1]);
        return;
      }

      // Back to main mobile shell (Agenda or Notas)
      setIsCalendarOpen(false);
      setSelectedEventId(null);
      setSelectedReminderId(null);
      setSelectedNoteId(null);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [setSelectedNoteId]);

  const userInitial = (userName?.[0] || userEmail?.[0] || 'V').toUpperCase();

  const handleCreateNoteAndOpen = useCallback(
    async (folderId: string | null = null, title = 'Nueva nota', contentHtml?: string, eventId: string | null = null) => {
      const created = await createNote(folderId, eventId, title, contentHtml);
      if (created) {
        setActiveTab('notes');
        handleSelectNote(created.id);
      }
    },
    [createNote, handleSelectNote]
  );

  const handleCreateFromTemplate = useCallback(
    async (template: NoteTemplate) => {
      const html = template.getContent({ userName });
      await handleCreateNoteAndOpen(null, template.title, html);
      toast.success(`Nota creada con "${template.title}"`);
    },
    [handleCreateNoteAndOpen, userName]
  );

  const handleCreateFolderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    await createFolder(trimmed);
    setNewFolderName('');
    setIsFolderModalOpen(false);
    setActiveTab('notes');
    toast.success(`Carpeta "${trimmed}" creada`);
  };

  // Full-screen detail / editor views
  if (selectedEvent) {
    return (
      <div className="flex-1 flex h-full overflow-hidden">
        <EventDetailView
          event={selectedEvent}
          allNotes={allNotes}
          folders={folders}
          remindersHook={remindersHook}
          eventsHook={eventsHook}
          onSelectNote={(id) => handleSelectNote(id)}
          onCreateNoteForEvent={async (folderId, title) => {
            const newNote = await createNote(folderId || null, selectedEvent.id, title);
            if (newNote) handleSelectNote(newNote.id);
          }}
          onSelectReminder={(id) => handleSelectReminder(id)}
          onClose={() => handleSelectEvent(null)}
          currentUserId={userId}
        />
      </div>
    );
  }

  if (selectedReminder) {
    return (
      <div className="flex-1 flex h-full overflow-hidden">
        <ReminderDetailView
          reminder={selectedReminder}
          allNotes={allNotes}
          eventsHook={eventsHook}
          remindersHook={remindersHook}
          onSelectNote={(id) => handleSelectNote(id)}
          onSelectEvent={(id) => handleSelectEvent(id)}
          onClose={() => handleSelectReminder(null)}
          currentUserId={userId}
        />
      </div>
    );
  }

  if (selectedNote) {
    return (
      <div className="flex-1 flex h-full overflow-hidden">
        <NoteEditor
          note={selectedNote}
          currentUserId={userId}
          userEmail={userEmail}
          userName={userName}
          onSaveNote={saveNote}
          onRestoreNote={restoreNote}
          onCloseNote={() => handleSelectNote(null)}
          folders={folders}
          events={eventsHook.events}
          onSelectFolder={(folderId) => {
            setSelectedFolderId(folderId);
            handleSelectNote(null);
            setActiveTab('notes');
          }}
          onSelectEvent={(id) => handleSelectEvent(id)}
        />
      </div>
    );
  }

  if (isCalendarOpen) {
    return (
      <div className="flex-1 flex h-full overflow-hidden">
        <CalendarView
          eventsHook={eventsHook}
          remindersHook={remindersHook}
          allNotes={allNotes}
          onSelectEvent={(id) => handleSelectEvent(id)}
          onSelectReminder={(id) => handleSelectReminder(id)}
          onClose={handleCloseCalendar}
          onOpenDashboard={handleCloseCalendar}
        />
      </div>
    );
  }

  if (settingsPageSection) {
    return (
      <div className="flex-1 flex h-full overflow-hidden">
        <MobileSettingsPage
          userId={userId}
          userEmail={userEmail}
          userName={userName}
          initialSection={settingsPageSection}
          stats={{
            notesCount: allNotes.filter((n) => !n.deleted).length,
            pendingRemindersCount: remindersHook.reminders.filter(
              (r) => r.deleted !== 1 && r.status !== 'completed'
            ).length,
            completedRemindersCount: remindersHook.completedReminders.length,
            eventsCount: eventsHook.events.filter((e) => e.deleted !== 1).length,
          }}
          onClose={handleCloseSettingsPage}
          onSignOut={onSignOut}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-veyra-canvas overflow-hidden relative">
      <MobileTopBar
        userName={userName}
        userEmail={userEmail}
        onOpenCalendarHistory={handleOpenCalendar}
        onOpenShareOrSettings={() => handleOpenSettingsPage('main')}
        onGoHome={() => setActiveTab('agenda')}
      />

      {activeTab === 'agenda' ? (
        <MobileAgendaTab
          events={eventsHook.events}
          reminders={remindersHook.reminders}
          allNotes={allNotes}
          onSelectEvent={(id) => handleSelectEvent(id)}
          onSelectReminder={(id) => handleSelectReminder(id)}
          onSelectNote={(id) => handleSelectNote(id)}
          onToggleReminder={(id, status) => remindersHook.toggleReminder(id, status)}
          onDeleteReminder={async (id) => {
            await remindersHook.deleteReminder(id);
            toast.success('Recordatorio eliminado', {
              duration: 5000,
              action: {
                label: 'Deshacer',
                onClick: () => {
                  remindersHook.restoreReminder(id);
                },
              },
            });
          }}
          onDeleteEvent={async (id) => {
            await eventsHook.deleteEvent(id);
            toast.success('Evento eliminado', {
              duration: 5000,
              action: {
                label: 'Deshacer',
                onClick: () => {
                  eventsHook.restoreEvent(id);
                },
              },
            });
          }}
          onCreateEvent={() => setIsEventModalOpen(true)}
          onCreateReminder={() => setIsReminderModalOpen(true)}
        />
      ) : (
        <MobileNotesTab
          folders={folders}
          allNotes={allNotes}
          events={eventsHook.events}
          currentUserId={userId}
          onSelectNote={(id) => handleSelectNote(id)}
          onSelectEvent={(id) => handleSelectEvent(id)}
          onCreateNote={(folderId, eventId) => handleCreateNoteAndOpen(folderId, 'Nueva nota', undefined, eventId || null)}
          onCreateFolder={() => setIsFolderModalOpen(true)}
          onDeleteNote={async (id) => {
            await deleteNote(id);
            toast.success('Nota movida a la papelera', {
              action: {
                label: 'Deshacer',
                onClick: () => {
                  restoreNote(id);
                },
              },
            });
          }}
          onDeleteFolder={async (folderId) => {
            await deleteFolder(folderId);
            toast.success('Carpeta eliminada');
          }}
        />
      )}

      <MobileBottomTabBar
        activeTab={activeTab}
        userInitial={userInitial}
        userName={userName}
        userEmail={userEmail}
        activeMorph={activeMorph}
        onChangeMorph={setActiveMorph}
        onChangeTab={(tab) => {
          setActiveMorph('none');
          setActiveTab(tab);
        }}
        onOpenSearch={() => {
          setActiveMorph('none');
          setIsGlobalSearchOpen(true);
        }}
        onOpenSettingsPage={() => handleOpenSettingsPage('main')}
        onOpenStats={() => handleOpenSettingsPage('stats')}
        onJoinWithCode={() => navigateTo('/join')}
        onSignOut={onSignOut}
        onSyncNow={() => {
          remindersHook.refresh();
          eventsHook.refresh();
          toast.success('Sincronización actualizada');
        }}
        onCreateReminder={() => setIsReminderModalOpen(true)}
        onCreateEvent={() => setIsEventModalOpen(true)}
        onCreateNote={() => handleCreateNoteAndOpen(null, 'Nueva nota')}
        onSaveReminder={async (payload) => await remindersHook.createReminder(payload)}
        onSaveEvent={async (payload) => await eventsHook.createEvent(payload)}
        onSaveNote={async (title, contentHtml) =>
          await handleCreateNoteAndOpen(null, title, contentHtml)
        }
      />

      {/* Quick Create Folder Modal */}
      <Modal
        isOpen={isFolderModalOpen}
        onClose={() => setIsFolderModalOpen(false)}
        title="Nueva carpeta"
        maxWidth="sm"
      >
        <form onSubmit={handleCreateFolderSubmit} className="space-y-4">
          <input
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Nombre de la carpeta..."
            autoFocus
            className="w-full bg-veyra-card border border-veyra-border rounded-xl px-3.5 py-2.5 text-sm text-veyra-text placeholder:text-veyra-subtle focus:outline-none focus:border-accent"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsFolderModalOpen(false)}
              className="px-3.5 py-2 rounded-xl text-xs font-medium text-veyra-muted hover:text-veyra-text cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!newFolderName.trim()}
              className="px-4 py-2 rounded-xl bg-accent text-white text-xs font-semibold disabled:opacity-40 cursor-pointer"
            >
              Crear carpeta
            </button>
          </div>
        </form>
      </Modal>

      <EventModal
        isOpen={isEventModalOpen}
        onClose={() => setIsEventModalOpen(false)}
        allNotes={allNotes}
        onSave={async (payload) => await eventsHook.createEvent(payload)}
      />

      <ReminderModal
        isOpen={isReminderModalOpen}
        onClose={() => setIsReminderModalOpen(false)}
        events={eventsHook.events}
        onSave={async (payload) => await remindersHook.createReminder(payload)}
      />

      <GlobalSearchModal
        isOpen={isGlobalSearchOpen}
        onClose={() => setIsGlobalSearchOpen(false)}
        notes={allNotes}
        folders={folders}
        events={eventsHook.events}
        reminders={remindersHook.reminders}
        templates={allTemplates}
        onSelectNote={(id) => handleSelectNote(id)}
        onSelectFolder={(folderId) => {
          setSelectedFolderId(folderId);
          setActiveTab('notes');
        }}
        onSelectEvent={(id) => handleSelectEvent(id)}
        onSelectReminder={(id) => handleSelectReminder(id)}
        onCreateFromTemplate={handleCreateFromTemplate}
        onCreateBlankNote={() => handleCreateNoteAndOpen(null, 'Nueva nota')}
        onOpenCalendar={handleOpenCalendar}
      />
    </div>
  );
};
