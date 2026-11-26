import React, { useRef, useState } from 'react';
import { Check, Trash2 } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface SwipeableCardProps {
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
  rightLabel?: string;
  leftLabel?: string;
  onTap: () => void;
  className?: string;
  children: React.ReactNode;
}

const SWIPE_THRESHOLD = 72;

export const SwipeableCard: React.FC<SwipeableCardProps> = ({
  onSwipeRight,
  onSwipeLeft,
  rightLabel = 'Completar',
  leftLabel = 'Eliminar',
  onTap,
  className,
  children,
}) => {
  const [offsetX, setOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startRef = useRef<{ x: number; y: number; locked: 'h' | 'v' | null; moved: boolean }>({
    x: 0,
    y: 0,
    locked: null,
    moved: false,
  });

  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    startRef.current = { x: t.clientX, y: t.clientY, locked: null, moved: false };
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const t = e.touches[0];
    const dx = t.clientX - startRef.current.x;
    const dy = t.clientY - startRef.current.y;

    if (!startRef.current.locked) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      startRef.current.locked = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
    }

    if (startRef.current.locked !== 'h') return;
    startRef.current.moved = true;

    let clamped = dx;
    if (!onSwipeRight && clamped > 0) clamped = 0;
    if (!onSwipeLeft && clamped < 0) clamped = 0;
    clamped = Math.max(-130, Math.min(130, clamped));
    setOffsetX(clamped);
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    if (offsetX >= SWIPE_THRESHOLD && onSwipeRight) {
      onSwipeRight();
    } else if (offsetX <= -SWIPE_THRESHOLD && onSwipeLeft) {
      onSwipeLeft();
    }
    setOffsetX(0);
  };

  return (
    <div className={cn('relative overflow-hidden select-none', className ?? 'rounded-2xl')}>
      {/* Background Action Reveals */}
      <div className="absolute inset-0 flex items-center justify-between px-4 pointer-events-none">
        <div
          className={cn(
            'flex items-center gap-1.5 text-xs font-semibold transition-opacity',
            offsetX > 12 ? 'opacity-100 text-emerald-400' : 'opacity-0'
          )}
        >
          <Check className="w-4 h-4" />
          <span>{rightLabel}</span>
        </div>
        <div
          className={cn(
            'flex items-center gap-1.5 text-xs font-semibold transition-opacity ml-auto',
            offsetX < -12 ? 'opacity-100 text-rose-400' : 'opacity-0'
          )}
        >
          <span>{leftLabel}</span>
          <Trash2 className="w-4 h-4" />
        </div>
      </div>

      {/* Background fill tint */}
      {offsetX !== 0 && (
        <div
          className={cn(
            'absolute inset-0 pointer-events-none transition-colors',
            offsetX > 0 ? 'bg-emerald-500/15' : 'bg-rose-500/15'
          )}
        />
      )}

      {/* Foreground Card */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onClick={() => {
          if (!startRef.current.moved) onTap();
        }}
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: isDragging ? 'none' : 'transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        }}
        className="relative z-10"
      >
        {children}
      </div>
    </div>
  );
};
