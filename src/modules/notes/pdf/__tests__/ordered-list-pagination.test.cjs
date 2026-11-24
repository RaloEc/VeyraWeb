const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const TEMPLATE_PATH = path.resolve(__dirname, '../pdfTemplateBuilder.ts');

function extractPaginatorScript() {
  const source = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  const scriptStart = source.indexOf('<script>');
  const scriptEnd = source.indexOf('</script>', scriptStart);
  assert(scriptStart !== -1 && scriptEnd !== -1, 'Could not find inline <script> in pdfTemplateBuilder.ts');

  let script = source.slice(scriptStart + '<script>'.length, scriptEnd);

  const testConfig = {
    paperSizeId: 'a4',
    orientation: 'portrait',
    marginPresetId: 'normal',
    margins: { top: 25, right: 30, bottom: 25, left: 30 },
    fontFamily: 'sans',
    fontSizePt: 10.5,
    lineHeight: 1.7,
    firstLineIndentMm: 0,
    paragraphSpacing: 'normal',
    textAlign: 'left',
    breakBetweenHojas: true,
    includeHeader: false,
    includeHeaderTitle: false,
    includeHeaderDate: false,
    includeFooter: false,
    includePageNumbers: false,
    includeDate: false,
  };

  script = script
    .replace('${JSON.stringify(config)}', JSON.stringify(testConfig))
    .replace('${isForPrint}', 'true')
    .replace('${JSON.stringify(options.headerFooterConfig || null)}', 'null')
    .replace("${JSON.stringify(options.authorName || '')}", JSON.stringify('Test User'))
    .replace('${JSON.stringify(cleanTitle)}', JSON.stringify('Test Note'))
    .replace("'${currentDateFormatted}'", JSON.stringify('23 de noviembre de 2026'));

  return script;
}

class MockElement {
  constructor(tagName, attrs = {}, height = 0) {
    this.tagName = String(tagName).toUpperCase();
    this.attrs = { ...attrs };
    this.children = [];
    this.style = {};
    this.className = attrs.class || '';
    this.textContent = '';
    this._innerHTML = '';
    this.fixedHeight = height;
    this.parentNode = null;
  }

  get childNodes() {
    return this.children;
  }

  get lastElementChild() {
    return this.children.length > 0 ? this.children[this.children.length - 1] : null;
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(val) {
    this._innerHTML = String(val);
    if (this._innerHTML === '') {
      this.children = [];
    }
  }

  hasAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attrs, name);
  }

  getAttribute(name) {
    return this.hasAttribute(name) ? String(this.attrs[name]) : null;
  }

  setAttribute(name, value) {
    this.attrs[name] = String(value);
    if (name === 'class') {
      this.className = String(value);
    }
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }

  cloneNode(deep = false) {
    const cloned = new MockElement(this.tagName, { ...this.attrs }, this.fixedHeight);
    cloned.className = this.className;
    cloned.style = { ...this.style };
    cloned.textContent = this.textContent;
    cloned._innerHTML = this._innerHTML;
    if (deep) {
      for (const child of this.children) {
        cloned.appendChild(child.cloneNode(true));
      }
    }
    return cloned;
  }

  matchesSelector(selector) {
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      return this.className.split(/\s+/).includes(cls);
    }
    return this.tagName.toLowerCase() === selector.toLowerCase();
  }

  querySelectorAll(selector) {
    const results = [];
    const walk = (node) => {
      for (const child of node.children) {
        if (child.matchesSelector(selector)) {
          results.push(child);
        }
        walk(child);
      }
    };
    walk(this);
    return results;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  getContentHeight() {
    if (this.fixedHeight > 0 && this.children.length === 0) {
      return this.fixedHeight;
    }
    let total = 0;
    for (const child of this.children) {
      total += child.getContentHeight();
    }
    return total || this.fixedHeight;
  }

  get scrollHeight() {
    return this.getContentHeight();
  }

  get clientHeight() {
    return this.maxHeight || this.getContentHeight();
  }

  getBoundingClientRect() {
    const h = this.className.split(/\s+/).includes('sheet-body')
      ? this.clientHeight
      : this.getContentHeight();
    return { top: 0, bottom: h, height: h };
  }
}

