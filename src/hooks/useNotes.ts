import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { Folder, Note, NoteContentPaginated } from '../types/notes';
import type { Database } from '../types/database';

export function useNotes(userId?: string, initialNoteId?: string | null) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [deletedNotes, setDeletedNotes] = useState<Note[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(initialNoteId || null);
  const [loading, setLoading] = useState<boolean>(true);
  const initialSelectionDoneRef = useRef<boolean>(false);
  const initialNoteIdRef = useRef<string | null | undefined>(initialNoteId);
  const deletedNoteIdsRef = useRef<Set<string>>(new Set());

  // Sync selectedNoteId if initialNoteId changes externally
  useEffect(() => {
    if (initialNoteId && !deletedNoteIdsRef.current.has(initialNoteId)) {
      setSelectedNoteId(initialNoteId);
    }
  }, [initialNoteId]);

  // Fetch initial data (only when userId changes, NOT on every route change)
  const fetchData = useCallback(async () => {
    if (!userId) return;
    try {
      setLoading(true);
      const [foldersRes, notesRes, deletedNotesRes] = await Promise.all([
        supabase
          .from('folders')
          .select('*')
          .eq('deleted', 0)
          .order('name', { ascending: true }),
        supabase
          .from('notes')
          .select('*')
          .eq('deleted', 0)
          .order('updated_at_ms', { ascending: false }),
        supabase
          .from('notes')
          .select('*')
          .eq('user_id', userId)
          .eq('deleted', 1)
          .order('updated_at_ms', { ascending: false }),
      ]);

      if (foldersRes.data) setFolders(foldersRes.data as unknown as Folder[]);
      if (notesRes.data) {
        let fetchedNotes = (notesRes.data as unknown as Note[]).filter(
          (n) => !deletedNoteIdsRef.current.has(n.id) && n.deleted !== 1
        );

        // On initial load: if an initialNoteId was specified and is not in the list, fetch it directly
        const targetId = initialNoteIdRef.current;
        if (
          !initialSelectionDoneRef.current &&
          targetId &&
          !deletedNoteIdsRef.current.has(targetId) &&
          !fetchedNotes.some((n) => n.id === targetId)
        ) {
          const { data: specificNote } = await supabase
            .from('notes')
            .select('*')
            .eq('id', targetId)
            .maybeSingle();

          if (
            specificNote &&
            !deletedNoteIdsRef.current.has(specificNote.id) &&
            specificNote.deleted !== 1
          ) {
            fetchedNotes = [specificNote as unknown as Note, ...fetchedNotes];
          }
        }

        setNotes(fetchedNotes);

        // Auto select only ONCE on initial load
        if (!initialSelectionDoneRef.current) {
          initialSelectionDoneRef.current = true;
          if (targetId && fetchedNotes.some((n) => n.id === targetId)) {
            setSelectedNoteId(targetId);
          } else if (targetId === undefined && fetchedNotes.length > 0) {
            setSelectedNoteId(fetchedNotes[0].id);
          }
        }
      }
      if (deletedNotesRes.data) {
        setDeletedNotes(deletedNotesRes.data as unknown as Note[]);
      }
    } catch (err) {
      console.error('[useNotes] Error fetching notes/folders:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Realtime subscription for notes and folders
  useEffect(() => {
    if (!userId) return;

    const channelName = `notes-folders-${userId}-${Math.random().toString(36).substring(2, 8)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notes', filter: `user_id=eq.${userId}` },
        (payload) => {
          const { eventType, new: newRec, old: oldRec } = payload;
          const note = newRec as Note;

          if (eventType === 'INSERT') {
            if (Number(note.deleted) === 1 || deletedNoteIdsRef.current.has(note.id)) {
              setDeletedNotes((prev) => [note, ...prev.filter((n) => n.id !== note.id)]);
            } else {
              setNotes((prev) => {
                if (deletedNoteIdsRef.current.has(note.id)) return prev;
                if (prev.some((n) => n.id === note.id)) {
                  return prev.map((n) => (n.id === note.id ? note : n));
                }
                return [note, ...prev];
              });
            }
          } else if (eventType === 'UPDATE') {
            if (Number(note.deleted) === 1 || deletedNoteIdsRef.current.has(note.id)) {
              setNotes((prev) => prev.filter((n) => n.id !== note.id));
              setDeletedNotes((prev) => [note, ...prev.filter((n) => n.id !== note.id)]);
            } else {
              setDeletedNotes((prev) => prev.filter((n) => n.id !== note.id));
              setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, ...note } : n)));
            }
          } else if (eventType === 'DELETE') {
            setNotes((prev) => prev.filter((n) => n.id !== oldRec.id));
            setDeletedNotes((prev) => prev.filter((n) => n.id !== oldRec.id));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'folders', filter: `user_id=eq.${userId}` },
        (payload) => {
          const { eventType, new: newRec, old: oldRec } = payload;
          setFolders((prev) => {
            if (eventType === 'INSERT') {
              const f = newRec as Folder;
              if (f.deleted === 1) return prev;
              if (prev.some((item) => item.id === f.id)) return prev;
              return [...prev, f];
            }
            if (eventType === 'UPDATE') {
              const updated = newRec as Folder;
              if (updated.deleted === 1) {
                return prev.filter((f) => f.id !== updated.id);
              }
              return prev.map((f) => (f.id === updated.id ? { ...f, ...updated } : f));
            }
            if (eventType === 'DELETE') {
              return prev.filter((f) => f.id !== oldRec.id);
            }
            return prev;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // Create folder (supports optional parentId for subfolders)
  const createFolder = async (
    name: string,
    color = '#3ab0b0',
    parentId: string | null = null
  ) => {
    if (!userId) return;
    const nowMs = Date.now();
    const id = crypto.randomUUID();

    const newFolder: Folder = {
      id,
      user_id: userId,
      parent_id: parentId || null,
      name: name.trim(),
      icon: 'folder',
      color,
      is_pinned: 0,
      created_at_ms: nowMs,
      updated_at_ms: nowMs,
      last_modified_ms: nowMs,
      deleted: 0,
    };

    setFolders((prev) => [...prev, newFolder]);

    const { error } = await supabase.from('folders').insert(newFolder);
    if (error) {
      console.error('[useNotes] Failed to create folder:', error);
      setFolders((prev) => prev.filter((f) => f.id !== id));
      throw error;
    }
  };

  // Update folder (rename, change color)
  const updateFolder = async (
    folderId: string,
    updates: Partial<Pick<Folder, 'name' | 'color'>>
  ) => {
    const nowMs = Date.now();
    setFolders((prev) =>
      prev.map((f) =>
        f.id === folderId
          ? { ...f, ...updates, updated_at_ms: nowMs, last_modified_ms: nowMs }
          : f
      )
    );
    try {
      await supabase
        .from('folders')
        .update({
          ...updates,
          updated_at_ms: nowMs,
          last_modified_ms: nowMs,
        })
        .eq('id', folderId);
    } catch (err) {
      console.error('[useNotes] Error updating folder:', err);
    }
  };

  // Delete folder (soft delete, preserves notes by moving them to root)
  const deleteFolder = async (folderId: string) => {
    const nowMs = Date.now();
    // 1. Remove folder and its subfolders from state
    setFolders((prev) => prev.filter((f) => f.id !== folderId && f.parent_id !== folderId));

    // 2. Unlink notes that were in this folder so they appear in root and aren't lost
    setNotes((prev) =>
      prev.map((n) =>
        n.folder_id === folderId
          ? { ...n, folder_id: null, updated_at_ms: nowMs, last_modified_ms: nowMs }
          : n
      )
    );

    // 3. Reset folder selection if active
    if (selectedFolderId === folderId) {
      setSelectedFolderId(null);
    }

    try {
      await Promise.all([
        supabase
          .from('folders')
          .update({
            deleted: 1,
            last_modified_ms: nowMs,
          })
          .eq('id', folderId),
        supabase
          .from('notes')
          .update({
            folder_id: null,
            last_modified_ms: nowMs,
          })
          .eq('folder_id', folderId),
        supabase
          .from('folders')
          .update({
            deleted: 1,
            last_modified_ms: nowMs,
          })
          .eq('parent_id', folderId),
      ]);
    } catch (err) {
      console.error('[useNotes] Error deleting folder:', err);
    }
  };

  // Create note
  const createNote = async (
    folderId: string | null = null,
    eventId: string | null = null,
    initialTitle?: string
  ) => {
    if (!userId) return;
    const nowMs = Date.now();
    const id = crypto.randomUUID();
    const pageId = crypto.randomUUID();

    // Default paginated content compatible with Veyra mobile
    const initialPaginatedContent: NoteContentPaginated = {
      isPaginated: true,
      version: 2,
      layout: 'vertical',
      pages: [
        {
          id: pageId,
          content: '<p></p>',
        },
      ],
    };

    const newNote: Note = {
      id,
      user_id: userId,
      folder_id: folderId,
      event_id: eventId || null,
      title: initialTitle || 'Nota sin título',
      content: JSON.stringify(initialPaginatedContent),
      created_at_ms: nowMs,
      updated_at_ms: nowMs,
      is_pinned: 0,
      deleted: 0,
      last_modified_ms: nowMs,
      created_at: new Date().toISOString(),
      sync_mode: 'rest',
      preview_text: '',
    };

    setNotes((prev) => [newNote, ...prev]);
    setSelectedNoteId(id);

    const { error } = await supabase.from('notes').insert({
      id: newNote.id,
      user_id: newNote.user_id,
      folder_id: newNote.folder_id,
      event_id: newNote.event_id,
      title: newNote.title,
      content: newNote.content,
      created_at_ms: nowMs,
      updated_at_ms: nowMs,
      is_pinned: 0,
      deleted: 0,
      last_modified_ms: nowMs,
      sync_mode: 'rest',
      preview_text: '',
    });

    if (error) {
      console.error('[useNotes] Failed to create note:', error);
      setNotes((prev) => prev.filter((n) => n.id !== id));
      throw error;
    }
    return newNote;
  };

  // Duplicate note
  const duplicateNote = async (noteId: string) => {
    const target = notes.find((n) => n.id === noteId);
    if (!target || !userId) return null;
    const nowMs = Date.now();
    const newId = crypto.randomUUID();
    const duplicated: Note = {
      ...target,
      id: newId,
      title: `${target.title || 'Nota sin título'} (copia)`,
      created_at_ms: nowMs,
      updated_at_ms: nowMs,
      last_modified_ms: nowMs,
      is_pinned: 0,
      deleted: 0,
    };
    setNotes((prev) => [duplicated, ...prev]);
    setSelectedNoteId(newId);
    try {
      await supabase.from('notes').insert(duplicated);
    } catch (err) {
      console.error('[useNotes] Error duplicating note:', err);
    }
    return duplicated;
  };

  // Save note content and metadata
  const saveNote = async (
    id: string,
    updates: {
      title?: string;
      content?: string;
      htmlContent?: string;
      previewText?: string;
      folder_id?: string | null;
    }
  ) => {
    const nowMs = Date.now();
    const currentNote = notes.find((n) => n.id === id);
    if (!currentNote) return;

    let serializedContent = currentNote.content;
    if (updates.content !== undefined) {
      serializedContent = updates.content;
    } else if (updates.htmlContent !== undefined) {
      // Build paginated content format for full cross-platform compatibility
      try {
        let parsed = currentNote.content ? JSON.parse(currentNote.content) : null;
        if (parsed && parsed.isPaginated && Array.isArray(parsed.pages) && parsed.pages.length > 0) {
          parsed.pages[0].content = updates.htmlContent;
          serializedContent = JSON.stringify(parsed);
        } else {
          serializedContent = JSON.stringify({
            isPaginated: true,
            version: 2,
            layout: 'vertical',
            pages: [{ id: crypto.randomUUID(), content: updates.htmlContent }],
          });
        }
      } catch {
        serializedContent = JSON.stringify({
          isPaginated: true,
          version: 2,
          layout: 'vertical',
          pages: [{ id: crypto.randomUUID(), content: updates.htmlContent }],
        });
      }
    }

    const hasContentUpdate = updates.content !== undefined || updates.htmlContent !== undefined;

    const optimisticUpdates: Partial<Note> = {
      ...(updates.title !== undefined && { title: updates.title }),
      ...(hasContentUpdate && { content: serializedContent }),
      ...(updates.previewText !== undefined && { preview_text: updates.previewText }),
      ...(updates.folder_id !== undefined && { folder_id: updates.folder_id }),
      updated_at_ms: nowMs,
      last_modified_ms: nowMs,
    };

    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, ...optimisticUpdates } : n))
    );

    // If note is in 'yjs' mode, don't overwrite content via REST if forbidden by DB trigger
    const updatePayload: Database['public']['Tables']['notes']['Update'] = {
      ...(updates.title !== undefined && { title: updates.title }),
      ...(updates.previewText !== undefined && { preview_text: updates.previewText }),
      ...(updates.folder_id !== undefined && { folder_id: updates.folder_id }),
      updated_at_ms: nowMs,
      last_modified_ms: nowMs,
    };

    if (currentNote.sync_mode !== 'yjs' && hasContentUpdate) {
      updatePayload.content = serializedContent;
    }

    try {
      const { error } = await supabase
        .from('notes')
        .update(updatePayload)
        .eq('id', id);

      if (error) {
        console.error('[useNotes] Error saving note:', error);
      }
    } catch (err) {
      console.error('[useNotes] Exception saving note:', err);
    }
  };

  // Delete note (soft delete)
  const deleteNote = async (id: string) => {
    const nowMs = Date.now();
    deletedNoteIdsRef.current.add(id);

    const noteToDelete = notes.find((n) => n.id === id);
    if (noteToDelete) {
      setDeletedNotes((prev) => [
        { ...noteToDelete, deleted: 1, last_modified_ms: nowMs },
        ...prev.filter((n) => n.id !== id),
      ]);
    }
    setNotes((prev) => prev.filter((n) => n.id !== id));
    if (selectedNoteId === id) {
      const remaining = notes.filter((n) => n.id !== id);
      setSelectedNoteId(remaining.length > 0 ? remaining[0].id : null);
    }

    try {
      await supabase
        .from('notes')
        .update({
          deleted: 1,
          last_modified_ms: nowMs,
        })
        .eq('id', id);
    } catch (err) {
      console.error('[useNotes] Error deleting note:', err);
      deletedNoteIdsRef.current.delete(id);
    }
  };

  // Restore note from trash
  const restoreNote = async (id: string) => {
    const nowMs = Date.now();
    deletedNoteIdsRef.current.delete(id);

    const noteToRestore = deletedNotes.find((n) => n.id === id);
    if (!noteToRestore) return;
    const restoredNote = { ...noteToRestore, deleted: 0, last_modified_ms: nowMs };

    setDeletedNotes((prev) => prev.filter((n) => n.id !== id));
    setNotes((prev) => [restoredNote, ...prev.filter((n) => n.id !== id)]);
    setSelectedNoteId(id);

    try {
      await supabase
        .from('notes')
        .update({
          deleted: 0,
          last_modified_ms: nowMs,
        })
        .eq('id', id);
    } catch (err) {
      console.error('[useNotes] Error restoring note:', err);
    }
  };

  // Permanently delete a note
  const deleteNoteForever = async (id: string) => {
    deletedNoteIdsRef.current.add(id);
    setDeletedNotes((prev) => prev.filter((n) => n.id !== id));
    setNotes((prev) => prev.filter((n) => n.id !== id));
    if (selectedNoteId === id) {
      const remaining = notes.filter((n) => n.id !== id);
      setSelectedNoteId(remaining.length > 0 ? remaining[0].id : null);
    }

    try {
      await supabase.from('notes').delete().eq('id', id);
    } catch (err) {
      console.error('[useNotes] Error permanently deleting note:', err);
      deletedNoteIdsRef.current.delete(id);
    }
  };

  // Empty trash completely
  const emptyTrash = async () => {
    if (!userId) return;
    setDeletedNotes([]);
    try {
      await supabase.from('notes').delete().eq('user_id', userId).eq('deleted', 1);
    } catch (err) {
      console.error('[useNotes] Error emptying trash:', err);
    }
  };

  // Toggle favorite / pin
  const togglePinNote = async (id: string) => {
    const target = notes.find((n) => n.id === id);
    if (!target) return;
    const newPin = target.is_pinned === 1 ? 0 : 1;
    const nowMs = Date.now();

    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_pinned: newPin, last_modified_ms: nowMs } : n))
    );

    try {
      await supabase
        .from('notes')
        .update({
          is_pinned: newPin,
          last_modified_ms: nowMs,
        })
        .eq('id', id);
    } catch (err) {
      console.error('[useNotes] Error toggling pin:', err);
    }
  };

  // Move note to folder (or root)
  const moveNote = async (noteId: string, targetFolderId: string | null) => {
    const nowMs = Date.now();
    setNotes((prev) =>
      prev.map((n) =>
        n.id === noteId
          ? { ...n, folder_id: targetFolderId, updated_at_ms: nowMs, last_modified_ms: nowMs }
          : n
      )
    );

    try {
      const { error } = await supabase
        .from('notes')
        .update({
          folder_id: targetFolderId,
          updated_at_ms: nowMs,
          last_modified_ms: nowMs,
        })
        .eq('id', noteId);

      if (error) {
        console.error('[useNotes] Error moving note:', error);
      }
    } catch (err) {
      console.error('[useNotes] Exception moving note:', err);
    }
  };

  // Move folder inside another folder (or to root)
  const moveFolder = async (folderId: string, targetParentId: string | null) => {
    const nowMs = Date.now();
    setFolders((prev) =>
      prev.map((f) =>
        f.id === folderId
          ? { ...f, parent_id: targetParentId, updated_at_ms: nowMs, last_modified_ms: nowMs }
          : f
      )
    );

    try {
      const { error } = await supabase
        .from('folders')
        .update({
          parent_id: targetParentId,
          updated_at_ms: nowMs,
          last_modified_ms: nowMs,
        })
        .eq('id', folderId);

      if (error) {
        console.error('[useNotes] Error moving folder:', error);
      }
    } catch (err) {
      console.error('[useNotes] Exception moving folder:', err);
    }
  };

  // Move note to event (or clear event_id)
  const moveNoteToEvent = async (noteId: string, targetEventId: string | null) => {
    const nowMs = Date.now();
    setNotes((prev) =>
      prev.map((n) =>
        n.id === noteId
          ? { ...n, event_id: targetEventId, updated_at_ms: nowMs, last_modified_ms: nowMs }
          : n
      )
    );

    try {
      const { error } = await supabase
        .from('notes')
        .update({
          event_id: targetEventId,
          updated_at_ms: nowMs,
          last_modified_ms: nowMs,
        })
        .eq('id', noteId);

      if (error) {
        console.error('[useNotes] Error moving note to event:', error);
      }
    } catch (err) {
      console.error('[useNotes] Exception moving note to event:', err);
    }
  };

  const allAvailableNotes = [...notes, ...deletedNotes];
  const selectedNote = allAvailableNotes.find((n) => n.id === selectedNoteId) || null;

  const filteredNotes = selectedFolderId
    ? notes.filter((n) => n.folder_id === selectedFolderId)
    : notes;

  return {
    folders,
    notes: filteredNotes,
    allNotes: notes,
    deletedNotes,
    selectedFolderId,
    setSelectedFolderId,
    selectedNoteId,
    setSelectedNoteId,
    selectedNote,
    loading,
    createFolder,
    updateFolder,
    deleteFolder,
    moveFolder,
    createNote,
    duplicateNote,
    saveNote,
    deleteNote,
    restoreNote,
    deleteNoteForever,
    emptyTrash,
    togglePinNote,
    moveNote,
    moveNoteToEvent,
    refresh: fetchData,
  };
}
