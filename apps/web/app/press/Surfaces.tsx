"use client";

import { useEffect, useRef, useState } from "react";

import aggregates from "./aggregates.json";
import { inr, inrShort } from "../lib/format";

/**
 * The product, drawn rather than photographed.
 *
 * This replaces five PNG screenshots. Screenshots go stale the moment the
 * interface moves — the ones this section used to carry were taken before the
 * type system was rebuilt, so the page ended up showing a picture of a design
 * it no longer had, which is worse than showing nothing.
 *
 * Every surface below is live HTML built from `aggregates.json`: the same two
 * client companies, the same GSTINs, the same eighty-two findings, the same
 * invoice at line 458 of a real seed file. Nothing here is a mock-up of a
 * number. It theme-switches, it reflows, it is selectable and searchable, and
 * it cannot drift out of date because it is the data.
 *
 * The three surfaces are pinned and cross-faded under a scroll — the reader
 * stays in one place while the product moves through them, which puts a whole
 * product tour inside a single screen-height instead of three thousand pixels
 * of stacked plates.
 */

const SURFACES = [
  {
    key: "dashboard",
    label: "Firm dashboard",
    route: "/app",
    question: "Which client needs me this month, and how much is on the line?",
  },
  {
    key: "findings",
    label: "Findings",
    route: "/app/companies/[id]",
    question: "What exactly did the engine raise, by rule and by rupee?",
  },
  {
    key: "evidence",
    label: "Evidence",
    route: "/app/companies/[id]#evidence",
    question: "Where did this figure come from — which file, which row?",
  },
] as const;

