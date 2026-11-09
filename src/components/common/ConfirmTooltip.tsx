import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface ConfirmTooltipProps {
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'auto';
  align?: 'start' | 'center' | 'end';
  danger?: boolean;
  disabled?: boolean;
  icon?: 'trash' | 'alert';
  children: React.ReactElement<{
    onClick?: React.MouseEventHandler;
    className?: string;
    ref?: React.Ref<HTMLElement>;
  }>;
}

export const ConfirmTooltip: React.FC<ConfirmTooltipProps> = ({
  title = '¿Eliminar elemento?',
  description,
  confirmText = 'Eliminar',
  cancelText = 'Cancelar',
  onConfirm,
  onCancel,
  placement = 'auto',
  align = 'end',
  danger = true,
  disabled = false,
  icon = 'trash',
  children,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  const triggerRef = useRef<HTMLElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const popoverWidth = popoverRef.current ? popoverRef.current.offsetWidth : 230;
    const popoverHeight = popoverRef.current ? popoverRef.current.offsetHeight : 100;
    const gap = 6;
    const margin = 10;

    let chosenPlacement = placement;
    if (chosenPlacement === 'auto') {
      const spaceBelow = window.innerHeight - triggerRect.bottom;
      const spaceAbove = triggerRect.top;
      chosenPlacement = spaceBelow < popoverHeight + gap && spaceAbove > spaceBelow ? 'top' : 'bottom';
    }

    let top = 0;
    if (chosenPlacement === 'top') {
      top = triggerRect.top - popoverHeight - gap;
    } else {
      top = triggerRect.bottom + gap;
    }

    // Vertical clamping
    if (top < margin) top = margin;
    if (top + popoverHeight > window.innerHeight - margin) {
      top = window.innerHeight - popoverHeight - margin;
    }

    let left = 0;
    if (align === 'start') {
      left = triggerRect.left;
    } else if (align === 'center') {
      left = triggerRect.left + triggerRect.width / 2 - popoverWidth / 2;
    } else {
      // 'end'
      left = triggerRect.right - popoverWidth;
    }

    // Horizontal clamping
    if (left < margin) left = margin;
    if (left + popoverWidth > window.innerWidth - margin) {
      left = window.innerWidth - popoverWidth - margin;
    }

    setCoords({ top, left });
  }, [placement, align]);

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (disabled || isLoading) return;
    setIsOpen(true);
  };

  const handleClose = useCallback(
    (e?: React.MouseEvent) => {
      if (e) {
        e.stopPropagation();
        e.preventDefault();
      }
      if (isLoading) return;
      setIsOpen(false);
      onCancel?.();
    },
    [isLoading, onCancel]
  );

  const handleConfirm = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (isLoading) return;

    try {
      setIsLoading(true);
      await onConfirm();
      setIsOpen(false);
    } catch (err) {
      console.error('Error executing confirmation action:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Reposition on mount or resize
  useLayoutEffect(() => {
    if (isOpen) {
      updatePosition();
    }
  }, [isOpen, updatePosition]);

  // Outside click & keydown listeners
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        handleClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    const handleScrollOrResize = () => {
      updatePosition();
    };

    window.addEventListener('mousedown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      window.removeEventListener('mousedown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen, handleClose, updatePosition]);

  // Clone children to attach triggerRef & onClick
  const triggerElement = React.cloneElement(children, {
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node;
      // Also forward if children already had a ref
      const childRef = (children as unknown as { ref?: React.Ref<HTMLElement> }).ref;
      if (typeof childRef === 'function') {
        childRef(node);
      } else if (childRef && typeof childRef === 'object') {
        (childRef as React.MutableRefObject<HTMLElement | null>).current = node;
      }
    },
    onClick: (e: React.MouseEvent) => {
      handleOpen(e);
    },
  });

  return (
    <>
      {triggerElement}
      {isOpen &&
        coords &&
        createPortal(
          <div
            ref={popoverRef}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              zIndex: 99999,
            }}
            className={cn(
              'w-[230px] rounded-lg p-2.5 select-none font-sans shadow-elevated border animate-in fade-in-0 zoom-in-95 duration-150',
              'bg-veyra-card text-veyra-text border-veyra-border shadow-xl shadow-black/20'
            )}
          >
            <div className="flex items-start gap-2">
              <div
                className={cn(
                  'w-5 h-5 rounded-[4px] flex items-center justify-center shrink-0 mt-0.5',
                  danger
                    ? 'bg-rose-500/15 text-rose-500 dark:text-rose-400'
                    : 'bg-amber-500/15 text-amber-500 dark:text-amber-400'
                )}
              >
                {icon === 'trash' ? (
                  <Trash2 className="w-3 h-3 stroke-[2.2]" />
                ) : (
                  <AlertTriangle className="w-3 h-3 stroke-[2.2]" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold leading-tight truncate text-veyra-text">{title}</div>
                {description && (
                  <div className="text-[10.5px] text-veyra-muted leading-snug mt-0.5">
                    {description}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-1.5 mt-2.5 pt-2 border-t border-veyra-border">
              <button
                type="button"
                disabled={isLoading}
                onClick={handleClose}
                className="px-2 py-1 rounded text-[11px] font-medium text-veyra-muted hover:text-veyra-text hover:bg-veyra-hover transition-colors cursor-pointer"
              >
                {cancelText}
              </button>

              <button
                type="button"
                disabled={isLoading}
                onClick={handleConfirm}
                className={cn(
                  'px-2.5 py-1 rounded text-[11px] font-semibold text-white transition-colors cursor-pointer flex items-center gap-1 shadow-xs',
                  danger
                    ? 'bg-rose-600 hover:bg-rose-700 disabled:bg-rose-600/50'
                    : 'bg-accent hover:opacity-90 disabled:opacity-50'
                )}
              >
                {isLoading && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                <span>{confirmText}</span>
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
