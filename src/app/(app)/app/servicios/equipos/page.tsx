import Link from "next/link";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { hasCapability } from "@/server/tenant/authorize";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { listTeams } from "@/server/serving/service-teams-service";
import { listServiceAreas } from "@/server/serving/service-areas-service";
import Pagination from "@/components/shell/Pagination";
import { ensureServingModule } from "../module-gate";
import EquiposManager from "./EquiposManager";
import { secondaryButtonStyle, fullName } from "../ui";

type SearchParams = {
  q?: string;
  area?: string;
  archived?: string;
  page?: string;
  pageSize?: string;
};

export default async function EquiposPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const tenant = await requireTenantContext();
  const disabled = await ensureServingModule(tenant.churchId);
  if (disabled) return disabled;

  const supabase = await createSupabaseServerClient();
  const page = Number(params.page) || 1;
  const pageSize = Number(params.pageSize) || 25;
  const showingArchived = params.archived === "true";

  const [{ items, total }, { items: areas }, canManage, { data: campuses }, { data: peopleRows }] =
    await Promise.all([
      listTeams(tenant.churchId, {
        search: params.q,
        areaId: params.area,
        archived: showingArchived,
        page,
        pageSize,
      }),
      listServiceAreas(tenant.churchId, { pageSize: 100 }),
      hasCapability(tenant.churchId, "service_teams.manage"),
      supabase.from("campuses").select("id, name").eq("church_id", tenant.churchId).is("archived_at", null),
      supabase
        .from("church_people")
        .select("people!church_people_person_id_fkey!inner(id, first_name, last_name)")
        .eq("church_id", tenant.churchId)
        .is("archived_at", null)
        .limit(500),
    ]);

  const people = (peopleRows ?? [])
    .map((row) => {
      const person = Array.isArray(row.people) ? row.people[0] : row.people;
      return person
        ? {
            id: person.id as string,
            firstName: person.first_name as string,
            lastName: person.last_name as string | null,
          }
        : null;
    })
    .filter((p): p is { id: string; firstName: string; lastName: string | null } => Boolean(p))
    .sort((a, b) => fullName(a.firstName, a.lastName).localeCompare(fullName(b.firstName, b.lastName), "es"));

  return (
    <>
      <section
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600 }}>Equipos</h1>
          <p style={{ color: "var(--shell-text-muted)", fontSize: 13, marginTop: 4 }}>
            Grupos estables de personas dentro de un área. Sin calendario ni rotación.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/app/servicios" style={secondaryButtonStyle()}>
            Volver al resumen
          </Link>
          <Link
            href={showingArchived ? "/app/servicios/equipos" : "/app/servicios/equipos?archived=true"}
            style={secondaryButtonStyle()}
          >
            {showingArchived ? "Ver activos" : "Ver archivados"}
          </Link>
        </div>
      </section>

      <form className="shell-card serving-toolbar" style={{ padding: 14 }}>
        <input
          type="search"
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Buscar equipo…"
          aria-label="Buscar equipo"
          style={{
            padding: "8px 12px",
            borderRadius: "var(--shell-radius-sm)",
            border: "1px solid var(--shell-border)",
            fontSize: 13,
            flex: "1 1 180px",
          }}
        />
        <select
          name="area"
          defaultValue={params.area ?? ""}
          aria-label="Filtrar por área"
          style={{
            padding: "8px 12px",
            borderRadius: "var(--shell-radius-sm)",
            border: "1px solid var(--shell-border)",
            fontSize: 13,
          }}
        >
          <option value="">Todas las áreas</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        {showingArchived ? <input type="hidden" name="archived" value="true" /> : null}
        <button type="submit" style={secondaryButtonStyle()}>
          Filtrar
        </button>
      </form>

      <EquiposManager
        teams={items}
        areas={areas.map((a) => ({ id: a.id, name: a.name }))}
        campuses={campuses ?? []}
        people={people}
        canManage={canManage}
      />

      {total > pageSize ? <Pagination page={page} pageSize={pageSize} total={total} /> : null}
    </>
  );
}
