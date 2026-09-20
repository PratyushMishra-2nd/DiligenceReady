import aggregates from "./aggregates.json";

import { DemoButton } from "./DemoButton";
import { Opener, slipFor } from "./Sheet";
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
    <section id="pricing" className="scroll-mt-24 py-14 lg:pl-20">
      <div className="grid gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <Opener slip={slipFor("pricing")} className="optical-cap max-w-[14ch]">
            What it costs
          </Opener>

          <p className="optical-figure mt-8">
            {/* The floor is 40px, not 48. Same defect as `text-register`: 7vw
                does not reach 48px until a 686px viewport, so every phone got
                the floor — thirteen glyphs of condensed Anek bold at 48px
                against 272px of usable measure at 320px, held on one line by
                `whitespace-nowrap`, inside a `<main>` that is
                `overflow-x-clip`. The most important number on the page was
                being cut off with no scrollbar to say so.
                `whitespace-nowrap` stays: a price that breaks across two
                lines mid-range is worse than a smaller one. Above 686px
                nothing about this changes. */}
            <span className="whitespace-nowrap wdth-condensed tabular font-anek text-[clamp(40px,7vw,92px)] font-bold leading-none text-agreed">
              ₹6,000&ndash;15,000
            </span>
          </p>
          <p className="wdth-set mt-3 font-anek text-subhead font-semibold text-graphite">
            per month, per firm. Up to 25 client companies. Plus 18% GST.
          </p>

          <p className="rag-pretty opsz-deck mt-7 max-w-[40ch] font-news text-[1.3rem] leading-snug text-agreed">
            That is <span className="tabular">₹240</span> to{" "}
            <span className="tabular">₹600</span> per client company, per month.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3">
            <DemoButton label="Open the live demo" />
            <a
              href="#pilot"
              className="border-2 border-hairline px-6 py-3 font-mono text-ident uppercase tracking-[0.08em] text-graphite press-verb hover:border-agreed hover:text-agreed"
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
            <span className="tabular font-medium text-agreed">₹1,80,000</span> a year. The
            two companies in the demo were carrying{" "}
            <span className="tabular font-medium text-statute-deep">
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
      <dt className="wdth-set font-anek text-subhead font-semibold leading-tight text-agreed">
        {term}
      </dt>
      <dd className="rag-pretty opsz-prose mt-1 font-news text-ident leading-relaxed text-graphite">
        {children}
      </dd>
    </div>
  );
}
