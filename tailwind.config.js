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
          DEFAULT: 'var(--accent-primary)',
          muted: 'var(--accent-muted)',
          bg: 'var(--accent-bg)',
        },
        canvas: 'var(--bg-main)',
        surface: 'var(--bg-surface)',
        veyra: {
          canvas: 'var(--bg-main)',
          card: 'var(--bg-surface)',
          elevated: 'var(--bg-elevated)',
          hover: 'var(--bg-hover, #191919)',
          border: 'var(--border-main, #2b2b2b)',
          borderSubtle: 'var(--border-subtle, #232323)',
          text: 'var(--text-main, #fcfcfc)',
          muted: 'var(--text-muted, #a6a6a6)',
          subtle: 'var(--text-subtle, #666666)',
          teal: {
            DEFAULT: 'var(--accent-primary)',
            hover: 'var(--accent-muted)',
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
        'elevated': '0 4px 16px rgba(0, 0, 0, 0.12)',
        'sm': '0 1px 2px rgba(0, 0, 0, 0.05)',
      }
    },
  },
  plugins: [],
}
