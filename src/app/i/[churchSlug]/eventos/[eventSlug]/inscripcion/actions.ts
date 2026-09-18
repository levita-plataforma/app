"use server";

import { redirect } from "next/navigation";
import {
  registerForEvent,
  type RegisterForEventAttendee,
  type RegisterForEventConsent,
} from "@/server/events/public-events-service";
import { DomainError } from "@/server/errors/domain-error";

export type InscripcionState = { error: string | null };

/**
 * Server Action de inscripción pública (sin sesión). Ver §37 del encargo:
 * el honeypot y el idempotencyKey vienen del formulario cliente. Si el
 * honeypot detecta un bot, el servicio devuelve un "éxito" con campos
 * vacíos (registrationCode/cancelToken "") en vez de lanzar error — aquí se
 * respeta ese contrato redirigiendo igualmente a la confirmación genérica
 * (comportamiento indistinguible de un envío real para quien mira la
 * pantalla), sin intentar tratar el código vacío como válido.
 */
export async function inscribirseAction(
  churchSlug: string,
  eventSlug: string,
  eventId: string,
  registrationType: "individual" | "household" | "group",
  _prevState: InscripcionState,
  formData: FormData,
): Promise<InscripcionState> {
  const primaryName = String(formData.get("primaryName") ?? "").trim();
  const primaryEmail = String(formData.get("primaryEmail") ?? "").trim();
  const primaryPhone = String(formData.get("primaryPhone") ?? "").trim();
  const honeypot = String(formData.get("website") ?? "");
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "") || undefined;

  const attendeeNames = formData.getAll("attendeeName").map((v) => String(v).trim());
  const attendeeTypes = formData.getAll("attendeeType").map((v) => String(v));
  const attendees: RegisterForEventAttendee[] = attendeeNames
    .map((fullName, index) => ({
      fullName,
      attendeeType: (attendeeTypes[index] === "minor" ? "minor" : "adult") as "adult" | "minor",
    }))
    .filter((a) => a.fullName !== "");

  const consentKeys = formData.getAll("consentKey").map((v) => String(v));
  const consents: RegisterForEventConsent[] = consentKeys.map((consentKey) => ({
    consentKey,
    given: formData.get(`consent__${consentKey}`) === "on",
  }));

  const answerFieldKeys = formData.getAll("answerFieldKey").map((v) => String(v));
  const answers = answerFieldKeys.map((fieldKey) => ({
    fieldKey,
    value: formData.get(`answer__${fieldKey}`),
  }));

  if (!primaryName) {
    return { error: "Introduce tu nombre." };
  }
  if (!primaryEmail) {
    return { error: "Introduce tu correo." };
  }

  let redirectTo: string | null = null;

  try {
    const result = await registerForEvent({
      eventId,
      registrationType,
      primaryName,
      primaryEmail,
      primaryPhone: primaryPhone || undefined,
      attendees: attendees.length > 0 ? attendees : undefined,
      answers: answers.length > 0 ? answers : undefined,
      consents: consents.length > 0 ? consents : undefined,
      idempotencyKey,
      honeypot: honeypot || undefined,
    });

    const params = new URLSearchParams();
    if (result.registrationCode) params.set("code", result.registrationCode);
    if (result.cancelToken) params.set("token", result.cancelToken);
    params.set("status", result.status);

    redirectTo = `/i/${churchSlug}/eventos/${eventSlug}/confirmacion?${params.toString()}`;
  } catch (err) {
    if (err instanceof DomainError) {
      return { error: err.message };
    }
    return { error: "No se pudo completar la inscripción. Inténtalo de nuevo." };
  }

  redirect(redirectTo);
}
