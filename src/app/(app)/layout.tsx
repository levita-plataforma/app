import type { Metadata } from "next";

/**
 * Layout mínimo del grupo (app): cubre /acceso, /app y /operacion.
 * Solo añade robots:noindex como defensa en profundidad — robots.ts ya
 * excluye estas rutas del rastreo, esto evita que aparezcan indexadas si
 * alguna vez se enlazan desde fuera. No añade ningún wrapper visual: cada
 * subárbol (acceso, app, operacion) sigue definiendo su propio chrome.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
