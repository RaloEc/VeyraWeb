import React from 'react';
import {
  Calendar,
  Clock,
  MapPin,
  Repeat,
  FileText,
  CalendarPlus,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import type { CalendarEvent } from '../../hooks/useEvents';
import { cn } from '../../lib/utils';
import { useTheme } from '../../theme/ThemeProvider';
import { ConfirmTooltip } from '../../components/common/ConfirmTooltip';

export interface EventCardProps {
  event: CalendarEvent;
  onDelete?: (id: string) => void;
  onEdit?: (event: CalendarEvent, e?: React.MouseEvent) => void;
  onDoubleClick?: (event: CalendarEvent) => void;
  onSnooze?: (id: string) => void;
  onSelectNote?: (noteId: string) => void;
  linkedNoteTitle?: string;
  isSelected?: boolean;
}

function normalizeHex(hex?: string | null, fallback = '#3B82F6'): string {
  if (!hex) return fallback;
  let clean = hex.trim();
  if (!clean.startsWith('#')) clean = `#${clean}`;
  if (clean.length === 4) {
    clean = `#${clean[1]}${clean[1]}${clean[2]}${clean[2]}${clean[3]}${clean[3]}`;
  }
  if (clean.length >= 7) {
    return clean.slice(0, 7);
  }
  return fallback;
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

export const EventCard: React.FC<EventCardProps> = ({
  event,
  onDelete,
  onEdit,
  onDoubleClick,
  onSnooze,
  onSelectNote,
  linkedNoteTitle,
  isSelected,
}) => {
  const { palette } = useTheme();

  // Color from event or fallback
  const eventColor = normalizeHex(event.color, palette.primary || '#3B82F6');

  const now = Date.now();
  const isHappeningNow = now >= event.start_time_ms && now <= event.end_time_ms;

  const durationStr = formatDuration(event.start_time_ms, event.end_time_ms);
  const timeRangeStr = formatTimeRange(event.start_time_ms, event.end_time_ms);

  const containerBg = isHappeningNow ? `${eventColor}1c` : `${eventColor}0c`;
  const containerBorder = isHappeningNow ? `${eventColor}60` : `${eventColor}30`;

  const hasChips = Boolean(event.location || event.repeat_rule || event.note_id || linkedNoteTitle);

  return (
    <div
      onClick={(e) => onEdit?.(event, e)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick?.(event);
      }}
      style={{
        backgroundColor: containerBg,
        borderColor: containerBorder,
      }}
      className={cn(
        'group relative py-2 px-2.5 rounded-lg transition-all cursor-pointer select-none flex items-stretch gap-2.5 border w-full max-w-full overflow-hidden',
        'hover:bg-opacity-80 hover:shadow-xs',
        isSelected && 'ring-1'
      )}
    >
      {/* 1. Lateral Accent Pill using eventColor */}
      <div
        style={{ backgroundColor: eventColor }}
        className="w-[3px] rounded-full self-stretch shrink-0"
      />

      {/* 2. Main content container */}
      <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5 overflow-hidden">
        {/* Row 1: Calendar box + Title + Status Badge + Actions */}
        <div className="flex items-center justify-between gap-1.5 min-w-0">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div
              style={{
                backgroundColor: `${eventColor}22`,
                color: eventColor,
                borderColor: `${eventColor}35`,
              }}
              className="w-5 h-5 rounded-[5px] border flex items-center justify-center shrink-0"
            >
              <Calendar className="w-2.5 h-2.5 stroke-[2.4]" />
            </div>
            <span className="text-[12.5px] font-bold tracking-tight text-slate-900 dark:text-white truncate leading-tight">
              {event.title}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {isHappeningNow ? (
              <span
                style={{
                  backgroundColor: `${eventColor}24`,
                  color: eventColor,
                }}
                className="px-1.5 py-0.5 rounded text-[8.5px] font-extrabold tracking-wider uppercase flex items-center gap-1"
              >
                <span
                  style={{ backgroundColor: eventColor }}
                  className="w-1 h-1 rounded-full animate-pulse"
                />
                EN CURSO
              </span>
            ) : null}

            {/* Hover Actions (compact) */}
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              {event.location && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (event.location?.startsWith('http')) {
                      window.open(event.location, '_blank');
                    } else {
                      window.open('https://meet.google.com/new', '_blank');
                    }
                  }}
                  title="Unirse a reunión"
                  className="p-0.5 rounded text-slate-400 hover:text-white transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                </button>
              )}

              {onSnooze && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSnooze(event.id);
                  }}
                  title="Posponer 1 día"
                  className="p-0.5 rounded text-slate-400 hover:text-white transition-colors"
                >
                  <CalendarPlus className="w-3 h-3" />
                </button>
              )}

              {onDelete && (
                <ConfirmTooltip
                  title="¿Eliminar evento?"
                  description={`"${event.title}"`}
                  confirmText="Eliminar"
                  onConfirm={() => onDelete(event.id)}
                >
                  <button
                    type="button"
                    title="Eliminar evento"
                    className="p-0.5 rounded text-slate-400 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </ConfirmTooltip>
              )}
            </div>
          </div>
        </div>

        {/* Row 2: Clock & Full Time (unclipped) + Duration Pill */}
        <div className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-zinc-300 font-mono leading-none flex-wrap">
          <div className="flex items-center gap-1 shrink-0">
            <Clock className="w-2.5 h-2.5 text-slate-400 dark:text-white/40 shrink-0" />
            <span className="whitespace-nowrap font-medium">{timeRangeStr}</span>
          </div>
          {durationStr && (
            <span
              style={{
                backgroundColor: `${eventColor}18`,
                color: eventColor,
                borderColor: `${eventColor}30`,
              }}
              className="px-1.5 py-0.5 rounded text-[9px] font-sans font-bold border tracking-wider shrink-0"
            >
              {durationStr}
            </span>
          )}
        </div>

        {/* Row 3: Chips that wrap onto next line when space is constrained */}
        {hasChips && (
          <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
            {event.location && (
              <span
                title={`Ubicación: ${event.location}`}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-sans text-slate-600 dark:text-zinc-300 bg-black/5 dark:bg-white/[0.06] border border-black/5 dark:border-white/[0.08] max-w-full truncate"
              >
                <MapPin style={{ color: eventColor }} className="w-2.5 h-2.5 shrink-0" />
                <span className="truncate">{event.location}</span>
              </span>
            )}

            {event.repeat_rule && (
              <span
                title="Evento recurrente"
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-sans text-slate-600 dark:text-zinc-300 bg-black/5 dark:bg-white/[0.06] border border-black/5 dark:border-white/[0.08] shrink-0"
              >
                <Repeat style={{ color: eventColor }} className="w-2.5 h-2.5 shrink-0" />
                <span>Repetir</span>
              </span>
            )}

            {(event.note_id || linkedNoteTitle) && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (event.note_id && onSelectNote) {
                    onSelectNote(event.note_id);
                  }
                }}
                title={linkedNoteTitle ? `Nota: ${linkedNoteTitle}` : 'Abrir nota vinculada'}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-sans text-slate-600 dark:text-zinc-300 bg-black/5 dark:bg-white/[0.06] border border-black/5 dark:border-white/[0.08] hover:border-accent hover:text-accent transition-colors max-w-full truncate cursor-pointer"
              >
                <FileText style={{ color: eventColor }} className="w-2.5 h-2.5 shrink-0" />
                <span className="truncate">{linkedNoteTitle || 'Nota vinculada'}</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
