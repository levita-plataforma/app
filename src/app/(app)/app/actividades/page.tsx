import Link from "next/link";
import { CalendarDays, CalendarRange, LayoutTemplate, ListChecks, Plus } from "lucide-react";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import {
  canCreateAnywhere,
  getCreationScopes,
  listActivities,
  listFlexibleTasks,
  type ActivitySummary,
} from "@/server/activities/activities-service";
import { getStructureStatusFor } from "@/server/activities/activities-dashboard-service";
import {
  LOCAL_DAY_FETCH_CAP,
  listActivitiesByLocalDays,
  marginInstants,
  overlapsLocalDays,
} from "@/server/activities/activities-local-days";
import { toDomainError } from "@/server/activities/rpc";
import { listServiceAreas } from "@/server/serving/service-areas-service";
import {
  ACTIVITY_STATUSES,
  ACTIVITY_STATUS_INFO,
  ACTIVITY_TYPES,
  ACTIVITY_TYPE_INFO,
  isActivityStatus,
  isActivityType,
} from "@/lib/activities/constants";
import { primaryButtonStyle, secondaryButtonStyle } from "@/app/(app)/app/servicios/ui";
import ActivitiesTable from "./_components/ActivitiesTable";
import ListPager from "./_components/ListPager";
import { isUuid, isValidKey } from "../calendario/calendar-utils";
import "./actividades.css";

type SearchParams = {
  q?: string;
  tipo?: string;
  estado?: string;
  sede?: string;
  area?: string;
  periodo?: string;
  desde?: string;
  hasta?: string;
  archivadas?: string;
  pagina?: string;
};

const PAGE_SIZE = 25;
const PERIODS = { proximas: "Próximas", pasadas: "Pasadas", todas: "Todas" } as const;
type Period = keyof typeof PERIODS;

