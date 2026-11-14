import { supabase } from './supabase';

const VAPID_PUBLIC_KEY =
  import.meta.env.VITE_VAPID_PUBLIC_KEY ||
  'BN6CaKHTF5yD1p3DhLk7Wg9bcChY4OrYA7t8SSfsZ8Ca5BGU6qVRmzcb7kGU9QNkHLMyJ2exCnGMOMOpEIvKqQg';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
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
    if (!this.isSupported()) return 'denied';
    return Notification.permission;
  }

  public static async getExistingSubscription(): Promise<PushSubscription | null> {
    if (!this.isSupported()) return null;
    try {
      const reg = await navigator.serviceWorker.ready;
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

    try {
      // 1. Request permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        return { success: false, error: 'Permiso de notificaciones denegado' };
      }

      // 2. Ensure service worker is ready
      const reg = await navigator.serviceWorker.ready;

      // 3. Subscribe with VAPID key
      const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      let subscription = await reg.pushManager.getSubscription();

      if (!subscription) {
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
        });
      }

      // 4. Extract keys
      const p256dhKey = subscription.getKey('p256dh');
      const authKey = subscription.getKey('auth');

      if (!p256dhKey || !authKey) {
        return { success: false, error: 'No se pudieron extraer las claves de suscripción' };
      }

      const p256dh = btoa(String.fromCharCode(...new Uint8Array(p256dhKey)));
      const auth = btoa(String.fromCharCode(...new Uint8Array(authKey)));

      // 5. Upsert to Supabase web_push_subscriptions table
      const { error } = await supabase.from('web_push_subscriptions').upsert(
        {
          user_id: userId,
          endpoint: subscription.endpoint,
          p256dh,
          auth,
          user_agent: navigator.userAgent,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'endpoint' }
      );

      if (error) {
        console.error('[PushService] Error saving push subscription to Supabase:', error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err: unknown) {
      console.error('[PushService] Exception subscribing to push:', err);
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      return { success: false, error: msg };
    }
  }

  public static async unsubscribe(userId: string): Promise<{ success: boolean; error?: string }> {
    if (!this.isSupported()) return { success: true };

    try {
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.getSubscription();

      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();

        // Remove from Supabase
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

