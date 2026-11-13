import React, { useEffect, useRef, useState, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Calendar,
  Clock,
  MapPin,
  Repeat,
  FileText,
  Check,
  CheckSquare,
  Maximize2,
  X,
  ExternalLink,
  CalendarPlus,
} from 'lucide-react';
import type { Reminder, Subtask } from '../../types/reminders';
import type { CalendarEvent } from '../../hooks/useEvents';
import type { Note } from '../../types/notes';
import { cn, parseSubtasks } from '../../lib/utils';
import { useTheme } from '../../theme/ThemeProvider';

export interface AgendaQuickPreviewProps {
  item:
    | { type: 'reminder'; data: Reminder }
    | { type: 'event'; data: CalendarEvent };
  targetRect: DOMRect;
  onClose: () => void;
  onOpenFull: () => void;
  onToggleReminder?: (id: string, currentStatus: string | null) => void;
  onToggleSubtask?: (reminderId: string, subtaskId: string) => void;
  onSnoozeReminder?: (id: string, minutes: number) => void;
  onSnoozeEvent?: (id: string) => void;
  onSelectNote?: (noteId: string) => void;
  allNotes?: Note[];
}

function formatDuration(startMs: number, endMs: number): string {
  if (!startMs || !endMs || endMs <= startMs) return '';
  const diffMinutes = Math.round((endMs - startMs) / 60000);
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const hours = Math.floor(diffMinutes / 60);
  const remMinutes = diffMinutes % 60;
  return remMinutes > 0 ? `${hours}h ${remMinutes}m` : `${hours}h`;
}

