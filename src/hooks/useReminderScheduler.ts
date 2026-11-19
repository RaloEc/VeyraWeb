import { useEffect, useRef, useState, useCallback } from 'react';
import type { Reminder } from '../types/reminders';
import type { CalendarEvent } from './useEvents';
import { alertSoundPlayer } from '../lib/audio/alertSounds';
import type { AlertItem } from '../components/common/InAppReminderAlertModal';
import { useUserSettings } from '../context/UserSettingsContext';
import { expandOccurrences } from '../services/recurrence/recurrenceEngine';

interface UseReminderSchedulerProps {
  reminders: Reminder[];
  events?: CalendarEvent[];
  onCompleteReminder?: (id: string) => Promise<void> | void;
  onSnoozeReminder?: (id: string, minutes: number) => Promise<void> | void;
}

const BROADCAST_CHANNEL_NAME = 'veyra_alert_coordination';

function parseTimeMinutes(hhmm: string): number {
  const [hStr, mStr] = (hhmm || '').split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

export function isWithinQuietHours(now: Date, startStr: string, endStr: string): boolean {
  const curMin = now.getHours() * 60 + now.getMinutes();
  const startMin = parseTimeMinutes(startStr);
  const endMin = parseTimeMinutes(endStr);
  if (startMin === endMin) return false;
  if (startMin > endMin) {
    return curMin >= startMin || curMin < endMin;
  }
  return curMin >= startMin && curMin < endMin;
}

function parseEventOffsets(ev: CalendarEvent, defaultLeadMinutes: number): number[] {
  if (ev.notification_offsets) {
    try {
      const parsed = JSON.parse(ev.notification_offsets);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const nums = parsed.map(Number).filter((n) => Number.isFinite(n) && n >= 0);
        if (nums.length > 0) return nums;
      }
    } catch {
      // ignore malformed JSON
    }
  }
  if (typeof ev.notification_offset_min === 'number' && ev.notification_offset_min >= 0) {
    return [ev.notification_offset_min];
  }
  return [defaultLeadMinutes > 0 ? defaultLeadMinutes : 15];
}

