export type TemplateType = 'block' | 'page';
export type TemplateCategory = 'academico' | 'analisis' | 'organizacion' | 'gestion' | 'trabajo' | 'personal';

export interface NoteTemplate {
  id: string;
  title: string;
  category: TemplateCategory;
  categoryLabel: string;
  type: TemplateType;
  description: string;
  iconName: 'table' | 'graduation-cap' | 'clipboard-list' | 'columns-3' | 'calendar' | 'file-text' | 'flask-conical' | 'check-square';
  previewHtml: string;
  getContent: (options?: { userName?: string }) => string;
  isCustom?: boolean;
}

function getTodayFormatted(): string {
  const d = new Date();
  const day = d.getDate();
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export const NOTE_TEMPLATES: NoteTemplate[] = [
  // ==========================================
  // BLOQUES Y TABLAS (type: 'block')
  // ==========================================
  {
    id: 'block-academic-header',
    title: 'Carátula académica / Tarea',
    category: 'academico',
    categoryLabel: 'Académico',
    type: 'block',
    description: 'Encabezado institucional para tareas universitarias con datos del estudiante y materia.',
    iconName: 'graduation-cap',
    previewHtml: `
      <div class="border border-slate-300 dark:border-zinc-700 rounded text-[11px] overflow-hidden">
        <div class="grid grid-cols-4 bg-sky-100 dark:bg-sky-950/60 font-semibold text-center border-b border-slate-300 dark:border-zinc-700 text-sky-900 dark:text-sky-200 py-1">
          <div class="col-span-1 border-r border-slate-300 dark:border-zinc-700">Asignatura</div>
          <div class="col-span-2 border-r border-slate-300 dark:border-zinc-700">Datos del alumno</div>
          <div class="col-span-1">Fecha</div>
        </div>
        <div class="grid grid-cols-4 text-[10px]">
          <div class="col-span-1 p-2 font-bold flex items-center justify-center border-r border-slate-300 dark:border-zinc-700 text-center">
            ASIGNATURA
          </div>
          <div class="col-span-2 border-r border-slate-300 dark:border-zinc-700 divide-y divide-slate-200 dark:divide-zinc-800">
            <div class="grid grid-cols-2 p-1 gap-1">
              <span class="font-medium text-slate-500">Apellidos y nombres</span>
              <span>Estudiante</span>
            </div>
            <div class="grid grid-cols-2 p-1 gap-1">
              <span class="font-medium text-slate-500">Cédula</span>
              <span>1234567890</span>
            </div>
            <div class="grid grid-cols-2 p-1 gap-1">
              <span class="font-medium text-slate-500">Paralelo</span>
              <span>A-1</span>
            </div>
          </div>
          <div class="col-span-1 p-2 flex items-center justify-center text-center">
            ${getTodayFormatted()}
          </div>
        </div>
      </div>
    `,
    getContent: (options) => {
      const studentName = options?.userName?.trim() || 'Apellidos y nombres del alumno';
      const dateStr = getTodayFormatted();

      return `
        <table class="veyra-table" style="width: 100%;">
          <tr>
            <th style="background-color: #dbeafe; text-align: center; font-weight: 700; width: 25%;" data-background-color="#dbeafe"><p><strong>Asignatura</strong></p></th>
            <th colspan="2" style="background-color: #dbeafe; text-align: center; font-weight: 700; width: 55%;" data-background-color="#dbeafe"><p><strong>Datos del alumno</strong></p></th>
            <th style="background-color: #dbeafe; text-align: center; font-weight: 700; width: 20%;" data-background-color="#dbeafe"><p><strong>Fecha</strong></p></th>
          </tr>
          <tr>
            <td rowspan="3" style="text-align: center; font-weight: 700; vertical-align: middle;"><p><strong>ASIGNATURA</strong></p></td>
            <td style="font-weight: 600; width: 28%;"><p><strong>Apellidos y nombres</strong></p></td>
            <td><p>${studentName}</p></td>
            <td rowspan="3" style="text-align: center; vertical-align: middle;"><p>${dateStr}</p></td>
          </tr>
          <tr>
            <td style="font-weight: 600;"><p><strong>Cédula</strong></p></td>
            <td><p>0000000000</p></td>
          </tr>
          <tr>
            <td style="font-weight: 600;"><p><strong>Paralelo</strong></p></td>
            <td><p>PARALELO-1</p></td>
          </tr>
        </table>
        <p></p>
      `;
    },
  },
  {
    id: 'block-comparison-table',
    title: 'Tabla comparativa (Ventajas y Desventajas)',
    category: 'analisis',
    categoryLabel: 'Análisis',
    type: 'block',
    description: 'Tabla estructurada de 3 columnas para evaluar criterios con ventajas y desventajas.',
    iconName: 'columns-3',
    previewHtml: `
      <div class="border border-slate-300 dark:border-zinc-700 rounded text-[11px] overflow-hidden">
        <div class="grid grid-cols-3 bg-slate-100 dark:bg-zinc-800 font-semibold text-center border-b border-slate-300 dark:border-zinc-700 p-1">
          <div>Criterio</div>
          <div class="text-emerald-700 dark:text-emerald-400">Ventajas</div>
          <div class="text-rose-700 dark:text-rose-400">Desventajas</div>
        </div>
        <div class="grid grid-cols-3 p-1.5 border-b border-slate-200 dark:border-zinc-800 text-[10px]">
          <div class="font-medium">Rendimiento</div>
          <div class="text-emerald-600 dark:text-emerald-400">Alta velocidad</div>
          <div class="text-rose-600 dark:text-rose-400">Mayor uso de memoria</div>
        </div>
        <div class="grid grid-cols-3 p-1.5 text-[10px]">
          <div class="font-medium">Facilidad</div>
          <div class="text-emerald-600 dark:text-emerald-400">Curva rápida</div>
          <div class="text-rose-600 dark:text-rose-400">Menos flexibilidad</div>
        </div>
      </div>
    `,
    getContent: () => {
      return `
        <table class="veyra-table" style="width: 100%;">
          <thead>
            <tr>
              <th style="width: 30%;"><p><strong>Criterio</strong></p></th>
              <th style="background-color: #dcfce7; width: 35%;" data-background-color="#dcfce7"><p><strong>Ventajas</strong></p></th>
              <th style="background-color: #fee2e2; width: 35%;" data-background-color="#fee2e2"><p><strong>Desventajas</strong></p></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><p><strong>Rendimiento</strong></p></td>
              <td><p>Alta velocidad de respuesta y menor latencia.</p></td>
              <td><p>Mayor consumo de recursos en memoria.</p></td>
            </tr>
            <tr>
              <td><p><strong>Implementación</strong></p></td>
              <td><p>Curva de aprendizaje sencilla y directa.</p></td>
              <td><p>Requiere configuración inicial manual.</p></td>
            </tr>
            <tr>
              <td><p><strong>Mantenimiento</strong></p></td>
              <td><p>Estructura modular fácil de escalar.</p></td>
              <td><p>Dependencia de librerías externas.</p></td>
            </tr>
          </tbody>
        </table>
        <p></p>
      `;
    },
  },
  {
    id: 'block-deliverables-schedule',
    title: 'Cronograma de entregables y fases',
    category: 'gestion',
    categoryLabel: 'Gestión',
    type: 'block',
    description: 'Tabla compacta para seguimiento de fases, responsables, fechas límites y estado.',
    iconName: 'clipboard-list',
    previewHtml: `
      <div class="border border-slate-300 dark:border-zinc-700 rounded text-[11px] overflow-hidden">
        <div class="grid grid-cols-4 bg-slate-100 dark:bg-zinc-800 font-semibold p-1 border-b border-slate-300 dark:border-zinc-700 text-[10px]">
          <div>Fase / Tarea</div>
          <div>Responsable</div>
          <div>Fecha límite</div>
          <div>Estado</div>
        </div>
        <div class="grid grid-cols-4 p-1 border-b border-slate-200 dark:border-zinc-800 text-[10px]">
          <div>Investigación</div>
          <div>Alex</div>
          <div>${getTodayFormatted()}</div>
          <span class="text-emerald-600 font-medium">Completado</span>
        </div>
        <div class="grid grid-cols-4 p-1 text-[10px]">
          <div>Desarrollo</div>
          <div>Equipo</div>
          <div>En curso</div>
          <span class="text-amber-600 font-medium">En progreso</span>
        </div>
      </div>
    `,
    getContent: () => {
      const dateStr = getTodayFormatted();
      return `
        <table class="veyra-table" style="width: 100%;">
          <thead>
            <tr>
              <th style="width: 35%;"><p><strong>Fase / Entregable</strong></p></th>
              <th style="width: 25%;"><p><strong>Responsable</strong></p></th>
              <th style="width: 20%;"><p><strong>Fecha límite</strong></p></th>
              <th style="width: 20%;"><p><strong>Estado</strong></p></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><p>1. Definición de requerimientos</p></td>
              <td><p>Responsable 1</p></td>
              <td><p>${dateStr}</p></td>
              <td><p>Completado</p></td>
            </tr>
            <tr>
              <td><p>2. Diseño y prototipo</p></td>
              <td><p>Responsable 2</p></td>
              <td><p>Pendiente</p></td>
              <td><p>En progreso</p></td>
            </tr>
            <tr>
              <td><p>3. Pruebas y validación</p></td>
              <td><p>Equipo</p></td>
              <td><p>Pendiente</p></td>
              <td><p>No iniciado</p></td>
            </tr>
          </tbody>
        </table>
        <p></p>
      `;
    },
  },
  {
    id: 'block-summary-callout',
    title: 'Ficha de síntesis y conclusiones',
    category: 'organizacion',
    categoryLabel: 'Organización',
    type: 'block',
    description: 'Caja destacada con objetivo central, puntos clave analizados y decisiones tomadas.',
    iconName: 'check-square',
    previewHtml: `
      <div class="border-l-4 border-sky-500 bg-sky-50/60 dark:bg-sky-950/20 p-2 rounded-r text-[11px] space-y-1">
        <div class="font-bold text-sky-800 dark:text-sky-300">Síntesis ejecutiva</div>
        <div class="text-slate-600 dark:text-zinc-400 text-[10px]">Objetivo: Desarrollar la solución técnica acordada.</div>
        <div class="text-slate-500 text-[9.5px]">• Punto clave 1 validado</div>
        <div class="text-slate-500 text-[9.5px]">• Conclusión principal redactada</div>
      </div>
    `,
    getContent: () => {
      return `
        <blockquote>
          <p><strong>Síntesis y conclusiones clave</strong></p>
          <p><strong>Objetivo central:</strong> Describir brevemente el propósito de esta sección o análisis.</p>
          <p><strong>Hallazgos principales:</strong></p>
          <ul data-type="taskList">
            <li data-checked="false"><label><input type="checkbox"><span></span></label><div><p>Hallazgo o punto crítico 1</p></div></li>
            <li data-checked="false"><label><input type="checkbox"><span></span></label><div><p>Hallazgo o punto crítico 2</p></div></li>
          </ul>
          <p><strong>Decisión / Siguiente paso:</strong> Acción concreta a ejecutar.</p>
        </blockquote>
        <p></p>
      `;
    },
  },

  // ==========================================
  // PÁGINAS COMPLETAS (type: 'page')
  // ==========================================
  {
    id: 'page-academic-assignment',
    title: 'Informe académico / Tarea universitaria',
    category: 'academico',
    categoryLabel: 'Académico',
    type: 'page',
    description: 'Estructura universitaria completa con carátula institucional, objetivos, marco teórico y conclusiones.',
    iconName: 'graduation-cap',
    previewHtml: `
      <div class="border border-slate-300 dark:border-zinc-700 rounded p-2 text-[10px] space-y-2 bg-white dark:bg-zinc-900">
        <div class="h-6 bg-sky-100 dark:bg-sky-950/60 rounded border border-sky-200 dark:border-sky-800 text-[9px] flex items-center justify-center font-bold text-sky-900 dark:text-sky-300">
          Carátula institucional
        </div>
        <div class="font-bold text-xs text-slate-800 dark:text-zinc-100">Título del informe o tarea</div>
        <div class="space-y-1">
          <div class="font-semibold text-slate-600 dark:text-zinc-400">1. Objetivos</div>
          <div class="h-1.5 bg-slate-200 dark:bg-zinc-800 rounded w-3/4"></div>
          <div class="font-semibold text-slate-600 dark:text-zinc-400">2. Desarrollo teórico</div>
          <div class="h-1.5 bg-slate-200 dark:bg-zinc-800 rounded w-full"></div>
          <div class="font-semibold text-slate-600 dark:text-zinc-400">3. Conclusiones</div>
          <div class="h-1.5 bg-slate-200 dark:bg-zinc-800 rounded w-2/3"></div>
        </div>
      </div>
    `,
    getContent: (options) => {
      const studentName = options?.userName?.trim() || 'Apellidos y nombres del alumno';
      const dateStr = getTodayFormatted();

      return `
        <table class="veyra-table" style="width: 100%;">
          <tr>
            <th style="background-color: #dbeafe; text-align: center; font-weight: 700; width: 25%;" data-background-color="#dbeafe"><p><strong>Asignatura</strong></p></th>
            <th colspan="2" style="background-color: #dbeafe; text-align: center; font-weight: 700; width: 55%;" data-background-color="#dbeafe"><p><strong>Datos del alumno</strong></p></th>
            <th style="background-color: #dbeafe; text-align: center; font-weight: 700; width: 20%;" data-background-color="#dbeafe"><p><strong>Fecha</strong></p></th>
          </tr>
          <tr>
            <td rowspan="3" style="text-align: center; font-weight: 700; vertical-align: middle;"><p><strong>ASIGNATURA</strong></p></td>
            <td style="font-weight: 600; width: 28%;"><p><strong>Apellidos y nombres</strong></p></td>
            <td><p>${studentName}</p></td>
            <td rowspan="3" style="text-align: center; vertical-align: middle;"><p>${dateStr}</p></td>
          </tr>
          <tr>
            <td style="font-weight: 600;"><p><strong>Cédula</strong></p></td>
            <td><p>0000000000</p></td>
          </tr>
          <tr>
            <td style="font-weight: 600;"><p><strong>Paralelo</strong></p></td>
            <td><p>PARALELO-1</p></td>
          </tr>
        </table>
        <h1>Título del trabajo o práctica</h1>
        <h2>1. Introducción y objetivos</h2>
        <p>Describa aquí la contextualización del trabajo y los objetivos generales y específicos que se abordarán en este reporte.</p>
        <ul>
          <li><p><strong>Objetivo general:</strong> Analizar e implementar los conceptos desarrollados en la unidad.</p></li>
          <li><p><strong>Objetivo específico:</strong> Resolver los ejercicios prácticos propuestos con rigurosidad conceptual.</p></li>
        </ul>
        <h2>2. Desarrollo conceptual y metodológico</h2>
        <p>Explique el procedimiento, desarrollo de ejercicios, fórmulas aplicadas o diagramas explicativos correspondientes.</p>
        <h2>3. Resultados obtenidos</h2>
        <p>Detalle los resultados alcanzados a través de mediciones, capturas o descripciones técnicas.</p>
        <h2>4. Conclusiones y recomendaciones</h2>
        <p>Sintetice los aprendizajes alcanzados y recomendaciones prácticas derivadas de la actividad realizada.</p>
      `;
    },
  },
  {
    id: 'page-meeting-notes',
    title: 'Minuta de reunión / Actas de acuerdos',
    category: 'trabajo',
    categoryLabel: 'Trabajo',
    type: 'page',
    description: 'Documento estructurado para reuniones con participantes, agenda tratada y tabla de compromisos.',
    iconName: 'file-text',
    previewHtml: `
      <div class="border border-slate-300 dark:border-zinc-700 rounded p-2 text-[10px] space-y-2 bg-white dark:bg-zinc-900">
        <div class="font-bold text-xs text-slate-800 dark:text-zinc-100">Minuta de reunión</div>
        <div class="grid grid-cols-2 gap-1 text-[9px] bg-slate-50 dark:bg-zinc-800 p-1.5 rounded">
          <div><strong>Fecha:</strong> ${getTodayFormatted()}</div>
          <div><strong>Moderador:</strong> Coordinador</div>
          <div class="col-span-2"><strong>Asistentes:</strong> Equipo principal</div>
        </div>
        <div class="space-y-1">
          <div class="font-semibold text-slate-600 dark:text-zinc-400">Puntos tratados</div>
          <div class="h-1.5 bg-slate-200 dark:bg-zinc-800 rounded w-full"></div>
          <div class="font-semibold text-slate-600 dark:text-zinc-400">Compromisos acordados</div>
          <div class="h-1.5 bg-slate-200 dark:bg-zinc-800 rounded w-4/5"></div>
        </div>
      </div>
    `,
    getContent: () => {
      const dateStr = getTodayFormatted();
      return `
        <h1>Minuta de reunión: [Nombre del proyecto o tema]</h1>
        <table class="veyra-table" style="width: 100%;">
          <tbody>
            <tr>
              <td style="width: 25%; font-weight: 600;"><p><strong>Fecha y hora</strong></p></td>
              <td><p>${dateStr} - 10:00</p></td>
            </tr>
            <tr>
              <td style="font-weight: 600;"><p><strong>Moderador / Redactor</strong></p></td>
              <td><p>Nombre del responsable</p></td>
            </tr>
            <tr>
              <td style="font-weight: 600;"><p><strong>Participantes</strong></p></td>
              <td><p>Persona 1, Persona 2, Persona 3</p></td>
            </tr>
          </tbody>
        </table>
        <h2>1. Agenda y temas tratados</h2>
        <ul>
          <li><p>Revisión del estado de avances y compromisos anteriores.</p></li>
          <li><p>Análisis de bloqueos y propuestas de solución.</p></li>
          <li><p>Definición de prioridades para el siguiente ciclo.</p></li>
        </ul>
        <h2>2. Decisiones tomadas</h2>
        <blockquote>
          <p>Se aprueba por consenso la propuesta técnica y el calendario de entregas establecido.</p>
        </blockquote>
        <h2>3. Tareas y compromisos acordados</h2>
        <table class="veyra-table" style="width: 100%;">
          <thead>
            <tr>
              <th style="width: 50%;"><p><strong>Acción o entregable</strong></p></th>
              <th style="width: 25%;"><p><strong>Responsable</strong></p></th>
              <th style="width: 25%;"><p><strong>Fecha límite</strong></p></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><p>Enviar resumen técnico a los involucrados</p></td>
              <td><p>Responsable 1</p></td>
              <td><p>${dateStr}</p></td>
            </tr>
            <tr>
              <td><p>Actualizar backlog y cronograma de tareas</p></td>
              <td><p>Responsable 2</p></td>
              <td><p>En 3 días</p></td>
            </tr>
          </tbody>
        </table>
        <p></p>
      `;
    },
  },
  {
    id: 'page-laboratory-report',
    title: 'Informe de laboratorio / Práctica técnica',
    category: 'academico',
    categoryLabel: 'Académico',
    type: 'page',
    description: 'Plantilla experimental con materiales, circuito/procedimiento, tabla de datos y análisis de error.',
    iconName: 'flask-conical',
    previewHtml: `
      <div class="border border-slate-300 dark:border-zinc-700 rounded p-2 text-[10px] space-y-2 bg-white dark:bg-zinc-900">
        <div class="h-6 bg-sky-100 dark:bg-sky-950/60 rounded border border-sky-200 dark:border-sky-800 text-[9px] flex items-center justify-center font-bold text-sky-900 dark:text-sky-300">
          Carátula de laboratorio
        </div>
        <div class="font-bold text-xs text-slate-800 dark:text-zinc-100">Práctica N° 1: Mediciones técnicas</div>
        <div class="space-y-1">
          <div class="font-semibold text-slate-600 dark:text-zinc-400">Equipos y materiales</div>
          <div class="h-1.5 bg-slate-200 dark:bg-zinc-800 rounded w-full"></div>
          <div class="font-semibold text-slate-600 dark:text-zinc-400">Tabla de mediciones</div>
          <div class="h-4 bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded"></div>
        </div>
      </div>
    `,
    getContent: (options) => {
      const studentName = options?.userName?.trim() || 'Apellidos y nombres del alumno';
      const dateStr = getTodayFormatted();

      return `
        <table class="veyra-table" style="width: 100%;">
          <tr>
            <th style="background-color: #dbeafe; text-align: center; font-weight: 700; width: 25%;" data-background-color="#dbeafe"><p><strong>Laboratorio</strong></p></th>
            <th colspan="2" style="background-color: #dbeafe; text-align: center; font-weight: 700; width: 55%;" data-background-color="#dbeafe"><p><strong>Datos del alumno</strong></p></th>
            <th style="background-color: #dbeafe; text-align: center; font-weight: 700; width: 20%;" data-background-color="#dbeafe"><p><strong>Fecha</strong></p></th>
          </tr>
          <tr>
            <td rowspan="3" style="text-align: center; font-weight: 700; vertical-align: middle;"><p><strong>PRÁCTICA N° 1</strong></p></td>
            <td style="font-weight: 600; width: 28%;"><p><strong>Apellidos y nombres</strong></p></td>
            <td><p>${studentName}</p></td>
            <td rowspan="3" style="text-align: center; vertical-align: middle;"><p>${dateStr}</p></td>
          </tr>
          <tr>
            <td style="font-weight: 600;"><p><strong>Cédula</strong></p></td>
            <td><p>0000000000</p></td>
          </tr>
          <tr>
            <td style="font-weight: 600;"><p><strong>Grupo / Mesa</strong></p></td>
            <td><p>Mesa 1</p></td>
          </tr>
        </table>
        <h1>Informe de práctica de laboratorio</h1>
        <h2>1. Materiales y equipos utilizados</h2>
        <ul>
          <li><p>Instrumento de medición principal.</p></li>
          <li><p>Cables, fuentes de alimentación o reactivos.</p></li>
          <li><p>Software de registro o captura de datos.</p></li>
        </ul>
        <h2>2. Procedimiento experimental</h2>
        <ol>
          <li><p>Calibración y verificación de los instrumentos.</p></li>
          <li><p>Montaje del circuito o esquema experimental.</p></li>
          <li><p>Toma sistemática de lecturas en los diferentes puntos de prueba.</p></li>
        </ol>
        <h2>3. Tabla de datos y mediciones</h2>
        <table class="veyra-table" style="width: 100%;">
          <thead>
            <tr>
              <th><p><strong>Muestra #</strong></p></th>
              <th><p><strong>Valor teórico</strong></p></th>
              <th><p><strong>Valor medido</strong></p></th>
              <th><p><strong>Margen de error (%)</strong></p></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><p>1</p></td>
              <td><p>10.0</p></td>
              <td><p>9.8</p></td>
              <td><p>2.0 %</p></td>
            </tr>
            <tr>
              <td><p>2</p></td>
              <td><p>20.0</p></td>
              <td><p>19.7</p></td>
              <td><p>1.5 %</p></td>
            </tr>
          </tbody>
        </table>
        <h2>4. Discusión de resultados y conclusiones</h2>
        <p>Analice las fuentes de incertidumbre y contraste los valores observados con la teoría formal.</p>
      `;
    },
  },
  {
    id: 'page-weekly-planner',
    title: 'Planificador semanal de estudio y proyectos',
    category: 'organizacion',
    categoryLabel: 'Organización',
    type: 'page',
    description: 'Organizador semanal con objetivos prioritarios, distribución de lunes a viernes y checklist.',
    iconName: 'calendar',
    previewHtml: `
      <div class="border border-slate-300 dark:border-zinc-700 rounded p-2 text-[10px] space-y-2 bg-white dark:bg-zinc-900">
        <div class="font-bold text-xs text-slate-800 dark:text-zinc-100">Plan semanal de estudio</div>
        <div class="space-y-1">
          <div class="font-semibold text-slate-600 dark:text-zinc-400">Objetivos prioritarios</div>
          <div class="h-1.5 bg-slate-200 dark:bg-zinc-800 rounded w-full"></div>
        </div>
        <div class="grid grid-cols-5 gap-0.5 text-center text-[8.5px] bg-slate-100 dark:bg-zinc-800 p-1 rounded font-medium">
          <div>Lun</div><div>Mar</div><div>Mié</div><div>Jue</div><div>Vie</div>
        </div>
      </div>
    `,
    getContent: () => {
      return `
        <h1>Planificador semanal de estudio</h1>
        <h2>Objetivos de la semana</h2>
        <ul data-type="taskList">
          <li data-checked="false"><label><input type="checkbox"><span></span></label><div><p>Objetivo primordial 1</p></div></li>
          <li data-checked="false"><label><input type="checkbox"><span></span></label><div><p>Objetivo primordial 2</p></div></li>
          <li data-checked="false"><label><input type="checkbox"><span></span></label><div><p>Lectura y repaso de apuntes</p></div></li>
        </ul>
        <h2>Distribución horaria</h2>
        <table class="veyra-table" style="width: 100%;">
          <thead>
            <tr>
              <th style="width: 20%;"><p><strong>Lunes</strong></p></th>
              <th style="width: 20%;"><p><strong>Martes</strong></p></th>
              <th style="width: 20%;"><p><strong>Miércoles</strong></p></th>
              <th style="width: 20%;"><p><strong>Jueves</strong></p></th>
              <th style="width: 20%;"><p><strong>Viernes</strong></p></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><p>Revisión teórica</p></td>
              <td><p>Ejercicios prácticos</p></td>
              <td><p>Laboratorio / Proyecto</p></td>
              <td><p>Redacción de informes</p></td>
              <td><p>Autoevaluación y dudas</p></td>
            </tr>
          </tbody>
        </table>
        <h2>Notas y recordatorios adicionales</h2>
        <p>Anotar entregas de la próxima semana, fechas de evaluaciones o recursos pendientes por consultar.</p>
      `;
    },
  },
];
