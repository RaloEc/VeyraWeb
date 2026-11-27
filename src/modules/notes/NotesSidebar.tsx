import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
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
  Share2,
  Pin,
  CheckSquare,
  LayoutDashboard,
} from 'lucide-react';
import { toast } from 'sonner';
import { MorphIcon } from 'morphicons/react';
import { ChevronDown, ChevronRight, PanelLeftClose } from 'lucide';
import type { Folder, Note } from '../../types/notes';
import type { CalendarEvent } from '../../hooks/useEvents';
import { ConfirmTooltip } from '../../components/common/ConfirmTooltip';
import { cn } from '../../lib/utils';
import { getEventCategoryTag } from '../../lib/eventNotebooks';
import {
  type DashboardQuickAccessItem,
  QUICK_ACCESS_CHANGED_EVENT,
  loadDashboardQuickAccess,
  isItemInDashboardQuickAccess,
  toggleDashboardQuickAccessItem,
} from '../../lib/dashboardQuickAccess';
import { AgendaSidebarView } from './AgendaSidebarView';
import { UserSettingsModal } from '../../components/common/UserSettingsModal';
import { ShareModal } from '../../components/common/ShareModal';
import type { useReminders } from '../../hooks/useReminders';
import type { useEvents } from '../../hooks/useEvents';

const ROOT_INLINE_FOLDER = '__root__';

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
  onOpenCalendar?: () => void;
  isCalendarOpen?: boolean;
  onOpenDashboard?: () => void;
  isDashboardActive?: boolean;
  sidebarSection?: 'notes' | 'agenda';
  onSectionChange?: (section: 'notes' | 'agenda') => void;
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

