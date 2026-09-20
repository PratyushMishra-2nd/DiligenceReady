import aggregates from "./aggregates.json";

import { Schedule, ScheduleRow } from "./Sheet";

/**
 * Who this is for, and — the half that is usually missing — who it is not.
 *
 * Naming the reader you are not writing to is the cheapest credibility on a
 * landing page and almost nobody spends it. It also does the qualifying work
 * that a form would otherwise do badly: an SME owner who reads the second list
 * and leaves was never going to buy, and a partner who reads the first list and
 * recognises their own firm has just been told this was built for them
 * specifically rather than for "businesses".
 *
 * The arithmetic underneath is the dataset's own, divided. We are not going to
 * put an hours-saved figure on this page, because we would be inventing it and
 * the reader already knows the number better than we do. What the page can
 * honestly do is state the size of one client-month and stop talking.
 */

const FOR = [
  "A chartered-accountant firm carrying somewhere between five and eighty client companies",
  "Clients whose books are in Tally, and whose GSTR-2B you already download every month",
  "A practice where reconciliation is done, is done in Excel, and is the thing that slips",
];

const NOT_FOR: { term: string; note: string }[] = [
  {
    term: "An SME buying this directly",
    note: "The firm is the customer and the firm bills the client. A company with one set of books is not who the screens are laid out for.",
  },
  {
    term: "Books in SAP, Oracle or NetSuite",
    note: "The ingest reads a Tally XML gateway, the GSTR-2B JSON or Excel any taxpayer downloads, the IMS record and a bank CSV. Nothing else is read yet.",
  },
  {
    term: "A firm that wants returns filed for them",
    note: "This reconciles and produces evidence. It does not file, and it does not talk to the portal on your behalf.",
  },
  {
    term: "Anyone who needs an audit opinion",
    note: "A reconciliation is evidence somebody uses to form one. It is not the opinion, and the sign-off rule at the foot of this page is blank for the same reason.",
  },
];

export function Audience() {
  const { totals } = aggregates;
  const clientMonths = totals.companies * aggregates.periods;
  const per = (n: number) => Math.round(n / clientMonths).toLocaleString("en-IN");

  return (
    <div className="mt-8 grid gap-x-14 gap-y-12 lg:grid-cols-2">
      <div>
        <h3 className="font-mono text-stub uppercase text-graphite">Built for</h3>
        <ul className="mt-4 border-t border-hairline">
          {FOR.map((line) => (
            <li
              key={line}
              className="rag-pretty opsz-prose max-w-sheet border-b border-hairline py-3 font-news text-prose text-agreed"
            >
              {line}
            </li>
          ))}
        </ul>

        {/* The size of the job, from the seed's own counts rather than from a
            claim about hours. One client-month is three registers that have to
            be made to agree with each other, and the demo carries
            twenty-four of them. */}
        <h3 className="mt-10 font-mono text-stub uppercase text-graphite">
          One client-month, in this dataset
        </h3>
        <Schedule className="mt-4">
          <ScheduleRow term="Purchase invoices in the books" state={per(totals.purchase_register)} />
          <ScheduleRow term="Documents the government has" state={per(totals.gstr2b_documents)} />
          <ScheduleRow term="Lines on the bank statement" state={per(totals.bank_statement)} />
          <ScheduleRow
            term="Findings the engine raises"
            state={(totals.planted / clientMonths).toFixed(1)}
            tone="statute"
          />
        </Schedule>
        <p className="rag-pretty opsz-prose mt-4 max-w-[58ch] font-news text-ident leading-relaxed text-graphite-soft">
          Three registers, compared three ways, {clientMonths} times over in the workspace
          you are about to open. How long that takes by eye is a number you already know
          and we would only be guessing at.
        </p>
      </div>

      <div>
        <h3 className="font-mono text-stub uppercase text-graphite">Not for</h3>
        <Schedule className="mt-4">
          {NOT_FOR.map(({ term, note }) => (
            <ScheduleRow key={term} term={term} note={note} />
          ))}
        </Schedule>
      </div>
    </div>
  );
}
