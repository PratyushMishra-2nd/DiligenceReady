import Link from "next/link";

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
const LONG_DATE = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * Days between today and the statutory cut-off.
 *
 * Both dates are pinned to UTC midnight rather than local time, because the
 * only thing being compared is a calendar distance: a reader in IST and the
 * server in UTC must be told the same number of days, and `new Date()` in two
 * zones either side of midnight is otherwise off by one. A page that prints a
 * deadline wrongly by a day is worse than one that does not print it.
 *
 * The count is computed on the server and the route revalidates hourly, so it
 * is at worst an hour stale on a figure that changes once a day.
 */
function daysUntil(iso: string): number {
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const [y, m, d] = iso.split("-").map(Number);
  return Math.max(0, Math.round((Date.UTC(y, m - 1, d) - today) / 86_400_000));
}

export function Hero() {
  const { headline, totals } = aggregates;
  const read =
    totals.purchase_register + totals.gstr2b_documents + totals.bank_statement;
  const clientMonths = totals.companies * aggregates.periods;
  const deadline = new Date(`${headline.before_next_deadline.deadline}T00:00:00Z`);
  const daysLeft = daysUntil(headline.before_next_deadline.deadline);

  return (
    <section className="pb-14 pt-10 sm:pt-12">
      {/* Stacked, not two columns, and that is what the figure below is for.
          The hero used to be a 1.05fr / 1fr split with the headline in one
          column and the money in the other, which capped the figure at 88px:
          half a 1280px sheet cannot hold a fourteen-character rupee amount at
          any larger size. So the whole type system's reason for existing was
          being set at a third of its scale — `globals.css` states outright
          that Anek's width axis "is the entire reason it is here: it is what
          lets a fourteen character rupee figure set at 268px inside a 1280px
          viewport", and `text-register` was written for exactly that and
          called from nowhere.
          The figure gets the full measure now and the supporting material
          goes underneath it in two columns. The argument runs in the same
          order it always did — what this is, what we found, what it costs —
          it is just no longer whispering the middle term. */}
      <p className="sets sets-1 font-mono text-stub uppercase text-statute-deep">
        Tally · GSTR-2B · Bank — for firms carrying 5 to 80 clients
      </p>

      <h1 className="sets sets-2 rag-balance optical-cap wdth-tight mt-4 max-w-[15ch] font-anek text-headline font-bold text-agreed">
        Reconciled the week 2B lands.
      </h1>

      {/* The money, and the clock on it. This was captioned "what the
          disagreement costs two client companies" — a caption about a demo
          dataset rather than a claim the reader can feel. The credit is what
          the client has already paid; the date is what makes it urgent; the
          last clause is what makes it the partner's problem rather than the
          client's. */}
      <figure className="mt-9 min-w-0">
        <figcaption className="font-mono text-stub uppercase text-graphite">
          Found on two client companies, in one pass
        </figcaption>

        {/* The negative margin that used to be here — `-mr-[6vw]` — drew
            nothing at any viewport. `Overprint`'s root is an `inline-block`,
            so it shrinks to fit its content; widening the containing block to
            its right does not stretch it. Measured at 1440px the figure ended
            228px short of the column it was supposedly bleeding out of. The
            bleed was a class, not an effect. */}
        <div className="mt-2">
          <Overprint
            settle
            throwBy={16}
            settleMs={900}
            className="optical-figure wdth-condensed font-anek text-register font-bold"
          >
            <Rupee amount={headline.amount} />
          </Overprint>
        </div>

        <p className="rag-pretty opsz-prose mt-5 max-w-[52ch] font-news text-prose text-graphite">
          Input tax credit your client has already paid to suppliers and cannot claim,
          because the supplier&rsquo;s filing and the books disagree.
        </p>
      </figure>

      <div className="mt-12 grid gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <p className="sets sets-3 rag-pretty opsz-intro max-w-[50ch] font-news text-[1.25rem] leading-snug text-agreed sm:text-[1.6rem]">
            Every rupee of input tax credit has a last date, and we put it on the invoice.
            DiligenceReady matches your client&rsquo;s Tally books, their GSTR-2B and their
            bank statement every month, for every client your firm carries, and dates every
            unclaimed rupee to its own Section 16(4) deadline.
          </p>

          <div className="sets sets-4 mt-7 flex flex-wrap items-center gap-x-4 gap-y-3">
            <DemoButton label="Open the live demo" />
            {/* The one thing on this site a stranger can operate without an
                account, and it was linked once from the colophon at 14px. A
                date in, a real statutory answer out, in about ten seconds —
                a stronger demonstration of domain competence than any
                sentence on this page, and it does not depend on the demo
                engine being reachable. */}
            <Link
              href="/tools/section-16-4"
              className="mark-verb font-mono text-ident uppercase tracking-[0.08em] text-agreed underline decoration-statute underline-offset-4 hover:decoration-agreed"
            >
              Date an invoice &rarr;
            </Link>
            <a
              href="#pricing"
              className="mark-verb font-mono text-ident uppercase tracking-[0.08em] text-graphite underline decoration-graphite-soft underline-offset-4 hover:text-agreed hover:decoration-agreed"
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
              <span className="mark-verb select-all break-all font-mono text-agreed hover:bg-sunk">
                {DEMO_EMAIL}
              </span>{" "}
              <span className="mark-verb select-all break-all font-mono text-agreed hover:bg-sunk">
                {DEMO_PASSWORD}
              </span>
            </p>
          </div>
        </div>

        <div className="min-w-0">
          {/* The consequence, at a size a reader can meet.
              This was the third sentence of the paragraph above, set at 17px:
              the strongest commercial claim on the page, below the fold of
              attention. The figure above is a PROCESS claim — here is what we
              found. This is a CONSEQUENCE claim — here is what happens to your
              client if you do nothing — and a consequence claim is the one a
              partner acts on.
              It is deliberately smaller than the headline figure rather than
              equal to it. Two figures of one size fight; a large one and a
              firm one read in order, which is the order the argument runs
              in — and now that the headline figure is set at `text-register`
              rather than at 88px, the gap between them states that order
              rather than merely implying it. */}
          <div className="mt-6 border-t-2 border-agreed pt-4">
            <p className="font-mono text-stub uppercase tracking-[0.06em] text-statute-deep">
              Section 16(4) · closes {LONG_DATE.format(deadline)}
            </p>
            <p className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="wdth-condensed tabular optical-figure font-anek text-[clamp(30px,4vw,46px)] font-bold leading-none text-statute-deep">
                <Rupee amount={headline.before_next_deadline.amount} />
              </span>
              <span className="tabular font-mono text-ident uppercase tracking-[0.06em] text-graphite">
                {daysLeft} days left
              </span>
            </p>
            <p className="rag-pretty opsz-prose mt-3 max-w-[46ch] font-news text-prose text-agreed">
              of that credit sits on invoices whose window closes then. After that date it
              stops being a receivable and becomes the client&rsquo;s cost, and your
              conversation.
            </p>
          </div>

          <dl className="mt-6 border-t border-hairline">
            <Row label="Records read" value={read.toLocaleString("en-IN")} />
            <Row label="Client-months reconciled" value={String(clientMonths)} />
          </dl>
        </div>
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
