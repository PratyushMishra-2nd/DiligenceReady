import type { ReactNode } from "react";

import { Overprint } from "./Overprint";

/**
 * The working paper's apparatus, which the page has specified since it was
 * written and never built.
 *
 * A CA's working paper carries five things: an index, a tick mark in the
 * margin against every assertion, a legend at the foot defining those marks,
 * a footed column, and a sign-off block that stays blank until someone
 * reviews it. This page claimed all five in its own docstring and shipped
 * about two of them.
 *
 * Two columns: the tick gutter and the measure.
 *
 * There was a third — a margin carrying the repository path that backed each
 * claim. It came out. A file name is an answer to a question a visitor is not
 * asking: a partner deciding whether to trust a reconciliation engine does not
 * want to be shown where the source file lives, and a page that prints its own
 * directory structure in the margin is talking to the person who wrote it.
 * The claims stand on what they say now, and the repository is one link in the
 * colophon for the reader who wants it.
 */

/**
 * What a mark is worth.
 *
 * Deliberately falsifiable. `traced` means a reader can open the named file
 * and find the thing; `computed` means the generator derived it from the
 * seed and re-running it would reproduce the figure; `pending` means it is
 * not built and the page says so.
 *
 * Three marks, three shapes, no colour carrying the distinction on its own, so
 * it survives a monochrome print and a reader who does not separate red from
 * black.
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
 * The mark itself: a filled square, an open one, or a rule.
 *
 * Three shapes, not three colours. The distinction survives a monochrome
 * print and a reader who does not separate red from black, which is the same
 * rule the rest of the palette follows.
 */
export function TickMark({ mark }: { mark: Mark }) {
  // The top margin is what drops the mark onto the first line of the heading
  // beside it, so it belongs to the gutter and not to the mark. Below `lg`
  // there is no gutter — the mark stacks above the measure — and carrying the
  // optical offset down there indents nothing against nothing.
  if (mark === "stated") {
    return (
      <span aria-hidden className="tick-mark block h-0.5 w-3.5 bg-graphite-soft lg:mt-3" />
    );
  }
  return (
    <span
      aria-hidden
      className={`tick-mark block h-3 w-3 lg:mt-[10px] ${
        mark === "traced" ? "bg-statute" : "border border-statute"
      }`}
    />
  );
}

/**
 * One section of the paper: the mark, and the measure it belongs to.
 *
 * The mark is the only piece of the working-paper apparatus that still shows
 * on screen, so it carries the whole of it. A section that cannot honestly
 * take one should not be a `Sheet`.
 */
export function Sheet({
  id,
  mark,
  children,
}: {
  id?: string;
  mark: Mark;
  children: ReactNode;
}) {
  return (
    <section id={id} className="sheet scroll-mt-24 py-14">
      <div className="grid gap-x-10 gap-y-4 lg:grid-cols-paper">
        {/* On screen at every width, which it was not. The gutter only exists
            above `lg`, so the mark was `hidden lg:block` and a phone — where
            most of this page is read — got a working paper with no marks in
            it. Below `lg` it stacks above the measure instead, which is where
            a mark goes on a narrow sheet. The apparatus is the argument; it
            cannot be the desktop's copy of the argument. */}
        <div>
          <TickMark mark={mark} />
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </section>
  );
}

/**
 * A schedule: terms on the left, their state on the right, one hairline
 * between each.
 *
 * Five sections of this page are the same shape — a claim and a verdict on it
 * — and each had grown its own copy of the markup. A schedule is the form a
 * working paper states a list of assertions in, so it is one component, and
 * the `state` is a word rather than a colour for the reason the rest of the
 * palette gives: the distinction has to survive a monochrome print.
 */
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
  tone?: "plain" | "statute";
  note?: ReactNode;
}) {
  return (
    <div className="mark-verb grid gap-x-6 gap-y-1 border-b border-hairline py-3 hover:bg-agreed-wash/40 sm:grid-cols-[minmax(0,1fr)_auto]">
      <dt className="rag-pretty opsz-prose max-w-sheet font-news text-prose text-agreed">
        {term}
        {note && (
          <span className="mt-1 block font-news text-ident leading-relaxed text-graphite">
            {note}
          </span>
        )}
      </dt>
      {state && (
        <dd
          className={`shrink-0 font-mono text-stub uppercase sm:text-right ${
            tone === "statute" ? "text-statute-deep" : "text-agreed"
          }`}
        >
          {state}
        </dd>
      )}
    </div>
  );
}

/**
 * The legend, at the foot, defining the marks the page has been using.
 *
 * It is the fifth working-paper element and it was missing entirely, which
 * meant the marks above were decoration: a mark means something only if it
 * was defined before it was used, and a reader can only check that if the
 * definition is on the page.
 */
