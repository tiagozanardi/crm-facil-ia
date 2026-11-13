/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: 'var(--color-brand-50, #FFF5F0)',
          100: 'var(--color-brand-100, #FFE6D9)',
          200: 'var(--color-brand-200, #FFC9B3)',
          500: 'var(--color-brand-500, #B3471A)',
          600: 'var(--color-brand-600, #9A3810)',
          700: 'var(--color-brand-700, #7B2A08)',
          DEFAULT: 'var(--color-brand-500, #B3471A)',
        },
        graphite: {
          900: '#181A18',
          800: '#232624',
          700: '#343835',
          600: '#4F5550',
          500: '#6C736E',
          400: '#949B95',
          300: '#C2C7C3',
          200: '#E4E7E4',
          100: '#F2F4F2',
          50: '#F9FAF9'
        }
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'soft': '0 2px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.025)',
        'float': '0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
      }
    },
  },
  plugins: [],
}
