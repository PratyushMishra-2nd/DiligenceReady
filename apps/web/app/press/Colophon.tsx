import Link from "next/link";

import aggregates from "./aggregates.json";
import { DemoButton } from "./DemoButton";
import { Logo } from "./Logo";

/**
 * The colophon.
 *
 * A printed document says who set it and in what. This one does that and
 * also carries the disclosures, because the two belong together: the type
 * that states provenance is the same type the page is arguing about.
 *
 * The last rule above it is the misregistration closed to zero, which is
 * where the document finishes reconciling itself.
 */
export function Colophon() {
  return (
    <footer className="border-t-2 border-ink py-12">
      <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div>
          {/* The full lockup, tagline and all, because this is the one place
              on the page where nothing else says what the product is. The
              masthead has the positioning line beside it and suppresses this
              one; a colophon is where a printed document signs its own name
              in full. */}
          <Logo className="text-head-4" tagline />
          <p className="rag-pretty mt-3 max-w-[60ch] font-sans text-caption-13 leading-relaxed text-ink-muted">
            Figures on this page and in the product are from a seeded synthetic dataset,
            not a real company. GST rules change by notification; nothing here is tax
            advice.
          </p>

          {/* Two destinations. The tool is the smallest useful piece of the
              engine, given away because a firm hears about software from
              another firm rather than from a page. */}
          <div className="mt-4 flex flex-wrap items-baseline gap-x-7 gap-y-2 text-caption-13">
            {/* The same one-click route every other button on the page
                uses. This one pointed at the sign-in form — a cold, empty
                password box for an account a footer-clicking visitor has no
                reason to think they have. */}
            <DemoButton variant="link" label="Open the demo" />
            <Link
              href="/tools/section-16-4"
              className="text-ink mark-verb underline decoration-hairline underline-offset-4 hover:decoration-ink"
            >
              Section 16(4) deadline tool
            </Link>
          </div>
          <p className="rag-pretty mt-4 max-w-[60ch] font-sans text-caption-13 leading-relaxed text-ink-muted">
            Set in Anek, drawn by Ek Type in Mumbai, and Newsreader by Production Type,
            with IBM Plex Mono for anything that points at a row. All three are released
            under the SIL Open Font License.
          </p>

          {/* The page's terminal form. A working paper ends on paper, and
              this one is typeset for it: the figure hands over to its static
              form, the inks go to black, nothing straddles a fold, and there
              is a rule at the foot where a reviewer signs. Worth saying out
              loud, because a print stylesheet nobody is told about is a
              print stylesheet nobody uses. */}
          <p className="no-print mt-4 max-w-[60ch] font-sans text-caption-13 leading-relaxed text-ink-muted">
            This page is typeset to be printed. Press{" "}
            <kbd className="border border-hairline bg-sunken px-1 font-mono text-label-12 text-ink">
              Ctrl+P
            </kbd>{" "}
            and it comes out as a working paper, with the evidence, the marks, the legend
            and a sign-off rule that is still blank.
          </p>
        </div>

        <dl className="font-mono text-label-12 uppercase text-ink-muted">
          <div className="flex justify-between border-b border-hairline py-2">
            <dt>Index</dt>
            <dd className="text-ink">W-1</dd>
          </div>
          <div className="flex justify-between border-b border-hairline py-2">
            <dt>Prepared</dt>
            <dd className="text-ink">{aggregates.generated_on}</dd>
          </div>
          <div className="flex justify-between py-2">
            <dt>Contact</dt>
            <dd>
              <a
                href="mailto:hello@diligenceready.in?subject=CA%20firm%20pilot"
                className="normal-case text-ink mark-verb underline decoration-hairline underline-offset-4 hover:decoration-ink"
              >
                hello@diligenceready.in
              </a>
            </dd>
          </div>
        </dl>
      </div>

    </footer>
  );
}
