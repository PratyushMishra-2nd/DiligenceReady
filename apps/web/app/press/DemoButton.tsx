"use client";

import { useRef } from "react";

/**
 * The one control on this page that matters, and the only one with a
 * behaviour of its own.
 *
 * Inside the button, the label is nudged a couple of pixels toward the
 * cursor. Two pixels is the whole effect — enough that a hand feels the
 * control reach back for it, small enough that nobody could say what
 * happened. It is off for touch, off under reduced motion, and the offsets
 * are written as custom properties from a pointer handler so React never
 * re-renders during the move.
 */

const STYLES = {
  primary:
    "magnetic rounded-chip border-2 border-books bg-books px-6 py-3 font-mono text-caption-13 uppercase tracking-[0.08em] text-plate-ink hover:bg-canvas hover:text-books",
  masthead:
    "magnetic rounded-chip border-2 border-books bg-books px-5 py-2.5 font-mono text-caption-13 uppercase tracking-[0.06em] text-plate-ink hover:bg-canvas hover:text-books",
  compact:
    "magnetic rounded-chip border-2 border-books bg-books px-4 py-2 font-mono text-label-12 uppercase text-plate-ink hover:bg-canvas hover:text-books",
  outline:
    "magnetic rounded-chip border-2 border-hairline px-6 py-3 font-mono text-caption-13 uppercase tracking-[0.08em] text-ink-muted hover:border-ink hover:text-ink",
  // On the inverted plate the inks swap: bone on black.
  plate:
    "magnetic rounded-chip border-2 border-plate-ink bg-plate-ink px-6 py-3 font-mono text-caption-13 uppercase tracking-[0.08em] text-plate hover:bg-transparent hover:text-plate-ink",
  // Inside a sentence, where a box would be a box in the middle of a
  // paragraph.
  link: "wipe-link text-ink press-verb hover:text-exposure-deep",
} as const;

export function DemoButton({
  variant = "primary",
  label = "Open the demo",
}: {
  variant?: keyof typeof STYLES;
  label?: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  const pull = (e: React.PointerEvent<HTMLButtonElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${((e.clientX - r.left) / r.width - 0.5) * 6}px`);
    el.style.setProperty("--my", `${((e.clientY - r.top) / r.height - 0.5) * 4}px`);
  };

  const release = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--mx", "0px");
    el.style.setProperty("--my", "0px");
  };

  return (
    <form action="/demo" method="post" className="contents">
      <button
        ref={ref}
        type="submit"
        onPointerMove={pull}
        onPointerLeave={release}
        className={STYLES[variant]}
      >
        {label}
      </button>
    </form>
  );
}
