import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#14233B",
        paper: "#F1F3F6",
        card: "#FFFFFF",
        torii: "#E14434",
        transit: "#0E9DA6",
        amber: "#F2A93B",
        muted: "#5B6B82",
        line: "#DDE3EC",
      },
      fontFamily: {
        round: ['"M PLUS Rounded 1c"', "system-ui", "sans-serif"],
        body: ['"Noto Sans KR"', '"M PLUS Rounded 1c"', "system-ui", "sans-serif"],
      },
      boxShadow: {
        soft: "0 2px 12px rgba(20,35,59,0.06)",
        lift: "0 6px 24px rgba(20,35,59,0.10)",
      },
    },
  },
  plugins: [],
};
export default config;
