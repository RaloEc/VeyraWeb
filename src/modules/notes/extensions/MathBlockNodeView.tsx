import React, { useState, useMemo, useRef, useEffect } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { Edit3, Copy, Trash2, Check, X, Sparkles } from 'lucide-react';
import { renderLatex, unescapeHtml } from './mathUtils';
import { cn } from '../../../lib/utils';
import { toast } from 'sonner';

const MATH_SIZES = [
  { key: 'small', label: 'S', em: '0.85em', desc: 'Pequeño' },
  { key: 'normal', label: 'M', em: '1.05em', desc: 'Normal' },
  { key: 'large', label: 'L', em: '1.35em', desc: 'Grande' },
  { key: 'huge', label: 'XL', em: '1.75em', desc: 'Muy grande' },
] as const;

interface MathOperator {
  label: string;
  snippet: string;
  title: string;
  wrapTemplate?: (selected: string) => string;
}

interface MathCategory {
  id: string;
  name: string;
  operators: MathOperator[];
}

const MATH_OPERATOR_CATEGORIES: MathCategory[] = [
  {
    id: 'basic',
    name: 'Básicos',
    operators: [
      { label: '+', snippet: ' + ', title: 'Suma (+)' },
      { label: '−', snippet: ' - ', title: 'Resta (-)' },
      { label: '×', snippet: ' \\times ', title: 'Multiplicación (\\times)' },
      { label: '÷', snippet: ' \\div ', title: 'División (\\div)' },
      { label: '·', snippet: ' \\cdot ', title: 'Punto de producto (\\cdot)' },
      { label: '±', snippet: ' \\pm ', title: 'Más o menos (\\pm)' },
      { label: '∓', snippet: ' \\mp ', title: 'Menos o más (\\mp)' },
      { label: '=', snippet: ' = ', title: 'Igual (=)' },
      { label: '≠', snippet: ' \\neq ', title: 'Distinto / No igual (\\neq)' },
      { label: '≈', snippet: ' \\approx ', title: 'Aproximadamente (\\approx)' },
      { label: '<', snippet: ' < ', title: 'Menor que (<)' },
      { label: '>', snippet: ' > ', title: 'Mayor que (>)' },
      { label: '≤', snippet: ' \\le ', title: 'Menor o igual (\\le)' },
      { label: '≥', snippet: ' \\ge ', title: 'Mayor o igual (\\ge)' },
      { label: '%', snippet: '\\%', title: 'Porcentaje (\\%)' },
      { label: '°', snippet: '^{\\circ}', title: 'Grados (^{\\circ})' },
    ],
  },
  {
    id: 'structures',
    name: 'Estructuras',
    operators: [
      {
        label: 'a/b',
        snippet: '\\frac{a}{b}',
        title: 'Fracción (\\frac{a}{b})',
        wrapTemplate: (sel) => `\\frac{${sel}}{b}`,
      },
      {
        label: '√x',
        snippet: '\\sqrt{x}',
        title: 'Raíz cuadrada (\\sqrt{x})',
        wrapTemplate: (sel) => `\\sqrt{${sel}}`,
      },
      {
        label: 'ⁿ√x',
        snippet: '\\sqrt[n]{x}',
        title: 'Raíz n-ésima (\\sqrt[n]{x})',
        wrapTemplate: (sel) => `\\sqrt[n]{${sel}}`,
      },
      {
        label: 'x²',
        snippet: 'x^{2}',
        title: 'Potencia / Exponente (x^{2})',
        wrapTemplate: (sel) => `{${sel}}^{2}`,
      },
      {
        label: 'xᵢ',
        snippet: 'x_{i}',
        title: 'Subíndice (x_{i})',
        wrapTemplate: (sel) => `{${sel}}_{i}`,
      },
      {
        label: '|x|',
        snippet: '\\left| x \\right|',
        title: 'Valor absoluto (|x|)',
        wrapTemplate: (sel) => `\\left| ${sel} \\right|`,
      },
      {
        label: '(x)',
        snippet: '\\left( x \\right)',
        title: 'Paréntesis adaptables (\\left( ... \\right))',
        wrapTemplate: (sel) => `\\left( ${sel} \\right)`,
      },
      {
        label: '[x]',
        snippet: '\\left[ x \\right]',
        title: 'Corchetes adaptables (\\left[ ... \\right])',
        wrapTemplate: (sel) => `\\left[ ${sel} \\right]`,
      },
      {
        label: '{x}',
        snippet: '\\left\\{ x \\right\\}',
        title: 'Llaves adaptables (\\left\\{ ... \\right\\})',
        wrapTemplate: (sel) => `\\left\\{ ${sel} \\right\\}`,
      },
      {
        label: 'texto',
        snippet: '\\text{texto}',
        title: 'Texto plano en fórmula (\\text{...})',
        wrapTemplate: (sel) => `\\text{${sel}}`,
      },
    ],
  },
  {
    id: 'calculus',
    name: 'Cálculo',
    operators: [
      { label: '∑', snippet: '\\sum_{i=1}^{n}', title: 'Sumatoria (\\sum_{i=1}^{n})' },
      { label: '∏', snippet: '\\prod_{i=1}^{n}', title: 'Productoria (\\prod_{i=1}^{n})' },
      { label: '∫', snippet: '\\int_{a}^{b} f(x) \\, dx', title: 'Integral definida (\\int_{a}^{b})' },
      { label: '∫dx', snippet: '\\int f(x) \\, dx', title: 'Integral indefinida (\\int)' },
      { label: 'lim', snippet: '\\lim_{x \\to \\infty}', title: 'Límite (\\lim_{x \\to \\infty})' },
      { label: '∞', snippet: '\\infty', title: 'Infinito (\\infty)' },
      { label: '∂', snippet: '\\partial', title: 'Derivada parcial (\\partial)' },
      { label: 'dx/dt', snippet: '\\frac{d x}{d t}', title: 'Diferencial / Derivada (\\frac{dx}{dt})' },
      { label: '→', snippet: ' \\to ', title: 'Flecha / Tiende a (\\to)' },
    ],
  },
  {
    id: 'symbols',
    name: 'Símbolos',
    operators: [
      { label: 'π', snippet: '\\pi', title: 'Pi (\\pi)' },
      { label: 'Δ', snippet: '\\Delta', title: 'Delta mayúscula (\\Delta)' },
      { label: 'δ', snippet: '\\delta', title: 'Delta minúscula (\\delta)' },
      { label: 'α', snippet: '\\alpha', title: 'Alfa (\\alpha)' },
      { label: 'β', snippet: '\\beta', title: 'Beta (\\beta)' },
      { label: 'θ', snippet: '\\theta', title: 'Theta (\\theta)' },
      { label: 'λ', snippet: '\\lambda', title: 'Lambda (\\lambda)' },
      { label: 'μ', snippet: '\\mu', title: 'Mu / Micro (\\mu)' },
      { label: 'σ', snippet: '\\sigma', title: 'Sigma minúscula (\\sigma)' },
      { label: 'Σ', snippet: '\\Sigma', title: 'Sigma mayúscula (\\Sigma)' },
      { label: 'Ω', snippet: '\\Omega', title: 'Omega mayúscula (\\Omega)' },
      { label: '∈', snippet: ' \\in ', title: 'Pertenece a (\\in)' },
      { label: '∉', snippet: ' \\notin ', title: 'No pertenece a (\\notin)' },
      { label: '∀', snippet: ' \\forall ', title: 'Para todo (\\forall)' },
      { label: '∃', snippet: ' \\exists ', title: 'Existe (\\exists)' },
    ],
  },
];

