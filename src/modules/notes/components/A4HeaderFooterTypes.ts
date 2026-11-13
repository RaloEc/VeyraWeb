import { supabase } from '../../../lib/supabase';
import { uploadHeaderFooterLogo } from '../../../lib/storage-upload';

export type A4HeaderFooterPresetId =
  | 'none'
  | 'blank_1'
  | 'blank_3'
  | 'movimiento'
  | 'retrospectiva'
  | 'segmento'
  | 'apa7'
  | 'page_x_of_y';

export type PageNumberFormat = '1' | 'page_1' | 'page_1_of_n';
export type PageNumberPosition = 'none' | 'left' | 'center' | 'right';

export interface A4HeaderFooterImage {
  id: string;
  src: string;
  x: number;      // Posición X en px dentro de la hoja A4 (0..794)
  y: number;      // Posición Y en px dentro de la zona de encabezado/pie
  width: number;  // Ancho en px
  height: number; // Alto en px
}

export interface A4ZoneSlots {
  left: string;
  center: string;
  right: string;
  logoUrl?: string;
  logoAlign?: 'left' | 'center' | 'right';
  logoHeightPx?: number;
  images?: A4HeaderFooterImage[];
}

export interface A4HeaderFooterConfig {
  headerPreset: A4HeaderFooterPresetId;
  footerPreset: A4HeaderFooterPresetId;

  // Slots para páginas normales (o impares cuando differentOddEven = true)
  headerSlots: A4ZoneSlots;
  footerSlots: A4ZoneSlots;

  // Slots para primera página (cuando differentFirstPage = true)
  firstPageHeaderSlots: A4ZoneSlots;
  firstPageFooterSlots: A4ZoneSlots;

  // Slots para páginas pares (cuando differentOddEven = true)
  evenPageHeaderSlots: A4ZoneSlots;
  evenPageFooterSlots: A4ZoneSlots;

  // Opciones estilo Word
  differentFirstPage: boolean;
  differentOddEven: boolean;
  showDocumentText: boolean;

  // Posición desde el borde en cm (Word default: 1,25 cm)
  headerDistanceCm: number;
  footerDistanceCm: number;

  // Altura personalizada del margen de encabezado/pie en px (por defecto 95px = 2,5 cm)
  customHeaderHeightPx?: number;
  customFooterHeightPx?: number;

  // Color de acento para plantillas (Movimiento, Retrospectiva, Segmento)
  accentColor: string;
}

export const DEFAULT_A4_HEADER_FOOTER_CONFIG: A4HeaderFooterConfig = {
  headerPreset: 'none',
  footerPreset: 'none',
  headerSlots: { left: '', center: '', right: '', images: [] },
  footerSlots: { left: '', center: '', right: '', images: [] },
  firstPageHeaderSlots: { left: '', center: '', right: '', images: [] },
  firstPageFooterSlots: { left: '', center: '', right: '', images: [] },
  evenPageHeaderSlots: { left: '', center: '', right: '', images: [] },
  evenPageFooterSlots: { left: '', center: '', right: '', images: [] },
  differentFirstPage: false,
  differentOddEven: false,
  showDocumentText: true,
  headerDistanceCm: 1.25,
  footerDistanceCm: 1.25,
  customHeaderHeightPx: undefined,
  customFooterHeightPx: undefined,
  accentColor: '#C25E2E',
};

export const A4_HEADER_FOOTER_STORAGE_KEY = 'veyra_a4_header_footer_config';
export const A4_SAVED_TEMPLATES_STORAGE_KEY = 'veyra_a4_hf_saved_templates';

export interface A4HeaderFooterSavedTemplate {
  id: string;
  name: string;
  createdAt: number;
  config: A4HeaderFooterConfig;
}

