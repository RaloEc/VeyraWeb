import React from 'react';
import { Clock, Plus, Calendar, MapPin, Sparkles, ChevronRight } from 'lucide-react';
import { cn } from '../../../../lib/utils';
import type { CalendarEvent } from '../../../../hooks/useEvents';

interface TodayTimelineWidgetProps {
  todayEvents: CalendarEvent[];
  onSelectEvent: (eventId: string) => void;
  onOpenNewEvent: () => void;
  onViewCalendar?: () => void;
}

function formatEventTime(ms: number): string {
  const d = new Date(ms);
  const hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'p.m.' : 'a.m.';
  const h12 = hours % 12 || 12;
  return `${h12}:${minutes} ${ampm}`;
}

export const TodayTimelineWidget: React.FC<TodayTimelineWidgetProps> = ({
  todayEvents,
  onSelectEvent,
  onOpenNewEvent,
  onViewCalendar,
}) => {
  const now = Date.now();

  const sortedEvents = [...todayEvents].sort((a, b) => {
    return a.start_time_ms - b.start_time_ms;
  });

  return (
    <div className="flex flex-col h-full rounded-xl bg-veyra-card border border-veyra-border p-3.5 sm:p-4 shadow-xs min-h-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between pb-2.5 border-b border-veyra-border/60 mb-2.5 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
            <Clock className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs sm:text-sm font-semibold text-veyra-text tracking-tight truncate">
              Timeline de Hoy
            </h3>
            <p className="text-[10px] sm:text-[11px] text-veyra-muted truncate">
              {todayEvents.length} {todayEvents.length === 1 ? 'compromiso' : 'compromisos'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0 ml-2">
          {onViewCalendar && (
            <button
              type="button"
              onClick={onViewCalendar}
              title="Abrir en calendario completo"
              className="text-[11px] text-accent hover:underline flex items-center gap-0.5 px-1.5 py-0.5 rounded hover:bg-accent/10 transition-colors cursor-pointer"
            >
              <span className="hidden sm:inline">Ver calendario</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          )}
          <button
            type="button"
            onClick={onOpenNewEvent}
            title="Nuevo evento"
            className="p-1 rounded-md text-veyra-muted hover:text-veyra-text hover:bg-veyra-elevated transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pr-1 space-y-2 min-h-0 custom-scrollbar">
        {sortedEvents.length === 0 ? (
          <div className="h-full min-h-[100px] flex flex-col items-center justify-center text-center p-3">
            <div className="w-8 h-8 rounded-full bg-veyra-elevated text-veyra-muted flex items-center justify-center mb-1.5 shrink-0">
              <Calendar className="w-4 h-4 opacity-70" />
            </div>
            <p className="text-xs font-medium text-veyra-text">No tienes eventos hoy</p>
            <p className="text-[10px] text-veyra-muted mt-0.5 max-w-[200px] line-clamp-2">
              Aprovecha el día o añade un nuevo evento.
            </p>
            <button
              type="button"
              onClick={onOpenNewEvent}
              className="mt-2 text-[11px] font-medium text-accent hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>Programar evento</span>
            </button>
          </div>
        ) : (
          sortedEvents.map((event) => {
            const isHappeningNow = now >= event.start_time_ms && now <= event.end_time_ms;
            const isPast = now > event.end_time_ms;
            const accentColor = event.color || '#3B82F6';

            return (
              <div
                key={event.id}
                onClick={() => onSelectEvent(event.id)}
                className={cn(
                  'group relative p-2.5 rounded-lg border transition-all cursor-pointer flex items-start gap-2.5 min-w-0',
                  isHappeningNow
                    ? 'bg-accent/10 border-accent/40 shadow-xs'
                    : isPast
                    ? 'bg-veyra-elevated/40 border-veyra-border/60 opacity-60 hover:opacity-100'
                    : 'bg-veyra-elevated/80 border-veyra-border hover:border-accent/40'
                )}
              >
                {/* Event color accent stripe */}
                <div
                  className="w-1 self-stretch rounded-full shrink-0"
                  style={{ backgroundColor: accentColor }}
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1.5">
                    <h4 className="text-xs font-semibold text-veyra-text truncate group-hover:text-accent transition-colors">
                      {event.title}
                    </h4>
                    {isHappeningNow && (
                      <span className="shrink-0 text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-accent text-white flex items-center gap-1 animate-pulse">
                        <Sparkles className="w-2.5 h-2.5" />
                        <span className="hidden sm:inline">Ahora</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mt-1 text-[10px] sm:text-[11px] text-veyra-muted flex-wrap">
                    <span className="font-mono shrink-0">
                      {formatEventTime(event.start_time_ms)} - {formatEventTime(event.end_time_ms)}
                    </span>
                    {event.location && (
                      <span className="flex items-center gap-1 truncate max-w-[120px]">
                        <MapPin className="w-3 h-3 text-veyra-subtle shrink-0" />
                        <span className="truncate">{event.location}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
