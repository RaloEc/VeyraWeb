export const MAX_FULL_DOCUMENT_HTML_CHARS = 28000;

const MEDIA_TOKEN_PREFIX = 'VEYRA_MEDIA_';

/**
 * Replaces balanced HTML elements matching a tag name and opening-tag predicate.
 * Handles nested tags of the same tagName (such as nested <div> inside YouTube embeds).
 */
function replaceBalancedTagElements(
  html: string,
  tagName: string,
  openTagPredicate: (openTag: string) => boolean,
  replacer: (fullElementHtml: string) => string
): string {
  if (!html) return html;

  const tagRegex = new RegExp(
    `<(/?)${tagName}\\b(?:\\s+(?:"[^"]*"|'[^']*'|[^>"'])*)?\\s*(/?)>`,
    'gi'
  );

  let result = '';
  let lastIndex = 0;

  while (true) {
    tagRegex.lastIndex = lastIndex;
    const match = tagRegex.exec(html);
    if (!match) {
      result += html.slice(lastIndex);
      break;
    }

    const isClosing = match[1] === '/';
    const isSelfClosing = match[2] === '/';
    const openStart = match.index;
    const openEnd = tagRegex.lastIndex;
    const openTag = match[0];

    if (isClosing || !openTagPredicate(openTag)) {
      result += html.slice(lastIndex, openEnd);
      lastIndex = openEnd;
      continue;
    }

    result += html.slice(lastIndex, openStart);

    if (isSelfClosing) {
      result += replacer(openTag);
      lastIndex = openEnd;
      continue;
    }

    let depth = 1;
    let elementEnd = html.length;

    while (depth > 0) {
      const innerMatch = tagRegex.exec(html);
      if (!innerMatch) {
        elementEnd = html.length;
        break;
      }

      const innerIsClosing = innerMatch[1] === '/';
      const innerIsSelfClosing = innerMatch[2] === '/';

      if (innerIsClosing) {
        depth -= 1;
        if (depth === 0) {
          elementEnd = tagRegex.lastIndex;
          break;
        }
      } else if (!innerIsSelfClosing) {
        depth += 1;
      }
    }

    const fullElementHtml = html.slice(openStart, elementEnd);
    result += replacer(fullElementHtml);
    lastIndex = elementEnd;
  }

  return result;
}

/**
 * Removes interactive prompt nodes (/ia, /enlace) from editor HTML before sending or snapshotting.
 */
export function stripPromptNodesFromHtml(html: string): string {
  if (!html) return '';
  return replaceBalancedTagElements(
    html,
    'div',
    (openTag) => /\bdata-type\s*=\s*["'](?:ai-prompt|bookmark-prompt)["']/i.test(openTag),
    () => ''
  );
}

/**
 * Replaces images, YouTube embeds, and bookmark cards with deterministic placeholder tokens
 * so full-document AI edits cannot lose or corrupt attachment URIs or embed markup.
 */
export function protectMediaNodesInHtml(html: string): {
  protectedHtml: string;
  tokens: Map<string, string>;
} {
  const tokens = new Map<string, string>();
  let counter = 0;

  const createTokenBlock = (originalHtml: string): string => {
    const tokenKey = `${MEDIA_TOKEN_PREFIX}${counter++}`;
    tokens.set(tokenKey, originalHtml);
    return `<p>[[${tokenKey}]]</p>`;
  };

  let processed = stripPromptNodesFromHtml(html);

  // 1. Protect bookmark cards first so nested favicon/cover <img> elements stay inside the card token
  processed = replaceBalancedTagElements(
    processed,
    'a',
    (openTag) => /\bdata-bookmark-card\b/i.test(openTag),
    createTokenBlock
  );

  // 2. Protect YouTube embeds (supports nested <div> wrappers)
  processed = replaceBalancedTagElements(
    processed,
    'div',
    (openTag) => /\bdata-youtube-video\b/i.test(openTag),
    createTokenBlock
  );

  // 3. Protect standalone <img> nodes (e.g., veyra-attachment:// or external URLs)
  const imgTagRegex = /<img\b(?:\s+(?:"[^"]*"|'[^']*'|[^>"'])*)?\s*\/?>/gi;
  processed = processed.replace(imgTagRegex, (match) => createTokenBlock(match));

  return {
    protectedHtml: processed,
    tokens,
  };
}

/**
 * Returns true only when the user explicitly requests removing media items.
 */
export function isExplicitMediaDeletionPrompt(prompt: string): boolean {
  if (!prompt) return false;
  return /(elimina|borra|quita|remueve|delete|remove)\b[^.\n]{0,40}\b(im[aá]gen(?:es)?|foto(?:s)?|v[ií]deo(?:s)?|youtube|enlace(?:s)?|marcador(?:es)?|bookmark)/i.test(
    prompt
  );
}

/**
 * Restores protected media HTML in place of [[VEYRA_MEDIA_N]] markers.
 */
export function restoreMediaNodesInHtml(
  aiHtml: string,
  tokens: Map<string, string>,
  options?: { preserveDroppedMedia?: boolean }
): string {
  if (!aiHtml) return '';
  if (!tokens || tokens.size === 0) return aiHtml;

  let restored = aiHtml;
  const droppedMediaHtml: string[] = [];
  const preserveDroppedMedia = Boolean(options?.preserveDroppedMedia);

  for (const [tokenKey, originalHtml] of tokens.entries()) {
    const marker = `[[${tokenKey}]]`;
    const hadMarker = restored.includes(marker);

    if (hadMarker) {
      const escapedKey = tokenKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const wrappedPattern = new RegExp(
        `<(?:p|div)(?:\\s+(?:"[^"]*"|'[^']*'|[^>"'])*)?>\\s*\\[\\[${escapedKey}\\]\\]\\s*<\\/(?:p|div)>`,
        'gi'
      );
      restored = restored.replace(wrappedPattern, () => originalHtml);

      const barePattern = new RegExp(`\\[\\[${escapedKey}\\]\\]`, 'g');
      restored = restored.replace(barePattern, () => originalHtml);
    } else if (preserveDroppedMedia) {
      droppedMediaHtml.push(originalHtml);
    }
  }

  if (droppedMediaHtml.length > 0) {
    restored = `${restored}${droppedMediaHtml.join('')}`;
  }

  return restored;
}

/**
 * Cleans markdown fences and strips accidental prompt node echoes from AI HTML output.
 */
export function sanitizeAiHtmlOutput(html: string): string {
  if (!html) return '';
  const withoutFences = html
    .replace(/^```(?:html)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  return stripPromptNodesFromHtml(withoutFences);
}

/**
 * Measures visible plain-text length of an HTML fragment (used to guard against empty replacements).
 */
export function extractPlainTextLength(html: string): number {
  if (!html) return 0;
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim().length;
}
