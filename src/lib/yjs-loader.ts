import * as Y from 'yjs';
import * as awarenessProtocol from 'y-protocols/awareness';
import katex from 'katex';
import { supabase } from './supabase';
import { uint8ArrayToBase64, computeSha256 } from './crypto-utils';
import { activateNoteYjsMode } from './yjs-activation';

export interface YjsLoadedNote {
  noteId: string;
  ydoc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  activePageId: string;
  metaTitle: string;
  syncMode: 'yjs' | 'rest';
  pageOrder: string[];
  destroy: () => void;
}

/**
 * Resolves the exact XML fragment name for a given page ID.
 * In Veyra, the page ID in pageOrder might be a raw UUID or prefixed with 'page_'.
 * This checks the document's actual shared types to ensure we match the exact key.
 */
export function resolvePageFragmentName(ydoc: Y.Doc, pageId: string): string {
  if (!pageId) return 'default';

  // 1. Direct match in ydoc.share
  if (ydoc.share.has(pageId)) return pageId;

  // 2. If it starts with 'page_', check if the raw ID without prefix exists
  if (pageId.startsWith('page_')) {
    const rawId = pageId.replace(/^page_/, '');
    if (ydoc.share.has(rawId)) return rawId;
  }

  // 3. If it doesn't start with 'page_', check if prefixed 'page_' exists
  if (!pageId.startsWith('page_')) {
    const prefixed = `page_${pageId}`;
    if (ydoc.share.has(prefixed)) return prefixed;
  }

  // 4. Check if 'default' fragment has content as fallback
  if (ydoc.share.has('default')) {
    const defFrag = ydoc.getXmlFragment('default');
    if (defFrag.length > 0) return 'default';
  }

  // 5. Default fallback to pageId as-is
  return pageId;
}

/**
 * Selects the best initial page to display:
 * Prioritizes the first page that contains real user content.
 */
export function findBestInitialPage(ydoc: Y.Doc, pageIds: string[]): string {
  if (pageIds.length === 0) return crypto.randomUUID();

  // Find the first page with real content (length > 1, or text not empty)
  for (const pid of pageIds) {
    const fragName = resolvePageFragmentName(ydoc, pid);
    const frag = ydoc.getXmlFragment(fragName);
    if (frag.length > 1) {
      return pid;
    }
    if (frag.length === 1) {
      const str = frag.toString().trim();
      if (
        str &&
        str !== '<paragraph></paragraph>' &&
        str !== '<paragraph textAlign="left"></paragraph>' &&
        str !== '<paragraph textAlign="left"><textStyle color="#F4F4F5" fontFamily="null"></textStyle></paragraph>'
      ) {
        return pid;
      }
    }
  }

  return pageIds[0];
}

/**
 * Inserts HTML or plain text into a Y.XmlFragment (used when importing REST notes)
 */
/**
 * Recursively parses inline DOM child nodes (strong, u, mark, em, code, span color, etc.)
 * into Yjs text delta formatting operations.
 */
function parseInlineNodesToDelta(
  node: Node,
  activeMarks: Record<string, any> = {}
): Array<{ insert: string; attributes?: Record<string, any> }> {
  const deltas: Array<{ insert: string; attributes?: Record<string, any> }> = [];

  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent || '';
      if (text) {
        const attributes = Object.keys(activeMarks).length > 0 ? { ...activeMarks } : undefined;
        deltas.push({ insert: text, ...(attributes ? { attributes } : {}) });
      }
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as HTMLElement;
      const tag = el.tagName.toLowerCase();
      const currentMarks: Record<string, any> = { ...activeMarks };

      if (tag === 'strong' || tag === 'b') {
        currentMarks.bold = {};
      } else if (tag === 'em' || tag === 'i') {
        currentMarks.italic = {};
      } else if (tag === 'u') {
        currentMarks.underline = {};
      } else if (tag === 's' || tag === 'del' || tag === 'strike') {
        currentMarks.strike = {};
      } else if (tag === 'mark') {
        const color = el.getAttribute('data-color') || el.style?.backgroundColor || undefined;
        currentMarks.highlight = color ? { color } : {};
      } else if (tag === 'code') {
        currentMarks.code = {};
      } else if (tag === 'a') {
        const href = el.getAttribute('href') || '';
        currentMarks.link = { href };
      } else if (tag === 'span') {
        const color = el.style?.color;
        const fontSize = el.style?.fontSize;
        const fontFamily = el.style?.fontFamily;
        const existingTs = currentMarks.textStyle || {};
        const newTs: Record<string, any> = { ...existingTs };
        if (color) newTs.color = color;
        if (fontSize) newTs.fontSize = fontSize;
        if (fontFamily) newTs.fontFamily = fontFamily.replace(/['"]/g, '');
        if (Object.keys(newTs).length > 0) {
          currentMarks.textStyle = newTs;
        }
      }

      deltas.push(...parseInlineNodesToDelta(el, currentMarks));
    }
  }

  return deltas;
}

