import Link from "next/link";
import { listChurches, tiene } from "@/server/platform/platform-service";
import { requireOperator } from "../guard";
import { EstadoTenant, fechaCorta } from "../estado-tenant";
import "../../app-shell.css";

type SearchParams = {
  q?: string;
  modo?: string;
  prueba?: string;
  pais?: string;
  modulo?: string;
  /** Los dos filtros a los que enlazan los indicadores del resumen. */
  onboarding?: string;
  sinPropietario?: string;
  page?: string;
};

const MODOS = [
  { valor: "", texto: "Todos los estados" },
  { valor: "full", texto: "Activas" },
  { valor: "grace", texto: "Pago pendiente" },
  { valor: "trial_expired", texto: "Prueba vencida" },
  { valor: "suspended", texto: "Suspendidas" },
  { valor: "cancelled", texto: "Canceladas" },
  { valor: "security_blocked", texto: "Bloqueadas por seguridad" },
];

/**
 * Listado de iglesias (tenants). Lo que se enseña es administrativo: estado
 * comercial, prueba, propietario, sedes, módulos, alta y última actividad
 * (solo la fecha). Ningún dato de negocio.
 */
export default async function IglesiasPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const acceso = await requireOperator("platform.churches.read");
  if ("bloqueado" in acceso) return acceso.bloqueado;

  const params = await searchParams;
  const page = Math.max(Number(params.page ?? "1") || 1, 1);
  const soloAltaPendiente = params.onboarding === "pendiente";
  const soloSinPropietario = params.sinPropietario === "1";
  const buscaPorCorreo = tiene(acceso.contexto, "platform.owners.manage");

  const { items, total, pageSize } = await listChurches({
    search: params.q,
    module: params.modulo,
    accessMode: params.modo,
    trial: params.prueba,
    country: params.pais,
    onboardingPendiente: soloAltaPendiente,
    sinPropietario: soloSinPropietario,
    page,
  });

  const paginas = Math.max(Math.ceil(total / pageSize), 1);
  const filtrado = Boolean(params.q || params.modo || params.prueba || params.pais || params.modulo || soloAltaPendiente || soloSinPropietario);

  return (
    <div className="consola-pagina">
      <header style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <h1>Iglesias</h1>
          <p className="consola-sub">
            {total === 1 ? "1 iglesia" : `${total} iglesias`}
            {filtrado && " con los filtros aplicados"}
            {filtrado && (
              <>
                {" · "}
                <Link href="/operacion/iglesias">Quitar filtros</Link>
              </>
            )}
          </p>
        </div>
        {tiene(acceso.contexto, "platform.churches.create") && (
          <Link href="/operacion/altas" className="shell-button" style={{ fontSize: 12.5, textDecoration: "none" }}>
            + Nueva iglesia
          </Link>
        )}
      </header>

      <form className="shell-card" style={{ padding: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          name="q"
          defaultValue={params.q ?? ""}
          placeholder={buscaPorCorreo ? "Nombre, identificador o correo" : "Nombre o identificador"}
          aria-label="Buscar iglesia"
          style={{ ...campoStyle, flex: "2 1 220px" }}
        />
        <select name="modo" defaultValue={params.modo ?? ""} aria-label="Estado" style={campoStyle}>
          {MODOS.map((m) => (
            <option key={m.valor} value={m.valor}>
              {m.texto}
            </option>
          ))}
        </select>
        <select name="prueba" defaultValue={params.prueba ?? ""} aria-label="Prueba" style={campoStyle}>
          <option value="">Prueba: todas</option>
          <option value="vigente">En prueba</option>
          <option value="vencida">Prueba vencida</option>
        </select>
        <input name="pais" defaultValue={params.pais ?? ""} placeholder="País" aria-label="País" style={{ ...campoStyle, maxWidth: 140 }} />
        <label style={{ fontSize: 12.5, display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" name="onboarding" value="pendiente" defaultChecked={soloAltaPendiente} />
          Alta pendiente
        </label>
        <button type="submit" className="shell-button" style={{ fontSize: 12.5 }}>
          Filtrar
        </button>
      </form>

      {items.length === 0 ? (
        <div className="shell-card shell-empty-state" style={{ padding: "40px 20px" }}>
          <h3>No hay iglesias que coincidan</h3>
          <p>Prueba con otro término o quita los filtros.</p>
        </div>
      ) : (
        <div className="shell-card" style={{ padding: 0, overflowX: "auto" }}>
          <table className="serving-table" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th>Iglesia</th>
                <th>Estado</th>
                <th>Prueba</th>
                <th>Propietario</th>
                <th>Sedes</th>
                <th>Módulos</th>
                <th>Alta</th>
                <th>Última actividad</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/operacion/iglesias/${c.id}`}>{c.name}</Link>
                    <div style={{ fontSize: 11.5, color: "var(--shell-text-muted)" }}>
                      {c.slug}
                      {c.country && ` · ${c.country}`}
                    </div>
                  </td>
                  <td>
                    <EstadoTenant modo={c.accessMode} />
                    {!c.onboardingCompleted && (
                      <div style={{ marginTop: 4 }}>
                        <span className="serving-chip is-warning">Alta sin terminar</span>
                      </div>
                    )}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {c.subscriptionStatus === "trial" ? `hasta ${fechaCorta(c.trialEndsAt)}` : "—"}
                  </td>
                  <td>
                    {c.ownerName ? (
                      c.ownerName
                    ) : c.ownerInvitationPending ? (
                      <span className="serving-chip is-warning">Invitado</span>
                    ) : (
                      <span className="serving-chip is-danger">Sin propietario</span>
                    )}
                  </td>
                  <td>{c.campusesCount}</td>
                  <td>{c.modulesEnabled}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{fechaCorta(c.createdAt)}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{fechaCorta(c.lastActivityAt)}</td>
                  <td>
                    <Link href={`/operacion/iglesias/${c.id}`} style={{ fontSize: 12.5 }}>
                      Abrir
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {paginas > 1 && (
        <nav aria-label="Páginas" style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "center", fontSize: 12.5 }}>
          {page > 1 && <Link href={enlacePagina(params, page - 1)}>Anterior</Link>}
          <span style={{ color: "var(--shell-text-muted)" }}>
            Página {page} de {paginas}
          </span>
          {page < paginas && <Link href={enlacePagina(params, page + 1)}>Siguiente</Link>}
        </nav>
      )}
    </div>
  );
}

function enlacePagina(params: SearchParams, pagina: number): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v && k !== "page") q.set(k, v);
  }
  q.set("page", String(pagina));
  return `/operacion/iglesias?${q.toString()}`;
}

const campoStyle: React.CSSProperties = {
  flex: "1 1 160px",
  minWidth: 120,
  padding: "7px 10px",
  borderRadius: "var(--shell-radius-md)",
  border: "1px solid var(--shell-border)",
  fontSize: 13,
  background: "var(--shell-surface, #fff)",
};
