"use server";

import { requireTenantContext } from "@/server/tenant/tenant-context";
import { DomainError } from "@/server/errors/domain-error";
import {
  checkoutKid,
  getAuthorizedPickupsForSession,
  lookupPickupByCode,
  type CheckoutKidResult,
  type AuthorizedPickup,
  type PickupLookup,
} from "@/server/kids/kids-checkin-service";

export type CheckoutActionState<T> = { error: string | null; data?: T };

function asState<T>(err: unknown): CheckoutActionState<T> {
  if (err instanceof DomainError) return { error: err.message };
  throw err;
}

export type PickupLookupResult = PickupLookup & {
  authorizedPickups: AuthorizedPickup[];
};

/**
 * Localiza el check-in por su código de recogida.
 *
 * Antes esto se resolvía aquí mismo, recalculando en Node la huella del
 * código y comparándola contra `kid_checkins.pickup_token_hash`. El hotfix
 * 20260928001000 retiró esa columna de la superficie legible —era lo que
 * permitía recuperar un código real invirtiendo la huella— y metió el
 * identificador del check-in dentro de la fórmula. Ahora lo hace
 * `public.kids_lookup_pickup`, que es security definer, exige
 * `kids.checkout` y devuelve solo lo imprescindible para atender la puerta.
 *
 * Sigue siendo solo lectura: la recogida real pasa por
 * `confirmarCheckoutAction` → `kids_checkout`, que lo revalida todo dentro
 * de la misma transacción.
 */
export async function buscarCheckinPorCodigoAction(
  sessionId: string,
  pickupCode: string,
): Promise<CheckoutActionState<PickupLookupResult>> {
  const tenant = await requireTenantContext();
  const code = pickupCode.trim();
  if (!code) return { error: "Introduce el código de recogida." };

  try {
    const lookup = await lookupPickupByCode(tenant.churchId, sessionId, code);
    const authorizedPickups = await getAuthorizedPickupsForSession(tenant.churchId, lookup.kidPersonId);
    return { error: null, data: { ...lookup, authorizedPickups } };
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
  // La RPC ya hace upper(btrim(...)) sobre el código; aquí solo se evita
  // mandar espacios de más.
  const code = pickupCode.trim();
  if (!code) return { error: "Introduce el código de recogida." };

  try {
    const data = await checkoutKid(tenant.churchId, sessionId, code, pickupPersonName, authorizedPickupId);
    return { error: null, data };
  } catch (err) {
    return asState(err);
  }
}
