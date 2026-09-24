import Link from "next/link";
import { listSupportSessions } from "@/server/platform/operations-service";
import { requireOperator } from "../guard";
import RevocarSesion from "./RevocarSesion";
import "../../app-shell.css";

/**
 * Sesiones de soporte (Fase 15).
 *
 * Una sesión aquí deja constancia de que alguien está atendiendo una
 * incidencia: quién, sobre qué iglesia, por qué y hasta cuándo. **No abre
 * ninguna puerta a los datos de la iglesia**, y la pantalla lo dice en vez de
 * dejar que se suponga lo contrario.
 */
function fecha(valor: string | null): string {
  if (!valor) return "—";
  return new Date(valor).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" });
}

export default async function SoportePage() {
  const acceso = await requireOperator("platform.support.manage");
  if ("bloqueado" in acceso) return acceso.bloqueado;

  const sesiones = await listSupportSessions();
  const activas = sesiones.filter((s) => s.activa);
  const cerradas = sesiones.filter((s) => !s.activa);

  return (
    <div style={{ padding: "32px 20px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
        <header>
          <h1 style={{ margin: 0, fontSize: 20 }}>Soporte</h1>
          <p style={{ margin: "4px 0 0", color: "var(--shell-text-muted)", fontSize: 13 }}>
            Sesiones abiertas para atender incidencias, con su motivo y su caducidad.
          </p>
        </header>

        <section className="shell-card" style={{ padding: 16 }}>
          <h2 style={{ margin: "0 0 8px", fontSize: 14 }}>Qué permite una sesión de soporte</h2>
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--shell-text-muted)" }}>
            Diagnóstico administrativo y nada más. Abrir una sesión <strong>no da acceso</strong> a las personas,
            los menores, los casos pastorales ni las donaciones de esa iglesia: no cambia ninguna regla de acceso
            a sus datos. El acceso excepcional necesita una política de autorización que todavía no está acordada,
            y pedirlo desde aquí se rechaza.
          </p>
        </section>

        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 15 }}>Sesiones activas ({activas.length})</h2>

          {activas.length === 0 ? (
            <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)" }}>Ninguna sesión abierta ahora mismo.</p>
          ) : (
            activas.map((s) => (
              <article key={s.id} className="shell-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <Link href={`/operacion/iglesias/${s.churchId}`} style={{ fontSize: 13.5, fontWeight: 600, color: "inherit" }}>
                    {s.churchName}
                  </Link>
                  <span className="serving-chip is-warning">activa</span>
                  <span style={{ fontSize: 11.5, color: "var(--shell-text-muted)" }}>
                    caduca {fecha(s.expiresAt)}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 12.5 }}>{s.reason}</p>
                <p style={{ margin: 0, fontSize: 11.5, color: "var(--shell-text-muted)" }}>
                  Abierta {fecha(s.startedAt)}
                </p>
                <RevocarSesion id={s.id} />
              </article>
            ))
          )}
        </section>

        {cerradas.length > 0 && (
          <section className="shell-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: 15 }}>Cerradas</h2>
            <ul style={{ display: "flex", flexDirection: "column", gap: 8, margin: 0, padding: 0, listStyle: "none" }}>
              {cerradas.slice(0, 25).map((s) => (
                <li key={s.id} style={{ fontSize: 12.5, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <span>
                    {s.churchName} · {s.reason}
                  </span>
                  <span style={{ color: "var(--shell-text-muted)" }}>
                    {s.revokedAt ? `revocada ${fecha(s.revokedAt)}` : `caducó ${fecha(s.expiresAt)}`}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
