import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { toDomainError } from "@/server/activities/rpc";

/**
 * Comunicaciones segmentadas (Fase 9). Lecturas con el cliente del usuario
 * (RLS decide qué ve, requiere capability communications.read); las
 * escrituras y cualquier métrica agregada sobre destinatarios pasan
 * exclusivamente por RPC (ver src/server/communications/*-actions.ts):
 * communication_recipients no tiene política de SELECT para el cliente,
 * igual que notification_deliveries de Fase 5.
 *
 * Este archivo es compartido entre las páginas del dashboard/plantillas/
 * segmentos y el wizard de "nueva comunicación" / ficha de detalle: añade
 * funciones de forma aditiva, sin borrar lo que ya exista.
 */

export const COMMUNICATION_PURPOSES = [
  "institutional",
  "operational",
  "services",
  "groups",
  "events",
  "discipleship",
  "kids",
  "pastoral",
  "system",
] as const;
export type CommunicationPurpose = (typeof COMMUNICATION_PURPOSES)[number];

/** Categorías obligatorias: nunca admiten opt-out (communication_category_preferences las rechaza). */
export const MANDATORY_COMMUNICATION_PURPOSES = ["institutional", "operational", "system"] as const;

/** Categorías opcionales: sujetas a communication_category_preferences (opt-out por persona). */
export const OPTIONAL_COMMUNICATION_PURPOSES = [
  "services",
  "groups",
  "events",
  "discipleship",
  "kids",
  "pastoral",
] as const;
export type OptionalCommunicationPurpose = (typeof OPTIONAL_COMMUNICATION_PURPOSES)[number];

export const COMMUNICATION_PURPOSE_LABELS: Record<CommunicationPurpose, string> = {
  institutional: "Institucional",
  operational: "Operativa",
  services: "Servicios",
  groups: "Grupos",
  events: "Eventos",
  discipleship: "Discipulado",
  kids: "Niños",
  pastoral: "Pastoral",
  system: "Sistema",
};

export const COMMUNICATION_STATUSES = [
  "draft",
  "scheduled",
  "processing",
  "queued",
  "sent",
  "partially_sent",
  "failed",
  // Fase 13: no se pudieron calcular los destinatarios. La comunicación sale
  // de la cola en vez de detenerla, y se recupera con resetFailedCommunication.
  "failed_to_process",
  "cancelled",
] as const;
export type CommunicationStatus = (typeof COMMUNICATION_STATUSES)[number];

export type CommunicationChannel = "inapp" | "email" | "push";

export type CommunicationListItem = {
  id: string;
  title: string;
  purpose: CommunicationPurpose;
  status: CommunicationStatus;
  channels: CommunicationChannel[];
  scheduledAt: string | null;
  sentAt: string | null;
  createdAt: string;
};

export type CommunicationsKpis = {
  sentThisMonth: number;
  scheduled: number;
  drafts: number;
  recentFailures: number;
};

type CommunicationRow = {
  id: string;
  title: string;
  purpose: CommunicationPurpose;
  status: CommunicationStatus;
  channels: CommunicationChannel[];
  scheduled_at: string | null;
  sent_at: string | null;
  created_at: string;
};

function mapCommunication(row: CommunicationRow): CommunicationListItem {
  return {
    id: row.id,
    title: row.title,
    purpose: row.purpose,
    status: row.status,
    channels: row.channels ?? [],
    scheduledAt: row.scheduled_at,
    sentAt: row.sent_at,
    createdAt: row.created_at,
  };
}

export type CommunicationListFilters = {
  status?: CommunicationStatus;
  limit?: number;
};

/** Listado de comunicaciones para el dashboard y vistas de listado. */
export async function listCommunications(
  churchId: string,
  filters: CommunicationListFilters = {},
): Promise<CommunicationListItem[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("communications")
    .select("id, title, purpose, status, channels, scheduled_at, sent_at, created_at")
    .eq("church_id", churchId)
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.limit) query = query.limit(filters.limit);

  const { data, error } = await query;
  if (error) throw toDomainError(error, "No se pudieron cargar las comunicaciones.");
  return ((data ?? []) as CommunicationRow[]).map(mapCommunication);
}

/**
 * KPIs del dashboard del módulo: enviadas este mes, programadas, borradores
 * y fallos recientes (failed o partially_sent). Se calculan en la
 * aplicación a partir de communications (que sí tiene política de SELECT
 * para authenticated con communications.read), nunca contando
 * communication_recipients.
 */
