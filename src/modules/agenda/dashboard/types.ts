export type WidgetId =
  | 'greeting'
  | 'mini_calendar'
  | 'today_timeline'
  | 'priority_reminders'
  | 'quick_scratchpad'
  | 'pinned_notes'
  | 'focus_timer';

export interface WidgetSize {
  colSpan: number; // 2 a 10 nodos de ancho
  rowSpan: number; // 2 a 12 nodos de alto
}

export interface WidgetMeta {
  id: WidgetId;
  title: string;
  description: string;
  iconName: string;
  defaultSize: WidgetSize;
}

export interface DashboardConfig {
  version: number;
  columns: number; // Por defecto 10 nodos de ancho
  enabledWidgets: WidgetId[];
  widgetOrder: WidgetId[];
  widgetSizes: Record<WidgetId, WidgetSize>;
}

export const AVAILABLE_WIDGETS: Record<WidgetId, WidgetMeta> = {
  greeting: {
    id: 'greeting',
    title: 'Resumen & Saludo',
    description: 'Saludo diario, fecha y métricas de tus compromisos de hoy',
    iconName: 'Sun',
    defaultSize: { colSpan: 10, rowSpan: 3 },
  },
  today_timeline: {
    id: 'today_timeline',
    title: 'Agenda de Hoy',
    description: 'Línea de tiempo con eventos y clases de hoy en vivo',
    iconName: 'Clock',
    defaultSize: { colSpan: 6, rowSpan: 7 },
  },
  priority_reminders: {
    id: 'priority_reminders',
    title: 'Recordatorios',
    description: 'Tareas clave y urgentes con check rápido',
    iconName: 'CheckCircle2',
    defaultSize: { colSpan: 4, rowSpan: 7 },
  },
  mini_calendar: {
    id: 'mini_calendar',
    title: 'Mini Calendario',
    description: 'Mes interactivo con puntos de actividad y selector de fechas',
    iconName: 'Calendar',
    defaultSize: { colSpan: 4, rowSpan: 6 },
  },
  quick_scratchpad: {
    id: 'quick_scratchpad',
    title: 'Bloc Rápido',
    description: 'Scratchpad persistente para apuntes con conversión a nota',
    iconName: 'PenTool',
    defaultSize: { colSpan: 3, rowSpan: 6 },
  },
  pinned_notes: {
    id: 'pinned_notes',
    title: 'Notas Clave',
    description: 'Acceso directo con un clic a tus notas principales',
    iconName: 'Pin',
    defaultSize: { colSpan: 3, rowSpan: 6 },
  },
  focus_timer: {
    id: 'focus_timer',
    title: 'Temporizador',
    description: 'Temporizador de concentración para bloques de estudio o trabajo',
    iconName: 'Timer',
    defaultSize: { colSpan: 4, rowSpan: 5 },
  },
};

export const DEFAULT_DASHBOARD_CONFIG: DashboardConfig = {
  version: 3,
  columns: 10,
  enabledWidgets: [
    'greeting',
    'today_timeline',
    'priority_reminders',
    'mini_calendar',
    'quick_scratchpad',
    'pinned_notes',
    'focus_timer',
  ],
  widgetOrder: [
    'greeting',
    'today_timeline',
    'priority_reminders',
    'mini_calendar',
    'quick_scratchpad',
    'pinned_notes',
    'focus_timer',
  ],
  widgetSizes: {
    greeting: { colSpan: 10, rowSpan: 3 },
    today_timeline: { colSpan: 6, rowSpan: 7 },
    priority_reminders: { colSpan: 4, rowSpan: 7 },
    mini_calendar: { colSpan: 4, rowSpan: 6 },
    quick_scratchpad: { colSpan: 3, rowSpan: 6 },
    pinned_notes: { colSpan: 3, rowSpan: 6 },
    focus_timer: { colSpan: 4, rowSpan: 5 },
  },
};
