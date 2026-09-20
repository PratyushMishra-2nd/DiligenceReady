import Link from "next/link";

/**
 * The masthead.
 *
 * A visitor has to learn what this is before they are shown anything else,
 * so the name and the one-line positioning sit at the top of the page in
 * that order, and the way in sits opposite them. This replaces the index
 * block the page used to open with, which told a stranger the sheet
 * reference and not the product.
 */
export function Masthead({ signIn }: { signIn: string }) {
  return (
    <header className="flex flex-wrap items-baseline justify-between gap-x-10 gap-y-4 border-b border-hairline py-6">
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
        <Link
          href="/product"
          className="wdth-tight font-anek text-[1.375rem] font-bold leading-none tracking-tight text-agreed"
        >
          DiligenceReady
        </Link>
        <p className="font-news text-ident text-graphite opsz-prose">
          Reconciliation for CA firms
        </p>
      </div>

      <nav className="flex items-center gap-7">
        <a
          href="#how"
          className="hidden font-mono text-stub uppercase text-graphite underline decoration-hairline underline-offset-4 hover:decoration-agreed sm:inline"
        >
          How it works
        </a>
        <a
          href="#proof"
          className="hidden font-mono text-stub uppercase text-graphite underline decoration-hairline underline-offset-4 hover:decoration-agreed sm:inline"
        >
          Proof
        </a>
        <Link
          href={signIn}
          className="border-2 border-books bg-books px-4 py-2 font-mono text-stub uppercase text-stock hover:bg-stock hover:text-books"
        >
          Open the demo
        </Link>
      </nav>
    </header>
  );
}