export function normalizeA4HeaderFooterConfig(parsed: any): A4HeaderFooterConfig {
  if (!parsed || typeof parsed !== 'object') {
    return {
      ...DEFAULT_A4_HEADER_FOOTER_CONFIG,
      headerSlots: { ...DEFAULT_A4_HEADER_FOOTER_CONFIG.headerSlots, images: [] },
      footerSlots: { ...DEFAULT_A4_HEADER_FOOTER_CONFIG.footerSlots, images: [] },
      firstPageHeaderSlots: { ...DEFAULT_A4_HEADER_FOOTER_CONFIG.firstPageHeaderSlots, images: [] },
      firstPageFooterSlots: { ...DEFAULT_A4_HEADER_FOOTER_CONFIG.firstPageFooterSlots, images: [] },
      evenPageHeaderSlots: { ...DEFAULT_A4_HEADER_FOOTER_CONFIG.evenPageHeaderSlots, images: [] },
      evenPageFooterSlots: { ...DEFAULT_A4_HEADER_FOOTER_CONFIG.evenPageFooterSlots, images: [] },
    };
  }
  return {
    ...DEFAULT_A4_HEADER_FOOTER_CONFIG,
    ...parsed,
    headerSlots: {
      ...DEFAULT_A4_HEADER_FOOTER_CONFIG.headerSlots,
      ...(parsed.headerSlots || {}),
      images: Array.isArray(parsed.headerSlots?.images) ? parsed.headerSlots.images : [],
    },
    footerSlots: {
      ...DEFAULT_A4_HEADER_FOOTER_CONFIG.footerSlots,
      ...(parsed.footerSlots || {}),
      images: Array.isArray(parsed.footerSlots?.images) ? parsed.footerSlots.images : [],
    },
    firstPageHeaderSlots: {
      ...DEFAULT_A4_HEADER_FOOTER_CONFIG.firstPageHeaderSlots,
      ...(parsed.firstPageHeaderSlots || {}),
      images: Array.isArray(parsed.firstPageHeaderSlots?.images)
        ? parsed.firstPageHeaderSlots.images
        : [],
    },
    firstPageFooterSlots: {
      ...DEFAULT_A4_HEADER_FOOTER_CONFIG.firstPageFooterSlots,
      ...(parsed.firstPageFooterSlots || {}),
      images: Array.isArray(parsed.firstPageFooterSlots?.images)
        ? parsed.firstPageFooterSlots.images
        : [],
    },
    evenPageHeaderSlots: {
      ...DEFAULT_A4_HEADER_FOOTER_CONFIG.evenPageHeaderSlots,
      ...(parsed.evenPageHeaderSlots || {}),
      images: Array.isArray(parsed.evenPageHeaderSlots?.images)
        ? parsed.evenPageHeaderSlots.images
        : [],
    },
    evenPageFooterSlots: {
      ...DEFAULT_A4_HEADER_FOOTER_CONFIG.evenPageFooterSlots,
      ...(parsed.evenPageFooterSlots || {}),
      images: Array.isArray(parsed.evenPageFooterSlots?.images)
        ? parsed.evenPageFooterSlots.images
        : [],
    },
  };
}

export function loadA4HeaderFooterConfigForNote(
  noteId: string,
  fromNoteMetaOrContent?: any
): A4HeaderFooterConfig {
  if (fromNoteMetaOrContent && typeof fromNoteMetaOrContent === 'object') {
    return normalizeA4HeaderFooterConfig(fromNoteMetaOrContent);
  }
  if (typeof window === 'undefined' || !noteId) {
    return normalizeA4HeaderFooterConfig(null);
  }
  try {
    const raw = localStorage.getItem(`${A4_HEADER_FOOTER_STORAGE_KEY}_${noteId}`);
    if (!raw) return normalizeA4HeaderFooterConfig(null);
    return normalizeA4HeaderFooterConfig(JSON.parse(raw));
  } catch {
    return normalizeA4HeaderFooterConfig(null);
  }
}

export function saveA4HeaderFooterConfigForNote(
  noteId: string,
  config: A4HeaderFooterConfig
): void {
  if (typeof window === 'undefined' || !noteId) return;
  try {
    localStorage.setItem(`${A4_HEADER_FOOTER_STORAGE_KEY}_${noteId}`, JSON.stringify(config));
  } catch {
    // ignore storage errors
  }
}