export default async function ActividadesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const tenant = await requireTenantContext();
  const supabase = await createSupabaseServerClient();

  const type = params.tipo && isActivityType(params.tipo) ? params.tipo : undefined;
  const status = params.estado && isActivityStatus(params.estado) ? params.estado : undefined;
  const period: Period = params.periodo === "pasadas" || params.periodo === "todas" ? params.periodo : "proximas";
  const desde = isValidKey(params.desde) ? params.desde : undefined;
  const hasta = isValidKey(params.hasta) ? params.hasta : undefined;
  const includeArchived = params.archivadas === "1";
  const page = Math.max(1, Number(params.pagina) || 1);
  const search = params.q?.trim() || undefined;

  const scopes = await getCreationScopes(tenant.churchId);
  // Parámetros UUID inválidos se ignoran: nunca llegan a la consulta.
  const campusId = isUuid(params.sede) ? params.sede : undefined;
  const serviceAreaId = scopes.servingEnabled && isUuid(params.area) ? params.area : undefined;

  // Rango: las fechas explícitas sustituyen al periodo y se interpretan como
  // días civiles en la zona de CADA actividad (no en UTC). Ver
  // listActivitiesByLocalDays: se consulta con margen ±14 h, se filtra por
  // localDateKey en servidor y se pagina después de filtrar (máx. 200 filas).
  const nowIso = new Date().toISOString();
  const byLocalDays = Boolean(desde || hasta);
  let from: string | undefined;
  let to: string | undefined;
  if (byLocalDays) {
    ({ from, to } = marginInstants(desde, hasta));
  } else if (period === "proximas") {
    from = nowIso;
  } else if (period === "pasadas") {
    to = nowIso;
  }
  const hasRange = Boolean(from || to);
  const showFlexible = (!type || type === "task") && hasRange;
  const baseFilters = { campusId, type, status, serviceAreaId, search, includeArchived };

  const [list, flexibleRaw, campusRes, areas] = await Promise.all([
    byLocalDays
      ? listActivitiesByLocalDays(
          tenant.churchId,
          baseFilters,
          { firstKey: desde, lastKey: hasta },
          { page, pageSize: PAGE_SIZE },
        )
      : listActivities(tenant.churchId, {
          ...baseFilters,
          from,
          to,
          // "Pasadas": de la más reciente a la más antigua.
          order: period === "pasadas" ? "desc" : "asc",
          page,
          pageSize: PAGE_SIZE,
        }).then((r) => ({ ...r, capped: false })),
    showFlexible
      ? listFlexibleTasks(tenant.churchId, { from, to, campusId, status, serviceAreaId, includeArchived, search })
      : Promise.resolve([] as ActivitySummary[]),
    supabase.from("campuses").select("id, name").eq("church_id", tenant.churchId).is("archived_at", null).order("name"),
    scopes.servingEnabled
      ? listServiceAreas(tenant.churchId, { pageSize: 100 }).then((r) => r.items)
      : Promise.resolve([]),
  ]);
  if (campusRes.error) throw toDomainError(campusRes.error, "No se pudieron cargar las sedes.");
  const campuses = campusRes.data;

  // Con fechas explícitas se descartan las tareas que solo entran por el margen de zona.
  const flexible = byLocalDays ? flexibleRaw.filter((a) => overlapsLocalDays(a, desde, hasta)) : flexibleRaw;

  let structure = new Map<string, { blocking: number; warnings: number }>();
  try {
    structure = await getStructureStatusFor([...list.items, ...flexible].map((a) => a.id));
  } catch {
    // Sin indicador de estructura si la validación falla; el listado sigue siendo útil.
  }

  const canCreate = canCreateAnywhere(scopes);
  const currentParams: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (key !== "pagina" && typeof value === "string" && value) currentParams[key] = value;
  }
  const hasFilters = Boolean(search || type || status || campusId || serviceAreaId || desde || hasta || includeArchived);
  const periodLabel = desde || hasta ? "en las fechas indicadas" : period === "proximas" ? "próximas" : period === "pasadas" ? "pasadas" : "";

  return (
    <>
      <section className="act-page-header">
        <div className="act-title-row">
          <span className="act-module-icon">
            <CalendarDays size={18} aria-hidden="true" />
          </span>
          <div>
            <h1>Actividades</h1>
            <p className="act-subtitle">Cultos, reuniones, eventos, ensayos y tareas de la iglesia.</p>
          </div>
        </div>
        <div className="act-actions">
          <Link href="/app/calendario" style={secondaryButtonStyle()}>
            <CalendarRange size={14} aria-hidden="true" /> Calendario
          </Link>
          <Link href="/app/actividades/plantillas" style={secondaryButtonStyle()}>
            <LayoutTemplate size={14} aria-hidden="true" /> Plantillas
          </Link>
          {canCreate ? (
            <Link href="/app/actividades/nueva" style={primaryButtonStyle()}>
              <Plus size={14} aria-hidden="true" /> Nueva actividad
            </Link>
          ) : null}
        </div>
      </section>

      <form method="get" action="/app/actividades" className="shell-card serving-toolbar act-filters" role="search">
        <div className="act-field is-wide">
          <label className="act-label" htmlFor="f-q">
            Buscar
          </label>
          <input id="f-q" className="act-input" type="search" name="q" defaultValue={params.q ?? ""} placeholder="Título…" />
        </div>
        <div className="act-field">
          <label className="act-label" htmlFor="f-periodo">
            Periodo
          </label>
          <select id="f-periodo" className="act-input" name="periodo" defaultValue={period}>
            {(Object.keys(PERIODS) as Period[]).map((p) => (
              <option key={p} value={p}>
                {PERIODS[p]}
              </option>
            ))}
          </select>
        </div>
        <div className="act-field">
          <label className="act-label" htmlFor="f-tipo">
            Tipo
          </label>
          <select id="f-tipo" className="act-input" name="tipo" defaultValue={type ?? ""}>
            <option value="">Todos</option>
            {ACTIVITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {ACTIVITY_TYPE_INFO[t].label}
              </option>
            ))}
          </select>
        </div>
        <div className="act-field">
          <label className="act-label" htmlFor="f-estado">
            Estado
          </label>
          <select id="f-estado" className="act-input" name="estado" defaultValue={status ?? ""}>
            <option value="">Todos (sin archivadas)</option>
            {ACTIVITY_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ACTIVITY_STATUS_INFO[s].label}
              </option>
            ))}
          </select>
        </div>
        {(campuses ?? []).length > 0 ? (
          <div className="act-field">
            <label className="act-label" htmlFor="f-sede">
              Sede
            </label>
            <select id="f-sede" className="act-input" name="sede" defaultValue={campusId ?? ""}>
              <option value="">Todas</option>
              {(campuses ?? []).map((c) => (
                <option key={c.id as string} value={c.id as string}>
                  {c.name as string}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {scopes.servingEnabled && areas.length > 0 ? (
          <div className="act-field">
            <label className="act-label" htmlFor="f-area">
              Área de servicio
            </label>
            <select id="f-area" className="act-input" name="area" defaultValue={serviceAreaId ?? ""}>
              <option value="">Todas</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="act-field">
          <label className="act-label" htmlFor="f-desde">
            Desde
          </label>
          <input id="f-desde" className="act-input" type="date" name="desde" defaultValue={desde ?? ""} />
        </div>
        <div className="act-field">
          <label className="act-label" htmlFor="f-hasta">
            Hasta
          </label>
          <input id="f-hasta" className="act-input" type="date" name="hasta" defaultValue={hasta ?? ""} />
        </div>
        <label className="act-check">
          <input type="checkbox" name="archivadas" value="1" defaultChecked={includeArchived} />
          Incluir archivadas
        </label>
        <div className="act-actions">
          <button type="submit" style={primaryButtonStyle()}>
            Filtrar
          </button>
          {hasFilters || period !== "proximas" ? (
            <Link href="/app/actividades" style={secondaryButtonStyle()}>
              Limpiar
            </Link>
          ) : null}
        </div>
      </form>
      {desde || hasta ? (
        <p className="act-hint">
          Las fechas indicadas sustituyen al periodo seleccionado y se aplican en la zona horaria de cada actividad.
        </p>
      ) : null}
      {list.capped ? (
        <p className="act-hint" role="status">
          Hay más de {LOCAL_DAY_FETCH_CAP} actividades en esas fechas: solo se tienen en cuenta las primeras{" "}
          {LOCAL_DAY_FETCH_CAP}. Acota el rango o añade filtros para ver el resto.
        </p>
      ) : null}

      <section className="shell-card act-table-card">
        {list.items.length === 0 ? (
          <div className="shell-empty-state">
            <span className="act-module-icon">
              <CalendarDays size={18} aria-hidden="true" />
            </span>
            <h3>{hasFilters ? "Ninguna actividad coincide con los filtros" : `No hay actividades ${periodLabel}`.trim()}</h3>
            <p>
              {hasFilters
                ? "Prueba a quitar filtros o cambiar el periodo."
                : canCreate
                  ? "Crea la primera desde cero o a partir de una plantilla."
                  : "Cuando se programen actividades aparecerán aquí."}
            </p>
            {canCreate && !hasFilters ? (
              <Link href="/app/actividades/nueva" style={primaryButtonStyle()}>
                <Plus size={14} aria-hidden="true" /> Nueva actividad
              </Link>
            ) : null}
          </div>
        ) : (
          <ActivitiesTable activities={list.items} structure={structure} caption="Actividades" />
        )}
      </section>

      {list.total > PAGE_SIZE ? (
        <ListPager page={list.page} pageSize={list.pageSize} total={list.total} params={currentParams} />
      ) : null}

      {showFlexible ? (
        <section className="shell-card list-card">
          <div className="list-card-header">
            <h2 style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <ListChecks size={16} aria-hidden="true" /> Tareas sin hora fija
            </h2>
            {canCreate ? <Link href="/app/actividades/nueva?tipo=task">Nueva tarea</Link> : null}
          </div>
          {flexible.length === 0 ? (
            <p className="serving-meta">No hay tareas sin hora fija pendientes en este periodo.</p>
          ) : (
            <ActivitiesTable activities={flexible} structure={structure} caption="Tareas sin hora fija" />
          )}
        </section>
      ) : null}
    </>
  );
}
