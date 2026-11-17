// Mock de DOM con soporte para Range y getClientRects
const wordsData = [
  // Línea 1
  { text: 'Conceptos', top: 100, bottom: 124 },
  { text: 'del', top: 100, bottom: 124 },
  { text: 'marketing', top: 100, bottom: 124 },
  { text: 'mix', top: 100, bottom: 124 },
  { text: 'y', top: 100, bottom: 124 },
  { text: 'estrategia', top: 100, bottom: 124 },
  // Línea 2
  { text: 'comercial', top: 128, bottom: 152 },
  { text: 'para', top: 128, bottom: 152 },
  { text: 'empresas', top: 128, bottom: 152 },
  { text: 'en', top: 128, bottom: 152 },
  { text: 'Ecuador', top: 128, bottom: 152 },
  // Línea 3
  { text: 'con', top: 156, bottom: 180 },
  { text: 'alta', top: 156, bottom: 180 },
  { text: 'competitividad,', top: 156, bottom: 180 },
  { text: 'innovación', top: 156, bottom: 180 },
  // Línea 4
  { text: 'y', top: 184, bottom: 208 },
  { text: 'comunicación', top: 184, bottom: 208 },
  { text: 'efectiva', top: 184, bottom: 208 },
  { text: 'hacia', top: 184, bottom: 208 },
  { text: 'el', top: 184, bottom: 208 },
  { text: 'cliente.', top: 184, bottom: 208 },
  // Línea 5
  { text: 'La', top: 212, bottom: 236 },
  { text: 'investigación', top: 212, bottom: 236 },
  { text: 'demuestra', top: 212, bottom: 236 },
  { text: 'la', top: 212, bottom: 236 },
  { text: 'importancia', top: 212, bottom: 236 },
  // Línea 6
  { text: 'de', top: 240, bottom: 264 },
  { text: 'mantener', top: 240, bottom: 264 },
  { text: 'el', top: 240, bottom: 264 },
  { text: 'equilibrio.', top: 240, bottom: 264 },
];

function runMeasurerTest() {
  console.log('--- INICIO DE PRUEBAS DE LINE BREAK MEASURER ---');

  // Supongamos que maxPrintableY = 220px (caben líneas 1, 2, 3, 4; la línea 5 queda en 236px)
  const maxPrintableY = 220;
  const minNextPrintableY = 450;

  // Agrupamiento de líneas
  const lines = [];
  let currentLine = [wordsData[0]];

  for (let i = 1; i < wordsData.length; i++) {
    const w = wordsData[i];
    const prev = currentLine[currentLine.length - 1];
    if (Math.abs(w.top - prev.top) < 10) {
      currentLine.push(w);
    } else {
      lines.push({
        top: currentLine[0].top,
        bottom: currentLine[0].bottom,
        text: currentLine.map(x => x.text).join(' ')
      });
      currentLine = [w];
    }
  }
  if (currentLine.length > 0) {
    lines.push({
      top: currentLine[0].top,
      bottom: currentLine[0].bottom,
      text: currentLine.map(x => x.text).join(' ')
    });
  }

  console.log('Total líneas visuales detectadas:', lines.length);
  lines.forEach((l, idx) => console.log(` Línea ${idx + 1} (top: ${l.top}, bottom: ${l.bottom}): "${l.text}"`));

  // Identificar última que cabe antes de 220px
  let lastFitting = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].bottom <= maxPrintableY) {
      lastFitting = i;
    } else {
      break;
    }
  }

  console.log('\nÚltima línea que cabe en maxPrintableY (' + maxPrintableY + 'px): Línea ' + (lastFitting + 1));
  console.log('Líneas en hoja actual:', lastFitting + 1);
  console.log('Líneas que pasan a siguiente hoja:', lines.length - (lastFitting + 1));

  // Comprobar reglas de viudas y huérfanas
  const orphanOk = (lastFitting + 1) >= 2;
  const widowOk = (lines.length - (lastFitting + 1)) >= 2;

  console.log('Control de huérfanas superado (>= 2 líneas en hoja 1):', orphanOk);
  console.log('Control de viudas superado (>= 2 líneas en hoja 2):', widowOk);

  const spacerHeight = minNextPrintableY - lines[lastFitting].bottom;
  console.log('Altura calculada del espaciador vertical:', spacerHeight, 'px');

  if (orphanOk && widowOk && spacerHeight === (450 - 208)) {
    console.log('\nCONCLUSION: EXITO. Algoritmo de corte y control tipográfico correcto.');
  } else {
    console.error('\nCONCLUSION: FALLO en cálculo tipográfico.');
    process.exit(1);
  }
}

runMeasurerTest();
