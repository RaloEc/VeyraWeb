import React, { useMemo } from 'react';
import { Pin, FileText, Plus, ChevronRight, Folder as FolderIcon } from 'lucide-react';
import type { Note, Folder } from '../../../../types/notes';
import { WidgetCard } from '../WidgetCard';

interface PinnedNotesWidgetProps {
  notes: Note[];
  folders: Folder[];
  onSelectNote: (noteId: string) => void;
  onCreateNote: () => void;
}

function formatRelativeTime(ms: number): string {
  if (!ms) return '';
  const diffSec = Math.floor((Date.now() - ms) / 1000);
  if (diffSec < 60) return 'ahora';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;
  const d = new Date(ms);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

export const PinnedNotesWidget: React.FC<PinnedNotesWidgetProps> = ({
  notes,
  folders,
  onSelectNote,
  onCreateNote,
}) => {
  const folderMap = useMemo(() => {
    const map = new Map<string, Folder>();
    folders.forEach((f) => map.set(f.id, f));
    return map;
  }, [folders]);

  const pinnedNotes = notes.filter((n) => n.is_pinned === 1 && n.deleted !== 1);
  const recentNotes = notes
    .filter((n) => n.deleted !== 1 && n.is_pinned !== 1)
    .sort((a, b) => (b.updated_at_ms || 0) - (a.updated_at_ms || 0))
    .slice(0, 6);

  const displayedNotes = pinnedNotes.length > 0 ? pinnedNotes : recentNotes;
  const isShowingRecent = pinnedNotes.length === 0;

  return (
    <WidgetCard
      title={isShowingRecent ? 'Notas Recientes' : 'Notas Favoritas'}
      subtitle={`${displayedNotes.length} ${displayedNotes.length === 1 ? 'nota' : 'notas'}`}
      icon={<Pin className="w-4 h-4" />}
      iconClassName="text-purple-400"
      headerRight={
        <button
          type="button"
          onClick={onCreateNote}
          title="Nueva nota"
          className="p-1 rounded-md text-veyra-muted hover:text-veyra-text hover:bg-veyra-elevated/70 transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      }
    >
      <div className="flex-1 overflow-y-auto pr-1 min-h-0 custom-scrollbar">
        {displayedNotes.length === 0 ? (
          <div className="h-full min-h-[120px] flex flex-col items-center justify-center text-center p-3">
            <FileText className="w-5 h-5 text-veyra-subtle mb-2 opacity-75" />
            <p className="text-xs font-medium text-veyra-text">Sin notas ancladas</p>
            <p className="text-[11px] text-veyra-muted mt-0.5 max-w-[200px]">
              Fija tus notas favoritas para tenerlas siempre a mano aquí.
            </p>
            <button
              type="button"
              onClick={onCreateNote}
              className="mt-2.5 text-[11px] font-medium text-accent hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>Crear nueva nota</span>
            </button>
          </div>
        ) : (
          <div className="divide-y divide-veyra-border/40">
            {displayedNotes.map((note) => {
              const folder = note.folder_id ? folderMap.get(note.folder_id) : undefined;
              const preview = note.preview_text?.trim();

              return (
                <div
                  key={note.id}
                  onClick={() => onSelectNote(note.id)}
                  className="group flex items-center justify-between px-2 py-2 rounded-lg hover:bg-veyra-elevated/55 transition-colors cursor-pointer min-w-0 gap-2.5"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <FileText className="w-4 h-4 text-veyra-subtle group-hover:text-accent transition-colors shrink-0" />
                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs font-medium text-veyra-text truncate group-hover:text-accent transition-colors">
                        {note.title || 'Nota sin título'}
                      </h4>
                      {(folder || preview) && (
                        <div className="flex items-center gap-1.5 mt-0.5 text-[10.5px] text-veyra-muted min-w-0">
                          {folder && (
                            <span className="inline-flex items-center gap-1 shrink-0 max-w-[100px] truncate">
                              <FolderIcon
                                className="w-2.5 h-2.5 shrink-0"
                                style={folder.color ? { color: folder.color } : undefined}
                              />
                              <span className="truncate">{folder.name}</span>
                            </span>
                          )}
                          {folder && preview && <span className="text-veyra-subtle shrink-0">·</span>}
                          {preview && <span className="truncate">{preview}</span>}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 text-[10.5px] text-veyra-muted shrink-0">
                    <span className="hidden sm:inline font-mono">
                      {formatRelativeTime(note.updated_at_ms || note.created_at_ms || 0)}
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-veyra-subtle opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </WidgetCard>
  );
};
