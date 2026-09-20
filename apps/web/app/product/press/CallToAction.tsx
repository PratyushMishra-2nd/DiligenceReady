import Link from "next/link";

/**
 * The close, on an inverted plate.
 *
 * The one place the page turns over. It is not a dark mode and it is not a
 * gradient: it is the same two inks printed on a black plate instead of a
 * bone one, at 16.8:1 and 10.8:1, which is the opposite of the washed-out
 * dark section this project is audited against.
 *
 * The demo credentials are on the page rather than behind a form. There is
 * nothing to capture here and a contact form would be a lie about what
 * happens next: the workspace is already loaded and the way in is a password
 * anyone can read.
 */
export function CallToAction({ signIn }: { signIn: string }) {
  return (
    <section className="-mx-6 mt-20 bg-plate px-6 py-20 text-stock sm:-mx-10 sm:px-10">
      <div className="grid gap-x-14 gap-y-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <div>
          <h2 className="wdth-tight max-w-[16ch] font-anek text-opener font-bold text-stock">
            Open it and look.
          </h2>
          <p className="opsz-deck mt-7 max-w-[44ch] font-news text-deck text-stock-soft">
            A demo firm is already signed up, carrying two client companies with twelve
            months of books, GST returns and bank statements behind each.
          </p>
          <p className="opsz-prose mt-6 max-w-[52ch] font-news text-prose text-stock-faint">
            The records are generated rather than real, and that is deliberate: it is the
            only way to know in advance what the engine is supposed to find, and therefore
            the only way to measure whether it found it.
          </p>

          <Link
            href={signIn}
            className="mt-10 inline-block border-2 border-stock bg-stock px-6 py-3 font-mono text-ident uppercase tracking-[0.08em] text-plate hover:bg-transparent hover:text-stock"
          >
            Open the live workspace
          </Link>
        </div>

        <div className="border border-stock-faint/40 p-6">
          <p className="font-mono text-stub uppercase text-stock-faint">Sign in as</p>
          <dl className="mt-4 space-y-4">
            <div>
              <dt className="font-mono text-stub uppercase text-stock-faint">Firm</dt>
              <dd className="wdth-set mt-1 font-anek text-[1.25rem] font-semibold text-stock">
                Mehta &amp; Associates
              </dd>
            </div>
            <div>
              <dt className="font-mono text-stub uppercase text-stock-faint">Email</dt>
              <dd className="mt-1 select-all break-all font-mono text-ident text-stock">
                ca@mehta.example
              </dd>
            </div>
            <div>
              <dt className="font-mono text-stub uppercase text-stock-faint">Password</dt>
              <dd className="mt-1 select-all break-all font-mono text-ident text-stock">
                b5Lsnz0Hcj2hXKtq3UX3c1GF
              </dd>
            </div>
          </dl>
          <p className="opsz-prose mt-6 font-news text-ident leading-relaxed text-stock-faint">
            A demo account on generated data. There is no self-service signup, because
            there is no self-service client data: a firm owner creates each account and
            every account belongs to exactly one firm.
          </p>
        </div>
      </div>
    </section>
  );
}
