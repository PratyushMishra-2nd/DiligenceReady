import Link from "next/link";

import aggregates from "../aggregates.json";

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
    <footer className="border-t-2 border-agreed py-12">
      <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div>
          <p className="wdth-tight font-anek text-[1.375rem] font-bold text-agreed">
            DiligenceReady
          </p>
          <p className="rag-pretty opsz-prose mt-3 max-w-[60ch] font-news text-ident leading-relaxed text-graphite">
            Figures on this page and in the product are from a seeded synthetic dataset,
            not a real company. GST rules change by notification; nothing here is tax
            advice.{" "}
            <Link
              href="/"
              className="text-agreed underline decoration-hairline underline-offset-4 hover:decoration-agreed"
            >
              Open the working dashboard
            </Link>
            .
          </p>
          <p className="rag-pretty opsz-prose mt-4 max-w-[60ch] font-news text-ident leading-relaxed text-graphite">
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
          <p className="no-print opsz-prose mt-4 max-w-[60ch] font-news text-ident leading-relaxed text-graphite">
            This page is typeset to be printed. Press{" "}
            <kbd className="border border-hairline bg-sunk px-1 font-mono text-stub text-agreed">
              ⌘P
            </kbd>{" "}
            and it comes out as a working paper, with the evidence, the marks, the legend
            and a sign-off rule that is still blank.
          </p>
        </div>

        <dl className="font-mono text-stub uppercase text-graphite">
          <div className="flex justify-between border-b border-hairline py-2">
            <dt>Index</dt>
            <dd className="text-agreed">W-1</dd>
          </div>
          <div className="flex justify-between border-b border-hairline py-2">
            <dt>Prepared</dt>
            <dd className="text-agreed">{aggregates.generated_on}</dd>
          </div>
          <div className="flex justify-between border-b border-hairline py-2">
            <dt>Reviewed</dt>
            <dd className="text-statute-deep">Unsigned</dd>
          </div>
          <div className="flex justify-between py-2">
            <dt>Contact</dt>
            <dd>
              <a
                href="mailto:hello@diligenceready.in?subject=CA%20firm%20pilot"
                className="normal-case text-agreed underline decoration-hairline underline-offset-4 hover:decoration-agreed"
              >
                hello@diligenceready.in
              </a>
            </dd>
          </div>
        </dl>
      </div>

      {/* Paper only. A working paper carries a rule where a reviewer signs
          and it stays blank until somebody does — the same statement the
          absent C mark makes on screen, in the form the statement is
          conventionally made. */}
      <div className="print-signature">
        <div className="grid grid-cols-2 gap-x-16 pt-8">
          <div>
            <p className="font-mono text-stub uppercase text-graphite">Prepared by</p>
            <p className="mt-1 border-b border-agreed pb-1 text-prose">DiligenceReady</p>
          </div>
          <div>
            <p className="font-mono text-stub uppercase text-graphite">
              Reviewed by · signature · date
            </p>
            <p className="mt-1 border-b border-agreed pb-1 text-prose">&nbsp;</p>
          </div>
        </div>
        <p className="rag-pretty opsz-prose mt-3 font-news text-ident leading-relaxed text-graphite">
          Unsigned. No practising chartered accountant has reviewed the rule set behind
          the figures on this sheet.
        </p>
      </div>
    </footer>
  );
}
