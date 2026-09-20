import Link from "next/link";

import { inr } from "../lib/format";
import aggregates from "./aggregates.json";
import { Leash } from "./Leash";
import { Population } from "./Population";
import { Trace } from "./Trace";

export const metadata = {
  title: "DiligenceReady: reconciliation for CA firms",
  description:
    "Books, GSTR-2B and bank, reconciled every month, with the evidence kept. Built for the CA firms who do the work.",
};

/**
 * The landing page, which is a working paper.
 *
 * Nothing here is claimed that the repository cannot back. No certifications
 * we do not hold, no customer logos, no testimonials, and no signup form that
 * quietly discards what someone types into it — the waitlist is an email
 * address, which is the honest version of a waitlist before there is a
 * backend for one.
 *
 * The design follows from that sentence rather than decorating it. A CA's
 * working paper carries an index, a tick mark in the margin against every
 * assertion, a legend at the foot defining those marks, a footed column, and a
 * sign-off block that stays blank until someone reviews it. This page has all
 * five, and it turns them on itself.
 *
 * The mark that appears nowhere on this page is C — confirmed with an external
 * party — because no practising CA has reviewed the rule set yet. The legend
 * says so in those words. The page's epistemic position is the layout rather
 * than a disclaimer under it, and it is why the pilot ask is a blank
 * "reviewed by" rule instead of a button.
 *
 * It ships as a server component with no client JavaScript at all. The only
 * motion is two rules drawing themselves once on load, which is the arithmetic
 * being footed.
 */

/**
 * The way into the app, from the page that is now its front door.
 *
 * It points at the form rather than at `/` on purpose. An unauthenticated
 * request to the dashboard is sent back here, so a bare link to `/` would be
 * a dead click for exactly the reader most likely to take it — the one who
 * has never signed in. Routing through `/sign-in` costs a reader who does
 * hold a session one redirect they never see, because that page checks the
 * session on the server and forwards them straight to `next`. Every link on
 * this page that goes into the product uses this, so there is no path from
 * here that bounces a visitor back to where they started.
 *
 * `next=/` is the dashboard, written out rather than left to the default so
 * the link says where it goes.
 */
const DASHBOARD = "/sign-in?next=/";

/**
 * Counts this page writes in words.
 *
 * A figure set in digits is one the reader is invited to check against
 * something; these are neither at risk nor traceable to a row, they are the
 * shape of the dataset, and spelling them keeps the digits on the page
 * meaning one thing. Anything not listed falls back to the numeral rather
 * than being spelled wrongly.
 */
const SPELLED: Record<number, string> = {
  2: "two",
  4: "four",
  12: "twelve",
  41: "forty-one",
  82: "eighty-two",
};

/** The same word, at the start of a sentence. */
function spell(n: number, sentenceStart = false): string {
  const word = SPELLED[n];
  if (!word) return String(n);
  return sentenceStart ? word[0].toUpperCase() + word.slice(1) : word;
}

/** The marks, as an audit file uses them, and what each one is worth here. */
const LEGEND: { mark: string; meaning: string; tone?: string }[] = [
  { mark: "T", meaning: "traced to a line of a file kept in the repository" },
  { mark: "R", meaning: "recomputed by the evaluation harness against planted defects" },
  { mark: "A", meaning: "agreed to GSTN's published documentation" },
  { mark: "P", meaning: "footed: the arithmetic is a SQL aggregate, checked by a test" },
  {
    mark: "C",
    meaning:
      "confirmed with an external party. No claim on this page carries this mark, because no practising CA has reviewed the rule set yet",
    tone: "text-ink-faint",
  },
];

