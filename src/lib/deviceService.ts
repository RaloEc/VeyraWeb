import { supabase } from './supabase';

export interface ConnectedDevice {
  id: string;
  type: 'mobile_android' | 'mobile_ios' | 'web_browser' | 'desktop_pwa';
  name: string;
  model?: string;
  rawDeviceId?: string;
  token?: string;
  os: string;
  browser?: string;
  isCurrent: boolean;
  lastActive: string;
  source: 'push_tokens' | 'web_push' | 'current';
}

function parseUserAgent(ua: string): { browser: string; os: string; isMobile: boolean } {
  let browser = 'Navegador Web';
  let os = 'Desconocido';
  const isMobile = /Android|iPhone|iPad|iPod/i.test(ua);

  // OS
  if (/Windows NT 10.0/i.test(ua)) os = 'Windows 10/11';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Mac OS X/i.test(ua)) os = 'macOS';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  // Browser
  if (/Edg\//i.test(ua)) browser = 'Microsoft Edge';
  else if (/Chrome\//i.test(ua)) browser = 'Google Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Mozilla Firefox';
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = 'Apple Safari';
  else if (/Opera|OPR\//i.test(ua)) browser = 'Opera';

  return { browser, os, isMobile };
}

export class DeviceService {
  /**
   * Obtiene la información del dispositivo/sesión actual local
   */
  public static getCurrentDeviceInfo(): ConnectedDevice {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const { browser, os, isMobile } = parseUserAgent(ua);
    const isStandalone = typeof window !== 'undefined' && (
      window.matchMedia('(display-mode: standalone)').matches ||
      ('standalone' in navigator && (navigator as unknown as { standalone: boolean }).standalone === true)
    );

    return {
      id: 'current-session',
      type: isStandalone ? 'desktop_pwa' : (isMobile ? 'mobile_android' : 'web_browser'),
      name: isStandalone ? `${browser} (App PWA)` : `${browser} en ${os}`,
      os,
      browser,
      isCurrent: true,
      lastActive: new Date().toISOString(),
      source: 'current',
    };
  }

  /**
   * Carga los dispositivos reales registrados en Supabase:
   * 1. `push_tokens` (Teléfonos Android y iPhones registrados con la app móvil)
   * 2. `web_push_subscriptions` (Otros navegadores o equipos con notificaciones web)
   */
  public static async fetchConnectedDevices(userId: string): Promise<ConnectedDevice[]> {
    if (!userId) return [this.getCurrentDeviceInfo()];

    const devices: ConnectedDevice[] = [];
    const currentDevice = this.getCurrentDeviceInfo();
    devices.push(currentDevice);

    try {
      // 1. Consultar teléfonos (push_tokens)
      const { data: pushTokens, error: pushErr } = await supabase
        .from('push_tokens')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });

      if (!pushErr && pushTokens && pushTokens.length > 0) {
        // Desduplicar tokens viejos del mismo dispositivo físico si comparten device_id
        const seenDeviceIds = new Set<string>();

        for (const item of pushTokens) {
          // Si el registro tiene device_id y ya mostramos uno más reciente de ese mismo hardware, ignorar el token huérfano anterior
          if (item.device_id) {
            if (seenDeviceIds.has(item.device_id)) continue;
            seenDeviceIds.add(item.device_id);
          }

          const isAndroid = item.platform === 'android';
          const isIos = item.platform === 'ios';

          devices.push({
            id: item.id || `push-${item.token.slice(-8)}`,
            token: item.token,
            rawDeviceId: item.device_id || undefined,
            type: isIos ? 'mobile_ios' : (isAndroid ? 'mobile_android' : 'web_browser'),
            name: isIos ? 'iPhone / iPad' : (isAndroid ? 'Dispositivo Android' : 'Dispositivo Móvil'),
            os: isIos ? 'Apple iOS' : (isAndroid ? 'Google Android' : 'Móvil'),
            model: item.device_id ? `ID: ${item.device_id.slice(0, 10)}...` : undefined,
            isCurrent: false,
            lastActive: item.updated_at || item.created_at || new Date().toISOString(),
            source: 'push_tokens',
          });
        }
      }

      // 2. Consultar otras sesiones web registradas (web_push_subscriptions)
      const { data: webSubs, error: webErr } = await supabase
        .from('web_push_subscriptions')
        .select('*')
        .eq('user_id', userId)
        .order('last_seen_at', { ascending: false });

      if (!webErr && webSubs && webSubs.length > 0) {
        const currentEndpoint = typeof window !== 'undefined'
          ? (await (await navigator.serviceWorker?.ready)?.pushManager?.getSubscription())?.endpoint
          : null;

        for (const sub of webSubs) {
          // Omitir si es exactamente la misma suscripción de este navegador
          if (currentEndpoint && sub.endpoint === currentEndpoint) continue;

          const parsed = parseUserAgent(sub.user_agent || '');
          devices.push({
            id: sub.id || `web-${sub.endpoint.slice(-8)}`,
            type: parsed.isMobile ? 'mobile_android' : 'web_browser',
            name: `${parsed.browser} en ${parsed.os}`,
            os: parsed.os,
            browser: parsed.browser,
            isCurrent: false,
            lastActive: sub.last_seen_at || sub.created_at || new Date().toISOString(),
            source: 'web_push',
          });
        }
      }
    } catch (e) {
      console.warn('[DeviceService] Error fetching connected devices:', e);
    }

    return devices;
  }

  /**
   * Permite desvincular un dispositivo (remover su token de Supabase)
   * y emite la orden WebSocket de cierre de sesión forzado en tiempo real.
   */
  public static async removeDevice(device: ConnectedDevice, userId?: string): Promise<{ success: boolean; error?: string }> {
    try {
      // 1. Remover de base de datos
      if (device.source === 'push_tokens') {
        const { error } = await supabase.from('push_tokens').delete().eq('id', device.id);
        if (error) return { success: false, error: error.message };
      } else if (device.source === 'web_push') {
        const { error } = await supabase.from('web_push_subscriptions').delete().eq('id', device.id);
        if (error) return { success: false, error: error.message };
      }

      // 2. Emitir señal WebSocket para cerrar sesión de inmediato en ese dispositivo
      if (userId) {
        supabase
          .channel(`collab_sync_${userId}`)
          .send({
            type: 'broadcast',
            event: 'FORCE_SIGNOUT_DEVICE',
            payload: {
              targetDeviceId: device.rawDeviceId || '*',
              targetToken: device.token,
              pushTokenId: device.id,
            },
          })
          .catch((err) => console.warn('[DeviceService] Error enviando broadcast de cierre forzado:', err));
      }

      return { success: true };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error desconocido';
      return { success: false, error: msg };
    }
  }
}
