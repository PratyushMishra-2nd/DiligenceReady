import { redirect } from "next/navigation";

import { destination } from "../lib/next-path";
import { hasLiveSession } from "../lib/session";
import { Aurora } from "../press/Aurora";
import { Masthead } from "../press/Masthead";
import { SignInForm } from "./SignInForm";

export const dynamic = "force-dynamic";

/**
 * The tab said "DiligenceReady: reconciliation for CA firms" — the landing
 * page's title, on the login page, because nothing here overrode the default
 * from the root layout. The template appends the brand, so this is the whole
 * fix.
 */
export const metadata = {
  title: "Sign in",
};

/**
 * Sign in.
 *
 * The page is now a gate rather than a form. Two reasons it has to be.
 *
 * The landing page is the front door — an unauthenticated request anywhere in
 * the app is sent there, not here — so the only way onto this route is a
 * reader choosing it, and a reader who already has a session chose it by
 * mistake. Showing them a password box for the account they are signed into
 * is the kind of dead end this whole pass exists to remove; they are sent
 * where they were going.
 *
 * And because the landing page's links into the app all come through here,
 * this is the one place that knows where someone was heading before they were
 * asked to identify themselves. `next` carries it across the form.
 */
export default async function SignInPage({
  searchParams,
}: {
  // Next hands every search param as `string | string[]`, because a query
  // string is allowed to repeat a key. Declaring it `string` here would be a
  // type that lies: `?next=/a&next=/b` arrives as an array and the first
  // string method called on it throws, on the login page of all routes.
  searchParams: {
    next?: string | string[];
    demo?: string | string[];
    failed?: string | string[];
  };
}) {
  const next = destination(searchParams.next);
  if (await hasLiveSession()) redirect(next);
  // `/demo` sends a reader here when the engine would not answer it, so the
  // form has to explain why they are looking at a password box they did not
  // ask for, and fill it in for them.
  const demo = searchParams.demo === "1";
  // Set by `submit/route.ts`, the path a reader takes when the form posted
  // without JavaScript. The page renders the sentence; the route only said
  // which of the two happened, because a `Location` is a URL and server prose
  // in one is prose quoted back into the page out of the address bar.
  const failed =
    searchParams.failed === "credentials" || searchParams.failed === "engine"
      ? searchParams.failed
      : null;

  return (
    <>
      {/* The same sheet as the landing page, not a second product.
          This page used to be a 432px column floating in five hundred pixels
          of unclaimed paper on either side, with no masthead, no lockup, no
          rules and no marks — a different design system reached in one click
          from the landing page. A reader who moves between the two should
          feel they turned a page, not opened a second product.

          The shell is here rather than in the form because the form is a
          client component: importing the masthead into it would pull the
          lockup and the demo button across the boundary with it, for markup
          that never changes after the first paint. */}
      <Aurora />
      <Masthead current="/sign-in" />

      <main className="mx-auto max-w-sheet px-6 sm:px-10">
        <section className="py-section md:py-section-md lg:py-section-lg">
          <div className="grid gap-x-block gap-y-6 lg:grid-cols-[220px_minmax(0,1fr)]">
            <div>
              <p className="font-mono text-label-12 uppercase text-ink-subtle">/sign-in</p>
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-12 gap-y-4">
                {/* In register, and that is the argument resolving rather
                    than a style. Every opener on the landing page is printed
                    a little out of true and closes towards zero down the
                    sheet; this is the sheet where the reader is identified,
                    so the impression has landed. */}
                <h1 className="text-ink">
                  <span className="rag-balance leading-trim font-sans text-head-1 font-semibold">
                    Sign in
                  </span>
                </h1>

              </div>

              <p className="rag-pretty mt-6 max-w-lede font-sans text-copy-19 text-ink-muted">
                {demo
                  ? "The engine did not answer, so this is the long way in. The demo account is filled in below."
                  : "Your firm’s workspace, and the client books inside it."}
              </p>

              {/* No measure cap here any more. The form sets its own, and
                  the demo block now sits in the column that cap used to
                  leave empty. */}
              <SignInForm next={next} demo={demo} failed={failed} />
            </div>
          </div>
        </section>

        {/* The same rule the landing page ends on, in the colour the two inks
            make together. */}
      </main>
    </>
  );
}

