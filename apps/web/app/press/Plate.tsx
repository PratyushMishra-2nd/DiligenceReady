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
      <div className="border border-hairline bg-plate-ground p-2">
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          sizes={sizes}
          className="block h-auto w-full border border-hairline"
        />
      </div>
      <figcaption className="rag-pretty opsz-prose mt-3 max-w-[70ch] font-news text-ident leading-relaxed text-graphite">
        <span className="font-mono text-stub uppercase text-statute-deep">{index}</span>{" "}
        {caption}
      </figcaption>
    </figure>
  );
}
