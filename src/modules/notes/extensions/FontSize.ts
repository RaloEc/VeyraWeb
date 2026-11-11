import { Extension } from '@tiptap/core';
import '@tiptap/extension-text-style';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (fontSize: string) => ReturnType;
      unsetFontSize: () => ReturnType;
    };
  }
}

export const FONT_SIZES = [
  { label: 'Muy pequeño', value: '11px', size: 11 },
  { label: 'Pequeño', value: '12px', size: 12 },
  { label: 'Normal', value: '14px', size: 14 },
  { label: 'Mediano', value: '16px', size: 16 },
  { label: 'Grande', value: '18px', size: 18 },
  { label: 'Muy grande', value: '20px', size: 20 },
  { label: 'Título 3', value: '24px', size: 24 },
  { label: 'Título 2', value: '28px', size: 28 },
  { label: 'Título 1', value: '32px', size: 32 },
] as const;

export const DEFAULT_FONT_SIZE = '14px';

export function getNextLargerFontSize(currentSize: string | null | undefined): string {
  const num = parseInt(currentSize || DEFAULT_FONT_SIZE, 10) || 14;
  const next = FONT_SIZES.find((s) => s.size > num);
  return next ? next.value : `${num + 4}px`;
}

export function getNextSmallerFontSize(currentSize: string | null | undefined): string {
  const num = parseInt(currentSize || DEFAULT_FONT_SIZE, 10) || 14;
  const prev = [...FONT_SIZES].reverse().find((s) => s.size < num);
  return prev ? prev.value : `${Math.max(10, num - 2)}px`;
}

export const FontSize = Extension.create({
  name: 'fontSize',

  addOptions() {
    return {
      types: ['textStyle'],
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element) => element.style.fontSize || null,
            renderHTML: (attributes) => {
              if (!attributes.fontSize) {
                return {};
              }

              return {
                style: `font-size: ${attributes.fontSize}`,
              };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setFontSize:
        (fontSize: string) =>
        ({ chain }) => {
          return chain().setMark('textStyle', { fontSize }).run();
        },
      unsetFontSize:
        () =>
        ({ chain }) => {
          return chain()
            .setMark('textStyle', { fontSize: null })
            .removeEmptyTextStyle()
            .run();
        },
    };
  },
});

