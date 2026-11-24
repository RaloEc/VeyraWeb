import React, { useEffect, useMemo, useState } from 'react';
import {
  FolderKanban,
  Folder as FolderIcon,
  FileText,
  GraduationCap,
  ClipboardList,
  Columns3,
  Calendar,
  FlaskConical,
  CheckSquare,
  Table,
  Sparkles,
  Pin,
  Loader2,
  SlidersHorizontal,
  BookOpen,
  Briefcase,
  Check,
  Search,
  RotateCcw,
} from 'lucide-react';
import { cn } from '../../../../lib/utils';
import type { Folder, Note } from '../../../../types/notes';
import type { CalendarEvent } from '../../../../hooks/useEvents';
import type { NoteTemplate } from '../../../notes/templates/templatesData';
import { getEventCategoryTag, isEventNotebook } from '../../../../lib/eventNotebooks';
import {
  type DashboardQuickAccessItem,
  QUICK_ACCESS_CHANGED_EVENT,
  loadDashboardQuickAccess,
  saveDashboardQuickAccess,
} from '../../../../lib/dashboardQuickAccess';
import { Modal } from '../../../../components/common/Modal';
import { WidgetCard } from '../WidgetCard';

interface FoldersTemplatesWidgetProps {
  folders: Folder[];
  notes: Note[];
  events: CalendarEvent[];
  templates: NoteTemplate[];
  currentUserId?: string;
  onSelectFolder: (folderId: string) => void;
  onSelectEvent: (eventId: string) => void;
  onCreateFromTemplate: (template: NoteTemplate) => Promise<void> | void;
}

function renderTemplateIcon(iconName: NoteTemplate['iconName']) {
  switch (iconName) {
    case 'graduation-cap':
      return <GraduationCap className="w-4 h-4" />;
    case 'clipboard-list':
      return <ClipboardList className="w-4 h-4" />;
    case 'columns-3':
      return <Columns3 className="w-4 h-4" />;
    case 'calendar':
      return <Calendar className="w-4 h-4" />;
    case 'flask-conical':
      return <FlaskConical className="w-4 h-4" />;
    case 'check-square':
      return <CheckSquare className="w-4 h-4" />;
    case 'table':
      return <Table className="w-4 h-4" />;
    case 'file-text':
    default:
      return <FileText className="w-4 h-4" />;
  }
}

function renderNotebookIcon(categoryName: string, color?: string | null) {
  const lower = categoryName.toLowerCase();
  const style = color ? { color } : undefined;
  if (lower === 'universidad') {
    return <GraduationCap className="w-3.5 h-3.5 shrink-0 text-accent" style={style} />;
  }
  if (lower === 'clases') {
    return <BookOpen className="w-3.5 h-3.5 shrink-0 text-accent" style={style} />;
  }
  if (lower === 'trabajo') {
    return <Briefcase className="w-3.5 h-3.5 shrink-0 text-accent" style={style} />;
  }
  return <Calendar className="w-3.5 h-3.5 shrink-0 text-accent" style={style} />;
}

interface HierarchicalFolderEntry {
  folder: Folder;
  depth: number;
  parentName?: string;
  noteCount: number;
}

interface EventNotebookEntry {
  event: CalendarEvent;
  category: string;
  noteCount: number;
}