export default function ProductPage() {
  return (
    <main className="mx-auto max-w-[1080px] px-6 pb-24 sm:px-10">
      {/* The masthead of a working paper: a heavy rule, then who prepared it,
          for what, and in what state. It used to stop there, on the reasoning
          that there is nowhere else to go — but there is, and now it is where
          everyone starts: an unauthenticated request to any route in the app
          lands on this page, so this is the front door and the door has to
          have a handle. The only route into the product used to be the last
          sentence of the footer, a whole page of scrolling away.

          A working paper does not answer that with a navigation bar. The
          masthead is already the band a reader checks before reading a paper,
          and this is the one line of it that is an instruction rather than a
          fact — so it is set solid, square, and inverting on hover, which is
          the same block the sign-in form's own submit button is.

          `no-print`: a filed copy is read on paper, where a control is
          furniture. The footer keeps its link, and that is the one the print
          rule annotates with its href. */}
      <header className="border-t-2 border-ink pt-3">
        <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-4">
          <dl className="grid min-w-0 flex-1 grid-cols-2 gap-x-6 gap-y-2 font-mono text-micro uppercase tracking-[0.08em] text-ink-soft sm:grid-cols-4">
            <Meta term="Index" value="W-1" />
            <Meta term="Subject" value="DiligenceReady" />
            <Meta term="Prepared" value="Engine v0 · Sep 2026" />
            <Meta term="Status" value="Pre-review" />
          </dl>
          <div className="no-print shrink-0">
            <p className="font-mono text-micro uppercase tracking-[0.08em] text-ink-faint">
              Access
            </p>
            <Link
              href={DASHBOARD}
              aria-label="Sign in to the working dashboard"
              className="mt-1 inline-flex items-center gap-2 border border-ink bg-ink px-4 py-1.5 font-mono text-micro uppercase tracking-[0.08em] text-paper hover:bg-transparent hover:text-ink"
            >
              Sign in
              {/* Drawn here rather than installed, like every other glyph in
                  this product. `currentColor` is what makes it invert with
                  the block instead of staying pale on a pale ground. */}
              <svg viewBox="0 0 8 10" aria-hidden className="h-2.5 w-2 shrink-0">
                <path d="M2 1l5 4-5 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </Link>
          </div>
        </div>
      </header>

      {/* The page opens on the sum, not on a sentence.
          It used to open on the headline, with the figure the headline is
          about set small in the top right corner, and the first thing a
          reader met was a paragraph. This product's argument is a number
          somebody can be shown; leading with it is the layout agreeing with
          the argument. The workings stay directly beneath it, footed, so the
          figure never appears without the two lines it is made of. */}
      <section className="py-14">
        <p className="font-mono text-micro uppercase tracking-[0.08em] text-ink-soft">
          {aggregates.headline.label}
        </p>
        {/* Derived, not typed. It is the sum of the {defects} findings rule R1
            raises across the seeded companies, computed by the generator from
            the same answer key the evaluation is scored against. It used to be
            a literal in this file, which made the largest number on the page
            the only one that could not be checked. */}
        <p className="tabular mt-4 font-semibold leading-[0.9] text-exposure text-figure sm:text-hero lg:text-display">
          {inr(aggregates.headline.amount)}
        </p>

        {/* Source order is reading order: the claim, then the workings that
            support it. On a wide screen the grid puts the workings in the
            right-hand column without the DOM having to lie about which comes
            first, which is what an `order` class would have been doing. */}
        <div className="mt-8 grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0">
            <h1 className="max-w-[26ch] text-lede font-semibold leading-tight sm:text-figure">
              An SME&rsquo;s books, the government&rsquo;s record of them, and the money
              never agree.
            </h1>
            <p className="mt-5 max-w-[54ch] text-body leading-relaxed text-ink-soft">
              We keep them agreeing, every month, and keep the evidence. Reconciling Tally
              against GSTR-2B against the bank is manual, monthly, done in Excel, and
              abandoned when it gets hard. The gaps compound quietly for years, and then
              surface expensively the first time a lender, an investor or an acquirer
              needs to trust the numbers.
            </p>
          </div>
          <div className="min-w-0">
            <Workings />
          </div>
        </div>
      </section>

      <Sheet>
        <Claim mark="P" note="apps/api/…/numeric_guard.py">
          <h2 className="text-lede font-semibold">
            Deterministic code decides. The model only extracts and explains.
          </h2>
          <p className="mt-3 max-w-[64ch] text-body leading-relaxed text-ink-soft">
            Every figure on screen is a SQL aggregate over a match table. The model is
            handed a finished finding and writes the sentence explaining it. It never sees a
            document and cannot produce a number: any figure it does produce is checked
            against the finding before you see it. Click any amount and land on the row of
            the original file that produced it.
          </p>
          <Leash />
        </Claim>
      </Sheet>

      <Sheet>
        <Claim mark="R" note="diligence evaluate">
          <h2 className="text-lede font-semibold">Measured, not asserted</h2>
          <p className="mt-3 max-w-[64ch] text-body leading-relaxed text-ink-soft">
            {spell(aggregates.totals.planted, true)} defects were planted across{" "}
            {spell(aggregates.totals.companies)} synthetic ledgers,{" "}
            {spell(aggregates.companies[0].evaluation.planted)} in each. The engine found
            every one of them and raised{" "}
            {aggregates.totals.false_positives === 0
              ? "nothing the answer key does not contain"
              : `${aggregates.totals.false_positives} findings the answer key does not contain`}
            .
          </p>
          <Population />
          <p className="mt-6 max-w-[64ch] text-body leading-relaxed text-ink-soft">
            Synthetic and seeded, and disclosed as such. Ground truth lets the engine be
            measured instead of asserted. It proves the engine works on data we designed;
            it does not prove it works in production, and the difference matters.
          </p>
        </Claim>
      </Sheet>

      <Sheet>
        <Claim mark="T" note={`${aggregates.example.file}:${aggregates.example.line}`}>
          <h2 className="text-lede font-semibold">Every figure has a line</h2>
          <p className="mt-3 max-w-[64ch] text-body leading-relaxed text-ink-soft">
            One finding, followed from the row of the file it was read out of to the
            aggregate that puts it on a dashboard. This is the whole product: not that the
            exception was spotted, but that a CA can hand the working to someone who
            doubts it.
          </p>
          <Trace />
        </Claim>
      </Sheet>

      <Sheet>
        <Claim mark="A" note="GSTN's own matcher, tested">
          <h2 className="text-lede font-semibold">Built for the firm, not the company</h2>
          <p className="mt-3 max-w-[64ch] text-body leading-relaxed text-ink-soft">
            An SME owner does not reconcile anything. Their CA does, monthly, already gets
            paid for it, and already has Tally open. One firm carries thirty to eighty
            client companies, and there is no multi-company tool built for that.
            GSTN&rsquo;s own free matcher is a desktop executable needing admin rights, one
            profile per GSTIN, with an import template no real Tally export satisfies.
          </p>
        </Claim>
      </Sheet>

      <Sheet>
        <Claim mark="T" note="packages/engine/…/ingest">
          <h2 className="text-lede font-semibold">What it reads</h2>
          <dl className="mt-4">
            <Reads term="Tally" detail="XML gateway, port 9000, read-only" />
            <Reads term="GSTR-2B" detail="the JSON or Excel any taxpayer downloads" />
            <Reads
              term="Invoice Management System"
              detail="accept, reject or pending, per record"
            />
            <Reads term="Bank" detail="statement CSV; Account Aggregator later" />
          </dl>
          <p className="mt-5 max-w-[64ch] text-body leading-relaxed text-ink-soft">
            Nothing is written back to a client&rsquo;s books. The tool flags exceptions and
            the CA decides.
          </p>
        </Claim>
      </Sheet>

      <Sheet>
        <Claim note="as at 20 Sep 2026">
          <h2 className="text-lede font-semibold">Where this actually is</h2>
          <p className="mt-3 max-w-[64ch] text-body leading-relaxed text-ink-soft">
            Working software with a measured evaluation, not a product you can buy yet.
          </p>
          <dl className="mt-5 max-w-[64ch] border-t border-rule">
            <Status item="Reconciliation engine, GST and bank" state="built" />
            <Status item="Evidence trail to the source file line" state="built" />
            <Status item="Authentication and firm-level access control" state="built" />
            <Status item="GST rule set reviewed by a practising CA" state="not built" />
            <Status item="Invoice Management System rules, switched on" state="not built" />
            <Status item="Encryption at rest" state="scheduled" />
            <Status item="Lender-ready package export" state="not built" />
          </dl>
          <p className="mt-5 max-w-[64ch] text-body leading-relaxed text-ink-soft">
            Pricing, when there is something to sell: an anchor of ₹6,000 to ₹15,000 per
            month per firm for up to twenty-five companies. The firm bills the client. We
            are not claiming certifications we do not hold.
          </p>
        </Claim>
      </Sheet>

      {/* The call to action is the one line of a working paper that is never
          filled in by whoever prepared it. */}
      <section className="border-t border-rule-strong pt-12">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div>
            <h2 className="max-w-[24ch] text-lede font-semibold">
              If you run a practice and this sounds like your close
            </h2>
            <p className="mt-3 max-w-[54ch] text-body leading-relaxed text-ink-soft">
              We want three firms to use it free and be watched working. The first twenty
              minutes of that tells us more than another month of building, and it is the only
              way anything on this page earns a C.
            </p>
          </div>

          <div className="border border-rule-strong p-5">
            <p className="font-mono text-micro uppercase tracking-[0.08em] text-ink-soft">
              Prepared by
            </p>
            <div className="mt-1 flex items-baseline justify-between gap-4 border-b border-rule pb-1">
              <p className="text-body">DiligenceReady</p>
              <p className="tabular text-data text-ink-soft">20 Sep 2026</p>
            </div>

            <p className="mt-6 font-mono text-micro uppercase tracking-[0.08em] text-ink-soft">
              Reviewed by
            </p>
            <p className="mt-1 border-b border-ink pb-1">
              <a
                href="mailto:hello@diligenceready.in?subject=CA%20firm%20pilot"
                className="text-body underline decoration-rule-strong underline-offset-[6px] hover:decoration-ink"
              >
                hello@diligenceready.in
              </a>
            </p>
            <p className="mt-2 text-micro leading-relaxed text-ink-faint">
              Unsigned. No practising CA has reviewed this yet, and the page says so
              wherever it matters.
            </p>
          </div>
        </div>
      </section>

      <footer className="mt-16 border-t border-rule-strong pt-8">
        <h2 className="font-mono text-micro uppercase tracking-[0.08em] text-ink-soft">
          Tick mark legend
        </h2>
        <dl className="mt-3 grid gap-y-2">
          {LEGEND.map((entry) => (
            <div key={entry.mark} className="grid grid-cols-[2.5rem_1fr] items-baseline">
              <dt className={`font-mono text-data ${entry.tone ?? "text-ink"}`}>
                {entry.mark}
              </dt>
              <dd
                className={`max-w-[68ch] text-micro leading-relaxed ${
                  entry.tone ?? "text-ink-soft"
                }`}
              >
                {entry.meaning}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-8 flex flex-wrap items-baseline justify-between gap-4 border-t border-rule pt-4">
          <p className="max-w-[70ch] text-micro leading-relaxed text-ink-faint">
            Figures on this page and in the product are from a seeded synthetic dataset,
            not a real company. GST rules change by notification; nothing here is tax
            advice.{" "}
            {/* Named for what it now costs. The dashboard reads a firm's
                client data and has never been open to a stranger; the link
                used to say "see" and then hand them a password box for a
                product it had not named. */}
            <Link
              href={DASHBOARD}
              className="underline decoration-rule-strong underline-offset-4 hover:decoration-ink"
            >
              Sign in to the working dashboard
            </Link>
            .
          </p>
          <p className="font-mono text-micro text-ink-faint">W-1</p>
        </div>
      </footer>
    </main>
  );
}

/** One region of the paper. */
function Sheet({ children }: { children: React.ReactNode }) {
  return <section className="border-t border-rule py-12">{children}</section>;
}

/**
 * A claim, its tick mark, and its cross-reference.
 *
 * Three columns on a wide screen — gutter, measure, margin — and on a narrow
 * one the margin note folds under the claim behind a hairline, which is what
 * a cross-reference column does when the paper is photocopied onto A4.
 */
function Claim({
  mark,
  note,
  children,
}: {
  mark?: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-x-10 gap-y-3 lg:grid-cols-paper">
      <p aria-hidden className="hidden font-mono text-data text-ink-soft lg:block">
        {mark}
      </p>
      <div className="min-w-0">{children}</div>
      {note && (
        <p className="break-all border-l border-rule-hair pl-3 text-micro leading-relaxed text-ink-faint lg:border-0 lg:pl-0">
          {mark && <span className="mr-2 font-mono text-ink-soft lg:hidden">{mark}</span>}
          {note}
        </p>
      )}
    </div>
  );
}

function Meta({ term, value }: { term: string; value: string }) {
  return (
    <div>
      <dt className="text-ink-faint">{term}</dt>
      <dd className="mt-0.5 text-ink">{value}</dd>
    </div>
  );
}

/**
 * A stored deadline, in the form a filing date is written.
 *
 * The generator emits an ISO date because that is what sorts and compares
 * correctly; nobody writing a working paper writes 2026-11-30.
 */
function deadlineLabel(iso: string): string {
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const [year, month, day] = iso.split("-");
  return `${Number(day)} ${months[Number(month) - 1]} ${year}`;
}

/**
 * The workings under the sum.
 *
 * The figure itself is now the first thing on the page, so this no longer
 * sets it large a second time. What it keeps is the footing: a single rule
 * under the components, the total, and the double rule that says in a ledger
 * that the account is closed. The point of the block is that the headline
 * figure never appears without the two lines it is made of.
 *
 * Right-aligned and monospace, because that is where a total sits and the
 * digits have to line up to be compared. The rules draw themselves once, in
 * 240ms, which is the arithmetic being footed and the only motion here.
 */
function Workings() {
  return (
    <dl className="tabular w-full max-w-[22rem] font-mono lg:ml-auto">
      <p className="mb-2 font-sans text-micro uppercase tracking-[0.08em] text-ink-soft">
        Workings
      </p>
      <Entry
        label={`${aggregates.headline.label}, ${aggregates.headline.defects} findings`}
        value={inr(aggregates.headline.amount)}
      />
      <Entry
        label={`closing ${deadlineLabel(aggregates.headline.before_next_deadline.deadline)} under Sec 16(4)`}
        value={inr(aggregates.headline.before_next_deadline.amount)}
        indent
      />

      <div aria-hidden className="foot-rule mt-2 h-px bg-rule-strong" />

      <div className="mt-2 flex items-baseline justify-between gap-6">
        <dt className="font-sans text-micro uppercase tracking-[0.08em] text-ink-soft">
          Exposed
        </dt>
        <dd className="text-data font-medium text-exposure">
          {inr(aggregates.headline.amount)}
        </dd>
      </div>

      {/* The double rule: this account is closed. */}
      <div aria-hidden className="foot-rule foot-rule-final mt-2 h-px bg-ink" />
      <div aria-hidden className="foot-rule foot-rule-final mt-[3px] h-px bg-ink" />

      <p className="mt-3 text-right font-sans text-micro leading-relaxed text-ink-faint">
        {spell(aggregates.totals.companies, true)} seeded companies,{" "}
        {spell(aggregates.periods)} periods, every figure traced to a file line.
      </p>
    </dl>
  );
}

function Entry({
  label,
  value,
  indent = false,
}: {
  label: string;
  value: string;
  indent?: boolean;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-6 py-1 ${indent ? "pl-4" : ""}`}>
      <dt className="font-sans text-micro text-ink-soft">{label}</dt>
      <dd className="text-data text-ink">{value}</dd>
    </div>
  );
}

/** A schedule, ruled with leader dots between the term and its detail. */
function Reads({ term, detail }: { term: string; detail: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 border-b border-rule-hair py-2 last:border-0">
      <dt className="shrink-0 font-mono text-data text-ink">{term}</dt>
      {/* The leader is what joins a term to its detail on one line. Where the
          two do not share a line there is nothing to join, so on a narrow
          screen the detail simply sits underneath. */}
      <span
        aria-hidden
        className="mb-[0.35em] hidden min-w-6 flex-1 self-end border-b border-dotted border-rule sm:block"
      />
      <dd className="w-full text-data text-ink-soft sm:w-auto sm:shrink-0">{detail}</dd>
    </div>
  );
}

/**
 * An open item, with its state in words.
 *
 * No vermillion here. In this product it means money at statutory risk — on
 * this page as in the app — and a feature that is not built yet is not that.
 */
function Status({
  item,
  state,
}: {
  item: string;
  state: "built" | "scheduled" | "not built";
}) {
  const tone =
    state === "built"
      ? "text-reconciled"
      : state === "scheduled"
        ? "text-ink-soft"
        : "text-caution";
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-rule-hair py-2">
      <dt className="text-data text-ink">{item}</dt>
      <dd className={`shrink-0 font-mono text-micro ${tone}`}>
        {state === "built" ? "[x]" : "[ ]"} {state}
      </dd>
    </div>
  );
}
