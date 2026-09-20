import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { toDomainError } from "@/server/activities/rpc";

/**
 * Panel de operación de LEVITA (Fase 14).
 *
 * Esto no es la administración de una iglesia: es la del producto. Por eso no
 * usa `requireTenantContext` ni las capacidades de iglesia, sino la identidad
 * de operador y sus capacidades propias. Ser administrador de una iglesia no da
 * acceso aquí, y estar aquí no da acceso a los datos de ninguna iglesia.
 *
 * Todo lo que se lee pasa por RPC `security definer` que comprueban la
 * capacidad dentro. Este fichero nunca consulta `churches`, `subscriptions` o
 * `invitations` directamente: si lo hiciera, dependería de que las políticas de
 * esas tablas dejaran pasar al operador, y esas políticas están pensadas para
 * el tenant, no para el panel.
 */

export const PLATFORM_CAPABILITIES = [
  "platform.churches.read",
  "platform.churches.create",
  "platform.owners.manage",
  "platform.modules.manage",
  "platform.operators.manage",
] as const;

export type PlatformCapability = (typeof PLATFORM_CAPABILITIES)[number];

export type OperatorContext = {
  userId: string;
  capabilities: PlatformCapability[];
};

/**
 * Quién es quien mira, si es que es alguien. Devuelve null cuando la cuenta no
 * es de operación, sin distinguir entre «no hay sesión» y «no eres operador»:
 * esa diferencia no le interesa a quien no debería estar aquí.
 */
export async function getOperatorContext(): Promise<OperatorContext | null> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: operador } = await supabase
    .from("platform_operators")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!operador) return null;

  const { data: capacidades } = await supabase
    .from("platform_operator_capabilities")
    .select("capability_key")
    .eq("user_id", user.id);

  return {
    userId: user.id,
    capabilities: (capacidades ?? [])
      .map((c) => c.capability_key)
      .filter((k): k is PlatformCapability =>
        (PLATFORM_CAPABILITIES as readonly string[]).includes(k),
      ),
  };
}

export function tiene(contexto: OperatorContext | null, capacidad: PlatformCapability): boolean {
  return contexto?.capabilities.includes(capacidad) ?? false;
}

// ---------------------------------------------------------------------------
// Lecturas
// ---------------------------------------------------------------------------

export type PlatformOverview = {
  iglesiasActivas: number;
  iglesiasArchivadas: number;
  altasIncompletas: number;
  invitacionesPendientes: number;
  invitacionesCaducadas: number;
  iglesiasSinPropietario: number;
};

export async function getOverview(): Promise<PlatformOverview> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("platform_overview");
  if (error) throw toDomainError(error, "No se pudo cargar el resumen.");

  const fila = data?.[0];
  return {
    iglesiasActivas: fila?.iglesias_activas ?? 0,
    iglesiasArchivadas: fila?.iglesias_archivadas ?? 0,
    altasIncompletas: fila?.altas_incompletas ?? 0,
    invitacionesPendientes: fila?.invitaciones_pendientes ?? 0,
    invitacionesCaducadas: fila?.invitaciones_caducadas ?? 0,
    iglesiasSinPropietario: fila?.iglesias_sin_propietario ?? 0,
  };
}

export type ChurchListItem = {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  archivedAt: string | null;
  planKey: string | null;
  subscriptionStatus: string | null;
  onboardingCompleted: boolean;
  modulesEnabled: number;
  campusesCount: number;
  peopleCount: number;
  hasOwner: boolean;
};

export type ChurchFilters = {
  search?: string;
  status?: string;
  plan?: string;
  module?: string;
  createdFrom?: string;
  page?: number;
  pageSize?: number;
};

export async function listChurches(
  filtros: ChurchFilters = {},
): Promise<{ items: ChurchListItem[]; total: number; page: number; pageSize: number }> {
  const supabase = await createSupabaseServerClient();
  const pageSize = Math.min(Math.max(filtros.pageSize ?? 25, 1), 100);
  const page = Math.max(filtros.page ?? 1, 1);

  const { data, error } = await supabase.rpc("platform_churches", {
    p_search: filtros.search ?? undefined,
    p_status: filtros.status ?? undefined,
    p_plan: filtros.plan ?? undefined,
    p_module: filtros.module ?? undefined,
    p_created_from: filtros.createdFrom ?? undefined,
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  });

  if (error) throw toDomainError(error, "No se pudo cargar el listado de iglesias.");

  type FilaIglesia = {
    id: string; name: string; slug: string; status: string; created_at: string;
    archived_at: string | null; plan_key: string | null; subscription_status: string | null;
    onboarding_completed: boolean; modules_enabled: number; campuses_count: number;
    people_count: number; has_owner: boolean; total_count: number;
  };
  const filas = (data ?? []) as FilaIglesia[];
  return {
    items: filas.map((f) => ({
      id: f.id,
      name: f.name,
      slug: f.slug,
      status: f.status,
      createdAt: f.created_at,
      archivedAt: f.archived_at,
      planKey: f.plan_key,
      subscriptionStatus: f.subscription_status,
      onboardingCompleted: f.onboarding_completed,
      modulesEnabled: f.modules_enabled,
      campusesCount: f.campuses_count,
      peopleCount: f.people_count,
      hasOwner: f.has_owner,
    })),
    // El total viaja en cada fila porque la cuenta se hace dentro de la misma
    // consulta: pedirla aparte daría un número de otro instante.
    total: filas[0]?.total_count ?? 0,
    page,
    pageSize,
  };
}

