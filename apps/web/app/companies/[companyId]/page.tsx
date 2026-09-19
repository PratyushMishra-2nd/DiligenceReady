import Link from "next/link";
import { notFound } from "next/navigation";

import { Findings } from "../../components/Findings";
import { ImsPanel } from "../../components/ImsPanel";
import { LenderPackage } from "../../components/LenderPackage";
import { OtherItc } from "../../components/OtherItc";
import { ReadinessCard } from "../../components/ReadinessCard";
import { UploadPanel } from "../../components/UploadPanel";
import type { Company, ImsSummary, OtherItcSummary, Readiness, Risk } from "../../lib/api";
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

  const period = searchParams.period ?? company.periods[0].period;
  const base = `/api/companies/${company.company_id}/periods/${period}`;
  const [readiness, { risks }, ims, other] = await Promise.all([
    requireData<Readiness>(`${base}/readiness`),
    requireData<{ risks: Risk[] }>(`${base}/risks`),
    requireData<ImsSummary>(`${base}/ims`).catch(() => null),
    requireData<OtherItcSummary>(`${base}/other-itc`).catch(() => null),
  ]);

  const reconciled = company.periods.filter((entry) => entry.gstr2b_generated);

  return (
    <main className="mx-auto max-w-[1400px] px-6 py-10 sm:px-10">
      <nav className="text-micro text-ink-soft">
        <Link href="/" className="underline decoration-rule-strong underline-offset-4 hover:decoration-ink">
          {company.firm_name}
        </Link>
      </nav>

      <header className="mt-3 flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{company.name}</h1>
          <p className="mt-1 font-mono text-micro text-ink-faint">
            {company.gstin} · PAN {company.pan}
          </p>
        </div>
        <PeriodPicker
          companyId={company.company_id}
          periods={company.periods}
          current={period}
        />
      </header>

      <p className="mt-6 text-sm text-ink-soft">
        Financial readiness · {periodLabel(period)}
      </p>

      <div className="mt-3">
        <ReadinessCard readiness={readiness} />
      </div>

      {other && <OtherItc other={other} />}

      {ims && <ImsPanel ims={ims} />}

      {reconciled.length > 0 && (
        <LenderPackage
          periodsReconciled={reconciled.length}
          earliest={reconciled[reconciled.length - 1].period}
          latest={reconciled[0].period}
        />
      )}

      <UploadPanel companyId={company.company_id} />

      <Findings risks={risks} period={period} />
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
    <nav aria-label="Period" className="flex flex-wrap gap-1">
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
                : "border-rule text-ink-soft hover:border-ink hover:text-ink"
            }`}
          >
            {periodLabel(entry.period, true)}
          </Link>
        );
      })}
    </nav>
  );
}
