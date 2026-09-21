"use client";

import { useEffect } from "react";

/**
 * The running head, inverting over the dark plate.
 *
 * The masthead is a light scrim, and the Section 16(4) section is the one
 * inverted band on the site — so as the reader passes through it the header
 * was a pale bar sitting on a near-black ground, which is the one place the
 * chrome announced itself instead of getting out of the way.
 *
 * An observer watches every `.plate-section` against a sliver of viewport the
 * height of the header itself, and flips one attribute. The colours themselves
 * are a CSS concern; this only says which ground the header is currently over.
 */
export function MastheadTheme() {
  useEffect(() => {
    const header = document.querySelector<HTMLElement>(".masthead");
    const plates = Array.from(document.querySelectorAll(".plate-section"));
    if (!header || plates.length === 0) return;

    const over = new Set<Element>();
    let io: IntersectionObserver | undefined;

    // The band is derived from the viewport, so it has to be rebuilt when the
    // viewport changes. Computed once, a resize, an orientation change or a
    // mobile URL bar collapsing left the band the wrong height and the
    // inversion flipped early or late over the dark section.
    const build = () => {
      io?.disconnect();
      over.clear();
      io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) over.add(e.target);
            else over.delete(e.target);
          }
          header.toggleAttribute("data-over-dark", over.size > 0);
        },
        // A band the height of the header, pinned to the top of the viewport:
        // the header is over a plate exactly when a plate crosses that band.
        { rootMargin: `0px 0px -${Math.max(0, window.innerHeight - 72)}px 0px`, threshold: 0 },
      );
      for (const p of plates) io.observe(p);
    };

    build();

    let timer: number | undefined;
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(build, 150);
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", onResize);
      io?.disconnect();
    };
  }, []);

  return null;
}
