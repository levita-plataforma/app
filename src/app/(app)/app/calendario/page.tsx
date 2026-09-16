import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, List, Plus, Rows3 } from "lucide-react";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import {
  canCreateAnywhere,
  getCreationScopes,
  listActivities,
  listFlexibleTasks,
  type ActivitySummary,
  type CreationScopes,
} from "@/server/activities/activities-service";
import { listServiceAreas } from "@/server/serving/service-areas-service";
import {
  ACTIVITY_STATUSES,
  ACTIVITY_STATUS_INFO,
  ACTIVITY_TYPES,
  ACTIVITY_TYPE_INFO,
  isActivityStatus,
  isActivityType,
} from "@/lib/activities/constants";
import { addDaysToKey, localDateKey, monthGridKeys, startOfWeekKey } from "@/lib/activities/time";
import { primaryButtonStyle, secondaryButtonStyle } from "../servicios/ui";
import {
  addMonthsToKey,
  firstOfMonthKey,
  formatKeyDayMonth,
  formatMonthLabel,
  groupByDay,
  isUuid,
  isValidKey,
  keyParts,
  keysBetween,
  lastOfMonthKey,
  rangeInstants,
  type CalendarView,
} from "./calendar-utils";
import { AgendaDays, FlexibleTasksCard, MonthView, WeekView } from "./CalendarViews";
import "./calendario.css";

type SearchParams = {
  vista?: string;
  fecha?: string;
  sede?: string;
  tipo?: string;
  estado?: string;
  area?: string;
  archivadas?: string;
  page?: string;
};

const PAGE_SIZE = 100;

const VIEWS: { key: CalendarView; label: string; icon: typeof CalendarDays }[] = [
  { key: "mes", label: "Mes", icon: CalendarDays },
  { key: "semana", label: "Semana", icon: Rows3 },
  { key: "lista", label: "Lista", icon: List },
];

/**
 * Calendario operativo de actividades (Fase 4). Todo se resuelve en el
 * servidor: el servicio aplica filtros y la RLS decide qué actividades ve el
 * usuario antes de devolver datos. Las fechas se agrupan y formatean en la
 * zona de CADA actividad; "hoy" se calcula en la zona de la iglesia.
 */
