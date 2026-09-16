import type { Database } from "@/lib/supabase/database.types";

/**
 * Etiquetas en español de los enums de Serving. Viven aquí, y no en los
 * servicios de `src/server/serving`, porque los componentes de cliente las
 * necesitan: importarlas desde un módulo `server-only` arrastraría el
 * cliente Supabase de servidor al bundle del navegador.
 */

export type AreaMemberStatus = Database["public"]["Enums"]["service_area_member_status"];
export type OperationalLevel = Database["public"]["Enums"]["service_operational_level"];
export type QualificationLevel = Database["public"]["Enums"]["qualification_level"];
export type CredentialStatus = Database["public"]["Enums"]["credential_status"];
export type RequirementType = Database["public"]["Enums"]["position_requirement_type"];
export type RequirementStrictness = Database["public"]["Enums"]["position_requirement_strictness"];

export const AREA_MEMBER_STATUS_LABELS: Record<AreaMemberStatus, string> = {
  active: "Activo",
  training: "En formación",
  inactive: "Inactivo",
  suspended: "Suspendido",
};

export const OPERATIONAL_LEVEL_LABELS: Record<OperationalLevel, string> = {
  trainee: "En formación",
  assisted: "Asistido",
  autonomous: "Autónomo",
  leader: "Responsable",
};

export const QUALIFICATION_LEVEL_LABELS: Record<QualificationLevel, string> = {
  basic: "Básico",
  intermediate: "Intermedio",
  advanced: "Avanzado",
  expert: "Experto",
};

export const CREDENTIAL_STATUS_LABELS: Record<CredentialStatus, string> = {
  pending: "Pendiente",
  valid: "Válida",
  expired: "Vencida",
  rejected: "Rechazada",
  revoked: "Revocada",
};

export const REQUIREMENT_TYPE_LABELS: Record<RequirementType, string> = {
  qualification: "Cualificación",
  credential: "Credencial",
  minimum_level: "Nivel operativo mínimo",
};

export const STRICTNESS_LABELS: Record<RequirementStrictness, string> = {
  required: "Obligatorio",
  recommended: "Recomendado",
};
