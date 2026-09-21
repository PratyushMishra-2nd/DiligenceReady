"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { periodLabel } from "../lib/format";

/**
 * Choosing which months this page is about.
 *
 * What was here before was a rail of chips, one per month, and it could only
 * ever say one thing: *this* month. That answers "how was August", which is a
 * question a CA asks on the 20th of September and then stops asking. It
 * cannot answer "how much credit have we lost this financial year", "what did
 * the last quarter cost", or "is this client getting better" — and those are
 * the questions a partner asks about a client rather than about a return.
 *
 * Three decisions worth stating, because each one is a thing that goes wrong
 * in range pickers:
 *
 * 1.  **Months, not days.** GST is filed monthly and a GSTR-2B is generated
 *     monthly, so a day picker would offer a precision no figure on this page
 *     has. Picking the 14th of August would still return August.
 * 2.  **Apply on Apply.** Changing `from` while `to` is still the old value
 *     briefly describes a range nobody asked for, and on a server-rendered
 *     page each of those is a round trip. Nothing navigates until the button
 *     is pressed — the one exception being the presets, which are complete
 *     ranges by construction and so apply on click.
 * 3.  **Only months this company has.** The presets are computed from the
 *     calendar and then clamped to the periods that exist, and one that
 *     clamps to nothing is disabled rather than offered. "This FY" on a
 *     client whose books start in November is otherwise a button whose whole
 *     function is to produce an empty page.
 *
 * The financial year is April to March, so "This FY" is not the calendar year
 * and never January.
 */

type Period = { period: string; gstr2b_generated: boolean };

/** '2026-08' as a sortable integer, for arithmetic no Date object should do. */
function index(period: string): number {
  const [year, month] = period.split("-").map(Number);
  return year * 12 + (month - 1);
}

function fromIndex(value: number): string {
  return `${String(Math.floor(value / 12)).padStart(4, "0")}-${String((value % 12) + 1).padStart(2, "0")}`;
}

/**
 * The month a preset counts back from.
 *
 * Not today's month. A 2B for month M generates on the 14th of M+1, so on any
 * day in September the newest month with anything in it is August — and a
 * "last 3 months" anchored on September would spend a third of its window on
 * a month that cannot have reconciled yet. The anchor is the newest month
 * this company actually has.
 */
function anchorOf(periods: Period[]): string | null {
  if (periods.length === 0) return null;
  const reconciled = periods.find((entry) => entry.gstr2b_generated);
  return (reconciled ?? periods[0]).period;
}

/** The April this month's financial year began in. */
function fyStart(period: string): string {
  const [year, month] = period.split("-").map(Number);
  return `${month >= 4 ? year : year - 1}-04`;
}

type Preset = { key: string; label: string; from: string; to: string };

function presetsFor(periods: Period[]): Preset[] {
  const anchor = anchorOf(periods);
  if (!anchor) return [];

  const newest = periods[0].period;
  const oldest = periods[periods.length - 1].period;
  const back = (months: number) => fromIndex(index(anchor) - (months - 1));

  const candidates: Preset[] = [
    { key: "month", label: "Latest month", from: anchor, to: anchor },
    { key: "quarter", label: "Last 3 months", from: back(3), to: anchor },
    { key: "half", label: "Last 6 months", from: back(6), to: anchor },
    { key: "fy", label: "This FY", from: fyStart(anchor), to: anchor },
    { key: "all", label: "All", from: oldest, to: newest },
  ];

  // Clamped to what exists, then dropped if the clamp emptied it. A preset
  // that resolves to a window this client has no months in is a button that
  // produces a blank page, which is worse than one that is not there.
  return candidates
    .map((preset) => ({
      ...preset,
      from: preset.from < oldest ? oldest : preset.from,
      to: preset.to > newest ? newest : preset.to,
    }))
    .filter((preset) => preset.from <= preset.to);
}

