import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { AUTH_INTENT_STORAGE_KEY } from '../../lib/googleDriveIntegration';
import { Button } from '../../components/common/Button';

export const AUTH_CALLBACK_ERROR_KEY = 'veyra_auth_callback_error';

export interface AuthCallbackPageProps {
  onComplete: () => void;
}

export const AuthCallbackPage: React.FC<AuthCallbackPageProps> = ({ onComplete }) => {
  const [statusText, setStatusText] = useState<string>(
    'Completando autenticación con Google...',
  );

  // Mantener referencia estable para no cancelar el flujo en re-renders o React StrictMode
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const isMountedRef = useRef(true);
  const startedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const redirectToLoginWithError = (message: string) => {
      sessionStorage.removeItem(AUTH_INTENT_STORAGE_KEY);
      sessionStorage.setItem(AUTH_CALLBACK_ERROR_KEY, message);
      toast.error(message);
      window.history.replaceState({}, '', '/login');
      if (isMountedRef.current) {
        onCompleteRef.current();
      } else {
        window.location.replace('/login');
      }
    };

    const completeAuth = async () => {
      try {
        const currentUrl = new URL(window.location.href);
        const searchParams = currentUrl.searchParams;
        const hashParams = new URLSearchParams(currentUrl.hash.replace(/^#/, ''));

        const oauthError = searchParams.get('error') || hashParams.get('error');
        const oauthDesc =
          searchParams.get('error_description') || hashParams.get('error_description');

        if (oauthError) {
          throw new Error(oauthDesc || `Google Auth devolvió un error (${oauthError}).`);
        }

        const code = searchParams.get('code');

        // 1. Intercambiar explícitamente el code PKCE si viene en window.location.href
        // Nota: @supabase/auth-js@2.118.0 espera el código puro extraído de la URL en `auth_code`.
        let session = null;

        if (code) {
          if (isMountedRef.current) {
            setStatusText('Verificando sesión con el servidor...');
          }
          const { data: exchanged, error: exchangeErr } =
            await supabase.auth.exchangeCodeForSession(code);

          if (exchangeErr) {
            // Si detectSessionInUrl consumió el código concurrentemente, la sesión ya existe
            const { data: fallbackData } = await supabase.auth.getSession();
            if (!fallbackData.session) {
              throw exchangeErr;
            }
            session = fallbackData.session;
          } else {
            session = exchanged.session;
          }
        } else {
          // 2. Respaldo para tokens en fragmento (#access_token / #refresh_token) o sesión ya inicializada
          const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
          if (sessionErr) throw sessionErr;
          session = sessionData.session;

          if (!session) {
            const accessToken = hashParams.get('access_token');
            const refreshToken = hashParams.get('refresh_token');
            if (accessToken && refreshToken) {
              if (isMountedRef.current) {
                setStatusText('Guardando sesión...');
              }
              const { data: setData, error: setErr } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
              });
              if (setErr) throw setErr;
              session = setData.session;
            }
          }
        }

        if (!session) {
          throw new Error(
            'No se recibió una sesión válida desde Google. Intenta iniciar sesión de nuevo.',
          );
        }

        const intent = sessionStorage.getItem(AUTH_INTENT_STORAGE_KEY);
        sessionStorage.removeItem(AUTH_INTENT_STORAGE_KEY);
        sessionStorage.removeItem(AUTH_CALLBACK_ERROR_KEY);

        if (intent === 'link_google') {
          toast.success('Cuenta de Google vinculada correctamente.');
        } else {
          toast.success('Sesión iniciada con Google.');
        }

        window.history.replaceState({}, '', '/');
        if (isMountedRef.current) {
          onCompleteRef.current();
        } else {
          window.location.replace('/');
        }
      } catch (err: unknown) {
        console.error('[AuthCallbackPage] Error:', err);
        const msg =
          (err as Error).message || 'No se pudo completar el inicio de sesión con Google.';
        redirectToLoginWithError(msg);
      }
    };

    completeAuth();
  }, []);

  const handleManualReturn = () => {
    window.history.replaceState({}, '', '/');
    onCompleteRef.current();
  };

  return (
    <div className="min-h-screen bg-veyra-canvas flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-sm bg-veyra-card border border-veyra-border rounded-xl p-7 shadow-elevated text-center space-y-4">
        <div className="w-11 h-11 rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center mx-auto">
          <Loader2 className="w-5 h-5 text-accent animate-spin" />
        </div>
        <div className="space-y-1">
          <h2 className="text-base font-bold text-veyra-text">Conectando con Veyra</h2>
          <p className="text-xs text-veyra-muted">{statusText}</p>
        </div>
        <Button onClick={handleManualReturn} variant="ghost" size="sm" className="w-full">
          Volver al inicio
        </Button>
      </div>
    </div>
  );
};
