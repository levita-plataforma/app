import Link from "next/link";
import { UserRound, UserX, Users, Inbox, DoorClosed, Plus, Tags } from "lucide-react";
import StatCard from "@/components/shell/StatCard";
import Pagination from "@/components/shell/Pagination";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { hasCapability } from "@/server/tenant/authorize";
import { getGroupMetrics, listGroupTypes, listGroups, type GroupListFilters } from "@/server/groups/groups-service";
import {
  GROUP_JOIN_POLICIES,
  GROUP_JOIN_POLICY_INFO,
  GROUP_STATUSES,
  GROUP_STATUS_INFO,
  GROUP_VISIBILITIES,
  GROUP_VISIBILITY_INFO,
} from "@/lib/groups/constants";
import { ensureGroupsModule } from "./module-gate";
import { CHIP_CLASS, formatOccupancy, isUuid, primaryButtonStyle, secondaryButtonStyle, selectStyle } from "./ui";

type SearchParams = {
  estado?: string;
  visibilidad?: string;
  ingreso?: string;
  sede?: string;
  tipo?: string;
  sinResponsable?: string;
  q?: string;
  page?: string;
  pageSize?: string;
};

/**
 * Directorio interno de grupos (decisión P-1): no hay superficie pública en
 * ninguna parte de esta fase. Cada filtro se valida contra su lista blanca
 * antes de llegar al servicio; lo que no encaja se descarta en vez de viajar
 * a la consulta.
 */
