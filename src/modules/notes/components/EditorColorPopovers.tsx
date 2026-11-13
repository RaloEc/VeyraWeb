import React from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import { cn } from '../../../lib/utils';
import {
  TEXT_COLORS,
  HIGHLIGHT_COLORS,
  areColorsEqual,
} from '../constants/noteFonts';

export interface TextColorPopoverProps {
  isOpen: boolean;
  menuRef: React.RefObject<HTMLDivElement | null>;
  coords: { top: number; left: number };
  currentTextColor: string | null;
  recentColors?: string[];
  onSelectColor: (color: string) => void;
  onClose: () => void;
}

export const TextColorPopover: React.FC<TextColorPopoverProps> = ({
  isOpen,
  menuRef,
  coords,
  currentTextColor,
  recentColors = [],
  onSelectColor,
  onClose,
}) => {
  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        top: coords.top,
        left: coords.left,
        zIndex: 9999,
      }}
      className="p-2.5 rounded-xl bg-veyra-card/98 border border-veyra-border shadow-elevated min-w-[215px] animate-in fade-in zoom-in-95 duration-100 select-none text-xs backdrop-blur-md"
    >
      <div className="flex items-center justify-between px-1 mb-2">
        <span className="text-[11px] font-semibold text-veyra-text">
          Color de texto
        </span>
        {currentTextColor && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onSelectColor('default');
              onClose();
            }}
            className="text-[10px] text-accent hover:underline cursor-pointer"
          >
            Restablecer
          </button>
        )}
      </div>

      {/* Fila de colores recientes */}
      {recentColors.length > 0 && (
        <div className="mb-2.5 pb-2 border-b border-veyra-border">
          <div className="text-[10px] font-medium text-veyra-muted mb-1 px-0.5">
            Últimos usados
          </div>
          <div className="flex items-center gap-1.5 px-0.5">
            {recentColors.slice(0, 5).map((color) => {
              const isSelected = areColorsEqual(color, currentTextColor);
              return (
                <button
                  key={`recent-${color}`}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onSelectColor(color);
                    onClose();
                  }}
                  title={color}
                  className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center transition-transform hover:scale-110 cursor-pointer border',
                    isSelected
                      ? 'ring-2 ring-accent ring-offset-1 ring-offset-veyra-card border-transparent scale-105'
                      : 'border-veyra-border'
                  )}
                  style={{ backgroundColor: color }}
                >
                  {isSelected && (
                    <Check className="w-3 h-3 text-white drop-shadow-md stroke-[3]" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Cuadrícula estándar */}
      <div className="grid grid-cols-5 gap-1.5">
        {TEXT_COLORS.map((item) => {
          const isSelected =
            (item.color === 'default' && !currentTextColor) ||
            (item.color !== 'default' && areColorsEqual(item.color, currentTextColor));

          return (
            <button
              key={item.label}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onSelectColor(item.color);
                onClose();
              }}
              title={item.label}
              className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center transition-transform hover:scale-110 cursor-pointer border',
                isSelected
                  ? 'ring-2 ring-accent ring-offset-1 ring-offset-veyra-card border-transparent scale-105'
                  : 'border-veyra-border'
              )}
              style={{
                backgroundColor:
                  item.color === 'default'
                    ? 'transparent'
                    : item.preview,
              }}
            >
              {item.color === 'default' ? (
                <span className="text-[10px] font-bold text-veyra-text">A</span>
              ) : isSelected ? (
                <Check className="w-3.5 h-3.5 text-white drop-shadow-md stroke-[3]" />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>,
    document.body
  );
};

export interface HighlightColorPopoverProps {
  isOpen: boolean;
  menuRef: React.RefObject<HTMLDivElement | null>;
  coords: { top: number; left: number };
  currentHighlightColor: string | null;
  isHighlightActive: boolean;
  recentColors?: string[];
  onSelectColor: (color: string) => void;
  onClose: () => void;
}

export const HighlightColorPopover: React.FC<HighlightColorPopoverProps> = ({
  isOpen,
  menuRef,
  coords,
  currentHighlightColor,
  isHighlightActive,
  recentColors = [],
  onSelectColor,
  onClose,
}) => {
  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        top: coords.top,
        left: coords.left,
        zIndex: 9999,
      }}
      className="p-2.5 rounded-xl bg-veyra-card/98 border border-veyra-border shadow-elevated min-w-[200px] animate-in fade-in zoom-in-95 duration-100 select-none text-xs backdrop-blur-md"
    >
      <div className="flex items-center justify-between px-1 mb-2">
        <span className="text-[11px] font-semibold text-veyra-text">
          Marcatextos
        </span>
        {isHighlightActive && currentHighlightColor && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onSelectColor('transparent');
              onClose();
            }}
            className="text-[10px] text-accent hover:underline cursor-pointer"
          >
            Quitar
          </button>
        )}
      </div>

      {/* Fila de colores recientes */}
      {recentColors.length > 0 && (
        <div className="mb-2.5 pb-2 border-b border-veyra-border">
          <div className="text-[10px] font-medium text-veyra-muted mb-1 px-0.5">
            Últimos usados
          </div>
          <div className="flex items-center gap-1.5 px-0.5">
            {recentColors.slice(0, 5).map((color) => {
              const isSelected =
                isHighlightActive && areColorsEqual(color, currentHighlightColor);
              return (
                <button
                  key={`recent-hl-${color}`}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onSelectColor(color);
                    onClose();
                  }}
                  title="Reciente"
                  className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center transition-transform hover:scale-110 cursor-pointer border',
                    isSelected
                      ? 'ring-2 ring-accent ring-offset-1 ring-offset-veyra-card border-transparent scale-105'
                      : 'border-veyra-border'
                  )}
                  style={{ backgroundColor: color }}
                >
                  {isSelected && (
                    <Check className="w-3 h-3 text-black drop-shadow-sm stroke-[3]" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Cuadrícula estándar */}
      <div className="grid grid-cols-4 gap-1.5">
        {HIGHLIGHT_COLORS.map((item) => {
          const isSelected =
            (item.color === 'transparent' && (!isHighlightActive || !currentHighlightColor)) ||
            (item.color !== 'transparent' &&
              isHighlightActive &&
              areColorsEqual(item.color, currentHighlightColor));

          return (
            <button
              key={item.label}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onSelectColor(item.color);
                onClose();
              }}
              title={item.label}
              className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center transition-transform hover:scale-110 cursor-pointer border relative overflow-hidden',
                isSelected
                  ? 'ring-2 ring-accent ring-offset-1 ring-offset-veyra-card border-transparent scale-105'
                  : 'border-veyra-border'
              )}
              style={{
                backgroundColor:
                  item.color === 'transparent'
                    ? 'transparent'
                    : item.preview,
              }}
            >
              {item.color === 'transparent' ? (
                <span className="w-full h-[1.5px] bg-red-500 -rotate-45" />
              ) : isSelected ? (
                <Check className="w-3.5 h-3.5 text-black drop-shadow-sm stroke-[3]" />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>,
    document.body
  );
};

