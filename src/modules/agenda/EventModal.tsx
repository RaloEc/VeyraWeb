import React, { useState, useEffect } from 'react';
import { Modal } from '../../components/common/Modal';
import { Input } from '../../components/common/Input';
import { Button } from '../../components/common/Button';
import { Tag as TagIcon, X, Plus } from 'lucide-react';
import type { CalendarEvent } from '../../hooks/useEvents';

export interface EventModalProps {
  isOpen: boolean;
  onClose: () => void;
  event?: CalendarEvent | null;
  onSave: (payload: {
    id?: string;
    title: string;
    description?: string;
    start_time_ms: number;
    end_time_ms: number;
    location?: string;
    color?: string;
    is_all_day?: boolean;
    tags?: string[] | null;
    repeat_rule?: string | null;
  }) => Promise<void>;
}

const COLOR_OPTIONS = [
  { value: '#3B82F6', label: 'Azul' },
  { value: '#10B981', label: 'Esmeralda' },
  { value: '#F59E0B', label: 'Ámbar' },
  { value: '#F43F5E', label: 'Rosa' },
  { value: '#8B5CF6', label: 'Púrpura' },
  { value: '#6366F1', label: 'Índigo' },
  { value: '#06B6D4', label: 'Cian' },
  { value: '#64748B', label: 'Pizarra' },
];

