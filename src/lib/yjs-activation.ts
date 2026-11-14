import * as Y from 'yjs';
import { supabase } from './supabase';
import { uint8ArrayToBase64, computeSha256 } from './crypto-utils';

export interface ActivateYjsResult {
  success: boolean;
  error?: string;
  noteId?: string;
}

/**
 * Activates a note into 'yjs' collaborative real-time mode.
 * Invokes the atomic Supabase RPC `activate_note_yjs_mode`, which:
 * 1. Checks that the authenticated user is the legitimate owner.
 * 2. Seeds the initial Yjs update into `note_yjs_updates` and `note_yjs_snapshots`.
 * 3. Transitions `public.notes.sync_mode` to 'yjs'.
 * 
 * Once in 'yjs' mode:
 * - Mobile Android app automatically switches to `VeyraTiptapYjsEditor`.
 * - Supabase Realtime channel `note_yjs_${noteId}` synchronizes both PC and Android simultaneously.
 * - The user DOES NOT need to share the note with anyone to edit between devices.
 */
export async function activateNoteYjsMode(noteId: string, ydoc: Y.Doc): Promise<ActivateYjsResult> {
  try {
    // 1. Fetch fresh note row
    let { data: noteRow, error: fetchErr } = await supabase
      .from('notes')
      .select('id, user_id, content, sync_mode, updated_at_ms, last_modified_ms')
      .eq('id', noteId)
      .maybeSingle();

    if (!noteRow) {
      try {
        const { localDB } = await import('./db/local-db');
        const local = await localDB.notes.get(noteId);
        if (local) {
          // Asegurar que la fila exista en Supabase antes de invocar la RPC
          await supabase.from('notes').upsert(local, { onConflict: 'id' });
          const { data: freshRow } = await supabase
            .from('notes')
            .select('id, user_id, content, sync_mode, updated_at_ms, last_modified_ms')
            .eq('id', noteId)
            .maybeSingle();
          noteRow = freshRow || null;
        }
      } catch (localErr) {
        console.warn('⚠️ [activateNoteYjsMode] Error recuperando nota local:', localErr);
      }
    }

    if (!noteRow) {
      console.warn('⚠️ [activateNoteYjsMode] Error consultando nota:', fetchErr);
      return { success: false, error: fetchErr?.message || 'Nota no encontrada' };
    }

    // Already in yjs mode
    if (noteRow.sync_mode === 'yjs') {
      return { success: true, noteId };
    }

    // 2. Prepare payload
    const updateBytes = Y.encodeStateAsUpdate(ydoc);
    const initialUpdateData = uint8ArrayToBase64(updateBytes);
    const initialUpdateHash = await computeSha256(updateBytes);

    const svBytes = Y.encodeStateVector(ydoc);
    const initialStateVector = uint8ArrayToBase64(svBytes);

    const contentStr = noteRow.content || '';
    const expectedContentHash = await computeSha256(contentStr);
    const expectedUpdatedAtMs = Number(noteRow.updated_at_ms || noteRow.last_modified_ms || Date.now());
    const clientId = 'web-' + crypto.randomUUID();

    console.log(`🚀 [activateNoteYjsMode] Activando nota ${noteId} en modo Yjs...`);

    // 3. Call transactional RPC
    const { data, error } = await supabase.rpc('activate_note_yjs_mode', {
      p_note_id: noteId,
      p_client_id: clientId,
      p_initial_update_data: initialUpdateData,
      p_initial_update_hash: initialUpdateHash,
      p_expected_content_hash: expectedContentHash,
      p_expected_updated_at_ms: Math.floor(expectedUpdatedAtMs),
      p_initial_state_vector: initialStateVector,
    });

    if (error) {
      console.warn('⚠️ [activateNoteYjsMode] Error en activate_note_yjs_mode RPC:', error);
      return { success: false, error: error.message };
    }

    try {
      const { localDB } = await import('./db/local-db');
      await localDB.notes.update(noteId, { sync_mode: 'yjs' });
    } catch (_) {}

    console.log('✅ [activateNoteYjsMode] Nota convertida a modo Yjs exitosamente:', data);
    return { success: true, noteId };
  } catch (err: any) {
    console.error('❌ [activateNoteYjsMode] Excepción:', err);
    return { success: false, error: err?.message };
  }
}

