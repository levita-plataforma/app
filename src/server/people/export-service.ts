import "server-only";
import { requireCapability } from "@/server/tenant/authorize";
import { auditLog } from "@/server/audit/audit-log";
import { listPeople, type PeopleFilters } from "@/server/people/people-service";

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/**
 * Exportación CSV de personas respetando filtros activos (encargo §22).
 * No pagina: exporta el conjunto filtrado completo, con un límite práctico
 * razonable para evitar generar ficheros ilimitados desde una sola
 * petición HTTP.
 */
export async function exportPeopleCsv(churchId: string, filters: PeopleFilters = {}): Promise<string> {
  await requireCapability(churchId, "people.export");

  const MAX_ROWS = 5000;
  const { items } = await listPeople(churchId, { ...filters, page: 1, pageSize: 100 });

  // listPeople pagina a 100 como máximo por llamada: se repite hasta
  // agotar resultados o alcanzar MAX_ROWS, respetando los mismos filtros.
  const allItems = [...items];
  let page = 2;
  while (items.length === 100 && allItems.length < MAX_ROWS) {
    const next = await listPeople(churchId, { ...filters, page, pageSize: 100 });
    if (next.items.length === 0) break;
    allItems.push(...next.items);
    page++;
  }

  const header = ["Nombre", "Apellidos", "Email", "Teléfono", "Estado", "Sede", "Tiene cuenta", "Fecha de alta"];
  const rows = allItems.map((p) => [
    p.firstName,
    p.lastName ?? "",
    p.email ?? "",
    p.phone ?? "",
    p.relationship,
    p.campusName ?? "",
    p.hasAccount ? "Sí" : "No",
    p.joinedAt,
  ]);

  const csv = [header, ...rows].map((row) => row.map((cell) => csvEscape(String(cell))).join(",")).join("\n");

  await auditLog({
    churchId,
    action: "export.created",
    entityType: "people",
    metadata: { rows: allItems.length, filters: { ...filters, page: undefined, pageSize: undefined } },
  });

  return csv;
}
