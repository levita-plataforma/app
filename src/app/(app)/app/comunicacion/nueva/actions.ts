"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { requireCapability } from "@/server/tenant/authorize";
import { DomainError } from "@/server/errors/domain-error";
import {
  createCommunication,
  materializeCommunication,
  sendCommunication,
  scheduleCommunication,
  previewCommunicationSegment,
  type CommunicationChannel,
  type CommunicationPurpose,
  type SegmentPreview,
  type SegmentRulesJson,
} from "@/server/communications/communications-service";

export type NuevaComunicacionState = { error: string | null };

const initialState: NuevaComunicacionState = { error: null };
export { initialState as nuevaComunicacionInitialState };

export type PreviewState = { error: string | null; preview: SegmentPreview | null };

/** Preview en vivo de destinatarios, reutilizado por el wizard (mismo contrato que el de segmentos/actions.ts). */
export async function previsualizarDestinatariosAction(
  churchId: string,
  rules: SegmentRulesJson,
  channels: CommunicationChannel[],
): Promise<PreviewState> {
  const tenant = await requireTenantContext(churchId);
  try {
    await requireCapability(tenant.churchId, "communications.read");
    const preview = await previewCommunicationSegment(tenant.churchId, rules, channels);
    return { error: null, preview };
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message, preview: null };
    throw err;
  }
}

function parseRules(formData: FormData): SegmentRulesJson | null {
  const raw = String(formData.get("rules") ?? "");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.all)) return null;
    return parsed as SegmentRulesJson;
  } catch {
    return null;
  }
}

function parseChannels(formData: FormData): CommunicationChannel[] {
  const raw = String(formData.get("channels") ?? "");
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((c): c is CommunicationChannel => c === "inapp" || c === "email" || c === "push");
  } catch {
    return [];
  }
}

/**
 * Crea la comunicación y, en el mismo flujo, la materializa y envía
 * (create_communication -> materialize_communication -> send_communication).
 * Redirige a la ficha de detalle al terminar, tanto si el envío completó
 * como si quedó parcial/fallido: el detalle es donde se ve el resultado.
 */
export async function crearYEnviarAction(
  _prevState: NuevaComunicacionState,
  formData: FormData,
): Promise<NuevaComunicacionState> {
  const tenant = await requireTenantContext();

  const title = String(formData.get("title") ?? "").trim();
  const purpose = String(formData.get("purpose") ?? "institutional") as CommunicationPurpose;
  const subject = String(formData.get("subject") ?? "").trim();
  const bodyTemplate = String(formData.get("bodyTemplate") ?? "").trim();
  const templateId = String(formData.get("templateId") ?? "").trim();
  const segmentId = String(formData.get("segmentId") ?? "").trim();
  const rules = parseRules(formData);
  const channels = parseChannels(formData);

  if (!title) return { error: "El título es obligatorio." };
  if (!bodyTemplate) return { error: "El cuerpo del mensaje es obligatorio." };
  if (!rules || rules.all.length === 0) return { error: "Define al menos una condición de audiencia." };
  if (channels.length === 0) return { error: "Selecciona al menos un canal disponible." };

  let communicationId: string;
  try {
    await requireCapability(tenant.churchId, "communications.create");
    const created = await createCommunication(tenant.churchId, {
      title,
      purpose,
      subject: subject || undefined,
      bodyTemplate,
      channels,
      rules,
      templateId: templateId || undefined,
      segmentId: segmentId || undefined,
    });
    communicationId = created.id;

    await requireCapability(tenant.churchId, "communications.send");
    await materializeCommunication(communicationId);
    await sendCommunication(communicationId);
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }

  revalidatePath("/app/comunicacion");
  redirect(`/app/comunicacion/${communicationId}`);
}

/**
 * Crea la comunicación en borrador y la programa (create_communication ->
 * schedule_communication). No materializa ni envía nada todavía: eso lo hace
 * el cron cuando llega scheduled_at (app.due_scheduled_communications).
 */
export async function crearYProgramarAction(
  _prevState: NuevaComunicacionState,
  formData: FormData,
): Promise<NuevaComunicacionState> {
  const tenant = await requireTenantContext();

  const title = String(formData.get("title") ?? "").trim();
  const purpose = String(formData.get("purpose") ?? "institutional") as CommunicationPurpose;
  const subject = String(formData.get("subject") ?? "").trim();
  const bodyTemplate = String(formData.get("bodyTemplate") ?? "").trim();
  const templateId = String(formData.get("templateId") ?? "").trim();
  const segmentId = String(formData.get("segmentId") ?? "").trim();
  const rules = parseRules(formData);
  const channels = parseChannels(formData);
  const scheduledAtLocal = String(formData.get("scheduledAt") ?? "").trim();

  if (!title) return { error: "El título es obligatorio." };
  if (!bodyTemplate) return { error: "El cuerpo del mensaje es obligatorio." };
  if (!rules || rules.all.length === 0) return { error: "Define al menos una condición de audiencia." };
  if (channels.length === 0) return { error: "Selecciona al menos un canal disponible." };
  if (!scheduledAtLocal) return { error: "Indica fecha y hora de envío." };

  const scheduledAtIso = new Date(scheduledAtLocal).toISOString();
  if (new Date(scheduledAtIso).getTime() <= Date.now()) {
    return { error: "La fecha de programación debe ser futura." };
  }

  let communicationId: string;
  try {
    await requireCapability(tenant.churchId, "communications.create");
    const created = await createCommunication(tenant.churchId, {
      title,
      purpose,
      subject: subject || undefined,
      bodyTemplate,
      channels,
      rules,
      templateId: templateId || undefined,
      segmentId: segmentId || undefined,
    });
    communicationId = created.id;

    await requireCapability(tenant.churchId, "communications.schedule");
    await scheduleCommunication(communicationId, scheduledAtIso);
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }

  revalidatePath("/app/comunicacion");
  redirect(`/app/comunicacion/${communicationId}`);
}
