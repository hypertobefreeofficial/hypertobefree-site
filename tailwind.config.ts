import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        htbf: {
          surface: "#f8fbff",
          navy: "#082f63",
          "navy-deep": "#062a57",
          "navy-hover": "#0b3f80",
          blue: "#0b63ce",
          "blue-hover": "#084f9f",
          gold: "#d4af37",
          mist: "#eaf5ff",
          warm: "#fff7e6",
        },
      },
      borderRadius: {
        "htbf-card": "2rem",
        "htbf-panel": "2.5rem",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        heading: [
          "var(--font-manrope)",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        display: [
          "var(--font-funnel-display)",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        quote: ["var(--font-eb-garamond)", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};

export default config;