export function loadSavedA4Templates(): A4HeaderFooterSavedTemplate[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(A4_SAVED_TEMPLATES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => ({
          id: String(item.id || `tpl_${Date.now()}`),
          name: String(item.name || 'Plantilla'),
          createdAt: Number(item.createdAt || Date.now()),
          config: normalizeA4HeaderFooterConfig(item.config),
        }));
      }
    }
    // Migración automática por única vez si el usuario ya había creado un encabezado en la clave global previa
    const legacyRaw = localStorage.getItem(A4_HEADER_FOOTER_STORAGE_KEY);
    if (legacyRaw) {
      const legacyCfg = normalizeA4HeaderFooterConfig(JSON.parse(legacyRaw));
      const hasLegacyContent =
        legacyCfg.headerPreset !== 'none' ||
        legacyCfg.footerPreset !== 'none' ||
        Boolean(
          legacyCfg.headerSlots.left ||
            legacyCfg.headerSlots.center ||
            legacyCfg.headerSlots.right ||
            (legacyCfg.headerSlots.images && legacyCfg.headerSlots.images.length > 0) ||
            legacyCfg.footerSlots.left ||
            legacyCfg.footerSlots.center ||
            legacyCfg.footerSlots.right ||
            (legacyCfg.footerSlots.images && legacyCfg.footerSlots.images.length > 0)
        );
      if (hasLegacyContent) {
        const migrated: A4HeaderFooterSavedTemplate[] = [
          {
            id: `tpl_migrated_${Date.now()}`,
            name: 'Mi plantilla guardada',
            createdAt: Date.now(),
            config: legacyCfg,
          },
        ];
        localStorage.setItem(A4_SAVED_TEMPLATES_STORAGE_KEY, JSON.stringify(migrated));
        localStorage.removeItem(A4_HEADER_FOOTER_STORAGE_KEY);
        return migrated;
      }
    }
    return [];
  } catch {
    return [];
  }
}

export async function ensureSlotImagesUploaded(slots: A4ZoneSlots): Promise<A4ZoneSlots> {
  const nextSlots: A4ZoneSlots = { ...slots };
  if (nextSlots.logoUrl && nextSlots.logoUrl.startsWith('data:image/')) {
    try {
      const res = await uploadHeaderFooterLogo(nextSlots.logoUrl);
      nextSlots.logoUrl = res.url;
    } catch {}
  }
  if (Array.isArray(nextSlots.images) && nextSlots.images.length > 0) {
    const updatedImages: A4HeaderFooterImage[] = [];
    for (const img of nextSlots.images) {
      if (img.src && img.src.startsWith('data:image/')) {
        try {
          const res = await uploadHeaderFooterLogo(img.src);
          updatedImages.push({ ...img, src: res.url });
        } catch {
          updatedImages.push(img);
        }
      } else {
        updatedImages.push(img);
      }
    }
    nextSlots.images = updatedImages;
  }
  return nextSlots;
}

export async function ensureConfigImagesUploaded(
  config: A4HeaderFooterConfig
): Promise<A4HeaderFooterConfig> {
  const cloned = normalizeA4HeaderFooterConfig(JSON.parse(JSON.stringify(config)));
  const [
    headerSlots,
    footerSlots,
    firstPageHeaderSlots,
    firstPageFooterSlots,
    evenPageHeaderSlots,
    evenPageFooterSlots,
  ] = await Promise.all([
    ensureSlotImagesUploaded(cloned.headerSlots),
    ensureSlotImagesUploaded(cloned.footerSlots),
    ensureSlotImagesUploaded(cloned.firstPageHeaderSlots),
    ensureSlotImagesUploaded(cloned.firstPageFooterSlots),
    ensureSlotImagesUploaded(cloned.evenPageHeaderSlots),
    ensureSlotImagesUploaded(cloned.evenPageFooterSlots),
  ]);

  return {
    ...cloned,
    headerSlots,
    footerSlots,
    firstPageHeaderSlots,
    firstPageFooterSlots,
    evenPageHeaderSlots,
    evenPageFooterSlots,
  };
}

