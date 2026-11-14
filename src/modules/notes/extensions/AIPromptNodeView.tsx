import React, { useState, useRef, useEffect } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { Loader2 } from 'lucide-react';
import {
  generateNoteContentWithAI,
  type AINoteContext,
  type AIYouTubeVideoContext,
} from '../../../lib/ai/ai-notes-service';
import { toast } from 'sonner';

export const AIPromptNodeView: React.FC<NodeViewProps> = (props) => {
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [stepText, setStepText] = useState('Generando...');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Foco automático inmediato al aparecer en la línea
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 20);
    return () => clearTimeout(timer);
  }, []);

  // Animación de pasos mientras la IA procesa
  useEffect(() => {
    if (!isLoading) {
      setStepText('Generando...');
      return;
    }

    setStepText('Analizando orden...');
    const t1 = setTimeout(() => setStepText('Estructurando contenido...'), 900);
    const t2 = setTimeout(() => setStepText('Insertando en la nota...'), 2000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isLoading]);

  const handleCancel = () => {
    if (isLoading) return;
    const pos = props.getPos();
    if (typeof pos !== 'number') return;
    props.editor
      .chain()
      .focus()
      .deleteRange({ from: pos, to: pos + 1 })
      .insertContent('<p></p>')
      .run();
  };

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
      return;
    }

    if (e.key === 'Backspace' && !prompt) {
      e.preventDefault();
      handleCancel();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const cleanPrompt = prompt.trim();
      if (!cleanPrompt || isLoading) return;

      setIsLoading(true);

      const pos = props.getPos();
      let context: AINoteContext | undefined = undefined;

      if (typeof pos === 'number') {
        const doc = props.editor.state.doc;
        // 1. Extraer los párrafos o texto antes de esta posición
        const textBefore = doc.textBetween(0, pos, '\n', '\n').slice(-6000);

        // 2. Buscar si hay imágenes previas en la nota
        const nearbyImages: Array<{ src: string; mimeType: string }> = [];
        doc.nodesBetween(Math.max(0, pos - 3000), pos, (node) => {
          if (node.type.name === 'image' && node.attrs.src) {
            const src = String(node.attrs.src);
            let mimeType = 'image/jpeg';
            if (src.includes('.png') || src.startsWith('data:image/png')) mimeType = 'image/png';
            else if (src.includes('.webp') || src.startsWith('data:image/webp')) mimeType = 'image/webp';
            else if (src.includes('.gif') || src.startsWith('data:image/gif')) mimeType = 'image/gif';

            nearbyImages.push({ src, mimeType });
          }
        });

        // 3. Buscar si hay videos de YouTube en la nota previos al cursor
        const ytVideoIds: string[] = [];
        doc.nodesBetween(0, pos, (node) => {
          if (node.type.name === 'youtube' && node.attrs.videoId) {
            const vid = String(node.attrs.videoId);
            if (!ytVideoIds.includes(vid)) {
              ytVideoIds.push(vid);
            }
          }
        });

        let nearbyYouTubeVideos: AIYouTubeVideoContext[] = [];
        if (ytVideoIds.length > 0) {
          setStepText('Analizando video de YouTube...');
          // Tomar los videos más recientes antes de la posición
          const targetIds = ytVideoIds.slice(-3);
          nearbyYouTubeVideos = await Promise.all(
            targetIds.map(async (vid) => {
              const videoUrl = `https://www.youtube.com/watch?v=${vid}`;
              try {
                const res = await fetch(
                  `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`
                );
                if (res.ok) {
                  const data = await res.json();
                  return {
                    videoId: vid,
                    url: videoUrl,
                    title: data.title || undefined,
                    author: data.author_name || undefined,
                    thumbnailUrl: data.thumbnail_url || `https://img.youtube.com/vi/${vid}/hqdefault.jpg`,
                  };
                }
              } catch {}
              return {
                videoId: vid,
                url: videoUrl,
                thumbnailUrl: `https://img.youtube.com/vi/${vid}/hqdefault.jpg`,
              };
            })
          );
        }

        // Si no hay imágenes previas pero hay videos de YouTube, usamos la miniatura del primer video
        // como adjunto visual para que Gemini pueda analizarla multimodalmente
        if (nearbyImages.length === 0 && nearbyYouTubeVideos.length > 0 && nearbyYouTubeVideos[0].thumbnailUrl) {
          nearbyImages.push({
            src: nearbyYouTubeVideos[0].thumbnailUrl,
            mimeType: 'image/jpeg',
          });
        }

        context = {
          textBefore,
          image: nearbyImages[nearbyImages.length - 1],
          images: nearbyImages,
          youtubeVideos: nearbyYouTubeVideos,
        };
      }

      try {
        const result = await generateNoteContentWithAI(cleanPrompt, context);

        if (result.success) {
          if (typeof pos === 'number') {
            props.editor
              .chain()
              .focus()
              .deleteRange({ from: pos, to: pos + 1 })
              .insertContent(result.data.html)
              .run();
          }
        } else {
          setIsLoading(false);
          toast.error(result.error || 'No se pudo generar el contenido con IA');
          inputRef.current?.focus();
        }
      } catch (err: any) {
        setIsLoading(false);
        console.error('[AIPromptNodeView] Error:', err);
        toast.error('Error al procesar la solicitud.');
        inputRef.current?.focus();
      }
    }
  };

  return (
    <NodeViewWrapper
      contentEditable={false}
      className="my-1.5 not-prose"
      onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
    >
      <div
        onClick={(e) => {
          e.stopPropagation();
          inputRef.current?.focus();
        }}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 text-slate-800 dark:text-zinc-200 transition-colors cursor-text"
      >
        <span className="text-xs font-mono text-neutral-400 dark:text-neutral-500 select-none shrink-0">
          /ia
        </span>

        <input
          ref={inputRef}
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          disabled={isLoading}
          placeholder="Escribe tu orden y presiona Enter..."
          className="flex-1 bg-transparent border-none outline-none text-[13px] text-neutral-800 dark:text-neutral-200 placeholder:text-neutral-400 dark:placeholder:text-neutral-600 disabled:opacity-60 cursor-text"
        />

        {isLoading ? (
          <div className="flex items-center gap-1.5 text-neutral-400 dark:text-neutral-500 shrink-0 select-none">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span className="text-xs">{stepText}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-[10px] text-neutral-400 dark:text-neutral-500 shrink-0 select-none">
            <span className="px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-800 font-mono text-[9px]">
              Enter ↵
            </span>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
};
