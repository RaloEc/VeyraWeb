import type { NotePage } from '../../../types/notes';
import type { PdfExportConfig } from './pdfExportTypes';
import { PAPER_SIZES } from './pdfExportTypes';
import {
  type A4HeaderFooterConfig,
  getEffectiveZoneHeightPx,
} from '../components/A4HeaderFooterTypes';
import { hydrateMathInHtml } from '../extensions/mathUtils';
import { sanitizeRichHtml } from '../../../lib/sanitizeHtml';
import katexCssRaw from 'katex/dist/katex.min.css?inline';

const KATEX_INLINE_CSS = katexCssRaw.replace(
  /url\(fonts\//g,
  'url(https://cdn.jsdelivr.net/npm/katex@0.19.1/dist/fonts/'
);

const GOOGLE_FONTS_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&family=Fira+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&family=Lora:ital,wght@0,400;0,600;1,400&family=Plus+Jakarta+Sans:ital,wght@0,400;0,600;0,700;1,400;1,600;1,700&family=Quicksand:wght@500;700&display=swap');`;

const UNICODE_FONT_FALLBACKS = `'Plus Jakarta Sans', Roboto, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif`;

export function getFontFamilyStack(fontFamily: PdfExportConfig['fontFamily']): string {
  switch (fontFamily) {
    case 'times':
      return `'Times New Roman', Times, 'Liberation Serif', serif, ${UNICODE_FONT_FALLBACKS}`;
    case 'arial':
      return `Arial, Helvetica, 'Liberation Sans', sans-serif, ${UNICODE_FONT_FALLBACKS}`;
    case 'calibri':
      return `Calibri, 'Segoe UI', Candara, 'Liberation Sans', sans-serif, ${UNICODE_FONT_FALLBACKS}`;
    case 'georgia':
      return `Georgia, 'Palatino Linotype', 'Book Antiqua', serif, ${UNICODE_FONT_FALLBACKS}`;
    case 'serif':
      return `'Lora', 'Georgia', 'Times New Roman', Cambria, ${UNICODE_FONT_FALLBACKS}`;
    case 'mono':
      return `'JetBrains Mono', 'Fira Code', 'Courier New', Courier, ${UNICODE_FONT_FALLBACKS}`;
    case 'fira':
      return `'Fira Sans', ${UNICODE_FONT_FALLBACKS}`;
    case 'script':
      return `'Caveat', 'Dancing Script', 'Comic Sans MS', cursive, ${UNICODE_FONT_FALLBACKS}`;
    case 'quicksand':
      return `'Quicksand', 'Nunito', ${UNICODE_FONT_FALLBACKS}`;
    case 'sans':
    default:
      return `'Inter', 'Plus Jakarta Sans', ${UNICODE_FONT_FALLBACKS}`;
  }
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function getEffectivePaperDimensions(config: PdfExportConfig): { widthMm: number; heightMm: number } {
  let baseWidth: number;
  let baseHeight: number;

  if (config.paperSizeId === 'custom' && config.customPaperWidthMm && config.customPaperHeightMm) {
    baseWidth = config.customPaperWidthMm;
    baseHeight = config.customPaperHeightMm;
  } else {
    const found = PAPER_SIZES.find((s) => s.id === config.paperSizeId) || PAPER_SIZES[6]; // default A4
    baseWidth = found.widthMm;
    baseHeight = found.heightMm;
  }

  if (config.orientation === 'landscape') {
    return {
      widthMm: Math.max(baseWidth, baseHeight),
      heightMm: Math.min(baseWidth, baseHeight),
    };
  }

  return {
    widthMm: Math.min(baseWidth, baseHeight),
    heightMm: Math.max(baseWidth, baseHeight),
  };
}

export interface BuildPdfHtmlOptions {
  isForPrint?: boolean;
  isDarkCanvas?: boolean;
  zoom?: number;
  headerFooterConfig?: A4HeaderFooterConfig | null;
  authorName?: string;
}

/**
 * Genera el bloque CSS reactivo que cambia con la configuración del usuario.
 */
export function buildDynamicPdfCss(
  config: PdfExportConfig,
  options: BuildPdfHtmlOptions = {}
): string {
  const { isForPrint = true, isDarkCanvas = true, zoom = 0.85 } = options;
  const { widthMm, heightMm } = getEffectivePaperDimensions(config);
  const fontStack = getFontFamilyStack(config.fontFamily);

  const PX_TO_MM = 25.4 / 96;
  const effectiveTopMm =
    config.includeHeader && options.headerFooterConfig
      ? Math.max(
        config.margins.top,
        Number((getEffectiveZoneHeightPx(options.headerFooterConfig, 'header') * PX_TO_MM).toFixed(2))
      )
      : config.margins.top;
  const effectiveBottomMm =
    config.includeFooter && options.headerFooterConfig
      ? Math.max(
        config.margins.bottom,
        Number((getEffectiveZoneHeightPx(options.headerFooterConfig, 'footer') * PX_TO_MM).toFixed(2))
      )
      : config.margins.bottom;

  const paragraphMarginRule =
    config.paragraphSpacing === 'compact'
      ? '0.15rem 0 0.35rem 0'
      : config.paragraphSpacing === 'relaxed'
        ? '0.4rem 0 0.8rem 0'
        : '0.25rem 0 0.5rem 0';

  return `
    @page {
      size: ${widthMm}mm ${heightMm}mm;
      margin: 0;
    }

    html, body {
      margin: 0;
      padding: 0;
      ${!isForPrint ? 'min-height: 100%; overflow: auto; -webkit-overflow-scrolling: touch;' : ''}
      background: ${!isForPrint ? (isDarkCanvas ? '#090A0C' : '#E2E8F0') : '#FFFFFF'};
      color: #1F2937;
      font-family: ${fontStack};
      font-size: ${config.fontSizePt}pt;
      line-height: ${config.lineHeight};
    }

    ${!isForPrint
      ? `
      #paged-output {
        padding: 24px 12px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 24px;
        box-sizing: border-box;
        zoom: ${zoom};
      }

      .pdf-page-sheet {
        width: ${widthMm}mm;
        height: ${heightMm}mm;
        min-height: ${heightMm}mm;
        max-height: ${heightMm}mm;
        padding: ${effectiveTopMm}mm ${config.margins.right}mm ${effectiveBottomMm}mm ${config.margins.left}mm;
        background: #FFFFFF;
        color: #1F2937;
        box-shadow: 0 6px 24px rgba(0, 0, 0, ${isDarkCanvas ? '0.65' : '0.14'});
        border: 1px solid ${isDarkCanvas ? 'rgba(255, 255, 255, 0.08)' : '#CBD5E1'};
        border-radius: 4px;
        position: relative;
        display: flex;
        flex-direction: column;
        box-sizing: border-box;
        overflow: hidden;
      }
    `
      : `
      #paged-output {
        padding: 0;
        margin: 0;
        width: ${widthMm}mm;
        display: block;
      }

      .pdf-page-sheet {
        width: ${widthMm}mm;
        height: ${heightMm}mm;
        min-height: ${heightMm}mm;
        max-height: ${heightMm}mm;
        padding: ${effectiveTopMm}mm ${config.margins.right}mm ${effectiveBottomMm}mm ${config.margins.left}mm;
        background: #FFFFFF;
        color: #1F2937;
        margin: 0;
        border: none;
        box-shadow: none;
        border-radius: 0;
        position: relative;
        display: flex;
        flex-direction: column;
        box-sizing: border-box;
        overflow: hidden;
      }
    `
    }

    @media print {
      html, body {
        background: transparent !important;
        width: ${widthMm}mm !important;
        height: auto !important;
        margin: 0 !important;
        padding: 0 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      #raw-document, script {
        display: none !important;
      }
      #paged-output {
        padding: 0 !important;
        margin: 0 !important;
        gap: 0 !important;
        width: ${widthMm}mm !important;
        display: block !important;
        transform: none !important;
      }
      .sheet-badge {
        display: none !important;
      }
      .pdf-page-sheet {
        width: ${widthMm}mm !important;
        height: ${heightMm}mm !important;
        max-height: ${heightMm}mm !important;
        min-height: ${heightMm}mm !important;
        padding: ${effectiveTopMm}mm ${config.margins.right}mm ${effectiveBottomMm}mm ${config.margins.left}mm !important;
        margin: 0 !important;
        border: none !important;
        box-shadow: none !important;
        border-radius: 0 !important;
        box-sizing: border-box !important;
        overflow: hidden !important;
        display: flex !important;
        flex-direction: column !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      .pdf-page-sheet:not(:last-child) {
        page-break-after: always !important;
        break-after: page !important;
      }
      .pdf-page-sheet:last-child {
        page-break-after: avoid !important;
        break-after: avoid !important;
      }
      .sheet-header {
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        width: 100% !important;
        height: ${effectiveTopMm}mm !important;
        box-sizing: border-box !important;
        overflow: visible !important;
        pointer-events: none !important;
        z-index: 10 !important;
        ${!config.includeHeader ? 'display: none !important;' : 'display: block !important;'}
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .sheet-footer {
        position: absolute !important;
        bottom: 0 !important;
        left: 0 !important;
        right: 0 !important;
        width: 100% !important;
        height: ${effectiveBottomMm}mm !important;
        box-sizing: border-box !important;
        overflow: visible !important;
        pointer-events: none !important;
        z-index: 10 !important;
        ${!config.includeFooter ? 'display: none !important;' : 'display: block !important;'}
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
    }

    .sheet-header {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      width: 100%;
      height: ${config.margins.top}mm;
      box-sizing: border-box;
      overflow: visible;
      pointer-events: none;
      z-index: 10;
      ${!config.includeHeader ? 'display: none !important;' : 'display: block;'}
    }

    .sheet-footer {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      width: 100%;
      height: ${config.margins.bottom}mm;
      box-sizing: border-box;
      overflow: visible;
      pointer-events: none;
      z-index: 10;
      ${!config.includeFooter ? 'display: none !important;' : 'display: block;'}
    }

    p {
      margin: ${paragraphMarginRule};
      line-height: ${config.lineHeight};
      text-align: ${config.textAlign};
      ${config.firstLineIndentMm > 0 ? `text-indent: ${config.firstLineIndentMm}mm;` : ''}
      min-height: 1.25em;
    }

    p:empty::before,
    p:blank::before {
      content: "\\00a0";
      visibility: hidden;
      display: inline-block;
    }
  `;
}

