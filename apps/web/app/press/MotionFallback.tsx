"use client";

import { useEffect } from "react";

/**
 * The same motion, for browsers without scroll-driven animation.
 *
 * Every piece of scroll motion on this site is a native CSS scroll or view
 * timeline, which is the right way to build it: the work runs on the
 * compositor, there is no listener, and there is no JavaScript per frame.
 * It is also, today, Chrome and Edge only — Safari has it from 26 and Firefox
 * is still behind a flag.
 *
 * Which meant the honest state of this page was: in Chrome the headings seat,
 * the rules draw, the bars grow and the masthead hardens; in Firefox or an
 * older Safari every one of those `@supports` blocks fails and the page is
 * completely, silently static. Not degraded — inert. A reader there would
 * scroll the whole document and see nothing move at all.
 *
 * So this is the fallback, and it only exists where the real thing does not:
 * if the browser has view timelines, this component observes nothing and
 * returns. Where it does not, one IntersectionObserver adds `.is-in` as each
 * element arrives and the stylesheet runs the same keyframes off a transition
 * instead. The stagger is kept by turning each line's `--i` into a delay.
 *
 * It is one observer for the whole document rather than one per element, and
 * it unobserves on first intersection: the elements do not animate out, so
 * there is nothing to watch for afterwards.
 */
export function MotionFallback() {
  useEffect(() => {
    if (CSS.supports("animation-timeline", "view()")) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const root = document.documentElement;
    root.classList.add("no-timeline");

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }
      },
      // A little before the element is actually on screen, so it has arrived
      // by the time it is read rather than starting under the reader's eye.
      { rootMargin: "0px 0px -12% 0px", threshold: 0.01 },
    );

    /* Rescanned, not queried once.
     *
     * A single `querySelectorAll` at effect time returns a static list, and
     * two things on this page are not in the DOM yet when that runs:
     *
     *   The heading lines. `SplitHeading` renders the heading whole and only
     *   replaces it with per-line spans after `await document.fonts.ready`
     *   and `await import("@chenglou/pretext")` — both necessarily later than
     *   an effect. So zero `.split-line-scroll` nodes exist at mount, none
     *   were ever observed, and `.no-timeline .split-line-scroll` holds them
     *   at `opacity: 0`. On a browser without view timelines that is the hero
     *   and every section heading on the landing page, invisible for good.
     *   The same happens again on every resize, because the debounced
     *   re-measure swaps in fresh nodes.
     *
     *   Everything on a route this component did not mount for. It lives in
     *   the root layout, so its effect runs once per layout mount rather than
     *   per navigation — after a soft `next/link` back to `/`, `.no-timeline`
     *   is still set and nothing new is watched, so every section body and
     *   rule stays hidden.
     *
     * `observe` is idempotent, so rescanning is safe and cheap. */
    const scan = () => {
      for (const t of document.querySelectorAll(
        ".reveal, .split-line-scroll, .clock-bar, .sheet",
      )) {
        io.observe(t);
      }
    };

    scan();
    const mo = new MutationObserver(scan);
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      mo.disconnect();
      io.disconnect();
      root.classList.remove("no-timeline");
    };
  }, []);

  return null;
}
