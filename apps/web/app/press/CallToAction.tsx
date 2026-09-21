import { DEMO_EMAIL, DEMO_FIRM, DEMO_PASSWORD } from "../lib/demo";
import { DemoButton } from "./DemoButton";
import { Opener } from "./Sheet";

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
    <section className="plate-section mt-section bg-plate px-6 py-section text-plate-ink sm:px-10 md:py-section-md">
      <div className="mx-auto grid max-w-[1280px] gap-x-14 gap-y-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <div>
          {/* Slip zero, and through `Opener` rather than around it.
              This is the close, so it is the one heading on the document
              printed dead in register — the argument arriving rather than
              still converging. It reached that state by being a raw `<h2>`
              that nobody had put on the ladder, which is the same markup for
              an entirely different reason, and the difference is the whole
              point of the section.

              `Opener` renders a plain heading at slip zero and adds no ghost
              plates, which is also the only thing that works here: these two
              inks are composited with `mix-blend-multiply`, and multiply
              against a black plate returns the plate. An overprint on this
              ground would be three invisible layers. */}
          <Opener className="leading-trim max-w-[16ch] text-plate-ink">
            Open it and look.
          </Opener>
          <p className="rag-pretty mt-7 max-w-[44ch] font-sans text-head-4 sm:text-head-3 text-plate-muted">
            A demo firm is already signed up, carrying two client companies with twelve
            months of books, GST returns and bank statements behind each.
          </p>
          <p className="rag-pretty mt-6 max-w-[52ch] font-sans text-copy-17 text-plate-muted">
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
        <div className="self-start border border-plate-hairline p-6">
          <p className="font-mono text-label-12 uppercase text-plate-muted">Sign in as</p>
          <dl className="mt-4 space-y-4">
            <div>
              <dt className="font-mono text-label-12 uppercase text-plate-muted">Firm</dt>
              <dd className=" mt-1 font-sans text-copy-19 font-semibold text-plate-ink">
                {DEMO_FIRM}
              </dd>
            </div>
            <div>
              <dt className="font-mono text-label-12 uppercase text-plate-muted">Email</dt>
              <dd className="mt-1 select-all break-all font-mono text-caption-13 text-plate-ink">
                {DEMO_EMAIL}
              </dd>
            </div>
            <div>
              <dt className="font-mono text-label-12 uppercase text-plate-muted">Password</dt>
              <dd className="mt-1 select-all break-all font-mono text-caption-13 text-plate-ink">
                {DEMO_PASSWORD}
              </dd>
            </div>
          </dl>
          <p className="rag-pretty mt-6 font-sans text-caption-13 leading-relaxed text-plate-muted">
            A demo account on generated data. There is no self-service signup, because
            there is no self-service client data: a firm owner creates each account and
            every account belongs to exactly one firm.
          </p>
        </div>
      </div>
    </section>
  );
}
