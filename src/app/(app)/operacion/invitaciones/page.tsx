import Link from "next/link";
import { listPlatformInvitations } from "@/server/platform/platform-service";
import { requireOperator } from "../guard";
import { fechaCorta } from "../estado-tenant";
import AccionesInvitacion from "./AccionesInvitacion";
import "../../app-shell.css";

type SearchParams = { estado?: string };

const ESTADOS = [
  { valor: "pendientes", texto: "Pendientes" },
  { valor: "caducadas", texto: "Caducadas" },
  { valor: "todas", texto: "Todas" },
] as const;

/**
 * Invitaciones de propietarios y administradores de todas las iglesias. Muestra
 * correos, así que exige platform.owners.manage (la base lo comprueba).
 */
export default async function InvitacionesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const acceso = await requireOperator("platform.owners.manage");
  if ("bloqueado" in acceso) return acceso.bloqueado;

  const params = await searchParams;
  const estado = ESTADOS.find((e) => e.valor === params.estado)?.valor ?? "pendientes";
  const invitaciones = await listPlatformInvitations(estado);

  return (
    <div className="consola-pagina">
      <header>
        <h1>Invitaciones</h1>
        <p className="consola-sub">
          Propietarios y administradores invitados. No se envía ningún correo: el enlace se entrega a mano y solo se ve al
          crearlo o reenviarlo.
        </p>
      </header>

      <nav aria-label="Filtrar invitaciones" className="consola-secciones" style={{ position: "static" }}>
        {ESTADOS.map((e) => (
          <Link
            key={e.valor}
            href={`/operacion/invitaciones?estado=${e.valor}`}
            aria-current={e.valor === estado ? "page" : undefined}
            style={e.valor === estado ? { color: "var(--shell-text)", fontWeight: 600 } : undefined}
          >
            {e.texto}
          </Link>
        ))}
      </nav>

      {invitaciones.length === 0 ? (
        <div className="shell-card shell-empty-state" style={{ padding: "40px 20px" }}>
          <h3>No hay invitaciones en esta vista</h3>
        </div>
      ) : (
        <div className="shell-card" style={{ padding: 0, overflowX: "auto" }}>
          <table className="serving-table" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th>Iglesia</th>
                <th>Invitado</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Creada</th>
                <th>Caduca</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {invitaciones.map((i) => (
                <tr key={i.id}>
                  <td>
                    <Link href={`/operacion/iglesias/${i.churchId}`}>{i.churchName}</Link>
                  </td>
                  <td>
                    {i.invitedName && <div>{i.invitedName}</div>}
                    <div style={{ fontSize: 11.5, color: "var(--shell-text-muted)" }}>{i.email}</div>
                  </td>
                  <td>{i.roleKey === "church_owner" ? "Propietario" : "Administrador"}</td>
                  <td>
                    {i.caducada ? (
                      <span className="serving-chip is-danger">Caducada</span>
                    ) : i.status === "pending" ? (
                      <span className="serving-chip is-warning">Pendiente</span>
                    ) : (
                      <span className="serving-chip is-muted">{i.status}</span>
                    )}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>{fechaCorta(i.createdAt)}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{fechaCorta(i.expiresAt)}</td>
                  <td>{i.status === "pending" && <AccionesInvitacion id={i.id} churchId={i.churchId} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
