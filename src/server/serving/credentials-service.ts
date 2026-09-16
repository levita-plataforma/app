import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { requireCapability, hasCapability } from "@/server/tenant/authorize";
import { auditLog } from "@/server/audit/audit-log";
import { DomainError } from "@/server/errors/domain-error";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Credenciales y acreditaciones (Fase 3 §13-§14). LEVITA nunca almacena el
 * documento en sí: solo el estado, la vigencia y una referencia
 * administrativa. Los tipos marcados `sensitive` (LOPIVI y equivalentes)
 * solo son visibles con credential.sensitive.read; RLS ya lo impone a nivel
 * de fila y aquí se filtra además en aplicación (defensa en profundidad).
 */

// Etiquetas en español: app/(app)/app/servicios/labels.ts (client-safe).
export type CredentialStatus = Database["public"]["Enums"]["credential_status"];

export type CredentialType = {
  id: string;
  name: string;
  description: string | null;
  requiresExpiry: boolean;
  sensitive: boolean;
  active: boolean;
  archivedAt: string | null;
};

export async function listCredentialTypes(churchId: string, includeArchived = false): Promise<CredentialType[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("credential_types")
    .select("id, name, description, requires_expiry, sensitive, active, archived_at")
    .eq("church_id", churchId);

  if (!includeArchived) query = query.is("archived_at", null);

  const { data, error } = await query.order("name");
  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    requiresExpiry: row.requires_expiry,
    sensitive: row.sensitive,
    active: row.active,
    archivedAt: row.archived_at,
  }));
}

export type CreateCredentialTypeInput = {
  name: string;
  description?: string;
  requiresExpiry?: boolean;
  sensitive?: boolean;
};

export async function createCredentialType(
  churchId: string,
  input: CreateCredentialTypeInput,
): Promise<{ credentialTypeId: string }> {
  await requireCapability(churchId, "credential.manage");

  const name = input.name.trim();
  if (!name) throw new DomainError("VALIDATION_ERROR", "El nombre del tipo de credencial es obligatorio.");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("credential_types")
    .insert({
      church_id: churchId,
      name,
      description: input.description?.trim() || null,
      requires_expiry: input.requiresExpiry ?? true,
      sensitive: input.sensitive ?? false,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === "23505") throw new DomainError("CONFLICT", "Ya existe un tipo de credencial con ese nombre.");
    throw new DomainError("INTERNAL_ERROR", "No se pudo crear el tipo de credencial.");
  }

  await auditLog({
    churchId,
    action: "credential_type.created",
    entityType: "credential_types",
    entityId: data.id,
    metadata: { name, sensitive: input.sensitive ?? false },
  });

  return { credentialTypeId: data.id };
}

export type UpdateCredentialTypeInput = CreateCredentialTypeInput & { active?: boolean };

export async function updateCredentialType(
  churchId: string,
  credentialTypeId: string,
  input: Partial<UpdateCredentialTypeInput>,
): Promise<void> {
  await requireCapability(churchId, "credential.manage");

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new DomainError("VALIDATION_ERROR", "El nombre del tipo de credencial es obligatorio.");
    patch.name = name;
  }
  if (input.description !== undefined) patch.description = input.description.trim() || null;
  if (input.requiresExpiry !== undefined) patch.requires_expiry = input.requiresExpiry;
  if (input.sensitive !== undefined) patch.sensitive = input.sensitive;
  if (input.active !== undefined) patch.active = input.active;
  if (Object.keys(patch).length === 0) return;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("credential_types")
    .update(patch)
    .eq("church_id", churchId)
    .eq("id", credentialTypeId);

  if (error) throw new DomainError("INTERNAL_ERROR", "No se pudo actualizar el tipo de credencial.");

  await auditLog({
    churchId,
    action: "credential_type.created",
    entityType: "credential_types",
    entityId: credentialTypeId,
    metadata: { updated: Object.keys(patch) },
  });
}

export async function archiveCredentialType(churchId: string, credentialTypeId: string): Promise<void> {
  await requireCapability(churchId, "credential.manage");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("credential_types")
    .update({ archived_at: new Date().toISOString(), active: false })
    .eq("church_id", churchId)
    .eq("id", credentialTypeId);

  if (error) throw new DomainError("INTERNAL_ERROR", "No se pudo archivar el tipo de credencial.");

  await auditLog({
    churchId,
    action: "credential_type.created",
    entityType: "credential_types",
    entityId: credentialTypeId,
    metadata: { archived: true },
  });
}

