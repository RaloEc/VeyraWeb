import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Modal } from '../../components/common/Modal';
import { Input } from '../../components/common/Input';
import { Button } from '../../components/common/Button';
import { HashtagInput } from '../../components/common/HashtagInput';
import {
  Bell,
  AlertCircle,
  ShieldAlert,
  Calendar as CalendarIcon,
  Repeat,
  CheckSquare,
  Paperclip,
  Trash2,
  Plus,
  X,
  ChevronDown,
  Sliders,
  Check,
  Link as LinkIcon,
  FileText,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import type { Reminder, ReminderPriority, ReminderControlLevel, Subtask } from '../../types/reminders';
import type { CalendarEvent } from '../../hooks/useEvents';
import { parseSubtasks, cn, isImageAttachment, toLocalYmd, type AttachmentItem } from '../../lib/utils';
import { uploadNoteImage } from '../../lib/storage-upload';

export type ReminderAttachment = AttachmentItem;

export interface ReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  reminder?: Reminder | null;
  events?: CalendarEvent[];
  defaultEventId?: string | null;
  onSave: (payload: {
    id?: string;
    title: string;
    description?: string;
    due_date_ms: number;
    priority?: ReminderPriority;
    control_level?: ReminderControlLevel;
    subtasks?: Subtask[];
    repeat_rule?: string | null;
    attachments?: string | null;
    links?: string | null;
    event_id?: string | null;
    offset_minutes?: number | null;
  }) => Promise<void>;
  onDelete?: (id: string) => Promise<void> | void;
}

type RecurrenceType = 'none' | 'daily' | 'weekly' | 'weekdays' | 'monthly' | 'yearly';

const WEEKDAYS = [
  { label: 'L', name: 'Lun', day: 1 },
  { label: 'M', name: 'Mar', day: 2 },
  { label: 'M', name: 'Mié', day: 3 },
  { label: 'J', name: 'Jue', day: 4 },
  { label: 'V', name: 'Vie', day: 5 },
  { label: 'S', name: 'Sáb', day: 6 },
  { label: 'D', name: 'Dom', day: 0 },
];

