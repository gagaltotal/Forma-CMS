/**
 * Konfigurasi Tailwind untuk LANDING PAGE PUBLIK (`/`).
 *
 * Kelas Tailwind hanya dipakai di `src/routes/admin-ui.routes.ts` (HTML server-side),
 * jadi `content` sengaja dibatasi ke file itu saja agar CSS hasil build tetap kecil.
 * Panel admin (`/admin/`) memakai `admin/styles.css` sendiri dan TIDAK memakai Tailwind.
 *
 * @type {import('tailwindcss').Config}
 */
import typography from '@tailwindcss/typography';

export default {
  content: ['./src/routes/admin-ui.routes.ts'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        },
      },
      boxShadow: {
        glow: '0 24px 60px -20px rgba(99, 102, 241, 0.55)',
        card: '0 20px 45px -25px rgba(2, 6, 23, 0.85)',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(14px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        float: 'float 6s ease-in-out infinite',
        'fade-up': 'fade-up 0.7s ease-out both',
      },
    },
  },
  plugins: [typography],
};
