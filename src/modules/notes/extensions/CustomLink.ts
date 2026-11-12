import { Mark } from '@tiptap/core';

export const CustomLink = Mark.create({
  name: 'link',
  priority: 1000,
  keepOnSplit: false,
  inclusive: false,

  addAttributes() {
    return {
      href: {
        default: null,
        parseHTML: (element) => element.getAttribute('href'),
      },
      target: {
        default: '_blank',
      },
      rel: {
        default: 'noopener noreferrer nofollow',
      },
      class: {
        default: 'text-accent underline underline-offset-2 hover:opacity-80 transition-opacity',
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'a[href]:not([data-bookmark-card])',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['a', HTMLAttributes, 0];
  },
});

