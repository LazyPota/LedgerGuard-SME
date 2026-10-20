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
        slate: {
          950: '#0B0F19',
          900: '#111827',
          850: '#151E32',
          800: '#1E293B',
          700: '#334155',
          600: '#475569',
          400: '#94A3B8',
          200: '#E2E8F0',
          100: '#F1F5F9',
          50: '#F8FAFC',
        },
        emerald: {
          500: '#10B981',
          600: '#059669',
          900: '#064E3B',
          950: '#022C22',
        },
        amber: {
          400: '#FBBF24',
          500: '#F59E0B',
          600: '#D97706',
          950: '#451A03',
        },
        crimson: {
          400: '#F87171',
          500: '#EF4444',
          600: '#DC2626',
          950: '#450A0A',
        },
        indigo: {
          400: '#818CF8',
          500: '#6366F1',
          600: '#4F46E5',
          950: '#1E1B4B',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
}
