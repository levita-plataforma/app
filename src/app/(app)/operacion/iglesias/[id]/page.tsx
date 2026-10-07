import Link from "next/link";
import { notFound } from "next/navigation";
import { getChurchDetail, tiene } from "@/server/platform/platform-service";
import { requireOperator } from "../../guard";
import { EstadoTenant, fechaCorta } from "../../estado-tenant";
import ModulosPanel from "./ModulosPanel";
import PanelComercial from "./PanelComercial";
import PanelResponsables from "./PanelResponsables";
import PanelSoporte from "./PanelSoporte";
import PanelSeguridad from "./PanelSeguridad";
import {
  getChurchEntitlements,
  getServiceState,
  listOverrides,
  listPlanVersions,
} from "@/server/platform/commercial-service";
import "../../../app-shell.css";

const SECCIONES = [
  { id: "resumen", texto: "Resumen" },
  { id: "responsables", texto: "Owners y administradores" },
  { id: "sedes", texto: "Sedes" },
  { id: "modulos", texto: "Módulos" },
  { id: "suscripcion", texto: "Suscripción" },
  { id: "soporte", texto: "Soporte" },
  { id: "seguridad", texto: "Seguridad" },
  { id: "auditoria", texto: "Auditoría" },
];

/**
 * Ficha de una iglesia en la consola de plataforma.
 *
 * Plano de control: estado, prueba, responsables, sedes, módulos, suscripción,
 * soporte, seguridad y auditoría. No enseña su directorio, ni sus menores, ni su
 * información pastoral, ni sus donaciones, ni sus actividades: para eso hay que
 * ser de esa iglesia, no del equipo de LEVITA. Los correos de los responsables se
 * consultan aparte, con su propia capacidad.
 */
