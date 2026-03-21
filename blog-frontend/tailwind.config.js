/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ink:    { DEFAULT: '#030508', 1: '#060b12', 2: '#0b1220', 3: '#101a2e', 4: '#162238' },
        line:   { DEFAULT: '#1a2d45', 2: '#223555', 3: '#2d4470' },
        amber:  { DEFAULT: '#ff9f0a', 2: '#cc7a00' },
        cyan:   { DEFAULT: '#0af5ff', 2: '#00c8d4' },
        green:  { DEFAULT: '#30d158', 2: '#25a645' },
        red:    { DEFAULT: '#ff453a', 2: '#cc2a20' },
        gold:   '#ffd60a',
        blue:   '#0a84ff',
        purple: '#bf5af2',
        teal:   '#40c8e0',
        t:      { 1: '#f0f4f8', 2: '#8fa4be', 3: '#506882', 4: '#2e4a65' },
      },
      fontFamily: {
        mono:    ['IBM Plex Mono', 'Courier New', 'monospace'],
        display: ['Playfair Display', 'Georgia', 'serif'],
        sans:    ['Barlow', 'system-ui', 'sans-serif'],
      },
      animation: {
        'ticker':     'ticker 60s linear infinite',
        'pulse-glow': 'pulse-glow 2s ease infinite',
        'fade-up':    'fade-up 0.3s ease',
        'blink':      'blink 2s step-end infinite',
      },
      keyframes: {
        ticker:     { '0%': { transform: 'translateX(0)' }, '100%': { transform: 'translateX(-50%)' } },
        'pulse-glow': { '0%,100%': { opacity: '1', transform: 'scale(1)' }, '50%': { opacity: '0.4', transform: 'scale(1.4)' } },
        'fade-up':  { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'none' } },
        blink:      { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.3' } },
      },
    },
  },
  plugins: [],
}
