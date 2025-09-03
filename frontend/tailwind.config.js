/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'brand-green': {
          'dark': '#356854',
          'light': '#85a297',
          'DEFAULT': '#356854'
        },
        'brand-white': '#F5F5F5',
      }
    },
  },
  plugins: [],
}
