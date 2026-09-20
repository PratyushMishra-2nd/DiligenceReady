/**
 * The questions a partner asks in the first ten minutes, answered at the
 * length they deserve rather than at the length a marketing page would give
 * them.
 *
 * They are `<details>` for the same three reasons the disclosures inside the
 * product are: keyboard-operable without a line of JavaScript, findable by the
 * browser's own in-page search, and forced open by the print handler so the
 * filed copy carries every answer whether or not anyone expanded it on screen.
 *
 * They ship open. Closed, the section cost eight lines and showed a reader who
 * had already scrolled thirteen screens eight questions and zero answers — and
 * the answers are the most persuasive copy on the page. The 2A-versus-2B
 * answer and "INV/2025-26/4861 and 4861 are the same document" are what
 * convince a chartered accountant that whoever built this has done the work,
 * and they were behind a click at the bottom of the document. A disclosure is
 * for context somebody may not want; this is the argument.
 */

const QUESTIONS: { q: string; a: string }[] = [
  {
    q: "Does it write anything back to our client's books?",
    a: "No. The Tally gateway is read. There is no write path anywhere in the ingest package, so this is a property of the code rather than a setting that could be turned on by mistake. Everything the engine produces lives in its own database and is exported as a document.",
  },
  {
    q: "GSTR-2B or GSTR-2A?",
    a: "2B. It is the static, filed record that input tax credit is actually claimed against, and it is the one a reconciliation can be defended on months later — 2A moves under you. The file the engine reads is the JSON or Excel any taxpayer downloads from the portal; nothing is scraped and no portal credentials are asked for.",
  },
  {
    q: "What happens when a supplier files late?",
    a: "The matcher searches every period, not the invoice's own month, because a supplier who files late files into a different one. An invoice booked in December and filed by the supplier in March is matched, and the Section 16(4) clock is still run against the invoice date rather than the month anybody noticed.",
  },
  {
    q: "Our voucher numbers do not look like the portal's. Does that break the match?",
    a: "That is the normal case rather than the exception, and it is most of what the matcher does. Invoice numbers are typed by hand in Tally and machine-generated on the portal, so the same document arrives written two ways. Both are reduced to the part the two systems would agree on before supplier, value and period are compared — INV/2025-26/4861 and 4861 are the same document.",
  },
  {
    q: "Does it handle the Invoice Management System?",
    a: "It ingests the IMS record and values what sits unactioned. Inaction is deemed acceptance, so an invoice nobody looks at flows into the return as filed once GSTR-3B goes in — the demo shows 134 records carrying no action, worth ₹2.97 crore, on one client for one month. That number is the point: it is the cost of the register nobody opens.",
  },
  {
    q: "Where does the client data sit, and who can read it?",
    a: "In a Postgres database and an object store you control, keyed by the sha256 of each file. Every account belongs to exactly one firm and every query the API answers is scoped to the firm on the session. Nothing is written back to a client's books: the Tally gateway is read, and there is no write path in the ingest package at all.",
  },
  {
    q: "Can we run it on our own infrastructure?",
    a: "Yes, and you can read it first. The repository is public and MIT licensed: Postgres, one Python process and a Next.js front end. It runs with no AWS account and no model — leave the Bedrock id empty and every explanation falls back to a deterministic template, which is correct and just plainer.",
  },
  {
    q: "What does it cost?",
    a: "₹6,000 to ₹15,000 per month per firm for up to twenty-five client companies, and the firm bills the client. The pilot at the foot of this page is free while we are working with the first few practices.",
  },
];

export function Faq() {
  return (
    <div className="mt-10 max-w-sheet border-t border-hairline">
      {QUESTIONS.map(({ q, a }) => (
        <details key={q} className="group border-b border-hairline">
          <summary className="mark-verb -mx-3 flex cursor-pointer items-baseline gap-3 px-3 py-4 hover:bg-sunk">
            <svg
              viewBox="0 0 8 10"
              aria-hidden
              className="mt-[3px] h-2.5 w-2 shrink-0 text-statute [transition:transform_160ms_cubic-bezier(0.2,0.7,0.3,1)] group-open:rotate-90"
            >
              <path d="M1 1l5 4-5 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            <h3 className="wdth-set font-anek text-subhead font-semibold leading-tight text-agreed">{q}</h3>
          </summary>
          <div className="pb-6 pl-5">
            <p className="rag-pretty opsz-prose max-w-[74ch] font-news text-prose leading-relaxed text-graphite">
              {a}
            </p>
          </div>
        </details>
      ))}
    </div>
  );
}
