import React, { useState, useRef, useEffect } from 'react';
import { NodeViewWrapper, NodeViewContent, type NodeViewProps } from '@tiptap/react';
import { Copy, Check, Trash2, ChevronDown, Search, WrapText } from 'lucide-react';
import { toast } from 'sonner';

const LANGUAGES = [
  { value: 'auto', label: 'Texto plano' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'json', label: 'JSON' },
  { value: 'sql', label: 'SQL' },
  { value: 'bash', label: 'Bash / Shell' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
  { value: 'csharp', label: 'C#' },
  { value: 'java', label: 'Java' },
  { value: 'rust', label: 'Rust' },
  { value: 'go', label: 'Go' },
  { value: 'php', label: 'PHP' },
  { value: 'markdown', label: 'Markdown' },
];

export const CodeBlockNodeView: React.FC<NodeViewProps> = ({
  node,
  updateAttributes,
  deleteNode,
}) => {
  const [copied, setCopied] = useState(false);
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);
  const [langSearch, setLangSearch] = useState('');
  const langMenuRef = useRef<HTMLDivElement>(null);

  const currentLangValue = node.attrs.language || 'auto';
  const currentLangObj = LANGUAGES.find((l) => l.value === currentLangValue) || LANGUAGES[0];

  const [isWrapped, setIsWrapped] = useState(() => Boolean(node.attrs.wrap));

  useEffect(() => {
    setIsWrapped(Boolean(node.attrs.wrap));
  }, [node.attrs.wrap]);

  // Cerrar el menú al hacer clic fuera
  useEffect(() => {
    if (!isLangMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (langMenuRef.current && !langMenuRef.current.contains(e.target as Node)) {
        setIsLangMenuOpen(false);
        setLangSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isLangMenuOpen]);

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const codeText = node.textContent || '';
      await navigator.clipboard.writeText(codeText);
      setCopied(true);
      toast.success('Código copiado al portapapeles', { duration: 1800 });
      setTimeout(() => setCopied(false), 1800);
    } catch (_) {
      toast.error('No se pudo copiar el código');
    }
  };

  const handleSelectLanguage = (langVal: string) => {
    updateAttributes({ language: langVal === 'auto' ? null : langVal });
    setIsLangMenuOpen(false);
    setLangSearch('');
  };

  const toggleWrap = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const nextWrap = !isWrapped;
    setIsWrapped(nextWrap);
    updateAttributes({ wrap: nextWrap });
  };

  const filteredLanguages = langSearch.trim()
    ? LANGUAGES.filter(
        (l) =>
          l.label.toLowerCase().includes(langSearch.toLowerCase()) ||
          l.value.toLowerCase().includes(langSearch.toLowerCase())
      )
    : LANGUAGES;

  return (
    <NodeViewWrapper
      data-wrap={isWrapped ? 'true' : 'false'}
      className="veyra-code-block-wrapper my-3 relative rounded-lg border border-slate-200/70 dark:border-white/[0.08] bg-[#fcfcfd] dark:bg-[#0f1013] overflow-hidden group transition-all w-full max-w-full"
    >
      {/* Barra superior minimalista */}
      <div
        contentEditable={false}
        className="flex items-center justify-between px-3 py-1.5 border-b border-slate-100 dark:border-white/[0.05] bg-slate-50/50 dark:bg-white/[0.015] select-none text-xs"
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Selector de lenguaje minimalista */}
        <div className="relative inline-flex items-center" ref={langMenuRef}>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsLangMenuOpen((prev) => !prev);
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            className="inline-flex items-center gap-1.5 py-0.5 px-2 rounded-md text-[11px] font-medium text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-slate-200/50 dark:hover:bg-white/5 transition-colors"
            title="Cambiar lenguaje"
          >
            <span>{currentLangObj.label}</span>
            <ChevronDown
              className={`w-3 h-3 opacity-60 transition-transform ${
                isLangMenuOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {/* Menú flotante de lenguajes */}
          {isLangMenuOpen && (
            <div
              className="absolute top-full left-0 mt-1 w-44 max-h-60 rounded-lg bg-white dark:bg-[#18181b] border border-slate-200/90 dark:border-zinc-800 shadow-lg z-50 overflow-hidden flex flex-col py-1 text-xs text-slate-800 dark:text-zinc-200 animate-in fade-in zoom-in-95 duration-100"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
              }}
            >
              {/* Buscador */}
              <div className="px-2 py-1 border-b border-slate-100 dark:border-zinc-800 flex items-center gap-1.5 text-slate-400 dark:text-zinc-500">
                <Search className="w-3 h-3 shrink-0" />
                <input
                  type="text"
                  value={langSearch}
                  onChange={(e) => setLangSearch(e.target.value)}
                  placeholder="Buscar lenguaje..."
                  autoFocus
                  className="w-full bg-transparent text-[11px] text-slate-800 dark:text-zinc-200 placeholder-slate-400 dark:placeholder-zinc-500 outline-none"
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setIsLangMenuOpen(false);
                    }
                  }}
                />
              </div>

              {/* Lista */}
              <div className="overflow-y-auto max-h-44 py-0.5">
                {filteredLanguages.length === 0 ? (
                  <div className="px-3 py-2 text-[11px] text-slate-400 text-center">
                    Sin resultados
                  </div>
                ) : (
                  filteredLanguages.map((lang) => {
                    const isSelected = lang.value === currentLangValue;
                    return (
                      <button
                        key={lang.value}
                        type="button"
                        onClick={() => handleSelectLanguage(lang.value)}
                        className={`w-full flex items-center justify-between px-2.5 py-1 text-left text-[11.5px] transition-colors ${
                          isSelected
                            ? 'bg-accent/15 text-accent font-medium'
                            : 'hover:bg-slate-100 dark:hover:bg-zinc-800/60 text-slate-600 dark:text-zinc-400'
                        }`}
                      >
                        <span>{lang.label}</span>
                        {isSelected && <Check className="w-3 h-3 text-accent shrink-0" />}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Acciones del bloque */}
        <div className="flex items-center gap-1">
          {/* Toggle de Ajuste de Línea (Word Wrap) */}
          <button
            type="button"
            onClick={toggleWrap}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            className={`p-1 rounded-md transition-colors ${
              isWrapped
                ? 'bg-accent/15 text-accent font-medium'
                : 'text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-300 hover:bg-slate-200/50 dark:hover:bg-white/5'
            }`}
            title={isWrapped ? 'Ajuste de línea activo (Wrap activado)' : 'Activar ajuste de línea'}
          >
            <WrapText className="w-3.5 h-3.5" />
          </button>

          {/* Botón Copiar */}
          <button
            type="button"
            onClick={handleCopy}
            className={`inline-flex items-center gap-1 py-0.5 px-2 rounded-md text-[11px] font-medium transition-colors ${
              copied
                ? 'text-emerald-500'
                : 'text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-300 hover:bg-slate-200/50 dark:hover:bg-white/5'
            }`}
            title="Copiar código"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-emerald-500" />
                <span className="text-[11px]">Copiado</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span className="text-[11px]">Copiar</span>
              </>
            )}
          </button>

          {/* Botón Eliminar (aparece en hover) */}
          <button
            type="button"
            onClick={() => deleteNode()}
            className="p-1 rounded-md text-slate-400 dark:text-zinc-500 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-500/10 transition-colors opacity-0 group-hover:opacity-100"
            title="Eliminar bloque"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Contenido de Código */}
      <pre
        data-wrap={isWrapped ? 'true' : 'false'}
        className={`m-0 p-3 text-[13px] leading-relaxed font-mono bg-transparent text-slate-800 dark:text-zinc-200 border-none w-full max-w-full ${
          isWrapped
            ? 'is-wrapped whitespace-pre-wrap break-all overflow-x-hidden'
            : 'whitespace-pre overflow-x-auto'
        }`}
      >
        <NodeViewContent
          as="div"
          className={`font-mono block outline-none select-text w-full max-w-full ${
            isWrapped ? 'is-wrapped whitespace-pre-wrap break-all' : 'whitespace-pre'
          }`}
        />
      </pre>
    </NodeViewWrapper>
  );
};
