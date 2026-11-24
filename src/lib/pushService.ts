import { supabase } from './supabase';
import { registerServiceWorkerPrompt } from '../hooks/usePWAInstall';
import {
  urlBase64ToUint8Array,
  applicationServerKeysMatch,
  extractSubscriptionKeys,
  resolveServiceWorkerRegistration,
  formatPushSubscribeError,
} from './pushUtils';

export async function detectBraveBrowser(): Promise<boolean> {
  if (typeof navigator === 'undefined') return false;
  try {
    const braveNav = navigator as Navigator & { brave?: { isBrave?: () => Promise<boolean> } };
    if (typeof braveNav.brave?.isBrave === 'function') {
      return await braveNav.brave.isBrave();
    }
  } catch {
    // ignore detection errors
  }
  return false;
}

export const VAPID_PUBLIC_KEY =
  import.meta.env?.VITE_VAPID_PUBLIC_KEY ||
  'BN6CaKHTF5yD1p3DhLk7Wg9bcChY4OrYA7t8SSfsZ8Ca5BGU6qVRmzcb7kGU9QNkHLMyJ2exCnGMOMOpEIvKqQg';

export interface TestPushResult {
  success: boolean;
  sent: number;
  failed: number;
  total: number;
  expiredRemoved: number;
  errors: string[];
  error?: string;
}

async function getServiceWorkerRegistration(
  timeoutMs = 5000
): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
  return resolveServiceWorkerRegistration(
    navigator.serviceWorker,
    registerServiceWorkerPrompt,
    timeoutMs
  );
}

async function persistSubscription(
  userId: string,
  endpoint: string,
  p256dh: string,
  auth: string
): Promise<{ error: string | null }> {
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : null;

  const { error: rpcError } = await supabase.rpc('upsert_web_push_subscription', {
    p_endpoint: endpoint,
    p_p256dh: p256dh,
    p_auth: auth,
    p_user_agent: userAgent,
  });

  if (!rpcError) {
    return { error: null };
  }

  console.warn('[PushService] RPC upsert fallback:', rpcError.message);
  const { error: upsertError } = await supabase.from('web_push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint,
      p256dh,
      auth,
      user_agent: userAgent,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' }
  );

  return { error: upsertError ? upsertError.message : null };
}

