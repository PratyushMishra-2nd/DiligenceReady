import Image from "next/image";

/**
 * A screen of the product, tipped in as a plate.
 *
 * The page described eight screens and showed none of them. Eight rows of
 * prose about surfaces a reader cannot see is the one place this document was
 * asking to be taken on trust, on a page whose entire argument is that nothing
 * here should be.
 *
 * These are not mockups and there is no browser chrome drawn around them. Each
 * is a screenshot of this application, signed in as the demo firm, on the data
 * the demo carries, cropped to the part being argued about and captioned with
 * the route it was taken on — so a reader can open the workspace and arrive at
 * the same pixels. A device frame would be a picture of a picture; a plate is
 * what a document puts a photograph in.
 *
 * `priority` is deliberately absent. Every plate is below the fold, and a page
 * whose largest contentful paint is a screenshot is a page that arrives late
 * on the connection a CA in a district town is reading it on.
 */
export const SCREENS = {
  dashboard: { src: "/screens/dashboard.png", width: 1090, height: 640 },
  readiness: { src: "/screens/readiness.png", width: 1370, height: 560 },
  findings: { src: "/screens/findings.png", width: 760, height: 540 },
  evidence: { src: "/screens/evidence.png", width: 600, height: 620 },
  ims: { src: "/screens/ims.png", width: 940, height: 300 },
} as const;

export function Plate({
  shot,
  alt,
  index,
  caption,
  sizes = "(min-width: 1024px) 1100px, 100vw",
}: {
  shot: keyof typeof SCREENS;
  alt: string;
  index: string;
  caption: string;
  sizes?: string;
}) {
  const { src, width, height } = SCREENS[shot];
  return (
    <figure className="min-w-0">
      {/* The plate sits on the sunk ground inside a hairline: a photograph
          pasted onto a working paper, not a card floating over one. No radius
          and no shadow — every surface in this product is square, and paper
          does not cast. */}
      {/* A mark verb. A plate is a thing pasted onto a working paper and
          it was the only object on the page a hand could rest on with no
          acknowledgement at all. The ground lifts; nothing scales, nothing
          lifts off the sheet, and no hue is introduced. */}
      {/* Below `md` the plate pans rather than shrinks.
       *
       * Measured at 390px: each plate rendered 324px wide from a screenshot
       * of a full desktop surface, which put its body text at three to four
       * pixels. That is a texture with a caption attached — and this file's
       * own docstring, and the landing page's, both say in as many words
       * that a plate nobody can read is the "take it on trust" the document
       * exists to refuse. The page was making that mistake on all five
       * plates, on the width most of its readers use.
       *
       * The honest fix is not to shrink it further or to crop it to a
       * region somebody guessed at. It is to let the reader move across the
       * sheet, which is what you do with a large document on a small desk:
       * the image holds a legible minimum width and the frame scrolls. The
       * caption still says what to look at, and nothing is hidden.
       *
       * `touch-action: pan-x pan-y` on the frame keeps vertical scrolling
       * with the page rather than trapping it inside, so a thumb travelling
       * down the document is never caught by a plate. It is set on the
       * scroll container — the first version put Tailwind's `touch-pan-x`
       * on the image instead, where it governs nothing, and the computed
       * value stayed `auto`. The comment was true of the intent and false
       * of the build. */}
      <div className="mark-verb overflow-x-auto border border-hairline bg-plate-ground p-2 [touch-action:pan-x_pan-y] hover:bg-sunk md:overflow-x-visible md:[touch-action:auto]">
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          sizes={sizes}
          className="block h-auto w-full min-w-[34rem] border border-hairline md:min-w-0"
        />
      </div>
      {/* The pan is an affordance only if something says so. The cut
          column at the right edge is a hint, not an instruction, and a
          reader who does not try it simply sees a cropped screenshot. Said
          once, in the caption's own register, and only at the width where
          it is true. */}
      <figcaption className="rag-pretty opsz-prose mt-3 max-w-[70ch] font-news text-ident leading-relaxed text-graphite">
        <span className="font-mono text-stub uppercase text-statute-deep">{index}</span>{" "}
        {caption}{" "}
        <span className="font-mono text-stub uppercase text-graphite-soft md:hidden">
          — drag the plate sideways to read across it
        </span>
      </figcaption>
    </figure>
  );
}
