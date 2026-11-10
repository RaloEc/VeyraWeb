import React from 'react';
import {
  GraduationCap,
  Briefcase,
  BookOpen,
  FileText,
  CheckSquare,
  Layers,
  Hash,
  AlertCircle,
  Lightbulb,
} from 'lucide-react';

export const DEFAULT_TAG_SUGGESTIONS = [
  'clase',
  'apuntes',
  'deberes',
  'taller',
  'examen',
  'universidad',
  'trabajo',
  'proyecto',
  'reunion',
  'personal',
  'urgente',
  'ideas',
  'resumen',
];

export function extractHashtags(text: string): string[] {
  if (!text) return [];
  const hashtagRegex = /(?:^|\s)#([\p{L}0-9_-]+)/gu;
  const tags = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = hashtagRegex.exec(text)) !== null) {
    if (match[1]?.trim()) {
      tags.add(match[1].trim().toLowerCase());
    }
  }
  return Array.from(tags);
}

export function getTagIcon(tag: string): React.ComponentType<{ className?: string }> {
  const lower = tag.toLowerCase().replace(/^#/, '');
  if (lower === 'universidad' || lower.includes('facultad') || lower === 'uni' || lower.includes('campus')) {
    return GraduationCap;
  }
  if (lower === 'clase' || lower === 'clases' || lower.includes('materia') || lower.includes('curso') || lower.includes('catedra')) {
    return BookOpen;
  }
  if (lower === 'trabajo' || lower === 'travajo' || lower.includes('work') || lower.includes('laboral') || lower.includes('oficina') || lower.includes('empleo') || lower.includes('reunion') || lower.includes('meeting')) {
    return Briefcase;
  }
  if (lower.includes('deber') || lower.includes('tarea') || lower.includes('ejercicio')) {
    return CheckSquare;
  }
  if (lower.includes('apunte') || lower.includes('resumen') || lower.includes('taller')) {
    return FileText;
  }
  if (lower.includes('proyecto')) {
    return Layers;
  }
  if (lower.includes('urgente') || lower.includes('examen')) {
    return AlertCircle;
  }
  if (lower.includes('idea')) {
    return Lightbulb;
  }
  return Hash;
}
