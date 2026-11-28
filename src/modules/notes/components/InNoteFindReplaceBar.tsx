import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Editor } from '@tiptap/react';
import {
  Search,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  X,
  Replace,
  CaseSensitive,
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { SearchAndReplaceStorage } from '../extensions/SearchAndReplaceExtension';

export interface InNoteFindReplaceBarProps {
  editor: Editor | null;
  isOpen: boolean;
  onClose: () => void;
}

export const InNoteFindReplaceBar: React.FC<InNoteFindReplaceBarProps> = ({
  editor,
  isOpen,
  onClose,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [replaceTerm, setReplaceTerm] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [showReplace, setShowReplace] = useState(false);
  const [, setSyncTick] = useState(0);

  const searchInputRef = useRef<HTMLInputElement>(null);

  const scrollToActiveMatch = useCallback(() => {
    if (!editor) return;
    const storage = (editor.storage as unknown as Record<string, SearchAndReplaceStorage>)
      .searchAndReplace;
    if (!storage || storage.results.length === 0) return;
    const active = storage.results[storage.currentIndex];
    if (!active) return;

    try {
      const domAt = editor.view.domAtPos(active.from);
      const node = domAt.node;
      const el = node instanceof HTMLElement ? node : node.parentElement;
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } catch {
      // Ignore if pos is temporarily out of sync
    }
  }, [editor]);

  useEffect(() => {
    if (isOpen) {
      if (editor && !editor.state.selection.empty) {
        const selectedText = editor.state.doc.textBetween(
          editor.state.selection.from,
          editor.state.selection.to,
          ' '
        );
        if (selectedText && !selectedText.includes('\n') && selectedText.length <= 80) {
          setSearchTerm(selectedText);
          editor.commands.setSearchTerm(selectedText);
        }
      }
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      });
    } else if (editor) {
      editor.commands.clearSearch();
    }
  }, [isOpen, editor]);

  useEffect(() => {
    if (!editor || !isOpen) return;
    const handleUpdate = () => setSyncTick((t) => t + 1);
    editor.on('update', handleUpdate);
    return () => {
      editor.off('update', handleUpdate);
    };
  }, [editor, isOpen]);

  if (!isOpen || !editor) return null;

  const storage = (editor.storage as unknown as Record<string, SearchAndReplaceStorage>)
    .searchAndReplace;
  const totalMatches = storage?.results.length ?? 0;
  const activeIndex = storage?.currentIndex ?? 0;

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    editor.commands.setSearchTerm(value);
    setSyncTick((t) => t + 1);
    requestAnimationFrame(scrollToActiveMatch);
  };

  const handleReplaceChange = (value: string) => {
    setReplaceTerm(value);
    editor.commands.setReplaceTerm(value);
  };

  const handleNext = () => {
    editor.commands.nextSearchResult();
    setSyncTick((t) => t + 1);
    requestAnimationFrame(scrollToActiveMatch);
  };

  const handlePrev = () => {
    editor.commands.previousSearchResult();
    setSyncTick((t) => t + 1);
    requestAnimationFrame(scrollToActiveMatch);
  };

  const handleToggleCase = () => {
    const next = !caseSensitive;
    setCaseSensitive(next);
    editor.commands.setCaseSensitive(next);
    setSyncTick((t) => t + 1);
    requestAnimationFrame(scrollToActiveMatch);
  };

  const handleReplaceCurrent = () => {
    editor.commands.replaceCurrent();
    setSyncTick((t) => t + 1);
    requestAnimationFrame(scrollToActiveMatch);
  };

  const handleReplaceAll = () => {
    editor.commands.replaceAll();
    setSyncTick((t) => t + 1);
  };

  const handleClose = () => {
    editor.commands.clearSearch();
    onClose();
    editor.commands.focus();
  };

  return (
    <div
      className="absolute top-3 right-12 z-30 w-[372px] max-w-[calc(100vw-4rem)] rounded-xl border border-slate-200 dark:border-white/10 bg-white/95 dark:bg-[#16161a]/95 backdrop-blur-md shadow-xl p-2.5 space-y-2 select-none text-xs animate-in fade-in slide-in-from-top-2 duration-150"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          handleClose();
        }
      }}
    >
      {/* Fila 1: Buscar */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setShowReplace((prev) => !prev)}
          title={showReplace ? 'Ocultar reemplazar' : 'Mostrar reemplazar'}
          className="h-8 w-6 rounded-lg flex items-center justify-center text-veyra-muted hover:text-veyra-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer shrink-0"
        >
          {showReplace ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </button>

        <div className="flex-1 min-w-0 h-8 px-2.5 rounded-lg bg-slate-100/80 dark:bg-white/[0.05] border border-slate-200/90 dark:border-white/10 focus-within:border-accent/70 focus-within:ring-2 focus-within:ring-accent/15 flex items-center gap-2 transition-all">
          <Search className="w-3.5 h-3.5 text-veyra-muted shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (e.shiftKey) handlePrev();
                else handleNext();
              }
            }}
            placeholder="Buscar en esta nota..."
            className="w-full min-w-0 bg-transparent text-xs text-veyra-text placeholder:text-veyra-subtle outline-none"
          />
          {searchTerm && (
            <span
              className={cn(
                'text-[10.5px] font-mono shrink-0 px-1.5 py-0.5 rounded',
                totalMatches > 0
                  ? 'text-accent bg-accent/10 font-semibold'
                  : 'text-rose-500 bg-rose-500/10'
              )}
            >
              {totalMatches > 0 ? `${activeIndex + 1}/${totalMatches}` : '0/0'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={handleToggleCase}
            title="Coincidir mayúsculas y minúsculas"
            className={cn(
              'h-8 w-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer',
              caseSensitive
                ? 'bg-accent/15 text-accent font-semibold'
                : 'text-veyra-muted hover:text-veyra-text hover:bg-black/5 dark:hover:bg-white/5'
            )}
          >
            <CaseSensitive className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={handlePrev}
            disabled={totalMatches === 0}
            title="Resultado anterior (Shift+Enter)"
            className="h-8 w-7 rounded-lg flex items-center justify-center text-veyra-muted hover:text-veyra-text hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={handleNext}
            disabled={totalMatches === 0}
            title="Siguiente resultado (Enter)"
            className="h-8 w-7 rounded-lg flex items-center justify-center text-veyra-muted hover:text-veyra-text hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={handleClose}
            title="Cerrar (Esc)"
            className="h-8 w-7 rounded-lg flex items-center justify-center text-veyra-muted hover:text-veyra-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Fila 2: Reemplazar */}
      {showReplace && (
        <div className="flex items-center gap-1.5 pl-[30px]">
          <div className="flex-1 min-w-0 h-8 px-2.5 rounded-lg bg-slate-100/80 dark:bg-white/[0.05] border border-slate-200/90 dark:border-white/10 focus-within:border-accent/70 focus-within:ring-2 focus-within:ring-accent/15 flex items-center gap-2 transition-all">
            <Replace className="w-3.5 h-3.5 text-veyra-muted shrink-0" />
            <input
              type="text"
              value={replaceTerm}
              onChange={(e) => handleReplaceChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleReplaceCurrent();
                }
              }}
              placeholder="Reemplazar por..."
              className="w-full min-w-0 bg-transparent text-xs text-veyra-text placeholder:text-veyra-subtle outline-none"
            />
          </div>

          <button
            type="button"
            onClick={handleReplaceCurrent}
            disabled={totalMatches === 0}
            title="Reemplazar coincidencia actual"
            className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-100/80 dark:bg-white/[0.05] hover:bg-slate-200/80 dark:hover:bg-white/10 text-veyra-text disabled:opacity-35 disabled:pointer-events-none text-[11px] font-medium transition-colors cursor-pointer shrink-0"
          >
            Reemplazar
          </button>

          <button
            type="button"
            onClick={handleReplaceAll}
            disabled={totalMatches === 0}
            title="Reemplazar todas las coincidencias"
            className="h-8 px-2.5 rounded-lg bg-accent/15 hover:bg-accent/25 text-accent disabled:opacity-35 disabled:pointer-events-none text-[11px] font-semibold transition-colors cursor-pointer shrink-0"
          >
            Todo
          </button>
        </div>
      )}
    </div>
  );
};
