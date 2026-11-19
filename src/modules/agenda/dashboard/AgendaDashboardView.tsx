import React, { useState, useRef } from 'react';
import {
  PanelLeft,
  Calendar as CalendarIcon,
  LayoutDashboard,
  SlidersHorizontal,
  X,
  Check,
  Plus,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { useEvents } from '../../../hooks/useEvents';
import type { useReminders } from '../../../hooks/useReminders';
import type { Note, Folder } from '../../../types/notes';
import type { ReminderPriority, ReminderControlLevel } from '../../../types/reminders';
import { GreetingWidget } from './widgets/GreetingWidget';
import { TodayTimelineWidget } from './widgets/TodayTimelineWidget';
import { PriorityRemindersWidget } from './widgets/PriorityRemindersWidget';
import { MiniCalendarWidget } from './widgets/MiniCalendarWidget';
import { QuickScratchpadWidget } from './widgets/QuickScratchpadWidget';
import { PinnedNotesWidget } from './widgets/PinnedNotesWidget';
import { FocusTimerWidget } from './widgets/FocusTimerWidget';
import { DashboardWidgetWrapper } from './DashboardWidgetWrapper';
import { EventModal } from '../EventModal';
import { ReminderModal } from '../../reminders/ReminderModal';
import {
  AVAILABLE_WIDGETS,
  DEFAULT_DASHBOARD_CONFIG,
  type DashboardConfig,
  type WidgetId,
  type WidgetSize,
} from './types';

export interface AgendaDashboardViewProps {
  eventsHook?: ReturnType<typeof useEvents>;
  remindersHook?: ReturnType<typeof useReminders>;
  allNotes: Note[];
  folders: Folder[];
  userName?: string;
  userEmail?: string;
  onSelectEvent: (eventId: string) => void;
  onSelectReminder: (reminderId: string) => void;
  onSelectNote: (noteId: string) => void;
  onCreateNote: (folderId?: string | null, eventId?: string | null, title?: string, contentJson?: string) => Promise<{ id: string } | null | void>;
  onOpenFullCalendar: () => void;
  onClose?: () => void;
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

const CONFIG_STORAGE_KEY = 'veyra_dashboard_layout_v3';

export const AgendaDashboardView: React.FC<AgendaDashboardViewProps> = ({
  eventsHook,
  remindersHook,
  allNotes,
  folders,
  userName,
  userEmail,
  onSelectEvent,
  onSelectReminder,
  onSelectNote,
  onCreateNote,
  onOpenFullCalendar,
  onClose,
  isSidebarOpen,
  onToggleSidebar,
}) => {
  const gridContainerRef = useRef<HTMLDivElement>(null);

  // Load persistent dashboard layout configuration
  const [config, setConfig] = useState<DashboardConfig>(() => {
    if (typeof window === 'undefined') return DEFAULT_DASHBOARD_CONFIG;
    try {
      const stored = localStorage.getItem(CONFIG_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.enabledWidgets && parsed.widgetOrder) {
          return {
            ...DEFAULT_DASHBOARD_CONFIG,
            ...parsed,
            widgetSizes: {
              ...DEFAULT_DASHBOARD_CONFIG.widgetSizes,
              ...(parsed.widgetSizes || {}),
            },
          };
        }
      }
    } catch {
      // ignore
    }
    return DEFAULT_DASHBOARD_CONFIG;
  });

  // State for in-place customization mode
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);

  // Drag and drop state
  const [draggedWidgetId, setDraggedWidgetId] = useState<WidgetId | null>(null);
  const [dragOverWidgetId, setDragOverWidgetId] = useState<WidgetId | null>(null);

  // Creation modals
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [isReminderModalOpen, setIsReminderModalOpen] = useState(false);

  // Save config changes to state and localStorage
  const handleConfigChange = (newConfig: DashboardConfig) => {
    setConfig(newConfig);
    if (typeof window !== 'undefined') {
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(newConfig));
    }
  };

  const handleResetDefault = () => {
    handleConfigChange(DEFAULT_DASHBOARD_CONFIG);
  };

  // Drag & Drop handlers (reordering widgets)
  const handleDragStart = (e: React.DragEvent, id: WidgetId) => {
    if (!isCustomizing) return;
    setDraggedWidgetId(id);
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, _id: WidgetId) => {
    if (!isCustomizing) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnter = (e: React.DragEvent, id: WidgetId) => {
    if (!isCustomizing) return;
    e.preventDefault();
    if (draggedWidgetId && draggedWidgetId !== id) {
      setDragOverWidgetId(id);
    }
  };

  const handleDragLeave = (_e: React.DragEvent, id: WidgetId) => {
    if (dragOverWidgetId === id) {
      setDragOverWidgetId(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetId: WidgetId) => {
    e.preventDefault();
    if (!isCustomizing || !draggedWidgetId || draggedWidgetId === targetId) {
      setDraggedWidgetId(null);
      setDragOverWidgetId(null);
      return;
    }

    const oldIndex = config.widgetOrder.indexOf(draggedWidgetId);
    const newIndex = config.widgetOrder.indexOf(targetId);

    if (oldIndex >= 0 && newIndex >= 0) {
      const nextOrder = [...config.widgetOrder];
      nextOrder.splice(oldIndex, 1);
      nextOrder.splice(newIndex, 0, draggedWidgetId);

      handleConfigChange({
        ...config,
        widgetOrder: nextOrder,
      });
    }

    setDraggedWidgetId(null);
    setDragOverWidgetId(null);
  };

  const handleDragEnd = () => {
    setDraggedWidgetId(null);
    setDragOverWidgetId(null);
  };

  // Handle free corner-drag resizing (width & height in 10-node grid)
  const handleResizeEnd = (id: WidgetId, newSize: WidgetSize) => {
    handleConfigChange({
      ...config,
      widgetSizes: {
        ...config.widgetSizes,
        [id]: newSize,
      },
    });
  };

  // Hide widget from dashboard
  const handleHideWidget = (id: WidgetId) => {
    handleConfigChange({
      ...config,
      enabledWidgets: config.enabledWidgets.filter((w) => w !== id),
    });
  };

  // Re-add widget to dashboard
  const handleEnableWidget = (id: WidgetId) => {
    if (config.enabledWidgets.includes(id)) return;
    handleConfigChange({
      ...config,
      enabledWidgets: [...config.enabledWidgets, id],
    });
  };

  const hiddenWidgets = (Object.keys(AVAILABLE_WIDGETS) as WidgetId[]).filter(
    (id) => !config.enabledWidgets.includes(id)
  );

  const events = eventsHook?.events || [];
  const todayEvents = eventsHook?.todayEvents || [];
  const todayReminders = remindersHook?.todayReminders || [];
  const allReminders = remindersHook?.reminders || [];

  // Handlers for modal creation
  const handleSaveEvent = async (payload: {
    id?: string;
    title: string;
    description?: string;
    start_time_ms: number;
    end_time_ms: number;
    location?: string;
    color?: string;
    is_all_day?: boolean;
    all_day_date?: string | null;
  }) => {
    await eventsHook?.createEvent({
      title: payload.title,
      description: payload.description,
      start_time_ms: payload.start_time_ms,
      end_time_ms: payload.end_time_ms,
      location: payload.location,
      color: payload.color,
      is_all_day: payload.is_all_day,
      all_day_date: payload.all_day_date,
    });
  };

  const handleSaveReminder = async (payload: {
    title: string;
    description?: string;
    due_date_ms: number;
    priority?: ReminderPriority;
    control_level?: ReminderControlLevel;
    subtasks?: any[];
    repeat_rule?: string | null;
    attachments?: string | null;
    links?: string | null;
    event_id?: string | null;
    offset_minutes?: number | null;
  }) => {
    await remindersHook?.createReminder({
      title: payload.title,
      description: payload.description,
      due_date_ms: payload.due_date_ms,
      priority: payload.priority,
      control_level: payload.control_level,
      subtasks: payload.subtasks,
      repeat_rule: payload.repeat_rule,
      attachments: payload.attachments,
      links: payload.links,
      event_id: payload.event_id,
      offset_minutes: payload.offset_minutes,
    });
  };

  // Render widget content
  const renderWidgetContent = (widgetId: WidgetId) => {
    switch (widgetId) {
      case 'greeting':
        return (
          <GreetingWidget
            userName={userName}
            userEmail={userEmail}
            todayEvents={todayEvents}
            todayReminders={todayReminders}
            onOpenNewEvent={() => setIsEventModalOpen(true)}
            onOpenNewReminder={() => setIsReminderModalOpen(true)}
            onOpenNewNote={() => onCreateNote(null, null, 'Nota rápida')}
          />
        );

      case 'today_timeline':
        return (
          <TodayTimelineWidget
            todayEvents={todayEvents}
            onSelectEvent={onSelectEvent}
            onOpenNewEvent={() => setIsEventModalOpen(true)}
            onViewCalendar={onOpenFullCalendar}
          />
        );

      case 'priority_reminders':
        return (
          <PriorityRemindersWidget
            todayReminders={todayReminders}
            allReminders={allReminders}
            onToggleReminder={(id, st) => remindersHook?.toggleReminder(id, st)}
            onSelectReminder={onSelectReminder}
            onOpenNewReminder={() => setIsReminderModalOpen(true)}
          />
        );

      case 'mini_calendar':
        return (
          <MiniCalendarWidget
            events={events}
            reminders={allReminders}
            onOpenFullCalendar={onOpenFullCalendar}
            onSelectEvent={onSelectEvent}
            onSelectReminder={onSelectReminder}
          />
        );

      case 'quick_scratchpad':
        return (
          <QuickScratchpadWidget
            onCreateNote={async (title, contentJson) => {
              const res = await onCreateNote(null, null, title, contentJson);
              return res;
            }}
            onSelectNote={onSelectNote}
          />
        );

      case 'pinned_notes':
        return (
          <PinnedNotesWidget
            notes={allNotes}
            folders={folders}
            onSelectNote={onSelectNote}
            onCreateNote={() => onCreateNote(null, null, 'Nueva nota')}
          />
        );

      case 'focus_timer':
        return <FocusTimerWidget />;

      default:
        return null;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-veyra-canvas overflow-hidden text-xs">
      {/* Top Header Bar */}
      <header className="h-12 border-b border-veyra-border px-4 flex items-center justify-between shrink-0 bg-veyra-card/70 backdrop-blur-md z-20">
        <div className="flex items-center gap-3">
          {onToggleSidebar && !isSidebarOpen && (
            <button
              type="button"
              onClick={onToggleSidebar}
              title="Mostrar barra lateral"
              className="p-1.5 rounded-lg text-veyra-muted hover:text-veyra-text hover:bg-veyra-elevated transition-colors cursor-pointer"
            >
              <PanelLeft className="w-4 h-4" />
            </button>
          )}

          {/* View switcher: Dashboard vs Full Calendar */}
          <div className="flex items-center p-0.5 rounded-lg bg-veyra-elevated border border-veyra-border text-xs">
            <button
              type="button"
              className="flex items-center gap-1.5 px-3 py-1 rounded-md font-semibold bg-accent/15 text-accent shadow-xs cursor-default"
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Dashboard</span>
            </button>

            <button
              type="button"
              onClick={onOpenFullCalendar}
              className="flex items-center gap-1.5 px-3 py-1 rounded-md font-medium text-veyra-muted hover:text-veyra-text transition-colors cursor-pointer"
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              <span>Calendario Completo</span>
            </button>
          </div>
        </div>

        {/* Right header actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Botón para alternar el Modo Personalización */}
          <button
            type="button"
            onClick={() => {
              setIsCustomizing((prev) => !prev);
              setIsAddMenuOpen(false);
            }}
            title={isCustomizing ? 'Guardar y salir de personalización' : 'Personalizar cuadrícula de widgets'}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-medium text-xs transition-all cursor-pointer shadow-xs',
              isCustomizing
                ? 'bg-accent text-white border-accent shadow-accent/20'
                : 'bg-veyra-elevated border-veyra-border text-veyra-text hover:border-accent/40 hover:bg-white/5'
            )}
          >
            {isCustomizing ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Listo</span>
              </>
            ) : (
              <>
                <SlidersHorizontal className="w-3.5 h-3.5 text-accent" />
                <span>Personalizar</span>
              </>
            )}
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Cerrar"
              className="p-1.5 rounded-lg text-veyra-muted hover:text-veyra-text hover:bg-white/5 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* Sticky Banner del Modo Personalización */}
      {isCustomizing && (
        <div className="bg-accent/10 border-b border-accent/20 px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs animate-in fade-in slide-in-from-top-1 z-10 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-accent/20 text-accent flex items-center justify-center shrink-0">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="font-semibold text-veyra-text">Cuadrícula de 10 Nodos</span>
              <span className="text-veyra-muted ml-2 hidden md:inline">
                Arrastra la esquina inferior de cada tarjeta para ajustar ancho y alto libremente. Arrastra desde arriba para reordenar.
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {/* Menú para añadir widgets que estén actualmente ocultos */}
            {hiddenWidgets.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsAddMenuOpen((prev) => !prev)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-accent text-white font-medium hover:bg-accent/90 transition-colors shadow-xs cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Añadir widget ({hiddenWidgets.length})</span>
                </button>

                {isAddMenuOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-64 bg-veyra-card border border-veyra-border rounded-xl shadow-xl p-2 z-50 animate-in fade-in zoom-in-95">
                    <div className="text-[10px] font-semibold text-veyra-muted px-2 py-1 uppercase tracking-wider">
                      Widgets Ocultos
                    </div>
                    <div className="mt-1 space-y-1 max-h-56 overflow-y-auto custom-scrollbar">
                      {hiddenWidgets.map((hid) => {
                        const meta = AVAILABLE_WIDGETS[hid];
                        return (
                          <button
                            key={hid}
                            type="button"
                            onClick={() => {
                              handleEnableWidget(hid);
                              if (hiddenWidgets.length <= 1) {
                                setIsAddMenuOpen(false);
                              }
                            }}
                            className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-veyra-elevated text-left text-veyra-text transition-colors group cursor-pointer"
                          >
                            <div className="flex flex-col pr-2">
                              <span className="font-medium text-xs group-hover:text-accent transition-colors">
                                {meta.title}
                              </span>
                              <span className="text-[10px] text-veyra-muted line-clamp-1">
                                {meta.description}
                              </span>
                            </div>
                            <Plus className="w-3.5 h-3.5 text-accent shrink-0" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Restablecer diseño predeterminado */}
            <button
              type="button"
              onClick={handleResetDefault}
              title="Restablecer cuadrícula por defecto"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-veyra-muted hover:text-veyra-text hover:bg-white/5 border border-veyra-border transition-colors cursor-pointer text-xs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restablecer</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Scrollable Widgets Grid */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
        <div className="max-w-7xl mx-auto">
          {config.enabledWidgets.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center rounded-2xl border border-dashed border-veyra-border bg-veyra-card/30">
              <SlidersHorizontal className="w-10 h-10 text-veyra-muted mb-3 opacity-60" />
              <h3 className="text-sm font-semibold text-veyra-text">No hay widgets visibles</h3>
              <p className="text-xs text-veyra-muted mt-1 max-w-sm">
                Has ocultado todos los widgets del dashboard. Puedes reactivarlos o restablecer la vista predeterminada.
              </p>
              <button
                type="button"
                onClick={handleResetDefault}
                className="mt-4 px-3.5 py-1.5 rounded-lg bg-accent text-white font-medium text-xs hover:bg-accent/90 transition-colors shadow-xs cursor-pointer"
              >
                Restablecer widgets
              </button>
            </div>
          ) : (
            <div
              ref={gridContainerRef}
              style={{
                backgroundImage: isCustomizing
                  ? 'radial-gradient(circle, rgba(99, 102, 241, 0.22) 1.5px, transparent 1.5px)'
                  : undefined,
                backgroundSize: '24px 24px',
              }}
              className={cn(
                'grid grid-cols-1 md:grid-cols-10 auto-rows-[60px] gap-4 items-stretch p-2 transition-all',
                isCustomizing && 'rounded-2xl border border-dashed border-accent/30'
              )}
            >
              {config.widgetOrder
                .filter((wId) => config.enabledWidgets.includes(wId))
                .map((widgetId) => {
                  const savedSize = config.widgetSizes?.[widgetId];
                  const size = savedSize || AVAILABLE_WIDGETS[widgetId]?.defaultSize || { colSpan: 5, rowSpan: 5 };

                  return (
                    <DashboardWidgetWrapper
                      key={widgetId}
                      widgetId={widgetId}
                      size={size}
                      gridContainerRef={gridContainerRef}
                      isCustomizing={isCustomizing}
                      isDragging={draggedWidgetId === widgetId}
                      isDragOver={dragOverWidgetId === widgetId}
                      onDragStart={handleDragStart}
                      onDragOver={handleDragOver}
                      onDragEnter={handleDragEnter}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onDragEnd={handleDragEnd}
                      onResizeEnd={handleResizeEnd}
                      onHideWidget={handleHideWidget}
                    >
                      {renderWidgetContent(widgetId)}
                    </DashboardWidgetWrapper>
                  );
                })}
            </div>
          )}
        </div>
      </main>

      {/* Modals for new event & reminder */}
      <EventModal
        isOpen={isEventModalOpen}
        onClose={() => setIsEventModalOpen(false)}
        allNotes={allNotes}
        onSave={handleSaveEvent}
      />

      <ReminderModal
        isOpen={isReminderModalOpen}
        onClose={() => setIsReminderModalOpen(false)}
        events={events}
        onSave={handleSaveReminder}
      />
    </div>
  );
};
