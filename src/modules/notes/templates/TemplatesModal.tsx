import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Search,
  X,
  LayoutTemplate,
  GraduationCap,
  Columns3,
  ClipboardList,
  CheckSquare,
  FileText,
  FlaskConical,
  Calendar,
  Table,
  Layers,
  ArrowRight,
  PlusCircle,
  RefreshCw,
  BookmarkPlus,
  Trash2,
  Sparkles,
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { NOTE_TEMPLATES, type NoteTemplate, type TemplateType } from './templatesData';

export interface TemplatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate: (template: NoteTemplate, mode: 'insert' | 'replace' | 'append') => void;
  isDocumentEmpty: boolean;
  templates?: NoteTemplate[];
  onOpenSaveModal?: () => void;
  onDeleteCustomTemplate?: (id: string) => Promise<void>;
}

function normalizeSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export const TemplatesModal: React.FC<TemplatesModalProps> = ({
  isOpen,
  onClose,
  onSelectTemplate,
  isDocumentEmpty,
  templates = NOTE_TEMPLATES,
  onOpenSaveModal,
  onDeleteCustomTemplate,
}) => {
  const [activeTab, setActiveTab] = useState<TemplateType>('block');
  const [activeSourceFilter, setActiveSourceFilter] = useState<'all' | 'system' | 'custom'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('block-academic-header');

  // Filtrado optimizado por pestaña, tipo de fuente y texto de búsqueda
  const filteredTemplates = useMemo(() => {
    const q = normalizeSearch(searchQuery.trim());
    return templates.filter((tpl) => {
      if (tpl.type !== activeTab) return false;

      if (activeSourceFilter === 'system' && tpl.isCustom) return false;
      if (activeSourceFilter === 'custom' && !tpl.isCustom) return false;

      if (!q) return true;
      const titleNorm = normalizeSearch(tpl.title);
      const descNorm = normalizeSearch(tpl.description);
      const catNorm = normalizeSearch(tpl.categoryLabel);
      return titleNorm.includes(q) || descNorm.includes(q) || catNorm.includes(q);
    });
  }, [templates, activeTab, activeSourceFilter, searchQuery]);

  // Selección derivada pura sin setState en useEffect
  const selectedTemplate = useMemo(() => {
    return (
      filteredTemplates.find((t) => t.id === selectedTemplateId) ||
      filteredTemplates[0] ||
      null
    );
  }, [filteredTemplates, selectedTemplateId]);

  const handleClose = useCallback(() => {
    setSearchQuery('');
    onClose();
  }, [onClose]);

  // Atajos de teclado (Escape para salir)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  const renderIcon = useCallback((iconName: NoteTemplate['iconName'], className: string) => {
    switch (iconName) {
      case 'graduation-cap':
        return <GraduationCap className={className} />;
      case 'columns-3':
        return <Columns3 className={className} />;
      case 'clipboard-list':
        return <ClipboardList className={className} />;
      case 'check-square':
        return <CheckSquare className={className} />;
      case 'file-text':
        return <FileText className={className} />;
      case 'flask-conical':
        return <FlaskConical className={className} />;
      case 'calendar':
        return <Calendar className={className} />;
      case 'table':
      default:
        return <Table className={className} />;
    }
  }, []);

  const customCount = useMemo(() => templates.filter((t) => t.isCustom).length, [templates]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5">
      {/* Fondo con desenfoque suave */}
      <div
        className="fixed inset-0 bg-black/60 dark:bg-black/75 backdrop-blur-sm transition-opacity duration-200 animate-in fade-in"
        onClick={handleClose}
      />

      {/* Contenedor principal del modal */}
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-4xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-2xl z-10 flex flex-col max-h-[88vh] overflow-hidden transition-all duration-200 animate-in fade-in zoom-in-95"
      >
        {/* Cabecera del modal */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between shrink-0 bg-slate-50/70 dark:bg-zinc-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent">
              <LayoutTemplate className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-zinc-100 tracking-tight">
                Catálogo de plantillas
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Selecciona una tabla estructurada, documento completo o crea tus propios modelos
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onOpenSaveModal && (
              <button
                type="button"
                onClick={() => {
                  handleClose();
                  onOpenSaveModal();
                }}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-accent text-white hover:bg-accent/90 shadow-sm transition-all cursor-pointer"
              >
                <BookmarkPlus className="w-3.5 h-3.5" />
                <span>+ Guardar actual como plantilla</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleClose}
              className="text-slate-400 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-200 p-1.5 rounded-lg hover:bg-slate-200/60 dark:hover:bg-zinc-800 transition-colors"
              title="Cerrar (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Barra de control: Pestañas + Filtros + Buscador */}
        <div className="px-5 py-3 border-b border-slate-200 dark:border-zinc-800 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between shrink-0 bg-white dark:bg-[#18181b]">
          {/* Tabs principales (Bloques vs Páginas) */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
            <div className="inline-flex p-1 bg-slate-100 dark:bg-zinc-900/90 rounded-xl border border-slate-200/80 dark:border-zinc-800 shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab('block')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150',
                  activeTab === 'block'
                    ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-zinc-100 shadow-sm'
                    : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                )}
              >
                <Table className="w-3.5 h-3.5" />
                <span>Bloques y tablas</span>
                <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 dark:bg-zinc-700 text-slate-700 dark:text-zinc-300">
                  {templates.filter((t) => t.type === 'block').length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('page')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150',
                  activeTab === 'page'
                    ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-zinc-100 shadow-sm'
                    : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                )}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Páginas completas</span>
                <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 dark:bg-zinc-700 text-slate-700 dark:text-zinc-300">
                  {templates.filter((t) => t.type === 'page').length}
                </span>
              </button>
            </div>

            {/* Sub-filtro: Todas / Prediseñadas / Mis plantillas */}
            {customCount > 0 && (
              <div className="inline-flex p-0.5 bg-slate-100 dark:bg-zinc-900 rounded-lg border border-slate-200/60 dark:border-zinc-800 shrink-0 text-[11px]">
                <button
                  type="button"
                  onClick={() => setActiveSourceFilter('all')}
                  className={cn(
                    'px-2 py-1 rounded-md transition-all font-medium',
                    activeSourceFilter === 'all'
                      ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-zinc-100 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-zinc-100'
                  )}
                >
                  Todas
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSourceFilter('system')}
                  className={cn(
                    'px-2 py-1 rounded-md transition-all font-medium',
                    activeSourceFilter === 'system'
                      ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-zinc-100 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-zinc-100'
                  )}
                >
                  Sistema
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSourceFilter('custom')}
                  className={cn(
                    'px-2 py-1 rounded-md transition-all font-medium flex items-center gap-1',
                    activeSourceFilter === 'custom'
                      ? 'bg-white dark:bg-zinc-800 text-accent font-semibold shadow-xs'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-zinc-100'
                  )}
                >
                  <Sparkles className="w-3 h-3 text-accent" />
                  <span>Mis plantillas ({customCount})</span>
                </button>
              </div>
            )}
          </div>

          {/* Buscador */}
          <div className="relative w-full sm:w-60 shrink-0">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar plantilla..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Cuerpo del catálogo: División en dos columnas */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-12 min-h-0 overflow-hidden">
          {/* Columna Izquierda: Lista de Plantillas */}
          <div className="md:col-span-5 border-r border-slate-200 dark:border-zinc-800 overflow-y-auto p-3 space-y-2 bg-slate-50/40 dark:bg-zinc-900/30">
            {filteredTemplates.length === 0 ? (
              <div className="text-center py-12 px-4 text-slate-400 dark:text-zinc-500 text-xs">
                No se encontraron plantillas que coincidan con la búsqueda.
              </div>
            ) : (
              filteredTemplates.map((template) => {
                const isSelected = template.id === selectedTemplateId;
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => setSelectedTemplateId(template.id)}
                    className={cn(
                      'w-full text-left p-3 rounded-xl border transition-all duration-150 flex items-start gap-3 group cursor-pointer relative',
                      isSelected
                        ? 'bg-white dark:bg-zinc-800/90 border-accent/60 shadow-sm ring-1 ring-accent/30'
                        : 'bg-white/70 dark:bg-zinc-900/50 border-slate-200/80 dark:border-zinc-800 hover:bg-white dark:hover:bg-zinc-800/60 hover:border-slate-300 dark:hover:border-zinc-700'
                    )}
                  >
                    <div
                      className={cn(
                        'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border transition-colors',
                        isSelected
                          ? 'bg-accent/15 border-accent/40 text-accent'
                          : 'bg-slate-100 dark:bg-zinc-800 border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-400 group-hover:text-slate-900 dark:group-hover:text-zinc-200'
                      )}
                    >
                      {renderIcon(template.iconName, 'w-4 h-4')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span
                          className={cn(
                            'text-xs font-semibold truncate',
                            isSelected
                              ? 'text-slate-900 dark:text-zinc-100'
                              : 'text-slate-700 dark:text-zinc-300'
                          )}
                        >
                          {template.title}
                        </span>
                        {template.isCustom && (
                          <span className="text-[9px] font-semibold px-1.5 py-0.2 rounded bg-accent/15 text-accent border border-accent/30 shrink-0">
                            Propia
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                        {template.description}
                      </p>
                      <div className="mt-2 flex items-center justify-between gap-1.5">
                        <span className="text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 border border-slate-200/60 dark:border-zinc-700/60">
                          {template.categoryLabel}
                        </span>
                        {template.isCustom && onDeleteCustomTemplate && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`¿Eliminar la plantilla "${template.title}"?`)) {
                                onDeleteCustomTemplate(template.id);
                              }
                            }}
                            className="text-slate-400 hover:text-rose-500 p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                            title="Eliminar esta plantilla personalizada"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Columna Derecha: Previsualización en Vivo y Botones de Inserción */}
          <div className="md:col-span-7 flex flex-col min-h-0 bg-white dark:bg-[#18181b]">
            {selectedTemplate ? (
              <>
                {/* Cabecera de la plantilla seleccionada */}
                <div className="p-4 border-b border-slate-200 dark:border-zinc-800 flex items-start justify-between gap-3 bg-slate-50/50 dark:bg-zinc-900/40">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/30">
                        {selectedTemplate.categoryLabel}
                      </span>
                      {selectedTemplate.isCustom ? (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                          Plantilla personalizada
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400 dark:text-zinc-500">
                          {selectedTemplate.type === 'block' ? 'Bloque individual' : 'Página estructurada'}
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-100">
                      {selectedTemplate.title}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                      {selectedTemplate.description}
                    </p>
                  </div>
                </div>

                {/* Área de Previsualización */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-5 min-h-0 bg-slate-100/50 dark:bg-zinc-950/40">
                  <div className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                    <span>Vista previa del contenido</span>
                    <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-normal normal-case">
                      Los campos se adaptarán a la nota
                    </span>
                  </div>

                  <div className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-sm transition-all overflow-x-auto">
                    <div
                      dangerouslySetInnerHTML={{ __html: selectedTemplate.previewHtml }}
                      className="pointer-events-none select-none text-slate-800 dark:text-zinc-200"
                    />
                  </div>
                </div>

                {/* Acciones de Inserción */}
                <div className="p-4 border-t border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#18181b] flex flex-wrap items-center justify-end gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    Cancelar
                  </button>

                  {selectedTemplate.type === 'block' ? (
                    <button
                      type="button"
                      onClick={() => onSelectTemplate(selectedTemplate, 'insert')}
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-medium bg-accent text-white hover:bg-accent/90 shadow-sm transition-all duration-150 cursor-pointer"
                    >
                      <PlusCircle className="w-4 h-4" />
                      <span>Insertar en la nota</span>
                    </button>
                  ) : isDocumentEmpty ? (
                    <button
                      type="button"
                      onClick={() => onSelectTemplate(selectedTemplate, 'replace')}
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-medium bg-accent text-white hover:bg-accent/90 shadow-sm transition-all duration-150 cursor-pointer"
                    >
                      <ArrowRight className="w-4 h-4" />
                      <span>Aplicar a la página</span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onSelectTemplate(selectedTemplate, 'append')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 hover:bg-slate-200 dark:hover:bg-zinc-700 border border-slate-200 dark:border-zinc-700 transition-all cursor-pointer"
                        title="Agrega la plantilla al final de tu contenido actual"
                      >
                        <PlusCircle className="w-3.5 h-3.5" />
                        <span>Añadir al final</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectTemplate(selectedTemplate, 'replace')}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium bg-accent text-white hover:bg-accent/90 shadow-sm transition-all cursor-pointer"
                        title="Reemplaza todo el contenido existente de la nota con esta plantilla"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Reemplazar documento</span>
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center p-6 text-slate-400 dark:text-zinc-500 text-xs">
                Selecciona una plantilla del panel izquierdo para ver sus detalles.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
