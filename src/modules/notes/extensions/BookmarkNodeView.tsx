import React from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { ExternalLink, Globe } from 'lucide-react';
import { cn } from '../../../lib/utils';

export const BookmarkNodeView: React.FC<NodeViewProps> = ({
  node,
  deleteNode,
  selected,
  editor,
}) => {
  const { url, title, description, favicon, domain, image } = node.attrs;

  const displayTitle = title || url;
  const displayDomain = domain || (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  })();

  const handleClick = (e: React.MouseEvent) => {
    // Si el editor es editable, abrimos el link al hacer clic o con Ctrl+Click
    if (e.metaKey || e.ctrlKey || !editor.isEditable) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <NodeViewWrapper className="my-3 select-none">
      <div
        className={cn(
          'group relative flex items-stretch justify-between rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#161619] overflow-hidden transition-all duration-150 hover:border-slate-300 dark:hover:border-zinc-700 hover:shadow-md cursor-pointer shadow-xs',
          selected && 'ring-2 ring-accent border-transparent'
        )}
        onClick={handleClick}
        title="Doble clic o Ctrl+Clic para abrir enlace"
      >
        {/* Lado izquierdo: Contenido textual del enlace */}
        <div className="flex-1 min-w-0 p-3 sm:p-4 flex flex-col justify-between">
          <div>
            {/* Meta superior: Favicon + Dominio */}
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-zinc-400 font-mono mb-1.5">
              {favicon ? (
                <img
                  src={favicon}
                  alt=""
                  className="w-3.5 h-3.5 rounded-xs object-contain shrink-0"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <Globe className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 shrink-0" />
              )}
              <span className="truncate">{displayDomain}</span>
            </div>

            {/* Título de la tarjeta */}
            <div className="text-[13px] sm:text-[14.5px] font-semibold text-slate-900 dark:text-zinc-100 line-clamp-2 leading-snug">
              {displayTitle}
            </div>

            {/* Descripción */}
            {description ? (
              <div className="mt-1 text-[11.5px] sm:text-[12px] text-slate-500 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                {description}
              </div>
            ) : null}
          </div>

          {/* Acciones flotantes abajo a la izquierda */}
          <div className="mt-2.5 flex items-center gap-2 pt-1 border-t border-slate-100 dark:border-zinc-800/60">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              title="Abrir enlace en pestaña nueva"
              className="inline-flex items-center gap-1 text-[10.5px] text-accent hover:underline font-medium"
            >
              <span>Abrir</span>
              <ExternalLink className="w-3 h-3" />
            </a>

            {editor.isEditable && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteNode();
                }}
                title="Eliminar tarjeta"
                className="text-[10.5px] text-slate-400 hover:text-rose-500 transition-colors ml-auto cursor-pointer"
              >
                Eliminar
              </button>
            )}
          </div>
        </div>

        {/* Lado derecho: Portada / Miniatura visual estilo Notion */}
        {image ? (
          <div className="hidden sm:block w-36 md:w-44 shrink-0 relative bg-slate-100 dark:bg-zinc-800 border-l border-slate-200/80 dark:border-zinc-800/80 overflow-hidden">
            <img
              src={image}
              alt=""
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              onError={(e) => {
                (e.target as HTMLElement).parentElement!.style.display = 'none';
              }}
            />
          </div>
        ) : null}
      </div>
    </NodeViewWrapper>
  );
};
