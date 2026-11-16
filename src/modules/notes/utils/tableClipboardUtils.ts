/**
 * Utilidades para detectar, serializar y transformar tablas copiadas y pegadas
 * en formato HTML, Markdown y valores separados por tabulaciones (TSV).
 */

/**
 * Escapar texto básico para HTML
 */
function escapeHtmlBasic(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Parsea formato markdown en línea básico (negritas, cursivas, código, enlaces)
 * dentro del contenido de una celda de tabla.
 */
export function parseInlineCellMarkdown(raw: string): string {
  let res = raw.trim();
  if (!res) return '<br>';

  res = escapeHtmlBasic(res);

  // Enlaces: [texto](url)
  res = res.replace(
    /\[([^\]]+)\]\(((?:https?:\/\/|\/)[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );

  // Negrita: **texto** o __texto__
  res = res.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  res = res.replace(/__([^_]+)__/g, '<strong>$1</strong>');

  // Cursiva: *texto* o _texto_
  res = res.replace(/(^|[^\w*])\*([^*\s][^*\n]*[^*\s]|[^*\s])\*([^\w*]|$)/g, '$1<em>$2</em>$3');
  res = res.replace(/(^|[^\w_])_([^_\s][^_\n]*[^_\s]|[^_\s])_([^\w_]|$)/g, '$1<em>$2</em>$3');

  // Código en línea: `código`
  res = res.replace(/`([^`\n]+)`/g, '<code>$1</code>');

  // Tachado: ~~texto~~
  res = res.replace(/~~([^~]+)~~/g, '<s>$1</s>');

  return res;
}

/**
 * Separa una fila markdown en columnas respetando los pipes "|" exteriores.
 */
function splitMarkdownRow(line: string): string[] {
  let clean = line.trim();
  if (clean.startsWith('|')) clean = clean.slice(1);
  if (clean.endsWith('|')) clean = clean.slice(0, -1);
  return clean.split('|').map((col) => col.trim());
}

/**
 * Regex para detectar la línea de guiones separadora en una tabla Markdown:
 * e.g. | --- | :---: | ---: |
 */
export const MD_TABLE_SEP_REGEX = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/;

/**
 * Determina si un texto plano es una tabla en formato Markdown.
 */
export function isMarkdownTable(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const lines = text.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return false;

  // Debe contener al menos una cabecera con pipes y una fila separadora de guiones
  return lines[0].includes('|') && MD_TABLE_SEP_REGEX.test(lines[1]);
}

/**
 * Convierte un texto en formato tabla Markdown a HTML estructurado con la clase 'veyra-table'.
 */
export function convertMarkdownTableToHtml(markdown: string): string {
  const lines = markdown.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return '';

  const headerCells = splitMarkdownRow(lines[0]);
  const sepCells = splitMarkdownRow(lines[1]);

  const alignments = sepCells.map((sep) => {
    const s = sep.trim();
    const left = s.startsWith(':');
    const right = s.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    if (left) return 'left';
    return null;
  });

  const theadRows = `<tr>${headerCells
    .map((cell, idx) => {
      const align = alignments[idx];
      const style = align ? ` style="text-align: ${align};"` : '';
      return `<th${style}><p>${parseInlineCellMarkdown(cell)}</p></th>`;
    })
    .join('')}</tr>`;

  const bodyRows: string[] = [];
  for (let i = 2; i < lines.length; i++) {
    const rowLine = lines[i];
    if (!rowLine.includes('|')) continue;
    const cells = splitMarkdownRow(rowLine);
    const tr = `<tr>${headerCells
      .map((_, idx) => {
        const cell = cells[idx] ?? '';
        const align = alignments[idx];
        const style = align ? ` style="text-align: ${align};"` : '';
        return `<td${style}><p>${parseInlineCellMarkdown(cell)}</p></td>`;
      })
      .join('')}</tr>`;
    bodyRows.push(tr);
  }

  return `<table class="veyra-table"><thead>${theadRows}</thead><tbody>${bodyRows.join('')}</tbody></table>`;
}

/**
 * Determina si un texto plano contiene datos tabulares separados por tabulaciones (TSV),
 * típicamente copiados desde Microsoft Excel, Google Sheets o bases de datos.
 */
export function isTsvTable(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const lines = text.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return false;

  let tabCountFirst = lines[0].split('\t').length;
  if (tabCountFirst < 2) return false;

  // Al menos el 80% de las filas deben coincidir aproximadamente en número de columnas
  let validRows = 0;
  for (const line of lines) {
    const tabs = line.split('\t').length;
    if (tabs >= 2 && Math.abs(tabs - tabCountFirst) <= 1) {
      validRows++;
    }
  }

  return validRows / lines.length >= 0.75;
}

/**
 * Convierte un texto separado por tabulaciones (TSV) a HTML estructurado con la clase 'veyra-table'.
 */
export function convertTsvToHtml(tsv: string): string {
  const lines = tsv.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return '';

  const headerCells = lines[0].split('\t').map((c) => c.trim());
  const thead = `<thead><tr>${headerCells
    .map((c) => `<th><p>${escapeHtmlBasic(c) || '<br>'}</p></th>`)
    .join('')}</tr></thead>`;

  const bodyRows = lines.slice(1).map((line) => {
    const cells = line.split('\t').map((c) => c.trim());
    return `<tr>${headerCells
      .map((_, idx) => {
        const val = cells[idx] ?? '';
        return `<td><p>${escapeHtmlBasic(val) || '<br>'}</p></td>`;
      })
      .join('')}</tr>`;
  });

  return `<table class="veyra-table">${thead}<tbody>${bodyRows.join('')}</tbody></table>`;
}

/**
 * Asegura que un fragmento HTML de tabla tenga estructura válida.
 * Si contiene etiquetas <tr> o <td> sueltas sin <table>, las envuelve en un elemento <table> completo.
 * También asegura que tenga la clase css 'veyra-table'.
 */
export function ensureCompleteTableHtml(html: string): string {
  if (!html) return '';

  let cleaned = html
    .replace(/<!--StartFragment-->/gi, '')
    .replace(/<!--EndFragment-->/gi, '')
    .trim();

  const hasTableTag = /<table[^>]*>/i.test(cleaned);
  const hasRowsOrCells = /<(?:tr|td|th)[^>]*>/i.test(cleaned);

  if (!hasTableTag && hasRowsOrCells) {
    cleaned = `<table class="veyra-table"><tbody>${cleaned}</tbody></table>`;
  } else if (hasTableTag) {
    // Si la etiqueta table no tiene la clase 'veyra-table', agregarla
    cleaned = cleaned.replace(/<table(\s+[^>]*)?>/i, (match, attrs = '') => {
      if (/class=["'][^"']*veyra-table[^"']*["']/i.test(attrs)) {
        return match;
      }
      if (/class=["']([^"']*)["']/i.test(attrs)) {
        return `<table${attrs.replace(/class=["']([^"']*)["']/i, 'class="$1 veyra-table"')}>`;
      }
      return `<table class="veyra-table"${attrs}>`;
    });
  }

  return cleaned;
}
