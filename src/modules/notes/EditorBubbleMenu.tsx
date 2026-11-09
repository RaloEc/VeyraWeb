import React, { useState } from 'react';
import type { Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Highlighter,
  Code,
  Copy,
  ClipboardPaste,
  Check,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { YT_REGEX } from '../../lib/tiptap-youtube-node';

export interface EditorBubbleMenuProps {
  editor: Editor | null;
}

export const EditorBubbleMenu: React.FC<EditorBubbleMenuProps> = ({ editor }) => {
  if (!editor) return null;

  const [copied, setCopied] = useState<boolean>(false);

  const handleCopy = () => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const text = editor.state.doc.textBetween(from, to, ' ');
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handlePaste = async () => {
    if (!editor) return;
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      const cleaned = text.split(/\r?\n/)[0].replace(/[\u200B-\u200D\uFEFF\r\n\t]/g, '').trim();
      const match = cleaned.match(YT_REGEX);
      if (match && match[1]) {
        editor.chain().focus().setYoutube({ videoId: match[1], embed: true }).run();
      } else {
        editor.chain().focus().insertContent(text).run();
      }
    } catch (err) {
      console.warn('[bubble paste]', err);
    }
  };

  const btn = (
    isActive: boolean,
    onClick: () => void,
    icon: React.ReactNode,
    title: string
  ) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'p-1.5 rounded text-xs transition-colors cursor-pointer flex items-center justify-center',
        isActive
          ? 'text-accent bg-accent/15 font-semibold'
          : 'text-veyra-muted hover:text-veyra-text hover:bg-white/5'
      )}
    >
      {icon}
    </button>
  );

  return (
    <BubbleMenu
      editor={editor}
      shouldShow={({ editor }) => {
        return !editor.view.state.selection.empty && !editor.isActive('image');
      }}
      className="flex items-center gap-0.5 p-1 rounded-md bg-veyra-surface border border-veyra-border shadow-elevated z-50 backdrop-blur-md"
    >
      {btn(
        editor.isActive('bold'),
        () => editor.chain().focus().toggleBold().run(),
        <Bold className="w-3.5 h-3.5" />,
        'Negrita (Ctrl+B)'
      )}
      {btn(
        editor.isActive('italic'),
        () => editor.chain().focus().toggleItalic().run(),
        <Italic className="w-3.5 h-3.5" />,
        'Cursiva (Ctrl+I)'
      )}
      {btn(
        editor.isActive('underline'),
        () => editor.chain().focus().toggleUnderline().run(),
        <UnderlineIcon className="w-3.5 h-3.5" />,
        'Subrayado (Ctrl+U)'
      )}
      {btn(
        editor.isActive('strike'),
        () => editor.chain().focus().toggleStrike().run(),
        <Strikethrough className="w-3.5 h-3.5" />,
        'Tachado'
      )}
      {btn(
        editor.isActive('highlight'),
        () => editor.chain().focus().toggleHighlight().run(),
        <Highlighter className="w-3.5 h-3.5" />,
        'Resaltar'
      )}
      {btn(
        editor.isActive('code'),
        () => editor.chain().focus().toggleCode().run(),
        <Code className="w-3.5 h-3.5" />,
        'Código en línea'
      )}
      {btn(
        copied,
        handleCopy,
        copied ? <Check className="w-3.5 h-3.5 text-accent" /> : <Copy className="w-3.5 h-3.5" />,
        'Copiar (Ctrl+C)'
      )}
      {btn(
        false,
        handlePaste,
        <ClipboardPaste className="w-3.5 h-3.5" />,
        'Pegar'
      )}
    </BubbleMenu>
  );
};