export const FoldersTemplatesWidget: React.FC<FoldersTemplatesWidgetProps> = ({
  folders,
  notes,
  events,
  templates,
  currentUserId,
  onSelectFolder,
  onSelectEvent,
  onCreateFromTemplate,
}) => {
  const [creatingTemplateId, setCreatingTemplateId] = useState<string | null>(null);
  const [customSelection, setCustomSelection] = useState<DashboardQuickAccessItem[] | null>(() =>
    loadDashboardQuickAccess(currentUserId)
  );
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');

  useEffect(() => {
    const handleSync = () => {
      setCustomSelection(loadDashboardQuickAccess(currentUserId));
    };
    window.addEventListener(QUICK_ACCESS_CHANGED_EVENT, handleSync);
    return () => window.removeEventListener(QUICK_ACCESS_CHANGED_EVENT, handleSync);
  }, [currentUserId]);

  const activeNotes = useMemo(() => notes.filter((n) => n.deleted !== 1), [notes]);

  const folderNoteCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of activeNotes) {
      if (n.folder_id) {
        counts.set(n.folder_id, (counts.get(n.folder_id) || 0) + 1);
      }
    }
    return counts;
  }, [activeNotes]);

  const activeFolders = useMemo(
    () => folders.filter((f) => f.deleted !== 1),
    [folders]
  );

  const folderById = useMemo(
    () => new Map(activeFolders.map((f) => [f.id, f])),
    [activeFolders]
  );

  // Default quick access: root folders only (excludes subfolders unless user picks them)
  const defaultRootFolders = useMemo(() => {
    return activeFolders
      .filter((f) => !f.parent_id || !folderById.has(f.parent_id))
      .map((folder) => ({
        folder,
        noteCount: folderNoteCounts.get(folder.id) || 0,
      }))
      .sort((a, b) => {
        if (a.folder.is_pinned !== b.folder.is_pinned) {
          return (b.folder.is_pinned || 0) - (a.folder.is_pinned || 0);
        }
        if (a.noteCount !== b.noteCount) {
          return b.noteCount - a.noteCount;
        }
        return a.folder.name.localeCompare(b.folder.name);
      })
      .slice(0, 6);
  }, [activeFolders, folderById, folderNoteCounts]);

  // Event notebooks (events with #tags or linked notes)
  const notebookEvents = useMemo<EventNotebookEntry[]>(() => {
    const entries: EventNotebookEntry[] = [];
    for (const ev of events) {
      if (ev.deleted === 1) continue;
      const linkedCount = activeNotes.filter(
        (n) => n.event_id === ev.id || (ev.note_id && n.id === ev.note_id)
      ).length;
      if (isEventNotebook(ev, linkedCount)) {
        entries.push({
          event: ev,
          category: getEventCategoryTag(ev),
          noteCount: linkedCount,
        });
      }
    }
    return entries.sort((a, b) => a.event.title.localeCompare(b.event.title));
  }, [events, activeNotes]);

  const eventNotebookById = useMemo(
    () => new Map(notebookEvents.map((entry) => [entry.event.id, entry])),
    [notebookEvents]
  );

  // Hierarchical folder tree for the picker modal
  const hierarchicalFolders = useMemo<HierarchicalFolderEntry[]>(() => {
    const byParent = new Map<string, Folder[]>();
    for (const f of activeFolders) {
      const parentKey = f.parent_id && folderById.has(f.parent_id) ? f.parent_id : '__root__';
      const bucket = byParent.get(parentKey);
      if (bucket) {
        bucket.push(f);
      } else {
        byParent.set(parentKey, [f]);
      }
    }

    for (const list of byParent.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    }

    const result: HierarchicalFolderEntry[] = [];
    const visit = (parentId: string, depth: number, parentName?: string) => {
      const children = byParent.get(parentId) || [];
      for (const child of children) {
        result.push({
          folder: child,
          depth,
          parentName,
          noteCount: folderNoteCounts.get(child.id) || 0,
        });
        visit(child.id, Math.min(depth + 1, 4), child.name);
      }
    };
    visit('__root__', 0);
    return result;
  }, [activeFolders, folderById, folderNoteCounts]);

  // Group event notebooks by category for the picker modal
  const groupedEventNotebooks = useMemo(() => {
    const map = new Map<string, EventNotebookEntry[]>();
    for (const entry of notebookEvents) {
      const bucket = map.get(entry.category);
      if (bucket) {
        bucket.push(entry);
      } else {
        map.set(entry.category, [entry]);
      }
    }
    return Array.from(map.entries()).map(([category, items]) => ({ category, items }));
  }, [notebookEvents]);

  // Resolved items shown on the Dashboard card
  const displayedQuickAccess = useMemo(() => {
    if (customSelection === null) {
      return defaultRootFolders.map(({ folder, noteCount }) => ({
        key: `folder:${folder.id}`,
        type: 'folder' as const,
        id: folder.id,
        folder,
        noteCount,
      }));
    }

    const resolved: Array<
      | {
          key: string;
          type: 'folder';
          id: string;
          folder: Folder;
          noteCount: number;
        }
      | {
          key: string;
          type: 'event';
          id: string;
          entry: EventNotebookEntry;
        }
    > = [];

    for (const item of customSelection) {
      if (item.type === 'folder') {
        const folder = folderById.get(item.id);
        if (folder) {
          resolved.push({
            key: `folder:${folder.id}`,
            type: 'folder',
            id: folder.id,
            folder,
            noteCount: folderNoteCounts.get(folder.id) || 0,
          });
        }
      } else {
        const entry = eventNotebookById.get(item.id);
        if (entry) {
          resolved.push({
            key: `event:${entry.event.id}`,
            type: 'event',
            id: entry.event.id,
            entry,
          });
        }
      }
    }

    return resolved;
  }, [customSelection, defaultRootFolders, folderById, folderNoteCounts, eventNotebookById]);

  const selectedKeySet = useMemo(() => {
    const keys = new Set<string>();
    const source =
      customSelection !== null
        ? customSelection
        : defaultRootFolders.map(({ folder }) => ({ type: 'folder' as const, id: folder.id }));
    for (const item of source) {
      keys.add(`${item.type}:${item.id}`);
    }
    return keys;
  }, [customSelection, defaultRootFolders]);

  const toggleQuickAccessItem = (type: 'folder' | 'event', id: string) => {
    const baseList: DashboardQuickAccessItem[] =
      customSelection !== null
        ? customSelection
        : defaultRootFolders.map(({ folder }) => ({ type: 'folder' as const, id: folder.id }));

    const exists = baseList.some((item) => item.type === type && item.id === id);
    const next = exists
      ? baseList.filter((item) => !(item.type === type && item.id === id))
      : [...baseList, { type, id }];

    setCustomSelection(next);
    saveDashboardQuickAccess(currentUserId, next);
  };

  const resetQuickAccessToAuto = () => {
    setCustomSelection(null);
    saveDashboardQuickAccess(currentUserId, null);
  };

  const pickerQuery = pickerSearch.trim().toLowerCase();

  const filteredHierarchicalFolders = useMemo(() => {
    if (!pickerQuery) return hierarchicalFolders;
    return hierarchicalFolders.filter(
      (entry) =>
        entry.folder.name.toLowerCase().includes(pickerQuery) ||
        (entry.parentName && entry.parentName.toLowerCase().includes(pickerQuery))
    );
  }, [hierarchicalFolders, pickerQuery]);

  const filteredGroupedEvents = useMemo(() => {
    if (!pickerQuery) return groupedEventNotebooks;
    return groupedEventNotebooks
      .map((group) => ({
        category: group.category,
        items: group.items.filter(
          (entry) =>
            entry.event.title.toLowerCase().includes(pickerQuery) ||
            group.category.toLowerCase().includes(pickerQuery)
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [groupedEventNotebooks, pickerQuery]);

  const quickTemplates = useMemo(() => {
    const custom = templates.filter((t) => t.isCustom);
    const pageTemplates = templates.filter((t) => !t.isCustom && t.type === 'page');
    const blockTemplates = templates.filter((t) => !t.isCustom && t.type !== 'page');
    return [...custom, ...pageTemplates, ...blockTemplates].slice(0, 6);
  }, [templates]);

  const handleUseTemplate = async (template: NoteTemplate) => {
    if (creatingTemplateId) return;
    setCreatingTemplateId(template.id);
    try {
      await onCreateFromTemplate(template);
    } finally {
      setCreatingTemplateId(null);
    }
  };

  return (
    <>
      <WidgetCard
        title="Carpetas y Plantillas"
        subtitle="Accesos rápidos"
        icon={<FolderKanban className="w-4 h-4" />}
        iconClassName="text-sky-400"
      >
        <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-4 custom-scrollbar">
          {/* Section 1: Customizable Folders & Event Notebooks */}
          <div>
            <div className="flex items-center justify-between mb-2 gap-2">
              <span className="text-[10.5px] font-semibold uppercase tracking-wider text-veyra-muted">
                {customSelection !== null ? 'Accesos rápidos' : 'Carpetas principales'}
              </span>
              <button
                type="button"
                onClick={() => {
                  setPickerSearch('');
                  setIsPickerOpen(true);
                }}
                title="Elegir qué carpetas y cuadernos de eventos mostrar"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-medium text-veyra-muted hover:text-accent hover:bg-veyra-elevated/70 border border-transparent hover:border-veyra-border transition-colors cursor-pointer"
              >
                <SlidersHorizontal className="w-3 h-3" />
                <span>Personalizar</span>
              </button>
            </div>

            {displayedQuickAccess.length === 0 ? (
              <div className="flex items-center justify-between gap-2 py-1.5 px-2.5 rounded-lg bg-veyra-elevated/30 border border-veyra-border/60">
                <p className="text-xs text-veyra-muted">
                  {activeFolders.length === 0 && notebookEvents.length === 0
                    ? 'Aún no tienes carpetas ni cuadernos de eventos.'
                    : 'No hay accesos seleccionados.'}
                </p>
                {(activeFolders.length > 0 || notebookEvents.length > 0) && (
                  <button
                    type="button"
                    onClick={() => setIsPickerOpen(true)}
                    className="text-xs font-medium text-accent hover:underline cursor-pointer shrink-0"
                  >
                    Elegir
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {displayedQuickAccess.map((item) => {
                  if (item.type === 'folder') {
                    const { folder, noteCount } = item;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => onSelectFolder(folder.id)}
                        title={`Abrir carpeta "${folder.name}"`}
                        className="group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-veyra-elevated/45 hover:bg-veyra-elevated border border-transparent hover:border-veyra-border transition-colors cursor-pointer max-w-[200px]"
                      >
                        <FolderIcon
                          className="w-3.5 h-3.5 shrink-0 text-accent"
                          style={folder.color ? { color: folder.color } : undefined}
                        />
                        <span className="text-xs font-medium text-veyra-text group-hover:text-accent transition-colors truncate">
                          {folder.name}
                        </span>
                        {folder.is_pinned === 1 && (
                          <Pin className="w-2.5 h-2.5 text-amber-400 shrink-0" />
                        )}
                        <span className="text-[10.5px] font-mono text-veyra-muted shrink-0">
                          {noteCount}
                        </span>
                      </button>
                    );
                  }

                  const { event, category, noteCount } = item.entry;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => onSelectEvent(event.id)}
                      title={`Abrir cuaderno "${event.title}" (${category})`}
                      className="group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-veyra-elevated/45 hover:bg-veyra-elevated border border-transparent hover:border-veyra-border transition-colors cursor-pointer max-w-[210px]"
                    >
                      {renderNotebookIcon(category, event.color)}
                      <span className="text-xs font-medium text-veyra-text group-hover:text-accent transition-colors truncate">
                        {event.title}
                      </span>
                      <span className="text-[9.5px] px-1 py-0.2 rounded bg-white/5 text-veyra-subtle shrink-0">
                        {category}
                      </span>
                      {noteCount > 0 && (
                        <span className="text-[10.5px] font-mono text-veyra-muted shrink-0">
                          {noteCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 2: Flat Quick Templates */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10.5px] font-semibold uppercase tracking-wider text-veyra-muted flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-accent" />
                <span>Plantillas rápidas</span>
              </span>
              <span className="text-[10.5px] text-veyra-subtle">Crear en 1 clic</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              {quickTemplates.map((tpl) => {
                const isBusy = creatingTemplateId === tpl.id;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    disabled={Boolean(creatingTemplateId)}
                    onClick={() => handleUseTemplate(tpl)}
                    title={tpl.description}
                    className={cn(
                      'group flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-veyra-elevated/55 transition-colors text-left cursor-pointer min-w-0',
                      isBusy && 'opacity-70 bg-veyra-elevated/55'
                    )}
                  >
                    <div className="text-accent shrink-0 flex items-center justify-center">
                      {isBusy ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        renderTemplateIcon(tpl.iconName)
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-veyra-text group-hover:text-accent transition-colors truncate">
                        {tpl.title}
                      </div>
                      <div className="text-[10.5px] text-veyra-muted truncate mt-0.5">
                        {tpl.isCustom ? 'Plantilla propia' : tpl.categoryLabel}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </WidgetCard>

      {/* Quick Access Picker Modal */}
      <Modal
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        title="Accesos rápidos del Dashboard"
        description="Elige las carpetas (principales o subcarpetas) y cuadernos de eventos (#etiqueta) que quieres tener a la mano."
        maxWidth="lg"
      >
        <div className="space-y-4">
          {/* Search filter */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-veyra-subtle absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
              placeholder="Filtrar carpetas o cuadernos de eventos..."
              className="w-full bg-veyra-elevated text-veyra-text placeholder:text-veyra-subtle rounded-lg pl-8 pr-3 py-2 text-xs border border-veyra-border focus:border-accent/60 outline-none transition-colors"
            />
          </div>

          <div className="max-h-[340px] overflow-y-auto pr-1 space-y-4 custom-scrollbar">
            {/* Folders (Root + Subfolders hierarchically) */}
            <div>
              <div className="text-[10.5px] font-semibold uppercase tracking-wider text-veyra-muted mb-2">
                Carpetas y subcarpetas ({filteredHierarchicalFolders.length})
              </div>

              {filteredHierarchicalFolders.length === 0 ? (
                <p className="text-xs text-veyra-subtle py-1">
                  No se encontraron carpetas.
                </p>
              ) : (
                <div className="space-y-1">
                  {filteredHierarchicalFolders.map(({ folder, depth, parentName, noteCount }) => {
                    const isSelected = selectedKeySet.has(`folder:${folder.id}`);
                    return (
                      <button
                        key={folder.id}
                        type="button"
                        onClick={() => toggleQuickAccessItem('folder', folder.id)}
                        style={depth > 0 ? { paddingLeft: `${10 + depth * 16}px` } : undefined}
                        className={cn(
                          'w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg border text-left transition-colors cursor-pointer',
                          isSelected
                            ? 'bg-accent/12 border-accent/35 text-veyra-text'
                            : 'bg-veyra-elevated/35 border-transparent hover:bg-veyra-elevated/70 text-veyra-muted hover:text-veyra-text'
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={cn(
                              'w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors',
                              isSelected
                                ? 'bg-accent border-accent text-white'
                                : 'border-veyra-border bg-veyra-canvas/50'
                            )}
                          >
                            {isSelected && <Check className="w-3 h-3 stroke-[2.5]" />}
                          </span>

                          <FolderIcon
                            className="w-3.5 h-3.5 shrink-0 text-accent"
                            style={folder.color ? { color: folder.color } : undefined}
                          />

                          <span className="text-xs font-medium text-veyra-text truncate">
                            {folder.name}
                          </span>

                          {parentName && (
                            <span className="text-[10px] text-veyra-subtle truncate">
                              en {parentName}
                            </span>
                          )}
                        </div>

                        <span className="text-[10.5px] font-mono text-veyra-subtle shrink-0">
                          {noteCount}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Event Notebooks (#tags) */}
            <div>
              <div className="text-[10.5px] font-semibold uppercase tracking-wider text-veyra-muted mb-2">
                Cuadernos de eventos (#etiqueta) ({notebookEvents.length})
              </div>

              {filteredGroupedEvents.length === 0 ? (
                <p className="text-xs text-veyra-subtle py-1">
                  {notebookEvents.length === 0
                    ? 'No hay eventos con etiqueta (#clase, #universidad, etc.) o notas vinculadas.'
                    : 'No se encontraron cuadernos de eventos.'}
                </p>
              ) : (
                <div className="space-y-3">
                  {filteredGroupedEvents.map((group) => (
                    <div key={group.category} className="space-y-1">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-veyra-subtle px-1">
                        {group.category}
                      </div>
                      {group.items.map(({ event, category, noteCount }) => {
                        const isSelected = selectedKeySet.has(`event:${event.id}`);
                        return (
                          <button
                            key={event.id}
                            type="button"
                            onClick={() => toggleQuickAccessItem('event', event.id)}
                            className={cn(
                              'w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg border text-left transition-colors cursor-pointer',
                              isSelected
                                ? 'bg-accent/12 border-accent/35 text-veyra-text'
                                : 'bg-veyra-elevated/35 border-transparent hover:bg-veyra-elevated/70 text-veyra-muted hover:text-veyra-text'
                            )}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className={cn(
                                  'w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors',
                                  isSelected
                                    ? 'bg-accent border-accent text-white'
                                    : 'border-veyra-border bg-veyra-canvas/50'
                                )}
                              >
                                {isSelected && <Check className="w-3 h-3 stroke-[2.5]" />}
                              </span>

                              {renderNotebookIcon(category, event.color)}

                              <span className="text-xs font-medium text-veyra-text truncate">
                                {event.title}
                              </span>
                            </div>

                            <span className="text-[10.5px] font-mono text-veyra-subtle shrink-0">
                              {noteCount} {noteCount === 1 ? 'nota' : 'notas'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="pt-3 border-t border-veyra-border flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-veyra-muted">
                {selectedKeySet.size} {selectedKeySet.size === 1 ? 'seleccionado' : 'seleccionados'}
              </span>
              {customSelection !== null && (
                <button
                  type="button"
                  onClick={resetQuickAccessToAuto}
                  className="inline-flex items-center gap-1 text-[11px] text-veyra-muted hover:text-accent transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Restablecer automático</span>
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setIsPickerOpen(false)}
              className="px-3.5 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold hover:bg-accent/90 transition-colors cursor-pointer"
            >
              Listo
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
};
