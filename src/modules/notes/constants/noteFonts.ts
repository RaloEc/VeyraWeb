export interface NoteFontOption {
  id: string;
  name: string;
  fontName: string;
  family: string;
  description: string;
  sampleText: string;
  group?: 'apa' | 'creative';
}

export const NOTE_FONTS: NoteFontOption[] = [
  // Normas APA / Word clásicas
  {
    id: 'times',
    name: 'Times New Roman',
    fontName: 'Times New Roman',
    family: "'Times New Roman', Times, 'Liberation Serif', serif",
    description: 'Clásica académica formal (APA 7 - 12 pt)',
    sampleText: 'Aa Bb Gg — Formato estándar de investigación',
    group: 'apa',
  },
  {
    id: 'arial',
    name: 'Arial',
    fontName: 'Arial',
    family: "Arial, Helvetica, 'Liberation Sans', sans-serif",
    description: 'Sans-serif clara y legible (APA 7 - 11 pt)',
    sampleText: 'Aa Bb Gg — Textos directos y técnicos',
    group: 'apa',
  },
  {
    id: 'calibri',
    name: 'Calibri',
    fontName: 'Calibri',
    family: "Calibri, 'Segoe UI', Candara, 'Liberation Sans', sans-serif",
    description: 'Estilo predeterminado de Word (APA 7 - 11 pt)',
    sampleText: 'Aa Bb Gg — Documentos modernos de oficina',
    group: 'apa',
  },
  {
    id: 'georgia',
    name: 'Georgia',
    fontName: 'Georgia',
    family: "Georgia, 'Palatino Linotype', 'Book Antiqua', serif",
    description: 'Serif elegante de alta legibilidad (APA 7 - 11 pt)',
    sampleText: 'Aa Bb Gg — Claridad editorial impresa y digital',
    group: 'apa',
  },

  // Estilos y Diseños Veyra
  {
    id: 'sans',
    name: 'Moderna',
    fontName: 'Plus Jakarta Sans',
    family: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
    description: 'Limpia, moderna y minimalista',
    sampleText: 'Aa Bb Gg — Ideas claras y enfoque diario',
    group: 'creative',
  },
  {
    id: 'serif',
    name: 'Elegante',
    fontName: 'Lora',
    family: "'Lora', Georgia, 'Times New Roman', serif",
    description: 'Editorial, literaria y formal',
    sampleText: 'Aa Bb Gg — Textos largos y narrativas',
    group: 'creative',
  },
  {
    id: 'fira',
    name: 'Fira Sans',
    fontName: 'Fira Sans',
    family: "'Fira Sans', sans-serif",
    description: 'Estructurada, equilibrada y versátil',
    sampleText: 'Aa Bb Gg — Lectura clara y precisa',
    group: 'creative',
  },
  {
    id: 'mono',
    name: 'Código',
    fontName: 'JetBrains Mono',
    family: "'JetBrains Mono', 'Fira Code', monospace",
    description: 'Espaciado técnico y uniforme',
    sampleText: 'Aa Bb Gg — 0123 const note = true;',
    group: 'creative',
  },
  {
    id: 'script',
    name: 'Libreta',
    fontName: 'Caveat',
    family: "'Caveat', cursive",
    description: 'Manuscrita, cálida y personal',
    sampleText: 'Aa Bb Gg — Apuntes rápidos y diario',
    group: 'creative',
  },
  {
    id: 'quicksand',
    name: 'Quicksand',
    fontName: 'Quicksand',
    family: "'Quicksand', sans-serif",
    description: 'Geométrica con terminales redondeados',
    sampleText: 'Aa Bb Gg — Claridad amigable y moderna',
    group: 'creative',
  },
  {
    id: 'crafty',
    name: 'Crafty',
    fontName: 'Crafty Girls',
    family: "'Crafty Girls', cursive",
    description: 'Dibujada a mano, alegre y creativa',
    sampleText: 'Aa Bb Gg — Notas divertidas y creativas',
    group: 'creative',
  },
  {
    id: 'dekko',
    name: 'Dekko',
    fontName: 'Dekko',
    family: "'Dekko', cursive",
    description: 'Trazos sueltos y estilo rotulador',
    sampleText: 'Aa Bb Gg — Ideas espontáneas de clase',
    group: 'creative',
  },
  {
    id: 'hachi',
    name: 'Hachi Pop',
    fontName: 'Hachi Maru Pop',
    family: "'Hachi Maru Pop', cursive",
    description: 'Pop japonés redondeado y simpático',
    sampleText: 'Aa Bb Gg — Recuerdos y momentos visuales',
    group: 'creative',
  },
  {
    id: 'sniglet',
    name: 'Sniglet',
    fontName: 'Sniglet',
    family: "'Sniglet', cursive",
    description: 'Burbujeante, amigable y suave',
    sampleText: 'Aa Bb Gg — Planes y listas amables',
    group: 'creative',
  },
  {
    id: 'cherry',
    name: 'Cherry Bomb',
    fontName: 'Cherry Bomb One',
    family: "'Cherry Bomb One', cursive",
    description: 'Extragruesa, llamativa y con carácter',
    sampleText: 'Aa Bb Gg — Títulos e impacto visual',
    group: 'creative',
  },
];

