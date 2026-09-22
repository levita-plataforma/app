import Link from "next/link";
import { AlertTriangle, Building2, MailWarning, ShieldAlert, UserX } from "lucide-react";
import { getOverview, tiene } from "@/server/platform/platform-service";
import { requireOperator } from "./guard";
import "../app-shell.css";

/**
 * Portada del panel de operación: cuántas iglesias hay, cuáles necesitan que
 * alguien entre a ayudar y qué invitaciones están esperando.
 *
 * Los cuatro indicadores salen de la base en la misma consulta y cada uno lleva
 * a su listado filtrado: un número sin sitio adonde ir no sirve para trabajar.
 */
export default async function OperacionPage() {
  const acceso = await requireOperator("platform.churches.read");
  if ("bloqueado" in acceso) return acceso.bloqueado;

  const resumen = await getOverview();
  const puedeCrear = tiene(acceso.contexto, "platform.churches.create");

  // Cada sección aparece solo si la cuenta tiene su capacidad: un enlace a una
  // pantalla que va a rechazarte no informa, despista.
  const secciones = [
    { href: "/operacion/planes", texto: "Planes", visible: tiene(acceso.contexto, "platform.commercial.read") },
    { href: "/operacion/procesos", texto: "Procesos", visible: tiene(acceso.contexto, "platform.operations.read") },
    { href: "/operacion/soporte", texto: "Soporte", visible: tiene(acceso.contexto, "platform.support.manage") },
    { href: "/operacion/auditoria", texto: "Auditoría", visible: tiene(acceso.contexto, "platform.audit.read") },
  ].filter((s) => s.visible);

  const tarjetas = [
    {
      icono: Building2,
      valor: resumen.iglesiasActivas,
      etiqueta: "Iglesias activas",
      href: "/operacion/iglesias",
      alerta: false,
    },
    {
      icono: AlertTriangle,
      valor: resumen.altasIncompletas,
      etiqueta: "Altas sin terminar",
      href: "/operacion/iglesias?onboarding=pendiente",
      alerta: resumen.altasIncompletas > 0,
    },
    {
      icono: UserX,
      valor: resumen.iglesiasSinPropietario,
      etiqueta: "Sin propietario",
      href: "/operacion/iglesias?sinPropietario=1",
      alerta: resumen.iglesiasSinPropietario > 0,
    },
    {
      icono: MailWarning,
      valor: resumen.invitacionesCaducadas,
      etiqueta: "Invitaciones caducadas",
      href: "/operacion/iglesias",
      alerta: resumen.invitacionesCaducadas > 0,
    },
  ];

  return (
    <div style={{ minHeight: "100svh", background: "var(--shell-bg)", padding: "32px 20px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
        <header style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20 }}>Operación LEVITA</h1>
            <p style={{ margin: "4px 0 0", color: "var(--shell-text-muted)", fontSize: 13 }}>
              Panel del equipo. No da acceso a los datos de ninguna iglesia.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/operacion/iglesias" className="shell-card" style={enlaceStyle}>
              Ver iglesias
            </Link>
            {puedeCrear && (
              <Link href="/operacion/altas" className="shell-card" style={enlaceStyle}>
                Alta de iglesia
              </Link>
            )}
            {secciones.map((s) => (
              <Link key={s.href} href={s.href} className="shell-card" style={enlaceStyle}>
                {s.texto}
              </Link>
            ))}
            <Link href="/operacion/seguridad" className="shell-card" style={enlaceStyle}>
              Seguridad
            </Link>
          </div>
        </header>

        {/*
          El segundo factor es recomendado, no obligatorio (decisión de Carlos,
          21-sep-2026). Un ajuste opcional que no se ve no lo activa nadie, así
          que el aviso va en la portada y desaparece solo al configurarlo.
        */}
        {!acceso.contexto.mfaEnabled && (
          <Link
            href="/operacion/seguridad"
            className="shell-card"
            style={{
              padding: "14px 16px",
              display: "flex",
              alignItems: "center",
              gap: 12,
              textDecoration: "none",
              color: "var(--shell-text)",
              borderLeft: "3px solid var(--shell-danger)",
            }}
          >
            <ShieldAlert size={18} aria-hidden="true" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 12.5 }}>
              <strong>Tu cuenta no tiene segundo factor.</strong> Desde aquí se ven y modifican datos de todas las
              iglesias; con solo una contraseña, eso es lo que se lleva quien la consiga. Configúralo.
            </span>
          </Link>
        )}

        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          {tarjetas.map((t) => {
            const Icono = t.icono;
            return (
              <Link
                key={t.etiqueta}
                href={t.href}
                className="shell-card"
                style={{
                  padding: 16,
                  textDecoration: "none",
                  color: "inherit",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  borderLeft: t.alerta ? "3px solid var(--shell-warning, #c98a00)" : undefined,
                }}
              >
                <Icono aria-hidden="true" size={18} style={{ color: "var(--shell-text-muted)" }} />
                <strong style={{ fontSize: 24, lineHeight: 1.1 }}>{t.valor}</strong>
                <span style={{ fontSize: 12.5, color: "var(--shell-text-muted)" }}>{t.etiqueta}</span>
              </Link>
            );
          })}
        </div>

        <section className="shell-card" style={{ padding: 16 }}>
          <h2 style={{ margin: "0 0 10px", fontSize: 15 }}>Situación</h2>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
            <li>
              {resumen.iglesiasActivas} iglesias activas
              {resumen.iglesiasArchivadas > 0 && ` y ${resumen.iglesiasArchivadas} archivadas`}.
            </li>
            <li>
              {resumen.invitacionesPendientes === 0
                ? "No hay invitaciones esperando respuesta."
                : `${resumen.invitacionesPendientes} invitaciones esperando respuesta.`}
            </li>
            {resumen.iglesiasSinPropietario > 0 && (
              <li>
                <strong>{resumen.iglesiasSinPropietario}</strong>{" "}
                {resumen.iglesiasSinPropietario === 1 ? "iglesia no tiene" : "iglesias no tienen"} propietario ni
                invitación viva: nadie puede administrarlas hasta que se resuelva.
              </li>
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}

const enlaceStyle: React.CSSProperties = {
  padding: "9px 14px",
  fontSize: 12.5,
  fontWeight: 600,
  textDecoration: "none",
  color: "inherit",
};