function runPaginatorWithHojas(hojas, sheetMaxHeight = 80) {
  const script = extractPaginatorScript();

  const rawDoc = new MockElement('div', { id: 'raw-document' });
  for (const hoja of hojas) {
    rawDoc.appendChild(hoja);
  }
  const pagedOutput = new MockElement('div', { id: 'paged-output' });

  const mockDocument = {
    readyState: 'complete',
    images: [],
    fonts: null,
    getElementById(id) {
      if (id === 'raw-document') return rawDoc;
      if (id === 'paged-output') return pagedOutput;
      return null;
    },
    createElement(tag) {
      const el = new MockElement(tag);
      Object.defineProperty(el, 'maxHeight', {
        get() {
          return el.className.split(/\s+/).includes('sheet-body') ? sheetMaxHeight : 0;
        },
        configurable: true,
      });
      return el;
    },
  };

  let postedMessage = null;
  const mockWindow = {
    parent: {
      postMessage(msg) {
        postedMessage = msg;
      },
    },
    addEventListener() {},
  };

  const context = vm.createContext({
    document: mockDocument,
    window: mockWindow,
    Array,
    Intl,
    Math,
    Number,
    String,
    parseInt,
    isNaN,
    Date,
    console,
  });

  vm.runInContext(script, context);
  assert.strictEqual(mockWindow.__veyra_pagination_ready, true, 'Paginator should mark ready');

  const sheets = pagedOutput.querySelectorAll('.pdf-page-sheet');
  return { sheets, postedMessage };
}

function makeItem(tag, text, height = 10, attrs = {}) {
  const el = new MockElement(tag, attrs, height);
  el.textContent = text;
  return el;
}

function makeHoja(children) {
  const hoja = new MockElement('div', { class: 'raw-hoja' });
  for (const child of children) {
    hoja.appendChild(child);
  }
  return hoja;
}

function testDefaultOrderedListSplitAcrossTwoSheets() {
  const ol = new MockElement('ol');
  for (let i = 1; i <= 11; i++) {
    ol.appendChild(makeItem('li', `Item ${i}`, 10));
  }

  const { sheets, postedMessage } = runPaginatorWithHojas([makeHoja([ol])], 84);
  assert.strictEqual(sheets.length, 2);
  assert.strictEqual(postedMessage.type, 'VEYRA_PDF_PAGES_COUNT');
  assert.strictEqual(postedMessage.count, 2);

  const sheet1Ol = sheets[0].querySelector('ol');
  const sheet2Ol = sheets[1].querySelector('ol');

  assert.strictEqual(sheet1Ol.children.length, 8);
  assert.strictEqual(sheet1Ol.getAttribute('start'), null);
  assert.strictEqual(sheet2Ol.children.length, 3);
  assert.strictEqual(sheet2Ol.getAttribute('start'), '9');
}

function testOrderedListSplitAcrossThreeSheets() {
  const ol = new MockElement('ol');
  for (let i = 1; i <= 19; i++) {
    ol.appendChild(makeItem('li', `Item ${i}`, 10));
  }

  const { sheets } = runPaginatorWithHojas([makeHoja([ol])], 84);
  assert.strictEqual(sheets.length, 3);

  assert.strictEqual(sheets[0].querySelector('ol').children.length, 8);
  assert.strictEqual(sheets[0].querySelector('ol').getAttribute('start'), null);

  assert.strictEqual(sheets[1].querySelector('ol').children.length, 8);
  assert.strictEqual(sheets[1].querySelector('ol').getAttribute('start'), '9');

  assert.strictEqual(sheets[2].querySelector('ol').children.length, 3);
  assert.strictEqual(sheets[2].querySelector('ol').getAttribute('start'), '17');
}

