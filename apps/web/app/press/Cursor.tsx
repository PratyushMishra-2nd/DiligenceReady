"use client";

import { useEffect } from "react";

/**
 * The pointer, replaced.
 *
 * Two objects rather than one, because a single lagging blob is the tell of
 * every cheap custom cursor on the web: the dot tracks the hand exactly, so
 * pointing never feels rubbery, and the ring trails it on a spring, so the
 * gesture has weight. Precision where you need it, inertia where it reads.
 *
 * `mix-blend-mode: difference` is what stops it needing a colour: the cursor
 * inverts whatever it is over, so it is legible on paper, on the dark 16(4)
 * band, inside a screenshot and over vermillion without a single theme rule.
 *
 * It reacts to what it is over, and the reactions are the point:
 *   · over a button or link, the ring swells and fills;
 *   · over the pinned product surfaces, it becomes a crosshair — a reticle is
 *     what you inspect a figure with;
 *   · over text, it narrows to a caret so a reader knows it is selectable;
 *   · pressed, it contracts.
 *
 * Off entirely for touch and for coarse pointers, off under reduced motion,
 * and the real cursor is only hidden once this one is actually running — a
 * page that hides the system pointer and then fails to draw its own has taken
 * the pointer away from somebody.
 */
export function Cursor() {
  useEffect(() => {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const dot = document.createElement("div");
    const ring = document.createElement("div");
    dot.className = "cursor-dot";
    ring.className = "cursor-ring";
    dot.setAttribute("aria-hidden", "true");
    ring.setAttribute("aria-hidden", "true");
    document.body.append(ring, dot);
    document.documentElement.classList.add("has-cursor");

    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    let rx = x;
    let ry = y;
    let raf = 0;

    const move = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;

      // `e.target` is not always an Element — a pointer event dispatched on
      // `window`, or one landing on the document itself, has no `closest`,
      // and calling it there throws on every single move.
      const t = e.target;
      const el = t instanceof Element ? t : null;
      // A field is typed into, not pressed, so it reads as text rather than
      // as a control — and the native caret is restored over it in CSS.
      const typing = el?.closest("input, textarea, select, [contenteditable='true']");
      const interactive = !typing && el?.closest("a, button, summary, [role='button'], label");
      const inspectable = !typing && el?.closest("table, .surface-window, figure");
      const textual = typing ?? el?.closest("p, li, dd, dt, h1, h2, h3, blockquote");

      ring.dataset.state = interactive
        ? "press"
        : inspectable
          ? "inspect"
          : textual
            ? "read"
            : "idle";
    };

    const down = () => ring.setAttribute("data-down", "");
    const up = () => ring.removeAttribute("data-down");
    const leave = () => ring.setAttribute("data-out", "");
    const enter = () => ring.removeAttribute("data-out");

    const frame = () => {
      // The ring chases; the dot does not. 0.18 is the whole feel of it —
      // below about 0.12 it reads as lag rather than as weight.
      rx += (x - rx) * 0.18;
      ry += (y - ry) * 0.18;
      dot.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
      ring.style.transform = `translate3d(${rx}px, ${ry}px, 0) translate(-50%, -50%)`;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    document.addEventListener("pointerleave", leave);
    document.addEventListener("pointerenter", enter);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      document.removeEventListener("pointerleave", leave);
      document.removeEventListener("pointerenter", enter);
      document.documentElement.classList.remove("has-cursor");
      dot.remove();
      ring.remove();
    };
  }, []);

  return null;
}
