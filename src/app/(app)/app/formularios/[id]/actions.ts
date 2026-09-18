"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import {
  updateForm,
  createFormField,
  updateFormField,
  archiveFormField,
  type FormFieldType,
  type FormFieldClassification,
} from "@/server/forms/forms-service";
import { DomainError } from "@/server/errors/domain-error";

export type FormularioFichaState = { error: string | null; success?: boolean };
const OK: FormularioFichaState = { error: null, success: true };

function asState(err: unknown): FormularioFichaState {
  if (err instanceof DomainError) return { error: err.message };
  throw err;
}

function revalidate(formId: string) {
  revalidatePath(`/app/formularios/${formId}`);
  revalidatePath("/app/formularios");
}

export async function guardarFormularioAction(
  formId: string,
  formData: FormData,
): Promise<FormularioFichaState> {
  const tenant = await requireTenantContext();
  try {
    await updateForm(tenant.churchId, formId, {
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? "").trim() || null,
      purpose: String(formData.get("purpose") ?? ""),
      active: formData.get("active") === "on",
    });
  } catch (err) {
    return asState(err);
  }
  revalidate(formId);
  return OK;
}

function parseOptions(formData: FormData): string[] | undefined {
  const raw = String(formData.get("options") ?? "").trim();
  if (!raw) return undefined;
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export async function crearCampoAction(
  formId: string,
  formData: FormData,
): Promise<FormularioFichaState> {
  const tenant = await requireTenantContext();
  const type = String(formData.get("type") ?? "text") as FormFieldType;
  try {
    await createFormField(tenant.churchId, formId, {
      key: String(formData.get("key") ?? ""),
      label: String(formData.get("label") ?? ""),
      type,
      required: formData.get("required") === "on",
      helpText: String(formData.get("helpText") ?? "").trim() || null,
      options: ["select", "multi_select"].includes(type) ? parseOptions(formData) ?? [] : undefined,
      classification: (String(formData.get("classification") ?? "normal") as FormFieldClassification) || "normal",
    });
  } catch (err) {
    return asState(err);
  }
  revalidate(formId);
  return OK;
}

export async function editarCampoAction(
  formId: string,
  fieldId: string,
  formData: FormData,
): Promise<FormularioFichaState> {
  const tenant = await requireTenantContext();
  const type = String(formData.get("type") ?? "text") as FormFieldType;
  try {
    await updateFormField(tenant.churchId, fieldId, {
      label: String(formData.get("label") ?? ""),
      helpText: String(formData.get("helpText") ?? "").trim() || null,
      required: formData.get("required") === "on",
      type,
      options: ["select", "multi_select"].includes(type) ? parseOptions(formData) ?? [] : undefined,
      classification: (String(formData.get("classification") ?? "normal") as FormFieldClassification) || "normal",
    });
  } catch (err) {
    return asState(err);
  }
  revalidate(formId);
  return OK;
}

export async function archivarCampoAction(formId: string, fieldId: string): Promise<FormularioFichaState> {
  const tenant = await requireTenantContext();
  try {
    await archiveFormField(tenant.churchId, fieldId);
  } catch (err) {
    return asState(err);
  }
  revalidate(formId);
  return OK;
}
