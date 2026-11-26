import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import { findParentNode } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import { CollaborationCursor } from '../../lib/collaboration-cursor';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import { ImageNode } from './extensions/ImageNode';
import { FontFamily } from './extensions/FontFamily';
import { FontSize } from './extensions/FontSize';
import { CustomOrderedList } from './extensions/CustomOrderedList';
import { CustomCodeBlock } from './extensions/CustomCodeBlock';
import { MathBlock, MathInline } from './extensions/MathNode';
import {
  hasMathContent,
  hasMarkdownContent,
  convertMarkdownWithMathToHtml,
  cleanAiClipboardArtifacts,
  hydrateMathInHtml,
} from './extensions/mathUtils';
import { YoutubeNode, YT_REGEX } from '../../lib/tiptap-youtube-node';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { KeyboardClipboard } from './extensions/KeyboardClipboard';
import { toast } from 'sonner';
import * as Y from 'yjs';
import * as awarenessProtocol from 'y-protocols/awareness';
import { EditorBubbleMenu } from './EditorBubbleMenu';
import { EditorImageBubbleMenu } from './EditorImageBubbleMenu';
import { EditorTableBubbleMenu } from './EditorTableBubbleMenu';
import { EditorSlashMenu } from './EditorSlashMenu';
import { AIPrompt } from './extensions/AIPromptNode';
import { EditorListNumberTooltip } from './components/EditorListNumberTooltip';
import { BookmarkNode } from './extensions/BookmarkNode';
import { BookmarkPrompt } from './extensions/BookmarkPromptNode';
import { CustomLink } from './extensions/CustomLink';
import { EditorWordCount } from './components/EditorWordCount';
import {
  CustomTable,
  CustomTableRow,
  CustomTableHeader,
  CustomTableCell,
} from './extensions/TableExtensions';
import {
  ensureCompleteTableHtml,
  sanitizeTableHtml,
  isMarkdownTable,
  convertMarkdownTableToHtml,
  isTsvTable,
  convertTsvToHtml,
} from './utils/tableClipboardUtils';
import { A4PaginationExtension } from './pagination/a4PaginationExtension';
import { getLiveVirtualBreaks, isA4PaginationEnabled } from './pagination/a4PaginationPlugin';
import { calculateParagraphSplit } from './pagination/lineBreakMeasurer';
import type { A4VirtualBreakWidgetSpec } from './pagination/types';
import { AICommandExtension } from './extensions/AICommandExtension';
import { EditorToolbar } from './EditorToolbar';
import { CollabPresence } from './CollabPresence';
import {
  uploadFile,
  buildAttachmentUri,
  isVeyraAttachmentUri,
  openAttachmentInNewTab,
} from '../../lib/storage';
import {
  pickAndAttachFromGoogleDrive,
  humanizeDriveAttachError,
} from '../../lib/googleDrivePicker';
import { compressImage, isGif, ImageUploadError, humanizeUploadError } from '../../lib/image-pipeline';
import { YjsSupabaseProvider } from '../../lib/yjs-supabase-provider';
import {
  loadYjsNote,
  resolvePageFragmentName,
  yFragmentToHtml,
  type YjsLoadedNote,
} from '../../lib/yjs-loader';
import { cn } from '../../lib/utils';
import type { Note, CollabUser, Folder, NoteContentPaginated, NotePage } from '../../types/notes';
import type { CalendarEvent } from '../../hooks/useEvents';
import { getEventCategoryTag } from './NotesSidebar';
import { PanelLeft, X, Layers, GraduationCap, Folder as FolderIcon, Calendar, FileDown, FileText, ScrollText, Share2, Eye, MoreHorizontal, Check } from 'lucide-react';
import { useTheme } from '../../theme/ThemeProvider';
import { PagesSidebar, type PageMeta, type PageBlock } from './PagesSidebar';
import { ExportPdfModal } from './pdf/ExportPdfModal';
import { TemplatesModal } from './templates/TemplatesModal';
import { SaveTemplateModal } from './templates/SaveTemplateModal';
import { useTemplates } from './templates/useTemplates';
import { type NoteTemplate, type TemplateType } from './templates/templatesData';
import { DOMSerializer } from '@tiptap/pm/model';
import { HashtagInput } from '../../components/common/HashtagInput';
import { ShareModal } from '../../components/common/ShareModal';
import { CollaborationService, type ResourceUserRole } from '../../lib/collaborationService';
import {
  type A4HeaderFooterConfig,
  getEffectiveZoneHeightPx,
  loadA4HeaderFooterConfigForNote,
  normalizeA4HeaderFooterConfig,
  saveA4HeaderFooterConfigForNote,
} from './components/A4HeaderFooterTypes';
import {
  A4HeaderFooterRibbon,
  A4SheetHeaderFooterZones,
  createHeaderFooterImageFromFile,
  resolveSlotsKey,
} from './components/A4HeaderFooterOverlay';

export interface NoteEditorProps {
  note: Note | null;
  currentUserId: string;
  userEmail: string;
  userName?: string;
  onSaveNote: (
    id: string,
    updates: {
      title?: string;
      content?: string;
      htmlContent?: string;
      previewText?: string;
      folder_id?: string | null;
    }
  ) => Promise<void>;
  onRestoreNote?: (id: string) => void;
  onCloseNote?: () => void;
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  folders?: Folder[];
  events?: CalendarEvent[];
  onSelectFolder?: (folderId: string | null) => void;
  onSelectEvent?: (eventId: string) => void;
}

interface YjsActiveEditorProps {
  note: Note;
  ydoc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  initialActivePageId: string;
  initialPages: string[];
  initialMetaTitle: string;
  initialServerClock?: number;
  currentUserId: string;
  userEmail: string;
  userName?: string;
  onSaveNote: (
    id: string,
    updates: {
      title?: string;
      content?: string;
      htmlContent?: string;
      previewText?: string;
      folder_id?: string | null;
    }
  ) => Promise<void>;
  onRestoreNote?: (id: string) => void;
  onCloseNote?: () => void;
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  folders?: Folder[];
  events?: CalendarEvent[];
  onSelectFolder?: (folderId: string | null) => void;
  onSelectEvent?: (eventId: string) => void;
  entryMode?: 'open' | 'switch';
  isSwitchingNote?: boolean;
}

