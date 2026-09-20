import { inr } from "./lib/format";
import aggregates from "./press/aggregates.json";
import { Answers } from "./press/Answers";
import { AnswerKey } from "./press/AnswerKey";
import { Audience } from "./press/Audience";
import { CallToAction } from "./press/CallToAction";
import { Colophon } from "./press/Colophon";
import { DemoButton } from "./press/DemoButton";
import { Faq } from "./press/Faq";
import { ColourBar, RegistrationTarget, TrimMark } from "./press/Furniture";
import { Hero } from "./press/Hero";
import { HowItWorks } from "./press/HowItWorks";
import { Masthead } from "./press/Masthead";
import { Misregister } from "./press/Misregister";
import { Pilot } from "./press/Pilot";
import { Plate } from "./press/Plate";
import { Pricing } from "./press/Pricing";
import { Screens } from "./press/Screens";
import { SignOff } from "./press/SignOff";
import { Legend, Opener, Sheet, slipFor } from "./press/Sheet";
import { Standing } from "./press/Standing";
import { Trace } from "./press/Trace";
import { Trust } from "./press/Trust";

/**
 * Title and description come from the root layout, which is where the share
 * card and the title template live too. Repeating the title here would run it
 * through that template and ship "DiligenceReady: reconciliation for CA firms ·
 * DiligenceReady" to every tab and every search result.
 */
export const metadata = {
  alternates: { canonical: "/" },
};

/**
 * The hero now prints how many days are left before the next Section 16(4)
 * cut-off, which is a figure that goes stale. Prerendered once at build, the
 * page would still be claiming seventy-one days in December.
 *
 * An hour is the right granularity: the number changes once a day, the page
 * stays static for every reader inside that hour, and nothing about this
 * needs a client-side clock ticking on a marketing page.
 */
export const revalidate = 3600;

/**
 * The landing page, which is a working paper.
 *
 * Nothing here is claimed that the repository cannot back. No certifications
 * we do not hold, no customer logos, no testimonials, and no signup form that
 * quietly discards what someone types into it.
 *
 * The design follows from that sentence rather than decorating it. A CA's
 * working paper carries an index, a tick mark in the margin against every
 * assertion, a legend at the foot defining those marks, a footed column, and a
 * sign-off block that stays blank until someone reviews it. This page has all
 * five, and it turns them on itself.
 *
 * The mark that appears nowhere on this page is C — confirmed with an external
 * party — because no practising CA has reviewed the rule set yet. The legend
 * says so in those words. The page's epistemic position is the layout rather
 * than a disclaimer under it.
 *
 * What changed in this pass, and why, because the order of a landing page is
 * an argument and this one had the argument in the wrong order:
 *
 *   The root belongs to this page. It used to live at `/product` while `/` was
 *   the dashboard, so a stranger who typed the domain was 307'd through a
 *   password box to get here. The canonical URL of the thing we ask people to
 *   share is now a 200.
 *
 *   The product is shown. Eight screens were described in prose and none were
 *   shown; there are five screenshots of the running application on the page
 *   now, the first of them immediately under the hero, carrying the same
 *   figure the hero leads with.
 *
 *   The limits are on the page and in the masthead. A section that says
 *   eighty-two of eighty-two were found is worth nothing without the negative
 *   space around the answer key beside it.
 *
 *   The ask is an ask. The blank "reviewed by" rule at the foot is the best
 *   gesture on the page and it terminated in nothing a reader could do; the
 *   pilot section says out loud what would fill it.
 */

/**
 * Every way into the product on this page is the demo button, and the demo
 * button posts to `/demo`, which signs in on the server and lands the reader
 * on the dashboard. There is no link to `/sign-in` here any more: a form is
 * what somebody with their own account uses, and this page is not read by
 * those people. The credentials are printed beside the button anyway, for a
 * reader who would rather type them than be signed in by a stranger.
 */

