import React, { useMemo, useState, useEffect } from 'react';
import {
  Calendar,
  Clock,
  MapPin,
  Repeat,
  Tag,
  FileText,
  Folder as FolderIcon,
  Plus,
  ArrowRight,
  Trash2,
  X,
  PanelLeft,
  PanelRight,
  CheckSquare,
  Layers,
  Star,
  ExternalLink,
  Pencil,
  Check,
} from 'lucide-react';
import type { CalendarEvent } from '../../hooks/useEvents';
import type { Note, Folder } from '../../types/notes';
import type { useReminders } from '../../hooks/useReminders';
import type { useEvents } from '../../hooks/useEvents';
import { useTheme } from '../../theme/ThemeProvider';
import { cn } from '../../lib/utils';
import { ConfirmTooltip } from '../../components/common/ConfirmTooltip';

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

export interface EventDetailViewProps {
  event: CalendarEvent;
  allNotes: Note[];
  folders: Folder[];
  remindersHook?: ReturnType<typeof useReminders>;
  eventsHook?: ReturnType<typeof useEvents>;
  onSelectNote: (noteId: string) => void;
  onCreateNoteForEvent: (folderId?: string | null, title?: string) => Promise<void>;
  onDeleteNote?: (noteId: string) => void | Promise<void>;
  onSelectReminder?: (reminderId: string) => void;
  onClose: () => void;
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

export const EventDetailView: React.FC<EventDetailViewProps> = ({
  event,
  allNotes,
  folders,
  remindersHook,
  eventsHook,
  onSelectNote,
  onCreateNoteForEvent,
  onDeleteNote,
  onSelectReminder,
  onClose,
  isSidebarOpen,
  onToggleSidebar,
}) => {
  const { palette } = useTheme();
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(event.title || '');
  const [location, setLocation] = useState(event.location || '');
  const [description, setDescription] = useState(event.description || '');
  const [dateVal, setDateVal] = useState('');
  const [startTimeVal, setStartTimeVal] = useState('09:00');
  const [endTimeVal, setEndTimeVal] = useState('10:00');
  const [isAllDay, setIsAllDay] = useState(Boolean(event.is_all_day));
  const [colorVal, setColorVal] = useState(event.color || palette.primary || '#3B82F6');
  const [recurrenceVal, setRecurrenceVal] = useState<'none' | 'daily' | 'weekly' | 'monthly'>('none');
  const [tagsVal, setTagsVal] = useState<string[]>([]);
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTagText, setNewTagText] = useState('');

  const [isCreatingNote, setIsCreatingNote] = useState(false);
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string>('');
  const [showCreateNoteForm, setShowCreateNoteForm] = useState(false);
  const [togglingNoteId, setTogglingNoteId] = useState<string | null>(null);

  const initDraftState = () => {
    setTitle(event.title || '');
    setLocation(event.location || '');
    setDescription(event.description || '');
    setColorVal(event.color || palette.primary || '#3B82F6');
    setIsAllDay(Boolean(event.is_all_day));

    const s = Number(event.start_time_ms) || Date.now();
    const e = Number(event.end_time_ms) || s + 60 * 60 * 1000;
    const startDate = new Date(s);
    const endDate = new Date(e);

    setDateVal(startDate.toISOString().split('T')[0]);
    setStartTimeVal(startDate.toTimeString().substring(0, 5));
    setEndTimeVal(endDate.toTimeString().substring(0, 5));

    if (Array.isArray(event.tags)) {
      setTagsVal(event.tags.map(String));
    } else if (typeof event.tags === 'string' && event.tags) {
      try {
        const parsed = JSON.parse(event.tags);
        setTagsVal(Array.isArray(parsed) ? parsed : [event.tags]);
      } catch {
        setTagsVal(event.tags.split(',').map((t) => t.trim()).filter(Boolean));
      }
    } else {
      setTagsVal([]);
    }

    const rawRule = event.repeat_rule || '';
    try {
      const parsed = JSON.parse(rawRule);
      if (parsed.type === 'daily') setRecurrenceVal('daily');
      else if (parsed.type === 'weekly') setRecurrenceVal('weekly');
      else if (parsed.type === 'monthly') setRecurrenceVal('monthly');
      else setRecurrenceVal('none');
    } catch {
      if (rawRule.includes('daily') || rawRule.includes('diario')) setRecurrenceVal('daily');
      else if (rawRule.includes('weekly') || rawRule.includes('semanal')) setRecurrenceVal('weekly');
      else if (rawRule.includes('monthly') || rawRule.includes('mensual')) setRecurrenceVal('monthly');
      else setRecurrenceVal('none');
    }

    setIsAddingTag(false);
    setNewTagText('');
  };

