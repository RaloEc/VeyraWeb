/**
 * Utilidades para copiar y cortar imágenes hacia el portapapeles del sistema
 */

export async function convertBlobToPng(blob: Blob): Promise<Blob> {
  if (blob.type === 'image/png') return blob;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const objectUrl = URL.createObjectURL(blob);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(blob);
        return;
      }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((pngBlob) => {
        resolve(pngBlob || blob);
      }, 'image/png');
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(blob);
    };

    img.src = objectUrl;
  });
}

/**
 * Copia una imagen al portapapeles del sistema en formatos compatibles:
 * - 'image/png': Para pegar directamente en Word, WhatsApp, Discord, Photoshop, etc.
 * - 'text/html': Para pegar como elemento <img> dentro de Veyra y editores web
 * - 'text/plain': Enlace directo a la imagen como fallback
 */
export async function copyImageToClipboard(src: string): Promise<boolean> {
  if (!src || typeof navigator === 'undefined' || !navigator.clipboard) {
    return false;
  }

  try {
    let pngBlob: Blob | null = null;
    try {
      const response = await fetch(src, { mode: 'cors' });
      if (response.ok) {
        const rawBlob = await response.blob();
        pngBlob = await convertBlobToPng(rawBlob);
      }
    } catch {
      // Si el fetch falla por CORS, continuamos con los datos de texto/HTML
    }

    const html = `<img src="${src}" />`;
    const clipboardData: Record<string, Blob> = {
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([src], { type: 'text/plain' }),
    };

    if (pngBlob && pngBlob.type === 'image/png') {
      clipboardData['image/png'] = pngBlob;
    }

    if (typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([new ClipboardItem(clipboardData)]);
    } else {
      await navigator.clipboard.writeText(src);
    }
    return true;
  } catch (err) {
    console.warn('[copyImageToClipboard] Error al escribir en portapapeles:', err);
    try {
      await navigator.clipboard.writeText(src);
      return true;
    } catch {
      return false;
    }
  }
}