export type PersonCredential = {
  id: string;
  personId: string;
  firstName: string;
  lastName: string | null;
  credentialTypeId: string;
  credentialTypeName: string;
  sensitive: boolean;
  status: CredentialStatus;
  issuedAt: string | null;
  expiresAt: string | null;
  verifiedAt: string | null;
  reference: string | null;
};

type CredentialRow = {
  id: string;
  person_id: string;
  credential_type_id: string;
  status: CredentialStatus;
  issued_at: string | null;
  expires_at: string | null;
  verified_at: string | null;
  reference: string | null;
  credential_types: { name: string; sensitive: boolean } | { name: string; sensitive: boolean }[] | null;
  people?: { first_name: string; last_name: string | null } | { first_name: string; last_name: string | null }[] | null;
};

function mapCredential(row: CredentialRow): PersonCredential {
  const type = Array.isArray(row.credential_types) ? row.credential_types[0] : row.credential_types;
  const person = Array.isArray(row.people) ? row.people[0] : row.people;
  return {
    id: row.id,
    personId: row.person_id,
    firstName: person?.first_name ?? "",
    lastName: person?.last_name ?? null,
    credentialTypeId: row.credential_type_id,
    credentialTypeName: type?.name ?? "",
    sensitive: Boolean(type?.sensitive),
    status: row.status,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    verifiedAt: row.verified_at,
    reference: row.reference,
  };
}

const CREDENTIAL_SELECT =
  "id, person_id, credential_type_id, status, issued_at, expires_at, verified_at, reference, credential_types(name, sensitive)";

export async function listPersonCredentials(churchId: string, personId: string): Promise<PersonCredential[]> {
  const supabase = await createSupabaseServerClient();
  const canSeeSensitive = await hasCapability(churchId, "credential.sensitive.read");

  const { data, error } = await supabase
    .from("person_credentials")
    .select(CREDENTIAL_SELECT)
    .eq("church_id", churchId)
    .eq("person_id", personId)
    .order("expires_at", { nullsFirst: false });

  if (error || !data) return [];

  return (data as CredentialRow[])
    .map(mapCredential)
    .filter((c) => canSeeSensitive || !c.sensitive);
}

/**
 * Credenciales de un conjunto de personas en una sola consulta (evita el
 * N+1 en la ficha de área). Respeta el filtro de tipos sensibles igual que
 * listPersonCredentials.
 */
export async function listCredentialsForPeople(
  churchId: string,
  personIds: string[],
): Promise<PersonCredential[]> {
  if (personIds.length === 0) return [];

  const supabase = await createSupabaseServerClient();
  const canSeeSensitive = await hasCapability(churchId, "credential.sensitive.read");

  const { data, error } = await supabase
    .from("person_credentials")
    .select(`${CREDENTIAL_SELECT}, people(first_name, last_name)`)
    .eq("church_id", churchId)
    .in("person_id", personIds);

  if (error || !data) return [];

  return (data as CredentialRow[]).map(mapCredential).filter((c) => canSeeSensitive || !c.sensitive);
}

export type CredentialFilters = {
  status?: CredentialStatus;
  expiringWithinDays?: number;
  credentialTypeId?: string;
  page?: number;
  pageSize?: number;
};

const DEFAULT_PAGE_SIZE = 25;

