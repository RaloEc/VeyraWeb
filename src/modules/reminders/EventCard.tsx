import React from 'react';
import {
  Calendar,
  FileText,
  CalendarPlus,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import type { CalendarEvent } from '../../hooks/useEvents';
import { cn } from '../../lib/utils';
import { useTheme } from '../../theme/ThemeProvider';
import { ConfirmTooltip } from '../../components/common/ConfirmTooltip';
import { parseRecurrenceRule } from '../../services/recurrence/recurrenceEngine';

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

function extractLocationUrl(location?: string | null): string | null {
  if (!location) return null;
  const trimmed = location.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
  const match = trimmed.match(/(https?:\/\/[^\s]+)/i);
  return match ? match[1] : null;
}

function formatLocationLabel(location?: string | null, locationUrl?: string | null): string | null {
  if (!location) return null;
  const trimmed = location.trim();
  if (!trimmed) return null;
  if (locationUrl || /meet\.google|zoom\.us|teams\.microsoft/i.test(trimmed)) {
    return 'Virtual';
  }
  return trimmed;
}

function formatTimeRange(startMs: number, endMs: number, isAllDay?: boolean | null): string {
  const s = Number(startMs);
  const e = Number(endMs);
  if (!s) return '';
  const start = new Date(s);
  const now = new Date();
  const isToday =
    start.getDate() === now.getDate() &&
    start.getMonth() === now.getMonth() &&
    start.getFullYear() === now.getFullYear();

  let prefix = '';
  if (!isToday) {
    const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    prefix = `${start.getDate()} ${months[start.getMonth()]} · `;
  }

  if (isAllDay) {
    return `${prefix}Todo el día`;
  }

  const startStr = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

  if (!e || e <= s) return `${prefix}${startStr}`;
  const end = new Date(e);
  const endStr = end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${prefix}${startStr} - ${endStr}`;
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
  const eventColor = normalizeHex(event.color, palette.primary || '#3B82F6');

  const now = Date.now();
  const isHappeningNow = now >= event.start_time_ms && now <= event.end_time_ms;
  const isRecurring =
    parseRecurrenceRule(event.recurrence_rule || event.repeat_rule).type !== 'none';

  const timeRangeStr = formatTimeRange(event.start_time_ms, event.end_time_ms, event.is_all_day);
  const locationUrl = extractLocationUrl(event.location);
  const locationLabel = formatLocationLabel(event.location, locationUrl);
  const hasLinkedNote = Boolean(event.note_id || linkedNoteTitle);

  const containerBg = isHappeningNow ? `${eventColor}1c` : `${eventColor}0c`;
  const containerBorder = isHappeningNow ? `${eventColor}60` : `${eventColor}30`;

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
      <div className="flex-1 min-w-0 flex flex-col justify-center gap-1 overflow-hidden">
        {/* Row 1: Calendar box + Title + Status / Hover Actions */}
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
            {isHappeningNow && (
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
            )}

            {/* Hover Actions */}
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              {locationUrl && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(locationUrl, '_blank', 'noopener,noreferrer');
                  }}
                  title="Unirse a reunión"
                  className="p-0.5 rounded text-slate-400 hover:text-veyra-text transition-colors cursor-pointer"
                >
                  <ExternalLink className="w-3 h-3" />
                </button>
              )}

              {onSnooze && !isRecurring && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSnooze(event.id);
                  }}
                  title="Posponer 1 día (+24h)"
                  className="p-0.5 rounded text-slate-400 hover:text-veyra-text transition-colors cursor-pointer"
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
                    className="p-0.5 rounded text-slate-400 hover:text-red-400 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </ConfirmTooltip>
              )}
            </div>
          </div>
        </div>

        {/* Row 2: Single clean metadata line + discreet linked note icon */}
        <div className="flex items-center justify-between gap-2 min-w-0">
          <p className="text-[11px] text-slate-600 dark:text-zinc-300/80 truncate leading-tight">
            <span>{timeRangeStr}</span>
            {locationLabel && (
              <>
                <span> · </span>
                <span>{locationLabel}</span>
              </>
            )}
            {isRecurring && (
              <>
                <span> · </span>
                <span title="Evento recurrente">↻</span>
              </>
            )}
          </p>

          {hasLinkedNote && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (event.note_id && onSelectNote) {
                  onSelectNote(event.note_id);
                }
              }}
              title={linkedNoteTitle ? `Nota: ${linkedNoteTitle}` : 'Abrir nota vinculada'}
              className="p-0.5 rounded text-slate-400 dark:text-zinc-400 hover:text-accent transition-colors shrink-0 cursor-pointer"
            >
              <FileText className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
