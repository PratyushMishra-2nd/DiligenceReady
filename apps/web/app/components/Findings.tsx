"use client";

import { useMemo, useState } from "react";

import type { Risk } from "../lib/api";
import {
  DOMAIN_CHIP,
  RULE_LABEL,
  inr,
  inrShort,
  pct,
  severityTone,
  subject,
} from "../lib/format";
import { EvidencePanel, PanelPlaceholder } from "./EvidencePanel";

const SEVERITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2, info: 3 };

export function Findings({ risks, period }: { risks: Risk[]; period: string }) {
  const [domain, setDomain] = useState<string>("all");
  const [selected, setSelected] = useState<Risk | null>(null);

  const domains = useMemo(() => {
    const seen = new Map<string, number>();
    for (const risk of risks) seen.set(risk.domain, (seen.get(risk.domain) ?? 0) + 1);
    return [...seen.entries()].sort((a, b) => b[1] - a[1]);
  }, [risks]);

  const shown = useMemo(
    () =>
      risks
        .filter((risk) => domain === "all" || risk.domain === domain)
        .sort(
          (a, b) =>
            (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9) ||
            Number(b.headline_amount ?? 0) - Number(a.headline_amount ?? 0),
        ),
    [risks, domain],
  );

  return (
    <div className="grid min-w-0 gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(400px,44%)]">
      {/* A grid item defaults to min-width:auto and refuses to shrink below its
          content, which the monospace calculation lines are wider than on a
          phone. min-w-0 is what lets the column narrow instead of pushing the
          page sideways. */}
      <div className="min-w-0 pr-0 lg:pr-8">
        <div className="flex flex-wrap items-baseline justify-between gap-4 pb-3 pt-8">
          <h2 className="text-sm font-semibold">
            {shown.length} finding{shown.length === 1 ? "" : "s"}
          </h2>
          <nav
            className="flex w-full flex-wrap gap-1 sm:w-auto"
            aria-label="Filter findings by domain"
          >
            <FilterButton
              label="All"
              count={risks.length}
              active={domain === "all"}
              onClick={() => setDomain("all")}
            />
            {domains.map(([name, count]) => (
              <FilterButton
                key={name}
                label={DOMAIN_CHIP[name] ?? name}
                count={count}
                active={domain === name}
                onClick={() => setDomain(name)}
              />
            ))}
          </nav>
        </div>

        {shown.length === 0 ? (
          <p className="ruled py-8 text-sm text-ink-soft">
            Nothing to review in this period. Every document in the register matched a 2B
            record, and the bank agrees with the books.
          </p>
        ) : (
          <ul className="border-t border-rule-strong">
            {shown.map((risk) => (
              <li key={risk.risk_id}>
                <button
                  type="button"
                  onClick={() => setSelected(risk)}
                  aria-current={selected?.risk_id === risk.risk_id}
                  className={`ruled flex w-full items-baseline gap-4 py-3 text-left transition-colors ${
                    selected?.risk_id === risk.risk_id ? "bg-sheet" : "hover:bg-sheet"
                  }`}
                >
                  <span
                    className={`mt-0.5 shrink-0 border px-1.5 py-0.5 text-micro font-medium ${severityTone(
                      risk.severity,
                    )}`}
                  >
                    {risk.severity}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm leading-snug">
                      {subject(risk)}
                    </span>
                    <span className="mt-0.5 block text-micro text-ink-soft">
                      {RULE_LABEL[risk.rule_code] ?? risk.title}
                    </span>
                    <span className="tabular mt-1 block font-mono text-micro leading-relaxed text-ink-faint">
                      {risk.calculation}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    {/* An amount is the thing a CA acts on; a percentage is
                        context. Where a finding has both, the money leads. */}
                    <span
                      className="tabular block text-sm font-medium"
                      title={risk.headline_amount ? inr(risk.headline_amount) : undefined}
                    >
                      {risk.headline_amount && risk.headline_amount !== "0.00"
                        ? inrShort(risk.headline_amount)
                        : pct(risk.headline_pct)}
                    </span>
                    {risk.headline_amount &&
                      risk.headline_amount !== "0.00" &&
                      risk.headline_pct && (
                        <span className="tabular mt-0.5 block text-micro text-ink-faint">
                          {pct(risk.headline_pct)}
                        </span>
                      )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selected ? (
        // Keyed on the finding: the panel holds per-finding state (the
        // recorded decision, the loaded source) and React would
        // otherwise reuse the instance, showing the previous
        // finding's decision against this one.
        <EvidencePanel
          key={selected.risk_id}
          risk={selected}
          onClose={() => setSelected(null)}
        />
      ) : (
        <PanelPlaceholder period={period} />
      )}
    </div>
  );
}

function FilterButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border px-2 py-1 text-micro ${
        active
          ? "border-ink bg-ink text-paper"
          : "border-rule text-ink-soft hover:border-ink hover:text-ink"
      }`}
    >
      {label} <span className="tabular opacity-70">{count}</span>
    </button>
  );
}