export { getEventCategoryTag };

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
  onOpenCalendar,
  isCalendarOpen,
  onOpenDashboard,
  isDashboardActive,
  sidebarSection: controlledSidebarSection,
  onSectionChange,
  userId,
  userEmail,
  userName,
  onSignOut,
}) => {
  const [internalSidebarSection, setInternalSidebarSection] = useState<'notes' | 'agenda'>('agenda');
  const sidebarSection = controlledSidebarSection ?? internalSidebarSection;

  const handleSelectSection = (section: 'notes' | 'agenda') => {
    if (section !== 'notes') {
      setIsSelectionMode(false);
      setSelectedNoteIds([]);
      setSelectedFolderIds([]);
    }
    setInternalSidebarSection(section);
    onSectionChange?.(section);
  };
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState<{
    type: 'note' | 'folder' | 'event';
    id: string;
    name: string;
    ownerId?: string | null;
  } | null>(null);
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

  // Inline folder & subfolder creation state (no modal)
  const [inlineSubfolderParentId, setInlineSubfolderParentId] = useState<string | null>(null);
  const [inlineSubfolderName, setInlineSubfolderName] = useState('');
  const [inlineSubfolderColor, setInlineSubfolderColor] = useState('#60A5FA');
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [isSavingInlineSubfolder, setIsSavingInlineSubfolder] = useState(false);
  const colorPickerRef = useRef<HTMLDivElement>(null);

  // Smooth exit animation state for deleting notes and folders
  const [exitingNoteIds, setExitingNoteIds] = useState<Set<string>>(() => new Set());
  const [exitingFolderIds, setExitingFolderIds] = useState<Set<string>>(() => new Set());

  const animateDeleteNote = useCallback(
    (noteId: string, permanent = false) => {
      setExitingNoteIds((prev) => {
        if (prev.has(noteId)) return prev;
        const next = new Set(prev);
        next.add(noteId);
        return next;
      });
      window.setTimeout(async () => {
        try {
          if (permanent) {
            await onDeleteForever?.(noteId);
          } else {
            await onDeleteNote?.(noteId);
          }
        } finally {
          setExitingNoteIds((prev) => {
            if (!prev.has(noteId)) return prev;
            const next = new Set(prev);
            next.delete(noteId);
            return next;
          });
        }
      }, 250);
    },
    [onDeleteForever, onDeleteNote]
  );

  const animateDeleteFolder = useCallback(
    (folderId: string) => {
      setExitingFolderIds((prev) => {
        if (prev.has(folderId)) return prev;
        const next = new Set(prev);
        next.add(folderId);
        return next;
      });
      window.setTimeout(async () => {
        try {
          await onDeleteFolder?.(folderId);
        } finally {
          setExitingFolderIds((prev) => {
            if (!prev.has(folderId)) return prev;
            const next = new Set(prev);
            next.delete(folderId);
            return next;
          });
        }
      }, 250);
    },
    [onDeleteFolder]
  );

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

  const toggleFolderExpanded = (e: React.MouseEvent | null, folderId: string) => {
    e?.stopPropagation();
    setExpandedFolders((prev) => ({
      ...prev,
      [folderId]: !prev[folderId],
    }));
  };

  const handleConfirmInlineSubfolder = async () => {
    const name = inlineSubfolderName.trim();
    if (!name || !inlineSubfolderParentId) {
      handleCancelInlineSubfolder();
      return;
    }
    const targetParentId =
      inlineSubfolderParentId === ROOT_INLINE_FOLDER ? null : inlineSubfolderParentId;
    try {
      setIsSavingInlineSubfolder(true);
      await onCreateFolder(name, inlineSubfolderColor, targetParentId);
      setInlineSubfolderParentId(null);
      setInlineSubfolderName('');
      setIsColorPickerOpen(false);
    } catch (err) {
      console.error('[NotesSidebar] Error creating inline folder:', err);
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
  const [confirmDeleteFolderInMenu, setConfirmDeleteFolderInMenu] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Multi-selection & Batch Actions state
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>([]);
  const [isBatchBusy, setIsBatchBusy] = useState(false);

  const selectedNoteSet = useMemo(() => new Set(selectedNoteIds), [selectedNoteIds]);
  const selectedFolderSet = useMemo(() => new Set(selectedFolderIds), [selectedFolderIds]);
  const totalSelectedCount = selectedNoteIds.length + selectedFolderIds.length;

  const exitSelectionMode = () => {
    setIsSelectionMode(false);
    setSelectedNoteIds([]);
    setSelectedFolderIds([]);
  };

  const toggleNoteSelection = (noteId: string) => {
    setIsSelectionMode(true);
    setSelectedNoteIds((prev) =>
      prev.includes(noteId) ? prev.filter((id) => id !== noteId) : [...prev, noteId]
    );
  };

  const toggleFolderSelection = (folderId: string) => {
    setIsSelectionMode(true);
    setSelectedFolderIds((prev) =>
      prev.includes(folderId) ? prev.filter((id) => id !== folderId) : [...prev, folderId]
    );
  };

  useEffect(() => {
    if (!isSelectionMode) return;
    const handleEscSelection = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !contextMenu.isOpen) {
        exitSelectionMode();
      }
    };
    window.addEventListener('keydown', handleEscSelection);
    return () => window.removeEventListener('keydown', handleEscSelection);
  }, [isSelectionMode, contextMenu.isOpen]);

  const openContextMenu = (
    clientX: number,
    clientY: number,
    target: ContextMenuTarget
  ) => {
    const menuWidth = 220;
    const menuHeight = 290;
    const x = Math.min(clientX, window.innerWidth - menuWidth - 10);
    const y = Math.min(clientY, window.innerHeight - menuHeight - 10);

    setContextMenu({
      isOpen: true,
      x: Math.max(10, x),
      y: Math.max(10, y),
      target,
    });
    setContextColorPickerOpen(false);
    setConfirmDeleteFolderInMenu(false);
  };

  const closeContextMenu = () => {
    setContextMenu({ isOpen: false, x: 0, y: 0, target: null });
    setContextColorPickerOpen(false);
    setConfirmDeleteFolderInMenu(false);
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
        const activeEventIds = new Set(
          (eventsHook?.events || [])
            .filter((ev) => ev.deleted !== 1)
            .map((ev) => ev.id)
        );
        // En raíz, ocultar notas ligadas a un Cuaderno Inteligente activo (si el evento fue borrado, sí se muestran)
        list = allNotes
          .filter((n) => !n.event_id || !activeEventIds.has(n.event_id))
          .sort((a, b) => {
            if ((b.is_pinned || 0) !== (a.is_pinned || 0)) {
              return (b.is_pinned || 0) - (a.is_pinned || 0);
            }
            return (b.updated_at_ms || 0) - (a.updated_at_ms || 0);
          });
      }
    }

    return list;
  }, [allNotes, deletedNotes, activeView, selectedFolderId, selectedTag, noteTagsMap, recentNotes]);

  // Set of existing folder IDs
  const existingFolderIds = useMemo(() => new Set(folders.map((f) => f.id)), [folders]);

  // Dashboard Quick Access state synced with FoldersTemplatesWidget
  const [quickAccessItems, setQuickAccessItems] = useState<DashboardQuickAccessItem[] | null>(() =>
    loadDashboardQuickAccess(userId)
  );

  useEffect(() => {
    const handleQuickAccessSync = () => {
      setQuickAccessItems(loadDashboardQuickAccess(userId));
    };
    window.addEventListener(QUICK_ACCESS_CHANGED_EVENT, handleQuickAccessSync);
    return () => window.removeEventListener(QUICK_ACCESS_CHANGED_EVENT, handleQuickAccessSync);
  }, [userId]);

  const defaultQuickAccessFolderIds = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of allNotes) {
      if (n.deleted !== 1 && n.folder_id) {
        counts.set(n.folder_id, (counts.get(n.folder_id) || 0) + 1);
      }
    }
    return folders
      .filter((f) => f.deleted !== 1 && (!f.parent_id || !existingFolderIds.has(f.parent_id)))
      .sort((a, b) => {
        if (a.is_pinned !== b.is_pinned) {
          return (b.is_pinned || 0) - (a.is_pinned || 0);
        }
        const diffCount = (counts.get(b.id) || 0) - (counts.get(a.id) || 0);
        if (diffCount !== 0) return diffCount;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 6)
      .map((f) => f.id);
  }, [folders, existingFolderIds, allNotes]);

  // Group events into smart containers (Option B)
  // Events with the same normalized title in the same category (e.g. a class on Tue & Thu)
  // are grouped into a single smart notebook so they don't appear duplicated.
  const eventCategories = useMemo(() => {
    const rawEvents = eventsHook?.events || [];
    if (rawEvents.length === 0) return [];

    type EventNotebookGroup = {
      event: CalendarEvent;
      events: CalendarEvent[];
      notes: Note[];
    };

    const categoryMap = new Map<string, Map<string, EventNotebookGroup>>();

    for (const ev of rawEvents) {
      if (ev.deleted === 1) continue;

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
          categoryMap.set(cat, new Map());
        }
        const titleKey = (ev.title || '').trim().toLowerCase() || ev.id;
        const catGroups = categoryMap.get(cat)!;
        const existing = catGroups.get(titleKey);

        if (!existing) {
          catGroups.set(titleKey, {
            event: ev,
            events: [ev],
            notes: [...evNotes],
          });
        } else {
          existing.events.push(ev);
          const seenNoteIds = new Set(existing.notes.map((n) => n.id));
          for (const n of evNotes) {
            if (!seenNoteIds.has(n.id)) {
              existing.notes.push(n);
              seenNoteIds.add(n.id);
            }
          }
          // Prefer the event with more direct notes (or earlier start time) as the primary representative
          const currentPrimaryNotesCount = allNotes.filter(
            (n) => n.event_id === existing.event.id || (existing.event.note_id && n.id === existing.event.note_id)
          ).length;
          if (
            evNotes.length > currentPrimaryNotesCount ||
            (evNotes.length === currentPrimaryNotesCount &&
              Number(ev.start_time_ms || 0) < Number(existing.event.start_time_ms || 0))
          ) {
            existing.event = ev;
          }
        }
      }
    }

    return Array.from(categoryMap.entries()).map(([name, groupsMap]) => ({
      name,
      items: Array.from(groupsMap.values()).sort((a, b) =>
        a.event.title.localeCompare(b.event.title)
      ),
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
    return sortFolders(
      folders.filter((f) => !f.parent_id || !existingFolderIds.has(f.parent_id))
    );
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

  interface BatchDragPreviewItem {
    id: string;
    type: 'folder' | 'note';
    label: string;
    color?: string | null;
  }

  type DraggedEntity =
    | { type: 'note'; id: string; folderId: string | null; eventId: string | null }
    | { type: 'folder'; id: string; parentId: string | null }
    | {
        type: 'batch';
        noteIds: string[];
        folderIds: string[];
        previewItems: BatchDragPreviewItem[];
      };

  const [draggedItem, setDraggedItem] = useState<DraggedEntity | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);
  const dragPreviewRef = useRef<HTMLDivElement | null>(null);
  const dragPointerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const transparentDragImgRef = useRef<HTMLCanvasElement | null>(null);

  const setTransparentDragImage = (e: React.DragEvent) => {
    if (typeof document === 'undefined') return;
    if (!transparentDragImgRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      transparentDragImgRef.current = canvas;
    }
    e.dataTransfer.setDragImage(transparentDragImgRef.current, 0, 0);
  };

  const positionDragPreview = (x: number, y: number) => {
    dragPointerRef.current = { x, y };
    if (dragPreviewRef.current) {
      dragPreviewRef.current.style.transform = `translate3d(${x + 14}px, ${y + 14}px, 0)`;
    }
  };

  useEffect(() => {
    if (draggedItem?.type !== 'batch') return;

    let currentX = dragPointerRef.current.x;
    let currentY = dragPointerRef.current.y;
    let rafId = 0;

    if (dragPreviewRef.current) {
      dragPreviewRef.current.style.transform = `translate3d(${currentX + 14}px, ${currentY + 14}px, 0)`;
    }

    const tick = () => {
      const targetX = dragPointerRef.current.x;
      const targetY = dragPointerRef.current.y;
      const dx = targetX - currentX;
      const dy = targetY - currentY;

      if (Math.abs(dx) < 0.5) {
        currentX = targetX;
      } else {
        currentX += dx * 0.42;
      }

      if (Math.abs(dy) < 0.5) {
        currentY = targetY;
      } else {
        currentY += dy * 0.42;
      }

      if (dragPreviewRef.current) {
        const tilt = Math.max(-4.5, Math.min(4.5, dx * 0.16));
        dragPreviewRef.current.style.transform = `translate3d(${currentX + 14}px, ${currentY + 14}px, 0) rotate(${tilt.toFixed(2)}deg)`;
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);

    const updatePointer = (e: DragEvent) => {
      if (e.clientX !== 0 || e.clientY !== 0) {
        dragPointerRef.current = { x: e.clientX, y: e.clientY };
      }
    };

    const handleWindowDragEnd = () => {
      setDraggedItem(null);
      setDragOverTarget(null);
    };

    document.addEventListener('dragover', updatePointer, true);
    document.addEventListener('drag', updatePointer, true);
    window.addEventListener('dragend', handleWindowDragEnd, false);
    window.addEventListener('drop', handleWindowDragEnd, false);

    return () => {
      window.cancelAnimationFrame(rafId);
      document.removeEventListener('dragover', updatePointer, true);
      document.removeEventListener('drag', updatePointer, true);
      window.removeEventListener('dragend', handleWindowDragEnd, false);
      window.removeEventListener('drop', handleWindowDragEnd, false);
    };
  }, [draggedItem]);

  const buildBatchDragEntity = (lead: { type: 'folder' | 'note'; id: string }): DraggedEntity => {
    const noteIds =
      lead.type === 'note' && !selectedNoteIds.includes(lead.id)
        ? [lead.id, ...selectedNoteIds]
        : [...selectedNoteIds];
    const folderIds =
      lead.type === 'folder' && !selectedFolderIds.includes(lead.id)
        ? [lead.id, ...selectedFolderIds]
        : [...selectedFolderIds];

    const folderMap = new Map(folders.map((f) => [f.id, f]));
    const noteMap = new Map(allNotes.map((n) => [n.id, n]));
    const previewItems: BatchDragPreviewItem[] = [];

    const pushItem = (type: 'folder' | 'note', id: string) => {
      if (previewItems.some((it) => it.type === type && it.id === id)) return;
      if (type === 'folder') {
        const f = folderMap.get(id);
        if (f) {
          previewItems.push({ id, type: 'folder', label: f.name, color: f.color });
        }
      } else {
        const n = noteMap.get(id);
        if (n) {
          previewItems.push({ id, type: 'note', label: n.title || 'Nota sin título' });
        }
      }
    };

    pushItem(lead.type, lead.id);
    for (const fid of folderIds) {
      if (previewItems.length >= 3) break;
      pushItem('folder', fid);
    }
    for (const nid of noteIds) {
      if (previewItems.length >= 3) break;
      pushItem('note', nid);
    }

    return {
      type: 'batch',
      noteIds,
      folderIds,
      previewItems,
    };
  };

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
    (draggedItem?.type === 'folder' && draggedItem.parentId !== null) ||
    (draggedItem?.type === 'batch' &&
      (draggedItem.noteIds.some((nid) => {
        const n = allNotes.find((item) => item.id === nid);
        return Boolean(n && (n.folder_id !== null || n.event_id !== null));
      }) ||
        draggedItem.folderIds.some((fid) => {
          const f = folders.find((item) => item.id === fid);
          return Boolean(f && f.parent_id !== null);
        })))
  );

  const canBatchDropIntoFolder = (batchFolderIds: string[], targetFolderId: string): boolean => {
    if (batchFolderIds.includes(targetFolderId)) return false;
    const isDescendant = (parentId: string, searchId: string): boolean => {
      const children = subfoldersByParentId.get(parentId) || [];
      for (const child of children) {
        if (child.id === searchId || isDescendant(child.id, searchId)) {
          return true;
        }
      }
      return false;
    };
    return !batchFolderIds.some((fid) => isDescendant(fid, targetFolderId));
  };

  const handleBatchMoveToFolder = async (
    targetFolderId: string | null,
    override?: { noteIds: string[]; folderIds: string[] }
  ) => {
    const noteIdsToMove = override ? override.noteIds : selectedNoteIds;
    const folderIdsToMove = override ? override.folderIds : selectedFolderIds;
    const moveCount = noteIdsToMove.length + folderIdsToMove.length;
    if (moveCount === 0 || isBatchBusy) return;
    setIsBatchBusy(true);
    try {
      const notesMap = new Map(allNotes.map((n) => [n.id, n]));
      for (const noteId of noteIdsToMove) {
        const note = notesMap.get(noteId);
        if (!note) continue;
        if (note.folder_id !== targetFolderId) {
          await onMoveNote?.(noteId, targetFolderId);
        }
        if (note.event_id) {
          await onMoveNoteToEvent?.(noteId, null);
        }
      }

      const canDropTarget =
        targetFolderId === null || canBatchDropIntoFolder(folderIdsToMove, targetFolderId);
      if (canDropTarget) {
        for (const folderId of folderIdsToMove) {
          const folder = folders.find((f) => f.id === folderId);
          if (!folder || folder.parent_id === targetFolderId) continue;
          await onMoveFolder?.(folderId, targetFolderId);
        }
      }

      if (targetFolderId) {
        setExpandedFolders((prev) => ({ ...prev, [targetFolderId]: true }));
      }
      const destLabel = targetFolderId
        ? folders.find((f) => f.id === targetFolderId)?.name || 'carpeta'
        : 'Raíz';
      toast.success(
        `${moveCount} ${moveCount === 1 ? 'elemento movido' : 'elementos movidos'} a "${destLabel}"`
      );
      exitSelectionMode();
    } catch (err) {
      console.error('[NotesSidebar] Error moving batch selection:', err);
      toast.error('No se pudieron mover algunos elementos');
    } finally {
      setIsBatchBusy(false);
    }
  };

  const handleBatchMoveNotesToEvent = async (
    targetEventId: string,
    eventTitle: string,
    overrideNoteIds?: string[]
  ) => {
    const noteIdsToMove = overrideNoteIds || selectedNoteIds;
    if (noteIdsToMove.length === 0 || (!overrideNoteIds && selectedFolderIds.length > 0) || isBatchBusy) return;
    setIsBatchBusy(true);
    try {
      const notesMap = new Map(allNotes.map((n) => [n.id, n]));
      for (const noteId of noteIdsToMove) {
        const note = notesMap.get(noteId);
        if (!note) continue;
        if (note.event_id !== targetEventId) {
          await onMoveNoteToEvent?.(noteId, targetEventId);
        }
        if (note.folder_id !== null) {
          await onMoveNote?.(noteId, null);
        }
      }
      setExpandedEvents((prev) => ({ ...prev, [targetEventId]: true }));
      toast.success(
        `${noteIdsToMove.length} ${noteIdsToMove.length === 1 ? 'nota movida' : 'notas movidas'} a "${eventTitle}"`
      );
      exitSelectionMode();
    } catch (err) {
      console.error('[NotesSidebar] Error moving notes to event:', err);
      toast.error('No se pudieron mover las notas al evento');
    } finally {
      setIsBatchBusy(false);
    }
  };

  const handleBatchDelete = async () => {
    if (totalSelectedCount === 0 || isBatchBusy) return;
    setIsBatchBusy(true);
    const noteIdsToDelete = [...selectedNoteIds];
    const folderIdsToDelete = [...selectedFolderIds];
    if (noteIdsToDelete.length > 0) {
      setExitingNoteIds((prev) => new Set([...prev, ...noteIdsToDelete]));
    }
    if (folderIdsToDelete.length > 0) {
      setExitingFolderIds((prev) => new Set([...prev, ...folderIdsToDelete]));
    }
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 250));
      for (const noteId of noteIdsToDelete) {
        if (activeView === 'trash') {
          await onDeleteForever?.(noteId);
        } else {
          await onDeleteNote?.(noteId);
        }
      }
      for (const folderId of folderIdsToDelete) {
        await onDeleteFolder?.(folderId);
      }
      toast.success(
        activeView === 'trash'
          ? `${totalSelectedCount} ${totalSelectedCount === 1 ? 'nota eliminada' : 'notas eliminadas'} definitivamente`
          : `${totalSelectedCount} ${totalSelectedCount === 1 ? 'elemento eliminado' : 'elementos eliminados'}`
      );
      exitSelectionMode();
    } catch (err) {
      console.error('[NotesSidebar] Error deleting batch selection:', err);
      toast.error('No se pudieron eliminar algunos elementos');
    } finally {
      setExitingNoteIds((prev) => {
        const next = new Set(prev);
        noteIdsToDelete.forEach((id) => next.delete(id));
        return next;
      });
      setExitingFolderIds((prev) => {
        const next = new Set(prev);
        folderIdsToDelete.forEach((id) => next.delete(id));
        return next;
      });
      setIsBatchBusy(false);
    }
  };

  const handleBatchRestore = async () => {
    if (selectedNoteIds.length === 0 || isBatchBusy) return;
    setIsBatchBusy(true);
    try {
      for (const noteId of selectedNoteIds) {
        await onRestoreNote?.(noteId);
      }
      toast.success(
        `${selectedNoteIds.length} ${selectedNoteIds.length === 1 ? 'nota restaurada' : 'notas restauradas'}`
      );
      exitSelectionMode();
    } catch (err) {
      console.error('[NotesSidebar] Error restoring batch selection:', err);
      toast.error('No se pudieron restaurar algunas notas');
    } finally {
      setIsBatchBusy(false);
    }
  };

  // Render a note item row (consistent between Tree Explorer and Filtered Lists)
  const renderNoteItem = (note: Note) => {
    const isSelected = selectedNoteId === note.id;
    const isChecked = selectedNoteSet.has(note.id);
    const isPinned = note.is_pinned === 1;
    const noteTags = noteTagsMap[note.id] || [];
    const isBeingDragged =
      (draggedItem?.type === 'note' && draggedItem.id === note.id) ||
      (draggedItem?.type === 'batch' && draggedItem.noteIds.includes(note.id));

    const isExitingNote = exitingNoteIds.has(note.id);

    return (
      <div
        key={note.id}
        className={cn(
          'veyra-delete-collapse',
          isExitingNote && 'veyra-delete-collapse-exiting'
        )}
      >
        <div className="veyra-delete-collapse-inner">
      <div
        draggable={activeView !== 'trash'}
        onDragStart={(e) => {
          e.stopPropagation();
          if (isSelectionMode && (isChecked || totalSelectedCount > 0)) {
            if (!isChecked) {
              setSelectedNoteIds((prev) => (prev.includes(note.id) ? prev : [...prev, note.id]));
            }
            e.dataTransfer.setData('application/x-veyra-type', 'batch');
            e.dataTransfer.effectAllowed = 'move';
            setTransparentDragImage(e);
            positionDragPreview(e.clientX, e.clientY);
            setDraggedItem(buildBatchDragEntity({ type: 'note', id: note.id }));
            return;
          }
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
          if (isSelectionMode || !draggedItem || draggedItem.type !== 'note' || draggedItem.id === note.id || activeView === 'trash') return;
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
          if (isSelectionMode || !draggedItem || draggedItem.type !== 'note' || draggedItem.id === note.id || activeView === 'trash') return;
          e.preventDefault();
          e.stopPropagation();
          const currentPos = dragPosition;
          setDragOverTarget(null);
          handleReorderNote(draggedItem.id, note.id, currentPos);
          setDraggedItem(null);
        }}
        onClick={(e) => {
          if (isSelectionMode || e.ctrlKey || e.metaKey) {
            e.preventDefault();
            e.stopPropagation();
            toggleNoteSelection(note.id);
            return;
          }
          onSelectNote(note.id);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          openContextMenu(e.clientX, e.clientY, { type: 'note', note });
        }}
        className={cn(
          'group flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-xs truncate cursor-pointer transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.985] relative select-none border border-transparent',
          isSelectionMode && isChecked
            ? 'bg-accent/15 border-accent/35 text-veyra-text font-medium'
            : isSelected
              ? 'bg-accent/15 text-accent font-semibold'
              : 'text-veyra-muted hover:text-veyra-text hover:bg-white/[0.03]',
          isBeingDragged && 'opacity-25 scale-[0.98] border-dashed border-accent/60 bg-accent/5',
          dragOverTarget === note.id && dragPosition === 'before' && 'bg-accent/10 relative before:absolute before:top-0 before:left-1 before:right-1 before:h-0.5 before:bg-accent before:rounded-full before:z-10',
          dragOverTarget === note.id && dragPosition === 'after' && 'bg-accent/10 relative after:absolute after:bottom-0 after:left-1 after:right-1 after:h-0.5 after:bg-accent after:rounded-full after:z-10'
        )}
      >
        <div className="flex items-center gap-1.5 truncate flex-1 min-w-0">
          <span
            aria-hidden={!isSelectionMode}
            className={cn(
              'h-3.5 rounded flex items-center justify-center shrink-0 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]',
              isSelectionMode
                ? cn(
                    'w-3.5 opacity-100 scale-100 border',
                    isChecked
                      ? 'bg-accent border-accent text-white'
                      : 'border-veyra-border bg-veyra-canvas/60'
                  )
                : 'w-0 opacity-0 scale-75 -mr-1.5 overflow-hidden border-0 pointer-events-none'
            )}
          >
            {isSelectionMode && isChecked && (
              <Check className="w-2.5 h-2.5 stroke-[2.5] animate-veyra-check-pop" />
            )}
          </span>

          {isPinned && activeView !== 'trash' ? (
            <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />
          ) : (
            <FileText className="w-3.5 h-3.5 shrink-0 text-veyra-subtle group-hover:text-veyra-muted" />
          )}

          <span
            className={cn(
              'truncate text-xs',
              isSelected && !isSelectionMode ? 'text-accent font-semibold' : 'text-veyra-text'
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
          {/* Actions on hover (hidden during multi-select mode) */}
          {!isSelectionMode && activeView === 'trash' ? (
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
                    animateDeleteNote(note.id, true);
                  }
                }}
                title="Eliminar permanentemente"
                className="p-1 rounded text-red-400 hover:text-red-300 hover:bg-white/10 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ) : !isSelectionMode ? (
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
                    animateDeleteNote(note.id, false);
                  }}
                  title="Mover a papelera"
                  className="p-1 rounded text-veyra-subtle hover:text-red-400 hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          ) : null}

          <span className="text-[10px] font-mono text-veyra-subtle shrink-0">
            {formatNoteDate(note.updated_at_ms || note.created_at_ms)}
          </span>
        </div>
      </div>
        </div>
      </div>
    );
  };

  const renderInlineFolderCreator = (placeholder: string) => (
    <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-veyra-elevated/95 border border-accent/60 shadow-sm relative select-none animate-veyra-inline-reveal mb-1">
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
          title="Elegir color de la carpeta"
        />
        {isColorPickerOpen && (
          <div
            ref={colorPickerRef}
            onClick={(e) => e.stopPropagation()}
            className="absolute left-0 top-full mt-1.5 p-1.5 bg-veyra-elevated border border-veyra-border rounded-md shadow-md flex items-center gap-1.5 z-50 animate-veyra-scale-in"
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
        placeholder={placeholder}
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
  );

  // Render a folder node with nested subfolder support
  const renderFolderNode = (folder: Folder, depth = 0): React.ReactNode => {
    const isExpanded = !!expandedFolders[folder.id];
    const subfolders = subfoldersByParentId.get(folder.id) || [];
    const folderNotes = sortNotes(
      allNotes.filter((n) => n.folder_id === folder.id && !eventNoteIds.has(n.id))
    );

    const isBeingDragged =
      (draggedItem?.type === 'folder' && draggedItem.id === folder.id) ||
      (draggedItem?.type === 'batch' && draggedItem.folderIds.includes(folder.id));
    const isDragOver = dragOverTarget === folder.id;
    const isFolderChecked = selectedFolderSet.has(folder.id);

    const isExitingFolder = exitingFolderIds.has(folder.id);

    return (
      <div
        key={folder.id}
        className={cn(
          'veyra-delete-collapse',
          isExitingFolder && 'veyra-delete-collapse-exiting'
        )}
      >
        <div className="veyra-delete-collapse-inner space-y-0.5">
        {/* Folder row */}
        <div
          draggable={activeView !== 'trash'}
          onDragStart={(e) => {
            e.stopPropagation();
            if (isSelectionMode && (isFolderChecked || totalSelectedCount > 0)) {
              if (!isFolderChecked) {
                setSelectedFolderIds((prev) => (prev.includes(folder.id) ? prev : [...prev, folder.id]));
              }
              e.dataTransfer.setData('application/x-veyra-type', 'batch');
              e.dataTransfer.effectAllowed = 'move';
              setTransparentDragImage(e);
              positionDragPreview(e.clientX, e.clientY);
              setDraggedItem(buildBatchDragEntity({ type: 'folder', id: folder.id }));
              return;
            }
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
            if (draggedItem.type === 'batch') {
              if (canBatchDropIntoFolder(draggedItem.folderIds, folder.id)) {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'move';
                setDragPosition('inside');
                if (dragOverTarget !== folder.id) {
                  setDragOverTarget(folder.id);
                }
              }
            } else if (draggedItem.type === 'note') {
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
            if (draggedItem.type === 'batch') {
              const { noteIds, folderIds } = draggedItem;
              setDraggedItem(null);
              if (canBatchDropIntoFolder(folderIds, currentTarget)) {
                handleBatchMoveToFolder(currentTarget, { noteIds, folderIds });
              }
              return;
            }
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
          onClick={(e) => {
            if (isSelectionMode || e.ctrlKey || e.metaKey) {
              e.preventDefault();
              e.stopPropagation();
              toggleFolderSelection(folder.id);
              return;
            }
            toggleFolderExpanded(null, folder.id);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            openContextMenu(e.clientX, e.clientY, { type: 'folder', folder });
          }}
          className={cn(
            'group flex items-center justify-between px-2 py-1.5 rounded-lg transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.985] cursor-pointer relative select-none border border-transparent',
            isSelectionMode && isFolderChecked
              ? 'bg-accent/15 border-accent/35 text-veyra-text font-medium'
              : selectedFolderId === folder.id
                ? 'bg-accent/15 text-accent font-semibold'
                : 'text-veyra-muted hover:text-veyra-text hover:bg-white/[0.03]',
            isBeingDragged && 'opacity-25 scale-[0.98] border-dashed border-accent/60 bg-accent/5',
            isDragOver && dragPosition === 'inside' && 'bg-accent/25 text-accent font-semibold ring-2 ring-accent/60 shadow-md scale-[1.01]',
            isDragOver && dragPosition === 'before' && 'bg-accent/10 relative before:absolute before:top-0 before:left-1 before:right-1 before:h-0.5 before:bg-accent before:rounded-full before:z-10',
            isDragOver && dragPosition === 'after' && 'bg-accent/10 relative after:absolute after:bottom-0 after:left-1 after:right-1 after:h-0.5 after:bg-accent after:rounded-full after:z-10'
          )}
        >
          <div className="flex items-center gap-1.5 truncate flex-1 min-w-0">
            <span
              onClick={(e) => {
                if (isSelectionMode) {
                  e.stopPropagation();
                  toggleFolderExpanded(e, folder.id);
                }
              }}
              className="p-0.5 text-veyra-subtle group-hover:text-veyra-text transition-colors flex items-center justify-center"
            >
              <MorphIcon
                icon={isExpanded ? ChevronDown : ChevronRight}
                size={13}
                color="currentColor"
              />
            </span>

            <span
              aria-hidden={!isSelectionMode}
              className={cn(
                'h-3.5 rounded flex items-center justify-center shrink-0 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]',
                isSelectionMode
                  ? cn(
                      'w-3.5 opacity-100 scale-100 border',
                      isFolderChecked
                        ? 'bg-accent border-accent text-white'
                        : 'border-veyra-border bg-veyra-canvas/60'
                    )
                  : 'w-0 opacity-0 scale-75 -mr-1.5 overflow-hidden border-0 pointer-events-none'
              )}
            >
              {isSelectionMode && isFolderChecked && (
                <Check className="w-2.5 h-2.5 stroke-[2.5] animate-veyra-check-pop" />
              )}
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
            {!isSelectionMode && (
              <>
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
                  <ConfirmTooltip
                    title="¿Eliminar carpeta?"
                    description={`"${folder.name}". Sus notas se conservarán y se moverán a la raíz.`}
                    confirmText="Eliminar"
                    onConfirm={() => animateDeleteFolder(folder.id)}
                  >
                    <button
                      type="button"
                      title="Eliminar carpeta"
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-veyra-subtle hover:text-red-400 hover:bg-white/10 transition-all cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </ConfirmTooltip>
                )}
              </>
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
            {inlineSubfolderParentId === folder.id &&
              renderInlineFolderCreator('Nombre de la subcarpeta...')}

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
      </div>
    );
  };

  return (
    <aside
      onContextMenu={(e) => e.preventDefault()}
      className="w-full bg-veyra-card/90 border-r border-veyra-border flex flex-col h-full shrink-0 select-none overflow-hidden text-xs relative"
    >
      {/* 1. Header: Branding + Compact Nav + Settings + Collapse Toggle */}
      <div className="h-12 px-3 flex items-center justify-between gap-2 border-b border-veyra-border shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-md bg-accent flex items-center justify-center font-bold text-white text-xs shadow-sm shrink-0">
            V
          </div>
          <span className="font-bold text-sm tracking-wider text-veyra-text truncate">
            VEYRA
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {(onOpenDashboard || onOpenCalendar) && (
            <div className="flex items-center p-0.5 rounded-md bg-veyra-elevated/70 border border-veyra-border/80">
              {onOpenDashboard && (
                <button
                  type="button"
                  onClick={onOpenDashboard}
                  title="Dashboard"
                  className={cn(
                    'p-1 rounded transition-colors cursor-pointer',
                    isDashboardActive
                      ? 'bg-accent/15 text-accent'
                      : 'text-veyra-subtle hover:text-veyra-text hover:bg-white/5'
                  )}
                >
                  <LayoutDashboard className="w-3.5 h-3.5" />
                </button>
              )}
              {onOpenCalendar && (
                <button
                  type="button"
                  onClick={onOpenCalendar}
                  title="Calendario Completo"
                  className={cn(
                    'p-1 rounded transition-colors cursor-pointer',
                    isCalendarOpen && !isDashboardActive
                      ? 'bg-accent/15 text-accent'
                      : 'text-veyra-subtle hover:text-veyra-text hover:bg-white/5'
                  )}
                >
                  <Calendar className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

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
            onClick={() => handleSelectSection('notes')}
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
            onClick={() => handleSelectSection('agenda')}
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
          onOpenCalendar={onOpenCalendar}
          isCalendarOpen={isCalendarOpen}
          userId={userId}
        />
      ) : (
        <>
          {/* 2. Scrollable Middle Area: Vistas (icon-only) + Carpetas + Notas */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3.5">
            {/* Top Vistas + Animated Sticky Batch Action Bar wrapper (zero gap when collapsed) */}
            <div>
              {/* Compact Icon-Only VISTAS Row */}
              <div className="flex items-center justify-between p-1 bg-veyra-elevated/40 border border-veyra-border rounded-lg">
                <button
                  type="button"
                  onClick={() => {
                    exitSelectionMode();
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
                    exitSelectionMode();
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
                    exitSelectionMode();
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
                    exitSelectionMode();
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
                    exitSelectionMode();
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

              {/* Batch Action Bar (Smooth GPU accordion during Multi-Selection Mode) */}
              <div
                aria-hidden={!isSelectionMode}
                className={cn(
                  'sticky top-0 z-20 grid transition-[grid-template-rows,opacity,transform,margin] duration-250 ease-[cubic-bezier(0.16,1,0.3,1)]',
                  isSelectionMode
                    ? 'grid-rows-[1fr] opacity-100 translate-y-0 mt-3'
                    : 'grid-rows-[0fr] opacity-0 -translate-y-1.5 mt-0 pointer-events-none'
                )}
              >
                <div className="overflow-hidden">
                  <div className="p-2 rounded-lg bg-veyra-card/95 backdrop-blur-md border border-accent/40 shadow-md">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        key={totalSelectedCount}
                        className="text-[11px] font-semibold text-veyra-text truncate animate-veyra-count-pop"
                      >
                        {totalSelectedCount > 0
                          ? `${totalSelectedCount} ${totalSelectedCount === 1 ? 'seleccionado' : 'seleccionados'}`
                          : 'Selecciona carpetas o notas'}
                      </span>

                      <div className="flex items-center gap-1 shrink-0">
                        {activeView === 'trash' && (
                          <button
                            type="button"
                            disabled={selectedNoteIds.length === 0 || isBatchBusy}
                            onClick={handleBatchRestore}
                            title="Restaurar notas seleccionadas"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 transition-all duration-150 active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Restaurar</span>
                          </button>
                        )}

                        <ConfirmTooltip
                          title={
                            activeView === 'trash'
                              ? '¿Eliminar definitivamente?'
                              : '¿Eliminar selección?'
                          }
                          description={
                            activeView === 'trash'
                              ? `Se eliminarán permanentemente ${totalSelectedCount} notas.`
                              : `${selectedFolderIds.length > 0 ? `${selectedFolderIds.length} carpeta(s) ` : ''}${selectedFolderIds.length > 0 && selectedNoteIds.length > 0 ? 'y ' : ''}${selectedNoteIds.length > 0 ? `${selectedNoteIds.length} nota(s)` : ''}`
                          }
                          confirmText="Eliminar"
                          disabled={totalSelectedCount === 0 || isBatchBusy}
                          onConfirm={handleBatchDelete}
                        >
                          <button
                            type="button"
                            disabled={totalSelectedCount === 0 || isBatchBusy}
                            title="Eliminar seleccionados"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 transition-all duration-150 active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Eliminar</span>
                          </button>
                        </ConfirmTooltip>

                        <button
                          type="button"
                          onClick={exitSelectionMode}
                          title="Cancelar selección (Esc)"
                          className="p-1 rounded text-veyra-muted hover:text-veyra-text hover:bg-white/10 transition-colors active:scale-95 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* VIEW A: Single Unified File Explorer Tree */}
            {activeView === 'all' && (
              <div className="space-y-2">
                {/* Explorer Header */}
                <div className="flex items-center justify-between px-2 mb-1">
                  <span className="text-[10px] font-semibold text-veyra-subtle uppercase tracking-wider">
                    Explorador
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        isSelectionMode ? exitSelectionMode() : setIsSelectionMode(true)
                      }
                      title={
                        isSelectionMode
                          ? 'Salir de selección múltiple (Esc)'
                          : 'Seleccionar carpetas y notas (Ctrl+clic)'
                      }
                      className={cn(
                        'p-1 rounded transition-all cursor-pointer flex items-center justify-center',
                        isSelectionMode
                          ? 'text-accent bg-accent/15 hover:bg-accent/25'
                          : 'text-veyra-subtle hover:text-veyra-text hover:bg-white/5'
                      )}
                    >
                      <CheckSquare className="w-3.5 h-3.5" />
                    </button>
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
                      type="button"
                      onClick={() => {
                        setInlineSubfolderParentId(ROOT_INLINE_FOLDER);
                        setInlineSubfolderName('');
                        setInlineSubfolderColor('#60A5FA');
                        setIsColorPickerOpen(false);
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
                      if (draggedItem?.type === 'batch') {
                        const { noteIds, folderIds } = draggedItem;
                        setDraggedItem(null);
                        setDragOverTarget(null);
                        handleBatchMoveToFolder(null, { noteIds, folderIds });
                        return;
                      }
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
                      onDragLeave={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node | null) && dragOverTarget === 'root') {
                          setDragOverTarget(null);
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDragOverTarget(null);
                        if (draggedItem?.type === 'batch') {
                          const { noteIds, folderIds } = draggedItem;
                          setDraggedItem(null);
                          handleBatchMoveToFolder(null, { noteIds, folderIds });
                          return;
                        }
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

                  {/* Inline Root Folder Creator (no modal) */}
                  {inlineSubfolderParentId === ROOT_INLINE_FOLDER &&
                    renderInlineFolderCreator('Nombre de la carpeta...')}

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
                            {category.items.map(({ event, events: groupEvents, notes }) => {
                              const groupEventIds = new Set(groupEvents.map((g) => g.id));
                              const isEventExpanded = groupEvents.some((g) => !!expandedEvents[g.id]);
                              const eventColor = event.color || '#3B82F6';
                              const isEventDragOver = dragOverTarget === `event-${event.id}`;

                              return (
                                <div key={event.id} className="space-y-0.5">
                                  {/* Event Row (Drop target for notes, but NOT draggable) */}
                                  <div
                                    onDragOver={(e) => {
                                      if (!draggedItem) return;
                                      const canDropBatchNotes =
                                        draggedItem.type === 'batch' &&
                                        draggedItem.folderIds.length === 0 &&
                                        draggedItem.noteIds.length > 0;
                                      const canDropSingleNote =
                                        draggedItem.type === 'note' &&
                                        !groupEventIds.has(draggedItem.eventId || '');
                                      if (canDropBatchNotes || canDropSingleNote) {
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
                                      if (
                                        draggedItem?.type === 'batch' &&
                                        draggedItem.folderIds.length === 0 &&
                                        draggedItem.noteIds.length > 0
                                      ) {
                                        const noteIds = draggedItem.noteIds;
                                        setDraggedItem(null);
                                        handleBatchMoveNotesToEvent(event.id, event.title, noteIds);
                                        return;
                                      }
                                      if (
                                        draggedItem?.type === 'note' &&
                                        !groupEventIds.has(draggedItem.eventId || '')
                                      ) {
                                        onMoveNoteToEvent?.(draggedItem.id, event.id);
                                        setExpandedEvents((prev) => ({ ...prev, [event.id]: true }));
                                      }
                                      setDraggedItem(null);
                                    }}
                                    onClick={() =>
                                      setExpandedEvents((prev) => {
                                        const next = { ...prev };
                                        if (isEventExpanded) {
                                          for (const g of groupEvents) next[g.id] = false;
                                        } else {
                                          next[event.id] = true;
                                        }
                                        return next;
                                      })
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

            {/* VIEW B: Filtered Notes View */}
            {activeView !== 'all' && (
              <div>
                <div className="flex items-center justify-between px-2 mb-2">
                  <span className="text-[10px] font-semibold text-veyra-subtle uppercase tracking-wider truncate">
                    {activeView === 'favorites'
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

                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <button
                      type="button"
                      onClick={() =>
                        isSelectionMode ? exitSelectionMode() : setIsSelectionMode(true)
                      }
                      title={
                        isSelectionMode
                          ? 'Salir de selección múltiple (Esc)'
                          : 'Seleccionar notas (Ctrl+clic)'
                      }
                      className={cn(
                        'p-1 rounded transition-all cursor-pointer flex items-center justify-center',
                        isSelectionMode
                          ? 'text-accent bg-accent/15 hover:bg-accent/25'
                          : 'text-veyra-subtle hover:text-veyra-text hover:bg-white/5'
                      )}
                    >
                      <CheckSquare className="w-3.5 h-3.5" />
                    </button>

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
                      <span className="text-[10px] font-mono text-veyra-subtle lowercase shrink-0">
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
                </div>

                {/* Tags Pills Bar (Only in Tags view when tags exist) */}
                {activeView === 'tags' && allTags.length > 0 && (
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

      {/* Modal: Preferencias y Cuenta */}
      <UserSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        userId={userId}
        userEmail={userEmail}
        userName={userName}
        onSignOut={onSignOut}
      />

      {/* Modal: Compartir recurso */}
      {shareTarget && (
        <ShareModal
          isOpen={Boolean(shareTarget)}
          onClose={() => setShareTarget(null)}
          targetType={shareTarget.type}
          targetId={shareTarget.id}
          targetName={shareTarget.name}
          ownerId={shareTarget.ownerId}
          currentUserId={userId}
        />
      )}

      {/* Menú Contextual Personalizado (Diseño Flat, sin glass ni reflejos) */}
      {contextMenu.isOpen && contextMenu.target && (
        <div
          ref={contextMenuRef}
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          className="fixed z-50 min-w-[190px] p-1 bg-veyra-elevated border border-veyra-border rounded-md shadow-lg text-xs text-veyra-text select-none animate-veyra-scale-in"
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

              {/* Acceso rápido en Dashboard */}
              {(() => {
                const targetFolder = contextMenu.target.type === 'folder' ? contextMenu.target.folder : null;
                const isPinnedToDashboard = targetFolder
                  ? isItemInDashboardQuickAccess(
                      quickAccessItems,
                      { type: 'folder', id: targetFolder.id },
                      defaultQuickAccessFolderIds
                    )
                  : false;
                return (
                  <button
                    type="button"
                    onClick={() => {
                      closeContextMenu();
                      if (targetFolder) {
                        const res = toggleDashboardQuickAccessItem(
                          userId,
                          { type: 'folder', id: targetFolder.id },
                          defaultQuickAccessFolderIds
                        );
                        setQuickAccessItems(res.items);
                        toast.success(
                          res.added
                            ? `"${targetFolder.name}" añadido a accesos rápidos`
                            : `"${targetFolder.name}" quitado de accesos rápidos`
                        );
                      }
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-white/5 text-left transition-colors cursor-pointer"
                  >
                    <Pin
                      className={cn(
                        'w-3.5 h-3.5 shrink-0',
                        isPinnedToDashboard ? 'text-amber-400 fill-amber-400' : 'text-accent'
                      )}
                    />
                    <span>
                      {isPinnedToDashboard ? 'Quitar de accesos rápidos' : 'Mandar a acceso rápido'}
                    </span>
                  </button>
                );
              })()}

              {/* Compartir carpeta */}
              <button
                type="button"
                onClick={() => {
                  const targetFolder = contextMenu.target?.type === 'folder' ? contextMenu.target.folder : null;
                  closeContextMenu();
                  if (targetFolder) {
                    setShareTarget({
                      type: 'folder',
                      id: targetFolder.id,
                      name: targetFolder.name,
                      ownerId: targetFolder.user_id,
                    });
                  }
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-white/5 text-left transition-colors cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5 text-accent shrink-0" />
                <span>Compartir carpeta...</span>
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

              {/* Eliminar carpeta (confirmación en tooltip del menú) */}
              {!confirmDeleteFolderInMenu ? (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteFolderInMenu(true)}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-red-500/10 text-red-400 hover:text-red-300 text-left transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Eliminar carpeta</span>
                </button>
              ) : (
                <div className="p-2 rounded bg-red-500/10 border border-red-500/30 space-y-2 animate-veyra-inline-reveal">
                  <p className="text-[11px] text-red-200 leading-snug">
                    ¿Eliminar <strong className="text-white">&quot;{contextMenu.target.folder.name}&quot;</strong>? Sus notas se moverán a la raíz.
                  </p>
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteFolderInMenu(false)}
                      className="px-2 py-1 rounded text-[11px] text-veyra-muted hover:text-veyra-text hover:bg-white/10 transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const targetFolder =
                          contextMenu.target?.type === 'folder' ? contextMenu.target.folder : null;
                        closeContextMenu();
                        if (targetFolder) {
                          animateDeleteFolder(targetFolder.id);
                        }
                      }}
                      className="px-2.5 py-1 rounded text-[11px] font-semibold bg-rose-600 hover:bg-rose-700 text-white transition-colors cursor-pointer"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              )}
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

              {/* Compartir nota */}
              {activeView !== 'trash' && (
                <button
                  type="button"
                  onClick={() => {
                    const targetNote = contextMenu.target?.type === 'note' ? contextMenu.target.note : null;
                    closeContextMenu();
                    if (targetNote) {
                      setShareTarget({
                        type: 'note',
                        id: targetNote.id,
                        name: targetNote.title || 'Nota sin título',
                        ownerId: targetNote.user_id,
                      });
                    }
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-white/5 text-left transition-colors cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5 text-accent shrink-0" />
                  <span>Compartir nota...</span>
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
                        animateDeleteNote(targetNote.id, true);
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
                    if (targetNote) animateDeleteNote(targetNote.id, false);
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
              {(() => {
                const targetEvent = contextMenu.target.type === 'event' ? contextMenu.target.event : null;
                const isPinnedToDashboard = targetEvent
                  ? isItemInDashboardQuickAccess(
                      quickAccessItems,
                      { type: 'event', id: targetEvent.id },
                      defaultQuickAccessFolderIds
                    )
                  : false;
                return (
                  <button
                    type="button"
                    onClick={() => {
                      closeContextMenu();
                      if (targetEvent) {
                        const res = toggleDashboardQuickAccessItem(
                          userId,
                          { type: 'event', id: targetEvent.id },
                          defaultQuickAccessFolderIds
                        );
                        setQuickAccessItems(res.items);
                        toast.success(
                          res.added
                            ? `"${targetEvent.title}" añadido a accesos rápidos`
                            : `"${targetEvent.title}" quitado de accesos rápidos`
                        );
                      }
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-white/5 text-left transition-colors cursor-pointer"
                  >
                    <Pin
                      className={cn(
                        'w-3.5 h-3.5 shrink-0',
                        isPinnedToDashboard ? 'text-amber-400 fill-amber-400' : 'text-accent'
                      )}
                    />
                    <span>
                      {isPinnedToDashboard ? 'Quitar de accesos rápidos' : 'Mandar a acceso rápido'}
                    </span>
                  </button>
                );
              })()}
              <button
                type="button"
                onClick={() => {
                  const targetEvent = contextMenu.target?.type === 'event' ? contextMenu.target.event : null;
                  closeContextMenu();
                  if (targetEvent) {
                    setShareTarget({
                      type: 'event',
                      id: targetEvent.id,
                      name: targetEvent.title,
                      ownerId: targetEvent.user_id,
                    });
                  }
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-white/5 text-left transition-colors cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5 text-accent shrink-0" />
                <span>Compartir evento...</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* Stacked Floating Drag Preview following cursor during multi-item drag */}
      {draggedItem?.type === 'batch' &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={dragPreviewRef}
            className="fixed top-0 left-0 z-[99999] pointer-events-none select-none will-change-transform"
          >
            <div className="relative w-[210px] animate-veyra-drag-stack-in">
              {/* Back stacked cards */}
              {draggedItem.previewItems.slice(1, 3).map((stackItem, idx) => {
                const layer = idx + 1;
                return (
                  <div
                    key={`${stackItem.type}-${stackItem.id}`}
                    style={{
                      transform:
                        layer === 1
                          ? 'translate3d(4px, 5px, 0) rotate(2.5deg) scale(0.97)'
                          : 'translate3d(-3px, 10px, 0) rotate(-2.5deg) scale(0.94)',
                      zIndex: 10 - layer,
                    }}
                    className="absolute inset-0 rounded-xl bg-veyra-elevated border border-veyra-border/90 shadow-lg flex items-center gap-2 px-2.5 py-2 opacity-85"
                  >
                    {stackItem.type === 'folder' ? (
                      <FolderIcon
                        className="w-3.5 h-3.5 shrink-0"
                        style={{ color: stackItem.color || 'var(--accent-primary)' }}
                      />
                    ) : (
                      <FileText className="w-3.5 h-3.5 shrink-0 text-veyra-subtle" />
                    )}
                    <span className="truncate text-[11px] font-medium text-veyra-muted">
                      {stackItem.label}
                    </span>
                  </div>
                );
              })}

              {/* Front lead card */}
              {draggedItem.previewItems[0] && (
                <div className="relative z-20 rounded-xl bg-veyra-card border border-accent/65 px-2.5 py-2 shadow-2xl shadow-black/45 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center shrink-0">
                    {draggedItem.previewItems[0].type === 'folder' ? (
                      <FolderIcon
                        className="w-3.5 h-3.5 shrink-0"
                        style={{ color: draggedItem.previewItems[0].color || 'var(--accent-primary)' }}
                      />
                    ) : (
                      <FileText className="w-3.5 h-3.5 shrink-0 text-accent" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold text-veyra-text leading-tight">
                      {draggedItem.previewItems[0].label}
                    </div>
                    {draggedItem.noteIds.length + draggedItem.folderIds.length > 1 && (
                      <div className="text-[10px] text-veyra-muted leading-tight mt-0.5">
                        +{draggedItem.noteIds.length + draggedItem.folderIds.length - 1} más seleccionados
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Floating count badge */}
              <div className="absolute -top-2 -right-2 z-30 min-w-[22px] h-[22px] px-1.5 rounded-full bg-accent text-white text-[10.5px] font-bold flex items-center justify-center shadow-lg ring-2 ring-veyra-canvas">
                {draggedItem.noteIds.length + draggedItem.folderIds.length}
              </div>
            </div>
          </div>,
          document.body
        )}
    </aside>
  );
};
