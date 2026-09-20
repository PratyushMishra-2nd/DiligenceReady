/**
 * Where `/api/*` is proxied to, and a build that fails rather than a
 * deployment that half-works.
 *
 * This value is read once, here, at build time — `rewrites()` runs during
 * `next build` and its result is baked into the output. So an Amplify
 * environment missing `NEXT_PUBLIC_API_UPSTREAM` used to produce a perfectly
 * green build whose every API call was proxied to `http://localhost:8077` on
 * the Amplify compute node, where nothing is listening. Nothing logged an
 * error: the demo button signed nobody in and fell through to the sign-in
 * form, the dashboard came up empty, and the only way to find out why was to
 * know this line existed.
 *
 * The localhost default is right for `next dev` and wrong for every
 * production build, so that is exactly where it is allowed. A production
 * build that genuinely wants it — running the built output locally against a
 * local API — says so with `ALLOW_LOCAL_API_UPSTREAM=1`.
 */
function apiUpstream() {
  const upstream = process.env.NEXT_PUBLIC_API_UPSTREAM;
  if (upstream) return upstream;

  if (
    process.env.NODE_ENV === "production" &&
    !process.env.ALLOW_LOCAL_API_UPSTREAM
  ) {
    throw new Error(
      "NEXT_PUBLIC_API_UPSTREAM is not set. A production build without it " +
        "proxies /api/* to http://localhost:8077, which in a deployment is " +
        "the web server talking to itself: the demo button silently fails " +
        "and the dashboard is empty. Set it in the Amplify console to " +
        "http://<ec2-public-dns>:8080 and rebuild. To build against a local " +
        "API on purpose, set ALLOW_LOCAL_API_UPSTREAM=1.",
    );
  }

  return "http://localhost:8077";
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  /**
   * API proxy rewrites.
   *
   * The API runs on EC2 (HTTP, port 8080). The frontend on Amplify is HTTPS.
   * Browsers block HTTPS-page → HTTP-API calls (mixed content). We solve this
   * without a CDN or TLS on EC2: Next.js rewrites /api/* server-side to the
   * EC2 HTTP endpoint, so the browser always talks HTTPS to Amplify and the
   * Amplify compute node talks HTTP to EC2. No mixed-content issue.
   *
   * How it works:
   *   - Browser: NEXT_PUBLIC_API_BASE = "" (empty = same origin)
   *   - Browser calls: https://amplify-url.com/api/...
   *   - Next.js server rewrites that to: http://ec2-host:8080/api/...
   *   - EC2 EC2 sends JSON back to Next.js → Next.js forwards to browser
   *
   * NEXT_PUBLIC_API_UPSTREAM must be set in Amplify console env vars:
   *   NEXT_PUBLIC_API_UPSTREAM = http://<ec2-public-dns>:8080
   *
   * Local development: leave NEXT_PUBLIC_API_UPSTREAM unset; it defaults to
   * http://localhost:8077 which is what `uv run uvicorn ...` listens on.
   *
   * Cookies: the session cookie is set by the Next.js /api/session response
   * on the Amplify domain. Because the rewrite is server-side, the browser
   * cookie jar sees the cookie as coming from the Amplify origin (correct),
   * and Next.js forwards the Cookie header upstream automatically.
   */
  /**
   * The addresses this app used to answer on.
   *
   * The landing page moved from `/product` to `/`, and the dashboard from `/`
   * to `/app`, so the canonical URL of the thing we ask people to share is a
   * 200 rather than a redirect through a password box. Anything already
   * pasted into a chat or a bookmark still resolves: `/product` is permanent,
   * because that page is not coming back to that address, and the old company
   * URLs carry their id across.
   */
  async redirects() {
    return [
      { source: "/product", destination: "/", permanent: true },
      {
        source: "/companies/:companyId",
        destination: "/app/companies/:companyId",
        permanent: true,
      },
    ];
  },

  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiUpstream()}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
