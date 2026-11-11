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
export function renderLatex(
  latex: string,
  displayMode: boolean,
  options?: { output?: 'html' | 'mathml' | 'htmlAndMathml' }
): { html: string; isError: boolean } {
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
      output: options?.output || 'html',
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

  // Paréntesis o llaves desbalanceadas no son fórmulas en línea válidas
  const openParen = (trimmed.match(/\(/g) || []).length;
  const closeParen = (trimmed.match(/\)/g) || []).length;
  if (openParen !== closeParen) return false;

  const openBrace = (trimmed.match(/\{/g) || []).length;
  const closeBrace = (trimmed.match(/\}/g) || []).length;
  if (openBrace !== closeBrace) return false;

  // Si contiene comandos LaTeX con contrabarra (\Delta, \frac, \%, \$, \alpha, \times, etc.)
  if (/\\/.test(trimmed)) return true;

  // Si contiene subíndices o superíndices (E_o, P_0, x^2)
  if (/[_^]/.test(trimmed)) return true;

  // Si contiene operadores matemáticos (=, +, -, *, /, <, >, |, \approx, etc.)
  if (/[=+\-*/<|>]/.test(trimmed)) return true;

  // Si es un número solo, decimal o porcentaje (1,91, 4.250, 100, 15,29%, 8%)
  if (/^[+-]?\d+([.,]\d+)*%?$/.test(trimmed)) return true;

  // Si es una sola variable o letra matemática (x, y, n, P, Q, E)
  if (/^[a-zA-Z]$/.test(trimmed)) return true;

  // Si es un identificador matemático simple con números (P0, Q1, Eo, x1)
  if (/^[a-zA-Z]\w*$/.test(trimmed) && trimmed.length <= 8) return true;

  // Si no coincide con ninguna característica matemática (operadores, variables, comandos LaTeX, etc.), no es fórmula
  return false;
}

/**
 * Limpia artefactos generados al copiar con el ratón fórmulas renderizadas con KaTeX/MathML
 * desde navegadores o interfaces web de IA (ChatGPT, Claude, Gemini, etc.).
 * Corrige textos triplicados como:
 * - EdE_dEd -> $E_d$
 * - P0P_0P0 -> $P_0$
 * - Q0Q_0Q0 -> $Q_0$
 * - ×\times× -> $\times$
 * - ∣−2∣\vert{}-2\vert{}∣−2∣ -> $|-2|$
 * - +20%+20\%+20% -> +20%
 * - −2-2−2 -> -2
 */
