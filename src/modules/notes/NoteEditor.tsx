import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
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
import { AICommandExtension } from './extensions/AICommandExtension';
import { EditorToolbar } from './EditorToolbar';
import { CollabPresence } from './CollabPresence';
import { uploadNoteImage } from '../../lib/storage-upload';
import { humanizeUploadError } from '../../lib/image-pipeline';
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
import { Loader2, PanelLeft, X, Layers, GraduationCap, Folder as FolderIcon, Calendar, FileDown, FileText, ScrollText } from 'lucide-react';
import { useTheme } from '../../theme/ThemeProvider';
import { PagesSidebar, type PageMeta, type PageBlock } from './PagesSidebar';
import { ExportPdfModal } from './pdf/ExportPdfModal';
import { HashtagInput } from '../../components/common/HashtagInput';
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
  const [pages, setPages] = useState<string[]>(initialPages);
  const [title, setTitle] = useState(initialMetaTitle || note.title || '');
  const [collabUsers, setCollabUsers] = useState<CollabUser[]>([]);
  const [syncStatus, setSyncStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [, setLastSavedAt] = useState<Date | null>(new Date());
  const [isPagesSidebarOpen, setIsPagesSidebarOpen] = useState(true);
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
      } catch {}
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
  const pageFormatRef = useRef<'infinite' | 'a4'>(pageFormat);
  const docSheetRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const a4StyleRef = useRef<HTMLStyleElement | null>(null);
  const [a4PageBreaks, setA4PageBreaks] = useState<number[]>([]);
  const lastBreaksStrRef = useRef<string>('');
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
      } catch {}
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
      } catch {}
      triggerAutoSaveRef.current?.();
    },
    [note.id, ydoc]
  );

  const scrollToHeaderFooterZone = useCallback(
    (zone: 'header' | 'footer', sheetIdx: number) => {
      const container = scrollContainerRef.current;
      const sheet = docSheetRef.current;
      if (!container || !sheet) return;
      const stride = 1123 + 36;
      const zoneY =
        zone === 'header' ? sheetIdx * stride : sheetIdx * stride + 1123 - 180;
      container.scrollTo({
        top: Math.max(0, sheet.offsetTop + zoneY - 40),
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
    const stride = 1123 + 36;
    container.scrollTo({
      top: Math.max(0, sheet.offsetTop + sheetIdx * stride - 24),
      behavior: 'smooth',
    });
  }, []);

  useEffect(() => {
    if (pageFormat !== 'a4') return;
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const sheet = docSheetRef.current;
      if (!sheet) return;
      const stride = 1123 + 36;
      const totalSheets = a4PageBreaks.length + 1;
      const relativeScroll = Math.max(0, container.scrollTop - sheet.offsetTop + 260);
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
    } catch {}
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(`veyra_note_page_format_${note.id}`, next);
      } catch {}
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
  const triggerAutoSaveRef = useRef<() => void>(() => {});

  const displayName = userName || userEmail.split('@')[0] || 'Usuario';
  const { palette, isPaperLight } = useTheme();

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

  const handleUploadImage = useCallback(async (file: File) => {
    try {
      const url = await uploadNoteImage(file, currentUserIdRef.current);
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
  }, []);

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

  const performSave = useCallback(async () => {
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
  }, [serializeNoteContent]);

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
    if (saveDebounceTimeoutRef.current) {
      clearTimeout(saveDebounceTimeoutRef.current);
    }
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
        setPages(current);
        pagesRef.current = current;
        triggerAutoSaveRef.current?.();
        if (typeof window !== 'undefined') {
          const sp = new URLSearchParams(window.location.search);
          const pageParam = sp.get('page');
          if (pageParam) {
            const idx = parseInt(pageParam, 10) - 1;
            if (idx >= 0 && idx < current.length) {
              setActivePageId(current[idx]);
              activePageIdRef.current = current[idx];
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
          } catch {}
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
                  return uploadNoteImage(file, currentUserIdRef.current);
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
                      const fallbackUrl = await uploadNoteImage(fallbackImageFile, currentUserIdRef.current);
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
          const singleImageMatch = html.trim().match(/^<img[^>]+src=["'](https?:\/\/[^"']+)["'][^>]*\/?>(?:<\/img>)?$/i);
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
                  uploadNoteImage(file, currentUserIdRef.current)
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

          // Detección y transformación automática de Markdown y fórmulas matemáticas LaTeX ($$ y $)
          const cleanedText = cleanAiClipboardArtifacts(plainText);
          const isMath = hasMathContent(cleanedText);
          const isMarkdown = hasMarkdownContent(cleanedText);

          // Si contiene estructuras Markdown explícitas (títulos #, listas, tareas, bloques de código, etc.)
          // o fórmulas matemáticas, priorizamos la conversión limpia de Markdown para respetar los saltos
          // de línea y títulos en bloques independientes.
          const hasExplicitMarkdownBlocks = /^(?:#{1,6}\s*\S+|[-*+]\s+\[[ xX]\]|[-*+]\s+\S+|\d+\.\s+\S+|>+\s+\S+|```)/m.test(cleanedText);
          const hasRichHtmlBlocks = /<(?:table|thead|tbody|tr|td)[^>]*>/i.test(html);
          const shouldProcessMarkdownOrMath = isMath || hasExplicitMarkdownBlocks || (isMarkdown && (!html || !hasRichHtmlBlocks));

          if (shouldProcessMarkdownOrMath) {
            event.preventDefault();
            const formattedHtml = convertMarkdownWithMathToHtml(cleanedText);
            const currentEditor = (_view as any).editor || editorRef.current;
            if (currentEditor && !currentEditor.isDestroyed) {
              currentEditor.commands.insertContent(formattedHtml);
            }
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
              } catch {}

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
            uploadNoteImage(imageFile, currentUserIdRef.current)
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
  }, [editor, awareness]);

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

    const calculateBreaks = () => {
      if (isCalculating || !docSheetRef.current || !a4StyleRef.current) return;
      isCalculating = true;
      try {
        const sheet = docSheetRef.current;
        const styleEl = a4StyleRef.current;

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

        // Mantener altura mínima temporalmente para evitar saltos de scroll durante el cálculo
        const prevSheetH = sheet.offsetHeight;
        sheet.style.minHeight = `${Math.max(A4_HEIGHT_PX, prevSheetH)}px`;

        styleEl.textContent = basePaddingRule;

        const items: BreakableItem[] = [];
        const pmChildren = Array.from(pm.children) as HTMLElement[];

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
                const rowH = row.getBoundingClientRect().height;
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

        const rules: string[] = basePaddingRule ? [basePaddingRule] : [];
        const breaks: number[] = [];
        let currentPage = 0;

        const applyPushToTarget = (target: BreakableItem, desiredTop: number) => {
          const sRect = sheet.getBoundingClientRect();
          const tRect = target.topEl.getBoundingClientRect();
          const currentTop = tRect.top - sRect.top;
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
          const actualTop = vTopRect.top - vSheetRect.top;
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
          let sheetRect = sheet.getBoundingClientRect();
          let itemTop = item.topEl.getBoundingClientRect().top - sheetRect.top;
          let itemBottom = item.bottomEl.getBoundingClientRect().bottom - sheetRect.top;

          let minPrintableY = currentPage * STRIDE + marginTopPx;
          let maxPrintableY = currentPage * STRIDE + A4_HEIGHT_PX - marginBottomPx;

          // Si un bloque anterior avanzó de página sin empujar a este, asegurar que empiece en minPrintableY
          if (currentPage > 0 && itemTop < minPrintableY - 2) {
            applyPushToTarget(item, minPrintableY);
            sheetRect = sheet.getBoundingClientRect();
            itemTop = item.topEl.getBoundingClientRect().top - sheetRect.top;
            itemBottom = item.bottomEl.getBoundingClientRect().bottom - sheetRect.top;
          }

          if (itemBottom > maxPrintableY) {
            // Retroceder si el bloque anterior es un título o encabezado que quedaría huérfano al final de la hoja
            let pushIdx = k;
            while (pushIdx > 0 && items[pushIdx - 1].isHeadingOrLead) {
              const prevTop =
                items[pushIdx - 1].topEl.getBoundingClientRect().top - sheetRect.top;
              if (prevTop > minPrintableY + 28) {
                pushIdx -= 1;
              } else {
                break;
              }
            }

            const target = items[pushIdx];
            const targetTop = target.topEl.getBoundingClientRect().top - sheetRect.top;

            if (targetTop > minPrintableY + 14) {
              const breakY = currentPage * STRIDE + A4_HEIGHT_PX;
              breaks.push(breakY);
              currentPage += 1;

              const desiredTop = currentPage * STRIDE + marginTopPx;
              applyPushToTarget(target, desiredTop);

              sheetRect = sheet.getBoundingClientRect();
              itemBottom = item.bottomEl.getBoundingClientRect().bottom - sheetRect.top;
              minPrintableY = currentPage * STRIDE + marginTopPx;
              maxPrintableY = currentPage * STRIDE + A4_HEIGHT_PX - marginBottomPx;
            }

            // Si el elemento por sí solo sigue superando la página actual, avanzar las páginas necesarias
            while (itemBottom > currentPage * STRIDE + A4_HEIGHT_PX - marginBottomPx) {
              const breakY = currentPage * STRIDE + A4_HEIGHT_PX;
              breaks.push(breakY);
              currentPage += 1;
            }
          }
        }

        const totalMinHeight = (currentPage + 1) * A4_HEIGHT_PX + currentPage * PAGE_GAP_PX;
        sheet.style.minHeight = `${totalMinHeight}px`;

        lastSettledW = sheet.offsetWidth;
        lastSettledH = sheet.offsetHeight;
        lastSettledPmH = pm.offsetHeight;

        const nextBreaksStr = breaks.join(',');
        if (lastBreaksStrRef.current !== nextBreaksStr) {
          lastBreaksStrRef.current = nextBreaksStr;
          setA4PageBreaks(breaks);
        }

        // Construir metadatos reales por cada Hoja A4 física según la posición DOM final de cada bloque
        const totalSheets = currentPage + 1;
        const finalSheetRect = sheet.getBoundingClientRect();
        const buckets = Array.from({ length: totalSheets }, () => ({
          blocks: [] as PageBlock[],
          headingTitle: '',
          allTexts: [] as string[],
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
            for (let j = 0; j < lis.length; j++) {
              const li = lis[j];
              const sIdx = getElSheetIdx(li);
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
            continue;
          }

          if (child.classList.contains('tableWrapper') || tag === 'table') {
            const rows = Array.from(child.querySelectorAll('tr')) as HTMLElement[];
            const touchedSheets = new Set<number>();
            if (rows.length > 0) {
              for (const row of rows) {
                const sIdx = getElSheetIdx(row);
                touchedSheets.add(sIdx);
                const rowText = (row.textContent || '').trim();
                if (rowText) buckets[sIdx].allTexts.push(rowText);
              }
            } else {
              touchedSheets.add(getElSheetIdx(child));
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
          };
        });

        const sig = nextA4Sheets
          .map((s) => `${s.id}:${s.title}:${s.badgeText}:${s.blocks.length}:${s.snippet}`)
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
    const scheduleCalculate = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = null;
        calculateBreaks();
      });
    };

    calculateBreaks();

    const pmEl = sheetEl.querySelector('.ProseMirror') as HTMLElement | null;
    const ro = new ResizeObserver(() => {
      if (
        sheetEl.offsetWidth === lastSettledW &&
        sheetEl.offsetHeight === lastSettledH &&
        (!pmEl || pmEl.offsetHeight === lastSettledPmH)
      ) {
        return;
      }
      scheduleCalculate();
    });
    ro.observe(sheetEl);
    if (pmEl) ro.observe(pmEl);

    if (editor) {
      editor.on('update', scheduleCalculate);
    }

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      ro.disconnect();
      if (editor) {
        editor.off('update', scheduleCalculate);
      }
    };
  }, [pageFormat, activePageId, editor, a4HeaderFooterConfig]);

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
    <div className="flex-1 flex flex-col h-full bg-veyra-canvas overflow-hidden relative">
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
      <div className="h-10 border-b border-veyra-border px-4 flex items-center justify-between text-xs shrink-0 select-none bg-veyra-card/30">
        <div className="flex items-center gap-2 min-w-0 flex-1 mr-4">
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
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/[0.04] border border-veyra-border/60 text-[11px] text-veyra-muted max-w-[240px] sm:max-w-[360px] shrink-0">
              {breadcrumb.parentLabel && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      if (breadcrumb.parentFolderId && onSelectFolder) {
                        onSelectFolder(breadcrumb.parentFolderId);
                      }
                    }}
                    className={cn(
                      'flex items-center gap-1 text-veyra-muted hover:text-veyra-text transition-colors truncate',
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

                  <span className="text-veyra-subtle select-none text-[10px]">/</span>
                </>
              )}

              {breadcrumb.type === 'event' ? (
                <button
                  type="button"
                  onClick={() => onSelectEvent?.(breadcrumb.eventId)}
                  className="flex items-center gap-1 text-veyra-text hover:text-accent transition-colors cursor-pointer group truncate"
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
                  className="flex items-center gap-1 text-veyra-text hover:text-accent transition-colors cursor-pointer truncate"
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
          )}

          {/* Título editable en la barra superior cuando está activo el formato Hoja A4 */}
          {pageFormat === 'a4' && (
            <>
              {breadcrumb && (
                <span className="text-veyra-subtle select-none text-xs shrink-0">/</span>
              )}
              <HashtagInput
                value={title}
                onChange={(newTitle) => handleTitleChange(newTitle)}
                availableTags={['clase', 'apuntes', 'deberes', 'taller', 'examen', 'universidad', 'trabajo', 'proyecto']}
                placeholder="Sin título"
                multiline={false}
                onEnterPress={() => {
                  if (editor) {
                    editor.commands.focus('start');
                  }
                }}
                containerClassName="flex-1 max-w-xs sm:max-w-md min-w-[140px]"
                inputClassName="w-full bg-transparent hover:bg-black/5 dark:hover:bg-white/5 focus:bg-veyra-surface border border-transparent focus:border-accent/40 rounded-md px-2 py-1 text-xs sm:text-[13px] font-semibold text-veyra-text placeholder:text-veyra-muted/60 focus:outline-none transition-colors truncate"
              />
            </>
          )}
        </div>

      {/* Right: Presence Avatars, Status Dot & Actions */}
        <div className="flex items-center gap-2">
          <CollabPresence users={collabUsers} currentUserId={currentUserId} />

          {/* Discreet 6px status dot (Combina estado de sincronización y guardado) */}
          <div
            className="flex items-center justify-center p-1"
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
              'flex items-center gap-1.5 px-2 py-0.5 rounded text-xs transition-colors cursor-pointer border',
              pageFormat === 'a4'
                ? 'bg-accent/15 border-accent/40 text-accent font-semibold'
                : 'bg-white/5 border-veyra-border text-veyra-muted hover:text-veyra-text hover:bg-white/10'
            )}
          >
            {pageFormat === 'a4' ? (
              <>
                <FileText className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Hoja A4</span>
              </>
            ) : (
              <>
                <ScrollText className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Infinita</span>
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
              'p-1.5 rounded transition-colors cursor-pointer border flex items-center justify-center',
              isPagesSidebarOpen
                ? 'bg-accent/15 border-accent/40 text-accent'
                : 'bg-white/5 border-veyra-border text-veyra-muted hover:text-veyra-text hover:bg-white/10'
            )}
          >
            <Layers className="w-3.5 h-3.5" />
          </button>

          {/* Export to PDF Button */}
          <button
            type="button"
            onClick={handleOpenExportPdf}
            title="Exportar a PDF / Imprimir nota (Formato Word)"
            className="flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs transition-colors cursor-pointer border bg-white/5 border-veyra-border text-veyra-muted hover:text-veyra-text hover:bg-white/10"
          >
            <FileDown className="w-3.5 h-3.5 text-accent" />
            <span className="hidden sm:inline font-medium">Exportar PDF</span>
          </button>

          {onCloseNote && (
            <>
              <div className="w-[1px] h-3.5 bg-veyra-border mx-0.5" />
              <button
                type="button"
                onClick={handleClose}
                title="Cerrar nota"
                aria-label="Cerrar nota"
                className="p-1 rounded text-veyra-muted hover:text-veyra-text hover:bg-white/5 transition-colors cursor-pointer flex items-center justify-center"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Sleek Minimal Formatting Toolbar OR Word Header/Footer Design Ribbon */}
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
            const newImg = await createHeaderFooterImageFromFile(file, currentImages);
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
        <EditorToolbar editor={editor} onUploadImage={handleUploadImage} />
      )}

      {/* Workspace Area: Main Note Canvas + Docked Right Pages Sidebar */}
      <div className="flex-1 flex overflow-hidden relative bg-[#e4e7ec] dark:bg-black">
        {/* Visual Resting Canvas Margins (Lienzo exterior: más oscuro que el documento) */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 sm:py-8 transition-all duration-300 bg-[#e4e7ec] dark:bg-[#030304]"
          onClick={(e) => {
            // Clicking anywhere in the outside margins focuses the editor at the end
            if (e.target === e.currentTarget && editor) {
              if (activeHeaderFooterZone !== null) {
                setActiveHeaderFooterZone(null);
              }
              editor.commands.focus('end');
            }
          }}
        >
          {/* Note Document Sheet (Documento central: gris carbón oscuro y sobrio / Hoja A4) */}
          <div
            ref={docSheetRef}
            data-sheet-theme={isPaperLight ? 'light' : undefined}
            className={cn(
              'mx-auto w-full flex flex-col transition-all duration-200 relative',
              isPaperLight && 'sheet-light-mode',
              pageFormat === 'a4'
                ? cn(
                    'a4-page-mode max-w-[794px] min-h-[1123px] rounded-sm px-6 sm:px-[30mm] pt-8 sm:pt-[25mm] pb-12 sm:pb-[25mm] mb-4',
                    isPaperLight
                      ? 'bg-white border border-slate-300 shadow-[0_8px_30px_rgb(0,0,0,0.12)]'
                      : 'bg-white dark:bg-[#161619] border border-slate-300 dark:border-white/10 shadow-[0_8px_30px_rgb(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.6)]'
                  )
                : cn(
                    'max-w-[760px] rounded-2xl p-6 sm:p-12 shadow-2xl min-h-[calc(100vh-140px)]',
                    isPaperLight
                      ? 'bg-white border border-slate-300/80 shadow-2xl'
                      : 'bg-white dark:bg-[#161619] border border-slate-300/80 dark:border-white/8 shadow-2xl'
                  )
            )}
          >
            {pageFormat === 'a4' && <style ref={a4StyleRef} />}

            {/* Zonas interactivas de Encabezado y Pie de página (1,25 cm desde el borde, estilo Word) */}
            {pageFormat === 'a4' && (
              <A4SheetHeaderFooterZones
                config={a4HeaderFooterConfig}
                onChange={handleUpdateHeaderFooterConfig}
                totalSheets={a4PageBreaks.length + 1}
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
                  className="absolute -left-[1px] -right-[1px] h-[36px] pointer-events-none select-none z-20 flex flex-col justify-between"
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
                          'px-3 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase border shadow-sm',
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
                  onChange={(newTitle) => handleTitleChange(newTitle)}
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
                  isPaperLight ? 'text-slate-900' : 'text-veyra-text'
                )}
                onClick={() => {
                  if (editor && !editor.isFocused) {
                    editor.commands.focus();
                  }
                }}
              >
                <EditorContent editor={editor} className="flex-1" />
                <EditorBubbleMenu editor={editor} />
                <EditorImageBubbleMenu editor={editor} currentUserId={currentUserIdRef.current} />
                <EditorTableBubbleMenu editor={editor} />
                <EditorSlashMenu editor={editor} />
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

          {/* En modo Hoja A4, el contador de palabras va debajo de la última hoja para dejar libre el pie de página de 2.5cm */}
          {pageFormat === 'a4' && (
            <div className="mx-auto max-w-[794px] mb-10 px-2 flex items-center justify-between text-xs">
              <EditorWordCount editor={editor} pageFormat={pageFormat} />
            </div>
          )}
        </div>

        {/* Docked Right Pages Sidebar: pushes the canvas so note is 100% visible */}
        <div
          className={cn(
            'h-full border-l border-veyra-border bg-veyra-card flex flex-col shrink-0 overflow-hidden transition-[width,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
            isPagesSidebarOpen ? 'w-80 opacity-100' : 'w-0 opacity-0 pointer-events-none'
          )}
        >
          <div style={{ width: '320px' }} className="h-full flex flex-col">
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
  const [loadedData, setLoadedData] = useState<YjsLoadedNote | null>(null);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadedDataRef = useRef<YjsLoadedNote | null>(null);

  const isCurrentDocLoaded = loadedData && loadedData.noteId === note?.id;

  useEffect(() => {
    if (!note?.id) {
      if (loadedDataRef.current) {
        loadedDataRef.current.destroy();
        loadedDataRef.current = null;
      }
      setLoadedData(null);
      return;
    }

    let isCancelled = false;
    setLoadingDoc(true);
    setLoadError(null);

    loadYjsNote(note.id)
      .then((data) => {
        if (!isCancelled) {
          if (loadedDataRef.current && loadedDataRef.current !== data) {
            loadedDataRef.current.destroy();
          }
          loadedDataRef.current = data;
          setLoadedData(data);
          setLoadingDoc(false);
        } else {
          // If cancelled (e.g. StrictMode unmount or user clicked another note immediately)
          data.destroy();
        }
      })
      .catch((err) => {
        console.error('[NoteEditor] Error descargando nota Yjs:', err);
        if (!isCancelled) {
          setLoadError('Error descargando el contenido de la nota.');
          setLoadingDoc(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [note?.id]);

  // Clean up loaded note on final component unmount
  useEffect(() => {
    return () => {
      if (loadedDataRef.current) {
        loadedDataRef.current.destroy();
        loadedDataRef.current = null;
      }
    };
  }, []);

  if (!note) {
    return (
      <div className="flex-1 flex flex-col h-full bg-veyra-canvas select-none">
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

  if (loadingDoc || !isCurrentDocLoaded) {
    return (
      <div className="flex-1 flex flex-col h-full bg-veyra-canvas">
        {!isSidebarOpen && onToggleSidebar ? (
          <div className="h-10 border-b border-veyra-border px-4 flex items-center justify-between text-xs shrink-0 bg-veyra-card/30">
            <button
              type="button"
              onClick={onToggleSidebar}
              title="Mostrar barra lateral (Ctrl+\)"
              className="p-1.5 rounded-md text-veyra-muted hover:text-accent hover:bg-white/5 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              <PanelLeft className="w-4 h-4 text-accent" />
              <span className="text-xs text-veyra-muted font-medium">Mostrar notas</span>
            </button>
            {onCloseNote && (
              <button
                type="button"
                onClick={onCloseNote}
                title="Cerrar nota"
                className="p-1 rounded text-veyra-muted hover:text-veyra-text hover:bg-white/5 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ) : onCloseNote ? (
          <div className="h-10 border-b border-veyra-border px-4 flex items-center justify-end text-xs shrink-0 bg-veyra-card/30">
            <button
              type="button"
              onClick={onCloseNote}
              title="Cerrar nota"
              className="p-1 rounded text-veyra-muted hover:text-veyra-text hover:bg-white/5 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : null}
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-veyra-muted">
          <Loader2 className="w-6 h-6 text-accent animate-spin mb-3" />
          <h3 className="text-sm font-medium text-veyra-text">Cargando nota...</h3>
        </div>
      </div>
    );
  }

  if (loadError || !loadedData) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-veyra-muted bg-veyra-canvas">
        <div className="p-3 rounded-md bg-red-500/10 border border-red-500/30 text-red-400 text-xs mb-3">
          {loadError || 'No se pudo inicializar el documento colaborativo.'}
        </div>
        <button
          onClick={() => {
            if (note?.id) {
              setLoadingDoc(true);
              loadYjsNote(note.id)
                .then((data) => {
                  if (loadedDataRef.current) loadedDataRef.current.destroy();
                  loadedDataRef.current = data;
                  setLoadedData(data);
                })
                .finally(() => setLoadingDoc(false));
            }
          }}
          className="px-3 py-1.5 rounded-md bg-veyra-card border border-veyra-border hover:border-accent text-xs text-veyra-text transition-colors cursor-pointer"
        >
          Reintentar sincronización
        </button>
      </div>
    );
  }

  return (
    <YjsActiveEditor
      key={`${note.id}`}
      note={{ ...note, sync_mode: loadedData.syncMode }}
      ydoc={loadedData.ydoc}
      awareness={loadedData.awareness}
      initialActivePageId={loadedData.activePageId}
      initialPages={loadedData.pageOrder}
      initialMetaTitle={loadedData.metaTitle}
      initialServerClock={loadedData.highestUpdateId}
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
    />
  );
};
