import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/react';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Highlighter,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Quote,
  Image as ImageIcon,
  Undo,
  Redo,
  Palette,
  Type,
  Eraser,
  Minus,
  Check,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Sigma,
  Table,
  LayoutTemplate,
  Pilcrow,
  Code2,
  Sparkles,
  AArrowUp,
  AArrowDown,
  HardDrive,
  Loader2,
  MoreHorizontal,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { NOTE_FONTS, areColorsEqual } from './constants/noteFonts';
import {
  FONT_SIZES,
  getNextLargerFontSize,
  getNextSmallerFontSize,
} from './extensions/FontSize';
import { useRecentEditorColors } from './hooks/useRecentEditorColors';
import {
  TextColorPopover,
  HighlightColorPopover,
} from './components/EditorColorPopovers';
import type { NumberingStyle } from './extensions/CustomOrderedList';

interface NumberingOption {
  id: NumberingStyle | 'none';
  label: string;
  items?: [string, string, string];
}

const NUMBERING_OPTIONS: NumberingOption[] = [
  { id: 'none', label: 'Ninguna' },
  { id: 'decimal', label: '1. 2. 3.', items: ['1.', '2.', '3.'] },
  { id: 'decimal-paren', label: '1) 2) 3)', items: ['1)', '2)', '3)'] },
  { id: 'upper-roman', label: 'I. II. III.', items: ['I.', 'II.', 'III.'] },
  { id: 'upper-alpha', label: 'A. B. C.', items: ['A.', 'B.', 'C.'] },
  { id: 'lower-alpha-paren', label: 'a) b) c)', items: ['a)', 'b)', 'c)'] },
  { id: 'lower-alpha', label: 'a. b. c.', items: ['a.', 'b.', 'c.'] },
  { id: 'lower-roman', label: 'i. ii. iii.', items: ['i.', 'ii.', 'iii.'] },
];

type ToolbarViewMode = 'compact' | 'extended';

const TOOLBAR_MODE_STORAGE_KEY = 'veyra-notes-toolbar-mode';

export interface EditorToolbarProps {
  editor: Editor | null;
  onUploadImage?: (file: File) => Promise<void>;
  onAttachFromDrive?: () => Promise<void> | void;
  isAttachingDrive?: boolean;
  onOpenTemplates?: () => void;
  showFormattingMarks?: boolean;
  onToggleFormattingMarks?: () => void;
  isFocusMode?: boolean;
  onToggleFocusMode?: () => void;
}

const NOOP_EDITOR = {
  isActive: () => false,
  getAttributes: () => ({}),
  can: () => ({ undo: () => false, redo: () => false }),
} as unknown as Editor;

