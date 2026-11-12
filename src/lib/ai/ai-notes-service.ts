import { supabase } from '../supabase';

export interface AIGeneratedNoteContent {
  type: 'table' | 'task_list' | 'code' | 'math' | 'rich_text';
  html: string;
  summary: string;
}

export interface AINoteContext {
  textBefore?: string;
  image?: {
    src: string;
    mimeType?: string;
  };
}

const SYSTEM_PROMPT = `Eres el asistente de IA integrado en el editor de notas de Veyra.
El usuario te dará una orden que comienza tras el comando /ia.
Tu objetivo es analizar la orden (y cualquier contexto de texto o imagen adjunta del documento) y responder SIEMPRE un JSON válido con la siguiente estructura exacta:
{
  "type": "table" | "task_list" | "code" | "math" | "rich_text",
  "html": "<fragmento HTML válido y limpio listo para insertar en TipTap>",
  "summary": "Breve frase descriptiva en español de lo generado (ej: 'Tabla comparativa generada', 'Resumen de 3 puntos')"
}

REGLAS DE CONTEXTO:
- Si se proporciona un bloque de "Contexto del documento" o una imagen adjunta, úsalo como fuente principal de verdad para responder a órdenes como "resume lo anterior", "haz una tabla con los datos de arriba", "extrae la información de la imagen", etc.
- Mantén el formato fiel a los datos del contexto.

REGLAS ESTRICTAS DE HTML PARA TIPTAP:
1. Si type = "table" (para tablas, comparativas tabulares, calendarios, horarios, presupuestos, matrices):
   - Estructura: <table><thead><tr><th><p>Columna</p></th></tr></thead><tbody><tr><td><p>Dato</p></td></tr></tbody></table>
   - IMPORTANTE: Toda celda (th y td) DEBE tener una etiqueta <p> dentro del texto.
   - Proporciona datos completos, representativos y bien estructurados.

2. Si type = "task_list" (para listas de tareas, checklists, pasos a seguir, planes de acción):
   - Estructura:
     <ul data-type="taskList">
       <li data-type="taskItem" data-checked="false"><p>Texto de la tarea</p></li>
     </ul>
   - Todo elemento li DEBE tener data-type="taskItem", data-checked="false" y un <p> dentro.

3. Si type = "code" (para scripts, snippets, funciones, consultas SQL):
   - Estructura: <pre><code class="language-{lenguaje}">{codigo limpio sin escapar de más}</code></pre>
   - Reemplaza {lenguaje} por el nombre real (javascript, typescript, python, sql, html, bash, etc.).

4. Si type = "math" (para fórmulas, ecuaciones físicas o matemáticas):
   - Estructura: <p>{breve explicación o contexto}</p><div data-type="math-block" data-latex="{fórmula en LaTeX puro}"></div>

5. Si type = "rich_text" (para resúmenes, explicaciones, esquemas, plantillas de notas, redacción):
   - Usa etiquetas semánticas estándar: <h2>, <h3>, <p>, <strong>, <em>, <ul>, <ol>, <blockquote>.
   - NUNCA uses <h1> (el título principal es reservado de la nota).

Responde ÚNICAMENTE con el objeto JSON, sin bloques de código markdown como \`\`\`json alrededor.`;

function normalizeAIResponse(raw: any): AIGeneratedNoteContent {
  let data = raw;
  if (data?.structured) {
    data = data.structured;
  }

  // Si vino en formato string, intentar parsear
  if (typeof data === 'string') {
    try {
      const cleaned = data.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      data = JSON.parse(cleaned);
    } catch {
      // Si no es JSON pero es HTML directo
      if (data.includes('<table') || data.includes('<ul') || data.includes('<pre') || data.includes('<p>')) {
        return {
          type: data.includes('<table') ? 'table' : 'rich_text',
          html: data,
          summary: 'Contenido generado con IA',
        };
      }
    }
  }

  if (!data || typeof data !== 'object') {
    throw new Error('Respuesta en formato inesperado de la IA.');
  }

  let html = data.html || '';
  const type = data.type || (html.includes('<table') ? 'table' : 'rich_text');
  const summary = data.summary || 'Contenido generado con éxito';

  // Si devolvió una tabla pero en forma de objeto headers y rows
  if (!html && data.table && Array.isArray(data.table.headers)) {
    const headers = data.table.headers as string[];
    const rows = (data.table.rows || []) as string[][];
    html = `<table><thead><tr>${headers.map((h) => `<th><p>${h}</p></th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td><p>${c}</p></td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }

  // Si devolvió lista de tareas como array
  if (!html && data.tasks && Array.isArray(data.tasks)) {
    html = `<ul data-type="taskList">${data.tasks.map((t: any) => `<li data-type="taskItem" data-checked="false"><p>${typeof t === 'string' ? t : t.text || ''}</p></li>`).join('')}</ul>`;
  }

  if (!html) {
    const fallbackText = data.text || data.content || JSON.stringify(data);
    html = `<p>${fallbackText}</p>`;
  }

  return {
    type,
    html,
    summary,
  };
}

