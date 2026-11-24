import type { EditorView } from '@tiptap/pm/view';
import type { MeasuredVisualLine, ParagraphMeasurementResult, ParagraphSplitCandidate } from './types';

/**
 * Recopila todos los nodos de texto descendientes de un elemento en orden de documento.
 */
function collectTextNodes(root: Node): Text[] {
  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      let parent = node.parentElement;
      while (parent && parent !== root) {
        const tag = parent.tagName.toLowerCase();
        if (
          tag === 'ul' ||
          tag === 'ol' ||
          parent.getAttribute('contenteditable') === 'false' ||
          parent.classList.contains('a4-virtual-page-break') ||
          parent.classList.contains('veyra-math-inline')
        ) {
          return NodeFilter.FILTER_REJECT;
        }
        parent = parent.parentElement;
      }
      return node.textContent && node.textContent.trim().length > 0
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_SKIP;
    },
  });
  let current = walker.nextNode();
  while (current) {
    textNodes.push(current as Text);
    current = walker.nextNode();
  }
  return textNodes;
}

/**
 * Mide las líneas visuales de un párrafo mediante Range.getClientRects() por palabra.
 * Agrupa los rectángulos que comparten la misma línea vertical.
 */
export function measureParagraphVisualLines(
  paragraphEl: HTMLElement,
  sheetTop: number
): MeasuredVisualLine[] {
  const textNodes = collectTextNodes(paragraphEl);
  if (textNodes.length === 0) return [];

  const rawWords: Array<{
    top: number;
    bottom: number;
    node: Text;
    startOffset: number;
    endOffset: number;
    text: string;
  }> = [];

  const range = document.createRange();

  for (const textNode of textNodes) {
    const text = textNode.textContent || '';
    const wordRegex = /\S+/gu;
    let match: RegExpExecArray | null = null;

    while ((match = wordRegex.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      try {
        range.setStart(textNode, start);
        range.setEnd(textNode, end);
        const rects = range.getClientRects();
        if (rects.length > 0) {
          const rect = rects[0];
          rawWords.push({
            top: rect.top - sheetTop,
            bottom: rect.bottom - sheetTop,
            node: textNode,
            startOffset: start,
            endOffset: end,
            text: match[0],
          });
        }
      } catch {
        // Ignorar posibles rangos desincronizados durante edición rápida
      }
    }
  }

  if (rawWords.length === 0) return [];

  // Agrupar palabras en líneas visuales contiguas
  const lines: MeasuredVisualLine[] = [];
  let currentLineWords: typeof rawWords = [rawWords[0]];

  for (let i = 1; i < rawWords.length; i++) {
    const word = rawWords[i];
    const prevWord = currentLineWords[currentLineWords.length - 1];

    // Dos palabras pertenecen a la misma línea si su centro vertical es similar
    const prevCenter = (prevWord.top + prevWord.bottom) / 2;
    const currentCenter = (word.top + word.bottom) / 2;
    const isSameLine = Math.abs(currentCenter - prevCenter) < 10;

    if (isSameLine) {
      currentLineWords.push(word);
    } else {
      lines.push(buildLineFromWords(currentLineWords));
      currentLineWords = [word];
    }
  }

  if (currentLineWords.length > 0) {
    lines.push(buildLineFromWords(currentLineWords));
  }

  return lines;
}

function buildLineFromWords(
  words: Array<{
    top: number;
    bottom: number;
    node: Text;
    startOffset: number;
    endOffset: number;
    text: string;
  }>
): MeasuredVisualLine {
  const first = words[0];
  const last = words[words.length - 1];
  let top = first.top;
  let bottom = first.bottom;

  for (const w of words) {
    if (w.top < top) top = w.top;
    if (w.bottom > bottom) bottom = w.bottom;
  }

  return {
    top,
    bottom,
    firstNode: first.node,
    firstOffset: first.startOffset,
    lastNode: last.node,
    lastOffset: last.endOffset,
    text: words.map((w) => w.text).join(' '),
  };
}

/**
 * Evalúa si un párrafo que desborda la hoja actual puede dividirse limpiamente entre líneas.
 * Soporta división a lo largo de múltiples hojas (Hojas 1 -> 2 -> 3...) preservando márgenes A4
 * y aplicando control de viudas y huérfanas (mínimo 2 líneas arriba y 2 líneas abajo por salto).
 */
export function calculateParagraphSplit(
  paragraphEl: HTMLElement,
  sheetTop: number,
  stride: number,
  marginTopPx: number,
  marginBottomPx: number,
  startSheetIndex: number,
  view: EditorView,
  initialSpacerOffset?: number
): ParagraphMeasurementResult;
export function calculateParagraphSplit(
  paragraphEl: HTMLElement,
  sheetTop: number,
  maxPrintableY: number,
  minNextPrintableY: number,
  sheetIndex: number,
  view: EditorView
): ParagraphMeasurementResult;
export function calculateParagraphSplit(
  paragraphEl: HTMLElement,
  sheetTop: number,
  strideOrMaxY: number,
  marginTopOrNextMinY: number,
  marginBottomOrSheetIndex: number,
  startSheetIndexOrView: number | EditorView,
  maybeView?: EditorView,
  maybeSpacerOffset = 0
): ParagraphMeasurementResult {
  let stride: number;
  let marginTopPx: number;
  let marginBottomPx: number;
  let startSheetIndex: number;
  let view: EditorView;
  let initialSpacerOffset: number;

  if (typeof startSheetIndexOrView === 'object') {
    // Compatibilidad con firma anterior: (paragraphEl, sheetTop, maxPrintableY, minNextPrintableY, sheetIndex, view)
    const A4_HEIGHT_PX = 1123;
    const GAP_PX = 40;
    stride = A4_HEIGHT_PX + GAP_PX;
    marginTopPx = 36;
    marginBottomPx = 36;
    startSheetIndex = marginBottomOrSheetIndex;
    view = startSheetIndexOrView;
    initialSpacerOffset = 0;
  } else {
    stride = strideOrMaxY;
    marginTopPx = marginTopOrNextMinY;
    marginBottomPx = marginBottomOrSheetIndex;
    startSheetIndex = startSheetIndexOrView;
    view = maybeView!;
    initialSpacerOffset = maybeSpacerOffset;
  }

  const A4_HEIGHT_PX = 1123;
  const pRect = paragraphEl.getBoundingClientRect();
  const pTop = pRect.top - sheetTop + initialSpacerOffset;
  const pBottom = pRect.bottom - sheetTop + initialSpacerOffset;

  let currSheet = startSheetIndex;
  let currMaxPrintableY = currSheet * stride + A4_HEIGHT_PX - marginBottomPx;

  // 1. Si el párrafo cabe completo en el área imprimible de la hoja actual, no requiere división
  if (pBottom <= currMaxPrintableY) {
    return { candidate: null, candidates: [], shouldPushWholeBlock: false, totalLines: 0 };
  }

  // 2. Si el párrafo empieza por debajo del límite de la hoja actual, pertenece a la siguiente
  if (pTop >= currMaxPrintableY) {
    return { candidate: null, candidates: [], shouldPushWholeBlock: true, totalLines: 0 };
  }

  // 3. Medir líneas visuales
  const lines = measureParagraphVisualLines(paragraphEl, sheetTop);
  if (lines.length <= 1) {
    // Si tiene una sola línea o no se pudo medir, no puede dividirse
    return { candidate: null, candidates: [], shouldPushWholeBlock: true, totalLines: lines.length };
  }

  const candidates: ParagraphSplitCandidate[] = [];
  let currentLineIdx = 0;
  let cumulativeSpacer = initialSpacerOffset;

  while (currentLineIdx < lines.length) {
    currMaxPrintableY = currSheet * stride + A4_HEIGHT_PX - marginBottomPx;
    const nextMinPrintableY = (currSheet + 1) * stride + marginTopPx;

    // Verificar si las líneas restantes caben en la hoja actual
    const lastLineRenderedBottom = lines[lines.length - 1].bottom + cumulativeSpacer;
    if (lastLineRenderedBottom <= currMaxPrintableY) {
      break;
    }

    // Identificar la última línea que cabe en currMaxPrintableY
    let lastFittingIdx = -1;
    for (let i = currentLineIdx; i < lines.length; i++) {
      const renderedBottom = lines[i].bottom + cumulativeSpacer;
      if (renderedBottom <= currMaxPrintableY) {
        lastFittingIdx = i;
      } else {
        break;
      }
    }

    const linesOnCurrSheet =
      lastFittingIdx >= currentLineIdx ? lastFittingIdx - currentLineIdx + 1 : 0;

    // Control de huérfanas: mínimo 2 líneas en la hoja actual
    if (linesOnCurrSheet < 2) {
      if (candidates.length === 0) {
        // En la primera hoja no caben al menos 2 líneas: empujar el bloque entero
        return {
          candidate: null,
          candidates: [],
          shouldPushWholeBlock: true,
          totalLines: lines.length,
        };
      }
      // Si ya se produjeron cortes previos en hojas anteriores, detener cortes adicionales
      break;
    }

    // Control de viudas: si en el resto del párrafo solo quedaría 1 línea aislada, retroceder una línea
    const remainingLinesAfterFit = lines.length - (lastFittingIdx + 1);
    if (remainingLinesAfterFit === 1) {
      if (linesOnCurrSheet > 2) {
        lastFittingIdx -= 1;
      } else if (candidates.length === 0) {
        // Párrafo de 3 líneas donde caben 2 y sobra 1: empujar bloque entero
        return {
          candidate: null,
          candidates: [],
          shouldPushWholeBlock: true,
          totalLines: lines.length,
        };
      }
    }

    const splitLine = lines[lastFittingIdx];
    const lastNode = splitLine.lastNode;
    let targetOffset = splitLine.lastOffset;

    // Ajustar hacia el espacio en blanco inmediato posterior para un corte limpio
    const textContent = lastNode.textContent || '';
    if (targetOffset < textContent.length && /\s/u.test(textContent[targetOffset])) {
      targetOffset += 1;
    }

    // Mapear posición DOM a posición absoluta en el documento ProseMirror
    let splitPos: number;
    try {
      splitPos = view.posAtDOM(lastNode, targetOffset);
    } catch {
      try {
        splitPos = view.posAtDOM(lastNode, splitLine.lastOffset);
      } catch (err) {
        console.warn('[lineBreakMeasurer] Error calculando posAtDOM:', err);
        if (candidates.length === 0) {
          return {
            candidate: null,
            candidates: [],
            shouldPushWholeBlock: true,
            totalLines: lines.length,
          };
        }
        break;
      }
    }

    // Altura del espaciador: distancia exacta desde el fondo renderizado de la última línea
    // hasta el inicio del área imprimible de la siguiente hoja
    const splitLineRenderedBottom = splitLine.bottom + cumulativeSpacer;
    const spacerHeight = Math.max(0, Math.round(nextMinPrintableY - splitLineRenderedBottom));

    candidates.push({
      pos: splitPos,
      spacerHeight,
      totalLines: lines.length,
      linesOnCurrentSheet: lastFittingIdx - currentLineIdx + 1,
      linesOnNextSheet: lines.length - (lastFittingIdx + 1),
      sheetIndex: currSheet,
    });

    cumulativeSpacer += spacerHeight;
    currentLineIdx = lastFittingIdx + 1;
    currSheet += 1;
  }

  return {
    candidate: candidates[0] || null,
    candidates,
    shouldPushWholeBlock: false,
    totalLines: lines.length,
  };
}
