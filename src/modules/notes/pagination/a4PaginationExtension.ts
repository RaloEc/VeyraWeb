import { Extension } from '@tiptap/core';
import { createA4PaginationPlugin, a4PaginationPluginKey } from './a4PaginationPlugin';
import type { A4VirtualBreakWidgetSpec } from './types';

export interface A4PaginationExtensionOptions {
  enabled?: boolean;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    a4Pagination: {
      setA4VirtualBreaks: (breaks: A4VirtualBreakWidgetSpec[]) => ReturnType;
      setA4PaginationEnabled: (enabled: boolean) => ReturnType;
    };
  }
}

/**
 * Extensión TipTap v3 para paginación A4 virtual basada en ProseMirror Decorations.
 * Mantiene la funcionalidad aislada y desactivada por defecto.
 */
export const A4PaginationExtension = Extension.create<A4PaginationExtensionOptions>({
  name: 'a4Pagination',

  addOptions() {
    return {
      enabled: true,
    };
  },

  addProseMirrorPlugins() {
    return [
      createA4PaginationPlugin({
        enabled: this.options.enabled ?? false,
      }),
    ];
  },

  addCommands() {
    return {
      setA4VirtualBreaks:
        (breaks: A4VirtualBreakWidgetSpec[]) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(a4PaginationPluginKey, { breaks });
          }
          return true;
        },

      setA4PaginationEnabled:
        (enabled: boolean) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(a4PaginationPluginKey, { enabled });
          }
          return true;
        },
    };
  },
});