export function cleanAiClipboardArtifacts(text: string): string {
  if (!text) return text;

  // Normalizar el signo menos unicode (−) a ascii (-) y limpiar caracteres invisibles de KaTeX
  let s = text.replace(/−/g, '-').replace(/[\u200B-\u200D\uFEFF]/g, '');

  // 1. Triplicación de variables con subíndice: EdE_dEd -> $E_d$, P0P_0P0 -> $P_0$, Q1Q_1Q1 -> $Q_1$
  s = s.replace(/\b([A-Za-z]{1,2})([A-Za-z0-9]{1,2})\1_\2\1\2\b/g, '$$$1_$2$$');

  // 2. Multiplicación triplicada: ×\times× o x\timesx
  s = s.replace(/[×x]\s*\\times\s*[×x]/g, '$\\times$');

  // 3. Valor absoluto triplicado: ∣-2∣\vert{}-2\vert{}∣-2∣
  s = s.replace(/[|∣]([^|∣\\]+?)[|∣]\s*\\vert(?:\{\})?\s*([^|∣\\]+?)\s*\\vert(?:\{\})?\s*[|∣]\s*([^|∣\\]+?)[|∣]/g, '$$|$1|$$');

  // 4. Porcentajes triplicados: +20%+20\%+20% -> +20%, -10%-10\%-10% -> -10%
  s = s.replace(/([+-]?\d+)%\s*\1\\?%\s*\1%/g, '$1%');

  // 5. Números triplicados con signo: -2-2-2 -> -2
  s = s.replace(/([+-]\d+)\1\1/g, '$1');

  return s;
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
 * Determina si un texto plano contiene formato Markdown (encabezados, listas, negritas, etc.)
 */
export function hasMarkdownContent(text: string): boolean {
  if (!text || typeof text !== 'string') return false;

  // 1. Encabezados: # Titulo, ## Titulo, ### Titulo
  if (/^#{1,6}\s+\S+/m.test(text)) return true;

  // 2. Tareas Markdown: - [ ] o - [x]
  if (/^\s*[-*+]\s+\[[ xX]\]\s+/m.test(text)) return true;

  // 3. Elementos de lista con viñeta: * item, - item, + item
  if (/^\s*[-*+]\s+\S+/m.test(text)) return true;

  // 4. Elementos de lista numerada: 1. item, 2. item
  if (/^\s*\d+\.\s+\S+/m.test(text)) return true;

  // 5. Bloques de citas: > cita
  if (/^\s*>\s+\S+/m.test(text)) return true;

  // 6. Bloques de código con triple backtick
  if (/```[\s\S]*?```/.test(text)) return true;

  // 7. Negritas Markdown: **texto** o __texto__
  if (/\*\*[^*\n]+?\*\*/.test(text) || /__[^_\n]+?__/.test(text)) return true;

  // 8. Enlaces Markdown: [texto](http...)
  if (/\[.+?\]\((?:https?:\/\/|\/)[^\s)]+\)/.test(text)) return true;

  // 9. Separadores horizontales: ---, ***, ___
  if (/^(?:---|\*\*\*|___)\s*$/m.test(text)) return true;

  return false;
}

/**
 * Convierte un texto markdown con expresiones LaTeX ($$, \[, \( y $) a HTML
 * enriquecido comprensible por los nodos de Tiptap
 */
export function convertMarkdownWithMathToHtml(text: string): string {
  if (!text) return '';

  // Limpiar artefactos de copia de IA antes de tokenizar
  const cleanText = cleanAiClipboardArtifacts(text);

  const tokenMap: Map<string, string> = new Map();
  let tokenCounter = 0;

  const createToken = (html: string, prefix = 'TOKEN'): string => {
    const token = `@@VEYRA-${prefix}-${tokenCounter++}@@`;
    tokenMap.set(token, html);
    return token;
  };

  // 0. Proteger signos de dólar escapados con barra invertida (\$) para que no rompan delimitadores matemáticos
  let processed = cleanText.replace(/\\(\$)/g, () => createToken('$', 'ESCAPED_DOLLAR'));

  // 1. Proteger precios monetarios (ej. $10, $9, $10.000, $800)
  // No proteger si inmediatamente después hay una contrabarra LaTeX (ej. \text, \times)
  processed = processed.replace(/(^|[\s(])\$(\d+(?:[.,]\d+)*)(?=(?:\s+(?!\\[a-zA-Z]))|[;:!)]|\.(?!\d)|,(?!\d)|$)/g, (_match, prefix, num) => {
    return `${prefix}${createToken(`$${num}`, 'CURRENCY')}`;
  });

  // 2. Extraer bloques de código (```lang ... ```)
  processed = processed.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_, _lang, code) => {
    const escapedCode = escapeHtml(code.replace(/\n$/, ''));
    return `\n\n${createToken(`<pre><code>${escapedCode}</code></pre>`, 'CODE_BLOCK')}\n\n`;
  });

  // 3. Extraer bloques matemáticos ($$ ... $$ o \[ ... \])
  processed = processed.replace(/(?:\$\$|\\\[)([\s\S]+?)(?:\$\$|\\\])/g, (_, latex) => {
    let cleanLatex = latex.trim();
    for (const [token] of tokenMap.entries()) {
      if (token.includes('ESCAPED_DOLLAR')) {
        cleanLatex = cleanLatex.replaceAll(token, '\\$');
      }
    }
    const { html: katexHtml } = renderLatex(cleanLatex, true);
    const mathBlockHtml = `<div data-type="math-block" data-latex="${escapeHtml(cleanLatex)}">${katexHtml}</div>`;
    return `\n\n${createToken(mathBlockHtml, 'MATH_BLOCK')}\n\n`;
  });

  // 4. Extraer fórmulas en línea explícitas \( ... \)
  processed = processed.replace(/\\\(([\s\S]+?)\\\)/g, (match, latex) => {
    let cleanLatex = latex.trim();
    if (!cleanLatex) return match;
    for (const [token] of tokenMap.entries()) {
      if (token.includes('ESCAPED_DOLLAR')) {
        cleanLatex = cleanLatex.replaceAll(token, '\\$');
      }
    }
    const { html: katexHtml } = renderLatex(cleanLatex, false);
    const mathInlineHtml = `<span data-type="math-inline" data-latex="${escapeHtml(cleanLatex)}">${katexHtml}</span>`;
    return createToken(mathInlineHtml, 'MATH_INLINE');
  });

  // 5. Extraer fórmulas en línea $ ... $
  processed = processed.replace(/\$(?!\$)((?:\\\$|[^$\n])+?)\$/g, (match, latex) => {
    let cleanLatex = latex.trim();
    for (const [token] of tokenMap.entries()) {
      if (token.includes('ESCAPED_DOLLAR')) {
        cleanLatex = cleanLatex.replaceAll(token, '\\$');
      }
    }
    if (!isValidInlineMath(cleanLatex)) {
      return match;
    }
    const { html: katexHtml } = renderLatex(cleanLatex, false);
    const mathInlineHtml = `<span data-type="math-inline" data-latex="${escapeHtml(cleanLatex)}">${katexHtml}</span>`;
    return createToken(mathInlineHtml, 'MATH_INLINE');
  });

  // 6. Extraer código en línea `...`
  processed = processed.replace(/`([^`\n]+)`/g, (_, code) => {
    const codeHtml = `<code>${escapeHtml(code)}</code>`;
    return createToken(codeHtml, 'INLINE_CODE');
  });

  // Función para procesar estilos Markdown en línea
  const parseInlineMarkdown = (str: string): string => {
    // Limpiar comandos LaTeX residuales que no quedaron dentro de fórmulas (ej: \text{ unidades} -> unidades, \times -> ×, \  -> espacio)
    let cleaned = str
      .replace(/\\text\{([^}]+)\}/g, '$1')
      .replace(/\\times\b/g, '×')
      .replace(/\\\s+/g, ' ');

    // Escapar caracteres HTML básicos
    let res = cleaned.replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Enlaces: [texto](url)
    res = res.replace(
      /\[([^\]]+)\]\(((?:https?:\/\/|\/)[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );

    // Negrita + cursiva: ***texto*** o ___texto___
    res = res.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
    res = res.replace(/___([^_]+)___/g, '<strong><em>$1</em></strong>');

    // Negrita: **texto** o __texto__
    res = res.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    res = res.replace(/__([^_]+)__/g, '<strong>$1</strong>');

    // Cursiva: *texto* o _texto_ (evitando asteriscos aislados como "2 * 3")
    res = res.replace(/(^|[^\w*])\*([^*\s][^*\n]*[^*\s]|[^*\s])\*([^\w*]|$)/g, '$1<em>$2</em>$3');
    res = res.replace(/(^|[^\w_])_([^_\s][^_\n]*[^_\s]|[^_\s])_([^\w_]|$)/g, '$1<em>$2</em>$3');

    // Tachado: ~~texto~~
    res = res.replace(/~~([^~]+)~~/g, '<s>$1</s>');

    return res;
  };

  const rawLines = processed.split(/\r?\n/);
  const htmlParts: string[] = [];

  let currentBlock: 'none' | 'p' | 'ul' | 'ol' | 'taskList' | 'blockquote' = 'none';

  const closeCurrentBlock = () => {
    if (currentBlock === 'p') {
      htmlParts.push('</p>');
    } else if (currentBlock === 'ul') {
      htmlParts.push('</ul>');
    } else if (currentBlock === 'ol') {
      htmlParts.push('</ol>');
    } else if (currentBlock === 'taskList') {
      htmlParts.push('</ul>');
    } else if (currentBlock === 'blockquote') {
      htmlParts.push('</p></blockquote>');
    }
    currentBlock = 'none';
  };

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const trimmed = line.trim();

    // Línea vacía
    if (!trimmed) {
      closeCurrentBlock();
      continue;
    }

    // Token de bloque matemático o código
    if (trimmed.startsWith('@@VEYRA-MATH_BLOCK-') || trimmed.startsWith('@@VEYRA-CODE_BLOCK-')) {
      closeCurrentBlock();
      htmlParts.push(trimmed);
      continue;
    }

    // Separador horizontal (---, ***, ___)
    if (/^(?:---|\*\*\*|___)$/.test(trimmed)) {
      closeCurrentBlock();
      htmlParts.push('<hr>');
      continue;
    }

    // Encabezados (# Titulo, ## Titulo, ### Titulo o #Titulo)
    const headingMatch = trimmed.match(/^(#{1,6})\s*(.*)$/);
    if (headingMatch && headingMatch[2].trim()) {
      closeCurrentBlock();
      const level = Math.min(headingMatch[1].length, 3);
      htmlParts.push(`<h${level}>${parseInlineMarkdown(headingMatch[2].trim())}</h${level}>`);
      continue;
    }

    // Tareas Markdown: - [ ] o - [x]
    const taskMatch = trimmed.match(/^[-*+]\s+\[([ xX])\]\s*(.*)$/);
    if (taskMatch) {
      const isChecked = taskMatch[1].toLowerCase() === 'x';
      const itemContent = parseInlineMarkdown(taskMatch[2].trim());
      if (currentBlock !== 'taskList') {
        closeCurrentBlock();
        currentBlock = 'taskList';
        htmlParts.push('<ul data-type="taskList">');
      }
      htmlParts.push(
        `<li data-type="taskItem" data-checked="${isChecked}"><label><input type="checkbox"${isChecked ? ' checked' : ''}></label><div><p>${itemContent}</p></div></li>`
      );
      continue;
    }

    // Lista de viñetas: - item o * item o + item
    const bulletMatch = trimmed.match(/^[-*+]\s+(.*)$/);
    if (bulletMatch) {
      const itemContent = parseInlineMarkdown(bulletMatch[1].trim());
      if (currentBlock !== 'ul') {
        closeCurrentBlock();
        currentBlock = 'ul';
        htmlParts.push('<ul>');
      }
      htmlParts.push(`<li><p>${itemContent}</p></li>`);
      continue;
    }

    // Lista numerada: 1. item, 2. item, 3. item...
    const orderedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (orderedMatch) {
      const startNum = parseInt(orderedMatch[1], 10);
      const itemContent = parseInlineMarkdown(orderedMatch[2].trim());
      if (currentBlock !== 'ol') {
        closeCurrentBlock();
        currentBlock = 'ol';
        htmlParts.push(startNum > 1 ? `<ol start="${startNum}">` : '<ol>');
      }
      htmlParts.push(`<li><p>${itemContent}</p></li>`);
      continue;
    }

    // Cita: > texto
    const quoteMatch = trimmed.match(/^>\s*(.*)$/);
    if (quoteMatch) {
      const quoteContent = parseInlineMarkdown(quoteMatch[1].trim());
      if (currentBlock !== 'blockquote') {
        closeCurrentBlock();
        currentBlock = 'blockquote';
        htmlParts.push(`<blockquote><p>${quoteContent}`);
      } else {
        htmlParts.push(`<br>${quoteContent}`);
      }
      continue;
    }

    // Párrafo normal
    closeCurrentBlock();
    const lineContent = parseInlineMarkdown(trimmed);
    htmlParts.push(`<p>${lineContent}</p>`);
    currentBlock = 'none';
  }

  closeCurrentBlock();

  let finalHtml = htmlParts.join('');

  // 10. Restaurar tokens de Math, Currency y Code
  for (const [token, htmlVal] of tokenMap.entries()) {
    if (token.includes('MATH_BLOCK') || token.includes('CODE_BLOCK')) {
      finalHtml = finalHtml.replaceAll(`<p>${token}</p>`, htmlVal);
      finalHtml = finalHtml.replaceAll(token, htmlVal);
    } else {
      finalHtml = finalHtml.replaceAll(token, htmlVal);
    }
  }

  return finalHtml;
}

/**
 * Hidrata y renderiza fórmulas matemáticas (mathBlock y mathInline) dentro de un HTML con KaTeX.
 * Ideal para exportaciones a PDF, vistas previas e impresiones.
 */
export function hydrateMathInHtml(html: string): string {
  if (
    !html ||
    (!html.includes('math-block') &&
      !html.includes('math-inline') &&
      !html.includes('data-latex') &&
      !html.includes('veyra-math-'))
  ) {
    return html;
  }

  if (typeof DOMParser === 'undefined') {
    return html;
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<body>${html}</body>`, 'text/html');

    // 1. Math Blocks: [data-type="math-block"], .veyra-math-block
    const blocks = doc.querySelectorAll('[data-type="math-block"], .veyra-math-block');
    blocks.forEach((el) => {
      const latex = unescapeHtml(el.getAttribute('data-latex') || el.textContent || '');
      const size = el.getAttribute('data-size') || 'normal';
      let fontSize = '1.15em';
      if (size === 'small') fontSize = '0.9em';
      if (size === 'large') fontSize = '1.35em';
      if (size === 'huge') fontSize = '1.65em';

      if (latex.trim()) {
        const { html: katexHtml } = renderLatex(latex, true, { output: 'html' });
        el.innerHTML = katexHtml;
        el.className = 'veyra-math-block';
        el.setAttribute('data-type', 'math-block');
        el.setAttribute(
          'style',
          `display: block; margin: 12px 0; text-align: center; font-size: ${fontSize}; ${el.getAttribute('style') || ''}`
        );
      }
    });

    // 2. Math Inlines: [data-type="math-inline"], .veyra-math-inline
    const inlines = doc.querySelectorAll('[data-type="math-inline"], .veyra-math-inline');
    inlines.forEach((el) => {
      const latex = unescapeHtml(el.getAttribute('data-latex') || el.textContent || '');
      const size = el.getAttribute('data-size') || 'normal';
      let fontSize = '1em';
      if (size === 'small') fontSize = '0.85em';
      if (size === 'large') fontSize = '1.25em';
      if (size === 'huge') fontSize = '1.5em';

      if (latex.trim()) {
        const { html: katexHtml } = renderLatex(latex, false, { output: 'html' });
        el.innerHTML = katexHtml;
        el.className = 'veyra-math-inline';
        el.setAttribute('data-type', 'math-inline');
        el.setAttribute(
          'style',
          `display: inline-flex; align-items: baseline; vertical-align: baseline; font-size: ${fontSize}; margin: 0 1px; ${el.getAttribute('style') || ''}`
        );
      }
    });

    return doc.body.innerHTML;
  } catch (err) {
    console.warn('[hydrateMathInHtml] Error:', err);
    return html;
  }
}
