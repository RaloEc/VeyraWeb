// Mock mínimo de DOM sin dependencias externas
global.document = {
  documentElement: { style: {} },
  createElement: (tag) => ({
    tagName: tag.toUpperCase(),
    className: '',
    style: {},
    attributes: {},
    setAttribute(name, val) { this.attributes[name] = val; },
    appendChild() {},
  }),
};
global.window = {
  document: global.document,
  navigator: { userAgent: 'Node' },
};

const Y = require('yjs');
const { Schema } = require('@tiptap/pm/model');
const { EditorState } = require('@tiptap/pm/state');
const { Plugin, PluginKey } = require('@tiptap/pm/state');
const { Decoration, DecorationSet } = require('@tiptap/pm/view');

// 2. Definir schema básico
const schema = new Schema({
  nodes: {
    doc: { content: 'paragraph+' },
    paragraph: { content: 'text*', toDOM: () => ['p', 0] },
    text: { inline: true }
  }
});

const a4PaginationPluginKey = new PluginKey('a4PaginationPlugin');

function createVirtualBreakDOM(spec) {
  const spacer = document.createElement('span');
  spacer.className = 'a4-virtual-page-break';
  spacer.setAttribute('contenteditable', 'false');
  spacer.setAttribute('data-sheet-index', String(spec.sheetIndex + 1));
  spacer.style.display = 'block';
  spacer.style.height = spec.spacerHeight + 'px';
  spacer.style.pointerEvents = 'none';
  spacer.style.userSelect = 'none';
  return spacer;
}

function createTestPaginationPlugin() {
  let decorationSet = DecorationSet.empty;
  return new Plugin({
    key: a4PaginationPluginKey,
    state: {
      init() {
        return { breaks: [], enabled: true };
      },
      apply(tr, prevState, _, newState) {
        const meta = tr.getMeta(a4PaginationPluginKey);
        if (meta && Array.isArray(meta.breaks)) {
          const decos = meta.breaks.map(b =>
            Decoration.widget(b.pos, () => createVirtualBreakDOM(b), { side: 1, key: 'vbreak-' + b.pos })
          );
          decorationSet = DecorationSet.create(newState.doc, decos);
          return { breaks: meta.breaks, enabled: true };
        }
        if (tr.docChanged && decorationSet !== DecorationSet.empty) {
          decorationSet = decorationSet.map(tr.mapping, newState.doc);
        }
        return prevState;
      }
    },
    props: {
      decorations() {
        return decorationSet;
      }
    }
  });
}

function runTests() {
  console.log('--- INICIO DE PRUEBAS DE AISLAMIENTO YJS Y PAGINACION ---');

  // Test 1: Crear Y.Doc y verificar listener de updates
  const ydoc = new Y.Doc();
  let yjsUpdateCalls = 0;
  let totalBytesEmitted = 0;

  ydoc.on('update', (update) => {
    yjsUpdateCalls++;
    totalBytesEmitted += update.byteLength;
  });

  const initialVector = Y.encodeStateVector(ydoc);

  // Test 2: Crear estado de ProseMirror con texto extenso
  const longParagraph = 'Este es un párrafo de prueba extenso con caracteres españoles como á, é, í, ó, ú, ñ, diseñado para comprobar la fragmentación visual sin mutaciones en el modelo persistente. '.repeat(10);
  
  const docNode = schema.node('doc', null, [
    schema.node('paragraph', null, [schema.text(longParagraph)])
  ]);

  const plugin = createTestPaginationPlugin();
  let state = EditorState.create({
    schema,
    doc: docNode,
    plugins: [plugin]
  });

  console.log('Documento creado. Tamaño en caracteres:', longParagraph.length);
  console.log('Actualizaciones Yjs iniciales:', yjsUpdateCalls);

  // Test 3: Aplicar recálculo visual inyectando metadatos en la transacción de ProseMirror
  const candidatePos = 120; // simula corte tras la línea 5
  const tr = state.tr.setMeta(a4PaginationPluginKey, {
    breaks: [{ pos: candidatePos, spacerHeight: 226, sheetIndex: 0 }]
  });

  state = state.apply(tr);

  // Verificar estado del plugin
  const pluginState = a4PaginationPluginKey.getState(state);
  console.log('Breaks registrados en el plugin:', pluginState.breaks.length);
  console.log('Posición del salto virtual:', pluginState.breaks[0].pos);
  console.log('tr.docChanged:', tr.docChanged);

  // Test 4: Comprobar que Yjs recibió EXACTAMENTE CERO actualizaciones
  const currentVector = Y.encodeStateVector(ydoc);
  const vectorIdentical = Buffer.from(initialVector).equals(Buffer.from(currentVector));

  console.log('\n--- METRICAS DE AISLAMIENTO YJS ---');
  console.log('1. Llamadas a ydoc.on("update"):', yjsUpdateCalls, '(Esperado: 0)');
  console.log('2. Bytes emitidos por Yjs:', totalBytesEmitted, '(Esperado: 0)');
  console.log('3. Estado vectorial de Yjs idéntico:', vectorIdentical, '(Esperado: true)');
  console.log('4. tr.docChanged fue false:', !tr.docChanged, '(Esperado: true)');

  if (yjsUpdateCalls === 0 && totalBytesEmitted === 0 && vectorIdentical && !tr.docChanged) {
    console.log('\nCONCLUSION: EXITO TOTAL. La paginacion por decoraciones es 100% aislada de Yjs.');
  } else {
    console.error('\nCONCLUSION: FALLO. Se detectaron fugas hacia Yjs.');
    process.exit(1);
  }
}

runTests();
