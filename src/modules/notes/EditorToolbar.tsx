import React, { useRef } from 'react';
import type { Editor } from '@tiptap/react';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Highlighter,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Quote,
  Image as ImageIcon,
  Undo,
  Redo,
} from 'lucide-react';
import { cn } from '../../lib/utils';

export interface EditorToolbarProps {
  editor: Editor | null;
  onUploadImage?: (file: File) => Promise<void>;
}

export const EditorToolbar: React.FC<EditorToolbarProps> = ({ editor, onUploadImage }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!editor) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onUploadImage) {
      await onUploadImage(file);
    }
    if (e.target) {
      e.target.value = '';
    }
  };

  const toolBtn = (
    isActive: boolean,
    onClick: () => void,
    icon: React.ReactNode,
    title: string
  ) => (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      className={cn(
        'h-7 px-1.5 rounded-md transition-colors flex items-center justify-center cursor-pointer',
        isActive
          ? 'bg-accent/15 text-accent font-semibold'
          : 'text-veyra-muted hover:text-veyra-text hover:bg-black/5 dark:hover:bg-white/5'
      )}
    >
      {icon}
    </button>
  );

  return (
    <div className="h-9 border-b border-veyra-border px-4 flex items-center gap-0.5 bg-veyra-surface/40 overflow-x-auto shrink-0 select-none text-xs">
      {/* Headings */}
      {toolBtn(
        editor.isActive('heading', { level: 1 }),
        () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
        <Heading1 className="w-3.5 h-3.5" />,
        'Título 1'
      )}
      {toolBtn(
        editor.isActive('heading', { level: 2 }),
        () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
        <Heading2 className="w-3.5 h-3.5" />,
        'Título 2'
      )}
      {toolBtn(
        editor.isActive('heading', { level: 3 }),
        () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
        <Heading3 className="w-3.5 h-3.5" />,
        'Título 3'
      )}

      <div className="w-[1px] h-3.5 bg-veyra-border mx-1 shrink-0" />

      {/* Basic Formatting */}
      {toolBtn(
        editor.isActive('bold'),
        () => editor.chain().focus().toggleBold().run(),
        <Bold className="w-3.5 h-3.5" />,
        'Negrita (Ctrl+B)'
      )}
      {toolBtn(
        editor.isActive('italic'),
        () => editor.chain().focus().toggleItalic().run(),
        <Italic className="w-3.5 h-3.5" />,
        'Cursiva (Ctrl+I)'
      )}
      {toolBtn(
        editor.isActive('underline'),
        () => editor.chain().focus().toggleUnderline().run(),
        <UnderlineIcon className="w-3.5 h-3.5" />,
        'Subrayado (Ctrl+U)'
      )}
      {toolBtn(
        editor.isActive('highlight'),
        () => editor.chain().focus().toggleHighlight().run(),
        <Highlighter className="w-3.5 h-3.5" />,
        'Resaltado'
      )}
      {toolBtn(
        editor.isActive('blockquote'),
        () => editor.chain().focus().toggleBlockquote().run(),
        <Quote className="w-3.5 h-3.5" />,
        'Cita'
      )}

      {/* Insert Image */}
      {onUploadImage && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            title="Insertar imagen"
            className="h-7 px-1.5 rounded-md text-veyra-muted hover:text-veyra-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex items-center justify-center cursor-pointer"
          >
            <ImageIcon className="w-3.5 h-3.5" />
          </button>
        </>
      )}

      <div className="w-[1px] h-3.5 bg-veyra-border mx-1 shrink-0" />

      {/* Lists */}
      {toolBtn(
        editor.isActive('bulletList'),
        () => editor.chain().focus().toggleBulletList().run(),
        <List className="w-3.5 h-3.5" />,
        'Lista con viñetas'
      )}
      {toolBtn(
        editor.isActive('orderedList'),
        () => editor.chain().focus().toggleOrderedList().run(),
        <ListOrdered className="w-3.5 h-3.5" />,
        'Lista numerada'
      )}
      {toolBtn(
        editor.isActive('taskList'),
        () => editor.chain().focus().toggleTaskList().run(),
        <CheckSquare className="w-3.5 h-3.5" />,
        'Lista de tareas'
      )}

      <div className="w-[1px] h-3.5 bg-veyra-border mx-1 shrink-0" />

      {/* Alignment */}
      {toolBtn(
        editor.isActive({ textAlign: 'left' }),
        () => editor.chain().focus().setTextAlign('left').run(),
        <AlignLeft className="w-3.5 h-3.5" />,
        'Alinear a la izquierda'
      )}
      {toolBtn(
        editor.isActive({ textAlign: 'center' }),
        () => editor.chain().focus().setTextAlign('center').run(),
        <AlignCenter className="w-3.5 h-3.5" />,
        'Centrar'
      )}
      {toolBtn(
        editor.isActive({ textAlign: 'right' }),
        () => editor.chain().focus().setTextAlign('right').run(),
        <AlignRight className="w-3.5 h-3.5" />,
        'Alinear a la derecha'
      )}
      {toolBtn(
        editor.isActive({ textAlign: 'justify' }),
        () => editor.chain().focus().setTextAlign('justify').run(),
        <AlignJustify className="w-3.5 h-3.5" />,
        'Justificar'
      )}

      <div className="w-[1px] h-3.5 bg-veyra-border mx-1 shrink-0" />

      {/* History */}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        className="h-7 px-1.5 rounded-md text-veyra-muted hover:text-veyra-text hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
        title="Deshacer (Ctrl+Z)"
      >
        <Undo className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        className="h-7 px-1.5 rounded-md text-veyra-muted hover:text-veyra-text hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
        title="Rehacer (Ctrl+Y)"
      >
        <Redo className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
