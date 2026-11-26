import { supabase } from '../supabase';

export interface QuickAddReminderData {
  title: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  priority?: 'normal' | 'critical';
  description?: string;
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

  return `Eres el asistente de creación rápida "Crear con Veyra".
Contexto temporal actual del usuario:
- Fecha hoy: ${y}-${m}-${d} (${weekday})
- Hora actual: ${hh}:${mm}
- Zona horaria: ${tz}

Analiza la orden del usuario (texto, audio transcrito o imagen adjunta como un horario, lista o apunte) y responde SIEMPRE únicamente con un JSON válido (sin markdown ni texto adicional) con uno de estos formatos:

1) Recordatorio:
{
  "action": "create_reminder",
  "data": {
    "title": "Título conciso",
    "date": "YYYY-MM-DD",
    "time": "HH:mm",
    "priority": "normal" | "critical",
    "description": "opcional"
  }
}

2) Evento:
{
  "action": "create_event",
  "data": {
    "title": "Título del evento",
    "startDate": "YYYY-MM-DD",
    "endDate": "YYYY-MM-DD",
    "startTime": "HH:mm",
    "endTime": "HH:mm",
    "isAllDay": false,
    "location": "opcional",
    "description": "opcional",
    "tags": ["clase"]
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

4) Múltiples elementos (ej. si la imagen o texto contiene varias clases, tareas o eventos):
{
  "action": "create_batch",
  "items": [ ...objetos de tipo 1, 2 o 3... ]
}

5) Si falta información esencial o no está claro:
{
  "action": "clarify",
  "question": "Pregunta breve en español"
}

Reglas:
- Si el usuario menciona una hora específica con rango (ej. "de 7 a 9" o "clase") o cumpleaños/aniversario, usa "create_event" (si es cumpleaños: isAllDay: true).
- Si es una tarea puntual ("recuérdame", "pagar", "comprar", "hacer"), usa "create_reminder".
- Si pide tomar nota, apuntar o redactar algo sin fecha de agenda, usa "create_note".
- Si no especifica hora para un recordatorio, usa "09:00" (o una hora razonable futura del día si es hoy).
- Si no especifica duración para un evento, pon endTime 1 hora después de startTime.`;
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

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/ai`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        action: 'quick_add',
        model: 'gemini-2.0-flash',
        systemPrompt: buildSystemPrompt(),
        input: {
          text:
            params.text?.trim() ||
            'Analiza el archivo o audio adjunto y extrae el recordatorio, evento o nota correspondiente.',
          attachments: params.attachments || [],
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('Límite temporal de consultas alcanzado. Espera unos segundos.');
      }
      throw new Error(`No se pudo procesar con IA (${response.status}).`);
    }

    const json = await response.json();
    let parsed: any = json;
    if (typeof json?.text === 'string') {
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
