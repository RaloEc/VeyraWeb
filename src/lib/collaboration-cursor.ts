import { Extension } from '@tiptap/core';
import { defaultSelectionBuilder, yCursorPlugin } from '@tiptap/y-tiptap';
import type { Awareness } from 'y-protocols/awareness';

export interface CollaborationCursorOptions {
  provider: {
    awareness: Awareness;
  } | null;
  user: {
    name: string | null;
    color: string | null;
    id?: string | null;
    userId?: string | null;
    isEditing?: boolean;
  };
  render?: (user: { name: string; color: string }) => HTMLElement;
  selectionRender?: typeof defaultSelectionBuilder;
}

/**
 * Tiptap v3 native CollaborationCursor extension powered by @tiptap/y-tiptap.
 * Replaces the deprecated v2 extension to ensure perfect alignment with Tiptap v3 ySyncPlugin.
 */
const SAFE_HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
const DEFAULT_CURSOR_COLOR = '#8B5CF6';

function getSafeCursorColor(color: string | null | undefined): string {
  return color && SAFE_HEX_COLOR_RE.test(color.trim()) ? color.trim() : DEFAULT_CURSOR_COLOR;
}

export const CollaborationCursor = Extension.create<CollaborationCursorOptions>({
  name: 'collaborationCursor',

  addOptions() {
    return {
      provider: null,
      user: {
        name: null,
        color: null,
      },
      render: (user: { name: string; color: string }) => {
        const safeColor = getSafeCursorColor(user.color);
        const cursor = document.createElement('span');
        cursor.classList.add('collaboration-cursor__caret');
        cursor.style.borderColor = safeColor;

        const label = document.createElement('div');
        label.classList.add('collaboration-cursor__label');
        label.style.backgroundColor = safeColor;
        label.insertBefore(document.createTextNode(user.name || 'Colaborador'), null);

        cursor.insertBefore(label, null);
        return cursor;
      },
      selectionRender: defaultSelectionBuilder,
    };
  },

  addProseMirrorPlugins() {
    const awareness = this.options.provider?.awareness;
    if (!awareness) {
      return [];
    }

    // Wrap setLocalStateField to prevent temporary DOM focus loss (e.g. switching to phone) from clearing remote cursor
    if (!(awareness as any).__veyra_cursor_wrapped) {
      const originalSetLocalStateField = awareness.setLocalStateField.bind(awareness);
      awareness.setLocalStateField = (field: string, value: any) => {
        if (field === 'cursor' && value === null) {
          // Preserve last known cursor position so collaborators on mobile can still see where the PC user is
          return;
        }
        return originalSetLocalStateField(field, value);
      };
      (awareness as any).__veyra_cursor_wrapped = true;
    }

    if (this.options.user) {
      awareness.setLocalStateField('user', this.options.user);
    }

    return [
      yCursorPlugin(awareness, {
        cursorBuilder: this.options.render,
        selectionBuilder: this.options.selectionRender,
      }),
    ];
  },
});

