import React from 'react';
import type { ReminderFilterTab } from '../../types/reminders';
import { cn } from '../../lib/utils';

export interface ReminderFiltersProps {
  currentTab: ReminderFilterTab;
  onTabChange: (tab: ReminderFilterTab) => void;
  counts: {
    today: number;
    upcoming: number;
    completed: number;
    all: number;
  };
}

export const ReminderFilters: React.FC<ReminderFiltersProps> = ({
  currentTab,
  onTabChange,
  counts,
}) => {
  const tabs: { id: ReminderFilterTab; label: string; count: number }[] = [
    { id: 'today', label: 'Hoy', count: counts.today },
    { id: 'upcoming', label: 'Próximos', count: counts.upcoming },
    { id: 'completed', label: 'Completados', count: counts.completed },
    { id: 'all', label: 'Todos', count: counts.all },
  ];

  return (
    <div className="flex items-center gap-6 overflow-x-auto select-none border-b border-veyra-border">
      {tabs.map((tab) => {
        const isActive = currentTab === tab.id;

        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              'relative pb-2.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5',
              isActive
                ? 'text-veyra-text font-semibold'
                : 'text-veyra-muted hover:text-veyra-text'
            )}
          >
            <span>{tab.label}</span>
            {tab.count > 0 && tab.id === 'today' && (
              <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
            )}
            {isActive && (
              <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-accent rounded-full" />
            )}
          </button>
        );
      })}
    </div>
  );
};