function testCustomStartAndListStylePreserved() {
  const ol = new MockElement('ol', { start: '5', 'data-list-style': 'decimal-paren' });
  for (let i = 0; i < 6; i++) {
    ol.appendChild(makeItem('li', `Item ${5 + i}`, 20));
  }

  const { sheets } = runPaginatorWithHojas([makeHoja([ol])], 84);
  assert.strictEqual(sheets.length, 2);

  const sheet1Ol = sheets[0].querySelector('ol');
  const sheet2Ol = sheets[1].querySelector('ol');

  assert.strictEqual(sheet1Ol.getAttribute('start'), '5');
  assert.strictEqual(sheet1Ol.getAttribute('data-list-style'), 'decimal-paren');
  assert.strictEqual(sheet1Ol.children.length, 4); // 5, 6, 7, 8

  assert.strictEqual(sheet2Ol.getAttribute('start'), '9');
  assert.strictEqual(sheet2Ol.getAttribute('data-list-style'), 'decimal-paren');
  assert.strictEqual(sheet2Ol.children.length, 2); // 9, 10
}

function testFirstItemOverflowDoesNotCorruptStart() {
  const intro = makeItem('p', 'Intro filling sheet 1', 75);
  const ol = new MockElement('ol', { start: '3' });
  for (let i = 0; i < 4; i++) {
    ol.appendChild(makeItem('li', `Item ${3 + i}`, 10));
  }

  const { sheets } = runPaginatorWithHojas([makeHoja([intro, ol])], 84);
  assert.strictEqual(sheets.length, 2);

  assert.strictEqual(sheets[0].querySelector('ol'), null, 'Empty <ol> should be removed from sheet 1');
  const sheet2Ol = sheets[1].querySelector('ol');
  assert(sheet2Ol, 'Sheet 2 should contain the <ol>');
  assert.strictEqual(sheet2Ol.getAttribute('start'), '3');
  assert.strictEqual(sheet2Ol.children.length, 4);
}

function testReversedAndLiValueAttributes() {
  const reversedOl = new MockElement('ol', { reversed: '' });
  for (let i = 0; i < 5; i++) {
    reversedOl.appendChild(makeItem('li', `Rev ${5 - i}`, 20));
  }

  const { sheets: revSheets } = runPaginatorWithHojas([makeHoja([reversedOl])], 64);
  assert.strictEqual(revSheets.length, 2);
  assert.strictEqual(revSheets[0].querySelector('ol').children.length, 3); // 5, 4, 3
  assert.strictEqual(revSheets[1].querySelector('ol').getAttribute('start'), '2');

  const valueOl = new MockElement('ol');
  valueOl.appendChild(makeItem('li', 'One', 20));
  valueOl.appendChild(makeItem('li', 'Twenty', 20, { value: '20' }));
  valueOl.appendChild(makeItem('li', 'Twenty-one', 20));
  valueOl.appendChild(makeItem('li', 'Twenty-two', 20));

  const { sheets: valSheets } = runPaginatorWithHojas([makeHoja([valueOl])], 64);
  assert.strictEqual(valSheets.length, 2);
  assert.strictEqual(valSheets[0].querySelector('ol').children.length, 3); // 1, 20, 21
  assert.strictEqual(valSheets[1].querySelector('ol').getAttribute('start'), '22');
}

function testUnorderedListDoesNotReceiveStartAttribute() {
  const ul = new MockElement('ul');
  for (let i = 1; i <= 10; i++) {
    ul.appendChild(makeItem('li', `Bullet ${i}`, 10));
  }

  const { sheets } = runPaginatorWithHojas([makeHoja([ul])], 84);
  assert.strictEqual(sheets.length, 2);
  assert.strictEqual(sheets[0].querySelector('ul').getAttribute('start'), null);
  assert.strictEqual(sheets[1].querySelector('ul').getAttribute('start'), null);
}

testDefaultOrderedListSplitAcrossTwoSheets();
testOrderedListSplitAcrossThreeSheets();
testCustomStartAndListStylePreserved();
testFirstItemOverflowDoesNotCorruptStart();
testReversedAndLiValueAttributes();
testUnorderedListDoesNotReceiveStartAttribute();

console.log('All ordered-list pagination tests passed!');