export async function getCommunicationsKpis(churchId: string): Promise<CommunicationsKpis> {
  const supabase = await createSupabaseServerClient();

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [sentThisMonth, scheduled, drafts, recentFailures] = await Promise.all([
    supabase
      .from("communications")
      .select("id", { count: "exact", head: true })
      .eq("church_id", churchId)
      .is("archived_at", null)
      .in("status", ["sent", "partially_sent"])
      .gte("sent_at", startOfMonth.toISOString()),
    supabase
      .from("communications")
      .select("id", { count: "exact", head: true })
      .eq("church_id", churchId)
      .is("archived_at", null)
      .eq("status", "scheduled"),
    supabase
      .from("communications")
      .select("id", { count: "exact", head: true })
      .eq("church_id", churchId)
      .is("archived_at", null)
      .eq("status", "draft"),
    supabase
      .from("communications")
      .select("id", { count: "exact", head: true })
      .eq("church_id", churchId)
      .is("archived_at", null)
      .in("status", ["failed", "partially_sent"]),
  ]);

  if (sentThisMonth.error) throw toDomainError(sentThisMonth.error, "No se pudieron cargar los envíos del mes.");
  if (scheduled.error) throw toDomainError(scheduled.error, "No se pudieron cargar las comunicaciones programadas.");
  if (drafts.error) throw toDomainError(drafts.error, "No se pudieron cargar los borradores.");
  if (recentFailures.error) throw toDomainError(recentFailures.error, "No se pudieron cargar los fallos recientes.");

  return {
    sentThisMonth: sentThisMonth.count ?? 0,
    scheduled: scheduled.count ?? 0,
    drafts: drafts.count ?? 0,
    recentFailures: recentFailures.count ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Plantillas (communication_templates)
// ---------------------------------------------------------------------------

export type CommunicationTemplate = {
  id: string;
  name: string;
  subject: string | null;
  body: string;
  placeholdersAllowed: string[];
  category: string | null;
  createdAt: string;
};

type TemplateRow = {
  id: string;
  name: string;
  subject: string | null;
  body: string;
  placeholders_allowed: string[];
  category: string | null;
  created_at: string;
};

function mapTemplate(row: TemplateRow): CommunicationTemplate {
  return {
    id: row.id,
    name: row.name,
    subject: row.subject,
    body: row.body,
    placeholdersAllowed: row.placeholders_allowed ?? [],
    category: row.category,
    createdAt: row.created_at,
  };
}

/** Plantillas activas (no archivadas) de la iglesia, más recientes primero. */
export async function listCommunicationTemplates(churchId: string): Promise<CommunicationTemplate[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("communication_templates")
    .select("id, name, subject, body, placeholders_allowed, category, created_at")
    .eq("church_id", churchId)
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  if (error) throw toDomainError(error, "No se pudieron cargar las plantillas.");
  return ((data ?? []) as TemplateRow[]).map(mapTemplate);
}

export type CreateCommunicationTemplateInput = {
  name: string;
  subject?: string;
  body: string;
  category?: string;
};

/**
 * Crea una plantilla. La comprobación de la capability
 * communications.manage_templates se hace en el Server Action que llama a
 * esta función (patrón requireCapability), no aquí.
 */
export async function createCommunicationTemplate(
  churchId: string,
  input: CreateCommunicationTemplateInput,
): Promise<{ id: string }> {
  // Por RPC, no por escritura directa: la tabla tiene revocado el insert para
  // authenticated, y la capacidad se comprueba dentro de la función.
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("save_communication_template", {
    p_church_id: churchId,
    p_input: {
      name: input.name,
      subject: input.subject ?? null,
      body: input.body,
      category: input.category ?? null,
    },
  });
  if (error) throw toDomainError(error, "No se pudo crear la plantilla.");
  return { id: data as string };
}

/** Archiva una plantilla (soft-delete vía archived_at). */
export async function archiveCommunicationTemplate(churchId: string, templateId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_communication_template_archived", {
    p_template_id: templateId,
    p_archived: true,
  });
  if (error) throw toDomainError(error, "No se pudo archivar la plantilla.");
}

// ---------------------------------------------------------------------------
// Segmentos (communication_segments)
// ---------------------------------------------------------------------------

export type CommunicationSegment = {
  id: string;
  name: string;
  description: string | null;
  rules: SegmentRulesJson;
  createdAt: string;
};

export type SegmentRuleConditionJson = {
  field: string;
  op: string;
  value: unknown;
};

