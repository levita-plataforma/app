import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { requireCapability } from "@/server/tenant/authorize";
import { auditLog } from "@/server/audit/audit-log";
import { DomainError } from "@/server/errors/domain-error";

/**
 * Salas/clases Kids (Fase 8 §9). Una sala define capacidad, franja de edad
 * y su propia política de ratio (ratio_children_per_adult, min_adults): no
 * hay un ratio global hardcodeado, cada sala tiene el suyo. Ver
 * `supabase/migrations/20260928000200_kids_salas_sesiones.sql`.
 */

export type KidsRoom = {
  id: string;
  churchId: string;
  campusId: string | null;
  name: string;
  description: string | null;
  ageMinMonths: number | null;
  ageMaxMonths: number | null;
  capacity: number;
  minAdults: number;
  ratioChildrenPerAdult: number;
  locationText: string | null;
  active: boolean;
  sortOrder: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type KidsRoomRow = {
  id: string;
  church_id: string;
  campus_id: string | null;
  name: string;
  description: string | null;
  age_min_months: number | null;
  age_max_months: number | null;
  capacity: number;
  min_adults: number;
  ratio_children_per_adult: number;
  location_text: string | null;
  active: boolean;
  sort_order: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

function mapRoom(row: KidsRoomRow): KidsRoom {
  return {
    id: row.id,
    churchId: row.church_id,
    campusId: row.campus_id,
    name: row.name,
    description: row.description,
    ageMinMonths: row.age_min_months,
    ageMaxMonths: row.age_max_months,
    capacity: row.capacity,
    minAdults: row.min_adults,
    ratioChildrenPerAdult: row.ratio_children_per_adult,
    locationText: row.location_text,
    active: row.active,
    sortOrder: row.sort_order,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const ROOM_COLUMNS =
  "id, church_id, campus_id, name, description, age_min_months, age_max_months, capacity, min_adults, ratio_children_per_adult, location_text, active, sort_order, archived_at, created_at, updated_at";

export type KidsRoomFilters = {
  campusId?: string;
  archived?: boolean;
  active?: boolean;
};

export async function listKidsRooms(churchId: string, filters: KidsRoomFilters = {}): Promise<KidsRoom[]> {
  await requireCapability(churchId, "kids.read");

  const supabase = await createSupabaseServerClient();
  let query = supabase.from("kids_rooms").select(ROOM_COLUMNS).eq("church_id", churchId);

  query = filters.archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (filters.campusId) query = query.eq("campus_id", filters.campusId);
  if (filters.active !== undefined) query = query.eq("active", filters.active);

  const { data, error } = await query.order("sort_order", { ascending: true }).order("name", { ascending: true });
  if (error || !data) return [];

  return (data as KidsRoomRow[]).map(mapRoom);
}

export async function getKidsRoom(churchId: string, roomId: string): Promise<KidsRoom | null> {
  await requireCapability(churchId, "kids.read");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("kids_rooms")
    .select(ROOM_COLUMNS)
    .eq("church_id", churchId)
    .eq("id", roomId)
    .maybeSingle();

  if (error || !data) return null;
  return mapRoom(data as KidsRoomRow);
}

export type CreateKidsRoomInput = {
  name: string;
  description?: string;
  campusId?: string;
  ageMinMonths?: number;
  ageMaxMonths?: number;
  capacity: number;
  minAdults?: number;
  ratioChildrenPerAdult?: number;
  locationText?: string;
};

export async function createKidsRoom(churchId: string, input: CreateKidsRoomInput): Promise<{ roomId: string }> {
  await requireCapability(churchId, "kids.room.manage");

  const name = input.name.trim();
  if (!name) throw new DomainError("VALIDATION_ERROR", "El nombre de la sala es obligatorio.");
  if (!input.capacity || input.capacity <= 0) {
    throw new DomainError("VALIDATION_ERROR", "La capacidad debe ser mayor que cero.");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("kids_rooms")
    .insert({
      church_id: churchId,
      name,
      description: input.description?.trim() || null,
      campus_id: input.campusId || null,
      age_min_months: input.ageMinMonths ?? null,
      age_max_months: input.ageMaxMonths ?? null,
      capacity: input.capacity,
      min_adults: input.minAdults ?? 1,
      ratio_children_per_adult: input.ratioChildrenPerAdult ?? 6,
      location_text: input.locationText?.trim() || null,
    })
    .select("id")
    .single();

  if (error || !data) throw new DomainError("INTERNAL_ERROR", "No se pudo crear la sala Kids.");

  await auditLog({
    churchId,
    action: "kids.room_created",
    entityType: "kids_rooms",
    entityId: data.id,
    metadata: { name, capacity: input.capacity, campus_id: input.campusId ?? null },
  });

  return { roomId: data.id };
}

export type UpdateKidsRoomInput = {
  name?: string;
  description?: string | null;
  campusId?: string | null;
  ageMinMonths?: number | null;
  ageMaxMonths?: number | null;
  capacity?: number;
  minAdults?: number;
  ratioChildrenPerAdult?: number;
  locationText?: string | null;
  active?: boolean;
};

export async function updateKidsRoom(churchId: string, roomId: string, input: UpdateKidsRoomInput): Promise<void> {
  await requireCapability(churchId, "kids.room.manage");

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new DomainError("VALIDATION_ERROR", "El nombre de la sala es obligatorio.");
    patch.name = name;
  }
  if (input.description !== undefined) patch.description = input.description?.trim() || null;
  if (input.campusId !== undefined) patch.campus_id = input.campusId || null;
  if (input.ageMinMonths !== undefined) patch.age_min_months = input.ageMinMonths;
  if (input.ageMaxMonths !== undefined) patch.age_max_months = input.ageMaxMonths;
  if (input.capacity !== undefined) {
    if (input.capacity <= 0) throw new DomainError("VALIDATION_ERROR", "La capacidad debe ser mayor que cero.");
    patch.capacity = input.capacity;
  }
  if (input.minAdults !== undefined) patch.min_adults = input.minAdults;
  if (input.ratioChildrenPerAdult !== undefined) patch.ratio_children_per_adult = input.ratioChildrenPerAdult;
  if (input.locationText !== undefined) patch.location_text = input.locationText?.trim() || null;
  if (input.active !== undefined) patch.active = input.active;

  if (Object.keys(patch).length === 0) return;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("kids_rooms").update(patch).eq("church_id", churchId).eq("id", roomId);

  if (error) throw new DomainError("INTERNAL_ERROR", "No se pudo actualizar la sala Kids.");

  await auditLog({
    churchId,
    action: "kids.room_updated",
    entityType: "kids_rooms",
    entityId: roomId,
    metadata: patch,
  });
}

export async function archiveKidsRoom(churchId: string, roomId: string): Promise<void> {
  await requireCapability(churchId, "kids.room.manage");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("kids_rooms")
    .update({ archived_at: new Date().toISOString(), active: false })
    .eq("church_id", churchId)
    .eq("id", roomId);

  if (error) throw new DomainError("INTERNAL_ERROR", "No se pudo archivar la sala Kids.");

  await auditLog({
    churchId,
    action: "kids.room_updated",
    entityType: "kids_rooms",
    entityId: roomId,
    metadata: { archived: true },
  });
}
