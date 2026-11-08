import type { MetadataRoute } from "next";

// An admin console has nothing to index. Crawlers that respect robots.txt
// stay out; pages also carry noindex for the ones that don't read it.
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", disallow: "/" }] };
}
