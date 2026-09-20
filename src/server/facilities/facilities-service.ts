import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { DomainError } from "@/server/errors/domain-error";
import { toDomainError } from "@/server/activities/rpc";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Recursos, instalaciones y mantenimiento (Fase 10).
 *
 * Las lecturas van con el cliente del usuario y decide RLS: ver el catálogo
 * exige el módulo `facilities` activo y la capacidad `facilities.read`. Las
 * escrituras pasan todas por RPC `security definer`, que vuelven a comprobar
 * capacidad y escriben la auditoría en la misma transacción.
 *
 * Lo que sostiene la fase no está aquí sino en la base: `resource_occupancy`
 * lleva una restricción de exclusión que impide que dos usos de un recurso se
 * solapen, incluso desde transacciones simultáneas. Por eso este servicio
 * nunca comprueba disponibilidad antes de escribir para decidir si puede:
 * intenta la operación y traduce el conflicto. Comprobar antes y escribir
 * después es justo la carrera que la restricción evita.
 */

export type ResourceType = Database["public"]["Enums"]["resource_type"];
export type ResourceStatus = Database["public"]["Enums"]["resource_status"];
export type ReservationStatus = Database["public"]["Enums"]["reservation_status"];
export type MaintenanceStatus = Database["public"]["Enums"]["maintenance_status"];

export const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  room: "Sala",
  equipment: "Equipo",
  vehicle: "Vehículo",
  other: "Otro",
};

export const RESOURCE_STATUS_LABELS: Record<ResourceStatus, string> = {
  active: "Disponible",
  unavailable: "Fuera de servicio",
  maintenance: "En mantenimiento",
  archived: "Archivado",
};

export const RESERVATION_STATUS_LABELS: Record<ReservationStatus, string> = {
  pending: "Pendiente de aprobación",
  confirmed: "Confirmada",
  cancelled: "Cancelada",
  rejected: "Rechazada",
};

export const MAINTENANCE_STATUS_LABELS: Record<MaintenanceStatus, string> = {
  scheduled: "Programado",
  in_progress: "En curso",
  completed: "Hecho",
  cancelled: "Cancelado",
};

export type ResourceListItem = {
  id: string;
  name: string;
  type: ResourceType;
  status: ResourceStatus;
  campusId: string | null;
  campusName: string | null;
  capacity: number | null;
  locationDetails: string | null;
  reservable: boolean;
  requiresApproval: boolean;
  responsiblePersonId: string | null;
  archivedAt: string | null;
};

export type ResourceFilters = {
  type?: ResourceType;
  status?: ResourceStatus;
  campusId?: string;
  search?: string;
  includeArchived?: boolean;
};

/** Catálogo de recursos. RLS ya limita a la iglesia de la sesión. */
export async function listResources(
  churchId: string,
  filters: ResourceFilters = {},
): Promise<ResourceListItem[]> {
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("resources")
    .select("id, name, type, status, campus_id, capacity, location_details, reservable, requires_approval, responsible_person_id, archived_at, campuses(name)")
    .eq("church_id", churchId)
    .order("name");

  if (filters.type) query = query.eq("type", filters.type);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.campusId) query = query.eq("campus_id", filters.campusId);
  if (!filters.includeArchived) query = query.is("archived_at", null);
  if (filters.search?.trim()) {
    // El término se escapa antes de entrar en el filtro de PostgREST: una coma
    // o un paréntesis sin limpiar reescriben el filtro entero. Mismo criterio
    // que el buscador de personas.
    const termino = filters.search.trim().replace(/[,()%]/g, " ").trim();
    if (termino) query = query.ilike("name", `%${termino}%`);
  }

  const { data, error } = await query;
  if (error) throw toDomainError(error, "No se pudo cargar el catálogo de recursos.");

  return (data ?? []).map((row) => {
    const campus = Array.isArray(row.campuses) ? row.campuses[0] : row.campuses;
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      status: row.status,
      campusId: row.campus_id,
      campusName: campus?.name ?? null,
      capacity: row.capacity,
      locationDetails: row.location_details,
      reservable: row.reservable,
      requiresApproval: row.requires_approval,
      responsiblePersonId: row.responsible_person_id,
      archivedAt: row.archived_at,
    };
  });
}

export async function getResource(churchId: string, resourceId: string): Promise<ResourceListItem | null> {
  const items = await listResources(churchId, { includeArchived: true });
  return items.find((r) => r.id === resourceId) ?? null;
}

export type SaveResourceInput = {
  id?: string;
  name: string;
  type: ResourceType;
  campusId?: string | null;
  description?: string | null;
  capacity?: number | null;
  locationDetails?: string | null;
  responsiblePersonId?: string | null;
  reservable?: boolean;
  requiresApproval?: boolean;
};

