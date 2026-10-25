/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Neutral ramp
        ink: {
          50: '#f7f8fa',
          100: '#eef0f4',
          200: '#d9dde6',
          300: '#b6bdcc',
          400: '#8891a7',
          500: '#5f6a82',
          600: '#46506a',
          700: '#353d54',
          800: '#222940',
          900: '#161c2e',
          950: '#0b1220',
        },
        // Primary (blue)
        brand: {
          50: '#eef4ff',
          100: '#dbe7ff',
          200: '#bcd2ff',
          300: '#8eb3ff',
          400: '#5b8bff',
          500: '#3767f6',
          600: '#2563eb',
          700: '#1d4fd1',
          800: '#1e42a8',
          900: '#1f3a85',
        },
        // Secondary (teal)
        accent: {
          50: '#ecfdff',
          100: '#cff7fe',
          200: '#a4eefc',
          300: '#67e0f8',
          400: '#22c9e6',
          500: '#06b2d4',
          600: '#0891b2',
          700: '#0e7490',
          800: '#155e75',
          900: '#164e63',
        },
        success: {
          500: '#22c55e', 600: '#16a34a', 700: '#15803d',
        },
        warning: {
          500: '#f59e0b', 600: '#d97706', 700: '#b45309',
        },
        danger: {
          500: '#ef4444', 600: '#dc2626', 700: '#b91c1c',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,18,27,0.06), 0 4px 16px rgba(16,18,27,0.08)',
      },
      borderRadius: {
        xl: '0.875rem',
      },
    },
  },
  plugins: [],
};
