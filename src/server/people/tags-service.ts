import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { requireCapability } from "@/server/tenant/authorize";
import { auditLog } from "@/server/audit/audit-log";
import { DomainError } from "@/server/errors/domain-error";

export type Tag = { id: string; name: string; color: string | null; archivedAt: string | null };

export async function listTags(churchId: string, includeArchived = false): Promise<Tag[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase.from("tags").select("id, name, color, archived_at").eq("church_id", churchId);
  if (!includeArchived) query = query.is("archived_at", null);

  const { data, error } = await query.order("name");
  if (error || !data) return [];

  return data.map((t) => ({ id: t.id, name: t.name, color: t.color, archivedAt: t.archived_at }));
}

export async function createTag(churchId: string, name: string, color?: string): Promise<{ tagId: string }> {
  await requireCapability(churchId, "people.manage");

  if (!name.trim()) throw new DomainError("VALIDATION_ERROR", "El nombre de la etiqueta es obligatorio.");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tags")
    .insert({ church_id: churchId, name: name.trim(), color: color || null })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") throw new DomainError("CONFLICT", "Ya existe una etiqueta con ese nombre.");
    throw new DomainError("INTERNAL_ERROR", "No se pudo crear la etiqueta.");
  }

  await auditLog({ churchId, action: "tag.created", entityType: "tags", entityId: data!.id, metadata: { name } });

  return { tagId: data!.id };
}

export async function updateTag(churchId: string, tagId: string, name: string, color?: string): Promise<void> {
  await requireCapability(churchId, "people.manage");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("tags")
    .update({ name: name.trim(), color: color || null })
    .eq("church_id", churchId)
    .eq("id", tagId);

  if (error) throw new DomainError("INTERNAL_ERROR", "No se pudo actualizar la etiqueta.");

  await auditLog({ churchId, action: "tag.updated", entityType: "tags", entityId: tagId, metadata: { name } });
}

export async function archiveTag(churchId: string, tagId: string): Promise<void> {
  await requireCapability(churchId, "people.manage");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("tags")
    .update({ archived_at: new Date().toISOString() })
    .eq("church_id", churchId)
    .eq("id", tagId);

  if (error) throw new DomainError("INTERNAL_ERROR", "No se pudo archivar la etiqueta.");

  await auditLog({ churchId, action: "tag.updated", entityType: "tags", entityId: tagId, metadata: { archived: true } });
}

export async function addTagToPerson(churchId: string, personId: string, tagId: string): Promise<void> {
  await requireCapability(churchId, "people.manage");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("person_tags").insert({ church_id: churchId, person_id: personId, tag_id: tagId });

  if (error) {
    if (error.code === "23505") return; // ya asignada: idempotente
    throw new DomainError("INTERNAL_ERROR", "No se pudo asignar la etiqueta.");
  }

  await auditLog({ churchId, action: "person.tag_added", entityType: "people", entityId: personId, metadata: { tag_id: tagId } });
}

export async function removeTagFromPerson(churchId: string, personId: string, tagId: string): Promise<void> {
  await requireCapability(churchId, "people.manage");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("person_tags")
    .delete()
    .eq("church_id", churchId)
    .eq("person_id", personId)
    .eq("tag_id", tagId);

  if (error) throw new DomainError("INTERNAL_ERROR", "No se pudo quitar la etiqueta.");

  await auditLog({ churchId, action: "person.tag_removed", entityType: "people", entityId: personId, metadata: { tag_id: tagId } });
}
