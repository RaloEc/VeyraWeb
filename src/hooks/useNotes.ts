import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { Folder, Note, NoteContentPaginated } from '../types/notes';
import type { Database } from '../types/database';
import { localDB } from '../lib/db/local-db';
import { syncEngine } from '../lib/sync/syncEngine';

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

  // 1. Instant load from IndexedDB (0 ms offline start)
  useEffect(() => {
    let isMounted = true;
    Promise.all([
      localDB.folders.filter((f) => f.deleted === 0).toArray(),
      localDB.notes.filter((n) => n.deleted === 0).toArray(),
      localDB.notes.filter((n) => n.deleted === 1 && (!userId || n.user_id === userId)).toArray(),
    ])
      .then(([cachedFolders, cachedNotes, cachedDeleted]) => {
        if (!isMounted) return;
        if (cachedFolders.length > 0) {
          setFolders(cachedFolders.sort((a, b) => a.name.localeCompare(b.name)));
        }
        if (cachedNotes.length > 0) {
          const sorted = cachedNotes.sort((a, b) => Number(b.updated_at_ms) - Number(a.updated_at_ms));
          setNotes(sorted);
          if (!initialSelectionDoneRef.current) {
            initialSelectionDoneRef.current = true;
            const targetId = initialNoteIdRef.current;
            if (targetId && sorted.some((n) => n.id === targetId)) {
              setSelectedNoteId(targetId);
            } else if (targetId === undefined && sorted.length > 0) {
              setSelectedNoteId(sorted[0].id);
            }
          }
        }
        if (cachedDeleted.length > 0) {
          setDeletedNotes(cachedDeleted);
        }
        if (cachedFolders.length > 0 || cachedNotes.length > 0) {
          setLoading(false);
        }
      })
      .catch((err) => {
        console.warn('[useNotes] Error reading localDB:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [userId]);

  // 2. Fetch data from Supabase or fallback to localDB
  const fetchData = useCallback(async () => {
    if (!userId) return;
    try {
      if (!syncEngine.isOnline()) {
        const [cachedFolders, cachedNotes, cachedDeleted] = await Promise.all([
          localDB.folders.filter((f) => f.deleted === 0).toArray(),
          localDB.notes.filter((n) => n.deleted === 0).toArray(),
          localDB.notes.filter((n) => n.deleted === 1 && n.user_id === userId).toArray(),
        ]);
        setFolders(cachedFolders.sort((a, b) => a.name.localeCompare(b.name)));
        setNotes(cachedNotes.sort((a, b) => Number(b.updated_at_ms) - Number(a.updated_at_ms)));
        setDeletedNotes(cachedDeleted);
        setLoading(false);
        return;
      }

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

      if (foldersRes.data) {
        const fList = foldersRes.data as unknown as Folder[];
        setFolders(fList);
        await localDB.folders.bulkPut(fList);
      }

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
        if (fetchedNotes.length > 0) {
          await localDB.notes.bulkPut(fetchedNotes);
        }

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
        const dList = deletedNotesRes.data as unknown as Note[];
        setDeletedNotes(dList);
        if (dList.length > 0) {
          await localDB.notes.bulkPut(dList);
        }
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

  // 3. Realtime subscription for notes and folders
  useEffect(() => {
    if (!userId) return;

    const channelName = `notes-folders-${userId}-${Math.random().toString(36).substring(2, 8)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notes', filter: `user_id=eq.${userId}` },
        async (payload) => {
          const { eventType, new: newRec, old: oldRec } = payload;
          const note = newRec as Note;

          if (eventType === 'INSERT') {
            if (Number(note.deleted) === 1 || deletedNoteIdsRef.current.has(note.id)) {
              setDeletedNotes((prev) => [note, ...prev.filter((n) => n.id !== note.id)]);
            } else {
              setNotes((prev) => {
                if (prev.some((n) => n.id === note.id)) return prev;
                return [note, ...prev];
              });
            }
            await localDB.notes.put(note);
          }

          if (eventType === 'UPDATE') {
            if (Number(note.deleted) === 1) {
              setNotes((prev) => prev.filter((n) => n.id !== note.id));
              setDeletedNotes((prev) => [note, ...prev.filter((n) => n.id !== note.id)]);
              if (selectedNoteId === note.id) {
                setNotes((remaining) => {
                  const next = remaining.filter((n) => n.id !== note.id);
                  setSelectedNoteId(next.length > 0 ? next[0].id : null);
                  return next;
                });
              }
            } else {
              setNotes((prev) => {
                const exists = prev.some((n) => n.id === note.id);
                if (exists) {
                  return prev.map((n) => (n.id === note.id ? note : n));
                }
                return [note, ...prev];
              });
              setDeletedNotes((prev) => prev.filter((n) => n.id !== note.id));
            }
            await localDB.notes.put(note);
          }

          if (eventType === 'DELETE') {
            const oldId = (oldRec as any)?.id;
            if (oldId) {
              setNotes((prev) => prev.filter((n) => n.id !== oldId));
              setDeletedNotes((prev) => prev.filter((n) => n.id !== oldId));
              await localDB.notes.delete(oldId);
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'folders' },
        async (payload) => {
          const { eventType, new: newRec, old: oldRec } = payload;
          const folder = newRec as Folder;

          if (eventType === 'INSERT') {
            if (Number(folder.deleted) !== 1) {
              setFolders((prev) => [...prev.filter((f) => f.id !== folder.id), folder]);
              await localDB.folders.put(folder);
            }
          }

          if (eventType === 'UPDATE') {
            if (Number(folder.deleted) === 1) {
              setFolders((prev) => prev.filter((f) => f.id !== folder.id));
              await localDB.folders.delete(folder.id);
            } else {
              setFolders((prev) => prev.map((f) => (f.id === folder.id ? folder : f)));
              await localDB.folders.put(folder);
            }
          }

          if (eventType === 'DELETE') {
            const oldId = (oldRec as any)?.id;
            if (oldId) {
              setFolders((prev) => prev.filter((f) => f.id !== oldId));
              await localDB.folders.delete(oldId);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, selectedNoteId]);

  // Create folder
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
    await localDB.folders.put(newFolder);
    await syncEngine.enqueue('folders', 'upsert', id, newFolder, nowMs);
  };

  // Update folder
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

    const updatePayload = {
      ...updates,
      updated_at_ms: nowMs,
      last_modified_ms: nowMs,
    };

    await localDB.folders.update(folderId, updatePayload);
    await syncEngine.enqueue('folders', 'upsert', folderId, updatePayload, nowMs);
  };

  // Delete folder
  const deleteFolder = async (folderId: string) => {
    const nowMs = Date.now();
    setFolders((prev) => prev.filter((f) => f.id !== folderId && f.parent_id !== folderId));
    setNotes((prev) =>
      prev.map((n) =>
        n.folder_id === folderId
          ? { ...n, folder_id: null, updated_at_ms: nowMs, last_modified_ms: nowMs }
          : n
      )
    );

    if (selectedFolderId === folderId) {
      setSelectedFolderId(null);
    }

    await localDB.folders.update(folderId, { deleted: 1, last_modified_ms: nowMs });
    await syncEngine.enqueue('folders', 'delete', folderId, null, nowMs);
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

    await localDB.notes.put(newNote);
    await syncEngine.enqueue('notes', 'upsert', id, newNote, nowMs);

    // Si hay conexión, sincronizar de inmediato con Supabase para evitar condiciones de carrera con Yjs
    if (syncEngine.isOnline()) {
      (async () => {
        try {
          const { error } = await supabase
            .from('notes')
            .upsert(newNote, { onConflict: 'id' });
          if (error) console.warn('[useNotes] Error en inserción inmediata de nota:', error);
        } catch (err) {
          console.warn('[useNotes] Fallo inserción inmediata de nota:', err);
        }
      })();
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

    await localDB.notes.put(duplicated);
    await syncEngine.enqueue('notes', 'upsert', newId, duplicated, nowMs);

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

    const updatePayload: Database['public']['Tables']['notes']['Update'] = {
      id,
      user_id: currentNote.user_id || userId,
      ...(updates.title !== undefined && { title: updates.title }),
      ...(updates.previewText !== undefined && { preview_text: updates.previewText }),
      ...(updates.folder_id !== undefined && { folder_id: updates.folder_id }),
      updated_at_ms: nowMs,
      last_modified_ms: nowMs,
    };

    if (currentNote.sync_mode !== 'yjs' && hasContentUpdate) {
      updatePayload.content = serializedContent;
    }

    await localDB.notes.update(id, optimisticUpdates);
    await syncEngine.enqueue('notes', 'upsert', id, updatePayload, nowMs);
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

    await localDB.notes.update(id, { deleted: 1, last_modified_ms: nowMs });
    await syncEngine.enqueue('notes', 'delete', id, null, nowMs);
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

    await localDB.notes.update(id, { deleted: 0, last_modified_ms: nowMs });
    await syncEngine.enqueue('notes', 'upsert', id, { deleted: 0, last_modified_ms: nowMs }, nowMs);
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

    await localDB.notes.delete(id);
    await syncEngine.enqueue('notes', 'delete', id, null, Date.now());
  };

  // Empty trash completely
  const emptyTrash = async () => {
    if (!userId) return;
    setDeletedNotes([]);
    try {
      await supabase.from('notes').delete().eq('user_id', userId).eq('deleted', 1);
      const toDelete = await localDB.notes.filter((n) => n.deleted === 1 && n.user_id === userId).toArray();
      for (const d of toDelete) {
        await localDB.notes.delete(d.id);
      }
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

    await localDB.notes.update(id, { is_pinned: newPin, last_modified_ms: nowMs });
    await syncEngine.enqueue('notes', 'upsert', id, { is_pinned: newPin, last_modified_ms: nowMs }, nowMs);
  };

  // Move note to folder
  const moveNote = async (noteId: string, targetFolderId: string | null) => {
    const nowMs = Date.now();
    setNotes((prev) =>
      prev.map((n) =>
        n.id === noteId
          ? { ...n, folder_id: targetFolderId, updated_at_ms: nowMs, last_modified_ms: nowMs }
          : n
      )
    );

    await localDB.notes.update(noteId, { folder_id: targetFolderId, updated_at_ms: nowMs, last_modified_ms: nowMs });
    await syncEngine.enqueue('notes', 'upsert', noteId, { folder_id: targetFolderId, updated_at_ms: nowMs, last_modified_ms: nowMs }, nowMs);
  };

  // Move folder inside another folder
  const moveFolder = async (folderId: string, targetParentId: string | null) => {
    const nowMs = Date.now();
    setFolders((prev) =>
      prev.map((f) =>
        f.id === folderId
          ? { ...f, parent_id: targetParentId, updated_at_ms: nowMs, last_modified_ms: nowMs }
          : f
      )
    );

    await localDB.folders.update(folderId, { parent_id: targetParentId, updated_at_ms: nowMs, last_modified_ms: nowMs });
    await syncEngine.enqueue('folders', 'upsert', folderId, { parent_id: targetParentId, updated_at_ms: nowMs, last_modified_ms: nowMs }, nowMs);
  };

  // Move note to event
  const moveNoteToEvent = async (noteId: string, targetEventId: string | null) => {
    const nowMs = Date.now();
    setNotes((prev) =>
      prev.map((n) =>
        n.id === noteId
          ? { ...n, event_id: targetEventId, updated_at_ms: nowMs, last_modified_ms: nowMs }
          : n
      )
    );

    await localDB.notes.update(noteId, { event_id: targetEventId, updated_at_ms: nowMs, last_modified_ms: nowMs });
    await syncEngine.enqueue('notes', 'upsert', noteId, { event_id: targetEventId, updated_at_ms: nowMs, last_modified_ms: nowMs }, nowMs);
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
