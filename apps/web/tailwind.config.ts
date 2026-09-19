import type { Config } from "tailwindcss";

// The palette is a working paper, not a product surface: a cool paper ground
// (warm cream reads as marketing), archival ink for text, hairline rules
// instead of shadows, and one statutory vermillion reserved for money that is
// actually at risk. Nothing else is allowed to use it.
//
// The grey ramp is measured, not eyeballed. Against paper #F4F6F5:
// ink 13.6:1, ink-soft 7.0:1, ink-faint 4.8:1 — three steps, each ~1.5x the
// last, all past AA. The previous ink-faint was 2.7:1 and it was what the
// GSTIN, the sha256 and every calculation line were printed in, which made
// the case for IBM Plex's disambiguated digits and then defeated it.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F4F6F5",
        sheet: "#FFFFFF",
        ink: "#1B2A2F",
        "ink-soft": "#46565C",
        "ink-faint": "#5F7076",
        rule: "#D5DCDA",
        // One hairline for rules drawn inside a block. It is a token rather
        // than `border-rule/60` because an alpha rule composites to a
        // different grey over paper than over sheet, and the two places that
        // used it sit on different grounds.
        "rule-hair": "#E3E8E6",
        "rule-strong": "#B3BEBB",
        exposure: "#9E2B25",
        "exposure-wash": "#F6E7E5",
        reconciled: "#2F6F4E",
        "reconciled-wash": "#E4EEE8",
        caution: "#8A5A16",
        "caution-wash": "#FBF3E2",
        marked: "#F5EBC4",
      },
      fontFamily: {
        sans: ["var(--font-plex-sans)", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["var(--font-plex-mono)", "ui-monospace", "SFMono-Regular", "Consolas", "monospace"],
      },
      // Six steps, assigned by role rather than by size. `micro` and `data` are
      // one point apart on purpose and are not interchangeable: 12px carries
      // sans annotation, 13px carries the figures and the table rows, and at
      // Plex's relative glyph widths that pair reads as one optical size. Keep
      // the roles or the pair rots back into the nine ad-hoc sizes it replaced.
      fontSize: {
        micro: ["0.75rem", { lineHeight: "1rem", letterSpacing: "0.005em" }],
        data: ["0.8125rem", { lineHeight: "1.125rem" }],
        body: ["0.9375rem", { lineHeight: "1.5rem" }],
        lede: ["1.125rem", { lineHeight: "1.625rem" }],
        figure: ["1.625rem", { lineHeight: "2rem", letterSpacing: "-0.015em" }],
        // The one display figure in the product. Used once, on the firm
        // dashboard, and allowed outside the ramp because it is never reused.
        hero: ["3.25rem", { lineHeight: "0.95", letterSpacing: "-0.02em" }],
      },
      borderRadius: {
        sheet: "2px",
      },
    },
  },
  plugins: [],
};

export default config;