export default async function GruposPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const tenant = await requireTenantContext();
  const disabled = await ensureGroupsModule(tenant.churchId);
  if (disabled) return disabled;

  const supabase = await createSupabaseServerClient();

  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Number(params.pageSize) || 25;

  const filters: GroupListFilters = {
    status:
      params.estado && (GROUP_STATUSES as readonly string[]).includes(params.estado)
        ? (params.estado as GroupListFilters["status"])
        : undefined,
    visibility:
      params.visibilidad && (GROUP_VISIBILITIES as readonly string[]).includes(params.visibilidad)
        ? (params.visibilidad as GroupListFilters["visibility"])
        : undefined,
    joinPolicy:
      params.ingreso && (GROUP_JOIN_POLICIES as readonly string[]).includes(params.ingreso)
        ? (params.ingreso as GroupListFilters["joinPolicy"])
        : undefined,
    campusId: isUuid(params.sede) ? params.sede : undefined,
    groupTypeId: isUuid(params.tipo) ? params.tipo : undefined,
    withoutLeader: params.sinResponsable === "1",
    search: params.q?.trim() || undefined,
    page,
    pageSize,
  };

  const [metrics, { items, total }, groupTypes, { data: campuses }, canCreate, canManageTypes] = await Promise.all([
    getGroupMetrics(tenant.churchId),
    listGroups(tenant.churchId, filters),
    listGroupTypes(tenant.churchId),
    supabase.from("campuses").select("id, name").eq("church_id", tenant.churchId).is("archived_at", null).order("name"),
    hasCapability(tenant.churchId, "group.create"),
    hasCapability(tenant.churchId, "group.manage"),
  ]);

  const hasFilters = Boolean(
    filters.status ||
      filters.visibility ||
      filters.joinPolicy ||
      filters.campusId ||
      filters.groupTypeId ||
      filters.withoutLeader ||
      filters.search,
  );

  return (
    <>
      <section
        style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600 }}>Grupos</h1>
          <p style={{ color: "var(--shell-text-muted)", fontSize: 13, marginTop: 4 }}>
            Crea comunidad: grupos, responsables, participantes, reuniones y asistencia.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/app/grupos/solicitudes" style={secondaryButtonStyle()}>
            <Inbox size={14} /> Solicitudes
          </Link>
          {canManageTypes ? (
            <Link href="/app/grupos/tipos" style={secondaryButtonStyle()}>
              <Tags size={14} /> Tipos de grupo
            </Link>
          ) : null}
          {canCreate ? (
            <Link href="/app/grupos/nuevo" style={primaryButtonStyle()}>
              <Plus size={14} /> Nuevo grupo
            </Link>
          ) : null}
        </div>
      </section>

      <div className="stat-grid">
        <StatCard
          icon={UserRound}
          value={String(metrics.activeGroups)}
          label="Grupos activos"
          accentBg="var(--mod-groups-bg)"
          accentFg="var(--mod-groups-fg)"
        />
        <StatCard
          icon={Users}
          value={String(metrics.activeMembers)}
          label="Personas participando"
          accentBg="var(--mod-people-bg)"
          accentFg="var(--mod-people-fg)"
        />
        <StatCard
          icon={UserX}
          value={String(metrics.groupsWithoutLeader)}
          label="Grupos sin responsable"
          accentBg="var(--mod-groups-bg)"
          accentFg="var(--mod-groups-fg)"
        />
        <StatCard
          icon={Inbox}
          value={String(metrics.pendingRequests)}
          label="Solicitudes pendientes"
          accentBg="var(--mod-events-bg)"
          accentFg="var(--mod-events-fg)"
        />
        <StatCard
          icon={DoorClosed}
          value={String(metrics.groupsAtCapacity)}
          label="Grupos con el aforo lleno"
          accentBg="var(--mod-serving-bg)"
          accentFg="var(--mod-serving-fg)"
        />
      </div>

      {metrics.groupsWithoutLeader > 0 ? (
        <div
          className="shell-card"
          style={{ padding: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}
        >
          <span className="serving-chip is-warning">Sin responsable</span>
          <span style={{ fontSize: 12.5, color: "var(--shell-text-muted)" }}>
            {metrics.groupsWithoutLeader === 1
              ? "Hay 1 grupo activo sin responsable vigente."
              : `Hay ${metrics.groupsWithoutLeader} grupos activos sin responsable vigente.`}{" "}
            El grupo sigue funcionando; solo falta quien lo lleve.
          </span>
          <Link href="/app/grupos?sinResponsable=1" style={{ fontSize: 12, color: "var(--shell-brand)" }}>
            Verlos
          </Link>
        </div>
      ) : null}

      <form className="shell-card serving-toolbar" style={{ padding: 14, display: "flex", flexWrap: "wrap", gap: 8 }}>
        <input
          type="search"
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Buscar grupo…"
          aria-label="Buscar grupo"
          style={{
            padding: "8px 12px",
            borderRadius: "var(--shell-radius-sm)",
            border: "1px solid var(--shell-border)",
            fontSize: 13,
            minWidth: 180,
            flex: "1 1 180px",
          }}
        />
        <select name="estado" defaultValue={params.estado ?? ""} aria-label="Estado" style={selectStyle}>
          <option value="">Todos los estados</option>
          {GROUP_STATUSES.map((status) => (
            <option key={status} value={status}>
              {GROUP_STATUS_INFO[status].label}
            </option>
          ))}
        </select>
        <select name="visibilidad" defaultValue={params.visibilidad ?? ""} aria-label="Visibilidad" style={selectStyle}>
          <option value="">Toda visibilidad</option>
          {GROUP_VISIBILITIES.map((visibility) => (
            <option key={visibility} value={visibility}>
              {GROUP_VISIBILITY_INFO[visibility].label}
            </option>
          ))}
        </select>
        <select name="ingreso" defaultValue={params.ingreso ?? ""} aria-label="Forma de ingreso" style={selectStyle}>
          <option value="">Cualquier forma de ingreso</option>
          {GROUP_JOIN_POLICIES.map((policy) => (
            <option key={policy} value={policy}>
              {GROUP_JOIN_POLICY_INFO[policy].label}
            </option>
          ))}
        </select>
        {groupTypes.length > 0 ? (
          <select name="tipo" defaultValue={params.tipo ?? ""} aria-label="Tipo de grupo" style={selectStyle}>
            <option value="">Todos los tipos</option>
            {groupTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        ) : null}
        {(campuses ?? []).length > 0 ? (
          <select name="sede" defaultValue={params.sede ?? ""} aria-label="Sede" style={selectStyle}>
            <option value="">Todas las sedes</option>
            {(campuses ?? []).map((campus) => (
              <option key={campus.id} value={campus.id}>
                {campus.name}
              </option>
            ))}
          </select>
        ) : null}
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
          <input type="checkbox" name="sinResponsable" value="1" defaultChecked={params.sinResponsable === "1"} /> Solo
          sin responsable
        </label>
        <button type="submit" style={secondaryButtonStyle()}>
          Filtrar
        </button>
        {hasFilters ? (
          <Link href="/app/grupos" style={{ fontSize: 12, alignSelf: "center", color: "var(--shell-text-subtle)" }}>
            Limpiar filtros
          </Link>
        ) : null}
      </form>

      {items.length === 0 ? (
        <div className="shell-card shell-empty-state" style={{ padding: "48px 24px" }}>
          <h3>{hasFilters ? "No hay grupos con estos filtros" : "Todavía no hay grupos"}</h3>
          <p>
            {hasFilters
              ? "Prueba a quitar algún filtro."
              : "Crea el primer grupo para empezar a organizar la vida de comunidad de tu iglesia."}
          </p>
          {!hasFilters && canCreate ? (
            <Link href="/app/grupos/nuevo" style={{ ...primaryButtonStyle(), marginTop: 12 }}>
              Crear el primer grupo
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="shell-card list-card">
          <div className="people-table-wrap">
            <table className="serving-table">
              <thead>
                <tr>
                  <th>Grupo</th>
                  <th>Tipo</th>
                  <th>Sede</th>
                  <th>Estado</th>
                  <th>Visibilidad</th>
                  <th>Participantes</th>
                  <th>Cuándo se reúne</th>
                </tr>
              </thead>
              <tbody>
                {items.map((group) => {
                  const statusInfo = GROUP_STATUS_INFO[group.status];
                  const isFull = group.capacity !== null && group.memberCount >= group.capacity;
                  return (
                    <tr key={group.id}>
                      <td data-label="Grupo">
                        <Link
                          href={`/app/grupos/${group.id}`}
                          style={{ fontWeight: 600, color: "var(--shell-text)", textDecoration: "none" }}
                        >
                          {group.name}
                        </Link>
                        {group.leaderCount === 0 ? (
                          <span className="serving-chip is-warning" style={{ marginLeft: 6 }}>
                            Sin responsable
                          </span>
                        ) : null}
                        {isFull ? (
                          <span className="serving-chip is-muted" style={{ marginLeft: 6 }}>
                            Aforo lleno
                          </span>
                        ) : null}
                      </td>
                      <td data-label="Tipo" className="serving-meta">
                        {group.groupTypeName ?? "Sin tipo"}
                      </td>
                      <td data-label="Sede" className="serving-meta">
                        {group.campusName ?? "Toda la iglesia"}
                      </td>
                      <td data-label="Estado">
                        <span className={CHIP_CLASS[statusInfo.tone]}>{statusInfo.label}</span>
                      </td>
                      <td data-label="Visibilidad" className="serving-meta">
                        {GROUP_VISIBILITY_INFO[group.visibility].label}
                      </td>
                      <td data-label="Participantes">{formatOccupancy(group.memberCount, group.capacity)}</td>
                      <td data-label="Cuándo se reúne" className="serving-meta">
                        {group.meetingScheduleText ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {total > pageSize ? <Pagination page={page} pageSize={pageSize} total={total} /> : null}
    </>
  );
}
