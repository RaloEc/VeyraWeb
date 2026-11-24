export interface AlertItem {
  alertKey: string;
  id: string;
  title: string;
  description?: string | null;
  controlLevel: 'normal' | 'critical' | string;
  dueDateMs: number;
  endDateMs?: number;
  isEvent?: boolean;
  isAllDay?: boolean;
  isLeadNotice?: boolean;
  leadMinutes?: number;
  location?: string | null;
  color?: string | null;
  notificationTag?: string;
}

export type InAppAlertKind = 'critical-modal' | 'event-toast' | 'reminder-toast';

/**
 * Classifies how an in-app alert must be presented:
 * - Events always show as a non-invasive informative toast.
 * - Due critical reminders (non-lead) are the only alerts shown as a persistent modal.
 * - Normal reminders and advance lead notices show as an actionable side toast.
 */
export function classifyInAppAlert(
  item: Pick<AlertItem, 'isEvent' | 'controlLevel' | 'isLeadNotice'>
): InAppAlertKind {
  if (item.isEvent) {
    return 'event-toast';
  }
  if (item.controlLevel?.toLowerCase() === 'critical' && !item.isLeadNotice) {
    return 'critical-modal';
  }
  return 'reminder-toast';
}

export function formatLeadTimeLabel(leadMinutes?: number): string | null {
  if (leadMinutes === undefined || leadMinutes === null || !Number.isFinite(leadMinutes)) {
    return null;
  }
  const mins = Math.round(leadMinutes);
  if (mins <= 0) {
    return 'Ahora';
  }
  if (mins < 60) {
    return `En ${mins} min`;
  }
  if (mins % 1440 === 0) {
    const days = mins / 1440;
    return days === 1 ? 'En 1 día' : `En ${days} días`;
  }
  if (mins % 60 === 0) {
    const hours = mins / 60;
    return hours === 1 ? 'En 1 h' : `En ${hours} h`;
  }
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `En ${hours} h ${remMins} min`;
}

function getLocalDayDiff(targetMs: number, nowMs: number): number {
  const target = new Date(targetMs);
  const now = new Date(nowMs);
  const targetDay = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((targetDay - nowDay) / (24 * 60 * 60 * 1000));
}

export function formatAlertTime(ms: number, use24h: boolean): string {
  return new Date(ms).toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: !use24h,
  });
}

export function formatEventSchedule(
  dueDateMs: number,
  endDateMs: number | undefined,
  isAllDay: boolean | undefined,
  use24h: boolean,
  nowMs: number = Date.now()
): string {
  const dayDiff = getLocalDayDiff(dueDateMs, nowMs);
  let datePrefix = '';
  if (dayDiff === 1) {
    datePrefix = 'Mañana · ';
  } else if (dayDiff !== 0) {
    const formattedDate = new Date(dueDateMs)
      .toLocaleDateString('es-ES', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      })
      .replace(/\./g, '');
    datePrefix = `${formattedDate} · `;
  }

  if (isAllDay) {
    return `${datePrefix}Todo el día`;
  }

  const startStr = formatAlertTime(dueDateMs, use24h);
  if (endDateMs && endDateMs > dueDateMs) {
    const endStr = formatAlertTime(endDateMs, use24h);
    return `${datePrefix}${startStr} – ${endStr}`;
  }
  return `${datePrefix}${startStr}`;
}

export function upsertAlertInQueue(
  queue: AlertItem[],
  incoming: AlertItem,
  mode: 'by-id' | 'by-key',
  maxItems?: number
): AlertItem[] {
  const matchIdx = queue.findIndex((entry) =>
    mode === 'by-id' ? entry.id === incoming.id : entry.alertKey === incoming.alertKey
  );

  let next: AlertItem[];
  if (matchIdx >= 0) {
    next = queue.map((entry, idx) => (idx === matchIdx ? incoming : entry));
  } else {
    next = [...queue, incoming];
  }

  if (typeof maxItems === 'number' && maxItems > 0 && next.length > maxItems) {
    return next.slice(next.length - maxItems);
  }
  return next;
}
