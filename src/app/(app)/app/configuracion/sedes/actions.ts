"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { requireCapability } from "@/server/tenant/authorize";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { auditLog } from "@/server/audit/audit-log";
import { DomainError } from "@/server/errors/domain-error";

export type SedesState = { error: string | null; success?: boolean };

export async function crearSedeAction(
  _prevState: SedesState,
  formData: FormData,
): Promise<SedesState> {
  const tenant = await requireTenantContext();
  await requireCapability(tenant.churchId, "church.settings.manage").catch(() => {
    throw new DomainError("FORBIDDEN", "No tienes permiso para gestionar sedes.");
  });

  const name = String(formData.get("name") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();

  if (!name) return { error: "El nombre de la sede es obligatorio." };

  const supabase = await createSupabaseServerClient();
  const slug = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  const { data: campus, error } = await supabase
    .from("campuses")
    .insert({ church_id: tenant.churchId, name, address: address || null, slug, is_primary: false, status: "active" })
    .select("id")
    .single();

  if (error) {
    return { error: error.code === "23505" ? "Ya existe una sede con un nombre muy similar." : "No se pudo crear la sede." };
  }

  await auditLog({
    churchId: tenant.churchId,
    action: "campus.created",
    entityType: "campuses",
    entityId: campus.id,
    metadata: { name },
  });

  revalidatePath("/app/configuracion/sedes");
  return { error: null, success: true };
}

export async function editarSedeAction(
  campusId: string,
  _prevState: SedesState,
  formData: FormData,
): Promise<SedesState> {
  const tenant = await requireTenantContext();
  await requireCapability(tenant.churchId, "church.settings.manage");

  const name = String(formData.get("name") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();

  if (!name) return { error: "El nombre de la sede es obligatorio." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("campuses")
    .update({ name, address: address || null })
    .eq("id", campusId)
    .eq("church_id", tenant.churchId);

  if (error) return { error: "No se pudo actualizar la sede." };

  await auditLog({
    churchId: tenant.churchId,
    action: "campus.updated",
    entityType: "campuses",
    entityId: campusId,
    metadata: { name },
  });

  revalidatePath("/app/configuracion/sedes");
  return { error: null, success: true };
}

/**
 * Marca una sede como principal. La regla "no dos primarias" está
 * blindada por el índice único parcial campuses_one_primary_per_church
 * (Fase 0); aquí se desmarca la anterior y se marca la nueva en la misma
 * operación para no violar esa restricción a mitad de camino.
 */
export async function marcarPrincipalAction(campusId: string): Promise<SedesState> {
  const tenant = await requireTenantContext();
  await requireCapability(tenant.churchId, "church.settings.manage");

  const supabase = await createSupabaseServerClient();

  const { error: unsetError } = await supabase
    .from("campuses")
    .update({ is_primary: false })
    .eq("church_id", tenant.churchId)
    .eq("is_primary", true);

  if (unsetError) return { error: "No se pudo cambiar la sede principal." };

  const { error: setError } = await supabase
    .from("campuses")
    .update({ is_primary: true })
    .eq("id", campusId)
    .eq("church_id", tenant.churchId);

  if (setError) return { error: "No se pudo cambiar la sede principal." };

  await auditLog({
    churchId: tenant.churchId,
    action: "campus.updated",
    entityType: "campuses",
    entityId: campusId,
    metadata: { is_primary: true },
  });

  revalidatePath("/app/configuracion/sedes");
  return { error: null, success: true };
}

/**
 * Archiva una sede. Rechaza archivar la única sede activa (encargo de
 * Fase 1 §15): se comprueba en aplicación antes de mutar, aunque la regla
 * de negocio real vive aquí, no en una constraint de base (una iglesia sin
 * ninguna sede activa rompería el resto del producto de forma silenciosa).
 */
export async function archivarSedeAction(campusId: string): Promise<SedesState> {
  const tenant = await requireTenantContext();
  await requireCapability(tenant.churchId, "church.settings.manage");

  const supabase = await createSupabaseServerClient();

  const { count } = await supabase
    .from("campuses")
    .select("id", { count: "exact", head: true })
    .eq("church_id", tenant.churchId)
    .eq("status", "active")
    .is("archived_at", null);

  if ((count ?? 0) <= 1) {
    return { error: "No puedes archivar la única sede activa de tu iglesia." };
  }

  const { data: campus } = await supabase
    .from("campuses")
    .select("is_primary")
    .eq("id", campusId)
    .single();

  if (campus?.is_primary) {
    return { error: "No puedes archivar la sede principal. Marca otra sede como principal primero." };
  }

  const { error } = await supabase
    .from("campuses")
    .update({ status: "archived", archived_at: new Date().toISOString() })
    .eq("id", campusId)
    .eq("church_id", tenant.churchId);

  if (error) return { error: "No se pudo archivar la sede." };

  await auditLog({
    churchId: tenant.churchId,
    action: "campus.archived",
    entityType: "campuses",
    entityId: campusId,
  });

  revalidatePath("/app/configuracion/sedes");
  return { error: null, success: true };
}