function formatTimeRange(startMs: number, endMs: number): string {
  const s = Number(startMs);
  const e = Number(endMs);
  if (!s) return '';
  const start = new Date(s);
  const now = new Date();
  const isToday =
    start.getDate() === now.getDate() &&
    start.getMonth() === now.getMonth() &&
    start.getFullYear() === now.getFullYear();

  const startStr = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  let prefix = '';
  if (!isToday) {
    const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    prefix = `${start.getDate()} ${months[start.getMonth()]} • `;
  }

  if (!e || e <= s) return `${prefix}${startStr}`;
  const end = new Date(e);
  const endStr = end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${prefix}${startStr}–${endStr}`;
}

export const AgendaQuickPreview: React.FC<AgendaQuickPreviewProps> = ({
  item,
  targetRect,
  onClose,
  onOpenFull,
  onToggleReminder,
  onToggleSubtask,
  onSnoozeReminder,
  onSnoozeEvent,
  onSelectNote,
  allNotes = [],
}) => {
  const { palette } = useTheme();
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  const updatePosition = useCallback(() => {
    const popoverWidth = popoverRef.current ? popoverRef.current.offsetWidth : 320;
    const popoverHeight = popoverRef.current ? popoverRef.current.offsetHeight : 240;
    const gap = 10;
    const margin = 12;

    // Prefer positioning to the right of the sidebar card
    let left = targetRect.right + gap;
    if (left + popoverWidth > window.innerWidth - margin) {
      // If not enough room to the right, position to the left
      left = Math.max(margin, targetRect.left - popoverWidth - gap);
    }

    // Align vertically with target card, clamped inside window
    let top = targetRect.top;
    if (top + popoverHeight > window.innerHeight - margin) {
      top = Math.max(margin, window.innerHeight - popoverHeight - margin);
    }
    if (top < margin) {
      top = margin;
    }

    setCoords({ top, left });
  }, [targetRect]);

  useLayoutEffect(() => {
    updatePosition();
  }, [updatePosition]);

  // Outside click and ESC key listeners
  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popoverRef.current && !popoverRef.current.contains(target)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
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
  }, [onClose, updatePosition]);

  if (!coords) return null;

  const isReminder = item.type === 'reminder';
  const reminder = isReminder ? item.data : null;
  const event = !isReminder ? item.data : null;

  // Render for REMINDER
  const renderReminderContent = () => {
    if (!reminder) return null;
    const isCompleted = reminder.status === 'completed';
    const subtasks: Subtask[] = parseSubtasks(reminder.subtasks);
    const completedSubtasksCount = subtasks.filter((s) => s.completed).length;

    const isCritical = reminder.control_level === 'critical' || reminder.priority === 3;
    const isStrict = reminder.control_level === 'strict' || reminder.priority === 2;

    const dueDate = reminder.due_date_ms ? new Date(reminder.due_date_ms) : null;
    const formattedDue = dueDate
      ? dueDate.toLocaleString('es-ES', {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })
      : 'Sin fecha límite';

    const linkedNote = reminder.links
      ? allNotes.find((n) => reminder.links?.includes(n.id))
      : undefined;

    return (
      <div className="space-y-3">
        {/* Header: Checkbox + Title + Priority + Top Actions */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <button
              type="button"
              onClick={() => onToggleReminder?.(reminder.id, reminder.status || 'pending')}
              className={cn(
                'w-4 h-4 rounded-full border-[1.5px] flex items-center justify-center transition-all cursor-pointer shrink-0 mt-0.5',
                isCompleted
                  ? 'bg-accent border-accent text-white shadow-xs'
                  : isCritical
                  ? 'border-rose-400 bg-rose-500/10'
                  : isStrict
                  ? 'border-amber-400 bg-amber-500/10'
                  : 'border-slate-300 dark:border-white/30 hover:border-accent bg-transparent'
              )}
              title={isCompleted ? 'Marcar como pendiente' : 'Marcar como completado'}
            >
              {isCompleted && <Check className="w-2.5 h-2.5 stroke-[3.5]" />}
            </button>

            <div className="flex-1 min-w-0">
              <div
                className={cn(
                  'text-xs font-semibold text-veyra-text leading-snug break-words',
                  isCompleted && 'line-through text-veyra-muted'
                )}
              >
                {reminder.title}
              </div>

              {/* Priority badge */}
              <div className="flex items-center gap-1.5 mt-1">
                {isCritical && (
                  <span className="px-1.5 py-0.5 rounded text-[8.5px] font-bold uppercase tracking-wider bg-rose-500/15 text-rose-400 border border-rose-500/20">
                    Prioridad Alta
                  </span>
                )}
                {isStrict && (
                  <span className="px-1.5 py-0.5 rounded text-[8.5px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/20">
                    Prioridad Media
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onOpenFull}
              title="Abrir vista completa (Doble clic)"
              className="p-1 rounded-md text-veyra-muted hover:text-accent hover:bg-veyra-hover transition-colors cursor-pointer"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onClose}
              title="Cerrar vista previa (Esc)"
              className="p-1 rounded-md text-veyra-muted hover:text-veyra-text hover:bg-veyra-hover transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Due Date & Quick Snooze */}
        <div className="p-2 rounded-lg bg-veyra-elevated border border-veyra-borderSubtle flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-1.5 text-veyra-muted font-mono">
            <Clock className="w-3 h-3 text-veyra-subtle shrink-0" />
            <span className="text-veyra-text">{formattedDue}</span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onSnoozeReminder?.(reminder.id, 15)}
              className="px-1.5 py-0.5 rounded text-[10px] font-medium text-veyra-muted hover:text-accent hover:bg-veyra-hover border border-transparent hover:border-veyra-border transition-colors cursor-pointer"
              title="Posponer 15 min"
            >
              +15m
            </button>
            <button
              type="button"
              onClick={() => onSnoozeReminder?.(reminder.id, 60)}
              className="px-1.5 py-0.5 rounded text-[10px] font-medium text-veyra-muted hover:text-accent hover:bg-veyra-hover border border-transparent hover:border-veyra-border transition-colors cursor-pointer"
              title="Posponer 1 hora"
            >
              +1h
            </button>
            <button
              type="button"
              onClick={() => onSnoozeReminder?.(reminder.id, 24 * 60)}
              className="px-1.5 py-0.5 rounded text-[10px] font-medium text-veyra-muted hover:text-accent hover:bg-veyra-hover border border-transparent hover:border-veyra-border transition-colors cursor-pointer"
              title="Posponer 1 día"
            >
              +1d
            </button>
          </div>
        </div>

        {/* Subtasks (Interactive List) */}
        {subtasks.length > 0 && (
          <div className="space-y-1.5 pt-0.5">
            <div className="flex items-center justify-between text-[10.5px] font-medium text-veyra-muted">
              <span className="flex items-center gap-1">
                <CheckSquare className="w-3 h-3 text-accent" />
                Subtareas ({completedSubtasksCount}/{subtasks.length})
              </span>
              <span className="font-mono text-veyra-subtle text-[10px]">
                {Math.round((completedSubtasksCount / subtasks.length) * 100)}%
              </span>
            </div>

            <div className="max-h-32 overflow-y-auto space-y-1 pr-0.5">
              {subtasks.map((st) => (
                <div
                  key={st.id}
                  onClick={() => onToggleSubtask?.(reminder.id, st.id)}
                  className="flex items-center gap-2 p-1.5 rounded-md bg-veyra-elevated border border-veyra-borderSubtle text-[11px] hover:border-accent/40 cursor-pointer transition-colors"
                >
                  <div
                    className={cn(
                      'w-3 h-3 rounded-[3px] border flex items-center justify-center transition-colors shrink-0',
                      st.completed ? 'bg-accent border-accent text-white' : 'border-veyra-subtle bg-transparent'
                    )}
                  >
                    {st.completed && <Check className="w-2 h-2 stroke-[3]" />}
                  </div>
                  <span
                    className={cn(
                      'truncate text-veyra-text',
                      st.completed && 'line-through text-veyra-subtle'
                    )}
                  >
                    {st.title}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Linked Note */}
        {linkedNote && (
          <button
            type="button"
            onClick={() => onSelectNote?.(linkedNote.id)}
            className="w-full flex items-center gap-1.5 p-1.5 rounded-lg bg-veyra-elevated border border-veyra-border text-[11px] text-accent hover:border-accent/40 transition-colors cursor-pointer text-left"
          >
            <FileText className="w-3 h-3 shrink-0" />
            <span className="truncate">Nota vinculada: {linkedNote.title || 'Sin título'}</span>
          </button>
        )}

        {/* Footer: Open full detail */}
        <div className="pt-2 border-t border-veyra-border flex items-center justify-between text-[11px]">
          <span className="text-[10px] text-veyra-subtle">
            Doble clic para ver todo
          </span>
          <button
            type="button"
            onClick={onOpenFull}
            className="px-2.5 py-1 rounded-md bg-accent text-white font-medium text-[11px] hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-1 shadow-xs"
          >
            <span>Ver detalle</span>
            <ExternalLink className="w-2.5 h-2.5" />
          </button>
        </div>
      </div>
    );
  };

  // Render for EVENT
  const renderEventContent = () => {
    if (!event) return null;
    const eventColor = event.color || palette.primary || '#3B82F6';
    const now = Date.now();
    const isHappeningNow = now >= event.start_time_ms && now <= event.end_time_ms;

    const durationStr = formatDuration(event.start_time_ms, event.end_time_ms);
    const timeRangeStr = formatTimeRange(event.start_time_ms, event.end_time_ms);
    const isRecurring = Boolean(
      (event.repeat_rule && event.repeat_rule !== 'none' && event.repeat_rule !== 'null') ||
      (event.recurrence_rule && event.recurrence_rule !== 'none' && event.recurrence_rule !== 'null')
    );

    const linkedNote = event.note_id
      ? allNotes.find((n) => n.id === event.note_id)
      : undefined;

    return (
      <div className="space-y-3">
        {/* Header: Calendar box + Title + Top Actions */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <div
              style={{
                backgroundColor: `${eventColor}22`,
                color: eventColor,
                borderColor: `${eventColor}40`,
              }}
              className="w-6 h-6 rounded-md border flex items-center justify-center shrink-0 mt-0.5"
            >
              <Calendar className="w-3 h-3 stroke-[2.4]" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-veyra-text leading-snug break-words">
                {event.title}
              </div>

              {isHappeningNow && (
                <div className="mt-1">
                  <span
                    style={{ backgroundColor: `${eventColor}18`, color: eventColor, borderColor: `${eventColor}30` }}
                    className="px-1.5 py-0.5 rounded text-[8.5px] font-bold uppercase tracking-wider inline-flex items-center gap-1 border"
                  >
                    <span
                      style={{ backgroundColor: eventColor }}
                      className="w-1 h-1 rounded-full animate-pulse"
                    />
                    EN CURSO
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onOpenFull}
              title="Abrir vista completa (Doble clic)"
              className="p-1 rounded-md text-veyra-muted hover:text-accent hover:bg-veyra-hover transition-colors cursor-pointer"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onClose}
              title="Cerrar vista previa (Esc)"
              className="p-1 rounded-md text-veyra-muted hover:text-veyra-text hover:bg-veyra-hover transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Time range & Duration */}
        <div className="p-2 rounded-lg bg-veyra-elevated border border-veyra-borderSubtle flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-1.5 text-veyra-muted font-mono">
            <Clock className="w-3 h-3 text-veyra-subtle shrink-0" />
            <span className="text-veyra-text">{timeRangeStr}</span>
          </div>

          <div className="flex items-center gap-1.5">
            {durationStr && (
              <span
                style={{
                  backgroundColor: `${eventColor}15`,
                  color: eventColor,
                  borderColor: `${eventColor}25`,
                }}
                className="px-1.5 py-0.2 rounded text-[9px] font-sans font-bold border tracking-wider"
              >
                {durationStr}
              </span>
            )}

            {onSnoozeEvent && !isRecurring && (
              <button
                type="button"
                onClick={() => onSnoozeEvent(event.id)}
                className="px-1.5 py-0.5 rounded text-[10px] font-medium text-veyra-muted hover:text-accent hover:bg-veyra-hover border border-transparent hover:border-veyra-border transition-colors cursor-pointer flex items-center gap-0.5"
                title="Posponer 1 día (+24h)"
              >
                <CalendarPlus className="w-2.5 h-2.5" />
                <span>+1d</span>
              </button>
            )}
          </div>
        </div>

        {/* Location / Meet */}
        {event.location && (
          <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-veyra-elevated border border-veyra-borderSubtle text-[11px]">
            <div className="flex items-center gap-1.5 text-veyra-text truncate">
              <MapPin style={{ color: eventColor }} className="w-3 h-3 shrink-0" />
              <span className="truncate">{event.location}</span>
            </div>

            <button
              type="button"
              onClick={() => {
                if (event.location?.startsWith('http')) {
                  window.open(event.location, '_blank');
                } else {
                  window.open('https://meet.google.com/new', '_blank');
                }
              }}
              className="px-2 py-0.5 rounded text-[10px] font-medium bg-accent text-white hover:opacity-90 transition-opacity shrink-0 cursor-pointer flex items-center gap-1 shadow-xs"
            >
              <span>Unirse</span>
              <ExternalLink className="w-2.5 h-2.5" />
            </button>
          </div>
        )}

        {/* Recurrence Rule */}
        {event.repeat_rule && (
          <div className="flex items-center gap-1.5 text-[11px] text-veyra-muted">
            <Repeat style={{ color: eventColor }} className="w-3 h-3 shrink-0" />
            <span>Repetición: {event.repeat_rule}</span>
          </div>
        )}

        {/* Linked Note */}
        {linkedNote && (
          <button
            type="button"
            onClick={() => onSelectNote?.(linkedNote.id)}
            className="w-full flex items-center gap-1.5 p-1.5 rounded-lg bg-veyra-elevated border border-veyra-border text-[11px] text-accent hover:border-accent/40 transition-colors cursor-pointer text-left"
          >
            <FileText className="w-3 h-3 shrink-0" />
            <span className="truncate">Nota vinculada: {linkedNote.title || 'Sin título'}</span>
          </button>
        )}

        {/* Footer: Open full detail */}
        <div className="pt-2 border-t border-veyra-border flex items-center justify-between text-[11px]">
          <span className="text-[10px] text-veyra-subtle">
            Doble clic para ver todo
          </span>
          <button
            type="button"
            onClick={onOpenFull}
            className="px-2.5 py-1 rounded-md bg-accent text-white font-medium text-[11px] hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-1 shadow-xs"
          >
            <span>Ver detalle</span>
            <ExternalLink className="w-2.5 h-2.5" />
          </button>
        </div>
      </div>
    );
  };

  return createPortal(
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
        'w-[310px] sm:w-[330px] rounded-xl p-3 font-sans select-none border shadow-elevated animate-in fade-in-0 zoom-in-95 duration-150',
        'bg-veyra-card text-veyra-text border-veyra-border',
        'shadow-xl shadow-black/20'
      )}
    >
      {isReminder ? renderReminderContent() : renderEventContent()}
    </div>,
    document.body
  );
};

