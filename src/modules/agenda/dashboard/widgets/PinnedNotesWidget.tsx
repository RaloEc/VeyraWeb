import React from 'react';
import { Pin, FileText, Plus, ChevronRight } from 'lucide-react';
import type { Note, Folder } from '../../../../types/notes';

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
  folders: _folders,
  onSelectNote,
  onCreateNote,
}) => {
  const pinnedNotes = notes.filter((n) => n.is_pinned === 1 && n.deleted !== 1);
  const recentNotes = notes
    .filter((n) => n.deleted !== 1 && n.is_pinned !== 1)
    .sort((a, b) => (b.updated_at_ms || 0) - (a.updated_at_ms || 0))
    .slice(0, 5);

  const displayedNotes = pinnedNotes.length > 0 ? pinnedNotes : recentNotes;
  const isShowingRecent = pinnedNotes.length === 0;

  return (
    <div className="flex flex-col h-full rounded-xl bg-veyra-card border border-veyra-border p-3.5 sm:p-4 shadow-xs min-h-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between pb-2.5 border-b border-veyra-border/60 mb-2.5 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0">
            <Pin className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs sm:text-sm font-semibold text-veyra-text tracking-tight truncate">
              {isShowingRecent ? 'Notas Recientes' : 'Notas Clave'}
            </h3>
            <p className="text-[10px] sm:text-[11px] text-veyra-muted truncate">
              {displayedNotes.length} {displayedNotes.length === 1 ? 'nota' : 'notas'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onCreateNote}
          title="Nueva nota"
          className="p-1 rounded-md text-veyra-muted hover:text-veyra-text hover:bg-veyra-elevated transition-colors cursor-pointer shrink-0 ml-1"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pr-1 space-y-1.5 min-h-0 custom-scrollbar">
        {displayedNotes.length === 0 ? (
          <div className="h-full min-h-[100px] flex flex-col items-center justify-center text-center p-3">
            <div className="w-8 h-8 rounded-full bg-veyra-elevated text-veyra-muted flex items-center justify-center mb-1.5 shrink-0">
              <FileText className="w-4 h-4 opacity-70" />
            </div>
            <p className="text-xs font-medium text-veyra-text">Sin notas ancladas</p>
            <p className="text-[10px] text-veyra-muted mt-0.5 line-clamp-2">
              Fija tus notas favoritas para tenerlas siempre a mano aquí.
            </p>
            <button
              type="button"
              onClick={onCreateNote}
              className="mt-2 text-[11px] font-medium text-accent hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>Crear nueva nota</span>
            </button>
          </div>
        ) : (
          displayedNotes.map((note) => (
            <div
              key={note.id}
              onClick={() => onSelectNote(note.id)}
              className="group flex items-center justify-between p-2 rounded-lg bg-veyra-elevated/70 border border-veyra-border hover:border-accent/40 hover:bg-veyra-elevated transition-all cursor-pointer min-w-0 gap-2"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <div className="w-6 h-6 rounded-md bg-veyra-card border border-veyra-border flex items-center justify-center text-veyra-subtle group-hover:text-accent transition-colors shrink-0">
                  <FileText className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-medium text-veyra-text truncate group-hover:text-accent transition-colors">
                    {note.title || 'Nota sin título'}
                  </h4>
                </div>
              </div>

              <div className="flex items-center gap-1 text-[10px] text-veyra-muted shrink-0">
                <span className="hidden sm:inline font-mono">
                  {formatRelativeTime(note.updated_at_ms || note.created_at_ms || 0)}
                </span>
                <ChevronRight className="w-3 h-3 text-veyra-subtle group-hover:text-veyra-text transition-colors" />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
