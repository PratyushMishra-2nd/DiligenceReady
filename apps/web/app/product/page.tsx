import Link from "next/link";

export const metadata = {
  title: "DiligenceReady — reconciliation for CA firms",
  description:
    "Books, GSTR-2B and bank, reconciled every month, with the evidence kept. Built for the CA firms who do the work.",
};

/**
 * The landing page.
 *
 * Nothing here is claimed that the repository cannot back. No certifications
 * we do not hold, no customer logos, no testimonials, and no signup form that
 * quietly discards what someone types into it — the waitlist is an email
 * address, which is the honest version of a waitlist before there is a
 * backend for one.
 */
export default function ProductPage() {
  return (
    <main className="mx-auto max-w-[760px] px-6 py-16 sm:px-10">
      <header className="ruled pb-6">
        <p className="text-micro text-ink-soft">Financial data readiness for Indian SMEs</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">DiligenceReady</h1>
      </header>

      <section className="py-10">
        <p className="max-w-[54ch] text-xl leading-snug">
          An SME&rsquo;s books, the government&rsquo;s record of them, and the money never
          agree. We keep them agreeing, every month, and keep the evidence.
        </p>
        <p className="mt-5 max-w-[68ch] text-sm leading-relaxed text-ink-soft">
          Reconciling Tally against GSTR-2B against the bank is manual, monthly, done in
          Excel, and abandoned when it gets hard. The gaps compound quietly for years, and
          then surface expensively the first time a lender, an investor or an acquirer
          needs to trust the numbers.
        </p>
      </section>

      <section className="border-t border-rule py-10">
        <h2 className="text-sm font-semibold">Monthly reconciliation in twenty minutes</h2>
        <p className="mt-3 max-w-[68ch] text-sm leading-relaxed text-ink-soft">
          That is the target, not a measurement. It will be measured against a real CA
          doing a real close before it goes any further than this page — an unverified
          number here is worth less than a smaller true one.
        </p>
      </section>

      <section className="border-t border-rule py-10">
        <h2 className="text-sm font-semibold">Built for the firm, not the company</h2>
        <p className="mt-3 max-w-[68ch] text-sm leading-relaxed text-ink-soft">
          An SME owner does not reconcile anything. Their CA does, monthly, already gets
          paid for it, and already has Tally open. One firm carries thirty to eighty client
          companies, and there is no multi-company tool built for that. GSTN&rsquo;s own
          free matcher is a desktop executable needing admin rights, one profile per
          GSTIN, with an import template no real Tally export satisfies.
        </p>
      </section>

      <section className="border-t border-rule py-10">
        <h2 className="text-sm font-semibold">
          You don&rsquo;t have to trust the model for the number
        </h2>
        <p className="mt-3 max-w-[68ch] text-sm leading-relaxed text-ink-soft">
          Every figure on screen is a SQL aggregate over a match table. The model is handed
          a finished finding and writes the sentence explaining it — it never sees a
          document and cannot produce a number, and any figure it does produce is checked
          against the finding before you see it. Click any amount and land on the row of
          the original file that produced it.
        </p>
      </section>

      <section className="border-t border-rule py-10">
        <h2 className="text-sm font-semibold">Measured, not asserted</h2>
        <div className="mt-4 grid gap-6 sm:grid-cols-3">
          <Figure value="41" label="defects planted into a synthetic ledger" />
          <Figure value="41" label="found by the engine" />
          <Figure value="0" label="findings it invented" />
        </div>
        <p className="mt-5 max-w-[68ch] text-sm leading-relaxed text-ink-soft">
          Synthetic and seeded, and disclosed as such. Ground truth lets the engine be
          measured instead of asserted. It proves the engine works on data we designed; it
          does not prove it works in production, and the difference matters.
        </p>
      </section>

      <section className="border-t border-rule py-10">
        <h2 className="text-sm font-semibold">What it reads</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <Row term="Tally" detail="over its XML gateway on port 9000, read-only" />
          <Row term="GSTR-2B" detail="the JSON or Excel any taxpayer can download" />
          <Row
            term="Invoice Management System"
            detail="recommended accept, reject or pending for every record"
          />
          <Row term="Bank" detail="statement CSV; Account Aggregator later" />
        </dl>
        <p className="mt-5 max-w-[68ch] text-sm leading-relaxed text-ink-soft">
          Nothing is written back to a client&rsquo;s books. The tool flags exceptions and
          the CA decides.
        </p>
      </section>

      <section className="border-t border-rule py-10">
        <h2 className="text-sm font-semibold">Where this actually is</h2>
        <p className="mt-3 max-w-[68ch] text-sm leading-relaxed text-ink-soft">
          Working software with a measured evaluation, not a product you can buy yet. The
          GST rule set is researched against GSTN&rsquo;s own documentation and is waiting
          on review by a practising CA before the Invoice Management System rules are
          switched on. Authentication, firm-level access control and encryption at rest are
          scheduled, not built. We are not claiming certifications we do not hold.
        </p>
        <p className="mt-4 max-w-[68ch] text-sm leading-relaxed text-ink-soft">
          Pricing, when there is something to sell: an anchor of ₹6,000 to ₹15,000 per
          month per firm for up to twenty-five companies. The firm bills the client.
        </p>
      </section>

      <section className="border-t border-rule-strong py-10">
        <h2 className="text-lg font-semibold tracking-tight">
          If you run a practice and this sounds like your close
        </h2>
        <p className="mt-3 max-w-[60ch] text-sm leading-relaxed text-ink-soft">
          We want three firms to use it free and be watched working. The first twenty
          minutes of that tells us more than another month of building.
        </p>
        <a
          href="mailto:hello@diligenceready.in?subject=CA%20firm%20pilot"
          className="mt-5 inline-block border border-ink px-4 py-2 text-sm font-medium hover:bg-ink hover:text-paper"
        >
          hello@diligenceready.in
        </a>
      </section>

      <footer className="border-t border-rule py-8 text-micro text-ink-soft">
        <Link href="/" className="underline decoration-rule-strong underline-offset-4 hover:decoration-ink">
          See the working dashboard
        </Link>
        <p className="mt-3 max-w-[70ch] leading-relaxed">
          Figures shown in the product are from a seeded synthetic dataset, not a real
          company. GST rules change by notification; nothing here is tax advice.
        </p>
      </footer>
    </main>
  );
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="tabular text-4xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 max-w-[22ch] text-micro leading-relaxed text-ink-soft">{label}</p>
    </div>
  );
}

function Row({ term, detail }: { term: string; detail: string }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      <dt className="w-[14rem] shrink-0 font-medium">{term}</dt>
      <dd className="text-ink-soft">{detail}</dd>
    </div>
  );
}
