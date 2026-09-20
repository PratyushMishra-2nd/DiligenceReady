import { redirect } from "next/navigation";

import { hasLiveSession } from "../lib/session";
import { SignInForm } from "./SignInForm";

export const dynamic = "force-dynamic";

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
  searchParams: { next?: string | string[] };
}) {
  const next = destination(searchParams.next);
  if (await hasLiveSession()) redirect(next);
  return <SignInForm next={next} />;
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
  if (!value) return "/";
  // A repeated `next` is nothing a link in this app produces, so it is either
  // a mangled URL or someone probing. Neither is owed a guess at which of the
  // two they meant; both get the dashboard.
  if (typeof value !== "string") return "/";
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
}
