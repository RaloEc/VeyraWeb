import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl';
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  className,
  maxWidth = 'md',
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const maxWidths = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl',
    '4xl': 'max-w-4xl',
    '5xl': 'max-w-5xl',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity duration-200"
        onClick={onClose}
      />

      {/* Modal Dialog Content */}
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative w-full bg-veyra-elevated border border-veyra-border rounded-xl shadow-elevated p-4 sm:p-6 z-10 transition-all duration-200 animate-in fade-in zoom-in-95 max-h-[92vh] flex flex-col',
          maxWidths[maxWidth],
          className
        )}
      >
        <div className="flex items-start justify-between mb-3 shrink-0">
          <div>
            {title && (
              <h3 className="text-lg font-semibold text-veyra-text tracking-tight">
                {title}
              </h3>
            )}
            {description && (
              <p className="text-xs text-veyra-muted mt-0.5">{description}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-veyra-muted hover:text-veyra-text p-1.5 rounded-lg hover:bg-veyra-card transition-colors duration-180 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 pr-1">{children}</div>
      </div>
    </div>
  );
};

