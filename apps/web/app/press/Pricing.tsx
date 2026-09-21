import aggregates from "./aggregates.json";

import { DemoButton } from "./DemoButton";
import { Opener } from "./Sheet";
import { Rupee } from "./Rupee";

/**
 * The price, at the size of a price.
 *
 * It was a grey sentence inside a body paragraph at 85% scroll depth, with a
 * second mention buried in a collapsed FAQ answer below that. On a page asking
 * a partner to hand thirty clients' books to a vendor he has never heard of,
 * that reads as "we will decide what you can afford", which is the one signal
 * a company with no customers cannot afford to send.
 *
 * Showing it at all is the off-pattern move in this category and the
 * on-pattern move for this price. ClearTax's CA-firm page carries no price —
 * it is demo-gated, because it is selling an enterprise motion. Tally prints
 * ₹750 and ₹2,250 a month on the product page. Zoho Books India prints a
 * six-rung ladder from ₹749. At ₹6,000 to ₹15,000 this sits in Tally and
 * Zoho's band, so it behaves like Tally and Zoho.
 *
 * Three things are said out loud because every Indian buyer in this market
 * assumes the opposite until told: the unit is the firm and not the seat, the
 * tax treatment is stated, and the arithmetic per client is done for the
 * reader rather than left to him.
 */
export function Pricing() {
  return (
    <section id="pricing" className="scroll-mt-24 py-section md:py-section-md lg:py-section-lg lg:pl-[268px]">
      <div className="grid gap-x-block gap-y-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <Opener className="max-w-pull">
            What it costs
          </Opener>

          <p className="leading-trim mt-8">
            {/* The floor is 40px, not 48. Same defect as `text-figure-1`: 7vw
                does not reach 48px until a 686px viewport, so every phone got
                the floor — thirteen glyphs of condensed Anek bold at 48px
                against 272px of usable measure at 320px, held on one line by
                `whitespace-nowrap`, inside a `<main>` that is
                `overflow-x-clip`. The most important number on the page was
                being cut off with no scrollbar to say so.
                `whitespace-nowrap` stays: a price that breaks across two
                lines mid-range is worse than a smaller one. Above 686px
                nothing about this changes. */}
            <span className="fig leading-trim font-sans text-head-1 font-semibold text-ink">
              ₹6,000&ndash;15,000
            </span>
          </p>
          <p className=" mt-3 font-sans text-head-4 font-semibold text-ink-muted">
            per month, per firm. Up to 25 client companies. Plus 18% GST.
          </p>

          <p className="rag-pretty mt-7 max-w-lede font-sans text-copy-19 text-ink">
            That is <span className="fig">₹240</span> to{" "}
            <span className="fig">₹600</span> per client company, per month.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3">
            <DemoButton label="Open the live demo" />
            <a
              href="#pilot"
              className="magnetic rounded-chip border-2 border-hairline px-6 py-3 font-mono text-caption-13 uppercase tracking-[0.08em] text-ink-muted hover:border-ink hover:text-ink"
            >
              Run it on a real client
            </a>
          </div>
        </div>

        <dl className="border-t border-hairline lg:mt-4">
          <Row term="Priced per firm, not per seat">
            Your partners, your managers and your articles all work off the same firm
            account. There is no per-user fee, because a practice does not buy software one
            desk at a time.
          </Row>
          <Row term="The firm is the customer, and the firm bills the client">
            It goes on the same engagement-letter line that already carries your GST
            compliance work.
          </Row>
          <Row term="For scale">
            The top of that range is{" "}
            <span className="fig font-medium text-ink">₹1,80,000</span> a year. The
            two companies in the demo were carrying{" "}
            <span className="fig font-medium text-exposure-deep">
              <Rupee amount={aggregates.headline.amount} />
            </span>{" "}
            of unclaimable credit between them.
          </Row>
          <Row term="Carrying more than twenty-five clients?">
            Write to us. The number moves with the roster, not with how many people log in.
          </Row>
        </dl>
      </div>
    </section>
  );
}

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-hairline py-3">
      <dt className=" font-sans text-head-4 font-semibold leading-tight text-ink">
        {term}
      </dt>
      <dd className="rag-pretty mt-1 font-sans text-caption-13 leading-relaxed text-ink-muted">
        {children}
      </dd>
    </div>
  );
}
