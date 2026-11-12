import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { BookmarkNodeView } from './BookmarkNodeView';

export interface BookmarkAttributes {
  url: string;
  title?: string;
  description?: string;
  favicon?: string;
  domain?: string;
  image?: string | null;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    bookmark: {
      setBookmark: (attributes: BookmarkAttributes) => ReturnType;
    };
  }
}

export const BookmarkNode = Node.create({
  name: 'bookmark',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: false,

  addAttributes() {
    return {
      url: {
        default: '',
        parseHTML: (element) =>
          element.getAttribute('data-bookmark-url') ||
          element.getAttribute('href') ||
          '',
        renderHTML: (attributes) => ({
          'data-bookmark-url': attributes.url,
        }),
      },
      title: {
        default: '',
        parseHTML: (element) =>
          element.getAttribute('data-bookmark-title') ||
          element.querySelector('.veyra-bookmark-title')?.textContent ||
          '',
        renderHTML: (attributes) => ({
          'data-bookmark-title': attributes.title || '',
        }),
      },
      description: {
        default: '',
        parseHTML: (element) =>
          element.getAttribute('data-bookmark-desc') ||
          element.querySelector('.veyra-bookmark-desc')?.textContent ||
          '',
        renderHTML: (attributes) => ({
          'data-bookmark-desc': attributes.description || '',
        }),
      },
      favicon: {
        default: '',
        parseHTML: (element) =>
          element.getAttribute('data-bookmark-favicon') ||
          element.querySelector('.veyra-bookmark-favicon')?.getAttribute('src') ||
          '',
        renderHTML: (attributes) => ({
          'data-bookmark-favicon': attributes.favicon || '',
        }),
      },
      domain: {
        default: '',
        parseHTML: (element) =>
          element.getAttribute('data-bookmark-domain') ||
          element.querySelector('.veyra-bookmark-domain')?.textContent ||
          '',
        renderHTML: (attributes) => ({
          'data-bookmark-domain': attributes.domain || '',
        }),
      },
      image: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute('data-bookmark-image') ||
          element.querySelector('.veyra-bookmark-cover')?.getAttribute('src') ||
          null,
        renderHTML: (attributes) => {
          if (!attributes.image) return {};
          return {
            'data-bookmark-image': attributes.image,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-bookmark-url]',
      },
      {
        tag: 'a[data-bookmark-card]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const url = HTMLAttributes['data-bookmark-url'] || '#';
    const title = HTMLAttributes['data-bookmark-title'] || url;
    const desc = HTMLAttributes['data-bookmark-desc'] || '';
    const domain = HTMLAttributes['data-bookmark-domain'] || '';
    const favicon = HTMLAttributes['data-bookmark-favicon'] || '';
    const image = HTMLAttributes['data-bookmark-image'] || '';

    return [
      'a',
      mergeAttributes(
        {
          href: url,
          target: '_blank',
          rel: 'noopener noreferrer',
          class: 'veyra-bookmark-card',
          'data-bookmark-card': '',
        },
        HTMLAttributes
      ),
      [
        'div',
        { class: 'veyra-bookmark-body' },
        ['div', { class: 'veyra-bookmark-title' }, title],
        desc ? ['div', { class: 'veyra-bookmark-desc' }, desc] : ['span', {}],
        [
          'div',
          { class: 'veyra-bookmark-meta' },
          favicon
            ? [
                'img',
                {
                  class: 'veyra-bookmark-favicon',
                  src: favicon,
                  alt: '',
                  loading: 'lazy',
                },
              ]
            : ['span', {}],
          ['span', { class: 'veyra-bookmark-domain' }, domain || url],
        ],
      ],
      image
        ? [
            'div',
            { class: 'veyra-bookmark-cover-wrapper' },
            [
              'img',
              {
                class: 'veyra-bookmark-cover',
                src: image,
                alt: '',
                loading: 'lazy',
              },
            ],
          ]
        : ['span', {}],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(BookmarkNodeView);
  },

  addCommands() {
    return {
      setBookmark:
        (attributes) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: attributes,
          });
        },
    };
  },
});

