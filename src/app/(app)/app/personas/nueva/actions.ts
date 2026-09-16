"use server";

import { redirect } from "next/navigation";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { createPerson, findPotentialDuplicates } from "@/server/people/people-service";
import { DomainError } from "@/server/errors/domain-error";

export type NuevaPersonaState = {
  error: string | null;
  duplicates?: { personId: string; firstName: string; lastName: string | null; matchType: string }[];
};

export async function comprobarDuplicadosAction(input: {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  birthDate?: string;
}) {
  const tenant = await requireTenantContext();
  return findPotentialDuplicates(tenant.churchId, input);
}

export async function crearPersonaAction(
  _prevState: NuevaPersonaState,
  formData: FormData,
): Promise<NuevaPersonaState> {
  const tenant = await requireTenantContext();

  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const preferredName = String(formData.get("preferredName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const birthDate = String(formData.get("birthDate") ?? "").trim();
  const campusId = String(formData.get("campusId") ?? "").trim();
  const relationship = String(formData.get("relationship") ?? "visitor").trim();
  const tagIds = formData.getAll("tagIds").map(String);
  const confirmDespiteDuplicate = formData.get("confirmDespiteDuplicate") === "true";

  if (!firstName) {
    return { error: "El nombre es obligatorio." };
  }

  if (!confirmDespiteDuplicate) {
    const duplicates = await findPotentialDuplicates(tenant.churchId, { email, phone, firstName, lastName, birthDate });
    const strong = duplicates.filter((d) => d.matchType === "email" || d.matchType === "phone");
    if (strong.length > 0) {
      return {
        error: null,
        duplicates: strong.map((d) => ({ personId: d.personId, firstName: d.firstName, lastName: d.lastName, matchType: d.matchType })),
      };
    }
  }

  let personId: string;
  try {
    const result = await createPerson(tenant.churchId, {
      firstName,
      lastName: lastName || undefined,
      preferredName: preferredName || undefined,
      email: email || undefined,
      phone: phone || undefined,
      birthDate: birthDate || undefined,
      campusId: campusId || undefined,
      relationship,
      tagIds: tagIds.length ? tagIds : undefined,
    });
    personId = result.personId;
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }

  // redirect() lanza una excepción especial (NEXT_REDIRECT) que debe
  // propagar sin que ningún try/catch la intercepte; por eso se llama
  // fuera del bloque try anterior.
  redirect(`/app/personas/${personId}`);
}
