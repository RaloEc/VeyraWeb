import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  AccountSwitchConfirmationError,
  CALLBACK_MESSAGE_TYPE,
  CALLBACK_RESULT_STORAGE_KEY,
  PENDING_OAUTH_STORAGE_KEY,
  exchangeGoogleDriveCode,
  getDriveOAuthRedirectUri,
  type DriveOAuthCallbackPayload,
  type PendingDriveOAuthState,
} from '../../lib/googleDriveIntegration';
import { Button } from '../../components/common/Button';

export interface GoogleDriveCallbackPageProps {
  onComplete: () => void;
}

export const GoogleDriveCallbackPage: React.FC<GoogleDriveCallbackPageProps> = ({
  onComplete,
}) => {
  const [status, setStatus] = useState<'processing' | 'done' | 'error'>('processing');
  const [message, setMessage] = useState<string>('Procesando autorización de Google Drive...');
  const ranRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const searchParams = new URLSearchParams(window.location.search);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    const isPopup =
      (Boolean(window.opener) && window.opener !== window) ||
      window.name === 'veyra_google_drive_oauth';

    if (isPopup) {
      const payload: DriveOAuthCallbackPayload = {
        type: CALLBACK_MESSAGE_TYPE,
        code,
        state,
        error,
        errorDescription,
        redirectUri: getDriveOAuthRedirectUri(),
        timestamp: Date.now(),
      };

      try {
        localStorage.setItem(CALLBACK_RESULT_STORAGE_KEY, JSON.stringify(payload));
      } catch {
        // Ignorar errores de almacenamiento
      }

      try {
        window.opener?.postMessage(payload, window.location.origin);
      } catch {
        // COOP puede aislar window.opener; el listener de storage en el padre captura el resultado
      }

      setStatus(error ? 'error' : 'done');
      setMessage(
        error
          ? errorDescription || `Google canceló o rechazó la autorización (${error}).`
          : 'Autorización completada. Esta ventana se cerrará automáticamente.',
      );

      window.setTimeout(() => {
        window.close();
      }, 150);
      return;
    }

    // Respaldo de navegación completa (cuando los popups están bloqueados)
    const runFullPageFallback = async () => {
      try {
        if (error) {
          throw new Error(errorDescription || `Google rechazó la autorización (${error}).`);
        }
        const pendingRaw = localStorage.getItem(PENDING_OAUTH_STORAGE_KEY);
        localStorage.removeItem(PENDING_OAUTH_STORAGE_KEY);
        if (!pendingRaw) {
          throw new Error('No se encontró una solicitud OAuth de Drive pendiente.');
        }

        const pending = JSON.parse(pendingRaw) as PendingDriveOAuthState;
        if (!state || state !== pending.state) {
          throw new Error('Estado OAuth inválido.');
        }
        if (!code) {
          throw new Error('Google no devolvió el código de autorización.');
        }

        const result = await exchangeGoogleDriveCode({
          code,
          redirectUri: pending.redirectUri || getDriveOAuthRedirectUri(),
          codeVerifier: pending.codeVerifier,
          confirmAccountSwitch: pending.confirmAccountSwitch,
        });

        toast.success(
          result.google_email
            ? `Google Drive conectado (${result.google_email}).`
            : 'Google Drive conectado correctamente.',
        );
        window.history.replaceState({}, '', '/');
        onCompleteRef.current();
      } catch (err: unknown) {
        if (err instanceof AccountSwitchConfirmationError) {
          setStatus('error');
          setMessage(
            `Esta cuenta (${err.newEmail || 'nueva'}) es distinta a la actual (${err.currentEmail || 'anterior'}). Vuelve a Ajustes → Integraciones para confirmar el cambio.`,
          );
          return;
        }
        setStatus('error');
        setMessage((err as Error).message || 'No se pudo conectar Google Drive.');
      }
    };

    runFullPageFallback();
  }, []);

  const handleCloseOrReturn = () => {
    window.close();
    window.history.replaceState({}, '', '/');
    onCompleteRef.current();
  };

  return (
    <div className="min-h-screen bg-veyra-canvas flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-sm bg-veyra-card border border-veyra-border rounded-xl p-7 shadow-elevated text-center space-y-4">
        <div className="w-11 h-11 rounded-full bg-veyra-elevated border border-veyra-border flex items-center justify-center mx-auto">
          {status === 'processing' && <Loader2 className="w-5 h-5 text-accent animate-spin" />}
          {status === 'done' && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
          {status === 'error' && <AlertCircle className="w-5 h-5 text-red-400" />}
        </div>

        <div className="space-y-1.5">
          <h2 className="text-base font-bold text-veyra-text">
            {status === 'error' ? 'Error con Google Drive' : 'Google Drive'}
          </h2>
          <p className="text-xs text-veyra-muted leading-relaxed">{message}</p>
        </div>

        <Button onClick={handleCloseOrReturn} variant="secondary" size="md" className="w-full">
          {status === 'done' ? 'Cerrar ventana' : 'Volver a Veyra'}
        </Button>
      </div>
    </div>
  );
};