export const EditorToolbar: React.FC<EditorToolbarProps> = ({
  editor: editorProp,
  onUploadImage,
  onAttachFromDrive,
  isAttachingDrive = false,
  onOpenTemplates,
  showFormattingMarks,
  onToggleFormattingMarks,
}) => {
  const isEditorReady = Boolean(editorProp);
  const editor = editorProp ?? NOOP_EDITOR;
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Botones trigger y referencias de popover
  const textColorBtnRef = useRef<HTMLButtonElement>(null);
  const textColorMenuRef = useRef<HTMLDivElement>(null);
  const highlightBtnRef = useRef<HTMLButtonElement>(null);
  const highlightMenuRef = useRef<HTMLDivElement>(null);
  const fontBtnRef = useRef<HTMLButtonElement>(null);
  const fontMenuRef = useRef<HTMLDivElement>(null);
  const fontSizeBtnRef = useRef<HTMLButtonElement>(null);
  const fontSizeMenuRef = useRef<HTMLDivElement>(null);
  const orderedListBtnRef = useRef<HTMLButtonElement>(null);
  const orderedListMenuRef = useRef<HTMLDivElement>(null);

  const [isTextColorMenuOpen, setIsTextColorMenuOpen] = useState(false);
  const [isHighlightMenuOpen, setIsHighlightMenuOpen] = useState(false);
  const [isFontMenuOpen, setIsFontMenuOpen] = useState(false);
  const [isFontSizeMenuOpen, setIsFontSizeMenuOpen] = useState(false);
  const [isOrderedListMenuOpen, setIsOrderedListMenuOpen] = useState(false);

  const [textColorCoords, setTextColorCoords] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });
  const [highlightCoords, setHighlightCoords] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });
  const [fontCoords, setFontCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [fontSizeCoords, setFontSizeCoords] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });
  const [orderedListCoords, setOrderedListCoords] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });
  const [customStartInput, setCustomStartInput] = useState<string>('2');

  // Responsive overflow tray refs & state
  const toolbarContainerRef = useRef<HTMLDivElement>(null);
  const toolbarTrackRef = useRef<HTMLDivElement>(null);
  const extendedContentRef = useRef<HTMLDivElement>(null);
  const overflowBtnRef = useRef<HTMLButtonElement>(null);
  const overflowMenuRef = useRef<HTMLDivElement>(null);
  const itemWidthsRef = useRef<Map<string, number>>(new Map());
  const [visibleCount, setVisibleCount] = useState<number | null>(null);
  const [extendedHeight, setExtendedHeight] = useState<number>(82);
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const [overflowCoords, setOverflowCoords] = useState<{ top: number; right: number }>({
    top: 0,
    right: 8,
  });
  const [toolbarMode, setToolbarMode] = useState<ToolbarViewMode>(() => {
    if (typeof window === 'undefined') return 'extended';
    try {
      const saved = window.localStorage.getItem(TOOLBAR_MODE_STORAGE_KEY);
      return saved === 'compact' || saved === 'extended' ? saved : 'extended';
    } catch {
      return 'extended';
    }
  });

  const handleToggleToolbarMode = useCallback(() => {
    setIsTextColorMenuOpen(false);
    setIsHighlightMenuOpen(false);
    setIsFontMenuOpen(false);
    setIsFontSizeMenuOpen(false);
    setIsOrderedListMenuOpen(false);
    setIsOverflowOpen(false);
    setToolbarMode((prev) => {
      const next: ToolbarViewMode = prev === 'extended' ? 'compact' : 'extended';
      try {
        window.localStorage.setItem(TOOLBAR_MODE_STORAGE_KEY, next);
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  }, []);

  // Hook de colores recientes y persistencia
  const {
    lastTextColor,
    lastHighlightColor,
    recentTextColors,
    recentHighlightColors,
    saveTextColor,
    saveHighlightColor,
  } = useRecentEditorColors();

  const clampPopoverCoords = useCallback(
    (rect: DOMRect, popoverWidth: number, estimatedHeight: number) => {
      const margin = 10;
      let left = rect.left;
      if (left + popoverWidth > window.innerWidth - margin) {
        left = window.innerWidth - popoverWidth - margin;
      }
      if (left < margin) left = margin;

      let top = rect.bottom + 4;
      if (top + estimatedHeight > window.innerHeight - margin) {
        const aboveTop = rect.top - estimatedHeight - 4;
        if (aboveTop >= margin) {
          top = aboveTop;
        } else {
          top = Math.max(margin, window.innerHeight - estimatedHeight - margin);
        }
      }

      return { top, left };
    },
    []
  );

  // Actualizar coordenadas de los popovers respecto al viewport
  const updateTextColorPosition = useCallback(() => {
    if (!textColorBtnRef.current) return;
    setTextColorCoords(
      clampPopoverCoords(textColorBtnRef.current.getBoundingClientRect(), 215, 220)
    );
  }, [clampPopoverCoords]);

  const updateHighlightPosition = useCallback(() => {
    if (!highlightBtnRef.current) return;
    setHighlightCoords(
      clampPopoverCoords(highlightBtnRef.current.getBoundingClientRect(), 200, 200)
    );
  }, [clampPopoverCoords]);

  const updateFontPosition = useCallback(() => {
    if (!fontBtnRef.current) return;
    setFontCoords(clampPopoverCoords(fontBtnRef.current.getBoundingClientRect(), 288, 360));
  }, [clampPopoverCoords]);

  const updateFontSizePosition = useCallback(() => {
    if (!fontSizeBtnRef.current) return;
    setFontSizeCoords(
      clampPopoverCoords(fontSizeBtnRef.current.getBoundingClientRect(), 208, 300)
    );
  }, [clampPopoverCoords]);

  const updateOrderedListPosition = useCallback(() => {
    if (!orderedListBtnRef.current) return;
    setOrderedListCoords(
      clampPopoverCoords(orderedListBtnRef.current.getBoundingClientRect(), 268, 340)
    );
  }, [clampPopoverCoords]);

  const updateOverflowPosition = useCallback(() => {
    if (!overflowBtnRef.current) return;
    const rect = overflowBtnRef.current.getBoundingClientRect();
    setOverflowCoords({
      top: rect.bottom + 6,
      right: Math.max(8, window.innerWidth - rect.right),
    });
  }, []);

  const getPreviousListContinuation = useCallback((): number | null => {
    if (!editor) return null;
    const { state } = editor;
    const { $from } = state.selection;

    let currentListPos: number | null = null;
    for (let d = $from.depth; d > 0; d--) {
      if ($from.node(d).type.name === 'orderedList') {
        currentListPos = $from.before(d);
        break;
      }
    }

    const searchBeforePos = currentListPos !== null ? currentListPos : $from.pos;
    let previousList: { start: number; count: number } | null = null;

    state.doc.nodesBetween(0, searchBeforePos, (node, pos) => {
      if (node.type.name === 'orderedList' && pos < searchBeforePos) {
        const start = (node.attrs.start as number) || 1;
        const count = node.childCount;
        previousList = { start, count };
      }
    });

    if (!previousList) return null;
    return (
      (previousList as { start: number; count: number }).start +
      (previousList as { start: number; count: number }).count
    );
  }, [editor]);

  // Forzar actualización inmediata de la barra cuando cambia la selección o contenido del editor
  const [, setTick] = useState(0);
  const lastSelectionRef = useRef<{ from: number; to: number } | null>(null);

  useEffect(() => {
    if (!isEditorReady) return;
    const handleUpdate = () => {
      setTick((t) => t + 1);
      if (editor.state && editor.state.selection && !editor.state.selection.empty) {
        lastSelectionRef.current = {
          from: editor.state.selection.from,
          to: editor.state.selection.to,
        };
      }
    };
    editor.on('update', handleUpdate);
    editor.on('selectionUpdate', handleUpdate);
    return () => {
      editor.off('update', handleUpdate);
      editor.off('selectionUpdate', handleUpdate);
    };
  }, [editor, isEditorReady]);

  const hasTemplates = Boolean(onOpenTemplates);
  const hasUploadImage = Boolean(onUploadImage);
  const hasAttachFromDrive = Boolean(onAttachFromDrive);
  const hasFormattingMarks = Boolean(onToggleFormattingMarks);

  const toolbarItemsMeta = useMemo(() => {
    const items: Array<{ id: string; group: string; fallbackWidth: number }> = [
      // 1. Historial
      { id: 'undo', group: 'history', fallbackWidth: 28 },
      { id: 'redo', group: 'history', fallbackWidth: 28 },
      // 2. Fuente
      { id: 'font-family', group: 'font', fallbackWidth: 115 },
      { id: 'font-size', group: 'font', fallbackWidth: 104 },
      { id: 'clear-format', group: 'font', fallbackWidth: 28 },
      { id: 'bold', group: 'font', fallbackWidth: 28 },
      { id: 'italic', group: 'font', fallbackWidth: 28 },
      { id: 'underline', group: 'font', fallbackWidth: 28 },
      { id: 'strike', group: 'font', fallbackWidth: 28 },
      { id: 'text-color', group: 'font', fallbackWidth: 46 },
      { id: 'highlight', group: 'font', fallbackWidth: 46 },
      // 3. Párrafo
      { id: 'bullet-list', group: 'paragraph', fallbackWidth: 28 },
      { id: 'ordered-list', group: 'paragraph', fallbackWidth: 50 },
      { id: 'task-list', group: 'paragraph', fallbackWidth: 28 },
      { id: 'blockquote', group: 'paragraph', fallbackWidth: 28 },
      { id: 'hr', group: 'paragraph', fallbackWidth: 28 },
    ];
    if (hasFormattingMarks) {
      items.push({ id: 'formatting-marks', group: 'paragraph', fallbackWidth: 28 });
    }
    items.push(
      { id: 'align-left', group: 'paragraph', fallbackWidth: 28 },
      { id: 'align-center', group: 'paragraph', fallbackWidth: 28 },
      { id: 'align-right', group: 'paragraph', fallbackWidth: 28 },
      { id: 'align-justify', group: 'paragraph', fallbackWidth: 28 },
      // 4. Estilos
      { id: 'h1', group: 'styles', fallbackWidth: 28 },
      { id: 'h2', group: 'styles', fallbackWidth: 28 },
      { id: 'h3', group: 'styles', fallbackWidth: 28 },
      // 5. Insertar
      { id: 'table', group: 'insert', fallbackWidth: 28 },
      { id: 'math', group: 'insert', fallbackWidth: 28 },
      { id: 'code', group: 'insert', fallbackWidth: 28 }
    );
    if (hasTemplates) items.push({ id: 'templates', group: 'insert', fallbackWidth: 28 });
    if (hasUploadImage) items.push({ id: 'image', group: 'insert', fallbackWidth: 28 });
    if (hasAttachFromDrive) items.push({ id: 'drive', group: 'insert', fallbackWidth: 28 });
    // 6. IA
    items.push({ id: 'ai', group: 'ai', fallbackWidth: 28 });
    return items;
  }, [hasTemplates, hasUploadImage, hasAttachFromDrive, hasFormattingMarks]);

  const recalculateVisibleCount = useCallback(() => {
    const container = toolbarContainerRef.current;
    const track = toolbarTrackRef.current;
    if (!container) return;

    if (track) {
      const nodes = track.querySelectorAll<HTMLElement>('[data-toolbar-item-id]');
      nodes.forEach((el) => {
        const id = el.dataset.toolbarItemId;
        if (!id) return;
        const w = Math.ceil(el.getBoundingClientRect().width);
        if (w > 0) {
          itemWidthsRef.current.set(id, w);
        }
      });
    }

    const style = window.getComputedStyle(container);
    const padLeft = parseFloat(style.paddingLeft) || 0;
    const padRight = parseFloat(style.paddingRight) || 0;
    const MODE_TOGGLE_RESERVE = 36;
    const availableWidth = Math.max(
      0,
      container.clientWidth - padLeft - padRight - MODE_TOGGLE_RESERVE
    );
    if (availableWidth <= 0) return;

    const GAP = 2; // gap-0.5
    const SEP_WIDTH = 9; // w-[1px] + mx-1
    const OVERFLOW_RESERVE = 40; // pl-1 + border-l + button + gap

    let totalWidth = 0;
    for (let i = 0; i < toolbarItemsMeta.length; i++) {
      const meta = toolbarItemsMeta[i];
      const itemW = itemWidthsRef.current.get(meta.id) ?? meta.fallbackWidth;
      if (i > 0) {
        totalWidth += GAP;
        if (toolbarItemsMeta[i - 1].group !== meta.group) {
          totalWidth += SEP_WIDTH + GAP;
        }
      }
      totalWidth += itemW;
    }

    let nextCount = toolbarItemsMeta.length;
    if (totalWidth > availableWidth) {
      const budget = Math.max(0, availableWidth - OVERFLOW_RESERVE);
      let used = 0;
      nextCount = 0;
      for (let i = 0; i < toolbarItemsMeta.length; i++) {
        const meta = toolbarItemsMeta[i];
        const itemW = itemWidthsRef.current.get(meta.id) ?? meta.fallbackWidth;
        let delta = itemW;
        if (i > 0) {
          delta += GAP;
          if (toolbarItemsMeta[i - 1].group !== meta.group) {
            delta += SEP_WIDTH + GAP;
          }
        }
        if (used + delta <= budget) {
          used += delta;
          nextCount = i + 1;
        } else {
          break;
        }
      }
    }

    setVisibleCount((prev) => (prev === nextCount ? prev : nextCount));
  }, [toolbarItemsMeta]);

  useEffect(() => {
    if (toolbarMode !== 'compact') return;
    const container = toolbarContainerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      recalculateVisibleCount();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [recalculateVisibleCount, editor, toolbarMode]);

  useEffect(() => {
    if (toolbarMode !== 'extended') return;
    const el = extendedContentRef.current;
    if (!el) return;
    const measure = () => {
      const next = Math.ceil(el.getBoundingClientRect().height);
      if (next > 0) {
        setExtendedHeight((prev) => (prev === next ? prev : next));
      }
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [toolbarMode, editor, hasTemplates, hasUploadImage, hasAttachFromDrive, hasFormattingMarks]);

  // Cerrar popovers al hacer click fuera o al redimensionar/desplazar la ventana
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        textColorMenuRef.current &&
        !textColorMenuRef.current.contains(target) &&
        textColorBtnRef.current &&
        !textColorBtnRef.current.contains(target)
      ) {
        setIsTextColorMenuOpen(false);
      }
      if (
        highlightMenuRef.current &&
        !highlightMenuRef.current.contains(target) &&
        highlightBtnRef.current &&
        !highlightBtnRef.current.contains(target)
      ) {
        setIsHighlightMenuOpen(false);
      }
      if (
        fontMenuRef.current &&
        !fontMenuRef.current.contains(target) &&
        fontBtnRef.current &&
        !fontBtnRef.current.contains(target)
      ) {
        setIsFontMenuOpen(false);
      }
      if (
        fontSizeMenuRef.current &&
        !fontSizeMenuRef.current.contains(target) &&
        fontSizeBtnRef.current &&
        !fontSizeBtnRef.current.contains(target)
      ) {
        setIsFontSizeMenuOpen(false);
      }
      if (
        orderedListMenuRef.current &&
        !orderedListMenuRef.current.contains(target) &&
        orderedListBtnRef.current &&
        !orderedListBtnRef.current.contains(target)
      ) {
        setIsOrderedListMenuOpen(false);
      }
      const isInsideSubMenu =
        textColorMenuRef.current?.contains(target) ||
        highlightMenuRef.current?.contains(target) ||
        fontMenuRef.current?.contains(target) ||
        fontSizeMenuRef.current?.contains(target) ||
        orderedListMenuRef.current?.contains(target);
      if (
        !isInsideSubMenu &&
        overflowMenuRef.current &&
        !overflowMenuRef.current.contains(target) &&
        overflowBtnRef.current &&
        !overflowBtnRef.current.contains(target)
      ) {
        setIsOverflowOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (
        isTextColorMenuOpen ||
        isHighlightMenuOpen ||
        isFontMenuOpen ||
        isFontSizeMenuOpen ||
        isOrderedListMenuOpen
      ) {
        setIsTextColorMenuOpen(false);
        setIsHighlightMenuOpen(false);
        setIsFontMenuOpen(false);
        setIsFontSizeMenuOpen(false);
        setIsOrderedListMenuOpen(false);
      } else if (isOverflowOpen) {
        setIsOverflowOpen(false);
      }
    };

    const handleWindowChange = () => {
      if (isTextColorMenuOpen) updateTextColorPosition();
      if (isHighlightMenuOpen) updateHighlightPosition();
      if (isFontMenuOpen) updateFontPosition();
      if (isFontSizeMenuOpen) updateFontSizePosition();
      if (isOrderedListMenuOpen) updateOrderedListPosition();
      if (isOverflowOpen) updateOverflowPosition();
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
  }, [
    isTextColorMenuOpen,
    isHighlightMenuOpen,
    isFontMenuOpen,
    isFontSizeMenuOpen,
    isOrderedListMenuOpen,
    isOverflowOpen,
    updateTextColorPosition,
    updateHighlightPosition,
    updateFontPosition,
    updateFontSizePosition,
    updateOrderedListPosition,
    updateOverflowPosition,
  ]);

  const watchedFontFamily = isEditorReady
    ? (editor.getAttributes('textStyle').fontFamily as string | undefined) || ''
    : '';
  const watchedFontSize = isEditorReady
    ? (editor.getAttributes('textStyle').fontSize as string | undefined) || ''
    : '';

  useEffect(() => {
    if (toolbarMode !== 'compact') return;
    const rafId = requestAnimationFrame(() => {
      recalculateVisibleCount();
    });
    return () => cancelAnimationFrame(rafId);
  }, [isEditorReady, recalculateVisibleCount, watchedFontFamily, watchedFontSize, toolbarMode]);

  // Estado activo de colores y fuentes
  const currentTextColor = (editor.getAttributes('textStyle').color as string | undefined) || null;
  const currentHighlightColor =
    (editor.getAttributes('highlight').color as string | undefined) || null;
  const isHighlightActive = editor.isActive('highlight');
  const currentFontFamily =
    (editor.getAttributes('textStyle').fontFamily as string | undefined) || null;
  const currentFontSize = (editor.getAttributes('textStyle').fontSize as string | undefined) || null;

  const isOrderedListActive = editor.isActive('orderedList');
  const currentListStyle =
    (editor.getAttributes('orderedList')?.listStyle as NumberingStyle) || 'decimal';
  const currentListStart = (editor.getAttributes('orderedList')?.start as number) || 1;
  const previousContinuation = isOrderedListActive ? getPreviousListContinuation() : null;

  const handleSelectNumberingStyle = (styleId: NumberingStyle | 'none') => {
    if (!editor) return;

    if (styleId === 'none') {
      if (editor.isActive('orderedList')) {
        editor.chain().focus().toggleOrderedList().run();
      }
      setIsOrderedListMenuOpen(false);
      return;
    }

    if (editor.isActive('orderedList')) {
      editor.chain().focus().updateAttributes('orderedList', { listStyle: styleId }).run();
    } else {
      editor
        .chain()
        .focus()
        .toggleOrderedList()
        .updateAttributes('orderedList', { listStyle: styleId })
        .run();
    }
    setIsOrderedListMenuOpen(false);
  };

  // Encontrar opción de tamaño actual o calcular tamaño efectivo según el bloque (H1/H2/H3/Párrafo)
  const getEffectiveFontSize = (): { value: string; size: number } => {
    if (currentFontSize) {
      const num = parseInt(currentFontSize, 10);
      return { value: currentFontSize, size: isNaN(num) ? 14 : num };
    }
    if (!editor) return { value: '14px', size: 14 };

    if (editor.isActive('heading', { level: 1 })) {
      return { value: '30px', size: 30 };
    }
    if (editor.isActive('heading', { level: 2 })) {
      return { value: '24px', size: 24 };
    }
    if (editor.isActive('heading', { level: 3 })) {
      return { value: '19px', size: 19 };
    }
    return { value: '14px', size: 14 };
  };

  const effectiveFontSize = getEffectiveFontSize();

  // Encontrar opción de fuente actual
  const activeFontOption = NOTE_FONTS.find(
    (f) =>
      currentFontFamily &&
      (currentFontFamily.toLowerCase() === f.fontName.toLowerCase() ||
        currentFontFamily.toLowerCase().includes(f.fontName.toLowerCase()))
  );

  const handleToggleTextColorMenu = () => {
    if (!isTextColorMenuOpen) {
      updateTextColorPosition();
      setIsHighlightMenuOpen(false);
      setIsFontMenuOpen(false);
      setIsFontSizeMenuOpen(false);
      setIsOrderedListMenuOpen(false);
      setIsTextColorMenuOpen(true);
    } else {
      setIsTextColorMenuOpen(false);
    }
  };

  const handleToggleHighlightMenu = () => {
    if (!isHighlightMenuOpen) {
      updateHighlightPosition();
      setIsTextColorMenuOpen(false);
      setIsFontMenuOpen(false);
      setIsFontSizeMenuOpen(false);
      setIsOrderedListMenuOpen(false);
      setIsHighlightMenuOpen(true);
    } else {
      setIsHighlightMenuOpen(false);
    }
  };

  const handleToggleFontMenu = () => {
    if (!isFontMenuOpen) {
      updateFontPosition();
      setIsTextColorMenuOpen(false);
      setIsHighlightMenuOpen(false);
      setIsFontSizeMenuOpen(false);
      setIsOrderedListMenuOpen(false);
      setIsFontMenuOpen(true);
    } else {
      setIsFontMenuOpen(false);
    }
  };

  const handleToggleFontSizeMenu = () => {
    if (!isFontSizeMenuOpen) {
      if (editor.state && editor.state.selection && !editor.state.selection.empty) {
        lastSelectionRef.current = {
          from: editor.state.selection.from,
          to: editor.state.selection.to,
        };
      }
      updateFontSizePosition();
      setIsTextColorMenuOpen(false);
      setIsHighlightMenuOpen(false);
      setIsFontMenuOpen(false);
      setIsOrderedListMenuOpen(false);
      setIsFontSizeMenuOpen(true);
    } else {
      setIsFontSizeMenuOpen(false);
    }
  };

  const applyFontSize = (size: string | null) => {
    if (!editor) return;
    let chain = editor.chain().focus();
    if (editor.state.selection.empty && lastSelectionRef.current) {
      chain = chain.setTextSelection(lastSelectionRef.current);
    }
    if (!size || size === 'default') {
      chain.unsetFontSize().run();
    } else {
      chain.setFontSize(size).run();
    }
    if (editor.state.selection && !editor.state.selection.empty) {
      lastSelectionRef.current = {
        from: editor.state.selection.from,
        to: editor.state.selection.to,
      };
    }
  };

  const handleIncreaseFontSize = () => {
    if (!editor) return;
    const nextSize = getNextLargerFontSize(effectiveFontSize.value);
    applyFontSize(nextSize);
  };

  const handleDecreaseFontSize = () => {
    if (!editor) return;
    const prevSize = getNextSmallerFontSize(effectiveFontSize.value);
    applyFontSize(prevSize);
  };

  const handleTriggerImageUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onUploadImage) {
      await onUploadImage(file);
    }
    if (e.target) {
      e.target.value = '';
    }
  };

  // Acciones de color rápido (Aplica directamente el último color usado o lo desactiva si ya está activo)
  const handleQuickApplyTextColor = () => {
    if (!editor) return;
    if (currentTextColor && areColorsEqual(currentTextColor, lastTextColor)) {
      editor.chain().focus().unsetColor().run();
    } else {
      editor.chain().focus().setColor(lastTextColor).run();
    }
  };

  const handleQuickApplyHighlight = () => {
    if (!editor) return;
    if (
      isHighlightActive &&
      currentHighlightColor &&
      areColorsEqual(currentHighlightColor, lastHighlightColor)
    ) {
      editor.chain().focus().unsetHighlight().run();
    } else {
      editor.chain().focus().setHighlight({ color: lastHighlightColor }).run();
    }
  };

  // Acciones de selección de color desde la paleta
  const handleSelectTextColor = (color: string) => {
    if (color === 'default') {
      editor.chain().focus().unsetColor().run();
    } else {
      editor.chain().focus().setColor(color).run();
      saveTextColor(color);
    }
  };

  const handleSelectHighlightColor = (color: string) => {
    if (color === 'transparent') {
      editor.chain().focus().unsetHighlight().run();
    } else {
      editor.chain().focus().setHighlight({ color }).run();
      saveHighlightColor(color);
    }
  };

  // Limpiar todo formato a valores por defecto
  const handleClearFormatting = () => {
    editor
      .chain()
      .focus()
      .unsetAllMarks()
      .clearNodes()
      .setTextAlign('left')
      .unsetColor()
      .unsetHighlight()
      .unsetFontFamily()
      .unsetFontSize()
      .run();
  };

  // Alternar encabezados de forma determinista y consistente (H1, H2, H3)
  const handleToggleHeading = (level: 1 | 2 | 3) => {
    if (!editor) return;
    if (editor.isActive('heading', { level })) {
      editor.chain().focus().setParagraph().run();
      return;
    }

    const { state } = editor;
    const { selection } = state;
    const { from, to, $from } = selection;

    const blocksToProcess: Array<{ pos: number; node: any }> = [];
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.isBlock && (node.type.name === 'paragraph' || node.type.name === 'heading')) {
        let hasBr = false;
        node.forEach((child: any) => {
          if (child.type.name === 'hardBreak') hasBr = true;
        });
        if (hasBr) {
          blocksToProcess.push({ pos, node });
        }
      }
    });

    if (blocksToProcess.length > 0) {
      let tr = editor.state.tr;
      for (let b = blocksToProcess.length - 1; b >= 0; b--) {
        const { pos, node } = blocksToProcess[b];
        const start = pos + 1;
        const brOffsets: number[] = [];
        node.forEach((child: any, offset: number) => {
          if (child.type.name === 'hardBreak') brOffsets.push(offset);
        });
        for (let i = brOffsets.length - 1; i >= 0; i--) {
          const brPos = start + brOffsets[i];
          tr = tr.delete(brPos, brPos + 1).split(brPos);
        }
      }
      editor.view.dispatch(tr);
      editor.chain().focus().setHeading({ level }).run();
      return;
    }

    const blockStart = $from.start();
    const blockEnd = $from.end();
    const isPartial = from > blockStart || to < blockEnd;

    if (!selection.empty && isPartial && $from.sameParent($from.doc.resolve(to))) {
      let tr = editor.state.tr;
      let middleStart = from;
      let middleEnd = to;

      if (to < blockEnd) {
        tr = tr.split(to);
      }
      if (from > blockStart) {
        tr = tr.split(from);
        middleStart += 2;
        middleEnd += 2;
      }
      editor.view.dispatch(tr);
      editor.commands.setTextSelection({ from: middleStart, to: middleEnd });
      editor.chain().focus().setHeading({ level }).run();
      return;
    }

    editor.chain().focus().setHeading({ level }).run();
  };

  const toolBtn = (
    isActive: boolean,
    onClick: () => void,
    icon: React.ReactNode,
    title: string,
    disabled = false
  ) => (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'h-7 px-1.5 rounded-md transition-colors flex items-center justify-center cursor-pointer shrink-0 disabled:opacity-30 disabled:pointer-events-none',
        isActive
          ? 'bg-accent/15 text-accent font-semibold'
          : 'text-veyra-muted hover:text-veyra-text hover:bg-black/5 dark:hover:bg-white/5'
      )}
    >
      {icon}
    </button>
  );

  interface ToolbarItemDef {
    id: string;
    group: string;
    isActive: boolean;
    render: (inOverflow?: boolean) => React.ReactNode;
  }

  const toolbarItems: ToolbarItemDef[] = [
    // 1. Historial
    {
      id: 'undo',
      group: 'history',
      isActive: false,
      render: () => (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          className="h-7 px-1.5 rounded-md text-veyra-muted hover:text-veyra-text hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer shrink-0 flex items-center justify-center"
          title="Deshacer (Ctrl+Z)"
        >
          <Undo className="w-3.5 h-3.5" />
        </button>
      ),
    },
    {
      id: 'redo',
      group: 'history',
      isActive: false,
      render: () => (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          className="h-7 px-1.5 rounded-md text-veyra-muted hover:text-veyra-text hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer shrink-0 flex items-center justify-center"
          title="Rehacer (Ctrl+Y)"
        >
          <Redo className="w-3.5 h-3.5" />
        </button>
      ),
    },

    // 2. Fuente
    {
      id: 'font-family',
      group: 'font',
      isActive: Boolean(activeFontOption),
      render: () => (
        <div className="relative shrink-0">
          <button
            ref={fontBtnRef}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleToggleFontMenu}
            title="Tipografía de nota"
            className={cn(
              'h-7 px-2 rounded-md transition-colors flex items-center justify-center gap-1.5 cursor-pointer max-w-[130px]',
              isFontMenuOpen || activeFontOption
                ? 'bg-accent/15 text-accent font-semibold'
                : 'text-veyra-muted hover:text-veyra-text hover:bg-black/5 dark:hover:bg-white/5'
            )}
          >
            <Type className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate text-[11px] font-medium">
              {activeFontOption ? activeFontOption.name : 'Tipografía'}
            </span>
            <ChevronDown className="w-2.5 h-2.5 opacity-60 shrink-0" />
          </button>
        </div>
      ),
    },
    {
      id: 'font-size',
      group: 'font',
      isActive: Boolean(currentFontSize),
      render: () => (
        <div className="inline-flex items-center h-7 rounded-md p-0.5 transition-colors border border-transparent hover:border-black/10 dark:hover:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 shrink-0">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleIncreaseFontSize}
            title={`Aumentar tamaño de texto (${effectiveFontSize.value} → ${getNextLargerFontSize(effectiveFontSize.value)})`}
            className="h-6 px-1.5 rounded flex items-center justify-center cursor-pointer transition-colors text-veyra-muted hover:text-veyra-text hover:bg-black/10 dark:hover:bg-white/10"
          >
            <AArrowUp className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleDecreaseFontSize}
            title={`Disminuir tamaño de texto (${effectiveFontSize.value} → ${getNextSmallerFontSize(effectiveFontSize.value)})`}
            className="h-6 px-1.5 rounded flex items-center justify-center cursor-pointer transition-colors text-veyra-muted hover:text-veyra-text hover:bg-black/10 dark:hover:bg-white/10"
          >
            <AArrowDown className="w-3.5 h-3.5" />
          </button>
          <button
            ref={fontSizeBtnRef}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleToggleFontSizeMenu}
            title="Elegir tamaño de texto seleccionado"
            className={cn(
              'h-6 px-1.5 rounded flex items-center justify-center gap-0.5 cursor-pointer transition-colors text-[11px] font-medium text-veyra-muted hover:text-veyra-text hover:bg-black/10 dark:hover:bg-white/10',
              isFontSizeMenuOpen && 'bg-black/10 dark:bg-white/10 text-veyra-text'
            )}
          >
            <span>{effectiveFontSize.size}</span>
            <ChevronDown
              className={cn(
                'w-2.5 h-2.5 transition-transform duration-150',
                isFontSizeMenuOpen && 'rotate-180'
              )}
            />
          </button>
        </div>
      ),
    },
    {
      id: 'clear-format',
      group: 'font',
      isActive: false,
      render: () =>
        toolBtn(
          false,
          handleClearFormatting,
          <Eraser className="w-3.5 h-3.5" />,
          'Borrar todo formato (Restablecer texto normal)'
        ),
    },
    {
      id: 'bold',
      group: 'font',
      isActive: editor.isActive('bold'),
      render: () =>
        toolBtn(
          editor.isActive('bold'),
          () => editor.chain().focus().toggleBold().run(),
          <Bold className="w-3.5 h-3.5" />,
          'Negrita (Ctrl+B)'
        ),
    },
    {
      id: 'italic',
      group: 'font',
      isActive: editor.isActive('italic'),
      render: () =>
        toolBtn(
          editor.isActive('italic'),
          () => editor.chain().focus().toggleItalic().run(),
          <Italic className="w-3.5 h-3.5" />,
          'Cursiva (Ctrl+I)'
        ),
    },
    {
      id: 'underline',
      group: 'font',
      isActive: editor.isActive('underline'),
      render: () =>
        toolBtn(
          editor.isActive('underline'),
          () => editor.chain().focus().toggleUnderline().run(),
          <UnderlineIcon className="w-3.5 h-3.5" />,
          'Subrayado (Ctrl+U)'
        ),
    },
    {
      id: 'strike',
      group: 'font',
      isActive: editor.isActive('strike'),
      render: () =>
        toolBtn(
          editor.isActive('strike'),
          () => editor.chain().focus().toggleStrike().run(),
          <Strikethrough className="w-3.5 h-3.5" />,
          'Tachado'
        ),
    },
    {
      id: 'text-color',
      group: 'font',
      isActive: Boolean(currentTextColor),
      render: () => (
        <div className="inline-flex items-center h-7 rounded-md p-0.5 transition-colors border border-transparent hover:border-black/10 dark:hover:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 shrink-0">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleQuickApplyTextColor}
            title={`Color de texto (Clic para aplicar / alternar ${lastTextColor})`}
            className={cn(
              'h-6 px-1.5 rounded flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors',
              currentTextColor
                ? 'text-accent font-semibold'
                : 'text-veyra-muted hover:text-veyra-text'
            )}
          >
            <Palette className="w-3.5 h-3.5" />
            <span
              className="w-3.5 h-[2.5px] rounded-full transition-colors shadow-xs"
              style={{ backgroundColor: lastTextColor }}
            />
          </button>
          <button
            ref={textColorBtnRef}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleToggleTextColorMenu}
            title="Elegir otro color de texto"
            className={cn(
              'h-6 w-3.5 rounded flex items-center justify-center cursor-pointer transition-colors text-veyra-muted hover:text-veyra-text hover:bg-black/10 dark:hover:bg-white/10',
              isTextColorMenuOpen && 'bg-black/10 dark:bg-white/10 text-veyra-text'
            )}
          >
            <ChevronDown
              className={cn(
                'w-2.5 h-2.5 transition-transform duration-150',
                isTextColorMenuOpen && 'rotate-180'
              )}
            />
          </button>
        </div>
      ),
    },
    {
      id: 'highlight',
      group: 'font',
      isActive: isHighlightActive,
      render: () => (
        <div className="inline-flex items-center h-7 rounded-md p-0.5 transition-colors border border-transparent hover:border-black/10 dark:hover:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 shrink-0">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleQuickApplyHighlight}
            title="Resaltar texto (Clic para aplicar / alternar)"
            className={cn(
              'h-6 px-1.5 rounded flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors',
              isHighlightActive
                ? 'text-accent font-semibold'
                : 'text-veyra-muted hover:text-veyra-text'
            )}
          >
            <Highlighter className="w-3.5 h-3.5" />
            <span
              className="w-3.5 h-[2.5px] rounded-full transition-colors shadow-xs"
              style={{ backgroundColor: lastHighlightColor }}
            />
          </button>
          <button
            ref={highlightBtnRef}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleToggleHighlightMenu}
            title="Elegir otro color de resaltado"
            className={cn(
              'h-6 w-3.5 rounded flex items-center justify-center cursor-pointer transition-colors text-veyra-muted hover:text-veyra-text hover:bg-black/10 dark:hover:bg-white/10',
              isHighlightMenuOpen && 'bg-black/10 dark:bg-white/10 text-veyra-text'
            )}
          >
            <ChevronDown
              className={cn(
                'w-2.5 h-2.5 transition-transform duration-150',
                isHighlightMenuOpen && 'rotate-180'
              )}
            />
          </button>
        </div>
      ),
    },

    // 3. Párrafo
    {
      id: 'bullet-list',
      group: 'paragraph',
      isActive: editor.isActive('bulletList'),
      render: () =>
        toolBtn(
          editor.isActive('bulletList'),
          () => editor.chain().focus().toggleBulletList().run(),
          <List className="w-3.5 h-3.5" />,
          'Lista con viñetas'
        ),
    },
    {
      id: 'ordered-list',
      group: 'paragraph',
      isActive: isOrderedListActive,
      render: () => (
        <div className="relative inline-flex items-center shrink-0">
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              editor.chain().focus().toggleOrderedList().run();
            }}
            title="Lista numerada"
            className={cn(
              'h-7 px-1.5 rounded-l-md transition-colors flex items-center justify-center cursor-pointer shrink-0',
              isOrderedListActive
                ? 'bg-accent/15 text-accent font-semibold'
                : 'text-veyra-muted hover:text-veyra-text hover:bg-black/5 dark:hover:bg-white/5'
            )}
          >
            <ListOrdered className="w-3.5 h-3.5" />
          </button>
          <button
            ref={orderedListBtnRef}
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!isOrderedListMenuOpen) {
                updateOrderedListPosition();
                setCustomStartInput(String(currentListStart));
                setIsTextColorMenuOpen(false);
                setIsHighlightMenuOpen(false);
                setIsFontMenuOpen(false);
                setIsFontSizeMenuOpen(false);
                setIsOrderedListMenuOpen(true);
              } else {
                setIsOrderedListMenuOpen(false);
              }
            }}
            title="Biblioteca de numeración"
            className={cn(
              'h-7 px-1 rounded-r-md transition-colors flex items-center justify-center cursor-pointer',
              isOrderedListActive
                ? 'bg-accent/15 text-accent hover:bg-accent/25 border-l border-accent/20'
                : isOrderedListMenuOpen
                  ? 'bg-black/10 dark:bg-white/10 text-veyra-text'
                  : 'text-veyra-muted hover:text-veyra-text hover:bg-black/5 dark:hover:bg-white/5'
            )}
          >
            <ChevronDown className="w-2.5 h-2.5" />
          </button>
        </div>
      ),
    },
    {
      id: 'task-list',
      group: 'paragraph',
      isActive: editor.isActive('taskList'),
      render: () =>
        toolBtn(
          editor.isActive('taskList'),
          () => editor.chain().focus().toggleTaskList().run(),
          <CheckSquare className="w-3.5 h-3.5" />,
          'Lista de tareas / Checklist'
        ),
    },
    {
      id: 'blockquote',
      group: 'paragraph',
      isActive: editor.isActive('blockquote'),
      render: () =>
        toolBtn(
          editor.isActive('blockquote'),
          () => editor.chain().focus().toggleBlockquote().run(),
          <Quote className="w-3.5 h-3.5" />,
          'Cita'
        ),
    },
    {
      id: 'hr',
      group: 'paragraph',
      isActive: false,
      render: () =>
        toolBtn(
          false,
          () => editor.chain().focus().setHorizontalRule().run(),
          <Minus className="w-3.5 h-3.5" />,
          'Línea divisoria horizontal'
        ),
    },
  ];

  if (onToggleFormattingMarks) {
    toolbarItems.push({
      id: 'formatting-marks',
      group: 'paragraph',
      isActive: !!showFormattingMarks,
      render: () =>
        toolBtn(
          !!showFormattingMarks,
          onToggleFormattingMarks,
          <Pilcrow className="w-3.5 h-3.5" />,
          'Mostrar todo (Ctrl+(): Muestra marcas de párrafo y símbolos de formato ocultos'
        ),
    });
  }

  toolbarItems.push(
    {
      id: 'align-left',
      group: 'paragraph',
      isActive: editor.isActive({ textAlign: 'left' }),
      render: () =>
        toolBtn(
          editor.isActive({ textAlign: 'left' }),
          () => editor.chain().focus().setTextAlign('left').run(),
          <AlignLeft className="w-3.5 h-3.5" />,
          'Alinear a la izquierda'
        ),
    },
    {
      id: 'align-center',
      group: 'paragraph',
      isActive: editor.isActive({ textAlign: 'center' }),
      render: () =>
        toolBtn(
          editor.isActive({ textAlign: 'center' }),
          () => editor.chain().focus().setTextAlign('center').run(),
          <AlignCenter className="w-3.5 h-3.5" />,
          'Centrar'
        ),
    },
    {
      id: 'align-right',
      group: 'paragraph',
      isActive: editor.isActive({ textAlign: 'right' }),
      render: () =>
        toolBtn(
          editor.isActive({ textAlign: 'right' }),
          () => editor.chain().focus().setTextAlign('right').run(),
          <AlignRight className="w-3.5 h-3.5" />,
          'Alinear a la derecha'
        ),
    },
    {
      id: 'align-justify',
      group: 'paragraph',
      isActive: editor.isActive({ textAlign: 'justify' }),
      render: () =>
        toolBtn(
          editor.isActive({ textAlign: 'justify' }),
          () => editor.chain().focus().setTextAlign('justify').run(),
          <AlignJustify className="w-3.5 h-3.5" />,
          'Justificar'
        ),
    },

    // 4. Estilos
    {
      id: 'h1',
      group: 'styles',
      isActive: editor.isActive('heading', { level: 1 }),
      render: () =>
        toolBtn(
          editor.isActive('heading', { level: 1 }),
          () => handleToggleHeading(1),
          <Heading1 className="w-3.5 h-3.5" />,
          'Título 1'
        ),
    },
    {
      id: 'h2',
      group: 'styles',
      isActive: editor.isActive('heading', { level: 2 }),
      render: () =>
        toolBtn(
          editor.isActive('heading', { level: 2 }),
          () => handleToggleHeading(2),
          <Heading2 className="w-3.5 h-3.5" />,
          'Título 2'
        ),
    },
    {
      id: 'h3',
      group: 'styles',
      isActive: editor.isActive('heading', { level: 3 }),
      render: () =>
        toolBtn(
          editor.isActive('heading', { level: 3 }),
          () => handleToggleHeading(3),
          <Heading3 className="w-3.5 h-3.5" />,
          'Título 3'
        ),
    },

    // 5. Insertar
    {
      id: 'table',
      group: 'insert',
      isActive: editor.isActive('table'),
      render: () =>
        toolBtn(
          editor.isActive('table'),
          () =>
            editor
              .chain()
              .focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run(),
          <Table className="w-3.5 h-3.5" />,
          'Insertar tabla (o escribe /tabla)'
        ),
    },
    {
      id: 'math',
      group: 'insert',
      isActive: false,
      render: () =>
        toolBtn(
          false,
          () =>
            editor
              .chain()
              .focus()
              .insertContent({ type: 'mathBlock', attrs: { latex: '' } })
              .run(),
          <Sigma className="w-3.5 h-3.5" />,
          'Insertar fórmula matemática (LaTeX / KaTeX)'
        ),
    },
    {
      id: 'code',
      group: 'insert',
      isActive: editor.isActive('codeBlock'),
      render: () =>
        toolBtn(
          editor.isActive('codeBlock'),
          () => editor.chain().focus().toggleCodeBlock().run(),
          <Code2 className="w-3.5 h-3.5" />,
          'Bloque de código (o escribe /codigo)'
        ),
    }
  );

  if (onOpenTemplates) {
    toolbarItems.push({
      id: 'templates',
      group: 'insert',
      isActive: false,
      render: (inOverflow) =>
        toolBtn(
          false,
          () => {
            if (inOverflow) setIsOverflowOpen(false);
            onOpenTemplates();
          },
          <LayoutTemplate className="w-3.5 h-3.5 text-accent" />,
          'Plantillas y modelos predefinidos (/plantilla)'
        ),
    });
  }

  if (onUploadImage) {
    toolbarItems.push({
      id: 'image',
      group: 'insert',
      isActive: false,
      render: (inOverflow) => (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (inOverflow) setIsOverflowOpen(false);
            fileInputRef.current?.click();
          }}
          title="Insertar imagen"
          className="h-7 px-1.5 rounded-md text-veyra-muted hover:text-veyra-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex items-center justify-center cursor-pointer shrink-0"
        >
          <ImageIcon className="w-3.5 h-3.5" />
        </button>
      ),
    });
  }

  if (onAttachFromDrive) {
    toolbarItems.push({
      id: 'drive',
      group: 'insert',
      isActive: false,
      render: (inOverflow) => (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (inOverflow) setIsOverflowOpen(false);
            void onAttachFromDrive();
          }}
          disabled={isAttachingDrive}
          title="Adjuntar archivo desde Google Drive"
          className="h-7 px-1.5 rounded-md text-veyra-muted hover:text-veyra-text hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50 transition-colors flex items-center gap-1 cursor-pointer shrink-0"
        >
          {isAttachingDrive ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
          ) : (
            <HardDrive className="w-3.5 h-3.5 text-emerald-500" />
          )}
        </button>
      ),
    });
  }

  // 6. IA
  toolbarItems.push({
    id: 'ai',
    group: 'ai',
    isActive: editor.isActive('aiPrompt'),
    render: (inOverflow) =>
      toolBtn(
        editor.isActive('aiPrompt'),
        () => {
          if (inOverflow) setIsOverflowOpen(false);
          editor.chain().focus().insertContent({ type: 'aiPrompt' }).run();
        },
        <Sparkles className="w-3.5 h-3.5" />,
        'Asistente IA (o escribe /ia)'
      ),
  });

  const effectiveVisibleCount =
    visibleCount === null ? toolbarItems.length : Math.min(visibleCount, toolbarItems.length);
  const visibleItems = toolbarItems.slice(0, effectiveVisibleCount);
  const overflowItems = toolbarItems.slice(effectiveVisibleCount);
  const showOverflowMenu = toolbarMode === 'compact' && overflowItems.length > 0 && isOverflowOpen;
  const hasActiveOverflowItem = overflowItems.some((item) => item.isActive);

  const toolbarItemMap = new Map(toolbarItems.map((item) => [item.id, item]));
  const renderItem = (id: string) => toolbarItemMap.get(id)?.render(false) ?? null;

  const isHeading1 = editor.isActive('heading', { level: 1 });
  const isHeading2 = editor.isActive('heading', { level: 2 });
  const isHeading3 = editor.isActive('heading', { level: 3 });
  const isNormalStyle = !isHeading1 && !isHeading2 && !isHeading3;

  const ribbonLabeledBtn = (
    isActive: boolean,
    onClick: () => void,
    icon: React.ReactNode,
    label: string,
    title: string,
    disabled = false
  ) => (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'h-6 px-2 rounded-md transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 text-[11px] font-medium disabled:opacity-30 disabled:pointer-events-none',
        isActive
          ? 'bg-accent/15 text-accent font-semibold'
          : 'text-veyra-muted hover:text-veyra-text hover:bg-black/5 dark:hover:bg-white/5'
      )}
    >
      {icon}
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );

  return (
    <>
      {onUploadImage && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
      )}

      <div
        className={cn(
          'border-b border-veyra-border bg-veyra-surface/40 shrink-0 select-none text-xs overflow-hidden transition-[height] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
          !isEditorReady && 'pointer-events-none opacity-65'
        )}
        style={{ height: toolbarMode === 'compact' ? 36 : extendedHeight }}
      >
        {toolbarMode === 'compact' ? (
          <div
            ref={toolbarContainerRef}
            className="h-9 px-2.5 sm:px-3 flex items-center gap-1 overflow-hidden animate-veyra-toolbar-compact"
          >
            <div
              ref={toolbarTrackRef}
              className="flex-1 min-w-0 flex items-center gap-0.5 overflow-hidden"
            >
              {visibleItems.map((item, idx) => (
                <React.Fragment key={item.id}>
                  {idx > 0 && visibleItems[idx - 1].group !== item.group && (
                    <div className="w-[1px] h-3.5 bg-veyra-border mx-1 shrink-0" />
                  )}
                  <div data-toolbar-item-id={item.id} className="inline-flex items-center shrink-0">
                    {item.render(false)}
                  </div>
                </React.Fragment>
              ))}
            </div>

            {overflowItems.length > 0 && (
              <div className="flex items-center shrink-0 pl-1 border-l border-veyra-border/70">
                <button
                  ref={overflowBtnRef}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    if (!showOverflowMenu) {
                      updateOverflowPosition();
                      setIsTextColorMenuOpen(false);
                      setIsHighlightMenuOpen(false);
                      setIsFontMenuOpen(false);
                      setIsFontSizeMenuOpen(false);
                      setIsOrderedListMenuOpen(false);
                      setIsOverflowOpen(true);
                    } else {
                      setIsOverflowOpen(false);
                    }
                  }}
                  title={`Más herramientas (${overflowItems.length})`}
                  aria-label="Más herramientas"
                  aria-expanded={showOverflowMenu}
                  className={cn(
                    'relative h-7 px-1.5 rounded-md transition-colors flex items-center justify-center cursor-pointer shrink-0',
                    showOverflowMenu
                      ? 'bg-accent/15 text-accent font-semibold'
                      : 'text-veyra-muted hover:text-veyra-text hover:bg-black/5 dark:hover:bg-white/5'
                  )}
                >
                  <MoreHorizontal className="w-3.5 h-3.5" />
                  {hasActiveOverflowItem && !showOverflowMenu && (
                    <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-accent" />
                  )}
                </button>
              </div>
            )}

            <div className="flex items-center shrink-0 pl-1 border-l border-veyra-border/70">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleToggleToolbarMode}
                title="Vista extendida (cinta por secciones estilo Word)"
                aria-label="Cambiar a vista extendida"
                className="h-7 px-1.5 rounded-md text-veyra-muted hover:text-veyra-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex items-center justify-center cursor-pointer shrink-0"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <div
            ref={extendedContentRef}
            className="flex items-stretch animate-veyra-toolbar-expand"
          >
            <div className="flex-1 min-w-0 flex items-stretch overflow-x-auto scrollbar-thin px-2.5 sm:px-3 pt-1.5 pb-1">
              {/* Sección: Historial */}
              <div className="flex flex-col justify-between shrink-0 pr-2.5">
                <div className="flex-1 flex flex-col justify-center gap-0.5">
                  {ribbonLabeledBtn(
                    false,
                    () => editor.chain().focus().undo().run(),
                    <Undo className="w-3.5 h-3.5 shrink-0" />,
                    'Deshacer',
                    'Deshacer (Ctrl+Z)',
                    !editor.can().undo()
                  )}
                  {ribbonLabeledBtn(
                    false,
                    () => editor.chain().focus().redo().run(),
                    <Redo className="w-3.5 h-3.5 shrink-0" />,
                    'Rehacer',
                    'Rehacer (Ctrl+Y)',
                    !editor.can().redo()
                  )}
                </div>
                <div className="text-[10px] leading-none text-veyra-muted/80 font-medium text-center pt-1 tracking-tight">
                  Historial
                </div>
              </div>

              <div className="w-[1px] self-stretch my-1 bg-veyra-border/80 shrink-0" />

              {/* Sección: Fuente */}
              <div className="flex flex-col justify-between shrink-0 px-2.5">
                <div className="flex-1 flex flex-col justify-center gap-1">
                  <div className="flex items-center gap-1">
                    {renderItem('font-family')}
                    {renderItem('font-size')}
                    {renderItem('clear-format')}
                  </div>
                  <div className="flex items-center gap-0.5">
                    {renderItem('bold')}
                    {renderItem('italic')}
                    {renderItem('underline')}
                    {renderItem('strike')}
                    <div className="w-[1px] h-3.5 bg-veyra-border/70 mx-1 shrink-0" />
                    {renderItem('text-color')}
                    {renderItem('highlight')}
                  </div>
                </div>
                <div className="text-[10px] leading-none text-veyra-muted/80 font-medium text-center pt-1 tracking-tight">
                  Fuente
                </div>
              </div>

              <div className="w-[1px] self-stretch my-1 bg-veyra-border/80 shrink-0" />

              {/* Sección: Párrafo */}
              <div className="flex flex-col justify-between shrink-0 px-2.5">
                <div className="flex-1 flex flex-col justify-center gap-1">
                  <div className="flex items-center gap-0.5">
                    {renderItem('bullet-list')}
                    {renderItem('ordered-list')}
                    {renderItem('task-list')}
                    <div className="w-[1px] h-3.5 bg-veyra-border/70 mx-1 shrink-0" />
                    {renderItem('blockquote')}
                    {renderItem('hr')}
                    {renderItem('formatting-marks')}
                  </div>
                  <div className="flex items-center gap-0.5">
                    {renderItem('align-left')}
                    {renderItem('align-center')}
                    {renderItem('align-right')}
                    {renderItem('align-justify')}
                  </div>
                </div>
                <div className="text-[10px] leading-none text-veyra-muted/80 font-medium text-center pt-1 tracking-tight">
                  Párrafo
                </div>
              </div>

              <div className="w-[1px] self-stretch my-1 bg-veyra-border/80 shrink-0" />

              {/* Sección: Estilos (Galería estilo Word) */}
              <div className="flex flex-col justify-between shrink-0 px-2.5">
                <div className="flex-1 flex items-center">
                  <div className="flex items-center gap-1 p-1 rounded-lg border border-veyra-border/80 bg-veyra-bg/40">
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => editor.chain().focus().setParagraph().run()}
                      title="Texto normal (Párrafo)"
                      className={cn(
                        'h-[46px] min-w-[58px] px-2 rounded-md border transition-all flex flex-col items-center justify-center cursor-pointer',
                        isNormalStyle
                          ? 'border-accent bg-accent/10 text-accent ring-1 ring-accent/40 shadow-xs'
                          : 'border-transparent text-veyra-text hover:border-veyra-border hover:bg-black/5 dark:hover:bg-white/5'
                      )}
                    >
                      <span className="text-[11px] font-normal leading-tight">AaBbCc</span>
                      <span className="text-[9.5px] text-veyra-muted leading-tight mt-0.5">
                        Normal
                      </span>
                    </button>

                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleToggleHeading(1)}
                      title="Título 1"
                      className={cn(
                        'h-[46px] min-w-[62px] px-2 rounded-md border transition-all flex flex-col items-center justify-center cursor-pointer',
                        isHeading1
                          ? 'border-accent bg-accent/10 text-accent ring-1 ring-accent/40 shadow-xs'
                          : 'border-transparent text-veyra-text hover:border-veyra-border hover:bg-black/5 dark:hover:bg-white/5'
                      )}
                    >
                      <span className="text-[13px] font-bold tracking-tight leading-tight">
                        Título 1
                      </span>
                    </button>

                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleToggleHeading(2)}
                      title="Título 2"
                      className={cn(
                        'h-[46px] min-w-[62px] px-2 rounded-md border transition-all flex flex-col items-center justify-center cursor-pointer',
                        isHeading2
                          ? 'border-accent bg-accent/10 text-accent ring-1 ring-accent/40 shadow-xs'
                          : 'border-transparent text-veyra-text hover:border-veyra-border hover:bg-black/5 dark:hover:bg-white/5'
                      )}
                    >
                      <span className="text-[12px] font-semibold leading-tight text-accent/90">
                        Título 2
                      </span>
                    </button>

                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleToggleHeading(3)}
                      title="Título 3"
                      className={cn(
                        'h-[46px] min-w-[62px] px-2 rounded-md border transition-all flex flex-col items-center justify-center cursor-pointer',
                        isHeading3
                          ? 'border-accent bg-accent/10 text-accent ring-1 ring-accent/40 shadow-xs'
                          : 'border-transparent text-veyra-muted hover:text-veyra-text hover:border-veyra-border hover:bg-black/5 dark:hover:bg-white/5'
                      )}
                    >
                      <span className="text-[11px] font-semibold leading-tight">Título 3</span>
                    </button>
                  </div>
                </div>
                <div className="text-[10px] leading-none text-veyra-muted/80 font-medium text-center pt-1 tracking-tight">
                  Estilos
                </div>
              </div>

              <div className="w-[1px] self-stretch my-1 bg-veyra-border/80 shrink-0" />

              {/* Sección: Insertar */}
              <div className="flex flex-col justify-between shrink-0 px-2.5">
                <div className="flex-1 flex flex-col justify-center gap-0.5">
                  <div className="flex items-center gap-0.5">
                    {ribbonLabeledBtn(
                      editor.isActive('table'),
                      () =>
                        editor
                          .chain()
                          .focus()
                          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                          .run(),
                      <Table className="w-3.5 h-3.5 shrink-0" />,
                      'Tabla',
                      'Insertar tabla (o escribe /tabla)'
                    )}
                    {ribbonLabeledBtn(
                      false,
                      () =>
                        editor
                          .chain()
                          .focus()
                          .insertContent({ type: 'mathBlock', attrs: { latex: '' } })
                          .run(),
                      <Sigma className="w-3.5 h-3.5 shrink-0" />,
                      'Fórmula',
                      'Insertar fórmula matemática (LaTeX / KaTeX)'
                    )}
                    {ribbonLabeledBtn(
                      editor.isActive('codeBlock'),
                      () => editor.chain().focus().toggleCodeBlock().run(),
                      <Code2 className="w-3.5 h-3.5 shrink-0" />,
                      'Código',
                      'Bloque de código (o escribe /codigo)'
                    )}
                  </div>
                  {(onOpenTemplates || onUploadImage || onAttachFromDrive) && (
                    <div className="flex items-center gap-0.5">
                      {onOpenTemplates &&
                        ribbonLabeledBtn(
                          false,
                          onOpenTemplates,
                          <LayoutTemplate className="w-3.5 h-3.5 shrink-0 text-accent" />,
                          'Plantillas',
                          'Plantillas y modelos predefinidos (/plantilla)'
                        )}
                      {onUploadImage &&
                        ribbonLabeledBtn(
                          false,
                          handleTriggerImageUpload,
                          <ImageIcon className="w-3.5 h-3.5 shrink-0" />,
                          'Imagen',
                          'Insertar imagen'
                        )}
                      {onAttachFromDrive &&
                        ribbonLabeledBtn(
                          false,
                          () => {
                            void onAttachFromDrive();
                          },
                          isAttachingDrive ? (
                            <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin text-accent" />
                          ) : (
                            <HardDrive className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
                          ),
                          'Drive',
                          'Adjuntar archivo desde Google Drive',
                          isAttachingDrive
                        )}
                    </div>
                  )}
                </div>
                <div className="text-[10px] leading-none text-veyra-muted/80 font-medium text-center pt-1 tracking-tight">
                  Insertar
                </div>
              </div>

              <div className="w-[1px] self-stretch my-1 bg-veyra-border/80 shrink-0" />

              {/* Sección: Asistente IA */}
              <div className="flex flex-col justify-between shrink-0 pl-2.5 pr-1">
                <div className="flex-1 flex items-center justify-center">
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => editor.chain().focus().insertContent({ type: 'aiPrompt' }).run()}
                    title="Asistente IA (o escribe /ia)"
                    className={cn(
                      'h-[50px] min-w-[56px] px-2.5 rounded-lg transition-colors flex flex-col items-center justify-center gap-1 cursor-pointer',
                      editor.isActive('aiPrompt')
                        ? 'bg-accent/15 text-accent font-semibold'
                        : 'text-veyra-muted hover:text-veyra-text hover:bg-black/5 dark:hover:bg-white/5'
                    )}
                  >
                    <Sparkles className="w-4 h-4 text-accent" />
                    <span className="text-[10.5px] font-medium leading-none">Asistente</span>
                  </button>
                </div>
                <div className="text-[10px] leading-none text-veyra-muted/80 font-medium text-center pt-1 tracking-tight">
                  IA
                </div>
              </div>
            </div>

            {/* Botón para contraer a vista compacta (estilo Word esquina inferior derecha) */}
            <div className="shrink-0 flex items-end pb-1 px-1.5 border-l border-veyra-border/60">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleToggleToolbarMode}
                title="Contraer a vista compacta"
                aria-label="Cambiar a vista compacta"
                className="h-6 w-6 rounded-md text-veyra-muted hover:text-veyra-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex items-center justify-center cursor-pointer"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* POPUP FLOTANTE (PORTAL): Bandeja de herramientas ocultas por ancho reducido */}
      {showOverflowMenu &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={overflowMenuRef}
            style={{
              position: 'fixed',
              top: overflowCoords.top,
              right: overflowCoords.right,
              maxWidth: 'min(440px, calc(100vw - 16px))',
              maxHeight: `max(140px, calc(100vh - ${overflowCoords.top}px - 12px))`,
              zIndex: 9980,
            }}
            className="p-1.5 rounded-xl bg-white dark:bg-[#18181B] border border-slate-200 dark:border-zinc-800 shadow-xl overflow-y-auto scrollbar-thin select-none text-xs animate-in fade-in zoom-in-95 duration-100"
          >
            <div className="flex flex-wrap items-center gap-1">
              {overflowItems.map((item, idx) => (
                <React.Fragment key={item.id}>
                  {idx > 0 && overflowItems[idx - 1].group !== item.group && (
                    <div className="w-[1px] h-4 bg-slate-200 dark:bg-zinc-700/80 mx-0.5 shrink-0" />
                  )}
                  <div className="inline-flex items-center shrink-0">{item.render(true)}</div>
                </React.Fragment>
              ))}
            </div>
          </div>,
          document.body
        )}

      {/* POPUP FLOTANTE (PORTAL): Selector de Color de Texto */}
      <TextColorPopover
        isOpen={isTextColorMenuOpen}
        menuRef={textColorMenuRef}
        coords={textColorCoords}
        currentTextColor={currentTextColor}
        recentColors={recentTextColors}
        onSelectColor={handleSelectTextColor}
        onClose={() => setIsTextColorMenuOpen(false)}
      />

      {/* POPUP FLOTANTE (PORTAL): Selector de Marcatextos / Resaltado */}
      <HighlightColorPopover
        isOpen={isHighlightMenuOpen}
        menuRef={highlightMenuRef}
        coords={highlightCoords}
        currentHighlightColor={currentHighlightColor}
        isHighlightActive={isHighlightActive}
        recentColors={recentHighlightColors}
        onSelectColor={handleSelectHighlightColor}
        onClose={() => setIsHighlightMenuOpen(false)}
      />

      {/* POPUP FLOTANTE (PORTAL): Selector de Tipografía */}
      {isFontMenuOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={fontMenuRef}
            style={{
              position: 'fixed',
              top: fontCoords.top,
              left: fontCoords.left,
              zIndex: 9999,
            }}
            className="p-1.5 rounded-xl bg-white dark:bg-[#18181B] border border-slate-200 dark:border-zinc-800 shadow-xl w-72 max-h-96 overflow-y-auto animate-in fade-in zoom-in-95 duration-100 scrollbar-thin select-none text-xs"
          >
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                editor.chain().focus().unsetFontFamily().run();
                setIsFontMenuOpen(false);
              }}
              className={cn(
                'w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer mb-1',
                !activeFontOption
                  ? 'bg-accent/10 dark:bg-accent/15 text-accent font-semibold'
                  : 'text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800'
              )}
            >
              <span className="flex items-center gap-2">
                <RotateCcw className="w-3.5 h-3.5 text-accent" />
                <span className="font-medium">Original (Por defecto)</span>
              </span>
              {!activeFontOption && <Check className="w-3.5 h-3.5 text-accent" />}
            </button>

            <div className="h-[1px] bg-slate-200 dark:bg-zinc-800 my-1.5" />

            <div className="px-2.5 pt-1 pb-1 text-[10px] font-bold text-accent uppercase tracking-wider flex items-center justify-between">
              <span>Normas APA / Word</span>
              <span className="text-[9px] text-slate-400 dark:text-zinc-500 lowercase font-normal">
                académicas
              </span>
            </div>
            {NOTE_FONTS.filter((f) => f.group === 'apa').map((font) => {
              const isSelected = activeFontOption?.id === font.id;
              return (
                <button
                  key={font.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    editor.chain().focus().setFontFamily(font.fontName).run();
                    setIsFontMenuOpen(false);
                  }}
                  className={cn(
                    'w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer my-0.5',
                    isSelected
                      ? 'bg-accent/10 dark:bg-accent/15 text-accent font-semibold'
                      : 'text-slate-800 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800'
                  )}
                >
                  <span className="flex flex-col text-left">
                    <span
                      className="text-[13px] leading-tight font-medium"
                      style={{ fontFamily: font.family }}
                    >
                      {font.name}
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-zinc-400">
                      {font.description}
                    </span>
                  </span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-accent shrink-0 ml-2" />}
                </button>
              );
            })}

            <div className="h-[1px] bg-slate-200 dark:bg-zinc-800 my-1.5" />

            <div className="px-2.5 pt-1 pb-1 text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
              Estilos y Diseños Veyra
            </div>
            {NOTE_FONTS.filter((f) => f.group !== 'apa').map((font) => {
              const isSelected = activeFontOption?.id === font.id;
              return (
                <button
                  key={font.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    editor.chain().focus().setFontFamily(font.fontName).run();
                    setIsFontMenuOpen(false);
                  }}
                  className={cn(
                    'w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer my-0.5',
                    isSelected
                      ? 'bg-accent/10 dark:bg-accent/15 text-accent font-semibold'
                      : 'text-slate-800 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800'
                  )}
                >
                  <span className="flex flex-col text-left">
                    <span
                      className="text-[13px] leading-tight font-medium"
                      style={{ fontFamily: font.family }}
                    >
                      {font.name}
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-zinc-400">
                      {font.fontName} — {font.description}
                    </span>
                  </span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-accent shrink-0 ml-2" />}
                </button>
              );
            })}
          </div>,
          document.body
        )}

      {/* POPUP FLOTANTE (PORTAL): Selector de Tamaño de Texto */}
      {isFontSizeMenuOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={fontSizeMenuRef}
            style={{
              position: 'fixed',
              top: fontSizeCoords.top,
              left: fontSizeCoords.left,
              zIndex: 9999,
            }}
            className="p-1.5 rounded-xl bg-white dark:bg-[#18181B] border border-slate-200 dark:border-zinc-800 shadow-xl w-52 max-h-80 overflow-y-auto animate-in fade-in zoom-in-95 duration-100 scrollbar-thin select-none text-xs"
          >
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                applyFontSize(null);
                setIsFontSizeMenuOpen(false);
              }}
              className={cn(
                'w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer mb-1',
                !currentFontSize
                  ? 'bg-accent/10 dark:bg-accent/15 text-accent font-semibold'
                  : 'text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800'
              )}
            >
              <span className="flex items-center gap-2">
                <RotateCcw className="w-3.5 h-3.5 text-accent" />
                <span className="font-medium">
                  {editor.isActive('heading')
                    ? `Restablecer (${effectiveFontSize.size}px por defecto)`
                    : 'Normal (14px - Por defecto)'}
                </span>
              </span>
              {!currentFontSize && <Check className="w-3.5 h-3.5 text-accent" />}
            </button>

            <div className="h-[1px] bg-slate-200 dark:bg-zinc-800 my-1.5" />

            <div className="px-2.5 pt-0.5 pb-1 text-[10px] font-bold text-accent uppercase tracking-wider">
              Tamaño de texto
            </div>

            {FONT_SIZES.map((size) => {
              const isSelected =
                currentFontSize === size.value ||
                (!currentFontSize && size.size === effectiveFontSize.size);
              return (
                <button
                  key={size.value}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    applyFontSize(size.value);
                    setIsFontSizeMenuOpen(false);
                  }}
                  className={cn(
                    'w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer my-0.5',
                    isSelected
                      ? 'bg-accent/10 dark:bg-accent/15 text-accent font-semibold'
                      : 'text-slate-800 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800'
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className="w-7 text-[11px] font-mono text-slate-500 dark:text-zinc-400">
                      {size.size}px
                    </span>
                    <span style={{ fontSize: `${Math.min(size.size, 17)}px` }}>{size.label}</span>
                  </span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-accent shrink-0 ml-2" />}
                </button>
              );
            })}
          </div>,
          document.body
        )}

      {/* POPUP FLOTANTE (PORTAL): Biblioteca de numeración */}
      {isOrderedListMenuOpen &&
        createPortal(
          <div
            ref={orderedListMenuRef}
            style={{
              position: 'fixed',
              top: `${orderedListCoords.top}px`,
              left: `${orderedListCoords.left}px`,
              zIndex: 9999,
            }}
            className="p-3 w-[268px] rounded-xl bg-white dark:bg-[#18181B] border border-slate-200 dark:border-zinc-800 shadow-2xl text-xs space-y-2.5 text-slate-800 dark:text-zinc-100 select-none animate-in fade-in zoom-in-95 duration-100"
          >
            <div className="px-1 text-[13px] font-semibold text-slate-900 dark:text-white tracking-tight">
              Biblioteca de numeración
            </div>

            <div className="grid grid-cols-3 gap-2">
              {NUMBERING_OPTIONS.map((opt) => {
                const isSelected = isOrderedListActive
                  ? currentListStyle === opt.id
                  : opt.id === 'none';

                return (
                  <button
                    key={opt.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleSelectNumberingStyle(opt.id)}
                    className={cn(
                      'w-[74px] h-[74px] p-2 bg-white rounded-lg border transition-all cursor-pointer relative flex flex-col justify-center text-left group',
                      isSelected
                        ? 'border-accent ring-2 ring-accent shadow-md'
                        : 'border-slate-300 hover:border-accent hover:shadow-md'
                    )}
                    title={opt.label}
                  >
                    {opt.id === 'none' ? (
                      <div className="w-full h-full flex items-center justify-center text-[12px] font-medium text-slate-900">
                        {opt.label}
                      </div>
                    ) : (
                      <div className="w-full h-full flex flex-col justify-between py-1">
                        {opt.items?.map((itemText, idx) => (
                          <div key={idx} className="flex items-center gap-1.5 w-full">
                            <span className="text-[11px] font-sans font-medium text-slate-900 leading-none shrink-0 min-w-[15px] text-right">
                              {itemText}
                            </span>
                            <div className="h-[2px] bg-slate-400 rounded-full flex-1" />
                          </div>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {isOrderedListActive && (
              <div className="pt-2 border-t border-zinc-700/70 space-y-2">
                <div className="px-1 text-[10px] font-bold text-accent uppercase tracking-wider">
                  Configuración de inicio
                </div>

                {previousContinuation !== null && previousContinuation !== currentListStart && (
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      editor
                        .chain()
                        .focus()
                        .updateAttributes('orderedList', { start: previousContinuation })
                        .run();
                      setIsOrderedListMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-accent/20 hover:bg-accent/30 text-accent font-medium transition-colors cursor-pointer text-left"
                  >
                    <span>Continuar lista anterior</span>
                    <span className="font-mono font-bold bg-accent text-white px-1.5 py-0.5 rounded text-[10px]">
                      {previousContinuation}.
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    editor.chain().focus().updateAttributes('orderedList', { start: 1 }).run();
                    setIsOrderedListMenuOpen(false);
                  }}
                  className={cn(
                    'w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer text-left',
                    currentListStart === 1
                      ? 'bg-zinc-800 text-white font-semibold'
                      : 'hover:bg-zinc-800/70 text-zinc-300'
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    <RotateCcw className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Reiniciar en 1</span>
                  </span>
                  {currentListStart === 1 && <Check className="w-3.5 h-3.5 text-accent" />}
                </button>

                <div className="px-1 pt-0.5 space-y-1">
                  <span className="text-[10px] text-zinc-400 font-medium">
                    Iniciar en número:
                  </span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="1"
                      max="9999"
                      value={customStartInput}
                      onChange={(e) => setCustomStartInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const val = parseInt(customStartInput, 10);
                          if (!isNaN(val) && val >= 1) {
                            editor
                              .chain()
                              .focus()
                              .updateAttributes('orderedList', { start: val })
                              .run();
                            setIsOrderedListMenuOpen(false);
                          }
                        }
                      }}
                      className="w-16 px-2 py-1 rounded-md bg-zinc-900 border border-zinc-700 text-xs font-mono text-center focus:outline-none focus:border-accent text-zinc-100"
                    />
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        const val = parseInt(customStartInput, 10);
                        if (!isNaN(val) && val >= 1) {
                          editor
                            .chain()
                            .focus()
                            .updateAttributes('orderedList', { start: val })
                            .run();
                          setIsOrderedListMenuOpen(false);
                        }
                      }}
                      className="flex-1 py-1 px-2.5 rounded-md bg-accent text-white font-medium hover:bg-accent/90 transition-colors text-xs text-center cursor-pointer"
                    >
                      Aplicar
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
};