export function PeriodRange({
  companyId,
  periods,
  from,
  to,
}: {
  companyId: string;
  /** Newest first, as the API returns them. */
  periods: Period[];
  from: string;
  to: string;
}) {
  const router = useRouter();
  const [start, setStart] = useState(from);
  const [end, setEnd] = useState(to);
  const [open, setOpen] = useState(false);

  // The URL is the source of truth: a back button, a command-palette jump or
  // a shared link all change the range without this component being told, and
  // a picker still showing the old months is a picker that lies.
  useEffect(() => {
    setStart(from);
    setEnd(to);
  }, [from, to]);

  const presets = presetsFor(periods);
  const dirty = start !== from || end !== to;
  const invalid = start > end;

  function go(nextFrom: string, nextTo: string) {
    setOpen(false);
    // A single month keeps the older, shorter URL. It is the link people
    // paste, `?period=` is what every other route in this app already builds,
    // and `?from=X&to=X` would be a second spelling of the same page.
    const query =
      nextFrom === nextTo
        ? `period=${nextFrom}`
        : `from=${nextFrom}&to=${nextTo}`;
    router.push(`/app/companies/${companyId}?${query}`);
  }

  const spanLabel =
    from === to
      ? periodLabel(from)
      : `${periodLabel(from, true)} — ${periodLabel(to, true)}`;
  const months = index(to) - index(from) + 1;

  return (
    <div className="no-print relative">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex items-center gap-2 border border-hairline px-3 py-1.5 text-caption-13 text-ink-muted press-verb hover:border-ink hover:text-ink"
      >
        <span className="font-mono text-label-12 uppercase tracking-[0.06em] text-ink-subtle">
          Period
        </span>
        <span className="fig font-medium text-ink">{spanLabel}</span>
        {months > 1 && (
          <span className="fig text-ink-subtle">{months} months</span>
        )}
        <svg viewBox="0 0 10 6" aria-hidden className="h-1.5 w-2.5 text-ink-subtle">
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Choose a period or a range"
          className="absolute right-0 z-40 mt-1 w-[22rem] border border-ink-subtle bg-canvas p-4 shadow-[0_2px_16px_rgba(0,0,0,0.12)]"
        >
          <div className="flex flex-wrap gap-1.5">
            {presets.map((preset) => {
              const active = preset.from === from && preset.to === to;
              return (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => go(preset.from, preset.to)}
                  className={`border px-2 py-1 text-caption-13 press-verb ${
                    active
                      ? "border-ink bg-ink text-plate-ink"
                      : "border-hairline text-ink-muted hover:border-ink hover:text-ink"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <MonthField
              label="From"
              value={start}
              periods={periods}
              onChange={setStart}
            />
            <MonthField label="To" value={end} periods={periods} onChange={setEnd} />
          </div>

          {/* Said rather than prevented. Disabling the later month's options
              on the earlier one's value means a reader who picks the ends in
              the other order finds half the list missing and no reason given. */}
          {invalid && (
            <p role="alert" className="mt-3 text-caption-13 text-exposure">
              {periodLabel(start, true)} is after {periodLabel(end, true)}.
            </p>
          )}

          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                setStart(from);
                setEnd(to);
              }}
              disabled={!dirty}
              className="text-caption-13 text-ink-muted mark-verb underline decoration-hairline underline-offset-4 hover:decoration-ink disabled:text-ink-subtle disabled:no-underline"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => go(start, end)}
              disabled={!dirty || invalid}
              className="border-2 border-books bg-books px-4 py-1.5 font-mono text-label-12 uppercase tracking-[0.06em] text-plate-ink press-verb hover:bg-canvas hover:text-books disabled:border-ink-subtle disabled:bg-transparent disabled:text-ink-subtle"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * One end of the range, as a list of the months this company has.
 *
 * A `<select>` rather than `<input type="month">`: the native control offers
 * every month since the Gregorian calendar, and all but a dozen of them
 * return an empty page here. The dot marks a month whose GSTR-2B has
 * generated, which is the only kind that can have reconciled.
 */
function MonthField({
  label,
  value,
  periods,
  onChange,
}: {
  label: string;
  value: string;
  periods: Period[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="font-mono text-label-12 uppercase tracking-[0.06em] text-ink-muted">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="fig mt-1 w-full border border-ink-subtle bg-sunken px-2 py-1.5 text-caption-13 focus:border-ink"
      >
        {periods.map((entry) => (
          <option key={entry.period} value={entry.period}>
            {periodLabel(entry.period)}
            {entry.gstr2b_generated ? "" : " · no 2B"}
          </option>
        ))}
      </select>
    </label>
  );
}
