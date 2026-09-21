"use client";

import { useEffect, useRef, useState } from "react";

import { Overprint } from "./Overprint";

/**
 * A heading set the way a press sets one: a line at a time.
 *
 * Every heading on this page is one block of type with one registration
 * error applied to the whole of it. That is not what a sheet looks like.
 * A press pulls a line, the plate seats, the next line is pulled — and the
 * slip on line two is its own slip, not a copy of line one's. The document
 * has argued since the hero that it is two impressions converging, and it
 * has been printing that argument in a way no press could produce.
 *
 * To vary the register per line you have to know where the lines are, and
 * the browser will not tell you without being asked in a way that costs a
 * reflow — `getBoundingClientRect` on every line box of every heading, on
 * every resize, on a thirteen-thousand-pixel document. `@chenglou/pretext`
 * does the measuring itself, against the browser's own font engine, and
 * hands back the line boxes as arithmetic. That is the entire reason it is
 * a dependency: not an effect, a measurement.
 *
 * WHAT THIS DOES NOT DO. It does not render text to a canvas. Pretext can,
 * and on this page that would be a bad trade: canvas text is not selectable,
 * not findable, not readable by a screen reader, not indexable, invisible to
 * `forced-colors`, and — for a product whose output is a document somebody
 * files at an assessment — it does not print. Every character below is a
 * real text node in the DOM. Pretext is asked where the lines fall and
 * nothing else.
 *
 * AND IT DEGRADES. The server renders the heading whole, exactly as it did
 * before this file existed. The split happens after mount, and if pretext
 * throws, if the fonts have not loaded, or if the browser is missing
 * `Intl.Segmenter`, the whole heading stays as one block and keeps the
 * single slip it always had. Nothing on this page depends on this working.
 */

type Line = { text: string; width: number };

/**
 * The calibration, which is the one genuinely hard part.
 *
 * Pretext measures through the canvas `font` shorthand, and its README is
 * explicit that `font-optical-sizing`, `font-feature-settings` and
 * `font-variation-settings` are not expressible there. This page is built on
 * all three: Newsreader's `opsz` is set at forty-six call sites, `.tabular`
 * carries `"zero" 1`, and Anek's width axis — `font-stretch: 75%`, 82%, 88%
 * — is described in globals.css as the entire reason that typeface is here.
 * A heading set at `wdth-tight` renders about eighteen percent narrower than
 * the same string measured without it, so pretext would break lines early
 * and every heading would rag short.
 *
 * Rather than hard-code a fudge factor per class, this measures the error.
 * The same string is laid out once in a hidden span that inherits the real
 * element's computed style — so it gets the real axes, the real features and
 * the real optical size — and the ratio between that width and pretext's is
 * the correction. It is one measurement per heading per resize, it is
 * self-correcting for any combination of axes the design system grows later,
 * and it turns a documented limitation into a constant.
 */
function calibrate(probe: HTMLElement, pretextWidth: number): number {
  const real = probe.getBoundingClientRect().width;
  if (!Number.isFinite(real) || real <= 0 || pretextWidth <= 0) return 1;
  const ratio = real / pretextWidth;
  // A correction outside this range means something is wrong — the font has
  // not loaded, the probe is display:none, the string is empty. Take the
  // unsplit heading rather than a confidently wrong one.
  if (ratio < 0.5 || ratio > 1.6) return 1;
  return ratio;
}

