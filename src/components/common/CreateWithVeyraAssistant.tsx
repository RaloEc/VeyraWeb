import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Sparkles,
  X,
  Paperclip,
  Mic,
  Square,
  ArrowUp,
  Clock,
  Calendar,
  Notebook,
  Loader2,
  Check,
  AlertCircle,
  Pencil,
  ChevronDown,
  Tag,
  Minus,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  parseQuickAddWithAI,
  fileToBase64Attachment,
  type QuickAddAttachment,
  type QuickAddProposalItem,
} from '../../lib/ai/ai-quick-add-service';
import { cn } from '../../lib/utils';

export interface CreateWithVeyraAssistantProps {
  onClose: () => void;
  onMinimize?: () => void;
  onManualReminder: () => void;
  onManualEvent: () => void;
  onManualNote: () => void;
  onSaveReminder: (payload: {
    title: string;
    due_date_ms: number;
    priority?: 1 | 3;
    control_level?: 'normal' | 'critical';
    description?: string;
    repeat_rule?: string | null;
  }) => Promise<unknown>;
  onSaveEvent: (payload: {
    title: string;
    start_time_ms: number;
    end_time_ms: number;
    is_all_day?: boolean;
    all_day_date?: string | null;
    location?: string;
    description?: string;
    tags?: string[] | null;
    repeat_rule?: string | null;
    recurrence_rule?: string | null;
  }) => Promise<unknown>;
  onSaveNote: (title: string, contentHtml?: string) => Promise<unknown>;
  autoFocus?: boolean;
  className?: string;
  onHasProposalChange?: (hasProposal: boolean) => void;
  variant?: 'modal' | 'sidebar';
}

function parseLocalDateTimeMs(dateStr: string, timeStr: string, fallbackOffsetHours = 1): number {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const [hh, mm] = /^\d{1,2}:\d{2}$/.test(timeStr) ? timeStr.split(':').map(Number) : [9, 0];
    return new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0).getTime();
  }
  return Date.now() + fallbackOffsetHours * 3600000;
}

interface EditableProposalEntry {
  id: string;
  selected: boolean;
  item: QuickAddProposalItem;
  notePlainText?: string;
}

