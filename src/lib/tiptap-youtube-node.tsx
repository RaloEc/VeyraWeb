import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { AlignLeft, AlignCenter, AlignRight, Play, Link2, Trash2 } from 'lucide-react';
import { cn } from './utils';

export const YT_REGEX =
  /^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})(?:[?&#].*)?$/i;

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    youtube: {
      setYoutube: (options: {
        videoId: string;
        embed?: boolean;
        width?: number;
        textAlign?: string;
      }) => ReturnType;
      toggleYoutubeEmbed: () => ReturnType;
    };
  }
}

const YouTubeComponent: React.FC<NodeViewProps> = (props) => {
  const { node, updateAttributes, deleteNode, selected, editor, getPos } = props;
  const videoId: string = node.attrs.videoId || '';
  const embed: boolean = node.attrs.embed !== false;
  const width: number = node.attrs.width || 100;
  const textAlign: 'left' | 'center' | 'right' = node.attrs.textAlign || 'center';

  const [activated, setActivated] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [imgFailed, setImgFailed] = useState<boolean>(false);

  const [isResizing, setIsResizing] = useState(false);
  const [currentWidth, setCurrentWidth] = useState<number>(width || 100);

  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const startXRef = useRef(0);
  const startWidthPxRef = useRef(0);
  const containerWidthPxRef = useRef(0);
  const activeHandleRef = useRef<string | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const pendingEventRef = useRef<PointerEvent | null>(null);
  const lastPctRef = useRef<number>(width || 100);

  // Sincronizar ancho cuando cambian atributos desde Yjs o presets externos
  useEffect(() => {
    if (!isResizing) {
      setCurrentWidth(width || 100);
      lastPctRef.current = width || 100;
    }
  }, [width, isResizing]);

  // Manejo de conexión online/offline
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setImgFailed(false);
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Reiniciar estado activado si se conmuta embed
  useEffect(() => {
    if (!embed) {
      setActivated(false);
    }
  }, [embed]);

  // Cancelar requestAnimationFrame si se desmonta
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  // Redimensionamiento táctil / ratón optimizado a 60 FPS con rAF
  const handlePointerDown = useCallback(
    (e: React.PointerEvent, handle: string) => {
      e.preventDefault();
      e.stopPropagation();

      if (!wrapperRef.current || !containerRef.current) return;

      const parentDom = containerRef.current.parentElement || containerRef.current;
      const cWidth = parentDom.clientWidth || containerRef.current.clientWidth || 800;
      const curWidthPx = wrapperRef.current.offsetWidth;

      startXRef.current = e.clientX;
      startWidthPxRef.current = curWidthPx;
      containerWidthPxRef.current = cWidth;
      activeHandleRef.current = handle;
      setIsResizing(true);

      const isRightHandle = handle.includes('e');

      const handlePointerMove = (moveEvent: PointerEvent) => {
        pendingEventRef.current = moveEvent;
        if (rafIdRef.current !== null) return;

        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = null;
          const currentEvent = pendingEventRef.current;
          if (!currentEvent || !wrapperRef.current) return;

          const deltaX = currentEvent.clientX - startXRef.current;
          const effectiveDelta = isRightHandle ? deltaX : -deltaX;
          const multiplier = textAlign === 'center' ? 2 : 1;
          const newWidthPx = startWidthPxRef.current + effectiveDelta * multiplier;

          let pct = (newWidthPx / containerWidthPxRef.current) * 100;
          pct = Math.max(30, Math.min(100, pct));

          if (Math.abs(pct - lastPctRef.current) >= 0.2) {
            lastPctRef.current = pct;
            const roundPct = Math.round(pct);
            let margin = '0%';
            if (textAlign === 'center') {
              margin = `${(100 - roundPct) / 2}%`;
            } else if (textAlign === 'right') {
              margin = `${100 - roundPct}%`;
            }

            // Modificación directa al DOM durante el arrastre (cero deltas Yjs intermedios)
            wrapperRef.current.style.width = `${roundPct}%`;
            wrapperRef.current.style.marginLeft = margin;
            setCurrentWidth(roundPct);
          }
        });
      };

      const handlePointerUp = (upEvent: PointerEvent) => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        window.removeEventListener('pointercancel', handlePointerUp);

        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }

        const deltaX = upEvent.clientX - startXRef.current;
        const effectiveDelta = isRightHandle ? deltaX : -deltaX;
        const multiplier = textAlign === 'center' ? 2 : 1;
        const newWidthPx = startWidthPxRef.current + effectiveDelta * multiplier;

        let pct = (newWidthPx / containerWidthPxRef.current) * 100;
        pct = Math.max(30, Math.min(100, pct));
        const finalWidth = Math.round(pct);

        setIsResizing(false);
        activeHandleRef.current = null;

        let margin = '0%';
        if (textAlign === 'center') {
          margin = `${(100 - finalWidth) / 2}%`;
        } else if (textAlign === 'right') {
          margin = `${100 - finalWidth}%`;
        }

        if (wrapperRef.current) {
          wrapperRef.current.style.width = `${finalWidth}%`;
          wrapperRef.current.style.marginLeft = margin;
        }
        setCurrentWidth(finalWidth);

        // Commit atómico único a Yjs
        updateAttributes({ width: finalWidth });
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('pointercancel', handlePointerUp);
    },
    [textAlign, updateAttributes]
  );

  // ESTADO A — embed=false: Enlace de texto clicable
  if (!embed) {
    return (
      <NodeViewWrapper
        contentEditable={false}
        data-youtube-video=""
        data-video-id={videoId}
        data-embed="false"
        className={cn(
          'relative group inline-block my-1.5',
          selected && 'ProseMirror-selectednode is-selected'
        )}
      >
        <span className="inline-flex items-center gap-2 py-0.5 px-2 rounded border border-veyra-border bg-veyra-card/60 text-sm">
          <a
            href={`https://www.youtube.com/watch?v=${videoId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline font-medium hover:text-accent-muted transition-colors truncate max-w-[420px]"
            onClick={(e) => e.stopPropagation()}
          >
            https://www.youtube.com/watch?v={videoId}
          </a>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              updateAttributes({ embed: true });
            }}
            className="px-1.5 py-0.5 text-[11px] font-medium text-veyra-text hover:text-accent bg-white/10 hover:bg-white/15 rounded transition-colors cursor-pointer"
            title="Mostrar como video"
          >
            Mostrar como video
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              deleteNode();
            }}
            className="px-1.5 py-0.5 text-[11px] font-medium text-red-400 hover:text-red-300 bg-red-500/15 hover:bg-red-500/25 rounded transition-colors cursor-pointer"
            title="Eliminar enlace"
          >
            Eliminar
          </button>
        </span>
      </NodeViewWrapper>
    );
  }

  // ESTADO OFFLINE (si navigator.onLine === false o falla carga de thumbnail)
  const isOfflineState = !isOnline || imgFailed;

  const currentPct = currentWidth || 100;
  let marginLeft = '0%';
  if (textAlign === 'center') {
    marginLeft = `${(100 - currentPct) / 2}%`;
  } else if (textAlign === 'right') {
    marginLeft = `${100 - currentPct}%`;
  }

  const presets = [50, 75, 100];

  const handleSetWidth = (pct: number) => {
    setCurrentWidth(pct);
    updateAttributes({ width: pct });
  };

  const handleSetAlign = (align: 'left' | 'center' | 'right') => {
    updateAttributes({ textAlign: align });
  };

  return (
    <NodeViewWrapper
      ref={containerRef}
      contentEditable={false}
      data-youtube-video=""
      data-video-id={videoId}
      data-embed="true"
      data-align={textAlign}
      data-selected={selected ? 'true' : undefined}
      className={cn(
        'veyra-youtube-node relative block w-full select-none clear-both',
        selected && 'is-selected',
        isResizing && 'is-resizing'
      )}
    >
      <div
        ref={wrapperRef}
        style={{ width: `${currentPct}%`, marginLeft }}
        className={cn(
          'veyra-youtube-wrapper relative group',
          !isResizing &&
            'transition-[width,margin-left] duration-220 ease-out will-change-[width,margin-left]',
          selected && 'outline outline-1 outline-accent outline-offset-2 rounded-lg'
        )}
        onClick={() => {
          if (!selected && typeof getPos === 'function') {
            const pos = getPos();
            if (typeof pos === 'number') {
              editor.commands.setNodeSelection(pos);
            }
          }
        }}
      >
        {/* Contenido interior del video con bordes redondeados */}
        <div className="w-full h-full relative overflow-hidden rounded-lg bg-black">
          {/* Overlay de controles flotante (Hover o Selección) */}
          <div
            className={cn(
              'yt-overlay absolute top-2 right-2 flex items-center gap-1 z-30 p-1 rounded-md bg-black/85 backdrop-blur-md border border-white/10 shadow-lg pointer-events-auto',
              selected && 'opacity-100'
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Presets de tamaño rápido */}
            <div className="flex items-center gap-0.5 border-r border-white/15 pr-1 mr-0.5">
              {presets.map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => handleSetWidth(pct)}
                  className={cn(
                    'px-1.5 py-0.5 text-[10px] font-semibold rounded transition-colors',
                    Math.round(currentPct) === pct
                      ? 'bg-accent text-white'
                      : 'text-white/80 hover:text-white hover:bg-white/10'
                  )}
                  title={`Ajustar a ${pct}%`}
                >
                  {pct}%
                </button>
              ))}
            </div>

            {/* Presets de alineación */}
            <div className="flex items-center gap-0.5 border-r border-white/15 pr-1 mr-0.5">
              <button
                type="button"
                onClick={() => handleSetAlign('left')}
                className={cn(
                  'p-1 rounded text-white/80 hover:text-white hover:bg-white/10 transition-colors',
                  textAlign === 'left' && 'text-accent bg-white/10'
                )}
                title="Alinear a la izquierda"
              >
                <AlignLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleSetAlign('center')}
                className={cn(
                  'p-1 rounded text-white/80 hover:text-white hover:bg-white/10 transition-colors',
                  textAlign === 'center' && 'text-accent bg-white/10'
                )}
                title="Centrar"
              >
                <AlignCenter className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleSetAlign('right')}
                className={cn(
                  'p-1 rounded text-white/80 hover:text-white hover:bg-white/10 transition-colors',
                  textAlign === 'right' && 'text-accent bg-white/10'
                )}
                title="Alinear a la derecha"
              >
                <AlignRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Botón reproducir si no está activo */}
            {!activated && !isOfflineState && (
              <button
                type="button"
                onClick={() => setActivated(true)}
                className="px-2 py-0.5 text-[11px] font-medium text-white hover:text-accent bg-white/10 hover:bg-white/20 rounded transition-colors cursor-pointer flex items-center gap-1"
                title="Reproducir video"
              >
                <Play className="w-3 h-3 fill-current" />
                <span>Play</span>
              </button>
            )}

            {/* Convertir en enlace */}
            <button
              type="button"
              onClick={() => updateAttributes({ embed: false })}
              className="p-1 text-white/80 hover:text-accent hover:bg-white/10 rounded transition-colors cursor-pointer"
              title="Convertir en enlace"
            >
              <Link2 className="w-3.5 h-3.5" />
            </button>

            {/* Eliminar video */}
            <button
              type="button"
              onClick={() => deleteNode()}
              className="p-1 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded transition-colors cursor-pointer"
              title="Eliminar video"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {isOfflineState ? (
            // Estado Offline
            <div
              className="yt-offline"
              onClick={(e) => {
                e.stopPropagation();
              }}
            >
              <div className="yt-offline-icon">▶</div>
              <div className="yt-offline-text">Video de YouTube</div>
              <div className="yt-offline-sub">Sin conexión</div>
              <a
                href={`https://www.youtube.com/watch?v=${videoId}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
              >
                youtube.com/watch?v={videoId}
              </a>
            </div>
          ) : activated ? (
            // ESTADO C: embed=true, activado (iframe real con autoplay=1)
            <iframe
              src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
              title="Reproductor de YouTube"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
              className={cn('w-full h-full', isResizing && 'pointer-events-none')}
            />
          ) : (
            // ESTADO B: embed=true, sin activar (thumbnail con play)
            <div
              className="w-full h-full cursor-pointer relative"
              onClick={() => {
                if (!selected && typeof getPos === 'function') {
                  const pos = getPos();
                  if (typeof pos === 'number') {
                    editor.commands.setNodeSelection(pos);
                  }
                }
              }}
            >
              <img
                className="yt-thumbnail"
                src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
                alt="Miniatura del video de YouTube"
                loading="lazy"
                onError={() => setImgFailed(true)}
              />
              <div
                className="yt-play hover:scale-105 transition-transform"
                onClick={(e) => {
                  e.stopPropagation();
                  setActivated(true);
                }}
                title="Reproducir video"
              >
                <svg viewBox="0 0 68 48" aria-hidden="true" className="cursor-pointer">
                  <path
                    d="M66.52 7.74c-.78-2.93-2.49-5.41-5.42-6.19C55.79.13 34 0 34 0S12.21.13 6.9 1.55c-2.93.78-4.63 3.26-5.42 6.19C.06 13.05 0 24 0 24s.06 10.95 1.48 16.26c.78 2.93 2.49 5.41 5.42 6.19C12.21 47.87 34 48 34 48s21.79-.13 27.1-1.55c2.93-.78 4.64-3.26 5.42-6.19C67.94 34.95 68 24 68 24s-.06-10.95-1.48-16.26z"
                    fill="#ff0000"
                  />
                  <path d="M45 24 27 14v20" fill="#ffffff" />
                </svg>
              </div>
            </div>
          )}
        </div>

        {/* Tiradores de redimensión en las 4 esquinas si está seleccionado */}
        {selected && (
          <>
            {/* Indicador de porcentaje flotante durante el redimensionamiento */}
            {isResizing && currentWidth && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-black/85 text-white text-[11px] font-medium px-2 py-0.5 rounded-full backdrop-blur-sm pointer-events-none z-40 shadow">
                {currentWidth}%
              </div>
            )}

            {/* Manija Noroeste (NW) */}
            <div
              onPointerDown={(e) => handlePointerDown(e, 'nw')}
              className="resize-handle resize-nw"
              title="Redimensionar"
            />
            {/* Manija Noreste (NE) */}
            <div
              onPointerDown={(e) => handlePointerDown(e, 'ne')}
              className="resize-handle resize-ne"
              title="Redimensionar"
            />
            {/* Manija Suroeste (SW) */}
            <div
              onPointerDown={(e) => handlePointerDown(e, 'sw')}
              className="resize-handle resize-sw"
              title="Redimensionar"
            />
            {/* Manija Sureste (SE) */}
            <div
              onPointerDown={(e) => handlePointerDown(e, 'se')}
              className="resize-handle resize-se"
              title="Redimensionar"
            />
          </>
        )}
      </div>
    </NodeViewWrapper>
  );
};