/**
 * Appends a Y.XmlText populated with rich text deltas into a parent Y.XmlElement.
 */
function populateElementWithInlines(parentElement: Y.XmlElement, domContainer: Node) {
  const yText = new Y.XmlText();
  parentElement.push([yText]);
  const deltas = parseInlineNodesToDelta(domContainer);
  if (deltas.length > 0) {
    yText.applyDelta(deltas);
  }
}

/**
 * Inserts HTML or plain text into a Y.XmlFragment (used when importing REST notes).
 * Preserves all rich text formatting: bold, underline, highlight, italic, lists, headings, etc.
 */
export function insertHtmlIntoFragment(fragment: Y.XmlFragment, htmlOrText: string) {
  if (!htmlOrText) return;
  if (typeof window === 'undefined') return;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlOrText, 'text/html');
    const childNodes = Array.from(doc.body.childNodes);

    const hasMedia = doc.body.querySelector('img, table, hr, iframe');
    if (childNodes.length === 0 || (doc.body.textContent?.trim() === '' && !hasMedia)) {
      const p = new Y.XmlElement('paragraph');
      fragment.push([p]);
      return;
    }

    for (const node of childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent?.trim();
        if (text) {
          const p = new Y.XmlElement('paragraph');
          fragment.push([p]);
          const yText = new Y.XmlText(text);
          p.push([yText]);
        }
        continue;
      }

      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        const tag = el.tagName.toLowerCase();

        // 1. Direct standalone image: <img src="..." />
        if (tag === 'img') {
          const src = el.getAttribute('src');
          if (src) {
            const yImg = new Y.XmlElement('image');
            yImg.setAttribute('src', src);
            const alt = el.getAttribute('alt');
            if (alt) yImg.setAttribute('alt', alt);
            const title = el.getAttribute('title');
            if (title) yImg.setAttribute('title', title);
            fragment.push([yImg]);
          }
          continue;
        }

        // 2. Headings: <h1> - <h6>
        if (/^h[1-6]$/.test(tag)) {
          const level = Math.min(3, Math.max(1, parseInt(tag[1], 10) || 1));
          const h = new Y.XmlElement('heading');
          h.setAttribute('level', String(level));
          const align = el.style.textAlign;
          if (align) h.setAttribute('textAlign', align);
          fragment.push([h]);
          populateElementWithInlines(h, el);
          continue;
        }

        // 3. Unordered list / Task list
        if (tag === 'ul') {
          const isTaskList = el.getAttribute('data-type') === 'taskList' || el.classList.contains('task-list');
          const listType = isTaskList ? 'taskList' : 'bulletList';
          const yList = new Y.XmlElement(listType);
          fragment.push([yList]);
          for (const li of Array.from(el.children)) {
            if (li.tagName.toLowerCase() === 'li') {
              const itemType = isTaskList ? 'taskItem' : 'listItem';
              const yItem = new Y.XmlElement(itemType);
              if (isTaskList) {
                const checked = li.getAttribute('data-checked') === 'true' || (li.querySelector('input[type="checkbox"]') as HTMLInputElement)?.checked;
                yItem.setAttribute('checked', checked ? 'true' : 'false');
              }
              yList.push([yItem]);
              const yP = new Y.XmlElement('paragraph');
              yItem.push([yP]);
              populateElementWithInlines(yP, li);
            }
          }
          continue;
        }

        // 4. Ordered list
        if (tag === 'ol') {
          const yList = new Y.XmlElement('orderedList');
          if (el.hasAttribute('start')) {
            const startVal = parseInt(el.getAttribute('start') || '1', 10);
            if (!isNaN(startVal) && startVal > 1) {
              yList.setAttribute('start', String(startVal));
            }
          }
          if (el.hasAttribute('data-list-style')) {
            const styleVal = el.getAttribute('data-list-style');
            if (styleVal && styleVal !== 'decimal') {
              yList.setAttribute('listStyle', styleVal);
            }
          }
          fragment.push([yList]);
          for (const li of Array.from(el.children)) {
            if (li.tagName.toLowerCase() === 'li') {
              const yItem = new Y.XmlElement('listItem');
              yList.push([yItem]);
              const yP = new Y.XmlElement('paragraph');
              yItem.push([yP]);
              populateElementWithInlines(yP, li);
            }
          }
          continue;
        }

        // 5. Blockquote
        if (tag === 'blockquote') {
          const bq = new Y.XmlElement('blockquote');
          fragment.push([bq]);
          const yP = new Y.XmlElement('paragraph');
          bq.push([yP]);
          populateElementWithInlines(yP, el);
          continue;
        }

        // 6. Code block
        if (tag === 'pre') {
          const cb = new Y.XmlElement('codeBlock');
          fragment.push([cb]);
          const text = el.textContent || '';
          if (text) {
            const yText = new Y.XmlText(text);
            cb.push([yText]);
          }
          continue;
        }

        // 7. Paragraph or container that may contain images
        const nestedImages = Array.from(el.querySelectorAll('img'));
        if (nestedImages.length > 0) {
          // If the element is purely wrapping images (e.g. <p><img src="..." /></p>)
          if (el.textContent?.trim() === '') {
            for (const imgEl of nestedImages) {
              const src = imgEl.getAttribute('src');
              if (src) {
                const yImg = new Y.XmlElement('image');
                yImg.setAttribute('src', src);
                const alt = imgEl.getAttribute('alt');
                if (alt) yImg.setAttribute('alt', alt);
                const title = imgEl.getAttribute('title');
                if (title) yImg.setAttribute('title', title);
                fragment.push([yImg]);
              }
            }
            continue;
          }

          // Mixed content (text + image): split into text paragraphs and images
          for (const child of Array.from(el.childNodes)) {
            if (child.nodeType === Node.ELEMENT_NODE && (child as HTMLElement).tagName.toLowerCase() === 'img') {
              const imgEl = child as HTMLElement;
              const src = imgEl.getAttribute('src');
              if (src) {
                const yImg = new Y.XmlElement('image');
                yImg.setAttribute('src', src);
                const alt = imgEl.getAttribute('alt');
                if (alt) yImg.setAttribute('alt', alt);
                const title = imgEl.getAttribute('title');
                if (title) yImg.setAttribute('title', title);
                fragment.push([yImg]);
              }
            } else {
              const p = new Y.XmlElement('paragraph');
              fragment.push([p]);
              populateElementWithInlines(p, child);
            }
          }
          continue;
        }

        // 8. YouTube iframe or container div
        if (tag === 'iframe') {
          const src = el.getAttribute('src') || '';
          const ytMatch = src.match(/(?:youtube\.com|youtube-nocookie\.com)\/embed\/([a-zA-Z0-9_-]{11})/i);
          if (ytMatch && ytMatch[1]) {
            const yYoutube = new Y.XmlElement('youtube');
            yYoutube.setAttribute('videoId', ytMatch[1]);
            yYoutube.setAttribute('embed', 'true');
            fragment.push([yYoutube]);
            continue;
          }
        }

        if (tag === 'div' && el.hasAttribute('data-youtube-video')) {
          const videoId = el.getAttribute('data-video-id');
          if (videoId) {
            const yYoutube = new Y.XmlElement('youtube');
            yYoutube.setAttribute('videoId', videoId);
            const embedVal = el.getAttribute('data-embed') !== 'false';
            yYoutube.setAttribute('embed', embedVal ? 'true' : 'false');
            fragment.push([yYoutube]);
            continue;
          }
        }

        // 9. Math block
        if (
          (tag === 'div' && el.getAttribute('data-type') === 'math-block') ||
          el.classList.contains('veyra-math-block')
        ) {
          const latex = el.getAttribute('data-latex') || el.textContent || '';
          const yMath = new Y.XmlElement('mathBlock');
          yMath.setAttribute('latex', latex);
          fragment.push([yMath]);
          continue;
        }

        // 10. Standard paragraph / div
        const p = new Y.XmlElement('paragraph');
        const align = el.style.textAlign;
        if (align) p.setAttribute('textAlign', align);
        fragment.push([p]);
        populateElementWithInlines(p, el);
      }
    }
  } catch (err) {
    console.warn('⚠️ [insertHtmlIntoFragment] Error:', err);
    const p = new Y.XmlElement('paragraph');
    fragment.push([p]);
    p.push([new Y.XmlText(htmlOrText)]);
  }
}

