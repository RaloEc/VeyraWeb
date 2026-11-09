export const MAX_DIMENSION = 1600;
export const WEBP_QUALITY = 0.8;

export class ImageUploadError extends Error {
  public code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'ImageUploadError';
    this.code = code;
    Object.setPrototypeOf(this, ImageUploadError.prototype);
  }
}

export function humanizeUploadError(err: unknown): string {
  if (err instanceof ImageUploadError) return err.message;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'Sin conexión. Revisa tu internet e inténtalo de nuevo.';
  }
  if (err instanceof TypeError && /fetch|network|load/i.test(err.message)) {
    return 'No se pudo conectar. Revisa tu red e inténtalo de nuevo.';
  }
  return 'No se pudo subir la imagen. Inténtalo de nuevo.';
}

/**
 * Checks if a file, blob, or url is a GIF
 */
export function isGif(fileOrUrl: File | Blob | string): boolean {
  if (typeof fileOrUrl === 'string') {
    return /\.gif(\?.*)?$/i.test(fileOrUrl) || fileOrUrl.startsWith('data:image/gif');
  }
  if (fileOrUrl && fileOrUrl.type) {
    return fileOrUrl.type.toLowerCase() === 'image/gif';
  }
  if ('name' in fileOrUrl && typeof (fileOrUrl as File).name === 'string') {
    return /\.gif$/i.test((fileOrUrl as File).name);
  }
  return false;
}

/**
 * Calculates proportional target dimensions preserving aspect ratio with max boundary.
 */
function calculateTargetDimensions(
  width: number,
  height: number,
  maxDimension: number
): { width: number; height: number } {
  if (width <= maxDimension && height <= maxDimension) {
    return { width, height };
  }

  if (width >= height) {
    const targetWidth = maxDimension;
    const targetHeight = Math.round((height * maxDimension) / width);
    return { width: targetWidth, height: targetHeight };
  } else {
    const targetHeight = maxDimension;
    const targetWidth = Math.round((width * maxDimension) / height);
    return { width: targetWidth, height: targetHeight };
  }
}

/**
 * Compresses an image file/blob to WebP format (max 1600px, 80% quality).
 * If the image is a GIF, it is returned intact without recompression.
 */
export async function compressImage(file: File | Blob): Promise<Blob> {
  // Never recompress GIFs (preserves frame animation)
  if (isGif(file)) {
    return file;
  }

  // 1. Try to load image source using createImageBitmap or HTMLImageElement
  let sourceWidth = 0;
  let sourceHeight = 0;
  let imageSource: ImageBitmap | HTMLImageElement | null = null;

  try {
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(file);
      sourceWidth = bitmap.width;
      sourceHeight = bitmap.height;
      imageSource = bitmap;
    }
  } catch {
    imageSource = null;
  }

  if (!imageSource) {
    imageSource = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new ImageUploadError('No se pudo decodificar la imagen seleccionada.', 'DECODE_ERROR'));
      };
      img.src = objectUrl;
    });
    sourceWidth = imageSource.naturalWidth || imageSource.width;
    sourceHeight = imageSource.naturalHeight || imageSource.height;
  }

  const { width: targetWidth, height: targetHeight } = calculateTargetDimensions(
    sourceWidth,
    sourceHeight,
    MAX_DIMENSION
  );

  // 2. Render to canvas
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(targetWidth, targetHeight)
      : document.createElement('canvas');

  if ('width' in canvas) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }

  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) {
    if (imageSource && 'close' in imageSource && typeof imageSource.close === 'function') {
      imageSource.close();
    }
    throw new ImageUploadError('No se pudo inicializar el contexto gráfico para compresión.', 'CANVAS_ERROR');
  }

  // Smooth scaling
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(imageSource, 0, 0, targetWidth, targetHeight);

  if ('close' in imageSource && typeof imageSource.close === 'function') {
    imageSource.close();
  }

  // 3. Convert to WebP blob (fallback to JPEG if webp not supported)
  let blobResult: Blob | null = null;

  if ('convertToBlob' in canvas && typeof canvas.convertToBlob === 'function') {
    try {
      blobResult = await canvas.convertToBlob({ type: 'image/webp', quality: WEBP_QUALITY });
    } catch {
      blobResult = await canvas.convertToBlob({ type: 'image/jpeg', quality: WEBP_QUALITY });
    }
  } else if ('toBlob' in canvas && typeof canvas.toBlob === 'function') {
    blobResult = await new Promise<Blob | null>((resolve) => {
      (canvas as HTMLCanvasElement).toBlob(
        (b) => {
          if (b) {
            resolve(b);
          } else {
            // Fallback to JPEG
            (canvas as HTMLCanvasElement).toBlob(resolve, 'image/jpeg', WEBP_QUALITY);
          }
        },
        'image/webp',
        WEBP_QUALITY
      );
    });
  }

  if (!blobResult) {
    throw new ImageUploadError('Fallo al comprimir la imagen en memoria.', 'BLOB_ERROR');
  }

  return blobResult;
}
