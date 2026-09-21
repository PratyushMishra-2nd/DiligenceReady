"use client";

import { useEffect, useRef, useState } from "react";

import aggregates from "./aggregates.json";
import { inr } from "../lib/format";

/**
 * The one dark section on the site, and the only uncontested claim this
 * product owns.
 *
 * Every competitor in this market sells "claim 100% of your ITC". Not one of
 * them puts a date on the credit. Section 16(4) is the date, and this section
 * exists to make a statutory deadline feel like a deadline rather than like a
 * footnote — so it gets the full width, the inverted ground, and the only
 * ambient motion on the page.
 *
 * The timeline is built from the real findings: every one of the eighty-two
 * planted defects placed on the financial year it belongs to, sized by the
 * credit at stake. The months past the cut-off are drawn in exposure. Hovering
 * a month reads it out.
 */

type Defect = {
  period: string;
  amount: string;
  rule: string;
  company: string;
  target: string;
};

const MONTH = new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: "UTC" });
const LONG_DATE = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function daysUntil(iso: string): number {
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const [y, m, d] = iso.split("-").map(Number);
  return Math.max(0, Math.round((Date.UTC(y, m - 1, d) - today) / 86_400_000));
}

export function Clock() {
  const { headline } = aggregates;
  const deadline = headline.before_next_deadline.deadline;
  const daysLeft = daysUntil(deadline);

  const defects = aggregates.defects as Defect[];

  // Row-level findings only. The period-level ones are R7 concentration
  // spikes, whose `amount` is the turnover the spike was measured against —
  // about 4.8 crore — not credit at risk. Charting the two together put one
  // bar at full height and the other eleven at a hairline, which is a chart
  // that has been handed two different units and asked to pretend otherwise.
  const rowLevel = defects.filter((d) => d.target === "row");

  // Every month of the book, including the ones that came up clean. A period
  // with nothing wrong in it is a result, and dropping it leaves gaps in the
  // axis where a reader reasonably expects a month.
  const months: string[] = [];
  {
    const [y0, m0] = aggregates.period_from.split("-").map(Number);
    for (let i = 0; i < aggregates.periods; i += 1) {
      const d = new Date(Date.UTC(y0, m0 - 1 + i, 1));
      months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
    }
  }

  const byPeriod = months.map((p) => {
    const rows = rowLevel.filter((d) => d.period === p);
    const total = rows.reduce((n, d) => n + Number(d.amount), 0);
    return { period: p, count: rows.length, total };
  });

  // Square root, not linear. Credit at risk runs from a few thousand rupees to
  // a few lakh inside one year, and on a linear axis the small months are a
  // line of pixels. The root keeps the ordering exact and makes the quiet
  // months legible as quiet rather than as absent.
  const peak = Math.max(...byPeriod.map((p) => Math.sqrt(p.total)), 1);

  const [hover, setHover] = useState<number | null>(null);
  const shown = hover === null ? null : byPeriod[hover];

  const rootRef = useRef<HTMLElement>(null);

  // A light that follows the cursor across the plate. Written to a custom
  // property inside a rAF, so nothing re-renders and the paint stays on the
  // compositor.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    const move = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        el.style.setProperty("--px", `${((e.clientX - r.left) / r.width) * 100}%`);
        el.style.setProperty("--py", `${((e.clientY - r.top) / r.height) * 100}%`);
      });
    };
    el.addEventListener("pointermove", move);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointermove", move);
    };
  }, []);

  return (
    <section
      ref={rootRef}
      id="clock"
      className="plate-section clock relative isolate overflow-clip bg-plate px-6 py-section text-plate-ink sm:px-10 md:py-section-md lg:py-section-lg"
    >
      {/* Two ambient layers, both pure CSS: a slow aurora that drifts, and a
          pool of light under the cursor. Neither carries information, both are
          removed under reduced motion, and the section reads identically
          without them. */}
      <div aria-hidden className="clock-aurora no-print absolute inset-0 -z-10" />
      <div aria-hidden className="clock-spot no-print absolute inset-0 -z-10" />

      <div className="mx-auto max-w-sheet">
        <p className="font-mono text-label-12 uppercase text-exposure">
          Section 16(4) · the claim-by date
        </p>

        <h2 className="reveal rag-balance leading-trim mt-6 max-w-display font-sans text-display-2 font-medium">
          Two clocks run on every invoice.{" "}
          <span className="block text-plate-muted">We run both.</span>
        </h2>

        <div className="mt-block grid gap-x-block gap-y-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div>
            <p className="rag-pretty max-w-prose font-sans text-copy-19 text-plate-muted">
              Credit on an FY 2025-26 invoice has to be taken in a GSTR-3B for a period up to
              November 2026 — or on the date you file that client&rsquo;s GSTR-9, whichever is
              earlier. File the annual return in October and the window shuts in October.
            </p>
            <p className="rag-pretty mt-5 max-w-prose font-sans text-copy-17 text-plate-muted">
              And the second proviso to 16(2): if your client has not paid the supplier within
              180 days, the credit reverses with interest at 18%. Re-availment later carries no
              16(4) bar — <span className="text-plate-ink">the interest is not refundable.</span>{" "}
              We raise the invoice before day 180, not after.
            </p>
          </div>

          <div className="lg:justify-self-end">
            <p className="font-mono text-label-12 uppercase text-plate-muted">
              Closes {LONG_DATE.format(new Date(`${deadline}T00:00:00Z`))}
            </p>
            <p className="fig leading-trim mt-3 font-sans text-figure-1 font-semibold text-exposure">
              {inr(headline.before_next_deadline.amount)}
            </p>
            <p className="mt-3 flex items-baseline gap-3">
              <span className="fig font-sans text-head-2 font-semibold">{daysLeft}</span>
              <span className="font-mono text-label-12 uppercase text-plate-muted">days left</span>
            </p>
            <p className="mt-4 max-w-[38ch] font-sans text-copy-17 text-plate-muted">
              across{" "}
              <span className="fig text-plate-ink">
                {headline.before_next_deadline.defects}
              </span>{" "}
              findings. After that date the credit stops being a receivable and becomes your
              client&rsquo;s cost.
            </p>
          </div>
        </div>

        {/* The book, by month. Height is the credit at stake, and the bars
            past the cut-off are the ones that stop being claimable. */}
        <div className="mt-block border-t border-plate-hairline pt-8">
          <div className="flex items-baseline justify-between">
            <p className="font-mono text-label-12 uppercase text-plate-muted">
              Row-level findings by period · FY 2025-26 closes 30 Nov 2026
            </p>
            <p
              className="fig font-mono text-label-12 uppercase text-plate-ink"
              aria-live="polite"
            >
              {shown
                ? `${shown.period} · ${shown.count} findings · ${inr(String(shown.total.toFixed(2)))}`
                : `${aggregates.period_from} → ${aggregates.period_to}`}
            </p>
          </div>

          <div
            className="mt-5 flex h-40 items-end gap-1.5"
            onPointerLeave={() => setHover(null)}
          >
            {byPeriod.map((p, i) => {
              // FY 2025-26 runs to March 2026, and it is those invoices the
              // 30 November 2026 cut-off closes on. The months after it belong
              // to the next financial year and have their own, later date —
              // so they are not the ones in exposure here.
              const closing = p.period <= "2026-03";
              return (
                <button
                  key={p.period}
                  type="button"
                  onPointerEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  aria-label={`${p.period}: ${p.count} findings`}
                  className="group relative flex h-full flex-1 flex-col justify-end"
                >
                  <span
                    className={`clock-bar w-full rounded-t-[2px] transition-all duration-panel ease-press ${
                      closing ? "clock-bar--closing" : "clock-bar--quiet"
                    } ${hover === i ? "clock-bar--hot" : ""}`}
                    style={{
                      height: `${Math.max(2, (Math.sqrt(p.total) / peak) * 100)}%`,
                      animationDelay: `${i * 40}ms`,
                    }}
                  />
                  <span className="mt-2 block font-mono text-[10px] uppercase tracking-wider text-plate-muted">
                    {MONTH.format(new Date(`${p.period}-01T00:00:00Z`))}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-block flex flex-wrap items-center gap-x-8 gap-y-4 border-t border-plate-hairline pt-8">
          <a
            href="/tools/section-16-4"
            className="press-verb inline-flex items-center gap-2 rounded-chip bg-plate-ink px-6 py-3 font-mono text-label-12 uppercase text-plate hover:bg-exposure hover:text-plate-ink"
          >
            Date an invoice — free
            <span aria-hidden>&rarr;</span>
          </a>
          <p className="font-mono text-label-12 uppercase text-plate-muted">
            A date in, a statutory answer out. Nothing stored.
          </p>
        </div>
      </div>
    </section>
  );
}
