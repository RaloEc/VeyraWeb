import React, { useState, useRef, useEffect } from 'react';
import {
  Crop,
  Check,
  X,
  RotateCcw,
  Loader2,
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { toast } from 'sonner';

export interface InlineImageCropperProps {
  src: string;
  alt?: string;
  onApply: (croppedBlob: Blob) => Promise<void>;
  onCancel: () => void;
}

interface CropRect {
  x: number; // 0..1
  y: number; // 0..1
  w: number; // 0..1
  h: number; // 0..1
}

interface DragState {
  type: 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';
  startX: number;
  startY: number;
  startCrop: CropRect;
}

const RATIO_PRESETS: { label: string; value: number | null }[] = [
  { label: 'Libre', value: null },
  { label: '1:1', value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '16:9', value: 16 / 9 },
  { label: '3:2', value: 3 / 2 },
];

const MIN_CROP_SIZE = 0.05; // 5% de la dimensión mínima

export const InlineImageCropper: React.FC<InlineImageCropperProps> = ({
  src,
  alt,
  onApply,
  onCancel,
}) => {
  const [crop, setCrop] = useState<CropRect>({
    x: 0.05,
    y: 0.05,
    w: 0.9,
    h: 0.9,
  });
  const [selectedRatio, setSelectedRatio] = useState<number | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<DragState | null>(null);

  // Ajustar ratio cuando cambia
  const handleSetRatio = (ratio: number | null) => {
    setSelectedRatio(ratio);
    if (!ratio || !imgRef.current) return;

    const imgWidth = imgRef.current.clientWidth || 1;
    const imgHeight = imgRef.current.clientHeight || 1;
    const imgAspect = imgWidth / imgHeight;

    // Calcular nuevo w y h normalizados de acuerdo al aspect ratio deseado
    let newW = crop.w;
    let newH = (newW * imgAspect) / ratio;

    if (newH > 1) {
      newH = 0.9;
      newW = (newH * ratio) / imgAspect;
    }
    if (newW > 1) {
      newW = 0.9;
      newH = (newW * imgAspect) / ratio;
    }

    // Centrar en el crop actual
    const centerX = crop.x + crop.w / 2;
    const centerY = crop.y + crop.h / 2;
    let newX = centerX - newW / 2;
    let newY = centerY - newH / 2;

    // Clamping
    newX = Math.max(0, Math.min(1 - newW, newX));
    newY = Math.max(0, Math.min(1 - newH, newY));

    setCrop({
      x: newX,
      y: newY,
      w: newW,
      h: newH,
    });
  };

  const handleResetCrop = () => {
    setSelectedRatio(null);
    setCrop({
      x: 0,
      y: 0,
      w: 1,
      h: 1,
    });
  };

  // Manejo de atajos de teclado (Esc = cancelar, Enter = aplicar)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        if (!isApplying) {
          executeCrop();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [crop, isApplying, onCancel]);

  // Arrastre del recuadro o manijas
  const handlePointerDown = (
    e: React.PointerEvent,
    type: DragState['type']
  ) => {
    e.preventDefault();
    e.stopPropagation();

    dragRef.current = {
      type,
      startX: e.clientX,
      startY: e.clientY,
      startCrop: { ...crop },
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (!dragRef.current || !containerRef.current) return;
      const { type: handleType, startX, startY, startCrop } = dragRef.current;

      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const dx = (moveEvent.clientX - startX) / rect.width;
      const dy = (moveEvent.clientY - startY) / rect.height;

      let nextX = startCrop.x;
      let nextY = startCrop.y;
      let nextW = startCrop.w;
      let nextH = startCrop.h;

      if (handleType === 'move') {
        nextX = Math.max(0, Math.min(1 - startCrop.w, startCrop.x + dx));
        nextY = Math.max(0, Math.min(1 - startCrop.h, startCrop.y + dy));
      } else {
        const imgAspect = rect.width / rect.height;

        if (handleType.includes('e')) {
          nextW = Math.max(MIN_CROP_SIZE, Math.min(1 - startCrop.x, startCrop.w + dx));
        }
        if (handleType.includes('s')) {
          nextH = Math.max(MIN_CROP_SIZE, Math.min(1 - startCrop.y, startCrop.h + dy));
        }
        if (handleType.includes('w')) {
          const maxLeftShift = startCrop.x + startCrop.w - MIN_CROP_SIZE;
          const proposedX = Math.max(0, Math.min(maxLeftShift, startCrop.x + dx));
          nextW = startCrop.w + (startCrop.x - proposedX);
          nextX = proposedX;
        }
        if (handleType.includes('n')) {
          const maxTopShift = startCrop.y + startCrop.h - MIN_CROP_SIZE;
          const proposedY = Math.max(0, Math.min(maxTopShift, startCrop.y + dy));
          nextH = startCrop.h + (startCrop.y - proposedY);
          nextY = proposedY;
        }

        // Si hay aspect ratio bloqueado, forzar proporción
        if (selectedRatio) {
          if (handleType === 'e' || handleType === 'w') {
            nextH = (nextW * imgAspect) / selectedRatio;
            if (nextY + nextH > 1) {
              nextH = 1 - nextY;
              nextW = (nextH * selectedRatio) / imgAspect;
            }
          } else {
            nextW = (nextH * selectedRatio) / imgAspect;
            if (nextX + nextW > 1) {
              nextW = 1 - nextX;
              nextH = (nextW * imgAspect) / selectedRatio;
            }
          }
        }
      }

      setCrop({
        x: Math.max(0, Math.min(1 - MIN_CROP_SIZE, nextX)),
        y: Math.max(0, Math.min(1 - MIN_CROP_SIZE, nextY)),
        w: Math.max(MIN_CROP_SIZE, Math.min(1 - nextX, nextW)),
        h: Math.max(MIN_CROP_SIZE, Math.min(1 - nextY, nextH)),
      });
    };

    const handlePointerUp = () => {
      dragRef.current = null;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  };

  // Ejecución de recorte en Canvas
  const executeCrop = async () => {
    try {
      setIsApplying(true);

      // Descargar o cargar el blob para garantizar que el canvas no se marque como tainted por CORS
      let objectUrl = '';
      let img: HTMLImageElement;

      try {
        const resp = await fetch(src, { mode: 'cors' });
        if (resp.ok) {
          const rawBlob = await resp.blob();
          objectUrl = URL.createObjectURL(rawBlob);
          img = new Image();
          img.src = objectUrl;
        } else {
          throw new Error('Fallback direct image');
        }
      } catch {
        img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = src;
      }

      await new Promise<void>((resolve, reject) => {
        if (img.complete && img.naturalWidth > 0) return resolve();
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('No se pudo cargar la imagen para recorte.'));
      });

      const naturalW = img.naturalWidth;
      const naturalH = img.naturalHeight;

      const sx = Math.max(0, Math.round(crop.x * naturalW));
      const sy = Math.max(0, Math.round(crop.y * naturalH));
      const sw = Math.min(naturalW - sx, Math.max(1, Math.round(crop.w * naturalW)));
      const sh = Math.min(naturalH - sy, Math.max(1, Math.round(crop.h * naturalH)));

      const canvas = document.createElement('canvas');
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No se pudo inicializar el contexto de Canvas.');

      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }

      const croppedBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (webpBlob) => {
            if (webpBlob) return resolve(webpBlob);
            canvas.toBlob((jpegBlob) => {
              if (jpegBlob) resolve(jpegBlob);
              else reject(new Error('Fallo al exportar el recorte.'));
            }, 'image/jpeg', 0.85);
          },
          'image/webp',
          0.85
        );
      });

      await onApply(croppedBlob);
    } catch (err: any) {
      console.error('[InlineImageCropper] Error recortando:', err);
      toast.error(err.message || 'Error al aplicar el recorte');
      setIsApplying(false);
    }
  };

  return (
    <div className="relative flex flex-col w-full select-none clear-both my-2">
      {/* Contenedor del área de recorte inline con overlay oscuro */}
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-lg border-2 border-dashed border-accent/70 shadow-lg bg-black/40 touch-none max-w-full"
      >
        <img
          ref={imgRef}
          src={src}
          alt={alt || 'Imagen en recorte'}
          draggable={false}
          onLoad={() => setImageLoaded(true)}
          className="w-full h-auto block select-none pointer-events-none opacity-90"
        />

        {imageLoaded && (
          <>
            {/* Caja de recorte (Bounding Box) con box-shadow masivo para oscurecer el exterior */}
            <div
              style={{
                left: `${crop.x * 100}%`,
                top: `${crop.y * 100}%`,
                width: `${crop.w * 100}%`,
                height: `${crop.h * 100}%`,
                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.62)',
              }}
              className="absolute border-2 border-white shadow-xl cursor-move z-20 group"
              onPointerDown={(e) => handlePointerDown(e, 'move')}
            >
              {/* Cuadrícula de tercios (Rule-of-thirds) */}
              <div className="w-full h-full grid grid-cols-3 grid-rows-3 pointer-events-none opacity-40 group-hover:opacity-75 transition-opacity">
                <div className="border-r border-b border-white/40" />
                <div className="border-r border-b border-white/40" />
                <div className="border-b border-white/40" />
                <div className="border-r border-b border-white/40" />
                <div className="border-r border-b border-white/40" />
                <div className="border-b border-white/40" />
                <div className="border-r border-white/40" />
                <div className="border-r border-white/40" />
                <div />
              </div>

              {/* Manijas de esquina */}
              <div
                className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-white border-2 border-accent rounded-full shadow-md cursor-nwse-resize z-30"
                onPointerDown={(e) => handlePointerDown(e, 'nw')}
              />
              <div
                className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-white border-2 border-accent rounded-full shadow-md cursor-nesw-resize z-30"
                onPointerDown={(e) => handlePointerDown(e, 'ne')}
              />
              <div
                className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 bg-white border-2 border-accent rounded-full shadow-md cursor-nesw-resize z-30"
                onPointerDown={(e) => handlePointerDown(e, 'sw')}
              />
              <div
                className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-white border-2 border-accent rounded-full shadow-md cursor-nwse-resize z-30"
                onPointerDown={(e) => handlePointerDown(e, 'se')}
              />

              {/* Manijas de borde medio */}
              <div
                className="absolute -top-1 left-1/2 -translate-x-1/2 w-6 h-1.5 bg-white/90 border border-slate-700 rounded-full shadow-sm cursor-ns-resize z-30"
                onPointerDown={(e) => handlePointerDown(e, 'n')}
              />
              <div
                className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-6 h-1.5 bg-white/90 border border-slate-700 rounded-full shadow-sm cursor-ns-resize z-30"
                onPointerDown={(e) => handlePointerDown(e, 's')}
              />
              <div
                className="absolute top-1/2 -left-1 -translate-y-1/2 w-1.5 h-6 bg-white/90 border border-slate-700 rounded-full shadow-sm cursor-ew-resize z-30"
                onPointerDown={(e) => handlePointerDown(e, 'w')}
              />
              <div
                className="absolute top-1/2 -right-1 -translate-y-1/2 w-1.5 h-6 bg-white/90 border border-slate-700 rounded-full shadow-sm cursor-ew-resize z-30"
                onPointerDown={(e) => handlePointerDown(e, 'e')}
              />
            </div>
          </>
        )}
      </div>

      {/* Barra de control inline (debajo de la foto) */}
      <div className="flex flex-wrap items-center justify-between gap-2 mt-2 px-3 py-2 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-zinc-800 text-slate-800 dark:text-zinc-100 rounded-xl shadow-xl text-xs select-none z-30">
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-veyra-muted font-medium mr-1 flex items-center gap-1">
            <Crop className="w-3.5 h-3.5 text-accent" /> Recorte:
          </span>
          {RATIO_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSetRatio(preset.value)}
              className={cn(
                'px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer',
                selectedRatio === preset.value
                  ? 'bg-accent text-white font-semibold shadow-xs'
                  : 'text-veyra-muted hover:text-veyra-text hover:bg-black/5 dark:hover:bg-white/5'
              )}
            >
              {preset.label}
            </button>
          ))}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleResetCrop}
            title="Restablecer recorte completo"
            className="p-1 rounded-md text-veyra-muted hover:text-veyra-text hover:bg-black/5 dark:hover:bg-white/5 ml-1 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        </div>

        <div className="w-[1px] h-4 bg-veyra-border mx-1 hidden sm:block" />

        <div className="flex items-center gap-1.5 ml-auto">
          <button
            type="button"
            disabled={isApplying}
            onMouseDown={(e) => e.preventDefault()}
            onClick={onCancel}
            title="Cancelar recorte (Esc)"
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-veyra-text transition-colors cursor-pointer disabled:opacity-40"
          >
            <X className="w-3.5 h-3.5" />
            <span>Cancelar</span>
          </button>
          <button
            type="button"
            disabled={isApplying}
            onMouseDown={(e) => e.preventDefault()}
            onClick={executeCrop}
            title="Aplicar recorte (Enter)"
            className="flex items-center gap-1 px-3 py-1 rounded-lg bg-accent hover:bg-accent/90 text-white font-semibold transition-colors cursor-pointer shadow-xs disabled:opacity-40"
          >
            {isApplying ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            <span>{isApplying ? 'Guardando...' : 'Aplicar'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
