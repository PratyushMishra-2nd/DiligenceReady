import { DemoButton } from "./DemoButton";
import { Schedule, ScheduleRow } from "./Sheet";

const MAIL =
  "mailto:hello@diligenceready.in?subject=CA%20firm%20pilot&body=Firm%3A%0AClient%20companies%3A%0AWhat%20we%20reconcile%20today%3A%0A";

/**
 * The ask, stated as an ask.
 *
 * The page's most quietly effective gesture is the blank "reviewed by" rule at
 * the foot — a working paper that admits nobody has signed it. As an argument
 * it is very good. As a next step it is nothing at all: a reader who is
 * persuaded by it has no way to become the person who signs, which means the
 * best thing on the page terminates in a dead end.
 *
 * So the rule stays, and this says out loud what would fill it. The exchange
 * is real and it is not a discount: what is wanted is a practising CA's
 * judgment on the rule set, which is the one thing this project cannot produce
 * for itself and the one thing standing between it and a mark it is not
 * entitled to use.
 */
export function Pilot() {
  return (
    <div className="mt-8 grid gap-x-14 gap-y-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div>
        <p className="rag-pretty opsz-deck max-w-[40ch] font-news text-[1.4rem] text-agreed sm:text-deck">
          Three firms. No charge, and no discount to claim later — there is nothing to buy
          yet.
        </p>
        <p className="rag-pretty opsz-prose mt-6 max-w-[52ch] font-news text-prose leading-relaxed text-graphite">
          What is wanted in return is your judgment on the rule set — which findings land,
          which are noise on a real book, and what the engine should be raising that it
          does not. That is the one thing a seeded dataset cannot teach it.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3">
          <a
            href={MAIL}
            className="border-2 border-books bg-books px-6 py-3 font-mono text-ident uppercase tracking-[0.08em] text-stock transition-colors hover:bg-stock hover:text-books"
          >
            Take a pilot
          </a>
          <DemoButton variant="outline" label="Open the demo" />
        </div>

        {/* Who is on the other end of that address, without naming them.
            What a partner wants to know here is not whose name is on it but
            whether a reply comes back from someone who can actually answer —
            so the page says that and stops. */}
        <div className="mt-10 border-t border-hairline pt-5">
          <p className="rag-pretty opsz-prose max-w-[52ch] font-news text-ident leading-relaxed text-graphite">
            <a
              href={MAIL}
              className="text-agreed underline decoration-hairline underline-offset-4 hover:decoration-agreed"
            >
              hello@diligenceready.in
            </a>{" "}
            reaches a person rather than a queue, and the reply comes from whoever would
            run your first month.
          </p>
        </div>
      </div>

      <div>
        <h3 className="font-mono text-stub uppercase text-graphite">What a pilot is</h3>
        <Schedule className="mt-4">
          <ScheduleRow
            term="You send one client's exports"
            note="A Tally purchase register, the GSTR-2B for the same periods, and a bank statement CSV. No portal credentials and no access to your Tally server."
            state="From you"
          />
          <ScheduleRow
            term="We run the engine and hand back the findings"
            note="Every exception, each with the file and line it came from and the SQL that produced its figure. Yours to keep whether or not anything comes of it."
            state="From us"
          />
          <ScheduleRow
            term="You tell us which findings are wrong"
            note="This is the whole point of the exchange. A rule that raises noise in a real book is a rule that is wrong, and we have no way to learn that from a seeded dataset."
            state="From you"
            tone="statute"
          />
          <ScheduleRow
            term="The rule set gets your name on it, if you want it there"
            note="That is what fills the blank rule at the foot of this page. If you would rather review it and not be named, that is fine and the rule stays blank."
            state="Either way"
          />
        </Schedule>
      </div>
    </div>
  );
}
