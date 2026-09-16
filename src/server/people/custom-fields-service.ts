import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { requireCapability } from "@/server/tenant/authorize";
import { auditLog } from "@/server/audit/audit-log";
import { DomainError } from "@/server/errors/domain-error";

export type CustomFieldType = "text" | "number" | "date" | "boolean" | "select" | "multi_select";

export type CustomFieldDefinition = {
  id: string;
  name: string;
  fieldType: CustomFieldType;
  options: string[] | null;
  isSensitive: boolean;
  minVisibility: string;
  sortOrder: number;
  archivedAt: string | null;
};

export async function listCustomFieldDefinitions(
  churchId: string,
  entityType = "person",
  includeArchived = false,
): Promise<CustomFieldDefinition[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("custom_field_definitions")
    .select("id, name, field_type, options, is_sensitive, min_visibility, sort_order, archived_at")
    .eq("church_id", churchId)
    .eq("entity_type", entityType);

  if (!includeArchived) query = query.is("archived_at", null);

  const { data, error } = await query.order("sort_order");
  if (error || !data) return [];

  return data.map((f) => ({
    id: f.id,
    name: f.name,
    fieldType: f.field_type as CustomFieldType,
    options: (f.options as string[] | null) ?? null,
    isSensitive: f.is_sensitive,
    minVisibility: f.min_visibility,
    sortOrder: f.sort_order,
    archivedAt: f.archived_at,
  }));
}

export type CreateCustomFieldInput = {
  name: string;
  fieldType: CustomFieldType;
  options?: string[];
  isSensitive?: boolean;
  minVisibility?: string;
  entityType?: string;
};

// El esquema (Fase 0) define custom_field_type sin "textarea": una UI que
// necesite área de texto multilínea la representa como "text", sin crear
// un tipo de base de datos separado para una diferencia solo visual.
const VALID_TYPES: CustomFieldType[] = ["text", "number", "date", "boolean", "select", "multi_select"];

export async function createCustomField(
  churchId: string,
  input: CreateCustomFieldInput,
): Promise<{ fieldId: string }> {
  await requireCapability(churchId, "church.settings.manage");

  if (!input.name.trim()) throw new DomainError("VALIDATION_ERROR", "El nombre del campo es obligatorio.");
  if (!VALID_TYPES.includes(input.fieldType)) {
    throw new DomainError("VALIDATION_ERROR", "Tipo de campo no válido.");
  }
  if ((input.fieldType === "select" || input.fieldType === "multi_select") && !input.options?.length) {
    throw new DomainError("VALIDATION_ERROR", "Los campos de selección necesitan al menos una opción.");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("custom_field_definitions")
    .insert({
      church_id: churchId,
      entity_type: input.entityType ?? "person",
      name: input.name.trim(),
      field_type: input.fieldType,
      options: input.options ?? null,
      is_sensitive: input.isSensitive ?? false,
      min_visibility: input.minVisibility ?? "internal",
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") throw new DomainError("CONFLICT", "Ya existe un campo con ese nombre.");
    throw new DomainError("INTERNAL_ERROR", "No se pudo crear el campo personalizado.");
  }

  await auditLog({
    churchId,
    action: "custom_field.created",
    entityType: "custom_field_definitions",
    entityId: data!.id,
    metadata: { name: input.name, field_type: input.fieldType },
  });

  return { fieldId: data!.id };
}

export async function archiveCustomField(churchId: string, fieldId: string): Promise<void> {
  await requireCapability(churchId, "church.settings.manage");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("custom_field_definitions")
    .update({ archived_at: new Date().toISOString() })
    .eq("church_id", churchId)
    .eq("id", fieldId);

  if (error) throw new DomainError("INTERNAL_ERROR", "No se pudo archivar el campo.");

  await auditLog({ churchId, action: "custom_field.updated", entityType: "custom_field_definitions", entityId: fieldId, metadata: { archived: true } });
}

function validateFieldValue(field: CustomFieldDefinition, value: unknown): void {
  switch (field.fieldType) {
    case "number":
      if (typeof value !== "number") throw new DomainError("VALIDATION_ERROR", `"${field.name}" debe ser un número.`);
      break;
    case "boolean":
      if (typeof value !== "boolean") throw new DomainError("VALIDATION_ERROR", `"${field.name}" debe ser verdadero o falso.`);
      break;
    case "date":
      if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
        throw new DomainError("VALIDATION_ERROR", `"${field.name}" debe ser una fecha válida.`);
      }
      break;
    case "select":
      if (typeof value !== "string" || !(field.options ?? []).includes(value)) {
        throw new DomainError("VALIDATION_ERROR", `El valor de "${field.name}" no es una opción válida.`);
      }
      break;
    case "multi_select": {
      const values = Array.isArray(value) ? value : [];
      const allowed = new Set(field.options ?? []);
      if (values.some((v) => !allowed.has(v))) {
        throw new DomainError("VALIDATION_ERROR", `Alguna opción de "${field.name}" no es válida.`);
      }
      break;
    }
    default:
      if (typeof value !== "string") throw new DomainError("VALIDATION_ERROR", `"${field.name}" debe ser texto.`);
  }
}

export async function setCustomFieldValue(
  churchId: string,
  fieldId: string,
  entityId: string,
  value: unknown,
  entityType = "person",
): Promise<void> {
  await requireCapability(churchId, "people.manage");

  const definitions = await listCustomFieldDefinitions(churchId, entityType, true);
  const field = definitions.find((f) => f.id === fieldId);
  if (!field) throw new DomainError("RESOURCE_NOT_FOUND", "Campo personalizado no encontrado.");
  if (field.archivedAt) throw new DomainError("VALIDATION_ERROR", "No se pueden editar valores de un campo archivado.");

  validateFieldValue(field, value);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("custom_field_values").upsert(
    { church_id: churchId, field_definition_id: fieldId, entity_type: entityType, entity_id: entityId, value: value as never },
    { onConflict: "field_definition_id,entity_id" },
  );

  if (error) throw new DomainError("INTERNAL_ERROR", "No se pudo guardar el valor del campo.");
}

export async function getCustomFieldValues(
  churchId: string,
  entityId: string,
  entityType = "person",
): Promise<{ fieldId: string; value: unknown }[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("custom_field_values")
    .select("field_definition_id, value")
    .eq("church_id", churchId)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId);

  if (error || !data) return [];
  return data.map((v) => ({ fieldId: v.field_definition_id, value: v.value }));
}