  useEffect(() => {
    if (!isEditing) {
      initDraftState();
    }
  }, [
    event.id,
    event.title,
    event.location,
    event.description,
    event.color,
    event.is_all_day,
    event.start_time_ms,
    event.end_time_ms,
    event.tags,
    event.repeat_rule,
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
    if (!eventsHook?.updateEvent) {
      setIsEditing(false);
      return;
    }

    const [y, m, d] = dateVal.split('-').map(Number);
    let startMs: number;
    let endMs: number;

    if (isAllDay) {
      startMs = new Date(y, m - 1, d, 0, 0, 0).getTime();
      endMs = new Date(y, m - 1, d, 23, 59, 59).getTime();
    } else {
      const [startH, startMin] = startTimeVal.split(':').map(Number);
      const [endH, endMin] = endTimeVal.split(':').map(Number);
      startMs = new Date(y, m - 1, d, startH || 0, startMin || 0).getTime();
      endMs = new Date(y, m - 1, d, endH || 0, endMin || 0).getTime();
      if (endMs <= startMs) {
        endMs = startMs + 30 * 60 * 1000;
      }
    }

    let repeatRule: string | null = null;
    if (recurrenceVal === 'daily') {
      repeatRule = JSON.stringify({ type: 'daily' });
    } else if (recurrenceVal === 'weekly') {
      repeatRule = JSON.stringify({ type: 'weekly', days: [new Date(startMs).getDay()] });
    } else if (recurrenceVal === 'monthly') {
      repeatRule = JSON.stringify({ type: 'monthly' });
    }

    await eventsHook.updateEvent(event.id, {
      title: title.trim() || event.title,
      description: description.trim() || null,
      location: location.trim() || null,
      color: colorVal,
      is_all_day: isAllDay,
      start_time_ms: startMs,
      end_time_ms: endMs,
      tags: tagsVal.length > 0 ? tagsVal : null,
      repeat_rule: repeatRule,
    });

    setIsEditing(false);
  };

  const handleAddTag = () => {
    const clean = newTagText.trim().replace(/^#/, '');
    if (!clean) {
      setIsAddingTag(false);
      setNewTagText('');
      return;
    }
    if (!tagsVal.includes(clean)) {
      setTagsVal([...tagsVal, clean]);
    }
    setIsAddingTag(false);
    setNewTagText('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTagsVal(tagsVal.filter((t) => t !== tagToRemove));
  };

  const handleTogglePrimaryNote = async (e: React.MouseEvent, noteId: string) => {
    e.stopPropagation();
    if (!eventsHook?.updateEvent) return;
    try {
      setTogglingNoteId(noteId);
      const newNoteId = event.note_id === noteId ? null : noteId;
      await eventsHook.updateEvent(event.id, { note_id: newNoteId });
    } catch (err) {
      console.error('Error toggling primary note for event:', err);
    } finally {
      setTogglingNoteId(null);
    }
  };

  const handleDeleteLinkedNote = async (noteId: string) => {
    if (!onDeleteNote) return;
    try {
      if (event.note_id === noteId && eventsHook?.updateEvent) {
        await eventsHook.updateEvent(event.id, { note_id: null });
      }
      await onDeleteNote(noteId);
    } catch (err) {
      console.error('Error deleting linked note for event:', err);
    }
  };

  // 1. Linked Notes: Primary note + any note with note.event_id === event.id
  const linkedNotes = useMemo(() => {
    return allNotes.filter((n) => {
      if (n.deleted === 1) return false;
      return n.event_id === event.id || (event.note_id && n.id === event.note_id);
    });
  }, [allNotes, event.id, event.note_id]);

  const hasNotes = linkedNotes.length > 0;

  // Auto-open right sidebar only if the event actually has notes; otherwise start closed
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState<boolean>(() => hasNotes);

  // Sync state whenever switching to another event
  useEffect(() => {
    setIsRightSidebarOpen(hasNotes);
  }, [event.id, hasNotes]);

  const eventColor = event.color || palette.primary || '#3B82F6';

  // Times & duration
  const startTimeMs = Number(event.start_time_ms);
  const endTimeMs = Number(event.end_time_ms);
  const nowMs = Date.now();
  const isHappeningNow = nowMs >= startTimeMs && nowMs <= endTimeMs;
  const isPast = nowMs > endTimeMs;

  const durationMinutes = Math.max(0, Math.round((endTimeMs - startTimeMs) / (1000 * 60)));
  const durationText = useMemo(() => {
    if (durationMinutes <= 0) return '';
    const h = Math.floor(durationMinutes / 60);
    const m = durationMinutes % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  }, [durationMinutes]);

  // Tags
  const tagsList: string[] = useMemo(() => {
    if (!event.tags) return [];
    if (Array.isArray(event.tags)) return event.tags.map(String);
    return [];
  }, [event.tags]);

  // 2. Linked Folders
  const linkedFolders = useMemo(() => {
    const folderIds = new Set<string>();
    linkedNotes.forEach((n) => {
      if (n.folder_id) folderIds.add(n.folder_id);
    });
    return folders.filter((f) => folderIds.has(f.id) && f.deleted === 0);
  }, [linkedNotes, folders]);

  const formatNoteDate = (ms?: number) => {
    if (!ms) return '';
    const d = new Date(ms);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (diffDays === 1) return 'Ayer';
    if (diffDays < 7) {
      const weekday = d.toLocaleDateString('es-ES', { weekday: 'short' });
      return weekday.charAt(0).toUpperCase() + weekday.slice(1);
    }
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  };

  const getNotePageCount = (note: Note): number => {
    if (!note.content) return 1;
    try {
      const parsed = JSON.parse(note.content);
      if (parsed && Array.isArray(parsed.pages) && parsed.pages.length > 0) {
        return parsed.pages.length;
      }
    } catch {
      // not JSON
    }
    return 1;
  };

  const getNotePreview = (note: Note): string => {
    if (note.preview_text && note.preview_text.trim()) {
      return note.preview_text.trim().replace(/\n+/g, ' ');
    }
    if (!note.content) return '';
    try {
      const parsed = JSON.parse(note.content);
      if (parsed && Array.isArray(parsed.pages) && parsed.pages.length > 0) {
        const combined = parsed.pages
          .map((p: { content?: string }) => p.content || '')
          .join(' ')
          .replace(/<[^>]*>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        return combined;
      }
    } catch {
      return note.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }
    return '';
  };

  // 3. Linked Reminders
  const linkedReminders = useMemo(() => {
    if (!remindersHook?.reminders) return [];
    return remindersHook.reminders.filter((r) => r.event_id === event.id && r.deleted !== 1);
  }, [remindersHook?.reminders, event.id]);

  const handleCreateNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCreatingNote) return;
    try {
      setIsCreatingNote(true);
      const titleToUse = newNoteTitle.trim() || `Nota - ${event.title}`;
      const folderToUse = selectedFolderId || (linkedFolders.length > 0 ? linkedFolders[0].id : null);
      await onCreateNoteForEvent(folderToUse, titleToUse);
      setNewNoteTitle('');
      setShowCreateNoteForm(false);
    } catch (err) {
      console.error('Error creating note for event:', err);
    } finally {
      setIsCreatingNote(false);
    }
  };

  const handleDeleteEvent = async () => {
    if (!eventsHook?.deleteEvent) return;
    await eventsHook.deleteEvent(event.id);
    onClose();
  };

  const handleSnoozeEvent = async () => {
    if (!eventsHook?.updateEvent) return;
    const oneDayMs = 24 * 60 * 60 * 1000;
    await eventsHook.updateEvent(event.id, {
      start_time_ms: startTimeMs + oneDayMs,
      end_time_ms: endTimeMs + oneDayMs,
    });
  };

  const formattedDate = useMemo(() => {
    if (!startTimeMs) return '';
    const d = new Date(startTimeMs);
    const str = d.toLocaleDateString('es-ES', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    return str.charAt(0).toUpperCase() + str.slice(1);
  }, [startTimeMs]);

  const formattedTimeRange = useMemo(() => {
    if (!startTimeMs || !endTimeMs) return '';
    const s = new Date(startTimeMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const e = new Date(endTimeMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${s} – ${e}`;
  }, [startTimeMs, endTimeMs]);

  const recurrenceText = useMemo(() => {
    const rawRecurrence =
      event.repeat_rule ||
      (event as unknown as { recurrence_rule?: string }).recurrence_rule;
    if (!rawRecurrence) return null;
    try {
      const parsed = JSON.parse(rawRecurrence);
      if (parsed.type === 'weekly') {
        const daysMap: Record<number, string> = {
          0: 'Dom',
          1: 'Lun',
          2: 'Mar',
          3: 'Mié',
          4: 'Jue',
          5: 'Vie',
          6: 'Sáb',
        };
        const days = Array.isArray(parsed.days)
          ? parsed.days.map((d: number) => daysMap[d] || d).join(', ')
          : '';
        return `Semanal (${days || 'Días'})`;
      }
      if (parsed.type === 'daily') return 'Diario';
      if (parsed.type === 'monthly') return 'Mensual';
    } catch {
      // not JSON
    }
    return String(rawRecurrence);
  }, [event]);

  return (
    <div className="flex-1 flex flex-col h-full bg-veyra-canvas overflow-hidden select-text font-sans">
      {/* 1. Top Header Toolbar */}
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
            style={{ backgroundColor: `${eventColor}24`, color: eventColor }}
            className="w-4 h-4 rounded-[4px] flex items-center justify-center shrink-0"
          >
            <Calendar className="w-2.5 h-2.5 stroke-[2.2]" />
          </div>

          <span className="text-[11px] font-bold text-veyra-subtle uppercase tracking-wider truncate">
            Evento
          </span>
          <span className="text-veyra-subtle/50 text-[11px]">•</span>
          <span className="text-xs font-semibold text-veyra-text truncate max-w-[200px] sm:max-w-xs">
            {event.title}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Status Badge */}
          {isHappeningNow ? (
            <span
              style={{ backgroundColor: `${eventColor}18`, color: eventColor }}
              className="px-2 py-0.5 rounded-[4px] text-[9.5px] font-extrabold tracking-wider uppercase flex items-center gap-1"
            >
              <span
                style={{ backgroundColor: eventColor }}
                className="w-1.5 h-1.5 rounded-full animate-pulse"
              />
              EN CURSO
            </span>
          ) : isPast ? (
            <span className="px-1.5 py-0.5 rounded-[4px] text-[9.5px] font-medium tracking-wide uppercase bg-white/5 text-veyra-subtle border border-veyra-border/60">
              Finalizado
            </span>
          ) : (
            <span
              style={{ backgroundColor: `${eventColor}14`, color: eventColor }}
              className="px-1.5 py-0.5 rounded-[4px] text-[9.5px] font-bold tracking-wide uppercase"
            >
              Próximo
            </span>
          )}

          {/* Toggle Right Notes Sidebar */}
          <button
            type="button"
            onClick={() => setIsRightSidebarOpen((prev) => !prev)}
            title={isRightSidebarOpen ? 'Ocultar panel de notas' : 'Ver notas del evento'}
            className={cn(
              'px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer flex items-center gap-1 border',
              isRightSidebarOpen
                ? 'bg-accent/15 text-accent border-accent/30'
                : 'text-veyra-muted hover:text-veyra-text hover:bg-white/5 border-transparent'
            )}
          >
            <PanelRight className="w-3.5 h-3.5" />
            <span>Notas ({linkedNotes.length})</span>
          </button>

          <div className="w-[1px] h-3 bg-veyra-border mx-0.5" />

          {/* Quick Snooze */}
          <button
            type="button"
            onClick={handleSnoozeEvent}
            title="Posponer 1 día (+24 horas)"
            className="px-2 py-1 rounded text-veyra-muted hover:text-veyra-text hover:bg-white/5 text-[11px] font-medium cursor-pointer transition-colors flex items-center gap-1"
          >
            <Clock className="w-3 h-3 text-veyra-subtle" />
            <span>+1d</span>
          </button>

          <div className="w-[1px] h-3 bg-veyra-border mx-0.5" />

          {/* Edit Button / Actions */}
          {eventsHook?.updateEvent && (
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
                title="Editar evento"
                className="px-2 py-1 rounded text-veyra-muted hover:text-accent hover:bg-white/5 text-[11px] font-medium transition-colors cursor-pointer flex items-center gap-1 border border-transparent hover:border-accent/30"
              >
                <Pencil className="w-3 h-3 text-accent" />
                <span>Editar</span>
              </button>
            )
          )}

          {/* Delete Button */}
          {eventsHook?.deleteEvent && (
            <ConfirmTooltip
              title="¿Eliminar evento?"
              description={`"${event.title}"`}
              confirmText="Eliminar"
              onConfirm={handleDeleteEvent}
            >
              <button
                type="button"
                title="Eliminar evento"
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

      {/* 2. Main Body: Left Details Stage + Right Notes Sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT / CENTER: Event Information & Reminders */}
        <div className="flex-1 overflow-y-auto px-6 py-6 md:px-8 space-y-5">
          {/* Title Header with Color Indicator & All-Day */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              {/* Color Selector */}
              {isEditing ? (
                <div className="flex items-center gap-1.5 p-1 rounded-full bg-veyra-card border border-veyra-border shadow-xs">
                  {COLOR_OPTIONS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      title={c.label}
                      onClick={() => setColorVal(c.value)}
                      style={{ backgroundColor: c.value }}
                      className={cn(
                        'w-3.5 h-3.5 rounded-full cursor-pointer transition-transform hover:scale-115',
                        colorVal === c.value && 'ring-2 ring-white ring-offset-1 ring-offset-black scale-110'
                      )}
                    />
                  ))}
                </div>
              ) : (
                <span
                  style={{ backgroundColor: eventColor }}
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                />
              )}

              <span className="text-[10.5px] font-bold uppercase tracking-wider text-veyra-subtle">
                Detalles del evento
              </span>

              {/* Todo el día Toggle */}
              {isEditing ? (
                <label className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10.5px] bg-veyra-elevated border border-accent/40 text-veyra-text cursor-pointer select-none ml-auto sm:ml-0">
                  <input
                    type="checkbox"
                    checked={isAllDay}
                    onChange={(e) => setIsAllDay(e.target.checked)}
                    className="rounded border-veyra-border text-accent focus:ring-accent w-3 h-3 cursor-pointer"
                  />
                  <span>Todo el día</span>
                </label>
              ) : (
                event.is_all_day && (
                  <span className="px-1.5 py-0.2 rounded text-[10px] bg-veyra-card border border-veyra-border text-veyra-muted">
                    Todo el día
                  </span>
                )
              )}
            </div>

            {/* Title: Input in edit mode, Heading in read-only */}
            {isEditing ? (
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
                placeholder="Título del evento..."
                className="text-xl md:text-2xl font-bold tracking-tight text-veyra-text leading-tight w-full bg-veyra-elevated border border-accent rounded-md px-2.5 py-1 focus:outline-none shadow-xs"
              />
            ) : (
              <h1 className="text-xl md:text-2xl font-bold tracking-tight text-veyra-text leading-tight">
                {event.title}
              </h1>
            )}
          </div>

          {/* Flat Properties Grid (Linear / Notion style) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3.5 rounded-lg bg-veyra-card/40 border border-veyra-border text-xs">
            {/* Horario */}
            <div className="flex items-center gap-2 py-1 px-1.5 text-veyra-muted">
              <Clock className="w-3.5 h-3.5 text-veyra-subtle shrink-0" />
              {isEditing ? (
                <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
                  <input
                    type="date"
                    value={dateVal}
                    onChange={(e) => setDateVal(e.target.value)}
                    className="bg-veyra-elevated text-xs font-semibold text-veyra-text rounded px-2 py-1 border border-accent/60 focus:border-accent focus:outline-none cursor-pointer"
                  />
                  {!isAllDay && (
                    <>
                      <input
                        type="time"
                        value={startTimeVal}
                        onChange={(e) => setStartTimeVal(e.target.value)}
                        className="bg-veyra-elevated text-xs font-medium text-veyra-text rounded px-1.5 py-1 border border-accent/60 focus:border-accent focus:outline-none cursor-pointer"
                      />
                      <span className="text-veyra-subtle text-xs">–</span>
                      <input
                        type="time"
                        value={endTimeVal}
                        onChange={(e) => setEndTimeVal(e.target.value)}
                        className="bg-veyra-elevated text-xs font-medium text-veyra-text rounded px-1.5 py-1 border border-accent/60 focus:border-accent focus:outline-none cursor-pointer"
                      />
                    </>
                  )}
                </div>
              ) : (
                <div className="truncate">
                  <span className="font-semibold text-veyra-text">{formattedDate}</span>
                  <span className="text-veyra-subtle ml-1.5">
                    {formattedTimeRange} {durationText && `(${durationText})`}
                  </span>
                </div>
              )}
            </div>

            {/* Ubicación */}
            <div className="flex items-center gap-2 py-1 px-1.5 text-veyra-muted">
              <MapPin className="w-3.5 h-3.5 text-veyra-subtle shrink-0" />
              {isEditing ? (
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Escribe ubicación o enlace..."
                  className="flex-1 min-w-0 bg-veyra-elevated border border-accent/50 rounded px-2 py-0.5 text-xs text-veyra-text placeholder:text-veyra-subtle/50 font-medium focus:outline-none"
                />
              ) : (
                <div className="flex items-center gap-1.5 flex-1 min-w-0 truncate">
                  <span className="truncate text-veyra-text font-medium">
                    {event.location || 'Sin ubicación'}
                  </span>
                  {event.location &&
                    (event.location.startsWith('http') ||
                      event.location.includes('meet.google') ||
                      event.location.includes('zoom')) && (
                      <a
                        href={event.location.startsWith('http') ? event.location : `https://${event.location}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1 rounded text-accent hover:bg-white/5 transition-colors shrink-0"
                        title="Abrir enlace de reunión"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                </div>
              )}
            </div>

            {/* Recurrencia */}
            <div className="flex items-center gap-2 py-1 px-1.5 text-veyra-muted">
              <Repeat className="w-3.5 h-3.5 text-veyra-subtle shrink-0" />
              {isEditing ? (
                <select
                  value={recurrenceVal}
                  onChange={(e) => setRecurrenceVal(e.target.value as 'none' | 'daily' | 'weekly' | 'monthly')}
                  className="bg-veyra-elevated border border-accent/50 rounded text-xs font-medium text-veyra-text cursor-pointer px-1.5 py-0.5 focus:outline-none flex-1 truncate"
                >
                  <option value="none">Evento único (no recurrente)</option>
                  <option value="daily">Todos los días (Diario)</option>
                  <option value="weekly">Semanal</option>
                  <option value="monthly">Mensual</option>
                </select>
              ) : (
                <span className="truncate text-veyra-text font-medium">
                  {recurrenceText || 'Evento único (no recurrente)'}
                </span>
              )}
            </div>

            {/* Etiquetas */}
            <div className="flex items-center gap-2 py-1 px-1.5 text-veyra-muted">
              <Tag className="w-3.5 h-3.5 text-veyra-subtle shrink-0" />
              {isEditing ? (
                <div className="flex flex-wrap items-center gap-1 flex-1 min-w-0">
                  {tagsVal.map((tag, idx) => (
                    <span
                      key={idx}
                      className="group/tag inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-veyra-elevated border border-accent/30 text-[10.5px] font-mono text-veyra-text/90"
                    >
                      <span>#{tag}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        title="Eliminar etiqueta"
                        className="hover:text-red-400 p-0.2 transition-opacity cursor-pointer"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  ))}

                  {isAddingTag ? (
                    <input
                      type="text"
                      value={newTagText}
                      onChange={(e) => setNewTagText(e.target.value)}
                      onBlur={handleAddTag}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAddTag();
                        if (e.key === 'Escape') {
                          setIsAddingTag(false);
                          setNewTagText('');
                        }
                      }}
                      autoFocus
                      placeholder="etiqueta..."
                      className="w-20 px-1 py-0.2 rounded bg-veyra-elevated border border-accent text-[10.5px] font-mono text-veyra-text focus:outline-none"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsAddingTag(true)}
                      className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-white/5 hover:bg-white/10 text-veyra-subtle hover:text-veyra-text text-[10px] cursor-pointer transition-colors"
                    >
                      <Plus className="w-2.5 h-2.5" />
                      <span>Tag</span>
                    </button>
                  )}
                </div>
              ) : tagsList.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {tagsList.map((tag, idx) => (
                    <span
                      key={idx}
                      className="px-1.5 py-0.2 rounded bg-veyra-card border border-veyra-border text-[10.5px] font-mono text-veyra-text/90"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-veyra-subtle text-xs">Sin etiquetas</span>
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
                placeholder="Añadir descripción o notas del evento..."
                className="w-full bg-veyra-elevated border border-veyra-border rounded-md p-2.5 text-xs text-veyra-text placeholder:text-veyra-subtle/50 leading-relaxed font-sans focus:outline-none focus:border-accent resize-y"
              />
            </div>
          ) : event.description ? (
            <div className="p-3.5 rounded-lg bg-veyra-card/30 border border-veyra-border/60 text-xs text-veyra-muted leading-relaxed whitespace-pre-wrap">
              <div className="text-[10px] font-bold uppercase tracking-wider text-veyra-subtle mb-1">
                Descripción
              </div>
              {event.description}
            </div>
          ) : null}

          {/* Tareas y Recordatorios del Evento */}
          <div className="space-y-2.5 pt-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-veyra-subtle">
                <CheckSquare className="w-3.5 h-3.5 text-emerald-400" />
                <span>Tareas y recordatorios asociados ({linkedReminders.length})</span>
              </div>
            </div>

            {linkedReminders.length === 0 ? (
              <div className="p-3.5 rounded-lg border border-dashed border-veyra-border text-xs text-veyra-subtle">
                Sin recordatorios asignados directamente a este evento.
              </div>
            ) : (
              <div className="divide-y divide-veyra-border/50 border border-veyra-border rounded-lg bg-veyra-card/40 overflow-hidden">
                {linkedReminders.map((reminder) => {
                  const isDone = reminder.status === 'completed';
                  return (
                    <div
                      key={reminder.id}
                      onClick={() => onSelectReminder?.(reminder.id)}
                      className="px-3 py-2.5 flex items-center justify-between gap-3 hover:bg-white/[0.04] transition-colors cursor-pointer group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            remindersHook?.toggleReminder(reminder.id, reminder.status);
                          }}
                          className={cn(
                            'w-3.5 h-3.5 rounded-[4px] border flex items-center justify-center transition-colors cursor-pointer shrink-0',
                            isDone
                              ? 'bg-accent border-accent text-white'
                              : 'border-veyra-subtle hover:border-accent'
                          )}
                        >
                          {isDone && <span className="text-[9px] font-bold">✓</span>}
                        </button>
                        <span
                          className={cn(
                            'text-xs font-medium text-veyra-text truncate',
                            isDone && 'line-through text-veyra-subtle'
                          )}
                        >
                          {reminder.title}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-veyra-subtle shrink-0">
                        {reminder.due_date_ms && (
                          <span>
                            {new Date(reminder.due_date_ms).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        )}
                        <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 text-accent transition-opacity" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Subtle CTA if notes sidebar is closed */}
          {!isRightSidebarOpen && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsRightSidebarOpen(true);
                  if (linkedNotes.length === 0) {
                    setShowCreateNoteForm(true);
                  }
                }}
                className="w-full py-2 px-3 rounded-lg border border-dashed border-veyra-border/80 hover:border-accent/50 text-xs text-veyra-subtle hover:text-veyra-text hover:bg-white/[0.02] transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                <FileText className="w-3.5 h-3.5 text-accent" />
                <span>
                  {linkedNotes.length > 0
                    ? `Ver notas del evento (${linkedNotes.length})`
                    : 'Agregar notas o apuntes para este evento'}
                </span>
              </button>
            </div>
          )}
        </div>

        {/* RIGHT: Notas del Evento (Dedicated Right Sidebar) */}
        {isRightSidebarOpen && (
          <div className="w-80 md:w-96 border-l border-veyra-border shrink-0 flex flex-col h-full bg-veyra-card/25 overflow-hidden">
            {/* Header of the Right Notes Sidebar */}
            <div className="h-10 px-3.5 border-b border-veyra-border flex items-center justify-between text-xs shrink-0 select-none bg-veyra-card/50">
              <div className="flex items-center gap-1.5 font-bold text-veyra-text uppercase tracking-wider text-[11px]">
                <FileText className="w-3.5 h-3.5 text-accent" />
                <span>Notas del Evento</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-veyra-elevated text-veyra-muted font-mono">
                  {linkedNotes.length}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setShowCreateNoteForm((prev) => !prev)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-accent text-white font-medium text-[11px] hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
              >
                <Plus className="w-3 h-3 stroke-[2.5]" />
                <span>Nueva</span>
              </button>
            </div>

            {/* Scrollable list of notes and folders */}
            <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
              {/* Inline Form to create note */}
              {showCreateNoteForm && (
                <form
                  onSubmit={handleCreateNote}
                  className="p-3 rounded-lg bg-veyra-card border border-accent/40 shadow-sm space-y-2.5 animate-in fade-in-50 duration-150"
                >
                  <div className="text-[11px] font-semibold text-veyra-text">
                    Crear nota para "{event.title}"
                  </div>
                  <input
                    type="text"
                    placeholder={`Título (ej. Apuntes - ${event.title})`}
                    value={newNoteTitle}
                    onChange={(e) => setNewNoteTitle(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-md bg-veyra-canvas border border-veyra-border text-xs text-veyra-text placeholder:text-veyra-subtle focus:outline-none focus:border-accent"
                    autoFocus
                  />
                  <select
                    value={selectedFolderId}
                    onChange={(e) => setSelectedFolderId(e.target.value)}
                    className="w-full px-2 py-1.5 rounded-md bg-veyra-canvas border border-veyra-border text-xs text-veyra-text focus:outline-none focus:border-accent"
                  >
                    <option value="">📁 Sin carpeta</option>
                    {folders.map((f) => (
                      <option key={f.id} value={f.id}>
                        📁 {f.name}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center justify-end gap-2 pt-0.5">
                    <button
                      type="button"
                      onClick={() => setShowCreateNoteForm(false)}
                      className="px-2.5 py-1 rounded text-xs text-veyra-muted hover:text-veyra-text cursor-pointer transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isCreatingNote}
                      className="px-3 py-1 rounded-md bg-accent text-white text-xs font-medium hover:opacity-90 disabled:opacity-50 cursor-pointer"
                    >
                      {isCreatingNote ? 'Creando...' : 'Crear y Abrir'}
                    </button>
                  </div>
                </form>
              )}

              {/* Linked Notes List */}
              {linkedNotes.length === 0 ? (
                <div className="p-5 rounded-xl border border-dashed border-veyra-border/80 text-center bg-veyra-card/25 space-y-3 flex flex-col items-center">
                  <div className="w-10 h-10 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-accent">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-veyra-text font-semibold">
                      Sin apuntes vinculados
                    </div>
                    <p className="text-[11px] text-veyra-subtle max-w-[220px] mx-auto leading-relaxed">
                      Toma notas durante este evento y quedarán guardadas aquí automáticamente.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!newNoteTitle) setNewNoteTitle(`Apuntes - ${event.title}`);
                      setShowCreateNoteForm(true);
                    }}
                    className="mt-1 px-3 py-1.5 rounded-lg bg-accent/15 hover:bg-accent/25 border border-accent/30 text-xs text-accent font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Crear apunte</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {linkedNotes.map((note) => {
                    const noteFolder = folders.find((f) => f.id === note.folder_id);
                    const isPrimary = event.note_id === note.id;
                    const noteDateStr = formatNoteDate(note.updated_at_ms || note.created_at_ms);
                    const pageCount = getNotePageCount(note);
                    const previewText = getNotePreview(note);

                    return (
                      <div
                        key={note.id}
                        onClick={() => onSelectNote(note.id)}
                        className="group relative p-2.5 rounded-lg border border-veyra-border/60 hover:border-accent/50 bg-veyra-card/45 hover:bg-veyra-card/85 transition-all duration-150 cursor-pointer flex flex-col gap-1.5 overflow-hidden shadow-2xs hover:shadow-xs"
                      >
                        {/* Accent border strip on left */}
                        <div
                          className={cn(
                            'absolute left-0 top-0 bottom-0 w-1 transition-all duration-200',
                            isPrimary
                              ? 'bg-amber-400 opacity-100'
                              : 'bg-accent/30 group-hover:bg-accent'
                          )}
                        />

                        {/* Top line: Icon + Title + (Primary toggle button) + Date */}
                        <div className="flex items-center justify-between gap-1.5 pl-1.5 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <FileText className="w-3.5 h-3.5 text-accent shrink-0 group-hover:scale-105 transition-transform" />
                            <span className="text-xs font-semibold text-veyra-text truncate group-hover:text-accent transition-colors">
                              {note.title || 'Apunte sin título'}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {/* Primary Note Star Button */}
                            {isPrimary ? (
                              <button
                                type="button"
                                onClick={(e) => handleTogglePrimaryNote(e, note.id)}
                                disabled={togglingNoteId === note.id}
                                title="Nota principal del evento (clic para desmarcar)"
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8.5px] font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30 uppercase tracking-wider transition-colors cursor-pointer"
                              >
                                <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                                <span>Principal</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => handleTogglePrimaryNote(e, note.id)}
                                disabled={togglingNoteId === note.id}
                                title="Marcar como nota principal de este evento"
                                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-white/10 text-veyra-subtle hover:text-amber-400 transition-all cursor-pointer"
                              >
                                <Star className="w-3 h-3 transition-transform hover:scale-115" />
                              </button>
                            )}

                            {/* Delete Note Button */}
                            {onDeleteNote && (
                              <div onClick={(e) => e.stopPropagation()}>
                                <ConfirmTooltip
                                  title="¿Eliminar apunte?"
                                  description={`"${note.title || 'Apunte sin título'}"`}
                                  confirmText="Eliminar"
                                  onConfirm={() => handleDeleteLinkedNote(note.id)}
                                >
                                  <button
                                    type="button"
                                    title="Eliminar apunte"
                                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-rose-500/15 text-veyra-subtle hover:text-rose-500 transition-all cursor-pointer"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </ConfirmTooltip>
                              </div>
                            )}

                            {noteDateStr && (
                              <span className="text-[10px] text-veyra-subtle font-mono shrink-0 group-hover:hidden">
                                {noteDateStr}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Compact Preview Content */}
                        {previewText ? (
                          <p className="text-[11px] text-veyra-muted/90 line-clamp-2 leading-relaxed pl-1.5 font-sans">
                            {previewText}
                          </p>
                        ) : (
                          <p className="text-[11px] text-veyra-subtle/50 italic pl-1.5">
                            Sin contenido aún
                          </p>
                        )}

                        {/* Bottom line: Page count + Folder + Open hint */}
                        <div className="flex items-center justify-between pt-1 border-t border-veyra-border/40 text-[10px] pl-1.5 text-veyra-subtle">
                          <div className="flex items-center gap-2 min-w-0">
                            {/* Pages Counter Badge */}
                            <span className="inline-flex items-center gap-1 font-mono text-[9.5px] text-veyra-muted bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/[0.06] shrink-0">
                              <Layers className="w-2.5 h-2.5 text-accent shrink-0" />
                              <span>
                                {pageCount} {pageCount === 1 ? 'hoja' : 'hojas'}
                              </span>
                            </span>

                            {/* Folder if assigned */}
                            {noteFolder && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-veyra-subtle truncate max-w-[120px]">
                                <FolderIcon
                                  style={{ color: noteFolder.color || palette.primary }}
                                  className="w-2.5 h-2.5 shrink-0"
                                />
                                <span className="truncate">{noteFolder.name}</span>
                              </span>
                            )}
                          </div>

                          <div className="inline-flex items-center gap-0.5 text-[10px] font-medium text-accent opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all shrink-0">
                            <span>Abrir</span>
                            <ArrowRight className="w-2.5 h-2.5" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
