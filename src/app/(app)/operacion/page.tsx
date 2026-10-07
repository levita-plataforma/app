import Link from "next/link";
import { getConsoleSummary, tiene } from "@/server/platform/platform-service";
import { requireOperator } from "./guard";
import "../app-shell.css";

/**
 * Resumen de la consola de plataforma (LEVITA · Administración).
 *
 * Solo recuentos del plano de control: estado comercial de los tenants, altas,
 * invitaciones, soporte e incidencias. Ningún dato de negocio de ninguna
 * iglesia. Cada número lleva a su listado filtrado: un número sin sitio adonde
 * ir no sirve para trabajar.
 */
export default async function OperacionPage() {
  const acceso = await requireOperator("platform.churches.read");
  if ("bloqueado" in acceso) return acceso.bloqueado;

  const r = await getConsoleSummary();
  const modo = (k: keyof typeof r.porModo) => r.porModo[k] ?? 0;
  const puedeInvitaciones = tiene(acceso.contexto, "platform.owners.manage");
  const puedeSoporte = tiene(acceso.contexto, "platform.support.manage");
  const puedeProcesos = tiene(acceso.contexto, "platform.operations.read");

  const tenants = [
    { valor: modo("full") + modo("grace"), etiqueta: "Activas", href: "/operacion/iglesias?modo=full" },
    { valor: r.enPrueba, etiqueta: "En prueba", href: "/operacion/iglesias?prueba=vigente" },
    { valor: modo("trial_expired"), etiqueta: "Prueba vencida", href: "/operacion/iglesias?modo=trial_expired" },
    { valor: modo("suspended"), etiqueta: "Suspendidas", href: "/operacion/iglesias?modo=suspended", alerta: true },
    { valor: modo("cancelled"), etiqueta: "Canceladas", href: "/operacion/iglesias?modo=cancelled" },
    { valor: modo("security_blocked"), etiqueta: "Bloqueadas por seguridad", href: "/operacion/iglesias?modo=security_blocked", alerta: true },
    { valor: r.altasMes, etiqueta: "Altas este mes", href: "/operacion/iglesias" },
  ];

  const pendientes = [
    { valor: r.altasPendientes, etiqueta: "Altas sin terminar", href: "/operacion/iglesias?onboarding=pendiente", alerta: true },
    { valor: r.sinPropietario, etiqueta: "Sin propietario", href: "/operacion/iglesias?sinPropietario=1", alerta: true },
    ...(puedeInvitaciones
      ? [
          { valor: r.invitacionesPendientes, etiqueta: "Invitaciones pendientes", href: "/operacion/invitaciones" },
          { valor: r.invitacionesCaducadas, etiqueta: "Invitaciones caducadas", href: "/operacion/invitaciones?estado=caducadas", alerta: true },
        ]
      : []),
    ...(puedeSoporte
      ? [{ valor: r.sesionesSoporteActivas, etiqueta: "Sesiones de soporte activas", href: "/operacion/soporte" }]
      : []),
    ...(puedeProcesos
      ? [
          { valor: r.entregasFallidas7d, etiqueta: "Avisos fallidos (7 días)", href: "/operacion/procesos", alerta: true },
          { valor: r.exportacionesFallidas7d, etiqueta: "Exportaciones fallidas (7 días)", href: "/operacion/procesos", alerta: true },
        ]
      : []),
  ];

  return (
    <div className="consola-pagina">
      <header style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <h1>Resumen</h1>
          <p className="consola-sub">Estado de la plataforma. No da acceso a los datos de ninguna iglesia.</p>
        </div>
        {tiene(acceso.contexto, "platform.churches.create") && (
          <Link href="/operacion/altas" className="shell-button" style={{ fontSize: 12.5, textDecoration: "none" }}>
            + Nueva iglesia
          </Link>
        )}
      </header>

      {/*
        El segundo factor es recomendado, no obligatorio (decisión de Carlos,
        21-sep-2026). Un ajuste opcional que no se ve no lo activa nadie.
      */}
      {!acceso.contexto.mfaEnabled && (
        <Link
          href="/operacion/seguridad"
          className="shell-card"
          style={{ padding: "12px 14px", textDecoration: "none", color: "var(--shell-text)", borderLeft: "3px solid var(--shell-danger)", fontSize: 12.5 }}
        >
          <strong>Tu cuenta no tiene segundo factor.</strong> Desde aquí se administran todas las iglesias; con solo una
          contraseña, eso es lo que se lleva quien la consiga. Configúralo.
        </Link>
      )}

      <section aria-labelledby="tenants-titulo" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h2 id="tenants-titulo" style={{ margin: 0, fontSize: 14 }}>Iglesias por estado</h2>
        <Metricas items={tenants} />
      </section>

      <section aria-labelledby="pendiente-titulo" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h2 id="pendiente-titulo" style={{ margin: 0, fontSize: 14 }}>Pendiente y operación</h2>
        <Metricas items={pendientes} />
      </section>
    </div>
  );
}

function Metricas({ items }: { items: { valor: number; etiqueta: string; href: string; alerta?: boolean }[] }) {
  return (
    <div className="consola-metricas">
      {items.map((t) => (
        <Link key={t.etiqueta} href={t.href} className={`consola-metrica${t.alerta && t.valor > 0 ? " is-alerta" : ""}`}>
          <strong>{t.valor}</strong>
          <span>{t.etiqueta}</span>
        </Link>
      ))}
    </div>
  );
}
