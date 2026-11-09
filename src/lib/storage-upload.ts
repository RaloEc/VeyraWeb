import { supabase } from './supabase';
import { compressImage, isGif, ImageUploadError } from './image-pipeline';

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
  let uid = userId;
  if (!uid) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    uid = session?.user?.id;
  }

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

  // 3. Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from('attachments')
    .upload(filePath, uploadBlob, {
      cacheControl: '31536000',
      upsert: false,
      contentType: finalContentType,
    });

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
