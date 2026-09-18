import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { requireCapability } from "@/server/tenant/authorize";
import { auditLog } from "@/server/audit/audit-log";
import { DomainError } from "@/server/errors/domain-error";
import { toDomainError } from "@/server/activities/rpc";

/**
 * Formularios reutilizables y versionados (Fase 6 §11-14). Un formulario no
 * está limitado a un evento: catálogo tenant-aware reutilizable. El
 * versionado es estructural (forms.current_version) y sube solo cuando un
 * cambio en form_fields afecta al significado de una respuesta ya dada
 * (crear/archivar un campo, o cambiar su required/type/options). Cambios
 * cosméticos (label, help_text) no suben versión.
 *
 * NUNCA se borran formularios ni campos con submissions históricas: no hay
 * DELETE, solo archived_at (form_submissions congela su propio esquema via
 * fields_snapshot, así que un campo archivado no rompe respuestas pasadas).
 */

export type FormFieldType =
  | "text"
  | "textarea"
  | "email"
  | "phone"
  | "number"
  | "date"
  | "select"
  | "multi_select"
  | "checkbox"
  | "boolean"
  | "address";

export type FormFieldClassification = "normal" | "personal" | "sensitive" | "restricted";

const SENSITIVE_CLASSIFICATIONS: FormFieldClassification[] = ["sensitive", "restricted"];

// ---------------------------------------------------------------------------
// Formularios
// ---------------------------------------------------------------------------

export type FormListItem = {
  id: string;
  name: string;
  description: string | null;
  purpose: string;
  active: boolean;
  currentVersion: number;
  archivedAt: string | null;
  submissionCount: number;
};

export type FormListFilters = {
  active?: boolean;
  archived?: boolean;
};

export async function listForms(churchId: string, filters: FormListFilters = {}): Promise<FormListItem[]> {
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("forms")
    .select("id, name, description, purpose, active, current_version, archived_at")
    .eq("church_id", churchId);

  query = filters.archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (filters.active !== undefined) query = query.eq("active", filters.active);

  const { data, error } = await query.order("name", { ascending: true });
  if (error) throw toDomainError(error, "No se pudieron cargar los formularios.");

  const forms = data ?? [];
  const formIds = forms.map((f) => f.id);
  const counts = await countSubmissionsByForm(churchId, formIds);

  return forms.map((form) => ({
    id: form.id,
    name: form.name,
    description: form.description,
    purpose: form.purpose,
    active: form.active,
    currentVersion: form.current_version,
    archivedAt: form.archived_at,
    submissionCount: counts.get(form.id) ?? 0,
  }));
}

async function countSubmissionsByForm(churchId: string, formIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (formIds.length === 0) return counts;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("form_submissions")
    .select("form_id")
    .eq("church_id", churchId)
    .in("form_id", formIds);

  for (const row of data ?? []) {
    counts.set(row.form_id, (counts.get(row.form_id) ?? 0) + 1);
  }
  return counts;
}

export type FormFieldItem = {
  id: string;
  key: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  helpText: string | null;
  options: unknown | null;
  sortOrder: number;
  classification: FormFieldClassification;
  validation: unknown;
};

export type FormDetail = FormListItem & {
  fields: FormFieldItem[];
};

export async function getForm(churchId: string, formId: string): Promise<FormDetail | null> {
  const supabase = await createSupabaseServerClient();

  const { data: form, error: formError } = await supabase
    .from("forms")
    .select("id, name, description, purpose, active, current_version, archived_at")
    .eq("church_id", churchId)
    .eq("id", formId)
    .maybeSingle();

  if (formError) throw toDomainError(formError, "No se pudo cargar el formulario.");
  if (!form) return null;

  const { data: fields, error: fieldsError } = await supabase
    .from("form_fields")
    .select("id, key, label, type, required, help_text, options, sort_order, classification, validation")
    .eq("church_id", churchId)
    .eq("form_id", formId)
    .is("archived_at", null)
    .order("sort_order", { ascending: true });

  if (fieldsError) throw toDomainError(fieldsError, "No se pudieron cargar los campos del formulario.");

  const counts = await countSubmissionsByForm(churchId, [formId]);

  return {
    id: form.id,
    name: form.name,
    description: form.description,
    purpose: form.purpose,
    active: form.active,
    currentVersion: form.current_version,
    archivedAt: form.archived_at,
    submissionCount: counts.get(formId) ?? 0,
    fields: (fields ?? []).map((f) => ({
      id: f.id,
      key: f.key,
      label: f.label,
      type: f.type,
      required: f.required,
      helpText: f.help_text,
      options: f.options,
      sortOrder: f.sort_order,
      classification: f.classification,
      validation: f.validation,
    })),
  };
}

