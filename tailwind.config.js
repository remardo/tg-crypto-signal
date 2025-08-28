/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./public/**/*.{js,jsx,ts,tsx}",
    "./dist/index.html"
  ],
  theme: {
    extend: {
      colors: {
        primary: '#3B82F6',
        secondary: '#10B981',
        accent: '#F59E0B',
        danger: '#EF4444',
        background: '#0F172A',
        surface: '#1E293B',
        'text-primary': '#F1F5F9',
        'text-secondary': '#94A3B8',
        border: '#334155'
      }
    },
  },
  plugins: [],
}
