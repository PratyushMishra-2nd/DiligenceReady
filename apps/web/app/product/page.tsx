import Link from "next/link";

export const metadata = {
  title: "DiligenceReady — reconciliation for CA firms",
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

/** The marks, as an audit file uses them, and what each one is worth here. */
const LEGEND: { mark: string; meaning: string; tone?: string }[] = [
  { mark: "T", meaning: "traced to a line of a file kept in the repository" },
  { mark: "R", meaning: "recomputed by the evaluation harness against planted defects" },
  { mark: "A", meaning: "agreed to GSTN's published documentation" },
  { mark: "P", meaning: "footed — the arithmetic is a SQL aggregate, checked by a test" },
  {
    mark: "C",
    meaning:
      "confirmed with an external party — no claim on this page carries this mark, because no practising CA has reviewed the rule set yet",
    tone: "text-ink-faint",
  },
];

export default function ProductPage() {
  return (
    <main className="mx-auto max-w-[1080px] px-6 pb-24 sm:px-10">
      {/* The masthead of a working paper: a heavy rule, then who prepared it,
          for what, and in what state. No navigation bar, because there is
          nowhere else to go. */}
      <header className="border-t-2 border-ink pt-3">
        <dl className="grid grid-cols-2 gap-y-2 font-mono text-micro uppercase tracking-[0.08em] text-ink-soft sm:grid-cols-4">
          <Meta term="Index" value="W-1" />
          <Meta term="Subject" value="DiligenceReady" />
          <Meta term="Prepared" value="Engine v0 · Sep 2026" />
          <Meta term="Status" value="Pre-review" />
        </dl>
      </header>

      {/* The deck and the total sit on one line of sight: the claim on the
          left, and on the right the figure that claim is about, footed. */}
      <section className="grid gap-x-10 gap-y-10 py-12 lg:grid-cols-[2.5rem_minmax(0,1fr)_22rem]">
        <p aria-hidden className="hidden font-mono text-data text-ink-soft lg:block">
          A
        </p>
        <div className="min-w-0">
          <h1 className="max-w-[20ch] text-figure font-semibold leading-[1.05] sm:text-hero">
            An SME&rsquo;s books, the government&rsquo;s record of them, and the money
            never agree.
          </h1>
          <p className="mt-6 max-w-[54ch] text-body leading-relaxed text-ink-soft">
            We keep them agreeing, every month, and keep the evidence. Reconciling Tally
            against GSTR-2B against the bank is manual, monthly, done in Excel, and
            abandoned when it gets hard. The gaps compound quietly for years, and then
            surface expensively the first time a lender, an investor or an acquirer needs
            to trust the numbers.
          </p>
        </div>

        {/* The footed column: the product's output in the form the output
            actually takes — a total with a rule under the workings and a
            double rule under the total, which is how a ledger says that an
            account is closed. */}
        <FootedColumn />
      </section>

      <Sheet>
        <Claim mark="P" note="apps/api/…/numeric_guard.py">
          <h2 className="text-lede font-semibold">
            Deterministic code decides. The model only extracts and explains.
          </h2>
          <p className="mt-3 max-w-[64ch] text-body leading-relaxed text-ink-soft">
            Every figure on screen is a SQL aggregate over a match table. The model is
            handed a finished finding and writes the sentence explaining it — it never
            sees a document and cannot produce a number, and any figure it does produce is
            checked against the finding before you see it. Click any amount and land on
            the row of the original file that produced it.
          </p>
        </Claim>
      </Sheet>

      <Sheet>
        <Claim mark="R" note="diligence evaluate">
          <h2 className="text-lede font-semibold">Measured, not asserted</h2>
          <p className="mt-3 max-w-[64ch] text-body leading-relaxed text-ink-soft">
            Forty-one defects were planted into a synthetic ledger. The engine found
            forty-one of them, and invented none.
          </p>
          <Tally />
          <p className="mt-6 max-w-[64ch] text-body leading-relaxed text-ink-soft">
            Synthetic and seeded, and disclosed as such. Ground truth lets the engine be
            measured instead of asserted. It proves the engine works on data we designed;
            it does not prove it works in production, and the difference matters.
          </p>
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
              minutes of that tells us more than another month of building — and it is the
              only way anything on this page earns a C.
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
            <Link
              href="/"
              className="underline decoration-rule-strong underline-offset-4 hover:decoration-ink"
            >
              See the working dashboard
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
    <div className="grid gap-x-10 gap-y-3 lg:grid-cols-[2.5rem_minmax(0,64ch)_minmax(0,13rem)]">
      <p aria-hidden className="hidden font-mono text-data text-ink-soft lg:block">
        {mark}
      </p>
      <div className="min-w-0">{children}</div>
      {note && (
        <p className="border-l border-rule-hair pl-3 text-micro leading-relaxed text-ink-faint lg:border-0 lg:pl-0">
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
 * The exposure figure, footed the way a ledger foots a column: a single rule
 * under the workings, a double rule under the total.
 *
 * Right-aligned, because that is where a total sits, and in tabular monospace,
 * because the digits have to line up to be compared. The two rules draw
 * themselves once, in 240ms — the only motion on the page, and it is the act
 * the product performs rather than an entrance.
 */
function FootedColumn() {
  return (
    <div className="flex justify-end lg:block">
      <dl className="tabular w-[22rem] max-w-full font-mono">
        <Entry label="Input tax credit paid, not claimable" value="16,25,635.64" />
        <Entry label="closing 30 Nov 2026 under Sec 16(4)" value="5,17,412.74" indent />

        <div aria-hidden className="foot-rule mt-2 h-px bg-rule-strong" />

        <div className="mt-2 flex items-baseline justify-between gap-6">
          <dt className="font-sans text-micro uppercase tracking-[0.08em] text-ink-soft">
            Exposed
          </dt>
          <dd className="text-figure font-semibold text-exposure">₹16,25,635.64</dd>
        </div>

        {/* The double rule: this account is closed. */}
        <div aria-hidden className="foot-rule foot-rule-final mt-2 h-px bg-ink" />
        <div aria-hidden className="foot-rule foot-rule-final mt-[3px] h-px bg-ink" />

        <p className="mt-3 text-right font-sans text-micro leading-relaxed text-ink-faint">
          Two seeded companies, thirteen periods, every figure traced to a file line.
        </p>
      </dl>
    </div>
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

/**
 * The evaluation, as one mark per defect.
 *
 * Forty-one is a countable quantity, so it is drawn as forty-one countable
 * things rather than as the numeral 41 set large. The second row is the
 * findings the engine invented, and it is empty: the absence is the datum, and
 * an empty rule states it more plainly than a nought does.
 */
function Tally() {
  return (
    <div className="mt-6 max-w-[34rem]">
      <p className="font-mono text-micro uppercase tracking-[0.08em] text-ink-soft">
        Planted, and found — 41 of 41
      </p>
      {/* Grouped in fives, the way anyone counting by hand groups them, so the
          reader can verify there are forty-one rather than take the caption's
          word for it. */}
      <div aria-hidden className="mt-2 flex flex-wrap gap-[3px]">
        {Array.from({ length: 41 }, (unused, index) => (
          <span
            key={index}
            className="h-3.5 w-[3px] bg-reconciled"
            style={index > 0 && index % 5 === 0 ? { marginLeft: "0.5rem" } : undefined}
          />
        ))}
      </div>

      <p className="mt-5 font-mono text-micro uppercase tracking-[0.08em] text-ink-soft">
        Invented — 0
      </p>
      <div aria-hidden className="mt-2 h-3.5 border-b border-dotted border-rule-strong" />
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
