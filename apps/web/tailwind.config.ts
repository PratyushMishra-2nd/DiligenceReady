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
        // 16px, lifted from 15. Fifteen is a UI size and this page argues in
        // paragraphs: the measure runs to 64ch, and at that length 15px asks
        // the eye to track a line it can barely resolve. The leading stays at
        // 24px, which is 150% and above the 120-145% a shorter measure would
        // want. That is deliberate and it is the same reason: leading carries
        // the eye back to the start of the next line, and the longer the line
        // the further it has to carry.
        body: ["1rem", { lineHeight: "1.5rem" }],
        lede: ["1.125rem", { lineHeight: "1.625rem" }],
        figure: ["1.625rem", { lineHeight: "2rem", letterSpacing: "-0.015em" }],
        // The one display figure in the product. Used once, on the firm
        // dashboard, and allowed outside the ramp because it is never reused.
        hero: ["3.25rem", { lineHeight: "0.95", letterSpacing: "-0.02em" }],
        // The landing page opens on the figure rather than on a paragraph,
        // and at `hero` it read as a heading rather than as a sum. This step
        // exists for that one number and is not used anywhere else. A
        // fourteen-character rupee figure at this size is about 740px wide,
        // which is why it is a large-screen treatment and steps down twice
        // below it rather than being clipped at the gutter.
        display: ["5rem", { lineHeight: "0.88", letterSpacing: "-0.03em" }],
      },
      // One grid for the whole working paper: the tick-mark gutter, the
      // measure, and the cross-reference margin. It is a token because the
      // page had two of these written out by hand and they disagreed — the
      // deck said `22rem` for the margin and every claim below it said
      // `13rem`, so the right-hand column stepped sideways once, near the top,
      // for no reason a reader could name. Section rhythm is `py-12` between
      // sheets and `pt-12` after the last rule; there is no third value.
      gridTemplateColumns: {
        paper: "2.5rem minmax(0, 64ch) minmax(0, 13rem)",
      },
      // Four rule weights, four meanings, and nothing is allowed a fifth:
      // `rule-hair` divides rows inside a block, `rule` divides blocks,
      // `rule-strong` divides sections, and a 2px `ink` rule is the masthead.
      // `borderRadius.sheet` used to sit here at 2px and was never once used;
      // every surface in this product is square, and a token nothing applies
      // is an invitation to start rounding things.
    },
  },
  plugins: [],
};

export default config;
