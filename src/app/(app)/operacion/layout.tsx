import Link from "next/link";
import { redirect } from "next/navigation";
import { getOperatorContext, tiene, type PlatformCapability } from "@/server/platform/platform-service";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import BotonSalir from "./BotonSalir";
import "../app-shell.css";

/**
 * Estructura común de la consola de operación (CA-1).
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
  { href: "/operacion", texto: "Inicio" },
  { href: "/operacion/iglesias", texto: "Iglesias", capacidad: "platform.churches.read" },
  { href: "/operacion/altas", texto: "Altas", capacidad: "platform.churches.create" },
  { href: "/operacion/planes", texto: "Planes", capacidad: "platform.commercial.read" },
  { href: "/operacion/procesos", texto: "Procesos", capacidad: "platform.operations.read" },
  { href: "/operacion/soporte", texto: "Soporte", capacidad: "platform.support.manage" },
  { href: "/operacion/auditoria", texto: "Auditoría", capacidad: "platform.audit.read" },
  { href: "/operacion/seguridad", texto: "Seguridad" },
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

  const visibles = SECCIONES.filter((s) => !s.capacidad || tiene(contexto, s.capacidad));
  const sinCapacidades = contexto.capabilities.length === 0;

  return (
    <div style={{ minHeight: "100svh", background: "var(--shell-bg)", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          borderBottom: "1px solid var(--shell-border)",
          background: "var(--shell-surface, var(--shell-bg))",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            padding: "10px 20px",
            display: "flex",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <Link href="/operacion" style={{ fontSize: 13.5, fontWeight: 600, textDecoration: "none", color: "inherit" }}>
            Operación LEVITA
          </Link>

          {/* nav real, no una fila de divs: el teclado y los lectores de
              pantalla lo recorren como lo que es. */}
          <nav aria-label="Secciones de operación" style={{ display: "flex", gap: 4, flexWrap: "wrap", flex: 1 }}>
            {visibles.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                style={{
                  fontSize: 12.5,
                  padding: "6px 10px",
                  borderRadius: "var(--shell-radius-sm)",
                  textDecoration: "none",
                  color: "var(--shell-text-muted)",
                }}
              >
                {s.texto}
              </Link>
            ))}
          </nav>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* Quién eres, para no operar a ciegas con la cuenta equivocada. */}
            <span style={{ fontSize: 11.5, color: "var(--shell-text-muted)" }}>{user?.email ?? "sesión activa"}</span>
            <BotonSalir />
          </div>
        </div>
      </header>

      {sinCapacidades && (
        <div style={{ maxWidth: 1100, margin: "16px auto 0", padding: "0 20px", width: "100%" }}>
          <div className="shell-card" style={{ padding: 14, borderLeft: "3px solid var(--shell-warning, #c98a00)" }}>
            <p style={{ margin: 0, fontSize: 12.5 }}>
              <strong>Tu cuenta está en el equipo pero no tiene ninguna capacidad.</strong> Puedes entrar y no puedes
              hacer nada: pídele a quien gestione el equipo que te conceda las que necesites.
            </p>
          </div>
        </div>
      )}

      <main style={{ flex: 1 }}>{children}</main>
    </div>
  );
}
