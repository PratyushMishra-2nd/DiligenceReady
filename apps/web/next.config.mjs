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
  async rewrites() {
    const upstream =
      process.env.NEXT_PUBLIC_API_UPSTREAM ?? "http://localhost:8077";
    return [
      {
        source: "/api/:path*",
        destination: `${upstream}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
