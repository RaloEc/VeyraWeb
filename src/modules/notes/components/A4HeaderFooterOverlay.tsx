import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Calendar,
  Sparkles,
  Image as ImageIcon,
  ArrowUpToLine,
  ArrowDownToLine,
  ChevronUp,
  ChevronDown,
  X,
  Hash,
  ChevronRight,
  Trash2,
  SlidersHorizontal,
  Check,
  Eraser,
  BookmarkPlus,
  BookmarkCheck,
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import {
  type A4HeaderFooterConfig,
  type A4HeaderFooterImage,
  type A4HeaderFooterPresetId,
  type A4HeaderFooterSavedTemplate,
  type A4ZoneSlots,
  DEFAULT_A4_HEADER_FOOTER_CONFIG,
  deleteSavedA4Template,
  getEffectiveZoneHeightPx,
  getPresetDefaultSlots,
  loadSavedA4Templates,
  saveNewA4Template,
  syncSavedA4TemplatesFromCloud,
} from './A4HeaderFooterTypes';
import { uploadHeaderFooterLogo } from '../../../lib/storage-upload';

interface A4HeaderFooterRibbonProps {
  config: A4HeaderFooterConfig;
  onChange: (next: A4HeaderFooterConfig) => void;
  activeZone: 'header' | 'footer';
  activeSheetIndex: number;
  totalSheets: number;
  activeSlot: 'left' | 'center' | 'right';
  onSelectZone: (zone: 'header' | 'footer') => void;
  onNavigateSheet: (nextSheetIndex: number) => void;
  onInsertImageFile: (file: File) => void;
  onClose: () => void;
}

const CM_TO_PX = 96 / 2.54; // ~37.795 px por cm
const A4_WIDTH_PX = 794;
const A4_HEIGHT_PX = 1123;
const PAGE_GAP_PX = 36;
const STRIDE_PX = A4_HEIGHT_PX + PAGE_GAP_PX;

/**
 * Resuelve qué grupo de slots corresponde a una hoja dada según Primera página diferente / Pares e impares
 */
export function resolveSlotsKey(
  config: A4HeaderFooterConfig,
  zone: 'header' | 'footer',
  sheetNum: number
):
  | 'headerSlots'
  | 'footerSlots'
  | 'firstPageHeaderSlots'
  | 'firstPageFooterSlots'
  | 'evenPageHeaderSlots'
  | 'evenPageFooterSlots' {
  if (config.differentFirstPage && sheetNum === 1) {
    return zone === 'header' ? 'firstPageHeaderSlots' : 'firstPageFooterSlots';
  }
  if (config.differentOddEven && sheetNum % 2 === 0) {
    return zone === 'header' ? 'evenPageHeaderSlots' : 'evenPageFooterSlots';
  }
  return zone === 'header' ? 'headerSlots' : 'footerSlots';
}

/**
 * Convierte un archivo/blob de imagen (pegado con Ctrl+V o seleccionado) en un objeto A4HeaderFooterImage
 * comprimiéndolo a WebP ligero (~10 KB) y subiéndolo con deduplicación SHA-256 al bucket de Supabase,
 * con dimensiones proporcionales y posición inteligente (1ª imagen a la izquierda, 2ª a la derecha como en Word)
 */
