import { useState, useEffect, useCallback } from 'react';
import { localDB, type UserTemplateRecord } from '../../../lib/db/local-db';
import { syncEngine } from '../../../lib/sync/syncEngine';
import { NOTE_TEMPLATES, type NoteTemplate, type TemplateType, type TemplateCategory } from './templatesData';

export const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  academico: 'Académico',
  analisis: 'Análisis',
  organizacion: 'Organización',
  gestion: 'Gestión',
  trabajo: 'Trabajo',
  personal: 'Personal',
};

function formatCustomTemplate(record: UserTemplateRecord): NoteTemplate {
  const categoryKey = (record.category as TemplateCategory) || 'personal';
  const categoryLabel = CATEGORY_LABELS[categoryKey] || 'Personal';

  return {
    id: record.id,
    title: record.title,
    category: categoryKey,
    categoryLabel,
    type: record.type,
    description: record.description || 'Plantilla personalizada guardada por el usuario.',
    iconName: (record.icon_name as any) || (record.type === 'page' ? 'file-text' : 'table'),
    previewHtml: `
      <div class="border border-slate-300 dark:border-zinc-700 rounded p-3 text-[11px] bg-white dark:bg-zinc-900 overflow-hidden max-h-48 overflow-y-auto">
        <div class="font-semibold text-slate-800 dark:text-zinc-200 mb-1">${record.title}</div>
        <div class="text-slate-600 dark:text-zinc-400 prose prose-sm dark:prose-invert">
          ${record.content}
        </div>
      </div>
    `,
    getContent: () => record.content,
    isCustom: true,
  };
}

export function useTemplates(currentUserId?: string) {
  const [customTemplates, setCustomTemplates] = useState<NoteTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadTemplates = useCallback(async () => {
    try {
      if (!currentUserId) {
        setCustomTemplates([]);
        setIsLoading(false);
        return;
      }

      const records = await localDB.note_templates
        .where('user_id')
        .equals(currentUserId)
        .filter((t) => !t.deleted)
        .reverse()
        .sortBy('last_modified_ms');

      const formatted = records.map(formatCustomTemplate);
      setCustomTemplates(formatted);
    } catch (err) {
      console.error('[useTemplates] Error cargando plantillas:', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    let isMounted = true;
    if (!currentUserId) {
      return;
    }

    localDB.note_templates
      .where('user_id')
      .equals(currentUserId)
      .filter((t) => !t.deleted)
      .reverse()
      .sortBy('last_modified_ms')
      .then((records) => {
        if (isMounted) {
          setCustomTemplates(records.map(formatCustomTemplate));
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.error('[useTemplates] Error cargando plantillas:', err);
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [currentUserId]);

  const saveCustomTemplate = useCallback(
    async (params: {
      title: string;
      description?: string;
      category?: TemplateCategory;
      type: TemplateType;
      content: string;
      iconName?: string;
    }) => {
      if (!currentUserId) throw new Error('Usuario no autenticado');

      const now = Date.now();
      const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `tpl_${now}_${Math.random().toString(36).substring(2, 9)}`;

      const newRecord: UserTemplateRecord = {
        id,
        user_id: currentUserId,
        title: params.title.trim() || 'Plantilla sin título',
        description: params.description?.trim() || '',
        category: params.category || 'personal',
        type: params.type,
        content: params.content,
        icon_name: params.iconName || (params.type === 'page' ? 'file-text' : 'table'),
        created_at: new Date(now).toISOString(),
        updated_at: new Date(now).toISOString(),
        last_modified_ms: now,
        deleted: 0,
      };

      await localDB.note_templates.put(newRecord);
      await syncEngine.enqueue('note_templates', 'upsert', id, newRecord, now);

      await loadTemplates();
      return newRecord;
    },
    [currentUserId, loadTemplates]
  );

  const deleteCustomTemplate = useCallback(
    async (templateId: string) => {
      const now = Date.now();
      const existing = await localDB.note_templates.get(templateId);
      if (!existing) return;

      const updated = {
        ...existing,
        deleted: 1,
        last_modified_ms: now,
        updated_at: new Date(now).toISOString(),
      };

      await localDB.note_templates.put(updated);
      await syncEngine.enqueue('note_templates', 'delete', templateId, null, now);

      await loadTemplates();
    },
    [loadTemplates]
  );

  const allTemplates: NoteTemplate[] = [
    ...NOTE_TEMPLATES,
    ...customTemplates,
  ];

  return {
    allTemplates,
    systemTemplates: NOTE_TEMPLATES,
    customTemplates,
    isLoading,
    saveCustomTemplate,
    deleteCustomTemplate,
    reloadTemplates: loadTemplates,
  };
}
