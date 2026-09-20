/**
 * The section divider, which is the page's own misregistration.
 *
 * Two rules, one per ink, the second sitting below and to the right of the
 * first. Every divider down the page is drawn closer to register than the one
 * above it, and the last one, at the sign-off, is exactly zero — at which
 * point the two inks land on each other and make a single rule in the colour
 * they produce together.
 *
 * The document reconciles itself as you read it, and nothing animates to tell
 * you so. It is a static layout progression that a reader discovers by
 * scrolling, which is how type on a building works. There is no scroll
 * listener, no observer and no client JavaScript involved in any of it.
 *
 * `slip` is 1 at the top of the page and 0 at the foot. The caller passes its
 * position rather than the component counting, because a divider that knew
 * how many siblings it had would be a divider that broke when a section was
 * added.
 */

// A press slip translates the whole plate. The first cut inset one end
// instead — the statute rule was `right-0` with a `left` offset — so the
// right edges stayed flush and what a reader saw was a short red rule tucked
// under a long blue one. That is a nested-rule graphic, not a registration
// error, and by the third divider the two were close enough to read as a
// single thick maroon line, so the progression down the page was
// imperceptible.
//
// Both ends now move together, the vertical separation carries most of the
// signal, and the horizontal shift is small enough to read as slip rather
// than as indent.
const MAX_DROP = 10;
const MAX_SHIFT = 14;
const WEIGHT = 2;

export function Misregister({ slip }: { slip: number }) {
  // Rounded, and that is not laziness. A 2px rule drawn on a fractional
  // pixel boundary is resampled across two rows of pixels, and a saturated
  // vermillion hairline at 50% coverage renders as a grey smear rather than
  // as a line. Type tolerates sub-pixel positioning; rules of this weight do
  // not. Whatever drives `slip`, the rules land on integers.
  const drop = Math.round(MAX_DROP * slip);
  const shift = Math.round(MAX_SHIFT * slip);

  return (
    <div
      aria-hidden
      className="relative w-full"
      // Constant, and deliberately not `WEIGHT + drop`.
      //
      // The height used to be a function of `slip`, which made a decorative
      // offset into a layout input: every divider reserved a different amount
      // of vertical space depending on how far out of register it was, so the
      // whole document's rhythm was set by an ink effect. It also meant the
      // progression could never be animated — driving `slip` continuously
      // would have resized eleven dividers on every frame and reflowed
      // thirteen thousand pixels below each one.
      //
      // The plate travels inside a fixed box now. The box is as tall as the
      // furthest the plate can fall, so nothing moves but the ink.
      style={{ height: WEIGHT + MAX_DROP }}
    >
      {/* Two plates, always. There used to be a `settled` branch that swapped
          both rules for a single one painted in `agreed` at slip 0 — and that
          was the page faking its own central claim.

          `agreed` (#16080A) is exactly `books` (#1D3461) multiplied by
          `statute` (#C4291B) channel by channel; the palette computes it
          rather than picking it, and the whole document is set in the result.
          But the dividers were not producing that colour, they were painting
          it on. The one place where two impressions actually land on each
          other was the one place the multiply was simulated.

          Both rules carry `mix-blend-multiply` now, so where they overlap the
          browser performs the same arithmetic the two inks perform on paper,
          and the settled divider at the foot of the page is `agreed` because
          the inks made it — not because a third token was substituted when
          nobody was looking.

          It also removes the DOM branch. Three layers that become one cannot
          be animated; two layers that converge can. */}
      <div
        className="absolute inset-x-0 top-0 bg-books mix-blend-multiply"
        style={{ height: WEIGHT }}
      />
      {/* `translate` rather than `transform`, and the offset also travels as
          two custom properties.
       *
       * The static `translate` IS the page as it has always been: a staircase
       * of eleven dividers, each closer to register than the one above. That
       * is what a browser without scroll-driven animations renders, and it
       * loses nothing.
       *
       * Where they are supported, globals.css hands this element a scroll
       * timeline that runs `--slip-x`/`--slip-y` down to zero, so the
       * staircase becomes continuous and the document closes under the
       * reader rather than in nine discrete jumps. The page's own docstring
       * has always claimed the progression "has been closing since the hero";
       * until now it was closing in steps nobody could perceive as motion.
       *
       * `translate` is the separate transform property, which Chromium and
       * Safari 26.4 both run on the compositor. The endpoints are static
       * custom properties read once when the keyframe resolves — they are
       * never themselves animated, which matters: registered custom
       * properties are explicitly NOT compositable, and animating one would
       * rasterise this whole rule on the main thread every frame. */}
      <div
        className="misregister-plate absolute inset-x-0 top-0 bg-statute mix-blend-multiply"
        style={
          {
            height: WEIGHT,
            translate: `${shift}px ${drop}px`,
            "--slip-x": `${shift}px`,
            "--slip-y": `${drop}px`,
          } as React.CSSProperties
        }
      />
    </div>
  );
}
