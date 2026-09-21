import type { Config } from "tailwindcss";

/* One ramp, one accent, two themes.
 *
 * Every token resolves to a custom property declared in globals.css, which is
 * where light and dark are defined. Tailwind's opacity modifier does not work
 * through `var()`, and it does not need to: secondary text is an alpha of the
 * primary ink and ships as its own token, so it stays harmonised when it
 * lands on a sunken ground, a wash, or a screenshot. A separate grey cannot
 * do that.
 *
 * Contrast, computed against `canvas` in each theme:
 *   light  ink 17.04  ink-muted 6.90  ink-subtle 5.24  exposure 5.01  books 10.04
 *   dark   ink 17.40  ink-muted 9.20  ink-subtle 5.91  exposure 7.56  books 8.42
 * `exposure` clears AA at 19px and above only; `exposure-deep` is the small-text cut.
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "rgb(var(--canvas-rgb) / <alpha-value>)",
        raised: "rgb(var(--raised-rgb) / <alpha-value>)",
        sunken: "rgb(var(--sunken-rgb) / <alpha-value>)",
        hairline: "rgb(var(--hairline-rgb) / <alpha-value>)",
        rule: "rgb(var(--rule-rgb) / <alpha-value>)",

        ink: "rgb(var(--ink-rgb) / <alpha-value>)",
        // These three are already an alpha of the ink, so they resolve rather
        // than taking a modifier: `rgb(channels / <alpha-value>)` defaults the
        // alpha to 1, which would render "muted" at full strength.
        "ink-muted": "var(--ink-muted)",
        "ink-subtle": "var(--ink-subtle)",

        // Money at risk, and statutory dates. At most three per viewport,
        // never on a button, never on a heading, never on a border.
        exposure: "rgb(var(--exposure-rgb) / <alpha-value>)",
        "exposure-deep": "rgb(var(--exposure-deep-rgb) / <alpha-value>)",
        "exposure-wash": "rgb(var(--exposure-wash-rgb) / <alpha-value>)",

        // The record that reconciled.
        books: "rgb(var(--books-rgb) / <alpha-value>)",
        "books-wash": "rgb(var(--books-wash-rgb) / <alpha-value>)",
        positive: "rgb(var(--positive-rgb) / <alpha-value>)",

        // The one inverted section on the site.
        plate: "rgb(var(--plate-rgb) / <alpha-value>)",
        "plate-ink": "rgb(var(--plate-ink-rgb) / <alpha-value>)",
        "plate-muted": "var(--plate-muted)",
        "plate-hairline": "rgb(var(--plate-hairline-rgb) / <alpha-value>)",
      },

      fontFamily: {
        // Two faces, one superfamily, both already in the repository and both
        // carrying the `zero` feature. The slashed zero this product's whole
        // legibility argument rests on is finally reachable on the figures
        // themselves, which it was not while they were set in a face whose
        // GSUB has no `zero` in it.
        sans: ["var(--font-plex-sans)", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["var(--font-plex-mono)", "ui-monospace", "SFMono-Regular", "Consolas", "monospace"],
      },

      /* Thirteen steps, named by role rather than by size, so nobody reaches
       * for an arbitrary `text-[1.3rem]` again. Ratios tighten through the
       * text range and open at display. Leading descends monotonically from
       * 1.59 to 0.98 and no step is looser than the step below it.
       *
       * Tracking runs in three tiers, not thirteen values: +0.08em on the
       * uppercase micro step, 0 through the text range, and negative from 21px
       * up, steepening to -0.05em at display. */
      fontSize: {
        // The only step allowed `text-transform: uppercase`, and at most one
        // per section.
        "label-12": ["0.75rem", { lineHeight: "1rem", letterSpacing: "0.08em" }],
        "caption-13": ["0.8125rem", { lineHeight: "1.25rem", letterSpacing: "0.01em" }],
        "ui-15": ["0.9375rem", { lineHeight: "1.4375rem" }],
        "copy-17": ["1.0625rem", { lineHeight: "1.6875rem" }],
        "copy-19": ["1.1875rem", { lineHeight: "1.875rem", letterSpacing: "-0.003em" }],

        "head-4": ["var(--head-4)", { lineHeight: "1.25", letterSpacing: "-0.012em" }],
        "head-3": ["var(--head-3)", { lineHeight: "1.18", letterSpacing: "-0.02em" }],
        "head-2": ["var(--head-2)", { lineHeight: "1.12", letterSpacing: "-0.02em" }],
        "head-1": ["var(--head-1)", { lineHeight: "1.08", letterSpacing: "-0.03em" }],

        "display-3": ["var(--display-3)", { lineHeight: "1.05", letterSpacing: "-0.04em" }],
        "display-2": ["var(--display-2)", { lineHeight: "1.0", letterSpacing: "-0.04em" }],
        // The hero headline. Once per page.
        "display-1": ["var(--display-1)", { lineHeight: "0.98", letterSpacing: "-0.05em" }],
        // The one large numeral. Once per page, and it caps at 96px — a figure
        // set larger than this reads as a template, not as confidence, and
        // this one comes from a seeded dataset besides.
        "figure-1": ["var(--figure-1)", { lineHeight: "1.0", letterSpacing: "-0.03em" }],
      },

      maxWidth: {
        // Four measures site-wide, in px. A `ch` is a different width in every
        // face, which is exactly how this page ended up with nineteen of them.
        display: "1040px",
        prose: "620px",
        lede: "520px",
        pull: "420px",
        sheet: "1200px",
      },

      spacing: {
        // Section rhythm. Three values, and there is no fourth.
        section: "72px",
        "section-md": "96px",
        "section-lg": "112px",
        block: "48px",
        stack: "32px",
      },

      borderRadius: {
        panel: "6px",
        chip: "4px",
        card: "10px",
      },

      boxShadow: {
        // Exactly one shadow token, for the hero card and floating panels.
        // Everything else is ruled.
        lift: "0 1px 2px rgb(17 17 16 / 0.04), 0 8px 24px -8px rgb(17 17 16 / 0.10)",
      },

      transitionTimingFunction: {
        // Two curves, and there is no third. `seat` is something arriving and
        // coming to rest; `press` is something answering a hand. Scroll-linked
        // work is always `linear` — a scroll timeline is already eased by the
        // reader's thumb, and easing it twice reads as lag.
        seat: "cubic-bezier(0.16, 0.84, 0.34, 1)",
        press: "cubic-bezier(0.2, 0.7, 0.3, 1)",
      },

      transitionDuration: {
        press: "120ms",
        mark: "160ms",
        panel: "220ms",
        seat: "320ms",
      },
    },
  },
  plugins: [],
};

export default config;
