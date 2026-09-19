import type { Config } from "tailwindcss";

// The palette is a working paper, not a product surface: a cool paper ground
// (warm cream reads as marketing), archival ink for text, hairline rules
// instead of shadows, and one statutory vermillion reserved for money that is
// actually at risk. Nothing else is allowed to use it.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F4F6F5",
        sheet: "#FFFFFF",
        ink: "#1B2A2F",
        "ink-soft": "#54656B",
        "ink-faint": "#8A9BA0",
        rule: "#D5DCDA",
        "rule-strong": "#B3BEBB",
        exposure: "#9E2B25",
        "exposure-wash": "#F6E7E5",
        reconciled: "#2F6F4E",
        "reconciled-wash": "#E4EEE8",
        marked: "#F5EBC4",
      },
      fontFamily: {
        sans: ["'IBM Plex Sans'", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["'IBM Plex Mono'", "ui-monospace", "SFMono-Regular", "Consolas", "monospace"],
      },
      fontSize: {
        micro: ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.01em" }],
      },
      borderRadius: {
        sheet: "2px",
      },
    },
  },
  plugins: [],
};

export default config;
