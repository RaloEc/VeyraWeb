import React, { useState, useRef, useEffect } from 'react';
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
} from 'lucide-react';
import { toast } from 'sonner';
import {
  parseQuickAddWithAI,
  fileToBase64Attachment,
  type QuickAddAttachment,
  type QuickAddProposal,
  type QuickAddProposalItem,
} from '../../lib/ai/ai-quick-add-service';
import { cn } from '../../lib/utils';

export interface CreateWithVeyraAssistantProps {
  onClose: () => void;
  onManualReminder: () => void;
  onManualEvent: () => void;
  onManualNote: () => void;
  onSaveReminder: (payload: {
    title: string;
    due_date_ms: number;
    priority?: 1 | 3;
    control_level?: 'normal' | 'critical';
    description?: string;
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
  }) => Promise<unknown>;
  onSaveNote: (title: string, contentHtml?: string) => Promise<unknown>;
  autoFocus?: boolean;
  className?: string;
}

function parseLocalDateTimeMs(dateStr: string, timeStr: string, fallbackOffsetHours = 1): number {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const [hh, mm] = /^\d{1,2}:\d{2}$/.test(timeStr) ? timeStr.split(':').map(Number) : [9, 0];
    return new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0).getTime();
  }
  return Date.now() + fallbackOffsetHours * 3600000;
}

export const CreateWithVeyraAssistant: React.FC<CreateWithVeyraAssistantProps> = ({
  onClose,
  onManualReminder,
  onManualEvent,
  onManualNote,
  onSaveReminder,
  onSaveEvent,
  onSaveNote,
  autoFocus = false,
  className,
}) => {
  const [promptText, setPromptText] = useState('');
  const [attachedFile, setAttachedFile] = useState<{ name: string; attachment: QuickAddAttachment } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [proposal, setProposal] = useState<QuickAddProposal | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

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
    setProposal(null);

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
        setProposal(result);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error al procesar con Veyra IA.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const attachment = await fileToBase64Attachment(file);
      setAttachedFile({ name: file.name, attachment });
      setErrorMsg(null);
    } catch (err: any) {
      toast.error(err?.message || 'No se pudo adjuntar el archivo.');
    }
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

  const executeItem = async (item: QuickAddProposalItem) => {
    if (item.action === 'create_reminder') {
      const dueMs = parseLocalDateTimeMs(item.data.date, item.data.time || '09:00');
      const isCrit = item.data.priority === 'critical';
      await onSaveReminder({
        title: item.data.title,
        due_date_ms: dueMs,
        priority: isCrit ? 3 : 1,
        control_level: isCrit ? 'critical' : 'normal',
        description: item.data.description,
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
      await onSaveEvent({
        title: item.data.title,
        start_time_ms: startMs,
        end_time_ms: endMs,
        is_all_day: Boolean(item.data.isAllDay),
        all_day_date: item.data.isAllDay ? item.data.startDate : null,
        location: item.data.location,
        description: item.data.description,
        tags: item.data.tags || null,
      });
    } else if (item.action === 'create_note') {
      await onSaveNote(item.data.title, item.data.contentHtml);
    }
  };

  const handleConfirmProposal = async () => {
    if (!proposal || proposal.action === 'clarify' || proposal.action === 'unknown') return;
    setIsConfirming(true);
    try {
      if (proposal.action === 'create_batch') {
        for (const item of proposal.items) {
          await executeItem(item);
        }
        toast.success(`${proposal.items.length} elementos creados con Veyra`);
      } else {
        await executeItem(proposal);
        const label =
          proposal.action === 'create_reminder'
            ? 'Recordatorio creado'
            : proposal.action === 'create_event'
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
    <div className={cn('space-y-3.5 text-veyra-text', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent" />
          <h3 className="text-sm font-bold tracking-tight">Crear con Veyra</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="w-8 h-8 rounded-full bg-veyra-elevated hover:bg-veyra-border/70 flex items-center justify-center text-veyra-muted hover:text-veyra-text transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
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

      {/* Attached File Chip */}
      {attachedFile && (
        <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-accent/10 border border-accent/25 text-xs">
          <span className="truncate text-accent font-medium">
            Imagen adjunta: {attachedFile.name}
          </span>
          <button
            type="button"
            onClick={() => setAttachedFile(null)}
            className="text-veyra-muted hover:text-veyra-text cursor-pointer ml-2"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Error / Clarify Banner */}
      {errorMsg && (
        <div className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-300">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* AI Proposal Preview Card */}
      {proposal && proposal.action !== 'clarify' && proposal.action !== 'unknown' && (
        <div className="p-3 rounded-2xl bg-veyra-elevated/90 border border-accent/40 space-y-2.5 animate-in fade-in duration-150">
          {proposal.action === 'create_batch' ? (
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              <div className="text-[11px] font-bold text-accent uppercase tracking-wider">
                {proposal.items.length} elementos detectados
              </div>
              {proposal.items.map((it, idx) => (
                <div
                  key={idx}
                  className="px-2.5 py-1.5 rounded-lg bg-veyra-card border border-veyra-border text-xs flex items-center justify-between gap-2"
                >
                  <span className="font-medium truncate">{it.data.title}</span>
                  <span className="text-[10px] text-veyra-muted shrink-0">
                    {it.action === 'create_reminder'
                      ? `${it.data.date} ${it.data.time}`
                      : it.action === 'create_event'
                      ? `${it.data.startDate} ${it.data.startTime}`
                      : 'Nota'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-accent">
                  {proposal.action === 'create_reminder'
                    ? 'Recordatorio sugerido'
                    : proposal.action === 'create_event'
                    ? 'Evento sugerido'
                    : 'Nota sugerida'}
                </span>
              </div>
              <p className="text-sm font-semibold text-veyra-text">{proposal.data.title}</p>
              {proposal.action === 'create_reminder' && (
                <p className="text-[11px] text-veyra-muted">
                  {proposal.data.date} • {proposal.data.time}
                </p>
              )}
              {proposal.action === 'create_event' && (
                <p className="text-[11px] text-veyra-muted">
                  {proposal.data.startDate} •{' '}
                  {proposal.data.isAllDay
                    ? 'Todo el día'
                    : `${proposal.data.startTime} - ${proposal.data.endTime}`}
                </p>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setProposal(null)}
              className="px-3 py-1.5 rounded-full text-xs font-medium text-veyra-muted hover:text-veyra-text cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={isConfirming}
              onClick={handleConfirmProposal}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-accent text-white text-xs font-semibold hover:opacity-90 cursor-pointer disabled:opacity-50"
            >
              {isConfirming ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              <span>Confirmar</span>
            </button>
          </div>
        </div>
      )}

      {/* 3 Manual Quick Creation Chips */}
      <div className="grid grid-cols-3 gap-2">
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
