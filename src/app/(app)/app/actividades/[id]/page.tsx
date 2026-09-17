import { notFound } from "next/navigation";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import {
  getActivity,
  getActivityCapabilities,
  getActivityHistory,
  type ActivityCapabilities,
} from "@/server/activities/activities-service";
import { toDomainError } from "@/server/activities/rpc";
import { TEMPLATE_SKIP_REASON_LABELS } from "@/lib/activities/constants";
import { isUuid } from "../../calendario/calendar-utils";
import { loadStructureTabs } from "./_estructura/load";
import { loadEquipo } from "./_equipo/load";
import ActivityFicha, { type CampusOption, type HistoryData, type SkipNotice } from "./_ficha/ActivityFicha";
import "../actividades.css";

type SearchParams = { omitidos?: string; omitidosTotal?: string; creadas?: string };

const NO_CAPABILITIES: ActivityCapabilities = {
  manage: false,
  publish: false,
  cancel: false,
  archive: false,
  managePlan: false,
  duplicate: false,
  readAdminNotes: false,
  servingEnabled: false,
  managePositionsByArea: {},
};

const PEOPLE_LIMIT = 300;

type PersonRow = { id: string; first_name: string; last_name: string | null; preferred_name: string | null };

function personName(p: PersonRow): string {
  return [p.preferred_name || p.first_name, p.last_name].filter(Boolean).join(" ").trim();
}

/** Aviso de elementos de plantilla omitidos (viene en la URL tras crear). */
function parseSkipNotice(params: SearchParams): SkipNotice | null {
  if (!params.omitidos) return null;
  try {
    const raw = JSON.parse(params.omitidos) as unknown;
    if (!Array.isArray(raw)) return null;
    const items = raw
      .filter((x): x is { k: string; n: string; r: string } => typeof x === "object" && x !== null && "n" in x)
      .slice(0, 20)
      .map((x) => ({
        kind: x.k === "position" ? ("position" as const) : ("area" as const),
        name: String(x.n).slice(0, 80),
        reason: TEMPLATE_SKIP_REASON_LABELS[String(x.r)] ?? "no está disponible",
      }));
    if (items.length === 0) return null;
    const total = Math.max(items.length, Number(params.omitidosTotal) || 0);
    return { items, total };
  } catch {
    return null;
  }
}

export default async function ActividadDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const tenant = await requireTenantContext();
  // Un id que no es UUID no existe: evita que PostgREST responda con un error de tipo.
  if (!isUuid(id)) notFound();

  const activity = await getActivity(tenant.churchId, id);
  if (!activity) notFound();

  const supabase = await createSupabaseServerClient();
  const capabilitiesPromise = getActivityCapabilities(activity.id).catch(() => null);
  const structurePromise = loadStructureTabs(tenant.churchId, activity);
  const [capabilities, data, equipo, history, campusRes, currentCampusRes, { data: church }] = await Promise.all([
    capabilitiesPromise,
    structurePromise,
    // Equipo (Fase 5): asignaciones, sustituciones, permisos por área y revisión actual.
    Promise.all([capabilitiesPromise, structurePromise]).then(([c, structure]) =>
      loadEquipo(tenant.churchId, activity, structure.structure.areas, Boolean(c?.servingEnabled)),
    ),
    // El historial es secundario: si falla, la pestaña lo indica sin tumbar la ficha.
    getActivityHistory(tenant.churchId, activity).catch(
      (): HistoryData => ({ canRead: true, entries: [], error: true }),
    ),
    supabase
      .from("campuses")
      .select("id, name, timezone")
      .eq("church_id", tenant.churchId)
      .is("archived_at", null)
      .order("name"),
    // La sede actual se incluye aunque esté archivada, para no perderla al editar.
    activity.campusId
      ? supabase
          .from("campuses")
          .select("id, name, timezone, archived_at")
          .eq("church_id", tenant.churchId)
          .eq("id", activity.campusId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("churches").select("timezone").eq("id", tenant.churchId).maybeSingle(),
  ]);
  if (campusRes.error) throw toDomainError(campusRes.error, "No se pudieron cargar las sedes.");
  if (currentCampusRes.error) throw toDomainError(currentCampusRes.error, "No se pudo cargar la sede de la actividad.");
  const caps = capabilities ?? NO_CAPABILITIES;

  const campuses: CampusOption[] = ((campusRes.data ?? []) as { id: string; name: string; timezone: string | null }[]).map(
    (c) => ({ ...c, archived: false }),
  );
  const currentCampus = currentCampusRes.data as
    | { id: string; name: string; timezone: string | null; archived_at: string | null }
    | null;
  if (activity.campusId && !campuses.some((c) => c.id === activity.campusId)) {
    campuses.push({
      id: activity.campusId,
      name: currentCampus?.name ?? activity.campusName ?? "Sede actual",
      timezone: currentCampus?.timezone ?? null,
      archived: Boolean(currentCampus?.archived_at),
    });
  }

  let people: { id: string; name: string }[] = [];
  if (caps.manage) {
    // Orden por nombre en la consulta: el límite se aplica sobre la lista ya ordenada.
    const [peopleRes, organizerRes] = await Promise.all([
      supabase
        .from("people")
        .select("id, first_name, last_name, preferred_name, church_people!inner(church_id, archived_at)")
        .eq("church_people.church_id", tenant.churchId)
        .is("church_people.archived_at", null)
        .order("first_name")
        .order("last_name")
        .limit(PEOPLE_LIMIT),
      activity.organizerPersonId
        ? supabase
            .from("people")
            .select("id, first_name, last_name, preferred_name")
            .eq("id", activity.organizerPersonId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (peopleRes.error) throw toDomainError(peopleRes.error, "No se pudieron cargar las personas.");
    if (organizerRes.error) throw toDomainError(organizerRes.error, "No se pudo cargar el responsable.");
    people = ((peopleRes.data ?? []) as PersonRow[])
      .map((p) => ({ id: p.id, name: personName(p) }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
    // El responsable actual siempre debe aparecer, aunque quede fuera del límite.
    if (activity.organizerPersonId && !people.some((p) => p.id === activity.organizerPersonId)) {
      const organizer = organizerRes.data as PersonRow | null;
      people.unshift({
        id: activity.organizerPersonId,
        name: organizer ? personName(organizer) : (activity.organizerName ?? "Responsable actual (no visible)"),
      });
    }
  }

  const created = Number(query.creadas) || null;

  return (
    <ActivityFicha
      activity={activity}
      capabilities={caps}
      data={data}
      equipo={equipo}
      history={history}
      campuses={campuses}
      churchTimezone={(church?.timezone as string | null) ?? "UTC"}
      people={people}
      skipNotice={parseSkipNotice(query)}
      createdOccurrences={created && created > 1 ? created : null}
    />
  );
}
