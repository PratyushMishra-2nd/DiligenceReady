import Link from "next/link";

import { SignOut } from "./components/SignOut";
import type { CompanyCard, SessionUser } from "./lib/api";
import { api } from "./lib/api";
import { requireData } from "./lib/session";
import { deadline, inr, inrShort, periodLabel, sumInr } from "./lib/format";

export const dynamic = "force-dynamic";

export default async function FirmDashboard() {
  let companies: CompanyCard[];
  let user: SessionUser;
  try {
    [{ companies }, user] = await Promise.all([
      requireData<{ companies: CompanyCard[] }>("/api/firm/dashboard"),
      requireData<SessionUser>("/api/me"),
    ]);
  } catch (error) {
    // `requireData` redirects on 401, so anything reaching here is the
    // engine being unreachable rather than the caller being signed out.
    if ((error as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw error;
    return <EngineOffline />;
  }

  const exposure = sumInr(companies.map((company) => company.itc_at_risk));
  const openRisks = companies.reduce((total, company) => total + company.open_risks, 0);

  // The nearest cut-off across the whole book, and only the credit that
  // cut-off actually governs. Quoting the full exposure against the soonest
  // date would overstate the urgency, which is the same sin as understating it.
  const soonest = companies
    .map((company) => company.next_sec_16_4_deadline)
    .filter(Boolean)
    .sort()[0];
  const cutoff = deadline(soonest);
  const dueNow = sumInr(
    companies
      .filter((company) => company.next_sec_16_4_deadline === soonest)
      .map((company) => company.itc_before_next_deadline),
  );
  const dueNowFindings = companies
    .filter((company) => company.next_sec_16_4_deadline === soonest)
    .reduce((total, company) => total + company.findings_before_next_deadline, 0);

  return (
    <main className="mx-auto max-w-[1100px] px-6 py-10 sm:px-10">
      <header className="ruled flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2 pb-4">
        <h1 className="text-lg font-semibold tracking-tight">{user.firm}</h1>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <p className="text-sm text-ink-soft">
            Financial readiness across {companies.length} client{" "}
            {companies.length === 1 ? "company" : "companies"}
          </p>
          <SignOut name={user.display_name} role={user.role} />
        </div>
      </header>

      {/* The first thing a CA should see is not a coverage percentage. It is
          money with a statutory deadline attached — the figure that makes them
          pick up the phone. */}
      <section className="border-b border-rule py-10">
        <p className="text-sm text-ink-soft">Input tax credit with no GSTR-2B counterpart</p>
        <p className="tabular mt-2 text-[3.25rem] font-semibold leading-none tracking-tight text-exposure">
          {inr(exposure)}
        </p>
        <p className="mt-4 max-w-[62ch] text-sm leading-relaxed text-ink-soft">
          Already paid to suppliers and not yet claimable.
          {cutoff && (
            <>
              {" "}
              <span className="tabular font-medium text-ink">{inr(dueNow)}</span> of it sits
              on invoices whose Sec 16(4) window closes{" "}
              <span className="font-medium text-ink">{cutoff.label}</span> —{" "}
              <span className="tabular font-medium text-ink">{cutoff.days} days</span> away,
              across {dueNowFindings} findings. After that date the credit stops being a
              receivable and becomes a cost.
            </>
          )}
        </p>
      </section>

      <section className="pt-8">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Client companies</h2>
          <p className="tabular text-sm text-ink-soft">{openRisks} open findings</p>
        </div>

        <table className="mt-4 w-full border-collapse text-sm">
          <caption className="sr-only">
            Reconciliation state for every client company the firm carries
          </caption>
          <thead>
            <tr className="border-y border-rule-strong text-left text-micro text-ink-soft">
              <th scope="col" className="py-2 pr-4 font-medium">
                Company
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                Latest period
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">
                GST reconciled
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">
                Bank reconciled
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">
                Open
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                ITC unmatched
              </th>
            </tr>
          </thead>
          <tbody>
            {companies.map((company) => (
              <tr key={company.company_id} className="ruled align-baseline">
                <td className="py-3 pr-4">
                  <Link
                    href={`/companies/${company.company_id}`}
                    className="font-medium text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink"
                  >
                    {company.name}
                  </Link>
                  <span className="mt-0.5 block font-mono text-micro text-ink-faint">
                    {company.gstin}
                  </span>
                </td>
                <td className="tabular py-3 pr-4 text-ink-soft">
                  {periodLabel(company.period)}
                </td>
                <td className="tabular py-3 pr-4 text-right">
                  <Coverage value={company.gst_coverage_pct} />
                </td>
                <td className="tabular py-3 pr-4 text-right">
                  <Coverage value={company.bank_coverage_pct} />
                </td>
                <td className="tabular py-3 pr-4 text-right">
                  {company.open_risks}
                  {company.high_risks > 0 && (
                    <span className="ml-2 border border-exposure/30 bg-exposure-wash px-1.5 py-0.5 text-micro font-medium text-exposure">
                      {company.high_risks} high
                    </span>
                  )}
                </td>
                <td className="tabular py-3 text-right font-medium text-exposure">
                  {inrShort(company.itc_at_risk)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="mt-6 max-w-[70ch] text-micro leading-relaxed text-ink-faint">
          Coverage is the latest period. Open findings and unmatched credit are the whole
          book — credit that went unmatched in March is still unclaimed today, and the
          Sec 16(4) clock runs against the invoice date, not the month you noticed.
        </p>

        <p className="mt-4 text-micro text-ink-faint">
          <Link
            href="/product"
            className="underline decoration-rule-strong underline-offset-4 hover:decoration-ink"
          >
            What this is
          </Link>
        </p>
      </section>
    </main>
  );
}

function Coverage({ value }: { value: string }) {
  const number = Number(value);
  const complete = Number.isFinite(number) && number >= 99.95;
  return (
    <span className={complete ? "text-reconciled" : "text-ink"}>
      {value}
      <span className="text-ink-faint">%</span>
    </span>
  );
}

function EngineOffline() {
  return (
    <main className="mx-auto max-w-[70ch] px-6 py-24">
      <h1 className="text-lg font-semibold">The engine is not answering</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-soft">
        The dashboard reads every figure from the reconciliation API at{" "}
        <span className="font-mono text-ink">{api.base}</span>. Start it, then reload:
      </p>
      <pre className="mt-4 overflow-x-auto border border-rule bg-sheet p-4 font-mono text-micro">
        {`docker compose -f infra/docker-compose.yml up -d
uv run diligence pipeline
uv run uvicorn diligence_api.main:app --port 8077`}
      </pre>
    </main>
  );
}