/**
 * Invoca la Edge Function 'ai' de Supabase mediante fetch directo con timeout
 * para evitar bloqueos del cliente de funciones.
 */
export async function generateNoteContentWithAI(
  prompt: string,
  context?: AINoteContext
): Promise<{ success: true; data: AIGeneratedNoteContent } | { success: false; error: string }> {
  const cleanPrompt = prompt.trim();
  if (!cleanPrompt) {
    return { success: false, error: 'Por favor, introduce una orden después de /ia' };
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://rrwoompvuggcczggfgiq.supabase.co';
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_5y3OReimX6RP2Tcpl8Ailw_V52PADlk';

  // 1. Verificación de Seguridad: Exigir sesión activa de usuario
  let authToken = '';
  try {
    const { data } = await supabase.auth.getSession();
    if (data?.session?.access_token) {
      authToken = data.session.access_token;
    }
  } catch (err) {
    console.error('[AINotesService] Error checking session:', err);
  }

  // Si no hay sesión iniciada, bloquear la petición para proteger la cuota de la IA
  if (!authToken) {
    return {
      success: false,
      error: 'Debes iniciar sesión en tu cuenta de Veyra para usar el asistente de IA.',
    };
  }

  // 2. Procesar contexto de imagen si existe
  let attachments: any[] | undefined = undefined;
  let action = 'generateStructured';

  if (context?.image?.src) {
    try {
      let base64 = '';
      if (context.image.src.startsWith('data:')) {
        base64 = context.image.src.replace(/^data:[^;]+;base64,/, '');
      } else {
        const imgRes = await fetch(context.image.src);
        if (imgRes.ok) {
          const blob = await imgRes.blob();
          base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const res = (reader.result as string) || '';
              resolve(res.replace(/^data:[^;]+;base64,/, ''));
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        }
      }

      if (base64) {
        action = 'generateMultimodal';
        attachments = [
          {
            base64Data: base64,
            mimeType: context.image.mimeType || 'image/jpeg',
          },
        ];
      }
    } catch (imgErr) {
      console.warn('[AINotesService] Could not process image attachment:', imgErr);
    }
  }

  // 3. Estructurar el texto de la petición incorporando el contexto
  let fullPromptText = cleanPrompt;
  if (context?.textBefore && context.textBefore.trim().length > 0) {
    fullPromptText = `Contexto del documento:\n"""\n${context.textBefore.trim()}\n"""\n\nOrden del usuario:\n${cleanPrompt}`;
  }

  // Timeout de 30 segundos usando AbortController
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const endpoint = `${supabaseUrl}/functions/v1/ai`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        action,
        model: 'gemini-2.0-flash',
        systemPrompt: SYSTEM_PROMPT,
        input: {
          text: fullPromptText,
          context: context?.textBefore ? { textBefore: context.textBefore } : undefined,
          attachments,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      console.error('[AINotesService] HTTP error response:', response.status, errText);

      let errMsg = 'Error al comunicarse con la IA.';
      try {
        const parsed = JSON.parse(errText);
        if (parsed.error) errMsg = String(parsed.error);
      } catch {
        // No es JSON
      }

      if (response.status === 401) {
        errMsg = 'No tienes autorización para usar el servicio de IA. Inicia sesión en Veyra.';
      } else if (response.status === 429 || errMsg.includes('Rate limit')) {
        errMsg = 'Has alcanzado el límite de peticiones por minuto. Espera un momento.';
      } else if (response.status === 503 || errMsg.includes('503') || errMsg.includes('high demand')) {
        errMsg = 'Los servidores de IA tienen alta demanda en este momento. Intenta de nuevo en unos segundos.';
      }

      return { success: false, error: errMsg };
    }

    const data = await response.json();
    if (!data) {
      return { success: false, error: 'No se recibió respuesta del servicio de IA.' };
    }

    const normalized = normalizeAIResponse(data);
    return { success: true, data: normalized };
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.error('[AINotesService] Error fetching AI response:', err);

    if (err.name === 'AbortError') {
      return {
        success: false,
        error: 'La solicitud a la IA tardó demasiado tiempo (tiempo de espera agotado).',
      };
    }

    return {
      success: false,
      error: err?.message || 'Error de conexión con el asistente de IA.',
    };
  }
}
