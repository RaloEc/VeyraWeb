const cssVarColor = (varName, fallback) => {
  const base = fallback ? `var(${varName}, ${fallback})` : `var(${varName})`;
  return ({ opacityValue }) => {
    if (opacityValue !== undefined && !Number.isNaN(Number(opacityValue))) {
      const pct = Math.round(Number(opacityValue) * 10000) / 100;
      if (pct < 100) {
        return `color-mix(in srgb, ${base} ${pct}%, transparent)`;
      }
    }
    return base;
  };
};

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: cssVarColor('--accent-primary'),
          muted: cssVarColor('--accent-muted'),
          bg: 'var(--accent-bg)',
        },
        canvas: cssVarColor('--bg-main'),
        surface: cssVarColor('--bg-surface'),
        veyra: {
          canvas: cssVarColor('--bg-main'),
          card: cssVarColor('--bg-surface'),
          elevated: cssVarColor('--bg-elevated'),
          hover: cssVarColor('--bg-hover', '#191919'),
          border: cssVarColor('--border-main', '#2b2b2b'),
          borderSubtle: cssVarColor('--border-subtle', '#232323'),
          text: cssVarColor('--text-main', '#fcfcfc'),
          muted: cssVarColor('--text-muted', '#a6a6a6'),
          subtle: cssVarColor('--text-subtle', '#666666'),
          teal: {
            DEFAULT: cssVarColor('--accent-primary'),
            hover: cssVarColor('--accent-muted'),
            glow: 'var(--accent-bg)',
            subtle: 'var(--accent-bg)',
          },
          priority: {
            normal: '#3ab0b0',
            strict: '#f59e0b',
            critical: '#ef4444',
          }
        }
      },
      borderRadius: {
        'sm': '6px',
        'md': '8px',
        'lg': '8px',
        'xl': '12px',
        'pill': '9999px',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      transitionDuration: {
        DEFAULT: '150ms',
      },
      boxShadow: {
        'xs': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        'elevated': '0 4px 16px rgba(0, 0, 0, 0.12)',
        'sm': '0 1px 2px rgba(0, 0, 0, 0.05)',
      }
    },
  },
  plugins: [],
}
