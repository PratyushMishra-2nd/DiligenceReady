"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import aggregates from "../aggregates.json";
import { Population } from "../Population";

import { createScene, monthsOf, type Band, type Scene } from "./reconcile-gl";

/**
 * The population, reconciling.
 *
 * This is the one moving thing in the product, and it moves because the
 * section's subject is a process rather than a state. Every record of both
 * seeded companies falls into its register, and then everything that found a
 * counterpart settles and goes quiet, leaving the planted defects burning at
 * the rows they were actually planted in. That is what the engine does, at
 * the speed a reader scrolls.
 *
 * It is driven entirely by scroll position, so it never plays on its own and
 * never runs away from the reader. Scrolling back runs it backwards.
 *
 * Three ways it declines to run, each landing on the static figure that was
 * here before it, with the same data and the same figures:
 *
 *   - `prefers-reduced-motion`, checked before anything is allocated;
 *   - no WebGL2, which `createScene` reports by returning null;
 *   - no JavaScript at all, since the fallback is what the server renders and
 *     the canvas only ever replaces it on the client.
 *
 * Nothing is lost in any of those cases. The still picture makes the same
 * argument; the moving one only makes it in order.
 */

const ORDER = ["books", "gstr2b", "bank"] as const;

export function Reconcile() {
  const holder = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [live, setLive] = useState(false);
  const [month, setMonth] = useState(-1);
  const [bands, setBands] = useState<Band[]>([]);
  // The draw loop is created once and must not be torn down every time the
  // selection changes, so the chosen month is read through a ref rather than
  // captured in the effect's closure.
  const chosen = useRef(-1);
  const redraw = useRef<(() => void) | null>(null);

  const months = monthsOf(ORDER.map((key) => aggregates.registers[key]));

  const choose = useCallback((index: number) => {
    chosen.current = index;
    setMonth(index);
    redraw.current?.();
  }, []);

  useEffect(() => {
    const surface = canvas.current;
    const frame = holder.current;
    if (!surface || !frame) return;

    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (still.matches) return;

    const registers = ORDER.map((key) => aggregates.registers[key]);

    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = surface.getBoundingClientRect();
      surface.width = Math.max(Math.round(rect.width * dpr), 1);
      surface.height = Math.max(Math.round(rect.height * dpr), 1);
    };
    size();

    let scene: Scene | null = null;
    try {
      scene = createScene(surface, registers);
    } catch {
      scene = null;
    }
    if (!scene) return;

    setLive(true);

    // How far the reader has moved through the section. One number, and the
    // shader is a pure function of it.
    //
    // It starts counting when the section's top crosses the BOTTOM of the
    // viewport, not when it reaches the top. The first cut started at the
    // top, which meant the whole time the section was scrolling into view the
    // phase was still pinned at zero — so the canvas was on screen, at full
    // size, with every record still parked above the frame. Two screens of
    // blank paper where the best thing on the page should be, and invisible
    // to anyone who only ever scrolled through it at reading speed.
    //
    // Counting from entry means the registers are already filling as the
    // section arrives and are full by the time it pins, which leaves the
    // pinned scroll to do the part that matters: everything that reconciles
    // going quiet.
    const phaseNow = () => {
      const rect = frame.getBoundingClientRect();
      const view = window.innerHeight;
      const span = rect.height;
      if (span <= 0) return 1;
      return Math.min(Math.max((view - rect.top) / span, 0), 1);
    };

    let queued = 0;
    let last = -1;
    // Set when the selection changes, so a redraw happens even though the
    // scroll phase has not moved.
    let forced = false;
    const render = () => {
      queued = 0;
      const phase = phaseNow();
      // Redrawing a still picture sixty times a second is the usual way a
      // scroll-driven canvas costs a battery for nothing.
      if (Math.abs(phase - last) < 0.0005 && !forced) return;
      forced = false;
      last = phase;
      scene?.draw(phase, chosen.current);
    };
    const schedule = () => {
      if (queued) return;
      queued = requestAnimationFrame(render);
    };

    const onResize = () => {
      size();
      scene?.resize();
      if (scene) setBands(scene.bands());
      last = -1;
      schedule();
    };

    scene.draw(phaseNow(), chosen.current);
    setBands(scene.bands());

    redraw.current = () => {
      forced = true;
      schedule();
    };

    // One more measure after the first frame. Fonts land late and the
    // section's height moves with them, and a canvas sized against the
    // pre-swap layout is a canvas that is slightly wrong for the whole
    // session.
    const settleOnce = requestAnimationFrame(onResize);

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(settleOnce);
      if (queued) cancelAnimationFrame(queued);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", onResize);
      redraw.current = null;
      scene?.destroy();
    };
  }, []);

  const { totals, targets, cells_drawn: cells } = aggregates;
  const read =
    totals.purchase_register + totals.gstr2b_documents + totals.bank_statement;

  return (
    <div ref={holder} className="relative mt-10 h-[260vh]">
      <div className="sticky top-0 flex h-screen flex-col justify-center py-10">
        {/* The registers are named beside the bands themselves now, so this
            row carries only what the figure is and how much of it there is.
            It keeps one shape whether or not a month is selected: the picker
            sits on its own line beneath, rather than displacing the count to
            a second row when it appears. */}
        {/* The registers are named beside the bands themselves now, so this
            row carries only what the figure is and how much of it there is.
            It holds one shape whether or not a month is selected: the picker
            sits on its own line beneath, rather than displacing the count to
            a second row the moment it appears. */}
        <div className="flex items-baseline justify-between gap-x-6">
          <p className="font-mono text-stub uppercase text-graphite">
            Every record, three registers
          </p>
          <p className="tabular font-mono text-stub uppercase text-graphite">
            {read.toLocaleString("en-IN")} records
          </p>
        </div>

        {/* The month as a control rather than as something the picture
            performs. These are real buttons: the canvas is aria-hidden and
            carries no interaction of its own, so everything a reader can do
            here is reachable from the keyboard and has a name. Choosing a
            month prints it at full ink and drops the rest to ground, rather
            than hiding them — the denominator is the argument, and a filter
            that removes it answers a different question. */}
        {live && (
          <nav aria-label="Period" className="mt-3 flex flex-wrap gap-1">
            <MonthButton label="All" active={month < 0} onSelect={() => choose(-1)} />
            {months.map((name, index) => (
              <MonthButton
                key={name}
                label={shortMonth(name)}
                active={month === depthFor(index, months.length)}
                onSelect={() => choose(depthFor(index, months.length))}
              />
            ))}
          </nav>
        )}

        <div className="relative mt-4 min-h-0 flex-1">
          {/* The canvas is always in the layout, even before it is known to
              work. It cannot be hidden with `display: none` first and measured
              second: an element that is not displayed has no box, so it
              measured 1x1 and drew eleven thousand records into a single
              pixel. It is transparent until something is drawn into it, so
              leaving it in costs nothing. */}
          <canvas ref={canvas} aria-hidden className="h-full w-full" />

          {/* One stub per band, in the DOM rather than in the shader.
              The names used to sit in a single inline row above a figure
              made of three stacked blocks, so a reader could not tell which
              band was which without reading the caption — and the no-WebGL
              SVG fallback, which labels each band beside it, was the more
              legible of the two. This is that pattern ported to the canvas.
              Real text: selectable, findable, and not something a GPU has
              to draw. */}
          {live &&
            bands.map((band) => (
              <div
                key={band.label}
                className="pointer-events-none absolute left-0 right-0 flex items-baseline justify-between"
                style={{ top: band.top }}
              >
                <span className="bg-stock pr-2 font-mono text-stub uppercase text-graphite">
                  {band.label}
                </span>
                <span className="tabular bg-stock pl-2 font-mono text-stub text-graphite-soft">
                  {band.count.toLocaleString("en-IN")}
                </span>
              </div>
            ))}

          {/* The server renders this, and the canvas covers it only once it
              has proved it can draw. Anyone who never gets the canvas gets
              the whole argument, in the same figures. */}
          {!live && (
            <div className="absolute inset-0 overflow-hidden">
              <Population />
            </div>
          )}
        </div>

        <p className="opsz-prose mt-4 max-w-[76ch] font-news text-ident leading-relaxed text-graphite">
          Every record of both seeded companies across twelve periods:{" "}
          {totals.purchase_register.toLocaleString("en-IN")} purchase invoices,{" "}
          {totals.gstr2b_documents.toLocaleString("en-IN")} GSTR-2B documents and{" "}
          {totals.bank_statement.toLocaleString("en-IN")} bank lines. As you scroll they
          fall into their registers and everything that reconciles goes quiet.{" "}
          <span className="text-statute-deep">{cells} cells</span> stay lit: the{" "}
          {targets.row} planted defects that point at a record, each at the row it was
          planted in, plus the second row of each of the ten invoices booked twice. The
          remaining {targets.period} are a property of a month rather than of any row.
          GSTR-2B keeps none, because no planted defect targets a document the government
          filed.
        </p>
      </div>
    </div>
  );
}

/** A month's position in the year, matching what the shader was handed. */
function depthFor(index: number, count: number): number {
  return count > 1 ? index / (count - 1) : 0;
}

/** One period in the picker, sized so a thumb can hit it. */
function MonthButton({
  label,
  active,
  onSelect,
}: {
  label: string;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={`tabular min-h-[44px] border px-3 font-mono text-stub uppercase ${
        active
          ? "border-agreed bg-agreed text-stock"
          : "border-hairline text-graphite hover:border-agreed hover:text-agreed"
      }`}
    >
      {label}
    </button>
  );
}

/** "2026-08" as "Aug 26", the way the product writes a period everywhere else. */
function shortMonth(period: string): string {
  const names = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const [year, month] = period.split("-");
  return `${names[Number(month) - 1]} ${year.slice(2)}`;
}
