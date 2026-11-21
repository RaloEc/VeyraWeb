import React from 'react';
import { ExternalLink, FileText, X } from 'lucide-react';
import { isImageAttachment, type AttachmentItem } from '../../lib/utils';
import {
  isVeyraAttachmentUri,
  resolveAttachmentUri,
  useResolvedAttachmentSrc,
} from '../../lib/storage';

interface AttachmentPreviewRowProps {
  attachment: AttachmentItem;
  onRemove: () => void;
}

export const AttachmentPreviewRow: React.FC<AttachmentPreviewRowProps> = ({
  attachment,
  onRemove,
}) => {
  const isImg =
    isImageAttachment(attachment.uri) || isImageAttachment(attachment.name);
  const { resolvedSrc } = useResolvedAttachmentSrc(attachment.uri);

  const handleOpen = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!isVeyraAttachmentUri(attachment.uri)) return;
    if (resolvedSrc && resolvedSrc !== attachment.uri) return;
    e.preventDefault();
    try {
      const signedUrl = await resolveAttachmentUri(attachment.uri);
      window.open(signedUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.warn('[AttachmentPreviewRow] Error opening private attachment:', err);
    }
  };

  const resolvedHref =
    resolvedSrc && !isVeyraAttachmentUri(resolvedSrc) ? resolvedSrc : '#';

  return (
    <div className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-veyra-card border border-veyra-border text-xs group hover:border-accent/40 transition-colors">
      <a
        href={resolvedHref}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleOpen}
        className="flex items-center gap-2 flex-1 min-w-0 hover:text-accent transition-colors"
        title={attachment.name}
      >
        {isImg && resolvedSrc ? (
          <img
            src={resolvedSrc}
            alt={attachment.name}
            className="w-8 h-8 rounded object-cover border border-veyra-border/60 shrink-0 bg-black/10"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
        ) : (
          <FileText className="w-3.5 h-3.5 text-accent shrink-0" />
        )}
        <span className="truncate text-veyra-text font-medium text-[11px]">
          {attachment.name}
        </span>
        <ExternalLink className="w-3 h-3 text-veyra-subtle shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
      </a>
      <button
        type="button"
        onClick={onRemove}
        className="p-1 text-veyra-subtle hover:text-red-400 opacity-60 group-hover:opacity-100 transition-opacity cursor-pointer shrink-0"
        title="Eliminar adjunto"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
