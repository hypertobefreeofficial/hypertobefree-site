import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
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