export async function saveResource(churchId: string, input: SaveResourceInput): Promise<{ id: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("save_resource", {
    p_church_id: churchId,
    p_input: {
      ...(input.id ? { id: input.id } : {}),
      name: input.name,
      type: input.type,
      campus_id: input.campusId ?? null,
      description: input.description ?? null,
      capacity: input.capacity ?? null,
      location_details: input.locationDetails ?? null,
      responsible_person_id: input.responsiblePersonId ?? null,
      reservable: input.reservable ?? true,
      requires_approval: input.requiresApproval ?? false,
    },
  });
  if (error) throw toDomainError(error, "No se pudo guardar el recurso.");
  return { id: data as string };
}

export async function archiveResource(resourceId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("archive_resource", { p_resource_id: resourceId });
  if (error) throw toDomainError(error, "No se pudo archivar el recurso.");
}

export async function restoreResource(resourceId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("restore_resource", { p_resource_id: resourceId });
  if (error) throw toDomainError(error, "No se pudo restaurar el recurso.");
}

// ---------------------------------------------------------------------------
// Reservas
// ---------------------------------------------------------------------------

export type ReservationListItem = {
  id: string;
  resourceId: string;
  resourceName: string;
  activityId: string | null;
  status: ReservationStatus;
  startsAt: string;
  endsAt: string;
  purpose: string;
  requestedBy: string;
  responsiblePersonId: string | null;
  cancelledReason: string | null;
};

export type ReservationFilters = {
  resourceId?: string;
  status?: ReservationStatus;
  /** Desde cuándo mirar. Por defecto, ahora: lo que ya pasó no estorba. */
  from?: string;
  to?: string;
};

/**
 * Reservas del periodo. Incluye las que ATRAVIESAN el rango, no solo las que
 * empiezan dentro: una reserva de 9 a 14 tiene que aparecer al consultar de 10
 * a 11, y filtrar por `starts_at >= from` la dejaría fuera.
 */
export async function listReservations(
  churchId: string,
  filters: ReservationFilters = {},
): Promise<ReservationListItem[]> {
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("resource_reservations")
    .select("id, resource_id, activity_id, status, starts_at, ends_at, purpose, requested_by, responsible_person_id, cancelled_reason, resources(name)")
    .eq("church_id", churchId)
    .order("starts_at");

  if (filters.resourceId) query = query.eq("resource_id", filters.resourceId);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.to) query = query.lt("starts_at", filters.to);
  if (filters.from) query = query.gt("ends_at", filters.from);

  const { data, error } = await query;
  if (error) throw toDomainError(error, "No se pudieron cargar las reservas.");

  return (data ?? []).map((row) => {
    const recurso = Array.isArray(row.resources) ? row.resources[0] : row.resources;
    return {
      id: row.id,
      resourceId: row.resource_id,
      resourceName: recurso?.name ?? "",
      activityId: row.activity_id,
      status: row.status,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      purpose: row.purpose,
      requestedBy: row.requested_by,
      responsiblePersonId: row.responsible_person_id,
      cancelledReason: row.cancelled_reason,
    };
  });
}

export type CreateReservationInput = {
  resourceId: string;
  activityId?: string | null;
  /** Instante exacto, cuando ya se tiene resuelto. */
  startsAt?: string;
  endsAt?: string;
  /**
   * Hora local tal como se escribió en el formulario ("2026-10-04T10:00"), que
   * la base convierte con la zona de la iglesia. Es el mismo camino que usa
   * create_activity en la Fase 4: así «las diez» son las diez donde está la
   * sala, sin aritmética de desfases en el navegador ni sorpresas dos veces al
   * año con el cambio de hora.
   */
  localStart?: string;
  localEnd?: string;
  timezone?: string;
  purpose: string;
  notes?: string | null;
  responsiblePersonId?: string | null;
};

export async function createReservation(
  churchId: string,
  input: CreateReservationInput,
): Promise<{ id: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_reservation", {
    p_church_id: churchId,
    p_input: {
      resource_id: input.resourceId,
      activity_id: input.activityId ?? null,
      starts_at: input.startsAt ?? null,
      ends_at: input.endsAt ?? null,
      local_start: input.localStart ?? null,
      local_end: input.localEnd ?? null,
      timezone: input.timezone ?? null,
      purpose: input.purpose,
      notes: input.notes ?? null,
      responsible_person_id: input.responsiblePersonId ?? null,
    },
  });
  if (error) throw toDomainError(error, "No se pudo crear la reserva.");
  return { id: data as string };
}

export async function cancelReservation(reservationId: string, reason?: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cancel_reservation", {
    p_reservation_id: reservationId,
    p_reason: reason ?? null,
  });
  if (error) throw toDomainError(error, "No se pudo cancelar la reserva.");
}

