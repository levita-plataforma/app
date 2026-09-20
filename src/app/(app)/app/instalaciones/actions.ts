"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { DomainError } from "@/server/errors/domain-error";
import {
  approveReservation,
  archiveResource,
  cancelMaintenance,
  cancelReservation,
  completeMaintenance,
  createReservation,
  rejectReservation,
  restoreResource,
  saveMaintenance,
  saveResource,
  type ResourceType,
} from "@/server/facilities/facilities-service";

export type AccionState = { error: string | null; ok: string | null };

const OK: AccionState = { error: null, ok: null };

const TIPOS: ResourceType[] = ["room", "equipment", "vehicle", "other"];

function texto(formData: FormData, clave: string): string {
  return String(formData.get(clave) ?? "").trim();
}

/**
 * Un `datetime-local` llega como "2026-10-04T10:00", sin zona. No se convierte
 * aquí: viaja tal cual y lo resuelve la base con la zona de la iglesia, igual
 * que hace create_activity desde la Fase 4. Convertirlo en JavaScript obliga a
 * jugar con el desfase del navegador, que es justo donde aparecen los errores
 * de una hora los fines de semana en que cambia la hora.
 */
function horaLocal(formData: FormData, clave: string): string | undefined {
  return texto(formData, clave) || undefined;
}

function fallo(err: unknown, porDefecto: string): AccionState {
  if (err instanceof DomainError) return { error: err.message, ok: null };
  return { error: porDefecto, ok: null };
}

export async function guardarRecursoAction(_prev: AccionState, formData: FormData): Promise<AccionState> {
  const tenant = await requireTenantContext();
  const nombre = texto(formData, "name");
  const tipo = texto(formData, "type") as ResourceType;

  if (!nombre) return { error: "El recurso necesita un nombre.", ok: null };
  if (!TIPOS.includes(tipo)) return { error: "Elige un tipo de recurso.", ok: null };

  const aforo = texto(formData, "capacity");

  try {
    await saveResource(tenant.churchId, {
      id: texto(formData, "id") || undefined,
      name: nombre,
      type: tipo,
      campusId: texto(formData, "campusId") || null,
      description: texto(formData, "description") || null,
      capacity: aforo ? Number(aforo) : null,
      locationDetails: texto(formData, "locationDetails") || null,
      reservable: formData.get("reservable") !== null,
      requiresApproval: formData.get("requiresApproval") !== null,
    });
  } catch (err) {
    return fallo(err, "No se pudo guardar el recurso.");
  }

  revalidatePath("/app/instalaciones");
  return { ...OK, ok: "Recurso guardado." };
}

export async function archivarRecursoAction(_prev: AccionState, formData: FormData): Promise<AccionState> {
  try {
    await archiveResource(texto(formData, "resourceId"));
  } catch (err) {
    // El error de reservas futuras es informativo y hay que enseñarlo tal cual:
    // dice cuántas hay y qué hacer antes de archivar.
    return fallo(err, "No se pudo archivar el recurso.");
  }
  revalidatePath("/app/instalaciones");
  return { ...OK, ok: "Recurso archivado." };
}

export async function restaurarRecursoAction(_prev: AccionState, formData: FormData): Promise<AccionState> {
  try {
    await restoreResource(texto(formData, "resourceId"));
  } catch (err) {
    return fallo(err, "No se pudo restaurar el recurso.");
  }
  revalidatePath("/app/instalaciones");
  return { ...OK, ok: "Recurso restaurado." };
}

