/**
 * Where the product actually is, and what it costs.
 *
 * A startup page is where overclaiming happens, so this is the section that
 * refuses to. Built, scheduled and not built are stated as words, in one
 * schedule, with no colour doing the work a word should do. The things that
 * are not built include the one a chartered accountant would care about most.
 */

const STANDING: { item: string; state: "built" | "scheduled" | "not built" }[] = [
  { item: "Reconciliation engine, GST and bank", state: "built" },
  { item: "Evidence trail to the source file line", state: "built" },
  { item: "Authentication and firm-level access control", state: "built" },
  { item: "GST rule set reviewed by a practising CA", state: "not built" },
  { item: "Invoice Management System rules, switched on", state: "not built" },
  { item: "Encryption at rest", state: "scheduled" },
  { item: "Lender-ready package export", state: "not built" },
];

export function Standing() {
  return (
    <section className="py-20">
      <div className="grid gap-x-14 gap-y-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <h2 className="wdth-tight max-w-[18ch] font-anek text-opener font-bold text-agreed">
            Where this actually is
          </h2>
          <p className="opsz-deck mt-7 max-w-[40ch] font-news text-deck text-agreed">
            Working software with a measured evaluation. Not a product you can buy yet.
          </p>
          <p className="opsz-prose mt-6 max-w-[48ch] font-news text-prose text-graphite">
            Pricing, when there is something to sell: an anchor of{" "}
            <span className="text-agreed">₹6,000 to ₹15,000</span> per month per firm for up
            to twenty-five companies. The firm bills the client. We are not claiming
            certifications we do not hold, and no practising CA has reviewed the rule set
            yet.
          </p>
        </div>

        <dl className="border-t border-hairline lg:mt-4">
          {STANDING.map(({ item, state }) => (
            <div
              key={item}
              className="flex items-baseline justify-between gap-6 border-b border-hairline py-3"
            >
              <dt className="opsz-prose font-news text-prose text-agreed">{item}</dt>
              <dd
                className={`shrink-0 font-mono text-stub uppercase ${
                  state === "built" ? "text-agreed" : "text-statute-deep"
                }`}
              >
                {state}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
