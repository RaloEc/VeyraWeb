import DOMPurify from 'dompurify';

/**
 * Sanitiza HTML enriquecido generado por Yjs, Gemini, plantillas o vistas de lectura/PDF
 * manteniendo estilos seguros de Tiptap y fórmulas KaTeX.
 */
export function sanitizeRichHtml(html: string): string {
  if (!html) return '';
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'meta', 'base'],
    FORBID_ATTR: [
      'onerror',
      'onload',
      'onclick',
      'onmouseover',
      'onfocus',
      'onblur',
      'onchange',
      'onsubmit',
      'formaction',
    ],
  });
}

/**
 * Valida que una URL sea segura antes de invocar window.open().
 * Permite únicamente http:, https: y blob: (bloquea javascript:, vbscript:, data:).
 */
export function isSafeOpenUrl(rawUrl: string | null | undefined): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  const trimmed = rawUrl.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed, typeof window !== 'undefined' ? window.location.origin : 'https://veyra.app');
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' || parsed.protocol === 'blob:';
  } catch {
    return false;
  }
}
