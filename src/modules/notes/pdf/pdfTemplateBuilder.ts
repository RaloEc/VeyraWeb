import type { NotePage } from '../../../types/notes';
import type { PdfExportConfig } from './pdfExportTypes';
import { PAPER_SIZES } from './pdfExportTypes';
import { hydrateMathInHtml } from '../extensions/mathUtils';
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
      background: ${!isForPrint ? (isDarkCanvas ? '#090A0C' : '#E2E8F0') : '#FFFFFF'};
      color: #1F2937;
      font-family: ${fontStack};
      font-size: ${config.fontSizePt}pt;
      line-height: ${config.lineHeight};
    }

    ${!isForPrint
      ? `
      #paged-output {
        padding: 32px 16px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 28px;
        box-sizing: border-box;
        transform: scale(${zoom});
        transform-origin: top center;
      }

      .pdf-page-sheet {
        width: ${widthMm}mm;
        height: ${heightMm}mm;
        min-height: ${heightMm}mm;
        max-height: ${heightMm}mm;
        padding: ${config.margins.top}mm ${config.margins.right}mm ${config.margins.bottom}mm ${config.margins.left}mm;
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
        padding: ${config.margins.top}mm ${config.margins.right}mm ${config.margins.bottom}mm ${config.margins.left}mm;
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
        padding: ${config.margins.top}mm ${config.margins.right}mm ${config.margins.bottom}mm ${config.margins.left}mm !important;
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
    }

    .sheet-footer {
      ${!config.includePageNumbers && !config.includeDate ? 'display: none !important;' : 'display: flex;'}
    }

    p {
      margin: ${paragraphMarginRule};
      line-height: ${config.lineHeight};
      text-align: ${config.textAlign};
      ${config.firstLineIndentMm > 0 ? `text-indent: ${config.firstLineIndentMm}mm;` : ''}
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
        ${normalizeImagesInHtml(hydrateMathInHtml(p.content || '<p></p>'))}
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
      min-height: 0;
      overflow: hidden;
      box-sizing: border-box;
      padding-bottom: 6px;
    }

    /* Pie de página con numeración y fecha */
    .sheet-footer {
      height: 22px;
      margin-top: 8px;
      padding-top: 6px;
      font-size: 8.5pt;
      color: #94A3B8;
      border-top: 1px solid #F1F5F9;
      justify-content: space-between;
      align-items: center;
      flex-shrink: 0;
      box-sizing: border-box;
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

    img {
      max-width: 100% !important;
      height: auto !important;
      border-radius: 4px;
      margin: 10px auto;
      display: block;
    }

    img[style*="text-align: left"],
    img[data-text-align="left"] {
      margin-left: 0 !important;
      margin-right: auto !important;
    }

    img[style*="text-align: right"],
    img[data-text-align="right"] {
      margin-left: auto !important;
      margin-right: 0 !important;
    }

    img[style*="text-align: center"],
    img[data-text-align="center"] {
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
      margin: 10px 0;
      font-size: 0.9em;
      page-break-inside: auto;
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
      padding: 4px 8px;
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
      var activeConfig = ${JSON.stringify(config)};
      var isForPrint = ${isForPrint};

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

      function runPaginator() {
        var rawDoc = document.getElementById('raw-document');
        var output = document.getElementById('paged-output');
        if (!rawDoc || !output) return;

        output.innerHTML = '';

        var cfg = activeConfig;
        var hasFooter = !!(cfg.includePageNumbers || cfg.includeDate);
        var sheetCount = 0;
        var currentSheet = null;
        var currentBody = null;

        function createNewSheet() {
          sheetCount++;
          var sheet = document.createElement('div');
          sheet.className = 'pdf-page-sheet';
          sheet.setAttribute('data-sheet-num', sheetCount);

          var badge = document.createElement('div');
          badge.className = 'sheet-badge';
          badge.textContent = 'Hoja ' + sheetCount;
          sheet.appendChild(badge);

          var body = document.createElement('div');
          body.className = 'sheet-body';
          sheet.appendChild(body);

          var footer = document.createElement('div');
          footer.className = 'sheet-footer';
          if (!hasFooter) {
            footer.style.display = 'none';
          } else {
            footer.style.display = 'flex';
            var leftText = cfg.includeDate ? '${currentDateFormatted}' : '';
            var rightText = cfg.includePageNumbers ? 'Página 1' : '';
            footer.innerHTML = '<div>' + leftText + '</div><div>' + rightText + '</div>';
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

              Array.from(el.children).forEach(function(li) {
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
              if (currentBody.children.length > 1) {
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
          var badge = sheet.querySelector('.sheet-badge');
          if (badge) {
            badge.textContent = 'Hoja ' + (idx + 1) + ' / ' + total;
          }

          var footer = sheet.querySelector('.sheet-footer');
          if (footer && hasFooter) {
            var pageNum = idx + 1;
            var leftText = cfg.includeDate ? '${currentDateFormatted}' : '';
            var rightText = cfg.includePageNumbers ? ('Página ' + pageNum + ' de ' + total) : '';
            footer.innerHTML = '<div>' + leftText + '</div><div>' + rightText + '</div>';
          }
        });

        try {
          window.__veyra_pagination_ready = true;
          window.parent.postMessage({ type: 'VEYRA_PDF_PAGES_COUNT', count: total }, '*');
        } catch(e) {}
      }

      function init() {
        if (document.fonts && document.fonts.ready) {
          document.fonts.ready.then(runWhenImagesLoaded);
        } else {
          runWhenImagesLoaded();
        }
      }

      function runWhenImagesLoaded() {
        var imgs = Array.from(document.images);
        if (imgs.length === 0) {
          runPaginator();
          return;
        }
        var pending = imgs.length;
        function done() {
          pending--;
          if (pending <= 0) runPaginator();
        }
        imgs.forEach(function(img) {
          if (img.complete) {
            done();
          } else {
            img.addEventListener('load', done);
            img.addEventListener('error', done);
          }
        });
        if (pending <= 0) runPaginator();
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
