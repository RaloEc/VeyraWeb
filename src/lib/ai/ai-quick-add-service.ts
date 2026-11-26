import { supabase } from '../supabase';

export interface QuickAddReminderData {
  title: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  priority?: 'normal' | 'critical';
  description?: string;
  recurrence?: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
}

export interface QuickAddEventData {
  title: string;
  startDate: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  isAllDay?: boolean;
  location?: string;
  description?: string;
  tags?: string[];
  recurrence?: 'none' | 'daily' | 'weekly' | 'weekdays' | 'monthly' | 'yearly';
  recurrenceEndDate?: string; // YYYY-MM-DD
}

export interface QuickAddNoteData {
  title: string;
  contentHtml: string;
}

export type QuickAddProposalItem =
  | { action: 'create_reminder'; data: QuickAddReminderData }
  | { action: 'create_event'; data: QuickAddEventData }
  | { action: 'create_note'; data: QuickAddNoteData };

export type QuickAddProposal =
  | QuickAddProposalItem
  | { action: 'create_batch'; items: QuickAddProposalItem[] }
  | { action: 'clarify'; question: string }
  | { action: 'unknown'; reason: string };

export interface QuickAddAttachment {
  mimeType: string;
  data: string; // raw base64 (without data: prefix)
}

function buildSystemPrompt(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const weekday = now.toLocaleDateString('es-ES', { weekday: 'long' });
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  return `Eres el asistente inteligente de creación rápida "Crear con Veyra" en una app de productividad con Recordatorios, Eventos y Notas.
Contexto temporal actual del usuario:
- Fecha hoy: ${y}-${m}-${d} (${weekday})
- Hora actual: ${hh}:${mm}
- Zona horaria: ${tz}

Analiza con máxima precisión la orden del usuario (texto, audio transcrito, imagen, captura o documento adjunto como horarios de clases, tablas semanales, facturas, recibos, citas médicas, boletos, listas o apuntes). Si hay múltiples elementos o archivos, integra y combina la información sin duplicar.
Responde SIEMPRE únicamente con un JSON válido (sin bloques markdown \`\`\`json ni texto adicional) con uno de estos formatos:

1) Recordatorio:
{
  "action": "create_reminder",
  "data": {
    "title": "Título conciso",
    "date": "YYYY-MM-DD",
    "time": "HH:mm",
    "priority": "normal" | "critical",
    "recurrence": "none" | "daily" | "weekly" | "monthly" | "yearly",
    "description": "opcional"
  }
}

2) Evento:
{
  "action": "create_event",
  "data": {
    "title": "Nombre limpio del evento o materia",
    "startDate": "YYYY-MM-DD",
    "endDate": "YYYY-MM-DD",
    "startTime": "HH:mm",
    "endTime": "HH:mm",
    "isAllDay": false,
    "location": "opcional (ej. Aula, paralelo o Virtual)",
    "description": "opcional (ej. Jornada o nivel)",
    "tags": ["clase"],
    "recurrence": "none" | "daily" | "weekly" | "weekdays" | "monthly" | "yearly",
    "recurrenceEndDate": "YYYY-MM-DD (opcional)"
  }
}

3) Nota:
{
  "action": "create_note",
  "data": {
    "title": "Título de la nota",
    "contentHtml": "<p>Contenido HTML limpio</p>"
  }
}

4) Múltiples elementos (ej. horario de clases con varias materias, varias facturas o varias tareas):
{
  "action": "create_batch",
  "items": [
    {
      "action": "create_event",
      "data": {
        "title": "Marketing",
        "startDate": "YYYY-MM-DD",
        "endDate": "YYYY-MM-DD",
        "startTime": "17:00",
        "endTime": "20:00",
        "isAllDay": false,
        "location": "Virtual (TIN-S-NO-7-1)",
        "description": "Nocturno - Nivel 7",
        "tags": ["clase"],
        "recurrence": "weekly",
        "recurrenceEndDate": "YYYY-MM-DD"
      }
    }
  ]
}

5) Si falta información esencial o no está claro:
{
  "action": "clarify",
  "question": "Pregunta breve en español"
}

REGLAS DE INTERPRETACIÓN VISUAL Y DE TEXTO:
1. HORARIOS DE CLASES O TABLAS SEMANALES (tabla con materias, días en columnas y horas en celdas, o turnos de trabajo):
   - Usa "action": "create_batch" con un elemento "create_event" por cada bloque/celda de materia con horario asignado.
   - "title": Nombre limpio de la materia o evento SIN anteponer "Clase", "Clase de" ni "Evento:" (ej. "Interacción Hombre Máquina", "Marketing", "Presupuesto y Finanzas TI").
   - "startTime" y "endTime": Horas en formato 24h HH:mm (ej. "19:00 - 22:00" -> startTime: "19:00", endTime: "22:00").
   - "startDate" y "endDate": Calcula la fecha YYYY-MM-DD del próximo día de la semana correspondiente a esa columna a partir de hoy (${y}-${m}-${d}). Pon "endDate" igual a "startDate".
   - "location": Aula, paralelo o modalidad si aparece en la fila o celda (ej. "Virtual", "TIN-S-NO-7-1 Virtual", "Aula 204").
   - "description": Jornada, docente o nivel si aparece (ej. "Nocturno - Nivel 7").
   - "tags": Siempre incluye ["clase"].
   - "recurrence": "weekly".
   - "recurrenceEndDate": Fecha de fin del periodo/semestre si aparece en el horario; si no se especifica, calcula aproximadamente 16 semanas (4 meses / 1 semestre académico) después de "startDate" en formato YYYY-MM-DD.

2. FACTURAS O RECIBOS (luz, agua, internet, colegiatura, etc.):
   - Identifica el servicio/empresa, monto total y fecha límite o de vencimiento.
   - Genera "create_reminder" (o "create_batch" si hay varias cuentas).
   - "title": ej. "Pagar recibo de Luz (\$45.00)".
   - "date": Fecha de vencimiento encontrada en el documento (o un día antes por seguridad).
   - "time": "09:00" por defecto.

3. CITAS, BOLETOS O EVENTOS ÚNICOS (cita médica, reunión, cumpleaños, aniversario):
   - Usa "create_event" con título limpio, fecha, startTime, endTime y location (si es cumpleaños/aniversario: isAllDay: true).
   - Si no se especifica duración para un evento, pon endTime 1 hora después de startTime.

4. RECORDATORIOS Y TAREAS PUNTUALES O RECURRENTES:
   - Si es una tarea puntual ("recuérdame", "pagar", "comprar", "hacer"), usa "create_reminder".
   - Resuelve fechas relativas ("mañana", "el viernes") respecto a ${y}-${m}-${d}. Si no especifica fecha ni hora, usa hoy (${y}-${m}-${d}) y "09:00" (o una hora razonable futura si es hoy).
   - Si indica repetición ("cada día", "cada semana", "cada mes", "anual"), asigna "recurrence": "daily" | "weekly" | "monthly" | "yearly"; si no, "none".

5. NOTAS Y APUNTES:
   - Si pide tomar nota, apuntar, resumir o guardar texto informativo sin fecha de agenda, usa "create_note" con HTML limpio.`;
}