/** La ficha llega como jsonb desde la base; aquí solo se le pone tipo. */
export type ChurchDetail = {
  id: string;
  name: string;
  slug: string;
  status: string;
  locale: string | null;
  timezone: string | null;
  currency: string | null;
  created_at: string;
  archived_at: string | null;
  onboarding: { current_step: string | null; completed_steps: unknown; started_at: string | null; completed_at: string | null } | null;
  subscription: { plan_key: string; status: string; trial_ends_at: string | null; started_at: string | null; renews_at: string | null; cancel_at: string | null } | null;
  responsables: { person_id: string; name: string; role_key: string; has_account: boolean }[];
  invitaciones: { id: string; role_key: string; status: string; expires_at: string | null; created_at: string; caducada: boolean }[];
  sedes: { id: string; name: string; archived_at: string | null }[];
  modulos: { module_key: string; name: string; status: string; enabled_at: string | null }[];
  historial: { action: string; created_at: string; metadata: Record<string, unknown> }[];
};

export async function getChurchDetail(churchId: string): Promise<ChurchDetail> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("platform_church_detail", { p_church_id: churchId });
  if (error) throw toDomainError(error, "No se pudo cargar la ficha de la iglesia.");
  return data as unknown as ChurchDetail;
}

export type ChurchContact = { personId: string; name: string; roleKey: string; email: string | null };

/**
 * Correos de los responsables. Cada consulta queda registrada en la auditoría
 * de plataforma: es una lectura de datos personales, no un dato más de la ficha.
 */
export async function getChurchContacts(churchId: string): Promise<ChurchContact[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("platform_church_contacts", { p_church_id: churchId });
  if (error) throw toDomainError(error, "No se pudieron cargar los contactos.");
  type FilaContacto = { person_id: string; name: string; role_key: string; email: string | null };
  return ((data ?? []) as FilaContacto[]).map((c) => ({
    personId: c.person_id,
    name: c.name,
    roleKey: c.role_key,
    email: c.email,
  }));
}

// ---------------------------------------------------------------------------
// Acciones
// ---------------------------------------------------------------------------

export async function setModule(
  churchId: string,
  moduleKey: string,
  enabled: boolean,
  motivo?: string,
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("platform_set_module", {
    p_church_id: churchId,
    p_module_key: moduleKey,
    p_enabled: enabled,
    p_motivo: motivo ?? undefined,
  });
  if (error) throw toDomainError(error, "No se pudo cambiar el módulo.");
}

export async function inviteAdmin(
  churchId: string,
  email: string,
  roleKey: "church_owner" | "church_admin",
): Promise<{ id: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("platform_invite_admin", {
    p_church_id: churchId,
    p_email: email,
    p_role_key: roleKey,
  });
  if (error) throw toDomainError(error, "No se pudo crear la invitación.");
  return { id: data as string };
}

export async function revokeInvitation(invitationId: string, motivo?: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("platform_revoke_invitation", {
    p_invitation_id: invitationId,
    p_motivo: motivo ?? undefined,
  });
  if (error) throw toDomainError(error, "No se pudo revocar la invitación.");
}

export async function removeAdmin(churchId: string, personId: string, motivo?: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("platform_remove_admin", {
    p_church_id: churchId,
    p_person_id: personId,
    p_motivo: motivo ?? undefined,
  });
  if (error) throw toDomainError(error, "No se pudo retirar al responsable.");
}

export type CreateChurchInput = {
  name: string;
  slug: string;
  locale: string;
  timezone: string;
  currency: string;
  country: string;
  ownerEmail: string;
  moduleKeys: string[];
};

export async function createChurch(input: CreateChurchInput): Promise<{ churchId: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("platform_create_church", {
    p_name: input.name,
    p_slug: input.slug,
    p_locale: input.locale,
    p_timezone: input.timezone,
    p_currency: input.currency,
    p_country: input.country,
    p_owner_email: input.ownerEmail,
    p_module_keys: input.moduleKeys,
  });
  if (error) throw toDomainError(error, "No se pudo crear la iglesia.");
  return { churchId: (data?.[0]?.out_church_id ?? "") as string };
}
