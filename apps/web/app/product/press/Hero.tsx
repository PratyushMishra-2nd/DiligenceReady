import Link from "next/link";

import aggregates from "../aggregates.json";

import { Overprint } from "./Overprint";
import { Rupee } from "./Rupee";

/**
 * The first screen of a startup site, which has one job: tell a stranger
 * what this is, who it is for, and what to press.
 *
 * It used to open on a number. A number with no sentence in front of it is
 * a number nobody can read, however large it is set, so the order is now
 * the problem, then the product, then the consequence, then the way in. The
 * figure keeps its scale and keeps the overprint, but it arrives as evidence
 * for a claim rather than as the claim.
 *
 * Every figure is read from `aggregates.json`, generated from the seed feeds.
 */
export function Hero({ signIn }: { signIn: string }) {
  const { headline, totals } = aggregates;
  const read =
    totals.purchase_register + totals.gstr2b_documents + totals.bank_statement;

  return (
    <section className="pb-16 pt-14 sm:pt-20">
      <div className="grid gap-x-14 gap-y-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <p className="font-mono text-stub uppercase text-statute-deep">
            Books · GSTR-2B · Bank
          </p>

          <h1 className="wdth-tight mt-5 max-w-[15ch] font-anek text-opener font-bold text-agreed">
            Three systems. One truth.
          </h1>

          <p className="opsz-deck mt-7 max-w-[46ch] font-news text-[1.4rem] sm:text-deck text-agreed">
            An SME&rsquo;s books, the government&rsquo;s record of them, and the money
            never agree. We keep them agreeing every month, keep the evidence, and put a
            deadline on the money.
          </p>

          <p className="opsz-prose mt-6 max-w-[54ch] font-news text-prose text-graphite">
            Reconciling Tally against GSTR-2B against the bank is manual, monthly, done in
            Excel, and abandoned when it gets hard. Built for the chartered-accountant
            firms who already do that work, across every client they carry.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-x-4 gap-y-3">
            <Link
              href={signIn}
              className="border-2 border-books bg-books px-6 py-3 font-mono text-ident uppercase tracking-[0.08em] text-stock hover:bg-stock hover:text-books"
            >
              Open the live workspace
            </Link>
            <a
              href="#how"
              className="border-2 border-hairline px-6 py-3 font-mono text-ident uppercase tracking-[0.08em] text-graphite hover:border-agreed hover:text-agreed"
            >
              See how it works
            </a>
          </div>

          <p className="opsz-prose mt-4 font-news text-ident text-graphite">
            No signup. A demo firm is already loaded, with two client companies and twelve
            months of books behind each.
          </p>
        </div>

        {/* The consequence, at scale. It bleeds right because a figure this
            size should look like it did not fit; it never bleeds left,
            because that edge belongs to the rail. */}
        <figure className="min-w-0 lg:pt-6">
          <figcaption className="font-mono text-stub uppercase text-graphite">
            What the disagreement costs two client companies
          </figcaption>

          <div className="-mr-[10vw] mt-4">
            {/* Deliberately smaller and lighter than the h1 beside it. At
              132px/extrabold it was sixteen pixels larger and a weight heavier
              than the headline, in the same face — so the eye landed on the
              number first and had to walk back left to find out what the
              product was. The source order was right and the optical order
              was not. It is still the largest thing in its own column. */}
          <Overprint className="wdth-condensed font-anek text-[clamp(48px,8.5vw,104px)] font-bold leading-[0.84] tracking-[-0.04em]">
              <Rupee amount={headline.amount} />
            </Overprint>
          </div>

          <p className="opsz-prose mt-5 max-w-[42ch] font-news text-prose text-graphite">
            Input tax credit already paid to suppliers and not yet claimable, because the
            supplier&rsquo;s filing and the client&rsquo;s books disagree.{" "}
            <span className="text-statute-deep">
              <Rupee amount={headline.before_next_deadline.amount} /> of it
            </span>{" "}
            sits on invoices whose Section 16(4) window closes on 30 November. After that
            date it stops being a receivable and becomes a cost.
          </p>

          <dl className="mt-8 border-t border-hairline">
            <Row label="Records read" value={read.toLocaleString("en-IN")} />
            <Row label="Periods" value="12" />
            <Row label="Findings raised" value={String(aggregates.totals.planted)} />
          </dl>
        </figure>
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-hairline py-2">
      <dt className="font-mono text-stub uppercase text-graphite">{label}</dt>
      <dd className="tabular font-mono text-ident text-agreed">{value}</dd>
    </div>
  );
}
