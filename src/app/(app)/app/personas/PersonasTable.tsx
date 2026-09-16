import Link from "next/link";
import type { PersonListItem } from "@/server/people/people-service";

const RELATIONSHIP_LABELS: Record<string, string> = {
  visitor: "Visitante",
  connected: "Conectado",
  member: "Miembro",
  server: "Voluntario",
  leader: "Líder",
  external: "Externo",
  inactive: "Inactivo",
};

function initials(firstName: string, lastName: string | null): string {
  return [firstName, lastName].filter(Boolean).map((n) => n![0]).join("").slice(0, 2).toUpperCase();
}

/**
 * Directorio de personas. En desktop, tabla; en móvil (<860px, ver
 * app-shell.css) se colapsa a tarjetas apiladas mediante CSS, sin
 * duplicar el marcado (encargo de Fase 2 §3, mobile "cards/lista
 * adaptativa").
 */
export default function PersonasTable({ people }: { people: PersonListItem[] }) {
  return (
    <div className="shell-card people-table-wrap">
      <table className="people-table">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Contacto</th>
            <th>Estado</th>
            <th>Sede</th>
            <th>Etiquetas</th>
            <th>Cuenta</th>
            <th aria-label="Acciones" />
          </tr>
        </thead>
        <tbody>
          {people.map((person) => (
            <tr key={person.id} className={person.archivedAt ? "is-archived" : undefined}>
              <td data-label="Nombre">
                <Link href={`/app/personas/${person.id}`} className="people-name-cell">
                  <span className="people-avatar">{initials(person.firstName, person.lastName)}</span>
                  <span>
                    <span className="people-name">
                      {person.firstName} {person.lastName ?? ""}
                    </span>
                    {person.preferredName ? (
                      <span className="people-preferred"> ({person.preferredName})</span>
                    ) : null}
                  </span>
                </Link>
              </td>
              <td data-label="Contacto">
                <span className="people-contact">
                  {person.email ?? "—"}
                  {person.phone ? <span className="people-contact-secondary">{person.phone}</span> : null}
                </span>
              </td>
              <td data-label="Estado">
                <span className="people-badge">{RELATIONSHIP_LABELS[person.relationship] ?? person.relationship}</span>
              </td>
              <td data-label="Sede">{person.campusName ?? "—"}</td>
              <td data-label="Etiquetas">
                <span className="people-tags">
                  {person.tags.length === 0
                    ? "—"
                    : person.tags.map((tag) => (
                        <span key={tag.id} className="people-tag" style={{ background: tag.color ?? "var(--shell-active-bg)" }}>
                          {tag.name}
                        </span>
                      ))}
                </span>
              </td>
              <td data-label="Cuenta">{person.hasAccount ? "Sí" : "No"}</td>
              <td data-label="">
                <Link href={`/app/personas/${person.id}`} className="people-open-link">
                  Abrir
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
