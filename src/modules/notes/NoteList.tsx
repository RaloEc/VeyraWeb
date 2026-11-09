import React, { useState } from 'react';
import { Plus, Search, Trash2, FileText, Pin } from 'lucide-react';
import type { Note } from '../../types/notes';
import { formatDate, cn } from '../../lib/utils';

export interface NoteListProps {
  notes: Note[];
  selectedNoteId: string | null;
  onSelectNote: (id: string) => void;
  onCreateNote: () => void;
  onDeleteNote: (id: string) => void;
}

export const NoteList: React.FC<NoteListProps> = ({
  notes,
  selectedNoteId,
  onSelectNote,
  onCreateNote,
  onDeleteNote,
}) => {
  const [search, setSearch] = useState('');

  const filteredNotes = notes.filter((n) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (n.title && n.title.toLowerCase().includes(q)) ||
      (n.preview_text && n.preview_text.toLowerCase().includes(q))
    );
  });

  return (
    <div className="w-60 sm:w-64 bg-veyra-card/50 border-r border-veyra-border flex flex-col h-full shrink-0 select-none">
      {/* Top: Header & Search */}
      <div className="border-b border-veyra-border">
        <div className="flex items-center justify-between px-3 pt-3 pb-2">
          <span className="text-xs font-medium text-veyra-muted">
            Notas ({filteredNotes.length})
          </span>
          <button
            onClick={onCreateNote}
            className="flex items-center gap-1 text-xs font-medium text-accent hover:opacity-80 transition-opacity cursor-pointer p-0.5 rounded"
            title="Crear nueva nota"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nota</span>
          </button>
        </div>

        <div className="px-3 pb-2.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-veyra-subtle absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-veyra-elevated text-veyra-text placeholder:text-veyra-subtle rounded-md pl-8 pr-2.5 py-1 text-xs border-0 outline-none focus:ring-0 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Flat Notes List */}
      <div className="flex-1 overflow-y-auto">
        {filteredNotes.length === 0 ? (
          <div className="p-6 text-center text-xs text-veyra-muted">
            <FileText className="w-6 h-6 text-veyra-subtle mx-auto mb-2 opacity-40" />
            <p>No hay notas</p>
          </div>
        ) : (
          filteredNotes.map((note) => {
            const isSelected = selectedNoteId === note.id;

            return (
              <div
                key={note.id}
                onClick={() => onSelectNote(note.id)}
                className={cn(
                  'group relative px-3 py-2.5 border-b border-veyra-border text-left cursor-pointer transition-colors',
                  isSelected
                    ? 'bg-white/5 dark:bg-white/5'
                    : 'hover:bg-white/[0.02] dark:hover:bg-white/[0.02]'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <h4
                    className={cn(
                      'text-xs truncate flex-1',
                      isSelected ? 'text-veyra-text font-semibold' : 'text-veyra-text font-medium'
                    )}
                  >
                    {note.title || 'Sin título'}
                  </h4>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {note.is_pinned === 1 && (
                      <Pin className="w-3 h-3 text-accent rotate-45" />
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteNote(note.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 text-veyra-muted hover:text-red-400 transition-opacity"
                      title="Eliminar"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                    <span className="text-[12px] text-veyra-subtle">
                      {formatDate(note.updated_at_ms || note.created_at_ms)}
                    </span>
                  </div>
                </div>

                <p className="text-[12px] text-veyra-muted truncate mt-0.5">
                  {note.preview_text || 'Sin contenido adicional'}
                </p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
