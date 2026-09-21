"use client";

import { useEffect, useRef } from "react";

/**
 * The mobile Contents disclosure.
 *
 * Native `<details>` was the right call — no JavaScript to open it, works on
 * the first paint, no focus trap to get wrong — and it is one of the few
 * widgets the platform gives you outright. But a `<details>` that OVERLAYS
 * the page is not the case the element was designed for, and it is missing
 * two behaviours every reader expects from something that covers content:
 *
 *   Escape closes it. Native `<details>` does not, at any browser.
 *   Tapping outside closes it. Native `<details>` does not either.
 *
 * Measured before this existed: open the panel on a 390px screen, decide
 * against it, tap the page — and a 208x213px panel stays sitting over the
 * hero until you find the 14px word that opened it and hit it again.
 *
 * So the element stays native and this adds exactly the two listeners, and
 * only while the panel is actually open. Closing is `removeAttribute`, which
 * is the same thing the summary click does, so there is one state and the
 * browser owns it.
 *
 * The chevron matters more than it looks. The global stylesheet turns the
 * native marker off (`summary { list-style: none }`), and nothing replaced it
 * here — so the one disclosure on the site that is the SOLE wayfinding on
 * mobile was the one styled to look exactly like a text link, with no
 * indication it expands rather than navigates. `Faq.tsx` and
 * `Disclosure.tsx` both draw their own; this one did not. It rotates on
 * open, so it is the affordance and the state indicator in one mark.
 */
export function ContentsNav({ items }: { items: { href: string; label: string }[] }) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const details = ref.current;
    if (!details) return;

    const close = () => details.removeAttribute("open");

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !details.open) return;
      close();
      // Back to the control that opened it, or the reader is left with focus
      // on a panel that no longer exists.
      details.querySelector("summary")?.focus();
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!details.open) return;
      if (event.target instanceof Node && details.contains(event.target)) return;
      close();
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, []);

  return (
    <details ref={ref} className="no-print group relative lg:hidden">
      {/* Padded to a 24px minimum. It was 69x14px — a primary navigation
          control failing WCAG 2.5.8 by a factor of about 1.7, on the width
          where it is the only navigation there is. */}
      <summary className="flex cursor-pointer items-center gap-2 py-1.5 font-mono text-label-12 uppercase text-ink-muted underline decoration-hairline underline-offset-4 hover:decoration-ink">
        Contents
        <svg
          viewBox="0 0 8 10"
          aria-hidden
          className="h-2.5 w-2 shrink-0 text-ink-subtle transition-transform duration-200 group-open:rotate-90"
        >
          <path d="M2 1l5 4-5 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </summary>

      {/* `left-0`, not `right-0`. The positioning context is the summary,
          which is about seventy pixels of the word CONTENTS at the left of
          the nav — so a right-aligned panel hung its two hundred pixels off
          the left edge of a 390px screen and half the list was unreachable.
          It opens rightwards from the word instead. */}
      <ul className="absolute left-0 top-full z-50 mt-3 min-w-[13rem] border border-hairline bg-canvas py-1">
        {items.map(({ href, label }) => (
          <li key={href}>
            <a
              href={href}
              className="mark-verb block px-4 py-2.5 font-mono text-label-12 uppercase text-ink-muted hover:bg-sunken hover:text-ink"
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}
