import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { requireCapability } from "@/server/tenant/authorize";
import { auditLog } from "@/server/audit/audit-log";
import { DomainError } from "@/server/errors/domain-error";

/**
 * Liderazgo de área (Fase 3 §5). No es un rol global de iglesia: quitar a
 * un responsable cierra su periodo (ends_at) en vez de borrar la fila, para
 * conservar el histórico de quién lideró qué y cuándo.
 */

export type AreaLeader = {
  id: string;
  personId: string;
  firstName: string;
  lastName: string | null;
  isPrimary: boolean;
  campusId: string | null;
  startsAt: string;
  endsAt: string | null;
};

export async function listAreaLeaders(
  churchId: string,
  areaId: string,
  includeEnded = false,
): Promise<AreaLeader[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("service_area_leaders")
    .select("id, person_id, is_primary, campus_id, starts_at, ends_at, people(first_name, last_name)")
    .eq("church_id", churchId)
    .eq("service_area_id", areaId);

  if (!includeEnded) query = query.is("ends_at", null);

  const { data, error } = await query.order("is_primary", { ascending: false });
  if (error || !data) return [];

  return data.map((row) => {
    const person = Array.isArray(row.people) ? row.people[0] : row.people;
    return {
      id: row.id,
      personId: row.person_id,
      firstName: (person?.first_name as string) ?? "",
      lastName: (person?.last_name as string | null) ?? null,
      isPrimary: row.is_primary,
      campusId: row.campus_id,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
    };
  });
}

export async function addAreaLeader(
  churchId: string,
  areaId: string,
  personId: string,
  opts: { isPrimary?: boolean; campusId?: string } = {},
): Promise<void> {
  await requireCapability(churchId, "service_area.leaders.manage", "service_area", areaId);

  if (!personId) throw new DomainError("VALIDATION_ERROR", "Selecciona una persona.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("service_area_leaders").insert({
    church_id: churchId,
    service_area_id: areaId,
    person_id: personId,
    is_primary: opts.isPrimary ?? false,
    campus_id: opts.campusId || null,
  });

  if (error) {
    if (error.code === "23505") throw new DomainError("CONFLICT", "Esa persona ya es responsable del área.");
    throw new DomainError("INTERNAL_ERROR", "No se pudo añadir el responsable del área.");
  }

  await auditLog({
    churchId,
    action: "service_area.leader_added",
    entityType: "service_areas",
    entityId: areaId,
    metadata: { person_id: personId, is_primary: opts.isPrimary ?? false },
  });
}

export async function removeAreaLeader(churchId: string, areaId: string, personId: string): Promise<void> {
  await requireCapability(churchId, "service_area.leaders.manage", "service_area", areaId);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("service_area_leaders")
    .update({ ends_at: new Date().toISOString() })
    .eq("church_id", churchId)
    .eq("service_area_id", areaId)
    .eq("person_id", personId)
    .is("ends_at", null);

  if (error) throw new DomainError("INTERNAL_ERROR", "No se pudo quitar el responsable del área.");

  await auditLog({
    churchId,
    action: "service_area.leader_removed",
    entityType: "service_areas",
    entityId: areaId,
    metadata: { person_id: personId },
  });
}