export const DEFAULT_NOTE_FONT_ID = 'sans';

export const TEXT_COLORS = [
  { label: 'Normal', color: 'default', preview: 'currentColor' },
  { label: 'Rojo', color: '#EF4444', preview: '#EF4444' },
  { label: 'Naranja', color: '#F97316', preview: '#F97316' },
  { label: 'Ámbar', color: '#F59E0B', preview: '#F59E0B' },
  { label: 'Verde', color: '#10B981', preview: '#10B981' },
  { label: 'Azul', color: '#3B82F6', preview: '#3B82F6' },
  { label: 'Morado', color: '#8B5CF6', preview: '#8B5CF6' },
  { label: 'Rosa', color: '#EC4899', preview: '#EC4899' },
  { label: 'Gris', color: '#94A3B8', preview: '#94A3B8' },
];

export const HIGHLIGHT_COLORS = [
  { label: 'Ninguno', color: 'transparent', preview: 'transparent' },
  { label: 'Amarillo', color: 'rgba(250, 204, 21, 0.35)', preview: 'rgba(250, 204, 21, 0.35)' },
  { label: 'Verde', color: 'rgba(74, 222, 128, 0.35)', preview: 'rgba(74, 222, 128, 0.35)' },
  { label: 'Azul', color: 'rgba(96, 165, 250, 0.35)', preview: 'rgba(96, 165, 250, 0.35)' },
  { label: 'Rosa', color: 'rgba(244, 114, 182, 0.35)', preview: 'rgba(244, 114, 182, 0.35)' },
  { label: 'Morado', color: 'rgba(192, 132, 252, 0.35)', preview: 'rgba(192, 132, 252, 0.35)' },
  { label: 'Naranja', color: 'rgba(251, 146, 60, 0.35)', preview: 'rgba(251, 146, 60, 0.35)' },
];

// Helpers para normalización y comparación exacta de colores (hex / rgb / transparent)
export function parseRgb(color: string | null | undefined): { r: number; g: number; b: number } | null {
  if (!color || typeof color !== 'string') return null;
  const s = color.trim().toLowerCase();
  if (
    s === 'transparent' ||
    s === 'rgba(0, 0, 0, 0)' ||
    s === 'rgba(0,0,0,0)' ||
    s === 'default' ||
    s === 'inherit'
  ) {
    return null;
  }
  const match = s.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (match) {
    return {
      r: parseInt(match[1], 10),
      g: parseInt(match[2], 10),
      b: parseInt(match[3], 10),
    };
  }
  if (s.startsWith('#')) {
    let hex = s.slice(1);
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
    if (hex.length === 6) {
      return {
        r: parseInt(hex.substring(0, 2), 16),
        g: parseInt(hex.substring(2, 4), 16),
        b: parseInt(hex.substring(4, 6), 16),
      };
    }
  }
  return null;
}

export function areColorsEqual(c1: string | null | undefined, c2: string | null | undefined): boolean {
  if (!c1 || !c2) return false;
  const rgb1 = parseRgb(c1);
  const rgb2 = parseRgb(c2);
  if (!rgb1 || !rgb2) return false;
  return (
    Math.abs(rgb1.r - rgb2.r) <= 4 &&
    Math.abs(rgb1.g - rgb2.g) <= 4 &&
    Math.abs(rgb1.b - rgb2.b) <= 4
  );
}
