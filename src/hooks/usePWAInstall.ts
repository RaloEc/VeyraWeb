import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface PWAInstallSnapshot {
  deferredPrompt: BeforeInstallPromptEvent | null;
  isInstalled: boolean;
}

const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

function detectStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: window-controls-overlay)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function detectMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Windows Phone|Mobile/i.test(navigator.userAgent);
}

function detectIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isLegacyIOS = /iPhone|iPad|iPod/i.test(ua);
  const isIPadOS = /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
  return isLegacyIOS || isIPadOS;
}

let pwaSnapshot: PWAInstallSnapshot = {
  deferredPrompt: null,
  isInstalled: detectStandaloneMode(),
};

const pwaListeners = new Set<() => void>();
let globalListenersInitialized = false;

function notifyPWAListeners() {
  for (const listener of pwaListeners) {
    listener();
  }
}

function setPWASnapshot(partial: Partial<PWAInstallSnapshot>) {
  pwaSnapshot = { ...pwaSnapshot, ...partial };
  notifyPWAListeners();
}

/**
 * Captures `beforeinstallprompt`, `appinstalled`, and display-mode changes globally
 * from app startup so events are never missed before Settings opens.
 */
export function initPWAInstallListeners(): void {
  if (typeof window === 'undefined' || globalListenersInitialized) return;
  globalListenersInitialized = true;

  pwaSnapshot = {
    ...pwaSnapshot,
    isInstalled: detectStandaloneMode(),
  };

  const standaloneMq = window.matchMedia('(display-mode: standalone)');
  const overlayMq = window.matchMedia('(display-mode: window-controls-overlay)');
  const handleDisplayChange = () => {
    setPWASnapshot({ isInstalled: detectStandaloneMode() });
  };

  standaloneMq.addEventListener('change', handleDisplayChange);
  overlayMq.addEventListener('change', handleDisplayChange);

  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    setPWASnapshot({ deferredPrompt: e as BeforeInstallPromptEvent });
  });

  window.addEventListener('appinstalled', () => {
    setPWASnapshot({
      isInstalled: true,
      deferredPrompt: null,
    });
    toast.success('¡Veyra se ha instalado como aplicación!');
  });
}

export function usePWAInstall() {
  const [snapshot, setSnapshot] = useState<PWAInstallSnapshot>(() => {
    initPWAInstallListeners();
    return pwaSnapshot;
  });

  const [isMobileDevice] = useState<boolean>(() => detectMobileDevice());
  const [isIOS] = useState<boolean>(() => detectIOSDevice());

  useEffect(() => {
    initPWAInstallListeners();

    const sync = () => {
      setSnapshot(pwaSnapshot);
    };
    pwaListeners.add(sync);
    sync();

    return () => {
      pwaListeners.delete(sync);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<boolean> => {
    const promptEvent = pwaSnapshot.deferredPrompt;
    if (!promptEvent) return false;

    // beforeinstallprompt events can only be used once
    setPWASnapshot({ deferredPrompt: null });

    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === 'accepted') {
        setPWASnapshot({ isInstalled: true, deferredPrompt: null });
        return true;
      }
    } catch (err) {
      console.error('[usePWAInstall] Install prompt error:', err);
    }
    return false;
  }, []);

  return {
    isInstallable: Boolean(snapshot.deferredPrompt) && !snapshot.isInstalled,
    isInstalled: snapshot.isInstalled,
    isMobileDevice,
    isIOS,
    promptInstall,
  };
}

/**
 * Registra el Service Worker y escucha actualizaciones para mostrar el prompt
 */
let swRegistrationPromise: Promise<void> | null = null;

export function registerServiceWorkerPrompt(): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return Promise.resolve();
  }
  if (swRegistrationPromise) return swRegistrationPromise;

  if (import.meta.env.DEV) {
    swRegistrationPromise = navigator.serviceWorker
      .register('/dev-sw.js?dev-sw', { type: 'module', scope: '/' })
      .then(() => undefined)
      .catch((err) => {
        console.warn('[SW Dev Registration] Failed:', err);
      });
    return swRegistrationPromise;
  }

  swRegistrationPromise = import('workbox-window')
    .then(({ Workbox }) => {
      const wb = new Workbox('/sw.js');
      let reloading = false;
      let lastUpdateCheckAt = Date.now();

      wb.addEventListener('waiting', () => {
        toast('Nueva versión de Veyra disponible', {
          id: 'veyra-pwa-update',
          description: 'Actualiza para obtener las últimas funciones y mejoras.',
          duration: Infinity,
          action: {
            label: 'Actualizar',
            onClick: () => {
              if (!reloading) {
                reloading = true;
                wb.addEventListener('controlling', () => {
                  window.location.reload();
                });
              }
              wb.messageSkipWaiting();
            },
          },
        });
      });

      const maybeCheckForUpdate = () => {
        if (document.visibilityState !== 'visible') return;
        const now = Date.now();
        if (now - lastUpdateCheckAt < UPDATE_CHECK_INTERVAL_MS) return;
        lastUpdateCheckAt = now;
        wb.update().catch(() => {});
      };

      document.addEventListener('visibilitychange', maybeCheckForUpdate);
      window.addEventListener('focus', maybeCheckForUpdate);

      return wb.register().then(() => undefined);
    })
    .catch((err) => {
      console.warn('[Workbox] Failed to load workbox-window / register SW:', err);
    });

  return swRegistrationPromise;
}