/**
 * Loads a note from Supabase:
 * 1. Checks notes table for metadata and sync_mode (yjs or rest).
 * 2. Restores snapshot from note_yjs_snapshots (if Yjs mode).
 * 3. Applies historical deltas from note_yjs_updates (> server_clock).
 * 4. Fallback: imports notes.content if it was stored in REST format.
 * 5. Identifies all pages in doc.getArray('pageOrder') and selects best active page.
 */
export async function loadYjsNote(noteId: string): Promise<YjsLoadedNote> {
  console.group(`📝 [Veyra Yjs Loader] Iniciando carga de nota: ${noteId}`);
  const startTime = performance.now();
  const ydoc = new Y.Doc();
  const awareness = new awarenessProtocol.Awareness(ydoc);

  // 1. Fetch note row from notes table
  const { data: noteRow, error: noteRowErr } = await supabase
    .from('notes')
    .select('id, title, content, sync_mode')
    .eq('id', noteId)
    .maybeSingle();

  if (noteRowErr) {
    console.warn('⚠️ [NoteRow] Error al consultar datos de la nota:', noteRowErr);
  }

  const syncMode = (noteRow?.sync_mode as 'yjs' | 'rest') || 'yjs';
  let hasBinaryData = false;

  // 2. Fetch consolidated snapshot
  console.log('1️⃣ [Snapshot] Consultando tabla note_yjs_snapshots...');
  const { data: snapshotData, error: snapErr } = await supabase
    .from('note_yjs_snapshots')
    .select('snapshot, server_clock')
    .eq('note_id', noteId)
    .maybeSingle();

  if (snapErr) {
    console.warn('⚠️ [Snapshot] Error al consultar snapshot:', snapErr);
  }

  if (snapshotData?.snapshot) {
    try {
      const bytes = Uint8Array.from(window.atob(snapshotData.snapshot), (c) =>
        c.charCodeAt(0)
      );
      Y.applyUpdate(ydoc, bytes, 'remote-snapshot');
      hasBinaryData = true;
      console.log(
        `✅ [Snapshot] Snapshot aplicado exitosamente. Clock base: ${snapshotData.server_clock}, Tamaño: ${bytes.byteLength} bytes`
      );
    } catch (err) {
      console.error('❌ [Snapshot] Error aplicando snapshot binario:', err);
    }
  } else {
    console.log('ℹ️ [Snapshot] No hay snapshot previo consolidado.');
  }

  // 3. Query historical updates newer than the snapshot
  const serverClock = snapshotData?.server_clock || 0;
  console.log(`2️⃣ [Deltas] Consultando note_yjs_updates con id > ${serverClock}...`);

  const { data: updates, error: updateErr } = await supabase
    .from('note_yjs_updates')
    .select('id, update_data')
    .eq('note_id', noteId)
    .gt('id', serverClock)
    .order('id', { ascending: true });

  if (updateErr) {
    console.warn('⚠️ [Deltas] Error al consultar note_yjs_updates:', updateErr);
  }

  let totalDeltasBytes = 0;
  if (updates && updates.length > 0) {
    hasBinaryData = true;
    console.log(`📦 [Deltas] Se encontraron ${updates.length} actualizaciones históricas.`);
    for (const up of updates) {
      try {
        const bytes = Uint8Array.from(window.atob(up.update_data), (c) =>
          c.charCodeAt(0)
        );
        totalDeltasBytes += bytes.byteLength;
        Y.applyUpdate(ydoc, bytes, 'remote-update');
      } catch (err) {
        console.error(`❌ [Deltas] Error aplicando delta update (id: ${up.id}):`, err);
      }
    }
    console.log(
      `✅ [Deltas] ${updates.length} deltas aplicados. Tamaño total acumulado: ${totalDeltasBytes} bytes.`
    );
  } else {
    console.log('ℹ️ [Deltas] No hay deltas adicionales posteriores al snapshot.');
  }

  // 4. Fallback for REST notes or notes without Yjs snapshots: import notes.content
  const pageOrder = ydoc.getArray<string>('pageOrder');
  if (!hasBinaryData && noteRow?.content) {
    console.log('🔄 [REST Fallback] Nota sin snapshots binarios. Importando notes.content...');
    try {
      if (noteRow.content.startsWith('{')) {
        const parsed = JSON.parse(noteRow.content);
        if (Array.isArray(parsed.pages) && parsed.pages.length > 0) {
          const ids: string[] = [];
          for (const p of parsed.pages) {
            const pageId = p.id || crypto.randomUUID();
            ids.push(pageId);
            const frag = ydoc.getXmlFragment(pageId);
            if (p.content) {
              insertHtmlIntoFragment(frag, p.content);
            }
          }
          pageOrder.push(ids);
        }
      } else {
        const initialId = crypto.randomUUID();
        pageOrder.push([initialId]);
        const frag = ydoc.getXmlFragment(initialId);
        insertHtmlIntoFragment(frag, noteRow.content);
      }
    } catch (e) {
      console.warn('⚠️ [REST Fallback] Error parseando content JSON:', e);
    }
  }

  // 5. Determine pageOrder & active page ID
  let allPageIds = pageOrder.toArray();
  if (allPageIds.length === 0) {
    const initialId = crypto.randomUUID();
    pageOrder.push([initialId]);
    allPageIds = [initialId];
    console.log(`📄 [Estructura Yjs] No existían páginas en pageOrder. Se inicializó: ${initialId}`);
  }

  const activePageId = findBestInitialPage(ydoc, allPageIds);
  console.log('3️⃣ [Estructura Yjs] Páginas en pageOrder:', allPageIds, `| Página activa inicial: ${activePageId}`);

  // 6. Read meta map
  const meta = ydoc.getMap('meta');
  let metaTitle = (meta.get('title') as string) || '';
  if (!metaTitle && noteRow?.title) {
    metaTitle = noteRow.title;
    meta.set('title', metaTitle);
  }

  console.log('🏷️ [Estructura Yjs] Meta Map:', {
    title: metaTitle,
    allKeys: Array.from(meta.keys()),
  });

  // 7. Inspect XML Fragment for the selected page
  const fragmentName = resolvePageFragmentName(ydoc, activePageId);
  const fragment = ydoc.getXmlFragment(fragmentName);
  console.log(`📑 [XmlFragment] Fragmento activo "${fragmentName}":`, {
    length: fragment.length,
    preview: fragment.toString().substring(0, 300) || '(vacío)',
  });

  let resolvedSyncMode = syncMode;
  if (syncMode !== 'yjs') {
    try {
      const act = await activateNoteYjsMode(noteId, ydoc);
      if (act.success) {
        resolvedSyncMode = 'yjs';
      }
    } catch (actErr) {
      console.warn('⚠️ [loadYjsNote] Error activando Yjs:', actErr);
    }
  }

  const duration = (performance.now() - startTime).toFixed(1);
  console.log(`⏱️ [Veyra Yjs Loader] Carga completada en ${duration}ms (modo: ${resolvedSyncMode})`);
  console.groupEnd();

  return {
    noteId,
    ydoc,
    awareness,
    activePageId,
    metaTitle,
    syncMode: resolvedSyncMode,
    pageOrder: allPageIds,
    destroy: () => {
      try {
        awareness.destroy();
      } catch (_) { }
      try {
        ydoc.destroy();
      } catch (_) { }
    },
  };
}

