import React, { useMemo, useState, useEffect } from 'react';
import {
  CheckCircle2,
  Clock,
  Calendar,
  AlertTriangle,
  FileText,
  Plus,
  Trash2,
  X,
  PanelLeft,
  ArrowRight,
  Repeat,
  CheckSquare,
  ChevronDown,
  Pencil,
  Check,
} from 'lucide-react';
import type { Reminder, Subtask, ReminderControlLevel } from '../../types/reminders';
import type { CalendarEvent } from '../../hooks/useEvents';
import type { Note } from '../../types/notes';
import type { useReminders } from '../../hooks/useReminders';
import type { useEvents } from '../../hooks/useEvents';
import { useTheme } from '../../theme/ThemeProvider';
import { cn, isDateToday, isDateOverdue, parseSubtasks } from '../../lib/utils';
import { ConfirmTooltip } from '../../components/common/ConfirmTooltip';

export interface ReminderDetailViewProps {
  reminder: Reminder;
  allNotes: Note[];
  eventsHook?: ReturnType<typeof useEvents>;
  remindersHook?: ReturnType<typeof useReminders>;
  onSelectNote: (noteId: string) => void;
  onSelectEvent?: (eventId: string) => void;
  onClose: () => void;
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

export const ReminderDetailView: React.FC<ReminderDetailViewProps> = ({
  reminder,
  allNotes,
  eventsHook,
  remindersHook,
  onSelectNote,
  onSelectEvent,
  onClose,
  isSidebarOpen,
  onToggleSidebar,
}) => {
  const { palette } = useTheme();
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(reminder.title || '');
  const [description, setDescription] = useState(reminder.description || '');
  const [dateVal, setDateVal] = useState('');
  const [timeVal, setTimeVal] = useState('12:00');
  const [controlLevel, setControlLevel] = useState<ReminderControlLevel>('normal');
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [isAddingSubtask, setIsAddingSubtask] = useState(false);

  const initDraftState = () => {
    setTitle(reminder.title || '');
    setDescription(reminder.description || '');
    setControlLevel(
      reminder.control_level ||
        (reminder.priority === 3 ? 'critical' : reminder.priority === 2 ? 'strict' : 'normal')
    );
    if (reminder.due_date_ms) {
      const d = new Date(reminder.due_date_ms);
      setDateVal(d.toISOString().split('T')[0]);
      setTimeVal(d.toTimeString().substring(0, 5));
    } else {
      const d = new Date();
      setDateVal(d.toISOString().split('T')[0]);
      setTimeVal(d.toTimeString().substring(0, 5));
    }
  };

  // Sync internal state when reminder changes, only if not currently editing
  useEffect(() => {
    if (!isEditing) {
      initDraftState();
    }
  }, [
    reminder.id,
    reminder.title,
    reminder.description,
    reminder.due_date_ms,
    reminder.control_level,
    reminder.priority,
    isEditing,
  ]);

  const handleStartEdit = () => {
    initDraftState();
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    initDraftState();
    setIsEditing(false);
  };

  const handleSaveEdit = async () => {
    if (!remindersHook?.updateReminder) {
      setIsEditing(false);
      return;
    }
    const [y, m, d] = dateVal.split('-').map(Number);
    const [h, min] = timeVal.split(':').map(Number);
    const updatedDue = new Date(y, m - 1, d, h || 0, min || 0).getTime();
    const priorityNum = controlLevel === 'critical' ? 3 : controlLevel === 'strict' ? 2 : 1;

    await remindersHook.updateReminder(reminder.id, {
      title: title.trim() || reminder.title,
      description: description.trim() || null,
      due_date_ms: updatedDue,
      control_level: controlLevel,
      priority: priorityNum,
    });
    setIsEditing(false);
  };

  const isCompleted = reminder.status === 'completed';
  const isOverdue = !isCompleted && isDateOverdue(reminder.due_date_ms);
  const isToday = isDateToday(reminder.due_date_ms);

  // Priority classification
  const isCritical = reminder.control_level === 'critical' || reminder.priority === 3;
  const isStrict = reminder.control_level === 'strict' || reminder.priority === 2;

  const priorityColor = isCritical
    ? '#FB7185'
    : isStrict
    ? '#FB923C'
    : palette.primary || '#3B82F6';

  // Subtasks
  const subtasksList: Subtask[] = useMemo(() => {
    return parseSubtasks(reminder.subtasks);
  }, [reminder.subtasks]);

  const completedSubtasksCount = useMemo(() => {
    return subtasksList.filter((s) => s.completed).length;
  }, [subtasksList]);

  const subtasksProgressPercent = useMemo(() => {
    if (subtasksList.length === 0) return 0;
    return Math.round((completedSubtasksCount / subtasksList.length) * 100);
  }, [subtasksList, completedSubtasksCount]);

  // Associated event
  const linkedEvent: CalendarEvent | null = useMemo(() => {
    if (!reminder.event_id || !eventsHook?.events) return null;
    return eventsHook.events.find((e) => e.id === reminder.event_id) || null;
  }, [reminder.event_id, eventsHook?.events]);

  // Associated note
  const linkedNote: Note | null = useMemo(() => {
    if (linkedEvent?.note_id) {
      const found = allNotes.find((n) => n.id === linkedEvent.note_id && n.deleted === 0);
      if (found) return found;
    }
    if (reminder.event_id) {
      const found = allNotes.find((n) => n.event_id === reminder.event_id && n.deleted === 0);
      if (found) return found;
    }
    return null;
  }, [linkedEvent, reminder.event_id, allNotes]);

  // Toggle main reminder completion
  const handleToggleReminder = () => {
    if (remindersHook?.toggleReminder) {
      remindersHook.toggleReminder(reminder.id, reminder.status);
    }
  };

  // Formatted date and time for presentation mode
  const formattedDateTime = useMemo(() => {
    if (!reminder.due_date_ms) return '';
    const d = new Date(reminder.due_date_ms);
    const dateStr = d.toLocaleDateString('es-ES', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const capitalized = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
    return `${capitalized} • ${timeStr}`;
  }, [reminder.due_date_ms]);

  const priorityLabel = isCritical
    ? 'Alta'
    : isStrict
    ? 'Media'
    : 'Normal';

  // Add new subtask
  const handleAddSubtask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubtaskTitle.trim() || !remindersHook?.updateReminder) return;

    try {
      setIsAddingSubtask(true);
      const newSubtask: Subtask = {
        id: crypto.randomUUID(),
        title: newSubtaskTitle.trim(),
        completed: false,
      };
      const updatedSubtasks = [...subtasksList, newSubtask];
      await remindersHook.updateReminder(reminder.id, {
        subtasks: updatedSubtasks,
      });
      setNewSubtaskTitle('');
    } catch (err) {
      console.error('Error adding subtask:', err);
    } finally {
      setIsAddingSubtask(false);
    }
  };

