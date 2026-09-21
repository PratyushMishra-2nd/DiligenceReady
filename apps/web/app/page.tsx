import { AnswerKey } from "./press/AnswerKey";
import { Aurora } from "./press/Aurora";
import { Answers } from "./press/Answers";
import { Audience } from "./press/Audience";
import { CallToAction } from "./press/CallToAction";
import { Clock } from "./press/Clock";
import { Colophon } from "./press/Colophon";
import { DemoButton } from "./press/DemoButton";
import { Faq } from "./press/Faq";
import { Hero } from "./press/Hero";
import { HowItWorks } from "./press/HowItWorks";
import { Masthead } from "./press/Masthead";
import { Pilot } from "./press/Pilot";
import { Pricing } from "./press/Pricing";
import { Surfaces } from "./press/Surfaces";
import { Deck, Opener, Sheet } from "./press/Sheet";
import { SignOff } from "./press/SignOff";
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
 * The hero prints how many days are left before the next Section 16(4)
 * cut-off, which is a figure that goes stale. Prerendered once at build, the
 * page would still be claiming seventy-one days in December. An hour is the
 * right granularity: the number changes once a day, the page stays static for
 * every reader inside that hour, and nothing here needs a client-side clock
 * ticking on a marketing page.
 */
export const revalidate = 3600;

/**
 * The landing page.
 *
 * Nothing here is claimed that the repository cannot back. No certifications
 * we do not hold, no customer logos, no testimonials, and no signup form that
 * quietly discards what someone types into it. That has not changed and is
 * not what was wrong.
 *
 * WHAT WAS WRONG, measured rather than felt:
 *
 *   The page ran 14,519px on a laptop and 21,548px on a phone — sixteen and
 *   twenty-five screens. A converting B2B page runs four to eight. Sixteen
 *   sections and eleven decorative dividers have become eleven sections and
 *   none.
 *
 *   Every `<h2>` rendered its own text four times into `textContent`, because
 *   the opener printed two ghost plates of itself for a misregistration
 *   effect. Ctrl+F matched four times; Googlebot, the WhatsApp and LinkedIn
 *   preview scrapers and every answer engine read stuttered headings on every
 *   section of the site. The same component shipped inside the product, so the
 *   firm dashboard printed its headline figure three times over. That is the
 *   literal mechanism by which this page read as machine-generated and it was
 *   one component.
 *
 *   The proof was in the wrong place. The answer key ran second, which meant
 *   the second thing a stranger learned was "the books are synthetic" and "no
 *   practising CA has reviewed the rule set" — an objection-handler placed
 *   before the objection, which reads as an admission. It is honest, it stays
 *   on the page, and it now answers "but does it work" rather than opening
 *   with a reason not to believe us.
 *
 *   There was nothing to press between y=1,031 and y=6,386 — six screens
 *   carrying the most persuasive material on the site with no way in.
 *
 *   Pricing landed at 57% depth. It is above the evidence section now.
 *
 * WHAT IS NEW rather than merely shorter: the field in the hero. 11,462
 * record positions have been sitting in `aggregates.json`, generated,
 * committed and rendered nowhere, while the page argued in paragraphs about
 * what the engine had read. They are drawn now — one mark each, in two
 * impressions that close into register as the reader descends, with the
 * eighty-two that never close left apart. It is the only graphic here that
 * could not be lifted onto another product, which is the test it had to pass.
 */
export default function LandingPage() {
  return (
    <main className="relative min-h-screen overflow-x-clip text-ink">
      {/* One canvas, fixed behind the whole document. See Aurora.tsx for why
          it is one and not one per section. */}
      <Aurora />
      {/* Outside the measure, because it is sticky and a sticky element inside
          a padded column has to undo that padding to reach the edges. */}
      <Masthead />

      <div className="mx-auto max-w-sheet px-6 sm:px-10">
        <Hero />
      </div>

      {/* The only inverted section on the site, and the only uncontested claim
          in this market: every competitor sells "claim 100% of your ITC" and
          not one of them puts a date on the credit. */}
      <Clock />

      <div className="mx-auto max-w-sheet px-6 sm:px-10">


        {/* The four questions a partner asks before any other. Kept close to
            verbatim: this is the best objection-handling on the site and it is
            better than anything the competitors in this category ship. */}
        <Answers />

        <HowItWorks />

        <Surfaces />

        {/* A way in, in the middle of the argument, at the moment the screens
            have just done the persuading. */}
        <aside className="border-t border-hairline py-block">
          <div className="flex flex-wrap items-center justify-between gap-x-10 gap-y-5 lg:pl-[268px]">
            <p className="rag-pretty max-w-prose font-sans text-copy-17 text-ink">
              Those are the real surfaces, drawn from the real data — the same workspace that is
              open right now, carrying two client companies and twelve months of books. Nothing
              stands between you and it: no form, no call, no trial clock.
            </p>
            <DemoButton label="Open the demo" />
          </div>
        </aside>

        <Pricing />

        <Sheet mark="traced" index="§ 06">
          <Opener className="max-w-pull">Every figure has a line</Opener>
          <Deck>
            One finding, followed from the row of the file it was read out of to the aggregate
            that puts it on a dashboard.
          </Deck>
          <div className="mt-10">
            <Trace />
          </div>
        </Sheet>

        <Sheet id="data" mark="stated" index="§ 07">
          <Opener className="max-w-pull">Where the client data goes</Opener>
          <Deck>
            A firm does not hold its own books. It holds thirty other companies&rsquo;, under an
            engagement letter.
          </Deck>
          <Trust />
        </Sheet>

        {/* The measurement, moved from second to eighth.
            It is the most defensible thing this product owns and it is worth
            nothing in the position it used to hold. A reader who has now seen
            the dashboard, the four steps, the screens, the price and the
            evidence trail is asking "does it actually work"; this answers
            that. A reader who had seen none of those was being told, as the
            second thing on the page, that the books are synthetic. */}
        <AnswerKey />

        <Sheet id="who" mark="computed" index="§ 09">
          <Opener className="max-w-pull">Who this is for</Opener>
          <Audience />
        </Sheet>

        <Sheet id="faq" mark="traced" index="§ 10">
          <Opener className="max-w-pull">Questions</Opener>
          <Faq />
        </Sheet>

        <Sheet id="pilot" mark="stated" index="§ 11">
          <Opener className="max-w-pull">Start a pilot</Opener>
          <Pilot />
        </Sheet>
      </div>

      {/* Outside the measure so the ink reaches both edges of the screen. This
          is the only inverted section on the site now. There used to be three
          and they cancelled each other out; one reads as emphasis. */}
      <CallToAction />

      {/* The document ends on an empty signature line. It is the best gesture
          on this page and it now sits on paper rather than on a black plate —
          a blank rule needs a ground you can see it against, and it should not
          be competing with an inverted call to action directly above it. */}
      <div className="mx-auto max-w-sheet px-6 sm:px-10">
        <SignOff />
        <Colophon />
      </div>
    </main>
  );
}
