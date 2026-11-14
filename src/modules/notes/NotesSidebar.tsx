import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Search,
  Plus,
  FolderPlus,
  Folder as FolderIcon,
  FolderOpen,
  FolderOutput,
  FileText,
  Calendar,
  Star,
  Clock,
  Tag,
  Trash2,
  RotateCcw,
  Layers,
  Settings,
  X,
  Check,
  GraduationCap,
  Briefcase,
  BookOpen,
  ExternalLink,
  ArrowDownAZ,
  Pencil,
  Palette,
  Copy,
  FolderInput,
  FileDown,
} from 'lucide-react';
import { MorphIcon } from 'morphicons/react';
import { ChevronDown, ChevronRight, PanelLeftClose } from 'lucide';
import type { Folder, Note } from '../../types/notes';
import type { CalendarEvent } from '../../hooks/useEvents';
import { Modal } from '../../components/common/Modal';
import { Input } from '../../components/common/Input';
import { Button } from '../../components/common/Button';
import { cn } from '../../lib/utils';
import { AgendaSidebarView } from './AgendaSidebarView';
import { UserSettingsModal } from '../../components/common/UserSettingsModal';
import type { useReminders } from '../../hooks/useReminders';
import type { useEvents } from '../../hooks/useEvents';

export interface NotesSidebarProps {
  folders: Folder[];
  notes: Note[];
  allNotes: Note[];
  deletedNotes?: Note[];
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  selectedNoteId: string | null;
  onSelectNote: (noteId: string) => void;
  onCreateNote: () => void;
  onCreateFolder: (name: string, color?: string, parentId?: string | null) => Promise<void>;
  onCreateNoteForEvent?: (eventId: string, folderId?: string | null) => void;
  onMoveNote?: (noteId: string, targetFolderId: string | null) => Promise<void> | void;
  onMoveFolder?: (folderId: string, targetParentId: string | null) => Promise<void> | void;
  onMoveNoteToEvent?: (noteId: string, targetEventId: string | null) => Promise<void> | void;
  onDeleteFolder?: (folderId: string) => Promise<void> | void;
  onUpdateFolder?: (folderId: string, updates: Partial<Pick<Folder, 'name' | 'color'>>) => Promise<void> | void;
  onDuplicateNote?: (noteId: string) => Promise<Note | null> | void;
  onDeleteNote?: (noteId: string) => void;
  onRestoreNote?: (noteId: string) => void;
  onDeleteForever?: (noteId: string) => void;
  onEmptyTrash?: () => void;
  onTogglePinNote?: (noteId: string) => void;
  onToggleSidebar?: () => void;
  remindersHook?: ReturnType<typeof useReminders>;
  eventsHook?: ReturnType<typeof useEvents>;
  selectedEventId?: string | null;
  onSelectEvent?: (eventId: string) => void;
  selectedReminderId?: string | null;
  onSelectReminder?: (reminderId: string) => void;
  userId?: string;
  userEmail?: string;
  userName?: string;
  onSignOut?: () => void;
}

type ViewType = 'all' | 'favorites' | 'recent' | 'tags' | 'trash';

function extractHashtags(text: string): string[] {
  if (!text) return [];
  const hashtagRegex = /(?:^|\s)#([\p{L}0-9_-]+)/gu;
  const tags = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = hashtagRegex.exec(text)) !== null) {
    if (match[1]?.trim()) tags.add(match[1].trim());
  }
  return Array.from(tags);
}

