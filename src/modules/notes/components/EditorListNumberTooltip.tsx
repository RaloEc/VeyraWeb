import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/react';
import { ListOrdered, Check, CornerDownRight, RotateCcw } from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { NumberingStyle } from '../extensions/CustomOrderedList';

interface EditorListNumberTooltipProps {
  editor: Editor | null;
}

interface HoverState {
  targetListPos: number;
  currentStart: number;
  currentStyle: NumberingStyle;
  previousContinuation: number | null;
  itemNumber: number;
  top: number;
  left: number;
  placement: 'top' | 'bottom';
}

const STYLE_PILLS: { id: NumberingStyle; label: string }[] = [
  { id: 'decimal', label: '1.' },
  { id: 'decimal-paren', label: '1)' },
  { id: 'upper-roman', label: 'I.' },
  { id: 'upper-alpha', label: 'A.' },
  { id: 'lower-alpha-paren', label: 'a)' },
  { id: 'lower-alpha', label: 'a.' },
  { id: 'lower-roman', label: 'i.' },
];

export const EditorListNumberTooltip: React.FC<EditorListNumberTooltipProps> = ({ editor }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [hoverState, setHoverState] = useState<HoverState | null>(null);
  const [customStartInput, setCustomStartInput] = useState<string>('1');

  const tooltipRef = useRef<HTMLDivElement>(null);
  const activeLiRef = useRef<HTMLLIElement | null>(null);
  const openTimeoutRef = useRef<number | null>(null);
  const closeTimeoutRef = useRef<number | null>(null);
  const isMouseInTooltipRef = useRef(false);

  // Calcula el número de continuación de una lista previa
  const getPreviousListContinuation = useCallback((doc: any, targetPos: number): number | null => {
    let prevList: { start: number; count: number } | null = null;

    doc.nodesBetween(0, targetPos, (node: any, pos: number) => {
      if (pos >= targetPos) return false;
      if (node.type.name === 'orderedList') {
        const start = (node.attrs.start as number) || 1;
        let count = 0;
        node.forEach((child: any) => {
          if (child.type.name === 'listItem') count++;
        });
        prevList = { start, count };
      }
      return true;
    });

    if (prevList && (prevList as any).count > 0) {
      return (prevList as any).start + (prevList as any).count;
    }
    return null;
  }, []);

  // Limpiar temporizadores
  const clearTimers = useCallback(() => {
    if (openTimeoutRef.current) {
      window.clearTimeout(openTimeoutRef.current);
      openTimeoutRef.current = null;
    }
    if (closeTimeoutRef.current) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }, []);

  const closeTooltip = useCallback(() => {
    clearTimers();
    setIsOpen(false);
    activeLiRef.current = null;
  }, [clearTimers]);

  // Actualizar el atributo 'start' de la lista ordenada
  const updateListStart = useCallback(
    (newStart: number) => {
      if (!editor || !hoverState || hoverState.targetListPos === -1) return;
      const { targetListPos } = hoverState;
      const node = editor.state.doc.nodeAt(targetListPos);
      if (node && node.type.name === 'orderedList') {
        const tr = editor.state.tr.setNodeMarkup(targetListPos, undefined, {
          ...node.attrs,
          start: newStart,
        });
        editor.view.dispatch(tr);
      }
      closeTooltip();
    },
    [editor, hoverState, closeTooltip]
  );

  // Actualizar el atributo 'listStyle' de la lista ordenada
  const updateListStyle = useCallback(
    (newStyle: NumberingStyle) => {
      if (!editor || !hoverState || hoverState.targetListPos === -1) return;
      const { targetListPos } = hoverState;
      const node = editor.state.doc.nodeAt(targetListPos);
      if (node && node.type.name === 'orderedList') {
        const tr = editor.state.tr.setNodeMarkup(targetListPos, undefined, {
          ...node.attrs,
          listStyle: newStyle,
        });
        editor.view.dispatch(tr);
      }
      closeTooltip();
    },
    [editor, hoverState, closeTooltip]
  );

  useEffect(() => {
    if (!editor || !editor.view) return;
    const dom = editor.view.dom;

    const handleMouseMove = (e: MouseEvent) => {
      if (!editor.isEditable) return;

      // Si el usuario tiene una selección activa de texto, no mostramos el tooltip
      if (editor.state.selection && !editor.state.selection.empty) {
        if (isOpen) closeTooltip();
        return;
      }

      // Si el cursor está dentro del propio tooltip emergente, mantenerlo abierto
      if (isMouseInTooltipRef.current) return;

      const target = e.target as HTMLElement | null;
      if (!target) return;

      const li = target.closest('li') as HTMLLIElement | null;
      const ol = li?.parentElement as HTMLOListElement | null;

      if (!li || !ol || ol.tagName.toLowerCase() !== 'ol') {
        // Fuera de una lista ordenada
        if (isOpen && !closeTimeoutRef.current) {
          closeTimeoutRef.current = window.setTimeout(() => {
            if (!isMouseInTooltipRef.current) {
              closeTooltip();
            }
          }, 300);
        }
        return;
      }

      const rect = li.getBoundingClientRect();

      // Detección de la zona del número (marker) en el gutter izquierdo del <li>
      // En CSS: .tiptap ol tiene padding-left: 1.6rem (~26px) y li tiene padding-left: 0.15rem (~2.4px).
      // El número se dibuja aproximadamente entre [rect.left - 48, rect.left + 30].
      const isOverMarkerX = e.clientX >= rect.left - 48 && e.clientX <= rect.left + 30;
      const isOverMarkerY = e.clientY >= rect.top - 6 && e.clientY <= rect.top + 30;

      if (isOverMarkerX && isOverMarkerY) {
        // Cancelar cierre pendiente
        if (closeTimeoutRef.current) {
          window.clearTimeout(closeTimeoutRef.current);
          closeTimeoutRef.current = null;
        }

        // Si ya está abierto para este mismo LI, no hacer nada
        if (isOpen && activeLiRef.current === li) {
          return;
        }

        // Encontrar la posición en ProseMirror
        try {
          const pos = editor.view.posAtDOM(li, 0);
          if (pos === null || pos === undefined || pos < 0) return;
          const $pos = editor.state.doc.resolve(pos);

          let listPos = -1;
          let listNode: any = null;
          for (let d = $pos.depth; d > 0; d--) {
            if ($pos.node(d).type.name === 'orderedList') {
              listPos = $pos.before(d);
              listNode = $pos.node(d);
              break;
            }
          }

          if (!listNode || listPos === -1) return;

          const currentStart = (listNode.attrs.start as number) || 1;
          const currentStyle = (listNode.attrs.listStyle as NumberingStyle) || 'decimal';
          const prevContinuation = getPreviousListContinuation(editor.state.doc, listPos);
          const liIndex = Array.from(ol.children).indexOf(li);
          const itemNumber = currentStart + Math.max(0, liIndex);

          // Posición del tooltip
          const menuWidth = 248;
          const menuHeight = 200;
          let left = rect.left - 15;
          if (left + menuWidth > window.innerWidth - 16) {
            left = window.innerWidth - menuWidth - 16;
          }
          if (left < 16) left = 16;

          let top = rect.top - 8;
          let placement: 'top' | 'bottom' = 'top';
          if (top - menuHeight < 60) {
            top = rect.bottom + 8;
            placement = 'bottom';
          }

          activeLiRef.current = li;

          // Abrir con un retardo breve de hover (180ms) para evitar aperturas no deseadas al mover el mouse
          if (openTimeoutRef.current) window.clearTimeout(openTimeoutRef.current);
          openTimeoutRef.current = window.setTimeout(() => {
            setHoverState({
              targetListPos: listPos,
              currentStart,
              currentStyle,
              previousContinuation: prevContinuation,
              itemNumber,
              top,
              left,
              placement,
            });
            setCustomStartInput(String(currentStart));
            setIsOpen(true);
          }, 180);
        } catch {
          // Si falla la resolución de posición del DOM, ignorar
        }
      } else {
        // El cursor está en el LI pero no sobre el número
        if (openTimeoutRef.current) {
          window.clearTimeout(openTimeoutRef.current);
          openTimeoutRef.current = null;
        }
        if (isOpen && !closeTimeoutRef.current) {
          closeTimeoutRef.current = window.setTimeout(() => {
            if (!isMouseInTooltipRef.current) {
              closeTooltip();
            }
          }, 300);
        }
      }
    };

    const handleMouseLeave = () => {
      if (openTimeoutRef.current) {
        window.clearTimeout(openTimeoutRef.current);
        openTimeoutRef.current = null;
      }
      if (isOpen && !closeTimeoutRef.current) {
        closeTimeoutRef.current = window.setTimeout(() => {
          if (!isMouseInTooltipRef.current) {
            closeTooltip();
          }
        }, 300);
      }
    };

    // Al hacer clic directo sobre el número, abrir instantáneamente sin retardo
    const handleClick = (e: MouseEvent) => {
      if (!editor.isEditable) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const li = target.closest('li') as HTMLLIElement | null;
      const ol = li?.parentElement as HTMLOListElement | null;
      if (!li || !ol || ol.tagName.toLowerCase() !== 'ol') return;

      const rect = li.getBoundingClientRect();
      const isOverMarkerX = e.clientX >= rect.left - 48 && e.clientX <= rect.left + 30;
      const isOverMarkerY = e.clientY >= rect.top - 6 && e.clientY <= rect.top + 30;

      if (isOverMarkerX && isOverMarkerY) {
        try {
          const pos = editor.view.posAtDOM(li, 0);
          if (pos === null || pos === undefined || pos < 0) return;
          const $pos = editor.state.doc.resolve(pos);
          let listPos = -1;
          let listNode: any = null;
          for (let d = $pos.depth; d > 0; d--) {
            if ($pos.node(d).type.name === 'orderedList') {
              listPos = $pos.before(d);
              listNode = $pos.node(d);
              break;
            }
          }
          if (listNode && listPos !== -1) {
            const currentStart = (listNode.attrs.start as number) || 1;
            const currentStyle = (listNode.attrs.listStyle as NumberingStyle) || 'decimal';
            const prevContinuation = getPreviousListContinuation(editor.state.doc, listPos);
            const liIndex = Array.from(ol.children).indexOf(li);
            const itemNumber = currentStart + Math.max(0, liIndex);

            const menuWidth = 248;
            const menuHeight = 200;
            let left = rect.left - 15;
            if (left + menuWidth > window.innerWidth - 16) {
              left = window.innerWidth - menuWidth - 16;
            }
            if (left < 16) left = 16;

            let top = rect.top - 8;
            let placement: 'top' | 'bottom' = 'top';
            if (top - menuHeight < 60) {
              top = rect.bottom + 8;
              placement = 'bottom';
            }

            activeLiRef.current = li;
            setHoverState({
              targetListPos: listPos,
              currentStart,
              currentStyle,
              previousContinuation: prevContinuation,
              itemNumber,
              top,
              left,
              placement,
            });
            setCustomStartInput(String(currentStart));
            setIsOpen(true);
          }
        } catch {}
      }
    };

    dom.addEventListener('mousemove', handleMouseMove);
    dom.addEventListener('mouseleave', handleMouseLeave);
    dom.addEventListener('click', handleClick);

    const handleScroll = () => {
      if (isOpen) closeTooltip();
    };
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      dom.removeEventListener('mousemove', handleMouseMove);
      dom.removeEventListener('mouseleave', handleMouseLeave);
      dom.removeEventListener('click', handleClick);
      window.removeEventListener('scroll', handleScroll, true);
      clearTimers();
    };
  }, [editor, isOpen, getPreviousListContinuation, closeTooltip, clearTimers]);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    if (!isOpen) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(e.target as Node) &&
        activeLiRef.current &&
        !activeLiRef.current.contains(e.target as Node)
      ) {
        closeTooltip();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeTooltip();
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, closeTooltip]);

  if (!isOpen || !hoverState || typeof document === 'undefined') return null;

  const { currentStart, currentStyle, previousContinuation, itemNumber, top, left, placement } = hoverState;

  return createPortal(
    <div
      ref={tooltipRef}
      onMouseEnter={() => {
        isMouseInTooltipRef.current = true;
        if (closeTimeoutRef.current) {
          window.clearTimeout(closeTimeoutRef.current);
          closeTimeoutRef.current = null;
        }
      }}
      onMouseLeave={() => {
        isMouseInTooltipRef.current = false;
        if (!closeTimeoutRef.current) {
          closeTimeoutRef.current = window.setTimeout(() => {
            closeTooltip();
          }, 300);
        }
      }}
      style={{
        position: 'fixed',
        top: `${top}px`,
        left: `${left}px`,
        transform: placement === 'top' ? 'translateY(-100%)' : 'none',
        zIndex: 99999,
      }}
      className="p-2.5 w-[248px] rounded-xl bg-white dark:bg-[#18181B] border border-slate-200 dark:border-zinc-800 shadow-xl text-xs space-y-2 text-slate-800 dark:text-zinc-200 select-none animate-in fade-in zoom-in-95 duration-100"
    >
      {/* Cabecera plana */}
      <div className="flex items-center justify-between px-1 text-[11px] font-semibold text-slate-700 dark:text-zinc-300">
        <span className="flex items-center gap-1.5 text-accent font-bold uppercase tracking-wider text-[10px]">
          <ListOrdered className="w-3.5 h-3.5" />
          Numeración de lista
        </span>
        <span className="font-mono text-[10px] text-slate-400 dark:text-zinc-500">
          Item #{itemNumber}
        </span>
      </div>

      {/* Selector de formato / estilo */}
      <div className="flex items-center gap-1 px-0.5 overflow-x-auto no-scrollbar py-0.5">
        {STYLE_PILLS.map((pill) => {
          const isSelected = currentStyle === pill.id;
          return (
            <button
              key={pill.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => updateListStyle(pill.id)}
              className={cn(
                'px-1.5 py-0.5 rounded text-[10px] font-mono font-medium transition-colors cursor-pointer shrink-0 border',
                isSelected
                  ? 'bg-accent text-white border-accent shadow-xs'
                  : 'bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-700 hover:border-accent'
              )}
            >
              {pill.label}
            </button>
          );
        })}
      </div>

      {/* Opción 1: Continuar lista anterior */}
      {previousContinuation !== null && previousContinuation !== currentStart && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => updateListStart(previousContinuation)}
          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-accent/10 hover:bg-accent/20 text-accent font-medium transition-colors cursor-pointer text-left"
        >
          <span className="flex items-center gap-1.5">
            <CornerDownRight className="w-3.5 h-3.5 shrink-0" />
            <span>Continuar anterior</span>
          </span>
          <span className="font-mono font-bold bg-accent text-white px-1.5 py-0.5 rounded text-[10px]">
            {previousContinuation}.
          </span>
        </button>
      )}

      {/* Opción 2: Reiniciar en 1 */}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => updateListStart(1)}
        className={cn(
          'w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer text-left',
          currentStart === 1
            ? 'bg-slate-100 dark:bg-zinc-800 text-slate-900 dark:text-zinc-100 font-semibold'
            : 'hover:bg-slate-50 dark:hover:bg-zinc-800/60 text-slate-700 dark:text-zinc-300'
        )}
      >
        <span className="flex items-center gap-1.5">
          <RotateCcw className="w-3.5 h-3.5 shrink-0 text-slate-400 dark:text-zinc-500" />
          <span>Reiniciar en 1</span>
        </span>
        {currentStart === 1 && <Check className="w-3.5 h-3.5 text-accent" />}
      </button>

      <div className="h-[1px] bg-slate-100 dark:bg-zinc-800 my-1" />

      {/* Opción 3: Iniciar en número personalizado */}
      <div className="px-1 pb-0.5 space-y-1">
        <span className="text-[10px] text-slate-500 dark:text-zinc-400 font-medium">
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
                  updateListStart(val);
                }
              }
            }}
            className="w-16 px-2 py-1 rounded-md bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs font-mono text-center focus:outline-none focus:border-accent text-slate-800 dark:text-zinc-200"
          />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              const val = parseInt(customStartInput, 10);
              if (!isNaN(val) && val >= 1) {
                updateListStart(val);
              }
            }}
            className="flex-1 py-1 px-2.5 rounded-md bg-accent text-white font-medium hover:bg-accent/90 transition-colors text-xs text-center cursor-pointer"
          >
            Aplicar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

