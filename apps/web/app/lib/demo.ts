/**
 * The demo account, in one place.
 *
 * These credentials were written out in four components and a README. They are
 * not a secret — the whole argument of the landing page is that the way in is a
 * password anyone can read, on generated data, for a firm that does not exist —
 * but four copies of a string is still four things to change when the seed is
 * rebuilt, and the one that gets missed is the one on the page.
 *
 * Environment overrides exist so a deployment can point the demo at a different
 * seeded firm without a code change. The fallbacks are the credentials the
 * repository actually seeds, so a clone with no environment at all still works.
 *
 * `NEXT_PUBLIC_` on both, deliberately: the password is rendered on the landing
 * page and typed into a form in the browser. Marking it server-only would be
 * security theatre over a string this product prints at 14px.
 */
export const DEMO_EMAIL = process.env.NEXT_PUBLIC_DEMO_EMAIL || "ca@mehta.example";
export const DEMO_PASSWORD =
  process.env.NEXT_PUBLIC_DEMO_PASSWORD || "b5Lsnz0Hcj2hXKtq3UX3c1GF";

/** The firm those credentials sign into. */
export const DEMO_FIRM = "Mehta & Associates";

/**
 * How long the engine honours a session, mirrored from `auth.SESSION_HOURS`.
 *
 * The API sets this cookie itself on a normal sign-in. The one-click demo route
 * sets it from the token the API hands back, so it has to agree — a cookie that
 * outlives its own session sends a reader to a dashboard that 307s them out
 * again, which is the dead click this whole route exists to remove.
 */
export const SESSION_MAX_AGE = 12 * 60 * 60;
