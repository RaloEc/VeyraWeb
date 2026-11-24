import React from 'react';
import { cn } from '../../../lib/utils';

interface WidgetCardProps {
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  iconClassName?: string;
  headerRight?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}

export const WidgetCard: React.FC<WidgetCardProps> = ({
  title,
  subtitle,
  icon,
  iconClassName,
  headerRight,
  footer,
  className,
  bodyClassName,
  children,
}) => {
  return (
    <section
      className={cn(
        'flex flex-col h-full min-h-0 overflow-hidden',
        className
      )}
    >
      {title && (
        <div className="flex items-center justify-between gap-2 pb-2.5 mb-2.5 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {icon && (
              <div
                className={cn(
                  'shrink-0 flex items-center justify-center',
                  iconClassName || 'text-accent'
                )}
              >
                {icon}
              </div>
            )}
            <div className="min-w-0 flex items-baseline gap-2">
              <h3 className="text-[13px] font-semibold text-veyra-text tracking-tight truncate leading-tight">
                {title}
              </h3>
              {subtitle && (
                <span className="text-[11px] text-veyra-muted truncate leading-tight hidden sm:inline">
                  {subtitle}
                </span>
              )}
            </div>
          </div>

          {headerRight && (
            <div className="shrink-0 flex items-center gap-1">
              {headerRight}
            </div>
          )}
        </div>
      )}

      <div className={cn('flex-1 min-h-0 flex flex-col overflow-hidden', bodyClassName)}>
        {children}
      </div>

      {footer && (
        <div className="mt-2.5 pt-2 border-t border-veyra-border/60 shrink-0">
          {footer}
        </div>
      )}
    </section>
  );
};
