import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { CodeBlockNodeView } from './CodeBlockNodeView';

export const lowlight = createLowlight(common);

export const CustomCodeBlock = CodeBlockLowlight.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      wrap: {
        default: false,
        parseHTML: (element) => element.getAttribute('data-wrap') === 'true',
        renderHTML: (attributes) =>
          attributes.wrap ? { 'data-wrap': 'true' } : {},
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockNodeView);
  },

  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      Tab: () => {
        if (this.editor.isActive(this.name)) {
          return this.editor.commands.insertContent('  ');
        }
        return false;
      },
      'Shift-Enter': () => {
        if (this.editor.isActive(this.name)) {
          return this.editor.chain().exitCode().run();
        }
        return false;
      },
      'Mod-Enter': () => {
        if (this.editor.isActive(this.name)) {
          return this.editor.chain().exitCode().run();
        }
        return false;
      },
      Backspace: () => {
        const { empty, $anchor } = this.editor.state.selection;
        const isAtStart = $anchor.parentOffset === 0;
        if (
          empty &&
          isAtStart &&
          $anchor.parent.type.name === this.name &&
          $anchor.parent.textContent.length === 0
        ) {
          return this.editor.commands.clearNodes();
        }
        return false;
      },
    };
  },
}).configure({
  lowlight,
  defaultLanguage: 'auto',
});
