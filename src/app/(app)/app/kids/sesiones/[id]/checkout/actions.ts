"use server";

import { createHash } from "node:crypto";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { hasCapability } from "@/server/tenant/authorize";
import { DomainError } from "@/server/errors/domain-error";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import {
  checkoutKid,
  getAuthorizedPickupsForSession,
  type CheckoutKidResult,
  type AuthorizedPickup,
} from "@/server/kids/kids-checkin-service";

export type CheckoutActionState<T> = { error: string | null; data?: T };

function asState<T>(err: unknown): CheckoutActionState<T> {
  if (err instanceof DomainError) return { error: err.message };
  throw err;
}

export type PickupLookupResult = {
  kidPersonId: string;
  kidName: string;
  authorizedPickups: AuthorizedPickup[];
};

/**
 * Localiza el check-in activo correspondiente a un código de recogida
 * dentro de la sesión. `kid_checkins.pickup_token_hash` solo guarda el hash
 * (sha256(codigo_normalizado || ':' || session_id), igual fórmula que
 * app.kids_checkout en la migración 20260928000700): no existe una RPC de
 * "lookup" en el servicio de dominio, así que se replica aquí esa misma
 * fórmula de hash para localizar la fila sin exponer el token en claro en
 * ninguna tabla. Es solo lectura — el checkout real sigue pasando por
 * checkoutKid() -> RPC transaccional, que vuelve a validar todo.
 */
export async function buscarCheckinPorCodigoAction(
  sessionId: string,
  pickupCode: string,
): Promise<CheckoutActionState<PickupLookupResult>> {
  const tenant = await requireTenantContext();
  const code = pickupCode.trim();
  if (!code) return { error: "Introduce el código de recogida." };

  try {
    const canCheckout = await hasCapability(tenant.churchId, "kids.checkout");
    if (!canCheckout) throw new DomainError("FORBIDDEN", "No tienes permiso para hacer check-out.");

    const normalized = code.toUpperCase();
    const hash = createHash("sha256").update(`${normalized}:${sessionId}`).digest("hex");

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("kid_checkins")
      .select("kid_person_id, people:kid_person_id(first_name, last_name)")
      .eq("church_id", tenant.churchId)
      .eq("session_id", sessionId)
      .eq("status", "checked_in")
      .eq("pickup_token_hash", hash)
      .maybeSingle();

    if (error || !data) {
      return { error: "Código no válido o ya utilizado." };
    }

    type Row = { kid_person_id: string; people: { first_name: string; last_name: string | null } | { first_name: string; last_name: string | null }[] | null };
    const row = data as unknown as Row;
    const person = Array.isArray(row.people) ? row.people[0] : row.people;
    const kidName = [person?.first_name, person?.last_name].filter(Boolean).join(" ").trim() || "Menor";

    const authorizedPickups = await getAuthorizedPickupsForSession(tenant.churchId, row.kid_person_id);

    return {
      error: null,
      data: { kidPersonId: row.kid_person_id, kidName, authorizedPickups },
    };
  } catch (err) {
    return asState(err);
  }
}

export async function confirmarCheckoutAction(
  sessionId: string,
  pickupCode: string,
  pickupPersonName: string,
  authorizedPickupId?: string,
): Promise<CheckoutActionState<CheckoutKidResult>> {
  const tenant = await requireTenantContext();
  try {
    const data = await checkoutKid(tenant.churchId, sessionId, pickupCode, pickupPersonName, authorizedPickupId);
    return { error: null, data };
  } catch (err) {
    return asState(err);
  }
}