/** {"all": [...]} = AND, {"any": [...]} = OR. Nunca ambos a la vez, nunca anidado. */
export type SegmentRulesJson =
  | { all: SegmentRuleConditionJson[]; any?: never }
  | { any: SegmentRuleConditionJson[]; all?: never };

export type SegmentRulesMode = "all" | "any";

/** Extrae las condiciones y el modo (AND/OR) de un SegmentRulesJson, sin asumir cuál de las dos claves trae. */
export function getSegmentConditions(rules: SegmentRulesJson): { mode: SegmentRulesMode; conditions: SegmentRuleConditionJson[] } {
  if ("any" in rules && rules.any) return { mode: "any", conditions: rules.any };
  return { mode: "all", conditions: rules.all ?? [] };
}

type SegmentRow = {
  id: string;
  name: string;
  description: string | null;
  rules: SegmentRulesJson;
  created_at: string;
};

function mapSegment(row: SegmentRow): CommunicationSegment {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    rules: row.rules,
    createdAt: row.created_at,
  };
}

/** Segmentos activos (no archivados) de la iglesia, más recientes primero. */
export async function listCommunicationSegments(churchId: string): Promise<CommunicationSegment[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("communication_segments")
    .select("id, name, description, rules, created_at")
    .eq("church_id", churchId)
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  if (error) throw toDomainError(error, "No se pudieron cargar los segmentos.");
  return ((data ?? []) as SegmentRow[]).map(mapSegment);
}

export type CreateCommunicationSegmentInput = {
  name: string;
  description?: string;
  rules: SegmentRulesJson;
};

/**
 * Crea un segmento reutilizable. La comprobación de la capability
 * communications.manage_segments se hace en el Server Action que llama a
 * esta función, no aquí. Las reglas se validan también server-side por un
 * trigger (app.validate_segment_rules) — un rules inválido devuelve un
 * error de Postgres que toDomainError traduce.
 */
export async function createCommunicationSegment(
  churchId: string,
  input: CreateCommunicationSegmentInput,
): Promise<{ id: string }> {
  // Por RPC: la tabla tiene revocado el insert para authenticated, y la
  // función comprueba la capacidad y valida las reglas antes de escribir.
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("save_communication_segment", {
    p_church_id: churchId,
    p_input: {
      name: input.name,
      description: input.description ?? null,
      rules: input.rules,
    },
  });
  if (error) throw toDomainError(error, "No se pudo crear el segmento.");
  return { id: data as string };
}

/** Archiva un segmento (soft-delete vía archived_at). */
export async function archiveCommunicationSegment(churchId: string, segmentId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_communication_segment_archived", {
    p_segment_id: segmentId,
    p_archived: true,
  });
  if (error) throw toDomainError(error, "No se pudo archivar el segmento.");
}

// ---------------------------------------------------------------------------
// Previsualización de segmento (RPC preview_communication_segment)
// ---------------------------------------------------------------------------

export type SegmentPreview = {
  total: number;
  byChannel: Record<string, number>;
  excluded: { reason: string; count: number }[];
};

/**
 * Llama a la RPC preview_communication_segment. rules debe ser JSON ya
 * validado en el cliente por SegmentoRuleBuilder (nunca incluye el campo
 * reservado "group"); la RPC vuelve a validar server-side de todas formas.
 */
export async function previewCommunicationSegment(
  churchId: string,
  rules: SegmentRulesJson,
  channels: CommunicationChannel[],
): Promise<SegmentPreview> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("preview_communication_segment", {
    p_church_id: churchId,
    p_rules: rules,
    p_channels: channels,
  });
  if (error) throw toDomainError(error, "No se pudo previsualizar el segmento.");
  const result = (data ?? {}) as { total?: number; by_channel?: Record<string, number>; excluded?: { reason: string; count: number }[] };
  return {
    total: result.total ?? 0,
    byChannel: result.by_channel ?? {},
    excluded: result.excluded ?? [],
  };
}

// ---------------------------------------------------------------------------
// Detalle de una comunicación (wizard de creación y ficha [id])
// ---------------------------------------------------------------------------

export type CommunicationDetail = {
  id: string;
  churchId: string;
  title: string;
  purpose: CommunicationPurpose;
  status: CommunicationStatus;
  subject: string | null;
  bodyTemplate: string;
  channels: CommunicationChannel[];
  segmentId: string | null;
  segmentRulesSnapshot: SegmentRulesJson | null;
  scheduledAt: string | null;
  materializedAt: string | null;
  sentAt: string | null;
  /** Por qué no se pudieron calcular los destinatarios. Solo con estado failed_to_process. */
  processingError: string | null;
  createdByPersonId: string | null;
  createdAt: string;
};

