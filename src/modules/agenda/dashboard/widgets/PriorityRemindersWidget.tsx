import React from 'react';
import { CheckCircle2, AlertCircle, Plus, Check } from 'lucide-react';
import { cn, parseSubtasks } from '../../../../lib/utils';
import type { Reminder } from '../../../../types/reminders';

interface PriorityRemindersWidgetProps {
  todayReminders: Reminder[];
  allReminders: Reminder[];
  onToggleReminder: (id: string, currentStatus: string) => void;
  onSelectReminder: (reminderId: string) => void;
  onOpenNewReminder: () => void;
}

function formatReminderTime(ms: number): string {
  const d = new Date(ms);
  const hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'p.m.' : 'a.m.';
  const h12 = hours % 12 || 12;
  return `${h12}:${minutes} ${ampm}`;
}

export const PriorityRemindersWidget: React.FC<PriorityRemindersWidgetProps> = ({
  todayReminders,
  allReminders,
  onToggleReminder,
  onSelectReminder,
  onOpenNewReminder,
}) => {
  // Combine today reminders and pending reminders sorted by priority
  const activeReminders = React.useMemo(() => {
    const map = new Map<string, Reminder>();
    todayReminders.forEach((r) => map.set(r.id, r));
    allReminders.forEach((r) => {
      if (r.status !== 'completed' && !map.has(r.id)) {
        if (r.due_date_ms < Date.now() || r.priority === 3 || r.control_level === 'critical') {
          map.set(r.id, r);
        }
      }
    });

    const list = Array.from(map.values());

    return list.sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === 'completed' ? 1 : -1;
      }
      const aWeight = (a.priority || 1) + (a.control_level === 'critical' ? 10 : 0);
      const bWeight = (b.priority || 1) + (b.control_level === 'critical' ? 10 : 0);
      if (aWeight !== bWeight) return bWeight - aWeight;
      return a.due_date_ms - b.due_date_ms;
    });
  }, [todayReminders, allReminders]);

  const completedCount = activeReminders.filter((r) => r.status === 'completed').length;

  return (
    <div className="flex flex-col h-full rounded-xl bg-veyra-card border border-veyra-border p-3.5 sm:p-4 shadow-xs min-h-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between pb-2.5 border-b border-veyra-border/60 mb-2.5 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs sm:text-sm font-semibold text-veyra-text tracking-tight truncate">
              Recordatorios
            </h3>
            <p className="text-[10px] sm:text-[11px] text-veyra-muted truncate">
              {completedCount}/{activeReminders.length} listos
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenNewReminder}
          title="Nuevo recordatorio"
          className="p-1 rounded-md text-veyra-muted hover:text-veyra-text hover:bg-veyra-elevated transition-colors cursor-pointer shrink-0 ml-1"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pr-1 space-y-1.5 min-h-0 custom-scrollbar">
        {activeReminders.length === 0 ? (
          <div className="h-full min-h-[100px] flex flex-col items-center justify-center text-center p-3">
            <div className="w-8 h-8 rounded-full bg-veyra-elevated text-veyra-muted flex items-center justify-center mb-1.5 shrink-0">
              <Check className="w-4 h-4 text-emerald-400 opacity-70" />
            </div>
            <p className="text-xs font-medium text-veyra-text">Al día con tus tareas</p>
            <p className="text-[10px] text-veyra-muted mt-0.5 max-w-[180px] line-clamp-2">
              No tienes recordatorios prioritarios pendientes.
            </p>
            <button
              type="button"
              onClick={onOpenNewReminder}
              className="mt-2 text-[11px] font-medium text-accent hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>Añadir tarea</span>
            </button>
          </div>
        ) : (
          activeReminders.map((reminder) => {
            const isCompleted = reminder.status === 'completed';
            const isOverdue = !isCompleted && reminder.due_date_ms < Date.now();
            const isCritical = reminder.control_level === 'critical' || reminder.priority === 3;
            const subtasks = parseSubtasks(reminder.subtasks);
            const doneSubtasks = subtasks.filter((s: any) => s.completed || s.is_completed).length;

            return (
              <div
                key={reminder.id}
                className={cn(
                  'group flex items-start gap-2 p-2 sm:p-2.5 rounded-lg border transition-all min-w-0',
                  isCompleted
                    ? 'bg-veyra-elevated/40 border-veyra-border/50 opacity-50'
                    : 'bg-veyra-elevated/80 border-veyra-border hover:border-accent/40'
                )}
              >
                {/* Checkbox */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleReminder(reminder.id, reminder.status || 'pending');
                  }}
                  className={cn(
                    'mt-0.5 w-4 h-4 rounded flex items-center justify-center transition-colors shrink-0 cursor-pointer',
                    isCompleted
                      ? 'bg-emerald-500 text-white'
                      : 'border border-veyra-border hover:border-accent text-transparent hover:text-accent/40'
                  )}
                >
                  <Check className="w-3 h-3 stroke-[3]" />
                </button>

                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => onSelectReminder(reminder.id)}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <p
                      className={cn(
                        'text-xs font-medium truncate flex-1',
                        isCompleted ? 'line-through text-veyra-muted' : 'text-veyra-text'
                      )}
                    >
                      {reminder.title}
                    </p>
                    {isCritical && !isCompleted && (
                      <span title="Alta prioridad" className="flex items-center shrink-0">
                        <AlertCircle className="w-3 h-3 text-rose-400 shrink-0" />
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-veyra-muted flex-wrap">
                    <span className={cn('font-mono truncate', isOverdue ? 'text-rose-400 font-semibold' : '')}>
                      {isOverdue ? 'Vencido: ' : ''}
                      {formatReminderTime(reminder.due_date_ms)}
                    </span>
                    {subtasks.length > 0 && (
                      <span className="text-veyra-subtle">
                        • {doneSubtasks}/{subtasks.length} sub
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
