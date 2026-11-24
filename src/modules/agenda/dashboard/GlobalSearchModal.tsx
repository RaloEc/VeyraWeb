import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  X,
  FileText,
  Folder as FolderIcon,
  Calendar,
  CheckCircle2,
  Sparkles,
  Plus,
  CornerDownLeft,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { cn, parseSubtasks } from '../../../lib/utils';
import { useUserSettings } from '../../../context/UserSettingsContext';
import type { Note, Folder } from '../../../types/notes';
import type { CalendarEvent } from '../../../hooks/useEvents';
import type { Reminder } from '../../../types/reminders';
import type { NoteTemplate } from '../../notes/templates/templatesData';

export type SearchCategory = 'all' | 'notes' | 'folders' | 'events' | 'reminders' | 'templates';

export interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  notes: Note[];
  folders: Folder[];
  events: CalendarEvent[];
  reminders: Reminder[];
  templates: NoteTemplate[];
  onSelectNote: (noteId: string) => void;
  onSelectFolder: (folderId: string) => void;
  onSelectEvent: (eventId: string) => void;
  onSelectReminder: (reminderId: string) => void;
  onCreateFromTemplate: (template: NoteTemplate) => Promise<void> | void;
  onCreateBlankNote: () => void;
  onOpenCalendar: () => void;
}

interface SearchEntry {
  key: string;
  category: Exclude<SearchCategory, 'all'>;
  title: string;
  subtitle: string;
  meta?: string;
  color?: string | null;
  recencyMs: number;
  searchNorm: string;
  titleNorm: string;
  tagsNorm: string;
  onExecute: () => void;
}

function normalizeText(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function highlightMatch(text: string, tokens: string[]): React.ReactNode {
  if (!text || tokens.length === 0) return text;
  const cleanTokens = tokens
    .map((t) => (t.startsWith('#') ? t.slice(1) : t))
    .filter((t) => t.length >= 2);
  if (cleanTokens.length === 0) return text;

  const normText = normalizeText(text);
  const ranges: Array<[number, number]> = [];

  for (const tok of cleanTokens) {
    let idx = normText.indexOf(tok);
    while (idx !== -1) {
      ranges.push([idx, idx + tok.length]);
      idx = normText.indexOf(tok, idx + tok.length);
    }
  }

  if (ranges.length === 0) return text;
  ranges.sort((a, b) => a[0] - b[0]);

  const merged: Array<[number, number]> = [];
  for (const r of ranges) {
    if (merged.length === 0 || r[0] > merged[merged.length - 1][1]) {
      merged.push(r);
    } else {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], r[1]);
    }
  }

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  merged.forEach(([start, end], i) => {
    if (start > cursor) {
      parts.push(text.slice(cursor, start));
    }
    parts.push(
      <mark key={i} className="bg-accent/20 text-accent rounded px-0.5 font-semibold">
        {text.slice(start, end)}
      </mark>
    );
    cursor = end;
  });
  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }
  return parts;
}

