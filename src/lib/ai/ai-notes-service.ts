import { supabase } from '../supabase';
import {
  extractPlainTextLength,
  sanitizeAiHtmlOutput,
} from './ai-document-html-utils';

export type AIApplyMode = 'insert' | 'replace_document';

export interface AIGeneratedNoteContent {
  mode: AIApplyMode;
  type: 'table' | 'task_list' | 'code' | 'math' | 'rich_text';
  html: string;
  summary: string;
}

export interface AIYouTubeVideoContext {
  videoId: string;
  title?: string;
  author?: string;
  url: string;
  thumbnailUrl?: string;
}

export interface AINoteImageContext {
  src: string;
  mimeType?: string;
  alt?: string;
}

export interface AINoteContext {
  textBefore?: string;
  documentHtml?: string;
  documentTooLongForFullEdit?: boolean;
  image?: AINoteImageContext;
  images?: AINoteImageContext[];
  youtubeVideos?: AIYouTubeVideoContext[];
}

const SYSTEM_PROMPT = `Eres el asistente de IA integrado en el editor de notas de Veyra (basado en TipTap / ProseMirror).
El usuario te dará una orden que comienza tras el comando /ia.
Tu objetivo es analizar la orden (y el HTML actual del documento, texto previo, imágenes o videos de YouTube si existen) y responder SIEMPRE un JSON válido con esta estructura exacta:
{
  "mode": "insert" | "replace_document",
  "type": "table" | "task_list" | "code" | "math" | "rich_text",
  "html": "<fragmento o documento HTML válido y limpio listo para TipTap>",
  "summary": "Breve frase descriptiva en español de lo realizado (ej: 'Documento justificado con títulos H1-H3', 'Tabla comparativa generada')"
}

REGLAS DE DETECCIÓN AUTOMÁTICA DE MODO ("mode"):
1. Usa "mode": "replace_document" ÚNICAMENTE cuando el usuario pida modificar, formatear, reorganizar, corregir, traducir, cambiar estilo/color/fuente/alineación o reescribir el documento o nota existente (ejemplos: "justifica todo el documento", "pon los títulos en H1, H2 y H3 y en color azul", "cambia la fuente a Times New Roman", "subraya las ideas clave del texto", "convierte la lista en checkboxes", "corrige la ortografía de toda la nota", "organiza toda la nota con encabezados y viñetas").
   - En "replace_document", debes devolver el HTML COMPLETO actualizado de toda la hoja en "html", conservando intacto el contenido que el usuario no pidió cambiar.
   - Si en el HTML del documento hay marcadores como <p>[[VEYRA_MEDIA_0]]</p>, [[VEYRA_MEDIA_1]], etc., DEBES conservarlos exactamente en su lugar (sin modificar el número ni quitar los corchetes), a menos que el usuario pida explícitamente eliminar esa imagen, video o enlace.
   - NUNCA incluyas <div data-type="ai-prompt"> en tu respuesta.
2. Usa "mode": "insert" por defecto cuando el usuario pida generar, redactar, resumir, explicar, extraer o agregar contenido NUEVO en la posición del cursor /ia (ejemplos: "crea una tabla comparativa", "resume lo anterior", "haz una lista de tareas para...", "agrega una conclusión", "explica este tema", "escribe un snippet en Python").
   - En "insert", devuelve ÚNICAMENTE el fragmento HTML nuevo a insertar en el lugar de /ia (NO repitas todo el documento).

REGLAS DE CONTEXTO:
- Si se proporciona "HTML actual completo del documento", úsalo como fuente principal de verdad cuando el usuario pida editar, formatear o transformar la nota existente.
- Si se proporciona "Texto previo al cursor /ia" o una imagen adjunta, úsalo para responder órdenes como "resume lo anterior", "haz una tabla con los datos de arriba", "extrae la información de la imagen", etc.
- Si el contexto incluye videos de YouTube incrustados (título, autor o URL), comprende a fondo el tema, los conceptos clave y la temática educativa/técnica de dichos videos.
- REGLAS PARA VARIOS VIDEOS O MÚLTIPLES IMÁGENES:
  1. Por tema o título: Si el usuario menciona el tema o creador, atiende exclusivamente a ese recurso.
  2. Por orden o posición: Si indica "el primer video", "el último video", "la última imagen", etc., toma el elemento correspondiente.
  3. Combinación o comparativa: Si pide "compara los dos videos", "resume ambos", o "integra las imágenes", sintetiza todos los indicados.
  4. Por defecto: Si no especifica y hay varios, enfócate en el recurso más cercano inmediatamente anterior a la orden /ia.

HERRAMIENTAS DE FORMATO COMPATIBLES CON EL EDITOR VEYRA (HTML ESTRICTO PARA TIPTAP):
Puedes usar y combinar todas estas etiquetas y atributos cuando la orden lo requiera:
1. Títulos / Encabezados:
   - <h1>, <h2>, <h3> (usa <h1> para título principal si se solicita, <h2> para secciones y <h3> para subsecciones).
2. Formato de texto en línea:
   - Negrita: <strong>texto</strong>
   - Cursiva: <em>texto</em>
   - Subrayado: <u>texto</u>
   - Tachado: <s>texto</s>
   - Código en línea: <code>código</code>
   - Enlace: <a href="https://...">texto</a>
3. Color de texto (TextStyle + Color):
   - <span style="color: #3B82F6">texto</span>
   - Paleta recomendada de Veyra: Rojo #EF4444, Naranja #F97316, Ámbar #F59E0B, Verde #10B981, Azul #3B82F6, Morado #8B5CF6, Rosa #EC4899, Gris #94A3B8 (o cualquier color hex válido).
4. Resaltado / Marcatexto (Highlight):
   - <mark data-color="rgba(250, 204, 21, 0.35)" style="background-color: rgba(250, 204, 21, 0.35)">texto</mark>
   - Colores de resaltado de Veyra: Amarillo rgba(250, 204, 21, 0.35), Verde rgba(74, 222, 128, 0.35), Azul rgba(96, 165, 250, 0.35), Rosa rgba(244, 114, 182, 0.35), Morado rgba(192, 132, 252, 0.35), Naranja rgba(251, 146, 60, 0.35).
5. Fuente y tamaño de letra (FontFamily + FontSize en <span style="...">):
   - Fuente: <span style="font-family: Times New Roman">texto</span>
   - Tamaño: <span style="font-size: 18px">texto</span>
   - Puedes combinar atributos en un mismo span: <span style="font-family: Times New Roman; font-size: 16px; color: #3B82F6">texto</span>
   - Fuentes disponibles en Veyra: Times New Roman, Arial, Calibri, Georgia, Plus Jakarta Sans, Lora, Fira Sans, JetBrains Mono, Caveat, Quicksand.
   - Tamaños estándar en Veyra: 11px, 12px, 14px, 16px, 18px, 20px, 24px, 28px, 32px.
6. Alineación y justificación de texto (TextAlign):
   - Aplica style="text-align: left | center | right | justify" en <p>, <h1>, <h2>, <h3>, <td>, <th>.
   - Ejemplo justificado: <p style="text-align: justify">...</p>
7. Listas con viñetas, numeradas y checkboxes:
   - Lista con viñetas: <ul><li><p>Elemento</p></li></ul>
   - Lista numerada: <ol data-list-style="decimal" start="1"><li><p>Paso 1</p></li></ol>
     (Estilos de data-list-style válidos: decimal, decimal-paren, upper-roman, upper-alpha, lower-alpha-paren, lower-alpha, lower-roman).
   - Lista de tareas / Checkboxes (type = "task_list" o dentro de rich_text):
     <ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>Texto de la tarea</p></li></ul>
8. Citas, separadores, tablas, código y matemáticas:
   - Cita: <blockquote><p>Texto citado</p></blockquote>
   - Separador horizontal: <hr>
   - Tabla (type = "table" o dentro de rich_text):
     <table><thead><tr><th><p>Columna</p></th></tr></thead><tbody><tr><td><p>Dato</p></td></tr></tbody></table>
     (Toda celda th y td DEBE llevar un <p> dentro; opcionalmente puede tener style="background-color: #HEX" o data-background-color="#HEX").
   - Bloque de código (type = "code"): <pre><code class="language-{lenguaje}">{código limpio}</code></pre>
   - Fórmulas LaTeX (type = "math" o dentro de rich_text):
     Bloque: <div data-type="math-block" data-latex="{fórmula LaTeX}"></div>
     En línea: <span data-type="math-inline" data-latex="{fórmula LaTeX}"></span>

Responde ÚNICAMENTE con el objeto JSON, sin bloques de código markdown como \`\`\`json alrededor.`;

