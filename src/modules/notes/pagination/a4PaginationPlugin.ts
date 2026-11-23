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
  spacer.style.display = 'inline-block';
  spacer.style.verticalAlign = 'top';
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
            side: -1,
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
 * Obtiene los saltos virtuales vivos actualmente mapeados y aplicados en la vista del editor.
 */
export function getLiveVirtualBreaks(state: EditorState): A4VirtualBreakWidgetSpec[] {
  const pluginState = a4PaginationPluginKey.getState(state);
  return pluginState?.breaks ?? [];
}

/**
 * Indica si el plugin de paginación A4 virtual está habilitado en el estado actual.
 */
export function isA4PaginationEnabled(state: EditorState): boolean {
  return Boolean(a4PaginationPluginKey.getState(state)?.enabled);
}

function areVirtualBreaksEqual(
  a: A4VirtualBreakWidgetSpec[],
  b: A4VirtualBreakWidgetSpec[]
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].pos !== b[i].pos ||
      a[i].spacerHeight !== b[i].spacerHeight ||
      a[i].sheetIndex !== b[i].sheetIndex
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Plugin ProseMirror para paginación A4 virtual.
 * Gestiona decoraciones puramente efímeras en la capa de vista sin alterar Yjs ni el documento persistente.
 */
export function createA4PaginationPlugin(options: CreateA4PaginationPluginOptions = {}) {
  return new Plugin<A4PaginationPluginState>({
    key: a4PaginationPluginKey,

    state: {
      init(): A4PaginationPluginState {
        const enabled = options.enabled ?? false;
        return {
          breaks: [],
          enabled,
          decorations: DecorationSet.empty,
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

          if (
            nextEnabled === prevState.enabled &&
            areVirtualBreaksEqual(nextBreaks, prevState.breaks)
          ) {
            return prevState;
          }

          const nextDecorations = buildDecorationSet(newState.doc, nextBreaks, nextEnabled);
          return {
            breaks: nextBreaks,
            enabled: nextEnabled,
            decorations: nextDecorations,
          };
        }

        // Si el documento cambió por edición, mapear las posiciones de los saltos y decoraciones
        if (tr.docChanged && prevState.enabled) {
          const mappedDecorations = prevState.decorations !== DecorationSet.empty
            ? prevState.decorations.map(tr.mapping, newState.doc)
            : DecorationSet.empty;

          const mappedBreaks = prevState.breaks.map((b) => ({
            ...b,
            pos: tr.mapping.map(b.pos, -1),
          }));

          return {
            ...prevState,
            breaks: mappedBreaks,
            decorations: mappedDecorations,
          };
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
        return pluginState.decorations;
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

        for (const b of pluginState.breaks) {
          if (Math.abs(head - b.pos) > 4) {
            continue;
          }
          const from = Math.min(head, b.pos);
          const to = Math.max(head, b.pos);
          const textBetween = view.state.doc.textBetween(from, to);
          const isOnlyWhitespace = /^\s*$/.test(textBetween);

          // Flecha Abajo desde el final de la hoja anterior
          if (event.key === 'ArrowDown' && head < b.pos && isOnlyWhitespace) {
            const nextPos = Math.min(view.state.doc.content.size - 1, b.pos);
            view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, nextPos)));
            return true;
          }

          // Flecha Arriba desde el inicio de la hoja siguiente
          if (event.key === 'ArrowUp' && head >= b.pos && isOnlyWhitespace) {
            const prevPos = Math.max(1, b.pos - 1);
            view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, prevPos)));
            return true;
          }

          // Flecha Derecha desde el final de la hoja anterior
          if (event.key === 'ArrowRight' && head < b.pos && isOnlyWhitespace) {
            const nextPos = Math.min(view.state.doc.content.size - 1, b.pos);
            view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, nextPos)));
            return true;
          }

          // Flecha Izquierda desde el inicio de la hoja siguiente
          if (event.key === 'ArrowLeft' && head >= b.pos && isOnlyWhitespace) {
            const prevPos = Math.max(1, b.pos - 1);
            view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, prevPos)));
            return true;
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
