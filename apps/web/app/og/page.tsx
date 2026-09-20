import aggregates from "../press/aggregates.json";
import { Overprint } from "../press/Overprint";
import { Rupee } from "../press/Rupee";

export const metadata = {
  title: "Open Graph card",
  robots: { index: false, follow: false },
};

/**
 * The share card, as a route rather than as a drawing.
 *
 * A link to this product gets pasted into a WhatsApp group of chartered
 * accountants, or into LinkedIn, and until now it rendered as a blank
 * rectangle with a domain under it. That is the first impression the page
 * makes on the channel it actually travels through, and it was not being made
 * at all.
 *
 * It is composed here, in the browser, in the page's own two faces, and then
 * photographed at 1200x630 into `public/og.png` by the same script that takes
 * the product plates. The alternative was `next/og`, which renders through
 * Satori — and Satori does not read variable woff2, so Anek would have come
 * out as whatever the renderer had lying around. A share card set in a
 * substitute face is a worse lie than no share card, on a page whose type
 * system is an argument about provenance.
 *
 * `noindex` because this is an asset with a URL, not a page.
 *
 * To regenerate after a copy change: run scripts/shoot-og.mjs, or take
 * `/og` at 1200x630 with any headless browser and overwrite public/og.png.
 */
export default function OgCard() {
  const { headline } = aggregates;

  return (
    <main
      className="flex flex-col justify-between bg-stock px-16 pb-16 pt-12 text-agreed"
      style={{ width: 1200, height: 630 }}
    >
      <div className="flex items-baseline justify-between">
        <p className="wdth-tight font-anek text-[2rem] font-bold leading-none text-agreed">
          DiligenceReady
        </p>
        <p className="font-mono text-[1rem] uppercase tracking-[0.12em] text-statute-deep">
          Books · GSTR-2B · Bank
        </p>
      </div>

      <div>
        <h1 className="optical-cap wdth-tight max-w-[18ch] font-anek text-[5.5rem] font-bold leading-[0.92] tracking-[-0.032em] text-agreed">
          Reconciled the week 2B lands.
        </h1>
        <p className="opsz-deck mt-6 max-w-[52ch] font-news text-[1.75rem] leading-snug text-graphite">
          Books, GSTR-2B and bank, reconciled every month, with the evidence kept — for
          the CA firms who do the work.
        </p>
      </div>

      <div className="flex items-end justify-between border-t-2 border-agreed pt-5">
        <div>
          <p className="font-mono text-[0.8125rem] uppercase tracking-[0.12em] text-graphite">
            Input tax credit paid and not claimable, two client companies
          </p>
          <p className="optical-figure mt-2">
            <Overprint className="wdth-condensed font-anek text-[3.25rem] font-bold leading-none tracking-[-0.04em]">
              <Rupee amount={headline.amount} />
            </Overprint>
          </p>
        </div>
        <p className="font-mono text-[0.8125rem] uppercase tracking-[0.12em] text-graphite-soft">
          {aggregates.totals.detected} of {aggregates.totals.planted} planted defects found
        </p>
      </div>
    </main>
  );
}