export async function createHeaderFooterImageFromFile(
  file: File,
  existingImages: A4HeaderFooterImage[]
): Promise<A4HeaderFooterImage> {
  const { url, naturalWidth, naturalHeight } = await uploadHeaderFooterLogo(file);
  const natW = naturalWidth || 160;
  const natH = naturalHeight || 65;
  const ratio = natW / natH;

  let targetH = 68;
  let targetW = Math.round(targetH * ratio);
  if (targetW > 260) {
    targetW = 260;
    targetH = Math.max(24, Math.round(targetW / ratio));
  }

  // Posición inicial inteligente estilo Word:
  // 1ª imagen -> margen izquierdo (56px), 2ª imagen -> margen derecho, 3ª+ -> centro
  const count = existingImages.length;
  let startX = 56;
  if (count === 1) {
    startX = Math.max(56, A4_WIDTH_PX - 56 - targetW);
  } else if (count >= 2) {
    startX = Math.round((A4_WIDTH_PX - targetW) / 2) + (count - 2) * 16;
  }

  return {
    id: `hf_img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    src: url,
    x: startX,
    y: 14,
    width: targetW,
    height: targetH,
  };
}

/**
 * Reemplaza variables dinámicas ({page}, {total}, {date}, {time}, {title}, {author})
 */
function interpolateTokens(
  raw: string,
  ctx: {
    sheetNum: number;
    totalSheets: number;
    noteTitle: string;
    authorName: string;
  }
): string {
  if (!raw) return '';
  const now = new Date();
  const dateStr = new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(now);
  const timeStr = new Intl.DateTimeFormat('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(now);

  return raw
    .replace(/\{page\}/gi, String(ctx.sheetNum))
    .replace(/\{total\}/gi, String(ctx.totalSheets))
    .replace(/\{date\}/gi, dateStr)
    .replace(/\{time\}/gi, timeStr)
    .replace(/\{title\}/gi, ctx.noteTitle || 'Sin título')
    .replace(/\{author\}/gi, ctx.authorName || 'Autor');
}

type OpenMenuType =
  | null
  | 'header_presets'
  | 'footer_presets'
  | 'page_number'
  | 'quick_parts'
  | 'options';

/**
 * Barra Superior Minimalista de Encabezado y Pie de Página
 * Sigue exactamente los lineamientos de diseño de Veyra (`h-9`, `bg-veyra-surface/40`, adaptable a modo claro y oscuro)
 */
export const A4HeaderFooterRibbon: React.FC<A4HeaderFooterRibbonProps> = ({
  config,
  onChange,
  activeZone,
  activeSheetIndex,
  totalSheets,
  activeSlot,
  onSelectZone,
  onNavigateSheet,
  onInsertImageFile,
  onClose,
}) => {
  const [openMenu, setOpenMenu] = useState<OpenMenuType>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const dropdownPortalRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const sheetNum = activeSheetIndex + 1;

  const toggleMenu = (type: Exclude<OpenMenuType, null>, e: React.MouseEvent<HTMLButtonElement>) => {
    if (openMenu === type) {
      setOpenMenu(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const menuWidth = type === 'header_presets' || type === 'footer_presets' ? 310 : 250;
    const clampedLeft = Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 12));
    setMenuPos({ top: rect.bottom + 6, left: clampedLeft });
    setOpenMenu(type);
  };

  useEffect(() => {
    if (!openMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownPortalRef.current && dropdownPortalRef.current.contains(e.target as Node)) {
        return;
      }
      setOpenMenu(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openMenu]);

  const updateCurrentSlotText = (tokenOrText: string, append = true) => {
    const key = resolveSlotsKey(config, activeZone, sheetNum);
    const currentSlots = config[key];
    const currentVal = currentSlots[activeSlot] || '';
    const nextVal =
      append && currentVal && currentVal !== '[Escribir aquí]'
        ? `${currentVal} ${tokenOrText}`
        : tokenOrText;

    const nextConfig: A4HeaderFooterConfig = {
      ...config,
      [activeZone === 'header' ? 'headerPreset' : 'footerPreset']:
        config[activeZone === 'header' ? 'headerPreset' : 'footerPreset'] === 'none'
          ? 'blank_3'
          : config[activeZone === 'header' ? 'headerPreset' : 'footerPreset'],
      [key]: {
        ...currentSlots,
        [activeSlot]: nextVal,
      },
    };
    onChange(nextConfig);
  };

  const applyPreset = (zone: 'header' | 'footer', presetId: A4HeaderFooterPresetId) => {
    const defaults = getPresetDefaultSlots(presetId, zone);
    if (zone === 'header') {
      onChange({
        ...config,
        headerPreset: presetId,
        headerSlots: { ...config.headerSlots, ...defaults.odd },
        evenPageHeaderSlots: { ...config.evenPageHeaderSlots, ...defaults.even },
        firstPageHeaderSlots:
          presetId === 'none'
            ? { ...config.firstPageHeaderSlots, left: '', center: '', right: '' }
            : { ...config.firstPageHeaderSlots, ...defaults.odd },
        differentOddEven: presetId === 'movimiento' ? true : config.differentOddEven,
      });
      onSelectZone('header');
    } else {
      onChange({
        ...config,
        footerPreset: presetId,
        footerSlots: { ...config.footerSlots, ...defaults.odd },
        evenPageFooterSlots: { ...config.evenPageFooterSlots, ...defaults.even },
        firstPageFooterSlots:
          presetId === 'none'
            ? { ...config.firstPageFooterSlots, left: '', center: '', right: '' }
            : { ...config.firstPageFooterSlots, ...defaults.odd },
        differentOddEven: presetId === 'movimiento' ? true : config.differentOddEven,
      });
      onSelectZone('footer');
    }
    setOpenMenu(null);
  };

  const applyPageNumberQuick = (
    targetZone: 'header' | 'footer',
    align: 'left' | 'center' | 'right',
    formatStr: string
  ) => {
    const key = resolveSlotsKey(config, targetZone, sheetNum);
    const currentPreset = targetZone === 'header' ? config.headerPreset : config.footerPreset;
    const nextSlots: A4ZoneSlots = {
      ...config[key],
      [align]: formatStr,
    };
    onChange({
      ...config,
      [targetZone === 'header' ? 'headerPreset' : 'footerPreset']:
        currentPreset === 'none' ? 'blank_3' : currentPreset,
      [key]: nextSlots,
    });
    onSelectZone(targetZone);
    setOpenMenu(null);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onInsertImageFile(file);
    }
    e.target.value = '';
  };

  const handleClearAllHeaderFooter = () => {
    onChange({
      ...DEFAULT_A4_HEADER_FOOTER_CONFIG,
      showDocumentText: config.showDocumentText,
      headerDistanceCm: config.headerDistanceCm,
      footerDistanceCm: config.footerDistanceCm,
    });
    setOpenMenu(null);
  };

  const hasAnyContent =
    config.headerPreset !== 'none' ||
    config.footerPreset !== 'none' ||
    Boolean(
      config.headerSlots.left ||
        config.headerSlots.center ||
        config.headerSlots.right ||
        config.headerSlots.logoUrl ||
        (config.headerSlots.images && config.headerSlots.images.length > 0) ||
        config.footerSlots.left ||
        config.footerSlots.center ||
        config.footerSlots.right ||
        config.footerSlots.logoUrl ||
        (config.footerSlots.images && config.footerSlots.images.length > 0) ||
        config.firstPageHeaderSlots.left ||
        config.firstPageHeaderSlots.center ||
        config.firstPageHeaderSlots.right ||
        (config.firstPageHeaderSlots.images && config.firstPageHeaderSlots.images.length > 0) ||
        config.firstPageFooterSlots.left ||
        config.firstPageFooterSlots.center ||
        config.firstPageFooterSlots.right ||
        (config.firstPageFooterSlots.images && config.firstPageFooterSlots.images.length > 0) ||
        config.evenPageHeaderSlots.left ||
        config.evenPageHeaderSlots.center ||
        config.evenPageHeaderSlots.right ||
        (config.evenPageHeaderSlots.images && config.evenPageHeaderSlots.images.length > 0) ||
        config.evenPageFooterSlots.left ||
        config.evenPageFooterSlots.center ||
        config.evenPageFooterSlots.right ||
        (config.evenPageFooterSlots.images && config.evenPageFooterSlots.images.length > 0)
    );

  const btnClass = (isActive = false) =>
    cn(
      'h-7 px-1.5 rounded-md transition-colors flex items-center justify-center gap-1 cursor-pointer shrink-0 text-[11px] font-medium',
      isActive
        ? 'bg-accent/15 text-accent font-semibold'
        : 'text-veyra-muted hover:text-veyra-text hover:bg-black/5 dark:hover:bg-white/5'
    );

  return (
    <>
      <div className="h-9 border-b border-veyra-border px-2.5 flex items-center gap-0.5 bg-veyra-surface/40 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] shrink-0 select-none text-xs">
        {/* GRUPO 1: Plantillas de Encabezado, Pie y Número de página */}
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => toggleMenu('header_presets', e)}
          className={btnClass(openMenu === 'header_presets' || config.headerPreset !== 'none')}
          title="Plantillas de Encabezado"
        >
          <ArrowUpToLine className="w-3.5 h-3.5 text-accent shrink-0" />
          <span>Encabezado</span>
          <ChevronDown className="w-2.5 h-2.5 opacity-60 shrink-0" />
        </button>

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => toggleMenu('footer_presets', e)}
          className={btnClass(openMenu === 'footer_presets' || config.footerPreset !== 'none')}
          title="Plantillas de Pie de página"
        >
          <ArrowDownToLine className="w-3.5 h-3.5 text-accent shrink-0" />
          <span>Pie</span>
          <ChevronDown className="w-2.5 h-2.5 opacity-60 shrink-0" />
        </button>

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => toggleMenu('page_number', e)}
          className={btnClass(openMenu === 'page_number')}
          title="Insertar o quitar Número de página"
        >
          <Hash className="w-3.5 h-3.5 shrink-0" />
          <span>N.º pág.</span>
          <ChevronDown className="w-2.5 h-2.5 opacity-60 shrink-0" />
        </button>

        <div className="w-[1px] h-3.5 bg-veyra-border mx-1 shrink-0" />

        {/* GRUPO 2: Insertar campos dinámicos e Imágenes (también soporta Ctrl+V directo) */}
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => updateCurrentSlotText('{date}')}
          title="Insertar Fecha actual en la columna activa"
          className={btnClass(false)}
        >
          <Calendar className="w-3.5 h-3.5 shrink-0" />
          <span>Fecha</span>
        </button>

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => toggleMenu('quick_parts', e)}
          className={btnClass(openMenu === 'quick_parts')}
          title="Insertar Título, Autor o Elementos rápidos"
        >
          <Sparkles className="w-3.5 h-3.5 shrink-0" />
          <span>Insertar</span>
          <ChevronDown className="w-2.5 h-2.5 opacity-60 shrink-0" />
        </button>

        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileInputChange}
        />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => imageInputRef.current?.click()}
          title="Insertar imagen en el encabezado/pie (o pega directamente con Ctrl+V)"
          className={btnClass(false)}
        >
          <ImageIcon className="w-3.5 h-3.5 shrink-0" />
          <span>Imagen</span>
        </button>

        <div className="w-[1px] h-3.5 bg-veyra-border mx-1 shrink-0" />

        {/* GRUPO 3: Navegación entre Encabezado / Pie y Hojas */}
        <div className="inline-flex items-center h-7 rounded-md p-0.5 bg-black/[0.04] dark:bg-white/[0.04] border border-veyra-border/60 shrink-0">
          <button
            type="button"
            onClick={() => onSelectZone('header')}
            title="Ir al encabezado"
            className={cn(
              'h-6 px-1.5 rounded text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer',
              activeZone === 'header'
                ? 'bg-accent/15 text-accent font-semibold shadow-2xs'
                : 'text-veyra-muted hover:text-veyra-text'
            )}
          >
            <ArrowUpToLine className="w-3 h-3" />
            <span>Sup.</span>
          </button>
          <button
            type="button"
            onClick={() => onSelectZone('footer')}
            title="Ir al pie de página"
            className={cn(
              'h-6 px-1.5 rounded text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer',
              activeZone === 'footer'
                ? 'bg-accent/15 text-accent font-semibold shadow-2xs'
                : 'text-veyra-muted hover:text-veyra-text'
            )}
          >
            <ArrowDownToLine className="w-3 h-3" />
            <span>Inf.</span>
          </button>
        </div>

        <button
          type="button"
          disabled={activeSheetIndex <= 0}
          onClick={() => onNavigateSheet(Math.max(0, activeSheetIndex - 1))}
          title="Hoja anterior"
          className="h-7 w-6 rounded-md text-veyra-muted hover:text-veyra-text hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none transition-colors flex items-center justify-center cursor-pointer shrink-0"
        >
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          disabled={activeSheetIndex >= totalSheets - 1}
          onClick={() => onNavigateSheet(Math.min(totalSheets - 1, activeSheetIndex + 1))}
          title="Hoja siguiente"
          className="h-7 w-6 rounded-md text-veyra-muted hover:text-veyra-text hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none transition-colors flex items-center justify-center cursor-pointer shrink-0"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>

        <div className="w-[1px] h-3.5 bg-veyra-border mx-1 shrink-0" />

        {/* GRUPO 4: Posición (1,25 cm) y Opciones de Word */}
        <div
          className="flex items-center h-6 bg-veyra-card border border-veyra-border rounded-md px-1.5 shrink-0"
          title={
            activeZone === 'header'
              ? 'Distancia del encabezado desde el borde superior (cm)'
              : 'Distancia del pie de página desde el borde inferior (cm)'
          }
        >
          <input
            type="number"
            step={0.05}
            min={0.3}
            max={2.2}
            value={
              activeZone === 'header'
                ? config.headerDistanceCm
                : config.footerDistanceCm
            }
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (!Number.isNaN(val)) {
                const clamped = Math.min(2.2, Math.max(0.3, val));
                onChange(
                  activeZone === 'header'
                    ? { ...config, headerDistanceCm: clamped }
                    : { ...config, footerDistanceCm: clamped }
                );
              }
            }}
            className="w-10 bg-transparent text-right text-veyra-text font-medium focus:outline-none text-[11px]"
          />
          <span className="ml-0.5 text-[10px] text-veyra-subtle">cm</span>
        </div>

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => toggleMenu('options', e)}
          className={btnClass(
            openMenu === 'options' ||
              config.differentFirstPage ||
              config.differentOddEven ||
              !config.showDocumentText
          )}
          title="Opciones de página (Primera página diferente, Pares e impares, Posición)"
        >
          <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
          <span>Opciones</span>
          <ChevronDown className="w-2.5 h-2.5 opacity-60 shrink-0" />
        </button>

        <div className="w-[1px] h-3.5 bg-veyra-border mx-1 shrink-0" />

        {/* BOTÓN LIMPIAR TODO (Borra cualquier contenido e imágenes de Encabezado y Pie de página) */}
        <button
          type="button"
          disabled={!hasAnyContent}
          onClick={handleClearAllHeaderFooter}
          title="Limpiar todo el encabezado y pie de página"
          className="h-7 px-2 rounded-md text-red-500 hover:bg-red-500/10 disabled:opacity-35 disabled:pointer-events-none transition-colors flex items-center justify-center gap-1 cursor-pointer shrink-0 text-[11px] font-medium"
        >
          <Eraser className="w-3.5 h-3.5 shrink-0" />
          <span>Limpiar</span>
        </button>

        {/* GRUPO 5: Cerrar encabezado y pie de página */}
        <div className="ml-auto pl-1.5 flex items-center shrink-0">
          <button
            type="button"
            onClick={onClose}
            title="Cerrar encabezado y pie de página (Esc)"
            className="h-7 px-2 rounded-md bg-accent/15 hover:bg-accent/25 border border-accent/30 text-accent font-semibold text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            <span>Cerrar</span>
          </button>
        </div>
      </div>

      {/* PORTAL DE MENÚS DESPLEGABLES */}
      {openMenu &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={dropdownPortalRef}
            style={{ top: `${menuPos.top}px`, left: `${menuPos.left}px` }}
            className="fixed z-[9999]"
          >
            {(openMenu === 'header_presets' || openMenu === 'footer_presets') && (
              <PresetGalleryDropdown
                zone={openMenu === 'header_presets' ? 'header' : 'footer'}
                activePreset={
                  openMenu === 'header_presets' ? config.headerPreset : config.footerPreset
                }
                currentConfig={config}
                hasAnyContent={hasAnyContent}
                onApplySavedTemplate={(savedCfg) => {
                  onChange(JSON.parse(JSON.stringify(savedCfg)));
                  setOpenMenu(null);
                }}
                onSelect={(preset) =>
                  applyPreset(
                    openMenu === 'header_presets' ? 'header' : 'footer',
                    preset
                  )
                }
              />
            )}

            {openMenu === 'page_number' && (
              <div className="w-64 bg-veyra-card border border-veyra-border rounded-xl shadow-2xl py-1.5 text-xs text-veyra-text">
                <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-veyra-muted">
                  Principio de página (Encabezado)
                </div>
                <button
                  type="button"
                  onClick={() => applyPageNumberQuick('header', 'left', '{page}')}
                  className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-between cursor-pointer transition-colors"
                >
                  <span>Número simple (Izquierda)</span>
                  <span className="text-veyra-muted font-mono text-[11px]">1</span>
                </button>
                <button
                  type="button"
                  onClick={() => applyPageNumberQuick('header', 'center', '{page}')}
                  className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-between cursor-pointer transition-colors"
                >
                  <span>Número simple (Centro)</span>
                  <span className="text-veyra-muted font-mono text-[11px]">1</span>
                </button>
                <button
                  type="button"
                  onClick={() => applyPageNumberQuick('header', 'right', '{page}')}
                  className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-between cursor-pointer transition-colors"
                >
                  <span>Número simple (Derecha)</span>
                  <span className="text-veyra-muted font-mono text-[11px]">1</span>
                </button>

                <div className="my-1 border-t border-veyra-border" />
                <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-veyra-muted">
                  Final de página (Pie de página)
                </div>
                <button
                  type="button"
                  onClick={() => applyPageNumberQuick('footer', 'left', 'Página {page}')}
                  className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-between cursor-pointer transition-colors"
                >
                  <span>Página X (Izquierda)</span>
                  <span className="text-veyra-muted text-[11px]">Página 1</span>
                </button>
                <button
                  type="button"
                  onClick={() => applyPageNumberQuick('footer', 'center', 'Página {page}')}
                  className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-between cursor-pointer transition-colors"
                >
                  <span>Página X (Centro)</span>
                  <span className="text-veyra-muted text-[11px]">Página 1</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    applyPageNumberQuick('footer', 'right', 'Página {page} de {total}')
                  }
                  className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-between cursor-pointer transition-colors"
                >
                  <span>Página X de Y (Derecha)</span>
                  <span className="text-veyra-muted text-[11px]">Página 1 de N</span>
                </button>

                <div className="my-1 border-t border-veyra-border" />
                <button
                  type="button"
                  onClick={() => {
                    const key = resolveSlotsKey(config, activeZone, sheetNum);
                    const cleaned: A4ZoneSlots = {
                      ...config[key],
                      left: config[key].left
                        .replace(/Página\s*\{page\}(\s*de\s*\{total\})?|\{page\}/gi, '')
                        .trim(),
                      center: config[key].center
                        .replace(/Página\s*\{page\}(\s*de\s*\{total\})?|\{page\}/gi, '')
                        .trim(),
                      right: config[key].right
                        .replace(/Página\s*\{page\}(\s*de\s*\{total\})?|\{page\}/gi, '')
                        .trim(),
                    };
                    onChange({ ...config, [key]: cleaned });
                    setOpenMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left text-red-500 hover:bg-red-500/10 flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Quitar números de página</span>
                </button>
              </div>
            )}

            {openMenu === 'quick_parts' && (
              <div className="w-56 bg-veyra-card border border-veyra-border rounded-xl shadow-2xl py-1.5 text-xs text-veyra-text">
                <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-veyra-muted">
                  Información del documento
                </div>
                <button
                  type="button"
                  onClick={() => {
                    updateCurrentSlotText('{title}', false);
                    setOpenMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer flex items-center justify-between transition-colors"
                >
                  <span>Título del documento</span>
                  <span className="text-[10px] text-veyra-muted font-mono">{'{title}'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    updateCurrentSlotText('{author}', false);
                    setOpenMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer flex items-center justify-between transition-colors"
                >
                  <span>Autor</span>
                  <span className="text-[10px] text-veyra-muted font-mono">{'{author}'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    updateCurrentSlotText('{title} — {author}', false);
                    setOpenMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-colors"
                >
                  <span>Título y Autor</span>
                </button>

                <div className="my-1 border-t border-veyra-border" />
                <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-veyra-muted">
                  Elementos rápidos
                </div>
                <button
                  type="button"
                  onClick={() => {
                    updateCurrentSlotText('Página {page} de {total}', false);
                    setOpenMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-colors"
                >
                  Página X de Y
                </button>
                <button
                  type="button"
                  onClick={() => {
                    updateCurrentSlotText('CONFIDENCIAL', false);
                    setOpenMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-colors"
                >
                  Marca «CONFIDENCIAL»
                </button>
                <button
                  type="button"
                  onClick={() => {
                    updateCurrentSlotText('BORRADOR — {date}', false);
                    setOpenMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-colors"
                >
                  Borrador con fecha
                </button>
              </div>
            )}

            {openMenu === 'options' && (
              <div className="w-72 bg-veyra-card border border-veyra-border rounded-xl shadow-2xl p-3 text-xs text-veyra-text space-y-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-veyra-muted">
                  Opciones de página (Word)
                </div>

                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() =>
                      onChange({
                        ...config,
                        differentFirstPage: !config.differentFirstPage,
                      })
                    }
                    className="w-full flex items-center justify-between py-1 px-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    <span>Primera página diferente</span>
                    <div
                      className={cn(
                        'w-4 h-4 rounded flex items-center justify-center border transition-colors',
                        config.differentFirstPage
                          ? 'bg-accent border-accent text-white'
                          : 'border-veyra-border bg-black/5 dark:bg-white/5'
                      )}
                    >
                      {config.differentFirstPage && <Check className="w-3 h-3 stroke-[2.5]" />}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      onChange({
                        ...config,
                        differentOddEven: !config.differentOddEven,
                      })
                    }
                    className="w-full flex items-center justify-between py-1 px-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    <span>Páginas pares e impares diferentes</span>
                    <div
                      className={cn(
                        'w-4 h-4 rounded flex items-center justify-center border transition-colors',
                        config.differentOddEven
                          ? 'bg-accent border-accent text-white'
                          : 'border-veyra-border bg-black/5 dark:bg-white/5'
                      )}
                    >
                      {config.differentOddEven && <Check className="w-3 h-3 stroke-[2.5]" />}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      onChange({
                        ...config,
                        showDocumentText: !config.showDocumentText,
                      })
                    }
                    className="w-full flex items-center justify-between py-1 px-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    <span>Mostrar texto del documento</span>
                    <div
                      className={cn(
                        'w-4 h-4 rounded flex items-center justify-center border transition-colors',
                        config.showDocumentText
                          ? 'bg-accent border-accent text-white'
                          : 'border-veyra-border bg-black/5 dark:bg-white/5'
                      )}
                    >
                      {config.showDocumentText && <Check className="w-3 h-3 stroke-[2.5]" />}
                    </div>
                  </button>
                </div>

                <div className="border-t border-veyra-border pt-2.5 space-y-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-veyra-muted">
                    Posición desde el borde
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-veyra-muted">Encabezado desde arriba:</span>
                    <div className="flex items-center bg-black/[0.04] dark:bg-white/[0.04] border border-veyra-border rounded-md px-2 py-0.5">
                      <input
                        type="number"
                        step={0.05}
                        min={0.3}
                        max={2.2}
                        value={config.headerDistanceCm}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!Number.isNaN(val)) {
                            onChange({
                              ...config,
                              headerDistanceCm: Math.min(2.2, Math.max(0.3, val)),
                            });
                          }
                        }}
                        className="w-12 bg-transparent text-right text-veyra-text font-medium focus:outline-none text-xs"
                      />
                      <span className="ml-1 text-veyra-subtle text-[10px]">cm</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-veyra-muted">Pie de página desde abajo:</span>
                    <div className="flex items-center bg-black/[0.04] dark:bg-white/[0.04] border border-veyra-border rounded-md px-2 py-0.5">
                      <input
                        type="number"
                        step={0.05}
                        min={0.3}
                        max={2.2}
                        value={config.footerDistanceCm}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!Number.isNaN(val)) {
                            onChange({
                              ...config,
                              footerDistanceCm: Math.min(2.2, Math.max(0.3, val)),
                            });
                          }
                        }}
                        className="w-12 bg-transparent text-right text-veyra-text font-medium focus:outline-none text-xs"
                      />
                      <span className="ml-1 text-veyra-subtle text-[10px]">cm</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
};

/**
 * Galería visual desplegable de plantillas de Word + Plantillas guardadas por el usuario
 */
const PresetGalleryDropdown: React.FC<{
  zone: 'header' | 'footer';
  activePreset: A4HeaderFooterPresetId;
  currentConfig: A4HeaderFooterConfig;
  hasAnyContent: boolean;
  onApplySavedTemplate: (cfg: A4HeaderFooterConfig) => void;
  onSelect: (preset: A4HeaderFooterPresetId) => void;
}> = ({
  zone,
  activePreset,
  currentConfig,
  hasAnyContent,
  onApplySavedTemplate,
  onSelect,
}) => {
  const [savedTemplates, setSavedTemplates] = useState<A4HeaderFooterSavedTemplate[]>(() =>
    loadSavedA4Templates()
  );
  const [isSavingNew, setIsSavingNew] = useState(false);
  const [isUploadingTemplate, setIsUploadingTemplate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');

  useEffect(() => {
    let mounted = true;
    syncSavedA4TemplatesFromCloud().then((synced) => {
      if (mounted) {
        setSavedTemplates(synced);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const handleSaveCurrent = async () => {
    if (isUploadingTemplate) return;
    setIsUploadingTemplate(true);
    try {
      const next = await saveNewA4Template(
        newTemplateName.trim() || `Plantilla ${savedTemplates.length + 1}`,
        currentConfig
      );
      setSavedTemplates(next);
      // Si la plantilla actual tenía imágenes en Base64, actualizar también la nota actual con las URLs ligeras
      if (next.length > 0) {
        onApplySavedTemplate(next[0].config);
      }
      setNewTemplateName('');
      setIsSavingNew(false);
    } finally {
      setIsUploadingTemplate(false);
    }
  };

  const handleDeleteTemplate = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const next = deleteSavedA4Template(id);
    setSavedTemplates(next);
  };

  const cardClass = (id: A4HeaderFooterPresetId) =>
    cn(
      'p-2.5 rounded-lg border transition-all cursor-pointer',
      activePreset === id
        ? 'border-accent bg-accent/10 ring-1 ring-accent/30'
        : 'border-veyra-border hover:border-accent/40 bg-black/[0.02] dark:bg-white/[0.02]'
    );

  return (
    <div className="w-80 max-h-[450px] overflow-y-auto bg-veyra-card border border-veyra-border rounded-xl shadow-2xl p-2.5 space-y-2 text-veyra-text scrollbar-thin">
      {/* SECCIÓN: MIS PLANTILLAS GUARDADAS */}
      <div className="rounded-lg border border-veyra-border/80 bg-black/[0.02] dark:bg-white/[0.02] p-2 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10.5px] font-bold uppercase tracking-wider text-accent flex items-center gap-1">
            <BookmarkCheck className="w-3.5 h-3.5" />
            Mis plantillas ({savedTemplates.length})
          </span>
          {!isSavingNew && (
            <button
              type="button"
              disabled={!hasAnyContent}
              onClick={() => setIsSavingNew(true)}
              title={
                hasAnyContent
                  ? 'Guardar el encabezado y pie de esta nota como plantilla reutilizable'
                  : 'Agrega texto o imágenes primero para guardar como plantilla'
              }
              className="text-[10.5px] font-semibold text-accent hover:underline disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1 cursor-pointer"
            >
              <BookmarkPlus className="w-3 h-3" />
              <span>Guardar actual</span>
            </button>
          )}
        </div>

        {isSavingNew && (
          <div className="flex items-center gap-1.5 pt-0.5">
            <input
              type="text"
              autoFocus
              value={newTemplateName}
              onChange={(e) => setNewTemplateName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveCurrent();
                if (e.key === 'Escape') setIsSavingNew(false);
              }}
              placeholder="Ej. Universidad de Guayaquil..."
              className="flex-1 bg-veyra-surface border border-accent/60 rounded-md px-2 py-1 text-[11px] text-veyra-text placeholder:text-veyra-muted/60 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleSaveCurrent}
              className="px-2 py-1 rounded-md bg-accent text-white text-[10.5px] font-semibold hover:opacity-90 cursor-pointer shrink-0"
            >
              Guardar
            </button>
            <button
              type="button"
              onClick={() => setIsSavingNew(false)}
              className="p-1 rounded-md text-veyra-muted hover:text-veyra-text cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {savedTemplates.length === 0 ? (
          <p className="text-[10px] text-veyra-muted leading-snug">
            Aún no tienes plantillas guardadas. Diseña tu encabezado/pie con imágenes o texto y pulsa <strong>Guardar actual</strong> para reutilizarlo en cualquier nota.
          </p>
        ) : (
          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-0.5">
            {savedTemplates.map((tpl) => {
              const headerImgs = tpl.config.headerSlots?.images || [];
              const footerImgs = tpl.config.footerSlots?.images || [];
              const allImgs = [...headerImgs, ...footerImgs];
              const previewLeft =
                tpl.config.headerSlots?.left || tpl.config.footerSlots?.left || '';
              const previewCenter =
                tpl.config.headerSlots?.center || tpl.config.footerSlots?.center || '';
              const previewRight =
                tpl.config.headerSlots?.right || tpl.config.footerSlots?.right || '';

              return (
                <div
                  key={tpl.id}
                  onClick={() => onApplySavedTemplate(tpl.config)}
                  className="group p-2 rounded-lg border border-veyra-border hover:border-accent/60 bg-veyra-card hover:bg-accent/[0.06] transition-all cursor-pointer flex flex-col gap-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-veyra-text truncate">
                      {tpl.name}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteTemplate(e, tpl.id)}
                      title="Eliminar plantilla guardada"
                      className="p-1 rounded text-veyra-muted hover:text-red-500 hover:bg-red-500/10 opacity-70 group-hover:opacity-100 transition-colors cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>

                  <div className="bg-white dark:bg-[#161619] border border-slate-200 dark:border-white/10 rounded px-2 py-1.5 min-h-[34px] flex items-center justify-between gap-2 text-[9.5px] text-slate-600 dark:text-zinc-300 overflow-hidden">
                    {allImgs.length > 0 ? (
                      <div className="flex items-center gap-1.5 overflow-hidden">
                        {allImgs.slice(0, 3).map((im) => (
                          <img
                            key={im.id}
                            src={im.src}
                            alt=""
                            className="h-6 w-auto max-w-[70px] object-contain rounded-xs"
                          />
                        ))}
                        {allImgs.length > 3 && (
                          <span className="text-[9px] text-veyra-muted">
                            +{allImgs.length - 3}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="truncate">{previewLeft || '—'}</span>
                    )}
                    <span className="truncate">{previewCenter}</span>
                    <span className="truncate">{previewRight}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="text-[11px] font-semibold text-veyra-muted px-1 pt-1 flex items-center justify-between">
        <span>
          {zone === 'header'
            ? 'Plantillas de Word (Encabezado)'
            : 'Plantillas de Word (Pie de página)'}
        </span>
        {activePreset !== 'none' && (
          <button
            type="button"
            onClick={() => onSelect('none')}
            className="text-[10px] text-red-500 hover:underline cursor-pointer font-medium"
          >
            Quitar {zone === 'header' ? 'encabezado' : 'pie'}
          </button>
        )}
      </div>

      {/* 1. En blanco (1 columna) */}
      <div onClick={() => onSelect('blank_1')} className={cardClass('blank_1')}>
        <div className="text-[11px] font-semibold text-veyra-text mb-1.5">En blanco</div>
        <div className="bg-white dark:bg-[#161619] border border-slate-200 dark:border-white/10 text-slate-700 dark:text-zinc-300 h-10 rounded p-2 flex items-center justify-between text-[10px] shadow-2xs">
          <span>[Escribir aquí]</span>
        </div>
      </div>

      {/* 2. En blanco (Tres columnas) */}
      <div onClick={() => onSelect('blank_3')} className={cardClass('blank_3')}>
        <div className="text-[11px] font-semibold text-veyra-text mb-1.5">
          En blanco (tres columnas)
        </div>
        <div className="bg-white dark:bg-[#161619] border border-slate-200 dark:border-white/10 text-slate-700 dark:text-zinc-300 h-10 rounded p-2 flex items-center justify-between text-[10px] shadow-2xs">
          <span>[Título]</span>
          <span>[Fecha]</span>
          <span>Página 1</span>
        </div>
      </div>

      {/* 3. Movimiento (página impar / par) */}
      <div onClick={() => onSelect('movimiento')} className={cardClass('movimiento')}>
        <div className="text-[11px] font-semibold text-veyra-text mb-1.5">
          Movimiento (página impar y par)
        </div>
        <div className="bg-white dark:bg-[#161619] border border-slate-200 dark:border-white/10 text-slate-800 dark:text-zinc-200 h-11 rounded py-1.5 pl-3 pr-0 flex items-center justify-end gap-2 text-[10px] shadow-2xs overflow-hidden">
          <span className="font-semibold">[Título del documento]</span>
          <span className="bg-[#F4B183] text-slate-800 font-semibold px-3 py-0.5 min-w-[42px] text-left">
            1
          </span>
        </div>
      </div>

      {/* 4. Retrospectiva */}
      <div onClick={() => onSelect('retrospectiva')} className={cardClass('retrospectiva')}>
        <div className="text-[11px] font-semibold text-veyra-text mb-1.5">Retrospectiva</div>
        <div className="bg-white dark:bg-[#161619] border border-slate-200 dark:border-white/10 h-11 rounded px-2.5 flex items-center justify-center shadow-2xs">
          <div className="w-full bg-[#C55A44] border-b-[3px] border-[#4472C4] text-white px-2.5 py-1 flex items-center justify-between text-[9px] uppercase tracking-wider">
            <span>[TÍTULO DEL DOCUMENTO]</span>
            <span>{zone === 'header' ? '[FECHA]' : '[PÁGINA]'}</span>
          </div>
        </div>
      </div>

      {/* 5. Segmento 1 */}
      <div onClick={() => onSelect('segmento')} className={cardClass('segmento')}>
        <div className="text-[11px] font-semibold text-veyra-text mb-1.5">Segmento 1</div>
        <div className="bg-white dark:bg-[#161619] border border-slate-200 dark:border-white/10 h-10 rounded px-3 flex items-center justify-end shadow-2xs">
          <span className="text-[#2F5597] dark:text-sky-400 font-semibold text-[10px]">
            Página 1
          </span>
        </div>
      </div>

      {/* 6. Académico APA 7 / Página X de Y */}
      <div
        onClick={() => onSelect(zone === 'header' ? 'apa7' : 'page_x_of_y')}
        className={cardClass(zone === 'header' ? 'apa7' : 'page_x_of_y')}
      >
        <div className="text-[11px] font-semibold text-veyra-text mb-1.5">
          {zone === 'header' ? 'Académico (APA 7)' : 'Página X de Y con fecha'}
        </div>
        <div className="bg-white dark:bg-[#161619] border border-slate-200 dark:border-white/10 text-slate-700 dark:text-zinc-300 h-10 rounded px-3 flex items-center justify-between text-[10px] shadow-2xs">
          <span>{zone === 'header' ? 'TÍTULO CORTO' : '12/11/2026'}</span>
          <span>{zone === 'header' ? '1' : 'Página 1 de 3'}</span>
        </div>
      </div>
    </div>
  );
};

/**
 * Imagen individual movible y redimensionable con 8 nodos circulares (idéntico a Word)
 */
const MovableResizableHeaderFooterImage: React.FC<{
  image: A4HeaderFooterImage;
  isEditingZone: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (next: A4HeaderFooterImage) => void;
  onDelete: () => void;
}> = ({ image, isEditingZone, isSelected, onSelect, onUpdate, onDelete }) => {
  const handleStartDrag = (e: React.MouseEvent) => {
    if (!isEditingZone) return;
    e.stopPropagation();
    e.preventDefault();
    onSelect();

    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    const origX = image.x;
    const origY = image.y;

    const handleMove = (mv: MouseEvent) => {
      const dx = mv.clientX - startMouseX;
      const dy = mv.clientY - startMouseY;
      const nextX = Math.max(8, Math.min(A4_WIDTH_PX - image.width - 8, Math.round(origX + dx)));
      const nextY = Math.max(4, Math.min(200, Math.round(origY + dy)));
      onUpdate({ ...image, x: nextX, y: nextY });
    };

    const handleUp = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  };

  const handleStartResize = (
    dir: 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w',
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    e.preventDefault();
    onSelect();

    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    const origX = image.x;
    const origY = image.y;
    const origW = image.width;
    const origH = image.height;
    const ratio = origW / Math.max(1, origH);
    const isCorner = dir.length === 2;

    const handleMove = (mv: MouseEvent) => {
      const dx = mv.clientX - startMouseX;
      const dy = mv.clientY - startMouseY;

      let nextX = origX;
      let nextY = origY;
      let nextW = origW;
      let nextH = origH;

      if (dir.includes('e')) {
        nextW = Math.max(28, Math.min(A4_WIDTH_PX - origX - 8, origW + dx));
      }
      if (dir.includes('w')) {
        const maxDeltaLeft = origW - 28;
        const clampedDx = Math.max(-origX + 8, Math.min(maxDeltaLeft, dx));
        nextX = origX + clampedDx;
        nextW = origW - clampedDx;
      }
      if (dir.includes('s')) {
        nextH = Math.max(20, Math.min(230 - origY, origH + dy));
      }
      if (dir.includes('n')) {
        const maxDeltaTop = origH - 20;
        const clampedDy = Math.max(-origY + 4, Math.min(maxDeltaTop, dy));
        nextY = origY + clampedDy;
        nextH = origH - clampedDy;
      }

      // En las 4 esquinas conservamos proporción como en Word
      if (isCorner) {
        if (Math.abs(dx) > Math.abs(dy)) {
          nextH = Math.max(20, Math.round(nextW / ratio));
          if (dir.includes('n')) {
            nextY = origY + (origH - nextH);
          }
        } else {
          nextW = Math.max(28, Math.round(nextH * ratio));
          if (dir.includes('w')) {
            nextX = origX + (origW - nextW);
          }
        }
      }

      onUpdate({
        ...image,
        x: Math.round(nextX),
        y: Math.round(nextY),
        width: Math.round(nextW),
        height: Math.round(nextH),
      });
    };

    const handleUp = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  };

  const handleDotClass =
    'absolute w-2.5 h-2.5 rounded-full bg-white border border-slate-600 shadow-xs z-30';

  return (
    <div
      style={{
        left: `${image.x}px`,
        top: `${image.y}px`,
        width: `${image.width}px`,
        height: `${image.height}px`,
      }}
      onMouseDown={handleStartDrag}
      onClick={(e) => {
        if (isEditingZone) {
          e.stopPropagation();
          onSelect();
        }
      }}
      className={cn(
        'absolute select-none',
        isEditingZone ? 'cursor-move z-30' : 'pointer-events-none z-10',
        isEditingZone && isSelected && 'outline-1 outline-slate-600 dark:outline-zinc-300'
      )}
    >
      <img
        src={image.src}
        alt=""
        draggable={false}
        className="w-full h-full object-fill pointer-events-none select-none"
      />

      {/* 8 Nodos de redimensionamiento estilo Word + botón flotante lateral cuando está seleccionada */}
      {isEditingZone && isSelected && (
        <>
          {/* Esquinas */}
          <div
            onMouseDown={(e) => handleStartResize('nw', e)}
            className={cn(handleDotClass, '-top-1.5 -left-1.5 cursor-nwse-resize')}
          />
          <div
            onMouseDown={(e) => handleStartResize('ne', e)}
            className={cn(handleDotClass, '-top-1.5 -right-1.5 cursor-nesw-resize')}
          />
          <div
            onMouseDown={(e) => handleStartResize('se', e)}
            className={cn(handleDotClass, '-bottom-1.5 -right-1.5 cursor-nwse-resize')}
          />
          <div
            onMouseDown={(e) => handleStartResize('sw', e)}
            className={cn(handleDotClass, '-bottom-1.5 -left-1.5 cursor-nesw-resize')}
          />

          {/* Lados medios */}
          <div
            onMouseDown={(e) => handleStartResize('n', e)}
            className={cn(handleDotClass, '-top-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize')}
          />
          <div
            onMouseDown={(e) => handleStartResize('s', e)}
            className={cn(
              handleDotClass,
              '-bottom-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize'
            )}
          />
          <div
            onMouseDown={(e) => handleStartResize('w', e)}
            className={cn(handleDotClass, 'top-1/2 -translate-y-1/2 -left-1.5 cursor-ew-resize')}
          />
          <div
            onMouseDown={(e) => handleStartResize('e', e)}
            className={cn(handleDotClass, 'top-1/2 -translate-y-1/2 -right-1.5 cursor-ew-resize')}
          />

          {/* Botón flotante al costado derecho de la imagen (igual al icono de Word de la captura) */}
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            title="Eliminar imagen (Supr)"
            className="absolute top-0 -right-8 w-6 h-6 rounded bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-600 shadow-md flex items-center justify-center text-red-500 hover:bg-red-50 dark:hover:bg-red-500/20 cursor-pointer transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </>
      )}
    </div>
  );
};

interface A4SheetHeaderFooterZonesProps {
  config: A4HeaderFooterConfig;
  onChange: (next: A4HeaderFooterConfig) => void;
  totalSheets: number;
  noteTitle: string;
  authorName: string;
  activeZone: 'header' | 'footer' | null;
  activeSheetIndex: number;
  activeSlot: 'left' | 'center' | 'right';
  onActivateZone: (zone: 'header' | 'footer', sheetIndex: number) => void;
  onSelectSlot: (slot: 'left' | 'center' | 'right') => void;
}

/**
 * Renderiza las zonas de Encabezado y Pie de página en cada una de las hojas A4 del documento.
 * Soporta pegar múltiples imágenes con Ctrl+V, moverlas libremente y redimensionarlas como en Word.
 */
export const A4SheetHeaderFooterZones: React.FC<A4SheetHeaderFooterZonesProps> = ({
  config,
  onChange,
  totalSheets,
  noteTitle,
  authorName,
  activeZone,
  activeSheetIndex,
  activeSlot,
  onActivateZone,
  onSelectSlot,
}) => {
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const configRef = useRef<A4HeaderFooterConfig>(config);
  configRef.current = config;

  const sheets = Array.from({ length: Math.max(1, totalSheets) }, (_, i) => i);

  const headerZoneHeightPx = getEffectiveZoneHeightPx(config, 'header');
  const footerZoneHeightPx = getEffectiveZoneHeightPx(config, 'footer');

  const headerTopOffsetPx = Math.round(config.headerDistanceCm * CM_TO_PX);
  const footerBottomOffsetPx = Math.round(config.footerDistanceCm * CM_TO_PX);

  // Deseleccionar imagen cuando se cierra el modo de edición
  useEffect(() => {
    if (!activeZone) {
      setSelectedImageId(null);
    }
  }, [activeZone]);

  // Borrar imagen seleccionada con tecla Supr / Backspace
  useEffect(() => {
    if (!activeZone || !selectedImageId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
          return;
        }
        e.preventDefault();
        const sheetNum = activeSheetIndex + 1;
        const key = resolveSlotsKey(config, activeZone, sheetNum);
        const currentImages = config[key].images || [];
        onChange({
          ...config,
          [key]: {
            ...config[key],
            images: currentImages.filter((img) => img.id !== selectedImageId),
          },
        });
        setSelectedImageId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeZone, activeSheetIndex, selectedImageId, config, onChange]);

  // Escuchar Ctrl+V (paste) global mientras se está editando Encabezado o Pie de página
  const handlePasteImageFile = useCallback(
    async (file: File) => {
      if (!activeZone) return;
      const sheetNum = activeSheetIndex + 1;
      const key = resolveSlotsKey(config, activeZone, sheetNum);
      const currentImages = config[key].images || [];
      const newImg = await createHeaderFooterImageFromFile(file, currentImages);
      onChange({
        ...config,
        [key]: {
          ...config[key],
          images: [...currentImages, newImg],
        },
      });
      setSelectedImageId(newImg.id);
    },
    [activeZone, activeSheetIndex, config, onChange]
  );

  useEffect(() => {
    if (!activeZone) return;
    const handleWindowPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            e.stopPropagation();
            handlePasteImageFile(file);
            return;
          }
        }
      }
    };
    window.addEventListener('paste', handleWindowPaste, true);
    return () => window.removeEventListener('paste', handleWindowPaste, true);
  }, [activeZone, handlePasteImageFile]);

  const handleSlotInputChange = (
    zone: 'header' | 'footer',
    sheetNum: number,
    slot: 'left' | 'center' | 'right',
    val: string
  ) => {
    const key = resolveSlotsKey(config, zone, sheetNum);
    const presetKey = zone === 'header' ? 'headerPreset' : 'footerPreset';
    onChange({
      ...config,
      [presetKey]: config[presetKey] === 'none' ? 'blank_3' : config[presetKey],
      [key]: {
        ...config[key],
        [slot]: val,
      },
    });
  };

  const handleUpdateImageInZone = (
    zone: 'header' | 'footer',
    sheetNum: number,
    updatedImg: A4HeaderFooterImage
  ) => {
    const latestConfig = configRef.current;
    const key = resolveSlotsKey(latestConfig, zone, sheetNum);
    const currentImages = latestConfig[key].images || [];
    onChange({
      ...latestConfig,
      // Si el usuario mueve la imagen, permitir que el alto automático se reajuste dinámicamente
      ...(zone === 'header'
        ? { customHeaderHeightPx: undefined }
        : { customFooterHeightPx: undefined }),
      [key]: {
        ...latestConfig[key],
        images: currentImages.map((img) => (img.id === updatedImg.id ? updatedImg : img)),
      },
    });
  };

  const handleStartDragMarginLine = (
    zone: 'header' | 'footer',
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    e.preventDefault();
    const startY = e.clientY;
    const startH =
      zone === 'header'
        ? getEffectiveZoneHeightPx(configRef.current, 'header')
        : getEffectiveZoneHeightPx(configRef.current, 'footer');

    const handleMove = (mv: MouseEvent) => {
      const dy = mv.clientY - startY;
      const nextH =
        zone === 'header'
          ? Math.max(48, Math.min(260, Math.round(startH + dy)))
          : Math.max(48, Math.min(260, Math.round(startH - dy)));

      const latest = configRef.current;
      onChange({
        ...latest,
        ...(zone === 'header'
          ? { customHeaderHeightPx: nextH }
          : { customFooterHeightPx: nextH }),
      });
    };

    const handleUp = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  };

  const handleDeleteImageInZone = (
    zone: 'header' | 'footer',
    sheetNum: number,
    imageId: string
  ) => {
    const key = resolveSlotsKey(config, zone, sheetNum);
    const currentImages = config[key].images || [];
    onChange({
      ...config,
      [key]: {
        ...config[key],
        images: currentImages.filter((img) => img.id !== imageId),
      },
    });
    if (selectedImageId === imageId) {
      setSelectedImageId(null);
    }
  };

  return (
    <>
      {sheets.map((sheetIdx) => {
        const sheetNum = sheetIdx + 1;
        const sheetTopPx = sheetIdx * STRIDE_PX;
        const sheetBottomPx = sheetTopPx + A4_HEIGHT_PX;

        const isHeaderEditing = activeZone === 'header' && activeSheetIndex === sheetIdx;
        const isFooterEditing = activeZone === 'footer' && activeSheetIndex === sheetIdx;
        const isAnyEditing = activeZone !== null;

        const headerSlotsKey = resolveSlotsKey(config, 'header', sheetNum);
        const footerSlotsKey = resolveSlotsKey(config, 'footer', sheetNum);

        const headerSlots = config[headerSlotsKey];
        const footerSlots = config[footerSlotsKey];

        const headerImages = headerSlots.images || [];
        const footerImages = footerSlots.images || [];

        const headerLabel =
          config.differentFirstPage && sheetNum === 1
            ? 'Encabezado en primera página'
            : config.differentOddEven
              ? sheetNum % 2 === 1
                ? 'Encabezado en página impar'
                : 'Encabezado en página par'
              : totalSheets > 1
                ? `Encabezado · Hoja ${sheetNum}`
                : 'Encabezado';

        const footerLabel =
          config.differentFirstPage && sheetNum === 1
            ? 'Pie de página en primera página'
            : config.differentOddEven
              ? sheetNum % 2 === 1
                ? 'Pie de página en página impar'
                : 'Pie de página en página par'
              : totalSheets > 1
                ? `Pie de página · Hoja ${sheetNum}`
                : 'Pie de página';

        return (
          <React.Fragment key={sheetIdx}>
            {/* ZONA MARGEN SUPERIOR (ENCABEZADO) */}
            <div
              style={{
                top: `${sheetTopPx}px`,
                height: `${headerZoneHeightPx}px`,
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onActivateZone('header', sheetIdx);
              }}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedImageId(null);
                onActivateZone('header', sheetIdx);
              }}
              title={
                !isAnyEditing
                  ? 'Clic para editar el encabezado (puedes pegar imágenes con Ctrl+V)'
                  : undefined
              }
              className={cn(
                'absolute left-0 right-0 z-20 transition-colors group/header select-none cursor-pointer',
                isAnyEditing
                  ? 'border-b border-dashed border-accent/50 bg-accent/[0.03]'
                  : 'hover:bg-accent/[0.02]'
              )}
            >
              {/* Línea divisoria punteada arrastrable + Etiqueta estilo Word/Veyra cuando se edita */}
              {isAnyEditing && (
                <div
                  onMouseDown={(e) => handleStartDragMarginLine('header', e)}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    onChange({ ...configRef.current, customHeaderHeightPx: undefined });
                  }}
                  title="Arrastra arriba o abajo para ajustar el margen del encabezado (doble clic para restablecer 2,5 cm)"
                  className="absolute -bottom-[10px] left-0 right-0 h-[20px] cursor-ns-resize z-40 flex items-center"
                >
                  <div className="ml-6 sm:ml-[30mm] mt-2 px-2 py-0.5 bg-veyra-card text-accent border border-accent/35 text-[10px] font-semibold rounded-b-md shadow-xs hover:bg-accent/10 transition-colors">
                    {headerLabel}
                  </div>
                </div>
              )}

              {/* Hint discreto al pasar el mouse cuando no se está editando */}
              {!isAnyEditing && (
                <div className="opacity-0 group-hover/header:opacity-100 transition-opacity absolute bottom-1 right-6 sm:right-[30mm] text-[10px] text-slate-400 dark:text-zinc-500 pointer-events-none flex items-center gap-1">
                  <span>Clic para editar encabezado</span>
                  <ChevronRight className="w-3 h-3" />
                </div>
              )}

              {/* Imágenes pegadas/insertadas en el Encabezado (movibles y redimensionables) */}
              {headerImages.map((img) => (
                <MovableResizableHeaderFooterImage
                  key={img.id}
                  image={img}
                  isEditingZone={isHeaderEditing}
                  isSelected={isHeaderEditing && selectedImageId === img.id}
                  onSelect={() => setSelectedImageId(img.id)}
                  onUpdate={(updated) =>
                    handleUpdateImageInZone('header', sheetNum, updated)
                  }
                  onDelete={() =>
                    handleDeleteImageInZone('header', sheetNum, img.id)
                  }
                />
              ))}

              {/* Contenido de texto del Encabezado ubicado a `headerDistanceCm` (1,25 cm default) desde arriba */}
              <div
                style={{ top: `${headerTopOffsetPx}px` }}
                className="absolute left-0 right-0"
              >
                <ZoneContentRenderer
                  zone="header"
                  preset={
                    config.differentFirstPage &&
                    sheetNum === 1 &&
                    !headerSlots.left &&
                    !headerSlots.center &&
                    !headerSlots.right
                      ? 'none'
                      : config.headerPreset
                  }
                  slots={headerSlots}
                  sheetNum={sheetNum}
                  totalSheets={totalSheets}
                  noteTitle={noteTitle}
                  authorName={authorName}
                  isEditing={isHeaderEditing}
                  activeSlot={activeSlot}
                  onSelectSlot={(slot) => {
                    setSelectedImageId(null);
                    onSelectSlot(slot);
                  }}
                  onChangeSlot={(slot, val) =>
                    handleSlotInputChange('header', sheetNum, slot, val)
                  }
                />
              </div>
            </div>

            {/* ZONA MARGEN INFERIOR (PIE DE PÁGINA) */}
            <div
              style={{
                top: `${sheetBottomPx - footerZoneHeightPx}px`,
                height: `${footerZoneHeightPx}px`,
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onActivateZone('footer', sheetIdx);
              }}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedImageId(null);
                onActivateZone('footer', sheetIdx);
              }}
              title={
                !isAnyEditing
                  ? 'Clic para editar el pie de página (puedes pegar imágenes con Ctrl+V)'
                  : undefined
              }
              className={cn(
                'absolute left-0 right-0 z-20 transition-colors group/footer select-none cursor-pointer',
                isAnyEditing
                  ? 'border-t border-dashed border-accent/50 bg-accent/[0.03]'
                  : 'hover:bg-accent/[0.02]'
              )}
            >
              {/* Línea divisoria punteada arrastrable + Etiqueta estilo Word/Veyra cuando se edita */}
              {isAnyEditing && (
                <div
                  onMouseDown={(e) => handleStartDragMarginLine('footer', e)}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    onChange({ ...configRef.current, customFooterHeightPx: undefined });
                  }}
                  title="Arrastra arriba o abajo para ajustar el margen del pie de página (doble clic para restablecer 2,5 cm)"
                  className="absolute -top-[10px] left-0 right-0 h-[20px] cursor-ns-resize z-40 flex items-center"
                >
                  <div className="ml-6 sm:ml-[30mm] mb-2 px-2 py-0.5 bg-veyra-card text-accent border border-accent/35 text-[10px] font-semibold rounded-t-md shadow-xs hover:bg-accent/10 transition-colors">
                    {footerLabel}
                  </div>
                </div>
              )}

              {/* Hint discreto al pasar el mouse */}
              {!isAnyEditing && (
                <div className="opacity-0 group-hover/footer:opacity-100 transition-opacity absolute top-1 right-6 sm:right-[30mm] text-[10px] text-slate-400 dark:text-zinc-500 pointer-events-none flex items-center gap-1">
                  <span>Clic para editar pie de página</span>
                  <ChevronRight className="w-3 h-3" />
                </div>
              )}

              {/* Imágenes pegadas/insertadas en el Pie de página */}
              {footerImages.map((img) => (
                <MovableResizableHeaderFooterImage
                  key={img.id}
                  image={img}
                  isEditingZone={isFooterEditing}
                  isSelected={isFooterEditing && selectedImageId === img.id}
                  onSelect={() => setSelectedImageId(img.id)}
                  onUpdate={(updated) =>
                    handleUpdateImageInZone('footer', sheetNum, updated)
                  }
                  onDelete={() =>
                    handleDeleteImageInZone('footer', sheetNum, img.id)
                  }
                />
              ))}

              {/* Contenido de texto del Pie de página ubicado a `footerDistanceCm` (1,25 cm default) desde abajo */}
              <div
                style={{ bottom: `${footerBottomOffsetPx}px` }}
                className="absolute left-0 right-0"
              >
                <ZoneContentRenderer
                  zone="footer"
                  preset={
                    config.differentFirstPage &&
                    sheetNum === 1 &&
                    !footerSlots.left &&
                    !footerSlots.center &&
                    !footerSlots.right
                      ? 'none'
                      : config.footerPreset
                  }
                  slots={footerSlots}
                  sheetNum={sheetNum}
                  totalSheets={totalSheets}
                  noteTitle={noteTitle}
                  authorName={authorName}
                  isEditing={isFooterEditing}
                  activeSlot={activeSlot}
                  onSelectSlot={(slot) => {
                    setSelectedImageId(null);
                    onSelectSlot(slot);
                  }}
                  onChangeSlot={(slot, val) =>
                    handleSlotInputChange('footer', sheetNum, slot, val)
                  }
                />
              </div>
            </div>
          </React.Fragment>
        );
      })}
    </>
  );
};

/**
 * Renderizador de cada diseño de plantilla de Word (Movimiento, Retrospectiva, Segmento 1, APA 7, En blanco)
 */
const ZoneContentRenderer: React.FC<{
  zone: 'header' | 'footer';
  preset: A4HeaderFooterPresetId;
  slots: A4ZoneSlots;
  sheetNum: number;
  totalSheets: number;
  noteTitle: string;
  authorName: string;
  isEditing: boolean;
  activeSlot: 'left' | 'center' | 'right';
  onSelectSlot: (slot: 'left' | 'center' | 'right') => void;
  onChangeSlot: (slot: 'left' | 'center' | 'right', val: string) => void;
}> = ({
  preset,
  slots,
  sheetNum,
  totalSheets,
  noteTitle,
  authorName,
  isEditing,
  activeSlot,
  onSelectSlot,
  onChangeSlot,
}) => {
  const ctx = { sheetNum, totalSheets, noteTitle, authorName };
  const isEven = sheetNum % 2 === 0;

  if (preset === 'none' && !isEditing) {
    return null;
  }

  // DISEÑO WORD 1: MOVIMIENTO (Página impar / Página par)
  if (preset === 'movimiento') {
    const slotKey = isEven ? 'left' : 'right';
    const rawVal = slots[slotKey] || '{title}';
    const titleVal = interpolateTokens(rawVal, ctx);
    return (
      <div className="w-full flex items-center text-xs relative z-20">
        {isEven ? (
          <div className="flex items-center gap-3">
            <div className="bg-[#F4B183] text-slate-800 font-semibold py-1 pl-6 sm:pl-[30mm] pr-4 min-w-[95px] text-right shadow-xs">
              {sheetNum}
            </div>
            {isEditing ? (
              <input
                type="text"
                value={slots.left}
                onFocus={() => onSelectSlot('left')}
                onChange={(e) => onChangeSlot('left', e.target.value)}
                placeholder="{title}"
                className="font-semibold text-slate-800 dark:text-zinc-200 bg-accent/10 border border-accent/40 rounded-md px-2 py-0.5 text-xs focus:outline-none"
              />
            ) : (
              <span className="font-semibold text-slate-800 dark:text-zinc-200">
                {titleVal}
              </span>
            )}
          </div>
        ) : (
          <div className="ml-auto flex items-center gap-3">
            {isEditing ? (
              <input
                type="text"
                value={slots.right}
                onFocus={() => onSelectSlot('right')}
                onChange={(e) => onChangeSlot('right', e.target.value)}
                placeholder="{title}"
                className="font-semibold text-slate-800 dark:text-zinc-200 bg-accent/10 border border-accent/40 rounded-md px-2 py-0.5 text-xs text-right focus:outline-none"
              />
            ) : (
              <span className="font-semibold text-slate-800 dark:text-zinc-200">
                {titleVal}
              </span>
            )}
            <div className="bg-[#F4B183] text-slate-800 font-semibold py-1 pl-4 pr-6 sm:pr-[30mm] min-w-[95px] text-left shadow-xs">
              {sheetNum}
            </div>
          </div>
        )}
      </div>
    );
  }

  // DISEÑO WORD 2: RETROSPECTIVA
  if (preset === 'retrospectiva') {
    const leftText = interpolateTokens(slots.left || '{title}', ctx);
    const rightText = interpolateTokens(slots.right || '{date}', ctx);
    return (
      <div className="px-6 sm:px-[30mm] w-full relative z-20">
        <div className="w-full bg-[#C55A44] border-b-[3px] border-[#4472C4] text-white px-3.5 py-1.5 flex items-center justify-between gap-3 text-[11px] font-medium uppercase tracking-wider shadow-xs">
          {isEditing ? (
            <>
              <input
                type="text"
                value={slots.left}
                onFocus={() => onSelectSlot('left')}
                onChange={(e) => onChangeSlot('left', e.target.value)}
                placeholder="{title}"
                className="flex-1 bg-white/15 border border-white/40 rounded px-2 py-0.5 text-white placeholder:text-white/60 text-[11px] uppercase focus:outline-none"
              />
              <input
                type="text"
                value={slots.right}
                onFocus={() => onSelectSlot('right')}
                onChange={(e) => onChangeSlot('right', e.target.value)}
                placeholder="{date}"
                className="w-36 bg-white/15 border border-white/40 rounded px-2 py-0.5 text-white placeholder:text-white/60 text-[11px] text-right uppercase focus:outline-none"
              />
            </>
          ) : (
            <>
              <span className="truncate max-w-[65%]">{leftText}</span>
              <span>{rightText}</span>
            </>
          )}
        </div>
      </div>
    );
  }

  // DISEÑO WORD 3: SEGMENTO 1
  if (preset === 'segmento' && !isEditing) {
    const leftText = interpolateTokens(slots.left, ctx);
    const centerText = interpolateTokens(slots.center, ctx);
    const rightText = interpolateTokens(slots.right || 'Página {page}', ctx);
    return (
      <div className="px-6 sm:px-[30mm] w-full flex items-center justify-between text-xs relative z-20">
        <span className="text-[#2F5597] dark:text-sky-400 font-semibold">{leftText}</span>
        <span className="text-[#2F5597] dark:text-sky-400 font-semibold">{centerText}</span>
        <span className="text-[#2F5597] dark:text-sky-400 font-semibold">{rightText}</span>
      </div>
    );
  }

  // MODO EDICIÓN O PLANTILLAS DE 3 COLUMNAS
  const hasAnyImages = Array.isArray(slots.images) && slots.images.length > 0;
  const hasAnyText = Boolean(slots.left || slots.center || slots.right);

  return (
    <div
      className={cn(
        'px-6 sm:px-[30mm] w-full flex items-center justify-between gap-3 text-xs text-slate-600 dark:text-zinc-400 relative',
        hasAnyImages && !hasAnyText ? 'z-10' : 'z-20'
      )}
    >
      {/* Columna Izquierda */}
      <div className="flex-1 flex items-center justify-start gap-2 min-w-0">
        {isEditing ? (
          <input
            type="text"
            value={slots.left}
            onFocus={() => onSelectSlot('left')}
            onChange={(e) => onChangeSlot('left', e.target.value)}
            placeholder={hasAnyImages ? '' : 'Izquierda (ej. {title})'}
            className={cn(
              'w-full bg-transparent px-2 py-0.5 rounded-md border text-xs focus:outline-none transition-colors',
              activeSlot === 'left' && (!hasAnyImages || slots.left)
                ? 'border-accent bg-accent/10 text-slate-900 dark:text-white'
                : hasAnyImages && !slots.left
                  ? 'border-transparent hover:border-slate-300/60 dark:hover:border-white/10 focus:border-accent text-slate-700 dark:text-zinc-300'
                  : 'border-slate-300/70 dark:border-white/10 hover:border-accent/50 text-slate-700 dark:text-zinc-300'
            )}
          />
        ) : (
          <span
            className={cn(
              'truncate',
              preset === 'apa7' && 'uppercase tracking-wide text-[11px]'
            )}
          >
            {interpolateTokens(slots.left, ctx)}
          </span>
        )}
      </div>

      {/* Columna Central */}
      <div className="flex-1 flex items-center justify-center gap-2 min-w-0 text-center">
        {isEditing ? (
          <input
            type="text"
            value={slots.center}
            onFocus={() => onSelectSlot('center')}
            onChange={(e) => onChangeSlot('center', e.target.value)}
            placeholder={hasAnyImages ? '' : 'Centro (ej. {date})'}
            className={cn(
              'w-full bg-transparent px-2 py-0.5 rounded-md border text-xs text-center focus:outline-none transition-colors',
              activeSlot === 'center' && (!hasAnyImages || slots.center)
                ? 'border-accent bg-accent/10 text-slate-900 dark:text-white'
                : hasAnyImages && !slots.center
                  ? 'border-transparent hover:border-slate-300/60 dark:hover:border-white/10 focus:border-accent text-slate-700 dark:text-zinc-300'
                  : 'border-slate-300/70 dark:border-white/10 hover:border-accent/50 text-slate-700 dark:text-zinc-300'
            )}
          />
        ) : (
          <span className="truncate">{interpolateTokens(slots.center, ctx)}</span>
        )}
      </div>

      {/* Columna Derecha */}
      <div className="flex-1 flex items-center justify-end gap-2 min-w-0 text-right">
        {isEditing ? (
          <input
            type="text"
            value={slots.right}
            onFocus={() => onSelectSlot('right')}
            onChange={(e) => onChangeSlot('right', e.target.value)}
            placeholder={hasAnyImages ? '' : 'Derecha (ej. Página {page})'}
            className={cn(
              'w-full bg-transparent px-2 py-0.5 rounded-md border text-xs text-right focus:outline-none transition-colors',
              activeSlot === 'right' && (!hasAnyImages || slots.right)
                ? 'border-accent bg-accent/10 text-slate-900 dark:text-white'
                : hasAnyImages && !slots.right
                  ? 'border-transparent hover:border-slate-300/60 dark:hover:border-white/10 focus:border-accent text-slate-700 dark:text-zinc-300'
                  : 'border-slate-300/70 dark:border-white/10 hover:border-accent/50 text-slate-700 dark:text-zinc-300'
            )}
          />
        ) : (
          <span className="truncate">{interpolateTokens(slots.right, ctx)}</span>
        )}
      </div>
    </div>
  );
};