function extractJsonFromText(raw: string): any {
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  return JSON.parse(cleaned);
}

export async function parseQuickAddWithAI(params: {
  text?: string;
  attachments?: QuickAddAttachment[];
}): Promise<QuickAddProposal> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Falta configuración de Supabase para el asistente.');
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const authToken = sessionData.session?.access_token || supabaseAnonKey;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 35000);

  const hasAttachments = Boolean(params.attachments && params.attachments.length > 0);

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/ai`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        action: hasAttachments ? 'generateMultimodal' : 'generateStructured',
        model: 'gemini-2.5-flash',
        systemPrompt: buildSystemPrompt(),
        input: {
          text:
            params.text?.trim() ||
            'Analiza el archivo o audio adjunto y extrae el recordatorio, evento o nota correspondiente.',
          attachments: (params.attachments || []).map((att) => ({
            mimeType: att.mimeType,
            base64Data: att.data,
          })),
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Tu sesión expiró o no tienes autorización. Inicia sesión nuevamente.');
      }
      if (response.status === 429) {
        throw new Error('Límite temporal de consultas alcanzado. Espera unos segundos.');
      }
      if (response.status === 503) {
        throw new Error('El servicio de IA está saturado temporalmente. Intenta de nuevo en unos segundos.');
      }
      throw new Error(`No se pudo procesar con IA (${response.status}).`);
    }

    const json = await response.json();
    let parsed: any = json;
    if (json?.structured && typeof json.structured === 'object') {
      if (typeof json.structured.rawText === 'string') {
        parsed = extractJsonFromText(json.structured.rawText);
      } else {
        parsed = json.structured;
      }
    } else if (typeof json?.text === 'string') {
      parsed = extractJsonFromText(json.text);
    } else if (typeof json?.output === 'string') {
      parsed = extractJsonFromText(json.output);
    } else if (json?.data && typeof json.data === 'string') {
      parsed = extractJsonFromText(json.data);
    }

    if (!parsed || typeof parsed !== 'object' || !parsed.action) {
      return { action: 'unknown', reason: 'No se pudo interpretar la solicitud.' };
    }

    return parsed as QuickAddProposal;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err?.name === 'AbortError') {
      throw new Error('Tiempo de espera agotado al conectar con Veyra IA.');
    }
    throw err;
  }
}

export function fileToBase64Attachment(file: File): Promise<QuickAddAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const commaIdx = result.indexOf(',');
      const data = commaIdx >= 0 ? result.slice(commaIdx + 1) : result;
      resolve({
        mimeType: file.type || 'application/octet-stream',
        data,
      });
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo adjunto.'));
    reader.readAsDataURL(file);
  });
}
