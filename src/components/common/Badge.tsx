import React from 'react';
import { cn } from '../../lib/utils';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'teal' | 'amber' | 'red' | 'neutral';
  size?: 'sm' | 'md';
  className?: string;
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  size = 'sm',
  className,
  dot,
}) => {
  const variants = {
    teal: 'bg-veyra-teal/10 text-teal-400 border-teal-500/25',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/25',
    red: 'bg-red-500/10 text-red-400 border-red-500/25',
    neutral: 'bg-veyra-card text-veyra-muted border-veyra-border',
  };

  const dotColors = {
    teal: 'bg-teal-400',
    amber: 'bg-amber-400',
    red: 'bg-red-400',
    neutral: 'bg-veyra-muted',
  };

  const sizes = {
    sm: 'text-[11px] px-2 py-0.5 rounded-pill gap-1.5',
    md: 'text-xs px-2.5 py-1 rounded-pill gap-1.5',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center font-medium border select-none',
        variants[variant],
        sizes[size],
        className
      )}
    >
      {dot && (
        <span
          className={cn('w-1.5 h-1.5 rounded-full animate-pulse', dotColors[variant])}
        />
      )}
      {children}
    </span>
  );
};

