import * as Y from 'yjs';
import * as awarenessProtocol from 'y-protocols/awareness';
import katex from 'katex';
import { supabase } from './supabase';
import { uint8ArrayToBase64, computeSha256 } from './crypto-utils';
import { activateNoteYjsMode } from './yjs-activation';
import { IndexeddbPersistence } from 'y-indexeddb';
import { sanitizeRichHtml } from './sanitizeHtml';

export interface YjsLoadedNote {
  noteId: string;
  ydoc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  activePageId: string;
  metaTitle: string;
  syncMode: 'yjs' | 'rest';
  pageOrder: string[];
  highestUpdateId?: number;
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

const BLOCK_TAG_NAMES = new Set([
  'p',
  'div',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'blockquote',
  'pre',
  'table',
  'hr',
  'iframe',
  'img',
]);

function appendInlineParagraph(container: Y.XmlFragment | Y.XmlElement, inlineNodes: Node[]) {
  if (inlineNodes.length === 0) return;
  const hasMeaningfulContent = inlineNodes.some((n) =>
    n.nodeType === Node.TEXT_NODE ? Boolean(n.textContent && n.textContent.trim()) : true
  );
  if (!hasMeaningfulContent) return;

  const p = new Y.XmlElement('paragraph');
  container.push([p]);
  const yText = new Y.XmlText();
  p.push([yText]);
  const deltas: Array<{ insert: string; attributes?: Record<string, any> }> = [];
  for (const inlineNode of inlineNodes) {
    if (inlineNode.nodeType === Node.TEXT_NODE) {
      const text = inlineNode.textContent || '';
      if (text) deltas.push({ insert: text });
    } else if (inlineNode.nodeType === Node.ELEMENT_NODE) {
      const wrapper = document.createElement('span');
      wrapper.appendChild(inlineNode.cloneNode(true));
      deltas.push(...parseInlineNodesToDelta(wrapper));
    }
  }
  if (deltas.length > 0) {
    yText.applyDelta(deltas);
  }
}

function appendTableElement(container: Y.XmlFragment | Y.XmlElement, tableEl: HTMLElement) {
  const rowElements: HTMLTableRowElement[] = [];
  for (const child of Array.from(tableEl.children)) {
    const childTag = child.tagName.toLowerCase();
    if (childTag === 'tr') {
      rowElements.push(child as HTMLTableRowElement);
    } else if (childTag === 'thead' || childTag === 'tbody' || childTag === 'tfoot') {
      for (const tr of Array.from(child.children)) {
        if (tr.tagName.toLowerCase() === 'tr') {
          rowElements.push(tr as HTMLTableRowElement);
        }
      }
    }
  }

  if (rowElements.length === 0) return;

  const yTable = new Y.XmlElement('table');
  const tableStyle = tableEl.getAttribute('data-table-style');
  if (tableStyle && tableStyle !== 'default') {
    yTable.setAttribute('tableStyle', tableStyle);
  }
  const borderColor = tableEl.getAttribute('data-border-color');
  if (borderColor) {
    yTable.setAttribute('borderColor', borderColor);
  }
  const tableAlign = tableEl.getAttribute('data-table-align') || tableEl.getAttribute('align');
  if (tableAlign && tableAlign !== 'left') {
    yTable.setAttribute('tableAlign', tableAlign);
  }

  let hasAnyCell = false;
  for (const trEl of rowElements) {
    const cellElements = Array.from(trEl.children).filter((c) => {
      const t = c.tagName.toLowerCase();
      return t === 'td' || t === 'th';
    }) as HTMLTableCellElement[];

    if (cellElements.length === 0) continue;
    hasAnyCell = true;

    const yRow = new Y.XmlElement('tableRow');
    const rowHeight = trEl.style?.height || trEl.getAttribute('data-row-height');
    if (rowHeight) {
      yRow.setAttribute('height', rowHeight);
    }
    yTable.push([yRow]);

    for (const cellEl of cellElements) {
      const cellType = cellEl.tagName.toLowerCase() === 'th' ? 'tableHeader' : 'tableCell';
      const yCell = new Y.XmlElement(cellType);

      const colspan = parseInt(cellEl.getAttribute('colspan') || '1', 10);
      if (!isNaN(colspan) && colspan > 1) {
        yCell.setAttribute('colspan', colspan);
      }

      const rowspan = parseInt(cellEl.getAttribute('rowspan') || '1', 10);
      if (!isNaN(rowspan) && rowspan > 1) {
        yCell.setAttribute('rowspan', rowspan);
      }

      const colwidthAttr = cellEl.getAttribute('data-colwidth') || cellEl.getAttribute('colwidth');
      if (colwidthAttr) {
        const widths = colwidthAttr
          .split(',')
          .map((w) => parseInt(w.trim(), 10))
          .filter((w) => !isNaN(w) && w > 0);
        if (widths.length > 0) {
          yCell.setAttribute('colwidth', widths);
        }
      }

      const bgColor = cellEl.style?.backgroundColor || cellEl.getAttribute('data-background-color');
      if (bgColor) {
        yCell.setAttribute('backgroundColor', bgColor);
      }

      yRow.push([yCell]);
      insertDomNodesIntoContainer(yCell, Array.from(cellEl.childNodes));

      // ProseMirror tableCell/tableHeader requires at least one block node (block+)
      if (yCell.length === 0) {
        yCell.push([new Y.XmlElement('paragraph')]);
      }
    }
  }

  if (hasAnyCell) {
    container.push([yTable]);
  }
}

function insertDomNodesIntoContainer(container: Y.XmlFragment | Y.XmlElement, childNodes: Node[]) {
  let pendingInlines: Node[] = [];
  const flushInlines = () => {
    if (pendingInlines.length > 0) {
      appendInlineParagraph(container, pendingInlines);
      pendingInlines = [];
    }
  };

  for (const node of childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      pendingInlines.push(node);
      continue;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      continue;
    }

    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (!BLOCK_TAG_NAMES.has(tag)) {
      pendingInlines.push(node);
      continue;
    }

    flushInlines();

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
        container.push([yImg]);
      }
      continue;
    }

    // 2. Horizontal rule: <hr />
    if (tag === 'hr') {
      container.push([new Y.XmlElement('horizontalRule')]);
      continue;
    }

    // 3. Table: <table>...</table>
    if (tag === 'table') {
      appendTableElement(container, el);
      continue;
    }

    // 4. Headings: <h1> - <h6>
    if (/^h[1-6]$/.test(tag)) {
      const level = Math.min(3, Math.max(1, parseInt(tag[1], 10) || 1));
      const h = new Y.XmlElement('heading');
      h.setAttribute('level', String(level));
      const align = el.style.textAlign;
      if (align) h.setAttribute('textAlign', align);
      container.push([h]);
      populateElementWithInlines(h, el);
      continue;
    }

    // 5. Unordered list / Task list
    if (tag === 'ul') {
      const isTaskList = el.getAttribute('data-type') === 'taskList' || el.classList.contains('task-list');
      const listType = isTaskList ? 'taskList' : 'bulletList';
      const yList = new Y.XmlElement(listType);
      container.push([yList]);
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

    // 6. Ordered list
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
      container.push([yList]);
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

    // 7. Blockquote
    if (tag === 'blockquote') {
      const bq = new Y.XmlElement('blockquote');
      container.push([bq]);
      const yP = new Y.XmlElement('paragraph');
      bq.push([yP]);
      populateElementWithInlines(yP, el);
      continue;
    }

    // 8. Code block
    if (tag === 'pre') {
      const cb = new Y.XmlElement('codeBlock');
      container.push([cb]);
      const text = el.textContent || '';
      if (text) {
        const yText = new Y.XmlText(text);
        cb.push([yText]);
      }
      continue;
    }

    // 9. Container with nested tables (e.g. <div><table>...</table></div>)
    if (tag === 'div' && el.querySelector('table')) {
      insertDomNodesIntoContainer(container, Array.from(el.childNodes));
      continue;
    }

    // 10. Paragraph or container that may contain images
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
            container.push([yImg]);
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
            container.push([yImg]);
          }
        } else {
          const p = new Y.XmlElement('paragraph');
          container.push([p]);
          populateElementWithInlines(p, child);
        }
      }
      continue;
    }

    // 11. YouTube iframe or container div
    if (tag === 'iframe') {
      const src = el.getAttribute('src') || '';
      const ytMatch = src.match(/(?:youtube\.com|youtube-nocookie\.com)\/embed\/([a-zA-Z0-9_-]{11})/i);
      if (ytMatch && ytMatch[1]) {
        const yYoutube = new Y.XmlElement('youtube');
        yYoutube.setAttribute('videoId', ytMatch[1]);
        yYoutube.setAttribute('embed', 'true');
        container.push([yYoutube]);
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
        container.push([yYoutube]);
        continue;
      }
    }

    // 12. Math block
    if (
      (tag === 'div' && el.getAttribute('data-type') === 'math-block') ||
      el.classList.contains('veyra-math-block')
    ) {
      const latex = el.getAttribute('data-latex') || el.textContent || '';
      const yMath = new Y.XmlElement('mathBlock');
      yMath.setAttribute('latex', latex);
      container.push([yMath]);
      continue;
    }

    // 13. Standard paragraph / div
    const p = new Y.XmlElement('paragraph');
    const align = el.style.textAlign;
    if (align) p.setAttribute('textAlign', align);
    container.push([p]);
    populateElementWithInlines(p, el);
  }

  flushInlines();
}

