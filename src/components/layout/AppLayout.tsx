import React, { useState, useEffect } from 'react';
import { RemindersModule } from '../../modules/reminders/RemindersModule';
import { NotesModule } from '../../modules/notes/NotesModule';
import { useReminders } from '../../hooks/useReminders';
import { useNotes } from '../../hooks/useNotes';
import { useEvents } from '../../hooks/useEvents';
import type { User } from '@supabase/supabase-js';
import type { Database } from '../../types/database';

export type ActiveModule = 'reminders' | 'notes';

type Profile = Database['public']['Tables']['profiles']['Row'];

function parseInitialRoute() {
  if (typeof window === 'undefined') {
    return {
      module: 'notes' as ActiveModule,
      noteId: null as string | null,
      eventId: null as string | null,
      reminderId: null as string | null,
      folderId: null as string | null,
    };
  }
  const path = window.location.pathname;
  const searchParams = new URLSearchParams(window.location.search);
  const folderId = searchParams.get('folder');

  if (path === '/reminders' || path === '/reminders/') {
    return {
      module: 'reminders' as ActiveModule,
      noteId: null,
      eventId: null,
      reminderId: null,
      folderId,
    };
  }

  const reminderMatch = path.match(/^\/reminders\/([^/?#]+)/);
  if (reminderMatch) {
    return {
      module: 'notes' as ActiveModule,
      noteId: null,
      eventId: null,
      reminderId: reminderMatch[1],
      folderId,
    };
  }

  const eventMatch = path.match(/^\/events\/([^/?#]+)/);
  if (eventMatch) {
    return {
      module: 'notes' as ActiveModule,
      noteId: null,
      eventId: eventMatch[1],
      reminderId: null,
      folderId,
    };
  }

  const noteMatch = path.match(/^\/notes\/([^/?#]+)/);
  return {
    module: 'notes' as ActiveModule,
    noteId: noteMatch ? noteMatch[1] : null,
    eventId: null,
    reminderId: null,
    folderId,
  };
}

export interface AppLayoutProps {
  user: User;
  profile: Profile | null;
  onSignOut: () => void;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ user, profile, onSignOut }) => {
  const initialRoute = parseInitialRoute();
  const [activeModule, setActiveModule] = useState<ActiveModule>(initialRoute.module);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem('veyra_sidebar_open');
    return stored !== null ? stored === 'true' : true; // Desplegada por defecto (true)
  });

  const remindersState = useReminders(user.id);
  const notesState = useNotes(user.id, initialRoute.noteId);
  const eventsState = useEvents(user.id);

  // If a folder was requested in query params, select it
  useEffect(() => {
    if (initialRoute.folderId) {
      notesState.setSelectedFolderId(initialRoute.folderId);
    }
  }, [initialRoute.folderId, notesState.setSelectedFolderId]);

  // Synchronize route changes on popstate
  useEffect(() => {
    const handlePopState = () => {
      const route = parseInitialRoute();
      setActiveModule(route.module);
      if (route.noteId) {
        notesState.setSelectedNoteId(route.noteId);
      } else if (!route.eventId && !route.reminderId) {
        notesState.setSelectedNoteId(null);
      }
      if (route.folderId) {
        notesState.setSelectedFolderId(route.folderId);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [notesState.setSelectedNoteId, notesState.setSelectedFolderId]);

  const toggleSidebar = () => {
    setIsSidebarOpen((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('veyra_sidebar_open', String(next));
      }
      return next;
    });
  };

  // Keyboard shortcut: Ctrl+\ or Cmd+\ to toggle sidebar in notes view
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="h-screen bg-veyra-canvas text-veyra-text flex flex-col overflow-hidden">
      {/* Main Workspace (Full width: Note editor and Folders sidebar have full stage) */}
      <main className="flex-1 flex overflow-hidden bg-veyra-canvas h-full">
        {activeModule === 'reminders' ? (
          <RemindersModule userId={user.id} remindersHook={remindersState} eventsHook={eventsState} />
        ) : (
          <NotesModule
            userId={user.id}
            userEmail={user.email || ''}
            userName={profile?.user_profile || user.email?.split('@')[0]}
            notesHook={notesState}
            remindersHook={remindersState}
            initialEventId={initialRoute.eventId}
            initialReminderId={initialRoute.reminderId}
            isSidebarOpen={isSidebarOpen}
            onToggleSidebar={toggleSidebar}
            onSignOut={onSignOut}
          />
        )}
      </main>
    </div>
  );
};
