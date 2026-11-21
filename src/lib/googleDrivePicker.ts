import { supabase } from './supabase';

const SUPABASE_URL = (
  import.meta.env.VITE_SUPABASE_URL || 'https://rrwoompvuggcczggfgiq.supabase.co'
).replace(/\/+$/, '');
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJyd29vbXB2dWdnY2N6Z2dmZ2lxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5MzQ0MTQsImV4cCI6MjEwNzUxMDQxNH0.aRpjMpXflAOfh-hWIG6XBGW0FPoN91IoYR9FIQsE4fo';

const GOOGLE_PICKER_API_KEY = (import.meta.env.VITE_GOOGLE_PICKER_API_KEY || '').trim();
const GOOGLE_PICKER_APP_ID = (import.meta.env.VITE_GOOGLE_APP_ID || '592135232115').trim();

declare global {
  interface Window {
    gapi?: {
      load: (
        apiName: string,
        options: {
          callback: () => void;
          onerror?: (err: unknown) => void;
          timeout?: number;
          ontimeout?: () => void;
        },
      ) => void;
    };
    google?: {
      picker?: {
        Action: {
          PICKED: string;
          CANCEL: string;
        };
        Feature: {
          MULTISELECT_ENABLED: string;
        };
        ViewId: {
          DOCS: string;
          DOCS_IMAGES: string;
        };
        DocsView: new (viewId?: string) => {
          setIncludeFolders: (include: boolean) => any;
          setSelectFolderEnabled: (enabled: boolean) => any;
        };
        PickerBuilder: new () => {
          addView: (view: unknown) => any;
          setAppId: (appId: string) => any;
          setOAuthToken: (token: string) => any;
          setDeveloperKey: (key: string) => any;
          setOrigin: (origin: string) => any;
          enableFeature: (feature: string) => any;
          setLocale: (locale: string) => any;
          setTitle: (title: string) => any;
          setCallback: (cb: (data: GooglePickerCallbackData) => void) => any;
          build: () => { setVisible: (visible: boolean) => void };
        };
      };
    };
  }
}

interface GooglePickerCallbackData {
  action?: string;
  docs?: Array<{
    id?: string;
    name?: string;
    mimeType?: string;
  }>;
}

export interface DriveAttachedFile {
  id: string;
  target_type: 'note' | 'reminder' | 'event' | string;
  target_id: string;
  provider: string;
  drive_file_id: string;
  integration_id: string;
  name: string;
  mime_type: string;
  size_bytes: number | null;
  drive_md5: string | null;
  drive_modified_time: string | null;
  availability: string;
  unavailable_reason: string | null;
  last_verified_at: string | null;
  already_attached?: boolean;
}

export interface DriveAttachFileError {
  file_id: string;
  code: string;
  status: number;
  error: string;
}

export interface AttachDriveFilesResponse {
  ok: boolean;
  attachments: DriveAttachedFile[];
  errors: DriveAttachFileError[];
}

export class PickerTokenError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = 'PickerTokenError';
    this.code = code;
    this.status = status;
  }
}

let pickerSdkPromise: Promise<void> | null = null;

async function getAccessTokenOrThrow(): Promise<string> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error || !session?.access_token) {
    throw new Error('Tu sesión de Veyra expiró. Inicia sesión de nuevo para adjuntar desde Drive.');
  }
  return session.access_token;
}

/**
 * Solicita un access_token efímero `drive.file` a la Edge Function `picker-token`.
 */
