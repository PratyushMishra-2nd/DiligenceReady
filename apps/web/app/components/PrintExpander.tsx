"use client";

import { useEffect } from "react";

/**
 * A printed page of this product is a working paper that goes into a file and
 * gets defended at an assessment months later, so a section that was collapsed
 * on screen must not be absent from the paper.
 *
 * Doing that in CSS does not work reliably. `details > * { display: revert }`
 * reverts the `summary` to `list-item`, which reprints the disclosure
 * triangle, and a closed `details` does not suppress its children by a plain
 * `display: none` cascade in every engine. Setting the attribute is what the
 * spec actually defines, and `beforeprint` also covers Chrome's Save as PDF.
 */
export function PrintExpander() {
  useEffect(() => {
    const expand = () => {
      document.querySelectorAll("details").forEach((element) => {
        element.open = true;
      });
    };
    window.addEventListener("beforeprint", expand);
    return () => window.removeEventListener("beforeprint", expand);
  }, []);

  return null;
}