function htmlToPlainText(html: string): string {
  if (!html) return '';
  return html
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function addWeeksToYmd(dateStr: string, weeks: number): string {
  const baseMs = /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
    ? parseLocalDateTimeMs(dateStr, '12:00')
    : Date.now();
  const target = new Date(baseMs + weeks * 7 * 86400000);
  const y = target.getFullYear();
  const m = String(target.getMonth() + 1).padStart(2, '0');
  const d = String(target.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const WEEKDAY_SHORT_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function getWeekdayShortLabel(dateStr: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return WEEKDAY_SHORT_ES[new Date(y, m - 1, d).getDay()] || '';
}

function buildEventRecurrenceRuleJson(
  recurrence: string | undefined,
  startMs: number,
  until?: string,
  weekdaysOverride?: number[]
): string | null {
  if (!recurrence || recurrence === 'none') return null;
  const cleanUntil = until && /^\d{4}-\d{2}-\d{2}$/.test(until.trim()) ? until.trim() : undefined;
  const weekday = new Date(startMs).getDay();
  const byWeekday =
    weekdaysOverride && weekdaysOverride.length > 0
      ? Array.from(new Set(weekdaysOverride)).sort((a, b) => a - b)
      : [weekday];

  const ruleObj: Record<string, unknown> =
    recurrence === 'weekly'
      ? { type: 'weekly', interval: 1, by_weekday: byWeekday }
      : recurrence === 'weekdays'
        ? { type: 'weekdays' }
        : { type: recurrence, interval: 1 };

  if (cleanUntil) {
    ruleObj.until = cleanUntil;
  }
  return JSON.stringify(ruleObj);
}

function normalizeQuickAddProposalItem(item: QuickAddProposalItem): QuickAddProposalItem {
  if (item.action !== 'create_event') return item;
  const isClassTag = Array.isArray(item.data.tags) &&
    item.data.tags.some((t) => String(t).toLowerCase().includes('clase'));
  if (!isClassTag) return item;

  const recurrence = item.data.recurrence || 'weekly';
  const recurrenceEndDate =
    item.data.recurrenceEndDate ||
    (recurrence !== 'none' ? addWeeksToYmd(item.data.startDate, 16) : undefined);

  return {
    ...item,
    data: {
      ...item.data,
      recurrence,
      recurrenceEndDate,
    },
  };
}
function plainTextToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const lines = escaped.split(/\r?\n/);
  return lines.map((line) => (line.trim() ? `<p>${line}</p>` : '<p></p>')).join('');
}

export const CreateWithVeyraAssistant: React.FC<CreateWithVeyraAssistantProps> = ({
  onClose,
  onMinimize,
  onManualReminder,
  onManualEvent,
  onManualNote,
  onSaveReminder,
  onSaveEvent,
  onSaveNote,
  autoFocus = false,
  className,
  onHasProposalChange,
  variant = 'modal',
}) => {
  const [promptText, setPromptText] = useState('');
  const [attachedFile, setAttachedFile] = useState<{ name: string; attachment: QuickAddAttachment } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [proposalEntries, setProposalEntries] = useState<EditableProposalEntry[]>([]);
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);
  const [collapsedGroupKeys, setCollapsedGroupKeys] = useState<Record<string, boolean>>({});
  const [tagDraftById, setTagDraftById] = useState<Record<string, string>>({});
  const [isConfirming, setIsConfirming] = useState(false);

  useEffect(() => {
    onHasProposalChange?.(proposalEntries.length > 0);
  }, [proposalEntries.length, onHasProposalChange]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
      try {
        if (mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      } catch {
        // ignore
      }
    };
  }, []);

  const runAI = async (textOverride?: string, extraAttachment?: QuickAddAttachment) => {
    const textToSend = (textOverride ?? promptText).trim();
    const attachments: QuickAddAttachment[] = [];
    if (attachedFile) attachments.push(attachedFile.attachment);
    if (extraAttachment) attachments.push(extraAttachment);

    if (!textToSend && attachments.length === 0) return;

    setIsLoading(true);
    setErrorMsg(null);
    setProposalEntries([]);
    setExpandedEntryId(null);
    setCollapsedGroupKeys({});
    setTagDraftById({});

    try {
      const result = await parseQuickAddWithAI({
        text: textToSend,
        attachments,
      });

      if (result.action === 'unknown') {
        setErrorMsg(result.reason || 'No pude entender la solicitud. Intenta ser más específico.');
      } else if (result.action === 'clarify') {
        setErrorMsg(result.question);
      } else {
        const rawItems: QuickAddProposalItem[] = (
          result.action === 'create_batch' ? result.items : [result]
        ).map(normalizeQuickAddProposalItem);
        const entries: EditableProposalEntry[] = rawItems.map((item, idx) => ({
          id: `proposal-${Date.now()}-${idx}`,
          selected: true,
          item,
          notePlainText:
            item.action === 'create_note' ? htmlToPlainText(item.data.contentHtml) : undefined,
        }));
        setProposalEntries(entries);
        // Si es un solo elemento, abrir su editor automáticamente para edición rápida
        setExpandedEntryId(entries.length === 1 ? entries[0].id : null);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error al procesar con Veyra IA.');
    } finally {
      setIsLoading(false);
    }
  };

  const attachImageFile = async (file: File) => {
    try {
      const attachment = await fileToBase64Attachment(file);
      const displayName = file.name && file.name !== 'image.png'
        ? file.name
        : `Imagen pegada (${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}).png`;
      setAttachedFile({ name: displayName, attachment });
      setErrorMsg(null);
    } catch (err: any) {
      toast.error(err?.message || 'No se pudo adjuntar el archivo.');
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await attachImageFile(file);
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLDivElement>) => {
    if (isLoading) return;
    const items = Array.from(e.clipboardData?.items || []);
    const imageItem = items.find((item) => item.kind === 'file' && item.type.startsWith('image/'));
    const file =
      imageItem?.getAsFile() ||
      Array.from(e.clipboardData?.files || []).find((f) => f.type.startsWith('image/'));

    if (!file) return;
    e.preventDefault();
    await attachImageFile(file);
  };

  const handleToggleVoice = async () => {
    if (isRecording) {
      setIsRecording(false);
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
      try {
        if (mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      } catch {
        // ignore
      }
      return;
    }

    const SpeechRec =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRec) {
      try {
        const rec = new SpeechRec();
        rec.lang = 'es-ES';
        rec.interimResults = true;
        rec.continuous = false;
        let finalTranscript = '';

        rec.onresult = (event: any) => {
          let interim = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const chunk = event.results[i][0].transcript;
            if (event.results[i].isFinal) finalTranscript += chunk + ' ';
            else interim += chunk;
          }
          setPromptText((finalTranscript + interim).trim());
        };

        rec.onerror = () => {
          setIsRecording(false);
        };

        rec.onend = () => {
          setIsRecording(false);
          const finalText = finalTranscript.trim();
          if (finalText) {
            runAI(finalText);
          }
        };

        recognitionRef.current = rec;
        setErrorMsg(null);
        setIsRecording(true);
        rec.start();
        return;
      } catch {
        // fallback to MediaRecorder
      }
    }

    // Fallback: MediaRecorder audio capture
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error('Tu navegador no soporta grabación de voz.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const file = new File([blob], 'voice.webm', { type: blob.type });
        try {
          const audioAtt = await fileToBase64Attachment(file);
          await runAI(promptText || 'Transcribe y crea lo que se pide en el audio.', audioAtt);
        } catch (err: any) {
          setErrorMsg(err?.message || 'No se pudo procesar el audio.');
        }
      };

      mediaRecorderRef.current = recorder;
      setErrorMsg(null);
      setIsRecording(true);
      recorder.start();
    } catch {
      toast.error('Permiso de micrófono denegado.');
    }
  };

  const executeItem = async (item: QuickAddProposalItem, weekdaysOverride?: number[]) => {
    if (item.action === 'create_reminder') {
      const dueMs = parseLocalDateTimeMs(item.data.date, item.data.time || '09:00');
      const isCrit = item.data.priority === 'critical';
      const reminderRepeatRule =
        item.data.recurrence && item.data.recurrence !== 'none'
          ? JSON.stringify({ type: item.data.recurrence, interval: 1 })
          : null;
      await onSaveReminder({
        title: item.data.title,
        due_date_ms: dueMs,
        priority: isCrit ? 3 : 1,
        control_level: isCrit ? 'critical' : 'normal',
        description: item.data.description,
        repeat_rule: reminderRepeatRule,
      });
    } else if (item.action === 'create_event') {
      const startMs = parseLocalDateTimeMs(
        item.data.startDate,
        item.data.isAllDay ? '00:00' : item.data.startTime || '09:00'
      );
      const endMs = item.data.isAllDay
        ? parseLocalDateTimeMs(item.data.endDate || item.data.startDate, '23:59')
        : Math.max(
          startMs + 30 * 60000,
          parseLocalDateTimeMs(
            item.data.endDate || item.data.startDate,
            item.data.endTime || '10:00'
          )
        );
      const recurrenceRule = buildEventRecurrenceRuleJson(
        item.data.recurrence,
        startMs,
        item.data.recurrenceEndDate,
        weekdaysOverride
      );
      await onSaveEvent({
        title: item.data.title,
        start_time_ms: startMs,
        end_time_ms: endMs,
        is_all_day: Boolean(item.data.isAllDay),
        all_day_date: item.data.isAllDay ? item.data.startDate : null,
        location: item.data.location,
        description: item.data.description,
        tags: item.data.tags && item.data.tags.length > 0 ? item.data.tags : null,
        repeat_rule: recurrenceRule,
        recurrence_rule: recurrenceRule,
      });
    } else if (item.action === 'create_note') {
      await onSaveNote(item.data.title, item.data.contentHtml);
    }
  };

  const toggleEntrySelection = (id: string) => {
    setProposalEntries((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, selected: !entry.selected } : entry))
    );
  };

  const toggleAllEntries = () => {
    const allSelected = proposalEntries.every((e) => e.selected);
    setProposalEntries((prev) => prev.map((e) => ({ ...e, selected: !allSelected })));
  };

  const toggleGroupSelection = (entryIds: string[]) => {
    const idSet = new Set(entryIds);
    const allSelected = proposalEntries
      .filter((e) => idSet.has(e.id))
      .every((e) => e.selected);
    setProposalEntries((prev) =>
      prev.map((e) => (idSet.has(e.id) ? { ...e, selected: !allSelected } : e))
    );
  };

  const toggleGroupCollapse = (groupKey: string) => {
    setCollapsedGroupKeys((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }));
  };

  const updateEntryItem = (
    id: string,
    updater: (item: QuickAddProposalItem) => QuickAddProposalItem,
    notePlainText?: string
  ) => {
    setProposalEntries((prev) =>
      prev.map((entry) =>
        entry.id === id
          ? {
            ...entry,
            item: updater(entry.item),
            ...(notePlainText !== undefined ? { notePlainText } : {}),
          }
          : entry
      )
    );
  };

  const addTagToEventEntry = (id: string, rawValue: string) => {
    const candidates = rawValue
      .split(',')
      .map((part) => part.trim().replace(/^#+/, ''))
      .filter(Boolean);

    setTagDraftById((prev) => ({ ...prev, [id]: '' }));
    if (candidates.length === 0) return;

    updateEntryItem(id, (curr) => {
      if (curr.action !== 'create_event') return curr;
      const existing = Array.isArray(curr.data.tags) ? curr.data.tags : [];
      const nextTags = [...existing];
      for (const candidate of candidates) {
        if (!nextTags.some((t) => t.toLowerCase() === candidate.toLowerCase())) {
          nextTags.push(candidate);
        }
      }
      return { ...curr, data: { ...curr.data, tags: nextTags } };
    });
  };

  const removeTagFromEventEntry = (id: string, tagToRemove: string) => {
    updateEntryItem(id, (curr) => {
      if (curr.action !== 'create_event') return curr;
      const existing = Array.isArray(curr.data.tags) ? curr.data.tags : [];
      const nextTags = existing.filter((t) => t !== tagToRemove);
      return { ...curr, data: { ...curr.data, tags: nextTags } };
    });
  };

  const selectedEntries = proposalEntries.filter((e) => e.selected);

  // Agrupar eventos que comparten título (ej. clases que se repiten varios días en la semana)
  const groupedProposals = useMemo(() => {
    type DisplayBlock =
      | { kind: 'single'; entry: EditableProposalEntry }
      | { kind: 'group'; key: string; title: string; entries: EditableProposalEntry[] };

    const eventBuckets = new Map<string, EditableProposalEntry[]>();
    for (const entry of proposalEntries) {
      if (entry.item.action === 'create_event') {
        const normKey = `event:${entry.item.data.title.trim().toLowerCase()}`;
        const list = eventBuckets.get(normKey) || [];
        list.push(entry);
        eventBuckets.set(normKey, list);
      }
    }

    const blocks: DisplayBlock[] = [];
    const emittedGroups = new Set<string>();

    for (const entry of proposalEntries) {
      if (entry.item.action === 'create_event') {
        const normKey = `event:${entry.item.data.title.trim().toLowerCase()}`;
        const bucket = eventBuckets.get(normKey) || [];
        if (bucket.length > 1) {
          if (!emittedGroups.has(normKey)) {
            emittedGroups.add(normKey);
            blocks.push({
              kind: 'group',
              key: normKey,
              title: entry.item.data.title.trim(),
              entries: bucket,
            });
          }
          continue;
        }
      }
      blocks.push({ kind: 'single', entry });
    }

    return blocks;
  }, [proposalEntries]);

  const handleConfirmProposal = async () => {
    if (selectedEntries.length === 0) return;
    setIsConfirming(true);
    try {
      // Fusionar automáticamente eventos semanales idénticos (mismo título, horario, ubicación y fin) en un solo evento multi-día
      const weeklyMergeBuckets = new Map<string, EditableProposalEntry[]>();
      const passthroughEntries: EditableProposalEntry[] = [];

      for (const entry of selectedEntries) {
        if (
          entry.item.action === 'create_event' &&
          entry.item.data.recurrence === 'weekly'
        ) {
          const d = entry.item.data;
          // No incluir recurrenceEndDate en la clave porque normalizeQuickAddProposalItem
          // calcula +16 semanas desde cada startDate (ej. Mar vs Jue difieren por 2 días)
          const mergeKey = [
            d.title.trim().toLowerCase(),
            d.isAllDay ? 'allday' : `${d.startTime || '09:00'}-${d.endTime || '10:00'}`,
            (d.location || '').trim().toLowerCase(),
            (d.description || '').trim().toLowerCase(),
          ].join('|');
          const list = weeklyMergeBuckets.get(mergeKey) || [];
          list.push(entry);
          weeklyMergeBuckets.set(mergeKey, list);
        } else {
          passthroughEntries.push(entry);
        }
      }

      let savedCount = 0;

      for (const bucket of weeklyMergeBuckets.values()) {
        if (bucket.length === 1) {
          await executeItem(bucket[0].item);
          savedCount++;
        } else {
          const sorted = [...bucket].sort((a, b) => {
            const aDate = a.item.action === 'create_event' ? a.item.data.startDate : '';
            const bDate = b.item.action === 'create_event' ? b.item.data.startDate : '';
            return aDate.localeCompare(bDate);
          });
          const weekdays = sorted.map((e) => {
            const dStr = e.item.action === 'create_event' ? e.item.data.startDate : '';
            const ms = parseLocalDateTimeMs(dStr, '12:00');
            return new Date(ms).getDay();
          });
          const maxEndDate = sorted.reduce<string | undefined>((acc, e) => {
            const end = e.item.action === 'create_event' ? e.item.data.recurrenceEndDate : undefined;
            if (!end) return acc;
            return !acc || end > acc ? end : acc;
          }, undefined);
          const mergedItem: QuickAddProposalItem =
            sorted[0].item.action === 'create_event'
              ? {
                  ...sorted[0].item,
                  data: {
                    ...sorted[0].item.data,
                    ...(maxEndDate ? { recurrenceEndDate: maxEndDate } : {}),
                  },
                }
              : sorted[0].item;
          await executeItem(mergedItem, weekdays);
          savedCount++;
        }
      }

      for (const entry of passthroughEntries) {
        await executeItem(entry.item);
        savedCount++;
      }

      if (savedCount > 1) {
        toast.success(`${savedCount} elementos creados con Veyra`);
      } else {
        const only = selectedEntries[0].item;
        const label =
          only.action === 'create_reminder'
            ? 'Recordatorio creado'
            : only.action === 'create_event'
              ? 'Evento creado'
              : 'Nota creada';
        toast.success(label);
      }
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Error al guardar.');
    } finally {
      setIsConfirming(false);
    }
  };

  const hasSendableInput = Boolean(promptText.trim() || attachedFile);

  return (
    <div
      onPaste={handlePaste}
      className={cn(
        'text-veyra-text',
        variant === 'sidebar'
          ? 'flex flex-col max-h-full min-h-0 gap-3.5'
          : 'space-y-3.5',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent" />
          <h3 className="text-sm font-bold tracking-tight">Crear con Veyra</h3>
        </div>
        <div className="flex items-center gap-1.5">
          {onMinimize && (
            <button
              type="button"
              onClick={onMinimize}
              title="Minimizar"
              aria-label="Minimizar"
              className="w-8 h-8 rounded-full bg-veyra-elevated hover:bg-veyra-border/70 flex items-center justify-center text-veyra-muted hover:text-veyra-text transition-colors cursor-pointer"
            >
              <Minus className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="w-8 h-8 rounded-full bg-veyra-elevated hover:bg-veyra-border/70 flex items-center justify-center text-veyra-muted hover:text-veyra-text transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Multimodal Input Pill */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          runAI();
        }}
        className="rounded-full bg-veyra-canvas/80 border border-veyra-border p-1.5 pl-4 flex items-center gap-1.5 focus-within:border-accent/60 transition-colors"
      >
        <input
          type="text"
          value={promptText}
          onChange={(e) => setPromptText(e.target.value)}
          placeholder={isRecording ? 'Escuchando...' : 'Escribe o di qué quieres agendar...'}
          autoFocus={autoFocus}
          disabled={isLoading}
          className="flex-1 min-w-0 bg-transparent text-xs sm:text-sm text-veyra-text placeholder:text-veyra-subtle focus:outline-none"
        />

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
          title="Adjuntar imagen"
          className={cn(
            'w-9 h-9 rounded-full flex items-center justify-center transition-colors cursor-pointer shrink-0',
            attachedFile
              ? 'bg-accent/20 text-accent'
              : 'bg-veyra-elevated text-veyra-muted hover:text-veyra-text'
          )}
        >
          <Paperclip className="w-4 h-4" />
        </button>

        {hasSendableInput && !isRecording ? (
          <button
            type="submit"
            disabled={isLoading}
            title="Procesar con Veyra"
            className="w-9 h-9 rounded-full bg-accent text-white flex items-center justify-center hover:opacity-90 transition-opacity cursor-pointer shrink-0 disabled:opacity-50"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ArrowUp className="w-4 h-4" />
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleToggleVoice}
            disabled={isLoading}
            title={isRecording ? 'Detener grabación' : 'Dictar por voz'}
            className={cn(
              'w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer shrink-0',
              isRecording
                ? 'bg-rose-500 text-white animate-pulse'
                : 'bg-accent text-white hover:opacity-90'
            )}
          >
            {isRecording ? <Square className="w-3.5 h-3.5 fill-current" /> : <Mic className="w-4 h-4" />}
          </button>
        )}
      </form>

      {/* Attached File Chip with Preview */}
      {attachedFile && (
        <div className="flex items-center justify-between gap-2.5 p-2 rounded-xl bg-accent/10 border border-accent/25 text-xs animate-veyra-inline-reveal">
          <div className="flex items-center gap-2.5 min-w-0">
            {attachedFile.attachment.mimeType.startsWith('image/') && (
              <img
                src={`data:${attachedFile.attachment.mimeType};base64,${attachedFile.attachment.data}`}
                alt={attachedFile.name}
                className={cn(
                  'w-10 h-10 rounded-lg object-cover border border-accent/30 shrink-0 bg-veyra-canvas transition-all duration-300',
                  isLoading && 'animate-pulse ring-2 ring-accent/50'
                )}
              />
            )}
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-accent/80 font-semibold">
                {isLoading ? 'Analizando imagen...' : 'Imagen adjunta'}
              </div>
              <div className="truncate text-accent font-medium">
                {attachedFile.name}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setAttachedFile(null)}
            disabled={isLoading}
            aria-label="Quitar imagen adjunta"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-veyra-muted hover:text-veyra-text hover:bg-veyra-elevated/60 cursor-pointer shrink-0 transition-colors disabled:opacity-40"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Error / Clarify Banner */}
      {errorMsg && (
        <div className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-300 animate-veyra-inline-reveal">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* AI Proposal Preview Card (Editable + Selectable) */}
      {proposalEntries.length > 0 && (
        <div
          className={cn(
            'p-3 rounded-2xl bg-veyra-elevated/90 border border-accent/40 space-y-2.5 animate-veyra-proposal-reveal',
            variant === 'sidebar' && 'flex-1 min-h-0 flex flex-col'
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-accent uppercase tracking-wider">
              {proposalEntries.length > 1
                ? `${selectedEntries.length} de ${proposalEntries.length} seleccionados`
                : proposalEntries[0].item.action === 'create_reminder'
                  ? 'Recordatorio detectado'
                  : proposalEntries[0].item.action === 'create_event'
                    ? 'Evento detectado'
                    : 'Nota detectada'}
            </span>
            {proposalEntries.length > 1 && (
              <button
                type="button"
                onClick={toggleAllEntries}
                className="text-[11px] font-medium text-veyra-muted hover:text-accent transition-colors cursor-pointer"
              >
                {selectedEntries.length === proposalEntries.length
                  ? 'Deseleccionar todo'
                  : 'Seleccionar todo'}
              </button>
            )}
          </div>

          <div
            className={cn(
              'space-y-2 overflow-y-auto pr-1',
              variant === 'sidebar' ? 'max-h-[52vh] min-h-0' : 'max-h-[52vh]'
            )}
          >
            {(() => {
              const renderEntryCard = (
                entry: EditableProposalEntry,
                idx: number,
                nestedInGroup = false
              ) => {
                const { id, selected, item } = entry;
                const isExpanded = expandedEntryId === id;
                const typeBadge =
                  item.action === 'create_event'
                    ? { label: 'Evento', cls: 'bg-blue-500/15 text-blue-300 border-blue-500/30' }
                    : item.action === 'create_reminder'
                      ? { label: 'Recordatorio', cls: 'bg-rose-500/15 text-rose-300 border-rose-500/30' }
                      : { label: 'Nota', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' };

                const recurrenceLabel =
                  item.action === 'create_event' && item.data.recurrence && item.data.recurrence !== 'none'
                    ? item.data.recurrence === 'weekly'
                      ? 'Semanal'
                      : item.data.recurrence === 'weekdays'
                        ? 'Lun-Vie'
                        : item.data.recurrence === 'daily'
                          ? 'Diario'
                          : item.data.recurrence === 'monthly'
                            ? 'Mensual'
                            : 'Anual'
                    : null;

                const weekdayShort =
                  item.action === 'create_event' ? getWeekdayShortLabel(item.data.startDate) : '';

                const summaryMeta =
                  item.action === 'create_reminder'
                    ? `${item.data.date} • ${item.data.time || '09:00'}`
                    : item.action === 'create_event'
                      ? `${item.data.startDate} • ${item.data.isAllDay
                        ? 'Todo el día'
                        : `${item.data.startTime || '09:00'} - ${item.data.endTime || '10:00'}`
                      }${recurrenceLabel ? ` • ${recurrenceLabel}` : ''}`
                      : 'Nota';

                return (
                  <div
                    key={id}
                    style={nestedInGroup ? undefined : { animationDelay: `${Math.min(idx * 45, 360)}ms` }}
                    className={cn(
                      'rounded-xl border transition-all duration-200',
                      !nestedInGroup && 'animate-veyra-proposal-item-in',
                      nestedInGroup
                        ? selected
                          ? 'bg-veyra-canvas/55 border-veyra-border/70 hover:border-accent/40'
                          : 'bg-veyra-canvas/25 border-veyra-border/40 opacity-55'
                        : selected
                          ? 'bg-veyra-card border-veyra-border hover:border-accent/40'
                          : 'bg-veyra-card/40 border-veyra-border/50 opacity-55'
                    )}
                  >
                    {/* Item Row Header */}
                    <div className="px-2.5 py-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleEntrySelection(id)}
                        aria-label={selected ? 'Deseleccionar elemento' : 'Seleccionar elemento'}
                        className={cn(
                          'w-4.5 h-4.5 min-w-[18px] min-h-[18px] rounded-md border flex items-center justify-center transition-colors cursor-pointer shrink-0',
                          selected
                            ? 'bg-accent border-accent text-white'
                            : 'border-veyra-border bg-veyra-canvas/60 hover:border-veyra-muted'
                        )}
                      >
                        {selected && <Check className="w-3 h-3 animate-veyra-check-pop" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => setExpandedEntryId(isExpanded ? null : id)}
                        className="flex-1 min-w-0 text-left cursor-pointer"
                      >
                        {nestedInGroup ? (
                          <div className="flex items-center gap-1.5 min-w-0">
                            {weekdayShort && (
                              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-accent/15 text-accent border border-accent/25 shrink-0">
                                {weekdayShort}
                              </span>
                            )}
                            <span className="text-[11px] text-veyra-text font-medium truncate">
                              {summaryMeta}
                              {item.action === 'create_event' && item.data.location
                                ? ` • ${item.data.location}`
                                : ''}
                            </span>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span
                                className={cn(
                                  'text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md border shrink-0',
                                  typeBadge.cls
                                )}
                              >
                                {typeBadge.label}
                              </span>
                              <span className="text-xs font-semibold text-veyra-text truncate">
                                {item.data.title || 'Sin título'}
                              </span>
                            </div>
                            <div className="text-[11px] text-veyra-muted truncate mt-0.5">
                              {summaryMeta}
                              {item.action === 'create_event' && item.data.location
                                ? ` • ${item.data.location}`
                                : ''}
                            </div>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => setExpandedEntryId(isExpanded ? null : id)}
                        title={isExpanded ? 'Ocultar edición' : 'Editar'}
                        className={cn(
                          'w-7 h-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer shrink-0',
                          isExpanded
                            ? 'bg-accent/20 text-accent'
                            : 'text-veyra-muted hover:text-veyra-text hover:bg-veyra-elevated'
                        )}
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5 transition-transform duration-200" />
                        ) : (
                          <Pencil className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>

                    {/* Smooth Collapsible Inline Editor */}
                    <div
                      className={cn(
                        'grid transition-[grid-template-rows,opacity] duration-200 ease-out',
                        isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                      )}
                    >
                      <div className="overflow-hidden">
                        <div className="px-2.5 pb-2.5 pt-1.5 border-t border-veyra-border/60 space-y-2 text-xs">
                          <div className={cn(item.action === 'create_event' && 'grid grid-cols-1 sm:grid-cols-12 gap-2')}>
                            <div className={cn(item.action === 'create_event' && 'sm:col-span-7')}>
                              <label className="block text-[10px] text-veyra-muted mb-0.5">
                                Título
                              </label>
                              <input
                                type="text"
                                value={item.data.title}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  updateEntryItem(id, (curr) => ({
                                    ...curr,
                                    data: { ...curr.data, title: val },
                                  } as QuickAddProposalItem));
                                }}
                                className="w-full px-2.5 py-1.5 rounded-lg bg-veyra-canvas/80 border border-veyra-border text-xs text-veyra-text focus:outline-none focus:border-accent/60"
                              />
                            </div>

                            {item.action === 'create_event' && (
                              <div className="sm:col-span-5">
                                <label className="flex items-center gap-1 text-[10px] text-veyra-muted mb-0.5">
                                  <Tag className="w-2.5 h-2.5" />
                                  <span>Etiquetas (#)</span>
                                </label>
                                <div className="min-h-[30px] px-2 py-1 rounded-lg bg-veyra-canvas/80 border border-veyra-border focus-within:border-accent/60 flex flex-wrap items-center gap-1">
                                  {(item.data.tags || []).map((tag) => (
                                    <span
                                      key={tag}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-veyra-elevated border border-accent/30 text-[10.5px] font-mono text-veyra-text/90"
                                    >
                                      <span>#{tag}</span>
                                      <button
                                        type="button"
                                        onClick={() => removeTagFromEventEntry(id, tag)}
                                        aria-label={`Quitar etiqueta ${tag}`}
                                        className="text-veyra-muted hover:text-rose-400 cursor-pointer transition-colors"
                                      >
                                        <X className="w-2.5 h-2.5" />
                                      </button>
                                    </span>
                                  ))}
                                  <input
                                    type="text"
                                    value={tagDraftById[id] || ''}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      if (val.includes(',')) {
                                        addTagToEventEntry(id, val);
                                      } else {
                                        setTagDraftById((prev) => ({ ...prev, [id]: val }));
                                      }
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        addTagToEventEntry(id, tagDraftById[id] || '');
                                      } else if (
                                        e.key === 'Backspace' &&
                                        !(tagDraftById[id] || '') &&
                                        item.data.tags &&
                                        item.data.tags.length > 0
                                      ) {
                                        removeTagFromEventEntry(
                                          id,
                                          item.data.tags[item.data.tags.length - 1]
                                        );
                                      }
                                    }}
                                    onBlur={() => {
                                      if ((tagDraftById[id] || '').trim()) {
                                        addTagToEventEntry(id, tagDraftById[id] || '');
                                      }
                                    }}
                                    placeholder={
                                      item.data.tags && item.data.tags.length > 0
                                        ? '+ #tag'
                                        : '#clase, #trabajo...'
                                    }
                                    className="flex-1 min-w-[68px] bg-transparent text-[11px] font-mono text-veyra-text placeholder:text-veyra-subtle focus:outline-none"
                                  />
                                </div>
                              </div>
                            )}
                          </div>

                          {item.action === 'create_reminder' && (
                            <>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-[10px] text-veyra-muted mb-0.5">
                                    Fecha
                                  </label>
                                  <input
                                    type="date"
                                    value={item.data.date}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      updateEntryItem(id, (curr) =>
                                        curr.action === 'create_reminder'
                                          ? { ...curr, data: { ...curr.data, date: val } }
                                          : curr
                                      );
                                    }}
                                    className="w-full px-2 py-1.5 rounded-lg bg-veyra-canvas/80 border border-veyra-border text-xs text-veyra-text focus:outline-none focus:border-accent/60"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] text-veyra-muted mb-0.5">
                                    Hora
                                  </label>
                                  <input
                                    type="time"
                                    value={item.data.time || '09:00'}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      updateEntryItem(id, (curr) =>
                                        curr.action === 'create_reminder'
                                          ? { ...curr, data: { ...curr.data, time: val } }
                                          : curr
                                      );
                                    }}
                                    className="w-full px-2 py-1.5 rounded-lg bg-veyra-canvas/80 border border-veyra-border text-xs text-veyra-text focus:outline-none focus:border-accent/60"
                                  />
                                </div>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <input
                                  type="text"
                                  placeholder="Descripción (opcional)"
                                  value={item.data.description || ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    updateEntryItem(id, (curr) =>
                                      curr.action === 'create_reminder'
                                        ? { ...curr, data: { ...curr.data, description: val } }
                                        : curr
                                    );
                                  }}
                                  className="flex-1 px-2.5 py-1.5 rounded-lg bg-veyra-canvas/80 border border-veyra-border text-xs text-veyra-text placeholder:text-veyra-subtle focus:outline-none focus:border-accent/60"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateEntryItem(id, (curr) =>
                                      curr.action === 'create_reminder'
                                        ? {
                                          ...curr,
                                          data: {
                                            ...curr.data,
                                            priority:
                                              curr.data.priority === 'critical'
                                                ? 'normal'
                                                : 'critical',
                                          },
                                        }
                                        : curr
                                    )
                                  }
                                  className={cn(
                                    'px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold cursor-pointer transition-colors shrink-0',
                                    item.data.priority === 'critical'
                                      ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                                      : 'bg-veyra-canvas/80 border-veyra-border text-veyra-muted hover:text-veyra-text'
                                  )}
                                >
                                  {item.data.priority === 'critical' ? 'Crítico' : 'Normal'}
                                </button>
                              </div>
                            </>
                          )}

                          {item.action === 'create_event' && (
                            <>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-[10px] text-veyra-muted mb-0.5">
                                    Fecha inicio
                                  </label>
                                  <input
                                    type="date"
                                    value={item.data.startDate}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      updateEntryItem(id, (curr) =>
                                        curr.action === 'create_event'
                                          ? {
                                            ...curr,
                                            data: {
                                              ...curr.data,
                                              startDate: val,
                                              endDate: curr.data.endDate || val,
                                            },
                                          }
                                          : curr
                                      );
                                    }}
                                    className="w-full px-2 py-1.5 rounded-lg bg-veyra-canvas/80 border border-veyra-border text-xs text-veyra-text focus:outline-none focus:border-accent/60"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] text-veyra-muted mb-0.5">
                                    Fecha fin
                                  </label>
                                  <input
                                    type="date"
                                    value={item.data.endDate || item.data.startDate}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      updateEntryItem(id, (curr) =>
                                        curr.action === 'create_event'
                                          ? { ...curr, data: { ...curr.data, endDate: val } }
                                          : curr
                                      );
                                    }}
                                    className="w-full px-2 py-1.5 rounded-lg bg-veyra-canvas/80 border border-veyra-border text-xs text-veyra-text focus:outline-none focus:border-accent/60"
                                  />
                                </div>
                              </div>

                              <div className="flex items-center justify-between gap-2">
                                <label className="inline-flex items-center gap-1.5 text-[11px] text-veyra-muted cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(item.data.isAllDay)}
                                    onChange={(e) => {
                                      const checked = e.target.checked;
                                      updateEntryItem(id, (curr) =>
                                        curr.action === 'create_event'
                                          ? { ...curr, data: { ...curr.data, isAllDay: checked } }
                                          : curr
                                      );
                                    }}
                                    className="rounded border-veyra-border accent-[var(--accent-primary)]"
                                  />
                                  <span>Todo el día</span>
                                </label>
                              </div>

                              {!item.data.isAllDay && (
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="block text-[10px] text-veyra-muted mb-0.5">
                                      Hora inicio
                                    </label>
                                    <input
                                      type="time"
                                      value={item.data.startTime || '09:00'}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        updateEntryItem(id, (curr) =>
                                          curr.action === 'create_event'
                                            ? { ...curr, data: { ...curr.data, startTime: val } }
                                            : curr
                                        );
                                      }}
                                      className="w-full px-2 py-1.5 rounded-lg bg-veyra-canvas/80 border border-veyra-border text-xs text-veyra-text focus:outline-none focus:border-accent/60"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] text-veyra-muted mb-0.5">
                                      Hora fin
                                    </label>
                                    <input
                                      type="time"
                                      value={item.data.endTime || '10:00'}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        updateEntryItem(id, (curr) =>
                                          curr.action === 'create_event'
                                            ? { ...curr, data: { ...curr.data, endTime: val } }
                                            : curr
                                        );
                                      }}
                                      className="w-full px-2 py-1.5 rounded-lg bg-veyra-canvas/80 border border-veyra-border text-xs text-veyra-text focus:outline-none focus:border-accent/60"
                                    />
                                  </div>
                                </div>
                              )}

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-[10px] text-veyra-muted mb-0.5">
                                    Repetición
                                  </label>
                                  <select
                                    value={item.data.recurrence || 'none'}
                                    onChange={(e) => {
                                      const val = e.target.value as
                                        | 'none'
                                        | 'daily'
                                        | 'weekly'
                                        | 'weekdays'
                                        | 'monthly'
                                        | 'yearly';
                                      updateEntryItem(id, (curr) =>
                                        curr.action === 'create_event'
                                          ? {
                                            ...curr,
                                            data: {
                                              ...curr.data,
                                              recurrence: val,
                                              recurrenceEndDate:
                                                val !== 'none'
                                                  ? curr.data.recurrenceEndDate ||
                                                  addWeeksToYmd(curr.data.startDate, 16)
                                                  : undefined,
                                            },
                                          }
                                          : curr
                                      );
                                    }}
                                    className="w-full px-2 py-1.5 rounded-lg bg-veyra-canvas/80 border border-veyra-border text-xs text-veyra-text focus:outline-none focus:border-accent/60"
                                  >
                                    <option value="none">Sin repetición</option>
                                    <option value="weekly">Cada semana</option>
                                    <option value="weekdays">Lunes a viernes</option>
                                    <option value="daily">Cada día</option>
                                    <option value="monthly">Cada mes</option>
                                    <option value="yearly">Cada año</option>
                                  </select>
                                </div>
                                {item.data.recurrence && item.data.recurrence !== 'none' && (
                                  <div>
                                    <label className="block text-[10px] text-veyra-muted mb-0.5">
                                      Repetir hasta
                                    </label>
                                    <input
                                      type="date"
                                      value={item.data.recurrenceEndDate || ''}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        updateEntryItem(id, (curr) =>
                                          curr.action === 'create_event'
                                            ? {
                                              ...curr,
                                              data: {
                                                ...curr.data,
                                                recurrenceEndDate: val || undefined,
                                              },
                                            }
                                            : curr
                                        );
                                      }}
                                      className="w-full px-2 py-1.5 rounded-lg bg-veyra-canvas/80 border border-veyra-border text-xs text-veyra-text focus:outline-none focus:border-accent/60"
                                    />
                                  </div>
                                )}
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <input
                                  type="text"
                                  placeholder="Ubicación (opcional)"
                                  value={item.data.location || ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    updateEntryItem(id, (curr) =>
                                      curr.action === 'create_event'
                                        ? { ...curr, data: { ...curr.data, location: val } }
                                        : curr
                                    );
                                  }}
                                  className="w-full px-2.5 py-1.5 rounded-lg bg-veyra-canvas/80 border border-veyra-border text-xs text-veyra-text placeholder:text-veyra-subtle focus:outline-none focus:border-accent/60"
                                />
                                <input
                                  type="text"
                                  placeholder="Descripción (opcional)"
                                  value={item.data.description || ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    updateEntryItem(id, (curr) =>
                                      curr.action === 'create_event'
                                        ? { ...curr, data: { ...curr.data, description: val } }
                                        : curr
                                    );
                                  }}
                                  className="w-full px-2.5 py-1.5 rounded-lg bg-veyra-canvas/80 border border-veyra-border text-xs text-veyra-text placeholder:text-veyra-subtle focus:outline-none focus:border-accent/60"
                                />
                              </div>
                            </>
                          )}

                          {item.action === 'create_note' && (
                            <div>
                              <label className="block text-[10px] text-veyra-muted mb-0.5">
                                Contenido
                              </label>
                              <textarea
                                rows={3}
                                value={entry.notePlainText ?? htmlToPlainText(item.data.contentHtml)}
                                onChange={(e) => {
                                  const plain = e.target.value;
                                  updateEntryItem(
                                    id,
                                    (curr) =>
                                      curr.action === 'create_note'
                                        ? {
                                          ...curr,
                                          data: {
                                            ...curr.data,
                                            contentHtml: plainTextToHtml(plain),
                                          },
                                        }
                                        : curr,
                                    plain
                                  );
                                }}
                                className="w-full px-2.5 py-1.5 rounded-lg bg-veyra-canvas/80 border border-veyra-border text-xs text-veyra-text focus:outline-none focus:border-accent/60 resize-y"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              };

              return groupedProposals.map((block, blockIdx) => {
                if (block.kind === 'single') {
                  return renderEntryCard(block.entry, blockIdx, false);
                }

                const groupIds = block.entries.map((e) => e.id);
                const selectedInGroup = block.entries.filter((e) => e.selected).length;
                const allGroupSelected = selectedInGroup === block.entries.length;
                const someGroupSelected = selectedInGroup > 0 && !allGroupSelected;
                const isGroupCollapsed = Boolean(collapsedGroupKeys[block.key]);
                const weekdayChips = Array.from(
                  new Set(
                    block.entries
                      .map((e) =>
                        e.item.action === 'create_event'
                          ? getWeekdayShortLabel(e.item.data.startDate)
                          : ''
                      )
                      .filter(Boolean)
                  )
                );

                return (
                  <div
                    key={block.key}
                    style={{ animationDelay: `${Math.min(blockIdx * 45, 360)}ms` }}
                    className={cn(
                      'rounded-xl border transition-all duration-200 animate-veyra-proposal-item-in',
                      selectedInGroup > 0
                        ? 'bg-veyra-card border-veyra-border hover:border-accent/40'
                        : 'bg-veyra-card/40 border-veyra-border/50 opacity-60'
                    )}
                  >
                    {/* Group Header */}
                    <div className="px-2.5 py-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleGroupSelection(groupIds)}
                        aria-label={
                          allGroupSelected ? 'Deseleccionar grupo' : 'Seleccionar grupo'
                        }
                        className={cn(
                          'w-4.5 h-4.5 min-w-[18px] min-h-[18px] rounded-md border flex items-center justify-center transition-colors cursor-pointer shrink-0',
                          allGroupSelected
                            ? 'bg-accent border-accent text-white'
                            : someGroupSelected
                              ? 'bg-accent/25 border-accent text-accent'
                              : 'border-veyra-border bg-veyra-canvas/60 hover:border-veyra-muted'
                        )}
                      >
                        {(allGroupSelected || someGroupSelected) && (
                          <Check className="w-3 h-3 animate-veyra-check-pop" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleGroupCollapse(block.key)}
                        className="flex-1 min-w-0 text-left cursor-pointer"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md border shrink-0 bg-blue-500/15 text-blue-300 border-blue-500/30">
                            {block.entries.length} días/sem
                          </span>
                          <span className="text-xs font-semibold text-veyra-text truncate">
                            {block.title || 'Sin título'}
                          </span>
                        </div>
                        <div className="text-[11px] text-veyra-muted truncate mt-0.5">
                          {weekdayChips.join(', ')} • {selectedInGroup}/{block.entries.length} seleccionados
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleGroupCollapse(block.key)}
                        title={isGroupCollapsed ? 'Expandir sesiones' : 'Contraer sesiones'}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-veyra-muted hover:text-veyra-text hover:bg-veyra-elevated transition-colors cursor-pointer shrink-0"
                      >
                        <ChevronDown
                          className={cn(
                            'w-3.5 h-3.5 transition-transform duration-200',
                            isGroupCollapsed && '-rotate-90'
                          )}
                        />
                      </button>
                    </div>

                    {/* Group Sessions List */}
                    <div
                      className={cn(
                        'grid transition-[grid-template-rows,opacity] duration-200 ease-out',
                        !isGroupCollapsed
                          ? 'grid-rows-[1fr] opacity-100'
                          : 'grid-rows-[0fr] opacity-0'
                      )}
                    >
                      <div className="overflow-hidden">
                        <div className="px-2 pb-2 pt-0.5 space-y-1.5 border-t border-veyra-border/50">
                          {block.entries.map((subEntry, subIdx) =>
                            renderEntryCard(subEntry, subIdx, true)
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setProposalEntries([]);
                setExpandedEntryId(null);
              }}
              className="px-3 py-1.5 rounded-full text-xs font-medium text-veyra-muted hover:text-veyra-text cursor-pointer transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={isConfirming || selectedEntries.length === 0}
              onClick={handleConfirmProposal}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-accent text-white text-xs font-semibold hover:opacity-90 cursor-pointer disabled:opacity-50 transition-opacity"
            >
              {isConfirming ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              <span>
                {proposalEntries.length > 1
                  ? `Confirmar (${selectedEntries.length})`
                  : 'Confirmar'}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* 3 Manual Quick Creation Chips */}
      <div className={cn('grid grid-cols-3 gap-2', variant === 'sidebar' && 'shrink-0')}>
        <button
          type="button"
          onClick={() => {
            onClose();
            onManualReminder();
          }}
          className="flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-full bg-veyra-elevated/80 hover:bg-veyra-elevated border border-veyra-border text-xs font-semibold text-veyra-text cursor-pointer transition-colors"
        >
          <Clock className="w-3.5 h-3.5 text-rose-400 shrink-0" />
          <span className="truncate">Recordatorio</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onClose();
            onManualEvent();
          }}
          className="flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-full bg-veyra-elevated/80 hover:bg-veyra-elevated border border-veyra-border text-xs font-semibold text-veyra-text cursor-pointer transition-colors"
        >
          <Calendar className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          <span className="truncate">Evento</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onClose();
            onManualNote();
          }}
          className="flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-full bg-veyra-elevated/80 hover:bg-veyra-elevated border border-veyra-border text-xs font-semibold text-veyra-text cursor-pointer transition-colors"
        >
          <Notebook className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="truncate">Nota</span>
        </button>
      </div>
    </div>
  );
};
