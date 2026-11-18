const assert = require('assert');

// Test de lógica matemática y algorítmica para división de párrafos multi-hoja
function testMultiSheetParagraphSplit() {
  console.log('--- INICIO DE PRUEBAS DE DIVISION MULTI-HOJA ---');

  const A4_HEIGHT_PX = 1123;
  const GAP_PX = 40;
  const STRIDE = A4_HEIGHT_PX + GAP_PX; // 1163
  const marginTopPx = 36;
  const marginBottomPx = 36;
  const lineHeight = 28;

  // Generamos un párrafo de 90 líneas (cada línea mide 28px)
  // En Hoja 1 caben: (1087 - 36) / 28 = ~37 líneas
  // En Hoja 2 caben: (1087 - 36) / 28 = ~37 líneas
  // En Hoja 3 van las restantes ~16 líneas
  const totalLines = 90;
  const lines = [];
  let currentY = marginTopPx;
  for (let i = 0; i < totalLines; i++) {
    lines.push({
      top: currentY,
      bottom: currentY + lineHeight,
      index: i,
    });
    currentY += lineHeight;
  }

  console.log(`Total líneas generadas: ${lines.length}`);
  console.log(`Fondo natural de la última línea: ${lines[lines.length - 1].bottom}px`);

  const candidates = [];
  let currentLineIdx = 0;
  let cumulativeSpacer = 0;
  let currSheet = 0;

  while (currentLineIdx < lines.length) {
    const currMaxPrintableY = currSheet * STRIDE + A4_HEIGHT_PX - marginBottomPx;
    const nextMinPrintableY = (currSheet + 1) * STRIDE + marginTopPx;

    const lastLineRenderedBottom = lines[lines.length - 1].bottom + cumulativeSpacer;
    if (lastLineRenderedBottom <= currMaxPrintableY) {
      break;
    }

    let lastFittingIdx = -1;
    for (let i = currentLineIdx; i < lines.length; i++) {
      const renderedBottom = lines[i].bottom + cumulativeSpacer;
      if (renderedBottom <= currMaxPrintableY) {
        lastFittingIdx = i;
      } else {
        break;
      }
    }

    const linesOnCurrSheet = lastFittingIdx >= currentLineIdx ? lastFittingIdx - currentLineIdx + 1 : 0;
    assert(linesOnCurrSheet >= 2, 'Debe cumplir control de huérfanas (>= 2 líneas)');

    const remainingLinesAfterFit = lines.length - (lastFittingIdx + 1);
    if (remainingLinesAfterFit === 1 && linesOnCurrSheet > 2) {
      lastFittingIdx -= 1;
    }

    const splitLine = lines[lastFittingIdx];
    const splitLineRenderedBottom = splitLine.bottom + cumulativeSpacer;
    const spacerHeight = Math.max(0, Math.round(nextMinPrintableY - splitLineRenderedBottom));

    candidates.push({
      sheetIndex: currSheet,
      splitLineIdx: lastFittingIdx,
      spacerHeight,
      renderedBottomBeforeSpacer: splitLineRenderedBottom,
      nextSheetStart: nextMinPrintableY,
    });

    cumulativeSpacer += spacerHeight;
    currentLineIdx = lastFittingIdx + 1;
    currSheet += 1;
  }

  console.log(`Cortes generados: ${candidates.length}`);
  candidates.forEach((c, idx) => {
    console.log(` Corte ${idx + 1} (Hoja ${c.sheetIndex + 1} -> Hoja ${c.sheetIndex + 2}):`);
    console.log(`   Línea de corte: ${c.splitLineIdx + 1}`);
    console.log(`   Fondo renderizado antes del salto: ${c.renderedBottomBeforeSpacer}px`);
    console.log(`   Altura del espaciador: ${c.spacerHeight}px`);
    console.log(`   Inicio exacto de la siguiente hoja: ${c.nextSheetStart}px`);
    assert.strictEqual(
      c.renderedBottomBeforeSpacer + c.spacerHeight,
      c.nextSheetStart,
      'El espaciador debe alinear exactamente la siguiente línea con el inicio del área imprimible'
    );
  });

  assert.strictEqual(candidates.length, 2, 'Un párrafo de 90 líneas debe generar exactamente 2 cortes para 3 hojas');
  assert.strictEqual(currSheet, 2, 'La última hoja debe ser Hoja 3 (índice 2)');

  console.log('\nCONCLUSION: EXITO TOTAL. Algoritmo multi-hoja divide limpiamente a través de Hoja 1, Hoja 2 y Hoja 3.');
}

testMultiSheetParagraphSplit();
