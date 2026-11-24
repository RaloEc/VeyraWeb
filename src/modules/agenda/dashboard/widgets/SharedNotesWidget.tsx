import React, { useMemo } from 'react';
import { Users, FileText, ChevronRight, Folder as FolderIcon } from 'lucide-react';
import { cn } from '../../../../lib/utils';
import type { Folder } from '../../../../types/notes';
import type { SharedNoteEntry } from '../useSharedNotes';
import { WidgetCard } from '../WidgetCard';

interface SharedNotesWidgetProps {
  sharedNotes: SharedNoteEntry[];
  folders: Folder[];
  onSelectNote: (noteId: string) => void;
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

export const SharedNotesWidget: React.FC<SharedNotesWidgetProps> = ({
  sharedNotes,
  folders,
  onSelectNote,
}) => {
  const folderMap = useMemo(() => {
    const map = new Map<string, Folder>();
    folders.forEach((f) => map.set(f.id, f));
    return map;
  }, [folders]);

  return (
    <WidgetCard
      title="Notas Compartidas"
      subtitle={`${sharedNotes.length} en colaboración`}
      icon={<Users className="w-4 h-4" />}
      iconClassName="text-teal-400"
    >
      <div className="flex-1 overflow-y-auto pr-1 min-h-0 custom-scrollbar">
        <div className="divide-y divide-veyra-border/40">
          {sharedNotes.map(({ note, direction, role, collaboratorCount }) => {
            const folder = note.folder_id ? folderMap.get(note.folder_id) : undefined;

            return (
              <div
                key={note.id}
                onClick={() => onSelectNote(note.id)}
                className="group flex items-center justify-between px-2 py-2 rounded-lg hover:bg-veyra-elevated/55 transition-colors cursor-pointer min-w-0 gap-2.5"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <FileText className="w-4 h-4 text-teal-400 shrink-0" />

                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-medium text-veyra-text truncate group-hover:text-accent transition-colors">
                      {note.title || 'Nota sin título'}
                    </h4>

                    <div className="flex items-center gap-1.5 mt-0.5 text-[10.5px] text-veyra-muted min-w-0">
                      <span
                        className={cn(
                          'font-medium shrink-0',
                          direction === 'shared_with_me' ? 'text-teal-400' : 'text-accent'
                        )}
                      >
                        {direction === 'shared_with_me'
                          ? `Contigo · ${role === 'viewer' ? 'Lector' : 'Editor'}`
                          : `Compartida · ${collaboratorCount || 1}`}
                      </span>

                      {folder && (
                        <>
                          <span className="text-veyra-subtle shrink-0">·</span>
                          <span className="inline-flex items-center gap-1 truncate min-w-0">
                            <FolderIcon
                              className="w-2.5 h-2.5 shrink-0"
                              style={folder.color ? { color: folder.color } : undefined}
                            />
                            <span className="truncate">{folder.name}</span>
                          </span>
                        </>
                      )}
                    </div>
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
      </div>
    </WidgetCard>
  );
};
