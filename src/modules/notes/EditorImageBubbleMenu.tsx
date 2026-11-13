import React, { useState, useRef } from 'react';
import type { Editor } from '@tiptap/react';
import { useEditorState } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { NodeSelection } from '@tiptap/pm/state';
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  Subtitles,
  ImagePlus,
  Download,
  Trash2,
  Crop,
  RotateCw,
  FlipHorizontal,
  Loader2,
  AlertCircle,
  Copy,
  Scissors,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { compressImage, isGif } from '../../lib/image-pipeline';
import { uploadNoteImage } from '../../lib/storage-upload';
import { deleteNoteImage } from '../../lib/storage-delete';
import { copyImageToClipboard } from './utils/clipboardImageUtils';

export interface EditorImageBubbleMenuProps {
  editor: Editor | null;
  currentUserId?: string | null;
}

const shouldShowImageBubbleMenu = ({ editor }: { editor: Editor }) => editor.isActive('image');

export const EditorImageBubbleMenu: React.FC<EditorImageBubbleMenuProps> = ({
  editor,
  currentUserId,
}) => {
  if (!editor) return null;

  const [isUploading, setIsUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Obtener atributos de forma reactiva con useEditorState para que el menú siempre esté sincronizado
  const imageAttrs = useEditorState({
    editor,
    selector: (ctx) => {
      if (!ctx.editor || ctx.editor.isDestroyed || !ctx.editor.isActive('image')) {
        return { src: undefined, width: null, textAlign: 'center', caption: null };
      }
      const attrs = ctx.editor.getAttributes('image');
      return {
        src: attrs.src as string | undefined,
        width: attrs.width ?? null,
        textAlign: (attrs.textAlign as string | undefined) || 'center',
        caption: attrs.caption ?? null,
      };
    },
  });
  const currentSrc = imageAttrs.src as string | undefined;
  const rawWidth = imageAttrs.width;
  const currentWidth = rawWidth != null && !isNaN(Number(rawWidth)) ? Number(rawWidth) : null;
  const currentAlign = (imageAttrs.textAlign as string | undefined) || 'center';
  const isImageGif = currentSrc ? isGif(currentSrc) : false;

  // Preset widths
  const presets = [25, 50, 75, 100];

  const handleSetWidth = (pct: number) => {
    editor.chain().focus().updateAttributes('image', { width: pct }).run();
  };

  const handleSetAlign = (align: 'left' | 'center' | 'right') => {
    editor.chain().focus().setTextAlign(align).run();
  };

  const { selection } = editor.state;
  const isSelectedNode = selection instanceof NodeSelection;
  const isEditingCaption =
    isSelectedNode && editor.storage.image?.editingCaptionPos === selection.from;
  const hasCaptionContent =
    imageAttrs.caption != null && String(imageAttrs.caption).trim() !== '';
  const isCaptionActive = isEditingCaption || hasCaptionContent;

  const handleToggleCaption = () => {
    const { selection } = editor.state;
    if (!(selection instanceof NodeSelection)) return;

    const isEditing = editor.storage.image?.editingCaptionPos === selection.from;

    if (isEditing) {
      editor.commands.clearCaptionEditing();
    } else {
      // Siempre activa edición si no está editando (tanto si tiene texto como si no, para poder editarlo)
      // Para borrar, el usuario entra, borra el texto y hace blur
      editor.commands.setCaptionEditing(selection.from);
    }
  };

  // Reemplazar imagen
  const handleReplaceClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUserId) return;

    try {
      setIsUploading(true);
      const oldSrc = currentSrc;

      // Compresión si no es GIF
      let fileToUpload: File | Blob = file;
      if (!isGif(file.name) && !file.type.includes('gif')) {
        fileToUpload = await compressImage(file);
      }

      // Subida a Supabase Storage
      const newUrl = await uploadNoteImage(fileToUpload, currentUserId);

      // Actualizar src de la imagen en Tiptap / Yjs
      editor.chain().focus().updateAttributes('image', { src: newUrl }).run();

      // Borrado best-effort de la imagen anterior
      if (oldSrc && oldSrc.includes('attachments')) {
        deleteNoteImage(oldSrc);
      }

      toast.success('Imagen reemplazada con éxito');
    } catch (err: any) {
      console.error('[EditorImageBubbleMenu] Error reemplazando imagen:', err);
      toast.error(err.message || 'Error al reemplazar la imagen');
    } finally {
      setIsUploading(false);
    }
  };

  // Descargar imagen
  const handleDownload = async () => {
    if (!currentSrc) return;
    try {
      const response = await fetch(currentSrc);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `imagen_${Date.now()}.${blob.type.includes('webp') ? 'webp' : 'jpg'}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Descarga iniciada');
    } catch (err) {
      toast.error('No se pudo descargar la imagen');
    }
  };

  // Copiar imagen al portapapeles
  const handleCopyImage = async () => {
    if (!currentSrc) return;
    const ok = await copyImageToClipboard(currentSrc);
    if (ok) {
      toast.success('Imagen copiada al portapapeles');
    } else {
      toast.error('No se pudo copiar la imagen');
    }
  };

  // Cortar imagen (copiar y eliminar del editor)
  const handleCutImage = async () => {
    if (!currentSrc) return;
    const ok = await copyImageToClipboard(currentSrc);
    if (ok) {
      editor.chain().focus().deleteSelection().run();
      toast.success('Imagen cortada al portapapeles');
    } else {
      toast.error('No se pudo cortar la imagen');
    }
  };

  // Eliminar imagen con confirmación de 2 segundos
  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      if (deleteTimeoutRef.current) clearTimeout(deleteTimeoutRef.current);
      deleteTimeoutRef.current = setTimeout(() => {
        setConfirmDelete(false);
      }, 2500);
      return;
    }

    if (deleteTimeoutRef.current) clearTimeout(deleteTimeoutRef.current);
    setConfirmDelete(false);

    const oldSrc = currentSrc;
    // Eliminar nodo del editor
    editor.chain().focus().deleteSelection().run();

    // Borrado best-effort en Storage
    if (oldSrc && oldSrc.includes('attachments')) {
      deleteNoteImage(oldSrc);
    }

    toast.success('Imagen eliminada');
  };

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="imageBubbleMenu"
      shouldShow={shouldShowImageBubbleMenu}
      className="flex items-center gap-0.5 p-1 rounded-lg bg-white dark:bg-[#18181b] border border-slate-200 dark:border-zinc-800 shadow-lg z-50 text-slate-700 dark:text-zinc-200 text-xs select-none"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Alineación */}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => handleSetAlign('left')}
        title="Alinear a la izquierda"
        className={cn(
          'p-1.5 rounded transition-colors cursor-pointer flex items-center justify-center',
          currentAlign === 'left'
            ? 'text-accent bg-accent/15 font-semibold'
            : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-800'
        )}
      >
        <AlignLeft className="w-3.5 h-3.5" />
      </button>

      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => handleSetAlign('center')}
        title="Centrar"
        className={cn(
          'p-1.5 rounded transition-colors cursor-pointer flex items-center justify-center',
          currentAlign === 'center'
            ? 'text-accent bg-accent/15 font-semibold'
            : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-800'
        )}
      >
        <AlignCenter className="w-3.5 h-3.5" />
      </button>

      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => handleSetAlign('right')}
        title="Alinear a la derecha"
        className={cn(
          'p-1.5 rounded transition-colors cursor-pointer flex items-center justify-center',
          currentAlign === 'right'
            ? 'text-accent bg-accent/15 font-semibold'
            : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-800'
        )}
      >
        <AlignRight className="w-3.5 h-3.5" />
      </button>

      <div className="w-[1px] h-3.5 bg-slate-200 dark:bg-zinc-800 mx-1" />

      {/* Presets de tamaño */}
      {presets.map((pct) => {
        const activeWidth = currentWidth != null ? currentWidth : 100;
        const isSelected = activeWidth === pct;
        return (
          <button
            key={pct}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handleSetWidth(pct)}
            className={cn(
              'px-1.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer',
              isSelected
                ? 'text-accent bg-accent/15 font-semibold'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-800'
            )}
            title={`Ajustar a ${pct}%`}
          >
            {pct}%
          </button>
        );
      })}

      <div className="w-[1px] h-3.5 bg-slate-200 dark:bg-zinc-800 mx-1" />

      {/* Pie de foto */}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={handleToggleCaption}
        title={hasCaptionContent ? 'Editar pie de foto' : 'Añadir pie de foto'}
        className={cn(
          'p-1.5 rounded transition-colors cursor-pointer flex items-center justify-center',
          isCaptionActive
            ? 'text-accent bg-accent/15 font-semibold'
            : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-800'
        )}
      >
        <Subtitles className="w-3.5 h-3.5" />
      </button>

      {/* Reemplazar imagen */}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        disabled={isUploading}
        onClick={handleReplaceClick}
        title="Reemplazar imagen"
        className="p-1.5 rounded text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer flex items-center justify-center disabled:opacity-50"
      >
        {isUploading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
        ) : (
          <ImagePlus className="w-3.5 h-3.5" />
        )}
      </button>

      {/* Descargar */}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={handleDownload}
        title="Descargar imagen"
        className="p-1.5 rounded text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer flex items-center justify-center"
      >
        <Download className="w-3.5 h-3.5" />
      </button>

      {/* Copiar imagen */}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={handleCopyImage}
        title="Copiar imagen (Ctrl+C)"
        className="p-1.5 rounded text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer flex items-center justify-center"
      >
        <Copy className="w-3.5 h-3.5" />
      </button>

      {/* Cortar imagen */}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={handleCutImage}
        title="Cortar imagen (Ctrl+X)"
        className="p-1.5 rounded text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer flex items-center justify-center"
      >
        <Scissors className="w-3.5 h-3.5" />
      </button>

      <div className="w-[1px] h-3.5 bg-slate-200 dark:bg-zinc-800 mx-1" />

      {/* Controles avanzados de transformación (Fase 2) */}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        disabled={true}
        title={isImageGif ? 'GIFs no admiten recorte' : 'Recorte inline (Fase 2)'}
        className="p-1.5 rounded text-veyra-subtle cursor-not-allowed opacity-50 flex items-center justify-center"
      >
        <Crop className="w-3.5 h-3.5" />
      </button>

      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        disabled={true}
        title={isImageGif ? 'GIFs no admiten rotación' : 'Rotar 90° (Fase 2)'}
        className="p-1.5 rounded text-veyra-subtle cursor-not-allowed opacity-50 flex items-center justify-center"
      >
        <RotateCw className="w-3.5 h-3.5" />
      </button>

      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        disabled={true}
        title={isImageGif ? 'GIFs no admiten volteo' : 'Volteo horizontal (Fase 2)'}
        className="p-1.5 rounded text-veyra-subtle cursor-not-allowed opacity-50 flex items-center justify-center"
      >
        <FlipHorizontal className="w-3.5 h-3.5" />
      </button>

      {isImageGif && (
        <span
          className="text-[10px] text-amber-400/80 px-1 flex items-center gap-0.5"
          title="Los GIFs animados no admiten transformaciones destructivas"
        >
          <AlertCircle className="w-3 h-3" /> GIF
        </span>
      )}

      <div className="w-[1px] h-3.5 bg-veyra-border mx-1" />

      {/* Eliminar con confirmación rápida */}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={handleDelete}
        title={confirmDelete ? 'Haz clic para confirmar eliminación' : 'Eliminar imagen'}
        className={cn(
          'p-1.5 rounded transition-all cursor-pointer flex items-center gap-1',
          confirmDelete
            ? 'bg-red-500/20 text-red-400 font-medium px-2'
            : 'text-veyra-muted hover:text-red-400 hover:bg-red-500/10'
        )}
      >
        <Trash2 className="w-3.5 h-3.5" />
        {confirmDelete && <span className="text-[10px]">¿Eliminar?</span>}
      </button>
    </BubbleMenu>
  );
};
