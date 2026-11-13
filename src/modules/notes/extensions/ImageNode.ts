import Image from '@tiptap/extension-image';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { ImageNodeView } from './ImageNodeView';

export interface ImageNodeAttributes {
  src: string;
  alt?: string | null;
  title?: string | null;
  width?: number | null;
  caption?: string | null;
}

export interface ImageStorage {
  editingCaptionPos: number | null;
  croppingPos: number | null;
  currentUserId?: string | null;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    imageCaption: {
      setCaptionEditing: (pos: number) => ReturnType;
      clearCaptionEditing: () => ReturnType;
      setCropEditing: (pos: number) => ReturnType;
      clearCropEditing: () => ReturnType;
    };
  }
  interface Storage {
    image: ImageStorage;
  }
}

export const ImageNode = Image.extend({
  name: 'image',

  addStorage() {
    return {
      ...this.parent?.(),
      editingCaptionPos: null as number | null,
      croppingPos: null as number | null,
      currentUserId: null as string | null,
    };
  },

  addCommands() {
    return {
      ...this.parent?.(),
      setCaptionEditing:
        (pos: number) =>
        ({ editor }) => {
          const prev = editor.storage.image.editingCaptionPos;
          editor.storage.image.editingCaptionPos = pos;
          editor.storage.image.croppingPos = null;
          editor.view.dispatch(
            editor.state.tr.setMeta('captionEditing', { from: prev, to: pos })
          );
          return true;
        },
      clearCaptionEditing:
        () =>
        ({ editor }) => {
          const prev = editor.storage.image.editingCaptionPos;
          editor.storage.image.editingCaptionPos = null;
          editor.view.dispatch(
            editor.state.tr.setMeta('captionEditing', { from: prev, to: null })
          );
          return true;
        },
      setCropEditing:
        (pos: number) =>
        ({ editor }) => {
          const prev = editor.storage.image.croppingPos;
          editor.storage.image.croppingPos = pos;
          editor.storage.image.editingCaptionPos = null;
          editor.view.dispatch(
            editor.state.tr.setMeta('cropEditing', { from: prev, to: pos })
          );
          return true;
        },
      clearCropEditing:
        () =>
        ({ editor }) => {
          const prev = editor.storage.image.croppingPos;
          editor.storage.image.croppingPos = null;
          editor.view.dispatch(
            editor.state.tr.setMeta('cropEditing', { from: prev, to: null })
          );
          return true;
        },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView);
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const widthAttr = element.getAttribute('width');
          if (widthAttr) {
            const parsed = parseInt(widthAttr, 10);
            if (!isNaN(parsed) && parsed > 0 && parsed <= 100) {
              return parsed;
            }
          }
          const style = element.getAttribute('style') || '';
          const match = style.match(/width:\s*(\d+)%/i);
          if (match && match[1]) {
            const parsed = parseInt(match[1], 10);
            if (!isNaN(parsed) && parsed > 0 && parsed <= 100) {
              return parsed;
            }
          }
          return null;
        },
        renderHTML: (attributes: Record<string, any>) => {
          if (!attributes.width) {
            return {};
          }
          return {
            width: String(attributes.width),
          };
        },
      },
      caption: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          return element.getAttribute('data-caption') || null;
        },
        renderHTML: (attributes: Record<string, any>) => {
          if (!attributes.caption) {
            return {};
          }
          return {
            'data-caption': attributes.caption,
          };
        },
      },
    };
  },
}).configure({
  inline: false,
  allowBase64: false,
});
