import Link from "next/link";

import aggregates from "./aggregates.json";
import { DEMO_EMAIL, DEMO_PASSWORD } from "../lib/demo";
import { DemoButton } from "./DemoButton";
import { Rupee } from "./Rupee";
import { SplitHeading } from "./SplitHeading";

const LONG_DATE = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function daysUntil(iso: string): number {
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const [y, m, d] = iso.split("-").map(Number);
  return Math.max(0, Math.round((Date.UTC(y, m - 1, d) - today) / 86_400_000));
}

/**
 * The hero.
 *
 * Three things changed here and each was a real defect rather than a matter
 * of taste.
 *
 * THE LARGEST THING ON THE PAGE IS NOW A CLAIM, NOT A NUMBER. The figure used
 * to be set at `clamp(46px, 17.5vw, 268px)` — about 252px on a laptop — while
 * the headline capped at 84px. So the biggest element on the site belonged to
 * a seeded dataset the reader has no stake in, and the sentence that has to
 * persuade them was a third of its size. The figure caps at 96px now and the
 * headline leads.
 *
 * THE FIGURE SAYS IT IS A DEMO, WITHIN ITS OWN CAPTION. It was captioned
 * "Found on two client companies, in one pass", which a stranger reads as a
 * customer result; that the books are synthetic was disclosed thirteen
 * thousand pixels further down. On a page whose entire thesis is that it does
 * not overclaim, the single largest visual claim was overclaiming, and the
 * correction was one word.
 *
 * THE HEADLINE IS NOT ANIMATED. It is the LCP candidate, and a browser does
 * not record an element as painted while its opacity is zero — so the fade it
 * used to carry was costing up to 610ms of Largest Contentful Paint for an
 * effect nobody consciously perceives. Everything around it still seats; the
 * headline is simply there when the paper arrives.
 */
export function Hero() {
  const { headline, totals } = aggregates;
  const read = totals.purchase_register + totals.gstr2b_documents + totals.bank_statement;
  const clientMonths = totals.companies * aggregates.periods;
  const deadline = new Date(`${headline.before_next_deadline.deadline}T00:00:00Z`);
  const daysLeft = daysUntil(headline.before_next_deadline.deadline);

  return (
    <section className="pb-section pt-12 md:pb-section-md lg:pt-16">
      <p className="seats seats-1 font-mono text-label-12 uppercase text-exposure-deep">
        Tally · GSTR-2B · Bank — for firms carrying 5 to 80 clients
      </p>

      <SplitHeading
        as="h1"
        text="Every rupee of input tax credit has a last date."
        delay={60}
        className="rag-balance leading-trim mt-6 max-w-display font-sans text-display-1 font-medium text-ink"
      />

      <p className="seats seats-2 rag-pretty mt-8 max-w-lede font-sans text-copy-19 text-ink-muted">
        We match your client&rsquo;s Tally books, their GSTR-2B and their bank statement every
        month, for every client your firm carries — and date every unclaimed rupee to the return
        it has to be claimed in.
      </p>

      <div className="seats seats-3 mt-9 flex flex-wrap items-center gap-x-5 gap-y-3">
        <DemoButton label="Open the demo" />
        <Link
          href="/tools/section-16-4"
          className="mark-verb font-mono text-label-12 uppercase text-ink underline decoration-exposure underline-offset-4 hover:decoration-ink"
        >
          Date an invoice &rarr;
        </Link>
      </div>

      <p className="seats seats-3 mt-4 font-mono text-label-12 uppercase text-ink-subtle">
        No signup. No form. No sales call.
      </p>


      <div className="mt-block grid gap-x-block gap-y-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <figure className="min-w-0">
          {/* "In our demo firm" is the whole of the fix. It costs nothing and
              it buys the rest of the page. */}
          <figcaption className="font-mono text-label-12 uppercase text-ink-subtle">
            In our demo firm — two client companies, twelve months
          </figcaption>
          <p className="vt-figure fig leading-trim mt-3 block break-words font-sans text-figure-1 font-semibold text-ink">
            <Rupee amount={headline.amount} />
          </p>
          <figcaption className="rag-pretty mt-5 max-w-prose font-sans text-copy-17 text-ink-muted">
            Input tax credit your client has already paid to suppliers and cannot claim, because
            the supplier&rsquo;s filing and the books disagree.
          </figcaption>
        </figure>

        <div className="min-w-0">
          <div className="border-t-2 border-ink pt-4">
            <p className="font-mono text-label-12 uppercase text-exposure-deep">
              Section 16(4) · closes {LONG_DATE.format(deadline)}
            </p>
            <p className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="fig font-sans text-head-2 font-semibold text-exposure-deep">
                <Rupee amount={headline.before_next_deadline.amount} />
              </span>
              <span className="fig font-mono text-label-12 uppercase text-ink-subtle">
                {daysLeft} days left
              </span>
            </p>
            <p className="rag-pretty mt-3 max-w-prose font-sans text-copy-17 text-ink">
              of that credit sits on invoices whose window closes then. After that date it stops
              being a receivable and becomes the client&rsquo;s cost, and your conversation.
            </p>
          </div>

          <dl className="mt-8 border-t border-hairline">
            <Row label="Records read" value={read.toLocaleString("en-IN")} />
            <Row label="Client-months reconciled" value={String(clientMonths)} />
            <Row label="Planted defects found" value={`${totals.detected} of ${totals.planted}`} />
          </dl>

          <div className="mt-6 max-w-prose border-t border-hairline pt-3">
            <p className="rag-pretty text-caption-13 leading-relaxed text-ink-muted">
              The workspace is loaded with two client companies and twelve months of books — or
              sign in yourself as{" "}
              <span className="mark-verb select-all break-all font-mono text-ink hover:bg-sunken">
                {DEMO_EMAIL}
              </span>{" "}
              <span className="mark-verb select-all break-all font-mono text-ink hover:bg-sunken">
                {DEMO_PASSWORD}
              </span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-hairline py-2.5">
      <dt className="font-mono text-label-12 uppercase text-ink-subtle">{label}</dt>
      <dd className="fig font-mono text-caption-13 text-ink">{value}</dd>
    </div>
  );
}
