import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { API_BASE } from "./api";

/**
 * Server-side data fetching, with the caller's session attached.
 *
 * A server component runs on the Next process, not in the browser, so the
 * session cookie does not travel with its fetches automatically. It has to be
 * read from the incoming request and forwarded. Forgetting is not subtle —
 * every page 401s — but it is the kind of thing that gets patched with a
 * public endpoint rather than a forwarded cookie, so it lives in one function.
 *
 * URL resolution:
 *   In deployment, NEXT_PUBLIC_API_BASE is "" (empty) so browser calls go to
 *   the same Amplify origin and Next.js rewrites() proxy them to EC2.
 *   Server components cannot use relative URLs with Node fetch(), so we use
 *   NEXT_PUBLIC_API_UPSTREAM (the EC2 HTTP URL) when running server-side,
 *   falling back to API_BASE for local development.
 */

/**
 * The upstream URL for server-side API calls.
 *
 * In deployment: NEXT_PUBLIC_API_UPSTREAM = http://<ec2-dns>:8080
 * In local dev:  falls back to API_BASE (http://localhost:8077)
 *
 * This is NEXT_PUBLIC_ so it is available in both server and client bundles
 * at build time. Server components read it from process.env directly.
 */
// The localhost tail is a development convenience only. A production build
// cannot reach it: `apiUpstream()` in next.config.mjs throws when
// NEXT_PUBLIC_API_UPSTREAM is unset, so by the time this constant is baked
// into a deployed bundle the variable is set.
export const SERVER_API_BASE =
  process.env.NEXT_PUBLIC_API_UPSTREAM || API_BASE || "http://localhost:8077";

export class Unauthorized extends Error {}

export async function serverGet<T>(path: string): Promise<T> {
  const jar = await cookies();
  const session = jar.get("dr_session")?.value;

  const response = await fetch(`${SERVER_API_BASE}${path}`, {
    cache: "no-store",
    headers: session ? { cookie: `dr_session=${session}` } : {},
  });

  if (response.status === 401) {
    throw new Unauthorized(path);
  }
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}`);
  }
  return response.json() as Promise<T>;
}

/** Fetch, or send the person to the front door. Used by every page with data. */
export async function requireData<T>(path: string): Promise<T> {
  try {
    return await serverGet<T>(path);
  } catch (error) {
    if (error instanceof Unauthorized) {
      // The landing page, not the sign-in form.
      //
      // A request with no session is far more often a stranger than a CA
      // whose cookie lapsed, and this used to answer both of them with a
      // password box for a product it never named. The landing page is the
      // one surface that explains what the credentials would be for, and it
      // carries the way in; the form is one deliberate click from it.
      //
      // The destination the reader was reaching for is lost at this line, and
      // that is the price of the choice rather than an oversight: this
      // function is handed an API path, not the route someone typed, and
      // Next gives a server component no reliable read of its own URL. The
      // only honest `next` would be a guess. Where the destination genuinely
      // is knowable — the links on the landing page that point into the app —
      // it travels as `/sign-in?next=` and is honoured after the form.
      redirect("/");
    }
    throw error;
  }
}

/**
 * Whether the caller holds a session the engine still honours.
 *
 * Cookie presence is not the question, which is what this used to test. A
 * `dr_session` the API has since expired would pass that test, and the one
 * caller is the sign-in page deciding whether to skip itself — so trusting
 * the cookie sends a reader with a stale one to a page that bounces them
 * back, and the two pages pass them between each other forever. Asking the
 * engine costs a round trip on a page that is otherwise a form, and it is
 * what makes the answer true. Anything other than a clean 200 — no session,
 * dead session, engine unreachable — means show the form, which is the
 * failure everyone can recover from.
 */
export async function hasLiveSession(): Promise<boolean> {
  const jar = await cookies();
  if (!jar.get("dr_session")?.value) return false;
  try {
    await serverGet("/api/me");
    return true;
  } catch {
    return false;
  }
}