/**
 * Normaliza las etiquetas <img> en el HTML para asegurar que los anchos porcentuales
 * (ej. presets 25%, 50%, 75%, 100%) se apliquen vía CSS (`width: X%`) y no como píxeles HTML (`width="75"` = 75px).
 */
export function normalizeImagesInHtml(html: string): string {
  if (!html) return html;
  return html.replace(/<img\b([^>]*?)(\/?)>/gi, (match, attrs, selfClose) => {
    // Si ya tiene ancho porcentual en su atributo style, mantenerlo
    if (/style=["'][^"']*width:\s*\d+%/i.test(attrs)) {
      return match;
    }

    const widthAttrMatch = attrs.match(/\b(?:data-)?width=["']?(\d+)%?["']?/i);
    if (widthAttrMatch) {
      const val = parseInt(widthAttrMatch[1], 10);
      if (val > 0 && val <= 100) {
        if (/style=["']/i.test(attrs)) {
          return `<img ${attrs.replace(/style=["']([^"']*)["']/i, `style="$1; width: ${val}%;"`)}${selfClose ? ' /' : ''}>`;
        } else {
          return `<img ${attrs.trim()} style="width: ${val}%;"${selfClose ? ' /' : ''}>`;
        }
      }
    }
    return match;
  });
}

/**
 * Normaliza el contenido HTML de cada hoja para la exportación a PDF:
 * 1. Asegura que los anchos porcentuales de imágenes se apliquen vía CSS.
 * 2. Garantiza que los párrafos vacíos (<p></p> o <p>&nbsp;</p>) generados por presionar Enter
 *    se conserven con altura de línea física completa (<p><br></p>) y no colapsen a 0px.
 */
export function normalizeContentHtmlForPdf(html: string): string {
  if (!html) return '<p><br></p>';
  let processed = normalizeImagesInHtml(html);

  // Convertir párrafos vacíos (<p></p>, <p> </p>, <p>&nbsp;</p>) en párrafos con <br>
  // para que el motor de paginación del PDF preserve los saltos de línea y espaciados (Enters)
  processed = processed.replace(/<p(\s+[^>]*)?>(\s*|&nbsp;)?<\/p>/gi, '<p$1><br></p>');

  return processed;
}

/**
 * Genera el documento HTML con motor de paginación precisa por hojas físicas (A4, Carta, etc.)
 */
export function buildPdfDocumentHtml(
  title: string,
  pages: NotePage[],
  config: PdfExportConfig,
  options: BuildPdfHtmlOptions = {}
): string {
  const { isForPrint = true } = options;
  const cleanTitle = title?.trim() || 'Nota sin título';

  const currentDateFormatted = new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  const dynamicCss = buildDynamicPdfCss(config, options);

  const rawHojasHtml = pages
    .map(
      (p, idx) => `
      <div class="raw-hoja" data-hoja-index="${idx}">
        ${sanitizeRichHtml(normalizeContentHtmlForPdf(hydrateMathInHtml(p.content || '<p><br></p>')))}
      </div>
    `
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(cleanTitle)}</title>
  <style id="katex-inline-css">
    ${KATEX_INLINE_CSS}
  </style>
  <style id="pdf-static-styles">
    ${GOOGLE_FONTS_IMPORT}

    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    html, body {
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    /* Etiqueta flotante con número de hoja física en vista previa */
    .sheet-badge {
      position: absolute;
      top: 8px;
      right: 12px;
      font-size: 10px;
      font-family: system-ui, sans-serif;
      font-weight: 600;
      color: #94A3B8;
      background: #F1F5F9;
      border: 1px solid #E2E8F0;
      padding: 1px 7px;
      border-radius: 9999px;
      letter-spacing: 0.02em;
      pointer-events: none;
    }

    @media print {
      .sheet-badge {
        display: none !important;
      }
    }

    .sheet-body {
      flex: 1;
      width: 100%;
      min-height: 0;
      overflow: hidden;
      box-sizing: border-box;
    }

    /* Encabezado de página */
    .sheet-header {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      width: 100%;
      height: ${config.margins.top}mm;
      font-size: 8.5pt;
      color: #64748B;
      box-sizing: border-box;
      overflow: visible;
      pointer-events: none;
      z-index: 10;
    }

    /* Pie de página con numeración y fecha */
    .sheet-footer {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      width: 100%;
      height: ${config.margins.bottom}mm;
      font-size: 8.5pt;
      color: #64748B;
      box-sizing: border-box;
      overflow: visible;
      pointer-events: none;
      z-index: 10;
    }

    .sheet-header-inner,
    .sheet-footer-inner {
      position: absolute;
      left: 0;
      right: 0;
      width: 100%;
      box-sizing: border-box;
      pointer-events: none;
    }

    .hf-image {
      position: absolute !important;
      margin: 0 !important;
      padding: 0 !important;
      border: none !important;
      border-radius: 0 !important;
      max-width: none !important;
      pointer-events: none !important;
      user-select: none !important;
      box-sizing: border-box !important;
    }

    .hf-standard-slots {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      position: relative;
    }
    .hf-col {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .hf-left { text-align: left; }
    .hf-center { text-align: center; }
    .hf-right { text-align: right; }

    .hf-movimiento {
      width: 100%;
      display: flex;
      align-items: center;
      font-size: 8.5pt;
    }
    .hf-movimiento.even { justify-content: flex-start; gap: 8px; }
    .hf-movimiento.odd { justify-content: flex-end; gap: 8px; margin-left: auto; }
    .hf-badge {
      background: #F4B183;
      color: #1E293B;
      font-weight: 700;
      padding: 2px 10px;
      border-radius: 2px;
    }
    .hf-title {
      font-weight: 600;
      color: #334155;
    }

    .hf-retrospectiva {
      width: 100%;
      background: #C55A44;
      border-bottom: 2px solid #4472C4;
      color: #FFFFFF;
      padding: 4px 10px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 8pt;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .hf-segmento {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 8.5pt;
      font-weight: 600;
      color: #2F5597;
    }

    .hf-apa7 {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 8.5pt;
      font-family: 'Times New Roman', Times, serif;
    }
    .hf-apa-title {
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    /* Formato tipográfico */
    h1 {
      font-size: 1.5em;
      font-weight: 700;
      color: #0F172A;
      margin: 16px 0 8px 0;
      line-height: 1.25;
    }

    h2 {
      font-size: 1.25em;
      font-weight: 700;
      color: #1E293B;
      margin: 14px 0 6px 0;
      line-height: 1.3;
    }

    h3 {
      font-size: 1.1em;
      font-weight: 600;
      color: #334155;
      margin: 12px 0 5px 0;
      line-height: 1.35;
    }

    blockquote {
      border-left: 3px solid #6366F1;
      margin: 10px 0;
      padding: 6px 14px;
      color: #475569;
      background-color: #F8FAFC;
      border-radius: 0 4px 4px 0;
      font-style: italic;
    }

    /* Custom Counter Styles for Parenthesized Numbering in PDF */
    @counter-style decimal-paren {
      system: numeric;
      symbols: "0" "1" "2" "3" "4" "5" "6" "7" "8" "9";
      suffix: ") ";
    }

    @counter-style lower-alpha-paren {
      system: alphabetic;
      symbols: "a" "b" "c" "d" "e" "f" "g" "h" "i" "j" "k" "l" "m" "n" "o" "p" "q" "r" "s" "t" "u" "v" "w" "x" "y" "z";
      suffix: ") ";
    }

    ul, ol {
      margin: 6px 0 10px 0;
      padding-left: 22px;
    }

    ol:not([data-list-style]),
    ol[data-list-style="decimal"] {
      list-style-type: decimal !important;
    }

    ol[data-list-style="decimal-paren"] {
      list-style-type: decimal-paren !important;
    }
    ol[data-list-style="decimal-paren"] > li::marker {
      content: counter(list-item) ") ";
    }

    ol[data-list-style="upper-roman"] {
      list-style-type: upper-roman !important;
    }
    ol[data-list-style="upper-roman"] > li::marker {
      content: counter(list-item, upper-roman) ". ";
    }

    ol[data-list-style="upper-alpha"] {
      list-style-type: upper-alpha !important;
    }
    ol[data-list-style="upper-alpha"] > li::marker {
      content: counter(list-item, upper-alpha) ". ";
    }

    ol[data-list-style="lower-alpha-paren"] {
      list-style-type: lower-alpha-paren !important;
    }
    ol[data-list-style="lower-alpha-paren"] > li::marker {
      content: counter(list-item, lower-alpha) ") ";
    }

    ol[data-list-style="lower-alpha"] {
      list-style-type: lower-alpha !important;
    }
    ol[data-list-style="lower-alpha"] > li::marker {
      content: counter(list-item, lower-alpha) ". ";
    }

    ol[data-list-style="lower-roman"] {
      list-style-type: lower-roman !important;
    }
    ol[data-list-style="lower-roman"] > li::marker {
      content: counter(list-item, lower-roman) ". ";
    }

    li {
      margin-bottom: 3px;
    }

    /* Math Formulas (KaTeX) Layout in PDF */
    .veyra-math-block, [data-type="math-block"] {
      display: block;
      margin: 12px 0;
      text-align: center;
      page-break-inside: avoid;
      break-inside: avoid;
      overflow-x: auto;
    }

    .veyra-math-inline, [data-type="math-inline"] {
      display: inline-flex;
      align-items: baseline;
      vertical-align: baseline;
      margin: 0 1px;
    }

    .katex {
      font-size: 1.05em;
      text-rendering: auto;
      line-height: normal !important;
      white-space: nowrap;
    }

    .katex, .katex * {
      box-sizing: content-box !important;
    }

    .katex-display {
      margin: 0.6em 0 !important;
      text-align: center !important;
      line-height: normal !important;
    }

    .katex-mathml {
      display: none !important;
    }

    ul[data-type="taskList"] {
      list-style: none;
      padding-left: 2px;
      margin: 6px 0 10px 0;
    }

    li[data-type="taskItem"] {
      display: flex;
      align-items: flex-start;
      gap: 7px;
      margin-bottom: 5px;
    }

    li[data-type="taskItem"] label {
      margin-right: 5px;
      user-select: none;
    }

    li[data-type="taskItem"] input[type="checkbox"] {
      width: 13px;
      height: 13px;
      margin-top: 3px;
      accent-color: #6366F1;
    }

    li[data-type="taskItem"]:not(:has(input))::before {
      content: "";
      display: inline-block;
      width: 12px;
      height: 12px;
      margin-top: 3px;
      margin-right: 7px;
      border-radius: 3px;
      border: 1.5px solid #6366F1;
      flex-shrink: 0;
    }

    li[data-type="taskItem"][data-checked="true"]:not(:has(input))::before {
      background-color: #6366F1;
      box-shadow: inset 0 0 0 2px #FFFFFF;
    }

    .sheet-body img {
      max-width: 100% !important;
      height: auto !important;
      border-radius: 4px;
      margin: 10px auto;
      display: block;
    }

    .sheet-body img[style*="text-align: left"],
    .sheet-body img[data-text-align="left"] {
      margin-left: 0 !important;
      margin-right: auto !important;
    }

    .sheet-body img[style*="text-align: right"],
    .sheet-body img[data-text-align="right"] {
      margin-left: auto !important;
      margin-right: 0 !important;
    }

    .sheet-body img[style*="text-align: center"],
    .sheet-body img[data-text-align="center"] {
      margin-left: auto !important;
      margin-right: auto !important;
    }

    code {
      background-color: #F1F5F9;
      color: #9333EA;
      padding: 1px 4px;
      border-radius: 3px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.9em;
    }

    pre {
      background-color: #0F172A;
      color: #F8FAFC;
      padding: 10px 14px;
      border-radius: 6px;
      font-size: 0.85em;
      line-height: 1.45;
      margin: 10px 0;
      overflow: hidden;
    }

    pre code {
      background: transparent;
      color: inherit;
      padding: 0;
    }

    mark {
      background-color: #FEF08A;
      padding: 1px 3px;
      border-radius: 2px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin: 10px 0 0 0;
      font-size: 0.9em;
      page-break-inside: auto;
    }

    .tableWrapper {
      margin: 10px 0 0 0;
      padding: 0;
      max-width: 100%;
    }

    .tableWrapper table {
      margin: 0 !important;
    }

    table + h1, .tableWrapper + h1 {
      margin-top: 16px !important;
    }

    table + h2, .tableWrapper + h2 {
      margin-top: 14px !important;
    }

    table + h3, .tableWrapper + h3 {
      margin-top: 12px !important;
    }

    table + p, .tableWrapper + p {
      margin-top: 10px !important;
    }

    table + table, .tableWrapper + .tableWrapper {
      margin-top: 10px !important;
    }

    table[data-table-align="center"]:not([style*="width"]),
    table[align="center"]:not([style*="width"]) {
      width: fit-content !important;
      max-width: 100% !important;
    }

    table[data-table-align="right"]:not([style*="width"]),
    table[align="right"]:not([style*="width"]) {
      width: fit-content !important;
      max-width: 100% !important;
    }

    table[data-table-align="center"],
    table[align="center"] {
      margin-left: auto !important;
      margin-right: auto !important;
    }

    table[data-table-align="right"],
    table[align="right"] {
      margin-left: auto !important;
      margin-right: 0 !important;
    }

    table[data-table-align="left"],
    table[align="left"] {
      margin-left: 0 !important;
      margin-right: auto !important;
    }

    tr {
      page-break-inside: avoid;
      page-break-after: auto;
    }

    th, td {
      border: 1px solid #94A3B8;
      padding: 5px 9px;
      vertical-align: middle;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      line-height: 1.35;
    }

    table p {
      margin: 0 !important;
      line-height: 1.35 !important;
    }

    th {
      background-color: #F8FAFC;
      font-weight: 600;
    }
  </style>
  <style id="dynamic-config-styles">
    ${dynamicCss}
  </style>
</head>
<body>
  <div id="raw-document" style="display: none;">
    ${rawHojasHtml}
  </div>

  <div id="paged-output"></div>

  <script>
    (function() {
      var activeConfig = ${JSON.stringify(config).replace(/</g, '\\u003c')};
      var isForPrint = ${isForPrint};
      var hfConfig = ${JSON.stringify(options.headerFooterConfig || null).replace(/</g, '\\u003c')};
      var authorName = ${JSON.stringify(options.authorName || '').replace(/</g, '\\u003c')};
      var noteTitle = ${JSON.stringify(cleanTitle).replace(/</g, '\\u003c')};
      var currentDateFormatted = '${currentDateFormatted}';

      window.__updatePdfPreview = function(newCss, newConfig) {
        var dynEl = document.getElementById('dynamic-config-styles');
        if (dynEl && newCss) {
          dynEl.textContent = newCss;
        }
        if (newConfig) {
          activeConfig = newConfig;
        }
        runPaginator();
      };

      window.addEventListener('message', function(ev) {
        if (!ev || !ev.data) return;
        if (ev.data.type === 'VEYRA_PDF_UPDATE_PREVIEW') {
          window.__updatePdfPreview(ev.data.css, ev.data.config);
        } else if (ev.data.type === 'VEYRA_PDF_SCROLL_TO') {
          var targetSheet = document.querySelector('[data-sheet-num="' + Number(ev.data.sheetIndex) + '"]');
          if (targetSheet && typeof targetSheet.scrollIntoView === 'function') {
            targetSheet.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }
      });

      function runPaginator() {
        var rawDoc = document.getElementById('raw-document');
        var output = document.getElementById('paged-output');
        if (!rawDoc || !output) return;

        output.innerHTML = '';

        var cfg = activeConfig;
        var hasHeader = !!cfg.includeHeader;
        var hasFooter = !!cfg.includeFooter;
        var sheetCount = 0;
        var currentSheet = null;
        var currentBody = null;

        function getZoneSlots(zone, sheetNum) {
          if (!hfConfig) return null;
          if (hfConfig.differentFirstPage && sheetNum === 1) {
            return zone === 'header' ? hfConfig.firstPageHeaderSlots : hfConfig.firstPageFooterSlots;
          }
          if (hfConfig.differentOddEven && sheetNum % 2 === 0) {
            return zone === 'header' ? hfConfig.evenPageHeaderSlots : hfConfig.evenPageFooterSlots;
          }
          return zone === 'header' ? hfConfig.headerSlots : hfConfig.footerSlots;
        }

        function getZonePreset(zone) {
          if (!hfConfig) return 'none';
          return zone === 'header' ? (hfConfig.headerPreset || 'none') : (hfConfig.footerPreset || 'none');
        }

        function interpolateText(raw, sheetNum, total) {
          if (!raw) return '';
          return raw
            .replace(/\{page\}/gi, String(sheetNum))
            .replace(/\{total\}/gi, String(total))
            .replace(/\{date\}/gi, currentDateFormatted)
            .replace(/\{time\}/gi, new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(new Date()))
            .replace(/\{title\}/gi, noteTitle)
            .replace(/\{author\}/gi, authorName);
        }

        function renderZoneHtml(zone, sheetNum, total) {
          var preset = getZonePreset(zone);
          var slots = getZoneSlots(zone, sheetNum);
          var isEven = (sheetNum % 2 === 0);
          var textContentHtml = '';

          var headerDistCm = (hfConfig && typeof hfConfig.headerDistanceCm === 'number') ? hfConfig.headerDistanceCm : 1.25;
          var footerDistCm = (hfConfig && typeof hfConfig.footerDistanceCm === 'number') ? hfConfig.footerDistanceCm : 1.25;

          if (preset === 'movimiento') {
            if (isEven) {
              var leftVal = interpolateText((slots && slots.left) || '{title}', sheetNum, total);
              textContentHtml = '<div class="hf-movimiento even"><div class="hf-badge">' + sheetNum + '</div><div class="hf-title">' + leftVal + '</div></div>';
            } else {
              var rightVal = interpolateText((slots && slots.right) || '{title}', sheetNum, total);
              textContentHtml = '<div class="hf-movimiento odd"><div class="hf-title">' + rightVal + '</div><div class="hf-badge">' + sheetNum + '</div></div>';
            }
          } else if (preset === 'retrospectiva') {
            var leftText = interpolateText((slots && slots.left) || '{title}', sheetNum, total);
            var rightText = interpolateText((slots && slots.right) || (zone === 'header' ? '{date}' : 'Página {page}'), sheetNum, total);
            textContentHtml = '<div class="hf-retrospectiva"><div class="hf-ret-left">' + leftText + '</div><div class="hf-ret-right">' + rightText + '</div></div>';
          } else if (preset === 'segmento') {
            var leftText = interpolateText(slots ? slots.left : '', sheetNum, total);
            var centerText = interpolateText(slots ? slots.center : '', sheetNum, total);
            var rightText = interpolateText((slots && slots.right) || 'Página {page}', sheetNum, total);
            textContentHtml = '<div class="hf-segmento"><span>' + leftText + '</span><span>' + centerText + '</span><span>' + rightText + '</span></div>';
          } else if (preset === 'apa7') {
            var leftText = interpolateText((slots && slots.left) || '{title}', sheetNum, total);
            var rightText = String(sheetNum);
            textContentHtml = '<div class="hf-apa7"><span class="hf-apa-title">' + leftText + '</span><span>' + rightText + '</span></div>';
          } else {
            var hasCustomSlots = slots && (slots.left || slots.center || slots.right);
            if (!hasCustomSlots && preset === 'none') {
              if (zone === 'header') {
                var headerTitleText = cfg.includeHeaderTitle ? noteTitle : '';
                var headerDateText = cfg.includeHeaderDate ? currentDateFormatted : '';
                if (headerTitleText || headerDateText) {
                  textContentHtml = '<div class="hf-standard-slots"><div class="hf-col hf-left font-medium" style="color: #64748B;">' + headerTitleText + '</div><div class="hf-col hf-center"></div><div class="hf-col hf-right" style="color: #94A3B8;">' + headerDateText + '</div></div>';
                }
              } else {
                var leftDate = cfg.includeDate ? currentDateFormatted : '';
                var rightPage = cfg.includePageNumbers ? ('Página ' + sheetNum + ' de ' + total) : '';
                if (leftDate || rightPage) {
                  textContentHtml = '<div class="hf-standard-slots"><div class="hf-col hf-left" style="color: #94A3B8;">' + leftDate + '</div><div class="hf-col hf-center"></div><div class="hf-col hf-right" style="color: #94A3B8;">' + rightPage + '</div></div>';
                }
              }
            } else {
              var left = interpolateText(slots ? slots.left : '', sheetNum, total);
              var center = interpolateText(slots ? slots.center : '', sheetNum, total);
              var right = interpolateText(slots ? slots.right : '', sheetNum, total);

              // Si en slots se usó {title} por defecto pero se desactivó explícitamente includeHeaderTitle
              if (zone === 'header' && cfg.includeHeaderTitle === false && slots && slots.left === '{title}') {
                left = '';
              }

              if (zone === 'footer' && !right && cfg.includePageNumbers) {
                right = 'Página ' + sheetNum + ' de ' + total;
              }
              if (zone === 'footer' && !left && cfg.includeDate) {
                left = currentDateFormatted;
              }

              if (left || center || right) {
                textContentHtml = '<div class="hf-standard-slots"><div class="hf-col hf-left">' + left + '</div><div class="hf-col hf-center">' + center + '</div><div class="hf-col hf-right">' + right + '</div></div>';
              }
            }
          }

          var imagesHtml = '';
          if (slots && Array.isArray(slots.images) && slots.images.length > 0) {
            slots.images.forEach(function(img) {
              if (img && img.src) {
                imagesHtml += '<img class="hf-image" src="' + img.src + '" style="position: absolute; left: ' + (img.x || 0) + 'px; top: ' + (img.y || 0) + 'px; width: ' + (img.width || 80) + 'px !important; height: ' + (img.height || 40) + 'px !important; object-fit: contain;" />';
              }
            });
          }

          if (!imagesHtml && !textContentHtml) {
            return '';
          }

          var innerWrapper = '';
          if (textContentHtml) {
            if (zone === 'header') {
              innerWrapper = '<div class="sheet-header-inner" style="top: ' + headerDistCm + 'cm; padding-left: ' + cfg.margins.left + 'mm; padding-right: ' + cfg.margins.right + 'mm;">' + textContentHtml + '</div>';
            } else {
              innerWrapper = '<div class="sheet-footer-inner" style="bottom: ' + footerDistCm + 'cm; padding-left: ' + cfg.margins.left + 'mm; padding-right: ' + cfg.margins.right + 'mm;">' + textContentHtml + '</div>';
            }
          }

          return imagesHtml + innerWrapper;
        }

        function createNewSheet() {
          sheetCount++;
          var sheet = document.createElement('div');
          sheet.className = 'pdf-page-sheet';
          sheet.setAttribute('data-sheet-num', sheetCount);

          var badge = document.createElement('div');
          badge.className = 'sheet-badge';
          badge.textContent = 'Hoja ' + sheetCount;
          sheet.appendChild(badge);

          var header = document.createElement('div');
          header.className = 'sheet-header';
          if (!hasHeader) {
            header.style.display = 'none';
          }
          sheet.appendChild(header);

          var body = document.createElement('div');
          body.className = 'sheet-body';
          sheet.appendChild(body);

          var footer = document.createElement('div');
          footer.className = 'sheet-footer';
          if (!hasFooter) {
            footer.style.display = 'none';
          }
          sheet.appendChild(footer);

          output.appendChild(sheet);

          currentSheet = sheet;
          currentBody = body;
          return sheet;
        }

        function checkOverflow(container) {
          if (container.scrollHeight > container.clientHeight) return true;
          var last = container.lastElementChild;
          if (!last) return false;
          var cRect = container.getBoundingClientRect();
          var lRect = last.getBoundingClientRect();
          if (cRect.height > 0 && lRect.bottom > (cRect.bottom - 4)) return true;
          return false;
        }

        function trimLeadingWhitespace(rootEl) {
          while (rootEl.firstChild) {
            var first = rootEl.firstChild;
            if (first.nodeType === 3) {
              var trimmed = (first.textContent || '').replace(/^\s+/, '');
              if (!trimmed) {
                rootEl.removeChild(first);
                continue;
              }
              first.textContent = trimmed;
              break;
            }
            if (first.nodeType === 1) {
              if (first.tagName === 'BR') {
                rootEl.removeChild(first);
                continue;
              }
              if (!(first.textContent || '').trim() && !first.querySelector('img, svg')) {
                rootEl.removeChild(first);
                continue;
              }
              trimLeadingWhitespace(first);
              break;
            }
            break;
          }
        }

        function splitOverflowingParagraph(pEl, container) {
          if (
            typeof document.createTreeWalker !== 'function' ||
            typeof document.createRange !== 'function'
          ) {
            return null;
          }
          var cRect = container.getBoundingClientRect();
          if (!cRect || cRect.height <= 0) return null;
          var maxBottom = cRect.bottom - 4;

          var textNodes = [];
          var walker = document.createTreeWalker(pEl, NodeFilter.SHOW_TEXT, null);
          var curNode = walker.nextNode();
          while (curNode) {
            if (curNode.textContent && curNode.textContent.trim().length > 0) {
              textNodes.push(curNode);
            }
            curNode = walker.nextNode();
          }
          if (textNodes.length === 0) return null;

          var words = [];
          var range = document.createRange();
          for (var tIdx = 0; tIdx < textNodes.length; tIdx++) {
            var tn = textNodes[tIdx];
            var txt = tn.textContent || '';
            var re = /\S+/gu;
            var m;
            while ((m = re.exec(txt)) !== null) {
              try {
                range.setStart(tn, m.index);
                range.setEnd(tn, m.index + m[0].length);
                var rects = range.getClientRects();
                if (rects.length > 0) {
                  var r = rects[0];
                  words.push({
                    top: r.top,
                    bottom: r.bottom,
                    node: tn,
                    endOffset: m.index + m[0].length,
                  });
                }
              } catch (e) {}
            }
          }
          if (words.length < 2) return null;

          var lines = [];
          var currentLine = [words[0]];
          for (var wIdx = 1; wIdx < words.length; wIdx++) {
            var w = words[wIdx];
            var prevW = currentLine[currentLine.length - 1];
            var prevCenter = (prevW.top + prevW.bottom) / 2;
            var curCenter = (w.top + w.bottom) / 2;
            if (Math.abs(curCenter - prevCenter) < 10) {
              currentLine.push(w);
            } else {
              lines.push(currentLine);
              currentLine = [w];
            }
          }
          if (currentLine.length > 0) lines.push(currentLine);
          if (lines.length <= 1) return null;

          var lastFittingIdx = -1;
          for (var lIdx = 0; lIdx < lines.length; lIdx++) {
            var lineBottom = lines[lIdx][0].bottom;
            for (var j = 1; j < lines[lIdx].length; j++) {
              if (lines[lIdx][j].bottom > lineBottom) lineBottom = lines[lIdx][j].bottom;
            }
            if (lineBottom <= maxBottom) {
              lastFittingIdx = lIdx;
            } else {
              break;
            }
          }

          var linesOnCurr = lastFittingIdx + 1;
          // Control de huérfanas (mínimo 2 líneas arriba)
          if (linesOnCurr < 2) return null;

          // Control de viudas (si queda 1 línea sola abajo, retroceder 1)
          var remaining = lines.length - linesOnCurr;
          if (remaining === 1) {
            if (linesOnCurr > 2) {
              lastFittingIdx -= 1;
            } else {
              return null;
            }
          }

          var splitLineWords = lines[lastFittingIdx];
          var lastWord = splitLineWords[splitLineWords.length - 1];
          try {
            var extractRange = document.createRange();
            extractRange.setStart(pEl, 0);
            extractRange.setEnd(lastWord.node, lastWord.endOffset);
            var firstFrag = extractRange.extractContents();
            var firstEl = pEl.cloneNode(false);
            firstEl.appendChild(firstFrag);
            trimLeadingWhitespace(pEl);
            pEl.style.textIndent = '0';
            if (!(pEl.textContent || '').trim()) return null;
            return { firstEl: firstEl, restEl: pEl };
          } catch (e) {
            return null;
          }
        }

        createNewSheet();

        // Normalizar anchos y alineación de imágenes
        Array.from(rawDoc.querySelectorAll('img')).forEach(function(img) {
          var widthAttr = img.getAttribute('width');
          var dataWidth = img.getAttribute('data-width');
          var w = dataWidth || widthAttr;
          if (w && !isNaN(Number(w))) {
            var num = Number(w);
            if (num > 0 && num <= 100 && (!img.style.width || !img.style.width.includes('%'))) {
              img.style.width = num + '%';
            }
          }
          var textAlign = img.getAttribute('data-text-align') || img.style.textAlign;
          if (textAlign === 'left') {
            img.style.marginLeft = '0';
            img.style.marginRight = 'auto';
          } else if (textAlign === 'right') {
            img.style.marginLeft = 'auto';
            img.style.marginRight = '0';
          } else {
            img.style.marginLeft = 'auto';
            img.style.marginRight = 'auto';
          }
        });

        // Asegurar que todos los párrafos vacíos contengan al menos un <br> para respetar saltos de línea (Enters)
        Array.from(rawDoc.querySelectorAll('p')).forEach(function(pEl) {
          if (!pEl.childNodes.length || (pEl.childNodes.length === 1 && pEl.textContent.trim() === '')) {
            if (!pEl.querySelector('br')) {
              pEl.innerHTML = '<br>';
            }
          }
        });

        var rawHojas = Array.from(rawDoc.querySelectorAll('.raw-hoja'));

        rawHojas.forEach(function(hoja, hojaIdx) {
          if (cfg.breakBetweenHojas && hojaIdx > 0 && currentBody.children.length > 0) {
            createNewSheet();
          }

          var elements = Array.from(hoja.children);
          elements.forEach(function(el) {
            if ((el.tagName === 'UL' || el.tagName === 'OL') && el.children.length > 1) {
              var currentList = el.cloneNode(false);
              currentBody.appendChild(currentList);

              var childrenArr = Array.from(el.children);
              var isOrdered = el.tagName === 'OL';
              var isReversed = isOrdered && el.hasAttribute('reversed');
              var step = isReversed ? -1 : 1;
              var rawStart = isOrdered && el.hasAttribute('start') ? parseInt(el.getAttribute('start'), 10) : NaN;
              var liCount = childrenArr.filter(function(c) { return c.tagName === 'LI'; }).length;
              var nextNumber = !isNaN(rawStart) ? rawStart : (isReversed ? liCount : 1);

              childrenArr.forEach(function(li) {
                var itemNumber = null;
                if (isOrdered && li.tagName === 'LI') {
                  var rawVal = li.hasAttribute('value') ? parseInt(li.getAttribute('value'), 10) : NaN;
                  itemNumber = !isNaN(rawVal) ? rawVal : nextNumber;
                  nextNumber = itemNumber + step;
                }

                var liClone = li.cloneNode(true);
                currentList.appendChild(liClone);

                if (checkOverflow(currentBody)) {
                  if (currentList.children.length > 1 || currentBody.children.length > 1) {
                    currentList.removeChild(liClone);
                    if (currentList.children.length === 0) {
                      currentBody.removeChild(currentList);
                    }
                    createNewSheet();
                    currentList = el.cloneNode(false);
                    if (isOrdered) {
                      var continuedStart = itemNumber !== null ? itemNumber : nextNumber;
                      currentList.setAttribute('start', String(continuedStart));
                    }
                    currentBody.appendChild(currentList);
                    currentList.appendChild(liClone);
                  }
                }
              });
              return;
            }

            var clone = el.cloneNode(true);
            currentBody.appendChild(clone);

            if (checkOverflow(currentBody)) {
              if (
                clone.tagName === 'P' &&
                !(clone.querySelector && clone.querySelector('img, table, iframe'))
              ) {
                while (clone && checkOverflow(currentBody)) {
                  var splitResult = splitOverflowingParagraph(clone, currentBody);
                  if (splitResult) {
                    currentBody.replaceChild(splitResult.firstEl, clone);
                    createNewSheet();
                    clone = splitResult.restEl;
                    currentBody.appendChild(clone);
                  } else {
                    if (currentBody.children.length > 1) {
                      currentBody.removeChild(clone);
                      createNewSheet();
                      currentBody.appendChild(clone);
                    }
                    break;
                  }
                }
              } else if (currentBody.children.length > 1) {
                currentBody.removeChild(clone);
                createNewSheet();
                currentBody.appendChild(clone);
              }
            }
          });
        });

        var allSheets = Array.from(output.querySelectorAll('.pdf-page-sheet'));
        var total = allSheets.length;

        allSheets.forEach(function(sheet, idx) {
          var sheetNum = idx + 1;
          var badge = sheet.querySelector('.sheet-badge');
          if (badge) {
            badge.textContent = 'Hoja ' + sheetNum + ' / ' + total;
          }

          var header = sheet.querySelector('.sheet-header');
          if (header) {
            if (!hasHeader) {
              header.style.display = 'none';
            } else {
              var headerHtml = renderZoneHtml('header', sheetNum, total);
              if (!headerHtml) {
                header.style.display = 'none';
              } else {
                header.style.display = 'block';
                header.innerHTML = headerHtml;
              }
            }
          }

          var footer = sheet.querySelector('.sheet-footer');
          if (footer) {
            if (!hasFooter) {
              footer.style.display = 'none';
            } else {
              var footerHtml = renderZoneHtml('footer', sheetNum, total);
              if (!footerHtml) {
                footer.style.display = 'none';
              } else {
                footer.style.display = 'block';
                footer.innerHTML = footerHtml;
              }
            }
          }
        });

        try {
          window.__veyra_pagination_ready = true;
          window.parent.postMessage({ type: 'VEYRA_PDF_PAGES_COUNT', count: total }, '*');
        } catch(e) {}
      }

      var hasStartedPagination = false;
      function safeRunPaginator() {
        hasStartedPagination = true;
        try {
          runPaginator();
        } catch (err) {
          var rawDoc = document.getElementById('raw-document');
          var output = document.getElementById('paged-output');
          if (rawDoc && output && output.children.length === 0) {
            output.innerHTML = '<div class="pdf-page-sheet"><div class="sheet-body">' + rawDoc.innerHTML + '</div></div>';
          }
        }
      }

      function init() {
        var fallbackTimer = setTimeout(function() {
          if (!hasStartedPagination) safeRunPaginator();
        }, 500);

        if (document.fonts && document.fonts.ready) {
          document.fonts.ready
            .then(function() {
              clearTimeout(fallbackTimer);
              runWhenImagesLoaded();
            })
            .catch(function() {
              clearTimeout(fallbackTimer);
              runWhenImagesLoaded();
            });
        } else {
          clearTimeout(fallbackTimer);
          runWhenImagesLoaded();
        }
      }

      function runWhenImagesLoaded() {
        var imgs = Array.from(document.images);
        if (imgs.length === 0) {
          safeRunPaginator();
          return;
        }
        var pending = imgs.length;
        var imgFallback = setTimeout(safeRunPaginator, 1500);
        function done() {
          pending--;
          if (pending <= 0) {
            clearTimeout(imgFallback);
            safeRunPaginator();
          }
        }
        imgs.forEach(function(img) {
          if (img.complete) {
            done();
          } else {
            img.addEventListener('load', done);
            img.addEventListener('error', done);
          }
        });
        if (pending <= 0) {
          clearTimeout(imgFallback);
          safeRunPaginator();
        }
      }

      if (document.readyState === 'complete') {
        init();
      } else {
        window.addEventListener('load', init);
      }
    })();
  </script>
</body>
</html>`;
}
