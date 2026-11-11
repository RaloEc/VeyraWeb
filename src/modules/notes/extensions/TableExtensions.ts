import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table';
import type { Editor } from '@tiptap/core';
import { selectedRect, CellSelection, mergeCells } from '@tiptap/pm/tables';
import { Plugin, PluginKey } from '@tiptap/pm/state';

export const CustomTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          element.style.backgroundColor || element.getAttribute('data-background-color') || null,
        renderHTML: (attributes: Record<string, any>) => {
          if (!attributes.backgroundColor) {
            return {};
          }
          return {
            style: `background-color: ${attributes.backgroundColor};`,
            'data-background-color': attributes.backgroundColor,
          };
        },
      },
    };
  },
});

export const CustomTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          element.style.backgroundColor || element.getAttribute('data-background-color') || null,
        renderHTML: (attributes: Record<string, any>) => {
          if (!attributes.backgroundColor) {
            return {};
          }
          return {
            style: `background-color: ${attributes.backgroundColor};`,
            'data-background-color': attributes.backgroundColor,
          };
        },
      },
    };
  },
});

export const CustomTableRow = TableRow.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      height: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          element.style.height || element.getAttribute('data-row-height') || null,
        renderHTML: (attributes: Record<string, any>) => {
          if (!attributes.height) {
            return {};
          }
          return {
            style: `height: ${attributes.height};`,
            'data-row-height': attributes.height,
          };
        },
      },
    };
  },
});

export const rowResizingPluginKey = new PluginKey('rowResizing');

/**
 * Plugin de ProseMirror que permite arrastrar el borde inferior de una fila
 * para ajustar su altura arriba y abajo (Row Resizing).
 */
export function createRowResizingPlugin() {
  let activeHandle: {
    trElement: HTMLTableRowElement;
    rowPos: number;
    startHeight: number;
    startY: number;
  } | null = null;

  let indicatorLine: HTMLDivElement | null = null;
  let hoveredTr: HTMLTableRowElement | null = null;

  function ensureIndicator() {
    if (!indicatorLine) {
      indicatorLine = document.createElement('div');
      indicatorLine.className = 'veyra-row-resize-guide';
      indicatorLine.style.position = 'fixed';
      indicatorLine.style.height = '2px';
      indicatorLine.style.backgroundColor = 'var(--accent-primary, #6366f1)';
      indicatorLine.style.zIndex = '99999';
      indicatorLine.style.pointerEvents = 'none';
      indicatorLine.style.display = 'none';
      document.body.appendChild(indicatorLine);
    }
    return indicatorLine;
  }

  function getTargetRowFromEvent(view: any, event: MouseEvent): { tr: HTMLTableRowElement; rowPos: number } | null {
    const target = event.target as HTMLElement | null;
    if (!target) return null;

    const cell = target.closest('td, th') as HTMLTableCellElement | null;
    if (!cell) return null;

    const table = cell.closest('table.veyra-table');
    if (!table) return null;

    const tr = cell.closest('tr') as HTMLTableRowElement | null;
    if (!tr) return null;

    const rect = cell.getBoundingClientRect();
    // Prioridad al redimensionador de columna si está en la esquina derecha
    if (event.clientX >= rect.right - 8) return null;

    // Detecta si está cerca del borde inferior (área táctil de 8px)
    const isNearBottom = event.clientY >= rect.bottom - 6 && event.clientY <= rect.bottom + 4;
    if (!isNearBottom) return null;

    try {
      const pos = view.posAtDOM(tr, 0);
      const $pos = view.state.doc.resolve(pos);
      for (let d = $pos.depth; d >= 0; d--) {
        if ($pos.node(d).type.name === 'tableRow') {
          return { tr, rowPos: $pos.before(d) };
        }
      }
    } catch {
      return null;
    }
    return null;
  }

  return new Plugin({
    key: rowResizingPluginKey,
    props: {
      handleDOMEvents: {
        mousemove(view, event) {
          if (activeHandle) return false;
          if (!view.editable) return false;

          const rowInfo = getTargetRowFromEvent(view, event);
          if (rowInfo) {
            hoveredTr = rowInfo.tr;
            document.body.style.cursor = 'row-resize';
          } else if (hoveredTr) {
            hoveredTr = null;
            document.body.style.cursor = '';
          }
          return false;
        },
        mouseleave() {
          if (!activeHandle && hoveredTr) {
            hoveredTr = null;
            document.body.style.cursor = '';
          }
          return false;
        },
        mousedown(view, event) {
          if (!view.editable || event.button !== 0) return false;

          const rowInfo = getTargetRowFromEvent(view, event);
          if (!rowInfo) return false;

          const { tr, rowPos } = rowInfo;
          const rect = tr.getBoundingClientRect();
          const startHeight = rect.height;
          const startY = event.clientY;

          activeHandle = {
            trElement: tr,
            rowPos,
            startHeight,
            startY,
          };

          const indicator = ensureIndicator();
          indicator.style.display = 'block';
          indicator.style.top = `${rect.bottom}px`;
          indicator.style.left = `${rect.left}px`;
          indicator.style.width = `${rect.width}px`;

          document.body.style.cursor = 'row-resize';
          document.body.style.userSelect = 'none';

          const onWindowMouseMove = (e: MouseEvent) => {
            if (!activeHandle) return;
            const deltaY = e.clientY - activeHandle.startY;
            // El mínimo es justo el tamaño necesario para el texto (~24px)
            const minHeight = 24;
            const newHeight = Math.max(minHeight, activeHandle.startHeight + deltaY);

            activeHandle.trElement.style.height = `${newHeight}px`;

            const curRect = activeHandle.trElement.getBoundingClientRect();
            indicator.style.top = `${curRect.bottom}px`;
            indicator.style.left = `${curRect.left}px`;
            indicator.style.width = `${curRect.width}px`;
          };

          const onWindowMouseUp = (e: MouseEvent) => {
            window.removeEventListener('mousemove', onWindowMouseMove);
            window.removeEventListener('mouseup', onWindowMouseUp);

            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            indicator.style.display = 'none';

            if (!activeHandle) return;

            const deltaY = e.clientY - activeHandle.startY;
            const minHeight = 24;
            const newHeight = Math.max(minHeight, Math.round(activeHandle.startHeight + deltaY));

            const { rowPos } = activeHandle;
            activeHandle = null;
            hoveredTr = null;

            try {
              const node = view.state.doc.nodeAt(rowPos);
              if (node && node.type.name === 'tableRow') {
                // Si la altura se reduce al mínimo natural (<= 28px), se limpia el atributo para que sea auto
                const heightAttr = newHeight <= 28 ? null : `${newHeight}px`;
                const trTx = view.state.tr.setNodeMarkup(rowPos, null, {
                  ...node.attrs,
                  height: heightAttr,
                });
                view.dispatch(trTx);
              }
            } catch (err) {
              console.error('Error aplicando altura de fila:', err);
            }
          };

          window.addEventListener('mousemove', onWindowMouseMove);
          window.addEventListener('mouseup', onWindowMouseUp);

          event.preventDefault();
          return true;
        },
      },
    },
  });
}

