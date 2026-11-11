/**
 * Servicio para imprimir y exportar a PDF en navegadores web utilizando
 * un iframe invisible y el motor de impresión nativo del navegador.
 */

export async function printHtmlDocument(html: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    try {
      // 1. Crear iframe invisible
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.top = '-10000px';
      iframe.style.left = '-10000px';
      iframe.style.width = '1400px';
      iframe.style.height = '1800px';
      iframe.style.border = 'none';
      iframe.style.opacity = '0';
      iframe.style.pointerEvents = 'none';
      iframe.setAttribute('aria-hidden', 'true');

      const cleanup = () => {
        setTimeout(() => {
          if (iframe.parentNode) {
            iframe.parentNode.removeChild(iframe);
          }
        }, 1500);
      };

      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc || !iframe.contentWindow) {
        cleanup();
        reject(new Error('No se pudo inicializar el entorno de impresión.'));
        return;
      }

      iframeDoc.open();
      iframeDoc.write(html);
      iframeDoc.close();

      // 2. Esperar a que las fuentes e imágenes carguen
      const triggerPrint = async () => {
        try {
          if (iframeDoc.fonts && iframeDoc.fonts.ready) {
            await iframeDoc.fonts.ready;
          }

          // Esperar imágenes
          const images = Array.from(iframeDoc.images);
          await Promise.all(
            images.map(
              (img) =>
                new Promise<void>((res) => {
                  if (img.complete) {
                    res();
                  } else {
                    img.onload = () => res();
                    img.onerror = () => res(); // No bloquear si falla una imagen
                  }
                })
            )
          );

          // Esperar a que el motor de paginación genere las hojas físicas y termine
          let attempts = 0;
          while (
            !(iframe.contentWindow as any)?.__veyra_pagination_ready &&
            attempts < 60
          ) {
            await new Promise((r) => setTimeout(r, 50));
            attempts++;
          }

          // Pausa breve para estabilizar el layout
          await new Promise((r) => setTimeout(r, 200));

          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();

          cleanup();
          resolve();
        } catch (err) {
          cleanup();
          reject(err);
        }
      };

      // Si el iframe aún está cargando su estructura
      if (iframeDoc.readyState === 'complete') {
        triggerPrint();
      } else {
        iframe.onload = () => {
          triggerPrint();
        };
      }
    } catch (error) {
      reject(error);
    }
  });
}

