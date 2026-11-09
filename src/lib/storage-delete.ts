import { supabase } from './supabase';

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
 * Best-effort deletion of an image in Supabase Storage.
 * Never throws errors: logs warnings/errors internally and resolves safely.
 */
export async function deleteNoteImage(url: string): Promise<void> {
  if (!url) return;

  const storagePath = extractStoragePath(url);
  if (!storagePath) {
    console.warn('[deleteNoteImage] No se pudo extraer la ruta de storage para:', url);
    return;
  }

  try {
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

