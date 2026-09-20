"use client";

import { useEffect, useRef, useState } from "react";

import aggregates from "../aggregates.json";
import { Population } from "../Population";

import { createScene, type Scene } from "./reconcile-gl";

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

    // How far the reader has moved through the section, from the moment its
    // top reaches the bottom of the viewport to the moment its foot leaves
    // the top. One number, and the shader is a pure function of it.
    const phaseNow = () => {
      const rect = frame.getBoundingClientRect();
      const travel = rect.height - window.innerHeight;
      if (travel <= 0) return 1;
      return Math.min(Math.max(-rect.top / travel, 0), 1);
    };

    let queued = 0;
    let last = -1;
    const render = () => {
      queued = 0;
      const phase = phaseNow();
      // Redrawing a still picture sixty times a second is the usual way a
      // scroll-driven canvas costs a battery for nothing.
      if (Math.abs(phase - last) < 0.0005) return;
      last = phase;
      scene?.draw(phase);
    };
    const schedule = () => {
      if (queued) return;
      queued = requestAnimationFrame(render);
    };

    const onResize = () => {
      size();
      scene?.resize();
      last = -1;
      schedule();
    };

    scene.draw(phaseNow());

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
      scene?.destroy();
    };
  }, []);

  const { totals, targets, cells_drawn: cells } = aggregates;
  const read =
    totals.purchase_register + totals.gstr2b_documents + totals.bank_statement;

  return (
    <div ref={holder} className="relative mt-10 h-[260vh]">
      <div className="sticky top-0 flex h-screen flex-col justify-center py-10">
        <div className="flex items-baseline justify-between gap-6">
          <p className="font-mono text-stub uppercase text-graphite">
            Books · GSTR-2B · Bank
          </p>
          <p className="tabular font-mono text-stub uppercase text-graphite">
            {read.toLocaleString("en-IN")} records
          </p>
        </div>

        <div className="relative mt-4 min-h-0 flex-1">
          {/* The canvas is always in the layout, even before it is known to
              work. It cannot be hidden with `display: none` first and measured
              second: an element that is not displayed has no box, so it
              measured 1x1 and drew eleven thousand records into a single
              pixel. It is transparent until something is drawn into it, so
              leaving it in costs nothing. */}
          <canvas ref={canvas} aria-hidden className="h-full w-full" />

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
