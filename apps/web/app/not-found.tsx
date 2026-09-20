import Link from "next/link";

/**
 * The dead end this app had no page for.
 *
 * Next's own 404 is a bare line of text on a white ground with no route off
 * it, and in this product it is not a rare screen: the company route calls
 * `notFound()` for an id the firm does not carry and for a company whose
 * periods are empty, and both of those land a signed-in CA on a page with no
 * way back to the list they came from.
 *
 * Two destinations, because there are two people who arrive here. Someone
 * with a session wants the list every company is reached from; someone
 * following a stale link from outside wants to know what they have opened.
 *
 * The first link is a plain `/` and not the `/sign-in?next=/` the landing
 * page uses, because the two pages have opposite readers. This one is almost
 * always reached from inside the app by someone already signed in, and for
 * them `/` is the dashboard directly. A stranger who reaches it is bounced
 * from `/` to the landing page, which is where a stranger should be — that
 * redirect is the front door working, not a click going nowhere.
 */
export default function NotFound() {
  return (
    <main className="mx-auto max-w-[70ch] px-6 py-24">
      <p className="font-mono text-stub uppercase tracking-[0.08em] text-graphite-soft">404</p>
      <h1 className="mt-2 text-intro font-semibold tracking-tight">
        Nothing is filed at that address
      </h1>
      {/* Said plainly, and said to be not an error. The engine-offline notice
          on the dashboard is the page for something having gone wrong, and a
          reader who confuses the two goes looking for a service to restart. */}
      <p className="mt-3 text-prose leading-relaxed text-graphite">
        Either the address is wrong, or the company it names is not one this firm carries.
        Nothing has failed: a page that does not exist is not a page that would not load.
      </p>
      <p className="mt-8 flex flex-wrap gap-x-8 gap-y-2 text-ident">
        <Link
          href="/"
          className="underline decoration-graphite-soft underline-offset-4 hover:decoration-agreed"
        >
          All client companies
        </Link>
        <Link
          href="/product"
          className="underline decoration-graphite-soft underline-offset-4 hover:decoration-agreed"
        >
          What this is
        </Link>
      </p>
    </main>
  );
}
