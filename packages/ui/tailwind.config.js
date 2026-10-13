/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        orbit: {
          bg: "#0A0A0B",
          surface: "#141417",
          card: "#17171B",
          border: "#2A2A30",
          "border-light": "#33333B",
          text: "#FAFAFA",
          "text-dim": "#efeee7",
          "text-muted": "#71717A",
          accent: "var(--accent, #C6F432)",
        },
      },
      fontFamily: {
        sans: ["Geist", "Segoe UI", "system-ui", "sans-serif"],
        mono: ["Geist Mono", "JetBrains Mono", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