export default async function FichaIglesiaPage({ params }: { params: Promise<{ id: string }> }) {
  const acceso = await requireOperator("platform.churches.read");
  if ("bloqueado" in acceso) return acceso.bloqueado;

  const { id } = await params;

  let ficha;
  try {
    ficha = await getChurchDetail(id);
  } catch {
    notFound();
  }
  if (!ficha) notFound();

  const puedeModulos = tiene(acceso.contexto, "platform.modules.manage");
  const puedeResponsables = tiene(acceso.contexto, "platform.owners.manage");
  const puedeVerComercial = tiene(acceso.contexto, "platform.commercial.read");
  const puedeGestionarComercial = tiene(acceso.contexto, "platform.commercial.manage");

  const [estadoServicio, derechos, excepciones, versiones] = puedeVerComercial
    ? await Promise.all([getServiceState(id), getChurchEntitlements(id), listOverrides(id), listPlanVersions()])
    : [null, [], [], []];

  const sub = ficha.subscription;
  const sedesActivas = ficha.sedes.filter((s) => !s.archived_at).length;
  const modulosActivos = ficha.modulos.filter((m) => m.status === "enabled").length;
  const propietarios = ficha.responsables.filter((r) => r.role_key === "church_owner");

  return (
    <div className="consola-pagina">
      <header>
        <Link href="/operacion/iglesias" style={{ fontSize: 12.5 }}>
          Iglesias
        </Link>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
          <h1>{ficha.name}</h1>
          <EstadoTenant modo={ficha.access_mode} />
          {!ficha.onboarding?.completed_at && <span className="serving-chip is-warning">Alta sin terminar</span>}
        </div>
        <p className="consola-sub">
          {ficha.slug} · Plano de control: no muestra personas, Kids, ofrendas, acompañamiento ni actividades.
        </p>
      </header>

      <nav aria-label="Secciones de la ficha" className="consola-secciones">
        {SECCIONES.map((s) => (
          <a key={s.id} href={`#${s.id}`}>
            {s.texto}
          </a>
        ))}
      </nav>

      <section id="resumen" className="shell-card consola-seccion" style={{ padding: 16 }}>
        <h2 style={seccionStyle}>Resumen</h2>
        <dl style={rejillaStyle}>
          <Dato etiqueta="Nombre" valor={ficha.name} />
          <Dato etiqueta="Identificador" valor={ficha.slug} />
          <Dato etiqueta="País" valor={ficha.country} />
          <Dato etiqueta="Idioma" valor={ficha.locale} />
          <Dato etiqueta="Zona horaria" valor={ficha.timezone} />
          <Dato etiqueta="Moneda" valor={ficha.currency} />
          <Dato etiqueta="Estado del tenant" valor={ficha.status} />
          <Dato etiqueta="Modo de acceso" valor={ficha.access_mode} />
          <Dato etiqueta="Prueba hasta" valor={sub?.status === "trial" ? fechaCorta(sub.trial_ends_at) : "—"} />
          <Dato etiqueta="Alta" valor={fechaCorta(ficha.created_at)} />
          <Dato
            etiqueta="Propietario"
            valor={propietarios.length > 0 ? propietarios.map((p) => p.name || "Sin nombre").join(", ") : "Ninguno todavía"}
          />
          <Dato etiqueta="Sedes" valor={String(sedesActivas)} />
          <Dato etiqueta="Módulos activos" valor={String(modulosActivos)} />
          <Dato
            etiqueta="Onboarding"
            valor={
              ficha.onboarding
                ? ficha.onboarding.completed_at
                  ? `Completado el ${fechaCorta(ficha.onboarding.completed_at)}`
                  : `En curso · paso ${ficha.onboarding.current_step ?? "—"}`
                : "Sin registro"
            }
          />
        </dl>
      </section>

      <div id="responsables" className="consola-seccion" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <section className="shell-card" style={{ padding: 16 }}>
          <h2 style={seccionStyle}>Owners y administradores</h2>
          {ficha.responsables.length === 0 ? (
            <p style={vacioStyle}>
              Nadie administra esta iglesia. Hasta que alguien acepte una invitación de propietario, nadie puede
              configurarla.
            </p>
          ) : (
            <table className="serving-table" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Rol</th>
                  <th>Cuenta</th>
                </tr>
              </thead>
              <tbody>
                {ficha.responsables.map((r) => (
                  <tr key={`${r.person_id}-${r.role_key}`}>
                    <td>{r.name || "Sin nombre"}</td>
                    <td>{r.role_key === "church_owner" ? "Propietario" : "Administrador"}</td>
                    <td>{r.has_account ? "Activa" : "Sin cuenta todavía"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p style={{ ...vacioStyle, marginTop: 10 }}>
            Los correos no se muestran aquí: se consultan con permiso de gestión de responsables. No se puede retirar al
            único propietario.
          </p>
        </section>

        <PanelResponsables churchId={ficha.id} invitaciones={ficha.invitaciones} puedeGestionar={puedeResponsables} />
      </div>

      <section id="sedes" className="shell-card consola-seccion" style={{ padding: 16 }}>
        <h2 style={seccionStyle}>Sedes</h2>
        {ficha.sedes.length === 0 ? (
          <p style={vacioStyle}>Sin sedes.</p>
        ) : (
          <table className="serving-table" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th>Sede</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {ficha.sedes.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.archived_at ? "Archivada" : "Activa"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p style={{ ...vacioStyle, marginTop: 10 }}>Solo metadatos: los datos de cada sede son de la iglesia.</p>
      </section>

      <div id="modulos" className="consola-seccion">
        <ModulosPanel churchId={ficha.id} modulos={ficha.modulos} puedeGestionar={puedeModulos} />
      </div>

      <div id="suscripcion" className="consola-seccion" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <section className="shell-card" style={{ padding: 16 }}>
          <h2 style={seccionStyle}>Suscripción</h2>
          {sub ? (
            <dl style={rejillaStyle}>
              <Dato etiqueta="Plan" valor={sub.plan_key} />
              <Dato etiqueta="Estado" valor={sub.status} />
              <Dato etiqueta="Inicio de la prueba" valor={fechaCorta(sub.trial_started_at)} />
              <Dato etiqueta="Fin de la prueba" valor={fechaCorta(sub.trial_ends_at)} />
              <Dato etiqueta="Pago pendiente desde" valor={fechaCorta(sub.past_due_since)} />
              <Dato etiqueta="Fin de la gracia" valor={fechaCorta(sub.grace_ends_at)} />
              <Dato etiqueta="Cancelada" valor={fechaCorta(sub.cancelled_at)} />
              <Dato etiqueta="Renueva" valor={fechaCorta(sub.renews_at)} />
            </dl>
          ) : (
            <p style={vacioStyle}>Sin suscripción registrada.</p>
          )}
          <p style={{ ...vacioStyle, marginTop: 10 }}>
            No hay cobro integrado todavía: aquí no hay botones de pago.
            {!puedeVerComercial && " Ver plan, derechos y excepciones necesita permiso comercial."}
          </p>
        </section>

        {puedeVerComercial && (
          <PanelComercial
            churchId={ficha.id}
            estado={estadoServicio}
            derechos={derechos}
            excepciones={excepciones}
            versiones={versiones}
            puedeGestionar={puedeGestionarComercial}
          />
        )}
      </div>

      <PanelSoporte churchId={ficha.id} puedeGestionar={tiene(acceso.contexto, "platform.support.manage")} />

      <PanelSeguridad
        churchId={ficha.id}
        bloqueada={ficha.security_blocked}
        bloqueadaDesde={ficha.security_blocked_at}
        puedeLeerMotivo={tiene(acceso.contexto, "platform.church_security.read")}
        puedeGestionar={tiene(acceso.contexto, "platform.church_security.manage")}
      />

      <section id="auditoria" className="shell-card consola-seccion" style={{ padding: 16 }}>
        <h2 style={seccionStyle}>Auditoría de plataforma</h2>
        {ficha.historial.length === 0 ? (
          <p style={vacioStyle}>Todavía no consta ninguna acción de operación sobre esta iglesia.</p>
        ) : (
          <table className="serving-table" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {ficha.historial.map((h, i) => (
                <tr key={`${h.action}-${h.created_at}-${i}`}>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {new Date(h.created_at).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })}
                  </td>
                  <td>{h.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p style={{ ...vacioStyle, marginTop: 10 }}>
          Últimas 50 acciones del equipo. Solo la acción y la fecha: sin contenido sensible.
        </p>
      </section>
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | null }) {
  return (
    <>
      <dt style={{ color: "var(--shell-text-muted)" }}>{etiqueta}</dt>
      <dd style={{ margin: 0, fontWeight: 500 }}>{valor ?? "—"}</dd>
    </>
  );
}

const seccionStyle: React.CSSProperties = { margin: "0 0 10px", fontSize: 15 };
const rejillaStyle: React.CSSProperties = {
  margin: 0,
  display: "grid",
  gridTemplateColumns: "max-content 1fr",
  gap: "6px 16px",
  fontSize: 13,
};
const vacioStyle: React.CSSProperties = { margin: 0, fontSize: 12.5, color: "var(--shell-text-muted)" };
