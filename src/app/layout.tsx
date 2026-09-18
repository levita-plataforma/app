import type { Metadata, Viewport } from "next";
import { DM_Sans, Libre_Caslon_Display } from "next/font/google";
import { env } from "@/server/env";
import "./globals.css";

const sans = DM_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const serif = Libre_Caslon_Display({ weight: "400", subsets: ["latin"], variable: "--font-serif", display: "swap" });
const description = "LEVITA es la plataforma que conecta, organiza y fortalece tu iglesia: personas, equipos, servicios, grupos, eventos, comunicación y mucho más desde un único lugar.";
export const metadata: Metadata = {
  metadataBase: new URL(env.marketingUrl),
  title: "LEVITA | Plataforma para iglesias", description,
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: { title: "LEVITA | Plataforma para iglesias", description, url: "/", siteName: "LEVITA", locale: "es_ES", type: "website" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#fafaf7" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es" className={`${sans.variable} ${serif.variable}`}><body>{children}</body></html>;
}
