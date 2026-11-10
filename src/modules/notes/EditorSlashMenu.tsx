import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Editor } from '@tiptap/react';
import {
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  AlignJustify,
  Video,
  Minus,
  Eraser,
  Sigma,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { YT_REGEX } from '../../lib/tiptap-youtube-node';

export interface EditorSlashMenuProps {
  editor: Editor | null;
}

interface SlashItem {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  action: (editor: Editor, range: { from: number; to: number }) => void;
}

const SLASH_ITEMS: SlashItem[] = [
  {
    id: 'h1',
    title: 'Título 1',
    description: 'Encabezado de sección grande',
    icon: <Heading1 className="w-4 h-4" />,
    action: (editor, range) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setHeading({ level: 1 })
        .run();
    },
  },
  {
    id: 'h2',
    title: 'Título 2',
    description: 'Encabezado de subsección mediano',
    icon: <Heading2 className="w-4 h-4" />,
    action: (editor, range) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setHeading({ level: 2 })
        .run();
    },
  },
  {
    id: 'h3',
    title: 'Título 3',
    description: 'Encabezado pequeño',
    icon: <Heading3 className="w-4 h-4" />,
    action: (editor, range) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setHeading({ level: 3 })
        .run();
    },
  },
  {
    id: 'bullet-list',
    title: 'Lista con viñetas',
    description: 'Lista simple con viñetas',
    icon: <List className="w-4 h-4" />,
    action: (editor, range) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .toggleBulletList()
        .run();
    },
  },
  {
    id: 'ordered-list',
    title: 'Lista numerada',
    description: 'Lista con números ordenados',
    icon: <ListOrdered className="w-4 h-4" />,
    action: (editor, range) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .toggleOrderedList()
        .run();
    },
  },
  {
    id: 'task-list',
    title: 'Lista de tareas',
    description: 'Checklist interactivo de tareas',
    icon: <CheckSquare className="w-4 h-4" />,
    action: (editor, range) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .toggleTaskList()
        .run();
    },
  },
  {
    id: 'blockquote',
    title: 'Cita',
    description: 'Bloque de texto para destacar',
    icon: <Quote className="w-4 h-4" />,
    action: (editor, range) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .toggleBlockquote()
        .run();
    },
  },
  {
    id: 'align-justify',
    title: 'Justificar texto',
    description: 'Alinear párrafo a ambos márgenes',
    icon: <AlignJustify className="w-4 h-4" />,
    action: (editor, range) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setTextAlign('justify')
        .run();
    },
  },
  {
    id: 'divider',
    title: 'Línea divisoria',
    description: 'Separador horizontal visual',
    icon: <Minus className="w-4 h-4" />,
    action: (editor, range) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setHorizontalRule()
        .run();
    },
  },
  {
    id: 'clear-format',
    title: 'Borrar formato',
    description: 'Restablecer párrafo a texto limpio',
    icon: <Eraser className="w-4 h-4" />,
    action: (editor, range) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .unsetAllMarks()
        .clearNodes()
        .setTextAlign('left')
        .unsetColor()
        .unsetHighlight()
        .unsetFontFamily()
        .run();
    },
  },
  {
    id: 'math',
    title: 'Fórmula matemática',
    description: 'Ecuación o cálculo en formato LaTeX',
    icon: <Sigma className="w-4 h-4 text-accent" />,
    action: (editor, range) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({ type: 'mathBlock', attrs: { latex: '' } })
        .run();
    },
  },
  {
    id: 'youtube',
    title: 'Video de YouTube',
    description: 'Insertar un video embebido de YouTube',
    icon: <Video className="w-4 h-4" />,
    action: (editor, range) => {
      const url = window.prompt('Introduce el enlace de YouTube:');
      if (!url) {
        editor.chain().focus().deleteRange(range).run();
        return;
      }
      const match = url.trim().match(YT_REGEX);
      if (match && match[1]) {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .setYoutube({ videoId: match[1], embed: true })
          .run();
      } else {
        alert('URL de YouTube no válida');
        editor.chain().focus().deleteRange(range).run();
      }
    },
  },
];

