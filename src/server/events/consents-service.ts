import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { requireCapability } from "@/server/tenant/authorize";
import { auditLog } from "@/server/audit/audit-log";
import { DomainError } from "@/server/errors/domain-error";

/**
 * Textos de consentimiento versionados (Fase 6 §21, tabla `consent_definitions`
 * / `consent_records`). No hay RPC dedicada para editar: es una tabla simple
 * sin la complejidad de forms/form_fields, así que las mutaciones se hacen
 * directamente con UPDATE, con requireCapability('form.manage') como puerta.
 */

const KEY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

export type ConsentPurposeType = "operational" | "marketing";

export type ConsentDefinition = {
  id: string;
  key: string;
  purposeType: ConsentPurposeType;
  title: string;
  body: string;
  version: number;
  active: boolean;
  createdAt: string;
};

type ConsentDefinitionRow = {
  id: string;
  key: string;
  purpose_type: string;
  title: string;
  body: string;
  version: number;
  active: boolean;
  created_at: string;
};

function mapDefinition(row: ConsentDefinitionRow): ConsentDefinition {
  return {
    id: row.id,
    key: row.key,
    purposeType: row.purpose_type as ConsentPurposeType,
    title: row.title,
    body: row.body,
    version: row.version,
    active: row.active,
    createdAt: row.created_at,
  };
}

export async function listConsentDefinitions(
  churchId: string,
  activeOnly = false,
): Promise<ConsentDefinition[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase.from("consent_definitions").select("*").eq("church_id", churchId);
  if (activeOnly) query = query.eq("active", true);

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error || !data) return [];

  return (data as ConsentDefinitionRow[]).map(mapDefinition);
}

export type CreateConsentDefinitionInput = {
  key: string;
  purposeType: ConsentPurposeType;
  title: string;
  body: string;
};

export async function createConsentDefinition(
  churchId: string,
  input: CreateConsentDefinitionInput,
): Promise<{ consentDefinitionId: string }> {
  await requireCapability(churchId, "form.manage");

  const key = input.key.trim();
  if (!KEY_PATTERN.test(key)) {
    throw new DomainError("VALIDATION_ERROR", "La clave debe empezar por una letra minúscula y contener solo minúsculas, números y guiones bajos.");
  }
  const title = input.title.trim();
  if (!title) throw new DomainError("VALIDATION_ERROR", "El título es obligatorio.");
  const body = input.body.trim();
  if (!body) throw new DomainError("VALIDATION_ERROR", "El texto del consentimiento es obligatorio.");
  if (input.purposeType !== "operational" && input.purposeType !== "marketing") {
    throw new DomainError("VALIDATION_ERROR", "Tipo de finalidad no válido.");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("consent_definitions")
    .insert({
      church_id: churchId,
      key,
      purpose_type: input.purposeType,
      title,
      body,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === "23505") throw new DomainError("CONFLICT", "Ya existe un consentimiento con esa clave.");
    throw new DomainError("INTERNAL_ERROR", "No se pudo crear el consentimiento.");
  }

  await auditLog({
    churchId,
    action: "consent_definition.created",
    entityType: "consent_definitions",
    entityId: data.id,
    metadata: { key, purpose_type: input.purposeType },
  });

  return { consentDefinitionId: data.id };
}

export type UpdateConsentDefinitionInput = {
  title?: string;
  body?: string;
  purposeType?: ConsentPurposeType;
  active?: boolean;
};

/**
 * Sube `version` solo cuando cambia el contenido legal (`body`) o la
 * finalidad (`purpose_type`): son los dos campos cuyo cambio altera el
 * significado de un consentimiento ya dado. `title` y `active` son
 * cosméticos/de disponibilidad y no afectan a consentimientos históricos.
 */
export async function updateConsentDefinition(
  churchId: string,
  definitionId: string,
  input: UpdateConsentDefinitionInput,
): Promise<void> {
  await requireCapability(churchId, "form.manage");

  const patch: Record<string, unknown> = {};
  let bumpVersion = false;

  if (input.title !== undefined) {
    const title = input.title.trim();
    if (!title) throw new DomainError("VALIDATION_ERROR", "El título es obligatorio.");
    patch.title = title;
  }
  if (input.body !== undefined) {
    const body = input.body.trim();
    if (!body) throw new DomainError("VALIDATION_ERROR", "El texto del consentimiento es obligatorio.");
    patch.body = body;
    bumpVersion = true;
  }
  if (input.purposeType !== undefined) {
    if (input.purposeType !== "operational" && input.purposeType !== "marketing") {
      throw new DomainError("VALIDATION_ERROR", "Tipo de finalidad no válido.");
    }
    patch.purpose_type = input.purposeType;
    bumpVersion = true;
  }
  if (input.active !== undefined) patch.active = input.active;

  if (Object.keys(patch).length === 0) return;

  const supabase = await createSupabaseServerClient();

  if (bumpVersion) {
    const { data: current, error: readError } = await supabase
      .from("consent_definitions")
      .select("version")
      .eq("church_id", churchId)
      .eq("id", definitionId)
      .maybeSingle();

    if (readError || !current) throw new DomainError("RESOURCE_NOT_FOUND", "Consentimiento no encontrado.");
    patch.version = current.version + 1;
  }

  const { error } = await supabase
    .from("consent_definitions")
    .update(patch)
    .eq("church_id", churchId)
    .eq("id", definitionId);

  if (error) throw new DomainError("INTERNAL_ERROR", "No se pudo actualizar el consentimiento.");

  await auditLog({
    churchId,
    action: "consent_definition.updated",
    entityType: "consent_definitions",
    entityId: definitionId,
    metadata: { updated: Object.keys(patch), version_bumped: bumpVersion },
  });
}

export type RegistrationConsentRecord = {
  id: string;
  consentDefinitionId: string;
  title: string;
  purposeType: ConsentPurposeType;
  consentVersion: number;
  given: boolean;
  recordedAt: string;
  origin: string;
};

type ConsentRecordRow = {
  id: string;
  consent_definition_id: string;
  consent_version: number;
  given: boolean;
  recorded_at: string;
  origin: string;
  consent_definitions: { title: string; purpose_type: string } | { title: string; purpose_type: string }[] | null;
};

export async function getConsentsForRegistration(
  churchId: string,
  registrationId: string,
): Promise<RegistrationConsentRecord[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("consent_records")
    .select("id, consent_definition_id, consent_version, given, recorded_at, origin, consent_definitions(title, purpose_type)")
    .eq("church_id", churchId)
    .eq("registration_id", registrationId);

  if (error || !data) return [];

  return (data as unknown as ConsentRecordRow[]).map((row) => {
    const def = Array.isArray(row.consent_definitions) ? row.consent_definitions[0] : row.consent_definitions;
    return {
      id: row.id,
      consentDefinitionId: row.consent_definition_id,
      title: def?.title ?? "",
      purposeType: (def?.purpose_type ?? "operational") as ConsentPurposeType,
      consentVersion: row.consent_version,
      given: row.given,
      recordedAt: row.recorded_at,
      origin: row.origin,
    };
  });
}
