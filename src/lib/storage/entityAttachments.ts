import { supabase } from '../supabase';
import { localDB } from '../db/local-db';
import { syncEngine } from '../sync/syncEngine';
import { compressImage, isGif } from '../image-pipeline';
import { deleteNoteImage } from '../storage-delete';
import type { AttachmentItem } from '../utils';
import {
  uploadFile,
  StorageUploadError,
  isVeyraAttachmentUri,
} from './index';

export type EntityAttachmentTarget = 'event' | 'reminder';

export interface PendingAttachmentFile {
  file: File | Blob;
  name: string;
}

function replaceExtension(filename: string, newExt: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot > 0) {
    return `${filename.slice(0, dot)}.${newExt}`;
  }
  return `${filename}.${newExt}`;
}

export async function prepareAttachmentFile(
  rawFile: File | Blob
): Promise<{ file: File | Blob; name: string }> {
  let fileName = 'imagen.png';
  if ('name' in rawFile && rawFile.name) {
    fileName = rawFile.name;
  } else {
    const ext = rawFile.type ? rawFile.type.split('/')[1] || 'png' : 'png';
    fileName = `captura_${Date.now()}.${ext}`;
  }

  if (fileName === 'image.png') {
    const ext = rawFile.type ? rawFile.type.split('/')[1] || 'png' : 'png';
    fileName = `captura_${Date.now()}.${ext}`;
  }

  const namedFile =
    'name' in rawFile && rawFile.name === fileName
      ? (rawFile as File)
      : new File([rawFile], fileName, {
          type: rawFile.type || 'application/octet-stream',
        });

  const mime = (namedFile.type || '').toLowerCase();
  const looksLikeImage =
    mime.startsWith('image/') ||
    /\.(png|jpe?g|webp|gif|bmp)$/i.test(fileName);

  if (looksLikeImage && !isGif(namedFile) && !mime.includes('svg')) {
    const compressedBlob = await compressImage(namedFile);
    const outExt = compressedBlob.type === 'image/jpeg' ? 'jpg' : 'webp';
    const outName = replaceExtension(fileName, outExt);
    return {
      file: new File([compressedBlob], outName, {
        type: compressedBlob.type || 'image/webp',
      }),
      name: outName,
    };
  }

  return { file: namedFile, name: fileName };
}

async function ensureEntitySyncedInPostgres(
  targetType: EntityAttachmentTarget,
  targetId: string
): Promise<void> {
  const table = targetType === 'event' ? 'events' : 'reminders';
  await syncEngine.processOutbox();

  for (let attempt = 0; attempt < 5; attempt++) {
    const { data } = await supabase
      .from(table)
      .select('id')
      .eq('id', targetId)
      .maybeSingle();
    if (data?.id) return;
    await new Promise((r) => setTimeout(r, 300));
    if (attempt === 1) {
      await syncEngine.processOutbox();
    }
  }
}

export async function uploadEntityAttachment(
  file: File | Blob,
  filename: string,
  targetType: EntityAttachmentTarget,
  targetId: string
): Promise<AttachmentItem> {
  try {
    const uploaded = await uploadFile(file, targetType, targetId, { filename });
    return { uri: uploaded.attachment_uri, name: filename };
  } catch (err) {
    if (err instanceof StorageUploadError && err.code === 'RESERVE_FAILED') {
      await ensureEntitySyncedInPostgres(targetType, targetId);
      const retried = await uploadFile(file, targetType, targetId, { filename });
      return { uri: retried.attachment_uri, name: filename };
    }
    throw err;
  }
}

export async function flushPendingEntityAttachments(params: {
  targetType: EntityAttachmentTarget;
  targetId: string;
  nonPending: AttachmentItem[];
  pendingEntries: { previewUrl: string; entry: PendingAttachmentFile }[];
}): Promise<{ failedCount: number; lastError?: string }> {
  const { targetType, targetId, nonPending, pendingEntries } = params;
  if (pendingEntries.length === 0) return { failedCount: 0 };

  await ensureEntitySyncedInPostgres(targetType, targetId);

  const uploadedPending: AttachmentItem[] = [];
  let failedCount = 0;
  let lastError: string | undefined;

  for (const item of pendingEntries) {
    try {
      const res = await uploadEntityAttachment(
        item.entry.file,
        item.entry.name,
        targetType,
        targetId
      );
      uploadedPending.push(res);
    } catch (err: any) {
      failedCount++;
      lastError = err?.message || 'Error al subir adjunto pendiente';
      console.warn(`[flushPendingEntityAttachments] Error uploading ${item.entry.name}:`, err);
    } finally {
      URL.revokeObjectURL(item.previewUrl);
    }
  }

  if (uploadedPending.length > 0) {
    const finalAttachments = [...nonPending, ...uploadedPending];
    const finalJson = JSON.stringify(finalAttachments);
    const nowMs = Date.now();

    if (targetType === 'event') {
      await localDB.events.update(targetId, {
        attachments: finalJson,
        last_modified_ms: nowMs,
      });
      await supabase
        .from('events')
        .update({ attachments: finalJson, last_modified_ms: nowMs })
        .eq('id', targetId);
    } else {
      await localDB.reminders.update(targetId, {
        attachments: finalJson,
        last_modified_ms: nowMs,
      });
      await supabase
        .from('reminders')
        .update({ attachments: finalJson, last_modified_ms: nowMs })
        .eq('id', targetId);
    }
  }

  return { failedCount, lastError };
}

export function cleanupRemovedAttachment(
  removed: AttachmentItem | undefined,
  pendingMap: Map<string, PendingAttachmentFile>
): void {
  if (!removed?.uri) return;
  if (pendingMap.has(removed.uri)) {
    pendingMap.delete(removed.uri);
    URL.revokeObjectURL(removed.uri);
    return;
  }
  if (isVeyraAttachmentUri(removed.uri) || removed.uri.includes('attachments')) {
    deleteNoteImage(removed.uri);
  }
}

export function clearPendingAttachmentMap(
  pendingMap: Map<string, PendingAttachmentFile>
): void {
  for (const previewUrl of pendingMap.keys()) {
    URL.revokeObjectURL(previewUrl);
  }
  pendingMap.clear();
}
