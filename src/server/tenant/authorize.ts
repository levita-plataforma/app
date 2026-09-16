import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { DomainError } from "@/server/errors/domain-error";

/**
 * Wrappers sobre las funciones de contexto de base de datos
 * (app.has_capability, app.module_enabled). La autorización real vive en
 * RLS; estos helpers permiten a la capa de aplicación comprobar la misma
 * regla antes de intentar una mutación, para devolver un error de dominio
 * claro en vez de dejar que RLS silencie la operación. Ver docs/adr/0005 y
 * docs/adr/0006.
 */

export async function hasCapability(
  churchId: string,
  capability: string,
  scopeType: string = "church",
  scopeId?: string,
): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("has_capability", {
    p_church_id: churchId,
    p_capability: capability,
    p_scope_type: scopeType,
    p_scope_id: scopeId ?? null,
  });

  if (error) return false;
  return Boolean(data);
}

export async function requireCapability(
  churchId: string,
  capability: string,
  scopeType: string = "church",
  scopeId?: string,
): Promise<void> {
  const allowed = await hasCapability(churchId, capability, scopeType, scopeId);
  if (!allowed) {
    throw new DomainError(
      "FORBIDDEN",
      `No tienes permiso para realizar esta acción (${capability}).`,
    );
  }
}

export async function isModuleEnabled(
  churchId: string,
  moduleKey: string,
): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("module_enabled", {
    p_church_id: churchId,
    p_module_key: moduleKey,
  });

  if (error) return false;
  return Boolean(data);
}

export async function requireModuleEnabled(
  churchId: string,
  moduleKey: string,
): Promise<void> {
  const enabled = await isModuleEnabled(churchId, moduleKey);
  if (!enabled) {
    throw new DomainError(
      "MODULE_DISABLED",
      `El módulo "${moduleKey}" no está habilitado para esta iglesia.`,
    );
  }
}
