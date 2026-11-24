// Pure utility helpers for Web Push subscriptions and notification deduplication.

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const trimmed = base64String.trim();
  const padding = '='.repeat((4 - (trimmed.length % 4)) % 4);
  const base64 = (trimmed + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function uint8ArrayToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function applicationServerKeysMatch(
  existingKey: ArrayBuffer | null | undefined,
  expectedKey: Uint8Array
): boolean {
  if (!existingKey) return false;
  const existing = new Uint8Array(existingKey);
  if (existing.length !== expectedKey.length) return false;
  for (let i = 0; i < existing.length; i++) {
    if (existing[i] !== expectedKey[i]) return false;
  }
  return true;
}

export interface PushSubscriptionLike {
  toJSON?: () => { keys?: Record<string, string | undefined> };
  getKey?: (name: 'p256dh' | 'auth') => ArrayBuffer | null;
}

export function extractSubscriptionKeys(
  sub: PushSubscriptionLike
): { p256dh: string; auth: string } | null {
  const jsonKeys = sub.toJSON?.()?.keys;
  if (jsonKeys?.p256dh && jsonKeys?.auth) {
    return {
      p256dh: jsonKeys.p256dh,
      auth: jsonKeys.auth,
    };
  }

  const p256dhKey = sub.getKey?.('p256dh');
  const authKey = sub.getKey?.('auth');
  if (!p256dhKey || !authKey) return null;

  return {
    p256dh: uint8ArrayToBase64Url(new Uint8Array(p256dhKey)),
    auth: uint8ArrayToBase64Url(new Uint8Array(authKey)),
  };
}

export function buildReminderNotificationTag(reminderId: string): string {
  return `reminder-${reminderId}`;
}

export function buildEventNotificationTag(
  eventId: string,
  startTimeMs: number,
  offsetMin: number
): string {
  return `event-${eventId}-${startTimeMs}-${offsetMin}`;
}

export function parseEventNotificationOffsets(
  notificationOffsets: string | null | undefined,
  notificationOffsetMin: number | null | undefined,
  defaultLeadMinutes: number
): number[] {
  if (typeof notificationOffsets === 'string' && notificationOffsets.trim() !== '') {
    try {
      const parsed = JSON.parse(notificationOffsets) as unknown;
      if (Array.isArray(parsed)) {
        return Array.from(
          new Set(
            parsed.map(Number).filter((n) => Number.isFinite(n) && n >= 0)
          )
        );
      }
    } catch {
      // ignore malformed JSON
    }
  }
  if (
    typeof notificationOffsetMin === 'number' &&
    Number.isFinite(notificationOffsetMin) &&
    notificationOffsetMin >= 0
  ) {
    return [notificationOffsetMin];
  }
  return [defaultLeadMinutes > 0 ? defaultLeadMinutes : 15];
}

export interface ServiceWorkerContainerLike {
  getRegistration: () => Promise<ServiceWorkerRegistration | undefined>;
  ready: Promise<ServiceWorkerRegistration>;
}

/**
 * Resolves the active Service Worker registration with a bounded timeout so UI actions never hang
 * indefinitely when no Service Worker is registered or installing.
 */
export async function resolveServiceWorkerRegistration(
  swContainer: ServiceWorkerContainerLike | undefined,
  registerSwFn?: () => Promise<unknown>,
  timeoutMs = 5000
): Promise<ServiceWorkerRegistration | null> {
  if (!swContainer) return null;

  try {
    const existing = await swContainer.getRegistration();
    if (existing?.active) return existing;

    if (!existing && registerSwFn) {
      await registerSwFn();
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    });

    const reg = await Promise.race([swContainer.ready, timeoutPromise]);
    if (timer) clearTimeout(timer);
    if (reg) return reg;

    const afterTimeout = await swContainer.getRegistration();
    return afterTimeout ?? null;
  } catch {
    return null;
  }
}

export function formatPushSubscribeError(
  err: unknown,
  options?: { isBrave?: boolean; isSecureContext?: boolean }
): string {
  if (options?.isSecureContext === false) {
    return 'Las notificaciones Push requieren abrir Veyra mediante HTTPS o localhost.';
  }

  const name = err instanceof Error ? err.name : typeof (err as { name?: unknown })?.name === 'string' ? (err as { name: string }).name : '';
  const message =
    err instanceof Error
      ? err.message
      : typeof (err as { message?: unknown })?.message === 'string'
        ? (err as { message: string }).message
        : '';

  if (name === 'AbortError' || /push service error/i.test(message)) {
    if (options?.isBrave) {
      return 'Brave desactiva el servicio Push por defecto. Ve a brave://settings/privacy, activa "Usar los servicios de Google para mensajería push", recarga la página e inténtalo de nuevo.';
    }
    return 'El navegador no pudo conectarse al servicio Push (suele ocurrir en modo incógnito, en Brave sin Google Push habilitado, o si una VPN/bloqueador impide conectar con FCM). Las notificaciones mientras Veyra está abierta siguen funcionando.';
  }

  if (name === 'NotAllowedError') {
    return 'Permiso de notificaciones bloqueado en el navegador. Habilítalo desde el candado de la barra de direcciones.';
  }

  if (name === 'InvalidStateError') {
    return 'Ya existe una suscripción previa con otra clave. Recarga la página e inténtalo de nuevo.';
  }

  return message || 'Error desconocido al activar notificaciones Push';
}
