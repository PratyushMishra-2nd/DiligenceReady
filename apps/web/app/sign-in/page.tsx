import { redirect } from "next/navigation";

import { hasLiveSession } from "../lib/session";
import { Masthead } from "../press/Masthead";
import { Misregister } from "../press/Misregister";
import { TickMark } from "../press/Sheet";
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
  searchParams: { next?: string | string[]; demo?: string | string[] };
}) {
  const next = destination(searchParams.next);
  if (await hasLiveSession()) redirect(next);
  // `/demo` sends a reader here when the engine would not answer it, so the
  // form has to explain why they are looking at a password box they did not
  // ask for, and fill it in for them.
  const demo = searchParams.demo === "1";

  return (
    <>
      {/* Sheet W-2 of the same working paper.
          This page used to be a 432px column floating in five hundred pixels
          of unclaimed paper on either side, with no masthead, no lockup, no
          rules and no marks — a different design system reached in one click
          from the landing page. A reader who moves between the two should
          feel they turned a page, not opened a second product.

          The shell is here rather than in the form because the form is a
          client component: importing the masthead into it would pull the
          lockup and the demo button across the boundary with it, for markup
          that never changes after the first paint. */}
      <Masthead />

      <main className="mx-auto max-w-[1280px] px-6 sm:px-10">
        <section className="sheet py-14">
          <div className="grid gap-x-10 gap-y-4 lg:grid-cols-paper">
            <div>
              {/* `stated` — how this is built and how it is sold, rather than
                  a figure out of the data. The legend on sheet W-1 defines
                  it, which is the point of having put one there. */}
              <TickMark mark="stated" />
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-12 gap-y-4">
                {/* In register, and that is the argument resolving rather
                    than a style. Every opener on the landing page is printed
                    a little out of true and closes towards zero down the
                    sheet; this is the sheet where the reader is identified,
                    so the impression has landed. */}
                <h1 className="text-agreed">
                  <span className="rag-balance wdth-tight optical-cap font-anek text-opener-tight font-bold">
                    Sign in
                  </span>
                </h1>

                <dl className="font-mono text-stub uppercase text-graphite">
                  <div className="flex justify-between gap-x-8 border-b border-hairline py-2">
                    <dt>Index</dt>
                    <dd className="text-agreed">W-2</dd>
                  </div>
                  <div className="flex justify-between gap-x-8 border-b border-hairline py-2">
                    <dt>Sheet</dt>
                    <dd className="text-agreed">Access</dd>
                  </div>
                </dl>
              </div>

              <p className="rag-pretty opsz-deck mt-6 max-w-[46ch] font-news text-[1.3rem] leading-snug text-agreed">
                {demo
                  ? "The engine did not answer, so this is the long way in. The demo account is filled in below."
                  : "Your firm’s workspace, and the client books inside it."}
              </p>

              <div className="max-w-[34rem]">
                <SignInForm next={next} demo={demo} />
              </div>
            </div>
          </div>
        </section>

        {/* The same rule the landing page ends on, in the colour the two inks
            make together. */}
        <Misregister slip={0} />
      </main>
    </>
  );
}

/**
 * Where to go after the form, from a parameter anyone can write.
 *
 * It ends up in `router.push`, so it is confined to a path inside this app.
 * One leading slash and not two: `//somewhere.example` is a protocol-relative
 * URL and the browser reads it as another origin, which is how an open
 * redirect on a login page becomes a phishing link that starts on the real
 * one. A backslash is rejected for the same reason — some browsers normalise
 * `/\evil.example` the same way.
 */
function destination(value: string | string[] | undefined): string {
  if (!value) return "/app";
  // A repeated `next` is nothing a link in this app produces, so it is either
  // a mangled URL or someone probing. Neither is owed a guess at which of the
  // two they meant; both get the dashboard.
  if (typeof value !== "string") return "/app";
  if (!value.startsWith("/")) return "/app";
  if (value.startsWith("//") || value.startsWith("/\\")) return "/app";
  return value;
}
