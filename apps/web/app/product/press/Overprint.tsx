/**
 * A figure set three times, in two inks and their product.
 *
 * The page's argument is that two records did not land on top of each other,
 * and this is that argument rendered rather than described. The number is
 * drawn once in indigo shifted up and left, once in vermillion shifted down
 * and right, and once in the colour those two inks make when they multiply.
 * What a reader sees is a settled near-black figure with a coloured ghost
 * escaping on each diagonal: a press impression that is out of register.
 *
 * `mix-blend-mode: multiply` is doing something specific here and is not a
 * decorative filter. Two transparent inks on paper multiply, which is why
 * `agreed` (#16080A) is exactly `books` times `statute` computed channel by
 * channel rather than a near-black someone picked. Where the impressions
 * overlap the browser reproduces that multiply itself, so the overlap on
 * screen is the same arithmetic as the overlap on paper.
 *
 * Only the middle layer is real text. The two ghosts are `aria-hidden`, so a
 * screen reader is read one figure and not three, and selecting the number
 * copies it once.
 *
 * The offset is 0.022em, about 6px at the hero's 252px. The first cut used
 * 0.055em, which is a faithful scaling of a 1-4mm press slip but is not what
 * it looks like: two saturated ghosts thrown that far on opposite diagonals
 * read as a 3D extrusion, which is a different and much cheaper effect. The
 * slip has to be small enough that the eye reads one figure printed badly
 * rather than three figures stacked.
 */

export function Overprint({
  children,
  className = "",
  offset = "0.022em",
  drop = "0.014em",
}: {
  children: React.ReactNode;
  className?: string;
  offset?: string;
  drop?: string;
}) {
  return (
    <span className={`relative isolate inline-block ${className}`}>
      <span
        aria-hidden
        className="absolute inset-0 text-books mix-blend-multiply"
        style={{ transform: `translate(-${offset}, -${drop})` }}
      >
        {children}
      </span>
      <span
        aria-hidden
        className="absolute inset-0 text-statute mix-blend-multiply"
        style={{ transform: `translate(${offset}, ${drop})` }}
      >
        {children}
      </span>
      <span className="relative text-agreed mix-blend-multiply">{children}</span>
    </span>
  );
}
