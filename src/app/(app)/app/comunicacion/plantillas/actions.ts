"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { requireCapability } from "@/server/tenant/authorize";
import {
  createCommunicationTemplate,
  archiveCommunicationTemplate,
} from "@/server/communications/communications-service";
import { DomainError } from "@/server/errors/domain-error";

export type PlantillasState = { error: string | null };

export async function crearPlantillaAction(
  _prevState: PlantillasState,
  formData: FormData,
): Promise<PlantillasState> {
  const tenant = await requireTenantContext();

  const name = String(formData.get("name") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();

  if (!name) return { error: "El nombre es obligatorio." };
  if (!body) return { error: "El cuerpo del mensaje es obligatorio." };

  try {
    await requireCapability(tenant.churchId, "communications.manage_templates");
    await createCommunicationTemplate(
      tenant.churchId,
      {
        name,
        subject: subject || undefined,
        body,
        category: category || undefined,
      },
    );
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }

  revalidatePath("/app/comunicacion/plantillas");
  return { error: null };
}

export async function archivarPlantillaAction(templateId: string): Promise<PlantillasState> {
  const tenant = await requireTenantContext();
  try {
    await requireCapability(tenant.churchId, "communications.manage_templates");
    await archiveCommunicationTemplate(tenant.churchId, templateId);
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }
  revalidatePath("/app/comunicacion/plantillas");
  return { error: null };
}