/**
 * Inserts HTML or plain text into a Y.XmlFragment (used when importing REST notes).
 * Preserves all rich text formatting: bold, underline, highlight, italic, lists, headings, tables, etc.
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

    insertDomNodesIntoContainer(fragment, childNodes);
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
export async function loadYjsNote(
  noteId: string,
  options?: { signal?: AbortSignal }
): Promise<YjsLoadedNote> {
  const signal = options?.signal;
  console.group(`📝 [Veyra Yjs Loader] Iniciando carga de nota: ${noteId}`);
  const startTime = performance.now();
  const ydoc = new Y.Doc();
  const awareness = new awarenessProtocol.Awareness(ydoc);
  let hasBinaryData = false;

  // 0. Connect local IndexedDB persistence for instant offline restore
  let idbPersistence: IndexeddbPersistence | null = null;
  const cleanup = () => {
    try {
      idbPersistence?.destroy();
    } catch (_) { }
    try {
      awareness.destroy();
    } catch (_) { }
    try {
      ydoc.destroy();
    } catch (_) { }
  };

  const throwIfAborted = () => {
    if (signal?.aborted) {
      cleanup();
      console.groupEnd();
      throw new DOMException('Aborted', 'AbortError');
    }
  };

  if (typeof window !== 'undefined') {
    try {
      idbPersistence = new IndexeddbPersistence(`veyra-yjs-${noteId}`, ydoc);
      await idbPersistence.whenSynced;
      throwIfAborted();
      const cachedPages = ydoc.getArray('pageOrder');
      if (cachedPages.length > 0) {
        hasBinaryData = true;
        console.log(`💾 [yjs-loader] Nota recuperada de IndexedDB local (${cachedPages.length} páginas)`);
      }
    } catch (idbErr: any) {
      if (idbErr?.name === 'AbortError') throw idbErr;
      console.warn('[yjs-loader] IndexedDB initialization failed:', idbErr);
    }
  }

  throwIfAborted();

  // 1. Fetch note row from notes table
  let { data: noteRow, error: noteRowErr } = await supabase
    .from('notes')
    .select('id, title, content, sync_mode')
    .eq('id', noteId)
    .maybeSingle();

  throwIfAborted();

  if (noteRowErr) {
    console.warn('⚠️ [NoteRow] Error al consultar datos de la nota:', noteRowErr);
  }

  if (!noteRow) {
    try {
      const { localDB } = await import('./db/local-db');
      const local = await localDB.notes.get(noteId);
      throwIfAborted();
      if (local) {
        noteRow = {
          id: local.id,
          title: local.title,
          content: local.content,
          sync_mode: (local as any).sync_mode || 'rest',
        };
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') throw e;
      console.warn('⚠️ [NoteRow] Error consultando localDB:', e);
    }
  }

  const syncMode = (noteRow?.sync_mode as 'yjs' | 'rest') || 'rest';

  // 2. Fetch consolidated snapshot
  console.log('1️⃣ [Snapshot] Consultando tabla note_yjs_snapshots...');
  const { data: snapshotData, error: snapErr } = await supabase
    .from('note_yjs_snapshots')
    .select('snapshot, server_clock')
    .eq('note_id', noteId)
    .maybeSingle();

  throwIfAborted();

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

  throwIfAborted();

  if (updateErr) {
    console.warn('⚠️ [Deltas] Error al consultar note_yjs_updates:', updateErr);
  }

  let totalDeltasBytes = 0;
  let highestUpdateId = serverClock;
  if (updates && updates.length > 0) {
    hasBinaryData = true;
    console.log(`📦 [Deltas] Se encontraron ${updates.length} actualizaciones históricas.`);
    for (const up of updates) {
      if (up.id > highestUpdateId) {
        highestUpdateId = up.id;
      }
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
  if (!hasBinaryData && pageOrder.length === 0 && noteRow?.content) {
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
            if (p.content && frag.length === 0) {
              insertHtmlIntoFragment(frag, p.content);
            }
          }
          pageOrder.push(ids);
        }
      } else {
        const initialId = crypto.randomUUID();
        pageOrder.push([initialId]);
        const frag = ydoc.getXmlFragment(initialId);
        if (frag.length === 0) {
          insertHtmlIntoFragment(frag, noteRow.content);
        }
      }
    } catch (e) {
      console.warn('⚠️ [REST Fallback] Error parseando content JSON:', e);
    }
  }

  // 5. Determine pageOrder & active page ID (deduplicating if corrupted)
  const rawPageIds = pageOrder.toArray();
  const uniquePageIds: string[] = [];
  const seenPageIds = new Set<string>();
  for (const pid of rawPageIds) {
    if (!seenPageIds.has(pid)) {
      seenPageIds.add(pid);
      uniquePageIds.push(pid);
    }
  }

  if (uniquePageIds.length !== rawPageIds.length) {
    console.warn(`🧹 [yjs-loader] pageOrder contenía duplicados (${rawPageIds.length} -> ${uniquePageIds.length}). Limpiando...`);
    ydoc.transact(() => {
      while (pageOrder.length > 0) {
        pageOrder.delete(0, 1);
      }
      pageOrder.insert(0, uniquePageIds);
    }, 'dedup-page-order');
  }

  let allPageIds = uniquePageIds;
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
    // Activar modo Yjs de manera asíncrona en segundo plano sin bloquear la apertura de la nota
    activateNoteYjsMode(noteId, ydoc)
      .then((act) => {
        if (act.success) {
          console.log(`✅ [loadYjsNote] Nota ${noteId} promovida a modo Yjs en background`);
        } else {
          console.warn(`ℹ️ [loadYjsNote] Activación Yjs diferida para ${noteId}:`, act.error);
        }
      })
      .catch((actErr) => {
        console.warn('⚠️ [loadYjsNote] Error activando Yjs en background:', actErr);
      });
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
    highestUpdateId,
    destroy: () => {
      try {
        idbPersistence?.destroy();
      } catch (_) { }
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
      const width = el.getAttribute('width');
      const textAlign = el.getAttribute('textAlign');
      const caption = el.getAttribute('caption');
      const altAttr = alt ? ` alt="${alt.replace(/"/g, '&quot;')}"` : '';
      const titleAttr = title ? ` title="${title.replace(/"/g, '&quot;')}"` : '';
      const dataWidthAttr = width ? ` data-width="${width}"` : '';
      const dataCaptionAttr = caption ? ` data-caption="${caption.replace(/"/g, '&quot;')}"` : '';
      const styleParts: string[] = [];
      if (width) {
        styleParts.push(`width: ${width}%;`);
      }
      if (textAlign) {
        styleParts.push(`text-align: ${textAlign};`);
      }
      const styleAttr = styleParts.length > 0 ? ` style="${styleParts.join(' ')}"` : '';
      return `<img src="${src}"${altAttr}${titleAttr}${dataWidthAttr}${dataCaptionAttr}${styleAttr} />`;
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
    if (nodeName === 'table') {
      const tableAttrs: string[] = ['class="veyra-table"'];
      const tableStyle = el.getAttribute('tableStyle');
      if (tableStyle && tableStyle !== 'default') {
        tableAttrs.push(`data-table-style="${String(tableStyle).replace(/"/g, '&quot;')}"`);
      }
      const borderColor = el.getAttribute('borderColor');
      if (borderColor) {
        const safeColor = String(borderColor).replace(/"/g, '&quot;');
        tableAttrs.push(`data-border-color="${safeColor}"`);
        tableAttrs.push(`style="--table-custom-border: ${safeColor};"`);
      }
      const tableAlign = el.getAttribute('tableAlign');
      if (tableAlign) {
        const safeAlign = String(tableAlign).replace(/"/g, '&quot;');
        tableAttrs.push(`data-table-align="${safeAlign}"`);
        tableAttrs.push(`align="${safeAlign}"`);
      }
      return `<table ${tableAttrs.join(' ')}><tbody>${childrenHtml}</tbody></table>`;
    }
    if (nodeName === 'tablerow' || nodeName === 'tr') {
      const height = el.getAttribute('height');
      const rowAttrs = height
        ? ` data-row-height="${String(height).replace(/"/g, '&quot;')}" style="height: ${String(height).replace(/"/g, '&quot;')};"`
        : '';
      return `<tr${rowAttrs}>${childrenHtml}</tr>`;
    }
    if (nodeName === 'tableheader' || nodeName === 'th' || nodeName === 'tablecell' || nodeName === 'td') {
      const tag = nodeName === 'tableheader' || nodeName === 'th' ? 'th' : 'td';
      const cellAttrs: string[] = [];
      const colspan = Number(el.getAttribute('colspan'));
      if (!isNaN(colspan) && colspan > 1) cellAttrs.push(`colspan="${colspan}"`);
      const rowspan = Number(el.getAttribute('rowspan'));
      if (!isNaN(rowspan) && rowspan > 1) cellAttrs.push(`rowspan="${rowspan}"`);
      const colwidth = el.getAttribute('colwidth');
      if (Array.isArray(colwidth) && colwidth.length > 0) {
        cellAttrs.push(`data-colwidth="${colwidth.join(',')}"`);
      }
      const bg = el.getAttribute('backgroundColor');
      if (bg) {
        const safeBg = String(bg).replace(/"/g, '&quot;');
        cellAttrs.push(`data-background-color="${safeBg}"`);
        cellAttrs.push(`style="background-color: ${safeBg};"`);
      }
      const attrStr = cellAttrs.length > 0 ? ` ${cellAttrs.join(' ')}` : '';
      return `<${tag}${attrStr}>${childrenHtml}</${tag}>`;
    }
    if (nodeName === 'horizontalrule' || nodeName === 'hr') {
      return '<hr />';
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
  return sanitizeRichHtml(html) || '<p></p>';
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