export default function LandingPage() {
  const example = aggregates.example;

  return (
    <main className="min-h-screen overflow-x-clip bg-stock text-agreed">
      {/* Outside the measure, because it is sticky and a sticky element inside
          a padded column has to undo that padding to reach the edges. It
          carries its own. */}
      <Masthead />

      {/* The sheet itself, with the blade marks at its four corners. */}
      <div className="relative mx-auto max-w-[1280px] px-6 sm:px-10">
        <TrimMark corner="tl" />
        <TrimMark corner="tr" />
        <TrimMark corner="bl" />
        <TrimMark corner="br" />

        {/* The head of the sheet. The target is the instrument the whole
            document has been arguing about and never carried: two plates of
            one crosshair, visibly apart here and exactly superimposed at the
            sign-off, so the closing progression is stated once at full size
            instead of nine times at three pixels. The trim marks are where
            the blade would fall. */}
        <div
          aria-hidden
          className="no-print flex items-center justify-end gap-5 pt-6 lg:pt-8"
        >
          <ColourBar className="hidden sm:flex" />
          <RegistrationTarget slip={1} />
        </div>

        <Hero />

        {/* The measurement, directly under the hero.
            It used to be nowhere — the strongest verifiable fact this product
            owns, sitting in a JSON file while the page argued its way toward
            it for nine sections and then never arrived. A reader who leaves
            at sixty per cent should already have met it. */}
        <AnswerKey />

        {/* The figure above, on the screen it is actually on.
            This is the shortest distance between a claim and its evidence
            anywhere on the page, and it sits here rather than in the screens
            section for that reason: a reader has just been shown a number at
            88px by a company that has never met them, and the next thing they
            see is the same number inside the running application, above the
            two client companies it was summed from. */}
        <section className="pb-4">
          <Plate
            shot="dashboard"
            index="Plate 1"
            alt="The firm dashboard for Mehta & Associates: ₹16,25,635.64 of input tax credit with no GSTR-2B counterpart, the Section 16(4) sentence beneath it, and a table of two client companies — Vertex Components and Acme Industries — with GST and bank coverage, open findings and unmatched credit for each."
            caption="The same figure, on the screen it is computed on. Both client companies, their coverage, and the credit at stake for each — this is the first thing the demo opens on."
          />
        </section>

        <Answers />

        <Misregister slip={slipFor("how")} />

        <HowItWorks />
        <Misregister slip={slipFor("screens")} />

        <Screens />

        {/* A way in, in the middle of the argument. Measured, the page offered
            a button at y=563 and then not another until y=6,783 — better than
            nine screens carrying the most persuasive material on the site with
            nothing to press at the moment it persuaded anyone. The sticky
            masthead is reachable throughout, but it is a button in a corner:
            a way back, not an invitation. */}
        <aside className="my-2 border-y border-hairline py-6 lg:pl-20">
          <div className="flex flex-wrap items-center justify-between gap-x-10 gap-y-4">
            <p className="rag-pretty opsz-prose max-w-[54ch] font-news text-prose leading-relaxed text-agreed">
              Those are screenshots of the workspace that is open right now, carrying two
              client companies and twelve months of books. Nothing stands between you and
              it — no form, no call, no trial clock.
            </p>
            <DemoButton label="Open the live demo" />
          </div>
        </aside>

        <Misregister slip={slipFor("trace")} />

        <Sheet mark="traced">
          <Opener slip={slipFor("trace")} className="optical-cap max-w-[20ch]">
            Every figure has a line
          </Opener>
          <p className="rag-pretty opsz-deck mt-7 max-w-[46ch] font-news text-[1.4rem] text-agreed sm:text-deck">
            One finding, followed from the row of the file it was read out of to the
            aggregate that puts it on a dashboard.
          </p>
          <div className="mt-2">
            <Trace />
            {/* The same four stages, as the product renders them. The section
                argues that a figure can be opened; this is the panel that
                opens, with the arithmetic, the match score and the inputs that
                produced a different finding of the same rule. */}
            {/* Promoted out of a 320px sidebar, where the most important
                proof on the page was rendering its body text at about six
                pixels. A plate nobody can read is a texture with a caption
                attached, which is the "take it on trust" this page exists to
                refuse. */}
            <div className="mt-12 max-w-[34rem]">
              <Plate
                shot="evidence"
                index="Plate 5"
                sizes="(min-width: 1024px) 544px, 100vw"
                alt="The evidence panel open beside a finding: rule R1, ITC_UNMATCHED, the arithmetic CGST 0.00 + SGST 0.00 + IGST 1,72,665.08 + Cess 0.00, a match score broken into GSTIN, document number, amount and date, and the note that a SQL aggregate over the match table produced the figure and no model did."
                caption="What opens when a figure is clicked. This is a different invoice from the one traced above — its own Section 16(4) date, on its own financial year — because the panel is the product's, not this page's."
              />
            </div>
          </div>
        </Sheet>

        <Misregister slip={slipFor("pricing")} />

        <Pricing />

        <Misregister slip={slipFor("data")} />

        <Sheet id="data" mark="stated">
          <Opener slip={slipFor("data")} className="optical-cap max-w-[22ch]">
            Where the client data goes
          </Opener>
          <p className="rag-pretty opsz-deck mt-7 max-w-[48ch] font-news text-[1.4rem] text-agreed sm:text-deck">
            A firm does not hold its own books. It holds thirty other companies&rsquo;,
            under an engagement letter.
          </p>
          <Trust />
        </Sheet>

        <Misregister slip={slipFor("standing")} />

        <Standing />

        <Misregister slip={slipFor("who")} />

        <Sheet id="who" mark="computed">
          <Opener slip={slipFor("who")} className="optical-cap max-w-[18ch]">
            Who this is for
          </Opener>
          <Audience />
        </Sheet>

        <Misregister slip={slipFor("faq")} />

        <Sheet id="faq" mark="traced">
          <Opener slip={slipFor("faq")} className="optical-cap max-w-[20ch]">
            Questions, answered at length
          </Opener>
          <Faq />
        </Sheet>

        <Misregister slip={slipFor("pilot")} />

        <Sheet id="pilot" mark="stated">
          <Opener slip={slipFor("pilot")} className="optical-cap max-w-[20ch]">
            Sign the sheet
          </Opener>
          <Pilot />
        </Sheet>

        {/* The legend, at the foot, where a working paper puts one.
            It was written, exported, and never called from anywhere — so the
            five marks down this page were, by the standard stated three
            paragraphs up in this very file, decoration. A mark means
            something only if it was defined before it was used, and a reader
            can only check that if the definition is on the page. */}
        <Legend />

        {/* The foot of the sheet, and the instrument closing.
            The target at the head of the page is two plates visibly apart;
            this is the same mark with the plates exactly superimposed, so it
            reads as one crosshair in the colour the two inks make. It is the
            document's whole argument stated twice, at full size, at the two
            ends of the sheet — which is the job the nine three-pixel slip
            steps between them have never been large enough to do.
            On paper rather than on the black plate below: multiply against
            a near-black ground yields the ground, and a verification mark
            that cannot perform its own mechanism is decoration. */}
        <div aria-hidden className="no-print flex items-center justify-end gap-5 pt-4">
          <ColourBar className="hidden sm:flex" />
          <RegistrationTarget slip={0} />
        </div>

        {/* In register. The progression down the page has been closing since
            the hero and this is where it arrives: one rule, in the colour the
            two inks make together. It sits here rather than under the black
            plate below, because a rule that resolves needs paper on both sides
            of it to be seen resolving. */}
        <Misregister slip={0} />
      </div>

      {/* Outside the measure so the ink reaches both edges of the screen. */}
      <CallToAction />

      <div className="mx-auto max-w-[1280px] px-6 sm:px-10">
        <Colophon />
      </div>

      {/* Last, and full-bleed. The document ends on an empty signature line.
          It sits after the colophon because that is the order a working
          paper runs in — provenance, then the block where a reviewer signs
          it — and outside the measure because the plate is a press bed and
          a press bed reaches both edges of the sheet. */}
      <SignOff />
    </main>
  );
}
