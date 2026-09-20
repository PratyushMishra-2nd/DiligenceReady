import type { MetadataRoute } from "next";

import { SITE_URL } from "./lib/site";

/**
 * What a crawler is allowed to index.
 *
 * Everything under `/app` is a signed-in surface holding one firm's client
 * data. It is already unreachable without a session — an unauthenticated
 * request is sent to the landing page — but a crawler that follows a link into
 * it wastes its budget on redirects, and a route that answers 307 to everyone
 * has no business being offered to one.
 *
 * `/og` is an asset with a URL rather than a page, and `/sign-in` is a form
 * with nothing on it to read.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/app", "/app/", "/sign-in", "/og", "/demo"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