export type CreateFormInput = {
  name: string;
  description?: string | null;
  purpose: string;
};

export async function createForm(churchId: string, input: CreateFormInput): Promise<{ formId: string }> {
  await requireCapability(churchId, "form.manage");

  const name = input.name.trim();
  const purpose = input.purpose.trim();
  if (!name) throw new DomainError("VALIDATION_ERROR", "El nombre del formulario es obligatorio.");
  if (!purpose) throw new DomainError("VALIDATION_ERROR", "La finalidad del formulario es obligatoria.");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("forms")
    .insert({
      church_id: churchId,
      name,
      description: input.description?.trim() || null,
      purpose,
    })
    .select("id")
    .single();

  if (error || !data) throw toDomainError(error!, "No se pudo crear el formulario.");

  await auditLog({ churchId, action: "form.created", entityType: "forms", entityId: data.id, metadata: { name } });

  return { formId: data.id };
}

export type UpdateFormInput = {
  name?: string;
  description?: string | null;
  purpose?: string;
  active?: boolean;
};

/** Solo metadatos del formulario en sí (nunca sube versión: cosmético). */
export async function updateForm(churchId: string, formId: string, input: UpdateFormInput): Promise<void> {
  await requireCapability(churchId, "form.manage");

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new DomainError("VALIDATION_ERROR", "El nombre del formulario es obligatorio.");
    patch.name = name;
  }
  if (input.description !== undefined) patch.description = input.description?.trim() || null;
  if (input.purpose !== undefined) {
    const purpose = input.purpose.trim();
    if (!purpose) throw new DomainError("VALIDATION_ERROR", "La finalidad del formulario es obligatoria.");
    patch.purpose = purpose;
  }
  if (input.active !== undefined) patch.active = input.active;

  if (Object.keys(patch).length === 0) return;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("forms").update(patch).eq("church_id", churchId).eq("id", formId);
  if (error) throw toDomainError(error, "No se pudo actualizar el formulario.");

  await auditLog({ churchId, action: "form.updated", entityType: "forms", entityId: formId, metadata: patch });
}

export async function duplicateForm(churchId: string, formId: string): Promise<{ formId: string }> {
  await requireCapability(churchId, "form.manage");

  const original = await getForm(churchId, formId);
  if (!original) throw new DomainError("RESOURCE_NOT_FOUND", "El formulario no existe.");

  const supabase = await createSupabaseServerClient();

  const { data: newForm, error: formError } = await supabase
    .from("forms")
    .insert({
      church_id: churchId,
      name: `${original.name} (copia)`,
      description: original.description,
      purpose: original.purpose,
    })
    .select("id")
    .single();

  if (formError || !newForm) throw toDomainError(formError!, "No se pudo duplicar el formulario.");

  if (original.fields.length > 0) {
    const sensitiveFields = original.fields.filter((f) => SENSITIVE_CLASSIFICATIONS.includes(f.classification));
    if (sensitiveFields.length > 0) {
      await requireCapability(churchId, "form.sensitive.manage");
    }

    const { error: fieldsError } = await supabase.from("form_fields").insert(
      original.fields.map((f) => ({
        church_id: churchId,
        form_id: newForm.id,
        key: f.key,
        label: f.label,
        type: f.type,
        required: f.required,
        help_text: f.helpText,
        options: f.options as never,
        sort_order: f.sortOrder,
        classification: f.classification,
        validation: f.validation as never,
      })),
    );

    if (fieldsError) throw toDomainError(fieldsError, "No se pudieron copiar los campos del formulario.");
  }

  await auditLog({
    churchId,
    action: "form.created",
    entityType: "forms",
    entityId: newForm.id,
    metadata: { duplicated_from_form_id: formId },
  });

  return { formId: newForm.id };
}

