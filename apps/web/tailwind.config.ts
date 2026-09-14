import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        carbon: {
          DEFAULT: "#0C0D0E",
          raised: "#111314",
        },
        graphite: {
          DEFAULT: "#17191B",
          elevated: "#1F2224",
          border: "#2B2E30",
        },
        accent: {
          DEFAULT: "#35D07F",
          hover: "#2BB86D",
          soft: "rgba(53, 208, 127, 0.12)",
        },
        ink: {
          DEFAULT: "#F2F4F3",
          secondary: "#9AA0A0",
          tertiary: "#6B7070",
        },
        danger: "#E5484D",
        warning: "#E8A33D",
      },
      fontFamily: {
        display: ["Sora", "system-ui", "sans-serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        sm: "6px",
        md: "10px",
        lg: "14px",
        xl: "20px",
      },
      boxShadow: {
        card: "0 1px 0 rgba(255,255,255,0.02) inset, 0 8px 24px rgba(0,0,0,0.35)",
      },
    },
  },
  plugins: [],
} satisfies Config;
