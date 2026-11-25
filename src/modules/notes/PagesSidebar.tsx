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
  Table,
  Image as ImageIcon,
  MoreVertical,
  Pencil,
  RotateCcw,
  GripVertical,
  Check,
  ListTree,
  BarChart2,
  Clock,
  Sparkles,
  CheckCircle2,
  Code2,
  Quote,
} from 'lucide-react';
import type { Editor } from '@tiptap/react';
import * as Y from 'yjs';
import { sanitizeRichHtml } from '../../lib/sanitizeHtml';
import { cn } from '../../lib/utils';
import { resolvePageFragmentName, yFragmentToHtml } from '../../lib/yjs-loader';
import type { A4HeaderFooterConfig } from './components/A4HeaderFooterTypes';
import { resolveSlotsKey, interpolateTokens } from './components/A4HeaderFooterOverlay';

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
  editor?: Editor | null;
  a4HeaderFooterConfig?: A4HeaderFooterConfig | null;
  authorName?: string;
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
  html?: string;
}

interface OutlineItem {
  id: string;
  text: string;
  level: number;
  pos?: number;
  sheetIndex?: number;
}

/**
 * Extrae bloques reales, texto y estructura directamente del fragmento XML de Yjs.
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
    codeBlocks: number;
    quotes: number;
    completedTasks: number;
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
    codeBlocks: 0,
    quotes: 0,
    completedTasks: 0,
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
              if (checked) stats.completedTasks++;
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
            stats.codeBlocks++;
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
            stats.quotes++;
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
  editor,
  a4HeaderFooterConfig,
  authorName,
}) => {
  const isA4Mode = pageFormat === 'a4';

  // Navegación de pestañas principales: 'pages' | 'outline' (Info ahora es barra fija estilo Word)
  const [activeTab, setActiveTab] = useState<'pages' | 'outline'>('pages');
  const [showStatsDrawer, setShowStatsDrawer] = useState(false);

  // Modo de visualización de hojas: 'visual' (miniaturas estéticas) vs 'compact' (lista ágil)
  const [viewMode, setViewMode] = useState<'visual' | 'compact'>('visual');

  const [search, setSearch] = useState('');
  const [outlineSearch, setOutlineSearch] = useState('');
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

  // HTML en tiempo real sincronizado con el editor
  const [liveHtml, setLiveHtml] = useState<string>(() => editor?.getHTML() || '');

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;

    let rafId: number | null = null;
    const updateHtml = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        setLiveHtml(editor.getHTML());
      });
    };

    editor.on('update', updateHtml);
    updateHtml();

    return () => {
      editor.off('update', updateHtml);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [editor]);

  // Obtiene el HTML real para la preview según modo A4 o infinito
  const getPageHtml = (page: PageMeta) => {
    if (isA4Mode) {
      if (page.html) return page.html;
      if (page.index === 0 && liveHtml) return liveHtml;
      return '';
    }
    if (page.id === activePageId && liveHtml) {
      return liveHtml;
    }
    try {
      const fragKey = resolvePageFragmentName(ydoc, page.id);
      const frag = ydoc.getXmlFragment(fragKey);
      return yFragmentToHtml(frag);
    } catch {
      return '';
    }
  };

  // Suscripción a cambios en Yjs y en el editor
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

    if (editor) {
      editor.on('update', handleDocUpdate);
      editor.on('selectionUpdate', handleDocUpdate);
    }

    return () => {
      ydoc.off('update', handleDocUpdate);
      titlesMap.unobserve(handleDocUpdate);
      if (editor) {
        editor.off('update', handleDocUpdate);
        editor.off('selectionUpdate', handleDocUpdate);
      }
      if (timer) clearTimeout(timer);
    };
  }, [ydoc, editor]);

  // Click outside listener para menú flotante
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

  // Extracción de metadatos y hojas
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

      const customTitle = titlesMap.get(pid);
      const title = customTitle || headingTitle || `Hoja ${idx + 1}`;
      const snippet =
        plainText.length > 35 ? plainText.slice(0, 35) + '...' : plainText || 'Sin contenido...';

      let badgeText = 'En blanco';
      if (stats.tasks > 0) {
        badgeText = `${stats.completedTasks}/${stats.tasks} tareas`;
      } else if (stats.bullets > 0) {
        badgeText = `${stats.bullets} ${stats.bullets === 1 ? 'punto' : 'puntos'}`;
      } else if (stats.words > 0) {
        badgeText = `${stats.words} ${stats.words === 1 ? 'palabra' : 'pal'}`;
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

  // Filtro de hojas por búsqueda
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

  // Extracción del Esquema (Outline / Tabla de contenidos)
  const outlineItems: OutlineItem[] = useMemo(() => {
    const items: OutlineItem[] = [];

    // 1. Si tenemos el editor TipTap disponible, extraemos los headings con posición exacta
    if (editor && !editor.isDestroyed) {
      try {
        editor.state.doc.descendants((node, pos) => {
          if (node.type.name === 'heading') {
            const level = (node.attrs.level as number) || 1;
            const text = node.textContent.trim();
            if (text) {
              items.push({
                id: `heading-pos-${pos}`,
                text,
                level,
                pos,
              });
            }
          }
        });
        if (items.length > 0) return items;
      } catch (err) {
        console.error('Error extracting headings from editor:', err);
      }
    }

    // 2. Fallback desde pagesMeta (bloques de tipo heading)
    pagesMeta.forEach((sheet) => {
      sheet.blocks.forEach((block) => {
        if (block.type === 'heading' && block.text.trim()) {
          items.push({
            id: `heading-block-${sheet.id}-${block.id}`,
            text: block.text.trim(),
            level: block.level || 1,
            sheetIndex: sheet.index,
          });
        }
      });
    });

    return items;
  }, [editor, pagesMeta, updateTick]);

  // Filtro del esquema
  const filteredOutline = useMemo(() => {
    const q = outlineSearch.trim().toLowerCase();
    if (!q) return outlineItems;
    return outlineItems.filter((item) => item.text.toLowerCase().includes(q));
  }, [outlineItems, outlineSearch]);

  // Estadísticas globales del documento
  const globalStats = useMemo(() => {
    let totalWords = 0;
    let totalChars = 0;
    let totalParagraphs = 0;
    let totalTasks = 0;
    let completedTasks = 0;
    let totalHeadings = 0;
    let totalTables = 0;
    let totalImages = 0;
    let totalBullets = 0;
    let totalQuotes = 0;
    let totalCodes = 0;

    // Conteo desde editor si está disponible
    if (editor && !editor.isDestroyed) {
      const text = editor.state.doc.textContent;
      totalChars = text.length;
      const words = text.trim() ? text.trim().split(/\s+/).filter(Boolean) : [];
      totalWords = words.length;

      editor.state.doc.descendants((node) => {
        if (node.type.name === 'paragraph') totalParagraphs++;
        if (node.type.name === 'heading') totalHeadings++;
        if (node.type.name === 'table') totalTables++;
        if (node.type.name === 'image') totalImages++;
        if (node.type.name === 'bulletList' || node.type.name === 'orderedList') totalBullets++;
        if (node.type.name === 'codeBlock') totalCodes++;
        if (node.type.name === 'blockquote') totalQuotes++;
        if (node.type.name === 'taskItem') {
          totalTasks++;
          if (node.attrs.checked) completedTasks++;
        }
      });
    } else {
      // Fallback desde pagesMeta
      pagesMeta.forEach((p) => {
        totalWords += p.wordCount;
        totalChars += p.snippet.length;
        totalParagraphs += p.paragraphCount;
        totalTasks += p.taskCount;
        p.blocks.forEach((b) => {
          if (b.type === 'heading') totalHeadings++;
          if (b.type === 'table') totalTables++;
          if (b.type === 'image') totalImages++;
          if (b.type === 'code') totalCodes++;
          if (b.type === 'quote') totalQuotes++;
          if (b.type === 'task' && b.checked) completedTasks++;
        });
      });
    }

    const readTimeMinutes = Math.max(1, Math.ceil(totalWords / 200));
    const taskPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    return {
      totalWords,
      totalChars,
      totalParagraphs,
      totalTasks,
      completedTasks,
      taskPercent,
      totalHeadings,
      totalTables,
      totalImages,
      totalBullets,
      totalQuotes,
      totalCodes,
      readTimeMinutes,
    };
  }, [editor, pagesMeta, updateTick]);

  // Número de hoja activa actual para la barra inferior estilo Word
  const activeNum = useMemo(() => {
    if (isA4Mode) {
      return (activeA4SheetIndex ?? 0) + 1;
    }
    const idx = pagesMeta.findIndex((p) => p.id === activePageId);
    return idx >= 0 ? idx + 1 : 1;
  }, [isA4Mode, activeA4SheetIndex, pagesMeta, activePageId]);

  // Click en un elemento del Esquema para saltar al encabezado
  const handleJumpToHeading = (item: OutlineItem) => {
    if (isA4Mode && typeof item.sheetIndex === 'number' && onSelectA4Sheet) {
      onSelectA4Sheet(item.sheetIndex);
    }

    if (editor && !editor.isDestroyed && typeof item.pos === 'number') {
      try {
        editor.chain().focus().setTextSelection(item.pos).run();
        const dom = editor.view.nodeDOM(item.pos) as HTMLElement;
        if (dom && dom.scrollIntoView) {
          dom.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      } catch (e) {
        console.error('Error focusing heading in editor:', e);
      }
    }
  };

  // Insertar hoja en posición exacta
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

  // Renombrar
  const handleStartRename = (pageId: string, currentTitle: string) => {
    setActiveMenuPageId(null);
    setEditingPageId(pageId);
    setEditingTitle(currentTitle);
  };

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

  // Vaciar contenido
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

  // Duplicar hoja
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

  // Eliminar hoja
  const handleDelete = (e: React.MouseEvent, pageId: string) => {
    e.stopPropagation();
    if (pages.length <= 1) return;
    const po = ydoc.getArray<string>('pageOrder');
    const idx = po.toArray().indexOf(pageId);
    if (idx >= 0) {
      po.delete(idx, 1);
      const titlesMap = ydoc.getMap<string>('pageCustomTitles');
      titlesMap.delete(pageId);

      const remaining = po.toArray();
      const nextActive = remaining[Math.min(idx, remaining.length - 1)];
      if (nextActive) onSelectPage(nextActive);
      onSave?.();
    }
  };

  // Mover hoja arriba / abajo
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
      {/* 1. Encabezado principal: Pestañas limpias (Hojas / Esquema) + Acciones sin solapamiento */}
      <div
        className="px-3 py-2 border-b border-veyra-border shrink-0 bg-veyra-card flex items-center justify-between gap-2"
        title={noteTitle ? `Panel lateral de: ${noteTitle}` : 'Panel lateral'}
      >
        {/* Segmented Control / Tabs: Solo Hojas y Esquema con ancho óptimo */}
        <div className="flex items-center bg-veyra-elevated/70 p-0.5 rounded-lg border border-veyra-border/60">
          {/* Tab 1: Hojas */}
          <button
            type="button"
            onClick={() => {
              setActiveTab('pages');
              setShowStatsDrawer(false);
            }}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer',
              activeTab === 'pages'
                ? 'bg-veyra-card text-accent font-semibold shadow-2xs border border-veyra-border/40'
                : 'text-veyra-subtle hover:text-veyra-text hover:bg-white/5'
            )}
            title={isA4Mode ? 'Hojas del documento A4' : 'Hojas / Secciones de la nota'}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Hojas</span>
            <span
              className={cn(
                'ml-0.5 px-1.5 py-0.2 rounded-full font-mono text-[9.5px]',
                activeTab === 'pages'
                  ? 'bg-accent/15 text-accent font-bold'
                  : 'bg-veyra-canvas text-veyra-muted'
              )}
            >
              {pagesMeta.length}
            </span>
          </button>

          {/* Tab 2: Esquema / Outline */}
          <button
            type="button"
            onClick={() => {
              setActiveTab('outline');
              setShowStatsDrawer(false);
            }}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer',
              activeTab === 'outline'
                ? 'bg-veyra-card text-accent font-semibold shadow-2xs border border-veyra-border/40'
                : 'text-veyra-subtle hover:text-veyra-text hover:bg-white/5'
            )}
            title="Índice de títulos y secciones (Outline)"
          >
            <ListTree className="w-3.5 h-3.5" />
            <span>Esquema</span>
            {outlineItems.length > 0 && (
              <span
                className={cn(
                  'ml-0.5 px-1.5 py-0.2 rounded-full font-mono text-[9.5px]',
                  activeTab === 'outline'
                    ? 'bg-accent/15 text-accent font-bold'
                    : 'bg-veyra-canvas text-veyra-muted'
                )}
              >
                {outlineItems.length}
              </span>
            )}
          </button>
        </div>

        {/* Acciones del encabezado derecho */}
        <div className="flex items-center gap-1 shrink-0">
          {activeTab === 'pages' && !isA4Mode && (
            <button
              type="button"
              onClick={onAddPage}
              className="h-7 px-2 flex items-center gap-1 rounded-md bg-accent text-white text-[10.5px] font-medium hover:opacity-90 shadow-2xs cursor-pointer transition-opacity"
              title="Añadir hoja al final"
            >
              <Plus className="w-3 h-3 stroke-[2.5]" />
              <span>Hoja</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="h-7 w-7 rounded-md text-veyra-subtle hover:text-veyra-text hover:bg-veyra-hover transition-colors flex items-center justify-center cursor-pointer"
            title="Ocultar panel lateral"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. CONTENIDO SEGÚN LA PESTAÑA ACTIVA */}

      {/* ═══════════════════════════════════════════════════════════
          PESTAÑA 1: HOJAS / PÁGINAS
         ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'pages' && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Barra de herramientas: Búsqueda + Toggle de vista (Visual / Compacta) */}
          <div className="px-3 py-1.5 border-b border-veyra-border shrink-0 bg-veyra-canvas flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3 h-3 text-veyra-subtle absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder={isA4Mode ? 'Buscar hoja...' : 'Buscar hoja o sección...'}
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

            {/* Alternar entre vista de miniaturas estilizadas y lista compacta */}
            <div className="flex items-center bg-veyra-elevated border border-veyra-border rounded-md p-0.5 shrink-0">
              <button
                type="button"
                onClick={() => setViewMode('visual')}
                className={cn(
                  'p-1 rounded text-xs transition-colors cursor-pointer',
                  viewMode === 'visual'
                    ? 'bg-veyra-card text-accent shadow-2xs'
                    : 'text-veyra-subtle hover:text-veyra-text'
                )}
                title="Vista visual (Miniaturas con proporción real)"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('compact')}
                className={cn(
                  'p-1 rounded text-xs transition-colors cursor-pointer',
                  viewMode === 'compact'
                    ? 'bg-veyra-card text-accent shadow-2xs'
                    : 'text-veyra-subtle hover:text-veyra-text'
                )}
                title="Vista compacta (Lista rápida)"
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Lista scrollable de hojas */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {filteredPages.length === 0 ? (
              <div className="p-8 text-center text-veyra-subtle text-xs flex flex-col items-center gap-2">
                <Search className="w-6 h-6 opacity-40 text-veyra-subtle" />
                <span>No se encontraron hojas que coincidan con la búsqueda.</span>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredPages.map((page) => {
                  const isCurrent = isA4Mode
                    ? page.index === activeA4SheetIndex
                    : page.id === activePageId;
                  const isEditing = editingPageId === page.id;
                  const isMenuOpen = activeMenuPageId === page.id;

                  return (
                    <React.Fragment key={page.id}>
                      {/* VISTA 1: MINIATURAS VISUALES CON ASPECT RATIO REAL (OPCIÓN A: HERO CENTRADA) */}
                      {viewMode === 'visual' ? (
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
                            'group rounded-2xl border p-2.5 transition-all duration-150 ease-out animate-in fade-in slide-in-from-bottom-1.5 cursor-pointer relative flex flex-col gap-2',
                            isCurrent
                              ? 'bg-accent/[0.04] border-accent/80 shadow-sm ring-1 ring-accent/30'
                              : 'bg-veyra-card hover:bg-veyra-elevated border-veyra-border/70 hover:border-accent/40 shadow-2xs hover:shadow-xs',
                            draggedPageId === page.id &&
                              'opacity-35 scale-[0.98] border-dashed border-accent/60'
                          )}
                        >
                          {/* Líneas de inserción para drag & drop */}
                          {dragOverPageId === page.id && dropPosition === 'before' && (
                            <div className="absolute -top-1 left-2 right-2 h-1 bg-accent rounded-full shadow-[0_0_8px_rgba(96,165,250,0.8)] z-30 pointer-events-none" />
                          )}
                          {dragOverPageId === page.id && dropPosition === 'after' && (
                            <div className="absolute -bottom-1 left-2 right-2 h-1 bg-accent rounded-full shadow-[0_0_8px_rgba(96,165,250,0.8)] z-30 pointer-events-none" />
                          )}

                          {/* 1. MESA DE TRABAJO (LIENZO) DONDE FLOTA LA HOJA CENTRADA HERO */}
                          <div className="w-full bg-[#e8ebf0] dark:bg-[#0c0c0e] rounded-xl py-3 px-2 flex flex-col items-center justify-center relative border border-slate-300/60 dark:border-white/[0.06] overflow-hidden">
                            {/* Número de página flotante en la esquina superior izquierda */}
                            <div className="absolute top-2 left-2 flex items-center gap-1 z-10">
                              {!isA4Mode && !isReordering && (
                                <div
                                  className="opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing text-veyra-subtle hover:text-accent p-0.5 rounded"
                                  title="Arrastra para reordenar"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <GripVertical className="w-3.5 h-3.5" />
                                </div>
                              )}
                              <span
                                className={cn(
                                  'px-1.5 py-0.5 rounded-md text-[10px] font-bold font-mono border shadow-2xs transition-colors',
                                  isCurrent
                                    ? 'bg-accent text-white border-accent'
                                    : 'bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border-slate-300 dark:border-zinc-700'
                                )}
                              >
                                {page.index + 1}
                              </span>
                            </div>

                            {/* Badge "Activa" en la esquina superior derecha */}
                            {isCurrent && (
                              <div className="absolute top-2 right-2 z-10">
                                <span className="px-1.5 py-0.2 rounded-full bg-accent/20 border border-accent/40 text-accent font-semibold text-[8.5px] shadow-2xs backdrop-blur-xs">
                                  Activa
                                </span>
                              </div>
                            )}

                            {/* LA HOJA A4 CENTRADA HERO (Aspect ratio 210/297 con contenido real sobre hoja de papel blanca) */}
                            <div
                              className={cn(
                                'w-[124px] h-[175px] bg-white rounded-[2px] border transition-all duration-150 relative overflow-hidden select-none pointer-events-none',
                                isCurrent
                                  ? 'border-accent shadow-[0_6px_20px_rgba(96,165,250,0.3)] ring-2 ring-accent ring-offset-2 ring-offset-[#e8ebf0] dark:ring-offset-[#0c0c0e]'
                                  : 'border-slate-300 shadow-[0_4px_12px_rgba(0,0,0,0.12)] group-hover:shadow-[0_6px_18px_rgba(0,0,0,0.18)] group-hover:border-accent/50'
                              )}
                            >
                              {/* Ventana a escala (Scale Viewport 794px escalado a 124px sobre papel blanco con Header, Body y Footer reales) */}
                              {(() => {
                                const sheetNum = page.index + 1;
                                const totalSheets = Math.max(1, pagesMeta.length);
                                const tokenCtx = {
                                  sheetNum,
                                  totalSheets,
                                  noteTitle: noteTitle || 'Sin título',
                                  authorName: authorName || 'Usuario',
                                };

                                const headerKey =
                                  isA4Mode && a4HeaderFooterConfig
                                    ? resolveSlotsKey(a4HeaderFooterConfig, 'header', sheetNum)
                                    : null;
                                const footerKey =
                                  isA4Mode && a4HeaderFooterConfig
                                    ? resolveSlotsKey(a4HeaderFooterConfig, 'footer', sheetNum)
                                    : null;

                                const hSlots =
                                  headerKey && a4HeaderFooterConfig
                                    ? a4HeaderFooterConfig[headerKey]
                                    : null;
                                const fSlots =
                                  footerKey && a4HeaderFooterConfig
                                    ? a4HeaderFooterConfig[footerKey]
                                    : null;

                                const hImages = hSlots?.images || [];
                                const fImages = fSlots?.images || [];

                                const headerTopOffsetPx = Math.round(
                                  (a4HeaderFooterConfig?.headerDistanceCm ?? 1.25) * 37.795
                                );
                                const footerBottomOffsetPx = Math.round(
                                  (a4HeaderFooterConfig?.footerDistanceCm ?? 1.25) * 37.795
                                );
                                const headerZoneH =
                                  a4HeaderFooterConfig?.customHeaderHeightPx || 95;
                                const footerZoneH =
                                  a4HeaderFooterConfig?.customFooterHeightPx || 95;

                                return (
                                  <div
                                    style={{
                                      width: '794px',
                                      height: '1123px',
                                      transform: 'scale(0.15617)',
                                      transformOrigin: 'top left',
                                      position: 'absolute',
                                      top: 0,
                                      left: 0,
                                      overflow: 'hidden',
                                      backgroundColor: '#ffffff',
                                    }}
                                  >
                                    {/* 1. ENCABEZADO REAL (Logos UG, imágenes y textos) */}
                                    {isA4Mode && hSlots && (
                                      <div
                                        style={{
                                          position: 'absolute',
                                          top: 0,
                                          left: 0,
                                          right: 0,
                                          height: `${headerZoneH}px`,
                                          zIndex: 20,
                                        }}
                                      >
                                        {/* Logos e imágenes posicionadas exactamente */}
                                        {hImages.map((img) => (
                                          <img
                                            key={img.id}
                                            src={img.src}
                                            alt=""
                                            style={{
                                              position: 'absolute',
                                              left: `${img.x}px`,
                                              top: `${img.y}px`,
                                              width: `${img.width}px`,
                                              height: `${img.height}px`,
                                              objectFit: 'contain',
                                            }}
                                          />
                                        ))}

                                        {/* Textos de las columnas izquierda, centro y derecha */}
                                        {(hSlots.left || hSlots.center || hSlots.right) && (
                                          <div
                                            style={{ top: `${headerTopOffsetPx}px` }}
                                            className="absolute left-0 right-0 px-[30mm] flex items-center justify-between text-xs text-slate-700 font-normal leading-tight select-none"
                                          >
                                            <span className="flex-1 text-left truncate">
                                              {interpolateTokens(hSlots.left, tokenCtx)}
                                            </span>
                                            <span className="flex-1 text-center truncate">
                                              {interpolateTokens(hSlots.center, tokenCtx)}
                                            </span>
                                            <span className="flex-1 text-right truncate">
                                              {interpolateTokens(hSlots.right, tokenCtx)}
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {/* 2. CONTENIDO REAL DEL CUERPO DE ESTA HOJA ESPECÍFICA */}
                                    <div
                                      style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        width: '794px',
                                        height: '1123px',
                                        backgroundColor: '#ffffff',
                                        overflow: 'hidden',
                                      }}
                                      className="a4-page-mode sheet-light-mode px-[30mm] pt-[25mm] pb-[25mm] text-slate-900 bg-white"
                                    >
                                      <div
                                        className="ProseMirror prose max-w-none text-left text-slate-900 text-sm leading-relaxed"
                                        dangerouslySetInnerHTML={{
                                          __html: sanitizeRichHtml(getPageHtml(page) || ''),
                                        }}
                                      />
                                    </div>

                                    {/* 3. PIE DE PÁGINA REAL (Logos, imágenes, numeración y textos) */}
                                    {isA4Mode && fSlots ? (
                                      <div
                                        style={{
                                          position: 'absolute',
                                          bottom: 0,
                                          left: 0,
                                          right: 0,
                                          height: `${footerZoneH}px`,
                                          zIndex: 20,
                                        }}
                                      >
                                        {/* Imágenes de pie de página */}
                                        {fImages.map((img) => (
                                          <img
                                            key={img.id}
                                            src={img.src}
                                            alt=""
                                            style={{
                                              position: 'absolute',
                                              left: `${img.x}px`,
                                              top: `${img.y}px`,
                                              width: `${img.width}px`,
                                              height: `${img.height}px`,
                                              objectFit: 'contain',
                                            }}
                                          />
                                        ))}

                                        {/* Textos del pie de página */}
                                        <div
                                          style={{ bottom: `${footerBottomOffsetPx}px` }}
                                          className="absolute left-0 right-0 px-[30mm] flex items-center justify-between text-xs text-slate-600 font-normal leading-tight select-none"
                                        >
                                          <span className="flex-1 text-left truncate">
                                            {interpolateTokens(fSlots.left, tokenCtx)}
                                          </span>
                                          <span className="flex-1 text-center truncate">
                                            {interpolateTokens(
                                              fSlots.center ||
                                                (a4HeaderFooterConfig?.footerPreset === 'page_x_of_y'
                                                  ? '{page} de {total}'
                                                  : ''),
                                              tokenCtx
                                            )}
                                          </span>
                                          <span className="flex-1 text-right truncate">
                                            {interpolateTokens(
                                              fSlots.right ||
                                                (!fSlots.left &&
                                                !fSlots.center &&
                                                a4HeaderFooterConfig?.footerPreset === 'none'
                                                  ? '{page}'
                                                  : ''),
                                              tokenCtx
                                            )}
                                          </span>
                                        </div>
                                      </div>
                                    ) : (
                                      /* Fallback si no hay pie o en formato infinito */
                                      <div className="absolute bottom-4 left-0 right-0 flex justify-center z-20 pointer-events-none">
                                        <span className="text-xs font-mono font-medium text-slate-400">
                                          {page.index + 1}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          </div>

                          {/* 2. PIE DE LA TARJETA: Título editable + Metadatos + Opciones */}
                          <div className="flex items-center justify-between gap-1.5 px-0.5 pt-0.5">
                            <div className="min-w-0 flex-1">
                              {isEditing ? (
                                <div
                                  className="flex items-center gap-1"
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
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingPageId(null)}
                                    className="p-1 rounded text-veyra-subtle hover:text-veyra-text cursor-pointer"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <div className="space-y-0.5">
                                  <h4
                                    onDoubleClick={() => handleStartRename(page.id, page.title)}
                                    title="Doble clic para renombrar"
                                    className={cn(
                                      'font-semibold text-[11.5px] truncate select-none leading-snug',
                                      isCurrent
                                        ? 'text-accent font-bold'
                                        : 'text-veyra-text group-hover:text-accent transition-colors'
                                    )}
                                  >
                                    {page.title}
                                  </h4>
                                  <p className="text-[10px] text-veyra-subtle font-mono truncate">
                                    {page.badgeText}
                                  </p>
                                </div>
                              )}
                            </div>

                            {/* Acciones y menú contextual de 3 puntos */}
                            <div className="flex items-center gap-1 shrink-0">
                              {isReordering ? (
                                <div className="flex items-center gap-0.5">
                                  <button
                                    type="button"
                                    disabled={page.index === 0}
                                    onClick={(e) => handleMove(e, page.id, 'up')}
                                    className="p-1 rounded hover:bg-veyra-hover text-veyra-subtle hover:text-veyra-text disabled:opacity-20 cursor-pointer"
                                  >
                                    <ChevronUp className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={page.index === pages.length - 1}
                                    onClick={(e) => handleMove(e, page.id, 'down')}
                                    className="p-1 rounded hover:bg-veyra-hover text-veyra-subtle hover:text-veyra-text disabled:opacity-20 cursor-pointer"
                                  >
                                    <ChevronDown className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
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

                                  {isMenuOpen && (
                                    <div
                                      onClick={(e) => e.stopPropagation()}
                                      className="page-menu-dropdown absolute right-0 bottom-7 z-40 w-44 rounded-xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-zinc-800 shadow-xl p-1 flex flex-col gap-0.5 text-xs select-none text-slate-800 dark:text-zinc-100 animate-in fade-in zoom-in-95 duration-100"
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
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleClearContent(page.id);
                                              setActiveMenuPageId(null);
                                            }}
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
                        </div>
                      ) : (
                        /* VISTA 2: LISTA COMPACTA (Súper ágil para muchas hojas) */
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
                            if (draggedPageId && draggedPageId !== page.id) {
                              setDragOverPageId(page.id);
                              setDropPosition('after');
                            }
                          }}
                          onDrop={(e) => {
                            if (isA4Mode) return;
                            e.preventDefault();
                            if (draggedPageId && draggedPageId !== page.id) {
                              handleDropReorder(draggedPageId, page.id, 'after');
                            }
                            setDraggedPageId(null);
                            setDragOverPageId(null);
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
                            'group flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer relative',
                            isCurrent
                              ? 'bg-accent/10 border-accent/60 text-accent font-semibold shadow-2xs'
                              : 'bg-veyra-card hover:bg-veyra-elevated border-veyra-border text-veyra-muted hover:text-veyra-text'
                          )}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            {!isA4Mode && !isReordering && (
                              <GripVertical className="w-3 h-3 text-veyra-subtle opacity-0 group-hover:opacity-100 cursor-grab shrink-0 -ml-1" />
                            )}
                            <span
                              className={cn(
                                'w-4 h-4 rounded text-[9.5px] font-mono font-bold flex items-center justify-center shrink-0 border',
                                isCurrent
                                  ? 'bg-accent text-white border-accent'
                                  : 'bg-veyra-elevated border-veyra-border text-veyra-subtle'
                              )}
                            >
                              {page.index + 1}
                            </span>
                            <span className="truncate text-[11px]">{page.title}</span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[9.5px] text-veyra-subtle font-mono">
                              {page.wordCount > 0 ? `${page.wordCount} pal` : 'vacía'}
                            </span>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveMenuPageId(isMenuOpen ? null : page.id);
                              }}
                              className="p-1 rounded text-veyra-subtle hover:text-veyra-text hover:bg-veyra-hover cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <MoreVertical className="w-3 h-3" />
                            </button>

                            {/* Dropdown contextual en modo compacto */}
                            {isMenuOpen && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className="page-menu-dropdown absolute right-2 top-8 z-40 w-44 rounded-xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-zinc-800 shadow-xl p-1 flex flex-col gap-0.5 text-xs select-none text-slate-800 dark:text-zinc-100"
                              >
                                <button
                                  type="button"
                                  onClick={() => handleStartRename(page.id, page.title)}
                                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-veyra-text hover:bg-veyra-hover cursor-pointer text-left"
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
                                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-veyra-text hover:bg-veyra-hover cursor-pointer text-left"
                                    >
                                      <Copy className="w-3.5 h-3.5 text-veyra-subtle" />
                                      <span>Duplicar hoja</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleClearContent(page.id)}
                                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-veyra-text hover:bg-veyra-hover cursor-pointer text-left"
                                    >
                                      <RotateCcw className="w-3.5 h-3.5 text-veyra-subtle" />
                                      <span>Vaciar contenido</span>
                                    </button>
                                    {pages.length > 1 && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          handleDelete(e, page.id);
                                          setActiveMenuPageId(null);
                                        }}
                                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 cursor-pointer text-left"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        <span>Eliminar hoja</span>
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Botón de inserción rápida entre hojas */}
                      {!isA4Mode && (
                        <div className="relative py-0.5 -my-1 group/insert flex items-center justify-center">
                          <div className="absolute inset-x-6 h-[1px] bg-transparent group-hover/insert:bg-accent/40 transition-colors" />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleInsertPageAt(page.index + 1);
                            }}
                            className="relative z-10 flex items-center gap-1 px-2 py-0.5 rounded-full bg-veyra-card text-veyra-subtle hover:text-accent border border-veyra-border group-hover/insert:border-accent/40 group-hover/insert:bg-accent/10 opacity-0 group-hover/insert:opacity-100 transition-all text-[9.5px] font-medium shadow-xs cursor-pointer"
                            title="Insertar hoja aquí"
                          >
                            <Plus className="w-2.5 h-2.5 stroke-[2.5]" />
                            <span>Insertar hoja</span>
                          </button>
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            )}
          </div>

          {/* Pie del tab Hojas: Contador y reordenamiento con flechas */}
          <div className="p-2 border-t border-veyra-border shrink-0 bg-veyra-card flex items-center justify-between text-[11px] text-veyra-muted">
            <span className="text-[10px] text-veyra-subtle font-mono">
              {pagesMeta.length} {pagesMeta.length === 1 ? 'hoja total' : 'hojas en total'}
            </span>

            {!isA4Mode && (
              <button
                type="button"
                onClick={() => setIsReordering(!isReordering)}
                className={cn(
                  'flex items-center gap-1.5 transition-colors cursor-pointer py-1 px-1.5 rounded hover:bg-veyra-hover text-[10.5px]',
                  isReordering ? 'text-accent font-semibold' : 'hover:text-veyra-text'
                )}
              >
                <ArrowUpDown className="w-3 h-3" />
                <span>{isReordering ? 'Listo' : 'Reordenar con flechas'}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          PESTAÑA 2: ESQUEMA / ÍNDICE (OUTLINE)
         ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'outline' && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Búsqueda en el esquema */}
          <div className="px-3 py-1.5 border-b border-veyra-border shrink-0 bg-veyra-canvas">
            <div className="relative">
              <Search className="w-3 h-3 text-veyra-subtle absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Filtrar títulos y secciones..."
                value={outlineSearch}
                onChange={(e) => setOutlineSearch(e.target.value)}
                className="w-full h-7 bg-veyra-elevated text-veyra-text placeholder:text-veyra-subtle rounded-md pl-7 pr-6 text-[11px] border border-veyra-border focus:border-accent/80 focus:ring-1 focus:ring-accent/20 outline-none transition-all shadow-2xs"
              />
              {outlineSearch.trim().length > 0 && (
                <button
                  type="button"
                  onClick={() => setOutlineSearch('')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-veyra-subtle hover:text-veyra-text p-0.5 rounded cursor-pointer"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
          </div>

          {/* Lista de títulos indentados */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            {filteredOutline.length === 0 ? (
              <div className="p-8 text-center text-veyra-subtle text-xs flex flex-col items-center gap-2.5">
                <div className="w-10 h-10 rounded-full bg-veyra-elevated flex items-center justify-center text-accent/60 border border-veyra-border">
                  <ListTree className="w-5 h-5" />
                </div>
                <div className="space-y-1 max-w-[200px]">
                  <p className="font-medium text-veyra-text text-[11px]">Sin títulos en la nota</p>
                  <p className="text-[10px] text-veyra-subtle leading-snug">
                    Usa encabezados <code className="text-accent bg-accent/10 px-1 rounded"># H1</code> o <code className="text-accent bg-accent/10 px-1 rounded">## H2</code> en el texto para generar el índice automático.
                  </p>
                </div>
              </div>
            ) : (
              filteredOutline.map((item) => {
                const indentClass =
                  item.level === 1
                    ? 'pl-2 font-semibold text-veyra-text'
                    : item.level === 2
                    ? 'pl-5 text-veyra-muted font-medium'
                    : 'pl-8 text-veyra-subtle';

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleJumpToHeading(item)}
                    className={cn(
                      'w-full text-left py-1.5 pr-2 rounded-lg hover:bg-veyra-hover transition-colors flex items-center gap-2 group cursor-pointer text-xs',
                      indentClass
                    )}
                  >
                    <span
                      className={cn(
                        'w-1.5 h-1.5 rounded-full shrink-0 transition-colors',
                        item.level === 1
                          ? 'bg-accent'
                          : item.level === 2
                          ? 'bg-accent/60'
                          : 'bg-zinc-400 dark:bg-zinc-600'
                      )}
                    />
                    <span className="truncate flex-1 group-hover:text-accent transition-colors">
                      {item.text}
                    </span>
                    <span className="text-[9px] font-mono text-zinc-400 dark:text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity uppercase">
                      H{item.level}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {/* Pie del tab Esquema: Tip */}
          <div className="p-2 border-t border-veyra-border shrink-0 bg-veyra-card text-[10px] text-veyra-subtle flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-accent" />
              <span>Clic para saltar directo</span>
            </span>
            <span>{outlineItems.length} secciones</span>
          </div>
        </div>
      )}

      {/* 3. BARRA DE ESTADO FIJA INFERIOR (ESTILO MICROSOFT WORD) */}
      <div className="relative shrink-0 border-t border-veyra-border bg-veyra-card">
        {/* Popover / Drawer flotante con las Estadísticas e Info completas */}
        {showStatsDrawer && (
          <>
            {/* Backdrop invisible para cerrar al hacer clic afuera */}
            <div
              className="fixed inset-0 z-30"
              onClick={() => setShowStatsDrawer(false)}
            />
            <div
              className="absolute bottom-full left-0 right-0 max-h-[460px] bg-veyra-card border-t border-veyra-border shadow-2xl rounded-t-2xl z-40 flex flex-col overflow-hidden animate-in slide-in-from-bottom-2 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Encabezado del Popover */}
              <div className="px-3.5 py-2.5 border-b border-veyra-border bg-veyra-elevated/70 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-6 h-6 rounded-md bg-accent/15 text-accent flex items-center justify-center shrink-0">
                    <BarChart2 className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-xs text-veyra-text truncate">
                      Estadísticas del documento
                    </h3>
                    <p className="text-[10px] text-veyra-subtle truncate">
                      {noteTitle || 'Nota actual'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowStatsDrawer(false)}
                  className="p-1 rounded-md text-veyra-subtle hover:text-veyra-text hover:bg-veyra-hover transition-colors cursor-pointer"
                  title="Cerrar panel de estadísticas"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Contenido scrolleable de estadísticas */}
              <div className="p-3 overflow-y-auto space-y-2.5 text-xs scrollbar-thin">
                {/* 1. Tiempo estimado de lectura */}
                <div className="p-2.5 rounded-xl bg-veyra-elevated/60 border border-veyra-border/60 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-accent/15 border border-accent/25 flex items-center justify-center text-accent shrink-0">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] text-veyra-subtle font-medium uppercase tracking-wider block">
                      Tiempo estimado de lectura
                    </span>
                    <p className="text-xs font-bold text-veyra-text">
                      ~{globalStats.readTimeMinutes} {globalStats.readTimeMinutes === 1 ? 'minuto' : 'minutos'}
                    </p>
                  </div>
                </div>

                {/* 2. Checklists / Tareas */}
                {globalStats.totalTasks > 0 && (
                  <div className="p-2.5 rounded-xl bg-veyra-elevated/60 border border-veyra-border/60 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-veyra-subtle font-medium uppercase tracking-wider flex items-center gap-1.5">
                        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                        <span>Progreso de Tareas</span>
                      </span>
                      <span className="text-[11px] font-bold text-emerald-500 font-mono">
                        {globalStats.taskPercent}%
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-veyra-card rounded-full overflow-hidden border border-veyra-border/60">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                        style={{ width: `${globalStats.taskPercent}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-veyra-subtle">
                      <span>{globalStats.completedTasks} completadas</span>
                      <span>{globalStats.totalTasks - globalStats.completedTasks} pendientes</span>
                    </div>
                  </div>
                )}

                {/* 3. Conteo de texto estilo Word */}
                <div className="p-2.5 rounded-xl bg-veyra-elevated/60 border border-veyra-border/60 space-y-2">
                  <span className="text-[10px] text-veyra-subtle font-medium uppercase tracking-wider block">
                    Conteo de texto
                  </span>
                  <div className="grid grid-cols-2 gap-1.5 text-xs">
                    <div className="p-1.5 rounded-lg bg-veyra-card/70 border border-veyra-border/40">
                      <span className="text-[9.5px] text-veyra-subtle block">Palabras</span>
                      <span className="font-bold text-xs text-veyra-text font-mono">
                        {globalStats.totalWords.toLocaleString()}
                      </span>
                    </div>
                    <div className="p-1.5 rounded-lg bg-veyra-card/70 border border-veyra-border/40">
                      <span className="text-[9.5px] text-veyra-subtle block">Caracteres</span>
                      <span className="font-bold text-xs text-veyra-text font-mono">
                        {globalStats.totalChars.toLocaleString()}
                      </span>
                    </div>
                    <div className="p-1.5 rounded-lg bg-veyra-card/70 border border-veyra-border/40">
                      <span className="text-[9.5px] text-veyra-subtle block">Párrafos</span>
                      <span className="font-bold text-xs text-veyra-text font-mono">
                        {globalStats.totalParagraphs.toLocaleString()}
                      </span>
                    </div>
                    <div className="p-1.5 rounded-lg bg-veyra-card/70 border border-veyra-border/40">
                      <span className="text-[9.5px] text-veyra-subtle block">
                        {isA4Mode ? 'Páginas A4' : 'Hojas'}
                      </span>
                      <span className="font-bold text-xs text-veyra-text font-mono">
                        {pagesMeta.length}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 4. Elementos incluidos */}
                <div className="p-2.5 rounded-xl bg-veyra-elevated/60 border border-veyra-border/60 space-y-1.5 text-[11px]">
                  <span className="text-[10px] text-veyra-subtle font-medium uppercase tracking-wider block">
                    Elementos incluidos
                  </span>
                  <div className="space-y-1 text-veyra-muted">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Table className="w-3.5 h-3.5 text-accent" />
                        <span>Tablas</span>
                      </span>
                      <span className="font-mono font-semibold text-veyra-text">
                        {globalStats.totalTables}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <ImageIcon className="w-3.5 h-3.5 text-accent" />
                        <span>Imágenes</span>
                      </span>
                      <span className="font-mono font-semibold text-veyra-text">
                        {globalStats.totalImages}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Code2 className="w-3.5 h-3.5 text-accent" />
                        <span>Bloques de código</span>
                      </span>
                      <span className="font-mono font-semibold text-veyra-text">
                        {globalStats.totalCodes}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Quote className="w-3.5 h-3.5 text-accent" />
                        <span>Citas destacadas</span>
                      </span>
                      <span className="font-mono font-semibold text-veyra-text">
                        {globalStats.totalQuotes}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* La Barra de Estado Fija compacta (Word-Style) */}
        <div
          onClick={() => setShowStatsDrawer((prev) => !prev)}
          className="h-8 px-3 bg-veyra-card hover:bg-veyra-elevated/80 transition-colors flex items-center justify-between gap-2 text-[11px] text-veyra-subtle cursor-pointer select-none"
          title="Clic para ver estadísticas del documento"
        >
          {/* Lado Izquierdo: Hoja X de Y · X palabras */}
          <div className="flex items-center gap-1.5 truncate">
            <span className="font-medium text-veyra-text hover:text-accent transition-colors flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-accent inline-block" />
              <span>
                {isA4Mode
                  ? `Hoja ${(activeA4SheetIndex ?? 0) + 1} de ${Math.max(1, pagesMeta.length)}`
                  : `Hoja ${activeNum} de ${Math.max(1, pagesMeta.length)}`}
              </span>
            </span>
            <span className="opacity-40">·</span>
            <span className="hover:text-veyra-text transition-colors">
              {globalStats.totalWords} {globalStats.totalWords === 1 ? 'palabra' : 'palabras'}
            </span>
          </div>

          {/* Lado Derecho: Píldora de Info / Estadísticas con flechita */}
          <div className="flex items-center gap-1 shrink-0">
            <div
              className={cn(
                'flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] transition-colors',
                showStatsDrawer
                  ? 'bg-accent/15 text-accent font-semibold'
                  : 'hover:text-veyra-text hover:bg-black/5 dark:hover:bg-white/5'
              )}
            >
              <BarChart2 className="w-3 h-3 text-accent" />
              <span>Info</span>
              <ChevronUp
                className={cn(
                  'w-3 h-3 transition-transform duration-200 text-veyra-subtle',
                  showStatsDrawer && 'rotate-180 text-accent'
                )}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
