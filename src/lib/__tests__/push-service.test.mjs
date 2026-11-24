import test from 'node:test';
import assert from 'node:assert/strict';
import {
  urlBase64ToUint8Array,
  uint8ArrayToBase64Url,
  applicationServerKeysMatch,
  extractSubscriptionKeys,
  buildReminderNotificationTag,
  buildEventNotificationTag,
  parseEventNotificationOffsets,
  resolveServiceWorkerRegistration,
  formatPushSubscribeError,
} from '../pushUtils.ts';

test('urlBase64ToUint8Array and uint8ArrayToBase64Url round-trip VAPID key cleanly', () => {
  const vapidKey =
    'BN6CaKHTF5yD1p3DhLk7Wg9bcChY4OrYA7t8SSfsZ8Ca5BGU6qVRmzcb7kGU9QNkHLMyJ2exCnGMOMOpEIvKqQg';
  const bytes = urlBase64ToUint8Array(vapidKey);
  assert.equal(bytes.length, 65);
  assert.equal(bytes[0], 0x04);
  assert.equal(uint8ArrayToBase64Url(bytes), vapidKey);
});

test('applicationServerKeysMatch detects matching vs rotated VAPID keys', () => {
  const keyA = urlBase64ToUint8Array(
    'BN6CaKHTF5yD1p3DhLk7Wg9bcChY4OrYA7t8SSfsZ8Ca5BGU6qVRmzcb7kGU9QNkHLMyJ2exCnGMOMOpEIvKqQg'
  );
  const keyB = new Uint8Array(keyA);
  keyB[10] ^= 0xff;

  assert.equal(applicationServerKeysMatch(keyA.buffer, keyA), true);
  assert.equal(applicationServerKeysMatch(keyB.buffer, keyA), false);
  assert.equal(applicationServerKeysMatch(null, keyA), false);
});

test('extractSubscriptionKeys prefers base64url keys from toJSON and falls back to getKey', () => {
  const mockJsonSub = {
    toJSON: () => ({
      keys: {
        p256dh: 'abc-def_123',
        auth: 'xyz-987_654',
      },
    }),
  };
  assert.deepEqual(extractSubscriptionKeys(mockJsonSub), {
    p256dh: 'abc-def_123',
    auth: 'xyz-987_654',
  });

  const pBytes = new Uint8Array([0x04, 0xfb, 0xff, 0x3e]);
  const aBytes = new Uint8Array([0x01, 0xfe, 0xbf, 0x20]);
  const mockFallbackSub = {
    getKey: (name) => (name === 'p256dh' ? pBytes.buffer : aBytes.buffer),
  };
  const extracted = extractSubscriptionKeys(mockFallbackSub);
  assert.ok(extracted);
  // Base64url must not contain +, /, or =
  assert.equal(/[+/=]/.test(extracted.p256dh), false);
  assert.equal(/[+/=]/.test(extracted.auth), false);
});

test('resolveServiceWorkerRegistration times out cleanly instead of hanging when ready never settles', async () => {
  let registerCalled = 0;
  const hangingContainer = {
    getRegistration: async () => undefined,
    ready: new Promise(() => {
      // intentionally never resolves (simulating dev without SW)
    }),
  };

  const start = Date.now();
  const reg = await resolveServiceWorkerRegistration(
    hangingContainer,
    async () => {
      registerCalled++;
    },
    60
  );
  const elapsed = Date.now() - start;

  assert.equal(reg, null);
  assert.equal(registerCalled, 1);
  assert.ok(elapsed < 500, `Expected quick timeout, took ${elapsed}ms`);
});

test('resolveServiceWorkerRegistration returns active registration immediately without calling ready', async () => {
  const fakeReg = { active: { state: 'activated' } };
  let readyAccessed = false;
  const activeContainer = {
    getRegistration: async () => fakeReg,
    get ready() {
      readyAccessed = true;
      return Promise.resolve(fakeReg);
    },
  };

  const reg = await resolveServiceWorkerRegistration(activeContainer);
  assert.equal(reg, fakeReg);
  assert.equal(readyAccessed, false);
});

test('parseEventNotificationOffsets respects explicit empty array and deduplicates offsets', () => {
  assert.deepEqual(parseEventNotificationOffsets('[]', 15, 10), []);
  assert.deepEqual(parseEventNotificationOffsets('[30, 10, 30, -5]', 15, 10), [30, 10]);
  assert.deepEqual(parseEventNotificationOffsets(null, 5, 15), [5]);
  assert.deepEqual(parseEventNotificationOffsets(null, null, 20), [20]);
  assert.deepEqual(parseEventNotificationOffsets(null, null, 0), [15]);
});

test('notification tags are deterministic', () => {
  assert.equal(buildReminderNotificationTag('r-1'), 'reminder-r-1');
  assert.equal(buildEventNotificationTag('e-1', 1795440000000, 15), 'event-e-1-1795440000000-15');
});

test('formatPushSubscribeError maps AbortError for Brave vs standard browsers and other errors', () => {
  const abortErr = Object.assign(new Error('Registration failed - push service error'), {
    name: 'AbortError',
  });

  const braveMsg = formatPushSubscribeError(abortErr, { isBrave: true, isSecureContext: true });
  assert.ok(braveMsg.includes('brave://settings/privacy'));

  const genericMsg = formatPushSubscribeError(abortErr, { isBrave: false, isSecureContext: true });
  assert.ok(genericMsg.includes('incógnito') && genericMsg.includes('FCM'));

  const insecureMsg = formatPushSubscribeError(abortErr, { isSecureContext: false });
  assert.ok(insecureMsg.includes('HTTPS'));

  const deniedErr = Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
  assert.ok(formatPushSubscribeError(deniedErr).includes('candado'));
});
