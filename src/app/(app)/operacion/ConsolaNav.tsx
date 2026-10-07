"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type ConsolaEnlace = { href: string; texto: string };

/** Navegación de la consola. Solo marca la sección activa: filtrar por capacidad lo hace el layout. */
export default function ConsolaNav({ enlaces }: { enlaces: ConsolaEnlace[] }) {
  const ruta = usePathname();
  return (
    <nav aria-label="Administración LEVITA" className="consola-nav">
      {enlaces.map((e) => {
        const activa = e.href === "/operacion" ? ruta === "/operacion" : ruta.startsWith(e.href);
        return (
          <Link key={e.href} href={e.href} aria-current={activa ? "page" : undefined}>
            {e.texto}
          </Link>
        );
      })}
    </nav>
  );
}
