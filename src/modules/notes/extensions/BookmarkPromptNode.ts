import { Node, mergeAttributes, InputRule } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { BookmarkPromptNodeView } from './BookmarkPromptNodeView';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    bookmarkPrompt: {
      insertBookmarkPrompt: () => ReturnType;
    };
  }
}

export const BookmarkPrompt = Node.create({
  name: 'bookmarkPrompt',
  group: 'block',
  atom: true,
  selectable: false,
  draggable: false,

  parseHTML() {
    return [
      {
        tag: 'div[data-type="bookmark-prompt"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'bookmark-prompt' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(BookmarkPromptNodeView, {
      stopEvent: () => true,
    });
  },

  addCommands() {
    return {
      insertBookmarkPrompt:
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
        find: /^\/(?:enlace|link|bookmark)\s$/,
        handler: ({ state, range }) => {
          const { tr } = state;
          tr.replaceWith(range.from, range.to, this.type.create());
        },
      }),
    ];
  },
});

