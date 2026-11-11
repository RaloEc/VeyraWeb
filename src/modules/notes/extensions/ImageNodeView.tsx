import React, { useState, useRef, useEffect, useCallback } from 'react';
import { NodeViewWrapper, useEditorState, type NodeViewProps } from '@tiptap/react';
import { cn } from '../../../lib/utils';

export const ImageNodeView: React.FC<NodeViewProps> = ({
  node,
  updateAttributes,
  selected,
  editor,
  getPos,
}) => {
  const { src, alt, width } = node.attrs;
  const textAlign = node.attrs.textAlign || 'center';

  // Posición del nodo en el documento ProseMirror
  const pos = typeof getPos === 'function' ? getPos() : null;

  // Suscripción reactiva mediante useEditorState para re-renderizar de inmediato cuando cambia editingCaptionPos
  const isEditingCaption = useEditorState({
    editor,
    selector: (ctx) => {
      const storage = ctx.editor.storage.image;
      return typeof pos === 'number' && storage?.editingCaptionPos === pos;
    },
  });

  const caption: string | null = node.attrs.caption;
  const hasContent = caption != null && caption.trim() !== '';

  const [isResizing, setIsResizing] = useState(false);
  const [currentWidth, setCurrentWidth] = useState<number | null>(width || null);

  const containerRef = useRef<HTMLDivElement>(null);
  const imageWrapperRef = useRef<HTMLDivElement>(null);
  const captionInputRef = useRef<HTMLInputElement>(null);

  const startXRef = useRef(0);
  const startWidthPxRef = useRef(0);
  const containerWidthPxRef = useRef(0);
  const activeHandleRef = useRef<string | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const pendingEventRef = useRef<PointerEvent | null>(null);
  const lastPctRef = useRef<number>(width || 100);

  // Sincronizar el ancho local cuando los atributos del nodo cambian desde Yjs
  useEffect(() => {
    if (!isResizing) {
      setCurrentWidth(width || null);
      lastPctRef.current = width || 100;
    }
  }, [width, isResizing]);

  // Focus y colocación de cursor al final cuando se activa la edición del caption
  useEffect(() => {
    if (isEditingCaption && captionInputRef.current) {
      captionInputRef.current.focus();
      const len = captionInputRef.current.value.length;
      captionInputRef.current.setSelectionRange(len, len);
    }
  }, [isEditingCaption]);

  // Si el nodo se deselecciona mientras editamos, salir del modo edición solo si el input no tiene foco
  useEffect(() => {
    if (!isEditingCaption) return;
    const input = captionInputRef.current;
    const hasFocus = typeof document !== 'undefined' && document.activeElement === input;
    if (!hasFocus && !selected) {
      editor.commands.clearCaptionEditing();
    }
  }, [selected, isEditingCaption, editor]);

  // Cancelar AnimationFrame si el componente se desmonta
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  // Manejador del inicio del arrastre de resize con throttling por requestAnimationFrame
  const handlePointerDown = useCallback(
    (e: React.PointerEvent, handle: string) => {
      e.preventDefault();
      e.stopPropagation();

      if (!imageWrapperRef.current || !containerRef.current) return;

      const parentDom = containerRef.current.parentElement || containerRef.current;
      const cWidth = parentDom.clientWidth || containerRef.current.clientWidth || 800;
      const imgWidth = imageWrapperRef.current.offsetWidth;

      startXRef.current = e.clientX;
      startWidthPxRef.current = imgWidth;
      containerWidthPxRef.current = cWidth;
      activeHandleRef.current = handle;
      setIsResizing(true);

      const isRightHandle = handle.includes('e');

      const handlePointerMove = (moveEvent: PointerEvent) => {
        pendingEventRef.current = moveEvent;
        if (rafIdRef.current !== null) return;

        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = null;
          const currentEvent = pendingEventRef.current;
          if (!currentEvent || !imageWrapperRef.current) return;

          const deltaX = currentEvent.clientX - startXRef.current;
          const effectiveDelta = isRightHandle ? deltaX : -deltaX;
          const multiplier = textAlign === 'center' ? 2 : 1;
          const newWidthPx = startWidthPxRef.current + effectiveDelta * multiplier;

          let pct = (newWidthPx / containerWidthPxRef.current) * 100;
          pct = Math.max(15, Math.min(100, pct));

          if (Math.abs(pct - lastPctRef.current) >= 0.2) {
            lastPctRef.current = pct;
            // CRÍTICO (R3): Solo modificamos estilo DOM directo durante el arrastre, CERO deltas Yjs
            imageWrapperRef.current.style.width = `${pct}%`;
            setCurrentWidth(Math.round(pct));
          }
        });
      };

      const handlePointerUp = (upEvent: PointerEvent) => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        window.removeEventListener('pointercancel', handlePointerUp);

        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }

        const deltaX = upEvent.clientX - startXRef.current;
        const effectiveDelta = isRightHandle ? deltaX : -deltaX;
        const multiplier = textAlign === 'center' ? 2 : 1;
        const newWidthPx = startWidthPxRef.current + effectiveDelta * multiplier;

        let pct = (newWidthPx / containerWidthPxRef.current) * 100;
        pct = Math.max(15, Math.min(100, pct));
        const finalWidth = Math.round(pct);

        setIsResizing(false);
        activeHandleRef.current = null;

        if (imageWrapperRef.current) {
          imageWrapperRef.current.style.width = `${finalWidth}%`;
        }
        setCurrentWidth(finalWidth);

        // CRÍTICO (R3): Comitear a Yjs exactamente UNA SOLA VEZ al terminar el arrastre
        updateAttributes({ width: finalWidth });
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('pointercancel', handlePointerUp);
    },
    [textAlign, updateAttributes]
  );

  // Guardar pie de foto al perder foco en el input
  const handleCaptionBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const trimmed = e.currentTarget.value.trim();
    if (trimmed.length > 0) {
      if (trimmed !== caption) {
        updateAttributes({ caption: trimmed });
      }
    } else if (caption != null) {
      updateAttributes({ caption: null });
    }
    editor.commands.clearCaptionEditing();
  };

  // Manejo de teclado en el input de pie de foto
  const handleCaptionKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      // Cancelar: no commit, solo limpiar edición y devolver foco al editor
      editor.commands.clearCaptionEditing();
      editor.commands.focus();
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.blur(); // dispara onBlur → commit
    }
  };

  // Determinar margen izquierdo porcentual exacto según alineación
  const currentPct = currentWidth || 100;
  let marginLeft = '0%';
  if (textAlign === 'center') {
    marginLeft = `${(100 - currentPct) / 2}%`;
  } else if (textAlign === 'right') {
    marginLeft = `${100 - currentPct}%`;
  }

  const widthStyle = currentWidth ? `${currentWidth}%` : '100%';

  return (
    <NodeViewWrapper
      as="figure"
      ref={containerRef}
      className={cn(
        'veyra-image-node relative block w-full clear-both',
        selected && 'is-selected',
        isResizing && 'is-resizing'
      )}
      data-text-align={textAlign}
      data-selected={selected ? 'true' : undefined}
    >
      <div
        ref={imageWrapperRef}
        style={{ width: widthStyle, marginLeft }}
        className={cn(
          'relative group max-w-full mr-auto',
          !isResizing && 'transition-[width,margin-left] duration-220 ease-out will-change-[width,margin-left]',
          selected && 'outline outline-1 outline-accent outline-offset-2 rounded-lg'
        )}
        onClick={() => {
          if (!selected && typeof getPos === 'function') {
            const pos = getPos();
            if (typeof pos === 'number') {
              editor.commands.setNodeSelection(pos);
            }
          }
        }}
      >
        <img
          src={src}
          alt={alt || ''}
          draggable={false}
          className="w-full h-auto block rounded-lg object-contain shadow-sm pointer-events-none"
        />

        {/* Tiradores de redimensión en las 4 esquinas si está seleccionado y NO editando caption */}
        {selected && !isEditingCaption && (
          <>
            {/* Indicador de porcentaje flotante durante el redimensionamiento */}
            {isResizing && currentWidth && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-black/80 text-white text-[11px] font-medium px-2 py-0.5 rounded-full backdrop-blur-sm pointer-events-none z-30 shadow">
                {currentWidth}%
              </div>
            )}

            {/* Manija Noroeste (NW) */}
            <div
              onPointerDown={(e) => handlePointerDown(e, 'nw')}
              className="resize-handle resize-nw"
              title="Redimensionar"
            />
            {/* Manija Noreste (NE) */}
            <div
              onPointerDown={(e) => handlePointerDown(e, 'ne')}
              className="resize-handle resize-ne"
              title="Redimensionar"
            />
            {/* Manija Suroeste (SW) */}
            <div
              onPointerDown={(e) => handlePointerDown(e, 'sw')}
              className="resize-handle resize-sw"
              title="Redimensionar"
            />
            {/* Manija Sureste (SE) */}
            <div
              onPointerDown={(e) => handlePointerDown(e, 'se')}
              className="resize-handle resize-se"
              title="Redimensionar"
            />
          </>
        )}
      </div>

      {/* Pie de foto (Caption): input interactivo en modo edición, texto plano estático fuera de él */}
      {isEditingCaption ? (
        <input
          ref={captionInputRef}
          type="text"
          defaultValue={caption || ''}
          placeholder="Escribe un pie de foto..."
          onBlur={handleCaptionBlur}
          onKeyDown={handleCaptionKeyDown}
          style={{ width: widthStyle, marginLeft }}
          className={cn(
            'veyra-figcaption-input mr-auto',
            !isResizing && 'transition-[width,margin-left] duration-220 ease-out will-change-[width,margin-left]'
          )}
        />
      ) : hasContent ? (
        <figcaption
          style={{ width: widthStyle, marginLeft, cursor: 'text' }}
          className={cn(
            'veyra-figcaption-text mr-auto',
            !isResizing && 'transition-[width,margin-left] duration-220 ease-out will-change-[width,margin-left]'
          )}
          onClick={() => {
            if (typeof pos === 'number') {
              editor.commands.setCaptionEditing(pos);
            }
          }}
        >
          {caption}
        </figcaption>
      ) : null}
    </NodeViewWrapper>
  );
};