export function Setting({
  text,
  slip,
  className = "",
  size,
  /** Milliseconds between one line seating and the next. Zero for no stagger. */
  stagger = 0,
}: {
  text: string;
  /** The section's place on the register ladder, as `Opener` computes it. */
  slip: number;
  className?: string;
  /** The ramp step's clamp, so the offsets stay a fraction of the letterform. */
  size: string;
  stagger?: number;
}) {
  const host = useRef<HTMLSpanElement>(null);
  const probe = useRef<HTMLSpanElement>(null);
  const [lines, setLines] = useState<Line[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function set() {
      const el = host.current;
      const ruler = probe.current;
      if (!el || !ruler) return;

      // Splitting before the webfont arrives measures Plex Sans and breaks
      // the lines for a typeface that is about to be replaced.
      try {
        await document.fonts.ready;
      } catch {
        /* Font Loading API absent: fall through and measure what is there. */
      }
      if (cancelled) return;

      let mod: typeof import("@chenglou/pretext");
      try {
        mod = await import("@chenglou/pretext");
      } catch {
        return; // Chunk did not arrive. The whole heading stays whole.
      }
      if (cancelled) return;

      const style = getComputedStyle(el);
      const width = el.getBoundingClientRect().width;
      if (width <= 0) return;

      // The canvas shorthand pretext measures through. Weight and size carry;
      // the axes do not, which is what `calibrate` is for.
      const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize}/${style.lineHeight} ${style.fontFamily}`;
      const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.1;

      try {
        const prepared = mod.prepareWithSegments(text, font, {
          letterSpacing: parseFloat(style.letterSpacing) || 0,
        });
        const ratio = calibrate(ruler, mod.measureNaturalWidth(prepared));
        const avail = width / ratio;

        // Balanced, not greedy — and this is the reason to have a measuring
        // engine rather than a splitter.
        //
        // Pretext breaks the way the browser's default does: fill a line,
        // start the next. On a heading that is the wrong algorithm and the
        // page already knew it, which is why every opener carries
        // `rag-balance` for `text-wrap: balance`. Splitting the heading into
        // real line boxes takes that away, and the answer key went from two
        // even lines to two long ones and an orphaned "two."
        //
        // So the balance is done here. Lay the text out at full width to
        // learn how many lines it needs, then binary-search the NARROWEST
        // width that still needs only that many, and break at that width
        // instead. The lines come out near-equal and the last one is never
        // a stub. That is the same thing `text-wrap: balance` does, except
        // this one also controls the result, and it can afford to because
        // each trial is `layout()` — pure arithmetic over cached widths, no
        // DOM, no reflow. Twelve trials cost less than one
        // `getBoundingClientRect`, which is the entire argument for this
        // dependency existing on this page.
        const target = mod.layout(prepared, avail, lineHeight).lineCount;
        let lo = 0;
        let hi = avail;
        for (let i = 0; i < 12; i += 1) {
          const mid = (lo + hi) / 2;
          if (mid <= 0) break;
          if (mod.layout(prepared, mid, lineHeight).lineCount <= target) hi = mid;
          else lo = mid;
        }
        const out = mod.layoutWithLines(prepared, hi, lineHeight);
        const got: Line[] = (out.lines ?? [])
          .map((l: { text: string; width: number }) => ({
            text: l.text,
            width: l.width * ratio,
          }))
          .filter((l) => l.text.trim().length > 0);
        // One line is the state this component was written to improve on, and
        // splitting into it changes the markup for no visual gain.
        if (!cancelled && got.length > 1) setLines(got);
      } catch {
        /* Measurement failed. The heading is already correct without us. */
      }
    }

    set();

    const observer = new ResizeObserver(() => {
      setLines(null);
      set();
    });
    if (host.current) observer.observe(host.current);

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [text, size]);

  const head = `rag-balance wdth-tight font-anek ${size} font-bold ${className}`;

  return (
    <>
      {/* The ruler. It inherits the heading's own class list, so it is
          measured with the width axis, the optical size and the feature
          settings actually applied — which is the whole point of it.

          `visibility: hidden`, not `display: none` and not a big negative
          offset. `display: none` has no box and therefore no width to read.
          The first cut parked it at `-200vw`, which is fine at 1440 and
          catastrophic at 390: two hundred viewport widths is only 780px
          there, the unwrapped heading is about 1500px long, and the ruler
          ran back onto the screen and printed itself over the real heading.
          Hidden visibility keeps the box, keeps the measurement, and cannot
          come back. */}
      <span
        ref={probe}
        aria-hidden
        className={`invisible pointer-events-none absolute left-0 top-0 max-w-none whitespace-pre ${head}`}
      >
        {text}
      </span>

      {lines ? (
        // Split. The accessible name is the whole sentence, said once, rather
        // than a line at a time with a pause where the press happened to
        // break — the line boxes are a printing fact, not a reading one.
        <span ref={host} className={`block ${head}`} role="text" aria-label={text}>
          {lines.map((line, index) => (
            <span
              key={`${index}-${line.text}`}
              aria-hidden
              className="block"
              style={
                {
                  // Each line seats after the one above it. The delay is the
                  // press taking the next pull, not a staggered entrance:
                  // without motion the lines are simply already seated.
                  "--set-delay": `${index * stagger}ms`,
                } as React.CSSProperties
              }
            >
              <Overprint
                className={`${stagger ? "sets-line" : ""} ${head}`}
                offset={lineOffset(slip, index, lines.length, size)}
                drop={lineDrop(slip, index, lines.length, size)}
              >
                {line.text}
              </Overprint>
            </span>
          ))}
        </span>
      ) : (
        <span ref={host} className={`block ${head}`}>
          <Overprint
            className={head}
            offset={lineOffset(slip, 0, 1, size)}
            drop={lineDrop(slip, 0, 1, size)}
          >
            {text}
          </Overprint>
        </span>
      )}
    </>
  );
}

/**
 * How far out of register a given line sits.
 *
 * The base is the section's rung on the ladder, at the 0.022em the hero
 * figure uses — the fraction this codebase already argues is where a slip
 * reads as two impressions rather than as an effect. What varies per line is
 * small on purpose: a press seats a little further into true with each pull,
 * so the first line of a heading is the loosest and the last is the closest,
 * over a range of about a quarter of the base value. Any more and the lines
 * stop looking like one heading.
 */
function lineOffset(slip: number, index: number, count: number, size: string): string {
  const ease = count > 1 ? 1.12 - (0.24 * index) / (count - 1) : 1;
  return `max(0.5px, calc(${(0.022 * slip * ease).toFixed(4)} * ${RAMP[size] ?? "1em"}))`;
}

function lineDrop(slip: number, index: number, count: number, size: string): string {
  const ease = count > 1 ? 1.12 - (0.24 * index) / (count - 1) : 1;
  return `max(0.3px, calc(${(0.013 * slip * ease).toFixed(4)} * ${RAMP[size] ?? "1em"}))`;
}

/**
 * Mirrors `fontSize.opener` and `fontSize["opener-tight"]` in
 * tailwind.config.ts, for the same reason `Sheet.tsx` does: `Overprint` puts
 * its ghosts in its own wrapper while the size class sits on the span inside
 * it, so an `em` written here resolves against an inherited 16px.
 */
const RAMP: Record<string, string> = {
  "text-opener": "clamp(56px, 8vw, 116px)",
  "text-opener-tight": "clamp(44px, 5.6vw, 84px)",
  "text-headline": "clamp(44px, 5.4vw, 84px)",
};
