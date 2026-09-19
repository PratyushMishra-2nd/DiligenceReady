"use client";

import { useState } from "react";

import { api } from "../lib/api";

/**
 * What the CA decided about a finding.
 *
 * §16's answer on liability is "you flag exceptions, the CA decides", and
 * that only means something if the decision can be recorded — otherwise the
 * tool is asking someone to keep its state in their head and then claiming
 * they were in control.
 *
 * The GST-specific states are Clear's own action set, so a CA moving from
 * that tool recognises them. Every change is written to the audit log with
 * who made it, which is the other half of "the CA decides": it has to be
 * attributable months later, when the assessment arrives.
 */

const GENERAL = [
  { value: "acknowledged", label: "Acknowledged", hint: "Seen, still to act on" },
  { value: "resolved", label: "Resolved", hint: "Dealt with; nothing further" },
  { value: "ignored", label: "Ignored", hint: "Deliberately not acting" },
];

const ITC = [
  { value: "claim", label: "Claim", hint: "Credit is available and will be taken" },
  { value: "reversed", label: "Reversed", hint: "Credit reversed for now" },
  { value: "ineligible", label: "Ineligible", hint: "Blocked, whatever the match says" },
  { value: "pending", label: "Pending", hint: "Held, to be availed later" },
];

export function RiskDecision({
  riskId,
  ruleCode,
  status,
  canWrite,
  onChange,
}: {
  riskId: string;
  ruleCode: string;
  status: string;
  canWrite: boolean;
  /** Reported to the list so the row shows it and the undo stack can take it back. */
  onChange?: (status: string, previous: string) => void;
}) {
  const [current, setCurrent] = useState(status);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The ITC states only make sense on a GST finding. Offering "ineligible"
  // on a bank variance would be noise at best and misleading at worst.
  const isCredit = ["R1", "R2", "R3", "R4", "R4b", "R13"].includes(ruleCode);
  const options = isCredit ? [...GENERAL, ...ITC] : GENERAL;

  async function choose(next: string) {
    const target = next === current ? "open" : next;
    setBusy(target);
    setError(null);
    try {
      const result = await api.setRiskStatus(riskId, target);
      setCurrent(result.status);
      onChange?.(result.status, result.previous);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not record that.");
    } finally {
      setBusy(null);
    }
  }

  if (!canWrite) {
    return (
      <p className="text-data text-ink-soft">
        Recorded as <span className="font-medium text-ink">{current}</span>. This account
        has read-only access.
      </p>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const active = current === option.value;
          return (
            <button
              key={option.value}
              type="button"
              title={option.hint}
              onClick={() => choose(option.value)}
              disabled={busy !== null}
              aria-pressed={active}
              className={`border px-2.5 py-1 text-micro transition-colors disabled:opacity-50 ${
                active
                  ? "border-ink bg-ink text-paper"
                  : "border-rule text-ink-soft hover:border-ink hover:text-ink"
              }`}
            >
              {busy === option.value ? "…" : option.label}
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-micro text-ink-faint">
        {current === "open"
          ? "No decision recorded yet."
          : `Recorded as ${current}. Click it again to reopen.`}{" "}
        Every change is written to the firm&rsquo;s audit trail with who made it.
      </p>

      {error && <p className="mt-2 text-micro text-exposure">{error}</p>}
    </div>
  );
}