export default async function CalendarioPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const tenant = await requireTenantContext();
  const supabase = await createSupabaseServerClient();

  const [{ data: church }, { data: campusRows }, scopes] = await Promise.all([
    supabase.from("churches").select("timezone").eq("id", tenant.churchId).maybeSingle(),
    supabase
      .from("campuses")
      .select("id, name")
      .eq("church_id", tenant.churchId)
      .is("archived_at", null)
      .order("name"),
    getCreationScopes(tenant.churchId).catch((): CreationScopes | null => null),
  ]);

  const churchTimezone = (church?.timezone as string | undefined) ?? "UTC";
  const todayKey = localDateKey(new Date().toISOString(), churchTimezone);
  const servingEnabled = Boolean(scopes?.servingEnabled);
  const canCreate = scopes ? canCreateAnywhere(scopes) : false;
  const campuses = (campusRows ?? []) as { id: string; name: string }[];

  // Parámetros validados: nada inválido llega a la consulta.
  const view: CalendarView = params.vista === "semana" || params.vista === "lista" ? params.vista : "mes";
  const refKey = isValidKey(params.fecha) ? params.fecha : todayKey;
  const campusId = isUuid(params.sede) ? params.sede : undefined;
  const type = params.tipo && isActivityType(params.tipo) ? params.tipo : undefined;
  const status = params.estado && isActivityStatus(params.estado) ? params.estado : undefined;
  const serviceAreaId = servingEnabled && isUuid(params.area) ? params.area : undefined;
  const includeArchived = params.archivadas === "1";
  const page = view === "lista" ? Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1) : 1;

  const areas = servingEnabled
    ? (await listServiceAreas(tenant.churchId, { active: true, pageSize: 100 }).catch(() => ({ items: [] }))).items
    : [];

  // Claves civiles visibles y periodo anterior/siguiente según la vista.
  const { month } = keyParts(refKey);
  let visibleKeys: string[];
  let prevKey: string;
  let nextKey: string;
  let periodLabel: string;
  if (view === "mes") {
    visibleKeys = monthGridKeys(keyParts(refKey).year, month);
    prevKey = addMonthsToKey(firstOfMonthKey(refKey), -1);
    nextKey = addMonthsToKey(firstOfMonthKey(refKey), 1);
    periodLabel = formatMonthLabel(refKey);
  } else if (view === "semana") {
    const monday = startOfWeekKey(refKey);
    visibleKeys = keysBetween(monday, addDaysToKey(monday, 6));
    prevKey = addDaysToKey(monday, -7);
    nextKey = addDaysToKey(monday, 7);
    periodLabel = `Semana del ${formatKeyDayMonth(monday)} al ${formatKeyDayMonth(addDaysToKey(monday, 6))}`;
  } else {
    visibleKeys = keysBetween(firstOfMonthKey(refKey), lastOfMonthKey(refKey));
    prevKey = addMonthsToKey(firstOfMonthKey(refKey), -1);
    nextKey = addMonthsToKey(firstOfMonthKey(refKey), 1);
    periodLabel = formatMonthLabel(refKey);
  }

  // Bordes como instantes con margen de ±14 h (ver rangeInstants).
  const { from, to } = rangeInstants(visibleKeys[0], visibleKeys[visibleKeys.length - 1]);
  const flexibleExcluded = Boolean(type && type !== "task");

  const [{ items, total }, flexibleTasks] = await Promise.all([
    listActivities(tenant.churchId, {
      from,
      to,
      campusId,
      type,
      status,
      serviceAreaId,
      includeArchived,
      page,
      pageSize: PAGE_SIZE,
    }),
    flexibleExcluded
      ? Promise.resolve([] as ActivitySummary[])
      : listFlexibleTasks(tenant.churchId, { from, to, campusId, status, serviceAreaId, includeArchived }),
  ]);

  const byDay = groupByDay(items, visibleKeys);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasMore = total > PAGE_SIZE;

  const filterParams: Record<string, string | undefined> = {
    sede: campusId,
    tipo: type,
    estado: status,
    area: serviceAreaId,
    archivadas: includeArchived ? "1" : undefined,
  };
  const hasFilters = Object.values(filterParams).some(Boolean);

  function href(overrides: Record<string, string | undefined>): string {
    const merged: Record<string, string | undefined> = { vista: view, fecha: refKey, ...filterParams, ...overrides };
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(merged)) if (value) qs.set(key, value);
    return `/app/calendario?${qs.toString()}`;
  }

  const dayHref = (key: string) => `${href({ vista: "semana", fecha: key })}#dia-${key}`;
  const listKeysWithItems = visibleKeys.filter((key) => byDay.has(key));

  return (
    <>
      <section className="cal-header">
        <div>
          <h1 className="cal-title">Calendario</h1>
          <p className="cal-subtitle">Cultos, reuniones, ensayos y tareas de tu iglesia. Las horas se muestran en la zona de cada actividad.</p>
        </div>
        <div className="cal-header-actions">
          <Link href="/app/actividades" style={secondaryButtonStyle()}>
            Ver actividades
          </Link>
          {canCreate ? (
            <Link href="/app/actividades/nueva" style={primaryButtonStyle()}>
              <Plus size={14} aria-hidden="true" />
              Nueva actividad
            </Link>
          ) : null}
        </div>
      </section>

      <div className="shell-card cal-controls">
        <nav className="cal-period" aria-label="Periodo">
          <Link href={href({ fecha: prevKey, page: undefined })} className="cal-icon-button" aria-label="Periodo anterior">
            <ChevronLeft size={16} aria-hidden="true" />
          </Link>
          <Link href={href({ fecha: todayKey, page: undefined })} className="cal-today-button">
            Hoy
          </Link>
          <Link href={href({ fecha: nextKey, page: undefined })} className="cal-icon-button" aria-label="Periodo siguiente">
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
          <h2 className="cal-period-label" aria-live="polite">
            {periodLabel}
          </h2>
        </nav>

        <nav className="cal-views" aria-label="Vista del calendario">
          {VIEWS.map(({ key, label, icon: Icon }) => (
            <Link
              key={key}
              href={href({ vista: key, page: undefined })}
              className="cal-view-link"
              aria-current={view === key ? "page" : undefined}
            >
              <Icon size={14} aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>
      </div>

      <form className="shell-card cal-filters" method="get" action="/app/calendario" aria-label="Filtros del calendario">
        <input type="hidden" name="vista" value={view} />
        <input type="hidden" name="fecha" value={refKey} />
        {campuses.length > 0 ? (
          <label className="cal-field">
            <span>Sede</span>
            <select name="sede" defaultValue={campusId ?? ""}>
              <option value="">Todas las sedes</option>
              {campuses.map((campus) => (
                <option key={campus.id} value={campus.id}>
                  {campus.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="cal-field">
          <span>Tipo</span>
          <select name="tipo" defaultValue={type ?? ""}>
            <option value="">Todos los tipos</option>
            {ACTIVITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {ACTIVITY_TYPE_INFO[t].label}
              </option>
            ))}
          </select>
        </label>
        <label className="cal-field">
          <span>Estado</span>
          <select name="estado" defaultValue={status ?? ""}>
            <option value="">Todos los estados</option>
            {ACTIVITY_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ACTIVITY_STATUS_INFO[s].label}
              </option>
            ))}
          </select>
        </label>
        {servingEnabled && areas.length > 0 ? (
          <label className="cal-field">
            <span>Área de servicio</span>
            <select name="area" defaultValue={serviceAreaId ?? ""}>
              <option value="">Todas las áreas</option>
              {areas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="cal-check">
          <input type="checkbox" name="archivadas" value="1" defaultChecked={includeArchived} />
          <span>Incluir archivadas</span>
        </label>
        <div className="cal-filter-actions">
          <button type="submit" style={secondaryButtonStyle()}>
            Filtrar
          </button>
          {hasFilters ? (
            <Link href={`/app/calendario?vista=${view}&fecha=${refKey}`} className="cal-clear">
              Limpiar filtros
            </Link>
          ) : null}
        </div>
      </form>

      {hasMore && view !== "lista" ? (
        <p className="cal-notice" role="status">
          Hay más actividades en este periodo; usa filtros o la{" "}
          <Link href={href({ vista: "lista", page: undefined })}>vista lista</Link>.
        </p>
      ) : null}

      <div className="cal-layout">
        <div className="cal-main">
          {view === "mes" ? (
            <MonthView gridKeys={visibleKeys} month={month} todayKey={todayKey} byDay={byDay} dayHref={dayHref} />
          ) : view === "semana" ? (
            <WeekView weekKeys={visibleKeys} todayKey={todayKey} byDay={byDay} />
          ) : listKeysWithItems.length === 0 ? (
            <div className="shell-card shell-empty-state">
              <h3>No hay actividades en este periodo</h3>
              <p>{hasFilters ? "Prueba a quitar filtros o a cambiar de mes." : "Prueba otro mes o crea una actividad."}</p>
            </div>
          ) : (
            <AgendaDays keys={listKeysWithItems} byDay={byDay} todayKey={todayKey} />
          )}

          {view === "lista" && totalPages > 1 ? (
            <nav className="cal-pager" aria-label="Paginación">
              <span>
                {total} actividades · página {page} de {totalPages}
              </span>
              <div className="cal-pager-links">
                {page > 1 ? (
                  <Link href={href({ page: String(page - 1) })} className="cal-icon-button" aria-label="Página anterior">
                    <ChevronLeft size={16} aria-hidden="true" />
                  </Link>
                ) : null}
                {page < totalPages ? (
                  <Link href={href({ page: String(page + 1) })} className="cal-icon-button" aria-label="Página siguiente">
                    <ChevronRight size={16} aria-hidden="true" />
                  </Link>
                ) : null}
              </div>
            </nav>
          ) : null}
        </div>

        <FlexibleTasksCard tasks={flexibleTasks} hiddenByTypeFilter={flexibleExcluded} />
      </div>
    </>
  );
}
