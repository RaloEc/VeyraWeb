import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
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

export const EditorTableBubbleMenu: React.FC<EditorTableBubbleMenuProps> = ({ editor }) => {
  if (!editor) return null;

  const [isColorMenuOpen, setIsColorMenuOpen] = useState(false);
  const [colorCoords, setColorCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const [isMergeMenuOpen, setIsMergeMenuOpen] = useState(false);
  const [mergeCoords, setMergeCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const [confirmDelete, setConfirmDelete] = useState(false);
  const colorBtnRef = useRef<HTMLButtonElement>(null);
  const colorMenuRef = useRef<HTMLDivElement>(null);
  const mergeBtnRef = useRef<HTMLButtonElement>(null);
  const mergeMenuRef = useRef<HTMLDivElement>(null);
  const deleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Forzar actualización inmediata del menú cuando cambia la selección o contenido
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!editor) return;
    const handleUpdate = () => {
      setTick((t) => t + 1);
    };
    editor.on('selectionUpdate', handleUpdate);
    editor.on('transaction', handleUpdate);
    return () => {
      editor.off('selectionUpdate', handleUpdate);
      editor.off('transaction', handleUpdate);
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
        mergeMenuRef.current &&
        !mergeMenuRef.current.contains(target) &&
        mergeBtnRef.current &&
        !mergeBtnRef.current.contains(target)
      ) {
        setIsMergeMenuOpen(false);
      }
    };
    if (isColorMenuOpen || isMergeMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isColorMenuOpen, isMergeMenuOpen]);

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
      setIsColorMenuOpen(true);
    } else {
      setIsColorMenuOpen(false);
    }
  };

  const handleToggleMergeMenu = () => {
    if (!isMergeMenuOpen) {
      updateMergePosition();
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

  return (
    <>
      <BubbleMenu
        editor={editor}
        pluginKey="tableBubbleMenu"
        shouldShow={({ editor }) => {
          if (isColorMenuOpen || isMergeMenuOpen) return true;
          return editor.isActive('table');
        }}
        className="flex items-center gap-1 p-1 rounded-xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-zinc-800 shadow-xl z-50 text-slate-700 dark:text-zinc-200 text-xs select-none"
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
            className="h-7 px-2.5 rounded-lg font-medium text-xs bg-accent text-white hover:bg-accent/90 shadow-sm flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 shrink-0"
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
              : 'text-slate-400 dark:text-zinc-600 cursor-not-allowed opacity-40'
          )}
        >
          <Split className="w-3.5 h-3.5" />
          <span>Dividir</span>
        </button>

        <div className="w-[1px] h-4 bg-slate-200 dark:bg-zinc-800 mx-0.5 shrink-0" />

        {/* Filas: Agregar y Eliminar */}
        <div className="inline-flex items-center gap-0.5">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().addRowBefore().run()}
            title="Añadir fila arriba"
            className="h-7 w-7 rounded-lg text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer flex items-center justify-center shrink-0"
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
            className="h-7 w-7 rounded-lg text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer flex items-center justify-center shrink-0"
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
            className="h-7 w-7 rounded-lg text-slate-600 dark:text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer flex items-center justify-center shrink-0"
          >
            <div className="relative">
              <Rows className="w-3.5 h-3.5" />
              <Minus className="w-2 h-2 text-rose-500 absolute -bottom-1 -right-1 font-bold" />
            </div>
          </button>
        </div>

        <div className="w-[1px] h-4 bg-slate-200 dark:bg-zinc-800 mx-0.5 shrink-0" />

        {/* Columnas: Agregar y Eliminar */}
        <div className="inline-flex items-center gap-0.5">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().addColumnBefore().run()}
            title="Añadir columna a la izquierda"
            className="h-7 w-7 rounded-lg text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer flex items-center justify-center shrink-0"
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
            className="h-7 w-7 rounded-lg text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer flex items-center justify-center shrink-0"
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
            className="h-7 w-7 rounded-lg text-slate-600 dark:text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer flex items-center justify-center shrink-0"
          >
            <div className="relative">
              <Columns className="w-3.5 h-3.5" />
              <Minus className="w-2 h-2 text-rose-500 absolute -bottom-1 -right-1 font-bold" />
            </div>
          </button>
        </div>

        <div className="w-[1px] h-4 bg-slate-200 dark:bg-zinc-800 mx-0.5 shrink-0" />

        {/* Color de Fondo de Celda */}
        <button
          ref={colorBtnRef}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleToggleColorMenu}
          title="Color de fondo de celda(s)"
          className={cn(
            'h-7 px-1.5 rounded-lg text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer flex items-center gap-1 shrink-0',
            isColorMenuOpen && 'bg-slate-200/60 dark:bg-zinc-700/60 text-slate-900 dark:text-zinc-100'
          )}
        >
          <Palette className="w-3.5 h-3.5" />
          <ChevronDown className="w-2.5 h-2.5" />
        </button>

        {/* Encabezado toggle */}
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleHeaderRow().run()}
          title="Alternar fila de encabezado"
          className="h-7 px-2 rounded-lg text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer flex items-center justify-center font-bold text-[11px] shrink-0"
        >
          TH
        </button>

        {/* Alineación rápida */}
        <div className="inline-flex items-center gap-0.5">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
            title="Alinear texto de celda a la izquierda"
            className="h-7 w-7 rounded-lg text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer flex items-center justify-center shrink-0"
          >
            <AlignLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
            title="Centrar texto de celda"
            className="h-7 w-7 rounded-lg text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer flex items-center justify-center shrink-0"
          >
            <AlignCenter className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
            title="Alinear texto de celda a la derecha"
            className="h-7 w-7 rounded-lg text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer flex items-center justify-center shrink-0"
          >
            <AlignRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="w-[1px] h-4 bg-slate-200 dark:bg-zinc-800 mx-0.5 shrink-0" />

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
              : 'text-slate-600 dark:text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10'
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
            className="p-2 w-[220px] rounded-xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-zinc-800 shadow-2xl text-xs space-y-1 text-slate-800 dark:text-zinc-200 select-none animate-in fade-in zoom-in-95 duration-100"
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
                  ? 'hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-200 cursor-pointer font-medium'
                  : 'opacity-40 cursor-not-allowed text-slate-400 dark:text-zinc-600'
              )}
            >
              <div className="flex items-center gap-2">
                <ArrowRight className="w-3.5 h-3.5 text-accent" />
                <span>Unir con la derecha</span>
              </div>
              <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono">Columna</span>
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
                  ? 'hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-200 cursor-pointer font-medium'
                  : 'opacity-40 cursor-not-allowed text-slate-400 dark:text-zinc-600'
              )}
            >
              <div className="flex items-center gap-2">
                <ArrowDown className="w-3.5 h-3.5 text-accent" />
                <span>Unir con la de abajo</span>
              </div>
              <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono">Fila</span>
            </button>

            <div className="h-[1px] bg-slate-100 dark:bg-zinc-800 my-1" />

            <div className="px-2 py-0.5 text-[10px] text-slate-500 dark:text-zinc-400 leading-snug">
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
            className="p-2 w-[190px] rounded-xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-zinc-800 shadow-2xl text-xs space-y-1.5 text-slate-800 dark:text-zinc-200 select-none animate-in fade-in zoom-in-95 duration-100"
          >
            <div className="px-1 text-[10px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
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
                    'w-8 h-8 rounded-lg border border-slate-300 dark:border-zinc-700 flex items-center justify-center transition-transform hover:scale-105 active:scale-95 cursor-pointer',
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
    </>
  );
};
