import { Node, mergeAttributes, InputRule } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { AIPromptNodeView } from './AIPromptNodeView';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    aiPrompt: {
      insertAIPrompt: () => ReturnType;
    };
  }
}

export const AIPrompt = Node.create({
  name: 'aiPrompt',
  group: 'block',
  atom: true,
  selectable: false,
  draggable: false,

  parseHTML() {
    return [
      {
        tag: 'div[data-type="ai-prompt"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'ai-prompt' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AIPromptNodeView, {
      stopEvent: () => true,
    });
  },

  addCommands() {
    return {
      insertAIPrompt:
        () =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
          });
        },
    };
  },

  addInputRules() {
    return [
      new InputRule({
        find: /^\/(?:ia|ai)\s$/,
        handler: ({ state, range }) => {
          const { tr } = state;
          tr.replaceWith(range.from, range.to, this.type.create());
        },
      }),
    ];
  },
});

