"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { DomainError } from "@/server/errors/domain-error";
import {
  duplicateActivityTemplate,
  saveActivityTemplate,
  setActivityTemplateArchived,
  type TemplateInput,
} from "@/server/activities/activity-templates-service";

export type PlantillaActionState = { error: string | null; success?: boolean; id?: string };

const LIST_PATH = "/app/actividades/plantillas";

function asState(err: unknown): PlantillaActionState {
  if (err instanceof DomainError) return { error: err.message };
  throw err;
}

function text(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

/** Normaliza textos vacíos a null; la base de datos valida el resto. */
function normalize(input: TemplateInput): TemplateInput {
  return {
    ...input,
    name: input.name.trim(),
    defaultTitle: text(input.defaultTitle),
    defaultLocalStartTime: input.scheduleKind === "flexible" ? null : text(input.defaultLocalStartTime),
    description: text(input.description),
    locationText: text(input.locationText),
    notes: text(input.notes),
    areas: input.areas.map((area) => ({
      ...area,
      notes: text(area.notes),
      positions: area.positions.map((position) => ({
        ...position,
        name: position.name.trim(),
        description: text(position.description),
      })),
    })),
    planItems: input.planItems.map((item) => ({
      ...item,
      title: item.title.trim(),
      responsibleText: text(item.responsibleText),
      notes: text(item.notes),
    })),
  };
}

export async function guardarPlantillaAction(
  templateId: string | null,
  input: TemplateInput,
): Promise<PlantillaActionState> {
  const tenant = await requireTenantContext();
  let id: string;
  try {
    id = await saveActivityTemplate(tenant.churchId, templateId, normalize(input));
  } catch (err) {
    return asState(err);
  }
  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/[id]`, "page");
  if (!templateId) redirect(`${LIST_PATH}/${id}`);
  return { error: null, success: true, id };
}

export async function duplicarPlantillaAction(templateId: string, name: string): Promise<PlantillaActionState> {
  await requireTenantContext();
  let id: string;
  try {
    id = await duplicateActivityTemplate(templateId, name);
  } catch (err) {
    return asState(err);
  }
  revalidatePath(LIST_PATH);
  return { error: null, success: true, id };
}

export async function archivarPlantillaAction(templateId: string, archived: boolean): Promise<PlantillaActionState> {
  await requireTenantContext();
  try {
    await setActivityTemplateArchived(templateId, archived);
  } catch (err) {
    return asState(err);
  }
  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/[id]`, "page");
  return { error: null, success: true };
}
