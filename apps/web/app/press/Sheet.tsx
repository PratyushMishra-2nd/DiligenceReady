import type { ReactNode } from "react";

import { SplitHeading } from "./SplitHeading";

/**
 * The sheet, and the rail beside it.
 *
 * What survived the rewrite and what did not, because the two layers under
 * this page were not the same idea:
 *
 *   The WORKING PAPER — an index, a tick mark in the margin against every
 *   assertion, a footed column, a sign-off that stays blank until someone
 *   reviews it. This is about the buyer's job. A partner has signed a thousand
 *   of these. It is the strongest thing this design owns and it is kept.
 *
 *   The PRINTING PRESS — trim marks, registration targets, colour bars,
 *   misregistering rules, ghost plates behind every heading, a nine-step slip
 *   ladder, "Plate 1" captions. This is about printing. The product does not
 *   print. It cost about eight hundred lines, ten components and every one of
 *   them was `aria-hidden`, which is a clean way of saying they carried no
 *   information at all. All of it is gone.
 *
 * The apparatus that remains is structure rather than ornament, which is the
 * test: does it change what a reader understands or does, or does it only
 * describe the page to itself? The rail passes. A registration target did not.
 *
 * The rail is 220px and fixed, the measure takes the rest, and the section
 * carries its number and its mark up there — so a reader in a long document
 * always knows where they are. That is wayfinding this page did not have; the
 * old grid put a 40px gutter beside the text and called it an index.
 */

export type Mark = "traced" | "computed" | "stated";

export const MARKS: { mark: Mark; name: string; meaning: string }[] = [
  {
    mark: "traced",
    name: "Traced",
    meaning: "backed by code in the repository rather than by a claim made on this page",
  },
  {
    mark: "computed",
    name: "Computed",
    meaning:
      "derived from the seeded dataset by a generator, and reproduced whenever it is re-run",
  },
  {
    mark: "stated",
    name: "Stated",
    meaning: "how this is built and how it is sold, rather than a figure out of the data",
  },
];

/**
 * Three shapes, not three colours.
 *
 * The mark has to survive a laser printer and Windows High Contrast, where
 * `forced-colors: active` replaces every fill with a system colour and a
 * distinction carried by hue stops existing. Filled, outlined and ruled remain
 * three different things in one ink.
 */
export function TickMark({ mark }: { mark: Mark }) {
  if (mark === "stated") {
    return <span aria-hidden className="tick-mark block h-0.5 w-3.5 bg-ink-subtle" />;
  }
  return (
    <span
      aria-hidden
      className={`tick-mark block h-2.5 w-2.5 ${
        mark === "traced" ? "bg-exposure" : "border border-exposure"
      }`}
    />
  );
}

export function Sheet({
  id,
  mark,
  index,
  children,
}: {
  id?: string;
  mark: Mark;
  /** The section's own number, as a working paper folios its schedules. */
  index?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="sheet scroll-mt-24 border-t border-hairline py-section md:py-section-md lg:py-section-lg"
    >
      <div className="grid gap-x-block gap-y-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        {/* The rail. On a phone it lies down and runs along the top of the
            measure, because that is where a mark goes on a narrow sheet — it
            does not disappear. The apparatus is the argument; it cannot be
            the desktop's copy of the argument. */}
        <div className="flex items-center gap-3 lg:block">
          <TickMark mark={mark} />
          {index && (
            <span className="font-mono text-label-12 uppercase text-ink-subtle lg:mt-4 lg:block">
              {index}
            </span>
          )}
        </div>
        <div className="reveal min-w-0">{children}</div>
      </div>
    </section>
  );
}

/**
 * A section opener.
 *
 * This used to split its own text into line boxes, measure each one through a
 * canvas, binary-search the narrowest width that held the same line count, and
 * then print every line three times in two inks behind itself. The measuring
 * was genuinely good work. The printing three times was a bug: it put three
 * copies of every heading into `document.body.textContent`, so Ctrl+F matched
 * three times, and Googlebot, the WhatsApp and LinkedIn preview scrapers and
 * every answer engine read
 *
 *     "What it costsWhat it costsWhat it costsWhat it costs"
 *
 * on every section of the site — and, through the same component, the firm
 * dashboard's headline figure three times over at the moment of maximum trust.
 * That is the mechanism by which this page read as machine-generated, and it
 * was one component.
 *
 * A heading is now a heading. What the measuring pass is kept for is the one
 * thing `text-wrap: balance` cannot give you: knowing where the lines fall
 * BEFORE anything paints, so each line can be its own element and seat in
 * turn without a render-measure-rerender flash. The lines are driven by a
 * view timeline, so a heading sets itself as the reader arrives at it.
 *
 * A heading whose children are not a plain string — one carrying a link or a
 * span — renders whole, because there is nothing to measure.
 */
export function Opener({
  children,
  id,
  className = "",
}: {
  children: ReactNode;
  id?: string;
  className?: string;
}) {
  const cls = `rag-balance leading-trim max-w-display font-sans text-head-1 font-medium text-ink ${className}`;

  if (typeof children === "string") {
    // JSX hands a heading written across several source lines back as one
    // string carrying the newlines and the indentation with it. Measuring
    // that measures the whitespace too.
    const text = children.replace(/\s+/g, " ").trim();
    if (text) return <SplitHeading as="h2" scroll text={text} className={cls} />;
  }

  return (
    <h2 id={id} className={cls}>
      {children}
    </h2>
  );
}

/** A standfirst. One per section, never more than three lines. */
export function Deck({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p className={`rag-pretty mt-6 max-w-lede font-sans text-copy-19 text-ink-muted ${className}`}>
      {children}
    </p>
  );
}

export function Schedule({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <dl className={`border-t border-hairline ${className}`}>{children}</dl>;
}

export function ScheduleRow({
  term,
  state,
  tone = "plain",
  note,
}: {
  term: ReactNode;
  state?: ReactNode;
  tone?: "plain" | "exposure";
  note?: ReactNode;
}) {
  return (
    <div className="mark-verb grid gap-x-6 gap-y-1 border-b border-hairline py-3 hover:bg-sunken sm:grid-cols-[minmax(0,1fr)_auto]">
      <dt className="rag-pretty max-w-prose font-sans text-copy-17 text-ink">
        {term}
        {note && (
          <span className="mt-1 block text-caption-13 leading-relaxed text-ink-muted">{note}</span>
        )}
      </dt>
      {state && (
        <dd
          className={`shrink-0 font-mono text-label-12 uppercase sm:text-right ${
            tone === "exposure" ? "text-exposure-deep" : "text-ink-muted"
          }`}
        >
          {state}
        </dd>
      )}
    </div>
  );
}