/**
 * Converts a Y.XmlText with its delta formatting marks (bold, underline, highlight, etc.)
 * into standard HTML markup.
 */
export function yTextToHtml(yText: Y.XmlText): string {
  try {
    const delta = yText.toDelta();
    let html = '';
    for (const op of delta) {
      if (typeof op.insert !== 'string') continue;
      let chunk = op.insert;
      const attrs = op.attributes || {};
      if (attrs.code) chunk = `<code>${chunk}</code>`;
      if (attrs.bold) chunk = `<strong>${chunk}</strong>`;
      if (attrs.italic) chunk = `<em>${chunk}</em>`;
      if (attrs.underline) chunk = `<u>${chunk}</u>`;
      if (attrs.strike) chunk = `<s>${chunk}</s>`;
      if (attrs.highlight) {
        const color = attrs.highlight.color
          ? ` data-color="${attrs.highlight.color}" style="background-color: ${attrs.highlight.color};"`
          : '';
        chunk = `<mark${color}>${chunk}</mark>`;
      }
      if (attrs.textStyle) {
        const styles: string[] = [];
        if (attrs.textStyle.color) styles.push(`color: ${attrs.textStyle.color}`);
        if (attrs.textStyle.fontSize) styles.push(`font-size: ${attrs.textStyle.fontSize}`);
        if (attrs.textStyle.fontFamily) styles.push(`font-family: ${attrs.textStyle.fontFamily}`);
        if (styles.length > 0) {
          chunk = `<span style="${styles.join('; ')}">${chunk}</span>`;
        }
      }
      if (attrs.link && attrs.link.href) {
        chunk = `<a href="${attrs.link.href}">${chunk}</a>`;
      }
      html += chunk;
    }
    return html;
  } catch {
    return yText.toString();
  }
}