export async function fetchPickerAccessToken(): Promise<{ accessToken: string }> {
  const jwt = await getAccessTokenOrThrow();

  const res = await fetch(`${SUPABASE_URL}/functions/v1/picker-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
      apikey: SUPABASE_ANON_KEY,
    },
  });

  const payload = await res.json().catch(() => ({}));

  if (!res.ok || !payload?.access_token) {
    const code = typeof payload?.code === 'string' ? payload.code : `HTTP_${res.status}`;
    if (res.status === 404 && code === 'DRIVE_NOT_CONNECTED') {
      throw new PickerTokenError(
        code,
        'Conecta primero tu Google Drive en Ajustes → Integraciones.',
        res.status,
      );
    }
    if (res.status === 410 || code === 'INTEGRATION_DISCONNECTED') {
      throw new PickerTokenError(
        code,
        'Tu cuenta de Google Drive está desconectada. Conéctala en Ajustes → Integraciones.',
        res.status,
      );
    }
    if (res.status === 424 || code === 'NEEDS_REAUTH') {
      throw new PickerTokenError(
        code,
        'La autorización de Google Drive expiró. Reconéctala en Ajustes → Integraciones.',
        res.status,
      );
    }
    throw new PickerTokenError(
      code,
      payload?.error || `No se pudo obtener autorización del selector de Drive (${res.status}).`,
      res.status,
    );
  }

  return { accessToken: payload.access_token as string };
}

/**
 * Carga bajo demanda el SDK oficial de Google Picker (`https://apis.google.com/js/api.js`).
 */
export function loadGooglePickerSdk(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Picker solo está disponible en el navegador.'));
  }

  if (window.google?.picker?.PickerBuilder) {
    return Promise.resolve();
  }

  if (pickerSdkPromise) {
    return pickerSdkPromise;
  }

  pickerSdkPromise = new Promise<void>((resolve, reject) => {
    const loadPickerLib = () => {
      if (!window.gapi) {
        pickerSdkPromise = null;
        reject(new Error('Google API loader (gapi) no se inicializó correctamente.'));
        return;
      }
      window.gapi.load('picker', {
        callback: () => {
          if (window.google?.picker?.PickerBuilder) {
            resolve();
          } else {
            pickerSdkPromise = null;
            reject(new Error('No se pudo inicializar google.picker.PickerBuilder.'));
          }
        },
        onerror: () => {
          pickerSdkPromise = null;
          reject(new Error('Error cargando la librería de Google Picker.'));
        },
        timeout: 15000,
        ontimeout: () => {
          pickerSdkPromise = null;
          reject(new Error('Tiempo de espera agotado cargando Google Picker.'));
        },
      });
    };

    if (window.gapi) {
      loadPickerLib();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-veyra-gapi="true"]',
    );
    if (existing) {
      existing.addEventListener('load', loadPickerLib, { once: true });
      existing.addEventListener(
        'error',
        () => {
          pickerSdkPromise = null;
          reject(new Error('No se pudo cargar Google API script (apis.google.com).'));
        },
        { once: true },
      );
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.async = true;
    script.defer = true;
    script.dataset.veyraGapi = 'true';
    script.onload = loadPickerLib;
    script.onerror = () => {
      pickerSdkPromise = null;
      reject(new Error('No se pudo cargar Google API script (apis.google.com).'));
    };
    document.head.appendChild(script);
  });

  return pickerSdkPromise;
}

/**
 * Abre el selector oficial de Google Drive (`PickerBuilder`, variante W2).
 */
export async function openWebGoogleDrivePicker(
  accessToken: string,
): Promise<{ cancelled: boolean; fileIds: string[] }> {
  if (!GOOGLE_PICKER_API_KEY) {
    throw new PickerTokenError(
      'MISSING_API_KEY',
      'Falta configurar VITE_GOOGLE_PICKER_API_KEY en el entorno web.',
    );
  }

  await loadGooglePickerSdk();
  const pickerNs = window.google?.picker;
  if (!pickerNs) {
    throw new Error('Google Picker SDK no está disponible.');
  }

  return await new Promise((resolve) => {
    const docsView = new pickerNs.DocsView(pickerNs.ViewId.DOCS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(false);

    const imagesView = new pickerNs.DocsView(pickerNs.ViewId.DOCS_IMAGES);

    const picker = new pickerNs.PickerBuilder()
      .setTitle('Selecciona archivos de Google Drive')
      .setLocale('es')
      .setAppId(GOOGLE_PICKER_APP_ID)
      .setOAuthToken(accessToken)
      .setDeveloperKey(GOOGLE_PICKER_API_KEY)
      .setOrigin(window.location.origin)
      .enableFeature(pickerNs.Feature.MULTISELECT_ENABLED)
      .addView(docsView)
      .addView(imagesView)
      .setCallback((data: GooglePickerCallbackData) => {
        if (data.action === pickerNs.Action.PICKED) {
          const fileIds = (data.docs ?? [])
            .map((doc) => doc.id?.trim())
            .filter((id): id is string => Boolean(id));
          resolve({ cancelled: false, fileIds });
        } else if (data.action === pickerNs.Action.CANCEL) {
          resolve({ cancelled: true, fileIds: [] });
        }
      })
      .build();

    picker.setVisible(true);
  });
}

/**
 * Envía los `file_ids` seleccionados a `attach-drive-files` para verificar metadatos
 * en servidor y crear los registros en `public.attachments`.
 */
export async function attachDriveFilesToTarget(
  targetType: 'note' | 'reminder' | 'event',
  targetId: string,
  fileIds: string[],
): Promise<AttachDriveFilesResponse> {
  const jwt = await getAccessTokenOrThrow();

  const res = await fetch(`${SUPABASE_URL}/functions/v1/attach-drive-files`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      target_type: targetType,
      target_id: targetId,
      file_ids: fileIds,
    }),
  });

  const json = await res.json().catch(() => ({}));

  if (res.status !== 200 && res.status !== 422) {
    throw new Error(json?.error || `Error al adjuntar archivos desde Drive (${res.status}).`);
  }

  return {
    ok: Boolean(json?.ok),
    attachments: Array.isArray(json?.attachments) ? json.attachments : [],
    errors: Array.isArray(json?.errors) ? json.errors : [],
  };
}

