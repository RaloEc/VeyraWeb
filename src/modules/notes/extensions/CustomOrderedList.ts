import OrderedList from '@tiptap/extension-ordered-list';

export type NumberingStyle =
  | 'decimal'            // 1. 2. 3.
  | 'decimal-paren'      // 1) 2) 3)
  | 'upper-roman'        // I. II. III.
  | 'upper-alpha'        // A. B. C.
  | 'lower-alpha-paren'  // a) b) c)
  | 'lower-alpha'        // a. b. c.
  | 'lower-roman';       // i. ii. iii.

export const CustomOrderedList = OrderedList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      listStyle: {
        default: 'decimal',
        parseHTML: (element) => {
          return element.getAttribute('data-list-style') || 'decimal';
        },
        renderHTML: (attributes) => {
          if (!attributes.listStyle || attributes.listStyle === 'decimal') {
            return { 'data-list-style': 'decimal' };
          }
          return {
            'data-list-style': attributes.listStyle,
          };
        },
      },
    };
  },
});

