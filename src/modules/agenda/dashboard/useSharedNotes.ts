import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../lib/supabase';
import type { Note } from '../../../types/notes';

export interface SharedNoteEntry {
  note: Note;
  direction: 'shared_with_me' | 'shared_by_me';
  role: 'owner' | 'editor' | 'viewer';
  collaboratorCount: number;
}

interface CollabRow {
  target_type: string;
  target_id: string;
  owner_id: string;
  member_id: string;
  role: string;
}

export function useSharedNotes(currentUserId: string | undefined, allNotes: Note[]) {
  const [collabRows, setCollabRows] = useState<CollabRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!currentUserId) {
      setCollabRows([]);
      return;
    }

    let cancelled = false;

    const loadCollaborations = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('collaborations')
          .select('target_type, target_id, owner_id, member_id, role')
          .or(`owner_id.eq.${currentUserId},member_id.eq.${currentUserId}`);

        if (!cancelled && !error && Array.isArray(data)) {
          setCollabRows(data as CollabRow[]);
        }
      } catch (err) {
        console.warn('[useSharedNotes] Error loading collaborations:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadCollaborations();

    return () => {
      cancelled = true;
    };
  }, [currentUserId]);

  const sharedNotes = useMemo<SharedNoteEntry[]>(() => {
    if (!currentUserId) return [];

    const noteCollabs = new Map<string, CollabRow[]>();
    const folderCollabs = new Map<string, CollabRow[]>();

    for (const row of collabRows) {
      if (row.target_type === 'note') {
        const list = noteCollabs.get(row.target_id) || [];
        list.push(row);
        noteCollabs.set(row.target_id, list);
      } else if (row.target_type === 'folder') {
        const list = folderCollabs.get(row.target_id) || [];
        list.push(row);
        folderCollabs.set(row.target_id, list);
      }
    }

    const entries: SharedNoteEntry[] = [];

    for (const note of allNotes) {
      if (note.deleted === 1) continue;

      const isForeignOwner = Boolean(note.user_id && note.user_id !== currentUserId);
      const directRows = noteCollabs.get(note.id) || [];
      const inheritedRows = note.folder_id ? folderCollabs.get(note.folder_id) || [] : [];
      const allRows = [...directRows, ...inheritedRows];

      if (!isForeignOwner && allRows.length === 0) continue;

      const direction: SharedNoteEntry['direction'] = isForeignOwner
        ? 'shared_with_me'
        : 'shared_by_me';

      let role: SharedNoteEntry['role'] = isForeignOwner ? 'editor' : 'owner';
      if (isForeignOwner) {
        const myRow = allRows.find((r) => r.member_id === currentUserId);
        if (myRow?.role === 'viewer') role = 'viewer';
      }

      const uniqueMembers = new Set(
        allRows.map((r) => r.member_id).filter((id) => id && id !== currentUserId)
      );

      entries.push({
        note,
        direction,
        role,
        collaboratorCount: uniqueMembers.size || (allRows.length > 0 ? 1 : 0),
      });
    }

    return entries.sort(
      (a, b) => (b.note.updated_at_ms || 0) - (a.note.updated_at_ms || 0)
    );
  }, [currentUserId, allNotes, collabRows]);

  return { sharedNotes, loading };
}
