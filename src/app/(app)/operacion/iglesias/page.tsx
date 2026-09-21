import Link from "next/link";
import { listChurches } from "@/server/platform/platform-service";
import { requireOperator } from "../guard";
import "../../app-shell.css";

type SearchParams = {
  q?: string;
  estado?: string;
  plan?: string;
  modulo?: string;
  desde?: string;
  page?: string;
};

/**
 * Listado de iglesias con búsqueda, filtros y paginación.
 *
 * Lo que se enseña de cada una es administrativo: estado, plan, si terminó el
 * alta, cuántas sedes y cuántas personas tiene. El recuento de personas es un
 * número, nunca una puerta al directorio: para eso haría falta un permiso que
 * este panel no concede.
 */
export default async function IglesiasPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const acceso = await requireOperator("platform.churches.read");
  if ("bloqueado" in acceso) return acceso.bloqueado;

  const params = await searchParams;
  const page = Math.max(Number(params.page ?? "1") || 1, 1);

  const { items, total, pageSize } = await listChurches({
    search: params.q,
    status: params.estado,
    plan: params.plan,
    module: params.modulo,
    createdFrom: params.desde,
    page,
  });

  const paginas = Math.max(Math.ceil(total / pageSize), 1);

  return (
    <div style={{ minHeight: "100svh", background: "var(--shell-bg)", padding: "32px 20px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <header>
          <Link href="/operacion" style={{ fontSize: 12.5 }}>
            Volver al panel
          </Link>
          <h1 style={{ margin: "6px 0 0", fontSize: 20 }}>Iglesias</h1>
          <p style={{ margin: "4px 0 0", color: "var(--shell-text-muted)", fontSize: 13 }}>
            {total === 1 ? "1 iglesia" : `${total} iglesias`}
          </p>
        </header>

        <form className="shell-card" style={{ padding: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Nombre o dirección"
            aria-label="Buscar iglesia"
            style={campoStyle}
          />
          <input
            name="plan"
            defaultValue={params.plan ?? ""}
            placeholder="Plan"
            aria-label="Filtrar por plan"
            style={{ ...campoStyle, maxWidth: 140 }}
          />
          <input
            name="modulo"
            defaultValue={params.modulo ?? ""}
            placeholder="Módulo activo"
            aria-label="Filtrar por módulo"
            style={{ ...campoStyle, maxWidth: 160 }}
          />
          <button type="submit" style={botonStyle}>
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
                  <th>Plan</th>
                  <th>Alta</th>
                  <th>Módulos</th>
                  <th>Sedes</th>
                  <th>Personas</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/operacion/iglesias/${c.id}`}>{c.name}</Link>
                      <div style={{ fontSize: 11.5, color: "var(--shell-text-muted)" }}>{c.slug}</div>
                      {!c.hasOwner && (
                        <span className="serving-chip is-danger" style={{ marginTop: 4, display: "inline-block" }}>
                          Sin propietario
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={c.archivedAt ? "serving-chip is-muted" : "serving-chip is-success"}>
                        {c.archivedAt ? "Archivada" : c.status}
                      </span>
                    </td>
                    <td>{c.planKey ?? "—"}</td>
                    <td>
                      {c.onboardingCompleted ? (
                        <span className="serving-chip is-success">Completada</span>
                      ) : (
                        <span className="serving-chip is-warning">Sin terminar</span>
                      )}
                    </td>
                    <td>{c.modulesEnabled}</td>
                    <td>{c.campusesCount}</td>
                    <td>{c.peopleCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {paginas > 1 && (
          <nav style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center" }}>
            {page > 1 && (
              <Link href={enlacePagina(params, page - 1)} style={botonStyle}>
                Anterior
              </Link>
            )}
            <span style={{ fontSize: 12.5, color: "var(--shell-text-muted)" }}>
              Página {page} de {paginas}
            </span>
            {page < paginas && (
              <Link href={enlacePagina(params, page + 1)} style={botonStyle}>
                Siguiente
              </Link>
            )}
          </nav>
        )}
      </div>
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
  flex: "1 1 180px",
  minWidth: 140,
  padding: "8px 10px",
  borderRadius: "var(--shell-radius-md)",
  border: "1px solid var(--shell-border)",
  fontSize: 13,
};

const botonStyle: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: "var(--shell-radius-md)",
  border: "none",
  background: "var(--shell-brand)",
  color: "#fff",
  fontSize: 12.5,
  fontWeight: 600,
  textDecoration: "none",
  cursor: "pointer",
};
