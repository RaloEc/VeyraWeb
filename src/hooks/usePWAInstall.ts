import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    );
  });

  const [isMobileDevice, setIsMobileDevice] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return /Android|iPhone|iPad|iPod|Windows Phone|Mobile/i.test(navigator.userAgent);
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check display mode changes (e.g. app installed or launched in standalone)
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleDisplayChange = (e: MediaQueryListEvent) => {
      setIsInstalled(e.matches);
    };
    mediaQuery.addEventListener('change', handleDisplayChange);

    // Only capture beforeinstallprompt if running on desktop!
    const handleBeforeInstallPrompt = (e: Event) => {
      // If mobile device, prevent browser install banner
      if (/Android|iPhone|iPad|iPod|Windows Phone|Mobile/i.test(navigator.userAgent)) {
        setIsMobileDevice(true);
        e.preventDefault();
        return;
      }

      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      toast.success('¡Veyra se ha instalado como aplicación de escritorio!');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      mediaQuery.removeEventListener('change', handleDisplayChange);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<boolean> => {
    if (!deferredPrompt) return false;

    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setIsInstalled(true);
        setDeferredPrompt(null);
        return true;
      }
    } catch (err) {
      console.error('[usePWAInstall] Install prompt error:', err);
    }
    return false;
  }, [deferredPrompt]);

  return {
    isInstallable: Boolean(deferredPrompt) && !isInstalled && !isMobileDevice,
    isInstalled,
    isMobileDevice,
    promptInstall,
  };
}

/**
 * Registra el Service Worker y escucha actualizaciones para mostrar el prompt
 */
export function registerServiceWorkerPrompt() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  import('workbox-window')
    .then(({ Workbox }) => {
      const wb = new Workbox('/sw.js');

      wb.addEventListener('waiting', () => {
        toast('Nueva versión de Veyra disponible', {
          description: 'Actualiza para obtener las últimas funciones y mejoras.',
          duration: Infinity,
          action: {
            label: 'Actualizar',
            onClick: () => {
              wb.addEventListener('controlling', () => {
                window.location.reload();
              });
              wb.messageSkipWaiting();
            },
          },
        });
      });

      wb.register().catch((err) => {
        console.warn('[SW Registration] Failed:', err);
      });
    })
    .catch((err) => {
      console.warn('[Workbox] Failed to load workbox-window:', err);
    });
}

