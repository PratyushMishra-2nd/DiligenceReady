/**
 * The logo, which is the page's own divider standing still.
 *
 * The mark is two rules, one per ink, the second sitting below and to the
 * right of the first — the same two plates out of register that `Misregister`
 * draws between every section and closes to zero at the sign-off. That is the
 * whole reason it is drawn here rather than imported as a file: the identity
 * and the document are the same argument, and a PNG of it would be a second
 * copy of the palette that drifts the first time a token moves.
 *
 * `books` over `statute`, in that stacking order, because the page reads the
 * books first and the statute against them. The slip is 22% of the mark's
 * width and 38% of its height, which is the largest offset that still reads
 * as one impression printed badly rather than as two unrelated bars.
 *
 * The wordmark is live type — Anek at its tight width, the face the rest of
 * the page sets every magnitude in — so it is selectable, searchable, and
 * resizes with the reader's own type scale. Only the mark is an SVG, and it
 * is inline rather than an `<img>` so it takes `currentColor`'s place in the
 * print stylesheet and does not cost a request.
 *
 * `Diligence` in indigo and `Ready` in vermillion is the one place on the
 * page where the two inks sit in type rather than in a rule. It is allowed
 * here and nowhere else: the wordmark is the legend for the colour system,
 * so it has to show both inks to teach them.
 */

/** The mark alone: two plates, out of register. */
export function Mark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 24"
      className={className}
      role="presentation"
      aria-hidden
      focusable="false"
    >
      {/* Books. The upper plate, and the one a reader meets first. */}
      <rect x="0" y="3" width="31" height="7.5" className="ink-books fill-books" />
      {/* The statute, landing low and to the right of it. */}
      <rect x="9" y="13.5" width="31" height="7.5" className="ink-statute fill-exposure" />
    </svg>
  );
}

/**
 * The horizontal lockup: mark, wordmark, and the line that says what this is.
 *
 * `tagline` is off by default because the masthead already prints the
 * positioning line beside it in Newsreader, and a lockup that carried its own
 * would set the same sentence twice, four pixels apart, in two faces.
 *
 * The gap between mark and wordmark is `0.45em` of the wordmark rather than a
 * fixed pixel value, so the lockup holds its proportions at 20px in a masthead
 * and at 22px in a colophon without a second set of numbers.
 */
export function Logo({
  className = "",
  tagline = false,
}: {
  className?: string;
  tagline?: boolean;
}) {
  return (
    <span className={`inline-flex items-center gap-[0.45em] ${className}`}>
      {/* Sized off the type it sits beside: the mark's height is the cap
          height of the wordmark plus its slip, which is what puts the upper
          plate on the cap line and the lower one on the baseline. */}
      <Mark className="h-[0.86em] w-[1.43em] shrink-0" />
      <span className="inline-flex flex-col">
        <span className=" font-sans font-semibold leading-none tracking-tight">
          <span className="text-books">Diligence</span>
          <span className="text-exposure">Ready</span>
        </span>
        {tagline && (
          <span className="mt-[0.3em] font-mono text-[0.36em] uppercase leading-none tracking-[0.18em] text-ink-muted">
            Reconciliation for CA firms
          </span>
        )}
      </span>
    </span>
  );
}
