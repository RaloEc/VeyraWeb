import { Extension } from '@tiptap/core';
import { NodeSelection, Selection } from '@tiptap/pm/state';
import { copyImageToClipboard } from '../utils/clipboardImageUtils';
import { toast } from 'sonner';

/**
 * Extension para asegurar que los atajos de teclado del portapapeles
 * (Ctrl+C, Ctrl+X, Ctrl+V en Windows/Linux o Cmd en macOS, incluyendo imágenes)
 * y el borrado inteligente (Backspace y Delete en viñetas vacías y bloques adyacentes)
 * funcionen siempre de manera confiable en el editor de notas de Veyra.
 */
export const KeyboardClipboard = Extension.create({
  name: 'keyboardClipboard',

  addKeyboardShortcuts() {
    return {
      // Atajo de teclado: Copiar (Ctrl+C / Cmd+C)
      'Mod-c': ({ editor }) => {
        const { state } = editor;
        const { selection } = state;
        if (selection.empty) return false;

        // Soporte completo para copiar imagen seleccionada
        if (selection instanceof NodeSelection && selection.node.type.name === 'image') {
          const src = selection.node.attrs.src;
          if (src) {
            copyImageToClipboard(src).then((ok) => {
              if (ok) toast.success('Imagen copiada al portapapeles');
            });
            return true;
          }
        }

        const text = state.doc.textBetween(selection.from, selection.to, '\n');
        if (text && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(text).catch(() => {});
        }
        // Retornamos false para permitir que el evento de portapapeles nativo 'copy'
        // del navegador también se propague y conserve el formato HTML/enriquecido.
        return false;
      },

      // Atajo de teclado: Cortar (Ctrl+X / Cmd+X)
      'Mod-x': ({ editor }) => {
        const { state, commands } = editor;
        const { selection } = state;
        if (selection.empty) return false;

        // Soporte completo para cortar imagen seleccionada
        if (selection instanceof NodeSelection && selection.node.type.name === 'image') {
          const src = selection.node.attrs.src;
          if (src) {
            copyImageToClipboard(src).then((ok) => {
              if (ok) toast.success('Imagen cortada al portapapeles');
            });
            commands.deleteSelection();
            return true;
          }
        }

        const text = state.doc.textBetween(selection.from, selection.to, '\n');
        if (text && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(text).catch(() => {});
        }
        // Eliminamos la selección actual y confirmamos la captura
        commands.deleteSelection();
        return true;
      },

      // Atajo de teclado: Pegar (Ctrl+V / Cmd+V)
      'Mod-v': () => {
        // Retornar false permite que el evento nativo 'paste' del navegador se ejecute
        // pasando event.clipboardData de forma síncrona a handlePaste en NoteEditor.
        return false;
      },

      // Borrado inteligente con Retroceso (Backspace)
      Backspace: ({ editor }) => {
        const { state, view } = editor;
        const { selection } = state;
        if (!selection.empty) return false;

        const { $from } = selection;

        // Caso 1: El cursor está dentro de una viñeta / elemento de lista vacío (listItem o taskItem)
        for (let d = $from.depth; d > 0; d--) {
          const node = $from.node(d);
          if (node.type.name === 'listItem' || node.type.name === 'taskItem') {
            const parentList = $from.node(d - 1);
            const isParentList =
              parentList &&
              ['bulletList', 'orderedList', 'taskList'].includes(parentList.type.name);

            const isItemEmpty =
              node.textContent.trim() === '' &&
              (node.childCount === 0 ||
                (node.childCount === 1 &&
                  (node.firstChild?.childCount === 0 || node.firstChild?.textContent === '')));

            if (isItemEmpty && isParentList) {
              const tr = state.tr;
              if (parentList.childCount > 1) {
                // Eliminar el elemento de lista vacío completamente
                const itemStart = $from.before(d);
                const itemEnd = $from.after(d);
                tr.delete(itemStart, itemEnd);
                // Ubicar el cursor en el elemento anterior
                const safePos = Math.max(1, itemStart - 1);
                const resolved = tr.doc.resolve(safePos);
                tr.setSelection(Selection.near(resolved, -1));
              } else {
                // Único elemento en la lista: convertir la lista en un párrafo normal
                const listStart = $from.before(d - 1);
                const listEnd = $from.after(d - 1);
                const p = editor.schema.nodes.paragraph.create();
                tr.replaceWith(listStart, listEnd, p);
                tr.setSelection(Selection.near(tr.doc.resolve(listStart + 1)));
              }
              view.dispatch(tr);
              return true;
            }
            break;
          }
        }

        // Caso 2: El cursor está dentro de un párrafo vacío inmediatamente después de una lista
        if (
          $from.parent.type.name === 'paragraph' &&
          $from.parent.textContent === '' &&
          $from.parentOffset === 0
        ) {
          const pIndex = $from.index(0);
          if (pIndex > 0) {
            const prevNode = $from.node(0).child(pIndex - 1);
            if (['bulletList', 'orderedList', 'taskList'].includes(prevNode.type.name)) {
              const tr = state.tr;
              const pStart = $from.before(1);
              const pEnd = $from.after(1);
              tr.delete(pStart, pEnd);
              const safePos = Math.max(1, pStart - 1);
              tr.setSelection(Selection.near(tr.doc.resolve(safePos), -1));
              view.dispatch(tr);
              return true;
            }
          }
        }

        return false;
      },

      // Borrado hacia adelante con Supr (Delete)
      Delete: ({ editor }) => {
        const { state, view } = editor;
        const { selection } = state;
        if (!selection.empty) return false;

        const { $from } = selection;

        // Caso 1: El cursor está en un elemento de lista vacío (listItem o taskItem)
        for (let d = $from.depth; d > 0; d--) {
          const node = $from.node(d);
          if (node.type.name === 'listItem' || node.type.name === 'taskItem') {
            const parentList = $from.node(d - 1);
            const isParentList =
              parentList &&
              ['bulletList', 'orderedList', 'taskList'].includes(parentList.type.name);

            const isItemEmpty =
              node.textContent.trim() === '' &&
              (node.childCount === 0 ||
                (node.childCount === 1 &&
                  (node.firstChild?.childCount === 0 || node.firstChild?.textContent === '')));

            if (isItemEmpty && isParentList) {
              const tr = state.tr;
              if (parentList.childCount > 1) {
                const itemStart = $from.before(d);
                const itemEnd = $from.after(d);
                tr.delete(itemStart, itemEnd);
                const safePos = Math.min(tr.doc.content.size, itemStart);
                tr.setSelection(Selection.near(tr.doc.resolve(safePos), 1));
              } else {
                const listStart = $from.before(d - 1);
                const listEnd = $from.after(d - 1);
                const p = editor.schema.nodes.paragraph.create();
                tr.replaceWith(listStart, listEnd, p);
                tr.setSelection(Selection.near(tr.doc.resolve(listStart + 1)));
              }
              view.dispatch(tr);
              return true;
            }
            break;
          }
        }

        // Caso 2: Al final de un bloque cuando el siguiente elemento hermano es un párrafo vacío
        const parent = $from.parent;
        const isAtEnd = $from.parentOffset >= parent.content.size;
        if (isAtEnd && $from.depth === 1) {
          const docIndex = $from.index(0);
          if (docIndex < state.doc.childCount - 1) {
            const nextNode = state.doc.child(docIndex + 1);
            if (nextNode.type.name === 'paragraph' && nextNode.textContent === '') {
              const nextStart = $from.after(1);
              const nextEnd = nextStart + nextNode.nodeSize;
              const tr = state.tr;
              tr.delete(nextStart, nextEnd);
              view.dispatch(tr);
              return true;
            }
          }
        }

        return false;
      },
    };
  },
});
