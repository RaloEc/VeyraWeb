import * as tus from 'tus-js-client';
import { supabase } from '../supabase';
import { buildAttachmentUri, primeSignedUrlCache } from './attachmentUriResolver';

export type AttachmentTargetType = 'note' | 'reminder' | 'event';

export interface UploadFileOptions {
  /** Nombre explícito si `file` es un `Blob` sin propiedad `.name` (ej. recorte de imagen). */
  filename?: string;
  /** Callback de progreso (0..100). */
  onProgress?: (progress: { bytesUploaded: number; bytesTotal: number; percent: number }) => void;
  /** Permite cancelar una subida TUS en curso. */
  signal?: AbortSignal;
}

export interface UploadFileResult {
  attachment_id: string;
  /** URI estable para persistir en Tiptap/Yjs: `veyra-attachment://<attachment_id>` */
  attachment_uri: string;
  signed_url: string | null;
  signed_url_expires_in: number;
  size_bytes: number;
  mime_type: string;
  checksum_sha256: string;
  remaining_bytes: number;
  plan_code: string;
}

export type StorageUploadErrorCode =
  | 'NO_SESSION'
  | 'QUOTA_EXCEEDED'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_MIME'
  | 'TOO_MANY_RESERVATIONS'
  | 'RESERVE_FAILED'
  | 'UPLOAD_FAILED'
  | 'FINALIZE_FAILED'
  | 'ABORTED';

export class StorageUploadError extends Error {
  readonly code: StorageUploadErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: StorageUploadErrorCode,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'StorageUploadError';
    this.code = code;
    this.details = details;
  }
}

interface QuotaReserveResponse {
  reservation_id: string;
  attachment_id: string;
  bucket_id: string;
  storage_path: string;
  max_bytes: number;
  expires_at: string;
  remaining_bytes: number;
  plan_code: string;
  upload_protocol: 'standard' | 'tus';
  tus_chunk_size: number;
}

interface UploadFinalizeResponse {
  ok: boolean;
  outcome: string;
  attachment_id: string;
  availability: string;
  size_bytes: number;
  mime_type: string;
  checksum_sha256: string;
  signed_url: string | null;
  signed_url_expires_in: number;
}

const DEFAULT_TUS_CHUNK_SIZE = 6 * 1024 * 1024; // 6 MiB (requisito Supabase TUS)

function getSupabaseUrl(): string {
  return (
    import.meta.env.VITE_SUPABASE_URL || 'https://rrwoompvuggcczggfgiq.supabase.co'
  ).replace(/\/+$/, '');
}

function getSupabaseAnonKey(): string {
  return (
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJyd29vbXB2dWdnY2N6Z2dmZ2lxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5MzQ0MTQsImV4cCI6MjEwNzUxMDQxNH0.aRpjMpXflAOfh-hWIG6XBGW0FPoN91IoYR9FIQsE4fo'
  );
}

async function getValidAccessToken(): Promise<string> {
  let { data: { session } } = await supabase.auth.getSession();

  const expiresSoon =
    typeof session?.expires_at === 'number' && session.expires_at * 1000 < Date.now() + 60_000;
  const oversizedJwt = Boolean(session?.access_token && session.access_token.length > 4000);

  if (!session || expiresSoon || oversizedJwt) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    if (refreshed?.session) {
      session = refreshed.session;
    }
  }

  if (!session?.access_token) {
    throw new StorageUploadError(
      'No hay una sesión activa para subir archivos.',
      'NO_SESSION',
    );
  }

  return session.access_token;
}

function inferMimeType(file: File | Blob, filename: string): string {
  const raw = (file.type || '').trim().toLowerCase().replace('image/jpg', 'image/jpeg');
  if (raw) return raw;

  const lower = filename.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.txt')) return 'text/plain';
  if (lower.endsWith('.md')) return 'text/markdown';
  if (lower.endsWith('.csv')) return 'text/csv';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.zip')) return 'application/zip';
  return 'application/octet-stream';
}

function uploadViaTus(params: {
  file: File | Blob;
  accessToken: string;
  bucketName: string;
  objectName: string;
  contentType: string;
  chunkSize: number;
  onProgress?: UploadFileOptions['onProgress'];
  signal?: AbortSignal;
}): Promise<void> {
  const { file, accessToken, bucketName, objectName, contentType, chunkSize, onProgress, signal } =
    params;

  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new StorageUploadError('Subida cancelada por el usuario.', 'ABORTED'));
      return;
    }

    const endpoint = `${getSupabaseUrl()}/storage/v1/upload/resumable`;

    const upload = new tus.Upload(file, {
      endpoint,
      uploadSize: file.size,
      chunkSize,
      retryDelays: [0, 1000, 3000, 5000],
      // Cada reserva tiene una ruta determinista única; no reutilizar fingerprints viejos.
      storeFingerprintForResuming: false,
      removeFingerprintOnSuccess: true,
      headers: {
        authorization: `Bearer ${accessToken}`,
        apikey: getSupabaseAnonKey(),
        'x-upsert': 'false',
      },
      metadata: {
        bucketName,
        objectName,
        contentType,
        cacheControl: '31536000',
      },
      onProgress(bytesUploaded, bytesTotal) {
        if (!onProgress) return;
        const percent = bytesTotal > 0 ? Math.round((bytesUploaded / bytesTotal) * 100) : 0;
        onProgress({ bytesUploaded, bytesTotal, percent });
      },
      onSuccess() {
        cleanupAbort();
        resolve();
      },
      onError(err) {
        cleanupAbort();
        reject(
          new StorageUploadError(
            err instanceof Error ? err.message : 'Error en subida resumible TUS',
            'UPLOAD_FAILED',
          ),
        );
      },
    });

    const onAbort = () => {
      upload.abort(true).catch(() => {});
      reject(new StorageUploadError('Subida cancelada por el usuario.', 'ABORTED'));
    };

    const cleanupAbort = () => {
      signal?.removeEventListener('abort', onAbort);
    };

    signal?.addEventListener('abort', onAbort, { once: true });
    upload.start();
  });
}

