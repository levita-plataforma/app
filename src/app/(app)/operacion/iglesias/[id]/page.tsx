import Link from "next/link";
import { notFound } from "next/navigation";
import { getChurchDetail, tiene } from "@/server/platform/platform-service";
import { requireOperator } from "../../guard";
import ModulosPanel from "./ModulosPanel";
import PanelComercial from "./PanelComercial";
import {
  getChurchEntitlements,
  getServiceState,
  listOverrides,
  listPlanVersions,
} from "@/server/platform/commercial-service";
import "../../../app-shell.css";

/**
 * Ficha administrativa de una iglesia.
 *
 * Enseña lo necesario para administrarla como cliente: en qué estado está, qué
 * plan tiene, quién la lleva, qué módulos usa y qué ha hecho el equipo sobre
 * ella. No enseña su directorio, ni sus menores, ni su información pastoral, ni
 * sus donaciones: para eso hay que ser de esa iglesia, no del equipo de LEVITA.
 *
 * Los correos de los responsables tampoco salen aquí. Se consultan con una
 * acción aparte, que exige gestionar responsables y deja constancia.
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
  const puedeVerComercial = tiene(acceso.contexto, "platform.commercial.read");
  const puedeGestionarComercial = tiene(acceso.contexto, "platform.commercial.manage");

  // En paralelo porque son cuatro lecturas independientes: encadenarlas solo
  // sumaría latencias.
  const [estadoServicio, derechos, excepciones, versiones] = puedeVerComercial
    ? await Promise.all([
        getServiceState(id),
        getChurchEntitlements(id),
        listOverrides(id),
        listPlanVersions(),
      ])
    : [null, [], [], []];

  return (
    <div style={{ minHeight: "100svh", background: "var(--shell-bg)", padding: "32px 20px" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <header>
          <Link href="/operacion/iglesias" style={{ fontSize: 12.5 }}>
            Volver a iglesias
          </Link>
          <h1 style={{ margin: "6px 0 0", fontSize: 20 }}>{ficha.name}</h1>
          <p style={{ margin: "4px 0 0", color: "var(--shell-text-muted)", fontSize: 13 }}>
            {ficha.slug} · {ficha.timezone ?? "sin zona"} · alta el{" "}
            {new Date(ficha.created_at).toLocaleDateString("es-ES", { dateStyle: "medium" })}
          </p>
        </header>

        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
          <section className="shell-card" style={{ padding: 16 }}>
            <h2 style={seccionStyle}>Suscripción</h2>
            {ficha.subscription ? (
              <dl style={listaStyle}>
                <Dato etiqueta="Plan" valor={ficha.subscription.plan_key} />
                <Dato etiqueta="Estado" valor={ficha.subscription.status} />
                <Dato etiqueta="Renueva" valor={fecha(ficha.subscription.renews_at)} />
                <Dato etiqueta="Prueba hasta" valor={fecha(ficha.subscription.trial_ends_at)} />
              </dl>
            ) : (
              <p style={vacioStyle}>Sin suscripción registrada.</p>
            )}
            <p style={{ ...vacioStyle, marginTop: 8 }}>
              {puedeVerComercial
                ? "El plan, los derechos y las excepciones están más abajo, en la sección comercial."
                : "Solo consulta: gestionar lo comercial necesita su propia capacidad."}
            </p>
          </section>

          <section className="shell-card" style={{ padding: 16 }}>
            <h2 style={seccionStyle}>Alta</h2>
            {ficha.onboarding ? (
              <dl style={listaStyle}>
                <Dato
                  etiqueta="Estado"
                  valor={ficha.onboarding.completed_at ? "Completada" : "Sin terminar"}
                />
                <Dato etiqueta="Paso actual" valor={ficha.onboarding.current_step ?? "—"} />
                <Dato etiqueta="Empezó" valor={fecha(ficha.onboarding.started_at)} />
                <Dato etiqueta="Terminó" valor={fecha(ficha.onboarding.completed_at)} />
              </dl>
            ) : (
              <p style={vacioStyle}>Esta iglesia no tiene registro de alta.</p>
            )}
          </section>
        </div>

        <section className="shell-card" style={{ padding: 16 }}>
          <h2 style={seccionStyle}>Responsables</h2>
          {ficha.responsables.length === 0 ? (
            <p style={vacioStyle}>
              Nadie administra esta iglesia. Hasta que alguien acepte una invitación de propietario,
              nadie puede configurarla.
            </p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.8 }}>
              {ficha.responsables.map((r) => (
                <li key={`${r.person_id}-${r.role_key}`}>
                  {r.name || "Sin nombre"} · {r.role_key === "church_owner" ? "Propietario" : "Administrador"}
                  {!r.has_account && " · sin cuenta todavía"}
                </li>
              ))}
            </ul>
          )}
          <p style={{ ...vacioStyle, marginTop: 10 }}>
            Los correos no se muestran aquí: se consultan con permiso de gestión de responsables y
            queda constancia de cada consulta.
          </p>
        </section>

        <section className="shell-card" style={{ padding: 16 }}>
          <h2 style={seccionStyle}>Invitaciones</h2>
          {ficha.invitaciones.length === 0 ? (
            <p style={vacioStyle}>No hay invitaciones.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.8 }}>
              {ficha.invitaciones.map((i) => (
                <li key={i.id}>
                  {i.role_key === "church_owner" ? "Propietario" : "Administrador"} ·{" "}
                  {i.caducada ? "caducada" : i.status}
                  {i.expires_at && ` · hasta ${fecha(i.expires_at)}`}
                </li>
              ))}
            </ul>
          )}
        </section>

        <ModulosPanel
          churchId={ficha.id}
          modulos={ficha.modulos}
          puedeGestionar={puedeModulos}
        />

        {/*
          La parte comercial solo se carga si la cuenta puede verla: sin la
          capacidad, las RPC devuelven vacío y la sección enseñaría un hueco sin
          explicar por qué.
        */}
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

        <section className="shell-card" style={{ padding: 16 }}>
          <h2 style={seccionStyle}>Sedes</h2>
          {ficha.sedes.length === 0 ? (
            <p style={vacioStyle}>Sin sedes.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.8 }}>
              {ficha.sedes.map((s) => (
                <li key={s.id}>
                  {s.name}
                  {s.archived_at && " · archivada"}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="shell-card" style={{ padding: 16 }}>
          <h2 style={seccionStyle}>Qué ha hecho el equipo</h2>
          {ficha.historial.length === 0 ? (
            <p style={vacioStyle}>Todavía no consta ninguna acción de operación sobre esta iglesia.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.8 }}>
              {ficha.historial.map((h, i) => (
                <li key={`${h.action}-${h.created_at}-${i}`}>
                  {new Date(h.created_at).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })} ·{" "}
                  {h.action}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | null }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <dt style={{ color: "var(--shell-text-muted)" }}>{etiqueta}</dt>
      <dd style={{ margin: 0, fontWeight: 500 }}>{valor ?? "—"}</dd>
    </div>
  );
}

function fecha(valor: string | null): string {
  if (!valor) return "—";
  return new Date(valor).toLocaleDateString("es-ES", { dateStyle: "medium" });
}

const seccionStyle: React.CSSProperties = { margin: "0 0 10px", fontSize: 15 };
const listaStyle: React.CSSProperties = { margin: 0, display: "flex", flexDirection: "column", gap: 6, fontSize: 13 };
const vacioStyle: React.CSSProperties = { margin: 0, fontSize: 12.5, color: "var(--shell-text-muted)" };