export function Legend() {
  return (
    <section className="legend max-w-sheet border-t border-hairline py-12">
      <h2 className="font-mono text-stub uppercase text-graphite">Tick mark legend</h2>
      <dl className="mt-5 grid gap-y-3">
        {MARKS.map(({ mark, name, meaning }) => (
          <div key={mark} className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-baseline">
            <dt className="flex items-center">
              <TickMark mark={mark} />
            </dt>
            <dd className="rag-pretty opsz-prose max-w-[72ch] font-news text-ident leading-relaxed text-graphite">
              <span className="text-agreed">{name}</span> — {meaning}
            </dd>
          </div>
        ))}

        {/* The fourth mark, which is the reason the legend is worth printing.
            A legend that lists only the marks a document managed to earn is a
            key to its own good news. The mark a working paper cares most
            about is the one for an assertion confirmed by somebody outside
            the firm that made it, and this page cannot use it: nobody outside
            has confirmed anything here. So it is listed, with its gutter left
            empty, and the empty gutter is the claim.

            The page's own docstring has asserted for several passes that "the
            legend says so in those words". Until this row existed, it did
            not. */}
        <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-baseline border-t border-hairline pt-3">
          <dt className="flex items-center" aria-hidden />
          <dd className="rag-pretty opsz-prose max-w-[72ch] font-news text-ident leading-relaxed text-graphite">
            <span className="text-agreed">Confirmed</span> — checked against a party
            outside this company. It appears nowhere above, and the gutter beside this
            line is empty for the same reason: no practising CA has reviewed the rule
            set yet. The sign-off rule at the foot of this sheet is blank because that
            mark is unearned, and it stays blank until it is not.
          </dd>
        </div>
      </dl>
    </section>
  );
}

/**
 * A section heading, printed slightly out of register.
 *
 * The overprint existed on exactly one number on the whole site, and the
 * convergence happened on the rules between sections — which is to say, on
 * the two things a reader looks at least. Putting it on the headings tells
 * the same story where the eye actually goes, and it makes the hero's
 * treatment read as the first instance of a system rather than as a one-off.
 *
 * `slip` matches the divider above it, so a heading is always as far out of
 * register as the rule that introduced it, and both arrive together at the
 * foot of the page.
 *
 * The offsets were small — and then they were so small that the effect the
 * whole page is named after did not exist. At `0.010em * slip` the first
 * opener slipped 1.16px at 116px and the last one 0.14px, which is below the
 * threshold at which an eye resolves anything: measured on screen the headings
 * were pure black and the only thing a reader could see was font
 * antialiasing. The page asserted a press slip in its copy and never printed
 * one.
 *
 * `Overprint` carries a pixel floor for exactly this reason and this call site
 * was bypassing it by passing em values of its own. It now passes the floor
 * too, and the coefficient is 0.026em rather than 0.010em: about 3px at the
 * first opener, converging to nothing at the sign-off, which is the
 * progression that was always intended and never visible.
 */
export function Opener({
  slip,
  className = "",
  size = "text-opener",
  children,
}: {
  slip: number;
  className?: string;
  /**
   * One global clamp was setting every opener on the page, and clamp
   * arithmetic is not composition. Measured across three consecutive
   * sections the display block ran 767px, then 1190px, then 290px — and
   * "The model cannot produce a number" broke to a single six-letter word
   * on its second line with eight hundred pixels of hole beside it. A
   * heading whose word count does not suit the measure gets the next step
   * down rather than an orphan.
   */
  size?: string;
  children: ReactNode;
}) {
  const settled = slip <= 0.02;
  const head = (
    <span className={`rag-balance wdth-tight font-anek ${size} font-bold ${className}`}>
      {children}
    </span>
  );
  if (settled) return <h2 className="text-agreed">{head}</h2>;
  return (
    <h2>
      {/* Pixels, not ems, and that is not laziness.
          `Overprint` puts its ghost layers directly inside its own wrapper,
          and the size class lives on the span *inside* it — so an em offset
          here resolves against an inherited 16px rather than against the
          115px the heading is actually set at. Measured, `0.026em` came out
          as 0.42px. The unit that works is the one the value is meant to be
          in. The openers are clamped between 56px and 116px, a range of about
          two, so a fixed pixel slip reads correctly across the whole ramp. */}
      <Overprint
        offset={`${(6.0 * slip).toFixed(2)}px`}
        drop={`${(3.6 * slip).toFixed(2)}px`}
      >
        {head}
      </Overprint>
    </h2>
  );
}

