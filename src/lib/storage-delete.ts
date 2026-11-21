import { supabase } from './supabase';
import { invalidateSignedUrlCache, parseAttachmentUri } from './storage/attachmentUriResolver';

/**
 * Extracts the storage object path from a Supabase Storage public or signed URL.
 * Example URL:
 * https://<project>.supabase.co/storage/v1/object/public/attachments/userId/notes/12345_abc.webp
 * Returns: "userId/notes/12345_abc.webp"
 */
export function extractStoragePath(url: string): string | null {
  if (!url || typeof url !== 'string') return null;

  try {
    // 1. Match public URL pattern
    const publicMatch = url.match(/\/storage\/v1\/object\/(?:public|sign)\/attachments\/(.+?)(?:\?.*)?$/i);
    if (publicMatch && publicMatch[1]) {
      return decodeURIComponent(publicMatch[1]);
    }

    // 2. Direct attachments match
    const directMatch = url.match(/\/attachments\/(.+?)(?:\?.*)?$/i);
    if (directMatch && directMatch[1]) {
      return decodeURIComponent(directMatch[1]);
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Best-effort logical deletion (Fase 5: `rpc_soft_delete_attachment` + `storage_deletion_queue`)
 * with fallback for non-backfilled legacy URLs in bucket `attachments`.
 * Never throws errors: logs warnings/errors internally and resolves safely.
 */
export async function deleteNoteImage(url: string): Promise<void> {
  if (!url) return;

  // 1. Nuevo esquema privado (`veyra-attachment://<attachment_id>`) -> borrado lógico por RPC
  const attachmentId = parseAttachmentUri(url);
  if (attachmentId) {
    invalidateSignedUrlCache(attachmentId);
    try {
      const { error } = await (supabase.rpc as any)('rpc_soft_delete_attachment', {
        p_attachment_id: attachmentId,
      });
      if (error) {
        console.warn(`[deleteNoteImage] Error en borrado lógico para "${attachmentId}":`, error.message);
      } else {
        console.log(`🗑️ [deleteNoteImage] Encolado para borrado físico: ${attachmentId}`);
      }
    } catch (err) {
      console.warn(`[deleteNoteImage] Excepción en borrado lógico para "${attachmentId}":`, err);
    }
    return;
  }

  // 2. URL legacy (`attachments/...`): intentar primero borrado lógico si ya fue backfilled
  const storagePath = extractStoragePath(url);
  if (!storagePath) {
    console.warn('[deleteNoteImage] No se pudo extraer la ruta de storage para:', url);
    return;
  }

  try {
    const { data: legacyRow } = await (supabase as any)
      .from('attachments')
      .select('id')
      .eq('storage_bucket', 'attachments')
      .eq('storage_path', storagePath)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();

    if (legacyRow?.id) {
      const { error: rpcErr } = await (supabase.rpc as any)('rpc_soft_delete_attachment', {
        p_attachment_id: legacyRow.id,
      });
      if (rpcErr) {
        console.warn(`[deleteNoteImage] Error RPC para legado "${storagePath}":`, rpcErr.message);
      } else {
        console.log(`🗑️ [deleteNoteImage] Adjunto legado encolado para borrado: ${legacyRow.id}`);
      }
      return;
    }

    const { error } = await supabase.storage.from('attachments').remove([storagePath]);
    if (error) {
      console.warn(`[deleteNoteImage] Error al eliminar "${storagePath}" de Supabase Storage:`, error.message);
    } else {
      console.log(`🗑️ [deleteNoteImage] Eliminado exitosamente de Storage: ${storagePath}`);
    }
  } catch (err) {
    console.warn(`[deleteNoteImage] Excepción al intentar eliminar "${storagePath}":`, err);
  }
}