export const EventModal: React.FC<EventModalProps> = ({
  isOpen,
  onClose,
  event,
  onSave,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dateStr, setDateStr] = useState('');
  const [startTimeStr, setStartTimeStr] = useState('09:00');
  const [endTimeStr, setEndTimeStr] = useState('10:00');
  const [isAllDay, setIsAllDay] = useState(false);
  const [location, setLocation] = useState('');
  const [color, setColor] = useState('#3B82F6');
  const [recurrence, setRecurrence] = useState<'none' | 'daily' | 'weekly' | 'monthly'>('none');
  const [tags, setTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (event) {
      setTitle(event.title || '');
      setDescription(event.description || '');
      setLocation(event.location || '');
      setColor(event.color || '#3B82F6');
      setIsAllDay(Boolean(event.is_all_day));

      const s = Number(event.start_time_ms) || Date.now();
      const e = Number(event.end_time_ms) || s + 60 * 60 * 1000;
      const startDate = new Date(s);
      const endDate = new Date(e);

      setDateStr(startDate.toISOString().split('T')[0]);
      setStartTimeStr(startDate.toTimeString().substring(0, 5));
      setEndTimeStr(endDate.toTimeString().substring(0, 5));

      // Parse tags
      if (Array.isArray(event.tags)) {
        setTags(event.tags.map(String));
      } else if (typeof event.tags === 'string' && event.tags) {
        try {
          const parsed = JSON.parse(event.tags);
          setTags(Array.isArray(parsed) ? parsed : [event.tags]);
        } catch {
          setTags(event.tags.split(',').map((t) => t.trim()).filter(Boolean));
        }
      } else {
        setTags([]);
      }

      // Parse recurrence
      const rawRule = event.repeat_rule || '';
      try {
        const parsed = JSON.parse(rawRule);
        if (parsed.type === 'daily') setRecurrence('daily');
        else if (parsed.type === 'weekly') setRecurrence('weekly');
        else if (parsed.type === 'monthly') setRecurrence('monthly');
        else setRecurrence('none');
      } catch {
        if (rawRule.includes('daily') || rawRule.includes('diario')) setRecurrence('daily');
        else if (rawRule.includes('weekly') || rawRule.includes('semanal')) setRecurrence('weekly');
        else if (rawRule.includes('monthly') || rawRule.includes('mensual')) setRecurrence('monthly');
        else setRecurrence('none');
      }
    } else {
      const now = new Date();
      now.setMinutes(0, 0, 0);
      now.setHours(now.getHours() + 1);
      const end = new Date(now.getTime() + 60 * 60 * 1000);

      setDateStr(now.toISOString().split('T')[0]);
      setStartTimeStr(now.toTimeString().substring(0, 5));
      setEndTimeStr(end.toTimeString().substring(0, 5));
      setTitle('');
      setDescription('');
      setLocation('');
      setColor('#3B82F6');
      setIsAllDay(false);
      setRecurrence('none');
      setTags([]);
    }
    setNewTagInput('');
    setError(null);
  }, [event, isOpen]);

  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newTagInput.trim().replace(/^#/, '');
    if (!clean) return;
    if (!tags.includes(clean)) {
      setTags([...tags, clean]);
    }
    setNewTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('El título del evento es requerido.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const [year, month, day] = dateStr.split('-').map(Number);

      let startMs: number;
      let endMs: number;

      if (isAllDay) {
        startMs = new Date(year, month - 1, day, 0, 0, 0).getTime();
        endMs = new Date(year, month - 1, day, 23, 59, 59).getTime();
      } else {
        const [startHours, startMinutes] = startTimeStr.split(':').map(Number);
        const [endHours, endMinutes] = endTimeStr.split(':').map(Number);
        startMs = new Date(year, month - 1, day, startHours, startMinutes).getTime();
        endMs = new Date(year, month - 1, day, endHours, endMinutes).getTime();

        if (endMs <= startMs) {
          // Default to at least 30 minutes after start
          endMs = startMs + 30 * 60 * 1000;
        }
      }

      let repeatRule: string | null = null;
      if (recurrence === 'daily') {
        repeatRule = JSON.stringify({ type: 'daily' });
      } else if (recurrence === 'weekly') {
        repeatRule = JSON.stringify({ type: 'weekly', days: [new Date(startMs).getDay()] });
      } else if (recurrence === 'monthly') {
        repeatRule = JSON.stringify({ type: 'monthly' });
      }

      await onSave({
        id: event?.id,
        title: title.trim(),
        description: description.trim() || undefined,
        start_time_ms: startMs,
        end_time_ms: endMs,
        location: location.trim() || undefined,
        color,
        is_all_day: isAllDay,
        tags: tags.length > 0 ? tags : null,
        repeat_rule: repeatRule,
      });

      onClose();
    } catch (err: unknown) {
      console.error('[EventModal] Error saving event:', err);
      setError((err as Error).message || 'Error guardando el evento');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={event ? 'Editar Evento' : 'Nuevo Evento'}
      description="Organiza tu agenda y reuniones"
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
          placeholder="¿Cuál es el nombre del evento o reunión?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          autoFocus
        />

        {/* Date and Time */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-medium text-veyra-muted">
              Fecha y Horario
            </label>
            <label className="flex items-center gap-1.5 text-xs text-veyra-muted cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isAllDay}
                onChange={(e) => setIsAllDay(e.target.checked)}
                className="rounded border-veyra-border text-accent focus:ring-accent w-3.5 h-3.5"
              />
              <span>Todo el día</span>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className={isAllDay ? 'sm:col-span-3' : 'sm:col-span-1'}>
              <Input
                type="date"
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
                required
              />
            </div>
            {!isAllDay && (
              <>
                <Input
                  type="time"
                  label="Inicio"
                  value={startTimeStr}
                  onChange={(e) => setStartTimeStr(e.target.value)}
                  required
                />
                <Input
                  type="time"
                  label="Fin"
                  value={endTimeStr}
                  onChange={(e) => setEndTimeStr(e.target.value)}
                  required
                />
              </>
            )}
          </div>
        </div>

        {/* Location */}
        <Input
          label="Ubicación o Enlace"
          placeholder="Ej. Oficina principal, Google Meet, Zoom..."
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />

        {/* Color Palette Picker */}
        <div>
          <label className="block text-xs font-medium text-veyra-muted mb-1.5">
            Color identificador
          </label>
          <div className="flex items-center gap-2 flex-wrap">
            {COLOR_OPTIONS.map((c) => {
              const isSelected = color === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  title={c.label}
                  onClick={() => setColor(c.value)}
                  style={{ backgroundColor: c.value }}
                  className={`w-6 h-6 rounded-full transition-transform cursor-pointer flex items-center justify-center ${
                    isSelected ? 'ring-2 ring-offset-2 ring-accent scale-110' : 'hover:scale-105 opacity-85'
                  }`}
                >
                  {isSelected && <span className="text-white text-[10px] font-bold">✓</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Recurrence Selector */}
        <div>
          <label className="block text-xs font-medium text-veyra-muted mb-1.5">
            Repetición
          </label>
          <select
            value={recurrence}
            onChange={(e) => setRecurrence(e.target.value as 'none' | 'daily' | 'weekly' | 'monthly')}
            className="w-full bg-veyra-card border border-veyra-border text-veyra-text rounded-md px-3 py-2 text-xs focus:outline-none focus:border-accent"
          >
            <option value="none">Evento único (no recurrente)</option>
            <option value="daily">Todos los días</option>
            <option value="weekly">Semanal</option>
            <option value="monthly">Mensual</option>
          </select>
        </div>

        {/* Tags */}
        <div>
          <label className="block text-xs font-medium text-veyra-muted mb-1.5 flex items-center gap-1">
            <TagIcon className="w-3.5 h-3.5 text-accent" />
            <span>Etiquetas</span>
          </label>
          <div className="flex items-center gap-2 mb-2">
            <input
              type="text"
              placeholder="Nueva etiqueta (ej. trabajo, urgente)..."
              value={newTagInput}
              onChange={(e) => setNewTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddTag(e);
                }
              }}
              className="flex-1 bg-veyra-card border border-veyra-border text-veyra-text placeholder:text-veyra-subtle rounded-md px-3 py-1.5 text-xs focus:outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={handleAddTag}
              disabled={!newTagInput.trim()}
              className="p-1.5 rounded-md bg-veyra-elevated border border-veyra-border hover:border-accent/40 text-veyra-text hover:text-accent disabled:opacity-40 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-veyra-card border border-veyra-border text-xs text-veyra-text"
                >
                  <span className="text-accent font-semibold">#</span>
                  <span>{tag}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="p-0.5 text-veyra-subtle hover:text-red-400 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-medium text-veyra-muted mb-1.5">
            Descripción (Opcional)
          </label>
          <textarea
            rows={3}
            placeholder="Agenda, enlaces, notas de la reunión..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full bg-veyra-card border border-veyra-border text-veyra-text placeholder:text-veyra-subtle rounded-md px-3.5 py-2 text-xs focus:outline-none focus:border-accent transition-colors"
          />
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-veyra-border">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={loading} size="sm">
            {event ? 'Guardar Cambios' : 'Crear Evento'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

