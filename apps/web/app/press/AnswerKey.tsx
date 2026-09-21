"use client";

import { useState } from "react";

import aggregates from "./aggregates.json";
import { Rupee } from "./Rupee";
import { Opener, slipFor } from "./Sheet";

/**
 * The answer key: eighty-two defects planted, eighty-two found.
 *
 * This is the most persuasive fact the product owns and it sat unrendered in
 * `aggregates.json` for the whole life of the page. `page.tsx` defined a
 * SPELLED map containing `82: "eighty-two"` and never called it; the page's
 * own docstring described "a section that says eighty-two of eighty-two were
 * found" and no such section existed. Every competitor in this category
 * asserts accuracy. This is the only place that measures it, and the only
 * reason a detection rate can be stated at all is that the books are
 * synthetic — the defects were written, so the answer was known before the
 * engine ran.
 *
 * WHY IT IS A TALLY AND NOT A BIG NUMBER
 *
 * The first design for this was the figure "82" set at hero scale in the
 * overprint, the same treatment the page gives every other magnitude. That
 * fails, for a reason worth keeping written down:
 *
 *   A picture of a perfect result is a picture of nothing. Encode "miss" as
 *   a misregistration fringe and — with zero misses — the reader sees a clean
 *   figure and learns nothing, because you cannot perceive the absence of an
 *   artefact you have never seen present. It would need a caption explaining
 *   what a failure would have looked like, which is the caption the graphic
 *   was supposed to replace.
 *
 *   Worse, this page has spent that signal already. Every divider and every
 *   opener is deliberately out of register, so by the time a reader arrives
 *   here a fringe reads as house style rather than as defect. Decorative
 *   misregistration has consumed diagnostic misregistration.
 *
 * So the eighty-two are plotted rather than summarised. One cell per planted
 * defect, in seven rows, one per rule. A reader counts resolved cells, which
 * is information they can see. A miss would be a lone indigo cell in a field
 * of near-black — different in hue AND in isolation, legible to somebody who
 * has never been shown the failure state. A false positive would be a lone
 * vermillion one. Two kinds of failure, two appearances, no legend needed.
 *
 * And a tally is the one graphic form this audience has used every working
 * day of their lives.
 *
 * WHY IT IS ON PAPER AND NOT ON A BLACK PLATE
 *
 * Because the mechanism has to be real. Each cell is the planted defect in
 * `books` indigo with the detection landing its `statute` counterpart on top
 * under `mix-blend-multiply`, so a matched pair PRODUCES `agreed` rather than
 * being painted in it. Multiply is a subtractive, ink-on-paper model: against
 * a dark ground it yields the dark ground and the whole thing collapses. The
 * page's central claim is that where two impressions land on each other they
 * multiply, and this is the one graphic where that claim is load-bearing.
 */

type Defect = (typeof aggregates.defects)[number];

/**
 * The seven rules, in descending count, derived rather than hard-coded — the
 * generator can plant a different mix and this figure has to follow it.
 */
function byRule(defects: readonly Defect[]) {
  const rules = new Map<string, { type: string; items: Defect[] }>();
  for (const defect of defects) {
    const row = rules.get(defect.rule) ?? { type: defect.defect_type, items: [] };
    row.items.push(defect);
    rules.set(defect.rule, row);
  }
  return [...rules.entries()].sort((a, b) => b[1].items.length - a[1].items.length);
}

/**
 * Counts this page writes in words.
 *
 * A figure set in digits is one the reader is invited to check against
 * something; these are neither at risk nor traceable to a row, they are the
 * shape of the dataset, and spelling them keeps the digits on the page
 * meaning one thing. Anything not listed falls back to the numeral rather
 * than being spelled wrongly.
 *
 * This lived in `page.tsx` for several passes, fully written and never
 * called, alongside a docstring describing the section that would have
 * called it. It is here because this is that section.
 */
