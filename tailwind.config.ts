import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#171310",
        chalk: "#F2F0EA",
        card: "#FDFCF9",
        sage: { DEFAULT: "#C5C3AE", deep: "#8F8D74", soft: "#EFEEE3" },
        tan: { DEFAULT: "#C7B29F", deep: "#93765C" },
        rose: "#DE526F",
        spring: {
          red: "#B96A5E",
          blue: "#7C8AA0",
          yellow: "#C9A96A",
          green: "#9AA284",
        },
        smoke: "#7C766E",
        line: "#E4E1D6",
      },
      fontFamily: {
        display: ["Oswald", "'Arial Narrow'", "sans-serif"],
        sans: ["Montserrat", "system-ui", "sans-serif"],
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
