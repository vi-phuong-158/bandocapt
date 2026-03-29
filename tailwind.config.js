/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./*.html", "./*.js"],
  theme: {
    extend: {
      colors: {
        primary: "#1e3a8a", // blue-900 (Police Blue)
        secondary: "#047857", // emerald-700 
        accent: "#d97706", // amber-600
        surface: "#ffffff",
        background: "#f1f5f9", // slate-100
        textMain: "#0f172a", // slate-900
        textMuted: "#64748b", // slate-500
      },
      fontFamily: {
        display: ["Space Grotesk", "sans-serif"],
        body: ["Inter", "sans-serif"],
      },
      boxShadow: {
        glass: "0 8px 32px 0 rgba(31, 38, 135, 0.07)",
        sheet: "0 -8px 30px rgba(0, 0, 0, 0.12)",
        card: "0 4px 16px -2px rgba(0, 0, 0, 0.05)",
      },
      borderRadius: {
        "2xl": "1.25rem",
        "3xl": "1.5rem",
      }
    },
  },
  plugins: [],
}