/**
 * Serializes a Y.XmlFragment into standard HTML string for REST persistence.
 */
export function yElementToHtml(el: Y.XmlElement | Y.XmlText): string {
  if (el instanceof Y.XmlText) {
    return yTextToHtml(el);
  }
  if (el instanceof Y.XmlElement) {
    const nodeName = el.nodeName.toLowerCase();
    const childrenHtml = el
      .toArray()
      .map((child) => {
        if (child instanceof Y.XmlElement || child instanceof Y.XmlText) {
          return yElementToHtml(child);
        }
        return '';
      })
      .join('');

    const align = el.getAttribute('textAlign');
    const alignStyle = align ? ` style="text-align: ${align};"` : '';

    if (nodeName === 'paragraph' || nodeName === 'p') {
      return `<p${alignStyle}>${childrenHtml}</p>`;
    }
    if (nodeName === 'heading' || /^h[1-6]$/.test(nodeName)) {
      const level = el.getAttribute('level') || '1';
      return `<h${level}${alignStyle}>${childrenHtml}</h${level}>`;
    }
    if (nodeName === 'bulletlist' || nodeName === 'ul') {
      return `<ul>${childrenHtml}</ul>`;
    }
    if (nodeName === 'orderedlist' || nodeName === 'ol') {
      const start = el.getAttribute('start');
      const startAttr = start && String(start) !== '1' ? ` start="${start}"` : '';
      const listStyle = el.getAttribute('listStyle') || el.getAttribute('data-list-style');
      const styleAttr = listStyle && listStyle !== 'decimal' ? ` data-list-style="${listStyle}"` : '';
      return `<ol${startAttr}${styleAttr}>${childrenHtml}</ol>`;
    }
    if (nodeName === 'listitem' || nodeName === 'li') {
      return `<li>${childrenHtml}</li>`;
    }
    if (nodeName === 'tasklist') {
      return `<ul data-type="taskList">${childrenHtml}</ul>`;
    }
    if (nodeName === 'taskitem') {
      const checked = el.getAttribute('checked') === 'true';
      return `<li data-type="taskItem" data-checked="${checked}">${childrenHtml}</li>`;
    }
    if (nodeName === 'blockquote') {
      return `<blockquote>${childrenHtml}</blockquote>`;
    }
    if (nodeName === 'image' || nodeName === 'img') {
      const src = el.getAttribute('src') || '';
      const alt = el.getAttribute('alt') || '';
      const title = el.getAttribute('title') || '';
      const altAttr = alt ? ` alt="${alt.replace(/"/g, '&quot;')}"` : '';
      const titleAttr = title ? ` title="${title.replace(/"/g, '&quot;')}"` : '';
      return `<img src="${src}"${altAttr}${titleAttr} />`;
    }
    if (nodeName === 'codeblock' || nodeName === 'pre') {
      return `<pre><code>${childrenHtml}</code></pre>`;
    }
    if (nodeName === 'youtube') {
      const id = el.getAttribute('videoId') || '';
      const embed = el.getAttribute('embed') !== 'false' && el.getAttribute('embed') !== null;
      return embed
        ? `<div data-youtube-video data-video-id="${id}" data-embed="true"><iframe loading="lazy" src="https://www.youtube.com/embed/${id}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>`
        : `<div data-youtube-video data-video-id="${id}" data-embed="false"><a href="https://www.youtube.com/watch?v=${id}">https://www.youtube.com/watch?v=${id}</a></div>`;
    }
    if (nodeName === 'mathblock') {
      const latex = el.getAttribute('latex') || '';
      try {
        const katexHtml = katex.renderToString(latex, { displayMode: true, throwOnError: false });
        return `<div class="veyra-math-block" data-type="math-block" data-latex="${latex.replace(/"/g, '&quot;')}">${katexHtml}</div>`;
      } catch {
        return `<div class="veyra-math-block" data-type="math-block">${latex}</div>`;
      }
    }
    if (nodeName === 'mathinline') {
      const latex = el.getAttribute('latex') || '';
      try {
        const katexHtml = katex.renderToString(latex, { displayMode: false, throwOnError: false });
        return `<span class="veyra-math-inline" data-type="math-inline" data-latex="${latex.replace(/"/g, '&quot;')}">${katexHtml}</span>`;
      } catch {
        return `<span class="veyra-math-inline" data-type="math-inline">${latex}</span>`;
      }
    }
    return `<div>${childrenHtml}</div>`;
  }
  return '';
}

