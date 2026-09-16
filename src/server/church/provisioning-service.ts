import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { DomainError } from "@/server/errors/domain-error";

export type ProvisionChurchInput = {
  name: string;
  slug: string;
  locale: string;
  timezone: string;
  currency: string;
  country: string;
  ownerFirstName: string;
  ownerLastName: string;
  ownerEmail: string;
  ownerPhone?: string;
  campusName?: string;
  campusAddress?: string;
  campusCity?: string;
  campusProvince?: string;
  campusPostalCode?: string;
  moduleKeys?: string[];
  idempotencyKey?: string;
};

export type ProvisionChurchResult = {
  churchId: string;
  campusId: string;
  personId: string;
  onboardingId: string;
};

const DEFAULT_MODULES = ["people", "serving", "events", "communications"];

/**
 * Punto único de la aplicación para crear una iglesia nueva (autoservicio).
 * Delega en la RPC app.provision_church, transaccional y security definer
 * (ver supabase/migrations/20260917000400_provisioning.sql). Traduce
 * errores de dominio de Postgres (RAISE EXCEPTION '<CODE>: mensaje') a
 * DomainError legible por la UI.
 */
export async function provisionChurch(
  input: ProvisionChurchInput,
): Promise<ProvisionChurchResult> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("provision_church", {
    p_name: input.name,
    p_slug: input.slug,
    p_locale: input.locale,
    p_timezone: input.timezone,
    p_currency: input.currency,
    p_country: input.country,
    p_owner_first_name: input.ownerFirstName,
    p_owner_last_name: input.ownerLastName,
    p_owner_email: input.ownerEmail,
    p_owner_phone: input.ownerPhone ?? null,
    p_campus_name: input.campusName ?? "Sede principal",
    p_campus_address: input.campusAddress ?? null,
    p_campus_city: input.campusCity ?? null,
    p_campus_province: input.campusProvince ?? null,
    p_campus_postal_code: input.campusPostalCode ?? null,
    p_module_keys: input.moduleKeys ?? DEFAULT_MODULES,
    p_idempotency_key: input.idempotencyKey ?? null,
  });

  if (error) {
    throw translateProvisioningError(error.message);
  }

  const row = data?.[0];
  if (!row) {
    throw new DomainError("INTERNAL_ERROR", "No se pudo completar el alta de la iglesia.");
  }

  return {
    churchId: row.out_church_id,
    campusId: row.out_campus_id,
    personId: row.out_person_id,
    onboardingId: row.out_onboarding_id,
  };
}

export async function checkSlugAvailable(slug: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("slug_available", { p_slug: slug });
  if (error) return false;
  return Boolean(data);
}

export async function slugify(name: string): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("slugify", { p_input: name });
  if (error || !data) return "";
  return data;
}

function translateProvisioningError(message: string): DomainError {
  if (message.includes("SLUG_UNAVAILABLE")) {
    return new DomainError("VALIDATION_ERROR", "Ese identificador de iglesia ya está en uso.");
  }
  if (message.includes("AUTH_REQUIRED")) {
    return new DomainError("UNAUTHORIZED", "Debes iniciar sesión para crear una iglesia.");
  }
  return new DomainError("INTERNAL_ERROR", "No se pudo completar el alta de la iglesia.");
}
