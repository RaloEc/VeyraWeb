import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Subtask } from '../types/reminders';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(timestampMs: number): string {
  if (!timestampMs) return '';
  const date = new Date(timestampMs);
  const now = new Date();
  
  const isToday = 
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow = 
    date.getDate() === tomorrow.getDate() &&
    date.getMonth() === tomorrow.getMonth() &&
    date.getFullYear() === tomorrow.getFullYear();

  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (isToday) {
    return `Hoy a las ${timeStr}`;
  }
  if (isTomorrow) {
    return `Mañana a las ${timeStr}`;
  }

  const dateStr = date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  return `${dateStr}, ${timeStr}`;
}

export function isDateToday(timestampMs: number | string): boolean {
  const ts = Number(timestampMs);
  if (!ts || isNaN(ts)) return false;
  const date = new Date(ts);
  const now = new Date();
  return (
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear()
  );
}

export function isDateOverdue(timestampMs: number | string): boolean {
  const ts = Number(timestampMs);
  if (!ts || isNaN(ts)) return false;
  return ts < Date.now();
}

export function getControlLevelInfo(
  controlLevel?: string | null,
  priority?: number | null
): { label: string; bg: string; text: string; border: string } {
  const level = (controlLevel || '').toLowerCase();
  
  if (level === 'critical' || priority === 3 || (priority === 2 && level !== 'strict')) {
    return {
      label: 'Crítico',
      bg: 'bg-red-500/10',
      text: 'text-red-400',
      border: 'border-red-500/30',
    };
  }
  if (level === 'strict' || priority === 2 || (priority === 1 && level !== 'normal')) {
    return {
      label: 'Estricto',
      bg: 'bg-amber-500/10',
      text: 'text-amber-400',
      border: 'border-amber-500/30',
    };
  }

  // Default: Normal (gris/sutil)
  return {
    label: 'Normal',
    bg: 'bg-veyra-elevated/70',
    text: 'text-veyra-muted',
    border: 'border-veyra-border',
  };
}

export function parseSubtasks(rawSubtasks: string | null | undefined): Subtask[] {
  if (!rawSubtasks) return [];
  try {
    const parsed = JSON.parse(rawSubtasks);
    if (Array.isArray(parsed)) {
      return parsed.filter(item => item && typeof item.title === 'string');
    }
    return [];
  } catch {
    return [];
  }
}

export interface AttachmentItem {
  uri: string;
  name: string;
}

export function isImageAttachment(uriOrName?: string | null): boolean {
  if (!uriOrName) return false;
  const clean = uriOrName.split('?')[0].toLowerCase();
  return (
    clean.endsWith('.png') ||
    clean.endsWith('.jpg') ||
    clean.endsWith('.jpeg') ||
    clean.endsWith('.webp') ||
    clean.endsWith('.gif') ||
    clean.endsWith('.svg') ||
    clean.endsWith('.bmp') ||
    clean.startsWith('data:image/') ||
    clean.includes('/attachments/')
  );
}

export function parseAttachments(raw: string | null | undefined): AttachmentItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((item) => item && typeof item.uri === 'string');
    }
    return [];
  } catch {
    return [];
  }
}

