import React, { useState, useRef, useEffect } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { Link2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { fetchLinkMetadata } from '../../../lib/link-metadata';

export const BookmarkPromptNodeView: React.FC<NodeViewProps> = (props) => {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [onlyLink, setOnlyLink] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 20);
    return () => clearTimeout(timer);
  }, []);

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

  const handleSubmit = async () => {
    const cleanUrl = url.trim();
    if (!cleanUrl || isLoading) {
      if (!cleanUrl) handleCancel();
      return;
    }

    const pos = props.getPos();
    if (typeof pos !== 'number') return;

    const fullUrl = cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://')
      ? cleanUrl
      : `https://${cleanUrl}`;

    // Si el switch "Solo enlace" está activado, inserta el enlace plano (ideal para bibliografías)
    if (onlyLink) {
      props.editor
        .chain()
        .focus()
        .deleteRange({ from: pos, to: pos + 1 })
        .insertContent(`<p><a href="${fullUrl}" target="_blank" rel="noopener noreferrer nofollow">${cleanUrl}</a>&nbsp;</p>`)
        .run();
      return;
    }

    setIsLoading(true);

    try {
      const metadata = await fetchLinkMetadata(cleanUrl);

      props.editor
        .chain()
        .focus()
        .deleteRange({ from: pos, to: pos + 1 })
        .insertContent({
          type: 'bookmark',
          attrs: {
            url: metadata.url,
            title: metadata.title,
            domain: metadata.domain,
            favicon: metadata.favicon,
            description: metadata.description,
            image: metadata.image || null,
          },
        })
        .run();
    } catch {
      toast.error('URL no válida. Introduce un enlace web correcto.');
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
      return;
    }

    if (e.key === 'Backspace' && !url) {
      e.preventDefault();
      handleCancel();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
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
        className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-900/50 text-neutral-800 dark:text-neutral-200 transition-colors cursor-text"
      >
        <div className="flex items-center gap-1 text-xs font-mono text-neutral-400 dark:text-neutral-500 select-none shrink-0">
          <Link2 className="w-3.5 h-3.5 text-accent" />
          <span>/enlace</span>
        </div>

        <input
          ref={inputRef}
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          disabled={isLoading}
          placeholder={onlyLink ? "URL para enlace de texto (ej: https://...)" : "Pega o escribe la dirección web (ej: wikipedia.org)..."}
          className="flex-1 bg-transparent border-none outline-none text-[13px] text-neutral-800 dark:text-neutral-200 placeholder:text-neutral-400 dark:placeholder:text-neutral-600 cursor-text disabled:opacity-60"
        />

        {/* Switch Solo Enlace (para bibliografías, citas, etc.) */}
        <div
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            setOnlyLink((prev) => !prev);
            inputRef.current?.focus();
          }}
          title={onlyLink ? 'Modo: Solo enlace plano (clic para volver a Tarjeta)' : 'Modo: Tarjeta de enlace enriquecida (clic para Solo enlace)'}
          className="flex items-center gap-1.5 px-1.5 py-0.5 rounded cursor-pointer select-none transition-colors hover:bg-neutral-200/50 dark:hover:bg-neutral-800/60 shrink-0"
        >
          <span className={`text-[11px] font-medium transition-colors ${onlyLink ? 'text-accent font-semibold' : 'text-neutral-500 dark:text-neutral-400'}`}>
            Solo enlace
          </span>
          <div
            className={`relative inline-flex h-3.5 w-6 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-200 ease-in-out ${
              onlyLink ? 'bg-accent' : 'bg-neutral-300 dark:bg-neutral-700'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-2.5 w-2.5 transform rounded-full bg-white shadow-xs transition duration-200 ease-in-out mt-[1px] ml-[1px] ${
                onlyLink ? 'translate-x-2.5' : 'translate-x-0'
              }`}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-1.5 text-neutral-400 dark:text-neutral-500 shrink-0 select-none">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span className="text-xs">Cargando...</span>
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