const YjsActiveEditor: React.FC<YjsActiveEditorProps> = ({
  note,
  ydoc,
  awareness,
  initialActivePageId,
  initialPages,
  initialMetaTitle,
  initialServerClock,
  currentUserId,
  userEmail,
  userName,
  onSaveNote,
  onRestoreNote,
  onCloseNote,
  isSidebarOpen,
  onToggleSidebar,
  folders,
  events,
  onSelectFolder,
  onSelectEvent,
  entryMode = 'open',
  isSwitchingNote = false,
}) => {
  const [activePageId, setActivePageId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      const pageParam = sp.get('page');
      if (pageParam) {
        const idx = parseInt(pageParam, 10) - 1;
        if (idx >= 0 && idx < initialPages.length) {
          return initialPages[idx];
        }
      }
    }
    return initialActivePageId;
  });
  const [pages, setPages] = useState<string[]>(() => Array.from(new Set(initialPages)));
  const [title, setTitle] = useState(initialMetaTitle || note.title || '');
  const [collabUsers, setCollabUsers] = useState<CollabUser[]>([]);
  const [syncStatus, setSyncStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [, setLastSavedAt] = useState<Date | null>(new Date());
  const [isPagesSidebarOpen, setIsPagesSidebarOpen] = useState(false);
  const [pageFormat, setPageFormat] = useState<'infinite' | 'a4'>(() => {
    // 1. Prioridad: Metadato Yjs de esta nota específica
    const metaFmt = ydoc.getMap('meta').get('pageFormat');
    if (metaFmt === 'a4' || metaFmt === 'infinite') {
      return metaFmt;
    }
    // 2. Prioridad: JSON serializado en note.content de esta nota
    if (note.content && note.content.startsWith('{')) {
      try {
        const parsed = JSON.parse(note.content);
        if (parsed.pageFormat === 'a4' || parsed.pageFormat === 'infinite') {
          return parsed.pageFormat;
        }
      } catch { }
    }
    // 3. Prioridad: Caché local individual por ID de nota, o preferencia por defecto del usuario
    if (typeof window !== 'undefined') {
      try {
        const perNote = localStorage.getItem(`veyra_note_page_format_${note.id}`);
        if (perNote === 'a4' || perNote === 'infinite') {
          return perNote;
        }
        return (localStorage.getItem('veyra_note_page_format') as 'infinite' | 'a4') || 'infinite';
      } catch {
        return 'infinite';
      }
    }
    return 'infinite';
  });
  const [initialPageFormat] = useState<'infinite' | 'a4'>(pageFormat);
  const [animPhase, setAnimPhase] = useState<'entering' | 'entered' | 'closing'>('entering');
  const [showSwitchWipeEdge, setShowSwitchWipeEdge] = useState(entryMode === 'switch');
  const isClosingRef = useRef(false);

  useEffect(() => {
    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setAnimPhase((prev) => (prev === 'entering' ? 'entered' : prev));
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, []);
  const pageFormatRef = useRef<'infinite' | 'a4'>(pageFormat);
  const docSheetRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [a4Scale, setA4Scale] = useState(1);
  const [a4SheetHeight, setA4SheetHeight] = useState(1123);
  const [isNarrowSheetViewport, setIsNarrowSheetViewport] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 860 : false
  );
  const [formatSwitchSeq, setFormatSwitchSeq] = useState(0);
  const [isFormatSwitching, setIsFormatSwitching] = useState(false);
  const prevPageFormatRef = useRef(pageFormat);
  const a4ScaleRef = useRef(1);
  a4ScaleRef.current = a4Scale;
  const a4StyleRef = useRef<HTMLStyleElement | null>(null);
  const [a4PageBreaks, setA4PageBreaks] = useState<number[]>([]);
  const lastBreaksStrRef = useRef<string>('');
  const [enableVirtualPagination, setEnableVirtualPagination] = useState<boolean>(true);
  const enableVirtualPaginationRef = useRef<boolean>(true);
  useEffect(() => {
    enableVirtualPaginationRef.current = enableVirtualPagination;
  }, [enableVirtualPagination]);
  const [a4SheetsMeta, setA4SheetsMeta] = useState<PageMeta[]>([]);
  const lastA4SheetsSignatureRef = useRef<string>('');
  const [activeA4SheetIndex, setActiveA4SheetIndex] = useState<number>(0);
  const [a4HeaderFooterConfig, setA4HeaderFooterConfig] = useState<A4HeaderFooterConfig>(() => {
    const metaHf = ydoc.getMap('meta').get('a4HeaderFooterConfig');
    if (metaHf && typeof metaHf === 'object') {
      return loadA4HeaderFooterConfigForNote(note.id, metaHf);
    }
    if (note.content && note.content.startsWith('{')) {
      try {
        const parsed = JSON.parse(note.content);
        if (parsed.a4HeaderFooterConfig && typeof parsed.a4HeaderFooterConfig === 'object') {
          return loadA4HeaderFooterConfigForNote(note.id, parsed.a4HeaderFooterConfig);
        }
      } catch { }
    }
    return loadA4HeaderFooterConfigForNote(note.id);
  });
  const a4HeaderFooterConfigRef = useRef<A4HeaderFooterConfig>(a4HeaderFooterConfig);
  const [activeHeaderFooterZone, setActiveHeaderFooterZone] = useState<'header' | 'footer' | null>(
    null
  );
  const [activeHeaderFooterSheetIdx, setActiveHeaderFooterSheetIdx] = useState<number>(0);
  const [activeHeaderFooterSlot, setActiveHeaderFooterSlot] = useState<'left' | 'center' | 'right'>(
    'left'
  );

  useEffect(() => {
    a4HeaderFooterConfigRef.current = a4HeaderFooterConfig;
  }, [a4HeaderFooterConfig]);

  useEffect(() => {
    if (pageFormat !== 'a4' && activeHeaderFooterZone !== null) {
      setActiveHeaderFooterZone(null);
    }
  }, [pageFormat, activeHeaderFooterZone]);

  useEffect(() => {
    if (!activeHeaderFooterZone) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveHeaderFooterZone(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeHeaderFooterZone]);

  const handleUpdateHeaderFooterConfig = useCallback(
    (next: A4HeaderFooterConfig) => {
      setA4HeaderFooterConfig(next);
      a4HeaderFooterConfigRef.current = next;
      saveA4HeaderFooterConfigForNote(note.id, next);
      try {
        ydoc.getMap('meta').set('a4HeaderFooterConfig', next);
      } catch { }
      triggerAutoSaveRef.current?.();
    },
    [note.id, ydoc]
  );

  const scrollToHeaderFooterZone = useCallback(
    (zone: 'header' | 'footer', sheetIdx: number) => {
      const container = scrollContainerRef.current;
      const sheet = docSheetRef.current;
      if (!container || !sheet) return;
      const scale = a4ScaleRef.current || 1;
      const stride = (1123 + 36) * scale;
      const zoneY =
        zone === 'header' ? sheetIdx * stride : sheetIdx * stride + (1123 - 180) * scale;
      const wrapperTop = (sheet.parentElement?.offsetTop ?? sheet.offsetTop);
      container.scrollTo({
        top: Math.max(0, wrapperTop + zoneY - 40),
        behavior: 'smooth',
      });
    },
    []
  );

  const handleSelectA4Sheet = useCallback((sheetIdx: number) => {
    setActiveA4SheetIndex(sheetIdx);
    const container = scrollContainerRef.current;
    const sheet = docSheetRef.current;
    if (!container || !sheet) return;
    const scale = a4ScaleRef.current || 1;
    const stride = (1123 + 36) * scale;
    const wrapperTop = (sheet.parentElement?.offsetTop ?? sheet.offsetTop);
    container.scrollTo({
      top: Math.max(0, wrapperTop + sheetIdx * stride - 24),
      behavior: 'smooth',
    });
  }, []);

  useEffect(() => {
    if (prevPageFormatRef.current === pageFormat) return;
    prevPageFormatRef.current = pageFormat;
    setIsFormatSwitching(true);
    setFormatSwitchSeq((s) => s + 1);
    const timer = window.setTimeout(() => {
      setIsFormatSwitching(false);
    }, 340);
    return () => window.clearTimeout(timer);
  }, [pageFormat]);

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    const sheet = docSheetRef.current;
    if (!container) return;

    const updateScaleAndHeight = () => {
      const horizontalPad = window.innerWidth < 640 ? 16 : 64;
      const availableW = Math.max(240, container.clientWidth - horizontalPad);
      const narrow = availableW < 794;
      setIsNarrowSheetViewport((prev) => (prev === narrow ? prev : narrow));

      if (pageFormat !== 'a4') {
        setA4Scale((prev) => (prev === 1 ? prev : 1));
        return;
      }

      const nextScale = narrow ? Math.max(0.25, availableW / 794) : 1;
      setA4Scale((prev) => (Math.abs(prev - nextScale) < 0.002 ? prev : nextScale));
      if (sheet) {
        const h = Math.max(1123, sheet.offsetHeight);
        setA4SheetHeight((prev) => (prev === h ? prev : h));
      }
    };

    updateScaleAndHeight();

    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => updateScaleAndHeight())
      : null;
    ro?.observe(container);
    if (sheet) ro?.observe(sheet);
    window.addEventListener('resize', updateScaleAndHeight);

    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', updateScaleAndHeight);
    };
  }, [pageFormat]);

  useEffect(() => {
    if (pageFormat !== 'a4') return;
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const sheet = docSheetRef.current;
      if (!sheet) return;
      const scale = a4ScaleRef.current || 1;
      const stride = (1123 + 36) * scale;
      const totalSheets = a4PageBreaks.length + 1;
      const wrapperTop = (sheet.parentElement?.offsetTop ?? sheet.offsetTop);
      const relativeScroll = Math.max(0, container.scrollTop - wrapperTop + 260 * scale);
      const currentSheet = Math.min(
        totalSheets - 1,
        Math.max(0, Math.floor(relativeScroll / stride))
      );
      setActiveA4SheetIndex((prev) => (prev === currentSheet ? prev : currentSheet));
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [pageFormat, a4PageBreaks.length]);

  useEffect(() => {
    pageFormatRef.current = pageFormat;
  }, [pageFormat]);

  const handleTogglePageFormat = useCallback(() => {
    const next: 'infinite' | 'a4' = pageFormatRef.current === 'a4' ? 'infinite' : 'a4';
    setPageFormat(next);
    pageFormatRef.current = next;
    try {
      ydoc.getMap('meta').set('pageFormat', next);
    } catch { }
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(`veyra_note_page_format_${note.id}`, next);
      } catch { }
    }
    triggerAutoSaveRef.current?.();
  }, [ydoc, note.id]);

  const pageHtmlCacheRef = useRef<Map<string, string>>(new Map());
  const activePageIdRef = useRef<string>(activePageId);
  const pagesRef = useRef<string[]>(pages);
  const titleRef = useRef<string>(title);
  const editorRef = useRef<any>(null);
  const noteRef = useRef(note);
  const onSaveNoteRef = useRef(onSaveNote);
  const saveDebounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef<boolean>(false);
  const pendingSaveRef = useRef<boolean>(false);
  const triggerAutoSaveRef = useRef<() => void>(() => { });

  const displayName = userName || userEmail.split('@')[0] || 'Usuario';
  const { palette, isPaperLight, isDark, isAmoled } = useTheme();
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [userRole, setUserRole] = useState<ResourceUserRole>(() =>
    note.user_id && currentUserId && note.user_id !== currentUserId ? 'editor' : 'owner'
  );

  // Responsive header tracking based on actual header container width
  const editorHeaderRef = useRef<HTMLDivElement>(null);
  const headerMenuBtnRef = useRef<HTMLButtonElement>(null);
  const headerMenuRef = useRef<HTMLDivElement>(null);
  const [headerWidth, setHeaderWidth] = useState<number>(1000);
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  const [headerMenuCoords, setHeaderMenuCoords] = useState<{ top: number; right: number }>({
    top: 0,
    right: 8,
  });

  useEffect(() => {
    const el = editorHeaderRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const w = Math.round(entry.contentRect.width);
      setHeaderWidth((prev) => (Math.abs(prev - w) >= 2 ? w : prev));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const showActionLabels = pageFormat === 'a4' ? headerWidth >= 820 : headerWidth >= 680;
  const isTightHeader = pageFormat === 'a4' ? headerWidth < 540 : headerWidth < 460;
  const showParentBreadcrumb = pageFormat === 'a4' ? headerWidth >= 720 : headerWidth >= 520;
  const showCompactBreadcrumbIconOnly = pageFormat === 'a4' && headerWidth < 480;
  const showHeaderExportShortcut = headerWidth >= 360;
  const showHeaderMenu = isTightHeader && isHeaderMenuOpen;

  const updateHeaderMenuPosition = useCallback(() => {
    if (!headerMenuBtnRef.current) return;
    const rect = headerMenuBtnRef.current.getBoundingClientRect();
    setHeaderMenuCoords({
      top: rect.bottom + 6,
      right: Math.max(8, window.innerWidth - rect.right),
    });
  }, []);

  useEffect(() => {
    if (!showHeaderMenu) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        headerMenuRef.current &&
        !headerMenuRef.current.contains(target) &&
        headerMenuBtnRef.current &&
        !headerMenuBtnRef.current.contains(target)
      ) {
        setIsHeaderMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsHeaderMenuOpen(false);
      }
    };

    const handleWindowChange = () => {
      updateHeaderMenuPosition();
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleWindowChange);
    window.addEventListener('scroll', handleWindowChange, true);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleWindowChange);
      window.removeEventListener('scroll', handleWindowChange, true);
    };
  }, [showHeaderMenu, updateHeaderMenuPosition]);

  useEffect(() => {
    let active = true;
    CollaborationService.getUserRoleForResource('note', note.id, note.user_id, currentUserId)
      .then((role) => {
        if (active) setUserRole(role);
      })
      .catch(() => { });
    return () => {
      active = false;
    };
  }, [note.id, note.user_id, currentUserId]);

  // Si loadYjsNote obtuvo un título más reciente (desde Supabase o Y.Doc meta) que aún no estaba en el listado de notas (Explorador), sincronizarlo de inmediato
  useEffect(() => {
    const resolvedTitle = (initialMetaTitle || '').trim();
    if (
      resolvedTitle &&
      resolvedTitle !== 'Nota sin título' &&
      (note.title || '').trim() !== resolvedTitle
    ) {
      onSaveNoteRef.current(note.id, { title: resolvedTitle });
    }
  }, [note.id, initialMetaTitle]);

  // Si llega una actualización por Realtime (postgres_changes) del título de la nota desde móvil, reflejarla en el documento abierto
  const prevNoteTitlePropRef = useRef<string | undefined>(note.title);
  useEffect(() => {
    if (prevNoteTitlePropRef.current === note.title) return;
    prevNoteTitlePropRef.current = note.title;
    const incomingTitle = (note.title || '').trim();
    if (
      incomingTitle &&
      incomingTitle !== 'Nota sin título' &&
      incomingTitle !== titleRef.current
    ) {
      setTitle(incomingTitle);
      titleRef.current = incomingTitle;
    }
  }, [note.title]);

  // Keep refs up to date
  useEffect(() => {
    activePageIdRef.current = activePageId;
  }, [activePageId]);

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  useEffect(() => {
    titleRef.current = title;
  }, [title]);

  useEffect(() => {
    noteRef.current = note;
  }, [note]);

  useEffect(() => {
    onSaveNoteRef.current = onSaveNote;
  }, [onSaveNote]);

  const currentUserIdRef = useRef<string | undefined>(currentUserId);
  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  const uploadNoteImageToPrivateStorage = useCallback(async (file: File | Blob): Promise<string> => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    let mimeType = (file.type?.toLowerCase() || '').replace('image/jpg', 'image/jpeg');
    if (!mimeType && 'name' in file && typeof (file as File).name === 'string') {
      const name = (file as File).name.toLowerCase();
      if (name.endsWith('.jpg') || name.endsWith('.jpeg')) mimeType = 'image/jpeg';
      else if (name.endsWith('.png')) mimeType = 'image/png';
      else if (name.endsWith('.webp')) mimeType = 'image/webp';
      else if (name.endsWith('.gif')) mimeType = 'image/gif';
    }
    if (!allowedMimes.includes(mimeType)) {
      throw new ImageUploadError('Formato no soportado. Usa JPG, PNG, WebP o GIF.', 'UNSUPPORTED_FORMAT');
    }

    const isAnimation = isGif(file) || mimeType === 'image/gif';
    const blobToUpload = isAnimation ? file : await compressImage(file);
    const filename = isAnimation ? `note_${Date.now()}.gif` : `note_${Date.now()}.webp`;
    const uploaded = await uploadFile(blobToUpload, 'note', noteRef.current.id, { filename });
    return uploaded.attachment_uri;
  }, []);

  const handleUploadImage = useCallback(async (file: File) => {
    try {
      const url = await uploadNoteImageToPrivateStorage(file);
      if (editorRef.current && !editorRef.current.isDestroyed) {
        editorRef.current
          .chain()
          .focus()
          .setImage({ src: url, textAlign: 'center' } as any)
          .updateAttributes('image', { textAlign: 'center' })
          .run();
      }
    } catch (err: any) {
      console.warn('[NoteEditor] Error subiendo imagen:', err);
      toast.error(humanizeUploadError(err));
    }
  }, [uploadNoteImageToPrivateStorage]);

  const [isAttachingDrive, setIsAttachingDrive] = useState(false);

  const handleAttachFromDrive = useCallback(async () => {
    if (isAttachingDrive) return;
    setIsAttachingDrive(true);
    try {
      const result = await pickAndAttachFromGoogleDrive('note', noteRef.current.id);
      if (result.cancelled) return;

      const currentEditor = editorRef.current;
      if (currentEditor && !currentEditor.isDestroyed) {
        const escapeHtml = (str: string) =>
          str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');

        for (const att of result.attachments) {
          const uri = buildAttachmentUri(att.id);
          if (att.mime_type?.toLowerCase().startsWith('image/')) {
            currentEditor
              .chain()
              .focus()
              .setImage({ src: uri, alt: att.name, textAlign: 'center' } as any)
              .updateAttributes('image', { textAlign: 'center' })
              .run();
          } else {
            const safeName = escapeHtml(att.name || 'Archivo de Google Drive');
            currentEditor
              .chain()
              .focus()
              .insertContent(
                `<p><a href="${uri}" title="${safeName}">📎 ${safeName} (Google Drive)</a></p>`,
              )
              .run();
          }
        }
      }

      if (result.attachments.length > 0) {
        toast.success(
          result.attachments.length === 1
            ? `Adjuntado desde Drive: ${result.attachments[0].name}`
            : `${result.attachments.length} archivos adjuntados desde Google Drive`,
        );
      }

      if (result.errors.length > 0) {
        const firstErr = result.errors[0];
        toast.warning(
          result.errors.length === 1
            ? humanizeDriveAttachError(firstErr)
            : `${result.errors.length} archivo(s) no se pudieron adjuntar: ${humanizeDriveAttachError(firstErr)}`,
        );
      }
    } catch (err: any) {
      console.warn('[NoteEditor] Error adjuntando desde Google Drive:', err);
      toast.error(err?.message || 'No se pudo adjuntar desde Google Drive.');
    } finally {
      setIsAttachingDrive(false);
    }
  }, [isAttachingDrive]);

  // Prepopulate page HTML cache from note.content on initial mount
  useEffect(() => {
    if (note.content && note.content.startsWith('{')) {
      try {
        const parsed = JSON.parse(note.content);
        if (Array.isArray(parsed.pages)) {
          for (const p of parsed.pages) {
            if (p.id && p.content) {
              pageHtmlCacheRef.current.set(p.id, p.content);
            }
          }
        }
      } catch (e) {
        console.warn('[NoteEditor] Failed to parse initial note.content:', e);
      }
    }
  }, [note.id, note.content]);

  // Serialize all pages to multi-page JSON format
  const serializeNoteContent = useCallback(() => {
    const currentEditor = editorRef.current;
    const currentActiveId = activePageIdRef.current;
    if (
      currentEditor &&
      !currentEditor.isDestroyed &&
      currentEditor.view &&
      currentActiveId
    ) {
      try {
        pageHtmlCacheRef.current.set(currentActiveId, currentEditor.getHTML());
      } catch {
        // editor view might be unmounting or destroyed
      }
    }

    const po = ydoc.getArray<string>('pageOrder');
    const order = po.toArray();
    const currentPages = order.length > 0 ? order : pagesRef.current;

    const pagesData: NotePage[] = currentPages.map((pid) => {
      let pageHtml = pageHtmlCacheRef.current.get(pid);
      if (!pageHtml) {
        try {
          const fragKey = resolvePageFragmentName(ydoc, pid);
          const frag = ydoc.getXmlFragment(fragKey);
          pageHtml = yFragmentToHtml(frag);
        } catch {
          pageHtml = '<p></p>';
        }
      }
      return {
        id: pid,
        content: hydrateMathInHtml(pageHtml || '<p></p>'),
      };
    });

    const paginated: NoteContentPaginated = {
      isPaginated: true,
      version: 2,
      layout: 'vertical',
      pageFormat: pageFormatRef.current,
      a4HeaderFooterConfig: a4HeaderFooterConfigRef.current,
      pages: pagesData,
    };

    let preview = noteRef.current.preview_text || '';
    if (currentEditor && !currentEditor.isDestroyed && currentEditor.view) {
      try {
        preview = currentEditor.getText().trim().slice(0, 150) || preview;
      } catch {
        // ignore
      }
    }

    return {
      content: JSON.stringify(paginated),
      previewText: preview,
    };
  }, [ydoc]);

  const [isExportPdfOpen, setIsExportPdfOpen] = useState(false);
  const [exportPdfPages, setExportPdfPages] = useState<NotePage[]>([]);
  const [isTemplatesModalOpen, setIsTemplatesModalOpen] = useState(false);
  const [isSaveTemplateModalOpen, setIsSaveTemplateModalOpen] = useState(false);
  const [templateContentToSave, setTemplateContentToSave] = useState('');
  const [templateTypeToSave, setTemplateTypeToSave] = useState<TemplateType>('block');

  const [showFormattingMarks, setShowFormattingMarks] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('veyra_show_formatting_marks') === 'true';
    }
    return false;
  });

  const handleToggleFormattingMarks = useCallback(() => {
    setShowFormattingMarks((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('veyra_show_formatting_marks', String(next));
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+( o Ctrl+Shift+8 (Mostrar marcas de formato)
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === '(' || (e.shiftKey && (e.key === '8' || e.code === 'Digit8')))
      ) {
        e.preventDefault();
        handleToggleFormattingMarks();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleToggleFormattingMarks]);

  const { allTemplates, saveCustomTemplate, deleteCustomTemplate } = useTemplates(currentUserId);

  const handleOpenSaveTemplate = useCallback(() => {
    const currentEditor = editorRef.current;
    if (!currentEditor || currentEditor.isDestroyed) return;

    const { state } = currentEditor;
    const { selection } = state;
    const tableParent = findParentNode((node) => node.type.name === 'table')(selection);

    if (tableParent) {
      const serializer = DOMSerializer.fromSchema(state.schema);
      const dom = serializer.serializeNode(tableParent.node);
      const div = document.createElement('div');
      div.appendChild(dom);
      setTemplateContentToSave(div.innerHTML);
      setTemplateTypeToSave('block');
    } else if (!selection.empty) {
      const slice = selection.content();
      const serializer = DOMSerializer.fromSchema(state.schema);
      const dom = serializer.serializeFragment(slice.content);
      const div = document.createElement('div');
      div.appendChild(dom);
      setTemplateContentToSave(div.innerHTML);
      setTemplateTypeToSave('block');
    } else {
      setTemplateContentToSave(currentEditor.getHTML());
      setTemplateTypeToSave('page');
    }

    setIsSaveTemplateModalOpen(true);
  }, []);

  const handleSelectTemplate = useCallback(
    (template: NoteTemplate, mode: 'insert' | 'replace' | 'append') => {
      const currentEditor = editorRef.current;
      if (!currentEditor || currentEditor.isDestroyed) return;

      const rawHtml = template.getContent({ userName });
      const contentHtml = sanitizeTableHtml(rawHtml);

      if (mode === 'replace') {
        currentEditor.chain().focus().setContent(contentHtml).run();
        toast.success(`Plantilla "${template.title}" aplicada a la página`);
      } else if (mode === 'append') {
        currentEditor.chain().focus('end').insertContent(`<p></p>${contentHtml}<p></p>`).run();
        toast.success(`Plantilla "${template.title}" añadida al final`);
      } else {
        // 'insert' en posición del cursor
        const { state } = currentEditor;
        const { selection } = state;
        const tableParent = findParentNode((node) => node.type.name === 'table')(selection);

        const isInsideTable = currentEditor.isActive('table') || !!tableParent;

        if (isInsideTable) {
          // Si el cursor está dentro de una tabla: evitar fusionar o incrustar celdas dentro
          const isTableEmpty = tableParent ? !tableParent.node.textContent.trim() : false;
          if (isTableEmpty) {
            // Eliminar la tabla vacía limpiamente con deleteTable() y colocar la plantilla
            currentEditor
              .chain()
              .focus()
              .deleteTable()
              .insertContent(contentHtml)
              .run();
          } else if (tableParent) {
            // Si la tabla actual tiene contenido, insertar la plantilla en un bloque limpio justo después
            const insertPos = tableParent.pos + tableParent.node.nodeSize;
            currentEditor
              .chain()
              .focus()
              .insertContentAt(insertPos, `<p></p>${contentHtml}<p></p>`)
              .run();
          } else {
            currentEditor.chain().focus('end').insertContent(`<p></p>${contentHtml}<p></p>`).run();
          }
        } else {
          currentEditor.chain().focus().insertContent(contentHtml).run();
        }
        toast.success(`Plantilla "${template.title}" insertada`);
      }

      setIsTemplatesModalOpen(false);
    },
    [userName]
  );

  const handleOpenExportPdf = useCallback(() => {
    const currentEditor = editorRef.current;
    const currentActiveId = activePageIdRef.current;
    if (
      currentEditor &&
      !currentEditor.isDestroyed &&
      currentEditor.view &&
      currentActiveId
    ) {
      try {
        pageHtmlCacheRef.current.set(currentActiveId, currentEditor.getHTML());
      } catch {
        // ignore
      }
    }

    const po = ydoc.getArray<string>('pageOrder');
    const order = po.toArray();
    const currentPages = order.length > 0 ? order : pagesRef.current;

    const pagesData: NotePage[] = currentPages.map((pid) => {
      let pageHtml = pageHtmlCacheRef.current.get(pid);
      if (!pageHtml) {
        try {
          const fragKey = resolvePageFragmentName(ydoc, pid);
          const frag = ydoc.getXmlFragment(fragKey);
          pageHtml = yFragmentToHtml(frag);
        } catch {
          pageHtml = '<p></p>';
        }
      }
      return {
        id: pid,
        content: hydrateMathInHtml(pageHtml || '<p></p>'),
      };
    });

    setExportPdfPages(pagesData);
    setIsExportPdfOpen(true);
  }, [ydoc]);

  const lastCollabNotifyRef = useRef<number>(0);

  const performSave = useCallback(async () => {
    if (userRole === 'viewer') return;
    if (isSavingRef.current) {
      pendingSaveRef.current = true;
      return;
    }
    isSavingRef.current = true;
    setSaveStatus('saving');
    try {
      const { content, previewText } = serializeNoteContent();
      const currentTitle = titleRef.current || noteRef.current.title || 'Nota sin título';
      await onSaveNoteRef.current(noteRef.current.id, {
        title: currentTitle,
        content,
        previewText,
      });
      setSaveStatus('saved');
      setLastSavedAt(new Date());

      const now = Date.now();
      if (now - lastCollabNotifyRef.current > 60000) {
        lastCollabNotifyRef.current = now;
        CollaborationService.notifyChange({
          targetType: 'note',
          targetId: noteRef.current.id,
          action: 'edited',
          itemTitle: currentTitle,
        }).catch(() => { });
      }
    } catch (err) {
      console.error('[NoteEditor] Auto-save error:', err);
      setSaveStatus('error');
    } finally {
      isSavingRef.current = false;
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false;
        performSave();
      }
    }
  }, [serializeNoteContent, userRole]);

  const triggerAutoSave = useCallback(() => {
    setSaveStatus('saving');
    if (saveDebounceTimeoutRef.current) {
      clearTimeout(saveDebounceTimeoutRef.current);
    }
    saveDebounceTimeoutRef.current = setTimeout(() => {
      performSave();
    }, 400);
  }, [performSave]);

  useEffect(() => {
    triggerAutoSaveRef.current = triggerAutoSave;
  }, [triggerAutoSave]);

  // Flush save on unmount so returning to events or other views saves immediately
  useEffect(() => {
    return () => {
      if (saveDebounceTimeoutRef.current) {
        clearTimeout(saveDebounceTimeoutRef.current);
      }
      try {
        const { content, previewText } = serializeNoteContent();
        const currentTitle = titleRef.current || noteRef.current.title || 'Nota sin título';
        onSaveNoteRef.current(noteRef.current.id, {
          title: currentTitle,
          content,
          previewText,
        });
      } catch (err) {
        console.error('[NoteEditor] Error saving on unmount:', err);
      }
    };
  }, [serializeNoteContent]);

  const handleClose = async () => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    setAnimPhase('closing');

    if (saveDebounceTimeoutRef.current) {
      clearTimeout(saveDebounceTimeoutRef.current);
    }

    // Permitir que el navegador pinte el primer frame de salida antes del guardado síncrono
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });

    const animationWait = new Promise<void>((resolve) => {
      window.setTimeout(resolve, 310);
    });

    const savePromise = (async () => {
      try {
        const { content, previewText } = serializeNoteContent();
        const currentTitle = titleRef.current || noteRef.current.title || 'Nota sin título';
        await onSaveNoteRef.current(noteRef.current.id, {
          title: currentTitle,
          content,
          previewText,
        });
      } catch (err) {
        console.error('[NoteEditor] Error saving on close:', err);
      }
    })();

    await Promise.all([savePromise, animationWait]);
    onCloseNote?.();
  };

  const providerRef = useRef<YjsSupabaseProvider | null>(null);

  // Keep local user metadata synchronized in Awareness
  useEffect(() => {
    awareness.setLocalStateField('user', {
      id: currentUserId,
      userId: currentUserId,
      name: `${displayName} • PC`,
      color: palette.primary,
      isEditing: true,
    });
  }, [awareness, currentUserId, displayName, palette.primary]);

  // Connect Supabase Realtime Provider asynchronously in useEffect
  useEffect(() => {
    const provider = new YjsSupabaseProvider({
      noteId: note.id,
      doc: ydoc,
      awareness,
      syncMode: note.sync_mode,
      initialServerClock,
      currentUser: {
        id: currentUserId,
        email: userEmail,
        name: displayName,
        color: palette.primary,
      },
      onAwarenessChange: (users) => {
        setCollabUsers(users);
      },
      onStatusChange: (status) => {
        setSyncStatus(status);
        if (status === 'connected') {
          setLastSavedAt(new Date());
        }
      },
    });

    providerRef.current = provider;

    console.log('[AWARENESS-INSTANCE-CHECK]', {
      providerAwarenessClientID: provider.awareness.clientID,
      editorAwarenessClientID: awareness.clientID,
      sameInstance: provider.awareness === awareness,
      localState: awareness.getLocalState(),
      hasUser: Boolean(awareness.getLocalState()?.user),
      hasCursor: Boolean(awareness.getLocalState()?.cursor),
    });

    return () => {
      providerRef.current = null;
      provider.destroy();
    };
  }, [note.id, note.sync_mode, ydoc, awareness, currentUserId, userEmail, displayName, palette.primary]);

  // Synchronize pages array from Y.Doc pageOrder
  useEffect(() => {
    const po = ydoc.getArray<string>('pageOrder');
    const updatePages = () => {
      const current = po.toArray();
      if (current.length > 0) {
        const unique = Array.from(new Set(current));
        if (unique.length !== current.length) {
          console.warn(`🧹 [NoteEditor] Corrigiendo duplicados en pageOrder (${current.length} -> ${unique.length})`);
          try {
            ydoc.transact(() => {
              while (po.length > 0) {
                po.delete(0, 1);
              }
              po.insert(0, unique);
            }, 'dedup-page-order');
          } catch (_) { }
        }
        setPages(unique);
        pagesRef.current = unique;
        triggerAutoSaveRef.current?.();
        if (typeof window !== 'undefined') {
          const sp = new URLSearchParams(window.location.search);
          const pageParam = sp.get('page');
          if (pageParam) {
            const idx = parseInt(pageParam, 10) - 1;
            if (idx >= 0 && idx < unique.length) {
              setActivePageId(unique[idx]);
              activePageIdRef.current = unique[idx];
            }
          }
        }
      }
    };
    po.observe(updatePages);
    return () => {
      po.unobserve(updatePages);
    };
  }, [ydoc]);

  // Synchronize active page on browser Back / Forward (popstate)
  useEffect(() => {
    const handlePopState = () => {
      if (typeof window === 'undefined') return;
      const sp = new URLSearchParams(window.location.search);
      const pageParam = sp.get('page');
      if (pageParam) {
        const idx = parseInt(pageParam, 10) - 1;
        if (idx >= 0 && idx < pages.length && pages[idx] !== activePageId) {
          setActivePageId(pages[idx]);
        }
      } else if (pages.length > 0 && activePageId !== pages[0]) {
        setActivePageId(pages[0]);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [pages, activePageId]);

  // Listen to remote changes to meta map (title & pageFormat)
  useEffect(() => {
    const metaMap = ydoc.getMap('meta');
    const handleMetaChange = () => {
      const remoteTitle = metaMap.get('title') as string | undefined;
      if (remoteTitle !== undefined && remoteTitle !== titleRef.current) {
        setTitle(remoteTitle);
        titleRef.current = remoteTitle;
        if (remoteTitle.trim() && (noteRef.current.title || '').trim() !== remoteTitle.trim()) {
          onSaveNoteRef.current(noteRef.current.id, { title: remoteTitle });
        }
      }
      const remoteFormat = metaMap.get('pageFormat') as 'infinite' | 'a4' | undefined;
      if (
        (remoteFormat === 'a4' || remoteFormat === 'infinite') &&
        remoteFormat !== pageFormatRef.current
      ) {
        setPageFormat(remoteFormat);
        pageFormatRef.current = remoteFormat;
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem(`veyra_note_page_format_${note.id}`, remoteFormat);
          } catch { }
        }
      }
      const remoteHf = metaMap.get('a4HeaderFooterConfig') as A4HeaderFooterConfig | undefined;
      if (remoteHf && typeof remoteHf === 'object') {
        const normalized = normalizeA4HeaderFooterConfig(remoteHf);
        if (JSON.stringify(normalized) !== JSON.stringify(a4HeaderFooterConfigRef.current)) {
          setA4HeaderFooterConfig(normalized);
          a4HeaderFooterConfigRef.current = normalized;
          saveA4HeaderFooterConfigForNote(note.id, normalized);
        }
      }
    };
    metaMap.observe(handleMetaChange);

    return () => {
      metaMap.unobserve(handleMetaChange);
      if (saveDebounceTimeoutRef.current) clearTimeout(saveDebounceTimeoutRef.current);
    };
  }, [ydoc, note.id]);

  // Compute resolved fragment name for current active page
  const fragmentName = resolvePageFragmentName(ydoc, activePageId);

  // Initialize Tiptap with official Yjs Collaboration + CollaborationCursor extensions
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          undoRedo: false, // Collaboration extension handles collaborative history
          heading: { levels: [1, 2, 3] },
          orderedList: false,
          codeBlock: false,
        }),
        CustomOrderedList,
        CustomCodeBlock,
        Collaboration.configure({
          document: ydoc,
          field: fragmentName,
        }),
        CollaborationCursor.configure({
          provider: { awareness },
          user: {
            id: currentUserId,
            userId: currentUserId,
            name: `${displayName} • PC`,
            color: palette.primary,
            isEditing: true,
          },
        }),
        TaskList,
        TaskItem.configure({
          nested: true,
        }),
        Highlight.configure({ multicolor: true }),
        Placeholder.configure({
          placeholder: 'Escribe algo o usa "/" para ver comandos...',
        }),
        ImageNode,
        YoutubeNode,
        CustomTable,
        CustomTableRow,
        CustomTableHeader,
        CustomTableCell,
        TextAlign.configure({
          types: ['heading', 'paragraph', 'image', 'tableCell', 'tableHeader'],
          alignments: ['left', 'center', 'right', 'justify'],
        }),
        TextStyle,
        Color,
        FontFamily,
        FontSize,
        MathBlock,
        MathInline,
        KeyboardClipboard,
        CustomLink,
        BookmarkNode,
        BookmarkPrompt,
        AIPrompt,
        AICommandExtension,
        A4PaginationExtension.configure({ enabled: true }),
      ],
      editorProps: {
        attributes: {
          class:
            'prose dark:prose-invert max-w-none focus:outline-none min-h-[400px] p-0 text-veyra-text text-[14px] leading-[1.7]',
        },
        handlePaste: (_view, event) => {
          const html = event.clipboardData?.getData('text/html') || '';
          const plainText = event.clipboardData?.getData('text/plain') || '';
          const gifMatch = html.match(/<img[^>]+src=["']([^"']+\.gif(?:\?[^"']*)?)["']/i);
          const items = Array.from(event.clipboardData?.items || []);
          const fallbackImageFile = items.find((i) => i.type.startsWith('image/'))?.getAsFile();

          if (gifMatch && !gifMatch[1].startsWith('data:')) {
            const gifUrl = gifMatch[1];
            event.preventDefault();
            toast.promise(
              fetch(gifUrl)
                .then((r) => {
                  if (!r.ok) throw new Error('HTTP ' + r.status);
                  return r.blob();
                })
                .then(async (blob) => {
                  if (blob.type !== 'image/gif') throw new Error('No es GIF');
                  const file = new File([blob], 'pasted.gif', { type: 'image/gif' });
                  return uploadNoteImageToPrivateStorage(file);
                })
                .then((url) => {
                  editorRef.current
                    ?.chain()
                    .focus()
                    .setImage({ src: url, textAlign: 'center' } as any)
                    .updateAttributes('image', { textAlign: 'center' })
                    .run();
                  return 'GIF animado insertado';
                })
                .catch(async (fetchErr) => {
                  // Fallback Opción B: Si falla la descarga del GIF por CORS/red, insertar el frame estático
                  if (fallbackImageFile) {
                    try {
                      const fallbackUrl = await uploadNoteImageToPrivateStorage(fallbackImageFile);
                      editorRef.current
                        ?.chain()
                        .focus()
                        .setImage({ src: fallbackUrl, textAlign: 'center' } as any)
                        .updateAttributes('image', { textAlign: 'center' })
                        .run();
                      throw new Error('Restricción CORS en la web de origen: se insertó la imagen estática.');
                    } catch (uploadErr: any) {
                      throw new Error(uploadErr?.message || 'No se pudo insertar la imagen.');
                    }
                  }
                  throw fetchErr;
                }),
              {
                loading: 'Descargando GIF...',
                success: (msg) => msg,
                error: (err: any) => err?.message || 'No se pudo descargar el GIF. Prueba arrastrándolo directamente.',
              }
            );
            return true;
          }

          // Si el portapapeles contiene una imagen única en HTML (ej. copiada dentro de Veyra)
          const singleImageMatch = html.trim().match(/^<img[^>]+src=["']((?:https?:\/\/|veyra-attachment:\/\/)[^"']+)["'][^>]*\/?>(?:<\/img>)?$/i);
          if (singleImageMatch && singleImageMatch[1]) {
            const src = singleImageMatch[1];
            event.preventDefault();
            const currentEditor = (_view as any).editor || editorRef.current;
            if (currentEditor && !currentEditor.isDestroyed) {
              currentEditor
                .chain()
                .focus()
                .setImage({ src, textAlign: 'center' } as any)
                .updateAttributes('image', { textAlign: 'center' })
                .run();
              toast.success('Imagen pegada');
            }
            return true;
          }

          // Solo procesar como imagen pura si NO hay texto plano relevante en el portapapeles.
          // Esto evita interceptar textos copiados desde Word, Excel, Teams, Slack o navegadores
          // que adjuntan miniaturas/snapshots de imagen además del texto regular.
          const hasSignificantText = plainText.trim().length > 0;
          if (!hasSignificantText) {
            for (const item of items) {
              if (item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (file) {
                  event.preventDefault();
                  const mime = file.type.toLowerCase();
                  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mime)) {
                    toast.error('Formato no soportado. Usa JPG, PNG, WebP o GIF.');
                    return true;
                  }
                  uploadNoteImageToPrivateStorage(file)
                    .then((url) => {
                      if (editorRef.current && !editorRef.current.isDestroyed) {
                        editorRef.current
                          .chain()
                          .focus()
                          .setImage({ src: url, textAlign: 'center' } as any)
                          .updateAttributes('image', { textAlign: 'center' })
                          .run();
                      }
                    })
                    .catch((err: any) => {
                      console.warn('[NoteEditor] Error subiendo imagen pegada:', err);
                      toast.error(humanizeUploadError(err));
                    });
                  return true;
                }
              }
            }
          }

          const currentEditor = (_view as any).editor || editorRef.current;

          // 1. Detección y manejo prioritario de tablas en HTML
          const hasRichHtmlBlocks = /<(?:table|thead|tbody|tr|td|th)[^>]*>/i.test(html);
          if (hasRichHtmlBlocks && currentEditor && !currentEditor.isDestroyed) {
            // Si el cursor está actualmente dentro de una tabla existente, permitimos que
            // prosemirror-tables maneje de forma nativa el mapeo de celdas pegadas.
            if (!currentEditor.isActive('table')) {
              // Si el cursor está fuera de una tabla, insertamos la tabla como un bloque completo cerrado
              event.preventDefault();
              const cleanedTableHtml = ensureCompleteTableHtml(html);
              currentEditor.commands.insertContent(cleanedTableHtml);
              return true;
            }
            return false;
          }

          // Detección y transformación automática de Markdown y fórmulas matemáticas LaTeX ($$ y $)
          const cleanedText = cleanAiClipboardArtifacts(plainText);

          // 2. Detección de tablas en texto plano (Markdown o TSV copiado de hojas de cálculo)
          if ((!html || !hasRichHtmlBlocks) && currentEditor && !currentEditor.isDestroyed) {
            if (isMarkdownTable(cleanedText)) {
              event.preventDefault();
              const tableHtml = convertMarkdownTableToHtml(cleanedText);
              currentEditor.commands.insertContent(tableHtml);
              return true;
            }
            if (isTsvTable(cleanedText)) {
              event.preventDefault();
              const tableHtml = convertTsvToHtml(cleanedText);
              currentEditor.commands.insertContent(tableHtml);
              return true;
            }
          }

          const isMath = hasMathContent(cleanedText);
          const isMarkdown = hasMarkdownContent(cleanedText);

          // Si contiene estructuras Markdown explícitas (títulos #, listas, tareas, bloques de código, etc.)
          // o fórmulas matemáticas, priorizamos la conversión limpia de Markdown para respetar los saltos
          // de línea y títulos en bloques independientes.
          const hasExplicitMarkdownBlocks = /^(?:#{1,6}\s*\S+|[-*+]\s+\[[ xX]\]|[-*+]\s+\S+|\d+\.\s+\S+|>+\s+\S+|```)/m.test(cleanedText);
          const shouldProcessMarkdownOrMath =
            !hasRichHtmlBlocks &&
            (isMath || hasExplicitMarkdownBlocks || (isMarkdown && !html));

          if (shouldProcessMarkdownOrMath && currentEditor && !currentEditor.isDestroyed) {
            event.preventDefault();
            const formattedHtml = convertMarkdownWithMathToHtml(cleanedText);
            currentEditor.commands.insertContent(formattedHtml);
            return true;
          }

          const trimmedPlain = plainText.trim();

          // Si es un enlace de YouTube, insertamos directamente el reproductor interactivo embebido
          const ytMatch = trimmedPlain.match(YT_REGEX);
          if (ytMatch && ytMatch[1] && !html.includes('<img')) {
            event.preventDefault();
            const currentEditor = (_view as any).editor || editorRef.current;
            if (currentEditor && !currentEditor.isDestroyed) {
              currentEditor
                .chain()
                .focus()
                .setYoutube({ videoId: ytMatch[1], embed: true })
                .run();
              return true;
            }
          }

          // Si es una URL web solitaria y válida (que no sea YouTube ya capturado arriba),
          // insertamos de inmediato la tarjeta de enlace con esqueleto animado (0ms) y cargamos metadatos en segundo plano.
          const isSingleUrl = /^https?:\/\/[^\s$.?#].[^\s]*$/i.test(trimmedPlain) && !trimmedPlain.includes('\n');
          if (isSingleUrl && !html.includes('<img')) {
            event.preventDefault();
            const currentEditor = (_view as any).editor || editorRef.current;
            if (currentEditor && !currentEditor.isDestroyed) {
              let domain = trimmedPlain;
              let favicon = '';
              try {
                const parsed = new URL(trimmedPlain);
                domain = parsed.hostname.replace(/^www\./, '');
                favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
              } catch { }

              currentEditor.commands.insertContent({
                type: 'bookmark',
                attrs: {
                  url: trimmedPlain,
                  title: domain,
                  domain,
                  favicon,
                  description: '',
                  image: null,
                  isLoading: true,
                },
              });
              return true;
            }
          }

          return false;
        },
        handleDrop: (_view, event) => {
          const files = Array.from(event.dataTransfer?.files || []);
          const imageFile = files.find((f) => f.type.startsWith('image/'));
          if (imageFile) {
            event.preventDefault();
            const mime = imageFile.type.toLowerCase();
            if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mime)) {
              toast.error('Formato no soportado. Usa JPG, PNG, WebP o GIF.');
              return true;
            }
            uploadNoteImageToPrivateStorage(imageFile)
              .then((url) => {
                if (editorRef.current && !editorRef.current.isDestroyed) {
                  editorRef.current
                    .chain()
                    .focus()
                    .setImage({ src: url, textAlign: 'center' } as any)
                    .updateAttributes('image', { textAlign: 'center' })
                    .run();
                }
              })
              .catch((err: any) => {
                console.warn('[NoteEditor] Error subiendo imagen soltada:', err);
                toast.error(humanizeUploadError(err));
              });
            return true;
          }
          return false;
        },
      },
      onUpdate: ({ editor: updatedEditor }) => {
        editorRef.current = updatedEditor;
        if (
          activePageIdRef.current &&
          !updatedEditor.isDestroyed &&
          updatedEditor.view
        ) {
          try {
            pageHtmlCacheRef.current.set(activePageIdRef.current, updatedEditor.getHTML());
          } catch {
            // ignore
          }
        }
        triggerAutoSaveRef.current?.();
        setLastSavedAt(new Date());
      },
    },
    [note.id, activePageId, fragmentName, awareness]
  );

  // Keep editorRef in sync and log instance verification once editor is ready
  useEffect(() => {
    editorRef.current = editor;
    if (editor && !editor.isDestroyed) {
      const canEdit = userRole !== 'viewer';
      if (editor.isEditable !== canEdit) {
        editor.setEditable(canEdit);
      }
    }
    if (editor && !editor.isDestroyed && providerRef.current) {
      console.log('[AWARENESS-INSTANCE-CHECK]', {
        providerAwarenessClientID: providerRef.current.awareness.clientID,
        editorAwarenessClientID: awareness.clientID,
        sameInstance: providerRef.current.awareness === awareness,
        localState: awareness.getLocalState(),
        hasUser: Boolean(awareness.getLocalState()?.user),
        hasCursor: Boolean(awareness.getLocalState()?.cursor),
      });
    }
  }, [editor, userRole, awareness]);

  useEffect(() => {
    if (editor && !editor.isDestroyed && editor.storage.image) {
      editor.storage.image.currentUserId = currentUserId || null;
      editor.storage.image.noteId = note.id;
    }
  }, [editor, currentUserId, note.id]);

  // Paginación A4 con verificación en tiempo real sobre el DOM y empuje vía CSS externo (:nth-child)
  useEffect(() => {
    const sheetEl = docSheetRef.current;
    if (!sheetEl || pageFormat !== 'a4') {
      if (sheetEl) {
        sheetEl.style.minHeight = '';
      }
      if (a4StyleRef.current) {
        a4StyleRef.current.textContent = '';
      }
      if (lastBreaksStrRef.current !== '') {
        lastBreaksStrRef.current = '';
        setA4PageBreaks([]);
      }
      if (editor) {
        const liveBreaks = getLiveVirtualBreaks(editor.state);
        if (liveBreaks.length > 0) {
          editor.commands.setA4VirtualBreaks([]);
        }
      }
      return;
    }

    const A4_HEIGHT_PX = 1123;
    const PAGE_GAP_PX = 36;
    const STRIDE = A4_HEIGHT_PX + PAGE_GAP_PX;
    let isCalculating = false;
    let lastSettledW = 0;
    let lastSettledH = 0;
    let lastSettledPmH = 0;

    interface BreakableItem {
      topEl: HTMLElement;
      bottomEl: HTMLElement;
      targetEl: HTMLElement;
      selector: string;
      prop: 'margin-top' | 'padding-top';
      isHeadingOrLead: boolean;
    }

    const collectListItems = (
      listEl: HTMLElement,
      listSelector: string,
      isTopLevelList: boolean,
      out: BreakableItem[]
    ) => {
      const children = Array.from(listEl.children) as HTMLElement[];
      for (let idx = 0; idx < children.length; idx++) {
        const li = children[idx];
        if (li.tagName.toLowerCase() !== 'li') continue;
        const j = idx + 1;
        const liSelector = `${listSelector} > :nth-child(${j})`;
        const pushListInstead = isTopLevelList && j === 1;
        const selector = pushListInstead ? listSelector : liSelector;
        const targetEl = pushListInstead ? listEl : li;

        const liChildren = Array.from(li.children) as HTMLElement[];
        const nestedLists: Array<{ el: HTMLElement; childIdx: number }> = [];
        let firstContentEl: HTMLElement | null = null;

        for (let cIdx = 0; cIdx < liChildren.length; cIdx++) {
          const c = liChildren[cIdx];
          const cTag = c.tagName.toLowerCase();
          if (cTag === 'ul' || cTag === 'ol') {
            nestedLists.push({ el: c, childIdx: cIdx + 1 });
          } else if (!firstContentEl) {
            firstContentEl = c;
          }
        }

        if (nestedLists.length > 0) {
          const measureEl = firstContentEl || li;
          out.push({
            topEl: measureEl,
            bottomEl: measureEl,
            targetEl,
            selector,
            prop: 'margin-top',
            isHeadingOrLead: true,
          });
          for (const nl of nestedLists) {
            collectListItems(nl.el, `${liSelector} > :nth-child(${nl.childIdx})`, false, out);
          }
        } else {
          const text = (li.textContent || '').trim();
          const isLeadBullet = text.endsWith(':') && text.length < 95;
          out.push({
            topEl: li,
            bottomEl: li,
            targetEl,
            selector,
            prop: 'margin-top',
            isHeadingOrLead: isLeadBullet,
          });
        }
      }
    };

    const calculateBreaks = (triggeredByEditorUpdate = false) => {
      if (isCalculating || !docSheetRef.current || !a4StyleRef.current) return;
      isCalculating = true;
      try {
        const sheet = docSheetRef.current;
        const styleEl = a4StyleRef.current;
        const scrollEl = scrollContainerRef.current;
        const savedScrollTop = scrollEl ? scrollEl.scrollTop : null;

        // Mantener altura mínima temporalmente ANTES de limpiar estilos para evitar saltos de scroll
        const prevSheetH = sheet.offsetHeight;
        sheet.style.minHeight = `${Math.max(A4_HEIGHT_PX, prevSheetH)}px`;

        // 1. Limpiar reglas previas PRIMERO para que no queden márgenes antiguos atrapados
        styleEl.textContent = '';

        const baseMarginVPx = 95; // 2,5 cm estándar A4
        const marginTopPx = Math.max(
          48,
          getEffectiveZoneHeightPx(a4HeaderFooterConfig, 'header') || baseMarginVPx
        );
        const marginBottomPx = Math.max(
          48,
          getEffectiveZoneHeightPx(a4HeaderFooterConfig, 'footer') || baseMarginVPx
        );
        const pm = sheet.querySelector('.ProseMirror') as HTMLElement | null;

        const basePaddingRule =
          marginTopPx !== 95 || marginBottomPx !== 95
            ? `div.a4-page-mode { padding-top: ${marginTopPx}px !important; padding-bottom: ${marginBottomPx}px !important; }`
            : '';

        if (!pm || pm.children.length === 0) {
          styleEl.textContent = basePaddingRule;
          sheet.style.minHeight = `${A4_HEIGHT_PX}px`;
          if (lastBreaksStrRef.current !== '') {
            lastBreaksStrRef.current = '';
            setA4PageBreaks([]);
          }
          if (editor) {
            const liveBreaks = getLiveVirtualBreaks(editor.state);
            if (liveBreaks.length > 0) {
              editor.commands.setA4VirtualBreaks([]);
            }
            if (isA4PaginationEnabled(editor.state)) {
              editor.commands.setA4PaginationEnabled(false);
            }
          }
          const emptySig = 'empty-1';
          if (lastA4SheetsSignatureRef.current !== emptySig) {
            lastA4SheetsSignatureRef.current = emptySig;
            setA4SheetsMeta([
              {
                id: 'a4-sheet-0',
                index: 0,
                title: 'Hoja 1',
                snippet: 'Sin contenido...',
                blocks: [],
                paragraphCount: 0,
                wordCount: 0,
                bulletCount: 0,
                taskCount: 0,
                badgeText: 'Hoja vacía',
              },
            ]);
          }
          return;
        }

        styleEl.textContent = basePaddingRule;

        const items: BreakableItem[] = [];
        const pmChildren = Array.from(pm.children) as HTMLElement[];
        const rules: string[] = basePaddingRule ? [basePaddingRule] : [];
        const breaks: number[] = [];
        const virtualBreaks: A4VirtualBreakWidgetSpec[] = [];
        let currentPage = 0;

        let isMeasuringApplied = false;
        if (pm) {
          pm.classList.add('a4-measuring');
          isMeasuringApplied = true;
        }

        try {
          for (let i = 1; i <= pmChildren.length; i++) {
            const child = pmChildren[i - 1];
            const tag = child.tagName.toLowerCase();
            const childSelector = `div.a4-page-mode div.ProseMirror > :nth-child(${i})`;

            if (tag === 'ul' || tag === 'ol') {
              collectListItems(child, childSelector, true, items);
              continue;
            }

            if (child.classList.contains('tableWrapper')) {
              const rows = Array.from(child.querySelectorAll('tr')) as HTMLElement[];
              if (rows.length > 0) {
                for (let rIdx = 0; rIdx < rows.length; rIdx++) {
                  const row = rows[rIdx];
                  const parentEl = row.parentElement;
                  const parentTag = parentEl ? parentEl.tagName.toLowerCase() : 'tbody';
                  const nthRow = parentEl
                    ? Array.from(parentEl.children).indexOf(row) + 1
                    : rIdx + 1;
                  const rowH = row.getBoundingClientRect().height / (sheet.offsetWidth > 0 ? (sheet.getBoundingClientRect().width / sheet.offsetWidth) || 1 : 1);
                  const isHeaderRow =
                    row.querySelector('th') !== null ||
                    (rowH < 56 && row.querySelector('strong, b') !== null);

                  if (rIdx === 0) {
                    items.push({
                      topEl: row,
                      bottomEl: row,
                      targetEl: child,
                      selector: childSelector,
                      prop: 'margin-top',
                      isHeadingOrLead: isHeaderRow,
                    });
                  } else {
                    const firstCell = (row.querySelector('td, th') as HTMLElement) || row;
                    const cellContent =
                      (firstCell.firstElementChild as HTMLElement) || firstCell;
                    const rowCellsSelector = `${childSelector} ${parentTag} > tr:nth-child(${nthRow}) > td, ${childSelector} ${parentTag} > tr:nth-child(${nthRow}) > th`;
                    items.push({
                      topEl: cellContent,
                      bottomEl: row,
                      targetEl: firstCell,
                      selector: rowCellsSelector,
                      prop: 'padding-top',
                      isHeadingOrLead: isHeaderRow,
                    });
                  }
                }
                continue;
              }
            }

            const text = (child.textContent || '').trim();
            const isHeading =
              /^h[1-6]$/.test(tag) ||
              (tag === 'p' &&
                text.endsWith(':') &&
                text.length < 95 &&
                child.querySelector('strong, b') !== null);

            items.push({
              topEl: child,
              bottomEl: child,
              targetEl: child,
              selector: childSelector,
              prop: 'margin-top',
              isHeadingOrLead: isHeading,
            });
          }

          const getVisualScale = () =>
            sheet.offsetWidth > 0
              ? sheet.getBoundingClientRect().width / sheet.offsetWidth || 1
              : 1;

          const applyPushToTarget = (target: BreakableItem, desiredTop: number) => {
            const vScale = getVisualScale();
            const sRect = sheet.getBoundingClientRect();
            const tRect = target.topEl.getBoundingClientRect();
            const currentTop = (tRect.top - sRect.top) / vScale;
            const cs = window.getComputedStyle(target.targetEl);
            const baseVal =
              parseFloat(target.prop === 'margin-top' ? cs.marginTop : cs.paddingTop) || 0;
            let neededVal = Math.max(0, Math.round(baseVal + (desiredTop - currentTop)));

            const extraRule =
              target.prop === 'padding-top' ? ' vertical-align: top !important;' : '';
            const ruleIndex = rules.length;
            rules.push(
              `${target.selector} { ${target.prop}: ${neededVal}px !important;${extraRule} }`
            );
            styleEl.textContent = rules.join('\n');

            // Verificar posición real en el DOM tras aplicar la regla (compensa colapso de márgenes CSS)
            const vSheetRect = sheet.getBoundingClientRect();
            const vTopRect = target.topEl.getBoundingClientRect();
            const actualTop = (vTopRect.top - vSheetRect.top) / vScale;
            const diff = Math.round(desiredTop - actualTop);
            if (Math.abs(diff) > 1) {
              neededVal = Math.max(0, neededVal + diff);
              rules[ruleIndex] =
                `${target.selector} { ${target.prop}: ${neededVal}px !important;${extraRule} }`;
              styleEl.textContent = rules.join('\n');
            }
          };

          for (let k = 0; k < items.length; k++) {
            const item = items[k];
            const vScale = getVisualScale();
            let sheetRect = sheet.getBoundingClientRect();
            let itemTop = (item.topEl.getBoundingClientRect().top - sheetRect.top) / vScale;
            let itemBottom = (item.bottomEl.getBoundingClientRect().bottom - sheetRect.top) / vScale;

            const totalVirtualSpacersHeight = enableVirtualPaginationRef.current
              ? virtualBreaks.reduce((sum, b) => sum + b.spacerHeight, 0)
              : 0;
            const renderedItemTop = itemTop + totalVirtualSpacersHeight;
            const renderedItemBottom = itemBottom + totalVirtualSpacersHeight;

            let minPrintableY = currentPage * STRIDE + marginTopPx;
            let maxPrintableY = currentPage * STRIDE + A4_HEIGHT_PX - marginBottomPx;

            // Si un bloque anterior avanzó de página sin empujar a este, asegurar que empiece en minPrintableY
            if (currentPage > 0 && renderedItemTop < minPrintableY - 2) {
              applyPushToTarget(item, minPrintableY - totalVirtualSpacersHeight);
              sheetRect = sheet.getBoundingClientRect();
              itemTop = (item.topEl.getBoundingClientRect().top - sheetRect.top) / vScale;
              itemBottom = (item.bottomEl.getBoundingClientRect().bottom - sheetRect.top) / vScale;
            }

            if (renderedItemBottom > maxPrintableY) {
              const targetTag = item.targetEl.tagName.toLowerCase();
              const splittableEl: HTMLElement | null =
                targetTag === 'p'
                  ? item.targetEl
                  : targetTag === 'li' && !item.targetEl.querySelector('ul, ol')
                    ? ((item.targetEl.querySelector(':scope > p') as HTMLElement | null) || item.targetEl)
                    : targetTag === 'blockquote'
                      ? ((item.targetEl.querySelector(':scope > p:last-of-type') as HTMLElement | null) || item.targetEl)
                      : null;

              // Intentar dividir visualmente párrafos extensos (incluidos párrafos en listas o citas)
              // antes de retroceder un título previo: si caben >= 2 líneas en la hoja actual, el título no queda huérfano.
              if (
                enableVirtualPaginationRef.current &&
                editor &&
                splittableEl &&
                !item.isHeadingOrLead
              ) {
                const splitResult = calculateParagraphSplit(
                  splittableEl,
                  sheetRect.top,
                  STRIDE,
                  marginTopPx,
                  marginBottomPx,
                  currentPage,
                  editor.view,
                  totalVirtualSpacersHeight
                );

                const cands =
                  splitResult.candidates && splitResult.candidates.length > 0
                    ? splitResult.candidates
                    : splitResult.candidate
                      ? [splitResult.candidate]
                      : [];

                if (cands.length > 0) {
                  for (const cand of cands) {
                    virtualBreaks.push({
                      pos: cand.pos,
                      spacerHeight: cand.spacerHeight,
                      sheetIndex: cand.sheetIndex,
                      key: `vbreak-${cand.sheetIndex}-${cand.pos}`,
                    });
                    const breakY = cand.sheetIndex * STRIDE + A4_HEIGHT_PX;
                    breaks.push(breakY);
                  }
                  currentPage += cands.length;
                  minPrintableY = currentPage * STRIDE + marginTopPx;
                  maxPrintableY = currentPage * STRIDE + A4_HEIGHT_PX - marginBottomPx;
                  continue;
                }

                // Si todas las líneas medidas caben en la hoja actual (p. ej. solo sobresale el half-leading inferior),
                // no empujar el párrafo completo a la siguiente hoja.
                if (!splitResult.shouldPushWholeBlock) {
                  continue;
                }
              }

              // Retroceder si el bloque anterior es un título o encabezado que quedaría huérfano al final de la hoja
              let pushIdx = k;
              while (pushIdx > 0 && items[pushIdx - 1].isHeadingOrLead) {
                const prevTop =
                  items[pushIdx - 1].topEl.getBoundingClientRect().top -
                  sheetRect.top +
                  totalVirtualSpacersHeight;
                const orphanThreshold = enableVirtualPaginationRef.current
                  ? maxPrintableY - 96
                  : minPrintableY + 28;
                if (prevTop > orphanThreshold) {
                  pushIdx -= 1;
                } else {
                  break;
                }
              }

              const target = items[pushIdx];
              const targetTop =
                target.topEl.getBoundingClientRect().top -
                sheetRect.top +
                totalVirtualSpacersHeight;

              if (targetTop > minPrintableY + 14) {
                const breakY = currentPage * STRIDE + A4_HEIGHT_PX;
                breaks.push(breakY);
                currentPage += 1;

                const desiredTop = currentPage * STRIDE + marginTopPx;
                applyPushToTarget(target, desiredTop - totalVirtualSpacersHeight);

                sheetRect = sheet.getBoundingClientRect();
                itemBottom = item.bottomEl.getBoundingClientRect().bottom - sheetRect.top;
                minPrintableY = currentPage * STRIDE + marginTopPx;
                maxPrintableY = currentPage * STRIDE + A4_HEIGHT_PX - marginBottomPx;
              }

              // Si el elemento por sí solo sigue superando la página actual, avanzar las páginas necesarias
              while (
                itemBottom + totalVirtualSpacersHeight >
                currentPage * STRIDE + A4_HEIGHT_PX - marginBottomPx
              ) {
                const breakY = currentPage * STRIDE + A4_HEIGHT_PX;
                breaks.push(breakY);
                currentPage += 1;
              }
            }
          }
        } finally {
          if (isMeasuringApplied && pm) {
            pm.classList.remove('a4-measuring');
          }
        }

        const totalMinHeight = (currentPage + 1) * A4_HEIGHT_PX + currentPage * PAGE_GAP_PX;
        sheet.style.minHeight = `${totalMinHeight}px`;

        const nextBreaksStr = breaks.join(',');
        if (lastBreaksStrRef.current !== nextBreaksStr) {
          lastBreaksStrRef.current = nextBreaksStr;
          setA4PageBreaks(breaks);
        }

        if (enableVirtualPaginationRef.current && editor) {
          if (!isA4PaginationEnabled(editor.state)) {
            editor.commands.setA4PaginationEnabled(true);
          }
          const liveBreaks = getLiveVirtualBreaks(editor.state);
          const liveSig = liveBreaks
            .map((b) => `${b.sheetIndex}:${b.pos}:${b.spacerHeight}`)
            .join(',');
          const nextVBreaksSig = virtualBreaks
            .map((b) => `${b.sheetIndex}:${b.pos}:${b.spacerHeight}`)
            .join(',');
          if (liveSig !== nextVBreaksSig) {
            editor.commands.setA4VirtualBreaks(virtualBreaks);
          }
        } else if (!enableVirtualPaginationRef.current && editor) {
          const liveBreaks = getLiveVirtualBreaks(editor.state);
          if (liveBreaks.length > 0) {
            editor.commands.setA4VirtualBreaks([]);
          }
        }

        // Restaurar scrollTop tras el ciclo de medición y asegurar visibilidad del cursor solo si el usuario editó
        if (scrollEl && savedScrollTop !== null && Math.abs(scrollEl.scrollTop - savedScrollTop) > 0.5) {
          scrollEl.scrollTop = savedScrollTop;
        }
        if (
          triggeredByEditorUpdate &&
          scrollEl &&
          editor &&
          !editor.isDestroyed &&
          editor.isFocused &&
          editor.state.selection.empty
        ) {
          try {
            const coords = editor.view.coordsAtPos(editor.state.selection.head);
            const cRect = scrollEl.getBoundingClientRect();
            const pad = 28;
            if (coords.bottom > cRect.bottom - pad) {
              scrollEl.scrollTop += Math.ceil(coords.bottom - (cRect.bottom - 56));
            } else if (coords.top < cRect.top + pad) {
              scrollEl.scrollTop -= Math.ceil(cRect.top + 56 - coords.top);
            }
          } catch {
            // Ignorar si la posición aún no tiene coordenadas en el DOM
          }
        }

        lastSettledW = sheet.offsetWidth;
        lastSettledH = sheet.offsetHeight;
        lastSettledPmH = pm.offsetHeight;

        // Construir metadatos reales por cada Hoja A4 física según la posición DOM final de cada bloque
        const totalSheets = currentPage + 1;
        const finalSheetRect = sheet.getBoundingClientRect();
        const buckets = Array.from({ length: totalSheets }, () => ({
          blocks: [] as PageBlock[],
          headingTitle: '',
          allTexts: [] as string[],
          htmlParts: [] as string[],
          stats: {
            words: 0,
            paragraphs: 0,
            bullets: 0,
            tasks: 0,
            headings: 0,
            tables: 0,
            images: 0,
          },
        }));

        const getElSheetIdx = (el: HTMLElement) => {
          const top = Math.max(0, el.getBoundingClientRect().top - finalSheetRect.top);
          return Math.min(totalSheets - 1, Math.max(0, Math.floor(top / STRIDE)));
        };

        for (let i = 0; i < pmChildren.length; i++) {
          const child = pmChildren[i];
          const tag = child.tagName.toLowerCase();

          if (tag === 'ul' || tag === 'ol') {
            const isTaskList = child.getAttribute('data-type') === 'taskList';
            const lis = Array.from(child.querySelectorAll('li')) as HTMLElement[];
            const lisBySheet = new Map<number, string[]>();
            for (let j = 0; j < lis.length; j++) {
              const li = lis[j];
              const sIdx = getElSheetIdx(li);
              if (!lisBySheet.has(sIdx)) lisBySheet.set(sIdx, []);
              lisBySheet.get(sIdx)!.push(li.outerHTML);

              const clone = li.cloneNode(true) as HTMLElement;
              clone.querySelectorAll('ul, ol').forEach((n) => n.remove());
              const liText = (clone.textContent || '').trim();
              if (!liText) continue;

              const isTask = isTaskList || li.getAttribute('data-type') === 'taskItem';
              if (isTask) {
                const checked =
                  li.getAttribute('data-checked') === 'true' ||
                  Boolean((li.querySelector('input[type="checkbox"]') as HTMLInputElement)?.checked);
                buckets[sIdx].blocks.push({
                  id: `${i}-${j}`,
                  type: 'task',
                  text: liText,
                  checked,
                });
                buckets[sIdx].stats.tasks++;
              } else {
                buckets[sIdx].blocks.push({
                  id: `${i}-${j}`,
                  type: 'bullet',
                  text: liText,
                });
                buckets[sIdx].stats.bullets++;
              }
              buckets[sIdx].allTexts.push(liText);
            }
            lisBySheet.forEach((liHtmls, sIdx) => {
              const attrs = Array.from(child.attributes)
                .map((a) => `${a.name}="${a.value}"`)
                .join(' ');
              buckets[sIdx].htmlParts.push(`<${tag} ${attrs}>${liHtmls.join('')}</${tag}>`);
            });
            continue;
          }

          if (child.classList.contains('tableWrapper') || tag === 'table') {
            const rows = Array.from(child.querySelectorAll('tr')) as HTMLElement[];
            const touchedSheets = new Set<number>();
            if (rows.length > 0) {
              const rowsBySheet = new Map<number, string[]>();
              for (const row of rows) {
                const sIdx = getElSheetIdx(row);
                touchedSheets.add(sIdx);
                if (!rowsBySheet.has(sIdx)) rowsBySheet.set(sIdx, []);
                rowsBySheet.get(sIdx)!.push(row.outerHTML);
                const rowText = (row.textContent || '').trim();
                if (rowText) buckets[sIdx].allTexts.push(rowText);
              }
              rowsBySheet.forEach((rowHtmls, sIdx) => {
                buckets[sIdx].htmlParts.push(
                  `<div class="tableWrapper"><table class="border-collapse table-auto w-full"><tbody>${rowHtmls.join('')}</tbody></table></div>`
                );
              });
            } else {
              const sIdx = getElSheetIdx(child);
              touchedSheets.add(sIdx);
              buckets[sIdx].htmlParts.push(child.outerHTML);
            }
            touchedSheets.forEach((sIdx) => {
              buckets[sIdx].blocks.push({
                id: `table-${i}-${sIdx}`,
                type: 'table',
                text: 'Tabla',
              });
              buckets[sIdx].stats.tables++;
            });
            continue;
          }

          const sIdx = getElSheetIdx(child);
          buckets[sIdx].htmlParts.push(child.outerHTML);
          const text = (child.textContent || '').trim();

          if (child.querySelector('img') || tag === 'img') {
            buckets[sIdx].blocks.push({
              id: `img-${i}`,
              type: 'image',
              text: 'Imagen',
            });
            buckets[sIdx].stats.images++;
            continue;
          }

          if (child.querySelector('iframe')) {
            buckets[sIdx].blocks.push({
              id: `yt-${i}`,
              type: 'youtube',
              text: 'Video de YouTube',
            });
            continue;
          }

          if (tag === 'pre') {
            if (text) {
              buckets[sIdx].blocks.push({
                id: `code-${i}`,
                type: 'code',
                text,
              });
              buckets[sIdx].allTexts.push(text);
            }
            continue;
          }

          if (tag === 'blockquote') {
            if (text) {
              buckets[sIdx].blocks.push({
                id: `quote-${i}`,
                type: 'quote',
                text,
              });
              buckets[sIdx].allTexts.push(text);
            }
            continue;
          }

          const isHeading =
            /^h[1-6]$/.test(tag) ||
            (tag === 'p' &&
              text.endsWith(':') &&
              text.length < 95 &&
              child.querySelector('strong, b') !== null);

          if (isHeading && text) {
            buckets[sIdx].blocks.push({
              id: `h-${i}`,
              type: 'heading',
              text,
            });
            if (!buckets[sIdx].headingTitle) {
              buckets[sIdx].headingTitle = text.replace(/:$/, '');
            }
            buckets[sIdx].allTexts.push(text);
            buckets[sIdx].stats.headings++;
          } else if (text) {
            buckets[sIdx].blocks.push({
              id: `p-${i}`,
              type: 'paragraph',
              text,
            });
            buckets[sIdx].allTexts.push(text);
            buckets[sIdx].stats.paragraphs++;
          }
        }

        const nextA4Sheets: PageMeta[] = buckets.map((b, idx) => {
          const plainText = b.allTexts.join(' ');
          const words = plainText ? plainText.split(/\s+/).filter(Boolean).length : 0;
          b.stats.words = words;

          let badgeText = 'Hoja vacía';
          if (b.stats.tasks > 0) {
            badgeText = `${b.stats.tasks} ${b.stats.tasks === 1 ? 'tarea' : 'tareas'}`;
          } else if (b.stats.bullets > 0) {
            badgeText = `${b.stats.bullets} ${b.stats.bullets === 1 ? 'punto' : 'puntos'}`;
          } else if (b.stats.tables > 0) {
            badgeText = `${b.stats.tables} ${b.stats.tables === 1 ? 'tabla' : 'tablas'}`;
          } else if (words > 0) {
            const pCount = b.stats.paragraphs || b.stats.headings || 1;
            const pLabel = pCount === 1 ? 'párrafo' : 'párrafos';
            const wLabel = words === 1 ? 'palabra' : 'pal';
            badgeText = `${pCount} ${pLabel} · ${words} ${wLabel}`;
          }

          const snippet =
            plainText.length > 25 ? plainText.slice(0, 25) + '...' : plainText || 'Sin contenido...';

          return {
            id: `a4-sheet-${idx}`,
            index: idx,
            title: b.headingTitle || `Hoja ${idx + 1}`,
            snippet,
            blocks: b.blocks,
            paragraphCount: b.stats.paragraphs,
            wordCount: words,
            bulletCount: b.stats.bullets,
            taskCount: b.stats.tasks,
            badgeText,
            html: b.htmlParts.join(''),
          };
        });

        const sig = nextA4Sheets
          .map((s) => `${s.id}:${s.title}:${s.badgeText}:${s.blocks.length}:${s.snippet}:${s.html?.length || 0}`)
          .join('|');
        if (lastA4SheetsSignatureRef.current !== sig) {
          lastA4SheetsSignatureRef.current = sig;
          setA4SheetsMeta(nextA4Sheets);
        }
      } finally {
        isCalculating = false;
      }
    };

    let rafId: number | null = null;
    let pendingFromEditorUpdate = false;
    const scheduleCalculate = (fromEditorUpdate = false) => {
      if (fromEditorUpdate) {
        pendingFromEditorUpdate = true;
      }
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const triggered = pendingFromEditorUpdate;
        pendingFromEditorUpdate = false;
        calculateBreaks(triggered);
      });
    };

    const handleEditorUpdate = () => scheduleCalculate(true);

    calculateBreaks(false);

    const pmEl = sheetEl.querySelector('.ProseMirror') as HTMLElement | null;
    const ro = new ResizeObserver(() => {
      if (
        sheetEl.offsetWidth === lastSettledW &&
        sheetEl.offsetHeight === lastSettledH &&
        (!pmEl || pmEl.offsetHeight === lastSettledPmH)
      ) {
        return;
      }
      scheduleCalculate(false);
    });
    ro.observe(sheetEl);
    if (pmEl) ro.observe(pmEl);

    if (editor) {
      editor.on('update', handleEditorUpdate);
    }

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      ro.disconnect();
      if (editor) {
        editor.off('update', handleEditorUpdate);
      }
    };
  }, [pageFormat, activePageId, editor, a4HeaderFooterConfig]);

  // Toggle de desarrollo para activar/desactivar la paginación virtual experimental
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__veyra_enable_virtual_pagination = (val = true) => {
        setEnableVirtualPagination(val);
        enableVirtualPaginationRef.current = val;
        if (editor) {
          editor.commands.setA4PaginationEnabled(val);
        }
        console.log('[A4-PAGINATION] Modo experimental virtual:', val);
      };
    }
  }, [editor]);

  // Handle Title changes: updates Yjs meta map + debounced sync to notes table
  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    titleRef.current = newTitle;
    const metaMap = ydoc.getMap('meta');
    metaMap.set('title', newTitle);
    triggerAutoSave();
  };

  const handleSelectPage = (pageId: string, explicitPageIndex?: number) => {
    if (
      editorRef.current &&
      !editorRef.current.isDestroyed &&
      editorRef.current.view &&
      activePageIdRef.current
    ) {
      try {
        pageHtmlCacheRef.current.set(activePageIdRef.current, editorRef.current.getHTML());
      } catch {
        // ignore
      }
    }
    setActivePageId(pageId);
    activePageIdRef.current = pageId;
    triggerAutoSave();
    if (typeof window !== 'undefined') {
      const idx = explicitPageIndex !== undefined ? explicitPageIndex : pages.indexOf(pageId) + 1;
      const url = new URL(window.location.href);
      if (idx > 1) {
        url.searchParams.set('page', String(idx));
      } else {
        url.searchParams.delete('page');
      }
      window.history.pushState({ type: 'note', noteId: note.id, page: idx }, '', url.toString());
    }
  };

  // Add new page to note
  const handleAddPage = () => {
    const newPageId = crypto.randomUUID();
    pageHtmlCacheRef.current.set(newPageId, '<p></p>');
    const po = ydoc.getArray<string>('pageOrder');
    po.push([newPageId]);
    handleSelectPage(newPageId, po.toArray().length);
    triggerAutoSave();
  };

  // Breadcrumb de Ubicación Unificado (Jerarquía de Carpeta / Evento - Opción B)
  const breadcrumb = useMemo(() => {
    const linkedEvent = events?.find(
      (e) => e.id === note.event_id || (note.id && e.note_id === note.id)
    );
    const linkedFolder = folders?.find((f) => f.id === note.folder_id);
    const parentFolder = linkedFolder?.parent_id
      ? folders?.find((f) => f.id === linkedFolder.parent_id)
      : null;

    if (!linkedEvent && !linkedFolder) return null;

    // Detectar si la carpeta y el evento tienen el mismo nombre
    const isSameName =
      Boolean(linkedFolder && linkedEvent) &&
      linkedFolder!.name.trim().toLowerCase() === linkedEvent!.title.trim().toLowerCase();

    // Etiqueta/categoría del evento
    let categoryName: string | null = null;
    if (linkedEvent) {
      categoryName = getEventCategoryTag(linkedEvent);
    }

    if (linkedEvent) {
      let parentLabel: string | null = null;
      let parentIconType: 'folder' | 'graduation' = 'folder';
      let parentColor: string | undefined = undefined;
      let parentFolderId: string | null = null;

      if (parentFolder) {
        parentLabel = parentFolder.name;
        parentColor = parentFolder.color || undefined;
        parentFolderId = parentFolder.id;
      } else if (linkedFolder && !isSameName) {
        parentLabel = linkedFolder.name;
        parentColor = linkedFolder.color || undefined;
        parentFolderId = linkedFolder.id;
      } else if (categoryName && categoryName !== 'Eventos') {
        parentLabel = categoryName;
        parentIconType = 'graduation';
      }

      return {
        type: 'event' as const,
        parentLabel,
        parentIconType,
        parentColor,
        parentFolderId,
        eventTitle: linkedEvent.title,
        eventColor: linkedEvent.color || '#3B82F6',
        eventId: linkedEvent.id,
      };
    }

    return {
      type: 'folder' as const,
      parentLabel: parentFolder?.name || null,
      parentColor: parentFolder?.color || undefined,
      parentFolderId: parentFolder?.id || null,
      folderName: linkedFolder!.name,
      folderColor: linkedFolder!.color || undefined,
      folderId: linkedFolder!.id,
    };
  }, [note.event_id, note.folder_id, note.id, events, folders]);

  return (
    <div
      className={cn(
        'flex-1 min-w-0 flex flex-col h-full bg-veyra-canvas overflow-hidden relative',
        animPhase === 'closing'
          ? 'veyra-note-root-closing'
          : entryMode === 'open'
            ? animPhase === 'entered'
              ? 'veyra-note-root-entered'
              : 'veyra-note-root-entering'
            : undefined
      )}
    >
      {note.deleted === 1 && (
        <div className="bg-red-500/10 border-b border-red-500/20 px-4 py-1.5 flex items-center justify-between text-xs text-red-300 select-none shrink-0">
          <span>Esta nota está en la papelera.</span>
          {onRestoreNote && (
            <button
              type="button"
              onClick={() => onRestoreNote(note.id)}
              className="px-2.5 py-0.5 rounded bg-red-500/20 hover:bg-red-500/30 text-red-200 transition-colors font-medium text-[11px] cursor-pointer"
            >
              Restaurar nota
            </button>
          )}
        </div>
      )}

      {/* Sleek Minimal Editor Header (Fase 3 & Fase 4) */}
      <div
        ref={editorHeaderRef}
        className={cn(
          'h-10 border-b border-veyra-border flex items-center justify-between gap-2 text-xs shrink-0 select-none bg-veyra-card/30',
          isTightHeader ? 'px-2.5' : 'px-3 sm:px-4',
          animPhase === 'closing'
            ? 'veyra-note-chrome-closing'
            : entryMode === 'open'
              ? animPhase === 'entered'
                ? 'veyra-note-chrome-entered'
                : 'veyra-note-chrome-entering'
              : undefined
        )}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {!isSidebarOpen && onToggleSidebar && (
            <button
              type="button"
              onClick={onToggleSidebar}
              title="Mostrar barra lateral (Ctrl+\)"
              className="p-1 rounded text-veyra-muted hover:text-accent hover:bg-white/5 transition-colors cursor-pointer flex items-center justify-center mr-0.5 shrink-0"
            >
              <PanelLeft className="w-4 h-4 text-accent" />
            </button>
          )}

          {/* Breadcrumb de Ubicación Unificado (Optimización de cabecera) */}
          {breadcrumb && (
            showCompactBreadcrumbIconOnly ? (
              <button
                type="button"
                onClick={() => {
                  if (breadcrumb.type === 'event') {
                    onSelectEvent?.(breadcrumb.eventId);
                  } else {
                    onSelectFolder?.(breadcrumb.folderId);
                  }
                }}
                title={
                  breadcrumb.type === 'event'
                    ? `${breadcrumb.parentLabel ? `${breadcrumb.parentLabel} / ` : ''}${breadcrumb.eventTitle}`
                    : `${breadcrumb.parentLabel ? `${breadcrumb.parentLabel} / ` : ''}${breadcrumb.folderName}`
                }
                className="h-6 w-6 rounded-md bg-white/[0.04] border border-veyra-border/60 flex items-center justify-center shrink-0 hover:bg-white/[0.08] transition-colors cursor-pointer"
              >
                {breadcrumb.type === 'event' ? (
                  <Calendar className="w-3 h-3 shrink-0" style={{ color: breadcrumb.eventColor }} />
                ) : (
                  <FolderIcon
                    className="w-3 h-3 shrink-0"
                    style={{ color: breadcrumb.folderColor || 'var(--accent-primary)' }}
                  />
                )}
              </button>
            ) : (
              <div
                className={cn(
                  'flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/[0.04] border border-veyra-border/60 text-[11px] text-veyra-muted min-w-0 shrink overflow-hidden',
                  pageFormat === 'a4' && !showParentBreadcrumb
                    ? 'max-w-[180px]'
                    : 'max-w-[260px] sm:max-w-[360px]'
                )}
              >
                {showParentBreadcrumb && breadcrumb.parentLabel && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        if (breadcrumb.parentFolderId && onSelectFolder) {
                          onSelectFolder(breadcrumb.parentFolderId);
                        }
                      }}
                      className={cn(
                        'flex items-center gap-1 text-veyra-muted hover:text-veyra-text transition-colors min-w-0 truncate',
                        breadcrumb.parentFolderId && 'cursor-pointer hover:underline'
                      )}
                      title={
                        breadcrumb.parentFolderId
                          ? `Ver carpeta ${breadcrumb.parentLabel}`
                          : breadcrumb.parentLabel
                      }
                    >
                      {breadcrumb.parentIconType === 'graduation' ? (
                        <GraduationCap className="w-3 h-3 text-accent shrink-0" />
                      ) : (
                        <FolderIcon
                          className="w-3 h-3 shrink-0"
                          style={{ color: breadcrumb.parentColor || 'var(--accent-primary)' }}
                        />
                      )}
                      <span className="truncate max-w-[90px] font-medium">{breadcrumb.parentLabel}</span>
                    </button>

                    <span className="text-veyra-subtle select-none text-[10px] shrink-0">/</span>
                  </>
                )}

                {breadcrumb.type === 'event' ? (
                  <button
                    type="button"
                    onClick={() => onSelectEvent?.(breadcrumb.eventId)}
                    className="flex items-center gap-1 text-veyra-text hover:text-accent transition-colors cursor-pointer group min-w-0 truncate"
                    title="Abrir detalles de la materia/evento en agenda"
                  >
                    <Calendar
                      className="w-3 h-3 shrink-0 transition-transform group-hover:scale-110"
                      style={{ color: breadcrumb.eventColor }}
                    />
                    <span
                      className="font-semibold truncate max-w-[130px]"
                      style={{ color: breadcrumb.eventColor }}
                    >
                      {breadcrumb.eventTitle}
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSelectFolder?.(breadcrumb.folderId)}
                    className="flex items-center gap-1 text-veyra-text hover:text-accent transition-colors cursor-pointer min-w-0 truncate"
                    title="Ver carpeta"
                  >
                    <FolderIcon
                      className="w-3 h-3 shrink-0"
                      style={{ color: breadcrumb.folderColor || 'var(--accent-primary)' }}
                    />
                    <span className="font-semibold truncate max-w-[130px]">
                      {breadcrumb.folderName}
                    </span>
                  </button>
                )}
              </div>
            )
          )}

          {/* Título editable en la barra superior cuando está activo el formato Hoja A4 */}
          {pageFormat === 'a4' && (
            <>
              {breadcrumb && (
                <span className="text-veyra-subtle select-none text-xs shrink-0">/</span>
              )}
              <HashtagInput
                value={title}
                onChange={(newTitle) => {
                  if (userRole === 'viewer') return;
                  handleTitleChange(newTitle);
                }}
                readOnly={userRole === 'viewer'}
                availableTags={['clase', 'apuntes', 'deberes', 'taller', 'examen', 'universidad', 'trabajo', 'proyecto']}
                placeholder="Sin título"
                multiline={false}
                onEnterPress={() => {
                  if (editor) {
                    editor.commands.focus('start');
                  }
                }}
                containerClassName="flex-1 min-w-0 max-w-md"
                inputClassName="w-full bg-transparent hover:bg-black/5 dark:hover:bg-white/5 focus:bg-veyra-surface border border-transparent focus:border-accent/40 rounded-md px-2 py-1 text-xs sm:text-[13px] font-semibold text-veyra-text placeholder:text-veyra-muted/60 focus:outline-none transition-colors truncate"
              />
            </>
          )}
        </div>

        {/* Right: Presence Avatars, Status Dot & Actions */}
        <div className={cn('flex items-center shrink-0', isTightHeader ? 'gap-1' : 'gap-1.5')}>
          {!isTightHeader ? (
            <>
              {userRole === 'viewer' && (
                <span
                  title="Modo solo lectura"
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-500/15 border border-blue-500/30 text-blue-400 text-[10.5px] font-medium shrink-0 whitespace-nowrap"
                >
                  <Eye className="w-3 h-3 shrink-0" />
                  {showActionLabels && <span>Solo lectura</span>}
                </span>
              )}
              <CollabPresence users={collabUsers} currentUserId={currentUserId} />

              {/* Discreet 6px status dot (Combina estado de sincronización y guardado) */}
              <div
                className="flex items-center justify-center p-1 shrink-0"
                title={
                  saveStatus === 'error'
                    ? 'Error al guardar'
                    : saveStatus === 'saving'
                      ? 'Guardando cambios...'
                      : syncStatus === 'connected'
                        ? 'Guardado · Colaboración en vivo activa'
                        : syncStatus === 'connecting'
                          ? 'Conectando con Supabase Realtime...'
                          : 'Guardado localmente (Desconectado)'
                }
              >
                <span
                  className={cn(
                    'w-1.5 h-1.5 rounded-full transition-colors',
                    saveStatus === 'error'
                      ? 'bg-red-500'
                      : saveStatus === 'saving' || syncStatus === 'connecting'
                        ? 'bg-amber-500 animate-pulse'
                        : syncStatus === 'connected'
                          ? 'bg-emerald-500'
                          : 'bg-zinc-600'
                  )}
                />
              </div>

              {/* Toggle Page Format Button per Note (Infinita vs Hoja A4) */}
              <button
                type="button"
                onClick={handleTogglePageFormat}
                title={
                  pageFormat === 'a4'
                    ? 'Esta nota usa formato Hoja A4. Clic para cambiar esta nota a vista Infinita'
                    : 'Esta nota usa vista Infinita. Clic para cambiar esta nota a formato Hoja A4'
                }
                className={cn(
                  'flex items-center gap-1.5 rounded text-xs transition-colors cursor-pointer border shrink-0 whitespace-nowrap',
                  showActionLabels ? 'px-2 py-0.5' : 'p-1.5',
                  pageFormat === 'a4'
                    ? 'bg-accent/15 border-accent/40 text-accent font-semibold'
                    : 'bg-white/5 border-veyra-border text-veyra-muted hover:text-veyra-text hover:bg-white/10'
                )}
              >
                {pageFormat === 'a4' ? (
                  <>
                    <FileText className="w-3.5 h-3.5 shrink-0" />
                    {showActionLabels && <span>Hoja A4</span>}
                  </>
                ) : (
                  <>
                    <ScrollText className="w-3.5 h-3.5 shrink-0" />
                    {showActionLabels && <span>Infinita</span>}
                  </>
                )}
              </button>

              {/* Toggle Floating Pages Sidebar Button (Icon Only) */}
              <button
                type="button"
                onClick={() => setIsPagesSidebarOpen(!isPagesSidebarOpen)}
                title={isPagesSidebarOpen ? 'Ocultar panel de hojas' : 'Mostrar panel de hojas'}
                aria-label="Panel de hojas"
                className={cn(
                  'p-1.5 rounded transition-colors cursor-pointer border flex items-center justify-center shrink-0',
                  isPagesSidebarOpen
                    ? 'bg-accent/15 border-accent/40 text-accent'
                    : 'bg-white/5 border-veyra-border text-veyra-muted hover:text-veyra-text hover:bg-white/10'
                )}
              >
                <Layers className="w-3.5 h-3.5" />
              </button>

              {/* Share Button */}
              <button
                type="button"
                onClick={() => setIsShareModalOpen(true)}
                title="Compartir y colaborar en esta nota"
                className={cn(
                  'flex items-center gap-1.5 rounded text-xs transition-colors cursor-pointer border bg-white/5 border-veyra-border text-veyra-muted hover:text-veyra-text hover:bg-white/10 shrink-0 whitespace-nowrap',
                  showActionLabels ? 'px-2.5 py-0.5' : 'p-1.5'
                )}
              >
                <Share2 className="w-3.5 h-3.5 text-accent shrink-0" />
                {showActionLabels && <span className="font-medium">Compartir</span>}
              </button>

              {/* Export to PDF Button */}
              <button
                type="button"
                onClick={handleOpenExportPdf}
                title="Exportar a PDF / Imprimir nota (Formato Word)"
                className={cn(
                  'flex items-center gap-1.5 rounded text-xs transition-colors cursor-pointer border bg-white/5 border-veyra-border text-veyra-muted hover:text-veyra-text hover:bg-white/10 shrink-0 whitespace-nowrap',
                  showActionLabels ? 'px-2.5 py-0.5' : 'p-1.5'
                )}
              >
                <FileDown className="w-3.5 h-3.5 text-accent shrink-0" />
                {showActionLabels && <span className="font-medium">Exportar PDF</span>}
              </button>

              {onCloseNote && (
                <>
                  <div className="w-[1px] h-3.5 bg-veyra-border mx-0.5 shrink-0" />
                  <button
                    type="button"
                    onClick={handleClose}
                    title="Cerrar nota"
                    aria-label="Cerrar nota"
                    className="p-1 rounded text-veyra-muted hover:text-veyra-text hover:bg-white/5 transition-colors cursor-pointer flex items-center justify-center shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              {/* Discreet 6px status dot */}
              <div
                className="flex items-center justify-center p-1 shrink-0"
                title={
                  saveStatus === 'error'
                    ? 'Error al guardar'
                    : saveStatus === 'saving'
                      ? 'Guardando cambios...'
                      : syncStatus === 'connected'
                        ? 'Guardado · Colaboración en vivo activa'
                        : syncStatus === 'connecting'
                          ? 'Conectando con Supabase Realtime...'
                          : 'Guardado localmente (Desconectado)'
                }
              >
                <span
                  className={cn(
                    'w-1.5 h-1.5 rounded-full transition-colors',
                    saveStatus === 'error'
                      ? 'bg-red-500'
                      : saveStatus === 'saving' || syncStatus === 'connecting'
                        ? 'bg-amber-500 animate-pulse'
                        : syncStatus === 'connected'
                          ? 'bg-emerald-500'
                          : 'bg-zinc-600'
                  )}
                />
              </div>

              {showHeaderExportShortcut && (
                <button
                  type="button"
                  onClick={handleOpenExportPdf}
                  title="Exportar a PDF / Imprimir nota (Formato Word)"
                  aria-label="Exportar PDF"
                  className="p-1.5 rounded border bg-white/5 border-veyra-border text-veyra-muted hover:text-veyra-text hover:bg-white/10 transition-colors cursor-pointer flex items-center justify-center shrink-0"
                >
                  <FileDown className="w-3.5 h-3.5 text-accent" />
                </button>
              )}

              <button
                ref={headerMenuBtnRef}
                type="button"
                onClick={() => {
                  if (!showHeaderMenu) {
                    updateHeaderMenuPosition();
                    setIsHeaderMenuOpen(true);
                  } else {
                    setIsHeaderMenuOpen(false);
                  }
                }}
                title="Más opciones de la nota"
                aria-label="Más opciones"
                aria-expanded={showHeaderMenu}
                className={cn(
                  'p-1.5 rounded border transition-colors cursor-pointer flex items-center justify-center shrink-0',
                  showHeaderMenu
                    ? 'bg-accent/15 border-accent/40 text-accent'
                    : 'bg-white/5 border-veyra-border text-veyra-muted hover:text-veyra-text hover:bg-white/10'
                )}
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>

              {onCloseNote && (
                <>
                  <div className="w-[1px] h-3.5 bg-veyra-border mx-0.5 shrink-0" />
                  <button
                    type="button"
                    onClick={handleClose}
                    title="Cerrar nota"
                    aria-label="Cerrar nota"
                    className="p-1 rounded text-veyra-muted hover:text-veyra-text hover:bg-white/5 transition-colors cursor-pointer flex items-center justify-center shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Header Overflow Portal Menu for Tight Widths */}
      {showHeaderMenu &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={headerMenuRef}
            style={{
              position: 'fixed',
              top: headerMenuCoords.top,
              right: headerMenuCoords.right,
              zIndex: 9999,
            }}
            className="w-56 max-w-[calc(100vw-16px)] p-1.5 rounded-xl bg-white dark:bg-[#18181B] border border-slate-200 dark:border-zinc-800 shadow-xl select-none text-xs animate-in fade-in zoom-in-95 duration-100"
          >
            {userRole === 'viewer' && (
              <div className="flex items-center gap-2 px-2.5 py-1.5 mb-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-500 dark:text-blue-400 text-[11px] font-medium">
                <Eye className="w-3.5 h-3.5 shrink-0" />
                <span>Solo lectura</span>
              </div>
            )}

            {(collabUsers.some((u) => u.userId !== currentUserId) || collabUsers.length > 1) && (
              <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 mb-1 border-b border-slate-200 dark:border-zinc-800">
                <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                  Colaboradores ({collabUsers.length})
                </span>
                <CollabPresence users={collabUsers} currentUserId={currentUserId} />
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                handleTogglePageFormat();
                setIsHeaderMenuOpen(false);
              }}
              className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-slate-800 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer text-left"
            >
              <span className="flex items-center gap-2">
                {pageFormat === 'a4' ? (
                  <FileText className="w-3.5 h-3.5 text-accent shrink-0" />
                ) : (
                  <ScrollText className="w-3.5 h-3.5 text-accent shrink-0" />
                )}
                <span>{pageFormat === 'a4' ? 'Vista: Hoja A4' : 'Vista: Infinita'}</span>
              </span>
              <span className="text-[10px] text-slate-400 dark:text-zinc-500">Cambiar</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsPagesSidebarOpen(!isPagesSidebarOpen);
                setIsHeaderMenuOpen(false);
              }}
              className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-slate-800 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer text-left"
            >
              <span className="flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-accent shrink-0" />
                <span>Panel de hojas</span>
              </span>
              {isPagesSidebarOpen && <Check className="w-3.5 h-3.5 text-accent shrink-0" />}
            </button>

            <button
              type="button"
              onClick={() => {
                setIsShareModalOpen(true);
                setIsHeaderMenuOpen(false);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-slate-800 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer text-left"
            >
              <Share2 className="w-3.5 h-3.5 text-accent shrink-0" />
              <span>Compartir y colaborar</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsHeaderMenuOpen(false);
                handleOpenExportPdf();
              }}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-slate-800 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer text-left"
            >
              <FileDown className="w-3.5 h-3.5 text-accent shrink-0" />
              <span>Exportar a PDF</span>
            </button>
          </div>,
          document.body
        )}

      {/* Sleek Minimal Formatting Toolbar OR Word Header/Footer Design Ribbon */}
      <div
        className={cn(
          'shrink-0',
          animPhase === 'closing'
            ? 'veyra-note-chrome-closing'
            : entryMode === 'open'
              ? animPhase === 'entered'
                ? 'veyra-note-chrome-entered'
                : 'veyra-note-chrome-entering'
              : undefined
        )}
      >
        {pageFormat === 'a4' && activeHeaderFooterZone !== null ? (
          <A4HeaderFooterRibbon
            config={a4HeaderFooterConfig}
            onChange={handleUpdateHeaderFooterConfig}
            activeZone={activeHeaderFooterZone}
            activeSheetIndex={activeHeaderFooterSheetIdx}
            totalSheets={a4PageBreaks.length + 1}
            activeSlot={activeHeaderFooterSlot}
            onSelectZone={(zone) => {
              setActiveHeaderFooterZone(zone);
              scrollToHeaderFooterZone(zone, activeHeaderFooterSheetIdx);
            }}
            onNavigateSheet={(nextIdx) => {
              setActiveHeaderFooterSheetIdx(nextIdx);
              scrollToHeaderFooterZone(activeHeaderFooterZone, nextIdx);
            }}
            onInsertImageFile={async (file) => {
              const sheetNum = activeHeaderFooterSheetIdx + 1;
              const key = resolveSlotsKey(
                a4HeaderFooterConfig,
                activeHeaderFooterZone,
                sheetNum
              );
              const currentImages = a4HeaderFooterConfig[key].images || [];
              const newImg = await createHeaderFooterImageFromFile(
                file,
                currentImages,
                noteRef.current.id
              );
              handleUpdateHeaderFooterConfig({
                ...a4HeaderFooterConfig,
                [key]: {
                  ...a4HeaderFooterConfig[key],
                  images: [...currentImages, newImg],
                },
              });
            }}
            onClose={() => setActiveHeaderFooterZone(null)}
          />
        ) : (
          <EditorToolbar
            editor={editor}
            onUploadImage={handleUploadImage}
            onAttachFromDrive={userRole !== 'viewer' ? handleAttachFromDrive : undefined}
            isAttachingDrive={isAttachingDrive}
            onOpenTemplates={() => setIsTemplatesModalOpen(true)}
            showFormattingMarks={showFormattingMarks}
            onToggleFormattingMarks={handleToggleFormattingMarks}
          />
        )}
      </div>

      {/* Workspace Area: Main Note Canvas + Docked Right Pages Sidebar */}
      <div
        className={cn(
          'flex-1 flex overflow-hidden relative',
          isDark && isAmoled ? 'bg-black' : 'bg-[#e4e7ec] dark:bg-[#0B0B0C]'
        )}
      >
        {/* Visual Resting Canvas Margins (Lienzo exterior: más oscuro que el documento) */}
        <div
          ref={scrollContainerRef}
          className={cn(
            'flex-1 overflow-y-auto overflow-x-hidden [overflow-anchor:none] transition-[background-color,padding] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
            pageFormat === 'a4' ? 'px-2 sm:px-8 py-3 sm:py-8' : 'px-4 sm:px-8 py-6 sm:py-8',
            isDark && isAmoled ? 'bg-black' : 'bg-[#e4e7ec] dark:bg-[#0B0B0C]'
          )}
          onClick={(e) => {
            if (e.target === e.currentTarget && activeHeaderFooterZone !== null) {
              setActiveHeaderFooterZone(null);
            }
          }}
        >
          {/* Scaled wrapper so A4 sheet (794px) fits proportionally on mobile screens */}
          <div
            data-format-switch={formatSwitchSeq}
            className={cn(
              pageFormat === 'a4' && a4Scale < 1 ? 'mx-auto relative shrink-0' : 'w-full',
              isFormatSwitching && isNarrowSheetViewport && 'veyra-note-format-switch-mobile'
            )}
            style={
              pageFormat === 'a4' && a4Scale < 1
                ? {
                    width: `${794 * a4Scale}px`,
                    height: `${a4SheetHeight * a4Scale}px`,
                  }
                : undefined
            }
          >
          {/* Note Document Sheet (Documento central: gris carbón oscuro y sobrio / negro AMOLED si activo / Hoja A4) */}
          <div
            ref={docSheetRef}
            data-sheet-theme={isPaperLight ? 'light' : undefined}
            style={
              pageFormat === 'a4' && a4Scale < 1
                ? {
                    transform: `scale(${a4Scale})`,
                    transformOrigin: 'top left',
                  }
                : undefined
            }
            className={cn(
              'mx-auto w-full flex flex-col transition-[max-width,min-height,padding,border-radius,background-color,border-color,box-shadow] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] relative',
              animPhase === 'closing'
                ? 'veyra-note-sheet-closing'
                : entryMode === 'open'
                  ? animPhase === 'entered'
                    ? 'veyra-note-sheet-entered'
                    : initialPageFormat === 'a4'
                      ? 'veyra-note-sheet-a4-entering'
                      : 'veyra-note-sheet-entering'
                  : undefined,
              isNarrowSheetViewport && isFormatSwitching && 'veyra-note-sheet-scaled',
              isPaperLight && 'sheet-light-mode',
              pageFormat === 'a4'
                ? cn(
                  'a4-page-mode min-h-[1123px] rounded-sm px-[30mm] pt-[25mm] pb-[25mm] mb-4',
                  a4Scale < 1 ? '!w-[794px] max-w-none' : 'max-w-[794px]',
                  isPaperLight
                    ? 'bg-white border border-slate-300 shadow-[0_8px_30px_rgb(0,0,0,0.12)]'
                    : 'bg-white dark:bg-[#161619] border border-slate-300 dark:border-white/10 shadow-[0_8px_30px_rgb(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.6)]'
                )
                : cn(
                  'max-w-[760px] rounded-2xl p-6 sm:p-12 shadow-2xl min-h-[calc(100vh-140px)]',
                  isPaperLight
                    ? 'bg-white border border-slate-300/80 shadow-2xl'
                    : isDark && isAmoled
                      ? 'bg-black border border-white/12 shadow-2xl'
                      : 'bg-white dark:bg-[#161619] border border-slate-300/80 dark:border-white/8 shadow-2xl'
                )
            )}
          >
            {pageFormat === 'a4' && <style ref={a4StyleRef} />}

            {showSwitchWipeEdge && animPhase === 'entered' && !isSwitchingNote && (
              <div
                aria-hidden="true"
                className="absolute inset-0 overflow-hidden rounded-[inherit] pointer-events-none z-30"
              >
                <div
                  className="veyra-note-wipe-accent-edge"
                  onAnimationEnd={() => setShowSwitchWipeEdge(false)}
                />
              </div>
            )}

            {/* Zonas interactivas de Encabezado y Pie de página (1,25 cm desde el borde, estilo Word) */}
            {pageFormat === 'a4' && (
              <A4SheetHeaderFooterZones
                config={a4HeaderFooterConfig}
                onChange={handleUpdateHeaderFooterConfig}
                totalSheets={a4PageBreaks.length + 1}
                noteId={note.id}
                noteTitle={title || note.title || 'Sin título'}
                authorName={displayName}
                activeZone={activeHeaderFooterZone}
                activeSheetIndex={activeHeaderFooterSheetIdx}
                activeSlot={activeHeaderFooterSlot}
                onActivateZone={(zone, sheetIdx) => {
                  setActiveHeaderFooterZone(zone);
                  setActiveHeaderFooterSheetIdx(sheetIdx);
                }}
                onSelectSlot={(slot) => setActiveHeaderFooterSlot(slot)}
              />
            )}

            {/* Visual A4 Page Break Gap (Separación física con espacio real entre hojas y márgenes de 2.5cm) */}
            {pageFormat === 'a4' &&
              a4PageBreaks.map((breakTop, idx) => (
                <div
                  key={idx}
                  style={{ top: `${breakTop}px` }}
                  className="absolute -left-[1px] -right-[1px] h-[36px] pointer-events-none select-none z-20 flex flex-col justify-between animate-in fade-in duration-150 ease-out"
                >
                  {/* Borde inferior de la hoja anterior + sombra de papel físico */}
                  <div
                    className={cn(
                      'w-full h-[1px]',
                      isPaperLight
                        ? 'bg-slate-300 shadow-[0_4px_12px_rgba(0,0,0,0.15)]'
                        : 'bg-slate-300/90 dark:bg-white/10 shadow-[0_4px_12px_rgba(0,0,0,0.15)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.8)]'
                    )}
                  />

                  {/* Espacio real entre hojas: fondo exacto del lienzo exterior */}
                  <div className="w-full flex-1 bg-[#e4e7ec] dark:bg-[#030304] flex items-center justify-center relative">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'px-3 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase border shadow-sm transition-all duration-150 animate-in fade-in zoom-in-95',
                          isPaperLight
                            ? 'bg-white text-slate-700 border-slate-300'
                            : 'bg-white dark:bg-[#161619] text-slate-600 dark:text-zinc-300 border border-slate-300/80 dark:border-zinc-700'
                        )}
                      >
                        Hoja {idx + 2}
                      </span>
                    </div>
                  </div>

                  {/* Borde superior de la nueva hoja + sombra de papel físico */}
                  <div
                    className={cn(
                      'w-full h-[1px]',
                      isPaperLight
                        ? 'bg-slate-300 shadow-[0_-3px_10px_rgba(0,0,0,0.12)]'
                        : 'bg-slate-300/90 dark:bg-white/10 shadow-[0_-3px_10px_rgba(0,0,0,0.12)] dark:shadow-[0_-3px_14px_rgba(0,0,0,0.7)]'
                    )}
                  />
                </div>
              ))}

            {/* Cuerpo del documento (se atenúa cuando se edita el encabezado/pie igual que en Word, o se oculta si se desmarca 'Mostrar texto del documento') */}
            <div
              className={cn(
                'w-full flex-1 flex flex-col transition-opacity duration-200',
                isSwitchingNote
                  ? 'veyra-note-content-switching'
                  : entryMode === 'switch'
                    ? animPhase === 'entered'
                      ? 'veyra-note-content-wipe'
                      : 'veyra-note-content-wipe-entering'
                    : undefined,
                pageFormat === 'a4' &&
                activeHeaderFooterZone !== null &&
                (a4HeaderFooterConfig.showDocumentText
                  ? 'opacity-45'
                  : 'opacity-0 pointer-events-none')
              )}
              onClick={() => {
                if (activeHeaderFooterZone !== null) {
                  setActiveHeaderFooterZone(null);
                }
              }}
            >
              {/* Note Title dentro de la hoja solo en vista Infinita */}
              {pageFormat !== 'a4' && (
                <HashtagInput
                  value={title}
                  onChange={(newTitle) => {
                    if (userRole === 'viewer') return;
                    handleTitleChange(newTitle);
                  }}
                  readOnly={userRole === 'viewer'}
                  availableTags={['clase', 'apuntes', 'deberes', 'taller', 'examen', 'universidad', 'trabajo', 'proyecto']}
                  placeholder="Sin título"
                  multiline={true}
                  onEnterPress={() => {
                    if (editor) {
                      editor.commands.focus('start');
                    }
                  }}
                  containerClassName="mb-6"
                  inputClassName={cn(
                    'w-full bg-transparent text-lg sm:text-xl font-medium tracking-tight focus:outline-none border-0 p-0 leading-snug transition-colors resize-none overflow-hidden',
                    isPaperLight
                      ? 'text-slate-900 placeholder:text-slate-400'
                      : 'text-veyra-text/90 placeholder:text-slate-400/60 dark:placeholder:text-veyra-subtle/30'
                  )}
                />
              )}

              {/* Tiptap Native DOM Editor + BubbleMenu + SlashMenu */}
              <div
                className={cn(
                  'w-full flex-1 flex flex-col',
                  showFormattingMarks && 'show-formatting-marks',
                  isPaperLight ? 'text-slate-900' : 'text-veyra-text'
                )}
                onClick={(e) => {
                  const target = e.target as HTMLElement | null;
                  const anchor = target?.closest('a[href]') as HTMLAnchorElement | null;
                  const href = anchor?.getAttribute('href');
                  if (href && isVeyraAttachmentUri(href)) {
                    e.preventDefault();
                    e.stopPropagation();
                    void openAttachmentInNewTab(href).catch((err: any) => {
                      toast.error(err?.message || 'No se pudo abrir el adjunto.');
                    });
                    return;
                  }
                  if (editor && !editor.isFocused) {
                    editor.commands.focus();
                  }
                }}
              >
                <EditorContent editor={editor} className="flex-1" />
                <EditorBubbleMenu editor={editor} />
                <EditorImageBubbleMenu
                  editor={editor}
                  currentUserId={currentUserIdRef.current}
                  noteId={note.id}
                />
                <EditorTableBubbleMenu editor={editor} onSaveTableAsTemplate={handleOpenSaveTemplate} />
                <EditorSlashMenu editor={editor} onOpenTemplates={() => setIsTemplatesModalOpen(true)} />
                <EditorListNumberTooltip editor={editor} />
              </div>
            </div>

            {/* Contador de palabras y caracteres (Dentro de la hoja solo en vista Infinita) */}
            {pageFormat !== 'a4' && (
              <div className="mt-8 pt-4 border-t border-slate-200/60 dark:border-zinc-800/60 flex items-center justify-between text-xs">
                <EditorWordCount editor={editor} pageFormat={pageFormat} />
              </div>
            )}
          </div>
          </div>

          {/* En modo Hoja A4, el contador de palabras va debajo de la última hoja para dejar libre el pie de página de 2.5cm */}
          {pageFormat === 'a4' && (
            <div className="mx-auto max-w-[794px] mb-10 px-2 flex items-center justify-between text-xs">
              <EditorWordCount editor={editor} pageFormat={pageFormat} />
            </div>
          )}
        </div>

        {/* Mobile Backdrop for Right Pages Sidebar */}
        {isPagesSidebarOpen && (
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-[1px] z-20 md:hidden"
            onClick={() => setIsPagesSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Docked Right Pages Sidebar (Overlay drawer on mobile, docked on md+) */}
        <div
          className={cn(
            'absolute inset-y-0 right-0 z-30 md:relative md:z-auto h-full border-l border-veyra-border bg-veyra-card flex flex-col shrink-0 overflow-hidden transition-[width,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] shadow-2xl md:shadow-none',
            isPagesSidebarOpen ? 'w-80 max-w-[85vw] opacity-100' : 'w-0 opacity-0 pointer-events-none',
            animPhase === 'closing'
              ? 'veyra-note-pages-closing'
              : entryMode === 'open' && isPagesSidebarOpen
                ? animPhase === 'entered'
                  ? 'veyra-note-pages-entered'
                  : 'veyra-note-pages-entering'
                : undefined
          )}
        >
          <div style={{ width: '320px' }} className="h-full max-w-[85vw] flex flex-col">
            <PagesSidebar
              onClose={() => setIsPagesSidebarOpen(false)}
              pages={pages}
              activePageId={activePageId}
              onSelectPage={handleSelectPage}
              onAddPage={handleAddPage}
              ydoc={ydoc}
              noteTitle={title}
              onSave={triggerAutoSave}
              pageFormat={pageFormat}
              a4Sheets={a4SheetsMeta}
              activeA4SheetIndex={activeA4SheetIndex}
              onSelectA4Sheet={handleSelectA4Sheet}
              editor={editor}
              a4HeaderFooterConfig={a4HeaderFooterConfig}
              authorName={displayName}
            />
          </div>
        </div>
      </div>

      {/* Export to PDF Modal with Word Page Layout Controls */}
      <ExportPdfModal
        isOpen={isExportPdfOpen}
        onClose={() => setIsExportPdfOpen(false)}
        title={title || note.title || 'Nota sin título'}
        pages={exportPdfPages}
        headerFooterConfig={a4HeaderFooterConfig}
        userName={userName}
      />

      {/* Modal de Catálogo de Plantillas */}
      <TemplatesModal
        isOpen={isTemplatesModalOpen}
        onClose={() => setIsTemplatesModalOpen(false)}
        onSelectTemplate={handleSelectTemplate}
        isDocumentEmpty={editor ? editor.isEmpty : true}
        templates={allTemplates}
        onOpenSaveModal={handleOpenSaveTemplate}
        onDeleteCustomTemplate={async (id) => {
          await deleteCustomTemplate(id);
          toast.success('Plantilla eliminada');
        }}
      />

      {/* Modal para Guardar Plantilla Personalizada */}
      <SaveTemplateModal
        isOpen={isSaveTemplateModalOpen}
        onClose={() => setIsSaveTemplateModalOpen(false)}
        onSave={async (data) => {
          await saveCustomTemplate(data);
          toast.success(`Plantilla "${data.title}" guardada en tu catálogo`);
        }}
        defaultContent={templateContentToSave}
        defaultType={templateTypeToSave}
        defaultTitle={title || note.title || ''}
      />

      {/* Modal para Compartir / Colaboración */}
      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        targetType="note"
        targetId={note.id}
        targetName={title || note.title || 'Nota sin título'}
        ownerId={note.user_id}
        currentUserId={currentUserId}
        onLeftCollaboration={handleClose}
      />
    </div>
  );
};

export const NoteEditor: React.FC<NoteEditorProps> = ({
  note,
  currentUserId,
  userEmail,
  userName,
  onSaveNote,
  onRestoreNote,
  onCloseNote,
  isSidebarOpen,
  onToggleSidebar,
  folders,
  events,
  onSelectFolder,
  onSelectEvent,
}) => {
  const [displayedState, setDisplayedState] = useState<{
    note: Note;
    data: YjsLoadedNote;
    entryMode: 'open' | 'switch';
  } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const latestNoteRef = useRef<Note | null>(note);

  useEffect(() => {
    latestNoteRef.current = note;
  }, [note]);

  // Destroy each YjsLoadedNote only AFTER its YjsActiveEditor child unmounts and flushes unmount save
  useEffect(() => {
    const currentData = displayedState?.data;
    return () => {
      currentData?.destroy();
    };
  }, [displayedState?.data]);

  useEffect(() => {
    if (!note?.id) {
      return;
    }

    let isCancelled = false;

    loadYjsNote(note.id)
      .then((data) => {
        if (isCancelled) {
          data.destroy();
          return;
        }
        const resolvedNote =
          latestNoteRef.current && latestNoteRef.current.id === data.noteId
            ? latestNoteRef.current
            : null;
        if (!resolvedNote) {
          data.destroy();
          return;
        }
        setLoadError(null);
        setDisplayedState((prev) => ({
          note: resolvedNote,
          data,
          entryMode: prev ? 'switch' : 'open',
        }));
      })
      .catch((err) => {
        console.error('[NoteEditor] Error descargando nota Yjs:', err);
        if (!isCancelled) {
          setLoadError('Error descargando el contenido de la nota.');
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [note?.id]);

  if (!note) {
    return (
      <div className="flex-1 min-w-0 flex flex-col h-full bg-veyra-canvas select-none">
        {!isSidebarOpen && onToggleSidebar && (
          <div className="h-10 border-b border-veyra-border px-4 flex items-center text-xs shrink-0 bg-veyra-card/30">
            <button
              type="button"
              onClick={onToggleSidebar}
              title="Mostrar barra lateral (Ctrl+\)"
              className="p-1.5 rounded-md text-veyra-muted hover:text-accent hover:bg-white/5 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              <PanelLeft className="w-4 h-4 text-accent" />
              <span className="text-xs text-veyra-muted font-medium">Mostrar notas</span>
            </button>
          </div>
        )}
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-veyra-muted">
          <div className="w-10 h-10 rounded-md bg-veyra-card border border-veyra-border flex items-center justify-center mb-3">
            <svg
              className="w-5 h-5 text-veyra-subtle"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          </div>
          <h3 className="text-sm font-medium text-veyra-text">Ninguna nota seleccionada</h3>
          <p className="text-xs text-veyra-subtle mt-1">
            Elige una nota del panel lateral o crea una nueva.
          </p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex-1 min-w-0 flex flex-col items-center justify-center p-8 text-center text-veyra-muted bg-veyra-canvas">
        <div className="p-3 rounded-md bg-red-500/10 border border-red-500/30 text-red-400 text-xs mb-3">
          {loadError || 'No se pudo inicializar el documento colaborativo.'}
        </div>
        <button
          onClick={() => {
            if (note?.id) {
              setLoadError(null);
              loadYjsNote(note.id)
                .then((data) => {
                  const resolvedNote =
                    latestNoteRef.current && latestNoteRef.current.id === data.noteId
                      ? latestNoteRef.current
                      : null;
                  if (!resolvedNote) {
                    data.destroy();
                    return;
                  }
                  setDisplayedState((prev) => ({
                    note: resolvedNote,
                    data,
                    entryMode: prev ? 'switch' : 'open',
                  }));
                })
                .catch((err) => {
                  console.error('[NoteEditor] Error reintentando descarga Yjs:', err);
                  setLoadError('Error descargando el contenido de la nota.');
                });
            }
          }}
          className="px-3 py-1.5 rounded-md bg-veyra-card border border-veyra-border hover:border-accent text-xs text-veyra-text transition-colors cursor-pointer"
        >
          Reintentar sincronización
        </button>
      </div>
    );
  }

  if (!displayedState) {
    return <div className="flex-1 min-w-0 flex flex-col h-full bg-veyra-canvas" />;
  }

  const isSwitchingNote = displayedState.data.noteId !== note.id;
  const activeNote = isSwitchingNote ? displayedState.note : note;

  return (
    <YjsActiveEditor
      key={displayedState.data.noteId}
      note={{ ...activeNote, sync_mode: displayedState.data.syncMode }}
      ydoc={displayedState.data.ydoc}
      awareness={displayedState.data.awareness}
      initialActivePageId={displayedState.data.activePageId}
      initialPages={displayedState.data.pageOrder}
      initialMetaTitle={displayedState.data.metaTitle}
      initialServerClock={displayedState.data.highestUpdateId}
      currentUserId={currentUserId}
      userEmail={userEmail}
      userName={userName}
      onSaveNote={onSaveNote}
      onRestoreNote={onRestoreNote}
      onCloseNote={onCloseNote}
      isSidebarOpen={isSidebarOpen}
      onToggleSidebar={onToggleSidebar}
      folders={folders}
      events={events}
      onSelectFolder={onSelectFolder}
      onSelectEvent={onSelectEvent}
      entryMode={displayedState.entryMode}
      isSwitchingNote={isSwitchingNote}
    />
  );
};
