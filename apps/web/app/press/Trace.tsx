import aggregates from "./aggregates.json";

/**
 * One figure, traced.
 *
 * The page says every amount on screen can be followed back to the line of
 * the file that produced it. Saying that is cheap. This follows one, in the
 * four steps the product actually takes, with the cross-reference for each
 * step written out so a reader can open the file and check.
 *
 * The example is not chosen for how it looks. `scripts/build_landing_aggregates.py`
 * takes the first R1 defect of the first company, resolves it to its row with
 * the matcher's own normaliser, and copies the columns out of the CSV. Pick a
 * different seed and this section says something different, which is the
 * property that makes it worth printing.
 *
 * The amount is the tax, not the invoice value, and the difference is the
 * whole finding: 17,585.52 of CGST and the same again of SGST is credit the
 * client has paid and cannot claim, on an invoice the supplier never filed.
 * A page that quoted 3,28,263.04 here would be overstating the exposure by an
 * order of magnitude while appearing more impressive, which is the exact
 * failure this product exists to prevent.
 *
 * The connecting rule is one hairline in vermillion, because vermillion in
 * this product means money at statutory risk and that is what is being traced.
 * It does not animate. Nothing here does.
 */

const STEPS = [
  {
    stage: "As recorded",
  },
  {
    stage: "As normalised",
  },
  {
    stage: "As matched",
  },
  {
    stage: "As computed",
  },
] as const;

export function Trace() {
  const { example } = aggregates;
  const columns = example.columns as Record<string, string>;

  // What the aggregate above actually sums, which is one rule's findings and
  // not every finding in the dataset. Counted from the answer key rather than
  // written down, so it cannot drift away from the seed.
  const ruleOneFindings = aggregates.companies.reduce(
    (total, company) => total + company.by_defect_type.vendor_didnt_file.detected,
    0,
  );

  return (
    <div className="mt-6 max-w-[64ch]">
      <ol className="border-l border-statute/40 pl-5">
        <Step step={STEPS[0]}>
          <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-4 gap-y-1">
            {Object.entries(columns).map(([column, value]) => (
              <Fragmentish key={column} column={column} value={value} />
            ))}
          </dl>
          <p className="mt-2 text-ident leading-relaxed text-graphite-soft">
            A line of a Tally export, as exported. Nothing is written back to it.
          </p>
        </Step>

        <Step step={STEPS[1]}>
          <p className="font-mono text-ident text-agreed">
            {columns["Voucher No"]} <span className="text-graphite-soft">reduces to</span>{" "}
            {example.normalised_number}
          </p>
          <p className="mt-2 text-ident leading-relaxed text-graphite-soft">
            The voucher series is written by hand and the portal is not. The document
            number both systems would agree on is what the match is attempted against.
          </p>
        </Step>

        <Step step={STEPS[2]}>
          <p className="text-ident leading-relaxed text-agreed">{example.note}</p>
          <p className="mt-2 text-ident leading-relaxed text-graphite-soft">
            Searched across every period, not only {example.period}, because a supplier who
            files late files into a different month.
          </p>
        </Step>

        <Step step={STEPS[3]} last>
          <pre className="whitespace-pre-wrap break-words border border-hairline bg-sunk p-3 font-mono text-ident leading-relaxed text-graphite">
{`sum(headline_amount) filter (
  where rule_code = 'R1' and status = 'open'
)`}
          </pre>
          <div className="mt-3 flex items-baseline justify-between gap-6 border-t border-hairline pt-2">
            <p className="text-stub uppercase tracking-[0.08em] text-graphite">
              Credit at risk, this invoice
            </p>
            <p className="tabular font-mono text-ident font-medium text-statute-deep">
              ₹{formatInr(example.amount)}
            </p>
          </div>
          <p className="mt-2 text-ident leading-relaxed text-graphite-soft">
            The tax, not the invoice value: ₹{formatInr(columns["Invoice Value"])} was
            paid, of which ₹{formatInr(example.amount)} is credit that cannot be claimed
            while the supplier has not filed. One of the {ruleOneFindings} findings rule{" "}
            {example.rule} raises across the two seeded companies, which are what this
            aggregate sums. The other rules have their own figures and are not added to
            this one.
          </p>
        </Step>
      </ol>
    </div>
  );
}

function Step({
  step,
  last = false,
  children,
}: {
  step: { stage: string };
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className={`relative ${last ? "" : "pb-7"}`}>
      {/* The mark sits on the rule rather than beside it, so the line reads as
          passing through each stage instead of running past them. */}
      <span
        aria-hidden
        className="absolute -left-[23px] top-[6px] h-1.5 w-1.5 bg-statute"
      />
      <h3 className="font-mono text-stub uppercase tracking-[0.08em] text-agreed">
        {step.stage}
      </h3>
      <div className="mt-2">{children}</div>
    </li>
  );
}

function Fragmentish({ column, value }: { column: string; value: string }) {
  return (
    <>
      <dt className="font-mono text-ident text-graphite-soft">{column}</dt>
      <dd className="font-mono text-ident text-agreed">{value}</dd>
    </>
  );
}

/**
 * Indian digit grouping, on a string.
 *
 * The value arrives as a string and leaves as one. `Intl` would want a Number
 * first, and a rupee figure that has been through a float is exactly what the
 * rest of this product refuses to display.
 */
function formatInr(value: string): string {
  const [whole, fraction = "00"] = value.split(".");
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}` : last3;
  return `${grouped}.${fraction}`;
}