const CATEGORY_TABS: Array<{ id: SearchCategory; label: string }> = [
  { id: 'all', label: 'Todo' },
  { id: 'notes', label: 'Notas' },
  { id: 'folders', label: 'Carpetas' },
  { id: 'events', label: 'Eventos' },
  { id: 'reminders', label: 'Recordatorios' },
  { id: 'templates', label: 'Plantillas' },
];

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  isOpen,
  onClose,
  notes,
  folders,
  events,
  reminders,
  templates,
  onSelectNote,
  onSelectFolder,
  onSelectEvent,
  onSelectReminder,
  onCreateFromTemplate,
  onCreateBlankNote,
  onOpenCalendar,
}) => {
  const { settings } = useUserSettings();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<SearchCategory>('all');
  const [activeIndex, setActiveIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setCategory('all');
    setActiveIndex(0);
    const id = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [isOpen]);

  const folderMap = useMemo(() => {
    const map = new Map<string, Folder>();
    folders.forEach((f) => {
      if (f.deleted !== 1) map.set(f.id, f);
    });
    return map;
  }, [folders]);

  const allEntries = useMemo<SearchEntry[]>(() => {
    const entries: SearchEntry[] = [];

    // 1. Notes
    for (const note of notes) {
      if (note.deleted === 1) continue;
      const title = note.title?.trim() || 'Nota sin título';
      const folderName = note.folder_id ? folderMap.get(note.folder_id)?.name || '' : '';
      const preview = note.preview_text?.trim() || '';
      const subtitle = [folderName, preview].filter(Boolean).join(' · ') || 'Nota';

      entries.push({
        key: `note-${note.id}`,
        category: 'notes',
        title,
        subtitle,
        meta: 'Nota',
        recencyMs: note.updated_at_ms || note.created_at_ms || 0,
        titleNorm: normalizeText(title),
        tagsNorm: normalizeText(`${title} ${preview}`),
        searchNorm: normalizeText(`${title} ${folderName} ${preview}`),
        onExecute: () => {
          onSelectNote(note.id);
          onClose();
        },
      });
    }

    // 2. Folders
    for (const folder of folders) {
      if (folder.deleted === 1) continue;
      const count = notes.filter((n) => n.deleted !== 1 && n.folder_id === folder.id).length;
      entries.push({
        key: `folder-${folder.id}`,
        category: 'folders',
        title: folder.name,
        subtitle: `${count} ${count === 1 ? 'nota' : 'notas'}`,
        meta: 'Carpeta',
        color: folder.color,
        recencyMs: folder.updated_at_ms || folder.created_at_ms || 0,
        titleNorm: normalizeText(folder.name),
        tagsNorm: normalizeText(folder.name),
        searchNorm: normalizeText(folder.name),
        onExecute: () => {
          onSelectFolder(folder.id);
          onClose();
        },
      });
    }

    // 3. Events
    for (const ev of events) {
      if (ev.deleted === 1) continue;
      const d = new Date(ev.start_time_ms);
      const dateStr = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
      const timeStr = ev.is_all_day
        ? 'Todo el día'
        : d.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            hour12: !settings.timeFormat24h,
          });
      const tagsText = Array.isArray(ev.tags) ? ev.tags.join(' ') : '';
      const subtitle = [
        `${dateStr} · ${timeStr}`,
        ev.location,
        ev.description?.slice(0, 60),
      ]
        .filter(Boolean)
        .join(' · ');

      entries.push({
        key: `event-${ev.id}`,
        category: 'events',
        title: ev.title,
        subtitle,
        meta: 'Evento',
        color: ev.color || '#3B82F6',
        recencyMs: ev.start_time_ms || 0,
        titleNorm: normalizeText(ev.title),
        tagsNorm: normalizeText(`${tagsText} ${ev.title}`),
        searchNorm: normalizeText(`${ev.title} ${ev.description || ''} ${ev.location || ''} ${tagsText}`),
        onExecute: () => {
          onSelectEvent(ev.id);
          onClose();
        },
      });
    }

    // 4. Reminders
    for (const rem of reminders) {
      if (rem.deleted === 1) continue;
      const d = new Date(rem.due_date_ms);
      const dateStr = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
      const timeStr = d.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        hour12: !settings.timeFormat24h,
      });
      const subtasks = parseSubtasks(rem.subtasks)
        .map((s: any) => s.title || '')
        .join(' ');
      const statusLabel = rem.status === 'completed' ? 'Completado' : 'Pendiente';

      entries.push({
        key: `reminder-${rem.id}`,
        category: 'reminders',
        title: rem.title,
        subtitle: `${dateStr}, ${timeStr} · ${statusLabel}${rem.description ? ` · ${rem.description.slice(0, 50)}` : ''}`,
        meta: 'Recordatorio',
        recencyMs: rem.due_date_ms || 0,
        titleNorm: normalizeText(rem.title),
        tagsNorm: normalizeText(`${rem.title} ${rem.description || ''}`),
        searchNorm: normalizeText(`${rem.title} ${rem.description || ''} ${subtasks}`),
        onExecute: () => {
          onSelectReminder(rem.id);
          onClose();
        },
      });
    }

    // 5. Templates
    for (const tpl of templates) {
      entries.push({
        key: `template-${tpl.id}`,
        category: 'templates',
        title: tpl.title,
        subtitle: `${tpl.isCustom ? 'Propia' : tpl.categoryLabel} · ${tpl.description}`,
        meta: 'Plantilla',
        recencyMs: tpl.isCustom ? 2 : 1,
        titleNorm: normalizeText(tpl.title),
        tagsNorm: normalizeText(`${tpl.title} ${tpl.categoryLabel}`),
        searchNorm: normalizeText(`${tpl.title} ${tpl.categoryLabel} ${tpl.description}`),
        onExecute: () => {
          onClose();
          void onCreateFromTemplate(tpl);
        },
      });
    }

    return entries;
  }, [
    notes,
    folders,
    events,
    reminders,
    templates,
    folderMap,
    settings.timeFormat24h,
    onSelectNote,
    onSelectFolder,
    onSelectEvent,
    onSelectReminder,
    onCreateFromTemplate,
    onClose,
  ]);

  const tokens = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return [];
    return normalizeText(trimmed).split(/\s+/).filter(Boolean);
  }, [query]);

  // Match + relevance scoring across all entries
  const matchedByCategory = useMemo(() => {
    const counts: Record<SearchCategory, number> = {
      all: 0,
      notes: 0,
      folders: 0,
      events: 0,
      reminders: 0,
      templates: 0,
    };

    if (tokens.length === 0) {
      for (const e of allEntries) {
        counts.all += 1;
        counts[e.category] += 1;
      }
      return { scored: [] as Array<{ entry: SearchEntry; score: number }>, counts };
    }

    const scored: Array<{ entry: SearchEntry; score: number }> = [];

    for (const entry of allEntries) {
      let score = 0;
      let allMatch = true;

      for (const tok of tokens) {
        if (tok.startsWith('#')) {
          const tag = tok.slice(1);
          if (!tag) continue;
          if (entry.tagsNorm.includes(`#${tag}`) || entry.tagsNorm.includes(tag)) {
            score += 45;
          } else {
            allMatch = false;
            break;
          }
        } else if (entry.titleNorm === tok) {
          score += 120;
        } else if (entry.titleNorm.startsWith(tok)) {
          score += 80;
        } else if (entry.titleNorm.includes(tok)) {
          score += 50;
        } else if (entry.searchNorm.includes(tok)) {
          score += 20;
        } else {
          allMatch = false;
          break;
        }
      }

      if (allMatch) {
        scored.push({ entry, score });
        counts.all += 1;
        counts[entry.category] += 1;
      }
    }

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.entry.recencyMs - a.entry.recencyMs;
    });

    return { scored, counts };
  }, [allEntries, tokens]);

  // Empty-query suggestions: 4 recent notes + 2 quick actions
  const displayedItems = useMemo<SearchEntry[]>(() => {
    if (tokens.length === 0) {
      const recentNotes = allEntries
        .filter((e) => e.category === 'notes')
        .sort((a, b) => b.recencyMs - a.recencyMs)
        .slice(0, 4);

      const quickActions: SearchEntry[] = [
        {
          key: 'action-new-note',
          category: 'notes',
          title: 'Nueva nota en blanco',
          subtitle: 'Crear y abrir un documento nuevo inmediatamente',
          meta: 'Acción rápida',
          recencyMs: 0,
          titleNorm: '',
          tagsNorm: '',
          searchNorm: '',
          onExecute: () => {
            onClose();
            onCreateBlankNote();
          },
        },
        {
          key: 'action-open-calendar',
          category: 'events',
          title: 'Abrir Calendario Completo',
          subtitle: 'Ver vista mensual, semanal y diaria de eventos',
          meta: 'Acción rápida',
          recencyMs: 0,
          titleNorm: '',
          tagsNorm: '',
          searchNorm: '',
          onExecute: () => {
            onClose();
            onOpenCalendar();
          },
        },
      ];

      if (category === 'all') {
        return [...recentNotes, ...quickActions];
      }
      return allEntries
        .filter((e) => e.category === category)
        .sort((a, b) => b.recencyMs - a.recencyMs)
        .slice(0, 12);
    }

    return matchedByCategory.scored
      .filter(({ entry }) => category === 'all' || entry.category === category)
      .slice(0, 24)
      .map(({ entry }) => entry);
  }, [
    tokens.length,
    allEntries,
    matchedByCategory.scored,
    category,
    onClose,
    onCreateBlankNote,
    onOpenCalendar,
  ]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, category]);

  useEffect(() => {
    const activeEl = itemRefs.current[activeIndex];
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex, displayedItems]);

  if (!isOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (displayedItems.length > 0) {
        setActiveIndex((prev) => (prev + 1) % displayedItems.length);
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (displayedItems.length > 0) {
        setActiveIndex((prev) => (prev - 1 + displayedItems.length) % displayedItems.length);
      }
      return;
    }

    if (e.key === 'Enter') {
      const target = displayedItems[activeIndex];
      if (target) {
        e.preventDefault();
        target.onExecute();
      }
    }
  };

  const renderEntryIcon = (entry: SearchEntry) => {
    if (entry.key === 'action-new-note') {
      return <Plus className="w-4 h-4 text-accent" />;
    }
    switch (entry.category) {
      case 'folders':
        return (
          <FolderIcon
            className="w-4 h-4 text-accent"
            style={entry.color ? { color: entry.color } : undefined}
          />
        );
      case 'events':
        return (
          <Calendar
            className="w-4 h-4 text-blue-400"
            style={entry.color ? { color: entry.color } : undefined}
          />
        );
      case 'reminders':
        return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
      case 'templates':
        return <Sparkles className="w-4 h-4 text-purple-400" />;
      case 'notes':
      default:
        return <FileText className="w-4 h-4 text-veyra-muted" />;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4 bg-black/60 backdrop-blur-xs"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={handleKeyDown}
    >
      <div className="w-full max-w-2xl rounded-2xl bg-veyra-card border border-veyra-border shadow-elevated overflow-hidden flex flex-col max-h-[75vh]">
        {/* Search Input Header */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-veyra-border bg-veyra-card shrink-0">
          <Search className="w-4 h-4 text-accent shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar notas, carpetas, eventos, recordatorios, plantillas o #etiquetas..."
            className="flex-1 bg-transparent text-sm text-veyra-text placeholder:text-veyra-muted/70 focus:outline-none min-w-0"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              title="Limpiar búsqueda"
              className="p-1 rounded-md text-veyra-muted hover:text-veyra-text hover:bg-veyra-elevated transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded bg-veyra-elevated border border-veyra-border text-[10px] font-mono text-veyra-muted shrink-0">
            ESC
          </kbd>
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-veyra-border bg-veyra-elevated/40 overflow-x-auto shrink-0">
          {CATEGORY_TABS.map((tab) => {
            const count = matchedByCategory.counts[tab.id];
            const isActive = category === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setCategory(tab.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer shrink-0',
                  isActive
                    ? 'bg-accent/15 text-accent border border-accent/30 font-semibold'
                    : 'text-veyra-muted hover:text-veyra-text hover:bg-veyra-elevated border border-transparent'
                )}
              >
                <span>{tab.label}</span>
                <span
                  className={cn(
                    'px-1.5 py-0.2 rounded text-[10px] font-mono',
                    isActive ? 'bg-accent/15 text-accent' : 'bg-veyra-card text-veyra-subtle'
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar min-h-[200px]">
          {tokens.length === 0 && category === 'all' && (
            <div className="px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-veyra-muted">
              Recientes y acciones rápidas
            </div>
          )}

          {displayedItems.length === 0 ? (
            <div className="py-12 px-4 text-center flex flex-col items-center justify-center">
              <Search className="w-8 h-8 text-veyra-subtle mb-2 opacity-60" />
              <p className="text-xs font-medium text-veyra-text">
                No se encontraron coincidencias para "{query}"
              </p>
              <p className="text-[11px] text-veyra-muted mt-1">
                Prueba con otras palabras clave o cambia el filtro de categoría.
              </p>
            </div>
          ) : (
            displayedItems.map((entry, idx) => {
              const isActive = idx === activeIndex;
              return (
                <button
                  key={entry.key}
                  ref={(el) => {
                    itemRefs.current[idx] = el;
                  }}
                  type="button"
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={entry.onExecute}
                  className={cn(
                    'w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-left transition-colors cursor-pointer',
                    isActive
                      ? 'bg-accent/10 border border-accent/35'
                      : 'border border-transparent hover:bg-veyra-elevated/70'
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="w-8 h-8 rounded-lg bg-veyra-elevated border border-veyra-border flex items-center justify-center shrink-0">
                      {renderEntryIcon(entry)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-veyra-text truncate">
                        {highlightMatch(entry.title, tokens)}
                      </div>
                      <div className="text-[11px] text-veyra-muted truncate mt-0.5">
                        {highlightMatch(entry.subtitle, tokens)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {entry.meta && (
                      <span className="px-2 py-0.5 rounded-md bg-veyra-elevated border border-veyra-border text-[10px] font-medium text-veyra-muted">
                        {entry.meta}
                      </span>
                    )}
                    {isActive && (
                      <CornerDownLeft className="w-3.5 h-3.5 text-accent shrink-0" />
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer keyboard hints */}
        <div className="px-4 py-2 border-t border-veyra-border bg-veyra-elevated/30 flex items-center justify-between text-[10.5px] text-veyra-muted shrink-0">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <ArrowUp className="w-3 h-3" />
              <ArrowDown className="w-3 h-3" />
              <span>Navegar</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <CornerDownLeft className="w-3 h-3" />
              <span>Abrir</span>
            </span>
            <span>ESC Cerrar</span>
          </div>
          <span className="hidden sm:inline text-veyra-subtle">
            Tip: usa #etiqueta para filtrar por tags
          </span>
        </div>
      </div>
    </div>
  );
};
