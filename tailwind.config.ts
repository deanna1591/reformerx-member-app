import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#191621",
        chalk: "#F5F4F1",
        card: "#FFFFFF",
        plum: { DEFAULT: "#6242A6", deep: "#43286F", soft: "#EEE9F8" },
        spring: {
          red: "#C94F4F",
          blue: "#4C6FA5",
          yellow: "#D9A441",
          green: "#5E8C61",
        },
        smoke: "#7A7684",
        line: "#E5E2DC",
      },
      fontFamily: {
        display: ["Marcellus", "Georgia", "serif"],
        sans: ["'Instrument Sans'", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(25,22,33,0.05), 0 4px 16px rgba(25,22,33,0.06)",
        lift: "0 8px 30px rgba(67,40,111,0.18)",
      },
      borderRadius: { xl2: "1.25rem" },
    },
  },
  plugins: [],
};
export default config;
