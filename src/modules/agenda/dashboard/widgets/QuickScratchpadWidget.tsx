import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PenTool, FileText, Sparkles, Trash2, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { WidgetCard } from '../WidgetCard';

interface QuickScratchpadWidgetProps {
  onCreateNote: (title: string, contentHtml?: string) => Promise<{ id: string } | null | void>;
  onSelectNote: (noteId: string) => void;
}

const STORAGE_KEY = 'veyra_scratchpad_content';

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function linesToSafeHtml(text: string): string {
  const lines = text.split('\n');
  return lines
    .map((line) => (line.length > 0 ? `<p>${escapeHtml(line)}</p>` : '<p></p>'))
    .join('');
}

export const QuickScratchpadWidget: React.FC<QuickScratchpadWidgetProps> = ({
  onCreateNote,
  onSelectNote,
}) => {
  const [content, setContent] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem(STORAGE_KEY) || '';
  });

  const [isConverting, setIsConverting] = useState(false);
  const [copied, setCopied] = useState(false);
  const debounceRef = useRef<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 360)}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [content, adjustHeight]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, content);
      }
    }, 450);

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

  const handleCopy = async () => {
    if (!content.trim()) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast.success('Texto copiado al portapapeles');
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error('No se pudo copiar al portapapeles');
    }
  };

  const handleConvertToNote = async () => {
    if (!content.trim() || isConverting) return;
    setIsConverting(true);

    try {
      const trimmed = content.trim();
      const firstLine = trimmed.split('\n').find((l) => l.trim().length > 0) || 'Nota rápida';
      const title = firstLine.trim().slice(0, 80);
      const html = linesToSafeHtml(trimmed);

      const result = await onCreateNote(title, html);
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

  const trimmedContent = content.trim();
  const wordCount = trimmedContent ? trimmedContent.split(/\s+/).length : 0;
  const charCount = content.length;

  return (
    <WidgetCard
      title="Bloc Rápido"
      icon={<PenTool className="w-3.5 h-3.5" />}
      iconClassName="text-veyra-muted"
      headerRight={
        trimmedContent ? (
          <button
            type="button"
            disabled={isConverting}
            onClick={handleConvertToNote}
            title="Convertir este apunte en una nota en Veyra"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-veyra-card/80 hover:bg-veyra-card text-veyra-text text-xs font-medium transition-colors disabled:opacity-40 cursor-pointer shrink-0"
          >
            {isConverting ? (
              <Sparkles className="w-3.5 h-3.5 animate-spin text-accent" />
            ) : (
              <FileText className="w-3.5 h-3.5 shrink-0 text-veyra-muted" />
            )}
            <span>Convertir a nota</span>
          </button>
        ) : null
      }
    >
      <div className="flex flex-col rounded-2xl bg-veyra-card/65 focus-within:bg-veyra-card transition-colors overflow-hidden">
        <textarea
          ref={textareaRef}
          rows={3}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Escribe ideas rápidas, pendientes o fragmentos aquí... Se guardan automáticamente."
          style={{ backgroundColor: 'transparent', color: 'var(--text-main)' }}
          className="w-full min-h-[120px] xl:min-h-[150px] 2xl:min-h-[175px] appearance-none bg-transparent border-0 p-4 xl:p-5 text-[13.5px] leading-relaxed text-veyra-text placeholder:text-veyra-muted/60 focus:outline-none resize-none custom-scrollbar"
        />

        {trimmedContent && (
          <div className="px-4 pb-2.5 pt-1 flex items-center justify-between gap-2 text-[11px] text-veyra-muted shrink-0">
            <div className="flex items-center gap-2 min-w-0 truncate">
              <span className="inline-flex items-center gap-1.5 truncate">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                <span className="truncate">Guardado</span>
              </span>
              <span className="text-veyra-subtle shrink-0">·</span>
              <span className="font-mono text-[10.5px] shrink-0">
                {wordCount} {wordCount === 1 ? 'pal.' : 'pals.'} · {charCount} car.
              </span>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={handleCopy}
                title="Copiar texto"
                className="flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-veyra-hover text-veyra-muted hover:text-veyra-text transition-colors cursor-pointer"
              >
                {copied ? (
                  <Check className="w-3 h-3 text-emerald-400" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
                <span>{copied ? 'Copiado' : 'Copiar'}</span>
              </button>

              <button
                type="button"
                onClick={handleClear}
                title="Limpiar bloc"
                className="flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-rose-500/10 text-veyra-muted hover:text-rose-400 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                <span>Limpiar</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </WidgetCard>
  );
};
