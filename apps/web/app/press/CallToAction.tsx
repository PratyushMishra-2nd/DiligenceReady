import { DEMO_EMAIL, DEMO_FIRM, DEMO_PASSWORD } from "../lib/demo";
import { DemoButton } from "./DemoButton";

/**
 * The close, on an inverted plate.
 *
 * The one place the page turns over. It is not a dark mode and it is not a
 * gradient: it is the same two inks printed on a black plate instead of a
 * bone one, at 16.8:1 and 10.8:1, which is the opposite of the washed-out
 * dark section this project is audited against.
 *
 * It bleeds now, and that is the whole of the fix. `-mx-6 sm:-mx-10` pulled
 * the plate out by the container's padding and no further, so inside a
 * 1280px measure on a 1920px screen it rendered as a black card with 280px of
 * bone either side of it — a card, on a page with no cards, claiming to be the
 * moment the sheet turns over. This section now sits outside the measure and
 * carries its own, so the ink runs to both edges of the screen and the type
 * inside it stays on the same column as every other section.
 *
 * The demo credentials are on the page rather than behind a form. There is
 * nothing to capture here and a contact form would be a lie about what
 * happens next: the workspace is already loaded and the way in is a password
 * anyone can read.
 */
export function CallToAction() {
  return (
    <section className="mt-20 bg-plate px-6 py-20 text-stock sm:px-10">
      <div className="mx-auto grid max-w-[1280px] gap-x-14 gap-y-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <div>
          <h2 className="optical-round wdth-tight max-w-[16ch] font-anek text-opener font-bold text-stock">
            Open it and look.
          </h2>
          <p className="rag-pretty opsz-deck mt-7 max-w-[44ch] font-news text-[1.4rem] sm:text-deck text-stock-soft">
            A demo firm is already signed up, carrying two client companies with twelve
            months of books, GST returns and bank statements behind each.
          </p>
          <p className="rag-pretty opsz-prose mt-6 max-w-[52ch] font-news text-prose text-stock-faint">
            The records are generated rather than real, and that is deliberate: it is the
            only way to know in advance what the engine is supposed to find, and therefore
            the only way to measure whether it found it.
          </p>

          <div className="mt-10">
            <DemoButton variant="plate" />
          </div>
        </div>

        {/* `self-start` because a grid item stretches to its row by default,
            and this one was drawing a border round two hundred pixels of
            nothing under the last line of its own fine print. */}
        <div className="self-start border border-stock-faint/40 p-6">
          <p className="font-mono text-stub uppercase text-stock-faint">Sign in as</p>
          <dl className="mt-4 space-y-4">
            <div>
              <dt className="font-mono text-stub uppercase text-stock-faint">Firm</dt>
              <dd className="wdth-set mt-1 font-anek text-[1.25rem] font-semibold text-stock">
                {DEMO_FIRM}
              </dd>
            </div>
            <div>
              <dt className="font-mono text-stub uppercase text-stock-faint">Email</dt>
              <dd className="mt-1 select-all break-all font-mono text-ident text-stock">
                {DEMO_EMAIL}
              </dd>
            </div>
            <div>
              <dt className="font-mono text-stub uppercase text-stock-faint">Password</dt>
              <dd className="mt-1 select-all break-all font-mono text-ident text-stock">
                {DEMO_PASSWORD}
              </dd>
            </div>
          </dl>
          <p className="rag-pretty opsz-prose mt-6 font-news text-ident leading-relaxed text-stock-faint">
            A demo account on generated data. There is no self-service signup, because
            there is no self-service client data: a firm owner creates each account and
            every account belongs to exactly one firm.
          </p>
        </div>
      </div>
    </section>
  );
}
