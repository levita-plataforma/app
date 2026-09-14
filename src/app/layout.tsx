import type { Metadata, Viewport } from "next";
import { DM_Sans, Libre_Caslon_Display } from "next/font/google";
import "./globals.css";

const sans = DM_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const serif = Libre_Caslon_Display({ weight: "400", subsets: ["latin"], variable: "--font-serif", display: "swap" });
const description = "LEVITA es una plataforma para ayudar a las iglesias a gestionar personas, equipos, eventos, comunicación y comunidad desde un solo lugar.";
export const metadata: Metadata = {
  metadataBase: new URL("https://levitaapp.com"),
  title: "LEVITA | Plataforma para iglesias", description,
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: { title: "LEVITA | Plataforma para iglesias", description, url: "/", siteName: "LEVITA", locale: "es_ES", type: "website" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#fafaf7" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es" className={`${sans.variable} ${serif.variable}`}><body>{children}</body></html>;
}
