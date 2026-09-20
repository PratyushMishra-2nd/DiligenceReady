import type { MetadataRoute } from "next";

import aggregates from "./press/aggregates.json";
import { SITE_URL } from "./lib/site";

/**
 * Two public URLs, which is all there are.
 *
 * `lastModified` is the date the landing page's figures were generated from
 * the seed, not the date this file was deployed. The page is a working paper
 * and the thing that changes it is the data being rebuilt; saying "today" on
 * every deploy would be the sitemap making a claim the rest of the site
 * refuses to.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const prepared = new Date(aggregates.generated_on);
  return [
    { url: `${SITE_URL}/`, lastModified: prepared, changeFrequency: "monthly", priority: 1 },
    {
      url: `${SITE_URL}/tools/section-16-4`,
      lastModified: prepared,
      changeFrequency: "yearly",
      priority: 0.6,
    },
  ];
}
