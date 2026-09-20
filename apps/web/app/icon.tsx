import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/**
 * The tab icon: two plates, out of register.
 *
 * There was no icon at all, so every tab holding this product showed the
 * browser's blank sheet — on a product whose whole surface is about a document
 * having a mark against it.
 *
 * The first version fixed that with a single filled vermillion square: the
 * working paper's "traced" mark, on the bone ground. It read correctly at the
 * size it was designed at and not at the size it is used at. At 16px in a tab
 * strip, a lone red square on cream is an unbranded red dot, and a red dot in
 * chrome is the shape browsers and operating systems use for an error badge.
 * The one mark in the product that says a claim was verified was being shown
 * at the size where it says something went wrong.
 *
 * This is the lockup instead — the same two plates the dividers down the page
 * are drawn from, and the same two bars the rupee sign is drawn from. Indigo,
 * vermillion offset below and to the right, and the region where they overlap
 * painted in the colour the two inks make. It survives sixteen pixels because
 * it is three rectangles, it is already this product's symbol rather than a
 * logo invented for a favicon, and at any size it is a registration error,
 * which is the entire argument.
 *
 * The overlap is painted rather than blended: `mix-blend-mode` is not in
 * Satori's supported subset, so the multiply is computed here instead.
 * `agreed` (#16080A) is `books` (#1D3461) times `statute` (#C4291B) channel by
 * channel, which is the same arithmetic the browser performs on the page, so
 * the result is identical and not an approximation.
 *
 * Drawn rather than drawn-in-a-file so it cannot drift from the palette: every
 * colour is a token from tailwind.config.ts, written out here because an edge
 * runtime has no Tailwind to ask.
 */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: "#F4F1E8",
        }}
      >
        {/* books */}
        <div
          style={{ position: "absolute", left: 5, top: 5, width: 15, height: 15, background: "#1D3461" }}
        />
        {/* statute, off register */}
        <div
          style={{ position: "absolute", left: 12, top: 12, width: 15, height: 15, background: "#C4291B" }}
        />
        {/* where the two impressions land on each other */}
        <div
          style={{ position: "absolute", left: 12, top: 12, width: 8, height: 8, background: "#16080A" }}
        />
      </div>
    ),
    size,
  );
}
