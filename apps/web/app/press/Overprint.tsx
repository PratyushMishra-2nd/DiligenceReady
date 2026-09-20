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
 * screen reader is read one figure and not three, and `select-none`, so
 * selecting the number copies it once.
 *
 * That second class was missing and the sentence above was false for as long
 * as it was. `aria-hidden` takes a node out of the accessibility tree and out
 * of nothing else, so the hero figure came out of a copy as
 * `₹16,25,635.64₹16,25,635.64₹16,25,635.64`. On a page whose argument is that
 * every figure is checkable, the headline figure could not be pasted into a
 * spreadsheet, which is the first thing a CA does with a number. Measured
 * after the change: selecting the figure yields it once, and selecting the
 * whole document yields each opener once.
 *
 * What `select-none` does not fix, said here rather than left for someone to
 * discover: `document.body.textContent` still carries three copies, because
 * the ghosts are real text nodes and no CSS property takes a node out of the
 * text stream. Find-in-page and a crawler both read that stream, so Ctrl+F
 * still matches a heading three times and the indexed text of this page is
 * still tripled.
 *
 * Closing that would mean the ghosts becoming pseudo-elements drawing from a
 * `data-` attribute, which needs `children` to be a string — and three of the
 * five call sites pass an element (`<Rupee>` twice, and the sized span
 * `Opener` builds). It is a refactor of the effect this whole document is
 * named after, so it is not being done in passing as part of a correctness
 * fix. The cost today is SEO and Ctrl+F; the reader's copy is correct.
 *
 * The offset is 0.022em, about 6px at the hero's 252px. The first cut used
 * 0.055em, which is a faithful scaling of a 1-4mm press slip but is not what
 * it looks like: two saturated ghosts thrown that far on opposite diagonals
 * read as a 3D extrusion, which is a different and much cheaper effect. The
 * slip has to be small enough that the eye reads one figure printed badly
 * rather than three figures stacked.
 */

/**
 * `settle` makes the impression land rather than be there already.
 *
 * The two coloured plates start six times their slip out of register and pull
 * in, once, over 620ms — the press taking the impression this figure is a
 * picture of. It is passed only where a reader meets a figure before they have
 * scrolled: the hero, and the answer on the Section 16(4) tool. Every other
 * overprint on the page is below the fold, and animating one there would make
 * this a scroll reveal, which is the effect the whole document declines.
 *
 * The offsets travel as custom properties because the keyframes have to end
 * exactly where the static layout would have put the layer. Written as literal
 * transforms in the CSS they would end somewhere near it, and the figure would
 * jump on the last frame of its own argument about registration.
 */
export function Overprint({
  children,
  className = "",
  offset = "max(1.5px, 0.022em)",
  drop = "max(1px, 0.014em)",
  settle = false,
}: {
  children: React.ReactNode;
  className?: string;
  offset?: string;
  drop?: string;
  settle?: boolean;
}) {
  const plate = (x: string, y: string, ink: string) => {
    const vars = { "--ink-x": x, "--ink-y": y } as React.CSSProperties;
    return (
      <span
        aria-hidden
        className={`absolute inset-0 select-none mix-blend-multiply ${ink} ${settle ? "ink-settle" : ""}`}
        style={settle ? vars : { transform: `translate(${x}, ${y})` }}
      >
        {children}
      </span>
    );
  };

  return (
    <span className={`relative isolate inline-block ${className}`}>
      {plate(`calc(-1 * ${offset})`, `calc(-1 * ${drop})`, "text-books")}
      {plate(offset, drop, "text-statute")}
      <span className="relative text-agreed mix-blend-multiply">{children}</span>
    </span>
  );
}