function formatNoteDate(timestampMs?: number | null): string {
  if (!timestampMs) return '';
  const d = new Date(timestampMs);
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();

  if (isToday) {
    const hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'p.m.' : 'a.m.';
    const formattedHours = (hours % 12 || 12).toString().padStart(2, '0');
    return `${formattedHours}:${minutes} ${ampm}`;
  }

  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

export function getEventCategoryTag(event: CalendarEvent): string {
  const rawTags = event.tags;
  let tags: string[] = [];
  if (Array.isArray(rawTags)) {
    tags = rawTags.map(String).map((t) => t.replace(/^#/, '').trim().toLowerCase());
  } else if (typeof rawTags === 'string') {
    try {
      const parsed = JSON.parse(rawTags);
      if (Array.isArray(parsed)) {
        tags = parsed.map(String).map((t) => t.replace(/^#/, '').trim().toLowerCase());
      }
    } catch {
      tags = rawTags.split(/[,;\s]+/).map((t) => t.replace(/^#/, '').trim().toLowerCase()).filter(Boolean);
    }
  }

  // Also inspect hashtags in title if tags array is empty
  if (tags.length === 0 && event.title) {
    const fromTitle = extractHashtags(event.title);
    tags = fromTitle.map((t) => t.replace(/^#/, '').trim().toLowerCase());
  }

  // Priority to academic / university tags
  if (tags.some((t) => t === 'universidad' || t === 'universidades' || t === 'uni' || t === 'facultad' || t === 'campus' || t === 'carrera' || t === 'semestre')) {
    return 'Universidad';
  }
  if (tags.some((t) => t === 'clase' || t === 'clases' || t === 'materia' || t === 'materias' || t === 'asignatura' || t === 'asignaturas' || t === 'curso' || t === 'cursos' || t === 'aula' || t === 'catedra' || t === 'estudio')) {
    return 'Clases';
  }
  if (tags.some((t) => t === 'trabajo' || t === 'travajo' || t === 'work' || t === 'laboral' || t === 'laborales' || t === 'oficina' || t === 'empleo' || t === 'job' || t === 'reunion' || t === 'meeting')) {
    return 'Trabajo';
  }
  if (tags.length > 0) {
    return tags[0].charAt(0).toUpperCase() + tags[0].slice(1);
  }
  return 'Eventos';
}

export function getCategoryIcon(categoryName: string): React.ComponentType<{ className?: string }> {
  const lower = categoryName.toLowerCase();
  if (lower === 'universidad' || lower.includes('facultad') || lower === 'uni' || lower.includes('campus') || lower.includes('carrera')) {
    return GraduationCap;
  }
  if (lower === 'clases' || lower.includes('clase') || lower.includes('materia') || lower.includes('curso') || lower.includes('asignatura') || lower.includes('catedra')) {
    return BookOpen;
  }
  if (lower === 'trabajo' || lower === 'travajo' || lower.includes('work') || lower.includes('laboral') || lower.includes('oficina') || lower.includes('empleo') || lower.includes('reunion') || lower.includes('meeting')) {
    return Briefcase;
  }
  if (lower.includes('proyecto') || lower.includes('tarea')) {
    return Layers;
  }
  return FolderIcon;
}

export const NotesSidebar: React.FC<NotesSidebarProps> = ({
  folders,
  notes: _notes,
  allNotes,
  deletedNotes = [],
  selectedFolderId,
  onSelectFolder,
  selectedNoteId,
  onSelectNote,
  onCreateNote,
  onCreateFolder,
  onCreateNoteForEvent,
  onMoveNote,
  onMoveFolder,
  onMoveNoteToEvent,
  onDeleteFolder,
  onUpdateFolder,
  onDuplicateNote,
  onDeleteNote,
  onRestoreNote,
  onDeleteForever,
  onEmptyTrash,
  onTogglePinNote,
  onToggleSidebar,
  remindersHook,
  eventsHook,
  selectedEventId,
  onSelectEvent,
  selectedReminderId,
  onSelectReminder,
  userId,
  userEmail,
  userName,
  onSignOut,
}) => {
  const [sidebarSection, setSidebarSection] = useState<'notes' | 'agenda'>('notes');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeView, setActiveView] = useState<ViewType>('all');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({
    // Expand first folder by default if available
    ...(folders[0] ? { [folders[0].id]: true } : {}),
  });

  // State for expanded event categories (e.g. "Universidad", "Clases")
  const [expandedEventCategories, setExpandedEventCategories] = useState<Record<string, boolean>>({
    Universidad: true,
    Clases: true,
    Eventos: true,
  });

  // State for expanded individual events
  const [expandedEvents, setExpandedEvents] = useState<Record<string, boolean>>({});

  // Modal for new folder
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [selectedFolderColor, setSelectedFolderColor] = useState('#60A5FA');
  const [creatingFolder, setCreatingFolder] = useState(false);

  // Inline subfolder creation state (no modal)
  const [inlineSubfolderParentId, setInlineSubfolderParentId] = useState<string | null>(null);
  const [inlineSubfolderName, setInlineSubfolderName] = useState('');
  const [inlineSubfolderColor, setInlineSubfolderColor] = useState('#60A5FA');
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [isSavingInlineSubfolder, setIsSavingInlineSubfolder] = useState(false);
  const colorPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isColorPickerOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setIsColorPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isColorPickerOpen]);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Shortcut Ctrl+K / Cmd+K to focus search input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const toggleFolderExpanded = (e: React.MouseEvent | null, folderId: string) => {
    e?.stopPropagation();
    setExpandedFolders((prev) => ({
      ...prev,
      [folderId]: !prev[folderId],
    }));
  };

  const handleCreateFolderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    try {
      setCreatingFolder(true);
      await onCreateFolder(
        newFolderName.trim(),
        selectedFolderColor,
        null
      );
      setNewFolderName('');
      setIsFolderModalOpen(false);
    } catch (err) {
      console.error('[NotesSidebar] Error creating folder:', err);
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleConfirmInlineSubfolder = async () => {
    const name = inlineSubfolderName.trim();
    if (!name || !inlineSubfolderParentId) {
      handleCancelInlineSubfolder();
      return;
    }
    try {
      setIsSavingInlineSubfolder(true);
      await onCreateFolder(name, inlineSubfolderColor, inlineSubfolderParentId);
      setInlineSubfolderParentId(null);
      setInlineSubfolderName('');
      setIsColorPickerOpen(false);
    } catch (err) {
      console.error('[NotesSidebar] Error creating inline subfolder:', err);
    } finally {
      setIsSavingInlineSubfolder(false);
    }
  };

  const handleCancelInlineSubfolder = () => {
    setInlineSubfolderParentId(null);
    setInlineSubfolderName('');
    setIsColorPickerOpen(false);
  };

  // Custom Context Menu state (cancels native OS menu)
  type ContextMenuTarget =
    | { type: 'folder'; folder: Folder }
    | { type: 'note'; note: Note }
    | { type: 'event'; event: CalendarEvent };

  interface ContextMenuState {
    isOpen: boolean;
    x: number;
    y: number;
    target: ContextMenuTarget | null;
  }

  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
    target: null,
  });

  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renamingFolderName, setRenamingFolderName] = useState('');
  const [contextColorPickerOpen, setContextColorPickerOpen] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const openContextMenu = (
    clientX: number,
    clientY: number,
    target: ContextMenuTarget
  ) => {
    const menuWidth = 200;
    const menuHeight = 260;
    const x = Math.min(clientX, window.innerWidth - menuWidth - 10);
    const y = Math.min(clientY, window.innerHeight - menuHeight - 10);

    setContextMenu({
      isOpen: true,
      x: Math.max(10, x),
      y: Math.max(10, y),
      target,
    });
    setContextColorPickerOpen(false);
  };

  const closeContextMenu = () => {
    setContextMenu({ isOpen: false, x: 0, y: 0, target: null });
    setContextColorPickerOpen(false);
  };

  useEffect(() => {
    if (!contextMenu.isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        closeContextMenu();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeContextMenu();
      }
    };
    const handleScrollOrResize = () => {
      closeContextMenu();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [contextMenu.isOpen]);

  const handleStartRenameFolder = (folder: Folder) => {
    setRenamingFolderId(folder.id);
    setRenamingFolderName(folder.name);
    closeContextMenu();
  };

  const handleConfirmRenameFolder = async (folderId: string) => {
    const trimmed = renamingFolderName.trim();
    if (trimmed && onUpdateFolder) {
      await onUpdateFolder(folderId, { name: trimmed });
    }
    setRenamingFolderId(null);
    setRenamingFolderName('');
  };

  // Map note IDs to their hashtags
  const noteTagsMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    allNotes.forEach((n) => {
      const raw = `${n.title || ''} ${n.preview_text || ''} ${n.content || ''}`;
      map[n.id] = extractHashtags(raw);
    });
    return map;
  }, [allNotes]);

  // All unique tags with counts
  const allTags = useMemo(() => {
    const tagCounts: Record<string, number> = {};
    Object.values(noteTagsMap).forEach((tags) => {
      tags.forEach((t) => {
        tagCounts[t] = (tagCounts[t] || 0) + 1;
      });
    });
    return Object.entries(tagCounts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }, [noteTagsMap]);

  const favoritesCount = useMemo(
    () => allNotes.filter((n) => n.is_pinned === 1).length,
    [allNotes]
  );

  const recentNotes = useMemo(() => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const inSevenDays = allNotes.filter(
      (n) => (n.updated_at_ms || n.created_at_ms || 0) >= sevenDaysAgo
    );
    if (inSevenDays.length > 0) {
      return [...inSevenDays].sort(
        (a, b) => (b.updated_at_ms || 0) - (a.updated_at_ms || 0)
      );
    }
    return [...allNotes]
      .sort((a, b) => (b.updated_at_ms || 0) - (a.updated_at_ms || 0))
      .slice(0, 5);
  }, [allNotes]);

  const taggedNotesCount = useMemo(
    () => allNotes.filter((n) => (noteTagsMap[n.id] || []).length > 0).length,
    [allNotes, noteTagsMap]
  );

  const trashCount = (deletedNotes || []).length;

  // Filter notes by view and search
  const displayedNotes = useMemo(() => {
    let list: Note[] = [];

    if (activeView === 'trash') {
      list = deletedNotes || [];
    } else if (activeView === 'favorites') {
      list = allNotes.filter((n) => n.is_pinned === 1);
    } else if (activeView === 'recent') {
      list = recentNotes;
    } else if (activeView === 'tags') {
      if (selectedTag) {
        list = allNotes.filter((n) => (noteTagsMap[n.id] || []).includes(selectedTag));
      } else {
        list = allNotes.filter((n) => (noteTagsMap[n.id] || []).length > 0);
      }
    } else {
      // 'all'
      if (selectedFolderId) {
        list = allNotes.filter((n) => n.folder_id === selectedFolderId);
      } else {
        // Sort pinned notes to the top, then by updated_at_ms
        list = [...allNotes].sort((a, b) => {
          if ((b.is_pinned || 0) !== (a.is_pinned || 0)) {
            return (b.is_pinned || 0) - (a.is_pinned || 0);
          }
          return (b.updated_at_ms || 0) - (a.updated_at_ms || 0);
        });
      }
    }

    if (!search.trim()) return list;

    const q = search.toLowerCase();
    return list.filter(
      (n) =>
        (n.title && n.title.toLowerCase().includes(q)) ||
        (n.preview_text && n.preview_text.toLowerCase().includes(q))
    );
  }, [allNotes, deletedNotes, activeView, selectedFolderId, search, selectedTag, noteTagsMap, recentNotes]);

  // Set of existing folder IDs
  const existingFolderIds = useMemo(() => new Set(folders.map((f) => f.id)), [folders]);

  // Group events into smart containers (Option B)
  const eventCategories = useMemo(() => {
    const rawEvents = eventsHook?.events || [];
    if (rawEvents.length === 0) return [];

    const categoryMap = new Map<
      string,
      Array<{
        event: CalendarEvent;
        notes: Note[];
      }>
    >();

    for (const ev of rawEvents) {
      const evNotes = allNotes.filter(
        (n) => n.event_id === ev.id || (ev.note_id && n.id === ev.note_id)
      );

      const rawTags = ev.tags;
      const hasTags = Boolean(
        rawTags &&
          (Array.isArray(rawTags)
            ? rawTags.length > 0
            : typeof rawTags === 'string' && rawTags.length > 2)
      );

      // Include if it has linked notes OR relevant category tags (like #clase, #universidad)
      if (evNotes.length > 0 || hasTags) {
        const cat = getEventCategoryTag(ev);
        if (!categoryMap.has(cat)) {
          categoryMap.set(cat, []);
        }
        categoryMap.get(cat)!.push({ event: ev, notes: evNotes });
      }
    }

    return Array.from(categoryMap.entries()).map(([name, items]) => ({
      name,
      items: items.sort((a, b) => a.event.title.localeCompare(b.event.title)),
    }));
  }, [eventsHook?.events, allNotes]);

  // Set of note IDs belonging to an event container
  const eventNoteIds = useMemo(() => {
    const set = new Set<string>();
    eventCategories.forEach((cat) => {
      cat.items.forEach((item) => {
        item.notes.forEach((n) => set.add(n.id));
      });
    });
    return set;
  }, [eventCategories]);

  // Sorting Mode for Explorer: 'alphabetical' (A–Z) or 'manual' (Drag & Drop)
  type ExplorerSortMode = 'alphabetical' | 'manual';
  const [sortMode, setSortMode] = useState<ExplorerSortMode>(() => {
    try {
      return (
        (localStorage.getItem('veyra_explorer_sort_mode') as ExplorerSortMode) ||
        'alphabetical'
      );
    } catch {
      return 'alphabetical';
    }
  });

  const [customFolderOrder, setCustomFolderOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('veyra_folder_order');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [customNoteOrder, setCustomNoteOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('veyra_note_order');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  type DropPosition = 'inside' | 'before' | 'after';
  const [dragPosition, setDragPosition] = useState<DropPosition>('inside');

  const sortFolders = (list: Folder[]): Folder[] => {
    if (sortMode === 'alphabetical') {
      return [...list].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
      );
    }
    const orderMap = new Map(customFolderOrder.map((id, index) => [id, index]));
    return [...list].sort((a, b) => {
      const idxA = orderMap.has(a.id) ? orderMap.get(a.id)! : 999999;
      const idxB = orderMap.has(b.id) ? orderMap.get(b.id)! : 999999;
      if (idxA !== idxB) return idxA - idxB;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });
  };

  const sortNotes = (list: Note[]): Note[] => {
    return [...list].sort((a, b) => {
      if ((b.is_pinned || 0) !== (a.is_pinned || 0)) {
        return (b.is_pinned || 0) - (a.is_pinned || 0);
      }
      if (sortMode === 'alphabetical') {
        const titleA = a.title || 'Nota sin título';
        const titleB = b.title || 'Nota sin título';
        return titleA.localeCompare(titleB, undefined, { numeric: true, sensitivity: 'base' });
      }
      const orderMap = new Map(customNoteOrder.map((id, index) => [id, index]));
      const idxA = orderMap.has(a.id) ? orderMap.get(a.id)! : 999999;
      const idxB = orderMap.has(b.id) ? orderMap.get(b.id)! : 999999;
      if (idxA !== idxB) return idxA - idxB;
      return (b.updated_at_ms || 0) - (a.updated_at_ms || 0);
    });
  };

  const handleToggleSortMode = () => {
    if (sortMode === 'manual') {
      setSortMode('alphabetical');
      try {
        localStorage.setItem('veyra_explorer_sort_mode', 'alphabetical');
      } catch (e) {
        console.error(e);
      }
    } else {
      setSortMode('manual');
      try {
        localStorage.setItem('veyra_explorer_sort_mode', 'manual');
      } catch (e) {
        console.error(e);
      }
    }
  };

  // Hierarchical Folders (sorted in real-time by sortMode)
  const topLevelFolders = useMemo(() => {
    return sortFolders(folders.filter((f) => !f.parent_id));
  }, [folders, sortMode, customFolderOrder]);

  const subfoldersByParentId = useMemo(() => {
    const map = new Map<string, Folder[]>();
    folders.forEach((f) => {
      if (f.parent_id) {
        const list = map.get(f.parent_id) || [];
        list.push(f);
        map.set(f.parent_id, list);
      }
    });
    map.forEach((list, parentId) => {
      map.set(parentId, sortFolders(list));
    });
    return map;
  }, [folders, sortMode, customFolderOrder]);

  // Root notes: notes that are not in any folder AND not in any event container
  const rootNotes = useMemo(() => {
    return sortNotes(
      allNotes.filter(
        (n) =>
          (!n.folder_id || !existingFolderIds.has(n.folder_id)) &&
          !eventNoteIds.has(n.id)
      )
    );
  }, [allNotes, existingFolderIds, eventNoteIds, sortMode, customNoteOrder]);

  type DraggedEntity =
    | { type: 'note'; id: string; folderId: string | null; eventId: string | null }
    | { type: 'folder'; id: string; parentId: string | null };

  const [draggedItem, setDraggedItem] = useState<DraggedEntity | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);

  const canDropFolder = (draggedFolderId: string, targetFolderId: string): boolean => {
    if (draggedFolderId === targetFolderId) return false;
    const isDescendant = (parentId: string, searchId: string): boolean => {
      const children = subfoldersByParentId.get(parentId) || [];
      for (const child of children) {
        if (child.id === searchId || isDescendant(child.id, searchId)) {
          return true;
        }
      }
      return false;
    };
    if (isDescendant(draggedFolderId, targetFolderId)) {
      return false;
    }
    const currentFolder = folders.find((f) => f.id === draggedFolderId);
    if (currentFolder?.parent_id === targetFolderId) return false;
    return true;
  };

  const handleReorderFolder = (
    draggedFolderId: string,
    targetFolderId: string,
    position: DropPosition
  ) => {
    const draggedF = folders.find((f) => f.id === draggedFolderId);
    const targetF = folders.find((f) => f.id === targetFolderId);
    if (!draggedF || !targetF) return;

    if (position === 'inside') {
      if (canDropFolder(draggedFolderId, targetFolderId)) {
        onMoveFolder?.(draggedFolderId, targetFolderId);
        setExpandedFolders((prev) => ({ ...prev, [targetFolderId]: true }));
      }
      return;
    }

    // If moving before/after, sync parent if needed
    if (draggedF.parent_id !== targetF.parent_id) {
      onMoveFolder?.(draggedFolderId, targetF.parent_id);
    }

    const currentOrder =
      customFolderOrder.length > 0 ? [...customFolderOrder] : folders.map((f) => f.id);
    const filtered = currentOrder.filter((id) => id !== draggedFolderId);
    const targetIdx = filtered.indexOf(targetFolderId);
    if (targetIdx === -1) {
      filtered.push(draggedFolderId);
    } else {
      const insertAt = position === 'before' ? targetIdx : targetIdx + 1;
      filtered.splice(insertAt, 0, draggedFolderId);
    }

    setCustomFolderOrder(filtered);
    setSortMode('manual');
    try {
      localStorage.setItem('veyra_folder_order', JSON.stringify(filtered));
      localStorage.setItem('veyra_explorer_sort_mode', 'manual');
    } catch (e) {
      console.error(e);
    }
  };

  const handleReorderNote = (
    draggedNoteId: string,
    targetNoteId: string,
    position: DropPosition
  ) => {
    const draggedN = allNotes.find((n) => n.id === draggedNoteId);
    const targetN = allNotes.find((n) => n.id === targetNoteId);
    if (!draggedN || !targetN) return;

    if (draggedN.folder_id !== targetN.folder_id) {
      onMoveNote?.(draggedNoteId, targetN.folder_id);
    }
    if (draggedN.event_id !== targetN.event_id) {
      onMoveNoteToEvent?.(draggedNoteId, targetN.event_id);
    }

    const currentOrder =
      customNoteOrder.length > 0 ? [...customNoteOrder] : allNotes.map((n) => n.id);
    const filtered = currentOrder.filter((id) => id !== draggedNoteId);
    const targetIdx = filtered.indexOf(targetNoteId);
    if (targetIdx === -1) {
      filtered.push(draggedNoteId);
    } else {
      const insertAt = position === 'before' ? targetIdx : targetIdx + 1;
      filtered.splice(insertAt, 0, draggedNoteId);
    }

    setCustomNoteOrder(filtered);
    setSortMode('manual');
    try {
      localStorage.setItem('veyra_note_order', JSON.stringify(filtered));
      localStorage.setItem('veyra_explorer_sort_mode', 'manual');
    } catch (e) {
      console.error(e);
    }
  };

  const canMoveToRoot = Boolean(
    (draggedItem?.type === 'note' && (draggedItem.folderId !== null || draggedItem.eventId !== null)) ||
    (draggedItem?.type === 'folder' && draggedItem.parentId !== null)
  );

  // Render a note item row (consistent between Tree Explorer and Filtered Lists)
  const renderNoteItem = (note: Note) => {
    const isSelected = selectedNoteId === note.id;
    const isPinned = note.is_pinned === 1;
    const noteTags = noteTagsMap[note.id] || [];
    const isBeingDragged = draggedItem?.type === 'note' && draggedItem.id === note.id;

    return (
      <div
        key={note.id}
        draggable={activeView !== 'trash'}
        onDragStart={(e) => {
          e.stopPropagation();
          e.dataTransfer.setData('application/x-veyra-type', 'note');
          e.dataTransfer.setData('application/x-veyra-id', note.id);
          e.dataTransfer.effectAllowed = 'move';
          setDraggedItem({
            type: 'note',
            id: note.id,
            folderId: note.folder_id,
            eventId: note.event_id || null,
          });
        }}
        onDragEnd={() => {
          setDraggedItem(null);
          setDragOverTarget(null);
        }}
        onDragOver={(e) => {
          if (!draggedItem || draggedItem.type !== 'note' || draggedItem.id === note.id || activeView === 'trash') return;
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = 'move';
          const rect = e.currentTarget.getBoundingClientRect();
          const offset = e.clientY - rect.top;
          const pos: DropPosition = offset < rect.height / 2 ? 'before' : 'after';
          setDragPosition(pos);
          if (dragOverTarget !== note.id) {
            setDragOverTarget(note.id);
          }
        }}
        onDragLeave={(e) => {
          if (dragOverTarget === note.id) {
            const rect = e.currentTarget.getBoundingClientRect();
            if (
              e.clientX < rect.left ||
              e.clientX >= rect.right ||
              e.clientY < rect.top ||
              e.clientY >= rect.bottom
            ) {
              setDragOverTarget(null);
            }
          }
        }}
        onDrop={(e) => {
          if (!draggedItem || draggedItem.type !== 'note' || draggedItem.id === note.id || activeView === 'trash') return;
          e.preventDefault();
          e.stopPropagation();
          const currentPos = dragPosition;
          setDragOverTarget(null);
          handleReorderNote(draggedItem.id, note.id, currentPos);
          setDraggedItem(null);
        }}
        onClick={() => onSelectNote(note.id)}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          openContextMenu(e.clientX, e.clientY, { type: 'note', note });
        }}
        className={cn(
          'group flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-xs truncate cursor-pointer transition-all relative select-none',
          isSelected
            ? 'bg-accent/15 text-accent font-semibold'
            : 'text-veyra-muted hover:text-veyra-text hover:bg-white/[0.03]',
          isBeingDragged && 'opacity-25 scale-[0.98] border border-dashed border-accent/60 bg-accent/5',
          dragOverTarget === note.id && dragPosition === 'before' && 'bg-accent/10 relative before:absolute before:top-0 before:left-1 before:right-1 before:h-0.5 before:bg-accent before:rounded-full before:z-10',
          dragOverTarget === note.id && dragPosition === 'after' && 'bg-accent/10 relative after:absolute after:bottom-0 after:left-1 after:right-1 after:h-0.5 after:bg-accent after:rounded-full after:z-10'
        )}
      >
        <div className="flex items-center gap-1.5 truncate flex-1 min-w-0">
          {isPinned && activeView !== 'trash' ? (
            <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />
          ) : (
            <FileText className="w-3.5 h-3.5 shrink-0 text-veyra-subtle group-hover:text-veyra-muted" />
          )}

          <span
            className={cn(
              'truncate text-xs',
              isSelected ? 'text-accent font-semibold' : 'text-veyra-text'
            )}
          >
            {note.title || 'Nota sin título'}
          </span>

          {noteTags.length > 0 && activeView === 'tags' && (
            <span className="text-[9px] px-1 py-0.2 rounded bg-accent/15 text-accent shrink-0">
              #{noteTags[0]}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0 ml-1">
          {/* Actions on hover */}
          {activeView === 'trash' ? (
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRestoreNote?.(note.id);
                }}
                title="Restaurar nota"
                className="p-1 rounded text-emerald-400 hover:text-emerald-300 hover:bg-white/10 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm('¿Eliminar permanentemente esta nota?')) {
                    onDeleteForever?.(note.id);
                  }
                }}
                title="Eliminar permanentemente"
                className="p-1 rounded text-red-400 hover:text-red-300 hover:bg-white/10 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              {onTogglePinNote && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onTogglePinNote(note.id);
                  }}
                  title={isPinned ? 'Desfijar de favoritas' : 'Fijar en favoritas'}
                  className={cn(
                    'p-1 rounded hover:bg-white/10 transition-colors cursor-pointer',
                    isPinned
                      ? 'text-amber-400 fill-amber-400'
                      : 'text-veyra-subtle hover:text-amber-400'
                  )}
                >
                  <Star
                    className={cn(
                      'w-3 h-3',
                      isPinned && 'fill-amber-400 text-amber-400'
                    )}
                  />
                </button>
              )}
              {onDeleteNote && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteNote(note.id);
                  }}
                  title="Mover a papelera"
                  className="p-1 rounded text-veyra-subtle hover:text-red-400 hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          )}

          <span className="text-[10px] font-mono text-veyra-subtle shrink-0">
            {formatNoteDate(note.updated_at_ms || note.created_at_ms)}
          </span>
        </div>
      </div>
    );
  };

  // Render a folder node with nested subfolder support
  const renderFolderNode = (folder: Folder, depth = 0): React.ReactNode => {
    const isExpanded = !!expandedFolders[folder.id];
    const subfolders = subfoldersByParentId.get(folder.id) || [];
    const folderNotes = sortNotes(
      allNotes.filter((n) => n.folder_id === folder.id && !eventNoteIds.has(n.id))
    );

    const isBeingDragged = draggedItem?.type === 'folder' && draggedItem.id === folder.id;
    const isDragOver = dragOverTarget === folder.id;

    return (
      <div key={folder.id} className="space-y-0.5">
        {/* Folder row */}
        <div
          draggable={activeView !== 'trash'}
          onDragStart={(e) => {
            e.stopPropagation();
            e.dataTransfer.setData('application/x-veyra-type', 'folder');
            e.dataTransfer.setData('application/x-veyra-id', folder.id);
            e.dataTransfer.effectAllowed = 'move';
            setDraggedItem({ type: 'folder', id: folder.id, parentId: folder.parent_id });
          }}
          onDragEnd={() => {
            setDraggedItem(null);
            setDragOverTarget(null);
          }}
          onDragOver={(e) => {
            if (!draggedItem) return;
            if (draggedItem.type === 'note') {
              if (draggedItem.folderId !== folder.id || draggedItem.eventId !== null) {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'move';
                setDragPosition('inside');
                if (dragOverTarget !== folder.id) {
                  setDragOverTarget(folder.id);
                }
              }
            } else if (draggedItem.type === 'folder') {
              if (draggedItem.id === folder.id) return;
              const isDescendant = (parentId: string, searchId: string): boolean => {
                const children = subfoldersByParentId.get(parentId) || [];
                for (const child of children) {
                  if (child.id === searchId || isDescendant(child.id, searchId)) {
                    return true;
                  }
                }
                return false;
              };
              if (isDescendant(draggedItem.id, folder.id)) return;

              e.preventDefault();
              e.stopPropagation();
              e.dataTransfer.dropEffect = 'move';

              const rect = e.currentTarget.getBoundingClientRect();
              const offset = e.clientY - rect.top;
              const height = rect.height;
              const canBeChild = canDropFolder(draggedItem.id, folder.id);

              let pos: DropPosition;
              if (canBeChild && offset >= height * 0.25 && offset <= height * 0.75) {
                pos = 'inside';
              } else if (offset < (canBeChild ? height * 0.25 : height * 0.5)) {
                pos = 'before';
              } else {
                pos = 'after';
              }

              setDragPosition(pos);
              if (dragOverTarget !== folder.id) {
                setDragOverTarget(folder.id);
              }
            }
          }}
          onDragLeave={(e) => {
            if (dragOverTarget === folder.id) {
              const rect = e.currentTarget.getBoundingClientRect();
              if (
                e.clientX < rect.left ||
                e.clientX >= rect.right ||
                e.clientY < rect.top ||
                e.clientY >= rect.bottom
              ) {
                setDragOverTarget(null);
              }
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const currentTarget = folder.id;
            const currentPos = dragPosition;
            setDragOverTarget(null);
            if (!draggedItem) return;
            if (draggedItem.type === 'note') {
              if (draggedItem.folderId !== folder.id) {
                onMoveNote?.(draggedItem.id, folder.id);
              }
              if (draggedItem.eventId !== null) {
                onMoveNoteToEvent?.(draggedItem.id, null);
              }
              setExpandedFolders((prev) => ({ ...prev, [folder.id]: true }));
            } else if (draggedItem.type === 'folder') {
              handleReorderFolder(draggedItem.id, currentTarget, currentPos);
            }
            setDraggedItem(null);
          }}
          onClick={() => toggleFolderExpanded(null, folder.id)}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            openContextMenu(e.clientX, e.clientY, { type: 'folder', folder });
          }}
          className={cn(
            'group flex items-center justify-between px-2 py-1.5 rounded-lg transition-all cursor-pointer relative select-none',
            selectedFolderId === folder.id
              ? 'bg-accent/15 text-accent font-semibold'
              : 'text-veyra-muted hover:text-veyra-text hover:bg-white/[0.03]',
            isBeingDragged && 'opacity-25 scale-[0.98] border border-dashed border-accent/60 bg-accent/5',
            isDragOver && dragPosition === 'inside' && 'bg-accent/25 text-accent font-semibold ring-2 ring-accent/60 shadow-md scale-[1.01]',
            isDragOver && dragPosition === 'before' && 'bg-accent/10 relative before:absolute before:top-0 before:left-1 before:right-1 before:h-0.5 before:bg-accent before:rounded-full before:z-10',
            isDragOver && dragPosition === 'after' && 'bg-accent/10 relative after:absolute after:bottom-0 after:left-1 after:right-1 after:h-0.5 after:bg-accent after:rounded-full after:z-10'
          )}
        >
          <div className="flex items-center gap-1.5 truncate flex-1 min-w-0">
            <span className="p-0.5 text-veyra-subtle group-hover:text-veyra-text transition-colors flex items-center justify-center">
              <MorphIcon
                icon={isExpanded ? ChevronDown : ChevronRight}
                size={13}
                color="currentColor"
              />
            </span>

            {isExpanded ? (
              <FolderOpen
                className="w-3.5 h-3.5 shrink-0"
                style={{ color: folder.color || 'var(--accent-primary)' }}
              />
            ) : (
              <FolderIcon
                className="w-3.5 h-3.5 shrink-0"
                style={{ color: folder.color || 'var(--accent-primary)' }}
              />
            )}

            {renamingFolderId === folder.id ? (
              <input
                type="text"
                autoFocus
                value={renamingFolderName}
                onChange={(e) => setRenamingFolderName(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleConfirmRenameFolder(folder.id);
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setRenamingFolderId(null);
                  }
                }}
                onBlur={() => handleConfirmRenameFolder(folder.id)}
                className="bg-veyra-elevated text-xs font-medium text-veyra-text px-1.5 py-0.5 rounded border border-accent/60 outline-none flex-1 min-w-0"
              />
            ) : (
              <span className="truncate text-xs font-medium">{folder.name}</span>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setInlineSubfolderParentId(folder.id);
                setInlineSubfolderName('');
                setInlineSubfolderColor(folder.color || '#60A5FA');
                setIsColorPickerOpen(false);
                setExpandedFolders((prev) => ({ ...prev, [folder.id]: true }));
              }}
              title={`Crear subcarpeta dentro de "${folder.name}"`}
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-veyra-subtle hover:text-veyra-text hover:bg-white/10 transition-all cursor-pointer"
            >
              <FolderPlus className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelectFolder(folder.id);
                onCreateNote();
              }}
              title="Nueva nota en esta carpeta"
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-veyra-subtle hover:text-veyra-text hover:bg-white/10 transition-all cursor-pointer"
            >
              <Plus className="w-3 h-3" />
            </button>
            {onDeleteFolder && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (
                    window.confirm(
                      `¿Eliminar la carpeta "${folder.name}"? Sus notas se conservarán y se moverán a la raíz.`
                    )
                  ) {
                    onDeleteFolder(folder.id);
                  }
                }}
                title="Eliminar carpeta"
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-veyra-subtle hover:text-red-400 hover:bg-white/10 transition-all cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
            <span className="text-[10px] font-mono text-veyra-subtle pr-1">
              {folderNotes.length}
            </span>
          </div>
        </div>

        {/* Child items */}
        {isExpanded && (
          <div className="ml-3 pl-2 border-l border-veyra-border/60 space-y-0.5 py-0.5">
            {/* Inline Subfolder Creator (no modal) */}
            {inlineSubfolderParentId === folder.id && (
              <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-veyra-elevated/95 border border-accent/60 shadow-sm relative select-none animate-in fade-in duration-150 mb-1">
                {/* Color picker trigger button with tooltip palette */}
                <div className="relative shrink-0 flex items-center">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsColorPickerOpen((prev) => !prev);
                    }}
                    className="w-3.5 h-3.5 rounded-full border border-white/20 transition-transform hover:scale-125 shrink-0 cursor-pointer shadow-xs"
                    style={{ backgroundColor: inlineSubfolderColor }}
                    title="Elegir color de la subcarpeta"
                  />
                  {isColorPickerOpen && (
                    <div
                      ref={colorPickerRef}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute left-0 bottom-full mb-1.5 p-1.5 bg-veyra-elevated border border-veyra-border rounded-md shadow-md flex items-center gap-1.5 z-50"
                    >
                      {['#8B5CF6', '#60A5FA', '#F87171', '#34D399', '#FBBF24', '#F472B6', '#10B981', '#EC4899'].map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => {
                            setInlineSubfolderColor(c);
                            setIsColorPickerOpen(false);
                          }}
                          className={cn(
                            'w-4 h-4 rounded-full transition-transform hover:scale-125 cursor-pointer',
                            inlineSubfolderColor === c && 'ring-2 ring-offset-1 ring-offset-veyra-card ring-accent scale-110'
                          )}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  )}
                </div>

                <FolderIcon
                  className="w-3.5 h-3.5 shrink-0"
                  style={{ color: inlineSubfolderColor }}
                />

                <input
                  type="text"
                  autoFocus
                  disabled={isSavingInlineSubfolder}
                  value={inlineSubfolderName}
                  onChange={(e) => setInlineSubfolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleConfirmInlineSubfolder();
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      handleCancelInlineSubfolder();
                    }
                  }}
                  placeholder="Nombre de la subcarpeta..."
                  className="flex-1 min-w-0 bg-transparent text-xs text-veyra-text placeholder:text-veyra-subtle outline-none border-none py-0.5"
                />

                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={handleConfirmInlineSubfolder}
                    disabled={isSavingInlineSubfolder || !inlineSubfolderName.trim()}
                    className="p-1 rounded text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-40 disabled:hover:bg-transparent transition-colors cursor-pointer"
                    title="Crear (Enter)"
                  >
                    <Check className="w-3 h-3 stroke-[2.5]" />
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelInlineSubfolder}
                    className="p-1 rounded text-veyra-subtle hover:text-veyra-text hover:bg-white/10 transition-colors cursor-pointer"
                    title="Cancelar (Esc)"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}

            {subfolders.map((sub) => renderFolderNode(sub, depth + 1))}
            {folderNotes.map((n) => renderNoteItem(n))}
            {subfolders.length === 0 && folderNotes.length === 0 && inlineSubfolderParentId !== folder.id && (
              <div className="px-2 py-1 text-[11px] text-veyra-subtle italic">
                Carpeta vacía
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside
      onContextMenu={(e) => e.preventDefault()}
      className="w-full bg-veyra-card/90 border-r border-veyra-border flex flex-col h-full shrink-0 select-none overflow-hidden text-xs relative"
    >
      {/* 1. Header: Branding + Collapse Toggle */}
      <div className="h-14 px-4 flex items-center justify-between border-b border-veyra-border shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-md bg-accent flex items-center justify-center font-bold text-white text-xs shadow-sm">
            V
          </div>
          <span className="font-bold text-sm tracking-wider text-veyra-text">
            VEYRA
          </span>
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-white/10 text-veyra-muted border border-white/10">
            WEB
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            title="Preferencias y cuenta"
            className="p-1 rounded text-veyra-subtle hover:text-veyra-text hover:bg-white/5 transition-colors cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
          {onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              title="Ocultar barra lateral"
              className="p-1 rounded text-veyra-subtle hover:text-veyra-text hover:bg-white/5 transition-colors cursor-pointer flex items-center justify-center"
            >
              <MorphIcon
                icon={PanelLeftClose}
                size={16}
                color="var(--accent-primary)"
              />
            </button>
          )}
        </div>
      </div>

      {/* Selector de pestañas compacto para Notas y Agenda */}
      <div className="px-2.5 py-2 border-b border-veyra-border shrink-0 bg-veyra-canvas/40">
        <div className="grid grid-cols-2 p-0.5 rounded-lg bg-veyra-elevated/70 border border-veyra-border text-xs">
          <button
            type="button"
            onClick={() => setSidebarSection('notes')}
            className={cn(
              'flex items-center justify-center gap-1.5 py-1 px-2 rounded-md font-medium transition-all duration-150 cursor-pointer',
              sidebarSection === 'notes'
                ? 'bg-accent/15 text-accent shadow-xs font-semibold'
                : 'text-veyra-muted hover:text-veyra-text'
            )}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Notas</span>
            <span className="text-[10px] opacity-75 font-mono">({allNotes.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setSidebarSection('agenda')}
            className={cn(
              'flex items-center justify-center gap-1.5 py-1 px-2 rounded-md font-medium transition-all duration-150 cursor-pointer',
              sidebarSection === 'agenda'
                ? 'bg-accent/15 text-accent shadow-xs font-semibold'
                : 'text-veyra-muted hover:text-veyra-text'
            )}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Agenda</span>
            <span className="text-[10px] opacity-75 font-mono">
              ({(remindersHook?.todayReminders?.length || 0) + (eventsHook?.todayEvents?.length || 0)})
            </span>
          </button>
        </div>
      </div>

      {sidebarSection === 'agenda' ? (
        <AgendaSidebarView
          remindersHook={remindersHook}
          eventsHook={eventsHook}
          allNotes={allNotes}
          onSelectNote={onSelectNote}
          selectedNoteId={selectedNoteId}
          selectedEventId={selectedEventId}
          onSelectEvent={onSelectEvent}
          selectedReminderId={selectedReminderId}
          onSelectReminder={onSelectReminder}
        />
      ) : (
        <>
          {/* 2. Top Controls: Compact Search + New Note Action */}
      <div className="p-2.5 border-b border-veyra-border shrink-0 flex items-center gap-1.5">
        {/* Search Input with Clear button */}
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-veyra-subtle absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-veyra-elevated text-veyra-text placeholder:text-veyra-subtle rounded-lg pl-8 pr-7 py-1.5 text-xs border border-veyra-border focus:border-accent/60 outline-none transition-colors"
          />
          {search.trim().length > 0 && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-veyra-subtle hover:text-veyra-text p-0.5 rounded cursor-pointer transition-colors"
              title="Borrar búsqueda"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Compact + Nueva Nota Button */}
        <button
          onClick={onCreateNote}
          title="Nueva Nota"
          className="h-[30px] w-[30px] rounded-lg bg-accent text-white flex items-center justify-center hover:opacity-90 transition-opacity shadow-sm shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
        </button>
      </div>

      {/* 3. Scrollable Middle Area: Vistas (icon-only) + Carpetas + Notas */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3.5">
        {/* Compact Icon-Only VISTAS Row: Visible only when NOT searching */}
        {search.trim().length === 0 && (
          <div className="flex items-center justify-between p-1 bg-veyra-elevated/40 border border-veyra-border rounded-lg">
            <button
              type="button"
              onClick={() => {
                setActiveView('all');
                onSelectFolder(null);
              }}
              title={`Todas las notas (${allNotes.length})`}
              className={cn(
                'flex-1 flex items-center justify-center py-1.5 rounded-md transition-colors cursor-pointer',
                activeView === 'all' && selectedFolderId === null
                  ? 'bg-accent/20 text-accent font-semibold shadow-sm'
                  : 'text-veyra-muted hover:text-veyra-text hover:bg-white/5'
              )}
            >
              <Layers className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveView('favorites');
                onSelectFolder(null);
              }}
              title={`Favoritas (${favoritesCount})`}
              className={cn(
                'flex-1 flex items-center justify-center py-1.5 rounded-md transition-colors cursor-pointer',
                activeView === 'favorites'
                  ? 'bg-accent/20 text-accent font-semibold shadow-sm'
                  : 'text-veyra-muted hover:text-veyra-text hover:bg-white/5'
              )}
            >
              <Star className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveView('recent');
                onSelectFolder(null);
              }}
              title={`Recientes (${recentNotes.length})`}
              className={cn(
                'flex-1 flex items-center justify-center py-1.5 rounded-md transition-colors cursor-pointer',
                activeView === 'recent'
                  ? 'bg-accent/20 text-accent font-semibold shadow-sm'
                  : 'text-veyra-muted hover:text-veyra-text hover:bg-white/5'
              )}
            >
              <Clock className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveView('tags');
                setSelectedTag(null);
                onSelectFolder(null);
              }}
              title={`Etiquetas (${taggedNotesCount})`}
              className={cn(
                'flex-1 flex items-center justify-center py-1.5 rounded-md transition-colors cursor-pointer',
                activeView === 'tags'
                  ? 'bg-accent/20 text-accent font-semibold shadow-sm'
                  : 'text-veyra-muted hover:text-veyra-text hover:bg-white/5'
              )}
            >
              <Tag className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveView('trash');
                onSelectFolder(null);
              }}
              title={`Papelera (${trashCount})`}
              className={cn(
                'flex-1 flex items-center justify-center py-1.5 rounded-md transition-colors cursor-pointer',
                activeView === 'trash'
                  ? 'bg-accent/20 text-accent font-semibold shadow-sm'
                  : 'text-veyra-muted hover:text-veyra-text hover:bg-white/5'
              )}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* VIEW A: Single Unified File Explorer Tree (When activeView === 'all' and not searching) */}
        {search.trim().length === 0 && activeView === 'all' && (
          <div className="space-y-2">
            {/* Explorer Header */}
            <div className="flex items-center justify-between px-2 mb-1">
              <span className="text-[10px] font-semibold text-veyra-subtle uppercase tracking-wider">
                Explorador
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleToggleSortMode}
                  title={
                    sortMode === 'alphabetical'
                      ? 'Orden alfabético A–Z activo. Clic para modo manual (Drag & Drop)'
                      : 'Orden manual (Drag & Drop) activo. Clic para ordenar alfabéticamente A–Z'
                  }
                  className={cn(
                    'p-1 rounded transition-all cursor-pointer flex items-center justify-center',
                    sortMode === 'alphabetical'
                      ? 'text-accent bg-accent/15 hover:bg-accent/25'
                      : 'text-veyra-subtle hover:text-veyra-text hover:bg-white/5'
                  )}
                >
                  <ArrowDownAZ className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    setNewFolderName('');
                    setIsFolderModalOpen(true);
                  }}
                  className="p-1 rounded text-veyra-subtle hover:text-veyra-text hover:bg-white/5 transition-colors cursor-pointer"
                  title="Nueva carpeta"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Tree Items: Folders first, then Event Categories, then Root Notes */}
            <div
              onDragOver={(e) => {
                if (canMoveToRoot) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                }
              }}
              onDrop={(e) => {
                if (canMoveToRoot) {
                  e.preventDefault();
                  if (draggedItem?.type === 'note') {
                    if (draggedItem.folderId !== null) {
                      onMoveNote?.(draggedItem.id, null);
                    }
                    if (draggedItem.eventId !== null) {
                      onMoveNoteToEvent?.(draggedItem.id, null);
                    }
                  } else if (draggedItem?.type === 'folder') {
                    onMoveFolder?.(draggedItem.id, null);
                  }
                  setDraggedItem(null);
                  setDragOverTarget(null);
                }
              }}
              className="space-y-0.5"
            >
              {/* Drop Zone: Sacar de carpetas o eventos (mover a la raíz) */}
              {canMoveToRoot && (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = 'move';
                    if (dragOverTarget !== 'root') setDragOverTarget('root');
                  }}
                  onDragLeave={() => {
                    if (dragOverTarget === 'root') setDragOverTarget(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDragOverTarget(null);
                    if (draggedItem?.type === 'note') {
                      if (draggedItem.folderId !== null) {
                        onMoveNote?.(draggedItem.id, null);
                      }
                      if (draggedItem.eventId !== null) {
                        onMoveNoteToEvent?.(draggedItem.id, null);
                      }
                    } else if (draggedItem?.type === 'folder') {
                      onMoveFolder?.(draggedItem.id, null);
                    }
                    setDraggedItem(null);
                  }}
                  className={cn(
                    'my-1 px-2.5 py-2 rounded-lg border-2 border-dashed transition-all duration-150 flex items-center justify-center gap-2 text-xs cursor-pointer select-none',
                    dragOverTarget === 'root'
                      ? 'bg-accent/20 border-accent text-accent font-semibold ring-2 ring-accent/40 shadow-sm scale-[1.01]'
                      : 'border-veyra-border hover:border-accent/60 text-veyra-muted bg-white/[0.02]'
                  )}
                >
                  <FolderOutput className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Soltar aquí para sacar a la raíz</span>
                </div>
              )}

              {/* Top-level Folders (nested support) */}
              {topLevelFolders.map((folder) => renderFolderNode(folder))}

              {/* Opción B: Event Categories / Cuadernos de Clases y Eventos */}
              {eventCategories.map((category) => {
                const isCategoryExpanded = !!expandedEventCategories[category.name];
                const totalCategoryNotes = category.items.reduce(
                  (acc, it) => acc + it.notes.length,
                  0
                );

                return (
                  <div key={category.name} className="space-y-0.5 pt-1">
                    {/* Category Header Row (e.g. "Universidad", "Clases") */}
                    <div
                      onClick={() =>
                        setExpandedEventCategories((prev) => ({
                          ...prev,
                          [category.name]: !isCategoryExpanded,
                        }))
                      }
                      className="group flex items-center justify-between px-2 py-1.5 rounded-lg text-veyra-muted hover:text-veyra-text hover:bg-white/[0.03] transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-1.5 truncate flex-1 min-w-0">
                        <span className="p-0.5 text-veyra-subtle group-hover:text-veyra-text transition-colors flex items-center justify-center">
                          <MorphIcon
                            icon={isCategoryExpanded ? ChevronDown : ChevronRight}
                            size={13}
                            color="currentColor"
                          />
                        </span>

                        {React.createElement(getCategoryIcon(category.name), {
                          className: 'w-3.5 h-3.5 text-accent shrink-0',
                        })}
                        <span className="truncate text-xs font-semibold text-veyra-text">
                          {category.name}
                        </span>
                      </div>

                      <span className="text-[10px] font-mono text-veyra-subtle pr-1">
                        {totalCategoryNotes}
                      </span>
                    </div>

                    {/* Events inside category */}
                    {isCategoryExpanded && (
                      <div className="ml-3 pl-2 border-l border-veyra-border/60 space-y-0.5 py-0.5">
                        {category.items.map(({ event, notes }) => {
                          const isEventExpanded = !!expandedEvents[event.id];
                          const eventColor = event.color || '#3B82F6';
                          const isEventDragOver = dragOverTarget === `event-${event.id}`;

                          return (
                            <div key={event.id} className="space-y-0.5">
                              {/* Event Row (Drop target for notes, but NOT draggable) */}
                              <div
                                onDragOver={(e) => {
                                  if (!draggedItem || draggedItem.type !== 'note') return;
                                  if (draggedItem.eventId !== event.id) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    e.dataTransfer.dropEffect = 'move';
                                    if (dragOverTarget !== `event-${event.id}`) {
                                      setDragOverTarget(`event-${event.id}`);
                                    }
                                  }
                                }}
                                onDragLeave={(e) => {
                                  if (dragOverTarget === `event-${event.id}`) {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    if (
                                      e.clientX < rect.left ||
                                      e.clientX >= rect.right ||
                                      e.clientY < rect.top ||
                                      e.clientY >= rect.bottom
                                    ) {
                                      setDragOverTarget(null);
                                    }
                                  }
                                }}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setDragOverTarget(null);
                                  if (draggedItem?.type === 'note' && draggedItem.eventId !== event.id) {
                                    onMoveNoteToEvent?.(draggedItem.id, event.id);
                                    setExpandedEvents((prev) => ({ ...prev, [event.id]: true }));
                                  }
                                  setDraggedItem(null);
                                }}
                                onClick={() =>
                                  setExpandedEvents((prev) => ({
                                    ...prev,
                                    [event.id]: !isEventExpanded,
                                  }))
                                }
                                onContextMenu={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  openContextMenu(e.clientX, e.clientY, { type: 'event', event });
                                }}
                                className={cn(
                                  'group flex items-center justify-between px-2 py-1 rounded-md text-veyra-muted hover:text-veyra-text hover:bg-white/[0.04] transition-all cursor-pointer relative select-none',
                                  isEventDragOver && 'bg-accent/25 text-accent font-semibold ring-2 ring-accent/60 shadow-md scale-[1.01]'
                                )}
                              >
                                <div className="flex items-center gap-1.5 truncate flex-1 min-w-0">
                                  <span className="p-0.5 text-veyra-subtle group-hover:text-veyra-text transition-colors flex items-center justify-center">
                                    <MorphIcon
                                      icon={isEventExpanded ? ChevronDown : ChevronRight}
                                      size={12}
                                      color="currentColor"
                                    />
                                  </span>

                                  <Calendar
                                    className="w-3.5 h-3.5 shrink-0"
                                    style={{ color: eventColor }}
                                  />

                                  <span className="truncate text-xs font-medium text-veyra-text">
                                    {event.title}
                                  </span>
                                </div>

                                <div className="flex items-center gap-1 shrink-0">
                                  {onSelectEvent && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onSelectEvent(event.id);
                                      }}
                                      title="Ver evento en agenda"
                                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-veyra-subtle hover:text-accent hover:bg-white/10 transition-all cursor-pointer"
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                    </button>
                                  )}

                                  {onCreateNoteForEvent && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onCreateNoteForEvent(event.id, event.folder_id || null);
                                        setExpandedEvents((prev) => ({ ...prev, [event.id]: true }));
                                      }}
                                      title="Nueva nota para esta materia"
                                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-veyra-subtle hover:text-accent hover:bg-white/10 transition-all cursor-pointer"
                                    >
                                      <Plus className="w-3 h-3" />
                                    </button>
                                  )}

                                  <span className="text-[10px] font-mono text-veyra-subtle pr-1">
                                    {notes.length}
                                  </span>
                                </div>
                              </div>

                              {/* Event child notes */}
                              {isEventExpanded && (
                                <div className="ml-4 pl-2 border-l border-veyra-border/40 space-y-0.5 py-0.5">
                                  {notes.length === 0 ? (
                                    <div className="px-2 py-1 text-[11px] text-veyra-subtle flex items-center justify-between">
                                      <span className="italic">Sin notas aún</span>
                                      {onCreateNoteForEvent && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            onCreateNoteForEvent(event.id, event.folder_id || null)
                                          }
                                          className="text-accent text-[10px] font-medium hover:underline flex items-center gap-0.5 cursor-pointer"
                                        >
                                          <Plus className="w-2.5 h-2.5" />
                                          <span>Crear apunte</span>
                                        </button>
                                      )}
                                    </div>
                                  ) : (
                                    notes.map((n) => renderNoteItem(n))
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Root Notes: notas que no están dentro de carpetas ni eventos */}
              {rootNotes.map((n) => renderNoteItem(n))}

              {/* Empty state when no folders, no event categories and no notes exist */}
              {folders.length === 0 && eventCategories.length === 0 && rootNotes.length === 0 && (
                <div className="py-8 px-3 text-center text-veyra-subtle space-y-1">
                  <p className="text-xs font-medium text-veyra-muted">No hay notas ni carpetas</p>
                  <p className="text-[11px] text-veyra-subtle">
                    Pulsa + para crear tu primera nota.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* VIEW B: Filtered Notes / Search Results View */}
        {(search.trim().length > 0 || activeView !== 'all') && (
          <div>
            <div className="flex items-center justify-between px-2 mb-2">
              <span className="text-[10px] font-semibold text-veyra-subtle uppercase tracking-wider truncate">
                {search.trim().length > 0
                  ? `Resultados (${displayedNotes.length})`
                  : activeView === 'favorites'
                  ? `Favoritas (${displayedNotes.length})`
                  : activeView === 'recent'
                  ? `Recientes (${displayedNotes.length})`
                  : activeView === 'tags'
                  ? selectedTag
                    ? `#${selectedTag} (${displayedNotes.length})`
                    : `Etiquetas (${displayedNotes.length})`
                  : activeView === 'trash'
                  ? `Papelera (${displayedNotes.length})`
                  : `Notas (${displayedNotes.length})`}
              </span>

              {activeView === 'trash' && (deletedNotes || []).length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('¿Deseas vaciar la papelera de notas permanentemente?')) {
                      onEmptyTrash?.();
                    }
                  }}
                  className="text-[10px] font-mono text-red-400 hover:text-red-300 transition-colors cursor-pointer flex items-center gap-1"
                  title="Vaciar papelera permanentemente"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Vaciar</span>
                </button>
              ) : (
                <span className="text-[10px] font-mono text-veyra-subtle lowercase shrink-0 ml-2">
                  {activeView === 'favorites'
                    ? 'fijadas'
                    : activeView === 'recent'
                    ? 'últimos 7 días'
                    : activeView === 'trash'
                    ? 'eliminadas'
                    : 'orden: reciente'}
                </span>
              )}
            </div>

            {/* Tags Pills Bar (Only in Tags view when tags exist) */}
            {activeView === 'tags' && allTags.length > 0 && search.trim().length === 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-2 px-1 mb-2">
                <button
                  type="button"
                  onClick={() => setSelectedTag(null)}
                  className={cn(
                    'px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors shrink-0 cursor-pointer',
                    selectedTag === null
                      ? 'bg-accent text-white'
                      : 'bg-white/5 text-veyra-muted hover:text-veyra-text hover:bg-white/10'
                  )}
                >
                  Todas ({taggedNotesCount})
                </button>
                {allTags.map(({ tag, count }) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                    className={cn(
                      'px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors shrink-0 cursor-pointer',
                      selectedTag === tag
                        ? 'bg-accent text-white'
                        : 'bg-white/5 text-veyra-muted hover:text-veyra-text hover:bg-white/10'
                    )}
                  >
                    #{tag} ({count})
                  </button>
                ))}
              </div>
            )}

            <div className="space-y-0.5">
              {displayedNotes.length === 0 ? (
                <div className="py-8 px-3 text-center text-veyra-subtle space-y-1">
                  <p className="text-xs font-medium text-veyra-muted">
                    {activeView === 'favorites'
                      ? 'No tienes notas favoritas'
                      : activeView === 'recent'
                      ? 'No hay notas modificadas recientemente'
                      : activeView === 'tags'
                      ? 'No se encontraron notas con etiquetas'
                      : activeView === 'trash'
                      ? 'La papelera está vacía'
                      : 'No hay notas para mostrar'}
                  </p>
                  <p className="text-[11px] text-veyra-subtle leading-relaxed">
                    {activeView === 'favorites'
                      ? 'Haz clic en la estrella al pasar el cursor sobre cualquier nota para fijarla aquí.'
                      : activeView === 'tags'
                      ? 'Escribe #etiqueta (ej: #ideas, #trabajo) en el título o cuerpo de tus notas para organizarlas.'
                      : activeView === 'trash'
                      ? 'Las notas que elimines aparecerán aquí para restaurarlas o eliminarlas definitivamente.'
                      : ''}
                  </p>
                </div>
              ) : (
                displayedNotes.map((note) => renderNoteItem(note))
              )}
            </div>
          </div>
        )}
      </div>

      {/* 4. Footer */}
      <div className="h-9 px-4 flex items-center justify-between border-t border-veyra-border bg-veyra-card/50 text-[11px] text-veyra-subtle shrink-0 font-mono">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
          <span>{allNotes.length} notas</span>
        </div>

        <div className="flex items-center gap-2">
          <span>⌘</span>
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            title="Preferencias y cuenta"
            className="p-1 rounded text-veyra-subtle hover:text-veyra-text hover:bg-white/5 transition-colors cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </>
  )}

      {/* Modal: Nueva Carpeta Raíz */}
      <Modal
        isOpen={isFolderModalOpen}
        onClose={() => setIsFolderModalOpen(false)}
        title="Nueva Carpeta"
        maxWidth="sm"
      >
        <form onSubmit={handleCreateFolderSubmit} className="space-y-4">
          <Input
            label="Nombre de la carpeta"
            placeholder="ej. Marketing, Trabajo, Universidades..."
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            required
            autoFocus
          />

          <div>
            <label className="block text-xs font-medium text-veyra-muted mb-2">
              Color identificativo
            </label>
            <div className="flex items-center gap-2">
              {['#8B5CF6', '#60A5FA', '#F87171', '#34D399', '#FBBF24', '#F472B6'].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setSelectedFolderColor(c)}
                  className={cn(
                    'w-6 h-6 rounded-full transition-transform cursor-pointer',
                    selectedFolderColor === c && 'scale-110 ring-2 ring-offset-2 ring-offset-veyra-card ring-accent'
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsFolderModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" size="sm" loading={creatingFolder}>
              Crear Carpeta
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Preferencias y Cuenta */}
      <UserSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        userId={userId}
        userEmail={userEmail}
        userName={userName}
        onSignOut={onSignOut}
      />

      {/* Menú Contextual Personalizado (Diseño Flat, sin glass ni reflejos) */}
      {contextMenu.isOpen && contextMenu.target && (
        <div
          ref={contextMenuRef}
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          className="fixed z-50 min-w-[190px] p-1 bg-veyra-elevated border border-veyra-border rounded-md shadow-lg text-xs text-veyra-text select-none"
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.target.type === 'folder' && (
            <>
              {/* Nueva nota en esta carpeta */}
              <button
                type="button"
                onClick={() => {
                  const targetFolder = contextMenu.target?.type === 'folder' ? contextMenu.target.folder : null;
                  closeContextMenu();
                  if (targetFolder) {
                    onSelectFolder(targetFolder.id);
                    onCreateNote();
                  }
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-white/5 text-left transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-accent shrink-0" />
                <span>Nueva nota aquí</span>
              </button>

              {/* Nueva subcarpeta */}
              <button
                type="button"
                onClick={() => {
                  const targetFolder = contextMenu.target?.type === 'folder' ? contextMenu.target.folder : null;
                  closeContextMenu();
                  if (targetFolder) {
                    setInlineSubfolderParentId(targetFolder.id);
                    setInlineSubfolderName('');
                    setInlineSubfolderColor(targetFolder.color || '#60A5FA');
                    setIsColorPickerOpen(false);
                    setExpandedFolders((prev) => ({ ...prev, [targetFolder.id]: true }));
                  }
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-white/5 text-left transition-colors cursor-pointer"
              >
                <FolderPlus className="w-3.5 h-3.5 text-accent shrink-0" />
                <span>Nueva subcarpeta</span>
              </button>

              {/* Renombrar carpeta */}
              <button
                type="button"
                onClick={() => {
                  if (contextMenu.target?.type === 'folder') {
                    handleStartRenameFolder(contextMenu.target.folder);
                  }
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-white/5 text-left transition-colors cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5 text-veyra-subtle shrink-0" />
                <span>Renombrar carpeta</span>
              </button>

              {/* Cambiar color */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setContextColorPickerOpen(!contextColorPickerOpen)}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded hover:bg-white/5 text-left transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Palette className="w-3.5 h-3.5 text-veyra-subtle shrink-0" />
                    <span>Cambiar color</span>
                  </div>
                  <span
                    className="w-3 h-3 rounded-full border border-white/20 shrink-0"
                    style={{ backgroundColor: contextMenu.target.folder.color || '#60A5FA' }}
                  />
                </button>

                {contextColorPickerOpen && (
                  <div className="p-1.5 mt-1 bg-veyra-card border border-veyra-border rounded grid grid-cols-4 gap-1.5">
                    {['#8B5CF6', '#60A5FA', '#F87171', '#34D399', '#FBBF24', '#F472B6', '#10B981', '#EC4899'].map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => {
                          if (contextMenu.target?.type === 'folder') {
                            onUpdateFolder?.(contextMenu.target.folder.id, { color: c });
                          }
                          closeContextMenu();
                        }}
                        className={cn(
                          'w-5 h-5 rounded-full transition-transform hover:scale-105 cursor-pointer',
                          contextMenu.target?.type === 'folder' && contextMenu.target.folder.color === c && 'ring-2 ring-accent scale-105'
                        )}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div className="my-1 border-t border-veyra-border" />

              {/* Eliminar carpeta */}
              <button
                type="button"
                onClick={() => {
                  const targetFolder = contextMenu.target?.type === 'folder' ? contextMenu.target.folder : null;
                  closeContextMenu();
                  if (targetFolder && window.confirm(`¿Eliminar la carpeta "${targetFolder.name}"? Sus notas se conservarán y se moverán a la raíz.`)) {
                    onDeleteFolder?.(targetFolder.id);
                  }
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-red-500/10 text-red-400 hover:text-red-300 text-left transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                <span>Eliminar carpeta</span>
              </button>
            </>
          )}

          {contextMenu.target.type === 'note' && (
            <>
              {/* Fijar en favoritas / Desfijar */}
              {activeView !== 'trash' && onTogglePinNote && (
                <button
                  type="button"
                  onClick={() => {
                    const targetNote = contextMenu.target?.type === 'note' ? contextMenu.target.note : null;
                    closeContextMenu();
                    if (targetNote) onTogglePinNote(targetNote.id);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-white/5 text-left transition-colors cursor-pointer"
                >
                  <Star
                    className={cn(
                      'w-3.5 h-3.5 shrink-0',
                      contextMenu.target.note.is_pinned === 1
                        ? 'fill-amber-400 text-amber-400'
                        : 'text-veyra-subtle'
                    )}
                  />
                  <span>
                    {contextMenu.target.note.is_pinned === 1
                      ? 'Desfijar de favoritas'
                      : 'Fijar en favoritas'}
                  </span>
                </button>
              )}

              {/* Duplicar nota */}
              {activeView !== 'trash' && onDuplicateNote && (
                <button
                  type="button"
                  onClick={() => {
                    const targetNote = contextMenu.target?.type === 'note' ? contextMenu.target.note : null;
                    closeContextMenu();
                    if (targetNote) onDuplicateNote(targetNote.id);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-white/5 text-left transition-colors cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5 text-veyra-subtle shrink-0" />
                  <span>Duplicar nota</span>
                </button>
              )}

              {/* Abrir para exportar a PDF */}
              {activeView !== 'trash' && (
                <button
                  type="button"
                  onClick={() => {
                    const targetNote = contextMenu.target?.type === 'note' ? contextMenu.target.note : null;
                    closeContextMenu();
                    if (targetNote) onSelectNote(targetNote.id);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-white/5 text-left transition-colors cursor-pointer"
                >
                  <FileDown className="w-3.5 h-3.5 text-accent shrink-0" />
                  <span>Exportar a PDF</span>
                </button>
              )}

              {/* Mover a la raíz si está en carpeta o evento */}
              {activeView !== 'trash' &&
                (contextMenu.target.note.folder_id !== null || contextMenu.target.note.event_id !== null) && (
                  <button
                    type="button"
                    onClick={() => {
                      const targetNote = contextMenu.target?.type === 'note' ? contextMenu.target.note : null;
                      closeContextMenu();
                      if (targetNote) {
                        if (targetNote.folder_id !== null) onMoveNote?.(targetNote.id, null);
                        if (targetNote.event_id !== null) onMoveNoteToEvent?.(targetNote.id, null);
                      }
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-white/5 text-left transition-colors cursor-pointer"
                  >
                    <FolderInput className="w-3.5 h-3.5 text-veyra-subtle shrink-0" />
                    <span>Mover a la raíz</span>
                  </button>
                )}

              <div className="my-1 border-t border-veyra-border" />

              {/* Acciones de eliminación / restauración */}
              {activeView === 'trash' ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      const targetNote = contextMenu.target?.type === 'note' ? contextMenu.target.note : null;
                      closeContextMenu();
                      if (targetNote) onRestoreNote?.(targetNote.id);
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-emerald-500/10 text-emerald-400 text-left transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                    <span>Restaurar nota</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const targetNote = contextMenu.target?.type === 'note' ? contextMenu.target.note : null;
                      closeContextMenu();
                      if (targetNote && window.confirm('¿Eliminar permanentemente esta nota?')) {
                        onDeleteForever?.(targetNote.id);
                      }
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-red-500/10 text-red-400 text-left transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5 shrink-0" />
                    <span>Eliminar permanentemente</span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    const targetNote = contextMenu.target?.type === 'note' ? contextMenu.target.note : null;
                    closeContextMenu();
                    if (targetNote) onDeleteNote?.(targetNote.id);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-red-500/10 text-red-400 text-left transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Mover a papelera</span>
                </button>
              )}
            </>
          )}

          {contextMenu.target.type === 'event' && (
            <>
              {onSelectEvent && (
                <button
                  type="button"
                  onClick={() => {
                    const targetEvent = contextMenu.target?.type === 'event' ? contextMenu.target.event : null;
                    closeContextMenu();
                    if (targetEvent) onSelectEvent(targetEvent.id);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-white/5 text-left transition-colors cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-accent shrink-0" />
                  <span>Ver en agenda</span>
                </button>
              )}
              {onCreateNoteForEvent && (
                <button
                  type="button"
                  onClick={() => {
                    const targetEvent = contextMenu.target?.type === 'event' ? contextMenu.target.event : null;
                    closeContextMenu();
                    if (targetEvent) {
                      onCreateNoteForEvent(targetEvent.id, targetEvent.folder_id || null);
                      setExpandedEvents((prev) => ({ ...prev, [targetEvent.id]: true }));
                    }
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-white/5 text-left transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-accent shrink-0" />
                  <span>Crear apunte para esta materia</span>
                </button>
              )}
            </>
          )}
        </div>
      )}
    </aside>
  );
};
