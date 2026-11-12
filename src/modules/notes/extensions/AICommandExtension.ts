import { Extension } from '@tiptap/core';

export const AICommandExtension = Extension.create({
  name: 'aiCommand',

  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        const { state } = editor;
        const { selection } = state;

        if (!selection.empty) {
          return false;
        }

        const { $from } = selection;
        const parentNode = $from.parent;

        if (!parentNode || !parentNode.isTextblock) {
          return false;
        }

        const lineText = parentNode.textContent;

        // Si la línea es /ia o /ai (con o sin espacios)
        const match = lineText.match(/^\s*\/(?:ia|ai)\s*$/i);
        if (!match) {
          return false;
        }

        const fromPos = $from.start();
        const toPos = $from.end();

        // Reemplazar la línea por el nodo interactivo inline de IA
        editor
          .chain()
          .focus()
          .deleteRange({ from: fromPos, to: toPos })
          .insertContent({ type: 'aiPrompt' })
          .run();

        return true;
      },
    };
  },
});
