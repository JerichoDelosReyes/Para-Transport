/** @type {import('tailwindcss').Config} */
module.exports = {
  // Enable class-based dark mode for manual toggling
  darkMode: 'class',
  content: [
    './App.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Para Brand Colors
        'para-brand': '#E9AE16',
        'para-brand-2': '#284395',
        'para-brand-3': '#EF2836',
        // Text colors
        'text-dark-900': '#181818',
        'text-dark-500': '#525250',
        'text-light': '#EDEDED',
        // Button text
        'button-text-dark': '#20350B',
      },
      fontFamily: {
        'cubao-expanded': ['CubaoFree2-ExtraExpanded'],
        'cubao-semi': ['CubaoFree2-SemiExpanded'],
        'quiapo': ['QuiapoFree2-Regular'],
        'inter': ['Inter'],
      },
    },
  },
  plugins: [],
};
