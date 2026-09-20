import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/**
 * The tab icon: the traced mark, on paper.
 *
 * There was no icon at all, so every tab holding this product showed the
 * browser's blank sheet — on a product whose whole surface is about a document
 * having a mark against it.
 *
 * It is the filled vermillion square the working paper uses for "traced:
 * opened in the repository, at the file and line printed beside the claim",
 * sitting on the bone ground with the same hairline the page rules with.
 * A wordmark does not survive sixteen pixels; a square does, and it is already
 * this product's own symbol rather than a logo invented for a favicon.
 *
 * Drawn rather than drawn-in-a-file so it cannot drift from the palette: both
 * colours are the tokens from tailwind.config.ts, written out here because an
 * edge runtime has no Tailwind to ask.
 */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#F4F1E8",
        }}
      >
        <div style={{ width: 18, height: 18, background: "#C4291B" }} />
      </div>
    ),
    size,
  );
}
