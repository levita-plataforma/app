import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { isModuleEnabled } from "@/server/tenant/authorize";
import { getStructureIssues, type ActivityDetail, type StructureIssue } from "@/server/activities/activities-service";
import {
  getActivityPlan,
  getActivityStructure,
  type ActivityArea,
  type ActivityPlanItem,
  type StructureSummary,
} from "@/server/activities/activity-structure-service";

/**
 * Carga de datos de las pestañas Áreas, Puestos y Plan de la ficha de
 * actividad. Contrato fijo entre la página de detalle y los componentes de
 * `_estructura/`. Lecturas con el cliente del usuario: RLS decide qué ve.
 */

export type CatalogAreaOption = { id: string; name: string; campusId: string | null };
export type CatalogPositionOption = {
  id: string;
  serviceAreaId: string;
  name: string;
  campusId: string | null;
  minPeople: number;
  maxPeople: number | null;
  critical: boolean;
};
export type NamedOption = { id: string; name: string };

export type StructureTabsData = {
  structure: { areas: ActivityArea[]; summary: StructureSummary };
  plan: ActivityPlanItem[];
  issues: StructureIssue[];
  catalog: {
    areas: CatalogAreaOption[];
    positions: CatalogPositionOption[];
    qualifications: NamedOption[];
    credentialTypes: NamedOption[];
  };
  /** Personas activas de la iglesia para elegir responsable de bloque (acotado). */
  people: NamedOption[];
};

const PEOPLE_LIMIT = 300;

type Catalog = StructureTabsData["catalog"];
const EMPTY_CATALOG: Catalog = { areas: [], positions: [], qualifications: [], credentialTypes: [] };

/** Actividad sin sede → todo el catálogo; si no, elementos sin sede o de su sede. */
function campusCompatible(activityCampusId: string | null, campusId: string | null): boolean {
  return activityCampusId === null || campusId === null || campusId === activityCampusId;
}

async function loadCatalog(churchId: string, activityCampusId: string | null): Promise<Catalog> {
  if (!(await isModuleEnabled(churchId, "serving"))) return EMPTY_CATALOG;

  const supabase = await createSupabaseServerClient();
  const [areasRes, positionsRes, qualificationsRes, credentialsRes] = await Promise.all([
    supabase
      .from("service_areas")
      .select("id, name, campus_id")
      .eq("church_id", churchId)
      .eq("active", true)
      .is("archived_at", null)
      .order("sort_order")
      .order("name"),
    supabase
      .from("service_positions")
      .select("id, service_area_id, name, campus_id, min_people, max_people, critical")
      .eq("church_id", churchId)
      .eq("active", true)
      .is("archived_at", null)
      .order("sort_order")
      .order("name"),
    supabase
      .from("qualifications")
      .select("id, name, active")
      .eq("church_id", churchId)
      .is("archived_at", null)
      .order("name"),
    supabase
      .from("credential_types")
      .select("id, name")
      .eq("church_id", churchId)
      .eq("active", true)
      .is("archived_at", null)
      .order("name"),
  ]);

  const areas: CatalogAreaOption[] = ((areasRes.data ?? []) as Record<string, unknown>[])
    .map((row) => ({ id: row.id as string, name: row.name as string, campusId: (row.campus_id as string | null) ?? null }))
    .filter((a) => campusCompatible(activityCampusId, a.campusId));

  const positions: CatalogPositionOption[] = ((positionsRes.data ?? []) as Record<string, unknown>[])
    .map((row) => ({
      id: row.id as string,
      serviceAreaId: row.service_area_id as string,
      name: row.name as string,
      campusId: (row.campus_id as string | null) ?? null,
      minPeople: Number(row.min_people),
      maxPeople: row.max_people === null || row.max_people === undefined ? null : Number(row.max_people),
      critical: Boolean(row.critical),
    }))
    .filter((p) => campusCompatible(activityCampusId, p.campusId));

  const qualifications: NamedOption[] = ((qualificationsRes.data ?? []) as Record<string, unknown>[])
    .filter((row) => row.active !== false)
    .map((row) => ({ id: row.id as string, name: row.name as string }));

  // Sin credential.read, RLS puede no devolver nada: select vacío, no error.
  const credentialTypes: NamedOption[] = ((credentialsRes.data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    name: row.name as string,
  }));

  return { areas, positions, qualifications, credentialTypes };
}

async function loadPeople(churchId: string): Promise<NamedOption[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("people")
    .select("id, first_name, last_name, preferred_name, church_people!inner(church_id, archived_at)")
    .eq("church_people.church_id", churchId)
    .is("church_people.archived_at", null)
    .order("first_name")
    .order("last_name")
    .limit(PEOPLE_LIMIT);
  if (error || !data) return [];

  return (data as Record<string, unknown>[])
    .map((row) => ({
      id: row.id as string,
      name: [(row.preferred_name as string | null) || (row.first_name as string | null), row.last_name as string | null]
        .filter(Boolean)
        .join(" ")
        .trim(),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export async function loadStructureTabs(churchId: string, activity: ActivityDetail): Promise<StructureTabsData> {
  const [structure, plan, issues, catalog, people] = await Promise.all([
    getActivityStructure(activity.id),
    getActivityPlan(activity.id),
    // Las incidencias son informativas: si la validación falla, la ficha sigue cargando.
    getStructureIssues(activity.id).catch((): StructureIssue[] => []),
    loadCatalog(churchId, activity.campusId),
    loadPeople(churchId),
  ]);

  return { structure, plan, issues, catalog, people };
}
