import React, { useState, useEffect } from 'react';
import { RemindersModule } from '../../modules/reminders/RemindersModule';
import { NotesModule } from '../../modules/notes/NotesModule';
import { MobileAppShell } from '../../modules/mobile/MobileAppShell';
import { useReminders } from '../../hooks/useReminders';
import { useNotes } from '../../hooks/useNotes';
import { useEvents } from '../../hooks/useEvents';
import { useReminderScheduler } from '../../hooks/useReminderScheduler';
import { InAppReminderAlertModal } from '../common/InAppReminderAlertModal';
import { InAppAlertToastContainer } from '../common/InAppAlertToastContainer';
import { PushService } from '../../lib/pushService';
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

  if (path.startsWith('/calendar') || path.startsWith('/agenda')) {
    return {
      module: 'notes' as ActiveModule,
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
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 768;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 767px)');
    const handleChange = () => setIsMobileViewport(mq.matches);
    handleChange();
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, []);

  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    // En móviles (< 768px), iniciar con el sidebar cerrado para dar protagonismo al contenido
    if (window.innerWidth < 768) return false;
    const stored = localStorage.getItem('veyra_sidebar_open');
    return stored !== null ? stored === 'true' : true; // Desplegada por defecto en desktop
  });

  const remindersState = useReminders(user.id);
  const notesState = useNotes(user.id, initialRoute.noteId);
  const eventsState = useEvents(user.id);

  // In-App Reminder Scheduler & Alert Coordination
  const {
    activeCriticalAlert,
    criticalAlertCount,
    toastAlerts,
    use24h,
    handleComplete,
    handleSnooze,
    handleDismissToast,
  } = useReminderScheduler({
    reminders: remindersState.reminders,
    events: eventsState.events,
    onCompleteReminder: async (id) => {
      const r = remindersState.reminders.find((item) => item.id === id);
      if (r && r.status !== 'completed') {
        await remindersState.toggleReminder(id, r.status);
      }
    },
    onSnoozeReminder: async (id, minutes) => {
      await remindersState.snoozeReminder(id, minutes);
    },
  });

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

  // Keep Web Push subscription synced on launch and handle SW pushsubscriptionchange
  useEffect(() => {
    if (!user?.id) return;
    PushService.syncIfSubscribed(user.id).catch(() => { });

    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const handleSwMessage = (event: MessageEvent) => {
      if (event.data?.type === 'PUSH_SUBSCRIPTION_CHANGED') {
        PushService.syncIfSubscribed(user.id).catch(() => { });
      }
    };
    navigator.serviceWorker.addEventListener('message', handleSwMessage);
    return () => navigator.serviceWorker.removeEventListener('message', handleSwMessage);
  }, [user?.id]);

  return (
    <div className="h-screen h-[100dvh] bg-veyra-canvas text-veyra-text flex flex-col overflow-hidden">
      {/* Main Workspace: Dedicated Mobile App Shell on <768px, Desktop Workspace on >=768px */}
      <main className="flex-1 flex overflow-hidden bg-veyra-canvas h-full">
        {isMobileViewport ? (
          <MobileAppShell
            userId={user.id}
            userEmail={user.email || ''}
            userName={user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0]}
            notesHook={notesState}
            remindersHook={remindersState}
            eventsHook={eventsState}
            initialEventId={initialRoute.eventId}
            initialReminderId={initialRoute.reminderId}
            onSignOut={onSignOut}
          />
        ) : activeModule === 'reminders' ? (
          <RemindersModule
            userId={user.id}
            defaultControlLevel={profile?.default_control_level}
            remindersHook={remindersState}
            eventsHook={eventsState}
          />
        ) : (
          <NotesModule
            userId={user.id}
            userEmail={user.email || ''}
            userName={user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0]}
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

      {/* Non-invasive Side Toasts (Events & Normal Reminders) */}
      <InAppAlertToastContainer
        items={toastAlerts}
        use24h={use24h}
        onComplete={handleComplete}
        onSnooze={handleSnooze}
        onDismiss={handleDismissToast}
      />

      {/* Persistent Blocking Modal (Critical Reminders Only) */}
      <InAppReminderAlertModal
        item={activeCriticalAlert}
        queueCount={criticalAlertCount}
        use24h={use24h}
        onComplete={handleComplete}
      />
    </div>
  );
};
