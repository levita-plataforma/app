"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { updatePerson, archivePerson, reactivatePerson } from "@/server/people/people-service";
import { addTagToPerson, removeTagFromPerson } from "@/server/people/tags-service";
import { setCustomFieldValue } from "@/server/people/custom-fields-service";
import { addHouseholdMember, removeHouseholdMember } from "@/server/people/households-service";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { DomainError } from "@/server/errors/domain-error";

export type PersonaFichaState = { error: string | null; success?: boolean };
const OK: PersonaFichaState = { error: null, success: true };

function asState(err: unknown): PersonaFichaState {
  if (err instanceof DomainError) return { error: err.message };
  throw err;
}

export async function actualizarDatosAction(personId: string, formData: FormData): Promise<PersonaFichaState> {
  const tenant = await requireTenantContext();
  try {
    await updatePerson(tenant.churchId, personId, {
      firstName: String(formData.get("firstName") ?? "").trim(),
      lastName: String(formData.get("lastName") ?? "").trim() || undefined,
      preferredName: String(formData.get("preferredName") ?? "").trim() || undefined,
      email: String(formData.get("email") ?? "").trim() || undefined,
      phone: String(formData.get("phone") ?? "").trim() || undefined,
      birthDate: String(formData.get("birthDate") ?? "").trim() || undefined,
      campusId: String(formData.get("campusId") ?? "").trim() || undefined,
      relationship: String(formData.get("relationship") ?? "").trim() || undefined,
    });
  } catch (err) {
    return asState(err);
  }
  revalidatePath(`/app/personas/${personId}`);
  return OK;
}

export async function archivarAction(personId: string): Promise<PersonaFichaState> {
  const tenant = await requireTenantContext();
  try {
    await archivePerson(tenant.churchId, personId);
  } catch (err) {
    return asState(err);
  }
  revalidatePath(`/app/personas/${personId}`);
  return OK;
}

export async function reactivarAction(personId: string): Promise<PersonaFichaState> {
  const tenant = await requireTenantContext();
  try {
    await reactivatePerson(tenant.churchId, personId);
  } catch (err) {
    return asState(err);
  }
  revalidatePath(`/app/personas/${personId}`);
  return OK;
}

export async function alternarTagAction(personId: string, tagId: string, assign: boolean): Promise<PersonaFichaState> {
  const tenant = await requireTenantContext();
  try {
    if (assign) await addTagToPerson(tenant.churchId, personId, tagId);
    else await removeTagFromPerson(tenant.churchId, personId, tagId);
  } catch (err) {
    return asState(err);
  }
  revalidatePath(`/app/personas/${personId}`);
  return OK;
}

export async function guardarCampoPersonalizadoAction(
  personId: string,
  fieldId: string,
  value: unknown,
): Promise<PersonaFichaState> {
  const tenant = await requireTenantContext();
  try {
    await setCustomFieldValue(tenant.churchId, fieldId, personId, value);
  } catch (err) {
    return asState(err);
  }
  revalidatePath(`/app/personas/${personId}`);
  return OK;
}

export async function anadirAFamiliaAction(
  personId: string,
  householdId: string,
  relationshipType: string,
): Promise<PersonaFichaState> {
  const tenant = await requireTenantContext();
  try {
    await addHouseholdMember(tenant.churchId, householdId, personId, relationshipType);
  } catch (err) {
    return asState(err);
  }
  revalidatePath(`/app/personas/${personId}`);
  return OK;
}

export async function quitarDeFamiliaAction(personId: string, householdId: string): Promise<PersonaFichaState> {
  const tenant = await requireTenantContext();
  try {
    await removeHouseholdMember(tenant.churchId, householdId, personId);
  } catch (err) {
    return asState(err);
  }
  revalidatePath(`/app/personas/${personId}`);
  return OK;
}

export type InvitarState = { error: string | null; invitationLink?: string };

export async function invitarAPersonaAction(personId: string, email: string): Promise<InvitarState> {
  const tenant = await requireTenantContext();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("invite_existing_person", {
    p_church_id: tenant.churchId,
    p_person_id: personId,
    p_email: email,
  });

  if (error) {
    if (error.message.includes("PERSON_ALREADY_HAS_ACCOUNT")) {
      return { error: "Esta persona ya tiene una cuenta vinculada." };
    }
    if (error.message.includes("FORBIDDEN")) {
      return { error: "No tienes permiso para invitar personas." };
    }
    return { error: "No se pudo generar la invitación." };
  }

  const row = data?.[0];
  const link = row
    ? `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/acceso/invitacion-persona/${row.out_invitation_token}`
    : undefined;

  revalidatePath(`/app/personas/${personId}`);
  return { error: null, invitationLink: link };
}
