"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { DomainError } from "@/server/errors/domain-error";
import { saveLearningPath } from "@/server/discipleship/learning-paths-service";
import { isLearningPathStatus } from "@/lib/discipleship/constants";

export type ItinerariosState = { error: string | null };

export async function guardarItinerarioAction(
  _prev: ItinerariosState,
  formData: FormData,
): Promise<ItinerariosState> {
  const tenant = await requireTenantContext();

  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const status = String(formData.get("status") ?? "");

  if (!name) return { error: "El nombre del itinerario es obligatorio." };

  try {
    await saveLearningPath(tenant.churchId, {
      id: id || undefined,
      name,
      description: description || null,
      status: isLearningPathStatus(status) ? status : undefined,
    });
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }

  revalidatePath("/app/discipulado/itinerarios");
  revalidatePath("/app/discipulado");
  if (id) revalidatePath(`/app/discipulado/itinerarios/${id}`);
  return { error: null };
}
