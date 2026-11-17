import { Plugin, PluginKey, type EditorState, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import type { A4PaginationPluginState, A4VirtualBreakWidgetSpec } from './types';

export const a4PaginationPluginKey = new PluginKey<A4PaginationPluginState>('a4PaginationPlugin');

/**
 * Crea el elemento DOM para el widget decorativo de salto de página virtual.
 * Actúa como espaciador vertical exacto entre la última línea de la hoja N
 * y la primera línea imprimible de la hoja N+1.
 */
function createVirtualBreakDOM(spec: A4VirtualBreakWidgetSpec): HTMLElement {
  const spacer = document.createElement('span');
  spacer.className = 'a4-virtual-page-break';
  spacer.setAttribute('contenteditable', 'false');
  spacer.setAttribute('data-sheet-index', String(spec.sheetIndex + 1));
  spacer.setAttribute('data-spacer-height', `${spec.spacerHeight}px`);
  spacer.style.display = 'block';
  spacer.style.height = `${spec.spacerHeight}px`;
  spacer.style.width = '100%';
  spacer.style.pointerEvents = 'none';
  spacer.style.userSelect = 'none';
  spacer.style.background = 'transparent';
  return spacer;
}

/**
 * Genera el conjunto de decoraciones a partir de las especificaciones de salto de página.
 */
function buildDecorationSet(
  doc: EditorState['doc'],
  breaks: A4VirtualBreakWidgetSpec[],
  enabled: boolean
): DecorationSet {
  if (!enabled || breaks.length === 0) {
    return DecorationSet.empty;
  }

  const decorations: Decoration[] = [];
  const docSize = doc.content.size;

  for (const b of breaks) {
    // Validar que la posición caiga dentro del rango válido del documento
    if (b.pos > 0 && b.pos < docSize) {
      decorations.push(
        Decoration.widget(
          b.pos,
          () => createVirtualBreakDOM(b),
          {
            side: 1,
            key: `a4-vbreak-${b.sheetIndex}-${b.pos}`,
            marks: [],
          }
        )
      );
    }
  }

  return DecorationSet.create(doc, decorations);
}

export interface CreateA4PaginationPluginOptions {
  enabled?: boolean;
}

/**
 * Plugin ProseMirror para paginación A4 virtual.
 * Gestiona decoraciones puramente efímeras en la capa de vista sin alterar Yjs ni el documento persistente.
 */
export function createA4PaginationPlugin(options: CreateA4PaginationPluginOptions = {}) {
  let decorationSet = DecorationSet.empty;

  return new Plugin<A4PaginationPluginState>({
    key: a4PaginationPluginKey,

    state: {
      init(): A4PaginationPluginState {
        const enabled = options.enabled ?? false;
        decorationSet = DecorationSet.empty;
        return {
          breaks: [],
          enabled,
        };
      },

      apply(tr, prevState, _, newState): A4PaginationPluginState {
        const meta = tr.getMeta(a4PaginationPluginKey);

        // Si la transacción incluye nueva metadata de saltos calculados
        if (meta && typeof meta === 'object') {
          const nextEnabled = typeof meta.enabled === 'boolean' ? meta.enabled : prevState.enabled;
          const nextBreaks: A4VirtualBreakWidgetSpec[] = Array.isArray(meta.breaks)
            ? meta.breaks
            : prevState.breaks;

          decorationSet = buildDecorationSet(newState.doc, nextBreaks, nextEnabled);
          return {
            breaks: nextBreaks,
            enabled: nextEnabled,
          };
        }

        // Si el documento cambió por edición, mapear las posiciones de los saltos existentes
        if (tr.docChanged && prevState.enabled && decorationSet !== DecorationSet.empty) {
          decorationSet = decorationSet.map(tr.mapping, newState.doc);
        }

        return prevState;
      },
    },

    props: {
      decorations(state) {
        const pluginState = a4PaginationPluginKey.getState(state);
        if (!pluginState || !pluginState.enabled) {
          return DecorationSet.empty;
        }
        return decorationSet;
      },

      // Interceptor de teclado para navegación fluida a través del salto virtual
      handleKeyDown(view: EditorView, event: KeyboardEvent): boolean {
        const pluginState = a4PaginationPluginKey.getState(view.state);
        if (!pluginState || !pluginState.enabled || pluginState.breaks.length === 0) {
          return false;
        }

        const { selection } = view.state;
        if (!(selection instanceof TextSelection) || !selection.empty) {
          return false;
        }

        const head = selection.head;

        // Flecha Abajo en la frontera del salto
        if (event.key === 'ArrowDown') {
          for (const b of pluginState.breaks) {
            if (head === b.pos) {
              const nextPos = Math.min(view.state.doc.content.size - 1, b.pos + 1);
              view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, nextPos)));
              return true;
            }
          }
        }

        // Flecha Arriba en la frontera del salto
        if (event.key === 'ArrowUp') {
          for (const b of pluginState.breaks) {
            if (head === b.pos + 1 || head === b.pos) {
              const prevPos = Math.max(1, b.pos - 1);
              view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, prevPos)));
              return true;
            }
          }
        }

        // Backspace en el primer carácter de la siguiente hoja
        if (event.key === 'Backspace') {
          for (const b of pluginState.breaks) {
            if (head === b.pos) {
              // Permitir que TipTap borre el carácter anterior al salto con normalidad
              return false;
            }
          }
        }

        return false;
      },
    },
  });
}
