import { supabase } from './supabase';
import { compressImage, isGif, ImageUploadError } from './image-pipeline';
import { computeSha256 } from './crypto-utils';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/**
 * Uploads an image file to Supabase Storage in the 'attachments' bucket.
 * Compresses images to WebP (max 1600px, 80% quality) on the client before upload.
 * GIFs are uploaded without recompression to preserve animations.
 * Bucket path follows user folder RLS convention:
 * `${userId}/notes/${timestamp}_${randomId}.${ext}`
 *
 * @returns The public HTTPS URL to display in Tiptap/Yjs
 */
export async function uploadNoteImage(file: File | Blob, userId?: string): Promise<string> {
  let {
    data: { session },
  } = await supabase.auth.getSession();

  // Si el token JWT en caché es demasiado grande (> 4 KB, ej. por metadatos antiguos),
  // refrescamos la sesión antes de subir para evitar HTTP 400 por cabecera demasiado grande.
  if (session?.access_token && session.access_token.length > 4000) {
    try {
      const { data: refreshed } = await supabase.auth.refreshSession();
      if (refreshed?.session) {
        session = refreshed.session;
      }
    } catch {
      // ignore
    }
  }

  const uid = session?.user?.id || userId;

  if (!uid) {
    throw new ImageUploadError('No hay sesión de usuario activa para subir la imagen.', 'NO_SESSION');
  }

  // 1. Validate MIME type
  let mimeType = (file.type?.toLowerCase() || '').replace('image/jpg', 'image/jpeg');
  if (!mimeType && 'name' in file && typeof (file as File).name === 'string') {
    const name = (file as File).name.toLowerCase();
    if (name.endsWith('.jpg') || name.endsWith('.jpeg')) mimeType = 'image/jpeg';
    else if (name.endsWith('.png')) mimeType = 'image/png';
    else if (name.endsWith('.webp')) mimeType = 'image/webp';
    else if (name.endsWith('.gif')) mimeType = 'image/gif';
  }

  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    throw new ImageUploadError('Formato no soportado. Usa JPG, PNG, WebP o GIF.', 'UNSUPPORTED_FORMAT');
  }

  // 2. Compress image if not GIF
  const isAnimation = isGif(file) || mimeType === 'image/gif';
  let uploadBlob: Blob;
  let ext: string;
  let finalContentType: string;

  if (isAnimation) {
    uploadBlob = file;
    ext = 'gif';
    finalContentType = 'image/gif';
  } else {
    uploadBlob = await compressImage(file);
    ext = 'webp';
    finalContentType = 'image/webp';
  }

  const randomId =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().substring(0, 8)
      : Math.random().toString(36).substring(2, 8);

  const filePath = `${uid}/notes/${Date.now()}_${randomId}.${ext}`;

  // 3. Upload to Supabase Storage (con reintento automático tras refreshSession si da HTTP 400)
  let { error: uploadError } = await supabase.storage
    .from('attachments')
    .upload(filePath, uploadBlob, {
      cacheControl: '31536000',
      upsert: false,
      contentType: finalContentType,
    });

  if (uploadError) {
    try {
      const { data: refreshed } = await supabase.auth.refreshSession();
      if (refreshed?.session) {
        const retryUid = refreshed.session.user.id || uid;
        const retryPath = `${retryUid}/notes/${Date.now()}_${randomId}.${ext}`;
        const retryRes = await supabase.storage
          .from('attachments')
          .upload(retryPath, uploadBlob, {
            cacheControl: '31536000',
            upsert: false,
            contentType: finalContentType,
          });
        if (!retryRes.error) {
          const { data } = supabase.storage.from('attachments').getPublicUrl(retryPath);
          if (data?.publicUrl) return data.publicUrl;
        } else {
          uploadError = retryRes.error;
        }
      }
    } catch {
      // ignore retry error
    }
  }

  if (uploadError) {
    console.error('❌ [uploadNoteImage] Error subiendo imagen a Supabase Storage:', uploadError);
    throw new ImageUploadError(uploadError.message || 'Error al subir imagen a Supabase Storage', 'STORAGE_ERROR');
  }

  const { data } = supabase.storage.from('attachments').getPublicUrl(filePath);

  if (!data?.publicUrl) {
    throw new ImageUploadError('No se pudo obtener la URL pública de la imagen', 'PUBLIC_URL_ERROR');
  }

  return data.publicUrl;
}

