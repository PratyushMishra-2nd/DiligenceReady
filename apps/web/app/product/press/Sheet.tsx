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
 * `grid-cols-paper` has been sitting in the tailwind config this whole time
 * with a comment explaining why it had to become a token, and nothing ever
 * used it. Three columns: the tick gutter, the measure, and the
 * cross-reference margin. Every section is on it now, and all three columns
 * carry something.
 *
 * The right-hand column is the one that changes the page. Every section used
 * to end in three or four hundred pixels of dead paper; in a working paper
 * that margin holds the cross-reference, so here it holds the repository -
 * the file and line that backs the claim standing beside the claim. The page
 * stops looking designed and starts looking audited, which is what it is
 * arguing about.
 */

/**
 * What a mark is worth.
 *
 * Deliberately falsifiable. `traced` means a reader can open the named file
 * and find the thing; `computed` means the generator derived it from the
 * seed and re-running it would reproduce the figure; `pending` means it is
 * not built and the page says so.
 *
 * The mark that appears nowhere on this page is `confirmed` - agreed with an
 * external party - because no practising CA has reviewed the rule set. Its
 * absence is the page's epistemic position, and the legend states it in
 * those words rather than leaving the reader to notice.
 */
export type Mark = "traced" | "computed" | "pending";

export const MARKS: { mark: Mark; name: string; meaning: string }[] = [
  {
    mark: "traced",
    name: "Traced",
    meaning: "opened in the repository, at the file and line printed beside the claim",
  },
  {
    mark: "computed",
    name: "Computed",
    meaning:
      "derived from the seed feeds by scripts/build_landing_aggregates.py, and reproduced whenever it is re-run",
  },
  {
    mark: "pending",
    name: "Not built",
    meaning: "stated on this page as unbuilt, and not claimed anywhere else",
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
  if (mark === "pending") {
    return <span aria-hidden className="mt-3 block h-px w-3 bg-graphite-soft" />;
  }
  return (
    <span
      aria-hidden
      className={`mt-[10px] block h-2.5 w-2.5 ${
        mark === "traced" ? "bg-statute" : "border border-statute"
      }`}
    />
  );
}

/**
 * One section of the paper: mark, measure, margin.
 *
 * `reference` is the cross-reference and it is a real one. If a section
 * cannot name the file that backs it, it should not carry a mark.
 */
export function Sheet({
  id,
  mark,
  reference,
  children,
}: {
  id?: string;
  mark: Mark;
  reference: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-10 py-20">
      <div className="grid gap-x-10 gap-y-4 lg:grid-cols-paper">
        <div className="hidden lg:block">
          <TickMark mark={mark} />
        </div>
        <div className="min-w-0">{children}</div>
        {/* The cross-reference. Below `lg` it folds under the claim behind a
            hairline, which is what a margin column does when a working paper
            is photocopied onto A4. */}
        <Reference>{reference}</Reference>
      </div>
    </section>
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
    <section className="border-t border-hairline py-12">
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
        <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-baseline">
          <dt aria-hidden className="font-mono text-stub text-graphite-soft">
            —
          </dt>
          <dd className="rag-pretty opsz-prose max-w-[72ch] font-news text-ident leading-relaxed text-graphite-soft">
            <span className="text-graphite">Confirmed</span> — agreed with an external
            party. No claim on this page carries this mark, because no practising CA has
            reviewed the rule set yet.
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
 * The offsets are small — a third of the hero's at most — because at 116px
 * anything larger stops reading as a slip and starts reading as a blur.
 */
export function Opener({
  slip,
  className = "",
  children,
}: {
  slip: number;
  className?: string;
  children: ReactNode;
}) {
  const settled = slip <= 0.02;
  const head = (
    <span className={`rag-balance wdth-tight font-anek text-opener font-bold ${className}`}>
      {children}
    </span>
  );
  if (settled) return <h2 className="text-agreed">{head}</h2>;
  return (
    <h2>
      <Overprint
        offset={`${(0.010 * slip).toFixed(4)}em`}
        drop={`${(0.006 * slip).toFixed(4)}em`}
      >
        {head}
      </Overprint>
    </h2>
  );
}

/**
 * A cross-reference, broken where a path is allowed to break.
 *
 * `break-all` will split anywhere it runs out of room, which turns
 * `ingest/feeds.py` into `inges` / `t/feeds.py` — a path cut mid-word, which
 * is the one thing a reference must never be, because a reader is meant to
 * be able to read it back to a file. A `<wbr>` after each separator gives the
 * browser the break opportunities a path actually has, and it takes them only
 * when it needs to.
 */
export function Reference({ children }: { children: string }) {
  const parts = children.split("/");
  return (
    <p className="border-l border-hairline pl-3 font-mono text-stub leading-relaxed text-graphite-soft lg:border-0 lg:pl-0">
      {parts.map((part, index) => (
        <span key={index}>
          {part}
          {index < parts.length - 1 && (
            <>
              /<wbr />
            </>
          )}
        </span>
      ))}
    </p>
  );
}
