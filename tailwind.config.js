module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      fontFamily: {
        cubao: ["Cubao", "sans-serif"],
        quiapo: ["Quiapo", "sans-serif"],
        inter: ["Inter", "sans-serif"],
        'inter-italic': ["Inter-Italic", "sans-serif"],
      },
      colors: {
        base: {
          start: "#0A1628",
          end: "#0D1B2A",
        },
        accent: "#F5C518",
        success: "rgba(80,220,100,0.8)",
        destructive: "rgba(255,80,80,0.8)",
      }
    },
  },
  plugins: [],
}
