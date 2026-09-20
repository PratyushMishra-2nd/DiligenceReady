/**
 * Where to go after the form, from a parameter anyone can write.
 *
 * It ends up in `router.push` on the client and in a `Location` header on the
 * server, so it is confined to a path inside this app. One leading slash and
 * not two: `//somewhere.example` is a protocol-relative URL and the browser
 * reads it as another origin, which is how an open redirect on a login page
 * becomes a phishing link that starts on the real one. A backslash is rejected
 * for the same reason — some browsers normalise `/\evil.example` the same way.
 *
 * This used to live in `sign-in/page.tsx`, which was the only thing that read
 * `next`. The no-JavaScript route handler reads it too now, from a form field
 * rather than a query string, and a guard that exists on one of the two paths
 * into a session is not a guard.
 */
export function destination(value: string | string[] | undefined | null): string {
  if (!value) return "/app";
  // A repeated `next` is nothing a link in this app produces, so it is either
  // a mangled URL or someone probing. Neither is owed a guess at which of the
  // two they meant; both get the dashboard.
  if (typeof value !== "string") return "/app";
  if (!value.startsWith("/")) return "/app";
  if (value.startsWith("//") || value.startsWith("/\\")) return "/app";
  return value;
}