export const YoutubeNode = Node.create({
  name: 'youtube',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  inline: false,

  addAttributes() {
    return {
      videoId: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const fromData = element.getAttribute('data-video-id');
          if (fromData) return fromData;

          if (element.tagName.toLowerCase() === 'iframe') {
            const src = element.getAttribute('src') || '';
            const match = src.match(
              /(?:youtube\.com|youtube-nocookie\.com)\/embed\/([a-zA-Z0-9_-]{11})/i
            );
            return match ? match[1] : null;
          }
          return null;
        },
      },
      embed: {
        default: true,
        parseHTML: (element: HTMLElement) => {
          const val = element.getAttribute('data-embed');
          return val !== 'false';
        },
      },
      width: {
        default: 100,
        parseHTML: (element: HTMLElement) => {
          const w =
            element.getAttribute('data-width') ||
            (element.style && element.style.width);
          return w ? parseInt(w, 10) : 100;
        },
        renderHTML: (attributes) => {
          return {
            'data-width': attributes.width || 100,
          };
        },
      },
      textAlign: {
        default: 'center',
        parseHTML: (element: HTMLElement) => {
          return (
            element.getAttribute('data-align') ||
            element.getAttribute('data-text-align') ||
            'center'
          );
        },
        renderHTML: (attributes) => {
          return {
            'data-align': attributes.textAlign || 'center',
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-youtube-video]',
      },
      {
        tag: 'div.veyra-youtube-node',
      },
      {
        tag: 'iframe[src*="youtube.com/embed/"]',
      },
      {
        tag: 'iframe[src*="youtube-nocookie.com/embed/"]',
      },
    ];
  },

  renderHTML({ node }) {
    const videoId = node.attrs.videoId || '';
    const embed = node.attrs.embed !== false;
    const width = node.attrs.width || 100;
    const textAlign = node.attrs.textAlign || 'center';

    let marginLeft = '0%';
    if (textAlign === 'center') {
      marginLeft = `${(100 - width) / 2}%`;
    } else if (textAlign === 'right') {
      marginLeft = `${100 - width}%`;
    }

    if (embed) {
      return [
        'div',
        {
          'data-youtube-video': '',
          'data-video-id': videoId,
          'data-embed': 'true',
          'data-width': width,
          'data-align': textAlign,
          class: 'veyra-youtube-node',
        },
        [
          'div',
          {
            class: 'veyra-youtube-wrapper',
            style: `width: ${width}%; margin-left: ${marginLeft};`,
          },
          [
            'iframe',
            {
              loading: 'lazy',
              src: `https://www.youtube.com/embed/${videoId}`,
              frameborder: '0',
              allow:
                'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
              referrerpolicy: 'strict-origin-when-cross-origin',
              allowfullscreen: 'true',
            },
          ],
        ],
      ];
    }

    return [
      'div',
      {
        'data-youtube-video': '',
        'data-video-id': videoId,
        'data-embed': 'false',
        'data-width': width,
        'data-align': textAlign,
        class: 'veyra-youtube-node',
      },
      [
        'a',
        {
          href: `https://www.youtube.com/watch?v=${videoId}`,
        },
        `https://www.youtube.com/watch?v=${videoId}`,
      ],
    ];
  },

  addCommands() {
    return {
      setYoutube:
        (options: {
          videoId: string;
          embed?: boolean;
          width?: number;
          textAlign?: string;
        }) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: {
              videoId: options.videoId,
              embed: options.embed ?? true,
              width: options.width ?? 100,
              textAlign: options.textAlign ?? 'center',
            },
          });
        },
      toggleYoutubeEmbed:
        () =>
        ({ tr, state, dispatch }) => {
          const { selection } = state;
          let nodePos: number | null = null;
          let currentNode: any = null;

          if (selection.$from.node().type.name === this.name) {
            nodePos = selection.$from.before();
            currentNode = selection.$from.node();
          } else if (
            (selection as any).node &&
            (selection as any).node.type.name === this.name
          ) {
            nodePos = selection.from;
            currentNode = (selection as any).node;
          } else {
            state.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
              if (node.type.name === this.name && nodePos === null) {
                nodePos = pos;
                currentNode = node;
                return false;
              }
            });
          }

          if (nodePos !== null && currentNode && dispatch) {
            const currentEmbed = currentNode.attrs.embed !== false;
            tr.setNodeMarkup(nodePos, undefined, {
              ...currentNode.attrs,
              embed: !currentEmbed,
            });
            dispatch(tr);
            return true;
          }
          return false;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-y': () => this.editor.commands.toggleYoutubeEmbed(),
      'Mod-Shift-Y': () => this.editor.commands.toggleYoutubeEmbed(),
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('youtubePasteHandler'),
        props: {
          handlePaste: (_view, event) => {
            const plain = event.clipboardData?.getData('text/plain')?.trim();
            if (!plain) return false;

            const match = plain.match(YT_REGEX);
            if (match && match[1]) {
              event.preventDefault();
              this.editor
                .chain()
                .focus()
                .setYoutube({ videoId: match[1], embed: true })
                .run();
              return true;
            }
            return false;
          },
        },
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(YouTubeComponent);
  },
});
