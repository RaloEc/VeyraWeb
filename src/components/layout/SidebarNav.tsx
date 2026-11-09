import React from 'react';
import { CheckSquare, FileText } from 'lucide-react';
import { cn } from '../../lib/utils';

export type ActiveModule = 'reminders' | 'notes';

export interface SidebarNavProps {
  activeModule: ActiveModule;
  onChangeModule: (module: ActiveModule) => void;
  pendingRemindersCount?: number;
  notesCount?: number;
}

export const SidebarNav: React.FC<SidebarNavProps> = ({
  activeModule,
  onChangeModule,
  pendingRemindersCount = 0,
  notesCount = 0,
}) => {
  const navItems = [
    {
      id: 'reminders' as ActiveModule,
      label: 'Recordatorios',
      icon: CheckSquare,
      count: pendingRemindersCount,
      badgeColor: 'teal',
    },
    {
      id: 'notes' as ActiveModule,
      label: 'Notas & Docs',
      icon: FileText,
      count: notesCount,
      badgeColor: 'neutral',
    },
  ];

  return (
    <aside className="w-full md:w-60 bg-veyra-card/50 border-r border-veyra-border p-3 flex md:flex-col justify-between shrink-0">
      <div className="flex md:flex-col gap-1.5 w-full">
        <div className="hidden md:block px-3 py-2 text-[11px] font-semibold text-veyra-subtle uppercase tracking-wider">
          Módulos
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeModule === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onChangeModule(item.id)}
              className={cn(
                'flex items-center justify-between w-full px-3.5 py-2.5 rounded-md text-sm font-medium transition-all duration-180 group',
                isActive
                  ? 'bg-veyra-elevated text-veyra-text border border-veyra-border shadow-sm'
                  : 'text-veyra-muted hover:text-veyra-text hover:bg-veyra-card'
              )}
            >
              <div className="flex items-center gap-3">
                <Icon
                  className={cn(
                    'w-4 h-4 transition-colors duration-180',
                    isActive ? 'text-teal-400' : 'text-veyra-subtle group-hover:text-veyra-muted'
                  )}
                />
                <span>{item.label}</span>
              </div>
              {item.count > 0 && (
                <span
                  className={cn(
                    'text-[11px] px-2 py-0.5 rounded-pill font-semibold',
                    isActive
                      ? 'bg-veyra-teal/15 text-teal-300'
                      : 'bg-veyra-elevated text-veyra-subtle'
                  )}
                >
                  {item.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="hidden md:block p-3 rounded-lg bg-veyra-elevated/40 border border-veyra-border text-xs text-veyra-muted">
        <div className="flex items-center gap-2 mb-1 text-veyra-text font-medium">
          <div className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
          Sincronizado
        </div>
        <p className="text-[11px] text-veyra-subtle leading-relaxed">
          Los cambios se sincronizan en 0 ms con tu app móvil de Veyra.
        </p>
      </div>
    </aside>
  );
};

