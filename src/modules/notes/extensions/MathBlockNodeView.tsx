import React, { useState, useMemo, useRef, useEffect } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { Edit3, Copy, Trash2, Check, X, Sparkles } from 'lucide-react';
import { renderLatex, unescapeHtml } from './mathUtils';
import { cn } from '../../../lib/utils';
import { toast } from 'sonner';

export const MathBlockNodeView: React.FC<NodeViewProps> = ({
  node,
  updateAttributes,
  deleteNode,
  selected,
}) => {
  const rawLatex = unescapeHtml(node.attrs.latex || '');
  const [isEditing, setIsEditing] = useState<boolean>(!rawLatex.trim());
  const [latexInput, setLatexInput] = useState<string>(rawLatex);
  const [copied, setCopied] = useState<boolean>(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Enfocar el textarea al abrir el modo edición
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [isEditing]);

  const handleOpenEdit = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setLatexInput(rawLatex);
    setIsEditing(true);
  };

  // Renderizado KaTeX en tiempo real
  const renderedContent = useMemo(() => {
    return renderLatex(rawLatex, true);
  }, [rawLatex]);

  const livePreview = useMemo(() => {
    return renderLatex(latexInput, true);
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

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(rawLatex);
    setCopied(true);
    toast.success('Fórmula LaTeX copiada al portapapeles');
    setTimeout(() => setCopied(false), 1500);
  };

  const insertSnippet = (snippet: string) => {
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const current = latexInput;
    const next = current.substring(0, start) + snippet + current.substring(end);
    setLatexInput(next);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + snippet.length, start + snippet.length);
    }, 10);
  };

  return (
    <NodeViewWrapper
      as="div"
      className={cn(
        'my-3 group/mathblock relative rounded-xl transition-all duration-150 select-none',
        selected && !isEditing ? 'ring-2 ring-accent/60' : ''
      )}
    >
      {!isEditing ? (
        <div
          onClick={handleOpenEdit}
          className={cn(
            'p-3 sm:p-4 rounded-xl border border-transparent hover:border-black/10 dark:hover:border-white/10 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] cursor-pointer transition-colors relative flex items-center justify-center min-h-[48px] overflow-x-auto scrollbar-thin'
          )}
          title="Clic para editar fórmula matemática"
        >
          {/* Contenido renderizado con KaTeX */}
          <div
            className="w-full text-center text-veyra-text overflow-x-auto py-1"
            dangerouslySetInnerHTML={{ __html: renderedContent.html }}
          />

          {/* Barra de herramientas flotante al hacer hover */}
          <div className="absolute top-2 right-2 opacity-0 group-hover/mathblock:opacity-100 transition-opacity flex items-center gap-1 bg-white dark:bg-[#18181B] border border-slate-200 dark:border-zinc-800 shadow-md rounded-lg p-0.5 text-xs">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleOpenEdit}
              title="Editar fórmula"
              className="p-1.5 rounded hover:bg-black/5 dark:hover:bg-white/5 text-slate-600 dark:text-zinc-300 hover:text-accent transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleCopy}
              title="Copiar código LaTeX"
              className="p-1.5 rounded hover:bg-black/5 dark:hover:bg-white/5 text-slate-600 dark:text-zinc-300 hover:text-accent transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation();
                deleteNode();
              }}
              title="Eliminar fórmula"
              className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950/30 text-slate-600 dark:text-zinc-300 hover:text-red-500 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        /* Tarjeta de edición de fórmula matemática */
        <div
          onClick={(e) => e.stopPropagation()}
          className="p-3.5 rounded-xl bg-white dark:bg-[#18181B] border border-slate-200 dark:border-zinc-800 shadow-xl text-xs space-y-3"
        >
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-2">
            <span className="font-semibold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-accent" />
              <span>Editor de Fórmula Matemática (LaTeX)</span>
            </span>
            <span className="text-[10px] text-slate-400 dark:text-zinc-500">
              Ctrl + Enter para guardar
            </span>
          </div>

          {/* Vista previa en tiempo real */}
          <div className="bg-slate-50 dark:bg-zinc-900/70 p-3 rounded-lg border border-slate-200 dark:border-zinc-800/80 min-h-[50px] flex items-center justify-center overflow-x-auto text-veyra-text">
            <div dangerouslySetInnerHTML={{ __html: livePreview.html }} />
          </div>

          {/* Atajos rápidos de sintaxis */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] scrollbar-thin">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertSnippet('\\frac{a}{b}')}
              className="px-2 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 hover:bg-accent/15 hover:text-accent text-slate-700 dark:text-zinc-300 transition-colors shrink-0"
              title="Fracción"
            >
              Fracción (\frac)
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertSnippet('\\sqrt{x}')}
              className="px-2 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 hover:bg-accent/15 hover:text-accent text-slate-700 dark:text-zinc-300 transition-colors shrink-0"
              title="Raíz cuadrada"
            >
              Raíz (\sqrt)
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertSnippet('x^{2}')}
              className="px-2 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 hover:bg-accent/15 hover:text-accent text-slate-700 dark:text-zinc-300 transition-colors shrink-0"
              title="Exponente / Potencia"
            >
              x² (potencia)
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertSnippet('x_{i}')}
              className="px-2 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 hover:bg-accent/15 hover:text-accent text-slate-700 dark:text-zinc-300 transition-colors shrink-0"
              title="Subíndice"
            >
              xᵢ (subíndice)
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertSnippet('\\times')}
              className="px-2 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 hover:bg-accent/15 hover:text-accent text-slate-700 dark:text-zinc-300 transition-colors shrink-0"
              title="Multiplicación"
            >
              × (\times)
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertSnippet('\\Delta')}
              className="px-2 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 hover:bg-accent/15 hover:text-accent text-slate-700 dark:text-zinc-300 transition-colors shrink-0"
              title="Delta"
            >
              Δ (\Delta)
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertSnippet('\\left\\vert{} x \\right\\vert{}')}
              className="px-2 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 hover:bg-accent/15 hover:text-accent text-slate-700 dark:text-zinc-300 transition-colors shrink-0"
              title="Valor absoluto"
            >
              |x| (absoluto)
            </button>
          </div>

          {/* Campo de texto de código LaTeX */}
          <textarea
            ref={textareaRef}
            value={latexInput}
            onChange={(e) => setLatexInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleSave();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                handleCancel();
              }
            }}
            placeholder="Ejemplo: \\frac{Q_1 - Q_0}{Q_0} \\times 100"
            rows={3}
            className="w-full p-2.5 rounded-lg bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 focus:outline-none focus:border-accent text-veyra-text font-mono text-xs resize-y"
          />

          {/* Botones de acción */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={deleteNode}
              className="px-2.5 py-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 font-medium transition-colors cursor-pointer flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" />
              <span>Eliminar</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCancel}
                className="px-3 py-1.5 rounded-lg text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 font-medium transition-colors cursor-pointer flex items-center gap-1"
              >
                <X className="w-3 h-3" />
                <span>Cancelar</span>
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="px-3.5 py-1.5 rounded-lg bg-accent text-white font-medium hover:bg-accent/90 transition-colors cursor-pointer shadow-sm flex items-center gap-1"
              >
                <Check className="w-3 h-3 stroke-[3]" />
                <span>Listo</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </NodeViewWrapper>
  );
};