export async function listCredentialsWithFilters(
  churchId: string,
  filters: CredentialFilters = {},
): Promise<{ items: PersonCredential[]; total: number; page: number; pageSize: number }> {
  const supabase = await createSupabaseServerClient();
  const canSeeSensitive = await hasCapability(churchId, "credential.sensitive.read");

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = [25, 50, 100].includes(filters.pageSize ?? DEFAULT_PAGE_SIZE)
    ? (filters.pageSize ?? DEFAULT_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("person_credentials")
    .select(`${CREDENTIAL_SELECT}, people(first_name, last_name)`, { count: "exact" })
    .eq("church_id", churchId);

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.credentialTypeId) query = query.eq("credential_type_id", filters.credentialTypeId);
  if (filters.expiringWithinDays !== undefined) {
    const limit = new Date();
    limit.setDate(limit.getDate() + filters.expiringWithinDays);
    query = query.not("expires_at", "is", null).lte("expires_at", limit.toISOString());
  }

  const { data, count, error } = await query.order("expires_at", { nullsFirst: false }).range(from, to);
  if (error || !data) return { items: [], total: 0, page, pageSize };

  const items = (data as CredentialRow[])
    .map(mapCredential)
    .filter((c) => canSeeSensitive || !c.sensitive);

  return { items, total: count ?? items.length, page, pageSize };
}

export type AssignCredentialInput = {
  status?: CredentialStatus;
  issuedAt?: string | null;
  expiresAt?: string | null;
  reference?: string;
};

export async function assignCredential(
  churchId: string,
  personId: string,
  credentialTypeId: string,
  input: AssignCredentialInput = {},
): Promise<{ credentialId: string }> {
  await requireCapability(churchId, "credential.manage");

  if (!personId) throw new DomainError("VALIDATION_ERROR", "Selecciona una persona.");
  if (!credentialTypeId) throw new DomainError("VALIDATION_ERROR", "Selecciona un tipo de credencial.");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("person_credentials")
    .insert({
      church_id: churchId,
      person_id: personId,
      credential_type_id: credentialTypeId,
      status: input.status ?? "pending",
      issued_at: input.issuedAt || null,
      expires_at: input.expiresAt || null,
      reference: input.reference?.trim() || null,
    })
    .select("id")
    .single();

  if (error || !data) throw new DomainError("INTERNAL_ERROR", "No se pudo registrar la credencial.");

  // Nunca se audita `reference`: puede contener un identificador personal.
  await auditLog({
    churchId,
    action: "credential.created",
    entityType: "person_credentials",
    entityId: data.id,
    metadata: { person_id: personId, credential_type_id: credentialTypeId, status: input.status ?? "pending" },
  });

  return { credentialId: data.id };
}

export async function verifyCredential(churchId: string, credentialId: string): Promise<void> {
  await requireCapability(churchId, "credential.manage");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("person_credentials")
    .update({
      status: "valid",
      verified_at: new Date().toISOString(),
      verified_by: user?.id ?? null,
    })
    .eq("church_id", churchId)
    .eq("id", credentialId);

  if (error) throw new DomainError("INTERNAL_ERROR", "No se pudo verificar la credencial.");

  await auditLog({
    churchId,
    action: "credential.verified",
    entityType: "person_credentials",
    entityId: credentialId,
    metadata: { status: "valid" },
  });
}

export async function revokeCredential(churchId: string, credentialId: string): Promise<void> {
  await requireCapability(churchId, "credential.manage");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("person_credentials")
    .update({ status: "revoked" })
    .eq("church_id", churchId)
    .eq("id", credentialId);

  if (error) throw new DomainError("INTERNAL_ERROR", "No se pudo revocar la credencial.");

  await auditLog({
    churchId,
    action: "credential.revoked",
    entityType: "person_credentials",
    entityId: credentialId,
    metadata: { status: "revoked" },
  });
}

export async function updateCredential(
  churchId: string,
  credentialId: string,
  input: AssignCredentialInput,
): Promise<void> {
  await requireCapability(churchId, "credential.manage");

  const patch: Record<string, unknown> = {};
  if (input.status !== undefined) patch.status = input.status;
  if (input.issuedAt !== undefined) patch.issued_at = input.issuedAt || null;
  if (input.expiresAt !== undefined) patch.expires_at = input.expiresAt || null;
  if (input.reference !== undefined) patch.reference = input.reference.trim() || null;
  if (Object.keys(patch).length === 0) return;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("person_credentials")
    .update(patch)
    .eq("church_id", churchId)
    .eq("id", credentialId);

  if (error) throw new DomainError("INTERNAL_ERROR", "No se pudo actualizar la credencial.");

  await auditLog({
    churchId,
    action: "credential.created",
    entityType: "person_credentials",
    entityId: credentialId,
    metadata: { updated: Object.keys(patch).filter((k) => k !== "reference") },
  });
}
