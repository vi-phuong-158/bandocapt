/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./*.html", "./*.js", "./js/**/*.js"],
  theme: {
    extend: {
      colors: {
        primary: "#1d4ed8", // --color-primary (Blue 700)
        secondary: "#0f172a", // --text-strong (Slate 900)
        accent: "#2563eb", // --color-accent (Blue 600)
        surface: "#ffffff", // --surface-card
        background: "#f4f4f5", // --bg-app (Zinc 100)
        textMain: "#1e293b", // --text-body (Slate 800)
        textMuted: "#64748b", // --text-muted (Slate 500)
      },
      fontFamily: {
        // Design System: Be Vietnam Pro là family DUY NHẤT (display + body)
        display: ["'Be Vietnam Pro'", "system-ui", "sans-serif"],
        body: ["'Be Vietnam Pro'", "system-ui", "sans-serif"],
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
