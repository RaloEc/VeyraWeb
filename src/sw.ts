/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { StaleWhileRevalidate, CacheFirst, NetworkOnly } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

declare let self: ServiceWorkerGlobalScope;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://rrwoompvuggcczggfgiq.supabase.co';
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_5y3OReimX6RP2Tcpl8Ailw_V52PADlk';
const VAPID_PUBLIC_KEY =
  import.meta.env.VITE_VAPID_PUBLIC_KEY ||
  'BN6CaKHTF5yD1p3DhLk7Wg9bcChY4OrYA7t8SSfsZ8Ca5BGU6qVRmzcb7kGU9QNkHLMyJ2exCnGMOMOpEIvKqQg';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// 1. Clean up outdated caches from previous versions
cleanupOutdatedCaches();

// 2. Precache all build assets injected by VitePWA (guarded for dev mode when manifest is empty)
const wbManifest = self.__WB_MANIFEST;
if (Array.isArray(wbManifest) && wbManifest.length > 0) {
  precacheAndRoute(wbManifest);

  // 3. SPA Client-Side Routing: redirect navigations to index.html
  try {
    const handler = createHandlerBoundToURL('/index.html');
    const navigationRoute = new NavigationRoute(handler, {
      // Exclude API requests, files with extensions, etc.
      denylist: [/^\/_/, /^\/api\//, /^\/rest\/v1\//, /^\/auth\/v1\//, /^\/functions\/v1\//],
    });
    registerRoute(navigationRoute);
  } catch (err) {
    console.warn('[SW] Navigation route registration error:', err);
  }
}

// 4. Cache Google Fonts
registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com',
  new StaleWhileRevalidate({
    cacheName: 'google-fonts-stylesheets',
  })
);

registerRoute(
  ({ url }) => url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'google-fonts-webfonts',
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
        maxEntries: 30,
      }),
    ],
  })
);

// 5. Cache Supabase Storage images (avatars, attachments, media)
registerRoute(
  ({ url }) => url.pathname.includes('/storage/v1/object/public/'),
  new StaleWhileRevalidate({
    cacheName: 'supabase-storage-images',
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
        maxEntries: 100,
      }),
    ],
  })
);

// 6. Explicitly ensure Supabase Auth and Database REST are ALWAYS network-only
registerRoute(
  ({ url }) =>
    url.pathname.startsWith('/rest/v1/') ||
    url.pathname.startsWith('/auth/v1/') ||
    url.pathname.startsWith('/realtime/') ||
    url.pathname.startsWith('/functions/v1/'),
  new NetworkOnly()
);

// 7. Message listener for skipWaiting (triggered by PWA update prompt)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Ensure newly activated SW claims open clients cleanly
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// 8. Foundational Push event listener (prepared for Fase 4 & 6)
self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const payload = event.data.json();
    console.log('[SW] Push received:', payload);

    // If it's a silent dismiss instruction from another device
    if (payload.type === 'dismiss' && payload.reminderId) {
      event.waitUntil(
        self.registration.getNotifications().then((notifications) => {
          for (const notification of notifications) {
            if (
              notification.tag === `reminder-${payload.reminderId}` ||
              notification.data?.reminderId === payload.reminderId
            ) {
              notification.close();
            }
          }
        })
      );
      return;
    }

    const title = payload.title || 'Veyra';
    const isCritical = payload.level === 'critical';

    const options: NotificationOptions & {
      renotify?: boolean;
      silent?: boolean;
      actions?: Array<{ action: string; title: string }>;
    } = {
      body: payload.body || 'Tienes un recordatorio pendiente.',
      icon: '/pwa-192x192.png',
      badge: '/pwa-badge-96x96.png',
      tag: payload.tag || (payload.reminderId ? `reminder-${payload.reminderId}` : 'veyra-notification'),
      requireInteraction: isCritical,
      renotify: true,
      silent: Boolean(payload.silent),
      data: {
        url: payload.url || (payload.reminderId ? `/reminders/${payload.reminderId}` : '/'),
        reminderId: payload.reminderId,
        actionToken: payload.actionToken,
      },
      ...(payload.reminderId && payload.actionToken
        ? {
            actions: [
              { action: 'complete', title: 'Completar' },
              { action: 'snooze_10', title: 'Posponer 10m' },
            ],
          }
        : {}),
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    console.error('[SW] Error handling push event:', err);
    // Fallback simple notification if JSON parsing fails
    event.waitUntil(
      self.registration.showNotification('Veyra', {
        body: event.data.text() || 'Tienes una nueva notificación.',
        icon: '/pwa-192x192.png',
        badge: '/pwa-badge-96x96.png',
      })
    );
  }
});

// 9. Foundational Notification Click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const action = event.action;
  const data = event.notification.data || {};

  // Action button handling
  if (action === 'complete' || action === 'snooze_10') {
    if (data.actionToken && data.reminderId) {
      // Dispatch background fetch to reminder-action Edge Function (Fase 4)
      const actionPayload = {
        reminderId: data.reminderId,
        action: action === 'complete' ? 'complete' : 'snooze',
        minutes: action === 'snooze_10' ? 10 : 0,
        token: data.actionToken,
      };

      event.waitUntil(
        fetch(`${SUPABASE_URL}/functions/v1/reminder-action`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify(actionPayload),
        }).catch((err) => console.error('[SW] Action dispatch error:', err))
      );
      return;
    }
  }

  // Body click: focus existing origin window (navigating if needed) or open a new tab
  const targetUrl = typeof data.url === 'string' && data.url ? data.url : '/';
  const resolvedTarget = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clientList) => {
      for (const client of clientList) {
        if ('focus' in client && client.url.startsWith(self.location.origin)) {
          await client.focus();
          if (client.url !== resolvedTarget && 'navigate' in client) {
            try {
              await client.navigate(resolvedTarget);
            } catch {
              // ignore navigation restrictions if any
            }
          }
          return client;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(resolvedTarget);
      }
    })
  );
});

// 10. Push Subscription Rotation / Expiration handler
self.addEventListener('pushsubscriptionchange', (event) => {
  const pushEvent = event as ExtendableEvent & { oldSubscription?: PushSubscription };
  pushEvent.waitUntil(
    (async () => {
      try {
        const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
        await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
        });
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of clients) {
          client.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGED' });
        }
      } catch (err) {
        console.warn('[SW] Failed to recover push subscription on pushsubscriptionchange:', err);
      }
    })()
  );
});
