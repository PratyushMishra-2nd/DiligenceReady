"use client";

import { useEffect, useRef, useState } from "react";

import { api, type Risk, type RiskDetail, type SourceLine } from "../lib/api";
import { inr, periodLabel } from "../lib/format";
import { RiskDecision } from "./RiskDecision";
import { ValueDiff } from "./ValueDiff";

/**
 * The evidence card (§13), and the moment the demo stops being a slide.
 *
 * Three things stack here, in descending order of "would you bet money on
 * this": the arithmetic the engine performed, the seven parameters GSTN scores
 * a match on, and the raw file line that produced the figure. The model's
 * prose sits underneath all of them and is labelled as prose.
 */
export function EvidencePanel({
  risk,
  onClose,
  onStatusChange,
  canWrite = true,
}: {
  risk: Risk;
  onClose: () => void;
  onStatusChange?: (status: string, previous: string) => void;
  canWrite?: boolean;
}) {
  const panel = useRef<HTMLElement>(null);
  const [detail, setDetail] = useState<RiskDetail | null>(null);
  const [source, setSource] = useState<SourceLine | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [explanation, setExplanation] = useState<{
    text: string;
    source: "model" | "template" | "stored";
    model: string | null;
    reason: string | null;
  } | null>(null);

  useEffect(() => {
    let live = true;
    setDetail(null);
    setSource(null);
    setSourceError(null);
    setExplanation(
      risk.explanation
        ? // A stored explanation carries no record of how it was produced —
          // it could be model prose or the deterministic fallback — so it is
          // labelled as stored rather than claimed for the model.
          { text: risk.explanation, source: "stored", model: null, reason: null }
        : null,
    );

    api.riskDetail(risk.risk_id).then((loaded) => {
      if (!live) return;
      setDetail(loaded);
      const first = loaded.evidence.find((item) => item.source_row !== null);
      if (!first) return;
      api
        .evidenceSource(first.evidence_id)
        .then((line) => {
          if (!live) return;
          // A missing or renumbered document answers 200 with an `error`
          // and no context. Rendering it as a source would crash on the
          // undefined array; the whole point of the field is to say so.
          if (line.error || !line.context) {
            setSourceError(line.error ?? "The stored document could not be read.");
            return;
          }
          setSource(line);
        })
        .catch((error) => live && setSourceError(String(error)));
    });

    return () => {
      live = false;
    };
  }, [risk.risk_id, risk.explanation]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Escape dismisses one thing: the top one. With the command palette
      // open, closing the evidence underneath it as well loses the finding
      // the reader was on for a keystroke they aimed at the palette.
      if (document.querySelector('[role="dialog"]')) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Below `lg` this panel is not beside the list, it is after it — so on a
  // phone, tapping the thirty-seventh of sixty findings opened a panel three
  // thousand pixels down and moved the viewport nowhere at all. Taking focus
  // scrolls it into view, and it is also what a keyboard user needs: the
  // evidence for the finding they just activated, rather than the next row.
  useEffect(() => {
    panel.current?.focus();
  }, []);

  async function runExplain() {
    setExplaining(true);
    try {
      const result = await api.explain(risk.risk_id);
      setExplanation({
        text: result.explanation,
        source: result.source,
        model: result.model,
        reason: result.rejected_reason,
      });
    } finally {
      setExplaining(false);
    }
  }

  return (
    // `self-start` is load-bearing: a grid item stretches to the row's height
    // by default, so without it a short panel paints six hundred pixels of
    // empty sheet under itself and the sticky box has nothing to travel in.
    <aside
      ref={panel}
      tabIndex={-1}
      role="region"
      className="panel-in sticky top-0 min-w-0 max-h-screen self-start overflow-y-auto border-t border-rule-strong bg-sheet focus:outline-none lg:border-l lg:border-t-0"
      aria-label={`Evidence for ${risk.rule_code}`}
    >
      <div className="flex items-start justify-between gap-4 border-b border-rule px-6 py-4">
        <div>
          <p className="text-micro text-ink-soft">
            <span className="font-mono">{risk.rule_code}</span> · {risk.title}
          </p>
          <h2 className="mt-1 text-lede font-semibold">{risk.rule_text}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 border border-rule px-2 py-1 text-micro text-ink-soft hover:border-ink hover:text-ink"
        >
          Close
        </button>
      </div>

      <div className="space-y-8 px-6 py-6">
        <Block title="The arithmetic">
          <p className="tabular font-mono text-data leading-relaxed">{risk.calculation}</p>
          <p className="mt-2 text-micro text-ink-faint">
            A SQL aggregate over the match table. No model produced this figure.
          </p>
        </Block>

        <ValueDiff risk={risk} />

        {detail?.match && <MatchBlock match={detail.match} />}

        <Block title="Inputs">
          <dl className="space-y-1.5">
            {Object.entries(risk.metrics ?? {})
              .filter(([, value]) => value !== null && typeof value !== "object")
              .map(([key, value]) => (
                <div key={key} className="flex gap-4 text-data">
                  <dt className="w-[44%] shrink-0 text-ink-soft">{key.replace(/_/g, " ")}</dt>
                  <dd className="tabular font-mono break-all">{String(value)}</dd>
                </div>
              ))}
          </dl>
        </Block>

        {detail && detail.evidence.length > 0 && (
          <Block title="Evidence">
            <ul className="space-y-1.5">
              {detail.evidence.map((item) => (
                <li key={item.evidence_id} className="text-data">
                  <span className="text-ink-soft">{item.record_type.replace(/_/g, " ")}</span>
                  {item.note && <span className="ml-2 font-mono text-ink">{item.note}</span>}
                </li>
              ))}
            </ul>
          </Block>
        )}

        {source && <SourceView source={source} />}
        {sourceError && (
          <Block title="Source document">
            <p className="text-data text-exposure">
              The stored document could not be read: {sourceError}
            </p>
          </Block>
        )}

        <Block title="Your decision">
          <RiskDecision
            riskId={risk.risk_id}
            ruleCode={risk.rule_code}
            status={risk.status}
            canWrite={canWrite}
            onChange={onStatusChange}
          />
        </Block>

        <Block title="Explanation">
          {explanation ? (
            <>
              <p className="max-w-[60ch] text-data leading-relaxed">{explanation.text}</p>
              <p className="mt-2 text-micro text-ink-faint">
                {explanation.source === "model"
                  ? `Written by ${explanation.model ?? "the model"} from the finding above. Every figure it used was checked against the finding before this was shown.`
                  : explanation.source === "stored"
                    ? "Saved from an earlier run. Regenerate it to see how it was produced."
                    : `Generated from the finding without a model${explanation.reason ? ` — ${explanation.reason}` : ""}.`}
              </p>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={runExplain}
                disabled={explaining}
                className="border border-ink px-3 py-1.5 text-data font-medium hover:bg-ink hover:text-paper disabled:opacity-50"
              >
                {explaining ? "Writing…" : "Explain this finding"}
              </button>
              <p className="mt-2 max-w-[54ch] text-micro leading-relaxed text-ink-faint">
                The model is handed the finished finding — never a document, never a table.
                It writes the sentence. It cannot produce a number.
              </p>
            </>
          )}
        </Block>
      </div>
    </aside>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-micro font-semibold text-ink-soft">{title}</h3>
      {children}
    </section>
  );
}

function MatchBlock({ match }: { match: NonNullable<RiskDetail["match"]> }) {
  // A duplicate has no counterpart because another register row already took
  // it, not because scoring failed. A table of zeros would imply the second.
  if (match.status === "duplicate") {
    return (
      <Block title="Why there is no counterpart">
        <p className="max-w-[56ch] text-data leading-relaxed">
          One GSTR-2B record exists for this supplier and document number, and another
          row in the register already matched it. Matching is one-to-one, so this row is
          the second booking rather than a missing document.
        </p>
      </Block>
    );
  }

  const parts = match.score_breakdown ?? {};
  const weights: Record<string, number> = { gstin: 0.45, invno: 0.3, amount: 0.15, date: 0.1 };
  const labels: Record<string, string> = {
    gstin: "GSTIN",
    invno: "Document number",
    amount: "Amount",
    date: "Date",
  };

  return (
    <Block title="Match score">
      <table className="w-full text-data">
        <tbody>
          {Object.keys(weights).map((key) => {
            const component = Number(parts[key] ?? 0);
            const contribution = (component * weights[key]).toFixed(2);
            return (
              <tr key={key} className="border-b border-rule-hair last:border-0">
                <td className="py-1 text-ink-soft">{labels[key]}</td>
                <td className="tabular py-1 text-right font-mono">
                  {component === 1 ? "exact" : component === 0 ? "no candidate" : component.toFixed(2)}
                </td>
                <td className="tabular py-1 pl-4 text-right font-mono text-ink-faint">
                  {contribution}
                </td>
              </tr>
            );
          })}
          <tr>
            <td className="pt-2 font-medium">match_score</td>
            <td />
            <td className="tabular pt-2 pl-4 text-right font-mono font-medium">
              {match.match_score ?? "0.000"} → {match.match_method}
            </td>
          </tr>
        </tbody>
      </table>
      <p className="mt-2 max-w-[56ch] text-micro leading-relaxed text-ink-faint">
        A deterministic score, not a probability — which is why it is never called
        confidence, and why the components always ship with it.
      </p>
    </Block>
  );
}

function SourceView({ source }: { source: SourceLine }) {
  return (
    <section>
      <h3 className="mb-2 text-micro font-semibold text-ink-soft">Source document</h3>
      <p className="text-data">
        <span className="font-mono">{source.filename}</span>
        <span className="text-ink-soft"> · row </span>
        <span className="tabular font-mono">{source.source_row}</span>
      </p>
      <p className="mt-0.5 font-mono text-micro text-ink-faint">
        sha256 {source.sha256?.slice(0, 32)}…
      </p>

      <div className="mt-3 overflow-x-auto border border-rule bg-paper">
        <table className="w-max min-w-full border-collapse font-mono text-micro">
          <tbody>
            {source.header && (
              <tr className="border-b border-rule text-ink-faint">
                <td className="select-none border-r border-rule px-2 py-1 text-right">—</td>
                <td className="whitespace-pre px-3 py-1">{source.header}</td>
              </tr>
            )}
            {source.context.map((line) => (
              <tr
                key={line.row}
                className={line.is_target ? "bg-marked font-medium text-ink" : "text-ink-soft"}
              >
                <td className="tabular select-none border-r border-rule px-2 py-1 text-right text-ink-faint">
                  {line.row}
                </td>
                <td className="whitespace-pre px-3 py-1">{line.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function PanelPlaceholder({ period }: { period: string }) {
  return (
    <aside className="hidden border-l border-rule-strong bg-sheet lg:block">
      <div className="px-6 py-10">
        <p className="max-w-[34ch] text-body leading-relaxed text-ink-soft">
          Select a finding to see the arithmetic behind it, the records it came from, and
          the line of the original file that produced the figure.
        </p>
        <p className="mt-3 text-micro text-ink-faint">{periodLabel(period)}</p>
      </div>
    </aside>
  );
}
