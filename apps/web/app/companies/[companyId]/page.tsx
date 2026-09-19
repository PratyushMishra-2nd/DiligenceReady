import Link from "next/link";
import { notFound } from "next/navigation";

import { AskLedger } from "../../components/AskLedger";
import { Findings } from "../../components/Findings";
import { ImsPanel } from "../../components/ImsPanel";
import { LenderPackage } from "../../components/LenderPackage";
import { OtherItc } from "../../components/OtherItc";
import { ReadinessCard } from "../../components/ReadinessCard";
import { Sparkline } from "../../components/Sparkline";
import { UploadPanel } from "../../components/UploadPanel";
import type {
  Company,
  CompanyCard,
  ImsSummary,
  OtherItcSummary,
  Readiness,
  Risk,
  SessionUser,
} from "../../lib/api";
import { requireData } from "../../lib/session";
import { periodLabel } from "../../lib/format";

export const dynamic = "force-dynamic";

export default async function CompanyPage({
  params,
  searchParams,
}: {
  params: { companyId: string };
  searchParams: { period?: string };
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
  const period =
    searchParams.period ?? reconciled[0]?.period ?? company.periods[0].period;
  const chosenForYou = !searchParams.period && reconciled[0]?.period === period;
  const base = `/api/companies/${company.company_id}/periods/${period}`;
  const [readiness, { risks }, ims, other, firm, user] = await Promise.all([
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
      <nav className="text-micro text-ink-soft">
        <Link href="/" className="underline decoration-rule-strong underline-offset-4 hover:decoration-ink">
          {company.firm_name}
        </Link>
      </nav>

      <header className="mt-3 flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
        <div>
          <h1 className="text-figure font-semibold">{company.name}</h1>
          <p className="mt-1 font-mono text-micro text-ink-soft">
            {company.gstin} · PAN {company.pan}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          {/* Thirteen open-finding counts, as a shape. Whether a book is
              getting better or worse is the firm's actual question about a
              client, and no single period answers it. */}
          <div className="flex items-center gap-2 text-ink-soft">
            <Sparkline
              points={[...company.periods]
                .reverse()
                .map((entry) => ({ period: entry.period, value: entry.open_risks }))}
            />
            <span className="text-micro text-ink-faint">open findings</span>
          </div>
          <PeriodPicker
            companyId={company.company_id}
            periods={company.periods}
            current={period}
          />
        </div>
      </header>

      {/* Which month this is was decided for the reader, and nothing on the
          page used to say so. On 20 September these are August's figures
          because September's 2B does not exist yet, and a CA who assumes
          otherwise is reading the wrong month. One sentence, no pixels of
          permanent furniture. */}
      <p className="mt-6 max-w-[70ch] text-data text-ink-soft">
        Financial readiness · {periodLabel(period)}
        {chosenForYou && (
          <span className="text-ink-faint">
            {" "}
            — the latest period with a generated GSTR-2B. A month&rsquo;s 2B generates on
            the 14th of the month after it.
          </span>
        )}
      </p>

      <div className="mt-3">
        <ReadinessCard readiness={readiness} />
      </div>

      {/* The findings are the work. Everything below them is context, a write
          path, or an aspiration, and each of those used to sit above the list
          — putting the only surface a CA acts on about four viewports down,
          behind a button that by design does nothing. */}
      <Findings
        risks={risks}
        period={period}
        company={company.name}
        companyId={company.company_id}
        periods={company.periods}
        companies={firm.companies}
        canWrite={user?.can_write ?? true}
      />

      <div className="mt-10 border-t border-rule-strong">
        {other && <OtherItc other={other} />}

        {ims && <ImsPanel ims={ims} />}

        {/* Not collapsed, and not grouped with the rest. A company with no
            documents has no findings, and this is the control that fixes
            that — it cannot be the thing hidden inside a closed drawer. */}
        <UploadPanel companyId={company.company_id} />

        <div className="no-print border-b border-rule-strong py-8">
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

function PeriodPicker({
  companyId,
  periods,
  current,
}: {
  companyId: string;
  periods: { period: string; open_risks: number; gstr2b_generated: boolean }[];
  current: string;
}) {
  return (
    <nav aria-label="Period" className="no-print flex flex-wrap gap-1">
      {[...periods].reverse().map((entry) => {
        const active = entry.period === current;
        return (
          <Link
            key={entry.period}
            href={`/companies/${companyId}?period=${entry.period}`}
            aria-current={active ? "page" : undefined}
            title={
              entry.gstr2b_generated
                ? `${entry.open_risks} open findings`
                : "GSTR-2B has not generated for this period"
            }
            className={`tabular border px-2 py-1 text-micro ${
              active
                ? "border-ink bg-ink text-paper"
                : entry.gstr2b_generated
                  ? "border-rule text-ink-soft hover:border-ink hover:text-ink"
                  : "border-rule border-dashed text-ink-faint hover:border-ink hover:text-ink"
            }`}
          >
            {periodLabel(entry.period, true)}
          </Link>
        );
      })}
    </nav>
  );
}
