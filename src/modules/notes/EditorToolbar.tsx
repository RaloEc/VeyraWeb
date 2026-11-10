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
} from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  NOTE_FONTS,
  areColorsEqual,
} from './constants/noteFonts';
import { useRecentEditorColors } from './hooks/useRecentEditorColors';
import {
  TextColorPopover,
  HighlightColorPopover,
} from './components/EditorColorPopovers';

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

  const [isTextColorMenuOpen, setIsTextColorMenuOpen] = useState(false);
  const [isHighlightMenuOpen, setIsHighlightMenuOpen] = useState(false);
  const [isFontMenuOpen, setIsFontMenuOpen] = useState(false);

  const [textColorCoords, setTextColorCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [highlightCoords, setHighlightCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [fontCoords, setFontCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

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

  // Forzar actualización inmediata de la barra cuando cambia la selección o contenido del editor
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const handleUpdate = () => setTick((t) => t + 1);
    editor.on('transaction', handleUpdate);
    editor.on('selectionUpdate', handleUpdate);
    return () => {
      editor.off('transaction', handleUpdate);
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
    };

    const handleWindowChange = () => {
      if (isTextColorMenuOpen) updateTextColorPosition();
      if (isHighlightMenuOpen) updateHighlightPosition();
      if (isFontMenuOpen) updateFontPosition();
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('resize', handleWindowChange);
    window.addEventListener('scroll', handleWindowChange, true);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('resize', handleWindowChange);
      window.removeEventListener('scroll', handleWindowChange, true);
    };
  }, [isTextColorMenuOpen, isHighlightMenuOpen, isFontMenuOpen, updateTextColorPosition, updateHighlightPosition, updateFontPosition]);

  if (!editor) return null;

  // Estado activo de colores y fuentes
  const currentTextColor = (editor.getAttributes('textStyle').color as string | undefined) || null;
  const currentHighlightColor = (editor.getAttributes('highlight').color as string | undefined) || null;
  const isHighlightActive = editor.isActive('highlight');
  const currentFontFamily = (editor.getAttributes('textStyle').fontFamily as string | undefined) || null;

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
      setIsFontMenuOpen(true);
    } else {
      setIsFontMenuOpen(false);
    }
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
      .run();
  };

  // Alternar encabezados de forma determinista y consistente (H1, H2, H3)
  const handleToggleHeading = (level: 1 | 2 | 3) => {
    if (!editor) return;
    if (editor.isActive('heading', { level })) {
      editor.chain().focus().setParagraph().run();
    } else {
      editor.chain().focus().setHeading({ level }).run();
    }
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

        {/* 6. Borrador de Formato Completo */}
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
        {toolBtn(
          editor.isActive('orderedList'),
          () => editor.chain().focus().toggleOrderedList().run(),
          <ListOrdered className="w-3.5 h-3.5" />,
          'Lista numerada'
        )}

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
    </>
  );
};
