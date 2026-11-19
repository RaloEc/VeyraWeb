import React, { useState, useEffect, useRef } from 'react';
import { PenTool, FileText, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface QuickScratchpadWidgetProps {
  onCreateNote: (title: string, contentJson?: string) => Promise<{ id: string } | null | void>;
  onSelectNote: (noteId: string) => void;
}

const STORAGE_KEY = 'veyra_scratchpad_content';

export const QuickScratchpadWidget: React.FC<QuickScratchpadWidgetProps> = ({
  onCreateNote,
  onSelectNote,
}) => {
  const [content, setContent] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem(STORAGE_KEY) || '';
  });

  const [isConverting, setIsConverting] = useState(false);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, content);
      }
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [content]);

  const handleClear = () => {
    setContent('');
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  const handleConvertToNote = async () => {
    if (!content.trim() || isConverting) return;
    setIsConverting(true);

    try {
      const lines = content.trim().split('\n');
      const title = lines[0].slice(0, 80) || 'Nota rápida';

      const doc = {
        type: 'doc',
        content: lines.map((line) => ({
          type: 'paragraph',
          content: line ? [{ type: 'text', text: line }] : [],
        })),
      };

      const result = await onCreateNote(title, JSON.stringify(doc));
      if (result && 'id' in result && result.id) {
        toast.success('¡Nota creada exitosamente!');
        setContent('');
        if (typeof window !== 'undefined') {
          localStorage.removeItem(STORAGE_KEY);
        }
        onSelectNote(result.id);
      }
    } catch (err) {
      console.error('[Scratchpad] Convert error:', err);
      toast.error('Error al convertir el bloc en nota');
    } finally {
      setIsConverting(false);
    }
  };

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;

  return (
    <div className="flex flex-col h-full rounded-xl bg-veyra-card border border-veyra-border p-3.5 sm:p-4 shadow-xs min-h-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between pb-2.5 border-b border-veyra-border/60 mb-2.5 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
            <PenTool className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs sm:text-sm font-semibold text-veyra-text tracking-tight truncate">
              Bloc Rápido
            </h3>
            <p className="text-[10px] sm:text-[11px] text-veyra-muted truncate">
              {wordCount} {wordCount === 1 ? 'palabra' : 'palabras'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0 ml-1">
          {content.trim() && (
            <button
              type="button"
              onClick={handleClear}
              title="Vaciar bloc"
              className="p-1 rounded text-veyra-subtle hover:text-rose-400 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            disabled={isConverting || !content.trim()}
            onClick={handleConvertToNote}
            title="Convertir este apunte en una nota en Veyra"
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-accent/15 border border-accent/30 text-accent text-xs font-semibold hover:bg-accent/25 transition-colors disabled:opacity-40 disabled:pointer-events-none cursor-pointer shrink-0"
          >
            {isConverting ? (
              <Sparkles className="w-3 h-3 animate-spin" />
            ) : (
              <FileText className="w-3 h-3 shrink-0" />
            )}
            <span className="hidden sm:inline">Crear Nota</span>
            <span className="sm:hidden">Nota</span>
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Escribe ideas rápidas aquí... Se guardan automáticamente y puedes convertirlas a notas con 1 clic."
          className="flex-1 w-full bg-veyra-elevated/40 border border-veyra-border/60 rounded-lg p-2.5 text-xs text-veyra-text placeholder:text-veyra-subtle/70 focus:outline-hidden focus:border-accent/50 focus:bg-veyra-elevated/60 transition-colors resize-none custom-scrollbar min-h-[60px]"
        />
      </div>
    </div>
  );
};
