import React, { useState } from 'react';
import {
  Check,
  Clock,
  CheckSquare,
  Repeat,
  Paperclip,
  Users,
  FileText,
  Calendar,
  CalendarPlus,
  Trash2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { Reminder } from '../../types/reminders';
import { parseSubtasks, cn } from '../../lib/utils';
import { useTheme } from '../../theme/ThemeProvider';
import { ConfirmTooltip } from '../../components/common/ConfirmTooltip';

export interface ReminderCardProps {
  reminder: Reminder;
  onToggle: (id: string, currentStatus: string | null) => void;
  onToggleSubtask?: (reminderId: string, subtaskId: string) => void;
  onEdit?: (reminder: Reminder, e?: React.MouseEvent) => void;
  onDoubleClick?: (reminder: Reminder) => void;
  onDelete?: (id: string) => void;
  onSnooze?: (id: string, minutes?: number) => void;
  onSelectNote?: (noteId: string) => void;
  linkedNoteTitle?: string;
  linkedNoteId?: string;
  linkedEventTitle?: string;
  linkedEventColor?: string;
  linkedEventId?: string;
  onSelectEvent?: (eventId: string) => void;
  isSelected?: boolean;
}

function getTimeStatus(dueDateMs: number, isCompleted: boolean, snoozeUntilMs?: number | null) {
  const now = Date.now();
  if (snoozeUntilMs && snoozeUntilMs > now && !isCompleted) {
    const d = new Date(snoozeUntilMs);
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    const diffMs = snoozeUntilMs - now;
    const mins = Math.max(1, Math.round(diffMs / 60000));
    return {
      timeStr,
      label: `• Pospuesto (${mins}m)`,
      color: 'text-amber-400',
    };
  }

  if (!dueDateMs) return null;
  const diffMs = dueDateMs - now;

  const d = new Date(dueDateMs);
  const nowDate = new Date();
  const isToday =
    d.getDate() === nowDate.getDate() &&
    d.getMonth() === nowDate.getMonth() &&
    d.getFullYear() === nowDate.getFullYear();

  let datePrefix = '';
  if (!isToday) {
    const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    datePrefix = `${d.getDate()} ${months[d.getMonth()]} • `;
  }

  const timeStr = `${datePrefix}${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}`;

  if (isCompleted) {
    return {
      timeStr,
      label: '• Hecho',
      color: 'text-slate-400 dark:text-zinc-500',
    };
  }

  if (diffMs < 0) {
    return { timeStr, label: '• Vencido', color: 'text-[#FB7185]' };
  }

  if (diffMs <= 60 * 60 * 1000) {
    const mins = Math.max(1, Math.round(diffMs / 60000));
    return { timeStr, label: `• En ${mins}m`, color: 'text-[#FBBF24]' };
  }

  const hours = Math.round(diffMs / (60 * 60 * 1000));
  if (hours < 24) {
    return {
      timeStr,
      label: `• En ${hours}h`,
      color: 'text-slate-500 dark:text-zinc-400',
    };
  }

  const days = Math.round(diffMs / (24 * 60 * 60 * 1000));
  return {
    timeStr,
    label: `• En ${days}d`,
    color: 'text-slate-500 dark:text-zinc-400',
  };
}

export const ReminderCard: React.FC<ReminderCardProps> = ({
  reminder,
  onToggle,
  onToggleSubtask,
  onEdit,
  onDoubleClick,
  onDelete,
  onSnooze,
  onSelectNote,
  linkedNoteTitle,
  linkedNoteId,
  linkedEventTitle,
  linkedEventColor,
  linkedEventId,
  onSelectEvent,
  isSelected,
}) => {
  const { palette } = useTheme();
  const [isSubtasksExpanded, setIsSubtasksExpanded] = useState(false);
  const [showSnoozeMenu, setShowSnoozeMenu] = useState(false);

  const isCompleted = reminder.status === 'completed';

  // Subtasks
  const subtasks = parseSubtasks(reminder.subtasks);
  const hasSubtasks = subtasks.length > 0;
  const completedSubtasksCount = subtasks.filter((s) => s.completed).length;

  // Attachments parsing
  const attachmentsCount = (() => {
    const raw = (reminder as unknown as { attachments?: unknown }).attachments;
    if (!raw) return 0;
    if (Array.isArray(raw)) return raw.length;
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.length : 1;
      } catch {
        return 1;
      }
    }
    return 0;
  })();

  // Shared status
  const isShared =
    (reminder as unknown as { is_shared?: number }).is_shared === 1 ||
    !!(reminder as unknown as { shared_owner_id?: string }).shared_owner_id;

  // Priority classification
  const isCritical = reminder.control_level === 'critical' || reminder.priority === 3;
  const isStrict = reminder.control_level === 'strict' || reminder.priority === 2;

  const timeStatus = getTimeStatus(reminder.due_date_ms, isCompleted, reminder.snooze_until_ms);
  const hasChips = Boolean(
    hasSubtasks ||
      reminder.repeat_rule ||
      attachmentsCount > 0 ||
      linkedNoteTitle ||
      linkedNoteId ||
      linkedEventTitle ||
      linkedEventId
  );

  return (
    <div
      onClick={(e) => onEdit?.(reminder, e)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick?.(reminder);
      }}
      className={cn(
        'group relative py-2 px-2.5 rounded-lg transition-all cursor-pointer select-none flex items-stretch gap-2.5 border w-full max-w-full overflow-hidden',
        'bg-white dark:bg-veyra-card [.amoled_&]:bg-black',
        'border-slate-200/80 dark:border-veyra-border [.amoled_&]:border-white/[0.1]',
        'hover:border-slate-300 dark:hover:border-white/20 hover:bg-slate-50/50 dark:hover:bg-white/[0.02]',
        isSelected && 'ring-1 ring-accent border-accent/40',
        isCompleted && 'opacity-55'
      )}
    >
      {/* Main Body Content */}
      <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5 overflow-hidden">
        {/* Row 1: Checkbox + Title + Priority tag + Users + Hover Actions */}
        <div className="flex items-center justify-between gap-1.5 min-w-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {/* Checkbox circular interactivo */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggle(reminder.id, reminder.status || 'pending');
              }}
              className={cn(
                'w-4 h-4 rounded-full border-[1.5px] flex items-center justify-center transition-all cursor-pointer shrink-0',
                isCompleted
                  ? 'bg-accent border-accent text-white shadow-xs'
                  : isCritical
                  ? 'border-rose-400/90 hover:border-rose-500 bg-rose-500/10'
                  : isStrict
                  ? 'border-amber-400/90 hover:border-amber-500 bg-amber-500/10'
                  : 'border-slate-300 dark:border-white/30 hover:border-accent bg-transparent'
              )}
              title={isCompleted ? 'Marcar como pendiente' : 'Marcar como completado'}
            >
              {isCompleted && (
                <Check className="w-2.5 h-2.5 stroke-[3.5]" />
              )}
            </button>

            {/* Title */}
            <span
              className={cn(
                'text-[12.5px] font-semibold text-slate-800 dark:text-zinc-100 truncate leading-tight',
                isCompleted && 'line-through text-slate-400 dark:text-zinc-500'
              )}
            >
              {reminder.title}
            </span>

            {/* Priority Micro-Badge */}
            {isCritical && !isCompleted && (
              <span className="px-1 py-0.2 rounded text-[8px] font-extrabold uppercase tracking-wider bg-rose-500/15 text-rose-400 border border-rose-500/25 shrink-0">
                Alta
              </span>
            )}
            {isStrict && !isCompleted && (
              <span className="px-1 py-0.2 rounded text-[8px] font-extrabold uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/25 shrink-0">
                Media
              </span>
            )}

            {/* Shared Icon */}
            {isShared && (
              <span title="Compartido" className="inline-flex items-center shrink-0">
                <Users
                  className="w-2.5 h-2.5 text-accent"
                  style={{ color: palette.primary }}
                />
              </span>
            )}
          </div>

          {/* Quick Actions on Hover */}
          <div className="hidden group-hover:flex items-center gap-0.5 shrink-0 relative">
            {onSnooze && !isCompleted && (
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowSnoozeMenu((prev) => !prev);
                  }}
                  title="Posponer"
                  className="p-0.5 rounded text-slate-400 hover:text-accent transition-colors"
                >
                  <CalendarPlus className="w-2.5 h-2.5" />
                </button>

                {showSnoozeMenu && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-full mt-1 z-30 bg-veyra-card border border-veyra-border rounded-lg shadow-elevated p-1 min-w-[110px] space-y-0.5 text-[11px] animate-fade-in"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onSnooze(reminder.id, 15);
                        setShowSnoozeMenu(false);
                      }}
                      className="w-full text-left px-2 py-1 rounded hover:bg-white/5 hover:text-accent text-veyra-text transition-colors"
                    >
                      +15 minutos
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onSnooze(reminder.id, 60);
                        setShowSnoozeMenu(false);
                      }}
                      className="w-full text-left px-2 py-1 rounded hover:bg-white/5 hover:text-accent text-veyra-text transition-colors"
                    >
                      +1 hora
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onSnooze(reminder.id, 180);
                        setShowSnoozeMenu(false);
                      }}
                      className="w-full text-left px-2 py-1 rounded hover:bg-white/5 hover:text-accent text-veyra-text transition-colors"
                    >
                      +3 horas
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onSnooze(reminder.id, 1440);
                        setShowSnoozeMenu(false);
                      }}
                      className="w-full text-left px-2 py-1 rounded hover:bg-white/5 hover:text-accent text-veyra-text transition-colors"
                    >
                      Mañana (+24h)
                    </button>
                  </div>
                )}
              </div>
            )}

            {onDelete && (
              <ConfirmTooltip
                title="¿Eliminar recordatorio?"
                description={`"${reminder.title}"`}
                confirmText="Eliminar"
                onConfirm={() => onDelete(reminder.id)}
              >
                <button
                  type="button"
                  title="Eliminar"
                  className="p-0.5 rounded text-slate-400 hover:text-rose-500 transition-colors"
                >
                  <Trash2 className="w-2.5 h-2.5" />
                </button>
              </ConfirmTooltip>
            )}
          </div>
        </div>

        {/* Row 2: Clock & Full Status (unclipped) */}
        <div className="flex items-center gap-1.5 text-[10.5px] text-slate-600 dark:text-zinc-300 font-mono leading-none min-w-0 flex-wrap">
          {timeStatus ? (
            <div className="flex items-center gap-1 shrink-0">
              <Clock className="w-2.5 h-2.5 text-slate-400 dark:text-zinc-500 shrink-0" />
              <span className="whitespace-nowrap font-medium">{timeStatus.timeStr}</span>
              <span className={cn('text-[9.5px] font-sans font-medium whitespace-nowrap', timeStatus.color)}>
                {timeStatus.label}
              </span>
            </div>
          ) : (
            <span className="text-slate-400 dark:text-zinc-500 text-[9.5px] font-sans">Sin hora</span>
          )}
        </div>

        {/* Row 3: Chips that wrap onto next line when space is constrained */}
        {hasChips && (
          <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
            {hasSubtasks && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsSubtasksExpanded(!isSubtasksExpanded);
                }}
                title={`Subtareas: ${completedSubtasksCount}/${subtasks.length}`}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-sans text-slate-600 dark:text-zinc-300 bg-black/5 dark:bg-white/[0.06] border border-black/5 dark:border-white/[0.08] hover:border-accent/40 cursor-pointer"
              >
                <CheckSquare className="w-2.5 h-2.5 text-accent" />
                <span>{completedSubtasksCount}/{subtasks.length}</span>
                {isSubtasksExpanded ? (
                  <ChevronUp className="w-2 h-2 opacity-60" />
                ) : (
                  <ChevronDown className="w-2 h-2 opacity-60" />
                )}
              </button>
            )}

            {reminder.repeat_rule && (
              <span
                title="Repetir"
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-sans text-slate-600 dark:text-zinc-300 bg-black/5 dark:bg-white/[0.06] border border-black/5 dark:border-white/[0.08] shrink-0"
              >
                <Repeat className="w-2.5 h-2.5 text-accent shrink-0" />
                <span>Repetir</span>
              </span>
            )}

            {attachmentsCount > 0 && (
              <span
                title={`Adjuntos: ${attachmentsCount}`}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-sans text-slate-600 dark:text-zinc-300 bg-black/5 dark:bg-white/[0.06] border border-black/5 dark:border-white/[0.08] shrink-0"
              >
                <Paperclip className="w-2.5 h-2.5 text-slate-400 dark:text-zinc-400 shrink-0" />
                <span>{attachmentsCount}</span>
              </span>
            )}

            {(linkedNoteTitle || linkedNoteId) && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (linkedNoteId && onSelectNote) {
                    onSelectNote(linkedNoteId);
                  }
                }}
                title={linkedNoteTitle ? `Nota: ${linkedNoteTitle}` : 'Abrir nota vinculada'}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-sans text-slate-600 dark:text-zinc-300 bg-black/5 dark:bg-white/[0.06] border border-black/5 dark:border-white/[0.08] hover:border-accent hover:text-accent transition-colors max-w-full truncate cursor-pointer"
              >
                <FileText className="w-2.5 h-2.5 text-accent shrink-0" />
                <span className="truncate">{linkedNoteTitle || 'Nota vinculada'}</span>
              </button>
            )}

            {(linkedEventTitle || linkedEventId) && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (linkedEventId) {
                    if (onSelectEvent) {
                      onSelectEvent(linkedEventId);
                    } else {
                      window.history.pushState({ type: 'event', id: linkedEventId }, '', `/events/${linkedEventId}`);
                      window.dispatchEvent(new PopStateEvent('popstate'));
                    }
                  }
                }}
                title={linkedEventTitle ? `Evento: ${linkedEventTitle}` : 'Abrir evento vinculado'}
                className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[9.5px] font-sans text-slate-600 dark:text-zinc-300 bg-black/5 dark:bg-white/[0.06] border border-black/5 dark:border-white/[0.08] hover:border-accent hover:text-accent transition-colors max-w-full truncate cursor-pointer"
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: linkedEventColor || palette.primary || '#3B82F6' }}
                />
                <Calendar className="w-2.5 h-2.5 text-accent shrink-0" />
                <span className="truncate">{linkedEventTitle || 'Evento asociado'}</span>
              </button>
            )}
          </div>
        )}

        {/* Expanded subtasks accordion if user explicitly clicked */}
        {hasSubtasks && isSubtasksExpanded && (
          <div className="pt-1.5 mt-1 border-t border-slate-200/50 dark:border-white/[0.06] space-y-1">
            {subtasks.map((st) => (
              <div
                key={st.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSubtask?.(reminder.id, st.id);
                }}
                className="flex items-center gap-1.5 text-[10px] text-slate-600 dark:text-zinc-300 hover:text-accent cursor-pointer py-0.5"
              >
                <div
                  className={cn(
                    'w-3 h-3 rounded-[3px] border flex items-center justify-center transition-colors shrink-0',
                    st.completed ? 'bg-accent border-accent text-white' : 'border-slate-300 dark:border-white/20'
                  )}
                >
                  {st.completed && <Check className="w-2 h-2 stroke-[3]" />}
                </div>
                <span className={cn('truncate', st.completed && 'line-through text-slate-400 dark:text-zinc-500')}>
                  {st.title}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
