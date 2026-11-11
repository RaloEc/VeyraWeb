import { Node, mergeAttributes, InputRule } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { MathBlockNodeView } from './MathBlockNodeView';
import { MathInlineNodeView } from './MathInlineNodeView';
import { isValidInlineMath } from './mathUtils';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mathBlock: {
      insertMathBlock: (latex?: string) => ReturnType;
    };
    mathInline: {
      insertMathInline: (latex?: string) => ReturnType;
    };
  }
}

export const MathBlock = Node.create({
  name: 'mathBlock',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      latex: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-latex') || '',
        renderHTML: (attributes) => ({
          'data-latex': attributes.latex,
        }),
      },
      size: {
        default: 'normal',
        parseHTML: (element) => element.getAttribute('data-size') || 'normal',
        renderHTML: (attributes) => ({
          'data-size': attributes.size || 'normal',
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="math-block"]',
        getAttrs: (element) => ({
          latex:
            (element as HTMLElement).getAttribute('data-latex') ||
            (element as HTMLElement).textContent ||
            '',
        }),
      },
      {
        tag: 'div.veyra-math-block',
        getAttrs: (element) => ({
          latex:
            (element as HTMLElement).getAttribute('data-latex') ||
            (element as HTMLElement).textContent ||
            '',
        }),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'math-block' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathBlockNodeView);
  },

  addCommands() {
    return {
      insertMathBlock:
        (latex = '') =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: { latex },
          });
        },
    };
  },

  addInputRules() {
    return [
      new InputRule({
        find: /^\$\$\s*$/,
        handler: ({ state, range }) => {
          const { tr } = state;
          tr.replaceWith(range.from, range.to, this.type.create({ latex: '' }));
        },
      }),
    ];
  },
});

export const MathInline = Node.create({
  name: 'mathInline',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      latex: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-latex') || '',
        renderHTML: (attributes) => ({
          'data-latex': attributes.latex,
        }),
      },
      size: {
        default: 'normal',
        parseHTML: (element) => element.getAttribute('data-size') || 'normal',
        renderHTML: (attributes) => ({
          'data-size': attributes.size || 'normal',
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="math-inline"]',
        getAttrs: (element) => ({
          latex:
            (element as HTMLElement).getAttribute('data-latex') ||
            (element as HTMLElement).textContent ||
            '',
        }),
      },
      {
        tag: 'span.veyra-math-inline',
        getAttrs: (element) => ({
          latex:
            (element as HTMLElement).getAttribute('data-latex') ||
            (element as HTMLElement).textContent ||
            '',
        }),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'math-inline' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathInlineNodeView);
  },

  addCommands() {
    return {
      insertMathInline:
        (latex = '') =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: { latex },
          });
        },
    };
  },

  addInputRules() {
    return [
      new InputRule({
        find: /(?:^|\s)\$([^$\n]+)\$$/,
        handler: ({ state, range, match }) => {
          const latex = match[1]?.trim();
          if (!latex || !isValidInlineMath(latex)) return;
          const { tr } = state;
          const start = range.from + (match[0].startsWith(' ') ? 1 : 0);
          const end = range.to;
          tr.replaceWith(start, end, this.type.create({ latex }));
        },
      }),
    ];
  },
});

