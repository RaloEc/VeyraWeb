import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Printer,
  FileDown,
  RotateCcw,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  AlignLeft,
  AlignJustify,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { NotePage } from '../../../types/notes';
import {
  type PaperSizeId,
  type MarginPresetId,
  type PdfExportConfig,
  type MarginsMm,
  PAPER_SIZES,
  MARGIN_PRESETS,
  DEFAULT_PDF_CONFIG,
} from './pdfExportTypes';
import {
  buildPdfDocumentHtml,
  buildDynamicPdfCss,
  getEffectivePaperDimensions,
} from './pdfTemplateBuilder';
import { printHtmlDocument } from './pdfPrintService';
import { useTheme } from '../../../theme/ThemeProvider';
import { cn } from '../../../lib/utils';
import { toast } from 'sonner';

export interface ExportPdfModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  pages: NotePage[];
}

export const ExportPdfModal: React.FC<ExportPdfModalProps> = ({
  isOpen,
  onClose,
  title,
  pages,
}) => {
  const { isDark } = useTheme();
  const [config, setConfig] = useState<PdfExportConfig>(DEFAULT_PDF_CONFIG);
  const [isExporting, setIsExporting] = useState(false);
  const [previewZoom, setPreviewZoom] = useState<number>(0.85);
  const [totalPagesCount, setTotalPagesCount] = useState<number>(pages.length || 1);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const previewIframeRef = useRef<HTMLIFrameElement>(null);

  // Escuchar tecla Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isExporting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isExporting, onClose]);

  // Escuchar mensaje del iframe con el conteo exacto de páginas tras la paginación
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === 'VEYRA_PDF_PAGES_COUNT') {
        const count = Math.max(1, parseInt(e.data.count, 10) || 1);
        setTotalPagesCount(count);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Medidas efectivas en mm y cm
  const { widthMm, heightMm } = useMemo(
    () => getEffectivePaperDimensions(config),
    [config]
  );

  // HTML generado para la previsualización en vivo (con canvas según modo claro/oscuro)
  const previewHtml = useMemo(() => {
    if (!isOpen) return '';
    return buildPdfDocumentHtml(title, pages, config, {
      isForPrint: false,
      isDarkCanvas: isDark,
      zoom: previewZoom,
    });
  }, [isOpen, title, pages, config, isDark, previewZoom]);

  const isIframeLoadedRef = useRef(false);

  // Resetear estado del iframe si cambian las páginas o el título de la nota
  useEffect(() => {
    isIframeLoadedRef.current = false;
  }, [title, pages]);

  // Inyectar HTML en el iframe de previsualización o actualizar en caliente sin parpadeo
  useEffect(() => {
    if (!isOpen) {
      isIframeLoadedRef.current = false;
      return;
    }
    const iframe = previewIframeRef.current;
    if (!iframe) return;

    const win = iframe.contentWindow as any;
    const doc = iframe.contentDocument || win?.document;

    // Si el iframe ya está inicializado y tiene el método en caliente, actualizar al instante sin parpadeo
    if (isIframeLoadedRef.current && win && typeof win.__updatePdfPreview === 'function' && doc) {
      const dynamicCss = buildDynamicPdfCss(config, {
        isForPrint: false,
        isDarkCanvas: isDark,
        zoom: previewZoom,
      });
      win.__updatePdfPreview(dynamicCss, config);
      return;
    }

    // Primera carga al abrir el modal
    if (doc) {
      doc.open();
      doc.write(previewHtml);
      doc.close();
      isIframeLoadedRef.current = true;
    }
  }, [isOpen, config, isDark, previewZoom, previewHtml]);

  // Navegar suavemente a una hoja física específica en la vista previa
  const scrollToSheet = useCallback((sheetIndex: number) => {
    const iframe = previewIframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;

    const targetSheet = doc.querySelector(`[data-sheet-num="${sheetIndex}"]`);
    if (targetSheet) {
      targetSheet.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setCurrentPage(sheetIndex);
    }
  }, []);

  if (!isOpen) return null;

  // Manejadores
  const handlePaperSizeChange = (id: PaperSizeId) => {
    setConfig((prev) => ({
      ...prev,
      paperSizeId: id,
    }));
  };

  const handleMarginPresetChange = (presetId: MarginPresetId) => {
    if (presetId === 'custom') {
      setConfig((prev) => ({ ...prev, marginPresetId: 'custom' }));
      return;
    }
    const preset = MARGIN_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      setConfig((prev) => ({
        ...prev,
        marginPresetId: presetId,
        margins: { ...preset.margins },
      }));
    }
  };

  const handleCustomMarginChange = (side: keyof MarginsMm, cmValue: number) => {
    const mmValue = Math.max(0, Math.min(100, (isNaN(cmValue) ? 0 : cmValue) * 10));
    setConfig((prev) => ({
      ...prev,
      marginPresetId: 'custom',
      margins: {
        ...prev.margins,
        [side]: mmValue,
      },
    }));
  };

  const handleExecuteExport = async () => {
    try {
      setIsExporting(true);
      const printHtml = buildPdfDocumentHtml(title, pages, config, { isForPrint: true });
      await printHtmlDocument(printHtml);
      toast.success('Documento preparado en alta definición vectorial');
      onClose();
    } catch (err: any) {
      console.error('[ExportPdfModal] Error exportando PDF:', err);
      toast.error(err?.message || 'Error al exportar nota a PDF');
    } finally {
      setIsExporting(false);
    }
  };

  const handleResetDefaults = () => {
    setConfig(DEFAULT_PDF_CONFIG);
    setCurrentPage(1);
    toast.info('Valores restablecidos');
  };

  const activePaperOption =
    PAPER_SIZES.find((s) => s.id === config.paperSizeId) || PAPER_SIZES[6];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/70 animate-in fade-in duration-100 select-none">
      {/* Contenedor Modal: 100% FLAT Y SÓLIDO (sin transparencias) */}
      <div className="w-full max-w-6xl h-[92vh] max-h-[860px] bg-white dark:bg-[#121214] border border-slate-200 dark:border-zinc-800 rounded-xl shadow-2xl flex flex-col overflow-hidden text-slate-800 dark:text-zinc-100">
        
        {/* Cabecera FLAT */}
        <div className="h-13 px-5 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between shrink-0 bg-white dark:bg-[#121214]">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-md bg-accent/15 text-accent flex items-center justify-center">
              <FileDown className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-bold text-slate-900 dark:text-zinc-100 tracking-tight">
                  Exportar nota a PDF
                </h2>
                <span className="px-2 py-0.5 rounded bg-accent/10 text-accent font-semibold text-[10px] border border-accent/25">
                  {totalPagesCount} {totalPagesCount === 1 ? 'página' : 'páginas'} en total
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400 truncate max-w-md">
                {title || 'Nota sin título'} • {pages.length} {pages.length === 1 ? 'sección' : 'secciones de Veyra'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetDefaults}
              title="Restablecer configuración predeterminada"
              className="px-2.5 py-1 rounded-md text-[11px] text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors flex items-center gap-1.5 cursor-pointer font-medium"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Restablecer</span>
            </button>
            <div className="w-[1px] h-4 bg-slate-200 dark:bg-zinc-800 mx-1" />
            <button
              type="button"
              onClick={onClose}
              disabled={isExporting}
              className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Cuerpo: Panel Lateral de Opciones Continuas + Vista Previa */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
          
          {/* Panel Izquierdo: TODAS LAS OPCIONES HACIA ABAJO (SIN TABS) */}
          <div className="w-full md:w-[360px] border-r border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-[#141417] flex flex-col shrink-0 overflow-y-auto">
            <div className="p-4 space-y-5 text-xs">

              {/* SECCIÓN 1: PÁGINA Y ORIENTACIÓN */}
              <div className="space-y-3">
                <span className="block text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
                  1. Página y Formato
                </span>

                {/* Selector de Tamaño de Papel */}
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-zinc-300 mb-1.5">
                    Tamaño de papel
                  </label>
                  <div className="relative">
                    <select
                      value={config.paperSizeId}
                      onChange={(e) => handlePaperSizeChange(e.target.value as PaperSizeId)}
                      className="w-full bg-white dark:bg-[#1B1B1F] border border-slate-200 dark:border-zinc-700/80 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-zinc-100 appearance-none cursor-pointer focus:outline-none focus:border-accent"
                    >
                      {PAPER_SIZES.map((size) => (
                        <option key={size.id} value={size.id} className="bg-white dark:bg-[#1B1B1F] text-slate-900 dark:text-zinc-100">
                          {size.name} ({size.description})
                        </option>
                      ))}
                      <option value="custom" className="bg-white dark:bg-[#1B1B1F] text-slate-900 dark:text-zinc-100">
                        Personalizado (Definir cm)
                      </option>
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 absolute right-3 top-2.5 pointer-events-none" />
                  </div>
                </div>

                {/* Campos si es tamaño personalizado */}
                {config.paperSizeId === 'custom' && (
                  <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-white dark:bg-[#1B1B1F] border border-slate-200 dark:border-zinc-800">
                    <div>
                      <label className="block text-[10px] text-slate-500 dark:text-zinc-400 mb-1">Ancho (cm)</label>
                      <input
                        type="number"
                        step="0.1"
                        min="5"
                        max="100"
                        value={((config.customPaperWidthMm || 210) / 10).toFixed(1)}
                        onChange={(e) =>
                          setConfig((prev) => ({
                            ...prev,
                            customPaperWidthMm: parseFloat(e.target.value || '21') * 10,
                          }))
                        }
                        className="w-full bg-slate-50 dark:bg-[#141417] border border-slate-200 dark:border-zinc-700 rounded px-2 py-1 text-xs text-slate-900 dark:text-zinc-100"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500 dark:text-zinc-400 mb-1">Alto (cm)</label>
                      <input
                        type="number"
                        step="0.1"
                        min="5"
                        max="100"
                        value={((config.customPaperHeightMm || 297) / 10).toFixed(1)}
                        onChange={(e) =>
                          setConfig((prev) => ({
                            ...prev,
                            customPaperHeightMm: parseFloat(e.target.value || '29.7') * 10,
                          }))
                        }
                        className="w-full bg-slate-50 dark:bg-[#141417] border border-slate-200 dark:border-zinc-700 rounded px-2 py-1 text-xs text-slate-900 dark:text-zinc-100"
                      />
                    </div>
                  </div>
                )}

                {/* Orientación */}
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-zinc-300 mb-1.5">
                    Orientación
                  </label>
                  <div className="grid grid-cols-2 gap-2 bg-white dark:bg-[#1B1B1F] p-1 rounded-lg border border-slate-200 dark:border-zinc-700/80">
                    <button
                      type="button"
                      onClick={() => setConfig((prev) => ({ ...prev, orientation: 'portrait' }))}
                      className={cn(
                        'flex items-center justify-center gap-2 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer',
                        config.orientation === 'portrait'
                          ? 'bg-accent/15 text-accent font-semibold'
                          : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                      )}
                    >
                      <div className="w-3 h-4 border border-current rounded-xs" />
                      <span>Vertical</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfig((prev) => ({ ...prev, orientation: 'landscape' }))}
                      className={cn(
                        'flex items-center justify-center gap-2 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer',
                        config.orientation === 'landscape'
                          ? 'bg-accent/15 text-accent font-semibold'
                          : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                      )}
                    >
                      <div className="w-4 h-3 border border-current rounded-xs" />
                      <span>Horizontal</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* SEPARADOR FLAT */}
              <div className="border-t border-slate-200 dark:border-zinc-800" />

              {/* SECCIÓN 2: MÁRGENES */}
              <div className="space-y-3">
                <span className="block text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
                  2. Márgenes
                </span>

                {/* Preset de márgenes */}
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-zinc-300 mb-1.5">
                    Preajuste de márgenes
                  </label>
                  <div className="relative">
                    <select
                      value={config.marginPresetId}
                      onChange={(e) => handleMarginPresetChange(e.target.value as MarginPresetId)}
                      className="w-full bg-white dark:bg-[#1B1B1F] border border-slate-200 dark:border-zinc-700/80 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-zinc-100 appearance-none cursor-pointer focus:outline-none focus:border-accent"
                    >
                      {MARGIN_PRESETS.map((preset) => (
                        <option key={preset.id} value={preset.id} className="bg-white dark:bg-[#1B1B1F] text-slate-900 dark:text-zinc-100">
                          {preset.name} ({preset.description})
                        </option>
                      ))}
                      <option value="custom" className="bg-white dark:bg-[#1B1B1F] text-slate-900 dark:text-zinc-100">
                        Personalizado (Editar medidas)
                      </option>
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 absolute right-3 top-2.5 pointer-events-none" />
                  </div>
                </div>

                {/* Cuadrícula de 4 lados en cm */}
                <div className="p-3 rounded-lg bg-white dark:bg-[#1B1B1F] border border-slate-200 dark:border-zinc-800 space-y-2">
                  <div className="text-[10px] font-medium text-slate-500 dark:text-zinc-400">
                    Medidas por lado (en centímetros):
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="block text-[10px] text-slate-400 dark:text-zinc-500 mb-0.5">Superior</span>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="10"
                        value={(config.margins.top / 10).toFixed(1)}
                        onChange={(e) => handleCustomMarginChange('top', parseFloat(e.target.value))}
                        className="w-full bg-slate-50 dark:bg-[#141417] border border-slate-200 dark:border-zinc-700 rounded px-2 py-1 text-xs text-slate-900 dark:text-zinc-100 font-medium"
                      />
                    </div>
                    <div>
                      <span className="block text-[10px] text-slate-400 dark:text-zinc-500 mb-0.5">Inferior</span>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="10"
                        value={(config.margins.bottom / 10).toFixed(1)}
                        onChange={(e) => handleCustomMarginChange('bottom', parseFloat(e.target.value))}
                        className="w-full bg-slate-50 dark:bg-[#141417] border border-slate-200 dark:border-zinc-700 rounded px-2 py-1 text-xs text-slate-900 dark:text-zinc-100 font-medium"
                      />
                    </div>
                    <div>
                      <span className="block text-[10px] text-slate-400 dark:text-zinc-500 mb-0.5">Izquierdo</span>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="10"
                        value={(config.margins.left / 10).toFixed(1)}
                        onChange={(e) => handleCustomMarginChange('left', parseFloat(e.target.value))}
                        className="w-full bg-slate-50 dark:bg-[#141417] border border-slate-200 dark:border-zinc-700 rounded px-2 py-1 text-xs text-slate-900 dark:text-zinc-100 font-medium"
                      />
                    </div>
                    <div>
                      <span className="block text-[10px] text-slate-400 dark:text-zinc-500 mb-0.5">Derecho</span>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="10"
                        value={(config.margins.right / 10).toFixed(1)}
                        onChange={(e) => handleCustomMarginChange('right', parseFloat(e.target.value))}
                        className="w-full bg-slate-50 dark:bg-[#141417] border border-slate-200 dark:border-zinc-700 rounded px-2 py-1 text-xs text-slate-900 dark:text-zinc-100 font-medium"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* SEPARADOR FLAT */}
              <div className="border-t border-slate-200 dark:border-zinc-800" />

              {/* SECCIÓN 3: TIPOGRAFÍA Y PÁRRAFO */}
              <div className="space-y-3">
                <span className="block text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
                  3. Tipografía y Párrafo
                </span>

                {/* Fuente */}
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-zinc-300 mb-1.5">
                    Fuente
                  </label>
                  <div className="relative">
                    <select
                      value={config.fontFamily}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          fontFamily: e.target.value as PdfExportConfig['fontFamily'],
                        }))
                      }
                      className="w-full bg-white dark:bg-[#1B1B1F] border border-slate-200 dark:border-zinc-700/80 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-zinc-100 appearance-none cursor-pointer focus:outline-none focus:border-accent"
                    >
                      <optgroup label="Normas APA / Word clásicas">
                        <option value="times">Times New Roman (APA - 12 pt)</option>
                        <option value="arial">Arial (APA - 11 pt)</option>
                        <option value="calibri">Calibri (Word / APA - 11 pt)</option>
                        <option value="georgia">Georgia (APA - 11 pt)</option>
                      </optgroup>
                      <optgroup label="Estilos Veyra">
                        <option value="sans">Moderna (Plus Jakarta Sans)</option>
                        <option value="fira">Fira Sans</option>
                        <option value="serif">Elegante (Lora Serif)</option>
                        <option value="mono">Código (JetBrains Mono)</option>
                        <option value="quicksand">Geométrica (Quicksand)</option>
                        <option value="script">Manuscrita (Caveat)</option>
                      </optgroup>
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 absolute right-3 top-2.5 pointer-events-none" />
                  </div>
                </div>

                {/* Tamaño e Interlineado */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-slate-500 dark:text-zinc-400 mb-1">Tamaño fuente</label>
                    <select
                      value={config.fontSizePt}
                      onChange={(e) => setConfig((prev) => ({ ...prev, fontSizePt: parseInt(e.target.value, 10) }))}
                      className="w-full bg-white dark:bg-[#1B1B1F] border border-slate-200 dark:border-zinc-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-zinc-100"
                    >
                      <option value="9">9 pt</option>
                      <option value="10">10 pt</option>
                      <option value="11">11 pt</option>
                      <option value="12">12 pt</option>
                      <option value="13">13 pt</option>
                      <option value="14">14 pt</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-500 dark:text-zinc-400 mb-1">Interlineado</label>
                    <select
                      value={config.lineHeight}
                      onChange={(e) => setConfig((prev) => ({ ...prev, lineHeight: parseFloat(e.target.value) }))}
                      className="w-full bg-white dark:bg-[#1B1B1F] border border-slate-200 dark:border-zinc-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-zinc-100"
                    >
                      <option value="1.15">1.15</option>
                      <option value="1.25">1.25</option>
                      <option value="1.5">1.50</option>
                      <option value="2.0">2.00</option>
                    </select>
                  </div>
                </div>

                {/* Sangría y Alineación */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-slate-500 dark:text-zinc-400 mb-1">Sangría 1ª línea</label>
                    <select
                      value={config.firstLineIndentMm}
                      onChange={(e) => setConfig((prev) => ({ ...prev, firstLineIndentMm: parseFloat(e.target.value) }))}
                      className="w-full bg-white dark:bg-[#1B1B1F] border border-slate-200 dark:border-zinc-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-zinc-100"
                    >
                      <option value="0">0 cm</option>
                      <option value="5">0.5 cm</option>
                      <option value="10">1.0 cm</option>
                      <option value="12.5">1.25 cm</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-500 dark:text-zinc-400 mb-1">Alineación</label>
                    <div className="grid grid-cols-2 gap-1 bg-white dark:bg-[#1B1B1F] p-0.5 border border-slate-200 dark:border-zinc-700/80 rounded-lg">
                      <button
                        type="button"
                        onClick={() => setConfig((prev) => ({ ...prev, textAlign: 'left' }))}
                        title="Alinear a la izquierda"
                        className={cn(
                          'py-1 rounded flex items-center justify-center transition-colors cursor-pointer',
                          config.textAlign === 'left'
                            ? 'bg-accent/15 text-accent font-semibold'
                            : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
                        )}
                      >
                        <AlignLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfig((prev) => ({ ...prev, textAlign: 'justify' }))}
                        title="Justificado"
                        className={cn(
                          'py-1 rounded flex items-center justify-center transition-colors cursor-pointer',
                          config.textAlign === 'justify'
                            ? 'bg-accent/15 text-accent font-semibold'
                            : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
                        )}
                      >
                        <AlignJustify className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Espaciado de párrafo */}
                <div>
                  <label className="block text-[10px] text-slate-500 dark:text-zinc-400 mb-1">Espacio entre párrafos</label>
                  <div className="grid grid-cols-3 gap-1 bg-white dark:bg-[#1B1B1F] p-0.5 border border-slate-200 dark:border-zinc-700/80 rounded-lg">
                    {(['compact', 'normal', 'relaxed'] as const).map((spacing) => (
                      <button
                        key={spacing}
                        type="button"
                        onClick={() => setConfig((prev) => ({ ...prev, paragraphSpacing: spacing }))}
                        className={cn(
                          'py-1 px-1.5 rounded text-[11px] font-medium transition-colors cursor-pointer text-center',
                          config.paragraphSpacing === spacing
                            ? 'bg-accent/15 text-accent font-semibold'
                            : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
                        )}
                      >
                        {spacing === 'compact' ? 'Compacto' : spacing === 'normal' ? 'Normal' : 'Amplio'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* SEPARADOR FLAT */}
              <div className="border-t border-slate-200 dark:border-zinc-800" />

              {/* SECCIÓN 4: ESTRUCTURA Y OPCIONES */}
              <div className="space-y-2.5">
                <span className="block text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
                  4. Estructura y Encabezado
                </span>

                <label className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-[#1B1B1F] border border-slate-200 dark:border-zinc-800 cursor-pointer">
                  <span className="text-[11px] font-medium text-slate-700 dark:text-zinc-200">
                    Nueva página por hoja de Veyra
                  </span>
                  <input
                    type="checkbox"
                    checked={config.breakBetweenHojas}
                    onChange={(e) => setConfig((prev) => ({ ...prev, breakBetweenHojas: e.target.checked }))}
                    className="w-3.5 h-3.5 rounded accent-accent cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-[#1B1B1F] border border-slate-200 dark:border-zinc-800 cursor-pointer">
                  <span className="text-[11px] font-medium text-slate-700 dark:text-zinc-200">
                    Numeración de páginas en pie
                  </span>
                  <input
                    type="checkbox"
                    checked={config.includePageNumbers}
                    onChange={(e) => setConfig((prev) => ({ ...prev, includePageNumbers: e.target.checked }))}
                    className="w-3.5 h-3.5 rounded accent-accent cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-[#1B1B1F] border border-slate-200 dark:border-zinc-800 cursor-pointer">
                  <span className="text-[11px] font-medium text-slate-700 dark:text-zinc-200">
                    Incluir fecha actual
                  </span>
                  <input
                    type="checkbox"
                    checked={config.includeDate}
                    onChange={(e) => setConfig((prev) => ({ ...prev, includeDate: e.target.checked }))}
                    className="w-3.5 h-3.5 rounded accent-accent cursor-pointer"
                  />
                </label>
              </div>

            </div>
          </div>

          {/* Panel Derecho: Previsualización en Vivo de las Hojas Físicas */}
          <div className="flex-1 flex flex-col bg-slate-200/80 dark:bg-[#090A0C] overflow-hidden min-h-0">
            
            {/* Barra superior de la previsualización con Navegación y Conteo Real de Páginas */}
            <div className="h-10 px-4 border-b border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#121214] flex items-center justify-between shrink-0 text-xs text-slate-600 dark:text-zinc-400">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-800 dark:text-zinc-200">Vista previa</span>
                <span className="text-slate-300 dark:text-zinc-700">•</span>
                
                {/* Conteo destacado de cuántas hojas físicas tiene la nota */}
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-accent/15 text-accent font-semibold text-[11px] border border-accent/25">
                  <span>{totalPagesCount} {totalPagesCount === 1 ? 'página' : 'páginas'}</span>
                </div>

                <span className="text-slate-300 dark:text-zinc-700">•</span>
                <span className="text-[11px] text-slate-500 dark:text-zinc-400 hidden sm:inline">
                  {activePaperOption.name} ({config.orientation === 'portrait' ? 'Vertical' : 'Horizontal'}) — {(widthMm / 10).toFixed(1)} × {(heightMm / 10).toFixed(1)} cm
                </span>
              </div>

              {/* Controles de Navegación entre Hojas y Zoom */}
              <div className="flex items-center gap-3">
                {/* Selector rápido para saltar entre páginas */}
                {totalPagesCount > 1 && (
                  <div className="flex items-center gap-1 bg-slate-100 dark:bg-zinc-800/80 px-1.5 py-0.5 rounded-lg border border-slate-200 dark:border-zinc-700/60 text-[11px]">
                    <button
                      type="button"
                      disabled={currentPage <= 1}
                      onClick={() => scrollToSheet(currentPage - 1)}
                      title="Hoja anterior"
                      className="p-0.5 rounded hover:bg-white dark:hover:bg-zinc-700 disabled:opacity-30 cursor-pointer"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <span className="font-medium px-1 text-slate-700 dark:text-zinc-300">
                      {currentPage} / {totalPagesCount}
                    </span>
                    <button
                      type="button"
                      disabled={currentPage >= totalPagesCount}
                      onClick={() => scrollToSheet(currentPage + 1)}
                      title="Hoja siguiente"
                      className="p-0.5 rounded hover:bg-white dark:hover:bg-zinc-700 disabled:opacity-30 cursor-pointer"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Controles de Zoom */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPreviewZoom((z) => Math.max(0.4, Number((z - 0.1).toFixed(2))))}
                    title="Reducir zoom"
                    className="p-1 rounded hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-500 dark:text-zinc-400 transition-colors cursor-pointer"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[10px] font-mono min-w-[32px] text-center font-medium">
                    {Math.round(previewZoom * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => setPreviewZoom((z) => Math.min(1.5, Number((z + 0.1).toFixed(2))))}
                    title="Aumentar zoom"
                    className="p-1 rounded hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-500 dark:text-zinc-400 transition-colors cursor-pointer"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewZoom(0.85)}
                    title="Ajuste óptimo (85%)"
                    className="px-2 py-0.5 text-[10px] rounded hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-400 transition-colors cursor-pointer ml-0.5 font-medium"
                  >
                    Ajustar
                  </button>
                </div>
              </div>
            </div>

            {/* Lienzo con iframe que renderiza todas las hojas físicas en secuencia con su badge */}
            <div className="flex-1 w-full h-full overflow-hidden bg-slate-200/90 dark:bg-[#090A0C]">
              <iframe
                ref={previewIframeRef}
                title="Previsualización de Documento PDF"
                className="w-full h-full border-0 pointer-events-auto block"
              />
            </div>
          </div>
        </div>

        {/* Pie del Modal FLAT */}
        <div className="h-14 px-5 border-t border-slate-200 dark:border-zinc-800 flex items-center justify-between shrink-0 bg-white dark:bg-[#121214]">
          <div className="text-[11px] text-slate-500 dark:text-zinc-400 hidden sm:block">
            <span>Se generará un documento de {totalPagesCount} {totalPagesCount === 1 ? 'página' : 'páginas'} listo para imprimir o guardar como PDF.</span>
          </div>

          <div className="flex items-center gap-2.5 ml-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={isExporting}
              className="px-4 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300 transition-colors text-xs font-medium cursor-pointer disabled:opacity-50"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleExecuteExport}
              disabled={isExporting}
              title="Exporta el documento a PDF vectorial nativo (texto 100% seleccionable y fórmulas nítidas)"
              className="px-4 py-1.5 rounded-lg bg-accent hover:opacity-90 text-white transition-opacity text-xs font-medium flex items-center gap-2 cursor-pointer shadow-sm disabled:opacity-50"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>
                {isExporting
                  ? 'Preparando documento...'
                  : `Guardar como PDF (${totalPagesCount} ${totalPagesCount === 1 ? 'pág' : 'págs'})`}
              </span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