export const ReminderModal: React.FC<ReminderModalProps> = ({
  isOpen,
  onClose,
  reminder,
  events,
  defaultEventId,
  onSave,
  onDelete,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dateStr, setDateStr] = useState('');
  const [timeStr, setTimeStr] = useState('12:00');
  const [controlLevel, setControlLevel] = useState<ReminderControlLevel>('normal');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(
    reminder?.event_id ?? defaultEventId ?? null
  );

  // Advanced options state
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>('none');
  const [selectedDays, setSelectedDays] = useState<number[]>([1]); // Monday default for weekly
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [attachments, setAttachments] = useState<ReminderAttachment[]>([]);
  const [linkInput, setLinkInput] = useState('');
  const [showAddLinkForm, setShowAddLinkForm] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const [isUploading, setIsUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const notesInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (reminder) {
      setTitle(reminder.title || '');
      setDescription(reminder.description || '');
      setSelectedEventId(reminder.event_id || defaultEventId || null);
      const d = new Date(reminder.due_date_ms);
      setDateStr(toLocalYmd(d));
      setTimeStr(d.toTimeString().substring(0, 5));
      setControlLevel(
        reminder.control_level ||
          (reminder.priority === 3 ? 'critical' : reminder.priority === 2 ? 'strict' : 'normal')
      );
      setSubtasks(parseSubtasks(reminder.subtasks));

      // Parse recurrence
      const rawRule = reminder.repeat_rule || '';
      let parsedRecurrence: RecurrenceType = 'none';
      if (rawRule) {
        try {
          const parsed = JSON.parse(rawRule);
          if (parsed.type) parsedRecurrence = parsed.type;
          if (Array.isArray(parsed.days)) setSelectedDays(parsed.days);
          else if (Array.isArray(parsed.by_weekday)) setSelectedDays(parsed.by_weekday);
        } catch {
          if (rawRule.includes('daily') || rawRule.includes('diario')) parsedRecurrence = 'daily';
          else if (rawRule.includes('weekdays')) parsedRecurrence = 'weekdays';
          else if (rawRule.includes('weekly') || rawRule.includes('semanal')) parsedRecurrence = 'weekly';
          else if (rawRule.includes('monthly') || rawRule.includes('mensual')) parsedRecurrence = 'monthly';
          else if (rawRule.includes('yearly') || rawRule.includes('anual')) parsedRecurrence = 'yearly';
        }
      }
      setRecurrenceType(parsedRecurrence);

      // Parse attachments
      if (reminder.attachments) {
        try {
          const parsed = JSON.parse(reminder.attachments);
          setAttachments(Array.isArray(parsed) ? parsed : []);
        } catch {
          setAttachments([]);
        }
      } else {
        setAttachments([]);
      }

      // Auto-open advanced options if reminder has active advanced settings
      const hasAdvanced =
        parsedRecurrence !== 'none' ||
        (reminder.subtasks && parseSubtasks(reminder.subtasks).length > 0) ||
        Boolean(reminder.attachments);
      setIsAdvancedOpen(Boolean(hasAdvanced));
    } else {
      // Default new reminder: today + 2 hours
      const now = new Date();
      now.setHours(now.getHours() + 2);
      setDateStr(toLocalYmd(now));
      setTimeStr(now.toTimeString().substring(0, 5));
      setTitle('');
      setDescription('');
      setSelectedEventId(defaultEventId || null);
      setControlLevel('normal');
      setSubtasks([]);
      setAttachments([]);
      setRecurrenceType('none');
      setSelectedDays([new Date().getDay()]);
      setIsAdvancedOpen(false);
    }
    setNewSubtaskTitle('');
    setLinkInput('');
    setShowAddLinkForm(false);
    setShowDeleteConfirm(false);
    setError(null);
  }, [reminder, isOpen]);

  // Color dynamic tokens based on controlLevel
  const priorityTheme = useMemo(() => {
    switch (controlLevel) {
      case 'critical':
        return {
          color: '#EF4444',
          bg: 'rgba(239, 68, 68, 0.12)',
          border: 'rgba(239, 68, 68, 0.35)',
          label: 'CRÍTICO',
          desc: 'Alarma máxima con sonido continuo hasta confirmar',
          icon: ShieldAlert,
        };
      case 'strict':
        return {
          color: '#F59E0B',
          bg: 'rgba(245, 158, 11, 0.12)',
          border: 'rgba(245, 158, 11, 0.35)',
          label: 'ESTRICTO',
          desc: 'Alarma persistente e insistente que repite periódicamente',
          icon: AlertCircle,
        };
      case 'normal':
      default:
        return {
          color: '#64748B',
          bg: 'rgba(100, 116, 139, 0.12)',
          border: 'rgba(100, 116, 139, 0.35)',
          label: 'NORMAL',
          desc: 'Notificación estándar para tareas habituales',
          icon: Bell,
        };
    }
  }, [controlLevel]);

  // Count active advanced options
  const activeAdvancedCount = useMemo(() => {
    let count = 0;
    if (recurrenceType !== 'none') count++;
    if (subtasks.length > 0) count++;
    if (attachments.length > 0) count++;
    return count;
  }, [recurrenceType, subtasks, attachments]);

  // Subtasks actions
  const handleAddSubtask = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newSubtaskTitle.trim()) return;
    const newItem: Subtask = {
      id: 'st-' + Math.random().toString(36).substring(2, 9),
      title: newSubtaskTitle.trim(),
      completed: false,
    };
    setSubtasks([...subtasks, newItem]);
    setNewSubtaskTitle('');
  };

  const handleToggleSubtask = (id: string) => {
    setSubtasks(
      subtasks.map((st) => (st.id === id ? { ...st, completed: !st.completed } : st))
    );
  };

  const handleRemoveSubtask = (id: string) => {
    setSubtasks(subtasks.filter((s) => s.id !== id));
  };

  // Recurrence weekday toggle
  const toggleWeekday = (dayNum: number) => {
    if (selectedDays.includes(dayNum)) {
      if (selectedDays.length > 1) {
        setSelectedDays(selectedDays.filter((d) => d !== dayNum));
      }
    } else {
      setSelectedDays([...selectedDays, dayNum].sort());
    }
  };

  // Attachments & Clipboard Image Pasting Handlers
  const handleUploadFiles = async (files: (File | Blob)[]) => {
    if (!files || files.length === 0) return;

    try {
      setIsUploading(true);
      setError(null);
      setIsAdvancedOpen(true);

      const uploaded: ReminderAttachment[] = [];

      for (const file of files) {
        let fileName = 'imagen.png';
        if ('name' in file && file.name) {
          fileName = file.name;
        } else {
          const ext = file.type ? file.type.split('/')[1] || 'png' : 'png';
          fileName = `captura_${Date.now()}.${ext}`;
        }

        if (fileName === 'image.png') {
          const ext = file.type ? file.type.split('/')[1] || 'png' : 'png';
          fileName = `captura_${Date.now()}.${ext}`;
        }

        const namedFile =
          'name' in file && file.name === fileName
            ? (file as File)
            : new File([file], fileName, { type: file.type || 'image/png' });

        let uri = '';
        try {
          uri = await uploadNoteImage(namedFile);
        } catch (uploadErr) {
          console.warn('[ReminderModal] uploadNoteImage failed, using fallback Object URL:', uploadErr);
          uri = URL.createObjectURL(namedFile);
        }
        uploaded.push({ uri, name: fileName });
      }

      setAttachments((prev) => [...prev, ...uploaded]);
    } catch (err: unknown) {
      console.error('[ReminderModal] Error uploading files:', err);
      setError((err as Error).message || 'Error cargando imagen');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    await handleUploadFiles(Array.from(fileList));
  };

  // Listen for Clipboard Paste (Ctrl+V) anywhere while Modal is Open
  useEffect(() => {
    if (!isOpen) return;

    const handleWindowPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items || items.length === 0) return;

      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            imageFiles.push(file);
          }
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        handleUploadFiles(imageFiles);
      }
    };

    window.addEventListener('paste', handleWindowPaste);
    return () => {
      window.removeEventListener('paste', handleWindowPaste);
    };
  }, [isOpen]);

  const handleAddLink = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = linkInput.trim();
    if (!raw) return;
    const cleanUrl = raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`;
    setAttachments((prev) => [
      ...prev,
      { uri: cleanUrl, name: cleanUrl.replace(/^https?:\/\//, '') },
    ]);
    setLinkInput('');
    setShowAddLinkForm(false);
  };

  const handleRemoveAttachment = (idx: number) => {
    setAttachments(attachments.filter((_, i) => i !== idx));
  };

  // Submit handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('El título es requerido.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const [year, month, day] = dateStr.split('-').map(Number);
      const [hours, minutes] = timeStr.split(':').map(Number);
      const dueDate = new Date(year, month - 1, day, hours, minutes);

      const priorityNum: ReminderPriority =
        controlLevel === 'critical' ? 3 : controlLevel === 'strict' ? 2 : 1;

      // Recurrence rule JSON
      let repeatRule: string | null = null;
      if (recurrenceType === 'weekly') {
        repeatRule = JSON.stringify({ type: 'weekly', by_weekday: selectedDays });
      } else if (recurrenceType !== 'none') {
        repeatRule = JSON.stringify({ type: recurrenceType });
      }

      await onSave({
        id: reminder?.id,
        title: title.trim(),
        description: description.trim() || undefined,
        due_date_ms: dueDate.getTime(),
        control_level: controlLevel,
        priority: priorityNum,
        subtasks: subtasks.length > 0 ? subtasks : undefined,
        repeat_rule: repeatRule,
        attachments: attachments.length > 0 ? JSON.stringify(attachments) : null,
        event_id: selectedEventId || null,
      });

      onClose();
    } catch (err: unknown) {
      console.error('[ReminderModal] Error saving reminder:', err);
      setError((err as Error).message || 'Error guardando el recordatorio');
    } finally {
      setLoading(false);
    }
  };

  // Delete handler
  const handleDelete = async () => {
    if (!reminder?.id || !onDelete) return;
    try {
      setIsDeleting(true);
      await onDelete(reminder.id);
      onClose();
    } catch (err: unknown) {
      console.error('[ReminderModal] Delete error:', err);
      setError((err as Error).message || 'Error eliminando el recordatorio');
    } finally {
      setIsDeleting(false);
    }
  };

  // Sub-renderers for clean horizontal/vertical responsiveness
  const renderHeroCard = () => (
    <div
      className="rounded-xl border p-3.5 transition-all"
      style={{
        borderColor: priorityTheme.border,
        borderTopWidth: 3,
        borderTopColor: priorityTheme.color,
        backgroundColor: 'var(--color-card, rgba(255, 255, 255, 0.03))',
      }}
    >
      {/* Header pill */}
      <div className="flex items-center justify-between mb-2">
        <div
          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wider"
          style={{
            backgroundColor: priorityTheme.bg,
            color: priorityTheme.color,
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: priorityTheme.color }}
          />
          <span>RECORDATORIO • {priorityTheme.label}</span>
        </div>

        {reminder && (
          <span className="text-[11px] text-veyra-subtle font-mono">
            ID: {reminder.id.substring(0, 8)}...
          </span>
        )}
      </div>

      {/* Title Input con autocompletado de # */}
      <HashtagInput
        required
        autoFocus
        placeholder="¿Qué necesitas recordar?"
        value={title}
        onChange={(val) => setTitle(val)}
        availableTags={['deberes', 'taller', 'apuntes', 'examen', 'urgente', 'trabajo']}
        containerClassName="mb-2"
        inputClassName="w-full bg-transparent text-veyra-text text-base font-semibold placeholder:text-veyra-subtle focus:outline-none border-none p-0"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            notesInputRef.current?.focus();
          }
        }}
      />

      <div className="h-px bg-veyra-border/60 my-2" />

      {/* Notes description */}
      <textarea
        ref={notesInputRef}
        rows={2}
        placeholder="Añadir notas o detalles adicionales..."
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="w-full bg-transparent text-veyra-text placeholder:text-veyra-subtle text-xs focus:outline-none resize-none border-none p-0 leading-relaxed"
      />
    </div>
  );

  const renderDateTime = () => (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-veyra-muted flex items-center gap-1.5">
        <CalendarIcon className="w-3.5 h-3.5 text-accent" />
        <span>Fecha y Hora</span>
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div className="relative">
          <Input
            type="date"
            value={dateStr}
            onChange={(e) => setDateStr(e.target.value)}
            required
          />
        </div>
        <div className="relative">
          <Input
            type="time"
            value={timeStr}
            onChange={(e) => setTimeStr(e.target.value)}
            required
          />
        </div>
      </div>
    </div>
  );

  const renderEventSelector = () => {
    if (!events || events.length === 0) return null;
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-veyra-muted flex items-center gap-1.5">
            <CalendarIcon className="w-3.5 h-3.5 text-accent" />
            <span>Evento asociado (opcional)</span>
          </label>
          {selectedEventId && (
            <button
              type="button"
              onClick={() => setSelectedEventId(null)}
              className="text-[10.5px] text-accent hover:underline cursor-pointer"
            >
              Desvincular
            </button>
          )}
        </div>
        <select
          value={selectedEventId || ''}
          onChange={(e) => setSelectedEventId(e.target.value || null)}
          className="w-full px-2.5 py-1.5 rounded-lg bg-veyra-elevated border border-veyra-border text-xs text-veyra-text focus:outline-none focus:border-accent cursor-pointer transition-colors"
        >
          <option value="">Ninguno (Recordatorio independiente)</option>
          {events.map((ev) => {
            const d = new Date(ev.start_time_ms);
            const dateStr = d.toLocaleDateString([], {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
            });
            const timeStr = d.toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            });
            return (
              <option key={ev.id} value={ev.id}>
                {ev.title} ({dateStr} {timeStr})
              </option>
            );
          })}
        </select>
      </div>
    );
  };

  const renderControlLevel = () => (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-veyra-muted flex items-center gap-1.5">
          <Bell className="w-3.5 h-3.5 text-accent" />
          <span>Nivel de Control & Insistencia</span>
        </label>
        <span className="text-[11px] text-veyra-subtle font-medium truncate max-w-[200px]" title={priorityTheme.desc}>
          {priorityTheme.desc}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          {
            key: 'normal' as ReminderControlLevel,
            label: 'Normal',
            desc: 'Estándar',
            icon: Bell,
            color: '#64748B',
          },
          {
            key: 'strict' as ReminderControlLevel,
            label: 'Estricto',
            desc: 'Insistente',
            icon: AlertCircle,
            color: '#F59E0B',
          },
          {
            key: 'critical' as ReminderControlLevel,
            label: 'Crítico',
            desc: 'Alarma Máxima',
            icon: ShieldAlert,
            color: '#EF4444',
          },
        ].map((opt) => {
          const isSelected = controlLevel === opt.key;
          const IconComp = opt.icon;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => setControlLevel(opt.key)}
              className={cn(
                'p-2.5 rounded-lg border text-left transition-all select-none cursor-pointer flex flex-col gap-0.5',
                isSelected
                  ? 'border-transparent shadow-sm'
                  : 'border-veyra-border bg-veyra-card/50 text-veyra-muted hover:border-accent/40'
              )}
              style={{
                backgroundColor: isSelected ? `${opt.color}18` : undefined,
                borderColor: isSelected ? opt.color : undefined,
              }}
            >
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <IconComp
                  className="w-3.5 h-3.5 shrink-0"
                  style={{ color: isSelected ? opt.color : 'inherit' }}
                />
                <span style={{ color: isSelected ? opt.color : undefined }}>
                  {opt.label}
                </span>
              </div>
              <span className="text-[10px] text-veyra-subtle leading-tight">
                {opt.desc}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderAdvancedPanel = () => (
    <div className="rounded-xl border border-veyra-border bg-veyra-card/30 p-3.5 space-y-3.5">
      {/* Header con botón para contraer */}
      <div className="flex items-center justify-between pb-2 border-b border-veyra-border/60">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-accent/15 flex items-center justify-center text-accent">
            <Sliders className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-semibold text-veyra-text">
            Opciones avanzadas
          </span>
          {activeAdvancedCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-accent/20 border border-accent/40 text-accent text-[10px] font-semibold">
              {activeAdvancedCount} {activeAdvancedCount === 1 ? 'activa' : 'activas'}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setIsAdvancedOpen(false)}
          className="text-xs text-veyra-subtle hover:text-veyra-text flex items-center gap-1 px-2 py-0.5 rounded hover:bg-veyra-card transition-colors cursor-pointer"
        >
          <span>Contraer</span>
          <ChevronDown className="w-3.5 h-3.5 rotate-180" />
        </button>
      </div>

      {/* 4.1 REPETICIÓN */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-veyra-muted flex items-center gap-1.5">
            <Repeat className="w-3.5 h-3.5 text-accent" />
            <span>Repetir recordatorio</span>
          </label>
          <span className="text-[11px] text-veyra-subtle">
            {recurrenceType === 'none'
              ? 'Evento único'
              : recurrenceType === 'daily'
              ? 'Todos los días'
              : recurrenceType === 'weekly'
              ? 'Semanal'
              : recurrenceType === 'weekdays'
              ? 'Lunes a Viernes'
              : recurrenceType === 'monthly'
              ? 'Mensual'
              : 'Anual'}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {[
            { key: 'none' as RecurrenceType, label: 'No repetir' },
            { key: 'daily' as RecurrenceType, label: 'Diario' },
            { key: 'weekly' as RecurrenceType, label: 'Semanal' },
            { key: 'weekdays' as RecurrenceType, label: 'Lun a Vie' },
            { key: 'monthly' as RecurrenceType, label: 'Mensual' },
            { key: 'yearly' as RecurrenceType, label: 'Anual' },
          ].map((rec) => {
            const isSelected = recurrenceType === rec.key;
            return (
              <button
                key={rec.key}
                type="button"
                onClick={() => setRecurrenceType(rec.key)}
                className={cn(
                  'py-1.5 px-2 rounded-lg text-xs font-medium border text-center transition-all cursor-pointer',
                  isSelected
                    ? 'bg-accent/15 border-accent text-accent font-semibold'
                    : 'bg-veyra-card border-veyra-border text-veyra-muted hover:border-accent/40'
                )}
              >
                {rec.label}
              </button>
            );
          })}
        </div>

        {/* Weekday selector when 'weekly' is active */}
        {recurrenceType === 'weekly' && (
          <div className="pt-1">
            <div className="text-[11px] text-veyra-subtle mb-1">
              Días de la semana:
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              {WEEKDAYS.map((wd) => {
                const isDaySelected = selectedDays.includes(wd.day);
                return (
                  <button
                    key={wd.day}
                    type="button"
                    onClick={() => toggleWeekday(wd.day)}
                    title={wd.name}
                    className={cn(
                      'w-7 h-7 rounded-md text-xs font-semibold flex items-center justify-center transition-all cursor-pointer border',
                      isDaySelected
                        ? 'bg-accent text-white border-accent'
                        : 'bg-veyra-card border-veyra-border text-veyra-muted hover:border-accent/50'
                    )}
                  >
                    {wd.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="h-px bg-veyra-border/60" />

      {/* 4.2 SUBTAREAS */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-veyra-muted flex items-center gap-1.5">
            <CheckSquare className="w-3.5 h-3.5 text-accent" />
            <span>Subtareas</span>
          </label>
          {subtasks.length > 0 && (
            <span className="text-[11px] font-semibold text-accent bg-accent/15 px-2 py-0.5 rounded-full">
              {subtasks.filter((s) => s.completed).length}/{subtasks.length} completadas
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Desglosa en pasos o subtareas..."
            value={newSubtaskTitle}
            onChange={(e) => setNewSubtaskTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddSubtask();
              }
            }}
            className="flex-1 bg-veyra-card border border-veyra-border text-veyra-text placeholder:text-veyra-subtle rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={() => handleAddSubtask()}
            disabled={!newSubtaskTitle.trim()}
            className="p-1.5 rounded-lg bg-veyra-elevated border border-veyra-border hover:border-accent/40 text-veyra-text hover:text-accent disabled:opacity-40 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {subtasks.length > 0 && (
          <div className="space-y-1 max-h-28 overflow-y-auto p-1.5 rounded-lg bg-veyra-card/50 border border-veyra-border">
            {subtasks.map((st) => (
              <div
                key={st.id}
                className="flex items-center justify-between gap-2 px-2.5 py-1 rounded-md bg-veyra-card border border-veyra-border text-xs group"
              >
                <div
                  className="flex items-center gap-2 flex-1 cursor-pointer select-none min-w-0"
                  onClick={() => handleToggleSubtask(st.id)}
                >
                  <div
                    className={cn(
                      'w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors shrink-0',
                      st.completed
                        ? 'bg-accent border-accent text-white'
                        : 'border-veyra-border bg-veyra-elevated hover:border-accent'
                    )}
                  >
                    {st.completed && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                  </div>
                  <span
                    className={cn(
                      'truncate text-[11px]',
                      st.completed
                        ? 'line-through text-veyra-subtle'
                        : 'text-veyra-text font-medium'
                    )}
                  >
                    {st.title}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleRemoveSubtask(st.id)}
                  className="p-0.5 text-veyra-subtle hover:text-red-400 opacity-70 group-hover:opacity-100 transition-opacity cursor-pointer shrink-0"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="h-px bg-veyra-border/60" />

      {/* 4.3 ARCHIVOS ADJUNTOS Y ENLACES */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-veyra-muted flex items-center gap-1.5">
            <Paperclip className="w-3.5 h-3.5 text-accent" />
            <span>Adjuntos y Enlaces</span>
          </label>
          <span className="text-[11px] text-veyra-subtle">
            {attachments.length} {attachments.length === 1 ? 'adjunto' : 'adjuntos'}
          </span>
        </div>

        <div
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('Files')) {
              e.preventDefault();
              setIsDragging(true);
            }
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              handleUploadFiles(Array.from(e.dataTransfer.files));
            }
          }}
          className={cn(
            'p-2 rounded-lg border transition-all',
            isDragging
              ? 'border-accent bg-accent/10'
              : 'border-dashed border-veyra-border/80 bg-veyra-card/30'
          )}
        >
          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileInputChange}
              className="hidden"
              multiple
              accept="image/*,.pdf,.doc,.docx"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-veyra-border hover:border-accent/60 bg-veyra-elevated text-xs text-veyra-muted hover:text-veyra-text transition-all cursor-pointer disabled:opacity-50"
              title="Haz clic para seleccionar archivo o pega imágenes directamente con Ctrl+V"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 text-accent animate-spin" />
                  <span className="text-accent font-medium">Subiendo imagen...</span>
                </>
              ) : (
                <>
                  <Paperclip className="w-3.5 h-3.5 text-accent" />
                  <span>Adjuntar archivo</span>
                  <span className="text-[10px] text-accent/80 font-medium bg-accent/10 px-1.5 py-0.5 rounded">
                    o pegar con Ctrl+V
                  </span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setShowAddLinkForm(!showAddLinkForm)}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-veyra-border bg-veyra-elevated text-xs text-veyra-muted hover:text-veyra-text hover:border-accent/40 transition-all cursor-pointer"
            >
              <LinkIcon className="w-3.5 h-3.5 text-accent" />
              <span>Enlace Web</span>
            </button>
          </div>
          {isDragging && (
            <div className="text-center text-xs text-accent font-medium pt-2 animate-pulse">
              Suelta las imágenes o archivos aquí para adjuntarlos
            </div>
          )}
        </div>

        {showAddLinkForm && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-veyra-card border border-veyra-border">
            <input
              type="url"
              placeholder="https://..."
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddLink(e);
                }
              }}
              className="flex-1 bg-veyra-elevated border border-veyra-border text-veyra-text placeholder:text-veyra-subtle rounded-md px-2.5 py-1 text-xs focus:outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={handleAddLink}
              disabled={!linkInput.trim()}
              className="px-2.5 py-1 rounded-md bg-accent text-white text-xs font-medium hover:opacity-90 disabled:opacity-40 cursor-pointer"
            >
              Añadir
            </button>
          </div>
        )}

        {attachments.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
            {attachments.map((att, idx) => {
              const isImg = isImageAttachment(att.uri) || isImageAttachment(att.name);
              return (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-veyra-card border border-veyra-border text-xs group hover:border-accent/40 transition-colors"
                >
                  <a
                    href={att.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 flex-1 min-w-0 hover:text-accent transition-colors"
                    title={att.name}
                  >
                    {isImg ? (
                      <img
                        src={att.uri}
                        alt={att.name}
                        className="w-8 h-8 rounded object-cover border border-veyra-border/60 shrink-0 bg-black/10"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <FileText className="w-3.5 h-3.5 text-accent shrink-0" />
                    )}
                    <span className="truncate text-veyra-text font-medium text-[11px]">
                      {att.name}
                    </span>
                    <ExternalLink className="w-3 h-3 text-veyra-subtle shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </a>
                  <button
                    type="button"
                    onClick={() => handleRemoveAttachment(idx)}
                    className="p-1 text-veyra-subtle hover:text-red-400 opacity-60 group-hover:opacity-100 transition-opacity cursor-pointer shrink-0"
                    title="Eliminar adjunto"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={reminder ? 'Editar Recordatorio' : 'Nuevo Recordatorio'}
      description="Sincronización en tiempo real con tu teléfono móvil"
      maxWidth={isAdvancedOpen ? '4xl' : 'lg'}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center justify-between">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-red-400 hover:text-red-300 ml-2"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* ─── CONTENIDO: LAYOUT ADAPTATIVO HORIZONTAL ─── */}
        {!isAdvancedOpen ? (
          /* Vista compacta cuando opciones avanzadas están contraídas */
          <div className="space-y-4">
            {renderHeroCard()}
            {renderDateTime()}
            {renderEventSelector()}
            {renderControlLevel()}

            {/* Botón para desplegar opciones avanzadas */}
            <button
              type="button"
              onClick={() => setIsAdvancedOpen(true)}
              className="w-full flex items-center justify-between p-3 rounded-xl border border-veyra-border bg-veyra-card/30 hover:bg-veyra-card/70 transition-colors cursor-pointer text-left"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-accent/15 flex items-center justify-center text-accent">
                  <Sliders className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-veyra-text">
                      Opciones avanzadas
                    </span>
                    {activeAdvancedCount > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full bg-accent/20 border border-accent/40 text-accent text-[10px] font-semibold">
                        {activeAdvancedCount} {activeAdvancedCount === 1 ? 'activa' : 'activas'}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-veyra-subtle">
                    Repetición, subtareas, archivos adjuntos...
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-accent font-medium">
                <span>Desplegar</span>
                <ChevronDown className="w-4 h-4" />
              </div>
            </button>
          </div>
        ) : (
          /* Vista horizontal de 2 columnas cuando opciones avanzadas están desplegadas */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
            {/* Columna Izquierda: Información Principal */}
            <div className="space-y-3.5">
              {renderHeroCard()}
              {renderDateTime()}
              {renderEventSelector()}
              {renderControlLevel()}
            </div>

            {/* Columna Derecha: Opciones Avanzadas */}
            {renderAdvancedPanel()}
          </div>
        )}

        {/* ─── FOOTER CON ACCIONES (Sticky, siempre accesible) ─── */}
        <div className="sticky bottom-0 bg-veyra-elevated/95 backdrop-blur-xs pt-3 mt-4 border-t border-veyra-border flex items-center justify-between gap-3 z-10">
          <div>
            {reminder && onDelete && !showDeleteConfirm && (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 py-1.5 px-2 rounded hover:bg-red-500/10 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Eliminar</span>
              </button>
            )}

            {showDeleteConfirm && (
              <div className="flex items-center gap-2 animate-in fade-in">
                <span className="text-[11px] text-red-400 font-medium">¿Eliminar?</span>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="px-2 py-1 rounded bg-red-500 text-white text-[11px] font-semibold hover:bg-red-600 cursor-pointer disabled:opacity-50"
                >
                  {isDeleting ? 'Borrando...' : 'Sí, eliminar'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-2 py-1 rounded bg-veyra-card border border-veyra-border text-[11px] text-veyra-muted hover:text-veyra-text cursor-pointer"
                >
                  No
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              loading={loading}
              disabled={!title.trim()}
              size="sm"
              className="gap-1.5"
            >
              <Check className="w-3.5 h-3.5 stroke-[3]" />
              <span>{reminder ? 'Guardar Cambios' : 'Crear Recordatorio'}</span>
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
};
