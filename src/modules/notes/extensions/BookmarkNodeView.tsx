import React, { useEffect } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { ExternalLink, Globe, Loader2 } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { fetchLinkMetadata } from '../../../lib/link-metadata';

export const BookmarkNodeView: React.FC<NodeViewProps> = ({
  node,
  deleteNode,
  selected,
  editor,
  getPos,
  updateAttributes,
}) => {
  const { url, title, description, favicon, domain, image, isLoading } = node.attrs;

  useEffect(() => {
    if (!isLoading) return;

    let isMounted = true;
    fetchLinkMetadata(url)
      .then((metadata) => {
        if (!isMounted) return;
        updateAttributes({
          title: metadata.title,
          description: metadata.description,
          domain: metadata.domain,
          favicon: metadata.favicon,
          image: metadata.image || null,
          isLoading: false,
        });
      })
      .catch(() => {
        if (!isMounted) return;
        updateAttributes({
          isLoading: false,
        });
      });

    return () => {
      isMounted = false;
    };
  }, [isLoading, url, updateAttributes]);

  const displayTitle = title || url;
  const displayDomain = domain || (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  })();

  const fullUrl = url?.startsWith('http://') || url?.startsWith('https://')
    ? url
    : `https://${url}`;

  const handleClick = (e: React.MouseEvent) => {
    // Si el editor es editable, abrimos el link al hacer clic o con Ctrl+Click
    if (e.metaKey || e.ctrlKey || !editor.isEditable) {
      window.open(fullUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleConvertToText = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!editor.isEditable) return;
    const pos = typeof getPos === 'function' ? getPos() : undefined;
    if (typeof pos !== 'number') return;

    const nodeSize = node?.nodeSize || 1;

    editor
      .chain()
      .focus()
      .deleteRange({ from: pos, to: pos + nodeSize })
      .insertContent(`<p><a href="${fullUrl}" target="_blank" rel="noopener noreferrer nofollow">${url}</a>&nbsp;</p>`)
      .run();
  };

  return (
    <NodeViewWrapper className="my-3 select-none">
      <div
        className={cn(
          'group relative flex items-stretch justify-between rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#161619] overflow-hidden transition-all duration-150 hover:border-slate-300 dark:hover:border-zinc-700 hover:shadow-md cursor-pointer shadow-xs',
          selected && 'ring-2 ring-accent border-transparent',
          isLoading && 'pointer-events-auto'
        )}
        onClick={handleClick}
        title={isLoading ? 'Obteniendo vista previa del enlace...' : 'Doble clic o Ctrl+Clic para abrir enlace'}
      >
        {/* Lado izquierdo: Contenido de la tarjeta o Skeleton animado */}
        {isLoading ? (
          <div className="flex-1 min-w-0 p-3 sm:p-4 flex flex-col justify-between">
            <div>
              {/* Meta superior en skeleton: Favicon + Dominio + Badge animado de carga */}
              <div className="flex items-center gap-2 text-[11px] text-slate-400 dark:text-zinc-500 font-mono mb-2">
                {favicon ? (
                  <img
                    src={favicon}
                    alt=""
                    className="w-3.5 h-3.5 rounded-xs object-contain shrink-0 opacity-80"
                  />
                ) : (
                  <Globe className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 shrink-0 animate-pulse" />
                )}
                <span className="truncate font-medium text-slate-600 dark:text-zinc-300">{displayDomain}</span>
                <span className="inline-flex items-center gap-1 text-[10px] text-accent ml-auto font-sans animate-pulse">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Cargando vista previa...</span>
                </span>
              </div>

              {/* Skeleton barras para el Título */}
              <div className="space-y-1.5 mt-2.5">
                <div className="h-4 w-4/5 rounded-md bg-slate-200/80 dark:bg-zinc-800 animate-pulse" />
                <div className="h-4 w-2/5 rounded-md bg-slate-200/80 dark:bg-zinc-800 animate-pulse" />
              </div>

              {/* Skeleton barra para la Descripción */}
              <div className="mt-3 space-y-1">
                <div className="h-3 w-3/4 rounded-md bg-slate-100 dark:bg-zinc-800/60 animate-pulse" />
                <div className="h-3 w-1/2 rounded-md bg-slate-100 dark:bg-zinc-800/60 animate-pulse" />
              </div>
            </div>

            {/* Acciones flotantes abajo: aún en loading el usuario puede cambiar a solo texto o eliminar */}
            <div className="mt-3 flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-zinc-800/60">
              <span className="text-[10.5px] text-slate-400 dark:text-zinc-500 italic">
                Generando tarjeta...
              </span>

              {editor.isEditable && (
                <div className="flex items-center gap-2.5 ml-auto">
                  <button
                    type="button"
                    onClick={handleConvertToText}
                    title="Cancelar vista previa y cambiar a solo enlace en texto plano"
                    className="group/switch flex items-center gap-1.5 px-1.5 py-0.5 rounded cursor-pointer select-none transition-colors hover:bg-slate-100 dark:hover:bg-zinc-800/80 text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200"
                  >
                    <span className="text-[11px] font-medium transition-colors">
                      Solo texto
                    </span>
                    <div className="relative inline-flex h-3.5 w-6 shrink-0 cursor-pointer rounded-full border border-slate-300 dark:border-zinc-600 bg-slate-200 dark:bg-zinc-700 transition-colors group-hover/switch:border-accent group-hover/switch:bg-accent/20">
                      <span className="pointer-events-none inline-block h-2.5 w-2.5 rounded-full bg-white dark:bg-zinc-200 shadow-xs transition duration-200 ease-in-out mt-[1px] ml-[1px] translate-x-0 group-hover/switch:translate-x-2.5 group-hover/switch:bg-accent" />
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteNode();
                    }}
                    title="Eliminar tarjeta"
                    className="text-[10.5px] text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
                  >
                    Eliminar
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
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

            {/* Acciones flotantes abajo: Abrir + Switch Solo texto + Eliminar */}
            <div className="mt-2.5 flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-zinc-800/60">
              <a
                href={fullUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                title="Abrir enlace en pestaña nueva"
                className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline font-medium"
              >
                <span>Abrir</span>
                <ExternalLink className="w-3 h-3" />
              </a>

              {editor.isEditable && (
                <div className="flex items-center gap-2.5 ml-auto">
                  {/* Switch Minimalista para cambiar a solo texto */}
                  <button
                    type="button"
                    onClick={handleConvertToText}
                    title="Cambiar tarjeta a enlace de texto plano (ideal para bibliografías)"
                    className="group/switch flex items-center gap-1.5 px-1.5 py-0.5 rounded cursor-pointer select-none transition-colors hover:bg-slate-100 dark:hover:bg-zinc-800/80 text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200"
                  >
                    <span className="text-[11px] font-medium transition-colors">
                      Solo texto
                    </span>
                    <div className="relative inline-flex h-3.5 w-6 shrink-0 cursor-pointer rounded-full border border-slate-300 dark:border-zinc-600 bg-slate-200 dark:bg-zinc-700 transition-colors group-hover/switch:border-accent group-hover/switch:bg-accent/20">
                      <span className="pointer-events-none inline-block h-2.5 w-2.5 rounded-full bg-white dark:bg-zinc-200 shadow-xs transition duration-200 ease-in-out mt-[1px] ml-[1px] translate-x-0 group-hover/switch:translate-x-2.5 group-hover/switch:bg-accent" />
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteNode();
                    }}
                    title="Eliminar tarjeta"
                    className="text-[10.5px] text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
                  >
                    Eliminar
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Lado derecho: Portada visual o Skeleton Cover */}
        {isLoading ? (
          <div className="hidden sm:flex w-36 md:w-44 shrink-0 relative bg-slate-100 dark:bg-zinc-800/60 border-l border-slate-200/80 dark:border-zinc-800/80 items-center justify-center animate-pulse">
            <Globe className="w-8 h-8 text-slate-300 dark:text-zinc-700" />
          </div>
        ) : image ? (
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
