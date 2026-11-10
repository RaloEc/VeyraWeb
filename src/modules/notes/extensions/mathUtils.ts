import katex from 'katex';

/**
 * Escapar atributos HTML para almacenar LaTeX de forma segura
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Desescapar entidades HTML básicas para recuperar el LaTeX original
 */
export function unescapeHtml(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/**
 * Renderizar LaTeX a HTML usando KaTeX de manera segura
 */
export function renderLatex(latex: string, displayMode: boolean): { html: string; isError: boolean } {
  if (!latex || !latex.trim()) {
    return {
      html: displayMode
        ? '<span class="text-veyra-muted text-xs italic">[Fórmula vacía - Clic para editar]</span>'
        : '<span class="text-veyra-muted text-xs italic">∅</span>',
      isError: false,
    };
  }

  try {
    const html = katex.renderToString(latex, {
      displayMode,
      throwOnError: false,
      output: 'htmlAndMathml',
      strict: false,
    });
    return { html, isError: false };
  } catch (err) {
    console.warn('[KaTeX error]', err);
    return {
      html: `<span class="text-red-500 font-mono text-xs" title="Error de sintaxis LaTeX">${escapeHtml(latex)}</span>`,
      isError: true,
    };
  }
}

/**
 * Valida si el contenido capturado entre signos de dólar corresponde a una expresión matemática
 * y no a menciones de precios u oraciones cotidianas
 */
export function isValidInlineMath(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;

  // Si contiene comandos LaTeX con contrabarra (\Delta, \frac, \%, \$, \alpha, etc.)
  if (/\\/.test(trimmed)) return true;

  // Si contiene subíndices o superíndices (E_o, P_0, x^2)
  if (/[_^]/.test(trimmed)) return true;

  // Si contiene operadores matemáticos (=, +, -, *, /, <, >, \approx, etc.)
  if (/[=+\-*/<>]/.test(trimmed)) return true;

  // Si es un número solo, decimal o porcentaje (1,91, 4.250, 100, 15,29%, 8%)
  if (/^[+-]?\d+([.,]\d+)*%?$/.test(trimmed)) return true;

  // Si es una sola variable o letra matemática (x, y, n, P, Q, E)
  if (/^[a-zA-Z]$/.test(trimmed)) return true;

  // Si es un identificador matemático simple con números (P0, Q1, Eo, x1)
  if (/^[a-zA-Z]\w*$/.test(trimmed) && trimmed.length <= 8) return true;

  // Si contiene más de 2 palabras sin operadores matemáticos, probablemente son dos precios en una frase
  const words = trimmed.split(/\s+/);
  if (words.length > 2) {
    const hasMathChar = /[=+\-*/<>^_{}\\]/.test(trimmed);
    if (!hasMathChar) return false;
  }

  return true;
}

/**
 * Determina si un texto contiene expresiones matemáticas en LaTeX
 */
export function hasMathContent(text: string): boolean {
  if (!text || typeof text !== 'string') return false;

  // 1. Detección de bloque matemático: $$ ... $$ o \[ ... \]
  if (/\$\$[\s\S]+?\$\$/.test(text) || /\\\[[\s\S]+?\\\]/.test(text)) {
    return true;
  }

  // 2. Detección de fórmula en línea explícita: \( ... \)
  if (/\\\([\s\S]+?\\\)/.test(text)) {
    return true;
  }

  // 3. Detección de fórmula en línea: $ ... $
  const inlineMatches = text.match(/\$(?!\$)((?:\\\$|[^$\n])+?)\$/g);
  if (!inlineMatches) return false;

  for (const m of inlineMatches) {
    const inner = m.slice(1, -1);
    if (isValidInlineMath(inner)) {
      return true;
    }
  }

  return false;
}

/**
 * Convierte un texto markdown con expresiones LaTeX ($$, \[, \( y $) a HTML
 * comprensible por los nodos de Tiptap
 */
export function convertMarkdownWithMathToHtml(text: string): string {
  if (!text) return '';

  const blocks: { id: string; html: string }[] = [];
  let blockCounter = 0;

  // 1. Extraer bloques matemáticos $$ ... $$ y \[ ... \]
  let processed = text.replace(/(?:\$\$|\\\[)([\s\S]+?)(?:\$\$|\\\])/g, (_, latex) => {
    const id = `___VEYRA_MATH_BLOCK_${blockCounter++}___`;
    const cleanLatex = latex.trim();
    blocks.push({
      id,
      html: `<div data-type="math-block" data-latex="${escapeHtml(cleanLatex)}">${escapeHtml(cleanLatex)}</div>`,
    });
    return `\n\n${id}\n\n`;
  });

  // 2. Extraer fórmulas en línea explícitas \( ... \)
  processed = processed.replace(/\\\(([\s\S]+?)\\\)/g, (match, latex) => {
    const cleanLatex = latex.trim();
    if (!cleanLatex) return match;
    return `<span data-type="math-inline" data-latex="${escapeHtml(cleanLatex)}">${escapeHtml(cleanLatex)}</span>`;
  });

  // 3. Extraer fórmulas en línea $ ... $
  processed = processed.replace(/\$(?!\$)((?:\\\$|[^$\n])+?)\$/g, (match, latex) => {
    if (!isValidInlineMath(latex)) {
      return match;
    }
    const cleanLatex = latex.trim();
    return `<span data-type="math-inline" data-latex="${escapeHtml(cleanLatex)}">${escapeHtml(cleanLatex)}</span>`;
  });

  // 4. Dividir por párrafos (doble salto de línea)
  const paragraphs = processed.split(/\n\s*\n/);
  const htmlParts: string[] = [];

  for (const p of paragraphs) {
    const trimmed = p.trim();
    if (!trimmed) continue;

    // Si es un bloque matemático
    const foundBlock = blocks.find((b) => b.id === trimmed);
    if (foundBlock) {
      htmlParts.push(foundBlock.html);
      continue;
    }

    // Convertir saltos de línea simples dentro del párrafo a <br>
    const lineBreakHtml = trimmed
      .split('\n')
      .map((line) => line.trim())
      .join('<br>');

    htmlParts.push(`<p>${lineBreakHtml}</p>`);
  }

  let finalHtml = htmlParts.join('');

  // Reemplazar cualquier bloque que haya quedado incrustado dentro de un párrafo
  for (const b of blocks) {
    if (finalHtml.includes(b.id)) {
      finalHtml = finalHtml.replace(`<p>${b.id}</p>`, b.html);
      finalHtml = finalHtml.replace(b.id, b.html);
    }
  }

  return finalHtml;
}
