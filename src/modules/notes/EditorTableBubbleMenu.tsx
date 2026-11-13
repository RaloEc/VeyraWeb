import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { findParentNode } from '@tiptap/core';
import {
  Rows,
  Columns,
  Trash2,
  Palette,
  Combine,
  Split,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Plus,
  Minus,
  ChevronDown,
  ArrowRight,
  ArrowDown,
  TableProperties,
  Check,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils';
import {
  getTableSelectionInfo,
  mergeWithRightCell,
  mergeWithBelowCell,
} from './extensions/TableExtensions';

export interface EditorTableBubbleMenuProps {
  editor: Editor | null;
}

const CELL_COLORS = [
  { label: 'Sin fondo', value: null, bgClass: 'bg-transparent border-dashed border-slate-400 dark:border-zinc-500' },
  { label: 'Azul suave (Word)', value: '#dbeafe', bgClass: 'bg-blue-100 dark:bg-blue-950/60' },
  { label: 'Celeste', value: '#cffafe', bgClass: 'bg-cyan-100 dark:bg-cyan-950/60' },
  { label: 'Verde suave', value: '#dcfce7', bgClass: 'bg-emerald-100 dark:bg-emerald-950/60' },
  { label: 'Ámbar suave', value: '#fef3c7', bgClass: 'bg-amber-100 dark:bg-amber-950/60' },
  { label: 'Púrpura suave', value: '#f3e8ff', bgClass: 'bg-purple-100 dark:bg-purple-950/60' },
  { label: 'Rosa suave', value: '#ffe4e6', bgClass: 'bg-rose-100 dark:bg-rose-950/60' },
  { label: 'Gris suave', value: '#f1f5f9', bgClass: 'bg-slate-200/80 dark:bg-zinc-800' },
];

const TABLE_PRESETS = [
  { id: 'default', label: 'Estándar', desc: 'Cuadrícula clásica y prolija con bordes completos' },
  { id: 'minimal', label: 'Minimalista', desc: 'Solo líneas horizontales sutiles (estilo Notion/Docs)' },
  { id: 'striped', label: 'Cebra', desc: 'Filas alternadas en tonos suaves para fácil lectura' },
  { id: 'borderless', label: 'Sin bordes', desc: 'Diseño limpio sin líneas, resalta al posar el cursor' },
  { id: 'compact', label: 'Compacta', desc: 'Menos relleno entre celdas para tablas con muchos datos' },
];

const BORDER_COLORS = [
  { label: 'Predeterminado', value: null, bgClass: 'bg-slate-300 dark:bg-zinc-600' },
  { label: 'Gris sutil', value: '#e2e8f0', bgClass: 'bg-slate-200 dark:bg-zinc-700' },
  { label: 'Gris oscuro', value: '#64748b', bgClass: 'bg-slate-500 dark:bg-zinc-400' },
  { label: 'Índigo / Acento', value: '#6366f1', bgClass: 'bg-indigo-500' },
  { label: 'Azul suave', value: '#93c5fd', bgClass: 'bg-blue-300' },
  { label: 'Verde suave', value: '#86efac', bgClass: 'bg-emerald-300' },
  { label: 'Ámbar suave', value: '#fde047', bgClass: 'bg-amber-300' },
  { label: 'Rojo suave', value: '#fca5a5', bgClass: 'bg-rose-300' },
];

const TABLE_BUBBLE_MENU_OPTIONS = {
  placement: 'top' as const,
  offset: 10,
};

export const EditorTableBubbleMenu: React.FC<EditorTableBubbleMenuProps> = ({ editor }) => {
  if (!editor) return null;

  const [isColorMenuOpen, setIsColorMenuOpen] = useState(false);
  const [colorCoords, setColorCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const [isStyleMenuOpen, setIsStyleMenuOpen] = useState(false);
  const [styleCoords, setStyleCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const [isMergeMenuOpen, setIsMergeMenuOpen] = useState(false);
  const [mergeCoords, setMergeCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const [confirmDelete, setConfirmDelete] = useState(false);
  const colorBtnRef = useRef<HTMLButtonElement>(null);
  const colorMenuRef = useRef<HTMLDivElement>(null);
  const styleBtnRef = useRef<HTMLButtonElement>(null);
  const styleMenuRef = useRef<HTMLDivElement>(null);
  const mergeBtnRef = useRef<HTMLButtonElement>(null);
  const mergeMenuRef = useRef<HTMLDivElement>(null);
  const deleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isColorMenuOpenRef = useRef(isColorMenuOpen);
  isColorMenuOpenRef.current = isColorMenuOpen;
  const isMergeMenuOpenRef = useRef(isMergeMenuOpen);
  isMergeMenuOpenRef.current = isMergeMenuOpen;

  const shouldShowTableBubbleMenu = useCallback(({ editor: ed }: { editor: Editor }) => {
    if (isColorMenuOpenRef.current || isMergeMenuOpenRef.current) return true;
    return ed.isActive('table');
  }, []);

  // Forzar actualización inmediata del menú cuando cambia la selección o contenido
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!editor) return;
    const handleSelectionOrUpdate = () => {
      setTick((t) => t + 1);
    };
    editor.on('selectionUpdate', handleSelectionOrUpdate);
    editor.on('update', handleSelectionOrUpdate);
    return () => {
      editor.off('selectionUpdate', handleSelectionOrUpdate);
      editor.off('update', handleSelectionOrUpdate);
    };
  }, [editor]);

  // Cierra menús desplegables al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        colorMenuRef.current &&
        !colorMenuRef.current.contains(target) &&
        colorBtnRef.current &&
        !colorBtnRef.current.contains(target)
      ) {
        setIsColorMenuOpen(false);
      }
      if (
        styleMenuRef.current &&
        !styleMenuRef.current.contains(target) &&
        styleBtnRef.current &&
        !styleBtnRef.current.contains(target)
      ) {
        setIsStyleMenuOpen(false);
      }
      if (
        mergeMenuRef.current &&
        !mergeMenuRef.current.contains(target) &&
        mergeBtnRef.current &&
        !mergeBtnRef.current.contains(target)
      ) {
        setIsMergeMenuOpen(false);
      }
    };
    if (isColorMenuOpen || isStyleMenuOpen || isMergeMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isColorMenuOpen, isStyleMenuOpen, isMergeMenuOpen]);

  const updateColorPosition = useCallback(() => {
    if (!colorBtnRef.current) return;
    const rect = colorBtnRef.current.getBoundingClientRect();
    const popoverWidth = 190;
    const margin = 10;
    let left = rect.left;
    if (left + popoverWidth > window.innerWidth - margin) {
      left = window.innerWidth - popoverWidth - margin;
    }
    if (left < margin) left = margin;

    setColorCoords({
      top: rect.bottom + 6,
      left,
    });
  }, []);

  const updateStylePosition = useCallback(() => {
    if (!styleBtnRef.current) return;
    const rect = styleBtnRef.current.getBoundingClientRect();
    const popoverWidth = 240;
    const margin = 10;
    let left = rect.left;
    if (left + popoverWidth > window.innerWidth - margin) {
      left = window.innerWidth - popoverWidth - margin;
    }
    if (left < margin) left = margin;

    setStyleCoords({
      top: rect.bottom + 6,
      left,
    });
  }, []);

  const updateMergePosition = useCallback(() => {
    if (!mergeBtnRef.current) return;
    const rect = mergeBtnRef.current.getBoundingClientRect();
    const popoverWidth = 220;
    const margin = 10;
    let left = rect.left;
    if (left + popoverWidth > window.innerWidth - margin) {
      left = window.innerWidth - popoverWidth - margin;
    }
    if (left < margin) left = margin;

    setMergeCoords({
      top: rect.bottom + 6,
      left,
    });
  }, []);

  const handleToggleColorMenu = () => {
    if (!isColorMenuOpen) {
      updateColorPosition();
      setIsStyleMenuOpen(false);
      setIsMergeMenuOpen(false);
      setIsColorMenuOpen(true);
    } else {
      setIsColorMenuOpen(false);
    }
  };

  const handleToggleStyleMenu = () => {
    if (!isStyleMenuOpen) {
      updateStylePosition();
      setIsColorMenuOpen(false);
      setIsMergeMenuOpen(false);
      setIsStyleMenuOpen(true);
    } else {
      setIsStyleMenuOpen(false);
    }
  };

  const handleToggleMergeMenu = () => {
    if (!isMergeMenuOpen) {
      updateMergePosition();
      setIsColorMenuOpen(false);
      setIsStyleMenuOpen(false);
      setIsMergeMenuOpen(true);
    } else {
      setIsMergeMenuOpen(false);
    }
  };

  const handleSetCellColor = (color: string | null) => {
    if (!editor) return;
    editor.chain().focus().setCellAttribute('backgroundColor', color).run();
    setIsColorMenuOpen(false);
  };

  // Helper para leer atributos de la tabla actual
  const currentTableAttrs = (() => {
    if (!editor) return { tableStyle: 'default', borderColor: null, tableAlign: 'left' as 'left' | 'center' | 'right' };
    try {
      const tableParent = findParentNode((node) => node.type.name === 'table')(editor.state.selection);
      if (tableParent && tableParent.node.attrs) {
        return {
          tableStyle: tableParent.node.attrs.tableStyle || 'default',
          borderColor: tableParent.node.attrs.borderColor || null,
          tableAlign: (tableParent.node.attrs.tableAlign || 'left') as 'left' | 'center' | 'right',
        };
      }
    } catch {
      // ignore
    }
    return { tableStyle: 'default', borderColor: null, tableAlign: 'left' as 'left' | 'center' | 'right' };
  })();

  const handleSetTableAlign = (align: 'left' | 'center' | 'right') => {
    if (!editor) return;
    try {
      const tableParent = findParentNode((node) => node.type.name === 'table')(editor.state.selection);
      if (!tableParent) return;

      const { tr } = editor.state;
      tr.setNodeMarkup(tableParent.pos, undefined, {
        ...tableParent.node.attrs,
        tableAlign: align,
      });
      editor.view.dispatch(tr);
    } catch {
      // fallback
    }
  };

  const handleSetTableStyle = (styleId: string) => {
    if (!editor) return;
    try {
      const tableParent = findParentNode((node) => node.type.name === 'table')(editor.state.selection);
      if (!tableParent) return;

      const { tr } = editor.state;
      tr.setNodeMarkup(tableParent.pos, undefined, {
        ...tableParent.node.attrs,
        tableStyle: styleId,
      });
      editor.view.dispatch(tr);
    } catch {
      // fallback
    }
  };

  const handleSetBorderColor = (color: string | null) => {
    if (!editor) return;
    try {
      const tableParent = findParentNode((node) => node.type.name === 'table')(editor.state.selection);
      if (!tableParent) return;

      const { tr } = editor.state;
      tr.setNodeMarkup(tableParent.pos, undefined, {
        ...tableParent.node.attrs,
        borderColor: color,
      });
      editor.view.dispatch(tr);
    } catch {
      // fallback
    }
  };

  const handleDeleteTable = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      if (deleteTimeoutRef.current) clearTimeout(deleteTimeoutRef.current);
      deleteTimeoutRef.current = setTimeout(() => setConfirmDelete(false), 2500);
      return;
    }
    editor.chain().focus().deleteTable().run();
    setConfirmDelete(false);
  };

  const tableInfo = getTableSelectionInfo(editor);
  const selectedCellCount = tableInfo.colspan * tableInfo.rowspan;

  const handleMergeSelection = () => {
    if (!editor) return;
    editor.chain().focus().mergeCells().run();
    setIsMergeMenuOpen(false);
  };

  const handleSplitCell = () => {
    if (!editor || !tableInfo.canSplit) return;
    editor.chain().focus().splitCell().run();
  };

  /**
   * Obtiene la posición virtual para anclar el BubbleMenu en la parte superior
   * de toda la tabla, en vez de sobre la celda seleccionada.
   * Si la tabla es muy grande y el usuario hace scroll hacia abajo, se adapta de forma
   * dinámica y pegada ("sticky") para no salirse de la vista.
   */
  const getTableVirtualElement = useCallback(() => {
    if (!editor || editor.isDestroyed) return null;

    try {
      const tableParent = findParentNode((node) => node.type.name === 'table')(editor.state.selection);
      if (!tableParent) return null;

      const domNode = editor.view.nodeDOM(tableParent.pos);
      const tableElement =
        domNode instanceof HTMLElement
          ? (domNode.tagName.toLowerCase() === 'table' ? domNode : domNode.querySelector('table') || domNode)
          : null;

      if (!tableElement) return null;

      const rect = tableElement.getBoundingClientRect();
      const topMargin = 72; // Margen superior para evitar solapar la barra de herramientas
      const menuEstimatedHeight = 44;

      // Si la parte superior de la tabla ya se desplazó fuera de la pantalla (scroll hacia abajo),
      // mantenemos el menú flotando de forma visible y pegada sobre el cuerpo visible de la tabla.
      let visibleTop = rect.top;
      if (rect.top < topMargin && rect.bottom > topMargin + menuEstimatedHeight + 20) {
        visibleTop = Math.min(topMargin, rect.bottom - menuEstimatedHeight - 16);
      }

      const virtualRect = new DOMRect(
        rect.left,
        visibleTop,
        rect.width,
        rect.height
      );

      return {
        getBoundingClientRect: () => virtualRect,
        getClientRects: () => [virtualRect],
      };
    } catch {
      return null;
    }
  }, [editor]);

  return (
    <>
      <BubbleMenu
        editor={editor}
        pluginKey="tableBubbleMenu"
        shouldShow={shouldShowTableBubbleMenu}
        getReferencedVirtualElement={getTableVirtualElement}
        options={TABLE_BUBBLE_MENU_OPTIONS}
        className="flex items-center gap-1 p-1 rounded-xl bg-veyra-card/95 border border-veyra-border shadow-elevated z-50 text-veyra-text text-xs select-none backdrop-blur-md"
      >
        {/* Botón Combinar Celdas */}
        {tableInfo.canMergeSelection ? (
          // Estado A: Varias celdas seleccionadas -> Botón primario sólido, perfecto y unificado
          <button
            ref={mergeBtnRef}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleMergeSelection}
            title={`Combinar las ${selectedCellCount} celdas seleccionadas`}
            className="h-7 px-2.5 rounded-lg font-medium text-xs bg-accent text-white hover:bg-accent/90 shadow-xs flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 shrink-0"
          >
            <Combine className="w-3.5 h-3.5" />
            <span>Combinar</span>
            {selectedCellCount > 1 && (
              <span className="text-[10px] bg-white/25 px-1.5 py-0.5 rounded-md font-bold leading-none">
                {selectedCellCount}
              </span>
            )}
          </button>
        ) : (
          // Estado B: 1 celda seleccionada -> Botón elegante con menú desplegable integrado
          <button
            ref={mergeBtnRef}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleToggleMergeMenu}
            title="Opciones para combinar con celda adyacente"
            className={cn(
              'h-7 px-2 rounded-lg font-medium text-xs transition-colors flex items-center gap-1 cursor-pointer shrink-0',
              isMergeMenuOpen
                ? 'bg-accent/20 text-accent font-semibold'
                : 'bg-accent/10 text-accent hover:bg-accent/20'
            )}
          >
            <Combine className="w-3.5 h-3.5" />
            <span>Combinar</span>
            <ChevronDown
              className={cn(
                'w-3 h-3 opacity-70 transition-transform duration-150',
                isMergeMenuOpen && 'rotate-180'
              )}
            />
          </button>
        )}

        {/* Botón Dividir Celda */}
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          disabled={!tableInfo.canSplit}
          onClick={handleSplitCell}
          title={
            tableInfo.canSplit
              ? 'Dividir celda combinada (Separar en celdas normales)'
              : 'Esta celda no está combinada. Solo se pueden dividir celdas previamente unidas.'
          }
          className={cn(
            'h-7 px-2 rounded-lg font-medium text-xs transition-colors flex items-center gap-1 shrink-0',
            tableInfo.canSplit
              ? 'bg-accent/15 text-accent hover:bg-accent/25 cursor-pointer shadow-xs'
              : 'text-veyra-subtle cursor-not-allowed opacity-40'
          )}
        >
          <Split className="w-3.5 h-3.5" />
          <span>Dividir</span>
        </button>

        <div className="w-[1px] h-4 bg-veyra-border mx-0.5 shrink-0" />

        {/* Filas: Agregar y Eliminar */}
        <div className="inline-flex items-center gap-0.5">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().addRowBefore().run()}
            title="Añadir fila arriba"
            className="h-7 w-7 rounded-lg text-veyra-muted hover:text-veyra-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer flex items-center justify-center shrink-0"
          >
            <div className="relative">
              <Rows className="w-3.5 h-3.5" />
              <Plus className="w-2 h-2 text-accent absolute -top-1 -right-1 font-bold" />
            </div>
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().addRowAfter().run()}
            title="Añadir fila abajo (o pulsa Ctrl+Enter / Shift+Enter)"
            className="h-7 w-7 rounded-lg text-veyra-muted hover:text-veyra-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer flex items-center justify-center shrink-0"
          >
            <div className="relative">
              <Rows className="w-3.5 h-3.5" />
              <Plus className="w-2 h-2 text-accent absolute -bottom-1 -right-1 font-bold" />
            </div>
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().deleteRow().run()}
            title="Eliminar fila actual"
            className="h-7 w-7 rounded-lg text-veyra-muted hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer flex items-center justify-center shrink-0"
          >
            <div className="relative">
              <Rows className="w-3.5 h-3.5" />
              <Minus className="w-2 h-2 text-rose-500 absolute -bottom-1 -right-1 font-bold" />
            </div>
          </button>
        </div>

        <div className="w-[1px] h-4 bg-veyra-border mx-0.5 shrink-0" />

        {/* Columnas: Agregar y Eliminar */}
        <div className="inline-flex items-center gap-0.5">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().addColumnBefore().run()}
            title="Añadir columna a la izquierda"
            className="h-7 w-7 rounded-lg text-veyra-muted hover:text-veyra-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer flex items-center justify-center shrink-0"
          >
            <div className="relative">
              <Columns className="w-3.5 h-3.5" />
              <Plus className="w-2 h-2 text-accent absolute -top-1 -left-1 font-bold" />
            </div>
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().addColumnAfter().run()}
            title="Añadir columna a la derecha"
            className="h-7 w-7 rounded-lg text-veyra-muted hover:text-veyra-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer flex items-center justify-center shrink-0"
          >
            <div className="relative">
              <Columns className="w-3.5 h-3.5" />
              <Plus className="w-2 h-2 text-accent absolute -top-1 -right-1 font-bold" />
            </div>
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().deleteColumn().run()}
            title="Eliminar columna actual"
            className="h-7 w-7 rounded-lg text-veyra-muted hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer flex items-center justify-center shrink-0"
          >
            <div className="relative">
              <Columns className="w-3.5 h-3.5" />
              <Minus className="w-2 h-2 text-rose-500 absolute -bottom-1 -right-1 font-bold" />
            </div>
          </button>
        </div>

        <div className="w-[1px] h-4 bg-veyra-border mx-0.5 shrink-0" />

        {/* Color de Fondo de Celda */}
        <button
          ref={colorBtnRef}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleToggleColorMenu}
          title="Color de fondo de celda(s)"
          className={cn(
            'h-7 px-1.5 rounded-lg text-veyra-muted hover:text-veyra-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer flex items-center gap-1 shrink-0',
            isColorMenuOpen && 'bg-black/10 dark:bg-white/10 text-veyra-text'
          )}
        >
          <Palette className="w-3.5 h-3.5" />
          <ChevronDown className="w-2.5 h-2.5" />
        </button>

        {/* Estilo y Bordes de Tabla */}
        <button
          ref={styleBtnRef}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleToggleStyleMenu}
          title="Personalizar estilo y bordes de la tabla"
          className={cn(
            'h-7 px-2 rounded-lg text-veyra-muted hover:text-veyra-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer flex items-center gap-1 shrink-0',
            isStyleMenuOpen && 'bg-black/10 dark:bg-white/10 text-veyra-text'
          )}
        >
          <TableProperties className="w-3.5 h-3.5 text-accent" />
          <span className="text-[11px] font-medium hidden sm:inline">Estilo</span>
          <ChevronDown className="w-2.5 h-2.5 opacity-70" />
        </button>

        {/* Encabezado toggle */}
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleHeaderRow().run()}
          title="Alternar fila de encabezado"
          className="h-7 px-2 rounded-lg text-veyra-muted hover:text-veyra-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer flex items-center justify-center font-bold text-[11px] shrink-0"
        >
          TH
        </button>

        <div className="w-[1px] h-4 bg-veyra-border mx-0.5 shrink-0" />

        {/* Posición de la tabla (Izquierda, Centro, Derecha) */}
        <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-black/[0.04] dark:bg-white/[0.05] border border-veyra-border/40">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handleSetTableAlign('left')}
            title="Alinear tabla a la izquierda"
            className={cn(
              'h-6 w-6 rounded-md transition-colors cursor-pointer flex items-center justify-center shrink-0',
              currentTableAttrs.tableAlign === 'left'
                ? 'bg-accent text-white shadow-xs'
                : 'text-veyra-muted hover:text-veyra-text hover:bg-black/5 dark:hover:bg-white/5'
            )}
          >
            <AlignLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handleSetTableAlign('center')}
            title="Centrar tabla en la página"
            className={cn(
              'h-6 w-6 rounded-md transition-colors cursor-pointer flex items-center justify-center shrink-0',
              currentTableAttrs.tableAlign === 'center'
                ? 'bg-accent text-white shadow-xs'
                : 'text-veyra-muted hover:text-veyra-text hover:bg-black/5 dark:hover:bg-white/5'
            )}
          >
            <AlignCenter className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handleSetTableAlign('right')}
            title="Alinear tabla a la derecha"
            className={cn(
              'h-6 w-6 rounded-md transition-colors cursor-pointer flex items-center justify-center shrink-0',
              currentTableAttrs.tableAlign === 'right'
                ? 'bg-accent text-white shadow-xs'
                : 'text-veyra-muted hover:text-veyra-text hover:bg-black/5 dark:hover:bg-white/5'
            )}
          >
            <AlignRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="w-[1px] h-4 bg-veyra-border mx-0.5 shrink-0" />

        {/* Alineación rápida del texto de celda */}
        <div className="inline-flex items-center gap-0.5">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
            title="Alinear texto de celda a la izquierda"
            className="h-7 w-7 rounded-lg text-veyra-muted hover:text-veyra-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer flex items-center justify-center shrink-0"
          >
            <AlignLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
            title="Centrar texto de celda"
            className="h-7 w-7 rounded-lg text-veyra-muted hover:text-veyra-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer flex items-center justify-center shrink-0"
          >
            <AlignCenter className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
            title="Alinear texto de celda a la derecha"
            className="h-7 w-7 rounded-lg text-veyra-muted hover:text-veyra-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer flex items-center justify-center shrink-0"
          >
            <AlignRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="w-[1px] h-4 bg-veyra-border mx-0.5 shrink-0" />

        {/* Eliminar tabla con confirmación */}
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleDeleteTable}
          title={confirmDelete ? 'Haz clic para confirmar eliminar tabla' : 'Eliminar tabla completa'}
          className={cn(
            'h-7 px-2 rounded-lg transition-all cursor-pointer flex items-center gap-1 shrink-0',
            confirmDelete
              ? 'bg-rose-500/20 text-rose-500 font-medium px-2.5'
              : 'text-veyra-muted hover:text-rose-500 hover:bg-rose-500/10'
          )}
        >
          <Trash2 className="w-3.5 h-3.5" />
          {confirmDelete && <span className="text-[10px]">¿Eliminar?</span>}
        </button>
      </BubbleMenu>

      {/* Popover menú de combinación de celdas */}
      {isMergeMenuOpen &&
        createPortal(
          <div
            ref={mergeMenuRef}
            style={{
              position: 'fixed',
              top: `${mergeCoords.top}px`,
              left: `${mergeCoords.left}px`,
              zIndex: 9999,
            }}
            className="p-2 w-[220px] rounded-xl bg-veyra-card/98 border border-veyra-border shadow-elevated text-xs space-y-1 text-veyra-text select-none animate-in fade-in zoom-in-95 duration-100 backdrop-blur-md"
          >
            <div className="px-2 pt-0.5 pb-1 text-[10px] font-bold text-accent uppercase tracking-wider">
              Combinar celdas
            </div>

            {/* Opción 1: Combinar con la celda de la derecha */}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              disabled={!tableInfo.canMergeRight}
              onClick={() => {
                mergeWithRightCell(editor);
                setIsMergeMenuOpen(false);
              }}
              className={cn(
                'w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-colors text-left',
                tableInfo.canMergeRight
                  ? 'hover:bg-black/5 dark:hover:bg-white/5 text-veyra-text cursor-pointer font-medium'
                  : 'opacity-40 cursor-not-allowed text-veyra-subtle'
              )}
            >
              <div className="flex items-center gap-2">
                <ArrowRight className="w-3.5 h-3.5 text-accent" />
                <span>Unir con la derecha</span>
              </div>
              <span className="text-[10px] text-veyra-muted font-mono">Columna</span>
            </button>

            {/* Opción 2: Combinar con la celda inferior */}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              disabled={!tableInfo.canMergeBelow}
              onClick={() => {
                mergeWithBelowCell(editor);
                setIsMergeMenuOpen(false);
              }}
              className={cn(
                'w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-colors text-left',
                tableInfo.canMergeBelow
                  ? 'hover:bg-black/5 dark:hover:bg-white/5 text-veyra-text cursor-pointer font-medium'
                  : 'opacity-40 cursor-not-allowed text-veyra-subtle'
              )}
            >
              <div className="flex items-center gap-2">
                <ArrowDown className="w-3.5 h-3.5 text-accent" />
                <span>Unir con la de abajo</span>
              </div>
              <span className="text-[10px] text-veyra-muted font-mono">Fila</span>
            </button>

            <div className="h-[1px] bg-veyra-border my-1" />

            <div className="px-2 py-0.5 text-[10px] text-veyra-muted leading-snug">
              💡 Tip: Arrastra el cursor sobre dos o más celdas para seleccionarlas y combinarlas con 1 clic.
            </div>
          </div>,
          document.body
        )}

      {/* Popover paleta de fondo de celda */}
      {isColorMenuOpen &&
        createPortal(
          <div
            ref={colorMenuRef}
            style={{
              position: 'fixed',
              top: `${colorCoords.top}px`,
              left: `${colorCoords.left}px`,
              zIndex: 9999,
            }}
            className="p-2 w-[190px] rounded-xl bg-veyra-card/98 border border-veyra-border shadow-elevated text-xs space-y-1.5 text-veyra-text select-none animate-in fade-in zoom-in-95 duration-100 backdrop-blur-md"
          >
            <div className="px-1 text-[10px] font-semibold text-veyra-muted uppercase tracking-wider">
              Fondo de celda
            </div>
            <div className="grid grid-cols-4 gap-1.5 pt-1">
              {CELL_COLORS.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSetCellColor(item.value)}
                  title={item.label}
                  className={cn(
                    'w-8 h-8 rounded-lg border border-veyra-border flex items-center justify-center transition-transform hover:scale-105 active:scale-95 cursor-pointer',
                    item.bgClass
                  )}
                >
                  {item.value === null && (
                    <div className="w-4 h-[1.5px] bg-rose-500 rotate-45" />
                  )}
                </button>
              ))}
            </div>
          </div>,
          document.body
        )}

      {/* Popover menú de estilos de tabla y bordes */}
      {isStyleMenuOpen &&
        createPortal(
          <div
            ref={styleMenuRef}
            style={{
              position: 'fixed',
              top: `${styleCoords.top}px`,
              left: `${styleCoords.left}px`,
              zIndex: 9999,
            }}
            className="p-2.5 w-[250px] rounded-xl bg-veyra-card/98 border border-veyra-border shadow-elevated text-xs space-y-2 text-veyra-text select-none animate-in fade-in zoom-in-95 duration-100 backdrop-blur-md"
          >
            <div>
              <div className="px-1 pb-1 text-[10px] font-bold text-accent uppercase tracking-wider">
                Estilo de tabla
              </div>
              <div className="space-y-0.5">
                {TABLE_PRESETS.map((preset) => {
                  const isActive = currentTableAttrs.tableStyle === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSetTableStyle(preset.id)}
                      className={cn(
                        'w-full flex items-center justify-between px-2 py-1.5 rounded-lg transition-colors text-left cursor-pointer',
                        isActive
                          ? 'bg-accent/15 text-accent font-semibold'
                          : 'hover:bg-black/5 dark:hover:bg-white/5 text-veyra-text'
                      )}
                    >
                      <div>
                        <div className="text-[12px] leading-tight">{preset.label}</div>
                        <div className="text-[10px] text-veyra-muted leading-tight">
                          {preset.desc}
                        </div>
                      </div>
                      {isActive && <Check className="w-3.5 h-3.5 shrink-0 text-accent ml-1.5" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="h-[1px] bg-veyra-border my-1" />

            <div>
              <div className="px-1 pb-1 text-[10px] font-semibold text-veyra-muted uppercase tracking-wider">
                Alineación de la tabla
              </div>
              <div className="grid grid-cols-3 gap-1 pt-0.5">
                {[
                  { id: 'left', label: 'Izquierda', icon: AlignLeft },
                  { id: 'center', label: 'Centro', icon: AlignCenter },
                  { id: 'right', label: 'Derecha', icon: AlignRight },
                ].map((item) => {
                  const isActive = currentTableAttrs.tableAlign === item.id;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSetTableAlign(item.id as 'left' | 'center' | 'right')}
                      className={cn(
                        'flex flex-col items-center justify-center gap-1 py-1.5 px-1 rounded-lg border text-xs transition-all cursor-pointer',
                        isActive
                          ? 'border-accent bg-accent/15 text-accent font-semibold'
                          : 'border-veyra-border/60 hover:bg-black/5 dark:hover:bg-white/5 text-veyra-text'
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="text-[10px] leading-none">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="h-[1px] bg-veyra-border my-1" />

            <div>
              <div className="px-1 pb-1 text-[10px] font-semibold text-veyra-muted uppercase tracking-wider">
                Color de bordes
              </div>
              <div className="grid grid-cols-4 gap-1.5 pt-0.5">
                {BORDER_COLORS.map((border) => {
                  const isCurrent =
                    (border.value === null && currentTableAttrs.borderColor === null) ||
                    currentTableAttrs.borderColor === border.value;
                  return (
                    <button
                      key={border.label}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSetBorderColor(border.value)}
                      title={border.label}
                      className={cn(
                        'w-8 h-8 rounded-lg border flex items-center justify-center transition-all hover:scale-105 active:scale-95 cursor-pointer relative',
                        border.bgClass,
                        isCurrent
                          ? 'ring-2 ring-accent ring-offset-1 ring-offset-veyra-card border-accent'
                          : 'border-veyra-border'
                      )}
                    >
                      {isCurrent && (
                        <Check className="w-3.5 h-3.5 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
