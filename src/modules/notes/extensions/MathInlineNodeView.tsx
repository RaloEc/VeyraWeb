import React, { useState, useMemo, useRef, useEffect } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { Check, X, Trash2 } from 'lucide-react';
import { renderLatex, unescapeHtml } from './mathUtils';
import { cn } from '../../../lib/utils';

export const MathInlineNodeView: React.FC<NodeViewProps> = ({
  node,
  updateAttributes,
  deleteNode,
  selected,
}) => {
  const rawLatex = unescapeHtml(node.attrs.latex || '');
  const [isEditing, setIsEditing] = useState<boolean>(!rawLatex.trim());
  const [latexInput, setLatexInput] = useState<string>(rawLatex);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleOpenEdit = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setLatexInput(rawLatex);
    setIsEditing(true);
  };

  const renderedContent = useMemo(() => {
    return renderLatex(rawLatex, false);
  }, [rawLatex]);

  const livePreview = useMemo(() => {
    return renderLatex(latexInput, false);
  }, [latexInput]);

  const handleSave = () => {
    const trimmed = latexInput.trim();
    if (!trimmed) {
      deleteNode();
      return;
    }
    updateAttributes({ latex: trimmed });
    setIsEditing(false);
  };

  const handleCancel = () => {
    if (!rawLatex.trim()) {
      deleteNode();
      return;
    }
    setLatexInput(rawLatex);
    setIsEditing(false);
  };

  return (
    <NodeViewWrapper
      as="span"
      className={cn(
        'inline-flex items-center align-middle mx-0.5 relative group/mathinline select-none',
        selected && !isEditing ? 'ring-1 ring-accent rounded' : ''
      )}
    >
      {!isEditing ? (
        <span
          onClick={handleOpenEdit}
          className="inline-flex items-center px-1.5 py-0.5 rounded cursor-pointer transition-colors bg-accent/5 hover:bg-accent/15 border border-accent/20 hover:border-accent/40 text-veyra-text"
          title="Fórmula matemática en línea (Clic para editar)"
          dangerouslySetInnerHTML={{ __html: renderedContent.html }}
        />
      ) : (
        <span
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1.5 p-1 rounded-lg bg-white dark:bg-[#18181B] border border-slate-300 dark:border-zinc-700 shadow-lg text-xs z-30"
        >
          {/* Mini vista previa */}
          <span
            className="px-1.5 py-0.5 rounded bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-veyra-text max-w-[120px] overflow-hidden truncate"
            dangerouslySetInnerHTML={{ __html: livePreview.html }}
          />

          {/* Input para editar LaTeX */}
          <input
            ref={inputRef}
            type="text"
            value={latexInput}
            onChange={(e) => setLatexInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSave();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                handleCancel();
              }
            }}
            placeholder="LaTeX (ej: \% \Delta Q)"
            className="w-32 px-1.5 py-0.5 rounded bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 font-mono text-[11px] text-veyra-text focus:outline-none focus:border-accent"
          />

          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleSave}
            title="Guardar (Enter)"
            className="p-1 rounded hover:bg-accent/15 text-accent cursor-pointer transition-colors"
          >
            <Check className="w-3 h-3 stroke-[3]" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleCancel}
            title="Cancelar (Esc)"
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-500 hover:text-slate-800 dark:hover:text-zinc-200 cursor-pointer transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={deleteNode}
            title="Eliminar"
            className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30 text-red-500 cursor-pointer transition-colors"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </span>
      )}
    </NodeViewWrapper>
  );
};
