import React, { useMemo, useState } from 'react';
import { FileText, Pin, Users, Plus } from 'lucide-react';
import { cn } from '../../../../lib/utils';
import type { Note, Folder } from '../../../../types/notes';
import type { SharedNoteEntry } from '../useSharedNotes';
import { WidgetCard } from '../WidgetCard';

type NotesTab = 'recent' | 'favorites' | 'shared';

interface UnifiedNotesWidgetProps {
  notes: Note[];
  sharedNotes: SharedNoteEntry[];
  folders: Folder[];
  onSelectNote: (noteId: string) => void;
  onCreateNote: () => void;
}

function formatRelativeTime(ms: number): string {
  if (!ms) return '';
  const diffSec = Math.floor((Date.now() - ms) / 1000);
  if (diffSec < 60) return 'ahora';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `hace ${diffMin}m`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `hace ${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `hace ${diffDays}d`;
  const d = new Date(ms);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function getCleanExtract(raw?: string | null): string {
  if (!raw) return 'Sin contenido aún';
  const trimmed = raw.trim();
  if (!trimmed || /^(https?:\/\/|www\.)/i.test(trimmed)) {
    return 'Sin contenido aún';
  }
  return trimmed;
}

export const UnifiedNotesWidget: React.FC<UnifiedNotesWidgetProps> = ({
  notes,
  sharedNotes,
  folders,
  onSelectNote,
  onCreateNote,
}) => {
  const [activeTab, setActiveTab] = useState<NotesTab>('recent');

  const folderMap = useMemo(() => {
    const map = new Map<string, Folder>();
    folders.forEach((f) => map.set(f.id, f));
    return map;
  }, [folders]);

  const recentNotes = useMemo(
    () =>
      notes
        .filter((n) => n.deleted !== 1)
        .sort(
          (a, b) =>
            (b.updated_at_ms || b.created_at_ms || 0) -
            (a.updated_at_ms || a.created_at_ms || 0)
        )
        .slice(0, 4),
    [notes]
  );

  const favoriteNotes = useMemo(
    () =>
      notes
        .filter((n) => n.deleted !== 1 && n.is_pinned === 1)
        .sort(
          (a, b) =>
            (b.updated_at_ms || b.created_at_ms || 0) -
            (a.updated_at_ms || a.created_at_ms || 0)
        )
        .slice(0, 4),
    [notes]
  );

  const displayedShared = useMemo(() => sharedNotes.slice(0, 4), [sharedNotes]);

  const tabs: Array<{ id: NotesTab; label: string }> = [
    { id: 'recent', label: 'Recientes' },
    { id: 'favorites', label: 'Favoritas' },
    { id: 'shared', label: 'Compartidas' },
  ];

  const renderNoteCard = (note: Note, metaSuffix?: string) => {
    const timeLabel = formatRelativeTime(note.updated_at_ms || note.created_at_ms || 0);
    const folder = note.folder_id ? folderMap.get(note.folder_id) : undefined;
    const footerLabel = metaSuffix || folder?.name || '';
    const extract = getCleanExtract(note.preview_text);

    return (
      <button
        key={note.id}
        type="button"
        onClick={() => onSelectNote(note.id)}
        className="group text-left flex flex-col justify-between p-4 xl:p-5 rounded-2xl bg-veyra-card/65 hover:bg-veyra-card transition-colors cursor-pointer min-h-[120px] xl:min-h-[136px] min-w-0 gap-2.5"
      >
        {/* Top: Icon + Title (max 2 lines) */}
        <div className="flex items-start gap-2.5 min-w-0">
          <FileText className="w-4 h-4 text-veyra-muted group-hover:text-accent transition-colors shrink-0 mt-0.5" />
          <h4 className="text-[13.5px] font-medium text-veyra-text group-hover:text-accent transition-colors line-clamp-2 leading-snug">
            {note.title || 'Nota sin título'}
          </h4>
        </div>

        {/* Center: Clean 1-line extract */}
        <p className="text-xs text-veyra-muted line-clamp-1 leading-relaxed">
          {extract}
        </p>

        {/* Footer: Subtle folder/tag on left + relative time on right */}
        <div className="flex items-center justify-between gap-2 pt-1 text-[11px] text-veyra-muted min-w-0">
          {footerLabel ? (
            <span className="px-2 py-0.5 rounded-md bg-veyra-elevated/60 text-veyra-subtle truncate max-w-[120px]">
              {footerLabel}
            </span>
          ) : (
            <span />
          )}
          <span className="shrink-0 font-mono text-veyra-muted">{timeLabel}</span>
        </div>
      </button>
    );
  };

  return (
    <WidgetCard
      title="Tus Notas"
      icon={<FileText className="w-3.5 h-3.5" />}
      iconClassName="text-veyra-muted"
      headerRight={
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-veyra-card/60 text-[11px]">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer whitespace-nowrap',
                    isActive
                      ? 'bg-veyra-elevated text-accent font-semibold'
                      : 'text-veyra-muted hover:text-veyra-text'
                  )}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onCreateNote}
            title="Nueva nota"
            className="p-1.5 rounded-lg text-veyra-muted hover:text-veyra-text hover:bg-veyra-card/70 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      }
    >
      {activeTab === 'recent' && (
        recentNotes.length === 0 ? (
          <div className="py-8 rounded-2xl bg-veyra-card/40 flex flex-col items-center justify-center text-center">
            <FileText className="w-5 h-5 text-veyra-subtle mb-2 opacity-70" />
            <p className="text-xs font-medium text-veyra-text">Aún no tienes notas</p>
            <button
              type="button"
              onClick={onCreateNote}
              className="mt-2 text-xs font-medium text-accent hover:underline cursor-pointer"
            >
              + Crear tu primera nota
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 xl:gap-4">
            {recentNotes.map((note) => renderNoteCard(note))}
          </div>
        )
      )}

      {activeTab === 'favorites' && (
        favoriteNotes.length === 0 ? (
          <div className="py-8 rounded-2xl bg-veyra-card/40 flex flex-col items-center justify-center text-center">
            <Pin className="w-5 h-5 text-veyra-subtle mb-2 opacity-70" />
            <p className="text-xs font-medium text-veyra-text">Sin notas favoritas</p>
            <p className="text-[11px] text-veyra-muted mt-0.5">
              Fija notas para acceder a ellas rápidamente aquí.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 xl:gap-4">
            {favoriteNotes.map((note) => renderNoteCard(note))}
          </div>
        )
      )}

      {activeTab === 'shared' && (
        displayedShared.length === 0 ? (
          <div className="py-8 rounded-2xl bg-veyra-card/40 flex flex-col items-center justify-center text-center">
            <Users className="w-5 h-5 text-veyra-subtle mb-2 opacity-70" />
            <p className="text-xs font-medium text-veyra-text">Sin notas compartidas</p>
            <p className="text-[11px] text-veyra-muted mt-0.5">
              Las notas en colaboración aparecerán aquí.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 xl:gap-4">
            {displayedShared.map(({ note, direction, role, collaboratorCount }) => {
              const roleText =
                direction === 'shared_with_me'
                  ? role === 'viewer'
                    ? 'Lector'
                    : 'Editor'
                  : `${collaboratorCount || 1} colab.`;
              return renderNoteCard(note, roleText);
            })}
          </div>
        )
      )}
    </WidgetCard>
  );
};
