/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./*.html", "./*.js", "./js/**/*.js"],
  theme: {
    extend: {
      colors: {
        primary: "#1d4ed8", // Sharp Blue 700
        secondary: "#09090b", // Zinc 950
        accent: "#2563eb", // Vibrant Blue 600
        surface: "#ffffff",
        background: "#f4f4f5", // Zinc 100
        textMain: "#09090b", // Zinc 950
        textMuted: "#71717a", // Zinc 500
      },
      fontFamily: {
        display: ["'Be Vietnam Pro'", "sans-serif"],
        body: ["'Plus Jakarta Sans'", "sans-serif"],
      },
      boxShadow: {
        glass: "0 8px 32px 0 rgba(0, 0, 0, 0.05), inset 0 1px 1px 0 rgba(255, 255, 255, 0.5)",
        sheet: "0 -8px 30px rgba(0, 0, 0, 0.08)",
        card: "0 4px 16px -4px rgba(0, 0, 0, 0.06)",
        sm: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
      },
      borderRadius: {
        "2xl": "1.25rem",
        "3xl": "1.5rem",
      }
    },
  },
  plugins: [],
}
