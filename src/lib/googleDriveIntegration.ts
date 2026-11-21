import { supabase } from './supabase';

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://rrwoompvuggcczggfgiq.supabase.co';
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJyd29vbXB2dWdnY2N6Z2dmZ2lxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5MzQ0MTQsImV4cCI6MjEwNzUxMDQxNH0.aRpjMpXflAOfh-hWIG6XBGW0FPoN91IoYR9FIQsE4fo';

export const GOOGLE_WEB_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID ||
  '592135232115-tgbghktn14svjf2adbs880k38fuvoco1.apps.googleusercontent.com';
export const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export const PENDING_OAUTH_STORAGE_KEY = 'veyra_drive_oauth_pending';
export const CALLBACK_RESULT_STORAGE_KEY = 'veyra_drive_oauth_result';
export const CALLBACK_MESSAGE_TYPE = 'VEYRA_GOOGLE_DRIVE_OAUTH_CALLBACK';
export const AUTH_INTENT_STORAGE_KEY = 'veyra_auth_intent';

export interface GoogleIntegrationInfo {
  id: string;
  provider: string;
  google_sub: string;
  google_email: string | null;
  oauth_client_kind: string;
  scopes: string[];
  status: 'active' | 'needs_reauth' | 'revoked' | 'disconnected' | string;
  disconnect_requested: boolean;
  connected_at: string;
  last_refreshed_at: string | null;
  last_error_code: string | null;
  updated_at: string;
}

export interface GoogleConnectResult {
  integration_id: string;
  provider: string;
  google_email: string | null;
  status: string;
  scopes: string[];
  account_switched: boolean;
  recovered_attachments: number;
  affected_attachments: number;
}

export interface GoogleDisconnectResult {
  ok: boolean;
  disconnected: boolean;
  already_disconnected: boolean;
  integration_id: string | null;
  affected_attachments: number;
  revocation_attempted: boolean;
}

export interface DriveOAuthCallbackPayload {
  type: typeof CALLBACK_MESSAGE_TYPE;
  code: string | null;
  state: string | null;
  error: string | null;
  errorDescription: string | null;
  redirectUri: string;
  timestamp: number;
}

export interface PendingDriveOAuthState {
  state: string;
  codeVerifier: string;
  redirectUri: string;
  confirmAccountSwitch: boolean;
  createdAt: number;
}

/**
 * Error lanzado cuando el usuario intenta conectar una cuenta de Google distinta
 * teniendo adjuntos activos vinculados a la cuenta anterior.
 */
export class AccountSwitchConfirmationError extends Error {
  readonly currentEmail: string | null;
  readonly newEmail: string | null;
  readonly affectedAttachments: number;

  constructor(
    message: string,
    currentEmail: string | null,
    newEmail: string | null,
    affectedAttachments: number,
  ) {
    super(message);
    this.name = 'AccountSwitchConfirmationError';
    this.currentEmail = currentEmail;
    this.newEmail = newEmail;
    this.affectedAttachments = affectedAttachments;
  }
}

/**
 * URL de callback para login y vinculación con Supabase Auth (Fases 2 y 3).
 */
export function getAuthCallbackUrl(): string {
  const configured = import.meta.env.VITE_AUTH_CALLBACK_URL;
  if (configured && typeof configured === 'string' && configured.trim()) {
    return configured.trim();
  }
  if (typeof window !== 'undefined' && window.location.origin.includes('localhost')) {
    return `${window.location.origin}/auth/callback`;
  }
  return 'https://veyra-lake.vercel.app/auth/callback';
}

/**
 * URL de redirección OAuth separada exclusiva para Google Drive (`drive.file`).
 */