/**
 * Archiva el formulario. Nunca se borra un formulario: puede tener
 * submissions históricas cuya interpretación (fields_snapshot) depende de
 * que la fila siga existiendo. Solo se marca archived_at.
 */
export async function archiveForm(churchId: string, formId: string): Promise<void> {
  await requireCapability(churchId, "form.manage");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("forms")
    .update({ archived_at: new Date().toISOString(), active: false })
    .eq("church_id", churchId)
    .eq("id", formId);

  if (error) throw toDomainError(error, "No se pudo archivar el formulario.");

  await auditLog({ churchId, action: "form.updated", entityType: "forms", entityId: formId, metadata: { archived: true } });
}

// ---------------------------------------------------------------------------
// Campos de formulario
// ---------------------------------------------------------------------------

const FIELD_KEY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

async function bumpFormVersion(churchId: string, formId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("bump_form_version", { p_form_id: formId, p_church_id: churchId });
  if (error) throw toDomainError(error, "No se pudo actualizar la versión del formulario.");
}

export type CreateFormFieldInput = {
  key: string;
  label: string;
  type: FormFieldType;
  required?: boolean;
  helpText?: string | null;
  options?: unknown[] | null;
  sortOrder?: number;
  classification?: FormFieldClassification;
};

export async function createFormField(
  churchId: string,
  formId: string,
  input: CreateFormFieldInput,
): Promise<{ fieldId: string }> {
  await requireCapability(churchId, "form.manage");

  const key = input.key.trim();
  if (!FIELD_KEY_PATTERN.test(key)) {
    throw new DomainError("VALIDATION_ERROR", "La clave del campo debe empezar por una letra minúscula y contener solo minúsculas, números y guiones bajos.");
  }
  const label = input.label.trim();
  if (!label) throw new DomainError("VALIDATION_ERROR", "La etiqueta del campo es obligatoria.");

  if (["select", "multi_select"].includes(input.type) && !Array.isArray(input.options)) {
    throw new DomainError("VALIDATION_ERROR", "Los campos de selección requieren una lista de opciones.");
  }

  const classification = input.classification ?? "normal";
  if (SENSITIVE_CLASSIFICATIONS.includes(classification)) {
    // Defensa en profundidad: la RLS ya bloquea esto, pero da un error claro.
    await requireCapability(churchId, "form.sensitive.manage");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("form_fields")
    .insert({
      church_id: churchId,
      form_id: formId,
      key,
      label,
      type: input.type,
      required: input.required ?? false,
      help_text: input.helpText?.trim() || null,
      options: (input.options ?? null) as never,
      sort_order: input.sortOrder ?? 0,
      classification,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === "23505") throw new DomainError("CONFLICT", "Ya existe un campo con esa clave en este formulario.");
    throw toDomainError(error!, "No se pudo crear el campo del formulario.");
  }

  // Añadir un campo siempre afecta al significado de una respuesta.
  await bumpFormVersion(churchId, formId);

  await auditLog({
    churchId,
    action: "form.version_created",
    entityType: "form_fields",
    entityId: data.id,
    metadata: { field_key: key },
  });

  return { fieldId: data.id };
}

export type UpdateFormFieldInput = Partial<{
  label: string;
  helpText: string | null;
  required: boolean;
  type: FormFieldType;
  options: unknown[] | null;
  sortOrder: number;
  classification: FormFieldClassification;
}>;

/**
 * Criterio de versión: solo `required`, `type` u `options` cambian el
 * significado de una respuesta ya dada (una respuesta antigua deja de ser
 * válida o se interpreta distinto). `label`/`helpText`/`sortOrder` son
 * cosméticos y no suben versión. Se decide comparando el input recibido
 * contra lo que realmente iba a cambiar (nunca se sube versión "por si
 * acaso" si el valor nuevo es igual al actual).
 */
export async function updateFormField(churchId: string, fieldId: string, input: UpdateFormFieldInput): Promise<void> {
  await requireCapability(churchId, "form.manage");

  const supabase = await createSupabaseServerClient();
  const { data: current, error: currentError } = await supabase
    .from("form_fields")
    .select("id, form_id, required, type, options, classification")
    .eq("church_id", churchId)
    .eq("id", fieldId)
    .maybeSingle();

  if (currentError) throw toDomainError(currentError, "No se pudo cargar el campo del formulario.");
  if (!current) throw new DomainError("RESOURCE_NOT_FOUND", "El campo no existe.");

  const targetClassification = input.classification ?? current.classification;
  if (SENSITIVE_CLASSIFICATIONS.includes(targetClassification)) {
    await requireCapability(churchId, "form.sensitive.manage");
  }

  if (input.type && ["select", "multi_select"].includes(input.type) && input.options !== undefined && !Array.isArray(input.options)) {
    throw new DomainError("VALIDATION_ERROR", "Los campos de selección requieren una lista de opciones.");
  }

  const patch: Record<string, unknown> = {};
  let meaningfulChange = false;

  if (input.label !== undefined) {
    const label = input.label.trim();
    if (!label) throw new DomainError("VALIDATION_ERROR", "La etiqueta del campo es obligatoria.");
    patch.label = label;
  }
  if (input.helpText !== undefined) patch.help_text = input.helpText?.trim() || null;
  if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;
  if (input.classification !== undefined) patch.classification = input.classification;

  if (input.required !== undefined && input.required !== current.required) {
    patch.required = input.required;
    meaningfulChange = true;
  }
  if (input.type !== undefined && input.type !== current.type) {
    patch.type = input.type;
    meaningfulChange = true;
  }
  if (input.options !== undefined && JSON.stringify(input.options) !== JSON.stringify(current.options)) {
    patch.options = input.options as never;
    meaningfulChange = true;
  }

  if (Object.keys(patch).length === 0) return;

  const { error } = await supabase.from("form_fields").update(patch).eq("church_id", churchId).eq("id", fieldId);
  if (error) throw toDomainError(error, "No se pudo actualizar el campo del formulario.");

  if (meaningfulChange) {
    await bumpFormVersion(churchId, current.form_id);
    await auditLog({
      churchId,
      action: "form.version_created",
      entityType: "form_fields",
      entityId: fieldId,
      metadata: patch,
    });
  } else {
    await auditLog({ churchId, action: "form.updated", entityType: "form_fields", entityId: fieldId, metadata: patch });
  }
}

export async function archiveFormField(churchId: string, fieldId: string): Promise<void> {
  await requireCapability(churchId, "form.manage");

  const supabase = await createSupabaseServerClient();
  const { data: current, error: currentError } = await supabase
    .from("form_fields")
    .select("form_id")
    .eq("church_id", churchId)
    .eq("id", fieldId)
    .maybeSingle();

  if (currentError) throw toDomainError(currentError, "No se pudo cargar el campo del formulario.");
  if (!current) throw new DomainError("RESOURCE_NOT_FOUND", "El campo no existe.");

  const { error } = await supabase
    .from("form_fields")
    .update({ archived_at: new Date().toISOString() })
    .eq("church_id", churchId)
    .eq("id", fieldId);

  if (error) throw toDomainError(error, "No se pudo archivar el campo del formulario.");

  // Quitar un campo requerido cambia el significado de las respuestas.
  await bumpFormVersion(churchId, current.form_id);

  await auditLog({
    churchId,
    action: "form.version_created",
    entityType: "form_fields",
    entityId: fieldId,
    metadata: { archived: true },
  });
}
