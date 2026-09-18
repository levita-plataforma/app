import type { MetadataRoute } from "next";
import { env } from "@/server/env";

const PUBLIC_ROUTES = ["", "/producto", "/modulos", "/para-iglesias", "/seguridad", "/demo", "/contacto"];

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.map((path) => ({
    url: `${env.marketingUrl}${path}`,
    lastModified: new Date(),
  }));
}
