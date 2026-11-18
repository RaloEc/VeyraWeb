import type { DecorationSet } from '@tiptap/pm/view';

export interface MeasuredVisualLine {
  top: number;
  bottom: number;
  firstNode: Node;
  firstOffset: number;
  lastNode: Node;
  lastOffset: number;
  text: string;
}

export interface ParagraphSplitCandidate {
  pos: number;
  spacerHeight: number;
  totalLines: number;
  linesOnCurrentSheet: number;
  linesOnNextSheet: number;
  sheetIndex: number;
}

export interface ParagraphMeasurementResult {
  candidate: ParagraphSplitCandidate | null;
  candidates?: ParagraphSplitCandidate[];
  shouldPushWholeBlock: boolean;
  totalLines: number;
}

export interface A4VirtualBreakWidgetSpec {
  pos: number;
  spacerHeight: number;
  sheetIndex: number;
  key: string;
}

export interface A4PaginationPluginState {
  breaks: A4VirtualBreakWidgetSpec[];
  enabled: boolean;
  decorations: DecorationSet;
}
