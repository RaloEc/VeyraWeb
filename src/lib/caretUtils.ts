/**
 * Utility to calculate the pixel coordinates of a caret or character position
 * inside an HTMLInputElement or HTMLTextAreaElement.
 * Based on the mirror-div technique used by textarea-caret.
 */

const PROPERTIES = [
  'direction',
  'boxSizing',
  'width',
  'height',
  'overflowX',
  'overflowY',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderStyle',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'fontStyle',
  'fontVariant',
  'fontWeight',
  'fontStretch',
  'fontSize',
  'fontSizeAdjust',
  'lineHeight',
  'fontFamily',
  'textAlign',
  'textTransform',
  'textIndent',
  'textDecoration',
  'letterSpacing',
  'wordSpacing',
  'tabSize',
  'MozTabSize',
] as const;

export interface CaretCoordinates {
  top: number;
  left: number;
  height: number;
}

let mirrorDiv: HTMLDivElement | null = null;

function getMirrorDiv(): HTMLDivElement {
  if (!mirrorDiv && typeof document !== 'undefined') {
    mirrorDiv = document.createElement('div');
    mirrorDiv.id = 'input-textarea-caret-position-mirror';
    document.body.appendChild(mirrorDiv);
  }
  return mirrorDiv!;
}

export function getCaretCoordinates(
  element: HTMLInputElement | HTMLTextAreaElement,
  position: number
): CaretCoordinates | null {
  if (typeof window === 'undefined' || !element) {
    return null;
  }

  const mirror = getMirrorDiv();
  if (!mirror) return null;

  const isInput = element.nodeName === 'INPUT';
  const computed = window.getComputedStyle(element);

  // Position mirror off-screen
  mirror.style.position = 'absolute';
  mirror.style.top = '0px';
  mirror.style.left = '-9999px';
  mirror.style.visibility = 'hidden';
  mirror.style.pointerEvents = 'none';
  mirror.style.whiteSpace = isInput ? 'pre' : 'pre-wrap';
  mirror.style.wordWrap = isInput ? 'normal' : 'break-word';

  // Transfer relevant styles
  PROPERTIES.forEach((prop) => {
    // @ts-ignore
    mirror.style[prop] = computed[prop];
  });

  // Clear previous content
  mirror.textContent = '';

  // Up to the target position
  const textBefore = element.value.substring(0, position);
  mirror.textContent = textBefore;

  // Target character marker
  const span = document.createElement('span');
  span.textContent = element.value.charAt(position) || '#';
  mirror.appendChild(span);

  const parsedLineHeight = parseInt(computed.lineHeight || '', 10);
  const parsedFontSize = parseInt(computed.fontSize || '', 10);
  const fallbackHeight = !isNaN(parsedLineHeight)
    ? parsedLineHeight
    : !isNaN(parsedFontSize)
    ? Math.round(parsedFontSize * 1.25)
    : 20;

  const coordinates: CaretCoordinates = {
    top: span.offsetTop - element.scrollTop,
    left: span.offsetLeft - element.scrollLeft,
    height: span.offsetHeight || fallbackHeight,
  };

  return coordinates;
}

