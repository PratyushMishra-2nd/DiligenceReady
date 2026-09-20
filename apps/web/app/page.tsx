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

  // The screen states a deadline and then has to answer "which client is that".
  // A firm carries thirty to eighty companies, so in API order that question
  // costs a read of every row. Soonest cut-off first, nulls last, ties broken
  // by the money at stake. Sorting is the whole of it — no figure is recomputed
  // here, and `itc_at_risk` is compared, never displayed, as a number.
  const ordered = [...companies].sort((a, b) => {
    const left = a.next_sec_16_4_deadline;
    const right = b.next_sec_16_4_deadline;
    if (left !== right) {
      if (!left) return 1;
      if (!right) return -1;
      return left < right ? -1 : 1;
    }
    return Number(b.itc_at_risk) - Number(a.itc_at_risk);
  });

  const discriminating = companies.some(
    (company) => company.next_sec_16_4_deadline !== soonest,
  );

  return (
    <main className="mx-auto max-w-[1100px] px-6 py-10 sm:px-10">
      <header className="ruled flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2 pb-4">
        <h1 className="text-lede font-semibold tracking-tight">{user.firm}</h1>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <p className="text-data text-ink-soft">
            Financial readiness across {companies.length} client{" "}
            {companies.length === 1 ? "company" : "companies"}
          </p>
          <SignOut name={user.display_name} role={user.role} />
        </div>
      </header>

      {/* The first thing a CA should see is not a coverage percentage. It is
          money with a statutory deadline attached — the figure that makes them
          pick up the phone. */}
      <section className="border-b border-rule-strong py-10">
        <p className="text-data text-ink-soft">Input tax credit with no GSTR-2B counterpart</p>
        {/* A fourteen-character rupee figure at 52px is wider than a phone.
            The display size is the large-screen treatment; below that it drops
            to the figure step rather than being clipped at the gutter. */}
        <p className="tabular mt-3 text-figure font-semibold text-exposure sm:text-hero">
          {inr(exposure)}
        </p>
        <p className="mt-5 max-w-[62ch] text-body leading-relaxed text-ink-soft">
          Already paid to suppliers and not yet claimable.
          {cutoff && (
            <>
              {" "}
              {/* Two emphases, not four: the amount and the days left. The
                  calendar date is the label for the deadline, not the urgency
                  in it, and a sentence that bolds every variable emphasises
                  nothing. */}
              <span className="tabular font-medium text-ink">{inr(dueNow)}</span> of it sits
              on invoices whose Sec 16(4) window closes {cutoff.label},{" "}
              <span className="tabular font-medium text-ink">{cutoff.days} days</span> away,
              across {dueNowFindings} findings. After that date the credit stops being a
              receivable and becomes a cost.
            </>
          )}
        </p>
      </section>

      <section className="pt-8">
        <div className="flex items-baseline justify-between">
          <h2 className="text-data font-semibold">Client companies</h2>
          <p className="tabular text-data text-ink-soft">{openRisks} open findings</p>
        </div>

        {/* A GSTIN is fifteen unbreakable monospace characters and there are
            six columns beside it. Without this the table pushes the whole
            document sideways on a phone instead of scrolling itself. */}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-data">
            <caption className="sr-only">
              Reconciliation state for every client company the firm carries, soonest Sec
              16(4) cut-off first
            </caption>
            <thead className="sticky top-0 z-10 bg-paper">
              <tr className="border-y border-rule-strong text-left text-micro text-ink-soft">
                <th scope="col" className="py-2 pr-4 font-medium">
                  Company
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Sec 16(4) closes
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Latest period
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">
                  GST reconciled
                </th>
                <th scope="col" className="hidden py-2 pr-4 text-right font-medium md:table-cell">
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
              {ordered.map((company) => {
                // The rows the headline figure was summed from, marked as such.
                // The alternative is a reader taking the hero on trust — but
                // only where the mark distinguishes something. If every client
                // shares the cut-off, shading all of them says nothing and
                // spends the one wash this table has.
                const due = discriminating && company.next_sec_16_4_deadline === soonest;
                return (
                  <tr
                    key={company.company_id}
                    className={`ruled align-baseline ${due ? "bg-exposure-wash/40" : ""}`}
                  >
                    <td className="py-3 pr-4">
                      <Link
                        href={`/companies/${company.company_id}`}
                        className="font-medium text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink"
                      >
                        {company.name}
                      </Link>
                      <span className="mt-0.5 block font-mono text-micro text-ink-soft">
                        {company.gstin}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <Closes iso={company.next_sec_16_4_deadline} />
                    </td>
                    <td className="tabular py-3 pr-4 text-ink-soft">
                      {periodLabel(company.period)}
                    </td>
                    <td className="tabular py-3 pr-4 text-right">
                      <Coverage value={company.gst_coverage_pct} />
                    </td>
                    <td className="tabular hidden py-3 pr-4 text-right md:table-cell">
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
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="mt-6 max-w-[70ch] text-micro leading-relaxed text-ink-faint">
          Sorted by the soonest Sec 16(4) cut-off, then by the credit at stake.{" "}
          {discriminating && "Shaded rows are the ones the figure above was summed from. "}
          Coverage is the latest period;
          open findings and unmatched credit are the whole book. Credit that went unmatched
          in March is still unclaimed today, and the Sec 16(4) clock runs against
          the invoice date, not the month you noticed.
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

/**
 * The statutory cut-off, and how long is left of it. Vermillion inside a
 * month, because that is the window in which a CA can still do something about
 * it; plain ink beyond, because colouring every date makes none of them mean
 * anything.
 */
function Closes({ iso }: { iso: string | null }) {
  const cutoff = deadline(iso);
  if (!cutoff) return <span className="text-ink-faint">—</span>;
  const urgent = cutoff.days <= 30;
  return (
    <span className={urgent ? "text-exposure" : "text-ink"}>
      <span className="tabular block font-medium">{cutoff.days} days</span>
      <span className="tabular mt-0.5 block text-micro text-ink-soft">{cutoff.label}</span>
    </span>
  );
}

/**
 * Coverage reads as near-binary in a column of eighty rows — 99.9% and 42.0%
 * are the same shape and the same colour, and only the digits differ. A
 * hairline sharing one baseline down the column lets the eye find the short
 * one without reading any of them.
 *
 * The bar is ink, never exposure: coverage is progress, not money at risk, and
 * the vermillion means one thing in this product. It is `aria-hidden` because
 * the number beside it is already the accessible value.
 */
function Coverage({ value }: { value: string }) {
  const number = Number(value);
  const complete = Number.isFinite(number) && number >= 99.95;
  const width = Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : 0;
  return (
    <span className="inline-block">
      <span className={complete ? "text-reconciled" : "text-ink"}>
        {value}
        <span className="text-ink-faint">%</span>
      </span>
      <span aria-hidden className="mt-1 block h-px w-12 bg-rule">
        <span
          className={`block h-px ${complete ? "bg-reconciled" : "bg-ink-soft"}`}
          style={{ width: `${width}%` }}
        />
      </span>
    </span>
  );
}

function EngineOffline() {
  return (
    <main className="mx-auto max-w-[70ch] px-6 py-24">
      <h1 className="text-lede font-semibold">The engine is not answering</h1>
      <p className="mt-3 text-body leading-relaxed text-ink-soft">
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