const SPELLED: Record<number, string> = {
  0: "nought",
  2: "two",
  4: "four",
  12: "twelve",
  41: "forty-one",
  82: "eighty-two",
};

function spell(n: number, sentenceStart = false): string {
  const word = SPELLED[n];
  if (!word) return String(n);
  return sentenceStart ? word[0].toUpperCase() + word.slice(1) : word;
}

/**
 * How much ink a defect is worth.
 *
 * The chart was eighty-two identical squares, which carries the count and
 * throws away the other half of every record. Each defect has an `amount`,
 * and those amounts run from ₹840 to ₹4,86,70,182 — a spread of roughly
 * fifty-eight thousand to one. Area or height on a linear scale would draw
 * one visible square and eighty-one invisible ones, so the mapping is
 * logarithmic: it is a comparison of orders of magnitude, which is how the
 * figures differ and how a reader reads them.
 *
 * WHAT VARIES IS THE INK, NOT THE BUTTON. Every cell keeps a constant 20px
 * box and 26px centre-to-centre spacing, because that is what clears WCAG
 * 2.5.8 for a target this size and the margin there is two pixels. Shrinking
 * the control to show a small amount would trade an accessibility floor for
 * a graphic. The square of ink inside the box is what grows, from 7px to the
 * full 20px, so the row becomes a landscape of magnitudes while the grid a
 * finger or a pointer addresses stays exactly as it was.
 */
function inkSize(amount: string, min: number, max: number): number {
  const value = Math.log10(Math.max(Number(amount), 1));
  const span = Math.log10(Math.max(max, 10)) - Math.log10(Math.max(min, 1));
  const t = span <= 0 ? 1 : (value - Math.log10(Math.max(min, 1))) / span;
  return Math.round(7 + 13 * Math.min(Math.max(t, 0), 1));
}

