import Link from "next/link";
import { notFound } from "next/navigation";

import { AskLedger } from "../../../components/AskLedger";
import { Findings } from "../../../components/Findings";
import { ImsPanel } from "../../../components/ImsPanel";
import { LenderPackage } from "../../../components/LenderPackage";
import { OtherItc } from "../../../components/OtherItc";
import { PeriodRange } from "../../../components/PeriodRange";
import { RangeSummary } from "../../../components/RangeSummary";
import { ReadinessCard } from "../../../components/ReadinessCard";
import { Sparkline } from "../../../components/Sparkline";
import { UploadPanel } from "../../../components/UploadPanel";
import type {
  Company,
  CompanyCard,
  ImsSummary,
  OtherItcSummary,
  RangeSummary as Range,
  Readiness,
  Risk,
  SessionUser,
} from "../../../lib/api";
import { requireData } from "../../../lib/session";
import { periodLabel } from "../../../lib/format";

export const dynamic = "force-dynamic";

export default async function CompanyPage({
  params,
  searchParams,
}: {
  params: { companyId: string };
  searchParams: { period?: string; from?: string; to?: string };
}) {
  let company: Company;
  try {
    company = await requireData<Company>(`/api/companies/${params.companyId}`);
  } catch (error) {
    if ((error as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw error;
    notFound();
  }

  if (company.periods.length === 0) {
    notFound();
  }

  // Periods arrive newest first. The default is the newest one that has a
  // GSTR-2B, not simply the newest: 2B for month M generates on the 14th of
  // M+1, so a CA opening this on 20 September is working on August. A period
  // row appears as soon as any feed carries a date in it, and a couple of
  // bank value-dates spilling into the new month were enough to land the
  // page on an empty September showing 0.0% coverage.
  const reconciled = company.periods.filter((entry) => entry.gstr2b_generated);
  const fallback = reconciled[0]?.period ?? company.periods[0].period;

  // A span asked for in the URL, clamped to the months this company has. Both
  // ends must be present and well-formed: half a range is a mangled link, and
  // guessing the missing end would answer a question nobody asked. A span of
  // one month is not a span — it is the single-month page, which already has
  // a URL of its own.
  const span = spanFrom(searchParams, company.periods);
  const period = span ? span.to : (searchParams.period ?? fallback);
  const chosenForYou = !span && !searchParams.period && reconciled[0]?.period === period;

  const base = `/api/companies/${company.company_id}/periods/${period}`;
  const [range, readiness, { risks }, ims, other, firm, user] = await Promise.all([
    span
      ? requireData<Range>(
          `/api/companies/${company.company_id}/range?from=${span.from}&to=${span.to}`,
        )
      : Promise.resolve(null),
    requireData<Readiness>(`${base}/readiness`),
    requireData<{ risks: Risk[] }>(`${base}/risks`),
    requireData<ImsSummary>(`${base}/ims`).catch(() => null),
    requireData<OtherItcSummary>(`${base}/other-itc`).catch(() => null),
    // The command palette jumps between clients, so it needs the firm's book.
    // Fetched on the server beside everything else rather than by the browser
    // after paint: it is one more query on a page already making four.
    requireData<{ companies: CompanyCard[] }>("/api/firm/dashboard").catch(() => ({
      companies: [] as CompanyCard[],
    })),
    requireData<SessionUser>("/api/me").catch(() => null),
  ]);

  return (
    <main className="mx-auto max-w-[1400px] px-6 py-10 sm:px-10">
      {/* The way back up, and the only line on this page that names who the
          paper belongs to. The firm's name alone was already a link here, but
          a name is not an exit — nothing about it said that clicking it leaves
          this company, and a reader who came in from the dashboard had no
          visible route back to it. The destination is now spelled out in the
          link's own text rather than in an aria-label, so the mouse and the
          screen reader are told the same thing.

          Not `no-print`: the firm's name is the only attribution the filed
          sheet carries. The chevron is the part that is a control rather than
          a fact, so that is the part that comes off on paper. */}
      <nav aria-label="Breadcrumb" className="text-ident text-graphite">
        <Link href="/app" className="group inline-flex items-center gap-2">
          <svg
            viewBox="0 0 8 10"
            aria-hidden
            className="no-print h-2.5 w-2 shrink-0 text-graphite-soft group-hover:text-agreed"
          >
            <path d="M6 1L1 5l5 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          <span className="underline decoration-graphite-soft underline-offset-4 group-hover:decoration-agreed">
            {company.firm_name}
          </span>
          <span className="text-graphite-soft">· all client companies</span>
        </Link>
      </nav>

      <header className="mt-3 flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
        <div>
          <h1 className="optical-cap wdth-tight font-anek text-[2rem] font-bold leading-none text-agreed">
            {company.name}
          </h1>
          <p className="mt-1 font-mono text-ident text-graphite">
            {company.gstin} · PAN {company.pan}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          {/* Thirteen open-finding counts, as a shape. Whether a book is
              getting better or worse is the firm's actual question about a
              client, and no single period answers it. */}
          <div className="flex items-center gap-2 text-graphite">
            <Sparkline
              points={[...company.periods]
                .reverse()
                .map((entry) => ({ period: entry.period, value: entry.open_risks }))}
            />
            <span className="text-ident text-graphite-soft">open findings</span>
          </div>
          <PeriodRange
            companyId={company.company_id}
            periods={company.periods}
            from={span ? span.from : period}
            to={span ? span.to : period}
          />
        </div>
      </header>

      {/* Which month this is was decided for the reader, and nothing on the
          page used to say so. On 20 September these are August's figures
          because September's 2B does not exist yet, and a CA who assumes
          otherwise is reading the wrong month. One sentence, no pixels of
          permanent furniture. */}
      <p className="mt-6 max-w-[70ch] text-ident text-graphite">
        Financial readiness ·{" "}
        {span ? `${periodLabel(span.from)} to ${periodLabel(span.to)}` : periodLabel(period)}
        {chosenForYou && (
          <span className="text-graphite-soft">
            {" "}
            (the latest period with a generated GSTR-2B; a month&rsquo;s 2B generates on
            the 14th of the month after it)
          </span>
        )}
      </p>

      {range ? (
        <RangeSummary range={range} companyId={company.company_id} />
      ) : (
        <div className="mt-3">
          <ReadinessCard readiness={readiness} />
        </div>
      )}

      {/* The findings are the work. Everything below them is context, a write
          path, or an aspiration, and each of those used to sit above the list
          — putting the only surface a CA acts on about four viewports down,
          behind a button that by design does nothing. */}
      {/* The working surfaces below are a month's, not a span's. A decision on
          a finding is taken with that month's GSTR-2B in front of you, the
          other-ITC sections and the IMS dashboard are both per-return, and an
          upload lands in the period its own dates put it in. In a span they
          would each be answering for a month the reader did not choose, so
          the span shows its index and sends them into the month instead. */}
      {!range && (
        <Findings
          risks={risks}
          period={period}
          company={company.name}
          companyId={company.company_id}
          periods={company.periods}
          companies={firm.companies}
          canWrite={user?.can_write ?? true}
        />
      )}

      <div className="mt-10 border-t border-graphite-soft">
        {!range && other && <OtherItc other={other} />}

        {!range && ims && <ImsPanel ims={ims} />}

        {/* Not collapsed, and not grouped with the rest. A company with no
            documents has no findings, and this is the control that fixes
            that — it cannot be the thing hidden inside a closed drawer. */}
        <UploadPanel companyId={company.company_id} />

        <div className="no-print border-b border-graphite-soft py-8">
          <AskLedger companyId={company.company_id} />
        </div>

        {reconciled.length > 0 && (
          <LenderPackage
            periodsReconciled={reconciled.length}
            earliest={reconciled[reconciled.length - 1].period}
            latest={reconciled[0].period}
          />
        )}
      </div>
    </main>
  );
}

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * The span the URL is asking for, or null for the ordinary one-month page.
 *
 * Every rejection here lands on the single-month view rather than on an error,
 * because each one describes a link that is wrong rather than a reader who is:
 *
 * *   **One end missing.** `?from=` alone does not mean "to the end of time";
 *     it means the link lost half of itself in a chat client.
 * *   **Not a period.** These reach a `between` in SQL. The API validates them
 *     too — this is the copy that keeps a mangled link from becoming a 400 on
 *     a page a reader is already looking at.
 * *   **Reversed.** April to January is not a span.
 * *   **Outside the books.** Clamped to the months this company has rather
 *     than refused, so a range pasted between two clients still resolves to
 *     the overlapping part instead of to an empty table.
 * *   **One month wide.** That is not a range, it is the page this already is,
 *     and it has a shorter URL.
 */
function spanFrom(
  searchParams: { from?: string; to?: string },
  periods: { period: string }[],
): { from: string; to: string } | null {
  const { from, to } = searchParams;
  if (!from || !to) return null;
  if (!PERIOD.test(from) || !PERIOD.test(to)) return null;
  if (from > to) return null;

  // Periods arrive newest first.
  const newest = periods[0].period;
  const oldest = periods[periods.length - 1].period;
  const start = from < oldest ? oldest : from;
  const end = to > newest ? newest : to;

  if (start > end) return null;
  if (start === end) return null;
  return { from: start, to: end };
}