export const EditorSlashMenu: React.FC<EditorSlashMenuProps> = ({ editor }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [range, setRange] = useState<{ from: number; to: number }>({ from: 0, to: 0 });
  const [query, setQuery] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  const filteredItems = SLASH_ITEMS.filter(
    (item) =>
      item.title.toLowerCase().includes(query) ||
      item.description.toLowerCase().includes(query) ||
      item.id.toLowerCase().includes(query)
  );

  const checkSlashCommand = useCallback(() => {
    if (!editor || !editor.isFocused) {
      setIsOpen(false);
      return;
    }

    const { selection } = editor.state;
    if (!selection.empty) {
      setIsOpen(false);
      return;
    }

    const { from } = selection;
    const resolved = editor.state.doc.resolve(from);
    const textBefore = resolved.parent.textBetween(0, resolved.parentOffset);

    // Look for slash
    const lastSlashIndex = textBefore.lastIndexOf('/');
    if (lastSlashIndex === -1) {
      setIsOpen(false);
      return;
    }

    // Only activate if no space between slash and cursor
    const textAfterSlash = textBefore.slice(lastSlashIndex + 1);
    if (textAfterSlash.includes(' ')) {
      setIsOpen(false);
      return;
    }

    const slashFrom = from - textAfterSlash.length - 1;
    setRange({ from: slashFrom, to: from });
    setQuery(textAfterSlash.toLowerCase());

    try {
      const clientCoords = editor.view.coordsAtPos(from);
      // Position fixed below cursor line
      setCoords({
        top: clientCoords.bottom + 6,
        left: Math.min(clientCoords.left, window.innerWidth - 260),
      });
      setIsOpen(true);
      setSelectedIndex(0);
    } catch {
      setIsOpen(false);
    }
  }, [editor]);

  useEffect(() => {
    if (!editor) return;

    editor.on('selectionUpdate', checkSlashCommand);
    editor.on('update', checkSlashCommand);

    return () => {
      editor.off('selectionUpdate', checkSlashCommand);
      editor.off('update', checkSlashCommand);
    };
  }, [editor, checkSlashCommand]);

  const executeItem = useCallback(
    (item: SlashItem) => {
      if (!editor) return;
      item.action(editor, range);
      setIsOpen(false);
    },
    [editor, range]
  );

  // Keyboard navigation when menu is open
  useEffect(() => {
    if (!isOpen || !editor) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % (filteredItems.length || 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % (filteredItems.length || 1));
      } else if (e.key === 'Enter') {
        if (filteredItems[selectedIndex]) {
          e.preventDefault();
          executeItem(filteredItems[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
      }
    };

    const dom = editor.view.dom;
    dom.addEventListener('keydown', handleKeyDown, true);
    return () => {
      dom.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen, editor, filteredItems, selectedIndex, executeItem]);

  if (!isOpen || filteredItems.length === 0) return null;

  return (
    <div
      ref={menuRef}
      style={{ top: coords.top, left: coords.left }}
      className="fixed w-64 max-h-72 overflow-y-auto p-1 rounded-md bg-veyra-surface border border-veyra-border shadow-elevated z-50 animate-in fade-in zoom-in-95 duration-100 select-none backdrop-blur-md"
    >
      <div className="px-2 py-1 text-[10px] font-semibold text-veyra-subtle uppercase tracking-wider">
        Bloques de contenido
      </div>
      <div className="space-y-0.5">
        {filteredItems.map((item, index) => (
          <button
            key={item.id}
            type="button"
            onMouseEnter={() => setSelectedIndex(index)}
            onClick={() => executeItem(item)}
            className={cn(
              'w-full flex items-center gap-2.5 px-2 py-1.5 rounded text-left transition-colors cursor-pointer',
              selectedIndex === index
                ? 'bg-accent/15 text-accent'
                : 'text-veyra-muted hover:text-veyra-text hover:bg-white/5'
            )}
          >
            <div
              className={cn(
                'w-6 h-6 rounded flex items-center justify-center shrink-0 border border-veyra-border',
                selectedIndex === index ? 'bg-accent/20 text-accent border-accent/40' : 'bg-veyra-elevated text-veyra-muted'
              )}
            >
              {item.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate text-veyra-text">{item.title}</div>
              <div className="text-[10px] text-veyra-subtle truncate">{item.description}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

