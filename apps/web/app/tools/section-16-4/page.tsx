import Link from "next/link";

import { DemoButton } from "../../press/DemoButton";
import { Masthead } from "../../press/Masthead";
import { Overprint } from "../../press/Overprint";

export const metadata = {
  title: "When does Section 16(4) close on this invoice?",
  description:
    "Enter an invoice date and get the outer limit for claiming its input tax credit: 30 November following the end of that financial year. Free, no signup.",
  alternates: { canonical: "/tools/section-16-4" },
};

const DASHBOARD = "/sign-in?next=/app";

/**
 * One rule, as a utility, with no signup in front of it.
 *
 * This is the smallest useful piece of the engine and the only one that is
 * worth anything to a chartered accountant who will never buy the product: a
 * date in, a statutory cut-off out. It exists because a firm hears about
 * software from another firm, and a link somebody actually forwards does more
 * than a landing page nobody has a reason to send.
 *
 * It is the engine's own rule and not a second implementation of it. The
 * arithmetic below is a transcription of `sec_16_4_deadline` in
 * packages/engine/…/rules/gst.py, including the caveat that function's
 * docstring carries — the outer limit is the earlier of 30 November and the
 * date the annual return is filed, and only the November limit is modelled,
 * because the annual-return date is per taxpayer and is in no feed we read.
 * A tool that silently dropped that caveat would be giving a more confident
 * answer than the product does, which is the wrong way round.
 *
 * There is no client JavaScript. The form is a GET, the answer is computed on
 * the server from the query string, and the result therefore has a URL that
 * can be pasted into the group chat it was asked in.
 */
const SEC_16_4_MONTH = 11;
const SEC_16_4_DAY = 30;

/** The engine's rule, transcribed. */
function sec164Deadline(invoice: Date): Date {
  const fyEndYear =
    invoice.getUTCMonth() + 1 >= 4 ? invoice.getUTCFullYear() : invoice.getUTCFullYear() - 1;
  return new Date(Date.UTC(fyEndYear + 1, SEC_16_4_MONTH - 1, SEC_16_4_DAY));
}

function financialYear(invoice: Date): string {
  const start =
    invoice.getUTCMonth() + 1 >= 4 ? invoice.getUTCFullYear() : invoice.getUTCFullYear() - 1;
  return `${start}–${String(start + 1).slice(2)}`;
}

const LONG = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** A date somebody typed into a query string, or nothing. */
function parse(value: string | string[] | undefined): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  // `2025-02-31` parses to 3 March. A date input cannot produce one, a URL can,
  // and answering it as though it were a real invoice date would be this page
  // inventing a document.
  if (parsed.toISOString().slice(0, 10) !== value) return null;
  return parsed;
}