export const CustomTable = Table.extend({
  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      'Mod-Enter': () => {
        if (this.editor.isActive('table')) {
          return this.editor.commands.addRowAfter();
        }
        return false;
      },
      'Shift-Enter': () => {
        if (this.editor.isActive('table')) {
          return this.editor.commands.addRowAfter();
        }
        return false;
      },
    };
  },
  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() || []),
      createRowResizingPlugin(),
    ];
  },
}).configure({
  resizable: true,
  HTMLAttributes: {
    class: 'veyra-table',
  },
});

/**
 * Obtiene información detallada sobre el estado de la celda y selección actual en la tabla.
 */
export function getTableSelectionInfo(editor: Editor | null) {
  if (!editor || !editor.isActive('table')) {
    return {
      isInTable: false,
      isCellSelection: false,
      canMergeSelection: false,
      canMergeRight: false,
      canMergeBelow: false,
      canSplit: false,
      isMergedCell: false,
      colspan: 1,
      rowspan: 1,
    };
  }

  const { state } = editor.view;
  const sel = state.selection;
  const isCellSelection = sel instanceof CellSelection;

  let canMergeSelection = false;
  let canMergeRight = false;
  let canMergeBelow = false;
  let canSplit = false;
  let isMergedCell = false;
  let colspan = 1;
  let rowspan = 1;

  try {
    canMergeSelection = isCellSelection && sel.$anchorCell.pos !== sel.$headCell.pos && editor.can().mergeCells();
    canSplit = editor.can().splitCell();

    const rect = selectedRect(state);
    const { map } = rect;

    colspan = rect.right - rect.left;
    rowspan = rect.bottom - rect.top;

    if (colspan > 1 || rowspan > 1) {
      isMergedCell = true;
    }

    if (rect.right < map.width) {
      canMergeRight = true;
    }

    if (rect.bottom < map.height) {
      canMergeBelow = true;
    }
  } catch {
    // Si la selección no se encuentra en un rectángulo de tabla válido
  }

  return {
    isInTable: true,
    isCellSelection,
    canMergeSelection,
    canMergeRight,
    canMergeBelow,
    canSplit,
    isMergedCell,
    colspan,
    rowspan,
  };
}

/**
 * Combina la celda actual con la celda situada inmediatamente a su derecha.
 */
export function mergeWithRightCell(editor: Editor): boolean {
  if (!editor) return false;
  const { state, dispatch } = editor.view;
  try {
    const rect = selectedRect(state);
    const { map, table, tableStart } = rect;
    if (rect.right >= map.width) return false;

    const anchorPos = tableStart + map.positionAt(rect.top, rect.left, table);
    const targetPos = tableStart + map.positionAt(rect.top, rect.right, table);

    const sel = CellSelection.create(state.doc, anchorPos, targetPos);
    const tr = state.tr.setSelection(sel);
    const nextState = state.apply(tr);
    return mergeCells(nextState, dispatch);
  } catch (err) {
    console.error('Error al combinar con celda derecha:', err);
    return false;
  }
}

/**
 * Combina la celda actual con la celda situada inmediatamente debajo.
 */
export function mergeWithBelowCell(editor: Editor): boolean {
  if (!editor) return false;
  const { state, dispatch } = editor.view;
  try {
    const rect = selectedRect(state);
    const { map, table, tableStart } = rect;
    if (rect.bottom >= map.height) return false;

    const anchorPos = tableStart + map.positionAt(rect.top, rect.left, table);
    const targetPos = tableStart + map.positionAt(rect.bottom, rect.left, table);

    const sel = CellSelection.create(state.doc, anchorPos, targetPos);
    const tr = state.tr.setSelection(sel);
    const nextState = state.apply(tr);
    return mergeCells(nextState, dispatch);
  } catch (err) {
    console.error('Error al combinar con celda inferior:', err);
    return false;
  }
}
