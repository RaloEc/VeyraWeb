import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Highlighter,
  Palette,
  ChevronDown,
  Code,
  Copy,
  ClipboardPaste,
  Check,
  Eraser,
  Scissors,
  AArrowUp,
  AArrowDown,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { YT_REGEX } from '../../lib/tiptap-youtube-node';
import { areColorsEqual } from './constants/noteFonts';
import { useRecentEditorColors } from './hooks/useRecentEditorColors';
import { getNextLargerFontSize, getNextSmallerFontSize } from './extensions/FontSize';
import {
  TextColorPopover,
  HighlightColorPopover,
} from './components/EditorColorPopovers';

export interface EditorBubbleMenuProps {
  editor: Editor | null;
}

export const EditorBubbleMenu: React.FC<EditorBubbleMenuProps> = ({ editor }) => {
  const [copied, setCopied] = useState<boolean>(false);

  // Colores recientes y persistencia
  const {
    lastTextColor,
    lastHighlightColor,
    recentTextColors,
    recentHighlightColors,
    saveTextColor,
    saveHighlightColor,
  } = useRecentEditorColors();

  // Estados de popovers
  const textColorBtnRef = useRef<HTMLButtonElement>(null);
  const textColorMenuRef = useRef<HTMLDivElement>(null);
  const highlightBtnRef = useRef<HTMLButtonElement>(null);
  const highlightMenuRef = useRef<HTMLDivElement>(null);

  const [isTextColorMenuOpen, setIsTextColorMenuOpen] = useState(false);
  const [isHighlightMenuOpen, setIsHighlightMenuOpen] = useState(false);
  const [textColorCoords, setTextColorCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [highlightCoords, setHighlightCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const isTextColorMenuOpenRef = useRef(isTextColorMenuOpen);
  isTextColorMenuOpenRef.current = isTextColorMenuOpen;
  const isHighlightMenuOpenRef = useRef(isHighlightMenuOpen);
  isHighlightMenuOpenRef.current = isHighlightMenuOpen;

  const shouldShowTextBubbleMenu = useCallback(({ editor: ed }: { editor: Editor }) => {
    if (isTextColorMenuOpenRef.current || isHighlightMenuOpenRef.current) return true;
    const isCellSelection = ed.state.selection?.constructor?.name === 'CellSelection';
    if (isCellSelection) return false;
    return (
      !ed.view.state.selection.empty &&
      !ed.isActive('image') &&
      !ed.isActive('bookmark') &&
      !ed.isActive('bookmarkPrompt') &&
      !ed.isActive('aiPrompt') &&
      !ed.isActive('mathBlock') &&
      !ed.isActive('mathInline')
    );
  }, []);

  const currentTextColor = (editor?.getAttributes('textStyle')?.color as string | undefined) || null;
  const currentHighlightColor = (editor?.getAttributes('highlight')?.color as string | undefined) || null;
  const currentFontSize = (editor?.getAttributes('textStyle')?.fontSize as string | undefined) || null;
  const isHighlightActive = editor ? editor.isActive('highlight') : false;

  const lastSelectionRef = useRef<{ from: number; to: number } | null>(null);

  useEffect(() => {
    if (!editor) return;
    const handleUpdate = () => {
      if (editor.state && editor.state.selection && !editor.state.selection.empty) {
        lastSelectionRef.current = {
          from: editor.state.selection.from,
          to: editor.state.selection.to,
        };
      }
    };
    editor.on('transaction', handleUpdate);
    editor.on('selectionUpdate', handleUpdate);
    return () => {
      editor.off('transaction', handleUpdate);
      editor.off('selectionUpdate', handleUpdate);
    };
  }, [editor]);

  const applyFontSize = (size: string | null) => {
    if (!editor) return;
    let chain = editor.chain().focus();
    if (editor.state.selection.empty && lastSelectionRef.current) {
      chain = chain.setTextSelection(lastSelectionRef.current);
    }
    if (!size || size === 'default' || size === '14px') {
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
    applyFontSize(prevSize === '14px' ? null : prevSize);
  };

  const updateTextColorPosition = useCallback(() => {
    if (!textColorBtnRef.current) return;
    const rect = textColorBtnRef.current.getBoundingClientRect();
    const popoverWidth = 215;
    const popoverHeight = 170;
    const margin = 10;
    let left = rect.left;
    if (left + popoverWidth > window.innerWidth - margin) {
      left = window.innerWidth - popoverWidth - margin;
    }
    if (left < margin) left = margin;

    let top = rect.bottom + 6;
    if (top + popoverHeight > window.innerHeight - margin) {
      top = Math.max(margin, rect.top - popoverHeight - 6);
    }

    setTextColorCoords({ top, left });
  }, []);

  const updateHighlightPosition = useCallback(() => {
    if (!highlightBtnRef.current) return;
    const rect = highlightBtnRef.current.getBoundingClientRect();
    const popoverWidth = 200;
    const popoverHeight = 170;
    const margin = 10;
    let left = rect.left;
    if (left + popoverWidth > window.innerWidth - margin) {
      left = window.innerWidth - popoverWidth - margin;
    }
    if (left < margin) left = margin;

    let top = rect.bottom + 6;
    if (top + popoverHeight > window.innerHeight - margin) {
      top = Math.max(margin, rect.top - popoverHeight - 6);
    }

    setHighlightCoords({ top, left });
  }, []);

  // Cerrar menús al hacer clic fuera o al redimensionar/desplazar
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
    };

    const handleWindowChange = () => {
      if (isTextColorMenuOpen) updateTextColorPosition();
      if (isHighlightMenuOpen) updateHighlightPosition();
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('resize', handleWindowChange);
    window.addEventListener('scroll', handleWindowChange, true);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('resize', handleWindowChange);
      window.removeEventListener('scroll', handleWindowChange, true);
    };
  }, [isTextColorMenuOpen, isHighlightMenuOpen, updateTextColorPosition, updateHighlightPosition]);

  // Cerrar popovers si la selección se vacía
  useEffect(() => {
    if (!editor) return;
    const handleSelection = () => {
      if (editor.view.state.selection.empty) {
        setIsTextColorMenuOpen(false);
        setIsHighlightMenuOpen(false);
      }
    };
    editor.on('selectionUpdate', handleSelection);
    return () => {
      editor.off('selectionUpdate', handleSelection);
    };
  }, [editor]);

  if (!editor) return null;

  // Acciones rápidas de color
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

  const handleToggleTextColorMenu = () => {
    if (!isTextColorMenuOpen) {
      updateTextColorPosition();
      setIsHighlightMenuOpen(false);
      setIsTextColorMenuOpen(true);
    } else {
      setIsTextColorMenuOpen(false);
    }
  };

  const handleToggleHighlightMenu = () => {
    if (!isHighlightMenuOpen) {
      updateHighlightPosition();
      setIsTextColorMenuOpen(false);
      setIsHighlightMenuOpen(true);
    } else {
      setIsHighlightMenuOpen(false);
    }
  };

  const handleCut = () => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    if (from === to) return;
    const text = editor.state.doc.textBetween(from, to, ' ');
    if (text) {
      navigator.clipboard?.writeText(text).catch(() => {});
    }
    editor.chain().focus().deleteRange({ from, to }).run();
  };

  const handleCopy = () => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    if (from === to) return;
    const text = editor.state.doc.textBetween(from, to, ' ');
    if (text) {
      navigator.clipboard?.writeText(text).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const handlePaste = async () => {
    if (!editor) return;
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      const cleaned = text.split(/\r?\n/)[0].replace(/[\u200B-\u200D\uFEFF\r\n\t]/g, '').trim();
      const match = cleaned.match(YT_REGEX);
      if (match && match[1]) {
        editor.chain().focus().setYoutube({ videoId: match[1], embed: true }).run();
      } else {
        editor.chain().focus().insertContent(text).run();
      }
    } catch (err) {
      console.warn('[bubble paste]', err);
    }
  };

  const btn = (
    isActive: boolean,
    onClick: () => void,
    icon: React.ReactNode,
    title: string
  ) => (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      className={cn(
        'p-1.5 rounded-lg text-xs transition-colors cursor-pointer flex items-center justify-center',
        isActive
          ? 'text-accent bg-accent/15 font-semibold'
          : 'text-veyra-muted hover:text-veyra-text hover:bg-black/5 dark:hover:bg-white/5'
      )}
    >
      {icon}
    </button>
  );

  return (
    <>
      <BubbleMenu
        editor={editor}
        pluginKey="textBubbleMenu"
        shouldShow={shouldShowTextBubbleMenu}
        className="flex items-center gap-0.5 p-1 rounded-xl bg-veyra-card/95 border border-veyra-border shadow-elevated z-50 text-veyra-text select-none backdrop-blur-md"
      >
        {btn(
          editor.isActive('bold'),
          () => editor.chain().focus().toggleBold().run(),
          <Bold className="w-3.5 h-3.5" />,
          'Negrita (Ctrl+B)'
        )}
        {btn(
          editor.isActive('italic'),
          () => editor.chain().focus().toggleItalic().run(),
          <Italic className="w-3.5 h-3.5" />,
          'Cursiva (Ctrl+I)'
        )}
        {btn(
          editor.isActive('underline'),
          () => editor.chain().focus().toggleUnderline().run(),
          <UnderlineIcon className="w-3.5 h-3.5" />,
          'Subrayado (Ctrl+U)'
        )}
        {btn(
          editor.isActive('strike'),
          () => editor.chain().focus().toggleStrike().run(),
          <Strikethrough className="w-3.5 h-3.5" />,
          'Tachado'
        )}

        <div className="w-[1px] h-3.5 bg-veyra-border mx-0.5 shrink-0" />

        {/* Tamaño de texto seleccionado */}
        {btn(
          false,
          handleIncreaseFontSize,
          <AArrowUp className="w-3.5 h-3.5" />,
          `Aumentar tamaño de texto (${currentFontSize || '14px'} → ${getNextLargerFontSize(currentFontSize)})`
        )}
        {btn(
          Boolean(currentFontSize && currentFontSize !== '14px'),
          handleDecreaseFontSize,
          <AArrowDown className="w-3.5 h-3.5" />,
          `Disminuir tamaño de texto (${currentFontSize || '14px'} → ${getNextSmallerFontSize(currentFontSize)})`
        )}

        <div className="w-[1px] h-3.5 bg-veyra-border mx-0.5 shrink-0" />

        {/* Control Color de Texto (Acción Rápida + Chevron) */}
        <div className="inline-flex items-center h-6.5 rounded-lg p-0.5 transition-colors hover:bg-black/5 dark:hover:bg-white/5 shrink-0">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleQuickApplyTextColor}
            title={`Color de texto (Clic para aplicar / alternar ${lastTextColor})`}
            className={cn(
              'h-5.5 px-1 rounded flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors',
              currentTextColor
                ? 'text-accent font-semibold'
                : 'text-veyra-muted hover:text-veyra-text'
            )}
          >
            <Palette className="w-3 h-3" />
            <span
              className="w-3 h-[2px] rounded-full transition-colors shadow-xs"
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
              'h-5.5 w-3 rounded flex items-center justify-center cursor-pointer transition-colors text-veyra-muted hover:text-veyra-text hover:bg-black/10 dark:hover:bg-white/10',
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

        {/* Control Marcatextos / Resaltado (Acción Rápida + Chevron) */}
        <div className="inline-flex items-center h-6.5 rounded-lg p-0.5 transition-colors hover:bg-black/5 dark:hover:bg-white/5 shrink-0">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleQuickApplyHighlight}
            title="Resaltar texto (Clic para aplicar / alternar)"
            className={cn(
              'h-5.5 px-1 rounded flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors',
              isHighlightActive
                ? 'text-accent font-semibold'
                : 'text-veyra-muted hover:text-veyra-text'
            )}
          >
            <Highlighter className="w-3 h-3" />
            <span
              className="w-3 h-[2px] rounded-full transition-colors shadow-xs"
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
              'h-5.5 w-3 rounded flex items-center justify-center cursor-pointer transition-colors text-veyra-muted hover:text-veyra-text hover:bg-black/10 dark:hover:bg-white/10',
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

        <div className="w-[1px] h-3.5 bg-veyra-border mx-0.5 shrink-0" />

        {btn(
          editor.isActive('code'),
          () => editor.chain().focus().toggleCode().run(),
          <Code className="w-3.5 h-3.5" />,
          'Código en línea'
        )}
        {btn(
          false,
          () =>
            editor
              .chain()
              .focus()
              .unsetAllMarks()
              .clearNodes()
              .setTextAlign('left')
              .unsetColor()
              .unsetHighlight()
              .unsetFontFamily()
              .run(),
          <Eraser className="w-3.5 h-3.5" />,
          'Borrar formato'
        )}
        {btn(
          false,
          handleCut,
          <Scissors className="w-3.5 h-3.5" />,
          'Cortar (Ctrl+X)'
        )}
        {btn(
          copied,
          handleCopy,
          copied ? <Check className="w-3.5 h-3.5 text-accent" /> : <Copy className="w-3.5 h-3.5" />,
          'Copiar (Ctrl+C)'
        )}
        {btn(
          false,
          handlePaste,
          <ClipboardPaste className="w-3.5 h-3.5" />,
          'Pegar (Ctrl+V)'
        )}
      </BubbleMenu>

      {/* POPUP FLOTANTE (PORTAL): Color de texto en Bubble Menu */}
      <TextColorPopover
        isOpen={isTextColorMenuOpen}
        menuRef={textColorMenuRef}
        coords={textColorCoords}
        currentTextColor={currentTextColor}
        recentColors={recentTextColors}
        onSelectColor={handleSelectTextColor}
        onClose={() => setIsTextColorMenuOpen(false)}
      />

      {/* POPUP FLOTANTE (PORTAL): Resaltado en Bubble Menu */}
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
    </>
  );
};