function stripBase64FromSlot(slot: A4ZoneSlots): A4ZoneSlots {
  return {
    ...slot,
    logoUrl: slot.logoUrl && slot.logoUrl.startsWith('data:') ? undefined : slot.logoUrl,
    images: Array.isArray(slot.images)
      ? slot.images.filter((img) => img.src && !img.src.startsWith('data:'))
      : [],
  };
}

function sanitizeTemplateForCloud(tpl: A4HeaderFooterSavedTemplate): A4HeaderFooterSavedTemplate {
  const cfg = tpl.config;
  return {
    ...tpl,
    config: {
      ...cfg,
      headerSlots: stripBase64FromSlot(cfg.headerSlots),
      footerSlots: stripBase64FromSlot(cfg.footerSlots),
      firstPageHeaderSlots: stripBase64FromSlot(cfg.firstPageHeaderSlots),
      firstPageFooterSlots: stripBase64FromSlot(cfg.firstPageFooterSlots),
      evenPageHeaderSlots: stripBase64FromSlot(cfg.evenPageHeaderSlots),
      evenPageFooterSlots: stripBase64FromSlot(cfg.evenPageFooterSlots),
    },
  };
}

async function persistTemplatesToCloud(templates: A4HeaderFooterSavedTemplate[]): Promise<void> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) return;
    // Nunca guardar cadenas base64 en user_metadata para no inflar el JWT Authorization header
    const cleanTemplates = templates.map(sanitizeTemplateForCloud);
    await supabase.auth.updateUser({
      data: {
        a4_hf_templates: cleanTemplates,
      },
    });
  } catch (err) {
    console.warn('[A4HeaderFooterTypes] No se pudieron sincronizar las plantillas en la nube:', err);
  }
}

export async function syncSavedA4TemplatesFromCloud(): Promise<A4HeaderFooterSavedTemplate[]> {
  const local = loadSavedA4Templates();
  try {
    let {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) return local;

    if (session.access_token && session.access_token.length > 4000) {
      try {
        const { data: refreshed } = await supabase.auth.refreshSession();
        if (refreshed?.session) {
          session = refreshed.session;
        }
      } catch {
        // ignore
      }
    }

    const cloudRaw = session.user.user_metadata?.a4_hf_templates;
    const cloudList: A4HeaderFooterSavedTemplate[] = Array.isArray(cloudRaw)
      ? cloudRaw.map((item: any) => ({
          id: String(item.id || `tpl_${Date.now()}`),
          name: String(item.name || 'Plantilla'),
          createdAt: Number(item.createdAt || Date.now()),
          config: normalizeA4HeaderFooterConfig(item.config),
        }))
      : [];

    // Combinar plantillas locales y de la nube por ID (priorizando las de la nube que ya tienen URLs públicas)
    const byId = new Map<string, A4HeaderFooterSavedTemplate>();
    for (const t of cloudList) {
      byId.set(t.id, t);
    }
    let needsCloudUpdate = false;
    for (const t of local) {
      if (!byId.has(t.id)) {
        const uploadedCfg = await ensureConfigImagesUploaded(t.config);
        byId.set(t.id, { ...t, config: uploadedCfg });
        needsCloudUpdate = true;
      }
    }

    const merged = Array.from(byId.values()).sort((a, b) => b.createdAt - a.createdAt);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(A4_SAVED_TEMPLATES_STORAGE_KEY, JSON.stringify(merged));
      } catch {}
    }
    if (needsCloudUpdate) {
      await persistTemplatesToCloud(merged);
    }
    return merged;
  } catch {
    return local;
  }
}

