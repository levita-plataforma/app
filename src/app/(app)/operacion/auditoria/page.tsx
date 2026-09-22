import Link from "next/link";
import { listAudit } from "@/server/platform/operations-service";
import { requireOperator } from "../guard";
import "../../app-shell.css";

/**
 * Auditoría de plataforma (Fase 15).
 *
 * Bajo su propia capacidad: poder operar no implica poder revisar lo que
 * hicieron los demás. Solo lectura, y sin forma de borrar una entrada desde
 * ninguna pantalla.
 */

type SearchParams = { iglesia?: string; accion?: string };

const ACCIONES: Record<string, string> = {
  "subscription.plan_changed": "Cambio de plan",
  "subscription.plan_change_scheduled": "Cambio de plan programado",
  "subscription.override_granted": "Excepción concedida",
  "subscription.override_revoked": "Excepción revocada",
  "subscription.cancelled": "Suscripción cancelada",
  "subscription.cancel_scheduled": "Cancelación programada",
  "church.security_blocked": "Bloqueo de seguridad",
  "church.security_unblocked": "Bloqueo levantado",
  "church.purged": "Iglesia borrada por retención",
  "support.session_opened": "Sesión de soporte abierta",
  "support.session_revoked": "Sesión de soporte cerrada",
  "operations.retry_storage_deletion": "Reintento de borrado",
  "platform.capability_granted": "Capacidad concedida",
  "platform.capability_revoked": "Capacidad retirada",
  "platform.bootstrap": "Alta inicial del equipo",
};

export default async function AuditoriaPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const acceso = await requireOperator("platform.audit.read");
  if ("bloqueado" in acceso) return acceso.bloqueado;

  const params = await searchParams;
  const entradas = await listAudit({ churchId: params.iglesia, action: params.accion, limit: 200 });

  return (
    <div style={{ minHeight: "100svh", background: "var(--shell-bg)", padding: "32px 20px" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
        <header>
          <h1 style={{ margin: 0, fontSize: 20 }}>Auditoría</h1>
          <p style={{ margin: "4px 0 0", color: "var(--shell-text-muted)", fontSize: 13 }}>
            Qué ha hecho el equipo de operación, sobre qué iglesia y cuándo.
            {params.iglesia && " Filtrado por una iglesia."}
          </p>
        </header>

        {params.iglesia || params.accion ? (
          <Link href="/operacion/auditoria" className="shell-card" style={{ padding: "8px 12px", fontSize: 12.5, textDecoration: "none", color: "inherit", alignSelf: "flex-start" }}>
            Quitar filtros
          </Link>
        ) : null}

        {entradas.length === 0 ? (
          <div className="shell-card shell-empty-state" style={{ padding: "40px 24px" }}>
            <h3>Sin entradas</h3>
            <p style={{ color: "var(--shell-text-muted)", fontSize: 13, marginTop: 6 }}>
              {params.iglesia || params.accion
                ? "No hay operaciones que cumplan ese filtro."
                : "Todavía no se ha registrado ninguna operación de plataforma."}
            </p>
          </div>
        ) : (
          <section className="shell-card" style={{ padding: 20 }}>
            <ul style={{ display: "flex", flexDirection: "column", gap: 0, margin: 0, padding: 0, listStyle: "none" }}>
              {entradas.map((e) => (
                <li
                  key={e.id}
                  style={{
                    padding: "10px 0",
                    borderBottom: "1px solid var(--shell-border)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                    <strong style={{ fontSize: 13 }}>{ACCIONES[e.action] ?? e.action}</strong>
                    {e.churchName && (
                      <Link href={`/operacion/iglesias/${e.churchId}`} style={{ fontSize: 12.5, color: "inherit" }}>
                        {e.churchName}
                      </Link>
                    )}
                    <span style={{ fontSize: 11.5, color: "var(--shell-text-muted)", marginLeft: "auto" }}>
                      {new Date(e.createdAt).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" })}
                    </span>
                  </div>

                  {/*
                    La metadata la escriben las funciones de plataforma y ya viene
                    sin secretos ni datos personales. Se enseña tal cual para no
                    esconder de dónde sale un dato al diagnosticar.
                  */}
                  {Object.keys(e.metadata).length > 0 && (
                    <p style={{ margin: 0, fontSize: 11.5, fontFamily: "monospace", color: "var(--shell-text-muted)", wordBreak: "break-word" }}>
                      {JSON.stringify(e.metadata)}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