export function getDriveOAuthRedirectUri(): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/auth/google-drive/callback`;
  }
  return 'https://veyra-lake.vercel.app/auth/google-drive/callback';
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generateRandomBase64Url(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(digest));
}

async function getAccessTokenOrThrow(): Promise<string> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error || !session?.access_token) {
    throw new Error('Tu sesión de Veyra expiró. Inicia sesión de nuevo para continuar.');
  }
  return session.access_token;
}

/**
 * Obtiene el estado actual (sin secretos) de la integración de Google Drive del usuario.
 */
export async function getMyGoogleIntegration(): Promise<GoogleIntegrationInfo | null> {
  const { data, error } = await supabase.rpc('rpc_get_my_google_integration');
  if (error) {
    throw new Error(error.message || 'No se pudo consultar el estado de Google Drive.');
  }
  return (data && data[0]) ? (data[0] as GoogleIntegrationInfo) : null;
}

/**
 * Envía el authorization code a la Edge Function `google-connect` para cifrar y guardar el refresh_token.
 */
export async function exchangeGoogleDriveCode(params: {
  code: string;
  redirectUri: string;
  codeVerifier?: string;
  confirmAccountSwitch?: boolean;
}): Promise<GoogleConnectResult> {
  const jwt = await getAccessTokenOrThrow();

  const res = await fetch(`${SUPABASE_URL}/functions/v1/google-connect`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      client_kind: 'web',
      code: params.code,
      redirect_uri: params.redirectUri,
      code_verifier: params.codeVerifier || undefined,
      confirm_account_switch: Boolean(params.confirmAccountSwitch),
    }),
  });

  const json = await res.json().catch(() => ({}));

  if (res.status === 409 && json?.code === 'ACCOUNT_SWITCH_REQUIRES_CONFIRMATION') {
    throw new AccountSwitchConfirmationError(
      json.error || 'Cambiar de cuenta marcará los adjuntos actuales como no disponibles.',
      json.current_email ?? null,
      json.new_email ?? null,
      Number(json.affected_attachments ?? 0),
    );
  }

  if (!res.ok) {
    throw new Error(json?.error || `No se pudo conectar Google Drive (HTTP ${res.status}).`);
  }

  return json as GoogleConnectResult;
}

/**
 * Inicia el flujo OAuth separado de Google Drive en una ventana emergente (con fallback a redirección completa).
 */
export async function connectGoogleDrivePopup(options?: {
  confirmAccountSwitch?: boolean;
}): Promise<GoogleConnectResult> {
  const redirectUri = getDriveOAuthRedirectUri();
  const state = generateRandomBase64Url(24);
  const codeVerifier = generateRandomBase64Url(48);
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  const pending: PendingDriveOAuthState = {
    state,
    codeVerifier,
    redirectUri,
    confirmAccountSwitch: Boolean(options?.confirmAccountSwitch),
    createdAt: Date.now(),
  };

  localStorage.removeItem(CALLBACK_RESULT_STORAGE_KEY);
  localStorage.setItem(PENDING_OAUTH_STORAGE_KEY, JSON.stringify(pending));

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', GOOGLE_WEB_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', GOOGLE_DRIVE_SCOPE);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('include_granted_scopes', 'false');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  const width = 520;
  const height = 650;
  const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2));
  const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));

  const popup = window.open(
    authUrl.toString(),
    'veyra_google_drive_oauth',
    `popup=yes,width=${width},height=${height},left=${left},top=${top}`,
  );

  // Si el navegador bloquea el popup, usamos navegación completa como respaldo
  if (!popup) {
    window.location.assign(authUrl.toString());
    return new Promise<GoogleConnectResult>(() => {});
  }

  const callbackPayload = await new Promise<DriveOAuthCallbackPayload>((resolve, reject) => {
    let settled = false;
    let pollTimer: number | null = null;
    let closeGraceTimer: number | null = null;
    let safetyTimer: number | null = null;

    const cleanup = () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('storage', handleStorage);
      if (pollTimer !== null) window.clearInterval(pollTimer);
      if (closeGraceTimer !== null) window.clearTimeout(closeGraceTimer);
      if (safetyTimer !== null) window.clearTimeout(safetyTimer);
    };

    const finishWithPayload = (payload: DriveOAuthCallbackPayload) => {
      if (settled) return;
      settled = true;
      cleanup();
      localStorage.removeItem(CALLBACK_RESULT_STORAGE_KEY);
      resolve(payload);
    };

    const finishWithError = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      localStorage.removeItem(PENDING_OAUTH_STORAGE_KEY);
      localStorage.removeItem(CALLBACK_RESULT_STORAGE_KEY);
      reject(err);
    };

    const tryConsumeStoredResult = (): boolean => {
      const raw = localStorage.getItem(CALLBACK_RESULT_STORAGE_KEY);
      if (!raw) return false;
      try {
        const parsed = JSON.parse(raw) as DriveOAuthCallbackPayload;
        if (parsed?.type === CALLBACK_MESSAGE_TYPE) {
          finishWithPayload(parsed);
          return true;
        }
      } catch {
        // Ignorar JSON corrupto
      }
      return false;
    };

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const payload = event.data as DriveOAuthCallbackPayload | undefined;
      if (payload?.type !== CALLBACK_MESSAGE_TYPE) return;
      finishWithPayload(payload);
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== CALLBACK_RESULT_STORAGE_KEY || !event.newValue) return;
      tryConsumeStoredResult();
    };

    window.addEventListener('message', handleMessage);
    window.addEventListener('storage', handleStorage);

    pollTimer = window.setInterval(() => {
      if (tryConsumeStoredResult()) return;
      if (popup.closed && closeGraceTimer === null) {
        closeGraceTimer = window.setTimeout(() => {
          if (!tryConsumeStoredResult()) {
            finishWithError(new Error('La autorización con Google Drive fue cancelada.'));
          }
        }, 500);
      }
    }, 600);

    safetyTimer = window.setTimeout(() => {
      finishWithError(new Error('Tiempo de espera agotado conectando Google Drive.'));
    }, 5 * 60 * 1000);
  });

  localStorage.removeItem(PENDING_OAUTH_STORAGE_KEY);

  if (callbackPayload.error) {
    throw new Error(
      callbackPayload.errorDescription ||
        `Google rechazó la autorización (${callbackPayload.error}).`,
    );
  }

  if (!callbackPayload.state || callbackPayload.state !== pending.state) {
    throw new Error('Error de validación de seguridad (state inválido) al conectar Drive.');
  }

  if (!callbackPayload.code) {
    throw new Error('Google no devolvió el código de autorización.');
  }

  return await exchangeGoogleDriveCode({
    code: callbackPayload.code,
    redirectUri: pending.redirectUri,
    codeVerifier: pending.codeVerifier,
    confirmAccountSwitch: pending.confirmAccountSwitch,
  });
}

/**
 * Desconecta Google Drive en backend (borra secreto de Vault, marca adjuntos y revoca token en Google).
 */
export async function disconnectGoogleDrive(): Promise<GoogleDisconnectResult> {
  const jwt = await getAccessTokenOrThrow();

  const res = await fetch(`${SUPABASE_URL}/functions/v1/google-disconnect`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
      apikey: SUPABASE_ANON_KEY,
    },
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error || `No se pudo desconectar Google Drive (HTTP ${res.status}).`);
  }
  return json as GoogleDisconnectResult;
}
