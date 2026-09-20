/**
 * The section divider, which is the page's own misregistration.
 *
 * Two rules, one per ink, the second sitting below and to the right of the
 * first. Every divider down the page is drawn closer to register than the one
 * above it, and the last one, at the sign-off, is exactly zero: a single rule
 * in the colour the two inks make together.
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
  const settled = slip <= 0;
  const drop = Math.round(MAX_DROP * slip);
  const shift = Math.round(MAX_SHIFT * slip);

  return (
    <div
      aria-hidden
      className="relative w-full"
      style={{ height: WEIGHT + Math.max(drop, 0) }}
    >
      {/* Settled: one rule, in the colour the two inks make together. This is
          what the whole progression is walking toward, and it only means
          anything if it actually ships — see the foot of the landing page. */}
      <div
        className={`absolute inset-x-0 top-0 ${settled ? "bg-agreed" : "bg-books"}`}
        style={{ height: WEIGHT }}
      />
      {!settled && (
        <div
          className="absolute inset-x-0 top-0 bg-statute"
          style={{ height: WEIGHT, transform: `translate(${shift}px, ${drop}px)` }}
        />
      )}
    </div>
  );
}
