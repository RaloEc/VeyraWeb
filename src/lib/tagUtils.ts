import React from 'react';
import {
  GraduationCap,
  Briefcase,
  BookOpen,
  FileText,
  CheckSquare,
  Layers,
  Hash,
  AlertCircle,
  Lightbulb,
} from 'lucide-react';
import { localDB } from './db/local-db';
import { syncEngine } from './sync/syncEngine';

export const DEFAULT_TAG_SUGGESTIONS = [
  'clase',
  'apuntes',
  'deberes',
  'taller',
  'examen',
  'universidad',
  'trabajo',
  'proyecto',
  'reunion',
  'personal',
  'urgente',
  'ideas',
  'resumen',
];

export function extractHashtags(text: string): string[] {
  if (!text) return [];
  const hashtagRegex = /(?:^|\s)#([\p{L}0-9_-]+)/gu;
  const tags = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = hashtagRegex.exec(text)) !== null) {
    if (match[1]?.trim()) {
      tags.add(match[1].trim().toLowerCase());
    }
  }
  return Array.from(tags);
}

export function normalizeTagSlug(raw: string): string {
  return raw
    .trim()
    .replace(/^#/, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function syncItemTags(
  userId: string | undefined,
  itemType: 'event' | 'reminder' | 'note',
  itemId: string,
  tagNames: string[]
): Promise<void> {
  if (!userId || !itemId) return;

  try {
    const cleanNames = Array.from(
      new Set(
        tagNames
          .map((t) => t.trim().replace(/^#/, ''))
          .filter((t) => t.length > 0)
      )
    );

    const nowMs = Date.now();
    const existingTags = await localDB.tags.where('user_id').equals(userId).toArray();
    const slugToTag = new Map(existingTags.map((t) => [t.slug, t]));

    const desiredTagIds = new Set<string>();

    for (const rawName of cleanNames) {
      const slug = normalizeTagSlug(rawName) || rawName.toLowerCase();
      let tag = slugToTag.get(slug);
      if (!tag) {
        tag = {
          id: crypto.randomUUID(),
          user_id: userId,
          name: rawName.toLowerCase(),
          slug,
          color: '#3B82F6',
          created_at: nowMs,
          updated_at: nowMs,
        };
        slugToTag.set(slug, tag);
        await localDB.tags.put(tag);
        await syncEngine.enqueue('tags', 'upsert', tag.id, tag, nowMs);
      }
      desiredTagIds.add(tag.id);
    }

    const currentItemTags = await localDB.item_tags
      .where('[item_type+item_id+tag_id]')
      .between([itemType, itemId, ''], [itemType, itemId, '\uffff'])
      .toArray();

    const currentTagIds = new Set(currentItemTags.map((it) => it.tag_id));

    for (const tagId of desiredTagIds) {
      if (!currentTagIds.has(tagId)) {
        const row = {
          user_id: userId,
          item_type: itemType,
          item_id: itemId,
          tag_id: tagId,
        };
        await localDB.item_tags.put(row);
        await syncEngine.enqueue(
          'item_tags',
          'upsert',
          `${itemType}:${itemId}:${tagId}`,
          row,
          nowMs
        );
      }
    }

    for (const existing of currentItemTags) {
      if (!desiredTagIds.has(existing.tag_id)) {
        await localDB.item_tags.delete([existing.item_type, existing.item_id, existing.tag_id]);
        await syncEngine.enqueue(
          'item_tags',
          'delete',
          `${existing.item_type}:${existing.item_id}:${existing.tag_id}`,
          {
            item_type: existing.item_type,
            item_id: existing.item_id,
            tag_id: existing.tag_id,
          },
          nowMs
        );
      }
    }
  } catch (err) {
    console.warn('[tagUtils] Error syncing item tags:', err);
  }
}

export function getTagIcon(tag: string): React.ComponentType<{ className?: string }> {
  const lower = tag.toLowerCase().replace(/^#/, '');
  if (lower === 'universidad' || lower.includes('facultad') || lower === 'uni' || lower.includes('campus')) {
    return GraduationCap;
  }
  if (lower === 'clase' || lower === 'clases' || lower.includes('materia') || lower.includes('curso') || lower.includes('catedra')) {
    return BookOpen;
  }
  if (lower === 'trabajo' || lower === 'travajo' || lower.includes('work') || lower.includes('laboral') || lower.includes('oficina') || lower.includes('empleo') || lower.includes('reunion') || lower.includes('meeting')) {
    return Briefcase;
  }
  if (lower.includes('deber') || lower.includes('tarea') || lower.includes('ejercicio')) {
    return CheckSquare;
  }
  if (lower.includes('apunte') || lower.includes('resumen') || lower.includes('taller')) {
    return FileText;
  }
  if (lower.includes('proyecto')) {
    return Layers;
  }
  if (lower.includes('urgente') || lower.includes('examen')) {
    return AlertCircle;
  }
  if (lower.includes('idea')) {
    return Lightbulb;
  }
  return Hash;
}