export default function Section164Tool({
  searchParams,
}: {
  searchParams: { date?: string | string[] };
}) {
  const invoice = parse(searchParams.date);
  const deadline = invoice ? sec164Deadline(invoice) : null;

  // Counted in whole UTC days so a reader in any timezone gets the same
  // answer as the engine, which computes on dates and not on instants.
  const today = new Date();
  const midnight = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const days = deadline ? Math.round((deadline.getTime() - midnight) / 86_400_000) : null;
  const passed = days !== null && days < 0;

  return (
    <main className="min-h-screen overflow-x-clip bg-stock text-agreed">
      <Masthead />

      <div className="mx-auto max-w-[1280px] px-6 sm:px-10">
        <section className="grid gap-x-14 gap-y-12 py-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <p className="font-mono text-stub uppercase text-statute-deep">Section 16(4)</p>
            <h1 className="rag-balance optical-cap wdth-tight mt-4 max-w-[16ch] font-anek text-headline font-bold text-agreed">
              When does the window close?
            </h1>
            <p className="rag-pretty opsz-intro mt-5 max-w-[46ch] font-news text-[1.25rem] leading-snug text-agreed sm:text-[1.6rem]">
              Input tax credit on an invoice can be claimed until 30 November following the
              end of the financial year that invoice falls in. Put a date in and get the
              cut-off out.
            </p>

            <form
              method="get"
              className="mt-8 flex flex-wrap items-end gap-x-4 gap-y-3 border-t border-hairline pt-6"
            >
              <label className="block">
                <span className="font-mono text-stub uppercase text-graphite">Invoice date</span>
                <input
                  type="date"
                  name="date"
                  defaultValue={typeof searchParams.date === "string" ? searchParams.date : ""}
                  required
                  className="tabular mt-2 block border-2 border-hairline bg-stock px-4 py-2.5 font-mono text-ident text-agreed focus:border-agreed"
                />
              </label>
              <button
                type="submit"
                className="border-2 border-books bg-books px-6 py-3 font-mono text-ident uppercase tracking-[0.08em] text-stock transition-colors hover:bg-stock hover:text-books"
              >
                Work it out
              </button>
            </form>

            <p className="rag-pretty opsz-prose mt-5 max-w-[52ch] font-news text-ident leading-relaxed text-graphite-soft">
              Nothing is stored and nothing is sent anywhere: the answer is in the address
              bar, so the result is a link you can forward.
            </p>
          </div>

          <div className="min-w-0 border-t border-hairline pt-6 lg:border-l lg:border-t-0 lg:pl-14 lg:pt-0">
            {!deadline || !invoice ? (
              <p className="rag-pretty opsz-prose max-w-[40ch] font-news text-prose leading-relaxed text-graphite">
                The cut-off appears here. It runs against the invoice date rather than the
                month the invoice was noticed, which is the part that catches people out:
                credit that went unmatched in March is still governed by March&rsquo;s
                financial year.
              </p>
            ) : (
              <>
                <p className="font-mono text-stub uppercase text-graphite">
                  Credit on an invoice dated {LONG.format(invoice)} (FY{" "}
                  {financialYear(invoice)}) must be claimed by
                </p>
                <p className="optical-figure mt-4">
                  <Overprint
                    settle
                    className="wdth-condensed tabular font-anek text-[clamp(40px,5.4vw,72px)] font-bold leading-[0.9] tracking-[-0.03em]"
                  >
                    {LONG.format(deadline)}
                  </Overprint>
                </p>
                <p
                  className={`tabular mt-4 font-mono text-ident uppercase tracking-[0.08em] ${
                    passed || (days !== null && days <= 60)
                      ? "text-statute-deep"
                      : "text-graphite"
                  }`}
                >
                  {passed
                    ? `The window closed ${Math.abs(days!)} days ago`
                    : `${days} days from today`}
                </p>

                <dl className="mt-8 border-t border-hairline">
                  <Row term="Financial year" value={`FY ${financialYear(invoice)}`} />
                  <Row
                    term="That year ended"
                    value={LONG.format(
                      new Date(
                        Date.UTC(Number(financialYear(invoice).slice(0, 4)) + 1, 2, 31),
                      ),
                    )}
                  />
                  <Row term="Plus the statutory window" value="to 30 November following" />
                </dl>
              </>
            )}

            {/* The caveat the engine's own docstring carries, on the page
                rather than under it. A tool that answers more confidently than
                the product it came from is a tool that will be quoted back at
                somebody in an assessment. */}
            <div className="mt-10 border-t-2 border-agreed pt-5">
              <p className="rag-pretty opsz-prose max-w-[48ch] font-news text-ident leading-relaxed text-graphite">
                The statutory limit is the <em>earlier</em> of 30 November and the date the
                annual return for that year is actually filed. Only the November limit is
                worked out here, because the filing date is per taxpayer. GST rules change
                by notification, and nothing on this page is tax advice.
              </p>
            </div>
          </div>
        </section>

        <section className="border-t border-hairline py-12">
          <div className="rag-pretty opsz-prose max-w-[64ch] font-news text-prose leading-relaxed text-graphite">
            This is one rule out of the engine. The same clock runs against every unmatched
            invoice in a client&rsquo;s books at once, and{" "}
            <Link
              href="/"
              className="text-agreed underline decoration-hairline underline-offset-4 hover:decoration-agreed"
            >
              the rest of DiligenceReady
            </Link>{" "}
            is what happens when you point it at twelve months of them.{" "}
            <DemoButton variant="link" label="The demo workspace is open" /> and the
            password is printed on the page.
          </div>
        </section>
      </div>
    </main>
  );
}

function Row({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-hairline py-2">
      <dt className="font-mono text-stub uppercase text-graphite">{term}</dt>
      <dd className="tabular font-mono text-ident text-agreed">{value}</dd>
    </div>
  );
}
