import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Modal } from '../../components/common/Modal';
import { Input } from '../../components/common/Input';
import { Button } from '../../components/common/Button';
import { HashtagInput } from '../../components/common/HashtagInput';
import {
  Calendar as CalendarIcon,
  MapPin,
  Tag as TagIcon,
  X,
  Plus,
  Repeat,
  Bell,
  Sliders,
  Check,
  Trash2,
  ChevronDown,
  FileText,
  Cake,
  Paperclip,
  Link as LinkIcon,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import type { CalendarEvent } from '../../hooks/useEvents';
import type { Note } from '../../types/notes';
import { cn, isImageAttachment, type AttachmentItem } from '../../lib/utils';
import { getDeviceTimezone } from '../../services/recurrence/recurrenceEngine';
import { uploadNoteImage } from '../../lib/storage-upload';

export interface EventModalProps {
  isOpen: boolean;
  onClose: () => void;
  event?: CalendarEvent | null;
  allNotes?: Note[];
  onSave: (payload: {
    id?: string;
    title: string;
    description?: string;
    start_time_ms: number;
    end_time_ms: number;
    location?: string;
    color?: string;
    is_all_day?: boolean;
    all_day_date?: string | null;
    timezone?: string;
    tags?: string[] | null;
    repeat_rule?: string | null;
    recurrence_rule?: string | null;
    is_birthday_like?: boolean;
    notification_offset_min?: number | null;
    notification_offsets?: string | null;
    note_id?: string | null;
    attachments?: string | null;
  }) => Promise<void>;
  onDelete?: (id: string) => Promise<void> | void;
}

const EVENT_COLORS = [
  { value: '#3B82F6', label: 'Azul' },
  { value: '#8B5CF6', label: 'Morado' },
  { value: '#EC4899', label: 'Rosa' },
  { value: '#F59E0B', label: 'Ámbar' },
  { value: '#10B981', label: 'Verde' },
  { value: '#EF4444', label: 'Rojo' },
  { value: '#06B6D4', label: 'Cian' },
  { value: '#6366F1', label: 'Índigo' },
];

const AVAILABLE_OFFSETS: { label: string; value: number }[] = [
  { label: 'A la hora del evento', value: 0 },
  { label: '5 min antes', value: 5 },
  { label: '10 min antes', value: 10 },
  { label: '15 min antes', value: 15 },
  { label: '30 min antes', value: 30 },
  { label: '1 hora antes', value: 60 },
  { label: '2 horas antes', value: 120 },
  { label: '1 día antes', value: 1440 },
  { label: '2 días antes', value: 2880 },
  { label: '1 semana antes', value: 10080 },
];

const WEEKDAYS = [
  { label: 'L', name: 'Lun', day: 1 },
  { label: 'M', name: 'Mar', day: 2 },
  { label: 'M', name: 'Mié', day: 3 },
  { label: 'J', name: 'Jue', day: 4 },
  { label: 'V', name: 'Vie', day: 5 },
  { label: 'S', name: 'Sáb', day: 6 },
  { label: 'D', name: 'Dom', day: 0 },
];

type ExtendedRecurrence = 'none' | 'daily' | 'weekly' | 'weekdays' | 'monthly' | 'yearly';

const looksLikeBirthday = (text: string) => {
  const lower = text.toLowerCase();
  return (
    lower.includes('cumple') ||
    lower.includes('cumpleaños') ||
    lower.includes('aniversario') ||
    lower.includes('birthday') ||
    lower.includes('bday')
  );
};

export const EventModal: React.FC<EventModalProps> = ({
  isOpen,
  onClose,
  event,
  allNotes = [],
  onSave,
  onDelete,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dateStr, setDateStr] = useState('');
  const [startTimeStr, setStartTimeStr] = useState('09:00');
  const [endTimeStr, setEndTimeStr] = useState('10:00');
  const [isAllDay, setIsAllDay] = useState(false);
  const [location, setLocation] = useState('');
  const [color, setColor] = useState('#3B82F6');

  // Advanced options
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [recurrence, setRecurrence] = useState<ExtendedRecurrence>('none');
  const [selectedDays, setSelectedDays] = useState<number[]>([1]);
  const [selectedOffsets, setSelectedOffsets] = useState<number[]>([15]); // default 15 min before
  const [linkedNoteId, setLinkedNoteId] = useState<string>('');
  const [isBirthdayLike, setIsBirthdayLike] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [linkInput, setLinkInput] = useState('');
  const [showAddLinkForm, setShowAddLinkForm] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const [loading, setLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const notesInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (event) {
      setTitle(event.title || '');
      setDescription(event.description || '');
      setLocation(event.location || '');
      setColor(event.color || '#3B82F6');
      setIsAllDay(Boolean(event.is_all_day));
      setLinkedNoteId(event.note_id || '');

      const s = Number(event.start_time_ms) || Date.now();
      const e = Number(event.end_time_ms) || s + 60 * 60 * 1000;
      const startDate = new Date(s);
      const endDate = new Date(e);

      setDateStr(startDate.toISOString().split('T')[0]);
      setStartTimeStr(startDate.toTimeString().substring(0, 5));
      setEndTimeStr(endDate.toTimeString().substring(0, 5));

      // Birthday detection
      const rawBirthday = (event as any).is_birthday_like;
      setIsBirthdayLike(Boolean(rawBirthday) || looksLikeBirthday(event.title || ''));

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
      const rawRule = event.recurrence_rule || event.repeat_rule || '';
      let parsedRec: ExtendedRecurrence = 'none';
      if (rawRule) {
        try {
          const parsed = JSON.parse(rawRule);
          if (parsed.type) parsedRec = parsed.type;
          if (Array.isArray(parsed.by_weekday)) setSelectedDays(parsed.by_weekday);
          else if (Array.isArray(parsed.days)) setSelectedDays(parsed.days);
        } catch {
          if (rawRule.includes('daily') || rawRule.includes('diario')) parsedRec = 'daily';
          else if (rawRule.includes('weekdays')) parsedRec = 'weekdays';
          else if (rawRule.includes('weekly') || rawRule.includes('semanal')) parsedRec = 'weekly';
          else if (rawRule.includes('monthly') || rawRule.includes('mensual')) parsedRec = 'monthly';
          else if (rawRule.includes('yearly') || rawRule.includes('anual')) parsedRec = 'yearly';
        }
      }
      setRecurrence(parsedRec);

      // Parse notification offsets
      const rawOffsets = (event as any).notification_offsets;
      const primaryOffset = (event as any).notification_offset_min;
      if (rawOffsets) {
        try {
          const parsed = JSON.parse(rawOffsets);
          if (Array.isArray(parsed)) setSelectedOffsets(parsed);
        } catch {
          setSelectedOffsets(primaryOffset !== undefined && primaryOffset !== null ? [primaryOffset] : [15]);
        }
      } else if (primaryOffset !== undefined && primaryOffset !== null) {
        setSelectedOffsets([primaryOffset]);
      } else {
        setSelectedOffsets([15]);
      }

      // Parse attachments
      const rawAtt = (event as any)?.attachments;
      if (rawAtt) {
        try {
          const parsed = JSON.parse(rawAtt);
          setAttachments(Array.isArray(parsed) ? parsed : []);
        } catch {
          setAttachments([]);
        }
      } else {
        setAttachments([]);
      }

      // Auto expand advanced if event has active advanced options
      const hasAdvanced =
        parsedRec !== 'none' ||
        Boolean(event.note_id) ||
        (Array.isArray(event.tags) && event.tags.length > 0) ||
        Boolean((event as any).notification_offsets) ||
        Boolean((event as any).attachments);
      setIsAdvancedOpen(Boolean(hasAdvanced));
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
      setSelectedDays([now.getDay()]);
      setSelectedOffsets([15]);
      setLinkedNoteId('');
      setIsBirthdayLike(false);
      setTags([]);
      setAttachments([]);
      setIsAdvancedOpen(false);
    }
    setNewTagInput('');
    setLinkInput('');
    setShowAddLinkForm(false);
    setShowDeleteConfirm(false);
    setError(null);
  }, [event, isOpen]);

  // Check title on blur for birthday keyword
  const handleTitleBlur = () => {
    if (!isBirthdayLike && looksLikeBirthday(title)) {
      setIsBirthdayLike(true);
      if (recurrence === 'none') {
        setRecurrence('yearly');
      }
    }
  };

  // Color label finder
  const currentColorObj = useMemo(() => {
    return EVENT_COLORS.find((c) => c.value.toLowerCase() === color.toLowerCase()) || EVENT_COLORS[0];
  }, [color]);

  // Active advanced count
  const activeAdvancedCount = useMemo(() => {
    let count = 0;
    if (recurrence !== 'none') count++;
    if (selectedOffsets.length > 0 && !(selectedOffsets.length === 1 && selectedOffsets[0] === 15)) count++;
    if (linkedNoteId) count++;
    if (tags.length > 0) count++;
    if (attachments.length > 0) count++;
    return count;
  }, [recurrence, selectedOffsets, linkedNoteId, tags, attachments]);

  // Attachments & Clipboard Image Pasting Handlers
  const handleUploadFiles = async (files: (File | Blob)[]) => {
    if (!files || files.length === 0) return;

    try {
      setIsUploading(true);
      setError(null);
      setIsAdvancedOpen(true);

      const uploaded: AttachmentItem[] = [];

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
          console.warn('[EventModal] uploadNoteImage failed, using fallback Object URL:', uploadErr);
          uri = URL.createObjectURL(namedFile);
        }
        uploaded.push({ uri, name: fileName });
      }

      setAttachments((prev) => [...prev, ...uploaded]);
    } catch (err: unknown) {
      console.error('[EventModal] Error uploading files:', err);
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

  // Tag actions
  const handleAddTag = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
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

  // Toggle offset in multi-selection
  const toggleOffset = (offsetVal: number) => {
    if (selectedOffsets.includes(offsetVal)) {
      setSelectedOffsets(selectedOffsets.filter((o) => o !== offsetVal));
    } else {
      setSelectedOffsets([...selectedOffsets, offsetVal].sort((a, b) => a - b));
    }
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

  // Handle start time change with smart end time adjustment
  const handleStartTimeChange = (newStartTime: string) => {
    setStartTimeStr(newStartTime);
    const [sH, sM] = newStartTime.split(':').map(Number);
    const [eH, eM] = endTimeStr.split(':').map(Number);
    const sMinutes = sH * 60 + sM;
    const eMinutes = eH * 60 + eM;

    if (eMinutes <= sMinutes) {
      const nextEndMin = sMinutes + 60;
      const finalEndH = Math.min(23, Math.floor(nextEndMin / 60));
      const finalEndM = nextEndMin % 60;
      setEndTimeStr(
        `${String(finalEndH).padStart(2, '0')}:${String(finalEndM).padStart(2, '0')}`
      );
    }
  };

  // Submit handler
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
      const tz = getDeviceTimezone();

      let startMs: number;
      let endMs: number;
      let allDayDate: string | null = null;

      if (isAllDay) {
        allDayDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        startMs = new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
        endMs = new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
      } else {
        const [startHours, startMinutes] = startTimeStr.split(':').map(Number);
        const [endHours, endMinutes] = endTimeStr.split(':').map(Number);
        const start = new Date(year, month - 1, day, startHours, startMinutes, 0, 0);
        const end = new Date(year, month - 1, day, endHours, endMinutes, 0, 0);

        if (end.getTime() <= start.getTime()) {
          setError('La hora de finalización debe ser posterior a la de inicio.');
          setLoading(false);
          return;
        }

        startMs = start.getTime();
        endMs = end.getTime();
      }

      // Build Recurrence Rule objects identical to Android
      let recurrenceRuleObj: any = null;
      if (recurrence === 'daily') {
        recurrenceRuleObj = { type: 'daily', interval: 1 };
      } else if (recurrence === 'weekly') {
        recurrenceRuleObj = { type: 'weekly', interval: 1, by_weekday: selectedDays };
      } else if (recurrence === 'weekdays') {
        recurrenceRuleObj = { type: 'weekdays' };
      } else if (recurrence === 'monthly') {
        recurrenceRuleObj = { type: 'monthly', interval: 1, by_monthday: [day] };
      } else if (recurrence === 'yearly') {
        recurrenceRuleObj = {
          type: 'yearly',
          interval: 1,
          by_month: month,
          by_monthday: day,
        };
      }

      const recurrenceRuleJson = recurrenceRuleObj ? JSON.stringify(recurrenceRuleObj) : null;
      const legacyRepeatRule =
        recurrenceRuleObj && recurrence === 'weekly'
          ? JSON.stringify({ type: 'weekly', days: selectedDays })
          : recurrenceRuleJson;

      const notificationOffsetsJson =
        selectedOffsets.length > 0 ? JSON.stringify(selectedOffsets) : null;
      const primaryOffset = selectedOffsets.length > 0 ? selectedOffsets[0] : null;

      const detectedBirthday = isBirthdayLike || looksLikeBirthday(title);

      await onSave({
        id: event?.id,
        title: title.trim(),
        description: description.trim() || undefined,
        start_time_ms: startMs,
        end_time_ms: endMs,
        location: location.trim() || undefined,
        color,
        is_all_day: isAllDay,
        all_day_date: allDayDate,
        timezone: tz,
        tags: tags.length > 0 ? tags : null,
        repeat_rule: legacyRepeatRule,
        recurrence_rule: recurrenceRuleJson,
        is_birthday_like: detectedBirthday,
        notification_offset_min: primaryOffset,
        notification_offsets: notificationOffsetsJson,
        note_id: linkedNoteId || null,
        attachments: attachments.length > 0 ? JSON.stringify(attachments) : null,
      });

      onClose();
    } catch (err: unknown) {
      console.error('[EventModal] Error saving event:', err);
      setError((err as Error).message || 'Error guardando el evento');
    } finally {
      setLoading(false);
    }
  };

  // Delete handler
  const handleDelete = async () => {
    if (!event?.id || !onDelete) return;
    try {
      setIsDeleting(true);
      await onDelete(event.id);
      onClose();
    } catch (err: unknown) {
      console.error('[EventModal] Delete error:', err);
      setError((err as Error).message || 'Error eliminando el evento');
    } finally {
      setIsDeleting(false);
    }
  };

  // Sub-renderers for clean horizontal/vertical responsiveness
  const renderHeroCard = () => (
    <div
      className="rounded-xl border p-3.5 transition-all"
      style={{
        borderColor: `${color}40`,
        borderTopWidth: 3,
        borderTopColor: color,
        backgroundColor: 'var(--color-card, rgba(255, 255, 255, 0.03))',
      }}
    >
      {/* Header pill */}
      <div className="flex items-center justify-between mb-2">
        <div
          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wider"
          style={{
            backgroundColor: `${color}18`,
            color: color,
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
          <span>
            {isBirthdayLike
              ? 'CUMPLEAÑOS / ANIVERSARIO'
              : `EVENTO • ${currentColorObj.label.toUpperCase()}`}
          </span>
        </div>

        {isBirthdayLike && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-pink-400 bg-pink-500/10 px-2 py-0.5 rounded-full">
            <Cake className="w-3 h-3" />
            <span>Cumpleaños</span>
          </span>
        )}
      </div>

      {/* Title Input con autocompletado de # */}
      <HashtagInput
        required
        autoFocus
        placeholder="¿Cuál es el nombre del evento o reunión?"
        value={title}
        onChange={(val) => setTitle(val)}
        onBlur={handleTitleBlur}
        availableTags={['clase', 'trabajo', 'universidad', 'reunion', 'proyecto']}
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
        placeholder="Detalles, enlaces de videoconferencia o agenda..."
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="w-full bg-transparent text-veyra-text placeholder:text-veyra-subtle text-xs focus:outline-none resize-none border-none p-0 leading-relaxed"
      />
    </div>
  );

  const renderDateTime = () => (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-veyra-muted flex items-center gap-1.5">
          <CalendarIcon className="w-3.5 h-3.5 text-accent" />
          <span>Fecha y Horario</span>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-veyra-muted cursor-pointer select-none hover:text-veyra-text">
          <input
            type="checkbox"
            checked={isAllDay}
            onChange={(e) => setIsAllDay(e.target.checked)}
            className="rounded border-veyra-border text-accent focus:ring-accent w-3.5 h-3.5 cursor-pointer"
          />
          <span className="font-medium">Todo el día</span>
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className={isAllDay ? 'sm:col-span-3' : 'sm:col-span-1'}>
          <Input
            label="Fecha"
            type="date"
            value={dateStr}
            onChange={(e) => setDateStr(e.target.value)}
            required
          />
        </div>

        {!isAllDay && (
          <>
            <Input
              label="Inicio"
              type="time"
              value={startTimeStr}
              onChange={(e) => handleStartTimeChange(e.target.value)}
              required
            />
            <Input
              label="Fin"
              type="time"
              value={endTimeStr}
              onChange={(e) => setEndTimeStr(e.target.value)}
              required
            />
          </>
        )}
      </div>
    </div>
  );

  const renderLocationAndColor = () => (
    <div className="space-y-3">
      {/* Ubicación */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-veyra-muted flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-accent" />
            <span>Ubicación o Enlace</span>
          </label>
          <div className="flex items-center gap-1">
            {['Google Meet', 'Zoom', 'Presencial'].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setLocation(preset)}
                className="px-2 py-0.5 rounded text-[10px] bg-veyra-card hover:bg-veyra-elevated border border-veyra-border text-veyra-subtle hover:text-veyra-text transition-colors cursor-pointer"
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        <Input
          placeholder="Ej. Oficina Central, Google Meet, Zoom, Sala 3..."
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
      </div>

      {/* Color Identificador */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-veyra-muted">Color identificador</span>
          <span className="text-[11px] text-veyra-subtle font-medium">
            {currentColorObj.label}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {EVENT_COLORS.map((c) => {
            const isSelected = color.toLowerCase() === c.value.toLowerCase();
            return (
              <button
                key={c.value}
                type="button"
                title={c.label}
                onClick={() => setColor(c.value)}
                style={{ backgroundColor: c.value }}
                className={cn(
                  'w-6 h-6 rounded-full transition-all cursor-pointer flex items-center justify-center border border-white/20',
                  isSelected
                    ? 'ring-2 ring-offset-2 ring-accent scale-110 shadow-md'
                    : 'hover:scale-105 opacity-80 hover:opacity-100'
                )}
              >
                {isSelected && <Check className="w-3 h-3 text-white stroke-[3]" />}
              </button>
            );
          })}
        </div>
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

      {/* 5.1 REPETICIÓN */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-veyra-muted flex items-center gap-1.5">
            <Repeat className="w-3.5 h-3.5 text-accent" />
            <span>Repetir evento</span>
          </label>
          <span className="text-[11px] text-veyra-subtle">
            {recurrence === 'none'
              ? 'Evento único'
              : recurrence === 'daily'
              ? 'Todos los días'
              : recurrence === 'weekly'
              ? 'Semanal'
              : recurrence === 'weekdays'
              ? 'Lunes a Viernes'
              : recurrence === 'monthly'
              ? 'Mensual'
              : 'Anual (Cumpleaños)'}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {[
            { key: 'none' as ExtendedRecurrence, label: 'No repetir' },
            { key: 'daily' as ExtendedRecurrence, label: 'Diario' },
            { key: 'weekly' as ExtendedRecurrence, label: 'Semanal' },
            { key: 'weekdays' as ExtendedRecurrence, label: 'Lun a Vie' },
            { key: 'monthly' as ExtendedRecurrence, label: 'Mensual' },
            { key: 'yearly' as ExtendedRecurrence, label: 'Anual' },
          ].map((rec) => {
            const isSelected = recurrence === rec.key;
            return (
              <button
                key={rec.key}
                type="button"
                onClick={() => setRecurrence(rec.key)}
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
        {recurrence === 'weekly' && (
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

      {/* 5.2 RECORDATORIOS / ALERTAS PREVIAS */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-veyra-muted flex items-center gap-1.5">
            <Bell className="w-3.5 h-3.5 text-accent" />
            <span>Avisos y Alertas Previas</span>
          </label>
          <span className="text-[11px] text-veyra-subtle">
            {selectedOffsets.length === 0
              ? 'Sin aviso'
              : `${selectedOffsets.length} ${selectedOffsets.length === 1 ? 'aviso activo' : 'avisos activos'}`}
          </span>
        </div>

        <div className="flex flex-wrap gap-1">
          {AVAILABLE_OFFSETS.map((off) => {
            const isSelected = selectedOffsets.includes(off.value);
            return (
              <button
                key={off.value}
                type="button"
                onClick={() => toggleOffset(off.value)}
                className={cn(
                  'px-2 py-0.5 rounded-md text-[11px] border transition-all cursor-pointer select-none',
                  isSelected
                    ? 'bg-accent/20 border-accent text-accent font-semibold shadow-xs'
                    : 'bg-veyra-card border-veyra-border text-veyra-muted hover:border-accent/40'
                )}
              >
                {off.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="h-px bg-veyra-border/60" />

      {/* 5.3 VINCULAR NOTA DE VEYRA NOTES */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-veyra-muted flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-accent" />
            <span>Vincular Nota de Veyra</span>
          </label>
          {linkedNoteId && (
            <button
              type="button"
              onClick={() => setLinkedNoteId('')}
              className="text-[11px] text-red-400 hover:text-red-300 cursor-pointer"
            >
              Desvincular
            </button>
          )}
        </div>

        <select
          value={linkedNoteId}
          onChange={(e) => setLinkedNoteId(e.target.value)}
          className="w-full bg-veyra-card border border-veyra-border text-veyra-text rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-accent cursor-pointer"
        >
          <option value="">Sin nota vinculada</option>
          {allNotes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.title || 'Nota sin título'}
            </option>
          ))}
        </select>
      </div>

      <div className="h-px bg-veyra-border/60" />

      {/* 5.4 ETIQUETAS (TAGS) */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-veyra-muted flex items-center gap-1.5">
          <TagIcon className="w-3.5 h-3.5 text-accent" />
          <span>Etiquetas del evento</span>
        </label>

        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Nueva etiqueta (ej. trabajo, urgente)..."
            value={newTagInput}
            onChange={(e) => setNewTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddTag();
              }
            }}
            className="flex-1 bg-veyra-card border border-veyra-border text-veyra-text placeholder:text-veyra-subtle rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={() => handleAddTag()}
            disabled={!newTagInput.trim()}
            className="p-1.5 rounded-lg bg-veyra-elevated border border-veyra-border hover:border-accent/40 text-veyra-text hover:text-accent disabled:opacity-40 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
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

      <div className="h-px bg-veyra-border/60" />

      {/* 5.5 ARCHIVOS ADJUNTOS Y ENLACES */}
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
      title={event ? 'Editar Evento' : 'Nuevo Evento'}
      description="Organiza tus reuniones, clases y agenda"
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
            {renderLocationAndColor()}

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
                    Repetición, alertas previas, nota vinculada, etiquetas...
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
              {renderLocationAndColor()}
            </div>

            {/* Columna Derecha: Opciones Avanzadas */}
            {renderAdvancedPanel()}
          </div>
        )}

        {/* ─── FOOTER CON ACCIONES (Sticky, siempre accesible) ─── */}
        <div className="sticky bottom-0 bg-veyra-elevated/95 backdrop-blur-xs pt-3 mt-4 border-t border-veyra-border flex items-center justify-between gap-3 z-10">
          <div>
            {event && onDelete && !showDeleteConfirm && (
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
              <span>{event ? 'Guardar Cambios' : 'Crear Evento'}</span>
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
};
