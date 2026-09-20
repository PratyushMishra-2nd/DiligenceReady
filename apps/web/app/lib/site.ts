/**
 * Where this is served from, for the handful of places that need an absolute
 * URL: the share card, the canonical link, the sitemap and robots.
 *
 * A relative Open Graph image does not work — the crawler that renders a link
 * preview is not on this origin and has no base to resolve against — so Next
 * needs `metadataBase`, and `metadataBase` needs this.
 *
 * It is an environment variable with the deployed Amplify host as the fallback
 * rather than a hard-coded constant, because the one thing certain about this
 * URL is that it changes the day there is a real domain. Set
 * NEXT_PUBLIC_SITE_URL in the Amplify console and nothing else has to move.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://main.d2iuitbi6z0hry.amplifyapp.com"
).replace(/\/$/, "");
