import Link from "next/link";
import { redirect } from "next/navigation";
import { getOperatorContext, tiene, type PlatformCapability } from "@/server/platform/platform-service";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { getTenantContext } from "@/server/tenant/tenant-context";
import BotonSalir from "./BotonSalir";
import ConsolaNav from "./ConsolaNav";
import "../app-shell.css";
import "./consola.css";

/**
 * Estructura común de la consola de plataforma: LEVITA · Administración (CA-1).
 *
 * Antes cada pantalla repetía su propio marco y la navegación vivía solo en la
 * portada: para ir de auditoría a procesos había que volver atrás. Aquí está la
 * barra, quién eres y la salida.
 *
 * **El menú se filtra por capacidad.** Un enlace a una pantalla que va a
 * rechazarte no informa de nada, despista: parece que el permiso existe y que
 * algo falla. Cada pantalla vuelve a comprobar lo suyo, y la base también: esto
 * es navegación, no autorización.
 *
 * Quien no es del equipo no ve la consola. Se le dice lo justo —que esto es
 * para el equipo de LEVITA— sin confirmarle qué hay dentro ni qué le falta.
 */

type Seccion = { href: string; texto: string; capacidad?: PlatformCapability };

const SECCIONES: Seccion[] = [
  { href: "/operacion", texto: "Resumen", capacidad: "platform.churches.read" },
  { href: "/operacion/iglesias", texto: "Iglesias", capacidad: "platform.churches.read" },
  { href: "/operacion/altas", texto: "Altas", capacidad: "platform.churches.create" },
  { href: "/operacion/invitaciones", texto: "Invitaciones", capacidad: "platform.owners.manage" },
  { href: "/operacion/soporte", texto: "Soporte", capacidad: "platform.support.manage" },
  { href: "/operacion/procesos", texto: "Procesos", capacidad: "platform.operations.read" },
  { href: "/operacion/equipo", texto: "Equipo", capacidad: "platform.operators.manage" },
  { href: "/operacion/seguridad", texto: "Seguridad" },
  { href: "/operacion/auditoria", texto: "Auditoría", capacidad: "platform.audit.read" },
  { href: "/operacion/planes", texto: "Configuración", capacidad: "platform.commercial.read" },
];

export default async function OperacionLayout({ children }: { children: React.ReactNode }) {
  const contexto = await getOperatorContext();

  if (!contexto) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/acceso");

    return (
      <div style={{ minHeight: "100svh", display: "grid", placeItems: "center", background: "var(--shell-bg)", padding: 20 }}>
        <div className="shell-card shell-empty-state" style={{ padding: 40, maxWidth: 420, textAlign: "center" }}>
          <h3>Acceso restringido</h3>
          <p>Esta sección es solo para el equipo de operación de LEVITA.</p>
          <div style={{ marginTop: 16 }}>
            <BotonSalir />
          </div>
        </div>
      </div>
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // La consola es otro contexto, no una iglesia más: si el operador también es
  // miembro de alguna iglesia, se le ofrece salir a la app de iglesia de forma
  // explícita, nunca mezclando las dos navegaciones.
  const tenant = await getTenantContext();

  const visibles = SECCIONES.filter((s) => !s.capacidad || tiene(contexto, s.capacidad));
  const sinCapacidades = contexto.capabilities.length === 0;

  return (
    <div className="consola">
      <aside className="consola-sidebar">
        <Link href="/operacion" className="consola-identidad" style={{ textDecoration: "none", color: "inherit" }}>
          <span>LEVITA</span>
          <strong>Administración</strong>
        </Link>

        <ConsolaNav enlaces={visibles.map(({ href, texto }) => ({ href, texto }))} />

        <div className="consola-pie">
          {tenant && (
            <Link href="/app">Ir a la app de iglesia ({tenant.churchName})</Link>
          )}
          {/* Quién eres, para no operar a ciegas con la cuenta equivocada. */}
          <span>{user?.email ?? "sesión activa"}</span>
          <BotonSalir />
        </div>
      </aside>

      <div className="consola-main">
        {sinCapacidades && (
          <div className="consola-pagina" style={{ paddingBottom: 0 }}>
            <div className="shell-card" style={{ padding: 14, borderLeft: "3px solid var(--shell-warning, #c98a00)" }}>
              <p style={{ margin: 0, fontSize: 12.5 }}>
                <strong>Tu cuenta está en el equipo pero no tiene ninguna capacidad.</strong> Puedes entrar y no puedes
                hacer nada: pídele a quien gestione el equipo que te conceda las que necesites.
              </p>
            </div>
          </div>
        )}
        <main>{children}</main>
      </div>
    </div>
  );
}
