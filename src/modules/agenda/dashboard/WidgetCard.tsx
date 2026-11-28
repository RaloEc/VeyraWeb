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
        'flex flex-col min-h-0',
        className
      )}
    >
      {title && (
        <div className="flex items-center justify-between gap-3 pb-3 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {icon && (
              <div
                className={cn(
                  'shrink-0 flex items-center justify-center',
                  iconClassName || 'text-veyra-muted'
                )}
              >
                {icon}
              </div>
            )}
            <div className="min-w-0 flex items-baseline gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-veyra-muted truncate leading-tight">
                {title}
              </h3>
              {subtitle && (
                <span className="text-[11px] text-veyra-subtle truncate leading-tight hidden sm:inline">
                  {subtitle}
                </span>
              )}
            </div>
          </div>

          {headerRight && (
            <div className="shrink-0 flex items-center gap-1.5">
              {headerRight}
            </div>
          )}
        </div>
      )}

      <div className={cn('flex-1 min-h-0 flex flex-col', bodyClassName)}>
        {children}
      </div>

      {footer && (
        <div className="pt-2.5 mt-2 shrink-0">
          {footer}
        </div>
      )}
    </section>
  );
};