export const MathBlockNodeView: React.FC<NodeViewProps> = ({
  node,
  updateAttributes,
  deleteNode,
  selected,
}) => {
  const rawLatex = unescapeHtml(node.attrs.latex || '');
  const currentSize = node.attrs.size || 'normal';
  const sizeEm = MATH_SIZES.find((s) => s.key === currentSize)?.em || '1.05em';
  const [isEditing, setIsEditing] = useState<boolean>(!rawLatex.trim());
  const [activeCategory, setActiveCategory] = useState<string>('basic');
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

  const insertSnippet = (snippet: string, wrapTemplate?: (selected: string) => string) => {
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const current = latexInput;
    const selectedText = current.substring(start, end);

    let toInsert = snippet;
    if (selectedText.trim() && wrapTemplate) {
      toInsert = wrapTemplate(selectedText);
    }

    const next = current.substring(0, start) + toInsert + current.substring(end);
    setLatexInput(next);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + toInsert.length, start + toInsert.length);
    }, 10);
  };

  const displayedOperators = useMemo(() => {
    if (activeCategory === 'all') {
      return MATH_OPERATOR_CATEGORIES.flatMap((c) => c.operators);
    }
    const found = MATH_OPERATOR_CATEGORIES.find((c) => c.id === activeCategory);
    return found ? found.operators : MATH_OPERATOR_CATEGORIES[0].operators;
  }, [activeCategory]);

  return (
    <NodeViewWrapper
      as="div"
      className={cn(
        'my-3 group/mathblock relative rounded-xl transition-all duration-150',
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
            className="w-full text-center text-veyra-text overflow-x-auto py-1 transition-[font-size] duration-150"
            style={{ fontSize: sizeEm }}
            dangerouslySetInnerHTML={{ __html: renderedContent.html }}
          />

          {/* Barra de herramientas flotante al hacer hover */}
          <div className="absolute top-2 right-2 opacity-0 group-hover/mathblock:opacity-100 transition-opacity flex items-center gap-1 bg-white dark:bg-[#18181B] border border-slate-200 dark:border-zinc-800 shadow-md rounded-lg p-0.5 text-xs select-none">
            {/* Selector rápido de tamaño */}
            <div className="flex items-center gap-0.5 border-r border-slate-200 dark:border-zinc-800 pr-1 mr-0.5">
              {MATH_SIZES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.stopPropagation();
                    updateAttributes({ size: s.key });
                  }}
                  title={`Tamaño ${s.desc}`}
                  className={cn(
                    'w-5 h-5 flex items-center justify-center text-[10px] font-semibold rounded transition-colors',
                    currentSize === s.key
                      ? 'bg-accent text-white shadow-xs'
                      : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5'
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>

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
            <div className="flex items-center gap-2">
              {/* Selector de escala dentro del modal */}
              <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-zinc-800 p-0.5 rounded-md">
                {MATH_SIZES.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => updateAttributes({ size: s.key })}
                    title={`Tamaño ${s.desc}`}
                    className={cn(
                      'px-1.5 py-0.5 text-[10px] font-semibold rounded transition-colors',
                      currentSize === s.key
                        ? 'bg-accent text-white shadow-xs'
                        : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <span className="text-[10px] text-slate-400 dark:text-zinc-500 hidden sm:inline">
                Ctrl + Enter para guardar
              </span>
            </div>
          </div>

          {/* Vista previa en tiempo real */}
          <div
            className="bg-slate-50 dark:bg-zinc-900/70 p-3 rounded-lg border border-slate-200 dark:border-zinc-800/80 min-h-[50px] flex items-center justify-center overflow-x-auto text-veyra-text transition-[font-size] duration-150"
            style={{ fontSize: sizeEm }}
          >
            <div dangerouslySetInnerHTML={{ __html: livePreview.html }} />
          </div>

          {/* Barra de categorías y operadores matemáticos */}
          <div className="space-y-1.5 pt-0.5">
            {/* Pestañas de categorías */}
            <div className="flex items-center gap-1 border-b border-slate-100 dark:border-zinc-800 pb-1.5 overflow-x-auto scrollbar-thin">
              {MATH_OPERATOR_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setActiveCategory(cat.id)}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors shrink-0 cursor-pointer',
                    activeCategory === cat.id
                      ? 'bg-accent/15 text-accent font-semibold'
                      : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800'
                  )}
                >
                  {cat.name}
                </button>
              ))}
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setActiveCategory('all')}
                className={cn(
                  'px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors shrink-0 cursor-pointer',
                  activeCategory === 'all'
                    ? 'bg-accent/15 text-accent font-semibold'
                    : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800'
                )}
              >
                Todos
              </button>
            </div>

            {/* Cuadrícula de botones de operadores */}
            <div className="flex flex-wrap items-center gap-1 max-h-[88px] overflow-y-auto p-1 bg-slate-50/70 dark:bg-zinc-900/60 rounded-lg border border-slate-100 dark:border-zinc-800/80 scrollbar-thin">
              {displayedOperators.map((op, idx) => (
                <button
                  key={`${op.label}-${idx}`}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertSnippet(op.snippet, op.wrapTemplate)}
                  title={op.title}
                  className="min-w-[28px] h-7 px-2 flex items-center justify-center rounded bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700/80 hover:border-accent/50 hover:bg-accent/10 hover:text-accent text-slate-700 dark:text-zinc-200 text-xs font-serif transition-colors shadow-2xs cursor-pointer shrink-0"
                >
                  {op.label}
                </button>
              ))}
            </div>
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
