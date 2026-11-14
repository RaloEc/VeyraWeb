import { useEffect, useRef, useState, useCallback } from 'react';
import type { Reminder } from '../types/reminders';
import type { CalendarEvent } from './useEvents';
import { alertSoundPlayer } from '../lib/audio/alertSounds';
import type { AlertItem } from '../components/common/InAppReminderAlertModal';

interface UseReminderSchedulerProps {
  reminders: Reminder[];
  events?: CalendarEvent[];
  onCompleteReminder?: (id: string) => Promise<void> | void;
  onSnoozeReminder?: (id: string, minutes: number) => Promise<void> | void;
}

const BROADCAST_CHANNEL_NAME = 'veyra_alert_coordination';

export function useReminderScheduler({
  reminders,
  events = [],
  onCompleteReminder,
  onSnoozeReminder,
}: UseReminderSchedulerProps) {
  const [activeAlert, setActiveAlert] = useState<AlertItem | null>(null);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  // Set of alert keys we have already triggered in this session: `${id}-${triggerTimestamp}`
  const triggeredSetRef = useRef<Set<string>>(new Set());

  // Setup BroadcastChannel for tab coordination
  useEffect(() => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;

    const channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    broadcastChannelRef.current = channel;

    channel.onmessage = (event) => {
      const data = event.data;
      if (!data) return;

      if (data.type === 'ALERT_TRIGGERED') {
        // Mark as triggered so this tab doesn't sound duplicate alarm
        triggeredSetRef.current.add(data.key);
      } else if (data.type === 'ALERT_DISMISSED' || data.type === 'ALERT_COMPLETED' || data.type === 'ALERT_SNOOZED') {
        // Close modal if active for this reminder
        setActiveAlert((current) => (current && current.id === data.id ? null : current));
      }
    };

    return () => {
      channel.close();
      broadcastChannelRef.current = null;
    };
  }, []);

  // Fire an alert
  const triggerAlert = useCallback((item: AlertItem, alertKey: string) => {
    if (triggeredSetRef.current.has(alertKey)) return;
    triggeredSetRef.current.add(alertKey);

    // Notify other tabs to avoid duplicate audio
    broadcastChannelRef.current?.postMessage({
      type: 'ALERT_TRIGGERED',
      key: alertKey,
      id: item.id,
    });

    const isTabFocused = typeof document !== 'undefined' && document.hasFocus && document.hasFocus();

    // 1. Play offline synthesized audio
    alertSoundPlayer.play(item.controlLevel);

    // 2. If tab is focused, show in-app modal
    if (isTabFocused) {
      setActiveAlert(item);
    } else {
      // 3. Tab unfocused: Use Web Notification if permitted, and queue modal for focus
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        try {
          const notif = new Notification(`Recordatorio: ${item.title}`, {
            body: item.description || (item.isEvent ? 'Evento agendado' : 'Tienes un recordatorio pendiente'),
            tag: `reminder-${item.id}`,
            requireInteraction: item.controlLevel === 'critical' || item.controlLevel === 'strict',
            icon: '/pwa-192x192.svg',
          });

          notif.onclick = () => {
            window.focus();
            setActiveAlert(item);
            notif.close();
          };
        } catch (e) {
          console.warn('[useReminderScheduler] Native notification failed:', e);
          setActiveAlert(item);
        }
      } else {
        // Fallback: show modal anyway so user sees it when returning
        setActiveAlert(item);
      }
    }
  }, []);

  // Scheduler check loop (every 5 seconds)
  useEffect(() => {
    const checkSchedule = () => {
      const now = Date.now();

      // 1. Check Reminders
      for (const r of reminders) {
        if (r.status === 'completed' || r.deleted === 1) continue;

        // Effective trigger time (snooze takes precedence)
        let effectiveTime = r.due_date_ms;
        if (r.snooze_until_ms && r.snooze_until_ms > 0) {
          effectiveTime = r.snooze_until_ms;
        }

        if (!effectiveTime) continue;

        const level = r.control_level || 'normal';
        const diff = now - effectiveTime;

        // Base notification: trigger within a 15-minute window if not yet fired
        if (diff >= 0 && diff < 15 * 60 * 1000) {
          const baseKey = `${r.id}-${effectiveTime}-base`;
          if (!triggeredSetRef.current.has(baseKey)) {
            triggerAlert(
              {
                id: r.id,
                title: r.title,
                description: r.description,
                controlLevel: level,
                dueDateMs: effectiveTime,
                isEvent: false,
              },
              baseKey
            );
          }
        }

        // Insistence follow-ups for 'strict' (every 15m, max 2)
        if (level === 'strict' && diff > 0) {
          const followUps = [15 * 60 * 1000, 30 * 60 * 1000];
          for (let i = 0; i < followUps.length; i++) {
            const followTime = followUps[i];
            if (diff >= followTime && diff < followTime + 10 * 60 * 1000) {
              const followKey = `${r.id}-${effectiveTime}-strict-${i + 1}`;
              if (!triggeredSetRef.current.has(followKey)) {
                triggerAlert(
                  {
                    id: r.id,
                    title: `[Reintento ${i + 1}] ${r.title}`,
                    description: r.description,
                    controlLevel: 'strict',
                    dueDateMs: effectiveTime,
                    isEvent: false,
                  },
                  followKey
                );
              }
            }
          }
        }

        // Insistence follow-ups for 'critical' (every 5m, max 5)
        if (level === 'critical' && diff > 0) {
          const followUps = [
            5 * 60 * 1000,
            10 * 60 * 1000,
            15 * 60 * 1000,
            20 * 60 * 1000,
            25 * 60 * 1000,
          ];
          for (let i = 0; i < followUps.length; i++) {
            const followTime = followUps[i];
            if (diff >= followTime && diff < followTime + 5 * 60 * 1000) {
              const followKey = `${r.id}-${effectiveTime}-critical-${i + 1}`;
              if (!triggeredSetRef.current.has(followKey)) {
                triggerAlert(
                  {
                    id: r.id,
                    title: `[Urgente ${i + 1}] ${r.title}`,
                    description: r.description,
                    controlLevel: 'critical',
                    dueDateMs: effectiveTime,
                    isEvent: false,
                  },
                  followKey
                );
              }
            }
          }
        }
      }

      // 2. Check Calendar Events (start_time_ms)
      for (const ev of events) {
        if (ev.deleted === 1) continue;
        const diff = now - ev.start_time_ms;
        // Trigger at start time or within 5 min
        if (diff >= 0 && diff < 5 * 60 * 1000) {
          const eventKey = `ev-${ev.id}-${ev.start_time_ms}`;
          if (!triggeredSetRef.current.has(eventKey)) {
            triggerAlert(
              {
                id: ev.id,
                title: ev.title,
                description: ev.description || (ev.location ? `Ubicación: ${ev.location}` : undefined),
                controlLevel: 'normal',
                dueDateMs: ev.start_time_ms,
                isEvent: true,
              },
              eventKey
            );
          }
        }
      }
    };

    // Run immediately then poll every 5s
    checkSchedule();
    const interval = setInterval(checkSchedule, 5000);
    return () => clearInterval(interval);
  }, [reminders, events, triggerAlert]);

  // Actions
  const handleComplete = useCallback(
    async (id: string) => {
      setActiveAlert(null);
      broadcastChannelRef.current?.postMessage({ type: 'ALERT_COMPLETED', id });
      if (onCompleteReminder) {
        await onCompleteReminder(id);
      }
    },
    [onCompleteReminder]
  );

  const handleSnooze = useCallback(
    async (id: string, minutes: number) => {
      setActiveAlert(null);
      broadcastChannelRef.current?.postMessage({ type: 'ALERT_SNOOZED', id, minutes });
      if (onSnoozeReminder) {
        await onSnoozeReminder(id, minutes);
      }
    },
    [onSnoozeReminder]
  );

  const handleDismiss = useCallback(() => {
    if (activeAlert) {
      broadcastChannelRef.current?.postMessage({
        type: 'ALERT_DISMISSED',
        id: activeAlert.id,
      });
    }
    setActiveAlert(null);
  }, [activeAlert]);

  return {
    activeAlert,
    handleComplete,
    handleSnooze,
    handleDismiss,
  };
}