/**
 * Flujo completo Web (Plan v3.1 §5.2 W2):
 * 1) `picker-token` -> 2) `PickerBuilder` -> 3) descarta token local -> 4) `attach-drive-files`.
 */
export async function pickAndAttachFromGoogleDrive(
  targetType: 'note' | 'reminder' | 'event',
  targetId: string,
): Promise<
  | { cancelled: true }
  | { cancelled: false; attachments: DriveAttachedFile[]; errors: DriveAttachFileError[] }
> {
  let tokenHolder: string | null = (await fetchPickerAccessToken()).accessToken;

  let selection: { cancelled: boolean; fileIds: string[] };
  try {
    selection = await openWebGoogleDrivePicker(tokenHolder);
  } finally {
    // Descartar referencia en memoria del token efímero tras cerrar el Picker
    tokenHolder = null;
  }

  if (selection.cancelled || selection.fileIds.length === 0) {
    return { cancelled: true };
  }

  const attached = await attachDriveFilesToTarget(targetType, targetId, selection.fileIds);
  return {
    cancelled: false,
    attachments: attached.attachments,
    errors: attached.errors,
  };
}

export function humanizeDriveAttachError(err: DriveAttachFileError): string {
  switch (err.code) {
    case 'GOOGLE_NATIVE_FILE_NOT_SUPPORTED':
      return 'Los documentos nativos de Google (Docs/Sheets/Slides) no están soportados aún.';
    case 'FOLDER_NOT_SUPPORTED':
      return 'No se pueden adjuntar carpetas completas; elige archivos individuales.';
    case 'FILE_TRASHED':
      return 'El archivo está en la papelera de Google Drive.';
    case 'FILE_NOT_DOWNLOADABLE':
      return 'El archivo no permite descarga en Google Drive.';
    case 'FILE_NOT_ACCESSIBLE':
      return 'Sin permiso para leer el archivo desde la integración de Drive.';
    case 'FILE_NOT_FOUND':
      return 'No se encontró el archivo en Google Drive.';
    default:
      return err.error || 'No se pudo adjuntar el archivo desde Google Drive.';
  }
}
