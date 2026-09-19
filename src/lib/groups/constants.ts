/**
 * Catálogo central de Grupos (Fase 7): estados, visibilidad, política de
 * ingreso, papeles y asistencia. Único lugar con las etiquetas y los valores
 * de los enums del módulo: no repetir strings sueltos en la interfaz.
 *
 * Seguro para cliente (sin `server-only`). Los valores reflejan los enums de
 * 20260926000100_grupos_esquema.sql; la etiqueta afecta a la presentación,
 * nunca a la seguridad, que la decide RLS.
 */

import type { ChipTone } from "@/lib/activities/constants";

export const GROUP_STATUSES = ["active", "paused", "closed"] as const;
export type GroupStatus = (typeof GROUP_STATUSES)[number];

export const GROUP_VISIBILITIES = ["listed", "private"] as const;
export type GroupVisibility = (typeof GROUP_VISIBILITIES)[number];

export const GROUP_JOIN_POLICIES = ["open_request", "invite_only"] as const;
export type GroupJoinPolicy = (typeof GROUP_JOIN_POLICIES)[number];

export const GROUP_LEADER_ROLES = ["leader", "coleader"] as const;
export type GroupLeaderRole = (typeof GROUP_LEADER_ROLES)[number];

export const GROUP_MEMBER_STATUSES = ["active", "left", "removed"] as const;
export type GroupMemberStatus = (typeof GROUP_MEMBER_STATUSES)[number];

export const GROUP_JOIN_REQUEST_STATUSES = ["pending", "accepted", "rejected", "cancelled"] as const;
export type GroupJoinRequestStatus = (typeof GROUP_JOIN_REQUEST_STATUSES)[number];

export const GROUP_ATTENDANCE_STATUSES = ["present", "absent", "excused"] as const;
export type GroupAttendanceStatus = (typeof GROUP_ATTENDANCE_STATUSES)[number];

export const GROUP_STATUS_INFO: Record<GroupStatus, { label: string; tone: ChipTone; description: string }> = {
  active: { label: "Activo", tone: "success", description: "Se reúne con normalidad y admite participantes." },
  paused: { label: "En pausa", tone: "warning", description: "Sigue existiendo pero no se reúne ahora mismo." },
  closed: { label: "Cerrado", tone: "muted", description: "Ya no se reúne; su historial se conserva." },
};

export const GROUP_VISIBILITY_INFO: Record<GroupVisibility, { label: string; description: string }> = {
  listed: {
    label: "En el directorio",
    description: "Cualquier persona de la iglesia con sesión iniciada lo ve en el listado de grupos.",
  },
  private: {
    label: "Privado",
    description: "Solo lo ven sus responsables, sus participantes y quien administra los grupos.",
  },
};

export const GROUP_JOIN_POLICY_INFO: Record<GroupJoinPolicy, { label: string; description: string }> = {
  open_request: { label: "Admite solicitudes", description: "Se puede pedir plaza y el responsable resuelve." },
  invite_only: { label: "Solo por invitación", description: "Las altas las hace el responsable del grupo." },
};

export const GROUP_LEADER_ROLE_LABELS: Record<GroupLeaderRole, string> = {
  leader: "Responsable",
  coleader: "Corresponsable",
};

export const GROUP_MEMBER_STATUS_LABELS: Record<GroupMemberStatus, string> = {
  active: "Participa",
  left: "Se dio de baja",
  removed: "Dado de baja",
};

export const GROUP_JOIN_REQUEST_STATUS_INFO: Record<GroupJoinRequestStatus, { label: string; tone: ChipTone }> = {
  pending: { label: "Pendiente", tone: "warning" },
  accepted: { label: "Aceptada", tone: "success" },
  rejected: { label: "Rechazada", tone: "danger" },
  cancelled: { label: "Retirada", tone: "muted" },
};

export const GROUP_ATTENDANCE_STATUS_INFO: Record<GroupAttendanceStatus, { label: string; tone: ChipTone }> = {
  present: { label: "Asistió", tone: "success" },
  absent: { label: "No asistió", tone: "danger" },
  excused: { label: "Justificada", tone: "muted" },
};

/** Papel de cada línea de la lista devuelta por `group_roster`. */
export const GROUP_ROSTER_ROLE_LABELS: Record<string, string> = {
  leader: "Responsable",
  member: "Participante",
};

export function isGroupStatus(value: string): value is GroupStatus {
  return (GROUP_STATUSES as readonly string[]).includes(value);
}

export function isGroupVisibility(value: string): value is GroupVisibility {
  return (GROUP_VISIBILITIES as readonly string[]).includes(value);
}

export function isGroupJoinPolicy(value: string): value is GroupJoinPolicy {
  return (GROUP_JOIN_POLICIES as readonly string[]).includes(value);
}

export function isGroupLeaderRole(value: string): value is GroupLeaderRole {
  return (GROUP_LEADER_ROLES as readonly string[]).includes(value);
}

export function isGroupAttendanceStatus(value: string): value is GroupAttendanceStatus {
  return (GROUP_ATTENDANCE_STATUSES as readonly string[]).includes(value);
}
