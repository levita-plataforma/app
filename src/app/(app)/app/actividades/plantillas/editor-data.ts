import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import type { CreationScopes } from "@/server/activities/activities-service";
import { toDomainError } from "@/server/activities/rpc";

/** Datos de apoyo del editor de plantillas (sedes y catálogo de Servicios). */

export type EditorCampusOption = { id: string; name: string };
export type EditorCatalogArea = { id: string; name: string; campusId: string | null };
export type EditorCatalogPosition = {
  id: string;
  serviceAreaId: string;
  name: string;
  description: string | null;
  campusId: string | null;
  minPeople: number;
  maxPeople: number | null;
  critical: boolean;
  requiresAutonomousPerson: boolean;
};

export type TemplateEditorData = {
  /** Sedes en las que la persona puede gestionar plantillas. */
  campuses: EditorCampusOption[];
  /** Puede crear/gestionar plantillas de toda la iglesia (sin sede). */
  allowChurchScope: boolean;
  servingEnabled: boolean;
  catalog: { areas: EditorCatalogArea[]; positions: EditorCatalogPosition[] };
};

export async function loadTemplateEditorData(churchId: string, scopes: CreationScopes): Promise<TemplateEditorData> {
  const supabase = await createSupabaseServerClient();
  const { data: campusRows, error: campusError } = await supabase
    .from("campuses")
    .select("id, name")
    .eq("church_id", churchId)
    .is("archived_at", null)
    .order("name");
  if (campusError) throw toDomainError(campusError, "No se pudieron cargar las sedes.");

  const allCampuses = (campusRows ?? []) as EditorCampusOption[];
  const campuses = scopes.templatesChurch
    ? allCampuses
    : allCampuses.filter((c) => scopes.templatesCampusIds.includes(c.id));

  let areas: EditorCatalogArea[] = [];
  let positions: EditorCatalogPosition[] = [];

  if (scopes.servingEnabled) {
    const [{ data: areaRows, error: areaError }, { data: positionRows, error: positionError }] = await Promise.all([
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
        .select("id, service_area_id, name, description, campus_id, min_people, max_people, critical, requires_autonomous_person")
        .eq("church_id", churchId)
        .eq("active", true)
        .is("archived_at", null)
        .order("sort_order")
        .order("name"),
    ]);
    const catalogError = areaError ?? positionError;
    if (catalogError) throw toDomainError(catalogError, "No se pudo cargar el catálogo de servicio.");
    areas = (areaRows ?? []).map((a) => ({ id: a.id, name: a.name, campusId: a.campus_id }));
    positions = (positionRows ?? []).map((p) => ({
      id: p.id,
      serviceAreaId: p.service_area_id,
      name: p.name,
      description: p.description,
      campusId: p.campus_id,
      minPeople: p.min_people,
      maxPeople: p.max_people,
      critical: p.critical,
      requiresAutonomousPerson: p.requires_autonomous_person,
    }));
  }

  return {
    campuses,
    allowChurchScope: scopes.templatesChurch,
    servingEnabled: scopes.servingEnabled,
    catalog: { areas, positions },
  };
}
