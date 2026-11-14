import React, { useState, useMemo, useEffect } from 'react';
import {
  Layers,
  Plus,
  X,
  Search,
  Copy,
  Trash2,
  LayoutGrid,
  List,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  CheckSquare,
  Square,
  FileText,
  Table,
  Image as ImageIcon,
  Video,
  MoreVertical,
  Pencil,
  RotateCcw,
  GripVertical,
  Check,
} from 'lucide-react';
import * as Y from 'yjs';
import { cn } from '../../lib/utils';
import { resolvePageFragmentName } from '../../lib/yjs-loader';

export interface PagesSidebarProps {
  onClose: () => void;
  pages: string[];
  activePageId: string;
  onSelectPage: (pageId: string) => void;
  onAddPage: () => void;
  ydoc: Y.Doc;
  noteTitle?: string;
  onSave?: () => void;
  pageFormat?: 'infinite' | 'a4';
  a4Sheets?: PageMeta[];
  activeA4SheetIndex?: number;
  onSelectA4Sheet?: (sheetIndex: number) => void;
}

export interface PageBlock {
  id: string;
  type: 'heading' | 'paragraph' | 'bullet' | 'task' | 'code' | 'quote' | 'table' | 'image' | 'youtube';
  text: string;
  level?: number;
  checked?: boolean;
  src?: string;
  videoId?: string;
}

export interface PageMeta {
  id: string;
  index: number;
  title: string;
  snippet: string;
  blocks: PageBlock[];
  paragraphCount: number;
  wordCount: number;
  bulletCount: number;
  taskCount: number;
  badgeText: string;
}

/**
 * Extracts real blocks, text, and structure directly from the Yjs XML fragment of a page.
 * Detects H1, H2, and H3 headings for the sheet title.
 */
function extractBlocksFromFragment(frag: Y.XmlFragment): {
  blocks: PageBlock[];
  headingTitle: string;
  plainText: string;
  stats: {
    words: number;
    paragraphs: number;
    bullets: number;
    tasks: number;
    headings: number;
    tables: number;
    images: number;
  };
} {
  const blocks: PageBlock[] = [];
  let headingTitle = '';
  const allTexts: string[] = [];
  const stats = {
    words: 0,
    paragraphs: 0,
    bullets: 0,
    tasks: 0,
    headings: 0,
    tables: 0,
    images: 0,
  };

  const stripTags = (xml: string) => xml.replace(/<[^>]+>/g, '').trim();

  try {
    const items = frag.toArray();
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item instanceof Y.XmlElement) {
        const name = item.nodeName.toLowerCase();

        if (name === 'heading' || /^h[1-6]$/.test(name)) {
          const text = stripTags(item.toString());
          if (text) {
            const lvlAttr = item.getAttribute('level');
            const level =
              typeof lvlAttr === 'number'
                ? lvlAttr
                : parseInt(String(lvlAttr || '1'), 10) || 1;
            blocks.push({
              id: `${i}`,
              type: 'heading',
              text,
              level,
            });
            // Priority: The first H1, H2, or H3 heading becomes the title of the sheet
            if (!headingTitle) headingTitle = text;
            allTexts.push(text);
            stats.headings++;
          }
        } else if (name === 'paragraph' || name === 'p') {
          const text = stripTags(item.toString());
          if (text) {
            blocks.push({
              id: `${i}`,
              type: 'paragraph',
              text,
            });
            allTexts.push(text);
            stats.paragraphs++;
          }
        } else if (
          name === 'bulletlist' ||
          name === 'ul' ||
          name === 'orderedlist' ||
          name === 'ol'
        ) {
          const listChildren = item.toArray();
          for (let j = 0; j < listChildren.length; j++) {
            const child = listChildren[j];
            const text = stripTags(child.toString());
            if (text) {
              blocks.push({
                id: `${i}-${j}`,
                type: 'bullet',
                text,
              });
              allTexts.push(text);
              stats.bullets++;
            }
          }
        } else if (name === 'tasklist') {
          const taskChildren = item.toArray();
          for (let j = 0; j < taskChildren.length; j++) {
            const child = taskChildren[j];
            const text = stripTags(child.toString());
            const checked =
              child instanceof Y.XmlElement
                ? child.getAttribute('checked') === 'true'
                : false;
            if (text) {
              blocks.push({
                id: `${i}-${j}`,
                type: 'task',
                text,
                checked,
              });
              allTexts.push(text);
              stats.tasks++;
            }
          }
        } else if (name === 'codeblock' || name === 'pre') {
          const text = stripTags(item.toString());
          if (text) {
            blocks.push({
              id: `${i}`,
              type: 'code',
              text,
            });
            allTexts.push(text);
          }
        } else if (name === 'blockquote') {
          const text = stripTags(item.toString());
          if (text) {
            blocks.push({
              id: `${i}`,
              type: 'quote',
              text,
            });
            allTexts.push(text);
          }
        } else if (name === 'table') {
          blocks.push({
            id: `${i}`,
            type: 'table',
            text: 'Tabla',
          });
          stats.tables++;
        } else if (name === 'image' || name === 'img') {
          const src = (item.getAttribute('src') as string) || '';
          blocks.push({
            id: `${i}`,
            type: 'image',
            text: 'Imagen',
            src,
          });
          stats.images++;
        } else if (name === 'youtube') {
          const videoId = (item.getAttribute('videoId') as string) || '';
          blocks.push({
            id: `${i}`,
            type: 'youtube',
            text: 'Video de YouTube',
            videoId,
          });
        }
      } else if (item instanceof Y.XmlText) {
        const text = item.toString().trim();
        if (text) {
          blocks.push({
            id: `${i}`,
            type: 'paragraph',
            text,
          });
          allTexts.push(text);
          stats.paragraphs++;
        }
      }
    }
  } catch (err) {
    console.error('Error reading Yjs fragment blocks:', err);
  }

  // Fallback if blocks is still empty but fragment has string representation
  if (blocks.length === 0) {
    const rawStr = frag.toString();
    const clean = stripTags(rawStr);
    if (clean) {
      blocks.push({
        id: 'fallback-0',
        type: 'paragraph',
        text: clean,
      });
      allTexts.push(clean);
      stats.paragraphs = 1;
    }
  }

  const plainText = allTexts.join(' ');
  const words = plainText ? plainText.split(/\s+/).filter(Boolean) : [];
  stats.words = words.length;

  return { blocks, headingTitle, plainText, stats };
}

