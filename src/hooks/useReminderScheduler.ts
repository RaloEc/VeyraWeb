import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import type { Reminder } from '../types/reminders';
import type { CalendarEvent } from './useEvents';
import { alertSoundPlayer } from '../lib/audio/alertSounds';
import {
  type AlertItem,
  classifyInAppAlert,
  formatLeadTimeLabel,
  upsertAlertInQueue,
} from '../lib/inAppAlertLogic';
import { useUserSettings } from '../context/UserSettingsContext';
import { expandOccurrences } from '../services/recurrence/recurrenceEngine';
import {
  buildEventNotificationTag,
  buildReminderNotificationTag,
  parseEventNotificationOffsets,
} from '../lib/pushUtils';

interface UseReminderSchedulerProps {
  reminders: Reminder[];
  events?: CalendarEvent[];
  onCompleteReminder?: (id: string) => Promise<void> | void;
  onSnoozeReminder?: (id: string, minutes: number) => Promise<void> | void;
}

const BROADCAST_CHANNEL_NAME = 'veyra_alert_coordination';
const MAX_VISIBLE_TOASTS = 4;

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
  return parseEventNotificationOffsets(
    ev.notification_offsets,
    ev.notification_offset_min,
    defaultLeadMinutes
  );
}

export function useReminderScheduler({
  reminders,
  events = [],
  onCompleteReminder,
  onSnoozeReminder,
}: UseReminderSchedulerProps) {
  const { settings } = useUserSettings();
  const [criticalAlerts, setCriticalAlerts] = useState<AlertItem[]>([]);
  const [toastAlerts, setToastAlerts] = useState<AlertItem[]>([]);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  // Set of alert keys we have already triggered in this session
  const triggeredSetRef = useRef<Set<string>>(new Set());

  const enqueueInAppAlert = useCallback((item: AlertItem) => {
    if (classifyInAppAlert(item) === 'critical-modal') {
      setCriticalAlerts((prev) => upsertAlertInQueue(prev, item, 'by-id'));
    } else {
      setToastAlerts((prev) => upsertAlertInQueue(prev, item, 'by-key', MAX_VISIBLE_TOASTS));
    }
  }, []);

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
      } else if (data.type === 'ALERT_COMPLETED' || data.type === 'ALERT_SNOOZED') {
        setCriticalAlerts((prev) => prev.filter((entry) => entry.id !== data.id));
        setToastAlerts((prev) => prev.filter((entry) => entry.id !== data.id));
      } else if (data.type === 'ALERT_DISMISSED') {
        // Never dismiss critical modals from ALERT_DISMISSED; only close matching side toasts
        setToastAlerts((prev) =>
          prev.filter((entry) =>
            data.alertKey ? entry.alertKey !== data.alertKey : entry.id !== data.id
          )
        );
      }
    };

    return () => {
      channel.close();
      broadcastChannelRef.current = null;
    };
  }, []);

  // Derive active alerts filtered against current reminders (so external completion/deletion/snooze hides them immediately)
  const { visibleCriticalAlerts, visibleToastAlerts } = useMemo(() => {
    const reminderById = new Map(reminders.map((r) => [r.id, r]));

    const isStillActiveReminder = (entry: AlertItem) => {
      if (entry.isEvent) return true;
      const current = reminderById.get(entry.id);
      if (!current) return false;
      if (current.status === 'completed' || current.deleted === 1) return false;
      if (current.snooze_until_ms && current.snooze_until_ms > entry.dueDateMs) return false;
      return true;
    };

    return {
      visibleCriticalAlerts: criticalAlerts.filter(isStillActiveReminder),
      visibleToastAlerts: toastAlerts.filter(isStillActiveReminder),
    };
  }, [criticalAlerts, toastAlerts, reminders]);

  // Fire an alert
  const triggerAlert = useCallback(
    (itemWithoutKey: Omit<AlertItem, 'alertKey'> & { alertKey?: string }, alertKey: string) => {
      if (triggeredSetRef.current.has(alertKey)) return;
      triggeredSetRef.current.add(alertKey);

      const item: AlertItem = {
        ...itemWithoutKey,
        alertKey,
      };

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

      const alertKind = classifyInAppAlert(item);
      const leadLabel = formatLeadTimeLabel(item.leadMinutes);

      // 2. Critical reminders always enter the persistent modal queue so they await explicit completion
      if (alertKind === 'critical-modal') {
        enqueueInAppAlert(item);

        if (
          !isTabFocused &&
          typeof window !== 'undefined' &&
          'Notification' in window &&
          Notification.permission === 'granted'
        ) {
          try {
            const notif = new Notification(`Recordatorio crítico: ${item.title}`, {
              body: item.description || 'Requiere confirmación de completado',
              tag: item.notificationTag || buildReminderNotificationTag(item.id),
              requireInteraction: true,
              silent: !shouldPlaySound,
              icon: '/pwa-192x192.png',
              badge: '/pwa-badge-96x96.png',
            });

            notif.onclick = () => {
              window.focus();
              notif.close();
            };
          } catch (e) {
            console.warn('[useReminderScheduler] Native notification failed:', e);
          }
        }
        return;
      }

      // 3. Events and normal/lead reminders: show side toast if focused, else Web Notification
      if (isTabFocused) {
        enqueueInAppAlert(item);
      } else if (
        typeof window !== 'undefined' &&
        'Notification' in window &&
        Notification.permission === 'granted'
      ) {
        try {
          const notifTitle = item.isEvent
            ? leadLabel && (item.leadMinutes ?? 0) > 0
              ? `Evento (${leadLabel}): ${item.title}`
              : `Evento: ${item.title}`
            : item.isLeadNotice && leadLabel
              ? `Recordatorio (${leadLabel}): ${item.title}`
              : `Recordatorio: ${item.title}`;

          const notifBody =
            item.description ||
            (item.isEvent
              ? item.location
                ? `Ubicación: ${item.location}`
                : 'Evento agendado'
              : 'Tienes un recordatorio pendiente');

          const notif = new Notification(notifTitle, {
            body: notifBody,
            tag:
              item.notificationTag ||
              (item.isEvent ? `event-${item.id}` : buildReminderNotificationTag(item.id)),
            requireInteraction: false,
            silent: !shouldPlaySound,
            icon: '/pwa-192x192.png',
            badge: '/pwa-badge-96x96.png',
          });

          notif.onclick = () => {
            window.focus();
            enqueueInAppAlert(item);
            notif.close();
          };
        } catch (e) {
          console.warn('[useReminderScheduler] Native notification failed:', e);
          enqueueInAppAlert(item);
        }
      } else {
        enqueueInAppAlert(item);
      }
    },
    [
      enqueueInAppAlert,
      settings.quietHoursEnabled,
      settings.quietHoursStart,
      settings.quietHoursEnd,
      settings.soundAlertsEnabled,
    ]
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

        const level = r.control_level?.toLowerCase() === 'critical' ? 'critical' : 'normal';
        const leadMinutes = isSnoozed
          ? 0
          : typeof r.offset_minutes === 'number'
            ? r.offset_minutes
            : settings.defaultLeadMinutes || 0;

        // Optional advance lead notice before due_date_ms (always non-invasive toast)
        if (!isSnoozed && leadMinutes > 0) {
          const leadTime = effectiveTime - leadMinutes * 60 * 1000;
          const leadDiff = now - leadTime;
          if (leadDiff >= 0 && leadDiff < 5 * 60 * 1000 && now < effectiveTime) {
            const leadKey = `${r.id}-${effectiveTime}-lead-${leadMinutes}`;
            if (!triggeredSetRef.current.has(leadKey)) {
              triggerAlert(
                {
                  alertKey: leadKey,
                  id: r.id,
                  title: r.title,
                  description: r.description,
                  controlLevel: level,
                  dueDateMs: effectiveTime,
                  isEvent: false,
                  isLeadNotice: true,
                  leadMinutes,
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
                alertKey: baseKey,
                id: r.id,
                title: r.title,
                description: r.description,
                controlLevel: level,
                dueDateMs: effectiveTime,
                isEvent: false,
                isLeadNotice: false,
                leadMinutes: 0,
              },
              baseKey
            );
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
                    alertKey: followKey,
                    id: r.id,
                    title: `[Urgente ${i + 1}] ${r.title}`,
                    description: r.description,
                    controlLevel: 'critical',
                    dueDateMs: effectiveTime,
                    isEvent: false,
                    isLeadNotice: false,
                    leadMinutes: 0,
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
                triggerAlert(
                  {
                    alertKey: eventKey,
                    id: ev.id,
                    title: ev.title,
                    description: ev.description,
                    location: ev.location,
                    color: ev.color,
                    isAllDay: Boolean(ev.is_all_day),
                    controlLevel: 'normal',
                    dueDateMs: occ.startTimeMs,
                    endDateMs: occ.endTimeMs,
                    leadMinutes: offsetMin,
                    isEvent: true,
                    notificationTag: buildEventNotificationTag(ev.id, occ.startTimeMs, offsetMin),
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
      setCriticalAlerts((prev) => prev.filter((entry) => entry.id !== id));
      setToastAlerts((prev) => prev.filter((entry) => entry.id !== id));
      broadcastChannelRef.current?.postMessage({ type: 'ALERT_COMPLETED', id });
      if (onCompleteReminder) {
        await onCompleteReminder(id);
      }
    },
    [onCompleteReminder]
  );

  const handleSnooze = useCallback(
    async (id: string, minutes: number) => {
      setToastAlerts((prev) => prev.filter((entry) => entry.id !== id));
      broadcastChannelRef.current?.postMessage({ type: 'ALERT_SNOOZED', id, minutes });
      if (onSnoozeReminder) {
        await onSnoozeReminder(id, minutes);
      }
    },
    [onSnoozeReminder]
  );

  const handleDismissToast = useCallback((alertKey: string) => {
    setToastAlerts((prev) => prev.filter((entry) => entry.alertKey !== alertKey));
    broadcastChannelRef.current?.postMessage({
      type: 'ALERT_DISMISSED',
      alertKey,
    });
  }, []);

  return {
    activeCriticalAlert: visibleCriticalAlerts[0] ?? null,
    criticalAlertCount: visibleCriticalAlerts.length,
    toastAlerts: visibleToastAlerts,
    use24h: settings.timeFormat24h,
    handleComplete,
    handleSnooze,
    handleDismissToast,
  };
}