export async function saveNewA4Template(
  name: string,
  config: A4HeaderFooterConfig
): Promise<A4HeaderFooterSavedTemplate[]> {
  const current = loadSavedA4Templates();
  const uploadedConfig = await ensureConfigImagesUploaded(config);
  const newTemplate: A4HeaderFooterSavedTemplate = {
    id: `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim() || `Plantilla ${current.length + 1}`,
    createdAt: Date.now(),
    config: uploadedConfig,
  };
  const next = [newTemplate, ...current];
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(A4_SAVED_TEMPLATES_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }
  await persistTemplatesToCloud(next);
  return next;
}

export function deleteSavedA4Template(id: string): A4HeaderFooterSavedTemplate[] {
  const current = loadSavedA4Templates();
  const next = current.filter((t) => t.id !== id);
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(A4_SAVED_TEMPLATES_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }
  void persistTemplatesToCloud(next);
  return next;
}

/**
 * Calcula la altura efectiva (en px) que necesita el encabezado o pie según sus imágenes
 * y/o el ajuste manual arrastrando la línea punteada.
 * Cuando subes una imagen de vuelta arriba, el margen vuelve a subir inmediatamente a 95px (2,5 cm).
 */
export function getEffectiveZoneHeightPx(
  config: A4HeaderFooterConfig,
  zone: 'header' | 'footer'
): number {
  const defaultMarginPx = 95; // 2,5 cm
  const manualHeight =
    zone === 'header' ? config.customHeaderHeightPx : config.customFooterHeightPx;
  const baseMarginPx = manualHeight ? Math.max(48, Math.min(260, manualHeight)) : defaultMarginPx;

  const slotGroups: A4ZoneSlots[] =
    zone === 'header'
      ? [
          config.headerSlots,
          ...(config.differentFirstPage ? [config.firstPageHeaderSlots] : []),
          ...(config.differentOddEven ? [config.evenPageHeaderSlots] : []),
        ]
      : [
          config.footerSlots,
          ...(config.differentFirstPage ? [config.firstPageFooterSlots] : []),
          ...(config.differentOddEven ? [config.evenPageFooterSlots] : []),
        ];

  let maxImagesBottom = 0;
  for (const group of slotGroups) {
    if (Array.isArray(group?.images)) {
      for (const img of group.images) {
        const bottom = Math.round((img.y || 0) + (img.height || 60) + 12);
        if (bottom > maxImagesBottom) {
          maxImagesBottom = Math.min(260, bottom);
        }
      }
    }
  }
  return Math.max(baseMarginPx, maxImagesBottom);
}

/**
 * Devuelve los slots por defecto al aplicar un preset de Word
 */
export function getPresetDefaultSlots(
  presetId: A4HeaderFooterPresetId,
  zone: 'header' | 'footer'
): { odd: A4ZoneSlots; even: A4ZoneSlots } {
  switch (presetId) {
    case 'none':
      return {
        odd: { left: '', center: '', right: '' },
        even: { left: '', center: '', right: '' },
      };
    case 'blank_1':
      return {
        odd: { left: '[Escribir aquí]', center: '', right: '' },
        even: { left: '[Escribir aquí]', center: '', right: '' },
      };
    case 'blank_3':
      return {
        odd: { left: '{title}', center: '{date}', right: 'Página {page}' },
        even: { left: 'Página {page}', center: '{date}', right: '{title}' },
      };
    case 'movimiento':
      return {
        odd: { left: '', center: '', right: '{title}' },
        even: { left: '{title}', center: '', right: '' },
      };
    case 'retrospectiva':
      return {
        odd: { left: '{title}', center: '', right: zone === 'header' ? '{date}' : 'Página {page}' },
        even: { left: zone === 'header' ? '{date}' : 'Página {page}', center: '', right: '{title}' },
      };
    case 'segmento':
      return {
        odd: { left: '', center: '', right: 'Página {page}' },
        even: { left: 'Página {page}', center: '', right: '' },
      };
    case 'apa7':
      return {
        odd: { left: '{title}', center: '', right: '{page}' },
        even: { left: '{title}', center: '', right: '{page}' },
      };
    case 'page_x_of_y':
      return {
        odd: { left: '{date}', center: '', right: 'Página {page} de {total}' },
        even: { left: 'Página {page} de {total}', center: '', right: '{date}' },
      };
    default:
      return {
        odd: { left: '', center: '', right: '' },
        even: { left: '', center: '', right: '' },
      };
  }
}
