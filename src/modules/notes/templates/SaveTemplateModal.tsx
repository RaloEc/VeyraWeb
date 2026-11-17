import React, { useState } from 'react';
import { X, BookmarkPlus, Table, Layers, Check } from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { TemplateCategory, TemplateType } from './templatesData';
import { CATEGORY_LABELS } from './useTemplates';

export interface SaveTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    title: string;
    description: string;
    category: TemplateCategory;
    type: TemplateType;
    content: string;
  }) => Promise<void>;
  defaultContent: string;
  defaultType?: TemplateType;
  defaultTitle?: string;
}

const CATEGORIES: TemplateCategory[] = [
  'personal',
  'academico',
  'trabajo',
  'organizacion',
  'gestion',
  'analisis',
];

export const SaveTemplateModal: React.FC<SaveTemplateModalProps> = ({
  isOpen,
  onClose,
  onSave,
  defaultContent,
  defaultType = 'block',
  defaultTitle = '',
}) => {
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState('');
  const [type, setType] = useState<TemplateType>(defaultType);
  const [category, setCategory] = useState<TemplateCategory>('personal');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    setError(null);
    setIsSubmitting(false);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Por favor ingresa un título para la plantilla');
      return;
    }
    if (!defaultContent.trim()) {
      setError('No hay contenido para guardar como plantilla');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await onSave({
        title: title.trim(),
        description: description.trim(),
        category,
        type,
        content: defaultContent,
      });
      onClose();
    } catch (err: any) {
      console.error('Error guardando plantilla:', err);
      setError(err?.message || 'Error al guardar la plantilla');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5">
      <div
        className="fixed inset-0 bg-black/60 dark:bg-black/75 backdrop-blur-sm transition-opacity duration-200 animate-in fade-in"
        onClick={handleClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-lg bg-white dark:bg-[#18181b] border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-2xl z-10 flex flex-col overflow-hidden transition-all duration-200 animate-in fade-in zoom-in-95"
      >
        {/* Cabecera */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between bg-slate-50/70 dark:bg-zinc-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent">
              <BookmarkPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-zinc-100 tracking-tight">
                Guardar como plantilla
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Se guardará en tu catálogo y sincronizará con la app móvil
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-slate-400 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-200 p-1.5 rounded-lg hover:bg-slate-200/60 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}

          {/* Título */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
              Nombre de la plantilla <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej. Mi tabla de calificaciones, Encabezado de proyecto..."
              className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 transition-all"
              autoFocus
            />
          </div>

          {/* Selector de Tipo (Bloque vs Página) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
              Tipo de plantilla
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setType('block')}
                className={cn(
                  'flex items-center gap-2 p-2.5 rounded-xl border text-xs font-medium transition-all text-left cursor-pointer',
                  type === 'block'
                    ? 'border-accent/60 bg-accent/10 text-accent shadow-sm'
                    : 'border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-800'
                )}
              >
                <Table className="w-4 h-4 shrink-0" />
                <div>
                  <div className="font-semibold">Bloque o tabla</div>
                  <div className="text-[10px] opacity-75 font-normal">Se inserta dentro de cualquier nota</div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setType('page')}
                className={cn(
                  'flex items-center gap-2 p-2.5 rounded-xl border text-xs font-medium transition-all text-left cursor-pointer',
                  type === 'page'
                    ? 'border-accent/60 bg-accent/10 text-accent shadow-sm'
                    : 'border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-800'
                )}
              >
                <Layers className="w-4 h-4 shrink-0" />
                <div>
                  <div className="font-semibold">Página completa</div>
                  <div className="text-[10px] opacity-75 font-normal">Estructura para crear notas nuevas</div>
                </div>
              </button>
            </div>
          </div>

          {/* Categoría */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
              Categoría
            </label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-xs font-medium border transition-all cursor-pointer',
                    category === cat
                      ? 'bg-accent/15 border-accent text-accent font-semibold'
                      : 'bg-slate-50 dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800'
                  )}
                >
                  {CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>
          </div>

          {/* Descripción opcional */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
              Descripción corta (opcional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Breve detalle sobre cuándo usar esta plantilla..."
              className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 transition-all"
            />
          </div>

          {/* Botones de acción */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200 dark:border-zinc-800">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-medium bg-accent text-white hover:bg-accent/90 shadow-sm transition-all duration-150 cursor-pointer disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>{isSubmitting ? 'Guardando...' : 'Guardar plantilla'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