  // Delete subtask
  const handleDeleteSubtask = async (subtaskId: string) => {
    if (!remindersHook?.updateReminder) return;
    const updatedSubtasks = subtasksList.filter((s) => s.id !== subtaskId);
    await remindersHook.updateReminder(reminder.id, {
      subtasks: updatedSubtasks,
    });
  };

  // Snooze handlers
  const handleSnooze = async (minutes: number) => {
    if (!remindersHook?.updateReminder) return;
    const currentDue = reminder.due_date_ms || Date.now();
    await remindersHook.updateReminder(reminder.id, {
      due_date_ms: currentDue + minutes * 60 * 1000,
    });
  };

  const handleDeleteReminder = async () => {
    if (!remindersHook?.deleteReminder) return;
    await remindersHook.deleteReminder(reminder.id);
    onClose();
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-veyra-canvas overflow-hidden select-text font-sans">
      {/* 1. Header Toolbar (Compact & Flat) */}
      <div className="h-10 border-b border-veyra-border px-3.5 flex items-center justify-between text-xs shrink-0 select-none bg-veyra-card/50">
        <div className="flex items-center gap-2 min-w-0">
          {!isSidebarOpen && onToggleSidebar && (
            <button
              type="button"
              onClick={onToggleSidebar}
              title="Mostrar barra lateral (Ctrl+\)"
              className="p-1 rounded text-veyra-muted hover:text-accent hover:bg-white/5 transition-colors cursor-pointer flex items-center justify-center mr-0.5"
            >
              <PanelLeft className="w-3.5 h-3.5 text-accent" />
            </button>
          )}

          <div
            style={{ backgroundColor: `${priorityColor}24`, color: priorityColor }}
            className="w-4 h-4 rounded-[4px] flex items-center justify-center shrink-0"
          >
            <CheckSquare className="w-2.5 h-2.5 stroke-[2.2]" />
          </div>

          <span className="text-[11px] font-bold text-veyra-subtle uppercase tracking-wider truncate">
            Recordatorio
          </span>
          <span className="text-veyra-subtle/50 text-[11px]">•</span>
          <span className="text-xs font-semibold text-veyra-text truncate max-w-[200px] sm:max-w-xs">
            {reminder.title}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Status Badge */}
          {isCompleted ? (
            <span className="px-2 py-0.5 rounded-[4px] text-[9.5px] font-bold tracking-wide uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
              <CheckCircle2 className="w-2.5 h-2.5" />
              Completado
            </span>
          ) : isOverdue ? (
            <span className="px-2 py-0.5 rounded-[4px] text-[9.5px] font-bold tracking-wide uppercase bg-red-500/15 text-red-400 border border-red-500/30 flex items-center gap-1">
              <AlertTriangle className="w-2.5 h-2.5" />
              Vencido
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded-[4px] text-[9.5px] font-semibold tracking-wide uppercase bg-blue-500/15 text-blue-400 border border-blue-500/30">
              Pendiente
            </span>
          )}

