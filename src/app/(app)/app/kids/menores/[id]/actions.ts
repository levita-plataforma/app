"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import {
  updateKidsProfile,
  archiveKidsProfile,
  saveKidsSensitiveNotes,
} from "@/server/kids/kids-profiles-service";
import {
  addGuardian,
  removeGuardian,
  suggestGuardiansFromHousehold,
  type SuggestedGuardian,
} from "@/server/kids/kid-guardians-service";
import {
  createPickupAuthorization,
  revokePickupAuthorization,
  type PickupAuthorizationType,
} from "@/server/kids/kid-pickup-service";
import { createIncident, type CreateIncidentInput } from "@/server/kids/kids-incidents-service";
import { DomainError } from "@/server/errors/domain-error";

export type FichaState = { error: string | null; success?: boolean };
const OK: FichaState = { error: null, success: true };

function asState(err: unknown): FichaState {
  if (err instanceof DomainError) return { error: err.message };
  throw err;
}

function revalidateFicha(personId: string) {
  revalidatePath(`/app/kids/menores/${personId}`);
  revalidatePath("/app/kids/menores");
  revalidatePath("/app/kids");
}

export async function anadirResponsableAction(
  kidPersonId: string,
  guardianPersonId: string,
  input: { relationshipType: string; legalGuardian?: boolean; emergencyContact?: boolean; canView?: boolean },
): Promise<FichaState> {
  const tenant = await requireTenantContext();
  try {
    await addGuardian(tenant.churchId, kidPersonId, guardianPersonId, input);
  } catch (err) {
    return asState(err);
  }
  revalidateFicha(kidPersonId);
  return OK;
}

export type SugerirGuardianesState = { error: string | null; suggestions: SuggestedGuardian[] };

/**
 * "Sugerir desde household" (encargo §C): nunca inserta nada, solo devuelve
 * candidatos para que el admin confirme explícitamente cada uno con
 * anadirResponsableAction.
 */
export async function sugerirGuardianesAction(kidPersonId: string): Promise<SugerirGuardianesState> {
  const tenant = await requireTenantContext();
  try {
    const suggestions = await suggestGuardiansFromHousehold(tenant.churchId, kidPersonId);
    return { error: null, suggestions };
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message, suggestions: [] };
    throw err;
  }
}

export async function quitarResponsableAction(kidPersonId: string, guardianPersonId: string): Promise<FichaState> {
  const tenant = await requireTenantContext();
  try {
    await removeGuardian(tenant.churchId, kidPersonId, guardianPersonId);
  } catch (err) {
    return asState(err);
  }
  revalidateFicha(kidPersonId);
  return OK;
}

export type CrearAutorizacionInput = {
  mode: "existing" | "external";
  authorizedPersonId?: string;
  authorizedNameSnapshot?: string;
  relationText?: string;
  authorizationType: PickupAuthorizationType;
  validFrom?: string;
  validUntil?: string;
  notes?: string;
};

export async function crearAutorizacionAction(kidPersonId: string, input: CrearAutorizacionInput): Promise<FichaState> {
  const tenant = await requireTenantContext();
  try {
    await createPickupAuthorization(tenant.churchId, kidPersonId, {
      authorizedPersonId: input.mode === "existing" ? input.authorizedPersonId : undefined,
      authorizedNameSnapshot: input.mode === "external" ? input.authorizedNameSnapshot : undefined,
      relationText: input.relationText,
      authorizationType: input.authorizationType,
      validFrom: input.validFrom,
      validUntil: input.validUntil,
      notes: input.notes,
    });
  } catch (err) {
    return asState(err);
  }
  revalidateFicha(kidPersonId);
  return OK;
}

export async function revocarAutorizacionAction(kidPersonId: string, authorizationId: string): Promise<FichaState> {
  const tenant = await requireTenantContext();
  try {
    await revokePickupAuthorization(tenant.churchId, authorizationId, tenant.personId);
  } catch (err) {
    return asState(err);
  }
  revalidateFicha(kidPersonId);
  return OK;
}

export type CrearIncidenciaInput = Omit<CreateIncidentInput, "kidPersonId">;

export async function crearIncidenciaAction(kidPersonId: string, input: CrearIncidenciaInput): Promise<FichaState> {
  const tenant = await requireTenantContext();
  try {
    await createIncident(tenant.churchId, { ...input, kidPersonId });
  } catch (err) {
    return asState(err);
  }
  revalidateFicha(kidPersonId);
  return OK;
}

export type GuardarConfiguracionInput = {
  preferredName?: string;
  medicalAlertFlag?: boolean;
  accessibilityNotes?: string;
  emergencyNotes?: string;
};

/**
 * Dos escrituras distintas, porque desde el hotfix 20260928001000 son dos
 * sitios distintos: el perfil (nombre preferido, aviso médico) va a
 * `kids_profiles`, y las notas de accesibilidad y de emergencia van a
 * `kids_sensitive_notes` por su RPC, que exige kids.manage y
 * kids.sensitive.read. Si el formulario no trae notas —porque quien edita
 * no puede verlas— la segunda llamada ni se hace.
 */
export async function guardarConfiguracionAction(
  kidPersonId: string,
  input: GuardarConfiguracionInput,
): Promise<FichaState> {
  const tenant = await requireTenantContext();
  const touchesNotes = input.accessibilityNotes !== undefined || input.emergencyNotes !== undefined;

  try {
    await updateKidsProfile(tenant.churchId, kidPersonId, {
      preferredName: input.preferredName,
      medicalAlertFlag: input.medicalAlertFlag,
    });
    if (touchesNotes) {
      await saveKidsSensitiveNotes(tenant.churchId, kidPersonId, {
        accessibilityNotes: input.accessibilityNotes,
        emergencyNotes: input.emergencyNotes,
      });
    }
  } catch (err) {
    return asState(err);
  }
  revalidateFicha(kidPersonId);
  return OK;
}

/**
 * `redirect()` NUNCA dentro de un try/catch (bug real ya visto en fases
 * anteriores): se lanza fuera del bloque, después de que la mutación haya
 * terminado con éxito.
 */
export async function archivarPerfilAction(kidPersonId: string): Promise<FichaState> {
  const tenant = await requireTenantContext();
  try {
    await archiveKidsProfile(tenant.churchId, kidPersonId);
  } catch (err) {
    return asState(err);
  }
  revalidatePath("/app/kids/menores");
  revalidatePath("/app/kids");
  redirect("/app/kids/menores");
}
