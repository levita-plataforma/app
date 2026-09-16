import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { DomainError } from "@/server/errors/domain-error";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Elegibilidad de personas para un puesto (Fase 3 §15-§16). La evaluación
 * vive en la base de datos (app.evaluate_person_eligibility), no aquí: esta
 * capa solo traduce el resultado a un tipo limpio y a motivos en español.
 * Elegibilidad NUNCA es una asignación: describe quién PODRÍA servir, no
 * quién sirve.
 */

export type EligibilityStatus = Database["public"]["Enums"]["eligibility_status"];

const REASON_LABELS: Record<string, string> = {
  missing_qualification: "Falta una cualificación requerida",
  expired_credential: "Credencial vencida o ausente",
  insufficient_level: "Nivel operativo insuficiente en el área",
  wrong_campus: "Sede no compatible",
  inactive_person: "Persona no activa en el área",
  position_not_found: "El puesto ya no existe",
};

export function translateReason(reason: string): string {
  return REASON_LABELS[reason] ?? reason;
}

/**
 * El cliente Supabase compartido no está parametrizado con `Database`
 * (convención del proyecto: las filas se mapean a mano), así que las filas
 * que devuelve el RPC se tipan explícitamente aquí.
 */
type EligibilityRow = { status: EligibilityStatus; reasons: string[] | null };
type EligibilityPersonRow = EligibilityRow & { person_id: string };

export type PersonEligibility = {
  personId: string;
  firstName: string;
  lastName: string | null;
  status: EligibilityStatus;
  reasons: string[];
  reasonLabels: string[];
};

export async function evaluatePersonEligibility(
  churchId: string,
  positionId: string,
  personId: string,
): Promise<{ status: EligibilityStatus; reasons: string[]; reasonLabels: string[] }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("evaluate_person_eligibility", {
    p_church_id: churchId,
    p_service_position_id: positionId,
    p_person_id: personId,
  });

  if (error) throw new DomainError("INTERNAL_ERROR", "No se pudo evaluar la elegibilidad.");

  const row = (data as EligibilityRow[] | null)?.[0];
  if (!row) return { status: "not_eligible", reasons: [], reasonLabels: [] };

  const reasons = dedupe(row.reasons ?? []);
  return { status: row.status, reasons, reasonLabels: reasons.map(translateReason) };
}

export type EligibilityGroups = {
  eligible: PersonEligibility[];
  eligibleWithWarning: PersonEligibility[];
  notEligible: PersonEligibility[];
};

export async function getEligiblePeopleForPosition(
  churchId: string,
  positionId: string,
): Promise<EligibilityGroups> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("eligible_people_for_position", {
    p_church_id: churchId,
    p_service_position_id: positionId,
  });

  const empty: EligibilityGroups = { eligible: [], eligibleWithWarning: [], notEligible: [] };
  const rows = data as EligibilityPersonRow[] | null;
  if (error || !rows || rows.length === 0) return empty;

  const personIds = rows.map((row) => row.person_id);
  const { data: people } = await supabase
    .from("people")
    .select("id, first_name, last_name")
    .in("id", personIds);

  const nameById = new Map(
    (people ?? []).map((p) => [p.id as string, { firstName: p.first_name as string, lastName: p.last_name as string | null }]),
  );

  const groups: EligibilityGroups = { eligible: [], eligibleWithWarning: [], notEligible: [] };

  for (const row of rows) {
    const name = nameById.get(row.person_id);
    const reasons = dedupe(row.reasons ?? []);
    const entry: PersonEligibility = {
      personId: row.person_id,
      firstName: name?.firstName ?? "",
      lastName: name?.lastName ?? null,
      status: row.status,
      reasons,
      reasonLabels: reasons.map(translateReason),
    };

    if (row.status === "eligible") groups.eligible.push(entry);
    else if (row.status === "eligible_with_warning") groups.eligibleWithWarning.push(entry);
    else groups.notEligible.push(entry);
  }

  return groups;
}

/**
 * La función SQL puede repetir un mismo motivo (un puesto con varios
 * requisitos de cualificación produce varios `missing_qualification`); para
 * mostrarlos en UI solo interesa el conjunto.
 */
function dedupe(reasons: string[]): string[] {
  return Array.from(new Set(reasons));
}
