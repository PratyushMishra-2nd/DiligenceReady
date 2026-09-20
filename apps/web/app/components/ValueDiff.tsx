import type { Risk } from "../lib/api";
import { changedCount, diffChars, type Run } from "../lib/diff";
import { inr } from "../lib/format";

/**
 * The two sides of a mismatch, with the characters that differ marked.
 *
 * This is the finding a CA actually has to resolve: the books and the portal
 * both hold a figure for the same document, and they disagree. The panel used
 * to print the subtraction and leave the reader to find where the two strings
 * part company — which, on a nine-character figure whose digits were
 * transposed, is the whole of the work.
 *
 * Marked in the highlighter yellow used for the target row of a source file,
 * not in vermillion: vermillion in this product means money at statutory risk,
 * and a differing digit is a discrepancy, not an exposure.
 */
export function ValueDiff({ risk }: { risk: Risk }) {
  const pair = comparable(risk);
  if (!pair) return null;

  const left = inr(pair.left);
  const right = inr(pair.right);
  const runs = diffChars(left, right);
  // The count is of positions that disagree, not of marks drawn: a
  // transposition marks two characters on each side and is two characters
  // wrong, not four.
  const changed = Math.max(changedCount(runs.left), changedCount(runs.right));
  if (changed === 0) return null;

  return (
    <section>
      <h3 className="mb-2 text-ident font-semibold text-graphite">Where they differ</h3>
      <dl className="space-y-1">
        <Line label={pair.leftLabel} runs={runs.left} />
        <Line label={pair.rightLabel} runs={runs.right} />
      </dl>
      <p className="mt-2 max-w-[56ch] text-ident leading-relaxed text-graphite-soft">
        {changed} character{changed === 1 ? "" : "s"} differ, marked above. The comparison
        is of the two figures as they are stored; nothing here was recomputed.
      </p>
    </section>
  );
}

function Line({ label, runs }: { label: string; runs: Run[] }) {
  return (
    <div className="flex items-baseline gap-4 text-ident">
      <dt className="w-[44%] shrink-0 text-graphite">{label}</dt>
      <dd className="tabular font-mono">
        {runs.map((run, index) =>
          run.changed ? (
            <mark key={index} className="bg-agreed-wash px-px font-semibold text-agreed">
              {run.text}
            </mark>
          ) : (
            <span key={index}>{run.text}</span>
          ),
        )}
      </dd>
    </div>
  );
}

/**
 * The pair of values a finding is a disagreement between, where it has one.
 *
 * Only R2 carries both sides today — the register's figure and the portal's
 * for a document they both hold. R1 is a document the portal does not have at
 * all, so there is no second string to compare it against, and inventing one
 * would be the interface asserting something the engine did not find.
 */
function comparable(risk: Risk) {
  const metrics = risk.metrics ?? {};
  if (risk.rule_code !== "R2") return null;
  const left = decimal(metrics.books_taxable);
  const right = decimal(metrics.portal_taxable);
  if (left === null || right === null) return null;
  return {
    left,
    right,
    leftLabel: "purchase register",
    rightLabel: "GSTR-2B",
  };
}

/**
 * A money field as the engine sent it. JSON has no decimal type, so a figure
 * arrives as a string when the API serialises it carefully and as a number
 * when it does not. Both are accepted; neither is rounded, and the two paise
 * places are restored rather than assumed.
 */
function decimal(value: unknown): string | null {
  if (typeof value === "string" && value.trim() !== "") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value.toFixed(2);
  return null;
}
