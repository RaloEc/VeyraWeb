import React, { useState, useEffect } from 'react';
import { Modal } from '../../components/common/Modal';
import { Input } from '../../components/common/Input';
import { Button } from '../../components/common/Button';
import { Plus, X, ListPlus } from 'lucide-react';
import type { Reminder, ReminderPriority, ReminderControlLevel, Subtask } from '../../types/reminders';
import { parseSubtasks } from '../../lib/utils';

export interface ReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  reminder?: Reminder | null;
  onSave: (payload: {
    id?: string;
    title: string;
    description?: string;
    due_date_ms: number;
    priority?: ReminderPriority;
    control_level?: ReminderControlLevel;
    subtasks?: Subtask[];
  }) => Promise<void>;
}

export const ReminderModal: React.FC<ReminderModalProps> = ({
  isOpen,
  onClose,
  reminder,
  onSave,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dateStr, setDateStr] = useState('');
  const [timeStr, setTimeStr] = useState('12:00');
  const [controlLevel, setControlLevel] = useState<ReminderControlLevel>('normal');
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (reminder) {
      setTitle(reminder.title);
      setDescription(reminder.description || '');
      const d = new Date(reminder.due_date_ms);
      setDateStr(d.toISOString().split('T')[0]);
      setTimeStr(d.toTimeString().substring(0, 5));
      setControlLevel(reminder.control_level || (reminder.priority === 3 ? 'critical' : reminder.priority === 2 ? 'strict' : 'normal'));
      setSubtasks(parseSubtasks(reminder.subtasks));
    } else {
      // Default to today + 2 hours
      const now = new Date();
      now.setHours(now.getHours() + 2);
      setDateStr(now.toISOString().split('T')[0]);
      setTimeStr(now.toTimeString().substring(0, 5));
      setTitle('');
      setDescription('');
      setControlLevel('normal');
      setSubtasks([]);
    }
    setNewSubtaskTitle('');
    setError(null);
  }, [reminder, isOpen]);

  const handleAddSubtask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubtaskTitle.trim()) return;
    const newItem: Subtask = {
      id: 'st-' + Math.random().toString(36).substring(2, 9),
      title: newSubtaskTitle.trim(),
      completed: false,
    };
    setSubtasks([...subtasks, newItem]);
    setNewSubtaskTitle('');
  };

  const handleRemoveSubtask = (id: string) => {
    setSubtasks(subtasks.filter((s) => s.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('El título es requerido.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Parse date and time to timestamp ms
      const [year, month, day] = dateStr.split('-').map(Number);
      const [hours, minutes] = timeStr.split(':').map(Number);
      const dueDate = new Date(year, month - 1, day, hours, minutes);

      const priorityNum = controlLevel === 'critical' ? 3 : controlLevel === 'strict' ? 2 : 1;

      await onSave({
        id: reminder?.id,
        title: title.trim(),
        description: description.trim() || undefined,
        due_date_ms: dueDate.getTime(),
        control_level: controlLevel,
        priority: priorityNum,
        subtasks,
      });

      onClose();
    } catch (err: unknown) {
      console.error('[ReminderModal] Error saving reminder:', err);
      setError((err as Error).message || 'Error guardando el recordatorio');
    } finally {
      setLoading(false);
    }
  };

  const controlLevelOptions: {
    value: ReminderControlLevel;
    label: string;
    desc: string;
    dotColor: string;
  }[] = [
    {
      value: 'normal',
      label: 'Normal',
      desc: 'Notificación estándar',
      dotColor: 'bg-zinc-400',
    },
    {
      value: 'strict',
      label: 'Estricto',
      desc: 'Alerta persistente',
      dotColor: 'bg-amber-400',
    },
    {
      value: 'critical',
      label: 'Crítico',
      desc: 'Alarma de alta prioridad',
      dotColor: 'bg-red-400',
    },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={reminder ? 'Editar Recordatorio' : 'Nuevo Recordatorio'}
      description="Sincronización en tiempo real con tu teléfono móvil"
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-2.5 rounded-md bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
            {error}
          </div>
        )}

        <Input
          label="Título"
          placeholder="¿Qué necesitas recordar?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          autoFocus
        />

        <div>
          <label className="block text-xs font-medium text-veyra-muted mb-1.5">
            Descripción (Opcional)
          </label>
          <textarea
            rows={2}
            placeholder="Detalles, enlaces o instrucciones..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full bg-veyra-card border border-veyra-border text-veyra-text placeholder:text-veyra-subtle rounded-md px-3.5 py-2 text-sm focus:outline-none focus:border-accent transition-colors"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Fecha de vencimiento"
            type="date"
            value={dateStr}
            onChange={(e) => setDateStr(e.target.value)}
            required
          />
          <Input
            label="Hora"
            type="time"
            value={timeStr}
            onChange={(e) => setTimeStr(e.target.value)}
            required
          />
        </div>

        {/* Priority & Control Level Selector */}
        <div>
          <label className="block text-xs font-medium text-veyra-muted mb-2">
            Nivel de Control & Prioridad
          </label>
          <div className="grid grid-cols-3 gap-2">
            {controlLevelOptions.map((opt) => {
              const isSelected = controlLevel === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setControlLevel(opt.value)}
                  className={`p-2.5 rounded-md border text-left transition-colors select-none cursor-pointer ${
                    isSelected
                      ? 'border-accent bg-accent/10 text-veyra-text'
                      : 'border-veyra-border bg-veyra-card text-veyra-muted hover:border-accent/40'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    <span className={`w-1.5 h-1.5 rounded-full ${opt.dotColor}`} />
                    <span>{opt.label}</span>
                  </div>
                  <div className="text-[10px] text-veyra-subtle mt-0.5 truncate">
                    {opt.desc}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Subtasks Section */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-veyra-muted flex items-center gap-1.5">
              <ListPlus className="w-3.5 h-3.5 text-accent" />
              <span>Subtareas ({subtasks.length})</span>
            </label>
          </div>

          <div className="flex items-center gap-2 mb-2">
            <input
              type="text"
              placeholder="Añadir una subtarea..."
              value={newSubtaskTitle}
              onChange={(e) => setNewSubtaskTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddSubtask(e);
                }
              }}
              className="flex-1 bg-veyra-card border border-veyra-border text-veyra-text placeholder:text-veyra-subtle rounded-md px-3 py-1.5 text-xs focus:outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={handleAddSubtask}
              disabled={!newSubtaskTitle.trim()}
              className="p-1.5 rounded-md bg-veyra-elevated border border-veyra-border hover:border-accent/40 text-veyra-text hover:text-accent disabled:opacity-40 transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {subtasks.length > 0 && (
            <div className="space-y-1 max-h-32 overflow-y-auto p-1.5 rounded-md bg-veyra-card/40 border border-veyra-border">
              {subtasks.map((st) => (
                <div
                  key={st.id}
                  className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-veyra-card border border-veyra-border text-xs"
                >
                  <span className="truncate text-veyra-text">{st.title}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveSubtask(st.id)}
                    className="p-1 text-veyra-subtle hover:text-red-400"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-veyra-border">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={loading} size="sm">
            {reminder ? 'Guardar Cambios' : 'Crear Recordatorio'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
