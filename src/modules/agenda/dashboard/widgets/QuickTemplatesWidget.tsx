import React, { useMemo, useState } from 'react';
import {
  FileText,
  GraduationCap,
  ClipboardList,
  Columns3,
  Calendar,
  FlaskConical,
  CheckSquare,
  Table,
  Loader2,
  Plus,
  LayoutTemplate,
} from 'lucide-react';
import type { NoteTemplate } from '../../../notes/templates/templatesData';
import { Modal } from '../../../../components/common/Modal';
import { WidgetCard } from '../WidgetCard';

interface QuickTemplatesWidgetProps {
  templates: NoteTemplate[];
  onCreateFromTemplate: (template: NoteTemplate) => Promise<void> | void;
}

function renderTemplateIcon(iconName: NoteTemplate['iconName']) {
  const cls = 'w-4 h-4 text-veyra-muted shrink-0';
  switch (iconName) {
    case 'graduation-cap':
      return <GraduationCap className={cls} />;
    case 'clipboard-list':
      return <ClipboardList className={cls} />;
    case 'columns-3':
      return <Columns3 className={cls} />;
    case 'calendar':
      return <Calendar className={cls} />;
    case 'flask-conical':
      return <FlaskConical className={cls} />;
    case 'check-square':
      return <CheckSquare className={cls} />;
    case 'table':
      return <Table className={cls} />;
    case 'file-text':
    default:
      return <FileText className={cls} />;
  }
}

export const QuickTemplatesWidget: React.FC<QuickTemplatesWidgetProps> = ({
  templates,
  onCreateFromTemplate,
}) => {
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [isAllModalOpen, setIsAllModalOpen] = useState(false);

  const featuredTemplates = useMemo(() => templates.slice(0, 4), [templates]);

  const handleUseTemplate = async (tpl: NoteTemplate) => {
    if (creatingId) return;
    setCreatingId(tpl.id);
    try {
      await onCreateFromTemplate(tpl);
      setIsAllModalOpen(false);
    } finally {
      setCreatingId(null);
    }
  };

  return (
    <>
      <WidgetCard
        title="Empezar con plantilla"
        icon={<LayoutTemplate className="w-3.5 h-3.5" />}
        iconClassName="text-veyra-muted"
        headerRight={
          templates.length > 4 ? (
            <button
              type="button"
              onClick={() => setIsAllModalOpen(true)}
              className="inline-flex items-center gap-1 text-xs font-medium text-veyra-muted hover:text-accent transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Ver todas</span>
            </button>
          ) : null
        }
      >
        {featuredTemplates.length === 0 ? (
          <p className="text-xs text-veyra-muted py-2">No hay plantillas disponibles.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 xl:gap-4">
            {featuredTemplates.map((tpl) => {
              const isBusy = creatingId === tpl.id;
              return (
                <button
                  key={tpl.id}
                  type="button"
                  disabled={Boolean(creatingId)}
                  onClick={() => handleUseTemplate(tpl)}
                  title={tpl.description}
                  className="group text-left flex items-center justify-between gap-3 py-3 xl:py-3.5 px-4 rounded-xl bg-veyra-card/55 hover:bg-veyra-card transition-colors cursor-pointer disabled:opacity-50"
                >
                  <span className="flex items-center gap-3 min-w-0">
                    {isBusy ? (
                      <Loader2 className="w-4 h-4 text-accent animate-spin shrink-0" />
                    ) : (
                      renderTemplateIcon(tpl.iconName)
                    )}
                    <span className="text-[13px] font-medium text-veyra-text group-hover:text-accent transition-colors leading-snug">
                      {tpl.title}
                    </span>
                  </span>

                  {tpl.categoryLabel && (
                    <span className="text-xs text-veyra-muted shrink-0">
                      {tpl.categoryLabel}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </WidgetCard>

      <Modal
        isOpen={isAllModalOpen}
        onClose={() => setIsAllModalOpen(false)}
        title="Plantillas de notas"
        description="Elige una estructura para crear una nueva nota"
        maxWidth="lg"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
          {templates.map((tpl) => {
            const isBusy = creatingId === tpl.id;
            return (
              <button
                key={tpl.id}
                type="button"
                disabled={Boolean(creatingId)}
                onClick={() => handleUseTemplate(tpl)}
                className="text-left p-3 rounded-xl bg-veyra-elevated/50 hover:bg-veyra-hover transition-colors cursor-pointer flex items-start gap-2.5 disabled:opacity-50"
              >
                <div className="p-2 rounded-lg bg-veyra-card shrink-0">
                  {isBusy ? (
                    <Loader2 className="w-4 h-4 text-accent animate-spin" />
                  ) : (
                    renderTemplateIcon(tpl.iconName)
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-veyra-text leading-snug">{tpl.title}</p>
                  <p className="text-[11px] text-veyra-muted line-clamp-2 mt-0.5">
                    {tpl.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </Modal>
    </>
  );
};
