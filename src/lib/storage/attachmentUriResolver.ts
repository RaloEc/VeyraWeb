import { useEffect, useState } from 'react';
import { supabase } from '../supabase';

export const VEYRA_ATTACHMENT_SCHEME = 'veyra-attachment://';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VEYRA_URI_GLOBAL_RE = /veyra-attachment:\/\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;

// Renovar URL firmada 45s antes de vencer (TTL del backend = 300s)
const SAFETY_MARGIN_MS = 45_000;

interface CachedSignedUrl {
  signedUrl: string;
  expiresAtMs: number;
  isObjectUrl?: boolean;
}

const signedUrlCache = new Map<string, CachedSignedUrl>();
const inflightRequests = new Map<string, Promise<string>>();

function revokeIfObjectUrl(entry: CachedSignedUrl | undefined): void {
  if (entry?.isObjectUrl && typeof URL !== 'undefined') {
    try {
      URL.revokeObjectURL(entry.signedUrl);
    } catch {
      // Ignorar errores al liberar blob URLs
    }
  }
}

export function buildAttachmentUri(attachmentId: string): string {
  return `${VEYRA_ATTACHMENT_SCHEME}${attachmentId}`;
}

export function isVeyraAttachmentUri(src: string | null | undefined): boolean {
  return typeof src === 'string' && src.startsWith(VEYRA_ATTACHMENT_SCHEME);
}

export function parseAttachmentUri(src: string | null | undefined): string | null {
  if (!isVeyraAttachmentUri(src) || !src) return null;
  const candidate = src.slice(VEYRA_ATTACHMENT_SCHEME.length).trim();
  return UUID_RE.test(candidate) ? candidate : null;
}

/**
 * Precarga una URL firmada recién recibida (ej. desde upload-finalize)
 * para evitar una petición extra al renderizar la imagen en Tiptap.
 */
export function primeSignedUrlCache(
  attachmentId: string,
  signedUrl: string,
  expiresInSeconds = 300,
  isObjectUrl = false,
): void {
  if (!UUID_RE.test(attachmentId) || !signedUrl) return;
  const previous = signedUrlCache.get(attachmentId);
  if (previous && previous.signedUrl !== signedUrl) {
    revokeIfObjectUrl(previous);
  }
  signedUrlCache.set(attachmentId, {
    signedUrl,
    expiresAtMs: Date.now() + expiresInSeconds * 1000,
    isObjectUrl,
  });
}

export function invalidateSignedUrlCache(attachmentId?: string): void {
  if (attachmentId) {
    revokeIfObjectUrl(signedUrlCache.get(attachmentId));
    signedUrlCache.delete(attachmentId);
  } else {
    for (const entry of signedUrlCache.values()) {
      revokeIfObjectUrl(entry);
    }
    signedUrlCache.clear();
  }
}

function getValidCachedUrl(attachmentId: string): string | null {
  const entry = signedUrlCache.get(attachmentId);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAtMs - SAFETY_MARGIN_MS) {
    revokeIfObjectUrl(entry);
    signedUrlCache.delete(attachmentId);
    return null;
  }
  return entry.signedUrl;
}

async function getAccessToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) return session.access_token;
  const { data: refreshed } = await supabase.auth.refreshSession();
  if (!refreshed?.session?.access_token) {
    throw new Error('No hay sesión activa para resolver adjuntos privados.');
  }
  return refreshed.session.access_token;
}

function getFunctionsBaseUrl(): string {
  const base = (
    import.meta.env.VITE_SUPABASE_URL || 'https://rrwoompvuggcczggfgiq.supabase.co'
  ).replace(/\/+$/, '');
  return `${base}/functions/v1`;
}

function getAnonKey(): string {
  return (
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJyd29vbXB2dWdnY2N6Z2dmZ2lxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5MzQ0MTQsImV4cCI6MjEwNzUxMDQxNH0.aRpjMpXflAOfh-hWIG6XBGW0FPoN91IoYR9FIQsE4fo'
  );
}

function humanizeDriveProxyFailure(
  status: number,
  payload: any,
): string {
  const reason = payload?.unavailable_reason;
  switch (reason) {
    case 'file_deleted':
      return 'El archivo fue eliminado de Google Drive.';
    case 'drive_disconnected':
      return 'La cuenta de Google Drive del propietario está desconectada.';
    case 'needs_reauth':
    case 'permission_revoked':
      return 'La autorización de Google Drive expiró. Reconecta Drive en Ajustes → Integraciones.';
    case 'file_inaccessible':
      return 'Google Drive denegó el acceso a este archivo.';
    case 'account_changed':
      return 'El propietario cambió la cuenta de Google Drive vinculada.';
    default:
      return payload?.error || `No se pudo cargar el adjunto desde Google Drive (${status})`;
  }
}

async function fetchDriveProxyAsObjectUrl(
  attachmentId: string,
  token: string,
): Promise<string> {
  const proxyUrl = `${getFunctionsBaseUrl()}/drive-proxy?attachment_id=${encodeURIComponent(attachmentId)}`;
  const res = await fetch(proxyUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: getAnonKey(),
    },
  });

  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new Error(humanizeDriveProxyFailure(res.status, payload));
  }

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  primeSignedUrlCache(attachmentId, objectUrl, 300, true);
  return objectUrl;
}

/**
 * Abre un `veyra-attachment://<id>` o URL normal en una nueva pestaña.
 */
