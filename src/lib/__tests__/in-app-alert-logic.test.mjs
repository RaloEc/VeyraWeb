import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyInAppAlert,
  formatLeadTimeLabel,
  formatEventSchedule,
  upsertAlertInQueue,
} from '../inAppAlertLogic.ts';

test('classifyInAppAlert routes events to event-toast regardless of controlLevel', () => {
  assert.equal(
    classifyInAppAlert({ isEvent: true, controlLevel: 'normal', isLeadNotice: false }),
    'event-toast'
  );
  assert.equal(
    classifyInAppAlert({ isEvent: true, controlLevel: 'critical', isLeadNotice: false }),
    'event-toast'
  );
});

test('classifyInAppAlert routes only due non-lead critical reminders to critical-modal', () => {
  assert.equal(
    classifyInAppAlert({ isEvent: false, controlLevel: 'critical', isLeadNotice: false }),
    'critical-modal'
  );
  assert.equal(
    classifyInAppAlert({ isEvent: false, controlLevel: 'CRITICAL', isLeadNotice: undefined }),
    'critical-modal'
  );
  assert.equal(
    classifyInAppAlert({ isEvent: false, controlLevel: 'critical', isLeadNotice: true }),
    'reminder-toast'
  );
  assert.equal(
    classifyInAppAlert({ isEvent: false, controlLevel: 'normal', isLeadNotice: false }),
    'reminder-toast'
  );
  assert.equal(
    classifyInAppAlert({ isEvent: false, controlLevel: 'strict', isLeadNotice: false }),
    'reminder-toast'
  );
});

test('formatLeadTimeLabel formats minutes, hours, days, and zero cleanly', () => {
  assert.equal(formatLeadTimeLabel(undefined), null);
  assert.equal(formatLeadTimeLabel(0), 'Ahora');
  assert.equal(formatLeadTimeLabel(15), 'En 15 min');
  assert.equal(formatLeadTimeLabel(60), 'En 1 h');
  assert.equal(formatLeadTimeLabel(90), 'En 1 h 30 min');
  assert.equal(formatLeadTimeLabel(1440), 'En 1 día');
  assert.equal(formatLeadTimeLabel(2880), 'En 2 días');
});

test('formatEventSchedule formats same-day ranges, all-day, tomorrow, and 24h vs 12h', () => {
  const baseNow = new Date(2026, 10, 23, 10, 0, 0).getTime();
  const sameDayStart = new Date(2026, 10, 23, 17, 0, 0).getTime();
  const sameDayEnd = new Date(2026, 10, 23, 18, 30, 0).getTime();
  const tomorrowStart = new Date(2026, 10, 24, 9, 15, 0).getTime();

  const sameDay24h = formatEventSchedule(sameDayStart, sameDayEnd, false, true, baseNow);
  assert.equal(sameDay24h, '17:00 – 18:30');

  const sameDay12h = formatEventSchedule(sameDayStart, sameDayEnd, false, false, baseNow);
  assert.ok(sameDay12h.includes('5:00') && sameDay12h.includes('6:30'));

  const allDaySameDay = formatEventSchedule(sameDayStart, sameDayEnd, true, true, baseNow);
  assert.equal(allDaySameDay, 'Todo el día');

  const tomorrowAllDay = formatEventSchedule(tomorrowStart, undefined, true, true, baseNow);
  assert.equal(tomorrowAllDay, 'Mañana · Todo el día');

  const tomorrowTimed = formatEventSchedule(tomorrowStart, undefined, false, true, baseNow);
  assert.equal(tomorrowTimed, 'Mañana · 09:15');
});

test('upsertAlertInQueue deduplicates critical modals by id and trims toast queues by maxItems', () => {
  const baseCritical = {
    alertKey: 'rem-1-base',
    id: 'rem-1',
    title: 'Pagar factura',
    controlLevel: 'critical',
    dueDateMs: 1000,
    isEvent: false,
  };
  const escalatedCritical = {
    ...baseCritical,
    alertKey: 'rem-1-critical-1',
    title: '[Urgente 1] Pagar factura',
  };

  let modalQueue = upsertAlertInQueue([], baseCritical, 'by-id');
  modalQueue = upsertAlertInQueue(modalQueue, escalatedCritical, 'by-id');
  assert.equal(modalQueue.length, 1);
  assert.equal(modalQueue[0].title, '[Urgente 1] Pagar factura');
  assert.equal(modalQueue[0].alertKey, 'rem-1-critical-1');

  let toastQueue = [];
  for (let i = 1; i <= 5; i++) {
    toastQueue = upsertAlertInQueue(
      toastQueue,
      {
        alertKey: `ev-${i}`,
        id: `ev-${i}`,
        title: `Evento ${i}`,
        controlLevel: 'normal',
        dueDateMs: i * 1000,
        isEvent: true,
      },
      'by-key',
      4
    );
  }
  assert.equal(toastQueue.length, 4);
  assert.deepEqual(
    toastQueue.map((t) => t.alertKey),
    ['ev-2', 'ev-3', 'ev-4', 'ev-5']
  );

  // Updating an existing key keeps position and updates payload
  toastQueue = upsertAlertInQueue(
    toastQueue,
    {
      alertKey: 'ev-3',
      id: 'ev-3',
      title: 'Evento 3 actualizado',
      controlLevel: 'normal',
      dueDateMs: 3000,
      isEvent: true,
    },
    'by-key',
    4
  );
  assert.equal(toastQueue.length, 4);
  assert.equal(toastQueue[1].title, 'Evento 3 actualizado');
});
