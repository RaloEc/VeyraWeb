import React from 'react';
import type { Editor } from '@tiptap/react';
import { useEditorState } from '@tiptap/react';
import { AlignLeft, Clock } from 'lucide-react';
import { cn } from '../../../lib/utils';

export interface EditorWordCountProps {
  editor: Editor | null;
  className?: string;
  pageFormat?: 'infinite' | 'a4';
}

export const EditorWordCount: React.FC<EditorWordCountProps> = ({ editor, className, pageFormat }) => {
  const stats = useEditorState({
    editor,
    selector: (ctx) => {
      if (!ctx.editor || ctx.editor.isDestroyed) {
        return { words: 0, characters: 0, readingTimeMinutes: 0 };
      }
      const text = ctx.editor.state.doc.textContent || '';
      // Contar palabras limpiando espacios y saltos múltiples
      const trimmed = text.trim();
      const words = trimmed.length > 0 ? trimmed.split(/\s+/).length : 0;
      const characters = text.length;
      // Promedio estándar de lectura académica: 200 palabras por minuto
      const readingTimeMinutes = Math.max(1, Math.ceil(words / 200));

      return {
        words,
        characters,
        readingTimeMinutes: words > 0 ? readingTimeMinutes : 0,
      };
    },
  });

  if (!editor || !stats) return null;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2.5 px-2.5 py-1 rounded-md text-[11px] text-slate-500 dark:text-zinc-400 select-none font-mono transition-colors',
        className
      )}
      title={`${stats.characters} caracteres con espacios`}
    >
      <div className="flex items-center gap-1">
        <AlignLeft className="w-3 h-3 opacity-60" />
        <span>
          <strong className="font-semibold text-slate-700 dark:text-zinc-300">
            {stats.words.toLocaleString()}
          </strong>{' '}
          {stats.words === 1 ? 'palabra' : 'palabras'}
        </span>
      </div>

      <span className="opacity-40">•</span>

      <span>
        <strong className="font-semibold text-slate-700 dark:text-zinc-300">
          {stats.characters.toLocaleString()}
        </strong>{' '}
        caracteres
      </span>

      {pageFormat === 'a4' && (
        <>
          <span className="opacity-40">•</span>
          <span className="text-accent font-medium">Hoja A4</span>
        </>
      )}

      {stats.words >= 50 && (
        <>
          <span className="opacity-40">•</span>
          <div className="flex items-center gap-1 text-slate-400 dark:text-zinc-500">
            <Clock className="w-2.5 h-2.5" />
            <span>~{stats.readingTimeMinutes} min de lectura</span>
          </div>
        </>
      )}
    </div>
  );
};
