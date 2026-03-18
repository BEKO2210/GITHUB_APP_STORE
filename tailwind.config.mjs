/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        black: '#000000',
        surface: '#0a0a0a',
        elevated: '#141414',
        border: '#1f1f1f',
        'text-primary': '#ffffff',
        'text-secondary': '#a0a0a0',
        'text-muted': '#505050',
        accent: '#ffffff',
        'accent-hover': '#e0e0e0',
        success: '#4ade80',
        warning: '#facc15',
        danger: '#f87171',
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
