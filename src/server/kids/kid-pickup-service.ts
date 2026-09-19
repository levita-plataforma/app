import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { requireCapability } from "@/server/tenant/authorize";
import { auditLog } from "@/server/audit/audit-log";
import { DomainError } from "@/server/errors/domain-error";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Autorizaciones de recogida (Fase 8 §6-7, §16, §21). La lista completa de
 * autorizaciones de un menor SOLO se expone a quien tenga
 * `kids.pickup.manage` — ni siquiera a otro guardian del mismo menor (RLS
 * ya lo impone así vía `kid_pickup_authorizations_select`, sin excepción
 * para `guardian_person_id` a diferencia de `kid_guardians`). Nunca se crea
 * una fila en `people` para una persona externa: solo se guarda un snapshot
 * de nombre en `authorized_name_snapshot`.
 */

export type PickupAuthorizationType = Database["public"]["Enums"]["pickup_authorization_type"];
export type PickupAuthorizationStatus = Database["public"]["Enums"]["pickup_authorization_status"];

export type PickupAuthorization = {
  id: string;
  kidPersonId: string;
  authorizedPersonId: string | null;
  authorizedNameSnapshot: string;
  relationText: string | null;
  authorizationType: PickupAuthorizationType;
  status: PickupAuthorizationStatus;
  validFrom: string;
  validUntil: string | null;
  oneTime: boolean;
  usedAt: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
  notes: string | null;
};

type AuthorizationRow = Database["public"]["Tables"]["kid_pickup_authorizations"]["Row"];

function mapAuthorization(row: AuthorizationRow): PickupAuthorization {
  return {
    id: row.id,
    kidPersonId: row.kid_person_id,
    authorizedPersonId: row.authorized_person_id,
    authorizedNameSnapshot: row.authorized_name_snapshot,
    relationText: row.relation_text,
    authorizationType: row.authorization_type,
    status: row.status,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    oneTime: row.one_time,
    usedAt: row.used_at,
    revokedAt: row.revoked_at,
    revokedBy: row.revoked_by,
    notes: row.notes,
  };
}

/**
 * Lista completa (todas, no solo activas) de autorizaciones de un menor.
 * Requiere kids.pickup.manage explícitamente: RLS ya restringe el SELECT a
 * esa misma capability, pero se comprueba aquí también para devolver un
 * error de dominio claro en vez de una lista vacía silenciosa.
 */
export async function listPickupAuthorizations(churchId: string, kidPersonId: string): Promise<PickupAuthorization[]> {
  await requireCapability(churchId, "kids.pickup.manage");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("kid_pickup_authorizations")
    .select("*")
    .eq("church_id", churchId)
    .eq("kid_person_id", kidPersonId)
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return data.map(mapAuthorization);
}

export type CreatePickupAuthorizationInput = {
  authorizedPersonId?: string;
  authorizedNameSnapshot?: string;
  relationText?: string;
  authorizationType: PickupAuthorizationType;
  validFrom?: string;
  validUntil?: string;
  notes?: string;
};

export async function createPickupAuthorization(
  churchId: string,
  kidPersonId: string,
  input: CreatePickupAuthorizationInput,
): Promise<{ authorizationId: string }> {
  await requireCapability(churchId, "kids.pickup.manage");

  if (input.authorizationType === "date_range" && !input.validUntil) {
    throw new DomainError(
      "VALIDATION_ERROR",
      "Las autorizaciones de tipo 'rango de fechas' requieren una fecha de fin.",
    );
  }

  const supabase = await createSupabaseServerClient();

  let nameSnapshot = input.authorizedNameSnapshot?.trim() || "";
  if (!nameSnapshot) {
    if (!input.authorizedPersonId) {
      throw new DomainError(
        "VALIDATION_ERROR",
        "Indica el nombre de la persona autorizada (authorizedNameSnapshot) o selecciona una persona existente.",
      );
    }
    const { data: person, error: personError } = await supabase
      .from("people")
      .select("first_name, last_name")
      .eq("id", input.authorizedPersonId)
      .single();

    if (personError || !person) throw new DomainError("RESOURCE_NOT_FOUND", "No se encontró a la persona indicada.");
    nameSnapshot = [person.first_name, person.last_name].filter(Boolean).join(" ").trim();
  }

  if (!nameSnapshot) throw new DomainError("VALIDATION_ERROR", "El nombre de la persona autorizada es obligatorio.");

  const { data, error } = await supabase
    .from("kid_pickup_authorizations")
    .insert({
      church_id: churchId,
      kid_person_id: kidPersonId,
      authorized_person_id: input.authorizedPersonId || null,
      authorized_name_snapshot: nameSnapshot,
      relation_text: input.relationText?.trim() || null,
      authorization_type: input.authorizationType,
      one_time: input.authorizationType === "one_time",
      valid_from: input.validFrom || undefined,
      valid_until: input.validUntil || null,
      notes: input.notes?.trim() || null,
    })
    .select("id")
    .single();

  if (error || !data) throw new DomainError("INTERNAL_ERROR", "No se pudo crear la autorización de recogida.");

  await auditLog({
    churchId,
    action: "kids.pickup_authorization_created",
    entityType: "kid_pickup_authorizations",
    entityId: data.id,
    metadata: {
      kid_person_id: kidPersonId,
      authorization_type: input.authorizationType,
      authorized_name_snapshot: nameSnapshot,
      valid_from: input.validFrom ?? null,
      valid_until: input.validUntil ?? null,
    },
  });

  return { authorizationId: data.id };
}

export async function revokePickupAuthorization(
  churchId: string,
  authorizationId: string,
  revokedBy: string,
): Promise<void> {
  await requireCapability(churchId, "kids.pickup.manage");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("kid_pickup_authorizations")
    .update({ status: "revoked", revoked_at: new Date().toISOString(), revoked_by: revokedBy })
    .eq("church_id", churchId)
    .eq("id", authorizationId);

  if (error) throw new DomainError("INTERNAL_ERROR", "No se pudo revocar la autorización de recogida.");

  await auditLog({
    churchId,
    action: "kids.pickup_authorization_revoked",
    entityType: "kid_pickup_authorizations",
    entityId: authorizationId,
    metadata: { revoked_by: revokedBy },
  });
}

export type AuthorizedPickupCandidate = {
  id: string;
  authorizedNameSnapshot: string;
  relationText: string | null;
  authorizationType: PickupAuthorizationType;
};

/**
 * Autorizaciones vigentes de un menor para el flujo de checkout. Delega en
 * la RPC app.kids_authorized_pickups, que ya filtra por vigencia y por si
 * el caller tiene kids.checkout — no se replica esa lógica con una query
 * directa a la tabla.
 */
export async function getAuthorizedPickupsForCheckout(
  churchId: string,
  kidPersonId: string,
): Promise<AuthorizedPickupCandidate[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("kids_authorized_pickups", {
    p_kid_person_id: kidPersonId,
    p_church_id: churchId,
  });

  if (error || !data) return [];

  type AuthorizedPickupRow = {
    id: string;
    authorized_name_snapshot: string;
    relation_text: string | null;
    authorization_type: PickupAuthorizationType;
  };

  return (data as AuthorizedPickupRow[]).map((row) => ({
    id: row.id,
    authorizedNameSnapshot: row.authorized_name_snapshot,
    relationText: row.relation_text,
    authorizationType: row.authorization_type,
  }));
}