type CommunicationDetailRow = {
  id: string;
  church_id: string;
  title: string;
  purpose: CommunicationPurpose;
  status: CommunicationStatus;
  subject: string | null;
  body_template: string;
  channels: CommunicationChannel[];
  segment_id: string | null;
  segment_rules_snapshot: SegmentRulesJson | null;
  scheduled_at: string | null;
  materialized_at: string | null;
  sent_at: string | null;
  processing_error: string | null;
  created_by_person_id: string | null;
  created_at: string;
};

function mapCommunicationDetail(row: CommunicationDetailRow): CommunicationDetail {
  return {
    id: row.id,
    churchId: row.church_id,
    title: row.title,
    purpose: row.purpose,
    status: row.status,
    subject: row.subject,
    bodyTemplate: row.body_template,
    channels: row.channels ?? [],
    segmentId: row.segment_id,
    segmentRulesSnapshot: row.segment_rules_snapshot,
    scheduledAt: row.scheduled_at,
    materializedAt: row.materialized_at,
    sentAt: row.sent_at,
    processingError: row.processing_error,
    createdByPersonId: row.created_by_person_id,
    createdAt: row.created_at,
  };
}

/** Ficha de detalle de una comunicación concreta. Null si no existe o RLS la oculta. */
export async function getCommunication(churchId: string, communicationId: string): Promise<CommunicationDetail | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("communications")
    .select(
      "id, church_id, title, purpose, status, subject, body_template, channels, segment_id, segment_rules_snapshot, scheduled_at, materialized_at, sent_at, processing_error, created_by_person_id, created_at",
    )
    .eq("church_id", churchId)
    .eq("id", communicationId)
    .maybeSingle();
  if (error) throw toDomainError(error, "No se pudo cargar la comunicación.");
  if (!data) return null;
  return mapCommunicationDetail(data as CommunicationDetailRow);
}

// ---------------------------------------------------------------------------
// Creación, materialización, envío, programación y cancelación (RPC)
// ---------------------------------------------------------------------------

export type CreateCommunicationInput = {
  title: string;
  purpose: CommunicationPurpose;
  subject?: string;
  bodyTemplate: string;
  channels: CommunicationChannel[];
  rules: SegmentRulesJson;
  templateId?: string;
  segmentId?: string;
  serviceAreaId?: string;
};

/** Crea una comunicación en borrador (app.create_communication). */
export async function createCommunication(churchId: string, input: CreateCommunicationInput): Promise<{ id: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_communication", {
    p_church_id: churchId,
    p_title: input.title,
    p_purpose: input.purpose,
    p_subject: input.subject ?? null,
    p_body_template: input.bodyTemplate,
    p_channels: input.channels,
    p_rules: input.rules,
    p_template_id: input.templateId ?? null,
    p_segment_id: input.segmentId ?? null,
    p_service_area_id: input.serviceAreaId ?? null,
  });
  if (error) throw toDomainError(error, "No se pudo crear la comunicación.");
  return { id: data as string };
}

/** Materializa los destinatarios de una comunicación (app.materialize_communication). */
export async function materializeCommunication(communicationId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("materialize_communication", { p_communication_id: communicationId });
  if (error) throw toDomainError(error, "No se pudo materializar la comunicación.");
}

/** Envía en lote los destinatarios ya materializados (app.send_communication). */
export async function sendCommunication(communicationId: string, batchLimit?: number): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("send_communication", {
    p_communication_id: communicationId,
    p_batch_limit: batchLimit ?? undefined,
  });
  if (error) throw toDomainError(error, "No se pudo enviar la comunicación.");
}

/** Programa una comunicación en borrador (app.schedule_communication, ver 20260928000100). */
export async function scheduleCommunication(communicationId: string, scheduledAt: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("schedule_communication", {
    p_communication_id: communicationId,
    p_scheduled_at: scheduledAt,
  });
  if (error) throw toDomainError(error, "No se pudo programar la comunicación.");
}

/** Cancela una comunicación en borrador o programada (app.cancel_communication, requiere communications.cancel). */
export async function cancelCommunication(communicationId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cancel_communication", { p_communication_id: communicationId });
  if (error) throw toDomainError(error, "No se pudo cancelar la comunicación.");
}

