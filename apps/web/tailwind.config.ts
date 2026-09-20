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
        // ── The editorial press palette ───────────────────────────────
        // Two inks and a paper, and a third colour that is not picked.
        //
        // The landing page is printed in two inks: one for what the books
        // say, one for what the statute says. Where the two records agree
        // the impressions land on each other and multiply; `agreed` is that
        // multiply, computed channel by channel from `books` x `statute`,
        // not chosen. Agreement in this design is a printed state rather
        // than a hue someone liked.
        //
        // Indigo is not an arbitrary blue: it was India's export dye and the
        // English word is the country's name. Vermillion is the product's
        // existing statutory colour pushed one step brighter so it survives
        // being overprinted.
        //
        // There is no third hue. No semantic green, no amber. A thing is
        // agreed, or it is at risk, and there is no other state.
        //
        // Ratios against `stock`, computed: books 10.84, statute 5.05,
        // statute-deep 6.70, agreed 17.33, graphite 8.41. On `plate`:
        // stock 16.81, stock-soft 10.79, stock-faint 5.38. The inverted
        // sections are plates, not a dark mode, which is the opposite of
        // the washed-out dark theme this project is audited against.
        stock: "#F4F1E8",
        books: "#1D3461",
        statute: "#C4291B",
        // `statute` set below 18px drops under 4.5:1, so small type uses this.
        "statute-deep": "#A32014",
        agreed: "#16080A",
        graphite: "#4A453D",
        // Captions and second-rank labels. 5.11:1, so it clears AA at the
        // 12px the stub is set at, which `graphite` alone was overqualified
        // for and the old palette's `ink-faint` did not reach.
        "graphite-soft": "#6B655C",
        // The population field: eleven thousand records as a texture. 3.23:1,
        // which is dense enough to read as a field and light enough that a
        // vermillion mark still sits on top of it rather than in it.
        field: "#8C857A",
        // Code and quoted source sit on a slightly sunk plate rather than on
        // white, which on a bone ground reads as a hole punched in the paper.
        sunk: "#EDE9DE",
        hairline: "#D6D0C0",
        plate: "#12100E",
        "stock-soft": "#C9C3B2",
        "stock-faint": "#8E887A",

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
        // Provenance by typeface, and it is enforced rather than suggested.
        // `news` is what the language model wrote and may not contain a
        // digit; `anek` is a magnitude that came out of SQL; `mono` is an
        // identifier, a thing that points at a row rather than measures one.
        // A reader can tell by letterform alone which engine produced any
        // character on the page.
        anek: ["Anek Latin", "var(--font-plex-sans)", "system-ui", "sans-serif"],
        anekdev: ["Anek Devanagari", "Anek Latin", "system-ui", "sans-serif"],
        news: ["Newsreader", "Georgia", "Times New Roman", "serif"],
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
        // ── The editorial ramp ────────────────────────────────────────
        // Eight steps, eight roles, built outward from the 17px the prose
        // is actually set at rather than from a notional 16. Two display
        // steps sit outside the ramp because each is used exactly once per
        // page. The gap between `amount` and `opener` is deliberate and
        // large: there is no medium heading here, because a section either
        // opens at architectural scale or it does not open.
        register: ["clamp(96px, 17.5vw, 268px)", { lineHeight: "0.82", letterSpacing: "-0.045em" }],
        opener: ["clamp(56px, 8vw, 116px)", { lineHeight: "0.88", letterSpacing: "-0.035em" }],
        deck: ["2.5rem", { lineHeight: "2.75rem", letterSpacing: "-0.01em" }],
        intro: ["1.5rem", { lineHeight: "2rem" }],
        prose: ["1.0625rem", { lineHeight: "1.6875rem" }],
        amount: ["1.875rem", { lineHeight: "2rem", letterSpacing: "-0.02em" }],
        ident: ["0.875rem", { lineHeight: "1.1875rem", letterSpacing: "0.01em" }],
        stub: ["0.75rem", { lineHeight: "0.875rem", letterSpacing: "0.12em" }],
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