export function Surfaces() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = track.getBoundingClientRect();
        // How far through the tall track we are, ignoring the sticky pane's
        // own height at the end.
        const span = r.height - window.innerHeight;
        const p = span <= 0 ? 0 : Math.min(1, Math.max(0, -r.top / span));
        setActive(Math.min(SURFACES.length - 1, Math.floor(p * SURFACES.length)));
      });
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <section id="screens" className="scroll-mt-24 border-t border-hairline">
      <div ref={trackRef} className="relative h-[300vh]">
        <div className="sticky top-0 flex min-h-screen flex-col justify-center py-16">
          <div className="grid gap-x-block gap-y-8 lg:grid-cols-[260px_minmax(0,1fr)]">
            {/* The rail. The labels move; the screen stays. */}
            <div>
              <p className="font-mono text-label-12 uppercase text-exposure-deep">
                The product
              </p>
              <ol className="mt-6 space-y-1">
                {SURFACES.map((s, i) => (
                  <li key={s.key}>
                    <button
                      type="button"
                      onClick={() => {
                        const track = trackRef.current;
                        if (!track) return;
                        const span = track.offsetHeight - window.innerHeight;
                        // Document coordinates. `offsetTop` is measured from
                        // the nearest positioned ancestor, and `main` is
                        // `relative` — this is right today only because that
                        // main happens to start at zero.
                        const top = track.getBoundingClientRect().top + window.scrollY;
                        window.scrollTo({
                          top: top + (span * (i + 0.5)) / SURFACES.length,
                          behavior: "smooth",
                        });
                      }}
                      className={`group flex w-full items-baseline gap-3 border-l-2 py-2.5 pl-4 text-left transition-all duration-panel ease-press ${
                        i === active
                          ? "border-exposure text-ink"
                          : "border-hairline text-ink-subtle hover:border-ink-subtle hover:text-ink-muted"
                      }`}
                    >
                      <span className="fig font-mono text-label-12">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="font-sans text-head-4 font-medium">{s.label}</span>
                    </button>
                  </li>
                ))}
              </ol>
              <p
                key={active}
                className="panel-in mt-8 max-w-[34ch] font-sans text-copy-17 text-ink-muted"
              >
                {SURFACES[active].question}
              </p>
              <p className="mt-4 font-mono text-label-12 uppercase text-ink-subtle">
                {SURFACES[active].route}
              </p>
            </div>

            {/* The pane. One surface at a time, cross-faded. */}
            <div className="relative min-w-0">
              {SURFACES.map((s, i) => (
                <div
                  key={s.key}
                  aria-hidden={i !== active}
                  className={`transition-all duration-500 ease-seat ${
                    i === active
                      ? "relative z-10 translate-y-0 opacity-100"
                      : "pointer-events-none absolute inset-0 translate-y-3 opacity-0"
                  }`}
                >
                  {s.key === "dashboard" && <FirmDashboard />}
                  {s.key === "findings" && <FindingsList />}
                  {s.key === "evidence" && <EvidencePanel />}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** The chrome every surface sits in: a window, not a card. */
function Window({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="surface-window overflow-hidden rounded-card border border-hairline bg-raised shadow-lift">
      <div className="flex items-center gap-3 border-b border-hairline bg-sunken px-5 py-3">
        <span className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-rule" />
          <span className="size-2.5 rounded-full bg-rule" />
          <span className="size-2.5 rounded-full bg-rule" />
        </span>
        <span className="font-mono text-label-12 uppercase text-ink-subtle">{title}</span>
      </div>
      {children}
    </div>
  );
}

function FirmDashboard() {
  const { headline, companies, totals } = aggregates;
  const rowLevel = (aggregates.defects as Defect[]).filter((d) => d.target === "row");

  return (
    <Window title="Mehta & Associates · firm">
      <div className="border-b border-hairline px-6 py-6">
        <p className="font-mono text-label-12 uppercase text-ink-subtle">
          Input tax credit with no GSTR-2B counterpart
        </p>
        <p className="fig leading-trim mt-2 font-sans text-head-1 font-semibold text-ink">
          {inr(headline.amount)}
        </p>
        <p className="mt-3 max-w-prose font-sans text-copy-17 text-ink-muted">
          <span className="fig font-medium text-exposure-deep">
            {inr(headline.before_next_deadline.amount)}
          </span>{" "}
          of it sits on invoices whose Section 16(4) window closes 30 Nov 2026, across{" "}
          <span className="fig">{headline.before_next_deadline.defects}</span> findings.
        </p>
      </div>

      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-hairline bg-sunken">
            {["Client company", "GSTIN", "Books reconciled", "Bank", "Open", "ITC unmatched"].map(
              (h) => (
                <th
                  key={h}
                  className="px-4 py-2.5 font-mono text-label-12 uppercase text-ink-subtle"
                >
                  {h}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {companies.map((c) => {
            // Both ratios are counts, not estimates: the rows the engine
            // raised a finding on, against the rows it read. The clamped
            // 2B-documents-over-purchase-register that used to be here was
            // above 1.0 for both companies and pinned itself to a tidy 99.9%,
            // which is a number that looks like a measurement and is not one.
            const booksCover = 1 - c.defect_rows.books.length / c.records.purchase_register;
            const bankCover = 1 - c.defect_rows.bank.length / c.records.bank_statement;

            // Rule R1 only — input tax credit with no GSTR-2B counterpart —
            // because that is what the figure at the head of this table is.
            // Summing every rule instead gave ₹96 lakh a company under a
            // header claiming ₹16.25 lakh in total: two different quantities
            // in one table, and the kind of thing the reader this is built
            // for checks first. These two rows now add up to that figure
            // exactly, which is the only reason to print them side by side.
            const itcUnmatched = rowLevel
              .filter((d) => d.company === c.slug && d.rule === "R1")
              .reduce((n, d) => n + Number(d.amount), 0);

            return (
              <tr
                key={c.slug}
                className="mark-verb border-b border-hairline last:border-0 hover:bg-sunken"
              >
                <td className="px-4 py-3">
                  <span className="font-sans text-copy-17 font-medium text-ink underline decoration-hairline underline-offset-4">
                    {c.name}
                  </span>
                </td>
                <td className="fig px-4 py-3 font-mono text-caption-13 text-ink-muted">
                  {c.gstin}
                </td>
                <td className="px-4 py-3">
                  <Meter value={booksCover} />
                </td>
                <td className="px-4 py-3">
                  <Meter value={bankCover} tone="books" />
                </td>
                <td className="fig px-4 py-3 font-mono text-caption-13 text-ink">
                  {c.evaluation.detected}
                </td>
                <td className="fig px-4 py-3 text-right font-mono text-caption-13 font-medium text-exposure-deep">
                  {inr(itcUnmatched.toFixed(2))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-hairline bg-sunken px-6 py-3">
        <p className="font-mono text-label-12 uppercase text-ink-subtle">
          {totals.companies} companies · {aggregates.periods} periods ·{" "}
          <span className="fig">{totals.detected}</span> open findings
        </p>
        <p className="font-mono text-label-12 uppercase text-ink-subtle">
          {aggregates.period_from} → {aggregates.period_to}
        </p>
      </div>
    </Window>
  );
}

/** A proportional bar, because a percentage alone is a claim and a bar is a shape. */
function Meter({ value, tone = "ink" }: { value: number; tone?: "ink" | "books" }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="relative h-1 w-16 overflow-hidden rounded-full bg-hairline">
        <span
          className={`absolute inset-y-0 left-0 rounded-full ${
            tone === "books" ? "bg-books" : "bg-ink"
          }`}
          style={{ width: `${(value * 100).toFixed(2)}%` }}
        />
      </span>
      <span className="fig font-mono text-caption-13 text-ink-muted">
        {(value * 100).toFixed(2)}%
      </span>
    </span>
  );
}

const RULE_NAMES: Record<string, string> = {
  R1: "Supplier never filed",
  R2: "Amount mismatch",
  R3: "Duplicate invoice",
  R4: "Supplier stopped filing",
  R5: "Bank timing gap",
  R6: "Unidentified deposit",
  R7: "Concentration spike",
};

function FindingsList() {
  const defects = (aggregates.defects as Defect[]);
  // The eight largest, because a list of eighty-two is a database and a list of
  // eight is an argument.
  const top = [...defects].sort((a, b) => Number(b.amount) - Number(a.amount)).slice(0, 8);
  const byRule = new Map<string, number>();
  for (const d of defects) byRule.set(d.rule, (byRule.get(d.rule) ?? 0) + 1);

  return (
    <Window title="Findings · all rules">
      <div className="flex flex-wrap gap-1.5 border-b border-hairline bg-sunken px-5 py-3">
        {[...byRule.entries()]
          .sort()
          .map(([rule, n]) => (
            <span
              key={rule}
              className="mark-verb inline-flex items-baseline gap-1.5 rounded-chip border border-hairline bg-raised px-2.5 py-1 hover:border-ink-subtle"
            >
              <span className="fig font-mono text-label-12 text-exposure-deep">{rule}</span>
              <span className="text-caption-13 text-ink-muted">{RULE_NAMES[rule]}</span>
              <span className="fig font-mono text-label-12 text-ink-subtle">{n}</span>
            </span>
          ))}
      </div>

      <ul>
        {top.map((d, i) => (
          <li
            key={i}
            className="mark-verb grid grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-x-4 border-b border-hairline px-5 py-3 last:border-0 hover:bg-sunken"
          >
            <span className="fig rounded-chip bg-exposure-wash px-1.5 py-0.5 font-mono text-label-12 text-exposure-deep">
              {d.rule}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-sans text-copy-17 text-ink">
                {RULE_NAMES[d.rule]}
              </span>
              <span className="fig font-mono text-caption-13 text-ink-subtle">
                {d.company.replace(/-/g, " ")} · {d.period} · {d.target}-level
              </span>
            </span>
            <span className="fig whitespace-nowrap text-right font-mono text-caption-13 font-medium text-ink">
              {inrShort(d.amount)}
            </span>
          </li>
        ))}
      </ul>

      <div className="border-t border-hairline bg-sunken px-5 py-3">
        <p className="font-mono text-label-12 uppercase text-ink-subtle">
          Showing 8 of <span className="fig">{defects.length}</span> · sorted by value · every row
          opens its evidence
        </p>
      </div>
    </Window>
  );
}

type Defect = {
  company: string;
  rule: string;
  defect_type: string;
  period: string;
  amount: string;
  target: string;
  register: string | null;
};

function EvidencePanel() {
  const ex = aggregates.example;

  return (
    <Window title="Evidence · finding R1">
      <div className="grid gap-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="border-b border-hairline p-5 md:border-b-0 md:border-r">
          <p className="font-mono text-label-12 uppercase text-ink-subtle">As recorded</p>
          <dl className="mt-3 space-y-0">
            {Object.entries(ex.columns).map(([k, v]) => (
              <div
                key={k}
                className="grid grid-cols-[minmax(0,10ch)_minmax(0,1fr)] gap-3 border-b border-hairline py-1.5 last:border-0"
              >
                <dt className="font-mono text-caption-13 text-ink-subtle">{k}</dt>
                <dd className="fig break-all font-mono text-caption-13 text-ink">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 font-mono text-label-12 text-ink-subtle">
            {ex.file}
            <span className="text-exposure-deep"> :{ex.line}</span>
          </p>
        </div>

        <div className="p-5">
          <p className="font-mono text-label-12 uppercase text-ink-subtle">As matched</p>
          <p className="mt-3 font-sans text-copy-17 text-ink">{ex.note}</p>

          <div className="mt-4 rounded-panel bg-sunken p-3">
            <p className="font-mono text-label-12 uppercase text-ink-subtle">
              Voucher normalised
            </p>
            <p className="fig mt-1 font-mono text-caption-13 text-ink">
              {ex.columns["Voucher No"]}{" "}
              <span className="text-ink-subtle">reduces to</span>{" "}
              <span className="text-exposure-deep">{ex.normalised_number}</span>
            </p>
          </div>

          <dl className="mt-4">
            <div className="flex items-baseline justify-between border-t border-hairline py-2">
              <dt className="font-mono text-label-12 uppercase text-ink-subtle">Credit at risk</dt>
              <dd className="fig font-mono text-caption-13 font-medium text-exposure-deep">
                {inr(ex.amount)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between border-t border-hairline py-2">
              <dt className="font-mono text-label-12 uppercase text-ink-subtle">Period</dt>
              <dd className="fig font-mono text-caption-13 text-ink">{ex.period}</dd>
            </div>
          </dl>

          <p className="mt-4 border-t border-hairline pt-3 font-sans text-caption-13 leading-relaxed text-ink-muted">
            A SQL aggregate over the match table produced this figure.{" "}
            <span className="text-ink">No model did.</span>
          </p>
        </div>
      </div>
    </Window>
  );
}