export function useReminderScheduler({
  reminders,
  events = [],
  onCompleteReminder,
  onSnoozeReminder,
}: UseReminderSchedulerProps) {
  const { settings } = useUserSettings();
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
        triggeredSetRef.current.add(data.key);
      } else if (
        data.type === 'ALERT_DISMISSED' ||
        data.type === 'ALERT_COMPLETED' ||
        data.type === 'ALERT_SNOOZED'
      ) {
        setActiveAlert((current) => (current && current.id === data.id ? null : current));
      }
    };

    return () => {
      channel.close();
      broadcastChannelRef.current = null;
    };
  }, []);

  // Fire an alert
  const triggerAlert = useCallback(
    (item: AlertItem, alertKey: string) => {
      if (triggeredSetRef.current.has(alertKey)) return;
      triggeredSetRef.current.add(alertKey);

      broadcastChannelRef.current?.postMessage({
        type: 'ALERT_TRIGGERED',
        key: alertKey,
        id: item.id,
      });

      const isTabFocused =
        typeof document !== 'undefined' && document.hasFocus && document.hasFocus();

      const inQuietHours =
        settings.quietHoursEnabled &&
        isWithinQuietHours(new Date(), settings.quietHoursStart, settings.quietHoursEnd);
      const shouldPlaySound =
        settings.soundAlertsEnabled && (!inQuietHours || item.controlLevel === 'critical');

      // 1. Play offline synthesized audio if allowed by sound & quiet hours settings
      if (shouldPlaySound) {
        alertSoundPlayer.play(item.controlLevel);
      }

      // 2. If tab is focused, show in-app modal
      if (isTabFocused) {
        setActiveAlert(item);
      } else {
        // 3. Tab unfocused: Use Web Notification if permitted, and queue modal for focus
        if (
          typeof window !== 'undefined' &&
          'Notification' in window &&
          Notification.permission === 'granted'
        ) {
          try {
            const notif = new Notification(
              item.isEvent ? `Evento: ${item.title}` : `Recordatorio: ${item.title}`,
              {
                body:
                  item.description ||
                  (item.isEvent ? 'Evento agendado' : 'Tienes un recordatorio pendiente'),
                tag: item.isEvent ? `event-${item.id}` : `reminder-${item.id}`,
                requireInteraction:
                  item.controlLevel === 'critical' || item.controlLevel === 'strict',
                silent: !shouldPlaySound,
                icon: '/pwa-192x192.svg',
              }
            );

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
          setActiveAlert(item);
        }
      }
    },
    [settings.quietHoursEnabled, settings.quietHoursStart, settings.quietHoursEnd, settings.soundAlertsEnabled]
  );

  // Scheduler check loop (every 5 seconds)
  useEffect(() => {
    const checkSchedule = () => {
      const now = Date.now();

      // 1. Check Reminders
      for (const r of reminders) {
        if (r.status === 'completed' || r.deleted === 1) continue;

        const isSnoozed = Boolean(r.snooze_until_ms && r.snooze_until_ms > 0);
        const effectiveTime = isSnoozed ? r.snooze_until_ms! : r.due_date_ms;
        if (!effectiveTime) continue;

        const level = r.control_level || 'normal';
        const leadMinutes = isSnoozed
          ? 0
          : (typeof r.offset_minutes === 'number'
              ? r.offset_minutes
              : settings.defaultLeadMinutes || 0);

        // Optional advance lead notice before due_date_ms
        if (!isSnoozed && leadMinutes > 0) {
          const leadTime = effectiveTime - leadMinutes * 60 * 1000;
          const leadDiff = now - leadTime;
          if (leadDiff >= 0 && leadDiff < 5 * 60 * 1000 && now < effectiveTime) {
            const leadKey = `${r.id}-${effectiveTime}-lead-${leadMinutes}`;
            if (!triggeredSetRef.current.has(leadKey)) {
              triggerAlert(
                {
                  id: r.id,
                  title: `En ${leadMinutes} min: ${r.title}`,
                  description: r.description,
                  controlLevel: level,
                  dueDateMs: effectiveTime,
                  isEvent: false,
                },
                leadKey
              );
            }
          }
        }

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

      // 2. Check Calendar Events (including recurring occurrences & notification_offsets)
      const nowDate = new Date(now);
      const rangeStart = new Date(
        nowDate.getFullYear(),
        nowDate.getMonth(),
        nowDate.getDate(),
        0,
        0,
        0,
        0
      );
      // Look ahead 7 days to support offsets up to 1 week (10080 min)
      const rangeEnd = new Date(rangeStart.getTime() + 8 * 24 * 60 * 60 * 1000);

      for (const ev of events) {
        if (ev.deleted === 1) continue;

        const offsets = parseEventOffsets(ev, settings.defaultLeadMinutes || 0);
        const occurrences = expandOccurrences(
          {
            id: ev.id,
            start_time_ms: Number(ev.start_time_ms),
            end_time_ms: Number(ev.end_time_ms),
            repeat_rule: ev.repeat_rule,
            recurrence_rule: ev.recurrence_rule,
            timezone: ev.timezone,
            is_all_day: ev.is_all_day,
            all_day_date: ev.all_day_date,
          },
          rangeStart,
          rangeEnd
        );

        for (const occ of occurrences) {
          for (const offsetMin of offsets) {
            const triggerAtMs = occ.startTimeMs - offsetMin * 60 * 1000;
            const diff = now - triggerAtMs;
            if (diff >= 0 && diff < 5 * 60 * 1000) {
              const eventKey = `ev-${ev.id}-${occ.startTimeMs}-offset-${offsetMin}`;
              if (!triggeredSetRef.current.has(eventKey)) {
                const titlePrefix = offsetMin > 0 ? `En ${offsetMin} min: ` : '';
                triggerAlert(
                  {
                    id: ev.id,
                    title: `${titlePrefix}${ev.title}`,
                    description:
                      ev.description || (ev.location ? `Ubicación: ${ev.location}` : undefined),
                    controlLevel: 'normal',
                    dueDateMs: occ.startTimeMs,
                    isEvent: true,
                  },
                  eventKey
                );
              }
            }
          }
        }
      }
    };

    checkSchedule();
    const interval = setInterval(checkSchedule, 5000);
    return () => clearInterval(interval);
  }, [reminders, events, settings.defaultLeadMinutes, triggerAlert]);

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
