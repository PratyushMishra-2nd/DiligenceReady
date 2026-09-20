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

const MAX_DROP = 6;
const MAX_SHIFT = 40;
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
      {/* The books plate. Always on register; it is the statute plate that
          has slipped, which is also the argument. */}
      <div
        className={settled ? "absolute inset-x-0 top-0 bg-agreed" : "absolute inset-x-0 top-0 bg-books"}
        style={{ height: WEIGHT }}
      />
      {!settled && (
        <div
          className="absolute right-0 bg-statute"
          style={{ height: WEIGHT, top: drop, left: shift }}
        />
      )}
    </div>
  );
}
