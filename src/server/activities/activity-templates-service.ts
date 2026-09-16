import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { callActivityRpc, one, toDomainError } from "@/server/activities/rpc";
import type {
  ActivityType,
  ActivityVisibility,
  AreaRequirement,
  PlanItemType,
  ScheduleKind,
} from "@/lib/activities/constants";

/**
 * Plantillas de actividad (Fase 4 §8, §26). Usar una plantilla COPIA su
 * estructura en la actividad; editar la plantilla después no altera
 * actividades ya creadas. El guardado reemplaza la plantilla completa en una
 * única transacción (save_activity_template).
 */

export type TemplatePositionDraft = {
  servicePositionId: string | null;
  name: string;
  description: string | null;
  critical: boolean;
  minPeople: number;
  maxPeople: number | null;
  requiresAutonomousPerson: boolean;
};

export type TemplateAreaDraft = {
  serviceAreaId: string;
  areaName: string;
  requirement: AreaRequirement;
  notes: string | null;
  positions: TemplatePositionDraft[];
};

export type TemplatePlanItemDraft = {
  itemType: PlanItemType;
  title: string;
  durationMinutes: number | null;
  startOffsetMinutes: number | null;
  responsibleText: string | null;
  notes: string | null;
};

export type TemplateInput = {
  name: string;
  type: ActivityType;
  campusId: string | null;
  defaultTitle: string | null;
  scheduleKind: ScheduleKind;
  /** "HH:MM" */
  defaultLocalStartTime: string | null;
  defaultDurationMinutes: number | null;
  description: string | null;
  visibility: ActivityVisibility;
  locationText: string | null;
  notes: string | null;
  active: boolean;
  sortOrder: number;
  areas: Omit<TemplateAreaDraft, "areaName">[];
  planItems: TemplatePlanItemDraft[];
};

export type ActivityTemplateSummary = {
  id: string;
  name: string;
  type: ActivityType;
  campusId: string | null;
  campusName: string | null;
  scheduleKind: ScheduleKind;
  defaultLocalStartTime: string | null;
  defaultDurationMinutes: number | null;
  active: boolean;
  archivedAt: string | null;
  sortOrder: number;
  areaCount: number;
  positionCount: number;
  planItemCount: number;
  areaNames: string[];
};

export type ActivityTemplateDetail = Omit<TemplateInput, "areas"> & {
  id: string;
  campusName: string | null;
  archivedAt: string | null;
  areas: TemplateAreaDraft[];
};

export async function listActivityTemplates(
  churchId: string,
  options: { includeArchived?: boolean; onlyActive?: boolean } = {},
): Promise<ActivityTemplateSummary[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("activity_templates")
    .select(
      "id, name, type, campus_id, schedule_kind, default_local_start_time, default_duration_minutes, active, archived_at, sort_order, campuses(name), activity_template_areas(id, service_areas(name)), activity_template_positions(id), activity_template_plan_items(id)",
    )
    .eq("church_id", churchId);
  if (!options.includeArchived) query = query.is("archived_at", null);
  if (options.onlyActive) query = query.eq("active", true);

  const { data, error } = await query.order("sort_order").order("name");
  if (error) throw toDomainError(error, "No se pudieron cargar las plantillas.");

  return ((data ?? []) as Record<string, unknown>[]).map((row) => {
    const areas = (row.activity_template_areas as { id: string; service_areas: { name: string } | { name: string }[] | null }[]) ?? [];
    return {
      id: row.id as string,
      name: row.name as string,
      type: row.type as ActivityType,
      campusId: (row.campus_id as string | null) ?? null,
      campusName: one(row.campuses as { name: string } | null)?.name ?? null,
      scheduleKind: row.schedule_kind as ScheduleKind,
      defaultLocalStartTime: row.default_local_start_time ? (row.default_local_start_time as string).slice(0, 5) : null,
      defaultDurationMinutes: (row.default_duration_minutes as number | null) ?? null,
      active: Boolean(row.active),
      archivedAt: (row.archived_at as string | null) ?? null,
      sortOrder: row.sort_order as number,
      areaCount: areas.length,
      positionCount: ((row.activity_template_positions as unknown[]) ?? []).length,
      planItemCount: ((row.activity_template_plan_items as unknown[]) ?? []).length,
      areaNames: areas.map((a) => one(a.service_areas)?.name ?? "").filter(Boolean),
    };
  });
}

