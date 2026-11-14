export type PaperSizeId =
  | 'letter'      // Carta (21,59 cm x 27,94 cm)
  | 'tabloid'     // Tabloide (27,94 cm x 43,18 cm)
  | 'legal'       // Oficio (21,59 cm x 35,56 cm)
  | 'statement'   // Estamento (13,97 cm x 21,59 cm)
  | 'executive'   // Ejecutivo (18,42 cm x 26,67 cm)
  | 'a3'          // A3 (29,7 cm x 42 cm)
  | 'a4'          // A4 (21 cm x 29,7 cm)
  | 'a5'          // A5 (14,8 cm x 21 cm)
  | 'b4'          // B4 JIS (25,7 cm x 36,4 cm)
  | 'b5'          // B5 JIS (18,2 cm x 25,7 cm)
  | 'envelope9'   // Sobre nº 9 (9,84 cm x 22,54 cm)
  | 'custom';     // Personalizado

export interface PaperSizeOption {
  id: PaperSizeId;
  name: string;
  widthMm: number;
  heightMm: number;
  description: string;
}

export const PAPER_SIZES: PaperSizeOption[] = [
  { id: 'letter', name: 'Carta', widthMm: 215.9, heightMm: 279.4, description: '21,59 cm × 27,94 cm' },
  { id: 'tabloid', name: 'Tabloide', widthMm: 279.4, heightMm: 431.8, description: '27,94 cm × 43,18 cm' },
  { id: 'legal', name: 'Oficio', widthMm: 215.9, heightMm: 355.6, description: '21,59 cm × 35,56 cm' },
  { id: 'statement', name: 'Estamento', widthMm: 139.7, heightMm: 215.9, description: '13,97 cm × 21,59 cm' },
  { id: 'executive', name: 'Ejecutivo', widthMm: 184.2, heightMm: 266.7, description: '18,42 cm × 26,67 cm' },
  { id: 'a3', name: 'A3', widthMm: 297.0, heightMm: 420.0, description: '29,7 cm × 42 cm' },
  { id: 'a4', name: 'A4', widthMm: 210.0, heightMm: 297.0, description: '21 cm × 29,7 cm' },
  { id: 'a5', name: 'A5', widthMm: 148.0, heightMm: 210.0, description: '14,8 cm × 21 cm' },
  { id: 'b4', name: 'B4 (JIS)', widthMm: 257.0, heightMm: 364.0, description: '25,7 cm × 36,4 cm' },
  { id: 'b5', name: 'B5 (JIS)', widthMm: 182.0, heightMm: 257.0, description: '18,2 cm × 25,7 cm' },
  { id: 'envelope9', name: 'Sobre nº 9', widthMm: 98.4, heightMm: 225.4, description: '9,84 cm × 22,54 cm' },
];

export type Orientation = 'portrait' | 'landscape';

export type MarginPresetId = 'normal' | 'narrow' | 'moderate' | 'wide' | 'custom';

export interface MarginsMm {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface MarginPresetOption {
  id: MarginPresetId;
  name: string;
  description: string;
  margins: MarginsMm;
}

export const MARGIN_PRESETS: MarginPresetOption[] = [
  {
    id: 'normal',
    name: 'Normal',
    description: 'Sup/Inf: 2.5 cm, Izq/Der: 3 cm',
    margins: { top: 25, right: 30, bottom: 25, left: 30 },
  },
  {
    id: 'narrow',
    name: 'Estrecho',
    description: '1.27 cm en todos los márgenes',
    margins: { top: 12.7, right: 12.7, bottom: 12.7, left: 12.7 },
  },
  {
    id: 'moderate',
    name: 'Moderado',
    description: 'Sup/Inf: 2.5 cm, Izq/Der: 1.9 cm',
    margins: { top: 25, right: 19, bottom: 25, left: 19 },
  },
  {
    id: 'wide',
    name: 'Ancho',
    description: 'Sup/Inf: 2.5 cm, Izq/Der: 5 cm',
    margins: { top: 25, right: 50, bottom: 25, left: 50 },
  },
];

export type TextAlignment = 'left' | 'justify';

export type ParagraphSpacing = 'compact' | 'normal' | 'relaxed';

export type PdfFontFamily =
  | 'times'       // Times New Roman (APA 7)
  | 'arial'       // Arial (APA 7)
  | 'calibri'     // Calibri (Word / APA 7)
  | 'georgia'     // Georgia (APA 7)
  | 'sans'        // Plus Jakarta Sans (Moderna)
  | 'fira'        // Fira Sans (Estructurada)
  | 'serif'       // Lora (Editorial)
  | 'mono'        // JetBrains Mono (Código)
  | 'quicksand'   // Quicksand (Geométrica)
  | 'script';     // Caveat (Manuscrita)

export interface PdfExportConfig {
  paperSizeId: PaperSizeId;
  customPaperWidthMm?: number;
  customPaperHeightMm?: number;
  orientation: Orientation;

  marginPresetId: MarginPresetId;
  margins: MarginsMm; // en milímetros

  fontFamily: PdfFontFamily;
  fontSizePt: number; // 9, 10, 11, 12, 13, 14
  lineHeight: number; // 1.15, 1.25, 1.5, 2.0
  firstLineIndentMm: number; // 0, 5, 10, 12.5 mm
  paragraphSpacing: ParagraphSpacing;
  textAlign: TextAlignment;

  // Opciones de estructura
  breakBetweenHojas: boolean; // Si es true, cada hoja de Veyra inicia en página nueva
  includePageNumbers: boolean; // "Página X de Y" en pie
  includeDate: boolean; // Fecha de exportación en pie
}

export const DEFAULT_PDF_CONFIG: PdfExportConfig = {
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
  includePageNumbers: true,
  includeDate: false,
};

