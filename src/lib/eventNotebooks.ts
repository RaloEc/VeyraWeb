import type { CalendarEvent } from '../hooks/useEvents';
import { extractHashtags } from './tagUtils';

export function parseEventTagList(event: CalendarEvent): string[] {
  const rawTags = event.tags;
  let tags: string[] = [];

  if (Array.isArray(rawTags)) {
    tags = rawTags.map(String).map((t) => t.replace(/^#/, '').trim().toLowerCase()).filter(Boolean);
  } else if (typeof rawTags === 'string') {
    try {
      const parsed = JSON.parse(rawTags);
      if (Array.isArray(parsed)) {
        tags = parsed.map(String).map((t) => t.replace(/^#/, '').trim().toLowerCase()).filter(Boolean);
      }
    } catch {
      tags = rawTags
        .split(/[,;\s]+/)
        .map((t) => t.replace(/^#/, '').trim().toLowerCase())
        .filter(Boolean);
    }
  }

  if (tags.length === 0 && event.title) {
    const fromTitle = extractHashtags(event.title);
    tags = fromTitle.map((t) => t.replace(/^#/, '').trim().toLowerCase()).filter(Boolean);
  }

  return tags;
}

export function getEventCategoryTag(event: CalendarEvent): string {
  const tags = parseEventTagList(event);

  if (
    tags.some(
      (t) =>
        t === 'universidad' ||
        t === 'universidades' ||
        t === 'uni' ||
        t === 'facultad' ||
        t === 'campus' ||
        t === 'carrera' ||
        t === 'semestre'
    )
  ) {
    return 'Universidad';
  }
  if (
    tags.some(
      (t) =>
        t === 'clase' ||
        t === 'clases' ||
        t === 'materia' ||
        t === 'materias' ||
        t === 'asignatura' ||
        t === 'asignaturas' ||
        t === 'curso' ||
        t === 'cursos' ||
        t === 'aula' ||
        t === 'catedra' ||
        t === 'estudio'
    )
  ) {
    return 'Clases';
  }
  if (
    tags.some(
      (t) =>
        t === 'trabajo' ||
        t === 'travajo' ||
        t === 'work' ||
        t === 'laboral' ||
        t === 'laborales' ||
        t === 'oficina' ||
        t === 'empleo' ||
        t === 'job' ||
        t === 'reunion' ||
        t === 'meeting'
    )
  ) {
    return 'Trabajo';
  }
  if (tags.length > 0) {
    return tags[0].charAt(0).toUpperCase() + tags[0].slice(1);
  }
  return 'Eventos';
}

export function isEventNotebook(event: CalendarEvent, linkedNotesCount: number): boolean {
  if (event.deleted === 1) return false;
  if (linkedNotesCount > 0) return true;
  return parseEventTagList(event).length > 0;
}
