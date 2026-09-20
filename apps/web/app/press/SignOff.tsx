/**
 * The sign-off block, on screen.
 *
 * A working paper ends on a rule where a reviewer signs, and it stays blank
 * until somebody does. This page has carried that block since it was written
 * and it has only ever existed under `@media print` — the argument was that
 * nobody can sign a screen, which is true and is beside the point. The block
 * does not exist to be signed. It exists to show that it has not been.
 *
 * That made it the best gesture on the site and invisible to everyone who
 * did not press Ctrl+P, which on a landing page is essentially everyone. It
 * is the same claim the legend makes when it lists "Confirmed" and leaves
 * the gutter empty, and the same claim the pilot section makes when it asks
 * for a reviewer: no practising CA has been through the rule set. Three
 * statements of one fact, and the most legible of them was the one nobody
 * saw.
 *
 * Full-bleed on the black plate, and last. The document's final image is an
 * empty signature line — which is a stranger thing to end a landing page on
 * than anything else on this site, and the truest.
 *
 * The inks swap here. On the plate `stock` is the ink and the black is the
 * ground, which is what a press bed looks like; it is the same inversion the
 * call-to-action plate uses, and it is punctuation inside a paper document
 * rather than a second theme.
 */
export function SignOff() {
  return (
    <section className="sign-off bg-plate px-6 py-16 text-stock sm:px-10">
      <div className="mx-auto max-w-[1280px]">
        {/* The in-register target does NOT go here, and the reason is the
            mechanism rather than the layout. `mix-blend-multiply` is a
            subtractive, ink-on-paper model: multiplied against this plate's
            near-black ground it yields the ground, so the mark would be
            invisible and the one graphic whose job is to prove the inks
            really multiply would be the one faking it. It sits on paper, at
            the foot of the measure, immediately above this plate. */}
        <p className="font-mono text-stub uppercase tracking-[0.06em] text-stock/60">
          Sign-off
        </p>

        {/* Two columns at every width, because the graphic IS the
            adjacency: a filled rule beside a blank one. Stacked below `sm`
            it became a heading followed by an empty paragraph — the reader
            has to hold the first rule in memory to notice the second is
            unsigned, which is the one thing this section cannot afford to
            ask. The gutter tightens instead of the grid collapsing. */}
        <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-10 sm:gap-x-16">
          <div>
            <p className="font-mono text-stub uppercase tracking-[0.06em] text-stock/60">
              Prepared by
            </p>
            {/* Filled, because this part is done. */}
            <p className="wdth-set mt-2 border-b-2 border-stock pb-2 font-anek text-[1.05rem] font-semibold sm:text-subhead">
              DiligenceReady
            </p>
          </div>

          <div>
            <p className="font-mono text-stub uppercase tracking-[0.06em] text-stock/60">
              Reviewed by · signature · date
            </p>
            {/* Blank, because this part is not. The non-breaking space holds
                the line open at the same height as the one beside it, so the
                emptiness is a measured gap rather than a missing element. */}
            <p className="mt-2 border-b-2 border-stock pb-2 font-anek text-[1.05rem] sm:text-subhead">&nbsp;</p>
          </div>
        </div>

        <p className="rag-pretty opsz-prose mt-10 max-w-[62ch] font-news text-prose leading-relaxed text-stock/75">
          The rule beside this one is blank because no practising chartered accountant
          has reviewed the rule set. Nothing on this page claims otherwise, the tick mark
          for an assertion confirmed outside this company appears nowhere above, and the
          legend at the foot of the sheet says so in those words. When somebody signs it,
          this line will carry their name and the date they did.
        </p>
      </div>
    </section>
  );
}
