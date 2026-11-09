import React, { useState } from 'react';
import { Folder as FolderIcon, Plus, Layers } from 'lucide-react';
import type { Folder } from '../../types/notes';
import { cn } from '../../lib/utils';
import { Modal } from '../../components/common/Modal';
import { Input } from '../../components/common/Input';
import { Button } from '../../components/common/Button';

export interface FolderTreeProps {
  folders: Folder[];
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  onCreateFolder: (name: string, color?: string) => Promise<void>;
  totalNotesCount: number;
}

export const FolderTree: React.FC<FolderTreeProps> = ({
  folders,
  selectedFolderId,
  onSelectFolder,
  onCreateFolder,
  totalNotesCount,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [selectedColor, setSelectedColor] = useState('#60A5FA');
  const [loading, setLoading] = useState(false);

  const colors = ['#60A5FA', '#A78BFA', '#F87171', '#34D399', '#FBBF24', '#F472B6'];

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    try {
      setLoading(true);
      await onCreateFolder(newFolderName.trim(), selectedColor);
      setNewFolderName('');
      setIsModalOpen(false);
    } catch (err) {
      console.error('[FolderTree] Failed to create folder:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-40 sm:w-44 bg-veyra-card/30 border-r border-veyra-border p-2 flex flex-col justify-between shrink-0 h-full select-none">
      <div className="space-y-0.5">
        <div className="flex items-center justify-between px-2 py-1.5 mb-1">
          <span className="text-[11px] font-medium text-veyra-subtle uppercase tracking-wider">
            Carpetas
          </span>
          <button
            onClick={() => setIsModalOpen(true)}
            className="p-1 rounded text-veyra-muted hover:text-veyra-text hover:bg-white/5 transition-colors cursor-pointer"
            title="Nueva carpeta"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* All Notes Button */}
        <button
          onClick={() => onSelectFolder(null)}
          className={cn(
            'w-full flex items-center justify-between px-2 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer',
            selectedFolderId === null
              ? 'bg-white/5 text-accent font-semibold'
              : 'text-veyra-muted hover:text-veyra-text hover:bg-white/[0.02]'
          )}
        >
          <div className="flex items-center gap-2 truncate">
            <Layers className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Todas</span>
          </div>
          <span className="text-[11px] text-veyra-subtle">{totalNotesCount}</span>
        </button>

        {/* Folders List (borderless items, active with subtle background) */}
        {folders.map((folder) => {
          const isSelected = selectedFolderId === folder.id;
          return (
            <button
              key={folder.id}
              onClick={() => onSelectFolder(folder.id)}
              className={cn(
                'w-full flex items-center justify-between px-2 py-1.5 rounded-md text-xs font-medium transition-colors truncate cursor-pointer',
                isSelected
                  ? 'bg-white/5 text-accent font-semibold'
                  : 'text-veyra-muted hover:text-veyra-text hover:bg-white/[0.02]'
              )}
            >
              <div className="flex items-center gap-2 truncate">
                <FolderIcon
                  className="w-3.5 h-3.5 shrink-0"
                  style={{ color: folder.color || 'var(--accent-primary)' }}
                />
                <span className="truncate">{folder.name}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Modal for new folder */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Nueva Carpeta"
        maxWidth="sm"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="Nombre de la carpeta"
            placeholder="ej. Proyectos, Trabajo..."
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            required
            autoFocus
          />

          <div>
            <label className="block text-xs font-medium text-veyra-muted mb-2">
              Color de identificación
            </label>
            <div className="flex items-center gap-2">
              {colors.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setSelectedColor(c)}
                  className={cn(
                    'w-6 h-6 rounded-full transition-transform cursor-pointer',
                    selectedColor === c && 'scale-110 ring-2 ring-offset-2 ring-offset-veyra-card ring-accent'
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" size="sm" loading={loading}>
              Crear
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
