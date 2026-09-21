import aggregates from "../press/aggregates.json";
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
      className="flex flex-col justify-between bg-canvas px-16 pb-16 pt-12 text-ink"
      style={{ width: 1200, height: 630 }}
    >
      <div className="flex items-baseline justify-between">
        <p className=" font-sans text-head-2 font-semibold leading-none text-ink">
          DiligenceReady
        </p>
        <p className="font-mono text-copy-17 uppercase tracking-[0.12em] text-exposure-deep">
          Books · GSTR-2B · Bank
        </p>
      </div>

      <div>
        <h1 className="leading-trim max-w-[18ch] font-sans text-display-1 font-semibold leading-[0.92] tracking-[-0.032em] text-ink">
          Reconciled the week 2B lands.
        </h1>
        <p className=" mt-6 max-w-[52ch] font-sans text-head-3 leading-snug text-ink-muted">
          Books, GSTR-2B and bank, reconciled every month, with the evidence kept — for
          the CA firms who do the work.
        </p>
      </div>

      <div className="flex items-end justify-between border-t-2 border-ink pt-5">
        <div>
          <p className="font-mono text-caption-13 uppercase tracking-[0.12em] text-ink-muted">
            Input tax credit paid and not claimable, two client companies
          </p>
          <p className="leading-trim mt-2">
            <span className=" font-sans text-head-1 font-semibold leading-none tracking-[-0.04em]">
              <Rupee amount={headline.amount} />
            </span>
          </p>
        </div>
        <p className="font-mono text-caption-13 uppercase tracking-[0.12em] text-ink-subtle">
          {aggregates.totals.detected} of {aggregates.totals.planted} planted defects found
        </p>
      </div>
    </main>
  );
}