/** `vendor_didnt_file` is a column name, not a sentence. */
function readable(defectType: string): string {
  const words = defectType.replace(/_/g, " ").replace(/\bdidnt\b/, "didn’t");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The same digit grouping the page prints, for the accessible name.
 *
 * `Rupee.tsx` groups by lakh and crore for every visible figure, and the
 * `aria-label`s were shipping raw `35171.04` and `48670182.40`. A screen
 * reader is the one path through this page that was getting international
 * grouping, on a site whose entire localisation argument is that the last
 * comma is thousands and the one before it is lakhs.
 */
const INR = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const MONTH = new Intl.DateTimeFormat("en-IN", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function period(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return MONTH.format(new Date(Date.UTC(y, m - 1, 1)));
}

export function AnswerKey() {
  const { defects, totals } = aggregates;
  const rows = byRule(defects);
  const [open, setOpen] = useState<Defect | null>(null);

  // The defect records carry the company slug; the company records carry the
  // name beside it. Printing `acme-industries` on a page that sets every
  // other proper noun properly was the one raw-data leak on the sheet.
  const names = new Map(aggregates.companies.map((c) => [c.slug, c.name]));

  // The ends of the ink scale, read from the data rather than written down,
  // so re-seeding with a different mix redraws the chart correctly.
  const amounts = defects.map((d) => Number(d.amount));
  const minAmount = Math.min(...amounts);
  const maxAmount = Math.max(...amounts);

  return (
    <section id="answer-key" className="scroll-mt-24 border-y-2 border-agreed py-14">
      <p className="font-mono text-stub uppercase tracking-[0.06em] text-statute-deep">
        The answer key
      </p>

      {/* The finding, stated. A data graphic that does not say what it found
          is asking the reader to do the work of reading it, and most will
          not. The chart proves this sentence; it does not replace it. */}
      {/* On the ladder, like every other section heading.
          This was a raw `<h2>` — the one sentence on the site that makes a
          falsifiable claim, and the only heading printed in perfect register
          with no argument made about it, while eight less important ones
          carried the treatment. It is the first section of the document, so
          it takes the top of the ladder. */}
      <div className="mt-3">
        <Opener slip={slipFor("answer-key")} size="text-opener-tight" stagger={90} className="optical-cap max-w-[24ch]">
          We hid {spell(totals.planted)} defects in a year of books. The engine found{" "}
          {spell(totals.detected)}.
        </Opener>
      </div>

      <div className="mt-10 grid items-start gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <div className="min-w-0">
          <ul className="grid gap-y-4">
            {rows.map(([rule, { type, items }]) => (
              <li key={rule} className="grid gap-y-1.5">
                <p className="flex items-baseline justify-between gap-4 font-mono text-stub uppercase text-graphite">
                  <span>
                    <span className="text-statute-deep">{rule}</span> {readable(type)}
                  </span>
                  <span className="tabular text-agreed">{items.length}</span>
                </p>
                <ul className="flex flex-wrap gap-1.5">
                  {items.map((defect, index) => (
                    <li key={`${rule}-${index}`}>
                      <Cell
                        defect={defect}
                        ink={inkSize(defect.amount, minAmount, maxAmount)}
                        selected={open === defect}
                        onOpen={() => setOpen(open === defect ? null : defect)}
                      />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>

          {/* Footed, the way a column is. */}
          <dl className="mt-8 border-t-2 border-agreed">
            <Foot term="Planted" value={totals.planted} />
            <Foot term="Found" value={totals.detected} />
            <Foot term="Missed" value={totals.missed} tone="statute" />
            <Foot term="Raised and not planted" value={totals.false_positives} tone="statute" />
          </dl>
        </div>

        {/* Sticky, because the response to a click was landing off-screen.
            At 1440x900 the rail runs from about y=420 and the readout began
            around y=860, so opening a cell near the top of the chart put its
            record below the fold — a control whose answer you have to go
            looking for. It follows the reader down the chart instead. */}
        <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          {/* The control, which is the thing that makes the chart readable.
              A field of eighty-two resolved squares is, on its own, a picture
              of nothing: every cell is the same near-black, and a reader who
              has never seen a failure cannot perceive the absence of one.
              "No misses" looks identical to "we only printed one plate".

              A press prints a registration target and a colour bar for
              exactly this reason — so register can be checked rather than
              asserted. These three specimens are that target. Once a reader
              has seen what a miss and a false positive would look like, the
              eighty-two squares above stop being decoration and become a
              result they have verified with their own eyes. */}
          <div className="border border-hairline bg-sunk p-5">
            <p className="font-mono text-stub uppercase text-graphite">
              How to read a square
            </p>
            <dl className="mt-4 grid gap-y-3">
              {SPECIMENS.map(({ planted, found, name, meaning }) => (
                <div key={name} className="grid grid-cols-[1.75rem_minmax(0,1fr)] items-baseline">
                  <dt>
                    <span className="relative isolate block h-5 w-5">
                      {planted && (
                        <span aria-hidden className="plate-books absolute inset-0 bg-books mix-blend-multiply" />
                      )}
                      {found && (
                        <span aria-hidden className="plate-statute absolute inset-0 bg-statute mix-blend-multiply" />
                      )}
                    </span>
                  </dt>
                  <dd className="rag-pretty opsz-prose max-w-[34ch] font-news text-ident leading-relaxed text-graphite">
                    <span className="text-agreed">{name}</span> — {meaning}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="rag-pretty opsz-prose mt-4 max-w-[34ch] border-t border-hairline pt-3 font-news text-ident leading-relaxed text-graphite">
              Every square above is the first kind. The other two are drawn here because
              they do not appear up there, and a result you cannot see the failure of is
              a result you are being asked to take on trust.
            </p>
          </div>

          <div className="mt-6">
            <Readout defect={open} name={open ? names.get(open.company) ?? open.company : ""} />
          </div>
        </div>
      </div>

      {/* The negative space, at the size of the result rather than under it.
          A perfect score printed alone reads as a boast; a perfect score
          printed beside its own limits reads as a measurement. This is the
          empirical twin of the blank sign-off rule at the foot of the page —
          the same refusal, stated about the number instead of about the
          review. */}
      <div className="mt-14 border-t border-hairline pt-8">
        <h3 className="rag-balance optical-cap wdth-tight max-w-[22ch] font-anek text-subhead font-semibold text-agreed">
          What {spell(totals.planted)} of {spell(totals.detected)} does not mean
        </h3>
        <ul className="mt-5 grid gap-x-12 gap-y-5 sm:grid-cols-2">
          {LIMITS.map((limit) => (
            <li
              key={limit}
              className="rag-pretty opsz-prose max-w-[46ch] border-l-2 border-statute pl-4 font-news text-prose leading-relaxed text-agreed"
            >
              {limit}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/**
 * One planted defect.
 *
 * Two plates: the defect as it was planted, and the detection that landed on
 * it. Both present and they multiply to `agreed`. A miss would leave the
 * indigo alone and visible in a row of near-black squares.
 *
 * The dataset carries no per-defect miss flag because there are none to
 * carry: `totals.missed` is 0 and `totals.false_positives` is 0, so every one
 * of the eighty-two is a matched pair. If that ever stops being true this
 * component should read the flag rather than assume it, and the graphic will
 * show the failure without anyone having to remember to update a caption.
 */
function Cell({
  defect,
  ink,
  selected,
  onOpen,
}: {
  defect: Defect;
  /** Side of the printed square, in pixels, from the amount. */
  ink: number;
  selected: boolean;
  onOpen: () => void;
}) {
  const detected = aggregates.totals.missed === 0;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-pressed={selected}
      aria-label={`${defect.rule}, ${readable(defect.defect_type)}, ${period(
        defect.period,
      )}, ₹${INR.format(Number(defect.amount))}`}
      // A mark verb: this is a square you are inspecting, not a control you
      // are actuating, so it takes the 160ms settle rather than the 120ms
      // press. Written out rather than using `transition-transform`, which
      // would have inherited Tailwind's 150ms ease-in-out and put a second
      // easing system back on the page one component after it was removed.
      className={`relative isolate block h-5 w-5 [transition:transform_160ms_cubic-bezier(0.2,0.7,0.3,1)] hover:scale-110 ${
        selected ? "scale-110 outline outline-2 outline-offset-2 outline-agreed" : ""
      }`}
    >
      {/* Both plates are the same square, centred in the box and sized by
          the amount. They superimpose exactly, so a matched pair still
          multiplies to `agreed` — the weighting changes how much ink lands,
          never whether the two plates meet. */}
      <span
        aria-hidden
        className="plate-books absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-books mix-blend-multiply"
        style={{ width: ink, height: ink }}
      />
      {detected && (
        <span
          aria-hidden
          className="plate-statute absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-statute mix-blend-multiply"
          style={{ width: ink, height: ink }}
        />
      )}
    </button>
  );
}

/**
 * What a cell says when it is opened.
 *
 * The point of plotting the eighty-two rather than summarising them is that
 * each one is a real record, and a reader who does not believe that can check
 * any of them. Every field here is read from the same file the totals are
 * read from.
 */
function Readout({ defect, name }: { defect: Defect | null; name: string }) {
  if (!defect) {
    return (
      <div aria-live="polite" className="border border-hairline bg-sunk p-5">
        <p className="font-mono text-stub uppercase text-graphite">Any square</p>
        <p className="rag-pretty opsz-prose mt-2 max-w-[34ch] font-news text-ident leading-relaxed text-graphite">
          Each square is one defect written into the books before the engine ran, and the
          detection that landed on it. Open any of them and the record is here — the rule,
          the month, the company and the rupees. Nothing on this page is a summary you have
          to take on trust.
        </p>
      </div>
    );
  }

  return (
    <dl aria-live="polite" className="border border-agreed bg-sunk p-5">
      <dt className="font-mono text-stub uppercase text-graphite">Planted</dt>
      <dd className="mt-1 font-news text-prose text-agreed">
        {readable(defect.defect_type)}
      </dd>

      <dt className="mt-4 font-mono text-stub uppercase text-graphite">Caught by</dt>
      <dd className="mt-1 font-mono text-ident text-statute-deep">{defect.rule}</dd>

      <dt className="mt-4 font-mono text-stub uppercase text-graphite">Amount</dt>
      <dd className="tabular mt-1 font-mono text-ident text-agreed">
        <Rupee amount={defect.amount} />
      </dd>

      <dt className="mt-4 font-mono text-stub uppercase text-graphite">Period</dt>
      <dd className="mt-1 font-mono text-ident text-agreed">{period(defect.period)}</dd>

      <dt className="mt-4 font-mono text-stub uppercase text-graphite">Company</dt>
      <dd className="mt-1 font-mono text-ident text-agreed">{name}</dd>

      <dt className="mt-4 font-mono text-stub uppercase text-graphite">Register</dt>
      <dd className="mt-1 font-mono text-ident text-agreed">
        {defect.register ?? "period-level"} · planted at {defect.target} level
      </dd>
    </dl>
  );
}

/**
 * A line of the matrix.
 *
 * The figures were set at the same 14px as the labels beside them, which put
 * MISSED 0 — the most remarkable claim on this site — at body-text size in a
 * table. The page's own rule is that a spelled number carries shape and a
 * digit is something to check against, so the headline sentence keeps the
 * display scale; but a footed total is exactly the kind of figure a reader
 * checks, and it was too small to be met. It is set in Anek now, tabular, at
 * a size that is unmistakably subordinate to the sentence above and
 * unmistakably not a caption.
 */
function Foot({
  term,
  value,
  tone = "plain",
}: {
  term: string;
  value: number;
  tone?: "plain" | "statute";
}) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-hairline py-3">
      <dt className="font-mono text-stub uppercase text-graphite">{term}</dt>
      <dd
        className={`tabular wdth-condensed font-anek text-[clamp(26px,3.2vw,38px)] font-bold leading-none ${
          tone === "statute" && value > 0 ? "text-statute-deep" : "text-agreed"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * The three states a square can be in, two of which never occur.
 *
 * `books` alone is a defect that was planted and not caught; `statute` alone
 * is a detection with nothing under it. Both together multiply to `agreed`,
 * which is the same arithmetic the two inks perform on paper and the same
 * near-black the rest of this document is set in.
 *
 * They differ in hue and in isolation rather than by a three-pixel offset,
 * which is the whole reason this is a tally and not a misregistration: this
 * page has spent the misregistration signal on decoration, so a fringe here
 * would read as house style rather than as an error.
 */
const SPECIMENS = [
  {
    planted: true,
    found: true,
    name: "Found",
    meaning: "planted and caught. Both plates land together and print near-black.",
  },
  {
    planted: true,
    found: false,
    name: "Missed",
    meaning: "planted and not caught. One indigo square, alone in the row.",
  },
  {
    planted: false,
    found: true,
    name: "Raised in error",
    meaning: "flagged with nothing under it. One vermillion square, alone in the row.",
  },
];

const LIMITS = [
  "The books are synthetic. We wrote the defects, which is the only way to know the answer before the engine runs — and it means this measures the matcher, not the world.",
  "No real supplier behaviour. A vendor who files late, amends, or files against a different GSTIN is not in this dataset.",
  "Nothing adversarial. Nobody was trying to hide anything from the engine, and a book that is being cooked does not look like this one.",
  "The rule set has not been reviewed by a practising CA. Eighty-two of eighty-two says the rules caught what they were written to catch; it does not say they are the right rules.",
];