export async function openAttachmentInNewTab(uri: string): Promise<void> {
  const resolved = await resolveAttachmentUri(uri);
  window.open(resolved, '_blank', 'noopener,noreferrer');
}

/**
 * Resuelve una URI individual.
 * - Si es `veyra-attachment://<id>`: devuelve URL firmada o blob URL vía `drive-proxy` (con caché + deduplicación).
 * - Si es cualquier otra URL (legacy `https://...`, `blob:`, `data:`): la devuelve intacta.
 */
export async function resolveAttachmentUri(
  src: string,
  options?: { forceRefresh?: boolean },
): Promise<string> {
  const attachmentId = parseAttachmentUri(src);
  if (!attachmentId) return src;

  if (!options?.forceRefresh) {
    const cached = getValidCachedUrl(attachmentId);
    if (cached) return cached;
  } else {
    invalidateSignedUrlCache(attachmentId);
  }

  const existing = inflightRequests.get(attachmentId);
  if (existing) return existing;

  const promise = (async () => {
    const token = await getAccessToken();
    const res = await fetch(`${getFunctionsBaseUrl()}/attachment-signed-url`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: getAnonKey(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ attachment_id: attachmentId }),
    });

    const payload = await res.json().catch(() => null);
    if (res.status === 422 && payload?.code === 'USE_DRIVE_PROXY') {
      return await fetchDriveProxyAsObjectUrl(attachmentId, token);
    }

    if (!res.ok || !payload?.signed_url) {
      throw new Error(payload?.error || `No se pudo firmar el adjunto (${res.status})`);
    }

    primeSignedUrlCache(attachmentId, payload.signed_url, payload.expires_in ?? 300);
    return payload.signed_url as string;
  })();

  inflightRequests.set(attachmentId, promise);
  try {
    return await promise;
  } finally {
    inflightRequests.delete(attachmentId);
  }
}

/**
 * Resuelve en lote (máx. 25 por petición) todas las URIs `veyra-attachment://<id>`
 * presentes en un bloque HTML (útil para previsualización de lectura o exportación PDF).
 */
export async function resolveAttachmentUrisInHtml(html: string): Promise<string> {
  if (!html || !html.includes(VEYRA_ATTACHMENT_SCHEME)) return html;

  const ids = new Set<string>();
  for (const match of html.matchAll(VEYRA_URI_GLOBAL_RE)) {
    if (match[1]) ids.add(match[1]);
  }
  if (ids.size === 0) return html;

  const missing = Array.from(ids).filter((id) => !getValidCachedUrl(id));
  if (missing.length > 0) {
    const token = await getAccessToken();
    const driveFallbackIds: string[] = [];

    for (let i = 0; i < missing.length; i += 25) {
      const chunk = missing.slice(i, i + 25);
      const res = await fetch(`${getFunctionsBaseUrl()}/attachment-signed-url`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: getAnonKey(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ attachment_ids: chunk }),
      });

      if (!res.ok) continue;
      const payload = await res.json().catch(() => null);
      const results = payload?.results ?? {};
      for (const id of chunk) {
        const entry = results[id];
        if (entry?.ok && entry?.signed_url) {
          primeSignedUrlCache(id, entry.signed_url, entry.expires_in ?? 300);
        } else if (entry?.code === 'USE_DRIVE_PROXY') {
          driveFallbackIds.push(id);
        }
      }
    }

    if (driveFallbackIds.length > 0) {
      await Promise.allSettled(
        driveFallbackIds.map((id) => fetchDriveProxyAsObjectUrl(id, token)),
      );
    }
  }

  return html.replace(VEYRA_URI_GLOBAL_RE, (fullMatch, id: string) => {
    return getValidCachedUrl(id) ?? fullMatch;
  });
}

/**
 * Hook React listo para ImageNodeView.tsx:
 * Mantiene `node.attrs.src` en Yjs como `veyra-attachment://<id>` y resuelve
 * solo el `src` efímero del elemento <img>, con renovación automática si caduca.
 */
export function useResolvedAttachmentSrc(src: string | null | undefined) {
  const attachmentId = parseAttachmentUri(src);
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(() => {
    if (!src) return null;
    if (!attachmentId) return src;
    return getValidCachedUrl(attachmentId);
  });
  const [isLoading, setIsLoading] = useState<boolean>(
    Boolean(attachmentId && !getValidCachedUrl(attachmentId)),
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!src) {
      setResolvedSrc(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    if (!attachmentId) {
      setResolvedSrc(src);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    const cached = getValidCachedUrl(attachmentId);
    if (cached) {
      setResolvedSrc(cached);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    resolveAttachmentUri(src)
      .then((url) => {
        if (!cancelled) {
          setResolvedSrc(url);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Error cargando adjunto');
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [src, attachmentId]);

  // Llamar desde <img onError={refresh} /> si una pestaña abierta >5 min caduca la URL firmada
  const refresh = async () => {
    if (!src || !attachmentId) return;
    setIsLoading(true);
    setError(null);
    try {
      const freshUrl = await resolveAttachmentUri(src, { forceRefresh: true });
      setResolvedSrc(freshUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error renovando URL');
    } finally {
      setIsLoading(false);
    }
  };

  return { resolvedSrc, isLoading, error, refresh, isPrivateAttachment: Boolean(attachmentId) };
}
