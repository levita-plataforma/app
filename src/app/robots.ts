import type { MetadataRoute } from "next";
import { env } from "@/server/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/acceso", "/acceso/", "/app", "/app/", "/operacion", "/operacion/"],
    },
    sitemap: `${env.marketingUrl}/sitemap.xml`,
  };
}