/**
 * Devuelve a borrador una comunicación que quedó en failed_to_process
 * (app.reset_failed_communication, requiere communications.schedule).
 *
 * El motivo del fallo está en `processingError`: casi siempre una regla de
 * segmentación que apunta a un campo que ya no existe. Volver a programarla sin
 * corregir la segmentación la devuelve al mismo estado.
 */
export async function resetFailedCommunication(communicationId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("reset_failed_communication", { p_communication_id: communicationId });
  if (error) throw toDomainError(error, "No se pudo devolver la comunicación a borrador.");
}

export type UpdateCommunicationInput = {
  title?: string;
  subject?: string;
  bodyTemplate?: string;
  purpose?: CommunicationPurpose;
  channels?: CommunicationChannel[];
};

/** Edita una comunicación en borrador (app.update_communication, requiere communications.update). */
export async function updateCommunication(communicationId: string, input: UpdateCommunicationInput): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_communication", {
    p_communication_id: communicationId,
    p_title: input.title ?? null,
    p_subject: input.subject ?? null,
    p_body_template: input.bodyTemplate ?? null,
    p_purpose: input.purpose ?? null,
    p_channels: input.channels ?? null,
  });
  if (error) throw toDomainError(error, "No se pudo actualizar la comunicación.");
}

// ---------------------------------------------------------------------------
// Preferencias por categoría opcional (communication_category_preferences)
// ---------------------------------------------------------------------------

export type CategoryPreference = { category: OptionalCommunicationPurpose; optedOut: boolean };

/** Preferencias de la persona autenticada para las categorías opcionales. */
export async function listMyCommunicationCategoryPreferences(churchId: string): Promise<CategoryPreference[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_my_communication_category_preferences", { p_church_id: churchId });
  if (error) throw toDomainError(error, "No se pudieron cargar tus preferencias de comunicación.");
  return ((data ?? []) as { category: OptionalCommunicationPurpose; opted_out: boolean }[]).map((row) => ({
    category: row.category,
    optedOut: row.opted_out,
  }));
}

/** Cambia la preferencia de la persona autenticada para una categoría opcional. */
export async function setCommunicationCategoryPreference(
  churchId: string,
  category: OptionalCommunicationPurpose,
  optedOut: boolean,
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_communication_category_preference", {
    p_church_id: churchId,
    p_category: category,
    p_opted_out: optedOut,
  });
  if (error) throw toDomainError(error, "No se pudo guardar tu preferencia.");
}

/**
 * Consume un token de baja (enlace público, sin sesión). Se usa desde una
 * página pública fuera de (app), con el cliente normal (anon): la RPC está
 * concedida a anon a propósito (app.unsubscribe_by_token).
 */
export async function unsubscribeByToken(token: string): Promise<{ category: CommunicationPurpose }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("unsubscribe_by_token", { p_token: token });
  if (error) throw toDomainError(error, "El enlace de baja no es válido o ya se usó.");
  const result = (data ?? {}) as { category?: CommunicationPurpose };
  return { category: result.category ?? "institutional" };
}

// ---------------------------------------------------------------------------
// Métricas de entrega (RPC app.communication_metrics, ver 20260928000100)
// ---------------------------------------------------------------------------

export type CommunicationMetrics = {
  total: number;
  byChannel: Record<string, Record<string, number>>;
};

/**
 * Métricas agregadas por canal y status de una comunicación ya
 * materializada/enviada. communication_recipients no tiene política de
 * SELECT directa para el cliente, así que esto pasa siempre por la RPC
 * app.communication_metrics (requiere communications.read_metrics).
 */
export async function getCommunicationMetrics(communicationId: string): Promise<CommunicationMetrics> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("communication_metrics", { p_communication_id: communicationId });
  if (error) throw toDomainError(error, "No se pudieron cargar las métricas de entrega.");
  const result = (data ?? {}) as { total?: number; by_channel?: Record<string, Record<string, number>> };
  return {
    total: result.total ?? 0,
    byChannel: result.by_channel ?? {},
  };
}

// ---------------------------------------------------------------------------
// Creador (join a people) para la ficha de detalle
// ---------------------------------------------------------------------------

export type PersonName = { firstName: string; lastName: string | null };

/** Nombre de una persona por id, para mostrar "Creado por" en la ficha. */
export async function getPersonName(personId: string): Promise<PersonName | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("people")
    .select("first_name, last_name")
    .eq("id", personId)
    .maybeSingle();
  if (error) throw toDomainError(error, "No se pudo cargar la persona.");
  if (!data) return null;
  return { firstName: data.first_name as string, lastName: (data.last_name as string | null) ?? null };
}