export async function approveReservation(reservationId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("approve_reservation", { p_reservation_id: reservationId });
  if (error) throw toDomainError(error, "No se pudo aprobar la reserva.");
}

export async function rejectReservation(reservationId: string, reason?: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("reject_reservation", {
    p_reservation_id: reservationId,
    p_reason: reason ?? null,
  });
  if (error) throw toDomainError(error, "No se pudo rechazar la reserva.");
}

/**
 * Si una franja está libre ahora mismo. Sirve para avisar en el formulario,
 * nunca para decidir: entre esta consulta y el envío puede entrar otra persona,
 * y quien decide es la restricción de la base.
 */
export async function isResourceAvailable(
  resourceId: string,
  startsAt: string,
  endsAt: string,
): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("resource_is_available", {
    p_resource_id: resourceId,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
    p_exclude_reservation_id: undefined,
  });
  if (error) throw toDomainError(error, "No se pudo comprobar la disponibilidad.");
  return Boolean(data);
}

// ---------------------------------------------------------------------------
// Mantenimiento
// ---------------------------------------------------------------------------

export type MaintenanceListItem = {
  id: string;
  resourceId: string;
  resourceName: string;
  type: string;
  title: string;
  description: string | null;
  status: MaintenanceStatus;
  blocksAvailability: boolean;
  startsAt: string;
  endsAt: string;
  responsiblePersonId: string | null;
  performedAt: string | null;
};

export async function listMaintenance(
  churchId: string,
  filters: { resourceId?: string; status?: MaintenanceStatus; from?: string } = {},
): Promise<MaintenanceListItem[]> {
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("resource_maintenance")
    .select("id, resource_id, type, title, description, status, blocks_availability, starts_at, ends_at, responsible_person_id, performed_at, resources(name)")
    .eq("church_id", churchId)
    .order("starts_at");

  if (filters.resourceId) query = query.eq("resource_id", filters.resourceId);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.from) query = query.gt("ends_at", filters.from);

  const { data, error } = await query;
  if (error) throw toDomainError(error, "No se pudo cargar el mantenimiento.");

  return (data ?? []).map((row) => {
    const recurso = Array.isArray(row.resources) ? row.resources[0] : row.resources;
    return {
      id: row.id,
      resourceId: row.resource_id,
      resourceName: recurso?.name ?? "",
      type: row.type,
      title: row.title,
      description: row.description,
      status: row.status,
      blocksAvailability: row.blocks_availability,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      responsiblePersonId: row.responsible_person_id,
      performedAt: row.performed_at,
    };
  });
}

export type SaveMaintenanceInput = {
  id?: string;
  resourceId: string;
  type: string;
  title: string;
  description?: string | null;
  blocksAvailability?: boolean;
  startsAt?: string;
  endsAt?: string;
  /** Igual que en las reservas: hora local y la zona la resuelve la base. */
  localStart?: string;
  localEnd?: string;
  timezone?: string;
  responsiblePersonId?: string | null;
};

export async function saveMaintenance(churchId: string, input: SaveMaintenanceInput): Promise<{ id: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("save_maintenance", {
    p_church_id: churchId,
    p_input: {
      ...(input.id ? { id: input.id } : {}),
      resource_id: input.resourceId,
      type: input.type,
      title: input.title,
      description: input.description ?? null,
      blocks_availability: input.blocksAvailability ?? true,
      starts_at: input.startsAt ?? null,
      ends_at: input.endsAt ?? null,
      local_start: input.localStart ?? null,
      local_end: input.localEnd ?? null,
      timezone: input.timezone ?? null,
      responsible_person_id: input.responsiblePersonId ?? null,
    },
  });
  if (error) throw toDomainError(error, "No se pudo guardar el mantenimiento.");
  return { id: data as string };
}

export async function completeMaintenance(maintenanceId: string, resultNotes?: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("complete_maintenance", {
    p_maintenance_id: maintenanceId,
    p_result_notes: resultNotes ?? null,
  });
  if (error) throw toDomainError(error, "No se pudo cerrar el mantenimiento.");
}

export async function cancelMaintenance(maintenanceId: string, reason?: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cancel_maintenance", {
    p_maintenance_id: maintenanceId,
    p_reason: reason ?? null,
  });
  if (error) throw toDomainError(error, "No se pudo cancelar el mantenimiento.");
}

/**
 * Un conflicto de ocupación llega como 23P01 y su mensaje ya explica qué franja
 * choca, así que se deja pasar tal cual en vez de sustituirlo por un texto
 * genérico. Es de las pocas veces que el mensaje de la base es mejor que
 * cualquier cosa que pudiéramos escribir aquí.
 */
export function esConflictoDeOcupacion(error: unknown): boolean {
  return error instanceof DomainError && error.code === "CONFLICT";
}
