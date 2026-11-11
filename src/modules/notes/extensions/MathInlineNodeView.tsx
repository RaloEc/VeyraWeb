import React, { useState, useMemo, useRef, useEffect } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { Check, X, Trash2 } from 'lucide-react';
import { renderLatex, unescapeHtml } from './mathUtils';
import { cn } from '../../../lib/utils';

const MATH_INLINE_SIZES = [
  { key: 'small', label: 'S', em: '0.85em', desc: 'Pequeño' },
  { key: 'normal', label: 'M', em: '1em', desc: 'Normal' },
  { key: 'large', label: 'L', em: '1.25em', desc: 'Grande' },
  { key: 'huge', label: 'XL', em: '1.5em', desc: 'Muy grande' },
] as const;

const QUICK_INLINE_SYMBOLS = [
  { label: '+', snippet: ' + ', title: 'Suma' },
  { label: '−', snippet: ' - ', title: 'Resta' },
  { label: '×', snippet: ' \\times ', title: 'Multiplicación' },
  { label: '÷', snippet: ' \\div ', title: 'División' },
  { label: '·', snippet: ' \\cdot ', title: 'Punto' },
  { label: '±', snippet: ' \\pm ', title: 'Más o menos' },
  { label: '=', snippet: ' = ', title: 'Igual' },
  { label: '≠', snippet: ' \\neq ', title: 'Distinto' },
  { label: '≈', snippet: ' \\approx ', title: 'Aproximado' },
  { label: '≤', snippet: ' \\le ', title: 'Menor o igual' },
  { label: '≥', snippet: ' \\ge ', title: 'Mayor o igual' },
  { label: 'a/b', snippet: '\\frac{a}{b}', title: 'Fracción' },
  { label: '√x', snippet: '\\sqrt{x}', title: 'Raíz cuadrada' },
  { label: 'x²', snippet: 'x^{2}', title: 'Potencia' },
  { label: 'xᵢ', snippet: 'x_{i}', title: 'Subíndice' },
  { label: 'Δ', snippet: '\\Delta', title: 'Delta' },
  { label: 'π', snippet: '\\pi', title: 'Pi' },
  { label: '%', snippet: '\\%', title: 'Porcentaje' },
];

export const MathInlineNodeView: React.FC<NodeViewProps> = ({
  node,
  updateAttributes,
  deleteNode,
  selected,
}) => {
  const rawLatex = unescapeHtml(node.attrs.latex || '');
  const currentSize = node.attrs.size || 'normal';
  const sizeEm = MATH_INLINE_SIZES.find((s) => s.key === currentSize)?.em || '1em';
  const [isEditing, setIsEditing] = useState<boolean>(!rawLatex.trim());
  const [showSymbols, setShowSymbols] = useState<boolean>(false);
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

  const insertSnippet = (snippet: string) => {
    if (!inputRef.current) return;
    const input = inputRef.current;
    const start = input.selectionStart ?? latexInput.length;
    const end = input.selectionEnd ?? latexInput.length;
    const next = latexInput.substring(0, start) + snippet + latexInput.substring(end);
    setLatexInput(next);
    setTimeout(() => {
      input.focus();
      input.setSelectionRange(start + snippet.length, start + snippet.length);
    }, 10);
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
        'inline-flex items-center align-middle mx-0.5 relative group/mathinline',
        selected && !isEditing ? 'ring-1 ring-accent/60 rounded' : ''
      )}
      style={currentSize !== 'normal' ? { fontSize: sizeEm } : undefined}
    >
      {!isEditing ? (
        <span
          onClick={handleOpenEdit}
          className="inline-flex items-center px-0.5 py-0 rounded cursor-pointer transition-colors hover:bg-black/5 dark:hover:bg-white/5 text-veyra-text"
          title="Fórmula matemática (Clic para editar)"
          dangerouslySetInnerHTML={{ __html: renderedContent.html }}
        />
      ) : (
        <span
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1.5 p-1 rounded-lg bg-white dark:bg-[#18181B] border border-slate-300 dark:border-zinc-700 shadow-lg text-xs z-30"
        >
          {/* Selector de escala */}
          <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-zinc-800 p-0.5 rounded">
            {MATH_INLINE_SIZES.map((s) => (
              <button
                key={s.key}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => updateAttributes({ size: s.key })}
                title={`Tamaño ${s.desc}`}
                className={cn(
                  'w-4 h-4 flex items-center justify-center text-[9px] font-semibold rounded transition-colors',
                  currentSize === s.key
                    ? 'bg-accent text-white'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-zinc-200'
                )}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Mini vista previa */}
          <span
            className="px-1.5 py-0.5 rounded bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-veyra-text max-w-[120px] overflow-hidden truncate transition-[font-size]"
            style={{ fontSize: sizeEm }}
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

          {/* Botón para mostrar paleta rápida de símbolos */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setShowSymbols(!showSymbols)}
            title="Símbolos y operadores matemáticos"
            className={cn(
              'px-1.5 py-0.5 rounded text-[10px] font-serif font-bold transition-colors cursor-pointer',
              showSymbols
                ? 'bg-accent text-white'
                : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 hover:text-accent'
            )}
          >
            fx
          </button>

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

          {/* Paleta desplegable de operadores para fórmula en línea */}
          {showSymbols && (
            <div className="absolute top-full left-0 mt-1 p-1.5 rounded-lg bg-white dark:bg-[#18181B] border border-slate-200 dark:border-zinc-800 shadow-xl flex flex-wrap gap-1 max-w-[240px] z-40">
              {QUICK_INLINE_SYMBOLS.map((s, idx) => (
                <button
                  key={`${s.label}-${idx}`}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertSnippet(s.snippet)}
                  title={s.title}
                  className="w-6 h-6 flex items-center justify-center rounded bg-slate-50 dark:bg-zinc-800/80 hover:bg-accent/15 hover:text-accent text-[11px] font-serif border border-slate-200 dark:border-zinc-700 transition-colors cursor-pointer"
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </span>
      )}
    </NodeViewWrapper>
  );
};