export function yFragmentToHtml(frag: Y.XmlFragment): string {
  if (frag.length === 0) return '<p></p>';
  const html = frag
    .toArray()
    .map((child) => {
      if (child instanceof Y.XmlElement || child instanceof Y.XmlText) {
        return yElementToHtml(child);
      }
      return '';
    })
    .join('');
  return html || '<p></p>';
}

/**
 * Persists a local Yjs update to Supabase via RPC append_note_yjs_update
 */
export async function persistYjsUpdate(noteId: string, update: Uint8Array): Promise<string> {
  const base64Update = uint8ArrayToBase64(update);
  const hashHex = await computeSha256(update);
  const clientId = 'web-' + crypto.randomUUID();

  console.log(`💾 [Veyra Yjs RPC] Guardando delta en note_yjs_updates...`, {
    noteId,
    bytes: update.byteLength,
    hash: hashHex.substring(0, 12) + '...',
  });

  try {
    const { data, error } = await supabase.rpc('append_note_yjs_update', {
      p_note_id: noteId,
      p_client_id: clientId,
      p_update_data: base64Update,
      p_update_hash: hashHex,
    });

    if (error) {
      console.error('❌ [Veyra Yjs RPC] Error al ejecutar append_note_yjs_update:', error);
    } else {
      console.log('✅ [Veyra Yjs RPC] Delta persistido con éxito:', data);
    }
  } catch (err) {
    console.error('❌ [Veyra Yjs RPC] Excepción guardando update:', err);
  }

  return base64Update;
}