/**
 * Orquestador oficial de subida Fase 5 (Web):
 *   1) POST /functions/v1/quota-reserve (JWT + reserva atómica)
 *   2) Subida a 'veyra-attachments' (standard <= 6 MiB | TUS 6 MiB chunks > 6 MiB)
 *   3) POST /functions/v1/upload-finalize (verificación magic bytes + SHA-256 + URL firmada)
 */
export async function uploadFile(
  file: File | Blob,
  targetType: AttachmentTargetType,
  targetId: string,
  options?: UploadFileOptions,
): Promise<UploadFileResult> {
  const filename =
    options?.filename ||
    ('name' in file && typeof file.name === 'string' && file.name.trim()
      ? file.name.trim()
      : `attachment_${Date.now()}.bin`);
  const mimeType = inferMimeType(file, filename);
  const sizeBytes = file.size;

  const accessToken = await getValidAccessToken();
  const functionsBase = `${getSupabaseUrl()}/functions/v1`;
  const anonKey = getSupabaseAnonKey();

  // --- Paso A: Reservar cuota y ruta determinista ---
  const reserveRes = await fetch(`${functionsBase}/quota-reserve`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      target_type: targetType,
      target_id: targetId,
      name: filename,
      mime_type: mimeType,
      size_bytes: sizeBytes,
    }),
    signal: options?.signal,
  });

  const reserveBody = await reserveRes.json().catch(() => null);
  if (!reserveRes.ok || !reserveBody?.reservation_id) {
    const code = (reserveBody?.code as StorageUploadErrorCode) || 'RESERVE_FAILED';
    throw new StorageUploadError(
      reserveBody?.error || `No se pudo reservar cuota (${reserveRes.status})`,
      code,
      reserveBody ?? undefined,
    );
  }

  const reservation = reserveBody as QuotaReserveResponse;

  // --- Paso B: Subir bytes al bucket privado 'veyra-attachments' ---
  if (reservation.upload_protocol === 'tus') {
    await uploadViaTus({
      file,
      accessToken,
      bucketName: reservation.bucket_id,
      objectName: reservation.storage_path,
      contentType: mimeType,
      chunkSize: reservation.tus_chunk_size || DEFAULT_TUS_CHUNK_SIZE,
      onProgress: options?.onProgress,
      signal: options?.signal,
    });
  } else {
    if (options?.signal?.aborted) {
      throw new StorageUploadError('Subida cancelada por el usuario.', 'ABORTED');
    }
    const { error: uploadErr } = await supabase.storage
      .from(reservation.bucket_id)
      .upload(reservation.storage_path, file, {
        contentType: mimeType,
        cacheControl: '31536000',
        upsert: false,
      });

    if (uploadErr) {
      throw new StorageUploadError(
        uploadErr.message || 'Error subiendo archivo a Supabase Storage',
        'UPLOAD_FAILED',
      );
    }
    options?.onProgress?.({ bytesUploaded: sizeBytes, bytesTotal: sizeBytes, percent: 100 });
  }

  // --- Paso C: Finalizar subida verificada en servidor ---
  const finalizeRes = await fetch(`${functionsBase}/upload-finalize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ reservation_id: reservation.reservation_id }),
    signal: options?.signal,
  });

  const finalizeBody = await finalizeRes.json().catch(() => null);
  if (!finalizeRes.ok || !finalizeBody?.ok) {
    const code =
      finalizeBody?.code === 'QUOTA_OR_MIME_VIOLATION'
        ? 'UNSUPPORTED_MIME'
        : 'FINALIZE_FAILED';
    throw new StorageUploadError(
      finalizeBody?.error || `Error al finalizar la subida (${finalizeRes.status})`,
      code,
      finalizeBody ?? undefined,
    );
  }

  const finalized = finalizeBody as UploadFinalizeResponse;

  // Precargar la URL firmada en caché para render inmediato sin petición extra
  if (finalized.signed_url) {
    primeSignedUrlCache(
      finalized.attachment_id,
      finalized.signed_url,
      finalized.signed_url_expires_in ?? 300,
    );
  }

  return {
    attachment_id: finalized.attachment_id,
    attachment_uri: buildAttachmentUri(finalized.attachment_id),
    signed_url: finalized.signed_url,
    signed_url_expires_in: finalized.signed_url_expires_in ?? 300,
    size_bytes: finalized.size_bytes,
    mime_type: finalized.mime_type,
    checksum_sha256: finalized.checksum_sha256,
    remaining_bytes: reservation.remaining_bytes,
    plan_code: reservation.plan_code,
  };
}
