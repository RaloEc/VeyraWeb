import type { EditorView } from '@tiptap/pm/view';
import type { MeasuredVisualLine, ParagraphMeasurementResult } from './types';

/**
 * Recopila todos los nodos de texto descendientes de un elemento en orden de documento.
 */
function collectTextNodes(root: Node): Text[] {
  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  let current = walker.nextNode();
  while (current) {
    if (current.textContent && current.textContent.trim().length > 0) {
      textNodes.push(current as Text);
    }
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
 * Aplica control de viudas y huérfanas (mínimo 2 líneas arriba y 2 líneas abajo).
 */
export function calculateParagraphSplit(
  paragraphEl: HTMLElement,
  sheetTop: number,
  maxPrintableY: number,
  minNextPrintableY: number,
  sheetIndex: number,
  view: EditorView
): ParagraphMeasurementResult {
  const pRect = paragraphEl.getBoundingClientRect();
  const pTop = pRect.top - sheetTop;
  const pBottom = pRect.bottom - sheetTop;

  // 1. Si el párrafo cabe completo en el área imprimible, no requiere división
  if (pBottom <= maxPrintableY) {
    return { candidate: null, shouldPushWholeBlock: false, totalLines: 0 };
  }

  // 2. Si el párrafo empieza por debajo del límite de la hoja actual, pertenece a la siguiente
  if (pTop >= maxPrintableY) {
    return { candidate: null, shouldPushWholeBlock: true, totalLines: 0 };
  }

  // 3. Medir líneas visuales
  const lines = measureParagraphVisualLines(paragraphEl, sheetTop);
  if (lines.length <= 1) {
    // Si tiene una sola línea o no se pudo medir, no puede dividirse
    return { candidate: null, shouldPushWholeBlock: true, totalLines: lines.length };
  }

  // 4. Identificar la última línea que cabe en maxPrintableY
  let lastFittingIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].bottom <= maxPrintableY) {
      lastFittingIdx = i;
    } else {
      break;
    }
  }

  // 5. Control de huérfanas: si no cabe al menos 2 líneas, empujar el bloque entero
  if (lastFittingIdx < 1) {
    return { candidate: null, shouldPushWholeBlock: true, totalLines: lines.length };
  }

  // 6. Control de viudas: si en la siguiente hoja solo quedaría 1 línea aislada,
  // retroceder el corte una línea para enviar al menos 2 líneas a la siguiente hoja
  const linesOnNextSheet = lines.length - (lastFittingIdx + 1);
  if (linesOnNextSheet === 1) {
    if (lastFittingIdx > 1) {
      lastFittingIdx -= 1;
    } else {
      // Si no podemos ceder una línea sin dejar una huérfana en la hoja actual, empujar el bloque entero
      return { candidate: null, shouldPushWholeBlock: true, totalLines: lines.length };
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
  } catch (err) {
    console.warn('[lineBreakMeasurer] Error calculando posAtDOM:', err);
    return { candidate: null, shouldPushWholeBlock: true, totalLines: lines.length };
  }

  // Altura del espaciador: distancia exacta desde el final de la última línea que entra
  // hasta el inicio del área imprimible de la siguiente hoja
  const spacerHeight = Math.max(0, Math.round(minNextPrintableY - splitLine.bottom));

  return {
    candidate: {
      pos: splitPos,
      spacerHeight,
      totalLines: lines.length,
      linesOnCurrentSheet: lastFittingIdx + 1,
      linesOnNextSheet: lines.length - (lastFittingIdx + 1),
      sheetIndex,
    },
    shouldPushWholeBlock: false,
    totalLines: lines.length,
  };
}
