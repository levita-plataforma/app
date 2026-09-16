import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { requireCapability } from "@/server/tenant/authorize";
import { auditLog } from "@/server/audit/audit-log";
import { DomainError } from "@/server/errors/domain-error";
import { getPosition } from "@/server/serving/service-positions-service";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Requisitos explícitos de un puesto (Fase 3 §10). Alimentan la evaluación
 * de elegibilidad; un requisito "recommended" nunca bloquea, solo advierte.
 */

// Etiquetas en español: app/(app)/app/servicios/labels.ts (client-safe).
export type RequirementType = Database["public"]["Enums"]["position_requirement_type"];
export type RequirementStrictness = Database["public"]["Enums"]["position_requirement_strictness"];
export type QualificationLevel = Database["public"]["Enums"]["qualification_level"];
export type OperationalLevel = Database["public"]["Enums"]["service_operational_level"];

export type PositionRequirement = {
  id: string;
  positionId: string;
  type: RequirementType;
  strictness: RequirementStrictness;
  qualificationId: string | null;
  qualificationName: string | null;
  credentialTypeId: string | null;
  credentialTypeName: string | null;
  minLevel: QualificationLevel | null;
  minOperationalLevel: OperationalLevel | null;
  requiresCurrentValidity: boolean;
};

export async function listRequirements(churchId: string, positionId: string): Promise<PositionRequirement[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("position_requirements")
    .select(
      "id, service_position_id, requirement_type, strictness, qualification_id, credential_type_id, min_level, min_operational_level, requires_current_validity, qualifications(name), credential_types(name)",
    )
    .eq("church_id", churchId)
    .eq("service_position_id", positionId)
    .order("created_at");

  if (error || !data) return [];

  return data.map((row) => {
    const qualification = Array.isArray(row.qualifications) ? row.qualifications[0] : row.qualifications;
    const credentialType = Array.isArray(row.credential_types) ? row.credential_types[0] : row.credential_types;
    return {
      id: row.id,
      positionId: row.service_position_id,
      type: row.requirement_type,
      strictness: row.strictness,
      qualificationId: row.qualification_id,
      qualificationName: (qualification?.name as string | null) ?? null,
      credentialTypeId: row.credential_type_id,
      credentialTypeName: (credentialType?.name as string | null) ?? null,
      minLevel: row.min_level,
      minOperationalLevel: row.min_operational_level,
      requiresCurrentValidity: row.requires_current_validity,
    };
  });
}

export type AddRequirementInput = {
  type: RequirementType;
  strictness?: RequirementStrictness;
  qualificationId?: string;
  credentialTypeId?: string;
  minLevel?: QualificationLevel;
  minOperationalLevel?: OperationalLevel;
  requiresCurrentValidity?: boolean;
};

export async function addRequirement(
  churchId: string,
  positionId: string,
  input: AddRequirementInput,
): Promise<{ requirementId: string }> {
  const position = await getPosition(churchId, positionId);
  if (!position) throw new DomainError("RESOURCE_NOT_FOUND", "El puesto no existe.");
  await requireCapability(churchId, "service_positions.manage", "service_area", position.areaId);

  // El CHECK de la tabla exige coherencia entre tipo y columnas; se valida
  // antes para poder devolver un mensaje de dominio claro.
  if (input.type === "qualification" && !input.qualificationId) {
    throw new DomainError("VALIDATION_ERROR", "Selecciona la cualificación requerida.");
  }
  if (input.type === "credential" && !input.credentialTypeId) {
    throw new DomainError("VALIDATION_ERROR", "Selecciona el tipo de credencial requerido.");
  }
  if (input.type === "minimum_level" && !input.minOperationalLevel) {
    throw new DomainError("VALIDATION_ERROR", "Selecciona el nivel operativo mínimo.");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("position_requirements")
    .insert({
      church_id: churchId,
      service_position_id: positionId,
      requirement_type: input.type,
      strictness: input.strictness ?? "required",
      qualification_id: input.type === "qualification" ? input.qualificationId! : null,
      credential_type_id: input.type === "credential" ? input.credentialTypeId! : null,
      min_level: input.type === "qualification" ? (input.minLevel ?? null) : null,
      min_operational_level: input.type === "minimum_level" ? input.minOperationalLevel! : null,
      requires_current_validity: input.requiresCurrentValidity ?? true,
    })
    .select("id")
    .single();

  if (error || !data) throw new DomainError("INTERNAL_ERROR", "No se pudo añadir el requisito.");

  await auditLog({
    churchId,
    action: "service_position.updated",
    entityType: "service_positions",
    entityId: positionId,
    metadata: { requirement_added: input.type, strictness: input.strictness ?? "required" },
  });

  return { requirementId: data.id };
}

export async function removeRequirement(churchId: string, requirementId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();

  const { data: requirement } = await supabase
    .from("position_requirements")
    .select("service_position_id")
    .eq("church_id", churchId)
    .eq("id", requirementId)
    .maybeSingle();

  if (!requirement) throw new DomainError("RESOURCE_NOT_FOUND", "El requisito no existe.");

  const position = await getPosition(churchId, requirement.service_position_id);
  if (!position) throw new DomainError("RESOURCE_NOT_FOUND", "El puesto no existe.");
  await requireCapability(churchId, "service_positions.manage", "service_area", position.areaId);

  const { error } = await supabase
    .from("position_requirements")
    .delete()
    .eq("church_id", churchId)
    .eq("id", requirementId);

  if (error) throw new DomainError("INTERNAL_ERROR", "No se pudo quitar el requisito.");

  await auditLog({
    churchId,
    action: "service_position.updated",
    entityType: "service_positions",
    entityId: requirement.service_position_id,
    metadata: { requirement_removed: requirementId },
  });
}
