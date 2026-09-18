import Link from "next/link";
import { CalendarDays, Users, ClipboardCheck, UserCheck, Clock3, Plus } from "lucide-react";
import StatCard from "@/components/shell/StatCard";
import Pagination from "@/components/shell/Pagination";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { getEventsDashboard, listEvents, type EventListFilters } from "@/server/events/events-service";
import { ensureEventsModule } from "./module-gate";
import { primaryButtonStyle, secondaryButtonStyle, EVENT_VISIBILITY_LABELS, formatDateTime } from "./ui";
import { ACTIVITY_STATUS_INFO } from "@/lib/activities/constants";

type SearchParams = {
  when?: string;
  status?: string;
  visibility?: string;
  campus?: string;
  registration?: string;
  full?: string;
  q?: string;
  page?: string;
  pageSize?: string;
};

function isUuid(value: string | undefined): value is string {
  return !!value && /^[0-9a-f-]{36}$/i.test(value);
}

export default async function EventosPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const tenant = await requireTenantContext();
  const disabled = await ensureEventsModule(tenant.churchId);
  if (disabled) return disabled;

  const supabase = await createSupabaseServerClient();

  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Number(params.pageSize) || 25;

  const filters: EventListFilters = {
    when: params.when === "upcoming" || params.when === "past" ? params.when : undefined,
    activityStatus:
      params.status && ["draft", "planned", "published", "completed", "cancelled", "archived"].includes(params.status)
        ? (params.status as EventListFilters["activityStatus"])
        : undefined,
    visibility:
      params.visibility && ["internal", "members", "public"].includes(params.visibility)
        ? (params.visibility as EventListFilters["visibility"])
        : undefined,
    campusId: isUuid(params.campus) ? params.campus : undefined,
    registrationEnabled: params.registration === "yes" ? true : params.registration === "no" ? false : undefined,
    full: params.full === "1",
    search: params.q?.trim() || undefined,
    page,
    pageSize,
  };

  const [dashboard, { items, total }, { data: campuses }] = await Promise.all([
    getEventsDashboard(tenant.churchId),
    listEvents(tenant.churchId, filters),
    supabase.from("campuses").select("id, name").eq("church_id", tenant.churchId).is("archived_at", null).order("name"),
  ]);

  const hasFilters = Boolean(
    filters.when || filters.activityStatus || filters.visibility || filters.campusId || params.registration || filters.full || filters.search,
  );

  return (
    <>
      <section
        style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600 }}>Eventos</h1>
          <p style={{ color: "var(--shell-text-muted)", fontSize: 13, marginTop: 4 }}>
            Publica eventos, gestiona inscripciones, aforo y check-in.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/app/eventos/nuevo" style={primaryButtonStyle()}>
            <Plus size={14} /> Nuevo evento
          </Link>
        </div>
      </section>

      <div className="stat-grid">
        <StatCard
          icon={CalendarDays}
          value={String(dashboard.upcomingEventsCount)}
          label="Próximos eventos"
          accentBg="var(--mod-events-bg)"
          accentFg="var(--mod-events-fg)"
        />
        <StatCard
          icon={ClipboardCheck}
          value={String(dashboard.openRegistrationsCount)}
          label="Inscripciones abiertas"
          accentBg="var(--mod-events-bg)"
          accentFg="var(--mod-events-fg)"
        />
        <StatCard
          icon={Users}
          value={String(dashboard.upcomingRegisteredCount)}
          label="Inscritos en próximos eventos"
          accentBg="var(--mod-people-bg)"
          accentFg="var(--mod-people-fg)"
        />
        <StatCard
          icon={UserCheck}
          value={String(dashboard.fullEventsCount)}
          label="Eventos completos"
          accentBg="var(--mod-serving-bg)"
          accentFg="var(--mod-serving-fg)"
        />
        <StatCard
          icon={Clock3}
          value={String(dashboard.pendingWaitlistCount)}
          label="En lista de espera"
          accentBg="var(--mod-families-bg)"
          accentFg="var(--mod-families-fg)"
        />
      </div>

      <form className="shell-card serving-toolbar" style={{ padding: 14, display: "flex", flexWrap: "wrap", gap: 8 }}>
        <input
          type="search"
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Buscar evento…"
          aria-label="Buscar evento"
          style={{
            padding: "8px 12px",
            borderRadius: "var(--shell-radius-sm)",
            border: "1px solid var(--shell-border)",
            fontSize: 13,
            minWidth: 180,
            flex: "1 1 180px",
          }}
        />
        <select name="when" defaultValue={params.when ?? ""} aria-label="Cuándo" style={selectStyle}>
          <option value="">Próximos y pasados</option>
          <option value="upcoming">Próximos</option>
          <option value="past">Pasados</option>
        </select>
        <select name="status" defaultValue={params.status ?? ""} aria-label="Estado" style={selectStyle}>
          <option value="">Todos los estados</option>
          <option value="draft">Borrador</option>
          <option value="planned">Planificado</option>
          <option value="published">Publicado</option>
          <option value="completed">Completado</option>
          <option value="cancelled">Cancelado</option>
          <option value="archived">Archivado</option>
        </select>
        <select name="visibility" defaultValue={params.visibility ?? ""} aria-label="Visibilidad" style={selectStyle}>
          <option value="">Toda visibilidad</option>
          <option value="internal">Interno</option>
          <option value="members">Miembros</option>
          <option value="public">Público</option>
        </select>
        {(campuses ?? []).length > 0 ? (
          <select name="campus" defaultValue={params.campus ?? ""} aria-label="Sede" style={selectStyle}>
            <option value="">Todas las sedes</option>
            {(campuses ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : null}
        <select name="registration" defaultValue={params.registration ?? ""} aria-label="Inscripción" style={selectStyle}>
          <option value="">Con y sin inscripción</option>
          <option value="yes">Con inscripción</option>
          <option value="no">Sin inscripción</option>
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
          <input type="checkbox" name="full" value="1" defaultChecked={params.full === "1"} /> Solo completos
        </label>
        <button type="submit" style={secondaryButtonStyle()}>
          Filtrar
        </button>
        {hasFilters ? (
          <Link href="/app/eventos" style={{ fontSize: 12, alignSelf: "center", color: "var(--shell-text-subtle)" }}>
            Limpiar filtros
          </Link>
        ) : null}
      </form>

      {items.length === 0 ? (
        <div className="shell-card shell-empty-state" style={{ padding: "48px 24px" }}>
          <h3>{hasFilters ? "No hay eventos con estos filtros" : "Todavía no hay eventos"}</h3>
          <p>
            {hasFilters
              ? "Prueba a quitar algún filtro."
              : "Crea tu primer evento desde cero o a partir de una actividad existente."}
          </p>
          {!hasFilters ? (
            <Link href="/app/eventos/nuevo" style={{ ...primaryButtonStyle(), marginTop: 12 }}>
              Crear el primer evento
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="shell-card list-card">
          <div className="people-table-wrap">
            <table className="serving-table">
              <thead>
                <tr>
                  <th>Evento</th>
                  <th>Fecha</th>
                  <th>Sede</th>
                  <th>Estado</th>
                  <th>Visibilidad</th>
                  <th>Inscritos</th>
                  <th>Waitlist</th>
                </tr>
              </thead>
              <tbody>
                {items.map((event) => {
                  const statusInfo = ACTIVITY_STATUS_INFO[event.activityStatus as keyof typeof ACTIVITY_STATUS_INFO];
                  const toneToChip: Record<string, string> = {
                    success: " is-success",
                    warning: " is-warning",
                    danger: " is-danger",
                    muted: " is-muted",
                    default: "",
                  };
                  const isFull = event.capacity !== null && event.confirmedCount >= event.capacity;
                  return (
                    <tr key={event.id}>
                      <td data-label="Evento">
                        <Link
                          href={`/app/eventos/${event.id}`}
                          style={{ fontWeight: 600, color: "var(--shell-text)", textDecoration: "none" }}
                        >
                          {event.title}
                        </Link>
                        {isFull ? (
                          <span className="serving-chip is-warning" style={{ marginLeft: 6 }}>
                            Completo
                          </span>
                        ) : null}
                      </td>
                      <td data-label="Fecha" className="serving-meta">
                        {formatDateTime(event.startsAt)}
                      </td>
                      <td data-label="Sede" className="serving-meta">
                        {event.campusName ?? "Toda la iglesia"}
                      </td>
                      <td data-label="Estado">
                        {statusInfo ? (
                          <span className={`serving-chip${toneToChip[statusInfo.tone]}`}>{statusInfo.label}</span>
                        ) : (
                          event.activityStatus
                        )}
                      </td>
                      <td data-label="Visibilidad" className="serving-meta">
                        {EVENT_VISIBILITY_LABELS[event.visibility] ?? event.visibility}
                      </td>
                      <td data-label="Inscritos">
                        {event.registrationEnabled
                          ? `${event.confirmedCount}${event.capacity !== null ? `/${event.capacity}` : ""}`
                          : "—"}
                      </td>
                      <td data-label="Waitlist">{event.registrationEnabled ? event.waitlistCount : "—"}</td>
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

const selectStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: "var(--shell-radius-sm)",
  border: "1px solid var(--shell-border)",
  fontSize: 13,
};