          <div className="w-[1px] h-3 bg-veyra-border mx-0.5" />

          {/* Snooze Pills */}
          <button
            type="button"
            onClick={() => handleSnooze(15)}
            title="Posponer 15 minutos"
            className="px-1.5 py-1 rounded text-veyra-muted hover:text-veyra-text hover:bg-white/5 text-[11px] font-medium cursor-pointer transition-colors"
          >
            +15m
          </button>
          <button
            type="button"
            onClick={() => handleSnooze(60)}
            title="Posponer 1 hora"
            className="px-1.5 py-1 rounded text-veyra-muted hover:text-veyra-text hover:bg-white/5 text-[11px] font-medium cursor-pointer transition-colors"
          >
            +1h
          </button>
          <button
            type="button"
            onClick={() => handleSnooze(24 * 60)}
            title="Posponer 1 día"
            className="px-1.5 py-1 rounded text-veyra-muted hover:text-veyra-text hover:bg-white/5 text-[11px] font-medium cursor-pointer transition-colors"
          >
            +1d
          </button>

          <div className="w-[1px] h-3 bg-veyra-border mx-0.5" />

          {/* Edit Button / Actions */}
          {remindersHook?.updateReminder && (
            isEditing ? (
              <div className="flex items-center gap-1 bg-accent/10 border border-accent/30 rounded px-1.5 py-0.5">
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="px-1.5 py-0.5 rounded text-veyra-subtle hover:text-veyra-text text-[11px] font-medium transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  className="px-2 py-0.5 rounded bg-accent text-white hover:opacity-90 text-[11px] font-medium transition-opacity cursor-pointer flex items-center gap-1 shadow-xs"
                >
                  <Check className="w-3 h-3 stroke-[2.5]" />
                  <span>Listo</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleStartEdit}
                title="Editar recordatorio"
                className="px-2 py-1 rounded text-veyra-muted hover:text-accent hover:bg-white/5 text-[11px] font-medium transition-colors cursor-pointer flex items-center gap-1 border border-transparent hover:border-accent/30"
              >
                <Pencil className="w-3 h-3 text-accent" />
                <span>Editar</span>
              </button>
            )
          )}

          {/* Delete Button */}
          {remindersHook?.deleteReminder && (
            <ConfirmTooltip
              title="¿Eliminar recordatorio?"
              description={`"${reminder.title}"`}
              confirmText="Eliminar"
              onConfirm={handleDeleteReminder}
            >
              <button
                type="button"
                title="Eliminar recordatorio"
                className="p-1 rounded text-veyra-muted hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </ConfirmTooltip>
          )}

          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            title="Cerrar vista"
            className="p-1 rounded text-veyra-muted hover:text-veyra-text hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. Scrollable Content Area (Flat & Compact - Full Width) */}
      <div className="flex-1 overflow-y-auto px-6 py-6 md:px-10 space-y-5 w-full">
        {/* Title Row with Checkbox & Priority Chip */}
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={handleToggleReminder}
            title={isCompleted ? 'Marcar como pendiente' : 'Marcar como completado'}
            className={cn(
              'w-5 h-5 rounded-full border flex items-center justify-center transition-colors cursor-pointer shrink-0 mt-1',
              isCompleted
                ? 'bg-accent border-accent text-white'
                : 'border-veyra-subtle/80 hover:border-accent'
            )}
          >
            {isCompleted && <span className="text-[10px] font-bold">✓</span>}
          </button>

          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2">
              {isEditing ? (
                /* Edit Mode: Priority Selector */
                <div className="relative inline-flex items-center">
                  <select
                    value={controlLevel}
                    onChange={(e) => setControlLevel(e.target.value as ReminderControlLevel)}
                    style={{
                      backgroundColor: `${priorityColor}18`,
                      color: priorityColor,
                      borderColor: `${priorityColor}50`,
                    }}
                    title="Cambiar prioridad"
                    className="appearance-none cursor-pointer pl-2 pr-5 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider focus:outline-none focus:ring-1 focus:ring-accent hover:opacity-90 transition-opacity bg-veyra-card"
                  >
                    <option value="normal" className="bg-veyra-elevated text-veyra-text normal-case font-normal text-xs">
                      Prioridad Normal
                    </option>
                    <option value="strict" className="bg-veyra-elevated text-amber-400 normal-case font-normal text-xs">
                      Prioridad Media (Estricto)
                    </option>
                    <option value="critical" className="bg-veyra-elevated text-rose-400 normal-case font-normal text-xs">
                      Prioridad Alta (Crítico)
                    </option>
                  </select>
                  <ChevronDown
                    className="w-2.5 h-2.5 absolute right-1.5 pointer-events-none opacity-70"
                    style={{ color: priorityColor }}
                  />
                </div>
              ) : (
                /* Read-only: Priority Chip */
                <span
                  style={{
                    backgroundColor: `${priorityColor}18`,
                    color: priorityColor,
                    borderColor: `${priorityColor}35`,
                  }}
                  className="px-2 py-0.2 rounded text-[10px] font-bold border uppercase tracking-wider"
                >
                  Prioridad {priorityLabel}
                </span>
              )}

              {reminder.repeat_rule && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-medium bg-white/5 border border-veyra-border text-veyra-subtle">
                  <Repeat className="w-3 h-3" />
                  Recurrente
                </span>
              )}
            </div>

            {isEditing ? (
              /* Edit Mode: Title Input */
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
                placeholder="Título del recordatorio..."
                className="text-lg md:text-xl font-bold tracking-tight text-veyra-text leading-snug w-full bg-veyra-elevated border border-accent rounded-md px-2.5 py-1 focus:outline-none shadow-xs"
              />
            ) : (
              /* Read-only: Title Heading */
              <h1
                className={cn(
                  'text-lg md:text-xl font-bold tracking-tight text-veyra-text leading-snug',
                  isCompleted && 'line-through text-veyra-subtle opacity-70'
                )}
              >
                {reminder.title}
              </h1>
            )}
          </div>
        </div>

        {/* Flat Properties Grid (Linear / Notion style) - Full Width Responsive */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 p-3.5 rounded-lg bg-veyra-card/40 border border-veyra-border text-xs">
          {/* Fecha y Hora */}
          <div className="flex items-center gap-2 py-1 px-1.5 text-veyra-muted col-span-1 sm:col-span-2 lg:col-span-1">
            <Clock className="w-3.5 h-3.5 text-veyra-subtle shrink-0" />
            {isEditing ? (
              <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
                <input
                  type="date"
                  value={dateVal}
                  onChange={(e) => setDateVal(e.target.value)}
                  className="bg-veyra-elevated text-xs font-semibold text-veyra-text rounded px-2 py-1 border border-accent/60 focus:border-accent focus:outline-none cursor-pointer"
                />
                <input
                  type="time"
                  value={timeVal}
                  onChange={(e) => setTimeVal(e.target.value)}
                  className="bg-veyra-elevated text-xs font-semibold text-veyra-text rounded px-2 py-1 border border-accent/60 focus:border-accent focus:outline-none cursor-pointer"
                />
              </div>
            ) : (
              <div className="truncate">
                <span className="font-semibold text-veyra-text">{formattedDateTime}</span>
                {isCompleted ? (
                  <span className="text-emerald-400 font-bold ml-1.5">• Hecho</span>
                ) : isOverdue ? (
                  <span className="text-red-400 font-bold ml-1.5">• Vencido</span>
                ) : isToday ? (
                  <span className="text-amber-400 font-bold ml-1.5">• Hoy</span>
                ) : null}
              </div>
            )}
          </div>

          {/* Evento Asociado */}
          <div className="flex items-center gap-2.5 py-1 px-1.5 text-veyra-muted">
            <Calendar className="w-3.5 h-3.5 text-veyra-subtle shrink-0" />
            {linkedEvent ? (
              <button
                type="button"
                onClick={() => onSelectEvent?.(linkedEvent.id)}
                className="truncate text-accent hover:underline font-medium text-left cursor-pointer flex items-center gap-1"
              >
                <span>{linkedEvent.title}</span>
                <ArrowRight className="w-3 h-3 shrink-0" />
              </button>
            ) : (
              <span className="text-veyra-subtle">Sin evento asociado</span>
            )}
          </div>

          {/* Nota Vinculada */}
          <div className="flex items-center gap-2.5 py-1 px-1.5 text-veyra-muted sm:col-span-2 lg:col-span-1">
            <FileText className="w-3.5 h-3.5 text-veyra-subtle shrink-0" />
            {linkedNote ? (
              <button
                type="button"
                onClick={() => onSelectNote(linkedNote.id)}
                className="truncate text-accent hover:underline font-medium text-left cursor-pointer flex items-center gap-1"
              >
                <span>Nota: {linkedNote.title || 'Sin título'}</span>
                <ArrowRight className="w-3 h-3 shrink-0" />
              </button>
            ) : (
              <span className="text-veyra-subtle">Sin nota vinculada</span>
            )}
          </div>
        </div>

        {/* Descripción: Editable en edición, vista limpia en lectura */}
        {isEditing ? (
          <div className="p-3.5 rounded-lg bg-veyra-card/50 border border-accent/50 text-xs text-veyra-muted leading-relaxed space-y-1.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-accent flex items-center justify-between">
              <span>Descripción</span>
              <span className="text-[9.5px] font-normal text-accent/80">Modo edición</span>
            </div>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Escribe detalles o notas adicionales aquí..."
              className="w-full bg-veyra-elevated border border-veyra-border rounded-md p-2.5 text-xs text-veyra-text placeholder:text-veyra-subtle/50 leading-relaxed font-sans focus:outline-none focus:border-accent resize-y"
            />
          </div>
        ) : reminder.description ? (
          <div className="p-3.5 rounded-lg bg-veyra-card/30 border border-veyra-border/60 text-xs text-veyra-muted leading-relaxed">
            <div className="text-[10px] font-bold uppercase tracking-wider text-veyra-subtle mb-1">
              Descripción
            </div>
            <div
              className="prose dark:prose-invert max-w-none text-xs"
              dangerouslySetInnerHTML={{ __html: reminder.description }}
            />
          </div>
        ) : null}

        {/* 3. Section: Subtareas y Pasos (Ultra Compact & Flat) */}
        <div className="space-y-2.5 pt-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckSquare className="w-3.5 h-3.5 text-emerald-400" />
              <h2 className="text-xs font-bold text-veyra-text uppercase tracking-wider">
                Subtareas ({completedSubtasksCount}/{subtasksList.length})
              </h2>
            </div>
            {subtasksList.length > 0 && (
              <span className="text-[11px] font-mono text-veyra-subtle">
                {subtasksProgressPercent}%
              </span>
            )}
          </div>

          {/* Slim 2.5px Progress Bar */}
          {subtasksList.length > 0 && (
            <div className="w-full bg-veyra-card rounded-full h-1 overflow-hidden border border-veyra-border/60">
              <div
                style={{ width: `${subtasksProgressPercent}%` }}
                className={cn(
                  'h-full transition-all duration-200 rounded-full',
                  subtasksProgressPercent === 100 ? 'bg-emerald-400' : 'bg-accent'
                )}
              />
            </div>
          )}

          {/* Subtask Items (Flat Rows) */}
          {subtasksList.length > 0 ? (
            <div className="divide-y divide-veyra-border/50 border border-veyra-border rounded-lg bg-veyra-card/40 overflow-hidden">
              {subtasksList.map((st) => (
                <div
                  key={st.id}
                  className="group px-3 py-2 flex items-center justify-between gap-2.5 hover:bg-white/[0.03] transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => remindersHook?.toggleSubtask?.(reminder.id, st.id)}
                    className="flex items-center gap-2 flex-1 min-w-0 text-left cursor-pointer"
                  >
                    <div
                      className={cn(
                        'w-3.5 h-3.5 rounded-[3px] border flex items-center justify-center transition-colors shrink-0',
                        st.completed
                          ? 'bg-accent border-accent text-white'
                          : 'border-veyra-subtle hover:border-accent'
                      )}
                    >
                      {st.completed && <span className="text-[9px] font-bold">✓</span>}
                    </div>
                    <span
                      className={cn(
                        'text-xs font-medium text-veyra-text truncate',
                        st.completed && 'line-through text-veyra-subtle'
                      )}
                    >
                      {st.title}
                    </span>
                  </button>

                  <ConfirmTooltip
                    title="¿Eliminar subtarea?"
                    description={`"${st.title}"`}
                    confirmText="Eliminar"
                    onConfirm={() => handleDeleteSubtask(st.id)}
                  >
                    <button
                      type="button"
                      title="Eliminar subtarea"
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-veyra-subtle hover:text-red-400 transition-opacity cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </ConfirmTooltip>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-3 rounded-lg border border-dashed border-veyra-border text-xs text-veyra-subtle text-center">
              No hay subtareas registradas para este recordatorio.
            </div>
          )}

          {/* Add Subtask Input Form (Flat & Compact) */}
          <form onSubmit={handleAddSubtask} className="flex items-center gap-1.5 pt-0.5">
            <input
              type="text"
              placeholder="Agregar un nuevo paso..."
              value={newSubtaskTitle}
              onChange={(e) => setNewSubtaskTitle(e.target.value)}
              className="flex-1 px-3 py-1.5 rounded-md bg-veyra-card border border-veyra-border text-xs text-veyra-text placeholder:text-veyra-subtle focus:outline-none focus:border-accent"
            />
            <button
              type="submit"
              disabled={isAddingSubtask || !newSubtaskTitle.trim()}
              className="px-3 py-1.5 rounded-md bg-accent text-white font-medium text-xs hover:opacity-90 disabled:opacity-40 transition-opacity cursor-pointer flex items-center gap-1 shrink-0"
            >
              <Plus className="w-3 h-3 stroke-[2.5]" />
              <span>Agregar</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
