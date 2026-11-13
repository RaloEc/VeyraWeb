import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  RotateCcw,
  Sigma,
  Table,
  Code2,
  Sparkles,
  AArrowUp,
  AArrowDown,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  NOTE_FONTS,
  areColorsEqual,
} from './constants/noteFonts';
import {
  FONT_SIZES,
  getNextLargerFontSize,
  getNextSmallerFontSize,
  DEFAULT_FONT_SIZE,
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

export interface EditorToolbarProps {
  editor: Editor | null;
  onUploadImage?: (file: File) => Promise<void>;
}

export const EditorToolbar: React.FC<EditorToolbarProps> = ({ editor, onUploadImage }) => {
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

  const [textColorCoords, setTextColorCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [highlightCoords, setHighlightCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [fontCoords, setFontCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [fontSizeCoords, setFontSizeCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [orderedListCoords, setOrderedListCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [customStartInput, setCustomStartInput] = useState<string>('2');

  // Hook de colores recientes y persistencia
  const {
    lastTextColor,
    lastHighlightColor,
    recentTextColors,
    recentHighlightColors,
    saveTextColor,
    saveHighlightColor,
  } = useRecentEditorColors();

  // Actualizar coordenadas de los popovers respecto al viewport
  const updateTextColorPosition = useCallback(() => {
    if (!textColorBtnRef.current) return;
    const rect = textColorBtnRef.current.getBoundingClientRect();
    const popoverWidth = 210;
    const margin = 10;
    let left = rect.left;
    if (left + popoverWidth > window.innerWidth - margin) {
      left = window.innerWidth - popoverWidth - margin;
    }
    if (left < margin) left = margin;

    setTextColorCoords({
      top: rect.bottom + 4,
      left,
    });
  }, []);

  const updateHighlightPosition = useCallback(() => {
    if (!highlightBtnRef.current) return;
    const rect = highlightBtnRef.current.getBoundingClientRect();
    const popoverWidth = 200;
    const margin = 10;
    let left = rect.left;
    if (left + popoverWidth > window.innerWidth - margin) {
      left = window.innerWidth - popoverWidth - margin;
    }
    if (left < margin) left = margin;

    setHighlightCoords({
      top: rect.bottom + 4,
      left,
    });
  }, []);

  const updateFontPosition = useCallback(() => {
    if (!fontBtnRef.current) return;
    const rect = fontBtnRef.current.getBoundingClientRect();
    const popoverWidth = 260;
    const margin = 10;
    let left = rect.left;
    if (left + popoverWidth > window.innerWidth - margin) {
      left = window.innerWidth - popoverWidth - margin;
    }
    if (left < margin) left = margin;

    setFontCoords({
      top: rect.bottom + 4,
      left,
    });
  }, []);

  const updateFontSizePosition = useCallback(() => {
    if (!fontSizeBtnRef.current) return;
    const rect = fontSizeBtnRef.current.getBoundingClientRect();
    const popoverWidth = 190;
    const margin = 10;
    let left = rect.left;
    if (left + popoverWidth > window.innerWidth - margin) {
      left = window.innerWidth - popoverWidth - margin;
    }
    if (left < margin) left = margin;

    setFontSizeCoords({
      top: rect.bottom + 4,
      left,
    });
  }, []);

  const updateOrderedListPosition = useCallback(() => {
    if (!orderedListBtnRef.current) return;
    const rect = orderedListBtnRef.current.getBoundingClientRect();
    const popoverWidth = 268;
    const margin = 10;
    let left = rect.left;
    if (left + popoverWidth > window.innerWidth - margin) {
      left = window.innerWidth - popoverWidth - margin;
    }
    if (left < margin) left = margin;

    setOrderedListCoords({
      top: rect.bottom + 4,
      left,
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
    return (previousList as { start: number; count: number }).start + (previousList as { start: number; count: number }).count;
  }, [editor]);

  // Forzar actualización inmediata de la barra cuando cambia la selección o contenido del editor
  const [, setTick] = useState(0);
  const lastSelectionRef = useRef<{ from: number; to: number } | null>(null);

  useEffect(() => {
    if (!editor) return;
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
  }, [editor]);

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
    };

    const handleWindowChange = () => {
      if (isTextColorMenuOpen) updateTextColorPosition();
      if (isHighlightMenuOpen) updateHighlightPosition();
      if (isFontMenuOpen) updateFontPosition();
      if (isFontSizeMenuOpen) updateFontSizePosition();
      if (isOrderedListMenuOpen) updateOrderedListPosition();
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('resize', handleWindowChange);
    window.addEventListener('scroll', handleWindowChange, true);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('resize', handleWindowChange);
      window.removeEventListener('scroll', handleWindowChange, true);
    };
  }, [
    isTextColorMenuOpen,
    isHighlightMenuOpen,
    isFontMenuOpen,
    isFontSizeMenuOpen,
    isOrderedListMenuOpen,
    updateTextColorPosition,
    updateHighlightPosition,
    updateFontPosition,
    updateFontSizePosition,
    updateOrderedListPosition,
  ]);

  if (!editor) return null;

  // Estado activo de colores y fuentes
  const currentTextColor = (editor.getAttributes('textStyle').color as string | undefined) || null;
  const currentHighlightColor = (editor.getAttributes('highlight').color as string | undefined) || null;
  const isHighlightActive = editor.isActive('highlight');
  const currentFontFamily = (editor.getAttributes('textStyle').fontFamily as string | undefined) || null;
  const currentFontSize = (editor.getAttributes('textStyle').fontSize as string | undefined) || null;

  const isOrderedListActive = editor.isActive('orderedList');
  const currentListStyle = (editor.getAttributes('orderedList')?.listStyle as NumberingStyle) || 'decimal';
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

  // Encontrar opción de tamaño actual
  const activeFontSizeOption = FONT_SIZES.find((s) => s.value === currentFontSize);

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
    if (!size || size === 'default' || size === DEFAULT_FONT_SIZE) {
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
    const nextSize = getNextLargerFontSize(currentFontSize);
    applyFontSize(nextSize);
  };

  const handleDecreaseFontSize = () => {
    if (!editor) return;
    const prevSize = getNextSmallerFontSize(currentFontSize);
    applyFontSize(prevSize === DEFAULT_FONT_SIZE ? null : prevSize);
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
    if (isHighlightActive && currentHighlightColor && areColorsEqual(currentHighlightColor, lastHighlightColor)) {
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

    // 1. Si la selección contiene o está dentro de un bloque con saltos de línea duros (<br>),
    // convertirlos primero a párrafos reales para que no convierta todo el texto en un encabezado gigante.
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

    // 2. Si el usuario seleccionó solo una porción de texto dentro de un mismo párrafo (y no el párrafo entero),
    // separar la selección en su propio bloque antes de convertirlo a encabezado para no afectar el resto del texto.
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

  return (
    <>
      <div className="h-9 border-b border-veyra-border px-3 flex items-center gap-0.5 bg-veyra-surface/40 overflow-x-auto shrink-0 select-none text-xs scrollbar-thin">
        {/* 1. Headings */}
        {toolBtn(
          editor.isActive('heading', { level: 1 }),
          () => handleToggleHeading(1),
          <Heading1 className="w-3.5 h-3.5" />,
          'Título 1'
        )}
        {toolBtn(
          editor.isActive('heading', { level: 2 }),
          () => handleToggleHeading(2),
          <Heading2 className="w-3.5 h-3.5" />,
          'Título 2'
        )}
        {toolBtn(
          editor.isActive('heading', { level: 3 }),
          () => handleToggleHeading(3),
          <Heading3 className="w-3.5 h-3.5" />,
          'Título 3'
        )}

        <div className="w-[1px] h-3.5 bg-veyra-border mx-1 shrink-0" />

        {/* 2. Basic Text Formatting */}
        {toolBtn(
          editor.isActive('bold'),
          () => editor.chain().focus().toggleBold().run(),
          <Bold className="w-3.5 h-3.5" />,
          'Negrita (Ctrl+B)'
        )}
        {toolBtn(
          editor.isActive('italic'),
          () => editor.chain().focus().toggleItalic().run(),
          <Italic className="w-3.5 h-3.5" />,
          'Cursiva (Ctrl+I)'
        )}
        {toolBtn(
          editor.isActive('underline'),
          () => editor.chain().focus().toggleUnderline().run(),
          <UnderlineIcon className="w-3.5 h-3.5" />,
          'Subrayado (Ctrl+U)'
        )}
        {toolBtn(
          editor.isActive('strike'),
          () => editor.chain().focus().toggleStrike().run(),
          <Strikethrough className="w-3.5 h-3.5" />,
          'Tachado'
        )}
        {toolBtn(
          editor.isActive('blockquote'),
          () => editor.chain().focus().toggleBlockquote().run(),
          <Quote className="w-3.5 h-3.5" />,
          'Cita'
        )}
        {toolBtn(
          false,
          () => editor.chain().focus().setHorizontalRule().run(),
          <Minus className="w-3.5 h-3.5" />,
          'Línea divisoria horizontal'
        )}

        <div className="w-[1px] h-3.5 bg-veyra-border mx-1 shrink-0" />

        {/* 3. Control Color de Texto (Acción rápida con último color + Chevron a paleta) */}
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

        {/* 4. Control Marcatextos / Resaltado (Acción rápida con último resaltado + Chevron a paleta) */}
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

        {/* 5. Botón Selector de Tipografía */}
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

        {/* 6. Control Tamaño de Texto Seleccionado (Aumentar / Disminuir / Selector) */}
        <div className="inline-flex items-center h-7 rounded-md p-0.5 transition-colors border border-transparent hover:border-black/10 dark:hover:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 shrink-0">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleIncreaseFontSize}
            title={`Aumentar tamaño de texto (${currentFontSize || '14px'} → ${getNextLargerFontSize(currentFontSize)})`}
            className="h-6 px-1.5 rounded flex items-center justify-center cursor-pointer transition-colors text-veyra-muted hover:text-veyra-text hover:bg-black/10 dark:hover:bg-white/10"
          >
            <AArrowUp className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleDecreaseFontSize}
            title={`Disminuir tamaño de texto (${currentFontSize || '14px'} → ${getNextSmallerFontSize(currentFontSize)})`}
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
            <span>{activeFontSizeOption ? activeFontSizeOption.size : (currentFontSize ? parseInt(currentFontSize, 10) : 14)}</span>
            <ChevronDown
              className={cn(
                'w-2.5 h-2.5 transition-transform duration-150',
                isFontSizeMenuOpen && 'rotate-180'
              )}
            />
          </button>
        </div>

        {/* 7. Borrador de Formato Completo */}
        {toolBtn(
          false,
          handleClearFormatting,
          <Eraser className="w-3.5 h-3.5" />,
          'Borrar todo formato (Restablecer texto normal)'
        )}

        {/* 7. Insertar Fórmula Matemática */}
        {toolBtn(
          false,
          () =>
            editor
              .chain()
              .focus()
              .insertContent({ type: 'mathBlock', attrs: { latex: '' } })
              .run(),
          <Sigma className="w-3.5 h-3.5" />,
          'Insertar fórmula matemática (LaTeX / KaTeX)'
        )}

        {/* 8. Insertar Tabla */}
        {toolBtn(
          editor.isActive('table'),
          () =>
            editor
              .chain()
              .focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run(),
          <Table className="w-3.5 h-3.5" />,
          'Insertar tabla (o escribe /tabla)'
        )}

        {/* 9. Bloque de Código */}
        {toolBtn(
          editor.isActive('codeBlock'),
          () => editor.chain().focus().toggleCodeBlock().run(),
          <Code2 className="w-3.5 h-3.5" />,
          'Bloque de código (o escribe /codigo)'
        )}

        {/* 10. Asistente IA */}
        {toolBtn(
          editor.isActive('aiPrompt'),
          () => editor.chain().focus().insertContent({ type: 'aiPrompt' }).run(),
          <Sparkles className="w-3.5 h-3.5" />,
          'Asistente IA (o escribe /ia)'
        )}

        <div className="w-[1px] h-3.5 bg-veyra-border mx-1 shrink-0" />

        {/* 6. Insert Image */}
        {onUploadImage && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              title="Insertar imagen"
              className="h-7 px-1.5 rounded-md text-veyra-muted hover:text-veyra-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex items-center justify-center cursor-pointer shrink-0"
            >
              <ImageIcon className="w-3.5 h-3.5" />
            </button>
          </>
        )}

        <div className="w-[1px] h-3.5 bg-veyra-border mx-1 shrink-0" />

        {/* 7. Lists */}
        {toolBtn(
          editor.isActive('taskList'),
          () => editor.chain().focus().toggleTaskList().run(),
          <CheckSquare className="w-3.5 h-3.5" />,
          'Lista de tareas / Checklist'
        )}
        {toolBtn(
          editor.isActive('bulletList'),
          () => editor.chain().focus().toggleBulletList().run(),
          <List className="w-3.5 h-3.5" />,
          'Lista con viñetas'
        )}
        {/* Lista numerada con selector de biblioteca de numeración */}
        <div className="relative inline-flex items-center">
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

        <div className="w-[1px] h-3.5 bg-veyra-border mx-1 shrink-0" />

        {/* 8. Alignment */}
        {toolBtn(
          editor.isActive({ textAlign: 'left' }),
          () => editor.chain().focus().setTextAlign('left').run(),
          <AlignLeft className="w-3.5 h-3.5" />,
          'Alinear a la izquierda'
        )}
        {toolBtn(
          editor.isActive({ textAlign: 'center' }),
          () => editor.chain().focus().setTextAlign('center').run(),
          <AlignCenter className="w-3.5 h-3.5" />,
          'Centrar'
        )}
        {toolBtn(
          editor.isActive({ textAlign: 'right' }),
          () => editor.chain().focus().setTextAlign('right').run(),
          <AlignRight className="w-3.5 h-3.5" />,
          'Alinear a la derecha'
        )}
        {toolBtn(
          editor.isActive({ textAlign: 'justify' }),
          () => editor.chain().focus().setTextAlign('justify').run(),
          <AlignJustify className="w-3.5 h-3.5" />,
          'Justificar'
        )}

        <div className="w-[1px] h-3.5 bg-veyra-border mx-1 shrink-0" />

        {/* 9. History */}
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          className="h-7 px-1.5 rounded-md text-veyra-muted hover:text-veyra-text hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer shrink-0"
          title="Deshacer (Ctrl+Z)"
        >
          <Undo className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          className="h-7 px-1.5 rounded-md text-veyra-muted hover:text-veyra-text hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer shrink-0"
          title="Rehacer (Ctrl+Y)"
        >
          <Redo className="w-3.5 h-3.5" />
        </button>
      </div>

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
            {/* Cabecera / Opción para restablecer */}
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

            {/* Sección: Normas APA / Word clásicas */}
            <div className="px-2.5 pt-1 pb-1 text-[10px] font-bold text-accent uppercase tracking-wider flex items-center justify-between">
              <span>Normas APA / Word</span>
              <span className="text-[9px] text-slate-400 dark:text-zinc-500 lowercase font-normal">académicas</span>
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

            {/* Sección: Estilos y Creativas Veyra */}
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

      {/* 4. Popover flotante del Selector de Tamaño de Texto */}
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
            {/* Cabecera / Opción para restablecer */}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                applyFontSize(null);
                setIsFontSizeMenuOpen(false);
              }}
              className={cn(
                'w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer mb-1',
                !currentFontSize || currentFontSize === DEFAULT_FONT_SIZE
                  ? 'bg-accent/10 dark:bg-accent/15 text-accent font-semibold'
                  : 'text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800'
              )}
            >
              <span className="flex items-center gap-2">
                <RotateCcw className="w-3.5 h-3.5 text-accent" />
                <span className="font-medium">Normal (14px - Por defecto)</span>
              </span>
              {(!currentFontSize || currentFontSize === DEFAULT_FONT_SIZE) && (
                <Check className="w-3.5 h-3.5 text-accent" />
              )}
            </button>

            <div className="h-[1px] bg-slate-200 dark:bg-zinc-800 my-1.5" />

            <div className="px-2.5 pt-0.5 pb-1 text-[10px] font-bold text-accent uppercase tracking-wider">
              Tamaño de texto
            </div>

            {FONT_SIZES.map((size) => {
              const isSelected =
                currentFontSize === size.value ||
                (!currentFontSize && size.value === DEFAULT_FONT_SIZE);
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
                    <span style={{ fontSize: `${Math.min(size.size, 17)}px` }}>
                      {size.label}
                    </span>
                  </span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-accent shrink-0 ml-2" />}
                </button>
              );
            })}
          </div>,
          document.body
        )}

      {/* Popover Biblioteca de numeración */}
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
            className="p-3 w-[268px] rounded-xl bg-[#202024] dark:bg-[#18181B] border border-slate-700/60 dark:border-zinc-800 shadow-2xl text-xs space-y-2.5 text-slate-100 select-none animate-in fade-in zoom-in-95 duration-100"
          >
            {/* Título Biblioteca de numeración */}
            <div className="px-1 text-[13px] font-semibold text-white tracking-tight">
              Biblioteca de numeración
            </div>

            {/* Grid 3x3 de estilos idéntico a Word */}
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

            {/* Opciones de secuencia si la lista está activa */}
            {isOrderedListActive && (
              <div className="pt-2 border-t border-zinc-700/70 space-y-2">
                <div className="px-1 text-[10px] font-bold text-accent uppercase tracking-wider">
                  Configuración de inicio
                </div>

                {/* Continuar numeración anterior */}
                {previousContinuation !== null && previousContinuation !== currentListStart && (
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      editor.chain().focus().updateAttributes('orderedList', { start: previousContinuation }).run();
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

                {/* Reiniciar en 1 */}
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

                {/* Iniciar en número personalizado */}
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
                            editor.chain().focus().updateAttributes('orderedList', { start: val }).run();
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
                          editor.chain().focus().updateAttributes('orderedList', { start: val }).run();
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
