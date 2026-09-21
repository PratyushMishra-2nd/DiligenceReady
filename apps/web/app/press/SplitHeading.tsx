"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A heading, seated one line at a time.
 *
 * This is what `@chenglou/pretext` is actually for, and it is worth being
 * precise about that because the library is easy to misuse. It is not an
 * animation library and it draws nothing: it is a line-breaking engine that
 * measures text through Canvas2D and `Intl.Segmenter`, so you can ask "where
 * will this break at width W" WITHOUT putting anything in the DOM and without
 * forcing a reflow to find out.
 *
 * That is exactly the problem here. To seat a headline line by line you need
 * to know where the browser will break it — and the usual way to find out is
 * to render it, measure the client rects, then re-render it split, which is
 * two layouts and a flash of the wrong thing. Pretext answers the question
 * before anything is painted.
 *
 * Two things it does not do, and a third this file has to work around:
 *
 *   It does not render. Every line below is a real DOM text node inside a
 *   real heading, so the text stays selectable, findable with Ctrl+F,
 *   indexable, and printable. Nothing is drawn to a canvas.
 *
 *   It does not split characters. Letter-by-letter reveals are the cheapest
 *   effect on the web and they wreck a screen reader; the unit here is a
 *   line, which is a unit a reader already perceives.
 *
 *   Its documented limitation is that the Canvas2D `font` shorthand cannot
 *   express `font-variation-settings`, `font-feature-settings` or optical
 *   sizing — so its measurements drift from the real face. Rather than a
 *   fudge factor, this calibrates: it lays the same string out in a hidden
 *   probe that inherits the true computed style, takes the ratio of measured
 *   to actual, and scales the width it asks pretext about by that.
 *
 * Every failure path lands on the unsplit heading the server already sent:
 * no `Intl.Segmenter`, no Canvas2D, a chunk that will not load, fonts that
 * never arrive, or reduced motion. The split is an enhancement of a heading
 * that is already correct.
 */
export function SplitHeading({
  text,
  className = "",
  as: Tag = "h1",
  delay = 0,
  scroll = false,
}: {
  text: string;
  className?: string;
  as?: "h1" | "h2";
  delay?: number;
  /**
   * Seat the lines as the heading is scrolled to rather than on load.
   *
   * The hero's heading is on screen when the page arrives, so it seats on a
   * clock. Every other heading is eight screens down, and animating it on
   * load means it has finished before the reader has any chance of seeing
   * it — which is how a measured line-breaking pass ends up buying a
   * flourish nobody watches. These run on a view timeline instead: the
   * lines are driven by where the heading is in the viewport, so the
   * stagger happens exactly when it is read, every time it is read.
   */
  scroll?: boolean;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  const [lines, setLines] = useState<string[] | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (typeof Intl === "undefined" || !("Segmenter" in Intl)) return;

    let cancelled = false;

    const measure = async () => {
      try {
        // Measuring before the real face has arrived measures the fallback,
        // and the fallback breaks in different places.
        await document.fonts.ready;
        const pretext = await import("@chenglou/pretext");
        if (cancelled || !ref.current) return;

        const el = ref.current;
        const cs = getComputedStyle(el);
        const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize}/${cs.lineHeight} ${cs.fontFamily}`;
        const letterSpacing = parseFloat(cs.letterSpacing) || 0;

        const prepared = pretext.prepareWithSegments(text, font, { letterSpacing });

        // Calibration. The face is set with tracking and optical sizing that
        // the canvas shorthand cannot carry, so ask the real element how wide
        // this string actually is and scale accordingly.
        const probe = document.createElement("span");
        probe.textContent = text;
        probe.style.cssText =
          "position:absolute;visibility:hidden;white-space:pre;left:-9999px;top:0";
        probe.style.font = cs.font || "";
        probe.style.fontFamily = cs.fontFamily;
        probe.style.fontSize = cs.fontSize;
        probe.style.fontWeight = cs.fontWeight;
        probe.style.letterSpacing = cs.letterSpacing;
        el.appendChild(probe);
        const actual = probe.getBoundingClientRect().width;
        probe.remove();

        const measured = pretext.measureNaturalWidth(prepared);
        const ratio = actual > 0 && measured > 0 ? measured / actual : 1;

        const width = el.getBoundingClientRect().width * ratio;
        const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
        const laid = pretext.layoutWithLines(prepared, width, lh);

        const out = laid.lines
          .map((l: { text?: string }) => l.text ?? "")
          .filter((t: string) => t.length > 0);

        // One line counts. Requiring two meant a short heading seated and a
        // long one did not, so half the headings on the page moved as the
        // reader reached them and half sat still — which reads as a bug
        // rather than as restraint.
        if (!cancelled && out.length >= 1 && out.join(" ").length >= text.length - 4) {
          setLines(out);
        }
      } catch {
        // The server-rendered heading stands.
      }
    };

    void measure();

    /* And measure again when the column changes width.
     *
     * The breaks are computed once for the width the heading happened to have
     * on mount, and they are not a suggestion — each line is its own box. Left
     * at that, a window resized narrower kept the wide layout's break points
     * and the text simply wrapped a second time INSIDE a box built to hold one
     * line: measured at 430px, the hero's first line box was 78px tall against
     * a 39px line height, so the clip that the reveal depends on was cutting a
     * heading in half.
     *
     * A `ResizeObserver` on the heading itself rather than a window listener,
     * because the thing that matters is the measure, and the measure can change
     * without the window doing anything. Debounced, because a drag fires this
     * continuously and each pass re-runs a layout. */
    let timer: number | undefined;
    const observer = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void measure(), 150);
    });
    observer.observe(el);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [text]);

  if (!lines) {
    return (
      <Tag ref={ref} className={className}>
        {text}
      </Tag>
    );
  }

  // The lines ARE the text — there is no second copy of the sentence
  // anywhere in here, and that is deliberate rather than incidental.
  //
  // The obvious way to write this is a visually-hidden span carrying the
  // whole sentence for screen readers plus `aria-hidden` visual lines. That
  // is exactly the defect this rewrite removed from `Opener`, one component
  // over: it puts the heading into `document.body.textContent` twice, so
  // Ctrl+F matches twice and every crawler and preview scraper reads the
  // sentence stuttered. An accessibility affordance that corrupts the
  // document's own text is not one.
  //
  // So each line is a real text node and the only one. The trailing space
  // rejoins them, because a line break in a layout is a word space in a
  // string — without it `textContent` reads "input taxcredit".
  return (
    <Tag ref={ref} className={className}>
      {/* `overflow-clip` on each line box, not `overflow-hidden`. `hidden`
          makes the box a scroll container, and a view timeline resolves
          against the nearest scrolling ancestor — so every line was
          measuring itself against its own 60px box, was always "fully in
          view", and sat pinned at 100% progress with the animation finished
          before it was ever on screen. `clip` clips without becoming a
          scroller. */}
      {lines.map((line, i) => (
        <span key={i} className="block overflow-clip">
          <span
            className={scroll ? "split-line-scroll block" : "split-line block"}
            style={
              scroll
                ? ({ "--i": i } as React.CSSProperties)
                : { animationDelay: `${delay + i * 90}ms` }
            }
          >
            {i < lines.length - 1 ? `${line.trimEnd()} ` : line.trimEnd()}
          </span>
        </span>
      ))}
    </Tag>
  );
}
