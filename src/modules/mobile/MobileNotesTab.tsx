import React, { useCallback, useMemo, useState } from 'react';
import {
  Folder as FolderIcon,
  Pin,
  Users,
  FileText,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  Plus,
  Layers,
  Inbox,
  BookOpen,
  Calendar as CalendarIcon,
  ExternalLink,
  Trash2,
} from 'lucide-react';
import type { Folder, Note } from '../../types/notes';
import type { CalendarEvent } from '../../hooks/useEvents';
import { cn } from '../../lib/utils';
import { SwipeableCard } from './SwipeableCard';

type NotesFilter = 'all' | 'pinned' | 'shared' | 'unassigned';

export interface MobileNotesTabProps {
  folders: Folder[];
  allNotes: Note[];
  events: CalendarEvent[];
  currentUserId: string;
  onSelectNote: (noteId: string) => void;
  onSelectEvent: (eventId: string) => void;
  onCreateNote: (folderId: string | null, eventId?: string | null) => void;
  onCreateFolder: () => void;
  onDeleteNote?: (noteId: string) => Promise<void> | void;
  onDeleteFolder?: (folderId: string) => Promise<void> | void;
}

function formatDatePill(ts?: number | null): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  const months = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

function getPreviewSnippet(note: Note): string {
  if (note.preview_text?.trim()) return note.preview_text.trim();
  if (!note.content) return '';
  try {
    const parsed = JSON.parse(note.content);
    if (parsed?.pages && Array.isArray(parsed.pages)) {
      return parsed.pages
        .map((p: { content?: string }) => p.content || '')
        .join(' ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
  } catch {
    return note.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  return '';
}

function isThisWeek(ts: number): boolean {
  const now = new Date();
  const diff = now.getTime() - ts;
  return diff >= 0 && diff < 7 * 86400000;
}

function isThisMonth(ts: number): boolean {
  const d = new Date(ts);
  const now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

export const MobileNotesTab: React.FC<MobileNotesTabProps> = ({
  folders,
  allNotes,
  events,
  currentUserId,
  onSelectNote,
  onSelectEvent,
  onCreateNote,
  onCreateFolder,
  onDeleteNote,
  onDeleteFolder,
}) => {
  const [filter, setFilter] = useState<NotesFilter>('all');
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [isSmartNotebooksOpen, setIsSmartNotebooksOpen] = useState(true);
  const [exitingNoteIds, setExitingNoteIds] = useState<Set<string>>(() => new Set());
  const [exitingFolderIds, setExitingFolderIds] = useState<Set<string>>(() => new Set());
  const [confirmDeleteFolderId, setConfirmDeleteFolderId] = useState<string | null>(null);

  const animateDeleteNote = useCallback(
    (noteId: string) => {
      if (!onDeleteNote) return;
      setExitingNoteIds((prev) => {
        if (prev.has(noteId)) return prev;
        const next = new Set(prev);
        next.add(noteId);
        return next;
      });
      window.setTimeout(async () => {
        try {
          await onDeleteNote(noteId);
        } finally {
          setExitingNoteIds((prev) => {
            if (!prev.has(noteId)) return prev;
            const next = new Set(prev);
            next.delete(noteId);
            return next;
          });
        }
      }, 250);
    },
    [onDeleteNote]
  );

  const animateDeleteFolder = useCallback(
    (folderId: string, parentId?: string | null) => {
      if (!onDeleteFolder) return;
      setConfirmDeleteFolderId(null);
      if (activeFolderId === folderId) {
        setActiveFolderId(parentId || null);
      }
      setExitingFolderIds((prev) => {
        if (prev.has(folderId)) return prev;
        const next = new Set(prev);
        next.add(folderId);
        return next;
      });
      window.setTimeout(async () => {
        try {
          await onDeleteFolder(folderId);
        } finally {
          setExitingFolderIds((prev) => {
            if (!prev.has(folderId)) return prev;
            const next = new Set(prev);
            next.delete(folderId);
            return next;
          });
        }
      }, 240);
    },
    [activeFolderId, onDeleteFolder]
  );

  const activeNotes = useMemo(
    () => allNotes.filter((n) => !n.deleted && !(n as unknown as { deleted_at_ms?: number | null }).deleted_at_ms),
    [allNotes]
  );
  const isSharedNote = (n: Note) => Boolean(n.user_id && n.user_id !== currentUserId);

  // Smart Notebooks: events that are #clase or have linked notes
  const smartNotebooks = useMemo(() => {
    const countsByEvent = new Map<string, number>();
    for (const n of activeNotes) {
      if (n.event_id) {
        countsByEvent.set(n.event_id, (countsByEvent.get(n.event_id) || 0) + 1);
      }
    }

    const seenTitles = new Set<string>();
    const list: Array<{ event: CalendarEvent; noteCount: number }> = [];
    for (const ev of events) {
      if (ev.deleted === 1) continue;
      const noteCount = countsByEvent.get(ev.id) || 0;
      const rawTags = Array.isArray(ev.tags)
        ? ev.tags.join(',')
        : typeof ev.tags === 'string'
          ? ev.tags
          : '';
      const isClass = rawTags.toLowerCase().includes('clase');
      if (!isClass && noteCount === 0) continue;

      const key = ev.title.trim().toLowerCase();
      if (seenTitles.has(key)) continue;
      seenTitles.add(key);
      list.push({ event: ev, noteCount });
    }
    return list;
  }, [events, activeNotes]);

  const activeSmartEventIds = useMemo(
    () => new Set(smartNotebooks.map((s) => s.event.id)),
    [smartNotebooks]
  );

  const activeFolderIds = useMemo(
    () => new Set(folders.filter((f) => !f.deleted).map((f) => f.id)),
    [folders]
  );

  const counts = useMemo(
    () => ({
      all: activeNotes.filter((n) => !n.event_id || !activeSmartEventIds.has(n.event_id)).length,
      pinned: activeNotes.filter((n) => n.is_pinned === 1).length,
      shared: activeNotes.filter(isSharedNote).length,
      unassigned: activeNotes.filter(
        (n) =>
          (!n.folder_id || !activeFolderIds.has(n.folder_id)) &&
          (!n.event_id || !activeSmartEventIds.has(n.event_id))
      ).length,
    }),
    [activeNotes, activeSmartEventIds, activeFolderIds, currentUserId]
  );

  const totalSmartNotes = useMemo(
    () => smartNotebooks.reduce((sum, item) => sum + item.noteCount, 0),
    [smartNotebooks]
  );

  const activeFolder = useMemo(
    () => (activeFolderId ? folders.find((f) => f.id === activeFolderId) || null : null),
    [activeFolderId, folders]
  );

  const visibleFolders = useMemo(() => {
    if (filter !== 'all') return [];
    return folders.filter((f) => {
      if (f.deleted) return false;
      if (activeFolderId === null) {
        return !f.parent_id || !activeFolderIds.has(f.parent_id);
      }
      return f.parent_id === activeFolderId;
    });
  }, [folders, activeFolderId, activeFolderIds, filter]);

  const displayedNotes = useMemo(() => {
    let list = activeNotes;
    if (filter === 'pinned') list = list.filter((n) => n.is_pinned === 1);
    else if (filter === 'shared') list = list.filter(isSharedNote);
    else if (filter === 'unassigned')
      list = list.filter(
        (n) =>
          (!n.folder_id || !activeFolderIds.has(n.folder_id)) &&
          (!n.event_id || !activeSmartEventIds.has(n.event_id))
      );
    else if (activeFolderId) list = list.filter((n) => n.folder_id === activeFolderId);
    else list = list.filter((n) => !n.event_id || !activeSmartEventIds.has(n.event_id)); // Solo oculta notas que sí tienen Cuaderno Inteligente activo

    return [...list].sort(
      (a, b) => (b.created_at_ms || b.updated_at_ms || 0) - (a.created_at_ms || a.updated_at_ms || 0)
    );
  }, [activeNotes, activeSmartEventIds, filter, activeFolderId, currentUserId]);

  const groupedNotes = useMemo(() => {
    const thisWeek: Note[] = [];
    const thisMonth: Note[] = [];
    const older: Note[] = [];

    for (const n of displayedNotes) {
      const ts = n.created_at_ms || n.updated_at_ms || 0;
      if (isThisWeek(ts)) thisWeek.push(n);
      else if (isThisMonth(ts)) thisMonth.push(n);
      else older.push(n);
    }

    const groups: Array<{ title: string; notes: Note[] }> = [];
    if (thisWeek.length > 0) groups.push({ title: 'Esta semana', notes: thisWeek });
    if (thisMonth.length > 0) groups.push({ title: 'Este mes', notes: thisMonth });
    if (older.length > 0) groups.push({ title: 'Anteriores', notes: older });
    return groups;
  }, [displayedNotes]);

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-y-auto pt-1 pb-28 px-4 space-y-3.5">
      {/* Filter Chips */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-none py-0.5 shrink-0">
        {[
          { id: 'all' as NotesFilter, label: 'Todas', count: counts.all, icon: Layers },
          { id: 'pinned' as NotesFilter, label: 'Fijadas', count: counts.pinned, icon: Pin },
          { id: 'shared' as NotesFilter, label: 'Compartidas', count: counts.shared, icon: Users },
          { id: 'unassigned' as NotesFilter, label: 'Sin carpeta', count: counts.unassigned, icon: Inbox },
        ].map((chip) => {
          const Icon = chip.icon;
          const active = filter === chip.id;
          return (
            <button
              key={chip.id}
              type="button"
              onClick={() => {
                setFilter(chip.id);
                if (chip.id !== 'all') setActiveFolderId(null);
              }}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition-colors shrink-0 cursor-pointer',
                active
                  ? 'bg-accent/10 border-accent text-veyra-text font-semibold'
                  : 'bg-veyra-card border-veyra-border text-veyra-muted'
              )}
            >
              <Icon className={cn('w-3.5 h-3.5', active ? 'text-accent' : 'text-veyra-subtle')} />
              <span>{chip.label}</span>
              <span
                className={cn(
                  'px-1.5 py-0.2 rounded-full text-[10px] font-semibold',
                  active ? 'bg-accent/20 text-accent' : 'bg-veyra-elevated text-veyra-subtle'
                )}
              >
                {chip.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Active Folder Breadcrumb or Create Folder Banner */}
      {activeFolder ? (
        <div className="flex items-center justify-between gap-2 bg-veyra-card border border-veyra-border rounded-2xl px-3.5 py-2.5">
          <button
            type="button"
            onClick={() => {
              setConfirmDeleteFolderId(null);
              setActiveFolderId(activeFolder.parent_id || null);
            }}
            className="flex items-center gap-2 text-xs font-semibold text-veyra-text cursor-pointer min-w-0"
          >
            <ArrowLeft className="w-4 h-4 text-accent shrink-0" />
            <FolderIcon
              className="w-4 h-4 shrink-0"
              style={{ color: activeFolder.color || 'var(--accent-primary)' }}
            />
            <span className="truncate">{activeFolder.name}</span>
          </button>

          <div className="flex items-center gap-1.5 shrink-0">
            {onDeleteFolder && (
              confirmDeleteFolderId === activeFolder.id ? (
                <button
                  type="button"
                  onClick={() => animateDeleteFolder(activeFolder.id, activeFolder.parent_id)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-600 text-white text-[11px] font-semibold cursor-pointer animate-in fade-in duration-150"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Confirmar</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteFolderId(activeFolder.id)}
                  title="Eliminar carpeta"
                  className="w-7 h-7 rounded-full flex items-center justify-center text-veyra-muted hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )
            )}
            <button
              type="button"
              onClick={() => onCreateNote(activeFolder.id)}
              className="flex items-center gap-1 px-3 py-1 rounded-full bg-accent text-white text-xs font-semibold cursor-pointer shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nueva</span>
            </button>
          </div>
        </div>
      ) : filter === 'all' && visibleFolders.length === 0 ? (
        <div className="flex items-center justify-between bg-veyra-card border border-veyra-border rounded-2xl px-3.5 py-2.5 gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-accent/10 text-accent flex items-center justify-center shrink-0">
              <FolderIcon className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-medium text-veyra-text truncate">
              Crea carpetas para organizar
            </span>
          </div>
          <button
            type="button"
            onClick={onCreateFolder}
            className="flex items-center gap-1 px-3 py-1 rounded-full bg-accent text-white text-xs font-semibold cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nueva</span>
          </button>
        </div>
      ) : null}

      {/* Horizontal Folder Chips if user has folders */}
      {visibleFolders.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none py-0.5 shrink-0">
          {visibleFolders.map((folder) => {
            const isExitingFolder = exitingFolderIds.has(folder.id);
            return (
              <div
                key={folder.id}
                className={cn(
                  'veyra-chip-collapse',
                  isExitingFolder && 'veyra-chip-collapse-exiting'
                )}
              >
                <div className="veyra-chip-collapse-inner">
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmDeleteFolderId(null);
                      setActiveFolderId(folder.id);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-veyra-card border border-veyra-border text-xs font-medium text-veyra-text shrink-0 cursor-pointer whitespace-nowrap"
                  >
                    <FolderIcon
                      className="w-3.5 h-3.5"
                      style={{ color: folder.color || 'var(--accent-primary)' }}
                    />
                    <span>{folder.name}</span>
                    <ChevronRight className="w-3 h-3 text-veyra-subtle" />
                  </button>
                </div>
              </div>
            );
          })}
          <button
            type="button"
            onClick={onCreateFolder}
            title="Nueva carpeta"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-veyra-elevated/60 border border-veyra-border text-xs font-medium text-accent shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nueva</span>
          </button>
        </div>
      )}

      {/* CUADERNOS INTELIGENTES (Clases / Eventos con notas) */}
      {!activeFolderId && filter === 'all' && smartNotebooks.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-[10.5px] font-bold uppercase tracking-wider text-veyra-subtle px-0.5">
            CUADERNOS INTELIGENTES
          </h2>

          <div className="rounded-2xl bg-veyra-card border border-veyra-border overflow-hidden">
            <button
              type="button"
              onClick={() => setIsSmartNotebooksOpen((prev) => !prev)}
              className="w-full px-3.5 py-3 flex items-center justify-between cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-accent/15 text-accent flex items-center justify-center">
                  <BookOpen className="w-3.5 h-3.5" />
                </div>
                <span className="text-sm font-bold text-veyra-text">Clases</span>
                <span className="px-2 py-0.5 rounded-full bg-veyra-elevated text-[10.5px] font-medium text-veyra-muted">
                  {totalSmartNotes} {totalSmartNotes === 1 ? 'nota' : 'notas'}
                </span>
              </div>
              {isSmartNotebooksOpen ? (
                <ChevronUp className="w-4 h-4 text-veyra-muted" />
              ) : (
                <ChevronDown className="w-4 h-4 text-veyra-muted" />
              )}
            </button>

            {isSmartNotebooksOpen && (
              <div className="px-3 pb-3 space-y-2 border-t border-veyra-border/60 pt-2">
                {smartNotebooks.map(({ event, noteCount }) => {
                  const color = event.color || '#60A5FA';
                  return (
                    <div
                      key={event.id}
                      onClick={() => onSelectEvent(event.id)}
                      className="flex items-center justify-between gap-2 py-1.5 px-1 rounded-xl hover:bg-veyra-elevated/40 cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div
                          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                          style={{ backgroundColor: `${color}20`, color }}
                        >
                          <CalendarIcon className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-xs font-semibold text-veyra-text truncate">
                          {event.title}
                        </span>
                        <span className="text-[11px] text-veyra-subtle shrink-0">
                          ({noteCount})
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onCreateNote(null, event.id);
                          }}
                          title="Crear nota en esta clase"
                          className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer"
                          style={{ backgroundColor: `${color}20`, color }}
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectEvent(event.id);
                          }}
                          title="Abrir cuaderno"
                          className="w-7 h-7 rounded-lg bg-veyra-elevated text-veyra-muted flex items-center justify-center cursor-pointer"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                        <ChevronRight className="w-3.5 h-3.5 text-veyra-subtle" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Time-Grouped Notes */}
      {groupedNotes.length === 0 ? (
        <div className="p-8 rounded-2xl border border-dashed border-veyra-border bg-veyra-card/40 text-center space-y-2">
          <FileText className="w-7 h-7 text-veyra-subtle mx-auto" />
          <p className="text-xs font-semibold text-veyra-text">Sin notas</p>
          <p className="text-[11px] text-veyra-muted">Crea tu primera nota con el botón +.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groupedNotes.map((group) => (
            <section key={group.title} className="space-y-2">
              <div className="flex items-center justify-between px-0.5">
                <h2 className="text-xs font-medium text-veyra-muted">{group.title}</h2>
                <span className="text-[11px] font-medium text-veyra-subtle">
                  {group.notes.length}
                </span>
              </div>

              <div className="rounded-2xl bg-veyra-card border border-veyra-border divide-y divide-veyra-border overflow-hidden">
                {group.notes.map((note) => {
                  const snippet = getPreviewSnippet(note);
                  const folder = note.folder_id
                    ? folders.find((f) => !f.deleted && f.id === note.folder_id)
                    : null;
                  const isExitingNote = exitingNoteIds.has(note.id);

                  return (
                    <div
                      key={note.id}
                      className={cn(
                        'veyra-delete-collapse',
                        isExitingNote && 'veyra-delete-collapse-exiting'
                      )}
                    >
                      <div className="veyra-delete-collapse-inner">
                        <SwipeableCard
                          className="rounded-none"
                          leftLabel="Papelera"
                          onSwipeLeft={onDeleteNote ? () => animateDeleteNote(note.id) : undefined}
                          onTap={() => onSelectNote(note.id)}
                        >
                          <div className="w-full text-left p-3.5 bg-veyra-card hover:bg-veyra-elevated/40 active:bg-veyra-elevated/60 transition-colors cursor-pointer space-y-1">
                            <div className="flex items-center gap-2 text-[10.5px] text-veyra-subtle font-medium">
                              <span>{formatDatePill(note.created_at_ms || note.updated_at_ms)}</span>
                              {folder && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.2 rounded-full bg-accent/15 text-accent font-medium">
                                  <FolderIcon className="w-2.5 h-2.5" />
                                  <span>{folder.name}</span>
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-bold text-veyra-text truncate">
                                {note.title || 'Nota sin título'}
                              </h3>
                              <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                            </div>

                            {snippet && (
                              <p className="text-xs text-veyra-muted line-clamp-2 leading-relaxed">
                                {snippet}
                              </p>
                            )}
                          </div>
                        </SwipeableCard>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};
