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
import { MathBlock, MathInline } from './extensions/MathNode';
import {
  hasMathContent,
  hasMarkdownContent,
  convertMarkdownWithMathToHtml,
  cleanAiClipboardArtifacts,
  hydrateMathInHtml,
} from './extensions/mathUtils';
import { YoutubeNode } from '../../lib/tiptap-youtube-node';
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
import { EditorListNumberTooltip } from './components/EditorListNumberTooltip';
import {
  CustomTable,
  CustomTableRow,
  CustomTableHeader,
  CustomTableCell,
} from './extensions/TableExtensions';
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
import { Loader2, Plus, ChevronLeft, ChevronRight, PanelLeft, X, Layers, GraduationCap, Folder as FolderIcon, Calendar, FileDown } from 'lucide-react';
import { useTheme } from '../../theme/ThemeProvider';
import { PagesSidebar } from './PagesSidebar';
import { ExportPdfModal } from './pdf/ExportPdfModal';
import { HashtagInput } from '../../components/common/HashtagInput';

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
  const [isPageMenuOpen, setIsPageMenuOpen] = useState(false);
  const [isPagesSidebarOpen, setIsPagesSidebarOpen] = useState(true);
  const pageMenuRef = useRef<HTMLDivElement>(null);

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
  const { palette } = useTheme();

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

  // Close page popover on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pageMenuRef.current && !pageMenuRef.current.contains(e.target as Node)) {
        setIsPageMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  // Listen to remote changes to meta map (title)
  useEffect(() => {
    const metaMap = ydoc.getMap('meta');
    const handleMetaChange = () => {
      const remoteTitle = metaMap.get('title') as string | undefined;
      if (remoteTitle !== undefined && remoteTitle !== title) {
        setTitle(remoteTitle);
      }
    };
    metaMap.observe(handleMetaChange);

    return () => {
      metaMap.unobserve(handleMetaChange);
      if (saveDebounceTimeoutRef.current) clearTimeout(saveDebounceTimeoutRef.current);
    };
  }, [ydoc, title]);

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
        }),
        CustomOrderedList,
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

  const currentPageIndex = Math.max(0, pages.indexOf(activePageId));

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
        <div className="flex items-center gap-2">
          {!isSidebarOpen && onToggleSidebar && (
            <button
              type="button"
              onClick={onToggleSidebar}
              title="Mostrar barra lateral (Ctrl+\)"
              className="p-1 rounded text-veyra-muted hover:text-accent hover:bg-white/5 transition-colors cursor-pointer flex items-center justify-center mr-0.5"
            >
              <PanelLeft className="w-4 h-4 text-accent" />
            </button>
          )}

          {/* Left: Compact Page Indicator ‹ 3 / 15 › and + */}
          <div className="relative flex items-center gap-1" ref={pageMenuRef}>

          <button
            type="button"
            onClick={() => {
              if (currentPageIndex > 0) {
                handleSelectPage(pages[currentPageIndex - 1]);
              }
            }}
            disabled={currentPageIndex <= 0}
            title="Página anterior"
            className="p-1 rounded text-veyra-muted hover:text-veyra-text disabled:opacity-20 disabled:pointer-events-none transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setIsPagesSidebarOpen(!isPagesSidebarOpen)}
            className="px-2 py-0.5 rounded text-veyra-muted hover:text-veyra-text hover:bg-white/5 font-medium transition-colors cursor-pointer"
            title="Mostrar / ocultar hojas"
          >
            {currentPageIndex + 1} / {pages.length}
          </button>

          <button
            type="button"
            onClick={() => {
              if (currentPageIndex < pages.length - 1) {
                handleSelectPage(pages[currentPageIndex + 1]);
              }
            }}
            disabled={currentPageIndex >= pages.length - 1}
            title="Página siguiente"
            className="p-1 rounded text-veyra-muted hover:text-veyra-text disabled:opacity-20 disabled:pointer-events-none transition-colors cursor-pointer"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={handleAddPage}
            title="Agregar nueva página"
            className="p-1 rounded text-veyra-muted hover:text-accent hover:bg-white/5 transition-colors ml-0.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>

          {/* Page Selection Popover */}
          {isPageMenuOpen && (
            <div className="absolute top-8 left-0 w-44 max-h-60 overflow-y-auto p-1 rounded-md bg-veyra-surface border border-veyra-border shadow-elevated z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="px-2 py-1 text-[10px] font-semibold text-veyra-subtle uppercase tracking-wider">
                Páginas ({pages.length})
              </div>
              <div className="space-y-0.5">
                {pages.map((pid, idx) => {
                  const isCurrent = pid === activePageId;
                  const fragKey = resolvePageFragmentName(ydoc, pid);
                  const frag = ydoc.getXmlFragment(fragKey);
                  const hasContent = frag.length > 0;

                  return (
                    <button
                      key={pid}
                      type="button"
                      onClick={() => {
                        handleSelectPage(pid);
                        setIsPageMenuOpen(false);
                      }}
                      className={cn(
                        'w-full flex items-center justify-between px-2 py-1.5 rounded text-left text-xs transition-colors cursor-pointer',
                        isCurrent
                          ? 'bg-accent/15 text-accent font-semibold'
                          : 'text-veyra-muted hover:text-veyra-text hover:bg-white/5'
                      )}
                    >
                      <span>Página {idx + 1}</span>
                      {hasContent && (
                        <span
                          className={cn(
                            'w-1.5 h-1.5 rounded-full',
                            isCurrent ? 'bg-accent' : 'bg-veyra-subtle'
                          )}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Breadcrumb de Ubicación Unificado (Optimización de cabecera) */}
        {breadcrumb && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/[0.04] border border-veyra-border/60 text-[11px] text-veyra-muted ml-1 max-w-[260px] sm:max-w-[420px]">
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
      </div>

      {/* Right: Presence Avatars, Status Dot & Saved Text */}
        <div className="flex items-center gap-2.5">
          <CollabPresence users={collabUsers} currentUserId={currentUserId} />

          {/* Discreet 6px status dot */}
          <div
            className="flex items-center justify-center p-0.5"
            title={
              syncStatus === 'connected'
                ? 'Colaboración en vivo activa'
                : syncStatus === 'connecting'
                ? 'Conectando con Supabase Realtime...'
                : 'Desconectado'
            }
          >
            <span
              className={cn(
                'w-1.5 h-1.5 rounded-full transition-colors',
                syncStatus === 'connected'
                  ? 'bg-emerald-500'
                  : syncStatus === 'connecting'
                  ? 'bg-amber-500 animate-pulse'
                  : 'bg-zinc-600'
              )}
            />
          </div>

          {/* Small gray saved status */}
          <span className="text-[12px] text-veyra-subtle">
            {saveStatus === 'saving'
              ? 'Guardando...'
              : saveStatus === 'error'
              ? 'Error al guardar'
              : 'Guardado'}
          </span>

          {/* Toggle Floating Pages Sidebar Button */}
          <button
            type="button"
            onClick={() => setIsPagesSidebarOpen(!isPagesSidebarOpen)}
            title="Panel de hojas y previsualizaciones"
            className={cn(
              'flex items-center gap-1.5 px-2 py-0.5 rounded text-xs transition-colors cursor-pointer border',
              isPagesSidebarOpen
                ? 'bg-accent/15 border-accent/40 text-accent font-semibold'
                : 'bg-white/5 border-veyra-border text-veyra-muted hover:text-veyra-text hover:bg-white/10'
            )}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Hojas</span>
            <span className="px-1.5 py-0.2 rounded-full bg-accent/20 text-accent text-[10px] font-bold">
              {pages.length}
            </span>
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

      {/* Sleek Minimal Formatting Toolbar */}
      <EditorToolbar editor={editor} onUploadImage={handleUploadImage} />

      {/* Workspace Area: Main Note Canvas + Docked Right Pages Sidebar */}
      <div className="flex-1 flex overflow-hidden relative bg-[#e4e7ec] dark:bg-black">
        {/* Visual Resting Canvas Margins (Lienzo exterior: más oscuro que el documento) */}
        <div
          className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 sm:py-8 transition-all duration-300 bg-[#e4e7ec] dark:bg-[#030304]"
          onClick={(e) => {
            // Clicking anywhere in the outside margins focuses the editor at the end
            if (e.target === e.currentTarget && editor) {
              editor.commands.focus('end');
            }
          }}
        >
          {/* Note Document Sheet (Documento central: gris carbón oscuro y sobrio) */}
          <div className="max-w-[760px] mx-auto w-full bg-white dark:bg-[#161619] border border-slate-300/80 dark:border-white/8 rounded-2xl p-6 sm:p-12 shadow-2xl min-h-[calc(100vh-140px)] flex flex-col transition-colors">
            {/* Note Title: autocompletado de #, multilínea con salto de línea automático y fuente discreta */}
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
              inputClassName="w-full bg-transparent text-lg sm:text-xl font-medium tracking-tight text-veyra-text/90 placeholder:text-slate-400/60 dark:placeholder:text-veyra-subtle/30 focus:outline-none border-0 p-0 leading-snug transition-colors resize-none overflow-hidden"
            />

            {/* Tiptap Native DOM Editor + BubbleMenu + SlashMenu */}
            <div
              className="w-full flex-1 flex flex-col text-veyra-text"
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