export async function crearReservaAction(_prev: AccionState, formData: FormData): Promise<AccionState> {
  const tenant = await requireTenantContext();
  const recurso = texto(formData, "resourceId");
  const proposito = texto(formData, "purpose");
  const desde = horaLocal(formData, "startsAt");
  const hasta = horaLocal(formData, "endsAt");

  if (!recurso) return { error: "Elige un recurso.", ok: null };
  if (!proposito) return { error: "Di para qué es la reserva.", ok: null };
  if (!desde || !hasta) return { error: "Indica desde cuándo y hasta cuándo.", ok: null };

  try {
    await createReservation(tenant.churchId, {
      resourceId: recurso,
      localStart: desde,
      localEnd: hasta,
      purpose: proposito,
      notes: texto(formData, "notes") || null,
    });
  } catch (err) {
    // Si el recurso está ocupado, el mensaje de la base ya dice qué franja
    // choca y a qué hora. Se enseña ese, no uno genérico.
    return fallo(err, "No se pudo crear la reserva.");
  }

  revalidatePath("/app/instalaciones");
  return { ...OK, ok: "Reserva creada." };
}

export async function cancelarReservaAction(_prev: AccionState, formData: FormData): Promise<AccionState> {
  try {
    await cancelReservation(texto(formData, "reservationId"), texto(formData, "reason") || undefined);
  } catch (err) {
    return fallo(err, "No se pudo cancelar la reserva.");
  }
  revalidatePath("/app/instalaciones");
  return { ...OK, ok: "Reserva cancelada." };
}

export async function aprobarReservaAction(_prev: AccionState, formData: FormData): Promise<AccionState> {
  try {
    await approveReservation(texto(formData, "reservationId"));
  } catch (err) {
    return fallo(err, "No se pudo aprobar la reserva.");
  }
  revalidatePath("/app/instalaciones");
  return { ...OK, ok: "Reserva aprobada." };
}

export async function rechazarReservaAction(_prev: AccionState, formData: FormData): Promise<AccionState> {
  try {
    await rejectReservation(texto(formData, "reservationId"), texto(formData, "reason") || undefined);
  } catch (err) {
    return fallo(err, "No se pudo rechazar la reserva.");
  }
  revalidatePath("/app/instalaciones");
  return { ...OK, ok: "Reserva rechazada." };
}

export async function guardarMantenimientoAction(_prev: AccionState, formData: FormData): Promise<AccionState> {
  const tenant = await requireTenantContext();
  const recurso = texto(formData, "resourceId");
  const titulo = texto(formData, "title");
  const tipo = texto(formData, "type");
  const desde = horaLocal(formData, "startsAt");
  const hasta = horaLocal(formData, "endsAt");

  if (!recurso) return { error: "Elige un recurso.", ok: null };
  if (!titulo || !tipo) return { error: "El mantenimiento necesita título y tipo.", ok: null };
  if (!desde || !hasta) return { error: "Indica la ventana de la intervención.", ok: null };

  try {
    await saveMaintenance(tenant.churchId, {
      id: texto(formData, "id") || undefined,
      resourceId: recurso,
      type: tipo,
      title: titulo,
      description: texto(formData, "description") || null,
      blocksAvailability: formData.get("blocksAvailability") !== null,
      localStart: desde,
      localEnd: hasta,
    });
  } catch (err) {
    return fallo(err, "No se pudo guardar el mantenimiento.");
  }

  revalidatePath("/app/instalaciones");
  return { ...OK, ok: "Mantenimiento guardado." };
}

export async function cerrarMantenimientoAction(_prev: AccionState, formData: FormData): Promise<AccionState> {
  try {
    await completeMaintenance(texto(formData, "maintenanceId"), texto(formData, "resultNotes") || undefined);
  } catch (err) {
    return fallo(err, "No se pudo cerrar el mantenimiento.");
  }
  revalidatePath("/app/instalaciones");
  return { ...OK, ok: "Mantenimiento cerrado." };
}

export async function cancelarMantenimientoAction(_prev: AccionState, formData: FormData): Promise<AccionState> {
  try {
    await cancelMaintenance(texto(formData, "maintenanceId"), texto(formData, "reason") || undefined);
  } catch (err) {
    return fallo(err, "No se pudo cancelar el mantenimiento.");
  }
  revalidatePath("/app/instalaciones");
  return { ...OK, ok: "Mantenimiento cancelado." };
}