export function normalizeAIResponse(
  raw: any,
  context?: AINoteContext
): AIGeneratedNoteContent {
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
          mode: 'insert',
          type: data.includes('<table') ? 'table' : 'rich_text',
          html: sanitizeAiHtmlOutput(data),
          summary: 'Contenido generado con IA',
        };
      }
    }
  }

  if (!data || typeof data !== 'object') {
    throw new Error('Respuesta en formato inesperado de la IA.');
  }

  const mode: AIApplyMode =
    data.mode === 'replace_document' && !context?.documentTooLongForFullEdit
      ? 'replace_document'
      : 'insert';

  let html = typeof data.html === 'string' ? data.html : '';
  const type = data.type || (html.includes('<table') ? 'table' : 'rich_text');
  const summary =
    data.summary ||
    (mode === 'replace_document' ? 'Documento editado con IA' : 'Contenido generado con éxito');

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

  html = sanitizeAiHtmlOutput(html);

  if (
    mode === 'replace_document' &&
    context?.documentHtml &&
    extractPlainTextLength(context.documentHtml) > 80 &&
    extractPlainTextLength(html) === 0
  ) {
    throw new Error('La IA devolvió un documento vacío. Se canceló el reemplazo para proteger tu nota.');
  }

  return {
    mode,
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

  // 2. Procesar contexto de imágenes si existen (soporta una o varias imágenes)
  let attachments: any[] | undefined = undefined;
  let action = 'generateStructured';

  const rawImages = context?.images || (context?.image ? [context.image] : []);
  if (rawImages.length > 0) {
    try {
      const processedAttachments = await Promise.all(
        rawImages.slice(-4).map(async (img) => {
          try {
            let base64 = '';
            if (img.src.startsWith('data:')) {
              base64 = img.src.replace(/^data:[^;]+;base64,/, '');
            } else {
              const imgRes = await fetch(img.src);
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
              return {
                base64Data: base64,
                mimeType: img.mimeType || 'image/jpeg',
              };
            }
          } catch (imgErr) {
            console.warn('[AINotesService] Error processing image item:', imgErr);
          }
          return null;
        })
      );

      const valid = processedAttachments.filter(Boolean);
      if (valid.length > 0) {
        action = 'generateMultimodal';
        attachments = valid;
      }
    } catch (allImgErr) {
      console.warn('[AINotesService] Error processing attachments:', allImgErr);
    }
  }

  // 3. Estructurar el texto de la petición incorporando el contexto
  let fullPromptText = cleanPrompt;
  const contextSections: string[] = [];

  if (context?.youtubeVideos && context.youtubeVideos.length > 0) {
    const ytDescriptions = context.youtubeVideos
      .map((yt, idx) => {
        const parts = [
          `Video #${idx + 1}: "${yt.title || 'Video de YouTube'}"`,
          `- URL: ${yt.url}`,
        ];
        if (yt.author) parts.push(`- Canal / Creador: ${yt.author}`);
        return parts.join('\n');
      })
      .join('\n\n');
    contextSections.push(`Videos de YouTube incrustados en la nota:\n${ytDescriptions}`);
  }

  if (context?.documentHtml && context.documentHtml.trim().length > 0) {
    contextSections.push(
      `HTML actual completo del documento (para editar/formatear si la orden lo pide):\n"""html\n${context.documentHtml.trim()}\n"""`
    );
  }

  if (context?.textBefore && context.textBefore.trim().length > 0) {
    const textBeforeSnippet = context.documentHtml
      ? context.textBefore.trim().slice(-2500)
      : context.textBefore.trim();
    contextSections.push(`Texto previo al cursor /ia:\n"""\n${textBeforeSnippet}\n"""`);
  }

  if (context?.documentTooLongForFullEdit) {
    contextSections.push(
      'Nota del sistema: Esta hoja supera el límite de tamaño para reescritura completa en una sola pasada. Usa "mode": "insert"; si el usuario pidió editar todo el documento, explícale brevemente en HTML que la hoja es muy extensa y sugiérele dividirla o pedir cambios por secciones.'
    );
  }

  if (contextSections.length > 0) {
    fullPromptText = `Contexto del documento:\n${contextSections.join('\n\n')}\n\nOrden del usuario:\n${cleanPrompt}`;
  }

  // Timeout de 50 segundos usando AbortController (soporta ediciones de documento completo)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 50000);

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

    const normalized = normalizeAIResponse(data, context);
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