export async function getActivityTemplate(churchId: string, templateId: string): Promise<ActivityTemplateDetail | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("activity_templates")
    .select(
      `id, name, type, campus_id, default_title, schedule_kind, default_local_start_time, default_duration_minutes, description,
       visibility, location_text, notes, active, sort_order, archived_at, campuses(name),
       activity_template_areas(id, service_area_id, requirement, notes, sort_order, service_areas(name),
         activity_template_positions(service_position_id, name, description, critical, min_people, max_people, requires_autonomous_person, sort_order)),
       activity_template_plan_items(item_type, title, duration_minutes, start_offset_minutes, responsible_text, notes, sort_order)`,
    )
    .eq("church_id", churchId)
    .eq("id", templateId)
    .maybeSingle();
  if (error) throw toDomainError(error, "No se pudo cargar la plantilla.");
  // maybeSingle sin error y sin datos: no existe o la RLS no la deja ver.
  if (!data) return null;

  const row = data as Record<string, unknown>;
  type AreaRow = {
    service_area_id: string;
    requirement: AreaRequirement;
    notes: string | null;
    sort_order: number;
    service_areas: { name: string } | { name: string }[] | null;
    activity_template_positions: {
      service_position_id: string | null;
      name: string;
      description: string | null;
      critical: boolean;
      min_people: number;
      max_people: number | null;
      requires_autonomous_person: boolean;
      sort_order: number;
    }[];
  };
  type PlanRow = {
    item_type: PlanItemType;
    title: string;
    duration_minutes: number | null;
    start_offset_minutes: number | null;
    responsible_text: string | null;
    notes: string | null;
    sort_order: number;
  };

  return {
    id: row.id as string,
    name: row.name as string,
    type: row.type as ActivityType,
    campusId: (row.campus_id as string | null) ?? null,
    campusName: one(row.campuses as { name: string } | null)?.name ?? null,
    defaultTitle: (row.default_title as string | null) ?? null,
    scheduleKind: row.schedule_kind as ScheduleKind,
    defaultLocalStartTime: row.default_local_start_time ? (row.default_local_start_time as string).slice(0, 5) : null,
    defaultDurationMinutes: (row.default_duration_minutes as number | null) ?? null,
    description: (row.description as string | null) ?? null,
    visibility: row.visibility as ActivityVisibility,
    locationText: (row.location_text as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    active: Boolean(row.active),
    sortOrder: row.sort_order as number,
    archivedAt: (row.archived_at as string | null) ?? null,
    areas: ((row.activity_template_areas as AreaRow[]) ?? [])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((a) => ({
        serviceAreaId: a.service_area_id,
        areaName: one(a.service_areas)?.name ?? "",
        requirement: a.requirement,
        notes: a.notes,
        positions: (a.activity_template_positions ?? [])
          .sort((x, y) => x.sort_order - y.sort_order)
          .map((p) => ({
            servicePositionId: p.service_position_id,
            name: p.name,
            description: p.description,
            critical: p.critical,
            minPeople: p.min_people,
            maxPeople: p.max_people,
            requiresAutonomousPerson: p.requires_autonomous_person,
          })),
      })),
    planItems: ((row.activity_template_plan_items as PlanRow[]) ?? [])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((p) => ({
        itemType: p.item_type,
        title: p.title,
        durationMinutes: p.duration_minutes,
        startOffsetMinutes: p.start_offset_minutes,
        responsibleText: p.responsible_text,
        notes: p.notes,
      })),
  };
}

function templatePayload(input: TemplateInput): Record<string, unknown> {
  return {
    name: input.name,
    type: input.type,
    campus_id: input.campusId,
    default_title: input.defaultTitle,
    schedule_kind: input.scheduleKind,
    default_local_start_time: input.defaultLocalStartTime,
    default_duration_minutes: input.defaultDurationMinutes,
    description: input.description,
    visibility: input.visibility,
    location_text: input.locationText,
    notes: input.notes,
    active: input.active,
    sort_order: input.sortOrder,
    areas: input.areas.map((a) => ({
      service_area_id: a.serviceAreaId,
      requirement: a.requirement,
      notes: a.notes,
      positions: a.positions.map((p) => ({
        service_position_id: p.servicePositionId,
        name: p.name,
        description: p.description,
        critical: p.critical,
        min_people: p.minPeople,
        max_people: p.maxPeople,
        requires_autonomous_person: p.requiresAutonomousPerson,
      })),
    })),
    plan_items: input.planItems.map((p) => ({
      item_type: p.itemType,
      title: p.title,
      duration_minutes: p.durationMinutes,
      start_offset_minutes: p.startOffsetMinutes,
      responsible_text: p.responsibleText,
      notes: p.notes,
    })),
  };
}

/** templateId null = crear. Devuelve el id. */
export async function saveActivityTemplate(churchId: string, templateId: string | null, input: TemplateInput): Promise<string> {
  return callActivityRpc<string>(
    "save_activity_template",
    { p_church_id: churchId, p_template_id: templateId, p_input: templatePayload(input) },
    "No se pudo guardar la plantilla.",
  );
}

export async function duplicateActivityTemplate(templateId: string, name?: string | null): Promise<string> {
  return callActivityRpc<string>(
    "duplicate_activity_template",
    { p_template_id: templateId, p_name: name?.trim() || null },
    "No se pudo duplicar la plantilla.",
  );
}

export async function setActivityTemplateArchived(templateId: string, archived: boolean): Promise<void> {
  await callActivityRpc(
    "set_activity_template_archived",
    { p_template_id: templateId, p_archived: archived },
    archived ? "No se pudo archivar la plantilla." : "No se pudo restaurar la plantilla.",
  );
}
