import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        glass: {
          bg: "rgba(20, 29, 36, 0.75)",
          border: "rgba(124, 216, 190, 0.1)",
        },
        ag: {
          bg: "#0a0e12",
          elevated: "#10171d",
          surface: "#141d24",
          border: "#1e2d37",
          accent: "#7cd8be",
          error: "#f87171",
          warning: "#fbbf24",
          success: "#4ade80",
          info: "#818cf8",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      animation: {
        "pulse-cyan": "pulse-cyan 2s ease-in-out infinite",
        "glow-red": "glow-red 2s ease-in-out infinite",
      },
      keyframes: {
        "pulse-cyan": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(124, 216, 190, 0)" },
          "50%": { boxShadow: "0 0 12px 4px rgba(124, 216, 190, 0.2)" },
        },
        "glow-red": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(248, 113, 113, 0)" },
          "50%": { boxShadow: "0 0 12px 4px rgba(248, 113, 113, 0.2)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
