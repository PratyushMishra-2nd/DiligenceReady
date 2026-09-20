"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { api, type Risk } from "../lib/api";
import {
  DOMAIN_CHIP,
  RULE_LABEL,
  docOf,
  inr,
  inrShort,
  pct,
  periodLabel,
  severityBar,
  supplierOf,
} from "../lib/format";
import { CommandPalette, type Command } from "./CommandPalette";
import { EvidencePanel, PanelPlaceholder } from "./EvidencePanel";

const SEVERITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2, info: 3 };

/** The three decisions every finding can take, and the keys that record them. */
const QUICK = [
  { key: "1", value: "acknowledged", label: "Acknowledged" },
  { key: "2", value: "resolved", label: "Resolved" },
  { key: "3", value: "ignored", label: "Ignored" },
];

type Undoable = { entries: { riskId: string; previous: string }[]; label: string };

export function Findings({
  risks,
  period,
  company,
  companyId,
  periods,
  companies,
  canWrite = true,
}: {
  risks: Risk[];
  period: string;
  company: string;
  companyId: string;
  periods: { period: string; gstr2b_generated: boolean; open_risks: number }[];
  companies: { company_id: string; name: string; gstin: string }[];
  canWrite?: boolean;
}) {
  const router = useRouter();
  const [domain, setDomain] = useState<string>("all");
  const [selected, setSelected] = useState<Risk | null>(null);

  // The recorded decision, held here as well as on the server, so a row shows
  // what was decided about it without a round trip and so a bulk write can be
  // taken back. The server remains the record; this is what is on screen
  // between the write and the next load.
  const [statuses, setStatuses] = useState<Record<string, string>>(() =>
    Object.fromEntries(risks.map((risk) => [risk.risk_id, risk.status])),
  );
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [lastMarked, setLastMarked] = useState<string | null>(null);
  const [undoable, setUndoable] = useState<Undoable | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showKeys, setShowKeys] = useState(false);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    setStatuses(Object.fromEntries(risks.map((risk) => [risk.risk_id, risk.status])));
    setMarked(new Set());
    setSelected(null);
  }, [risks]);

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

  /**
   * Record a decision, on the marked rows if there are any and on the row
   * under the cursor otherwise.
   *
   * The screen changes first and the writes follow. A CA working a list of
   * sixty makes a decision roughly every two seconds, and a round trip between
   * each one turns triage into waiting — but an optimistic write that cannot
   * be taken back is just a faster mistake, so every one of these is undoable
   * until the next is made.
   */
  const record = useCallback(
    async (status: string, targets: Risk[]) => {
      if (!canWrite || targets.length === 0 || busy) return;
      const entries = targets.map((risk) => ({
        riskId: risk.risk_id,
        previous: statuses[risk.risk_id] ?? risk.status,
      }));

      setBusy(true);
      setError(null);
      setStatuses((current) => {
        const next = { ...current };
        for (const risk of targets) next[risk.risk_id] = status;
        return next;
      });

      const results = await Promise.allSettled(
        targets.map((risk) => api.setRiskStatus(risk.risk_id, status)),
      );
      const failed = results.filter((result) => result.status === "rejected").length;

      if (failed > 0) {
        // Put back exactly what was there. A row that says "resolved" because
        // the write failed silently is the one outcome an audit trail cannot
        // survive.
        setStatuses((current) => {
          const next = { ...current };
          for (const entry of entries) next[entry.riskId] = entry.previous;
          return next;
        });
        setError(
          failed === targets.length
            ? "Nothing was recorded. The engine refused the change."
            : `${failed} of ${targets.length} could not be recorded, and those rows were put back.`,
        );
      } else {
        setUndoable({
          entries,
          label:
            targets.length === 1
              ? `Recorded as ${status}.`
              : `${targets.length} findings recorded as ${status}.`,
        });
        setMarked(new Set());
      }
      setBusy(false);
    },
    [busy, canWrite, statuses],
  );

  const undo = useCallback(async () => {
    if (!undoable || busy) return;
    const entries = undoable.entries;
    setBusy(true);
    setUndoable(null);
    setStatuses((current) => {
      const next = { ...current };
      for (const entry of entries) next[entry.riskId] = entry.previous;
      return next;
    });
    await Promise.allSettled(
      entries.map((entry) => api.setRiskStatus(entry.riskId, entry.previous)),
    );
    setBusy(false);
  }, [busy, undoable]);

  const move = useCallback(
    (delta: number) => {
      if (shown.length === 0) return;
      const index = selected ? shown.findIndex((risk) => risk.risk_id === selected.risk_id) : -1;
      const next = Math.max(0, Math.min(shown.length - 1, index + delta));
      const risk = shown[index === -1 ? 0 : next];
      setSelected(risk);
      rowRefs.current.get(risk.risk_id)?.scrollIntoView({ block: "nearest" });
    },
    [selected, shown],
  );

  const toggleMark = useCallback((riskId: string) => {
    setMarked((current) => {
      const next = new Set(current);
      if (next.has(riskId)) next.delete(riskId);
      else next.add(riskId);
      return next;
    });
    setLastMarked(riskId);
  }, []);

  // Triage is a keyboard job. j/k walk the list, the number keys record the
  // decision, x marks a row for a bulk one, and ctrl-z takes back whichever of
  // those was last.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const element = event.target as HTMLElement | null;
      if (
        element &&
        (element.tagName === "INPUT" ||
          element.tagName === "TEXTAREA" ||
          element.tagName === "SELECT" ||
          element.isContentEditable)
      ) {
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        void undo();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      switch (event.key) {
        case "j":
        case "ArrowDown":
          event.preventDefault();
          move(1);
          return;
        case "k":
        case "ArrowUp":
          event.preventDefault();
          move(-1);
          return;
        case "x":
          if (selected) {
            event.preventDefault();
            toggleMark(selected.risk_id);
          }
          return;
        case "?":
          event.preventDefault();
          setShowKeys((value) => !value);
          return;
        case "Escape":
          if (document.querySelector('[role="dialog"]')) return;
          if (marked.size > 0) {
            event.preventDefault();
            setMarked(new Set());
          }
          return;
        default:
          break;
      }

      const quick = QUICK.find((entry) => entry.key === event.key);
      if (quick) {
        const targets =
          marked.size > 0 ? shown.filter((risk) => marked.has(risk.risk_id)) : selected ? [selected] : [];
        if (targets.length > 0) {
          event.preventDefault();
          void record(quick.value, targets);
        }
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [marked, move, record, selected, shown, toggleMark, undo]);

  const commands = useMemo<Command[]>(() => {
    const items: Command[] = [];
    for (const risk of shown) {
      items.push({
        id: `risk-${risk.risk_id}`,
        group: "Findings in this period",
        label: supplierOf(risk),
        hint: docOf(risk) ?? RULE_LABEL[risk.rule_code] ?? risk.rule_code,
        keywords: `${risk.rule_code} ${risk.severity} ${RULE_LABEL[risk.rule_code] ?? ""}`,
        run: () => {
          setSelected(risk);
          rowRefs.current.get(risk.risk_id)?.scrollIntoView({ block: "center" });
        },
      });
    }
    for (const entry of periods) {
      items.push({
        id: `period-${entry.period}`,
        group: "Periods",
        label: periodLabel(entry.period),
        hint: entry.gstr2b_generated ? `${entry.open_risks} open` : "no 2B yet",
        run: () => router.push(`/app/companies/${companyId}?period=${entry.period}`),
      });
    }
    // The palette could reach every company except the page that lists them.
    // Sideways between clients was one keystroke and upward was a scroll to
    // the top of the document, which is the one move a reader working a list
    // of sixty findings is furthest from.
    items.push({
      id: "firm-dashboard",
      group: "Companies",
      label: "All client companies",
      hint: "the firm dashboard",
      keywords: "home up back firm dashboard",
      run: () => router.push("/app"),
    });
    for (const entry of companies) {
      items.push({
        id: `company-${entry.company_id}`,
        group: "Companies",
        label: entry.name,
        hint: entry.gstin,
        run: () => router.push(`/app/companies/${entry.company_id}`),
      });
    }
    items.push({
      id: "print",
      group: "This page",
      label: "Print this period as a working paper",
      hint: "⌘P",
      run: () => window.print(),
    });
    items.push({
      id: "keys",
      group: "This page",
      label: "Show keyboard shortcuts",
      hint: "?",
      run: () => setShowKeys(true),
    });
    return items;
  }, [companies, companyId, periods, router, shown]);

  const markedRisks = shown.filter((risk) => marked.has(risk.risk_id));

  return (
    <div className="grid min-w-0 gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(400px,44%)]">
      {/* A grid item defaults to min-width:auto and refuses to shrink below its
          content, which the monospace document numbers are wider than on a
          phone. min-w-0 is what lets the column narrow instead of pushing the
          page sideways. */}
      <div className="min-w-0 pr-0 lg:pr-8">
        {/* Sixty rows down, the company and the period have scrolled away, and
            the period is the one a reader is most likely to be wrong about
            because it was chosen for them. The header that was already here
            carries them rather than a second bar being added above it. */}
        <div className="sticky top-0 z-10 bg-stock pb-3 pt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <h2 className="text-ident font-semibold">
              {shown.length} finding{shown.length === 1 ? "" : "s"}
              <span className="ml-3 font-normal text-graphite">
                {company} · {periodLabel(period)}
              </span>
            </h2>
            <nav
              className="no-print flex w-full flex-wrap gap-1 sm:w-auto"
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
              <button
                type="button"
                onClick={() => setShowKeys((value) => !value)}
                aria-expanded={showKeys}
                className="border border-hairline px-2 py-1 text-ident text-graphite hover:border-agreed hover:text-agreed"
              >
                ⌘K · keys
              </button>
            </nav>
          </div>

          {showKeys && <Shortcuts />}
        </div>

        {shown.length === 0 ? (
          <p className="ruled py-8 text-prose text-graphite">
            Nothing to review in this period. Every document in the register matched a 2B
            record, and the bank agrees with the books.
          </p>
        ) : (
          <ul className="border-t border-graphite-soft">
            {shown.map((risk, index) => (
              <li key={risk.risk_id}>
                <FindingRow
                  risk={risk}
                  status={statuses[risk.risk_id] ?? risk.status}
                  selected={selected?.risk_id === risk.risk_id}
                  marked={marked.has(risk.risk_id)}
                  anyMarked={marked.size > 0}
                  register={(node) => {
                    if (node) rowRefs.current.set(risk.risk_id, node);
                    else rowRefs.current.delete(risk.risk_id);
                  }}
                  onSelect={(event) => {
                    // Shift extends the mark from the last one, the way every
                    // list of things anyone has ever bulk-actioned behaves.
                    if (event.shiftKey && lastMarked) {
                      event.preventDefault();
                      const from = shown.findIndex((entry) => entry.risk_id === lastMarked);
                      const [start, end] = from < index ? [from, index] : [index, from];
                      setMarked((current) => {
                        const next = new Set(current);
                        for (const entry of shown.slice(start, end + 1)) next.add(entry.risk_id);
                        return next;
                      });
                      return;
                    }
                    setSelected(risk);
                  }}
                  onToggleMark={() => toggleMark(risk.risk_id)}
                />
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
          risk={{ ...selected, status: statuses[selected.risk_id] ?? selected.status }}
          canWrite={canWrite}
          onStatusChange={(status, previous) => {
            setStatuses((current) => ({ ...current, [selected.risk_id]: status }));
            setUndoable({
              entries: [{ riskId: selected.risk_id, previous }],
              label: `Recorded as ${status}.`,
            });
          }}
          onClose={() => setSelected(null)}
        />
      ) : (
        <PanelPlaceholder period={period} />
      )}

      <CommandPalette commands={commands} />

      {markedRisks.length > 0 && (
        <BulkBar
          count={markedRisks.length}
          busy={busy}
          canWrite={canWrite}
          onClear={() => setMarked(new Set())}
          onRecord={(status) => void record(status, markedRisks)}
        />
      )}

      {undoable && markedRisks.length === 0 && (
        <Toast onDismiss={() => setUndoable(null)}>
          <span>{undoable.label}</span>
          <button
            type="button"
            onClick={() => void undo()}
            className="underline decoration-graphite-soft underline-offset-4 hover:decoration-stock"
          >
            Undo
          </button>
          <span className="text-graphite-soft">⌘Z</span>
        </Toast>
      )}

      {error && (
        <Toast onDismiss={() => setError(null)}>
          <span className="text-statute">{error}</span>
        </Toast>
      )}
    </div>
  );
}

/**
 * One finding, as a triage row.
 *
 * Two lines, not three. The engine's arithmetic used to be printed here as
 * well as in the panel it opens, which cost eighteen pixels on every row for a
 * string the reader would read once, in the panel, after deciding this was the
 * row worth opening. The list is for choosing; the panel is for checking.
 *
 * The document number has its own fixed column rather than being joined into
 * the subject line. It is the field that distinguishes two adjacent "booked
 * twice" rows, it used to be the first thing truncation destroyed, and in a
 * column of its own sixty of them align — which is how a transposed digit is
 * caught by scanning down rather than by reading across.
 */
function FindingRow({
  risk,
  status,
  selected,
  marked,
  anyMarked,
  register,
  onSelect,
  onToggleMark,
}: {
  risk: Risk;
  status: string;
  selected: boolean;
  marked: boolean;
  anyMarked: boolean;
  register: (node: HTMLButtonElement | null) => void;
  onSelect: (event: React.MouseEvent) => void;
  onToggleMark: () => void;
}) {
  const document = docOf(risk);
  const amount = risk.headline_amount && risk.headline_amount !== "0.00";

  return (
    <div
      className={`ruled group flex w-full items-stretch gap-3 transition-colors ${
        marked ? "bg-agreed-wash/50" : selected ? "bg-sunk" : "hover:bg-sunk"
      }`}
    >
      <span aria-hidden className={`shrink-0 self-stretch ${severityBar(risk.severity)}`} />

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onToggleMark();
        }}
        aria-pressed={marked}
        aria-label={`Mark ${supplierOf(risk)} for a bulk decision`}
        className={`no-print my-2 h-3.5 w-3.5 shrink-0 self-start border border-graphite-soft text-ident leading-none text-stock transition-opacity hover:border-agreed focus:opacity-100 group-hover:opacity-100 ${
          marked || anyMarked ? "opacity-100" : "opacity-0"
        }`}
        style={marked ? { background: "#1B2A2F", borderColor: "#1B2A2F" } : undefined}
      >
        {marked ? "✓" : ""}
      </button>

      <button
        ref={register}
        type="button"
        onClick={onSelect}
        aria-current={selected}
        className="min-w-0 flex-1 py-2 text-left"
      >
        <span className="sr-only">{risk.severity} severity</span>
        <span className="flex items-baseline gap-3">
          <span className="min-w-0 flex-1 truncate text-ident">{supplierOf(risk)}</span>

          {/* Never truncated, and hidden rather than clipped where there is no
              room for it — on a phone it moves to the line below. */}
          <span className="tabular hidden w-[18ch] shrink-0 break-all font-mono text-ident text-graphite sm:block">
            {document}
          </span>

          <span
            className="tabular shrink-0 text-ident font-medium"
            title={amount ? inr(risk.headline_amount as string) : undefined}
          >
            {amount ? inrShort(risk.headline_amount) : pct(risk.headline_pct)}
          </span>
        </span>

        <span className="mt-0.5 flex items-baseline gap-3 text-ident text-graphite">
          <span className="min-w-0 flex-1 truncate">
            {RULE_LABEL[risk.rule_code] ?? risk.title}
            {document && <span className="tabular ml-2 font-mono sm:hidden">{document}</span>}
            {status !== "open" && (
              <span className="ml-2 border border-hairline px-1 text-graphite">{status}</span>
            )}
          </span>
          {/* An amount is the thing a CA acts on; a percentage is context.
              Where a finding has both, the money leads and this trails it. */}
          {amount && risk.headline_pct && (
            <span className="tabular shrink-0 text-graphite-soft">{pct(risk.headline_pct)}</span>
          )}
        </span>
      </button>
    </div>
  );
}

/** The decision bar, which exists only while rows are marked. */
function BulkBar({
  count,
  busy,
  canWrite,
  onClear,
  onRecord,
}: {
  count: number;
  busy: boolean;
  canWrite: boolean;
  onClear: () => void;
  onRecord: (status: string) => void;
}) {
  return (
    <div className="no-print fixed inset-x-0 bottom-0 z-40 flex flex-wrap items-center justify-center gap-3 border-t border-agreed bg-agreed px-4 py-3 text-stock">
      <span className="tabular text-ident">
        {count} finding{count === 1 ? "" : "s"} marked
      </span>
      {canWrite ? (
        QUICK.map((entry) => (
          <button
            key={entry.value}
            type="button"
            disabled={busy}
            onClick={() => onRecord(entry.value)}
            className="border border-stock/40 px-3 py-1 text-ident hover:bg-stock hover:text-agreed disabled:opacity-50"
          >
            {entry.label} <span className="ml-1 opacity-60">{entry.key}</span>
          </button>
        ))
      ) : (
        <span className="text-ident opacity-70">This account has read-only access.</span>
      )}
      <button type="button" onClick={onClear} className="text-ident underline opacity-70">
        Clear
      </button>
    </div>
  );
}

function Toast({
  children,
  onDismiss,
}: {
  children: React.ReactNode;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 9000);
    return () => window.clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      role="status"
      className="no-print fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-4 border border-agreed bg-agreed px-4 py-2 text-ident text-stock"
    >
      {children}
    </div>
  );
}

function Shortcuts() {
  const keys: [string, string][] = [
    ["j / k", "move down and up the list"],
    ["1 / 2 / 3", "acknowledged · resolved · ignored"],
    ["x", "mark a finding for a bulk decision"],
    ["shift-click", "mark a range"],
    ["⌘Z", "undo the last decision"],
    ["⌘K or /", "go to any finding, period or company"],
    ["esc", "clear the marks, close the panel"],
  ];
  return (
    <dl className="mt-3 grid gap-x-6 gap-y-1 border border-hairline bg-sunk px-4 py-3 text-ident sm:grid-cols-2">
      {keys.map(([key, meaning]) => (
        <div key={key} className="flex items-baseline gap-3">
          <dt className="w-24 shrink-0 font-mono text-agreed">{key}</dt>
          <dd className="text-graphite">{meaning}</dd>
        </div>
      ))}
    </dl>
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
      className={`border px-2 py-1 text-ident ${
        active
          ? "border-agreed bg-agreed text-stock"
          : "border-hairline text-graphite hover:border-agreed hover:text-agreed"
      }`}
    >
      {label} <span className="tabular opacity-70">{count}</span>
    </button>
  );
}