export class PushService {
  public static isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
    );
  }

  public static getPermissionState(): NotificationPermission {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'denied';
    return Notification.permission;
  }

  public static async getExistingSubscription(
    timeoutMs = 2500
  ): Promise<PushSubscription | null> {
    if (!this.isSupported()) return null;
    try {
      const reg = await getServiceWorkerRegistration(timeoutMs);
      if (!reg || !reg.pushManager) return null;
      return await reg.pushManager.getSubscription();
    } catch (e) {
      console.warn('[PushService] Error getting subscription:', e);
      return null;
    }
  }

  public static async subscribe(userId: string): Promise<{ success: boolean; error?: string }> {
    if (!this.isSupported()) {
      return { success: false, error: 'Web Push no está soportado en este navegador' };
    }

    if (Notification.permission === 'denied') {
      return {
        success: false,
        error:
          'Permiso de notificaciones bloqueado en el navegador. Habilítalo en el ícono de candado/configuración del sitio.',
      };
    }

    try {
      // 1. Request permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        return { success: false, error: 'Permiso de notificaciones denegado' };
      }

      // 2. Ensure service worker is registered & ready without hanging forever
      const reg = await getServiceWorkerRegistration(5000);
      if (!reg || !reg.pushManager) {
        return {
          success: false,
          error:
            'El Service Worker aún no está activo en este navegador. Recarga la página e inténtalo de nuevo.',
        };
      }

      // 3. Subscribe with VAPID key (rotating if existing key differs)
      const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      let subscription = await reg.pushManager.getSubscription();

      if (subscription) {
        const existingKey = subscription.options?.applicationServerKey ?? null;
        if (!applicationServerKeysMatch(existingKey, applicationServerKey)) {
          await subscription.unsubscribe().catch(() => {});
          subscription = null;
        }
      }

      if (!subscription) {
        try {
          subscription = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
          });
        } catch (subErr: unknown) {
          const errName = subErr instanceof Error ? subErr.name : '';
          if (errName === 'InvalidStateError' || errName === 'AbortError') {
            const stale = await reg.pushManager.getSubscription().catch(() => null);
            if (stale) {
              await stale.unsubscribe().catch(() => {});
              subscription = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
              });
            } else {
              throw subErr;
            }
          } else {
            throw subErr;
          }
        }
      }

      // 4. Extract base64url keys (RFC 8291 standard)
      const keys = extractSubscriptionKeys(subscription);
      if (!keys) {
        return { success: false, error: 'No se pudieron extraer las claves de suscripción' };
      }

      // 5. Save to Supabase via RLS-safe RPC
      const { error } = await persistSubscription(
        userId,
        subscription.endpoint,
        keys.p256dh,
        keys.auth
      );

      if (error) {
        console.error('[PushService] Error saving push subscription to Supabase:', error);
        return { success: false, error };
      }

      return { success: true };
    } catch (err: unknown) {
      console.error('[PushService] Exception subscribing to push:', err);
      const isBrave = await detectBraveBrowser();
      const isSecureContext = typeof window !== 'undefined' ? window.isSecureContext : true;
      const friendlyMessage = formatPushSubscribeError(err, { isBrave, isSecureContext });
      return { success: false, error: friendlyMessage };
    }
  }

  public static async syncIfSubscribed(userId: string): Promise<boolean> {
    if (!this.isSupported() || !userId) return false;
    if (Notification.permission !== 'granted') return false;

    try {
      const reg = await getServiceWorkerRegistration(3000);
      if (!reg || !reg.pushManager) return false;

      const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      let subscription = await reg.pushManager.getSubscription();
      if (!subscription) return false;

      const existingKey = subscription.options?.applicationServerKey ?? null;
      if (!applicationServerKeysMatch(existingKey, applicationServerKey)) {
        await subscription.unsubscribe().catch(() => {});
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
        });
      }

      const keys = extractSubscriptionKeys(subscription);
      if (!keys) return false;

      const { error } = await persistSubscription(
        userId,
        subscription.endpoint,
        keys.p256dh,
        keys.auth
      );
      return !error;
    } catch (err) {
      console.warn('[PushService] syncIfSubscribed error:', err);
      return false;
    }
  }

  public static async sendTestNotification(): Promise<TestPushResult> {
    try {
      const existing = await this.getExistingSubscription(2500);
      const { data, error } = await supabase.functions.invoke('send-test-push', {
        body: existing?.endpoint ? { endpoint: existing.endpoint } : {},
      });

      if (error) {
        return {
          success: false,
          sent: 0,
          failed: 1,
          total: 0,
          expiredRemoved: 0,
          errors: [error.message],
          error: error.message,
        };
      }

      const result = (data || {}) as Partial<TestPushResult>;
      return {
        success: Boolean(result.success),
        sent: Number(result.sent ?? 0),
        failed: Number(result.failed ?? 0),
        total: Number(result.total ?? 0),
        expiredRemoved: Number(result.expiredRemoved ?? 0),
        errors: Array.isArray(result.errors) ? result.errors : [],
        error: Array.isArray(result.errors) && result.errors.length > 0 ? result.errors[0] : undefined,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al enviar notificación de prueba';
      return {
        success: false,
        sent: 0,
        failed: 1,
        total: 0,
        expiredRemoved: 0,
        errors: [msg],
        error: msg,
      };
    }
  }

  public static async unsubscribe(userId: string): Promise<{ success: boolean; error?: string }> {
    if (!this.isSupported()) return { success: true };

    try {
      const reg = await getServiceWorkerRegistration(3000);
      const subscription = reg ? await reg.pushManager.getSubscription() : null;

      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();

        await supabase
          .from('web_push_subscriptions')
          .delete()
          .eq('endpoint', endpoint)
          .eq('user_id', userId);
      }

      return { success: true };
    } catch (err: unknown) {
      console.error('[PushService] Exception unsubscribing:', err);
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      return { success: false, error: msg };
    }
  }
}
