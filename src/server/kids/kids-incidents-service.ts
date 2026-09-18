import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { requireCapability } from "@/server/tenant/authorize";
import { auditLog } from "@/server/audit/audit-log";
import { DomainError } from "@/server/errors/domain-error";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Incidencias Kids (Fase 8 §23-24). Contenido SIEMPRE restricted: nunca se
 * expone en dashboards generales, People común, logs técnicos ni
 * notificaciones genéricas — solo un contador (getIncidentsCount, que
 * requiere el capability más débil kids.read, no kids.incident.read). Ver
 * `supabase/migrations/20260928000300_kids_checkins_incidentes.sql`.
 */

type KidsIncidentType = Database["public"]["Enums"]["kids_incident_type"];
type KidsIncidentSeverity = Database["public"]["Enums"]["kids_incident_severity"];
type KidsIncidentStatus = Database["public"]["Enums"]["kids_incident_status"];

export type KidsIncident = {
  id: string;
  churchId: string;
  sessionId: string | null;
  kidPersonId: string;
  incidentType: KidsIncidentType;
  severity: KidsIncidentSeverity;
  status: KidsIncidentStatus;
  occurredAt: string;
  reportedBy: string | null;
  description: string;
  actionsTaken: string | null;
  guardianNotifiedAt: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

type KidsIncidentRow = {
  id: string;
  church_id: string;
  session_id: string | null;
  kid_person_id: string;
  incident_type: KidsIncidentType;
  severity: KidsIncidentSeverity;
  status: KidsIncidentStatus;
  occurred_at: string;
  reported_by: string | null;
  description: string;
  actions_taken: string | null;
  guardian_notified_at: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
};

const INCIDENT_COLUMNS =
  "id, church_id, session_id, kid_person_id, incident_type, severity, status, occurred_at, reported_by, description, actions_taken, guardian_notified_at, resolved_at, resolved_by, created_at, updated_at";

function mapIncident(row: KidsIncidentRow): KidsIncident {
  return {
    id: row.id,
    churchId: row.church_id,
    sessionId: row.session_id,
    kidPersonId: row.kid_person_id,
    incidentType: row.incident_type,
    severity: row.severity,
    status: row.status,
    occurredAt: row.occurred_at,
    reportedBy: row.reported_by,
    description: row.description,
    actionsTaken: row.actions_taken,
    guardianNotifiedAt: row.guardian_notified_at,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type KidsIncidentFilters = {
  status?: KidsIncidentStatus;
  severity?: KidsIncidentSeverity;
  kidPersonId?: string;
};

export async function listIncidents(churchId: string, filters: KidsIncidentFilters = {}): Promise<KidsIncident[]> {
  await requireCapability(churchId, "kids.incident.read");

  const supabase = await createSupabaseServerClient();
  let query = supabase.from("kids_incidents").select(INCIDENT_COLUMNS).eq("church_id", churchId);

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.severity) query = query.eq("severity", filters.severity);
  if (filters.kidPersonId) query = query.eq("kid_person_id", filters.kidPersonId);

  const { data, error } = await query.order("occurred_at", { ascending: false });
  if (error || !data) return [];

  return (data as KidsIncidentRow[]).map(mapIncident);
}

/**
 * SOLO cuenta (count(*)), nunca devuelve contenido. Es la función pensada
 * para dashboards generales: requiere kids.read (no kids.incident.read),
 * a propósito, para que alguien sin acceso al contenido de incidencias
 * pueda ver igualmente "1 incidencia abierta" sin poder leer el detalle.
 */
export async function getIncidentsCount(churchId: string, filters: KidsIncidentFilters = {}): Promise<number> {
  await requireCapability(churchId, "kids.read");

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("kids_incidents")
    .select("id", { count: "exact", head: true })
    .eq("church_id", churchId);

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.severity) query = query.eq("severity", filters.severity);
  if (filters.kidPersonId) query = query.eq("kid_person_id", filters.kidPersonId);

  const { count, error } = await query;
  if (error) return 0;
  return count ?? 0;
}

export async function getIncident(churchId: string, incidentId: string): Promise<KidsIncident | null> {
  await requireCapability(churchId, "kids.incident.read");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("kids_incidents")
    .select(INCIDENT_COLUMNS)
    .eq("church_id", churchId)
    .eq("id", incidentId)
    .maybeSingle();

  if (error || !data) return null;
  return mapIncident(data as KidsIncidentRow);
}

export type CreateIncidentInput = {
  kidPersonId: string;
  sessionId?: string;
  incidentType: KidsIncidentType;
  severity: KidsIncidentSeverity;
  description: string;
  actionsTaken?: string;
};

export async function createIncident(churchId: string, input: CreateIncidentInput): Promise<{ incidentId: string }> {
  await requireCapability(churchId, "kids.incident.manage");

  const description = input.description.trim();
  if (!description) throw new DomainError("VALIDATION_ERROR", "La descripción de la incidencia es obligatoria.");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("kids_incidents")
    .insert({
      church_id: churchId,
      session_id: input.sessionId || null,
      kid_person_id: input.kidPersonId,
      incident_type: input.incidentType,
      severity: input.severity,
      description,
      actions_taken: input.actionsTaken?.trim() || null,
      reported_by: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error || !data) throw new DomainError("INTERNAL_ERROR", "No se pudo crear la incidencia.");

  // El metadata de auditoría NUNCA incluye la descripción completa: solo
  // datos de clasificación, para no filtrar contenido restricted a través
  // del log de auditoría (que puede tener lectores distintos de
  // kids.incident.read).
  await auditLog({
    churchId,
    action: "kids.incident_created",
    entityType: "kids_incidents",
    entityId: data.id,
    metadata: {
      incident_type: input.incidentType,
      severity: input.severity,
      kid_person_id: input.kidPersonId,
    },
  });

  return { incidentId: data.id };
}

export type UpdateIncidentInput = {
  actionsTaken?: string;
  guardianNotifiedAt?: string;
};

export async function updateIncident(churchId: string, incidentId: string, input: UpdateIncidentInput): Promise<void> {
  await requireCapability(churchId, "kids.incident.manage");

  const patch: Record<string, unknown> = {};
  if (input.actionsTaken !== undefined) patch.actions_taken = input.actionsTaken.trim() || null;
  if (input.guardianNotifiedAt !== undefined) patch.guardian_notified_at = input.guardianNotifiedAt;

  if (Object.keys(patch).length === 0) return;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("kids_incidents").update(patch).eq("church_id", churchId).eq("id", incidentId);

  if (error) throw new DomainError("INTERNAL_ERROR", "No se pudo actualizar la incidencia.");

  // No se audita el detalle del patch (podría incluir actions_taken con
  // contenido sensible); se registra solo que hubo una actualización.
  await auditLog({
    churchId,
    action: "kids.incident_updated",
    entityType: "kids_incidents",
    entityId: incidentId,
  });
}

export async function resolveIncident(churchId: string, incidentId: string): Promise<void> {
  await requireCapability(churchId, "kids.incident.manage");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("kids_incidents")
    .update({ status: "resolved", resolved_at: new Date().toISOString(), resolved_by: user?.id ?? null })
    .eq("church_id", churchId)
    .eq("id", incidentId);

  if (error) throw new DomainError("INTERNAL_ERROR", "No se pudo resolver la incidencia.");

  await auditLog({
    churchId,
    action: "kids.incident_resolved",
    entityType: "kids_incidents",
    entityId: incidentId,
  });
}
