import aggregates from "./aggregates.json";
import { DEMO_EMAIL, DEMO_PASSWORD } from "../lib/demo";

import { DemoButton } from "./DemoButton";
import { Overprint } from "./Overprint";
import { Rupee } from "./Rupee";

/**
 * The first screen, which has one job: sell.
 *
 * It used to open on "Three systems. One truth." — a riddle about the
 * mechanism, in the slot where a claim about the buyer belongs. Nothing in it
 * was Indian, GST, CA or statutory; swap the wordmark and the line would serve
 * any data-integration vendor on earth. The only sentence on the page that
 * said what this product was sat in the masthead at 13px, set smaller than the
 * demo password printed under the buttons.
 *
 * The headline is a timing promise now, because the failure this product
 * exists for is a timing failure: the reconciliation gets done, gets done in
 * Excel, and is the thing that slips. "The week 2B lands" is also domain
 * fluency compressed into four words — a partner knows instantly whether the
 * person who wrote it has done the work, and it cannot be faked by anyone who
 * has not.
 *
 * The deck leads on the Section 16(4) clock, and that is the whole commercial
 * argument. Nobody else in this market sells it: ClearTax, Tally, Zoho, Vyapar,
 * Refrens and KhataBook between them offer "claim up to 100% ITC" and "zero
 * notices", and not one of them dates the credit. This engine computes that
 * date per invoice, and the page had it in a figure caption.
 *
 * Every figure is read from `aggregates.json`, generated from the seed feeds.
 */
export function Hero() {
  const { headline, totals } = aggregates;
  const read =
    totals.purchase_register + totals.gstr2b_documents + totals.bank_statement;
  const clientMonths = totals.companies * aggregates.periods;

  return (
    <section className="pb-14 pt-10 sm:pt-12">
      <div className="grid gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <p className="sets sets-1 font-mono text-stub uppercase text-statute-deep">
            Tally · GSTR-2B · Bank — for firms carrying 5 to 80 clients
          </p>

          <h1 className="sets sets-2 rag-balance optical-cap wdth-tight mt-4 max-w-[15ch] font-anek text-headline font-bold text-agreed">
            Reconciled the week 2B lands.
          </h1>

          <p className="sets sets-3 rag-pretty opsz-intro mt-5 max-w-[50ch] font-news text-[1.25rem] leading-snug text-agreed sm:text-[1.6rem]">
            Every rupee of input tax credit has a last date, and we put it on the invoice.
            DiligenceReady matches your client&rsquo;s Tally books, their GSTR-2B and their
            bank statement every month, for every client your firm carries, and dates every
            unclaimed rupee to its own Section 16(4) deadline.
          </p>

          <div className="sets sets-4 mt-7 flex flex-wrap items-center gap-x-4 gap-y-3">
            <DemoButton label="Open the live demo" />
            <a
              href="#pricing"
              className="font-mono text-ident uppercase tracking-[0.08em] text-graphite underline decoration-hairline underline-offset-4 transition-colors hover:text-agreed hover:decoration-agreed"
            >
              See pricing &rarr;
            </a>
          </div>

          {/* The password beside the button it belongs to. This used to say the
              password was "printed further down this page" — and it was, at
              about 14,600px, so the largest button on the site led to an empty
              form and the key to it was seventeen screens away. */}
          <div className="mt-5 max-w-[48ch] border-t border-hairline pt-3">
            <p className="font-mono text-stub uppercase text-graphite">
              No signup. No form. No sales call.
            </p>
            <p className="rag-pretty opsz-prose mt-2 font-news text-ident leading-relaxed text-graphite">
              The workspace is already loaded with two client companies and twelve months of
              books — or sign in yourself as{" "}
              <span className="select-all break-all font-mono text-agreed">{DEMO_EMAIL}</span>{" "}
              <span className="select-all break-all font-mono text-agreed">
                {DEMO_PASSWORD}
              </span>
            </p>
          </div>
        </div>

        {/* The money, and the clock on it. This was captioned "what the
            disagreement costs two client companies" — a caption about a demo
            dataset rather than a claim the reader can feel. The credit is what
            the client has already paid; the date is what makes it urgent; the
            last clause is what makes it the partner's problem rather than the
            client's. */}
        <figure className="min-w-0 lg:pt-5">
          <figcaption className="font-mono text-stub uppercase text-graphite">
            Found on two client companies, in one pass
          </figcaption>

          <div className="-mr-[6vw] mt-3">
            <Overprint
              settle
              className="optical-figure wdth-condensed font-anek text-[clamp(44px,6.6vw,88px)] font-bold leading-[0.84] tracking-[-0.04em]"
            >
              <Rupee amount={headline.amount} />
            </Overprint>
          </div>

          <p className="rag-pretty opsz-prose mt-4 max-w-[44ch] font-news text-prose text-graphite">
            Input tax credit your client has already paid to suppliers and cannot claim,
            because the supplier&rsquo;s filing and the books disagree.{" "}
            <span className="font-medium text-statute-deep">
              <Rupee amount={headline.before_next_deadline.amount} /> of it sits on invoices
              whose Section 16(4) window closes on 30 November.
            </span>{" "}
            After that date it stops being a receivable and becomes the client&rsquo;s cost,
            and your conversation.
          </p>

          <dl className="mt-6 border-t border-hairline">
            <Row label="Records read" value={read.toLocaleString("en-IN")} />
            <Row label="Client-months reconciled" value={String(clientMonths)} />
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