export const PagesSidebar: React.FC<PagesSidebarProps> = ({
  onClose,
  pages,
  activePageId,
  onSelectPage,
  onAddPage,
  ydoc,
  noteTitle,
  onSave,
  pageFormat = 'infinite',
  a4Sheets,
  activeA4SheetIndex = 0,
  onSelectA4Sheet,
}) => {
  const isA4Mode = pageFormat === 'a4';
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [isReordering, setIsReordering] = useState(false);
  const [updateTick, setUpdateTick] = useState(0);

  // Compact menu state
  const [activeMenuPageId, setActiveMenuPageId] = useState<string | null>(null);

  // Inline rename state
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  // Drag and drop state
  const [draggedPageId, setDraggedPageId] = useState<string | null>(null);
  const [dragOverPageId, setDragOverPageId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'before' | 'after' | null>(null);

  // Subscribe to real-time doc updates and custom page titles
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const handleDocUpdate = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        setUpdateTick((t) => t + 1);
      }, 150);
    };

    ydoc.on('update', handleDocUpdate);
    const titlesMap = ydoc.getMap<string>('pageCustomTitles');
    titlesMap.observe(handleDocUpdate);

    return () => {
      ydoc.off('update', handleDocUpdate);
      titlesMap.unobserve(handleDocUpdate);
      if (timer) clearTimeout(timer);
    };
  }, [ydoc]);

  // Click outside listener for compact menu
  useEffect(() => {
    if (!activeMenuPageId) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.page-menu-dropdown') && !target.closest('.page-menu-trigger')) {
        setActiveMenuPageId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [activeMenuPageId]);

  // Extract real metadata and blocks for each page from Yjs document (or physical A4 sheets in A4 mode)
  const pagesMeta: PageMeta[] = useMemo(() => {
    const titlesMap = ydoc.getMap<string>('pageCustomTitles');

    if (isA4Mode && a4Sheets && a4Sheets.length > 0) {
      return a4Sheets.map((sheet) => {
        const customTitle = titlesMap.get(sheet.id);
        return {
          ...sheet,
          title: customTitle || sheet.title || `Hoja ${sheet.index + 1}`,
        };
      });
    }

    return pages.map((pid, idx) => {
      const fragKey = resolvePageFragmentName(ydoc, pid);
      const frag = ydoc.getXmlFragment(fragKey);
      const { blocks, headingTitle, plainText, stats } = extractBlocksFromFragment(frag);

      // Priority: 1. User custom title, 2. Heading title (H1, H2, H3), 3. Default "Hoja X"
      const customTitle = titlesMap.get(pid);
      const title = customTitle || headingTitle || `Hoja ${idx + 1}`;

      const snippet =
        plainText.length > 25 ? plainText.slice(0, 25) + '...' : plainText || 'Sin contenido...';

      let badgeText = 'Hoja vacía';
      if (stats.tasks > 0) {
        badgeText = `${stats.tasks} ${stats.tasks === 1 ? 'tarea' : 'tareas'}`;
      } else if (stats.bullets > 0) {
        badgeText = `${stats.bullets} ${stats.bullets === 1 ? 'punto' : 'puntos'}`;
      } else if (stats.tables > 0) {
        badgeText = `${stats.tables} ${stats.tables === 1 ? 'tabla' : 'tablas'}`;
      } else if (stats.words > 0) {
        const pCount = stats.paragraphs || 1;
        const pLabel = pCount === 1 ? 'párrafo' : 'párrafos';
        const wLabel = stats.words === 1 ? 'palabra' : 'pal';
        badgeText = `${pCount} ${pLabel} · ${stats.words} ${wLabel}`;
      }

      return {
        id: pid,
        index: idx,
        title,
        snippet,
        blocks,
        paragraphCount: stats.paragraphs,
        wordCount: stats.words,
        bulletCount: stats.bullets,
        taskCount: stats.tasks,
        badgeText,
      };
    });
  }, [isA4Mode, a4Sheets, pages, ydoc, updateTick]);

  // Filtered by search
  const filteredPages = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pagesMeta;
    return pagesMeta.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.snippet.toLowerCase().includes(q) ||
        `hoja ${p.index + 1}`.includes(q) ||
        `página ${p.index + 1}`.includes(q)
    );
  }, [pagesMeta, search]);

  // Insert page at exact position (between cards)
  const handleInsertPageAt = (index: number) => {
    const newPageId = crypto.randomUUID();
    const po = ydoc.getArray<string>('pageOrder');
    if (index >= po.length) {
      po.push([newPageId]);
    } else {
      po.insert(index, [newPageId]);
    }
    onSelectPage(newPageId);
    onSave?.();
  };

  // Start inline rename
  const handleStartRename = (pageId: string, currentTitle: string) => {
    setActiveMenuPageId(null);
    setEditingPageId(pageId);
    setEditingTitle(currentTitle);
  };

  // Save renamed title
  const handleSaveTitle = (pageId: string) => {
    const map = ydoc.getMap<string>('pageCustomTitles');
    const trimmed = editingTitle.trim();
    if (trimmed) {
      map.set(pageId, trimmed);
    } else {
      map.delete(pageId);
    }
    setEditingPageId(null);
    onSave?.();
  };

  // Clear page content
  const handleClearContent = (pageId: string) => {
    setActiveMenuPageId(null);
    const fragKey = resolvePageFragmentName(ydoc, pageId);
    const frag = ydoc.getXmlFragment(fragKey);
    const len = frag.length;
    if (len > 0) {
      frag.delete(0, len);
      const p = new Y.XmlElement('paragraph');
      frag.insert(0, [p]);
    }
    onSave?.();
  };

  // Duplicate page action
  const handleDuplicate = (e: React.MouseEvent, pageId: string) => {
    e.stopPropagation();
    const newPageId = crypto.randomUUID();
    const po = ydoc.getArray<string>('pageOrder');
    const idx = po.toArray().indexOf(pageId);

    const sourceKey = resolvePageFragmentName(ydoc, pageId);
    const targetKey = resolvePageFragmentName(ydoc, newPageId);
    const sourceFrag = ydoc.getXmlFragment(sourceKey);
    const targetFrag = ydoc.getXmlFragment(targetKey);

    try {
      const cloned = sourceFrag
        .toArray()
        .filter(
          (item): item is Y.XmlElement | Y.XmlText =>
            item instanceof Y.XmlElement || item instanceof Y.XmlText
        )
        .map((item) => item.clone());
      targetFrag.insert(0, cloned);
    } catch {
      const sourceText = sourceFrag.toString().replace(/<[^>]+>/g, '');
      if (sourceText) {
        targetFrag.insert(0, [new Y.XmlElement('paragraph')]);
      }
    }

    if (idx >= 0) {
      po.insert(idx + 1, [newPageId]);
    } else {
      po.push([newPageId]);
    }
    onSelectPage(newPageId);
    onSave?.();
  };

  // Delete page action
  const handleDelete = (e: React.MouseEvent, pageId: string) => {
    e.stopPropagation();
    if (pages.length <= 1) return;
    const po = ydoc.getArray<string>('pageOrder');
    const idx = po.toArray().indexOf(pageId);
    if (idx >= 0) {
      po.delete(idx, 1);
      // Clean custom title
      const titlesMap = ydoc.getMap<string>('pageCustomTitles');
      titlesMap.delete(pageId);

      const remaining = po.toArray();
      const nextActive = remaining[Math.min(idx, remaining.length - 1)];
      if (nextActive) onSelectPage(nextActive);
      onSave?.();
    }
  };

  // Move page up / down (legacy / accessible mode)
  const handleMove = (e: React.MouseEvent, pageId: string, direction: 'up' | 'down') => {
    e.stopPropagation();
    const po = ydoc.getArray<string>('pageOrder');
    const arr = po.toArray();
    const idx = arr.indexOf(pageId);
    if (direction === 'up' && idx > 0) {
      po.delete(idx, 1);
      po.insert(idx - 1, [pageId]);
      onSave?.();
    } else if (direction === 'down' && idx < arr.length - 1) {
      po.delete(idx, 1);
      po.insert(idx + 1, [pageId]);
      onSave?.();
    }
  };

  // Drag and drop reordering
  const handleDropReorder = (sourceId: string, targetId: string, pos: 'before' | 'after') => {
    if (sourceId === targetId) return;
    const po = ydoc.getArray<string>('pageOrder');
    const arr = po.toArray();
    const sourceIndex = arr.indexOf(sourceId);
    const targetIndex = arr.indexOf(targetId);
    if (sourceIndex === -1 || targetIndex === -1) return;

    po.delete(sourceIndex, 1);
    const newArr = po.toArray();
    let insertIndex = newArr.indexOf(targetId);
    if (pos === 'after') {
      insertIndex += 1;
    }
    po.insert(insertIndex, [sourceId]);
    onSave?.();
  };

  return (
    <div className="w-full h-full flex flex-col bg-veyra-canvas text-veyra-text select-none text-xs overflow-hidden">
      {/* 1. Header: Icon + Title + Count + Nueva Button + Close */}
      <div className="px-3 py-2 border-b border-veyra-border flex items-center justify-between shrink-0 bg-veyra-card">
        <div className="flex items-center gap-2 min-w-0" title={noteTitle ? `Hojas de: ${noteTitle}` : 'Hojas'}>
          <Layers className="w-4 h-4 text-accent shrink-0" />
          <h3 className="font-semibold text-xs text-veyra-text tracking-tight">
            {isA4Mode ? 'Hojas A4' : 'Hojas'}
          </h3>
          <span className="px-1.5 py-0.2 rounded-full bg-accent/15 border border-accent/25 text-accent font-mono text-[10px] font-bold">
            {pagesMeta.length}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {!isA4Mode && (
            <button
              type="button"
              onClick={onAddPage}
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-accent text-white text-[10.5px] font-medium hover:opacity-90 shadow-2xs cursor-pointer transition-opacity"
              title="Añadir hoja al final"
            >
              <Plus className="w-3 h-3 stroke-[2.5]" />
              <span>Nueva</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-veyra-subtle hover:text-veyra-text hover:bg-veyra-hover transition-colors cursor-pointer"
            title="Ocultar panel de hojas"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. Search input */}
      <div className="px-3 py-1.5 border-b border-veyra-border shrink-0 bg-veyra-canvas">
        <div className="relative">
          <Search className="w-3 h-3 text-veyra-subtle absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar en hojas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-7 bg-veyra-elevated text-veyra-text placeholder:text-veyra-subtle rounded-md pl-7 pr-6 text-[11px] border border-veyra-border focus:border-accent/80 focus:ring-1 focus:ring-accent/20 outline-none transition-all shadow-2xs"
          />
          {search.trim().length > 0 && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-veyra-subtle hover:text-veyra-text p-0.5 rounded cursor-pointer"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          )}
        </div>
      </div>

      {/* 3. Cards Container (Scrollable) */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        {filteredPages.length === 0 ? (
          <div className="p-6 text-center text-veyra-subtle text-xs">
            No se encontraron hojas que coincidan con la búsqueda.
          </div>
        ) : (
          <div className={cn(viewMode === 'grid' ? 'grid grid-cols-2 gap-2' : 'space-y-1.5')}>
            {filteredPages.map((page) => {
              const isCurrent = isA4Mode
                ? page.index === activeA4SheetIndex
                : page.id === activePageId;
              const isEditing = editingPageId === page.id;
              const isMenuOpen = activeMenuPageId === page.id;

              return (
                <React.Fragment key={page.id}>
                  {/* Card Element */}
                  <div
                    draggable={!isA4Mode && !isEditing && !isReordering}
                    onDragStart={(e) => {
                      if (isA4Mode) return;
                      e.dataTransfer.setData('text/plain', page.id);
                      e.dataTransfer.effectAllowed = 'move';
                      setDraggedPageId(page.id);
                    }}
                    onDragOver={(e) => {
                      if (isA4Mode) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      if (draggedPageId && draggedPageId !== page.id) {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const midY = rect.top + rect.height / 2;
                        setDragOverPageId(page.id);
                        setDropPosition(e.clientY < midY ? 'before' : 'after');
                      }
                    }}
                    onDragLeave={(e) => {
                      if (isA4Mode) return;
                      if (e.currentTarget === e.target) {
                        setDragOverPageId(null);
                        setDropPosition(null);
                      }
                    }}
                    onDrop={(e) => {
                      if (isA4Mode) return;
                      e.preventDefault();
                      if (draggedPageId && draggedPageId !== page.id) {
                        handleDropReorder(draggedPageId, page.id, dropPosition || 'after');
                      }
                      setDraggedPageId(null);
                      setDragOverPageId(null);
                      setDropPosition(null);
                    }}
                    onDragEnd={() => {
                      setDraggedPageId(null);
                      setDragOverPageId(null);
                      setDropPosition(null);
                    }}
                    onClick={() => {
                      if (!isEditing) {
                        if (isA4Mode) {
                          onSelectA4Sheet?.(page.index);
                        } else {
                          onSelectPage(page.id);
                        }
                      }
                    }}
                    className={cn(
                      'group rounded-xl border p-2.5 transition-all cursor-pointer relative flex flex-col gap-2',
                      isCurrent
                        ? 'bg-accent/[0.08] border-accent shadow-sm ring-1 ring-accent/30'
                        : 'bg-veyra-card hover:bg-veyra-elevated border-veyra-border hover:border-accent/40 shadow-2xs hover:shadow-xs',
                      draggedPageId === page.id && 'opacity-35 scale-[0.98] border-dashed border-accent/60'
                    )}
                  >
                    {/* Drag insertion line indicators */}
                    {dragOverPageId === page.id && dropPosition === 'before' && (
                      <div className="absolute -top-1 left-2 right-2 h-1 bg-accent rounded-full shadow-[0_0_8px_rgba(96,165,250,0.8)] z-30 pointer-events-none" />
                    )}
                    {dragOverPageId === page.id && dropPosition === 'after' && (
                      <div className="absolute -bottom-1 left-2 right-2 h-1 bg-accent rounded-full shadow-[0_0_8px_rgba(96,165,250,0.8)] z-30 pointer-events-none" />
                    )}

                    {/* Card Header: Drag Handle + Number + Title + Compact Menu */}
                    <div className="flex items-center justify-between gap-1.5 relative">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        {/* Drag grip icon */}
                        {!isA4Mode && !isReordering && (
                          <div
                            className="opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing text-veyra-subtle hover:text-accent shrink-0 -ml-1"
                            title="Arrastra para reordenar"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <GripVertical className="w-3.5 h-3.5" />
                          </div>
                        )}

                        {/* Number badge */}
                        <span
                          className={cn(
                            'w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold font-mono shrink-0 border transition-colors',
                            isCurrent
                              ? 'bg-accent border-accent text-white shadow-xs'
                              : 'bg-veyra-elevated border-veyra-border text-veyra-muted'
                          )}
                        >
                          {page.index + 1}
                        </span>

                        {/* Title: Inline edit or standard label */}
                        {isEditing ? (
                          <div
                            className="flex items-center gap-1 flex-1 min-w-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="text"
                              autoFocus
                              value={editingTitle}
                              onChange={(e) => setEditingTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveTitle(page.id);
                                if (e.key === 'Escape') setEditingPageId(null);
                              }}
                              className="w-full bg-veyra-card border border-accent rounded px-1.5 py-0.5 text-xs text-veyra-text outline-none font-semibold shadow-xs"
                              placeholder="Nombre de la hoja..."
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveTitle(page.id)}
                              className="p-1 rounded text-accent hover:bg-accent/15 cursor-pointer"
                              title="Guardar nombre"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingPageId(null)}
                              className="p-1 rounded text-veyra-subtle hover:text-veyra-text cursor-pointer"
                              title="Cancelar"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span
                            onDoubleClick={() => handleStartRename(page.id, page.title)}
                            title="Doble clic para renombrar"
                            className={cn(
                              'font-semibold text-xs truncate select-none',
                              isCurrent
                                ? 'text-veyra-text font-bold'
                                : 'text-veyra-muted group-hover:text-veyra-text'
                            )}
                          >
                            {page.title}
                          </span>
                        )}
                      </div>

                      {/* Header right: Compact actions menu */}
                      <div className="flex items-center gap-1 shrink-0">
                        {/* Reorder arrows mode */}
                        {isReordering ? (
                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              disabled={page.index === 0}
                              onClick={(e) => handleMove(e, page.id, 'up')}
                              className="p-0.5 rounded hover:bg-veyra-hover text-veyra-subtle hover:text-veyra-text disabled:opacity-20 cursor-pointer"
                            >
                              <ChevronUp className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              disabled={page.index === pages.length - 1}
                              onClick={(e) => handleMove(e, page.id, 'down')}
                              className="p-0.5 rounded hover:bg-veyra-hover text-veyra-subtle hover:text-veyra-text disabled:opacity-20 cursor-pointer"
                            >
                              <ChevronDown className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          /* Compact 3-dots Menu Button */
                          <div className="relative">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveMenuPageId(isMenuOpen ? null : page.id);
                              }}
                              className="page-menu-trigger p-1 rounded-md text-veyra-subtle hover:text-veyra-text hover:bg-veyra-hover cursor-pointer transition-colors"
                              title="Opciones de hoja"
                            >
                              <MoreVertical className="w-3.5 h-3.5" />
                            </button>

                            {/* Floating Dropdown Menu */}
                            {isMenuOpen && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className="page-menu-dropdown absolute right-0 top-7 z-40 w-44 rounded-xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-zinc-800 shadow-xl p-1 flex flex-col gap-0.5 text-xs select-none text-slate-800 dark:text-zinc-100"
                              >
                                <button
                                  type="button"
                                  onClick={() => handleStartRename(page.id, page.title)}
                                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-veyra-text hover:bg-veyra-hover cursor-pointer text-left transition-colors"
                                >
                                  <Pencil className="w-3.5 h-3.5 text-veyra-subtle" />
                                  <span>Renombrar</span>
                                </button>
                                {!isA4Mode && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        handleDuplicate(e, page.id);
                                        setActiveMenuPageId(null);
                                      }}
                                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-veyra-text hover:bg-veyra-hover cursor-pointer text-left transition-colors"
                                    >
                                      <Copy className="w-3.5 h-3.5 text-veyra-subtle" />
                                      <span>Duplicar hoja</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleClearContent(page.id)}
                                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-veyra-text hover:bg-veyra-hover cursor-pointer text-left transition-colors"
                                    >
                                      <RotateCcw className="w-3.5 h-3.5 text-veyra-subtle" />
                                      <span>Vaciar contenido</span>
                                    </button>
                                    {pages.length > 1 && (
                                      <>
                                        <div className="h-[1px] bg-veyra-border my-0.5" />
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            handleDelete(e, page.id);
                                            setActiveMenuPageId(null);
                                          }}
                                          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 cursor-pointer text-left transition-colors"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                          <span>Eliminar hoja</span>
                                        </button>
                                      </>
                                    )}
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Visual Miniature Sheet / Slide Preview */}
                    <div className="w-full bg-white dark:bg-[#141417] rounded-lg p-2.5 border border-zinc-200/90 dark:border-white/[0.08] flex flex-col justify-between min-h-[105px] max-h-[125px] overflow-hidden relative shadow-xs group-hover:border-accent/40 dark:group-hover:border-accent/30 transition-all">
                      {/* Real structured blocks */}
                      <div className="flex-1 overflow-hidden space-y-1.5 select-none pointer-events-none">
                        {page.blocks.length === 0 ? (
                          <div className="h-full flex flex-col items-center justify-center text-zinc-400 dark:text-zinc-500 text-[10px] gap-1 py-3 border border-dashed border-zinc-200 dark:border-white/10 rounded-md bg-zinc-50/50 dark:bg-white/[0.01]">
                            <FileText className="w-3.5 h-3.5 opacity-50" />
                            <span>Hoja en blanco</span>
                          </div>
                        ) : (
                          page.blocks.slice(0, 4).map((block) => {
                            switch (block.type) {
                              case 'heading':
                                return (
                                  <div key={block.id} className="flex items-center gap-1.5 min-w-0">
                                    <span className="w-1 h-2.5 rounded-full bg-accent shrink-0" />
                                    <span className="font-semibold text-[10.5px] text-zinc-900 dark:text-zinc-100 truncate tracking-tight">
                                      {block.text}
                                    </span>
                                  </div>
                                );
                              case 'paragraph':
                                return (
                                  <p
                                    key={block.id}
                                    className="text-[9.5px] text-zinc-600 dark:text-zinc-400 line-clamp-1 leading-snug"
                                  >
                                    {block.text}
                                  </p>
                                );
                              case 'bullet':
                                return (
                                  <div
                                    key={block.id}
                                    className="flex items-center gap-1.5 min-w-0 text-[9.5px] text-zinc-600 dark:text-zinc-400"
                                  >
                                    <span className="w-1.5 h-1.5 rounded-full bg-accent/80 shrink-0" />
                                    <span className="truncate">{block.text}</span>
                                  </div>
                                );
                              case 'task':
                                return (
                                  <div
                                    key={block.id}
                                    className="flex items-center gap-1.5 min-w-0 text-[9.5px] text-zinc-600 dark:text-zinc-400"
                                  >
                                    {block.checked ? (
                                      <CheckSquare className="w-3 h-3 text-emerald-500 shrink-0" />
                                    ) : (
                                      <Square className="w-3 h-3 text-zinc-400 dark:text-zinc-500 shrink-0" />
                                    )}
                                    <span
                                      className={cn(
                                        'truncate',
                                        block.checked && 'line-through opacity-50'
                                      )}
                                    >
                                      {block.text}
                                    </span>
                                  </div>
                                );
                              case 'code':
                                return (
                                  <div
                                    key={block.id}
                                    className="bg-zinc-100 dark:bg-black/60 border border-zinc-200 dark:border-white/10 rounded px-1.5 py-0.5 font-mono text-[9px] text-zinc-800 dark:text-cyan-300 truncate"
                                  >
                                    {block.text}
                                  </div>
                                );
                              case 'quote':
                                return (
                                  <div
                                    key={block.id}
                                    className="border-l-2 border-accent/60 pl-1.5 italic text-[9.5px] text-zinc-600 dark:text-zinc-400 truncate"
                                  >
                                    "{block.text}"
                                  </div>
                                );
                              case 'table':
                                return (
                                  <div
                                    key={block.id}
                                    className="flex items-center gap-1.5 text-[9px] text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-white/5 border border-zinc-200/70 dark:border-transparent rounded px-1.5 py-0.5 w-fit"
                                  >
                                    <Table className="w-3 h-3 text-accent" />
                                    <span>Tabla de datos</span>
                                  </div>
                                );
                              case 'image':
                                return (
                                  <div
                                    key={block.id}
                                    className="flex items-center gap-1.5 text-[9px] text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-white/5 border border-zinc-200/70 dark:border-transparent rounded px-1.5 py-0.5 w-fit"
                                  >
                                    <ImageIcon className="w-3 h-3 text-accent" />
                                    <span>Imagen</span>
                                  </div>
                                );
                              case 'youtube':
                                return (
                                  <div
                                    key={block.id}
                                    className="flex items-center gap-1.5 text-[9px] text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-white/5 border border-zinc-200/70 dark:border-transparent rounded px-1.5 py-0.5 w-fit"
                                  >
                                    <Video className="w-3 h-3 text-red-500" />
                                    <span>YouTube</span>
                                  </div>
                                );
                              default:
                                return null;
                            }
                          })
                        )}
                      </div>

                      {/* Bottom info inside preview: "Actual" on the left, stats badge on the right */}
                      {(isCurrent || page.blocks.length > 0) && (
                        <div className="flex items-center justify-between text-[9px] pt-1.5 border-t border-zinc-100 dark:border-white/[0.06] shrink-0 mt-1.5">
                          <div>
                            {isCurrent && (
                              <span className="px-2 py-0.5 rounded-full bg-accent/15 text-accent font-semibold text-[9px] border border-accent/25">
                                Actual
                              </span>
                            )}
                          </div>
                          {page.blocks.length > 0 && (
                            <span className="text-zinc-500 dark:text-zinc-400 font-sans font-medium bg-zinc-100/90 dark:bg-white/[0.06] px-2 py-0.5 rounded-md border border-zinc-200/50 dark:border-transparent">
                              {page.badgeText}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Quick Insert Page Divider between cards */}
                  {!isA4Mode && viewMode !== 'grid' && (
                    <div className="relative py-1 -my-0.5 group/insert flex items-center justify-center">
                      <div className="absolute inset-x-6 h-[1px] bg-transparent group-hover/insert:bg-accent/40 transition-colors" />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleInsertPageAt(page.index + 1);
                        }}
                        className="relative z-10 flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-veyra-card text-veyra-subtle hover:text-accent border border-veyra-border group-hover/insert:border-accent/40 group-hover/insert:bg-accent/10 opacity-0 group-hover/insert:opacity-100 transition-all text-[10px] font-medium shadow-xs cursor-pointer"
                        title="Insertar hoja en esta posición"
                      >
                        <Plus className="w-3 h-3 stroke-[2.5]" />
                        <span>Añadir hoja aquí</span>
                      </button>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. Footer: Grid view toggle + Reorder toggle */}
      <div className="p-2.5 border-t border-veyra-border shrink-0 bg-veyra-card flex items-center justify-between text-[11px] text-veyra-muted">
        <button
          type="button"
          onClick={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}
          className="flex items-center gap-1.5 hover:text-veyra-text transition-colors cursor-pointer py-1 px-1.5 rounded hover:bg-veyra-hover"
        >
          {viewMode === 'list' ? (
            <>
              <LayoutGrid className="w-3.5 h-3.5 text-accent" />
              <span>Vista cuadrícula</span>
            </>
          ) : (
            <>
              <List className="w-3.5 h-3.5 text-accent" />
              <span>Vista lista</span>
            </>
          )}
        </button>

        {!isA4Mode && (
          <button
            type="button"
            onClick={() => setIsReordering(!isReordering)}
            className={cn(
              'flex items-center gap-1.5 transition-colors cursor-pointer py-1 px-1.5 rounded hover:bg-veyra-hover',
              isReordering ? 'text-accent font-semibold' : 'hover:text-veyra-text'
            )}
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            <span>{isReordering ? 'Listo' : 'Reordenar con flechas'}</span>
          </button>
        )}
      </div>
    </div>
  );
};
