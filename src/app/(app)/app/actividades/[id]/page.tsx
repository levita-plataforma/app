import { notFound } from "next/navigation";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import {
  getActivity,
  getActivityCapabilities,
  getActivityHistory,
  type ActivityCapabilities,
} from "@/server/activities/activities-service";
import { TEMPLATE_SKIP_REASON_LABELS } from "@/lib/activities/constants";
import { loadStructureTabs } from "./_estructura/load";
import ActivityFicha, { type SkipNotice } from "./_ficha/ActivityFicha";
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

type PersonRow = {
  people:
    | { id: string; first_name: string; last_name: string | null; preferred_name: string | null }
    | { id: string; first_name: string; last_name: string | null; preferred_name: string | null }[]
    | null;
};

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

  const activity = await getActivity(tenant.churchId, id);
  if (!activity) notFound();

  const supabase = await createSupabaseServerClient();
  const [capabilities, data, history, { data: campusRows }, { data: church }] = await Promise.all([
    getActivityCapabilities(activity.id).catch(() => null),
    loadStructureTabs(tenant.churchId, activity),
    getActivityHistory(tenant.churchId, activity),
    supabase
      .from("campuses")
      .select("id, name, timezone")
      .eq("church_id", tenant.churchId)
      .is("archived_at", null)
      .order("name"),
    supabase.from("churches").select("timezone").eq("id", tenant.churchId).maybeSingle(),
  ]);
  const caps = capabilities ?? NO_CAPABILITIES;

  let people: { id: string; name: string }[] = [];
  if (caps.manage) {
    const { data: peopleRows } = await supabase
      .from("church_people")
      .select("people!inner(id, first_name, last_name, preferred_name)")
      .eq("church_id", tenant.churchId)
      .is("archived_at", null)
      .limit(300);
    people = ((peopleRows ?? []) as PersonRow[])
      .map((row) => (Array.isArray(row.people) ? row.people[0] : row.people))
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .map((p) => ({ id: p.id, name: [p.preferred_name || p.first_name, p.last_name].filter(Boolean).join(" ") }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
    if (activity.organizerPersonId && activity.organizerName && !people.some((p) => p.id === activity.organizerPersonId)) {
      people.unshift({ id: activity.organizerPersonId, name: activity.organizerName });
    }
  }

  const created = Number(query.creadas) || null;

  return (
    <ActivityFicha
      activity={activity}
      capabilities={caps}
      data={data}
      history={history}
      campuses={(campusRows ?? []) as { id: string; name: string; timezone: string | null }[]}
      churchTimezone={(church?.timezone as string | null) ?? "UTC"}
      people={people}
      skipNotice={parseSkipNotice(query)}
      createdOccurrences={created && created > 1 ? created : null}
    />
  );
}
