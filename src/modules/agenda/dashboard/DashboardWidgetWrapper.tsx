import React, { useState, useRef, useEffect } from 'react';
import { GripVertical, EyeOff } from 'lucide-react';
import { cn } from '../../../lib/utils';
import {
  AVAILABLE_WIDGETS,
  type WidgetId,
  type WidgetSize,
} from './types';

interface DashboardWidgetWrapperProps {
  widgetId: WidgetId;
  size: WidgetSize;
  isCustomizing: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  gridContainerRef: React.RefObject<HTMLDivElement | null>;
  onDragStart: (e: React.DragEvent, id: WidgetId) => void;
  onDragOver: (e: React.DragEvent, id: WidgetId) => void;
  onDragEnter: (e: React.DragEvent, id: WidgetId) => void;
  onDragLeave: (e: React.DragEvent, id: WidgetId) => void;
  onDrop: (e: React.DragEvent, id: WidgetId) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onResizeEnd: (id: WidgetId, newSize: WidgetSize) => void;
  onHideWidget: (id: WidgetId) => void;
  children: React.ReactNode;
}

export const DashboardWidgetWrapper: React.FC<DashboardWidgetWrapperProps> = ({
  widgetId,
  size,
  isCustomizing,
  isDragging,
  isDragOver,
  gridContainerRef,
  onDragStart,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
  onDragEnd,
  onResizeEnd,
  onHideWidget,
  children,
}) => {
  const meta = AVAILABLE_WIDGETS[widgetId];
  const cardRef = useRef<HTMLDivElement>(null);

  // Live size during corner dragging
  const [liveSize, setLiveSize] = useState<WidgetSize>(size);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    if (!isResizing) {
      setLiveSize(size);
    }
  }, [size, isResizing]);

  // Corner resize handler (10x10 nodes drag handle)
  const handlePointerDownResize = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const container = gridContainerRef.current;
    const card = cardRef.current;
    if (!container || !card) return;

    setIsResizing(true);
    const startX = e.clientX;
    const startY = e.clientY;
    const startRect = card.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    // 10 columns grid: cell width is container / 10
    const cellWidth = containerRect.width / 10;
    // Row height step is 60px + 16px gap = 76px
    const cellHeight = 76;

    const initialCols = liveSize.colSpan;
    const initialRows = liveSize.rowSpan;

    let currentCols = initialCols;
    let currentRows = initialRows;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      const targetWidth = startRect.width + deltaX;
      const targetHeight = startRect.height + deltaY;

      // Calculate new spans with boundary clamping (2..10 cols, 2..12 rows)
      const calculatedCols = Math.max(2, Math.min(10, Math.round(targetWidth / cellWidth)));
      const calculatedRows = Math.max(2, Math.min(12, Math.round(targetHeight / cellHeight)));

      currentCols = calculatedCols;
      currentRows = calculatedRows;

      setLiveSize({ colSpan: calculatedCols, rowSpan: calculatedRows });
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      setIsResizing(false);
      onResizeEnd(widgetId, { colSpan: currentCols, rowSpan: currentRows });
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  return (
    <div
      ref={cardRef}
      draggable={isCustomizing && !isResizing}
      onDragStart={(e) => onDragStart(e, widgetId)}
      onDragOver={(e) => onDragOver(e, widgetId)}
      onDragEnter={(e) => onDragEnter(e, widgetId)}
      onDragLeave={(e) => onDragLeave(e, widgetId)}
      onDrop={(e) => onDrop(e, widgetId)}
      onDragEnd={onDragEnd}
      style={{
        gridColumn: `span ${liveSize.colSpan}`,
        gridRow: `span ${liveSize.rowSpan}`,
      }}
      className={cn(
        'group relative flex flex-col transition-all duration-150',
        'col-span-full md:col-auto', // En móviles ocupa ancho completo
        isCustomizing && 'rounded-2xl p-1',
        isCustomizing &&
          (isDragOver
            ? 'ring-2 ring-accent bg-accent/15 scale-[1.01] shadow-lg'
            : isResizing
            ? 'ring-2 ring-accent shadow-xl bg-accent/[0.04]'
            : 'ring-1 ring-accent/30 hover:ring-accent/60 bg-accent/[0.02]'),
        isDragging && 'opacity-30 scale-95'
      )}
    >
      {/* Encabezado ultra limpio y compacto en Modo Personalización */}
      {isCustomizing && (
        <div className="flex items-center justify-between gap-1.5 px-2.5 py-1 mb-1 rounded-lg bg-veyra-card/95 border border-veyra-border shadow-xs backdrop-blur-md text-xs select-none animate-in fade-in zoom-in-95 shrink-0">
          {/* Zona de agarre para Drag & Drop */}
          <div
            title="Arrastra desde aquí para mover el widget"
            className="flex items-center gap-1.5 text-veyra-text font-medium cursor-grab active:cursor-grabbing hover:text-accent transition-colors min-w-0"
          >
            <GripVertical className="w-3.5 h-3.5 text-accent shrink-0" />
            <span className="font-semibold text-[11px] truncate">
              {meta?.title || widgetId}
            </span>
          </div>

          {/* Dimensiones en nodos y botón ocultar */}
          <div className="flex items-center gap-1.5 shrink-0 ml-auto">
            {/* Badge discreto con dimensiones en cuadrícula */}
            <span
              title={`Tamaño: ${liveSize.colSpan} columnas × ${liveSize.rowSpan} filas`}
              className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-veyra-elevated text-veyra-muted border border-veyra-border/60"
            >
              {liveSize.colSpan}×{liveSize.rowSpan}
            </span>

            {/* Botón compacto Ocultar con icono */}
            <button
              type="button"
              onClick={() => onHideWidget(widgetId)}
              title="Ocultar este widget del dashboard"
              className="w-5 h-5 flex items-center justify-center rounded-md text-rose-400 hover:text-rose-300 hover:bg-rose-500/15 border border-transparent hover:border-rose-500/25 transition-colors cursor-pointer"
            >
              <EyeOff className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Contenido del widget */}
      <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden">
        {children}
      </div>

      {/* Handle de esquina inferior derecha para redimensionar ancho y alto libremente */}
      {isCustomizing && (
        <div
          onPointerDown={handlePointerDownResize}
          title="Arrastra esta esquina para cambiar ancho y alto a tu gusto"
          className={cn(
            'absolute bottom-1 right-1 w-6 h-6 flex items-center justify-center cursor-nwse-resize select-none z-30 transition-all rounded-br-xl rounded-tl-md',
            isResizing
              ? 'bg-accent text-white scale-110 shadow-md ring-2 ring-accent/50'
              : 'text-accent bg-veyra-card/90 hover:bg-accent/20 border border-accent/40 shadow-xs'
          )}
        >
          <svg
            className="w-3.5 h-3.5 pointer-events-none"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <path d="M21 15L15 21M21 9L9 21" />
          </svg>
        </div>
      )}
    </div>
  );
};