/**
 * Comprime un logo de encabezado/pie a WebP ligero (máx 520px, calidad 85%, ~8-18 KB)
 * y lo sube una única vez a Supabase Storage deduplicado por su hash SHA-256:
 * `${uid}/notes/hf_logo_${sha256_20}.webp`.
 * Si la misma imagen se pega o se usa en múltiples plantillas/notas, reutiliza exactamente el mismo archivo.
 */
export async function uploadHeaderFooterLogo(
  fileOrDataUrl: File | Blob | string,
  userId?: string
): Promise<{ url: string; naturalWidth: number; naturalHeight: number }> {
  if (typeof fileOrDataUrl === 'string' && /^https?:\/\//i.test(fileOrDataUrl)) {
    return { url: fileOrDataUrl, naturalWidth: 160, naturalHeight: 65 };
  }

  // Cargar imagen en HTMLImageElement para obtener dimensiones reales y comprimir a tamaño de logo (máx 520px)
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new window.Image();
    el.crossOrigin = 'anonymous';
    let objectUrl: string | null = null;
    el.onload = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      resolve(el);
    };
    el.onerror = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      reject(new Error('No se pudo procesar la imagen del encabezado'));
    };
    if (typeof fileOrDataUrl === 'string') {
      el.src = fileOrDataUrl;
    } else {
      objectUrl = URL.createObjectURL(fileOrDataUrl);
      el.src = objectUrl;
    }
  });

  const natW = img.naturalWidth || 160;
  const natH = img.naturalHeight || 65;
  const maxLogoDim = 520;
  let targetW = natW;
  let targetH = natH;
  if (natW > maxLogoDim || natH > maxLogoDim) {
    if (natW >= natH) {
      targetW = maxLogoDim;
      targetH = Math.max(1, Math.round((natH * maxLogoDim) / natW));
    } else {
      targetH = maxLogoDim;
      targetW = Math.max(1, Math.round((natW * maxLogoDim) / natH));
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('No se pudo inicializar el compresor de imagen');
  }
  ctx.drawImage(img, 0, 0, targetW, targetH);

  const webpBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error('Error al comprimir logo a WebP'));
      },
      'image/webp',
      0.85
    );
  });

  try {
    let {
      data: { session },
    } = await supabase.auth.getSession();

    if (session?.access_token && session.access_token.length > 4000) {
      try {
        const { data: refreshed } = await supabase.auth.refreshSession();
        if (refreshed?.session) {
          session = refreshed.session;
        }
      } catch {
        // ignore
      }
    }

    const uid = session?.user?.id || userId;

    if (uid) {
      const bytes = new Uint8Array(await webpBlob.arrayBuffer());
      const fullHash = await computeSha256(bytes);
      const shortHash = fullHash.slice(0, 20);
      const filePath = `${uid}/notes/hf_logo_${shortHash}.webp`;

      const { error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(filePath, webpBlob, {
          cacheControl: '31536000',
          upsert: true,
          contentType: 'image/webp',
        });

      const isAlreadyExists =
        uploadError &&
        /already exists|duplicate/i.test(String(uploadError.message || ''));

      if (!uploadError || isAlreadyExists) {
        const { data } = supabase.storage.from('attachments').getPublicUrl(filePath);
        if (data?.publicUrl) {
          return { url: data.publicUrl, naturalWidth: natW, naturalHeight: natH };
        }
      }
    }
  } catch (err) {
    console.warn('[uploadHeaderFooterLogo] Fallback a WebP compacto local:', err);
  }

  const fallbackDataUrl = canvas.toDataURL('image/webp', 0.82);
  return { url: fallbackDataUrl, naturalWidth: natW, naturalHeight: natH };
}
