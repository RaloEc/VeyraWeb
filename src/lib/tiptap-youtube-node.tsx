import React, { useState, useEffect } from 'react';
import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { Plugin, PluginKey } from '@tiptap/pm/state';

export const YT_REGEX =
  /^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})(?:[?&#].*)?$/i;

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    youtube: {
      setYoutube: (options: { videoId: string; embed?: boolean }) => ReturnType;
      toggleYoutubeEmbed: () => ReturnType;
    };
  }
}

const YouTubeComponent: React.FC<NodeViewProps> = (props) => {
  const { node, updateAttributes, deleteNode, selected } = props;
  const videoId: string = node.attrs.videoId || '';
  const embed: boolean = node.attrs.embed !== false;

  const [activated, setActivated] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [imgFailed, setImgFailed] = useState<boolean>(false);

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

  // Reset activated if embed is toggled
  useEffect(() => {
    if (!embed) {
      setActivated(false);
    }
  }, [embed]);

  // ESTADO A — embed=false: Enlace de texto clicable
  if (!embed) {
    return (
      <NodeViewWrapper
        contentEditable={false}
        data-youtube-video=""
        data-video-id={videoId}
        data-embed="false"
        className={`relative group inline-block my-1.5 ${selected ? 'ProseMirror-selectednode' : ''
          }`}
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

  return (
    <NodeViewWrapper
      contentEditable={false}
      data-youtube-video=""
      data-video-id={videoId}
      data-embed="true"
      className={`relative group ${selected ? 'ProseMirror-selectednode' : ''}`}
    >
      {/* Overlay de controles (Hover o Selección) */}
      <div className="yt-overlay absolute top-2 right-2 flex items-center gap-1.5 z-20 p-1 rounded-md bg-black/80 backdrop-blur-xs border border-white/10 shadow-lg pointer-events-auto">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            updateAttributes({ embed: false });
          }}
          className="px-2 py-1 text-[11px] font-medium text-white hover:text-accent bg-white/10 hover:bg-white/20 rounded transition-colors cursor-pointer"
          title="Convertir en enlace"
        >
          Convertir en enlace
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            deleteNode();
          }}
          className="px-2 py-1 text-[11px] font-medium text-red-300 hover:text-red-200 bg-red-500/20 hover:bg-red-500/30 rounded transition-colors cursor-pointer"
          title="Eliminar video"
        >
          Eliminar
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
        />
      ) : (
        // ESTADO B: embed=true, sin activar (thumbnail con play)
        <div
          className="w-full h-full cursor-pointer relative"
          onClick={() => setActivated(true)}
        >
          <img
            className="yt-thumbnail"
            src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
            alt="Miniatura del video de YouTube"
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
          <div className="yt-play">
            <svg viewBox="0 0 68 48" aria-hidden="true">
              <path
                d="M66.52 7.74c-.78-2.93-2.49-5.41-5.42-6.19C55.79.13 34 0 34 0S12.21.13 6.9 1.55c-2.93.78-4.63 3.26-5.42 6.19C.06 13.05 0 24 0 24s.06 10.95 1.48 16.26c.78 2.93 2.49 5.41 5.42 6.19C12.21 47.87 34 48 34 48s21.79-.13 27.1-1.55c2.93-.78 4.64-3.26 5.42-6.19C67.94 34.95 68 24 68 24s-.06-10.95-1.48-16.26z"
                fill="#ff0000"
              />
              <path d="M45 24 27 14v20" fill="#ffffff" />
            </svg>
          </div>
        </div>
      )}
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
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-youtube-video]',
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

    if (embed) {
      return [
        'div',
        {
          'data-youtube-video': '',
          'data-video-id': videoId,
          'data-embed': 'true',
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
      ];
    }

    return [
      'div',
      {
        'data-youtube-video': '',
        'data-video-id': videoId,
        'data-embed': 'false',
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
        (options: { videoId: string; embed?: boolean }) =>
          ({ commands }) => {
            return commands.insertContent({
              type: this.name,
              attrs: {
                videoId: options.videoId,
                embed: options.embed ?? true,
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

