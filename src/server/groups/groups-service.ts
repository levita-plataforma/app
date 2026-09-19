import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { DomainError } from "@/server/errors/domain-error";
import { callActivityRpc, one, toDomainError } from "@/server/activities/rpc";
import type {
  GroupJoinPolicy,
  GroupJoinRequestStatus,
  GroupLeaderRole,
  GroupStatus,
  GroupVisibility,
} from "@/lib/groups/constants";

/**
 * Grupos (Fase 7). Las lecturas van con el cliente del usuario y es RLS quien
 * decide qué filas se ven: el directorio interno muestra los grupos `listed`
 * de la iglesia, y los `private` solo a sus responsables y participantes
 * (decisión P-1). Las escrituras pasan siempre por RPC `security definer`,
 * que vuelven a comprobar capacidad, aforo y pertenencia, y auditan en la
 * misma transacción.
 *
 * Las reuniones y la asistencia viven en `group-meetings-service.ts` para que
 * este fichero no crezca sin medida.
 */

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type GroupTypeItem = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  sortOrder: number;
  archivedAt: string | null;
};

export type GroupListItem = {
  id: string;
  name: string;
  description: string | null;
  campusId: string | null;
  campusName: string | null;
  groupTypeId: string | null;
  groupTypeName: string | null;
  status: GroupStatus;
  visibility: GroupVisibility;
  joinPolicy: GroupJoinPolicy;
  capacity: number | null;
  ageSegment: string | null;
  meetingScheduleText: string | null;
  archivedAt: string | null;
  /** Participantes activos. Los responsables no ocupan plaza (decisión P-2). */
  memberCount: number;
  leaderCount: number;
};

export type GroupListFilters = {
  status?: GroupStatus;
  visibility?: GroupVisibility;
  joinPolicy?: GroupJoinPolicy;
  campusId?: string;
  groupTypeId?: string;
  search?: string;
  /** Solo grupos sin responsable vigente (el aviso de la decisión P-2). */
  withoutLeader?: boolean;
  includeArchived?: boolean;
  page?: number;
  pageSize?: number;
};

export type GroupDetail = {
  id: string;
  churchId: string;
  name: string;
  description: string | null;
  campusId: string | null;
  campusName: string | null;
  groupTypeId: string | null;
  groupTypeName: string | null;
  status: GroupStatus;
  visibility: GroupVisibility;
  joinPolicy: GroupJoinPolicy;
  capacity: number | null;
  ageSegment: string | null;
  meetingLocationText: string | null;
  meetingScheduleText: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Una línea de la lista del grupo. `email` y `phone` llegan nulos cuando no se
 * pueden mostrar y `contactVisible` lo dice (decisión P-5): el nombre va
 * siempre, el contacto solo si la persona lo permite o quien mira tiene
 * permiso expreso.
 */
export type GroupRosterEntry = {
  personId: string;
  displayName: string;
  role: string;
  status: string;
  joinedAt: string | null;
  email: string | null;
  phone: string | null;
  contactVisible: boolean;
};

export type GroupJoinRequestItem = {
  id: string;
  groupId: string;
  groupName: string;
  personId: string;
  personName: string;
  status: GroupJoinRequestStatus;
  message: string | null;
  decisionNote: string | null;
  createdAt: string;
  decidedAt: string | null;
};

export type GroupMetrics = {
  activeGroups: number;
  groupsWithoutLeader: number;
  activeMembers: number;
  pendingRequests: number;
  groupsAtCapacity: number;
};

export type GroupInput = {
  name: string;
  description?: string | null;
  campusId?: string | null;
  groupTypeId?: string | null;
  visibility?: GroupVisibility;
  status?: GroupStatus;
  joinPolicy?: GroupJoinPolicy;
  capacity?: number | null;
  ageSegment?: string | null;
  meetingLocationText?: string | null;
  meetingScheduleText?: string | null;
};

const DEFAULT_PAGE_SIZE = 25;

function normalizePageSize(pageSize?: number): number {
  return [25, 50, 100].includes(pageSize ?? DEFAULT_PAGE_SIZE) ? (pageSize ?? DEFAULT_PAGE_SIZE) : DEFAULT_PAGE_SIZE;
}

// ---------------------------------------------------------------------------
// Tipos de grupo (catálogo por iglesia)
// ---------------------------------------------------------------------------

export async function listGroupTypes(churchId: string, includeArchived = false): Promise<GroupTypeItem[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("group_types")
    .select("id, key, name, description, sort_order, archived_at")
    .eq("church_id", churchId);

  if (!includeArchived) query = query.is("archived_at", null);

  const { data, error } = await query.order("sort_order").order("name");
  if (error) throw toDomainError(error, "No se pudieron cargar los tipos de grupo.");

  return (data ?? []).map((row) => ({
    id: row.id as string,
    key: row.key as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    sortOrder: (row.sort_order as number) ?? 0,
    archivedAt: (row.archived_at as string | null) ?? null,
  }));
}

export async function saveGroupType(
  churchId: string,
  input: { id?: string; key?: string; name: string; description?: string | null; sortOrder?: number },
): Promise<{ groupTypeId: string }> {
  const name = input.name.trim();
  if (!name) throw new DomainError("VALIDATION_ERROR", "El nombre del tipo de grupo es obligatorio.");
  if (!input.id && !input.key?.trim()) {
    throw new DomainError("VALIDATION_ERROR", "La clave del tipo de grupo es obligatoria.");
  }

  const groupTypeId = await callActivityRpc<string>(
    "save_group_type",
    {
      p_church_id: churchId,
      p_input: {
        id: input.id ?? null,
        key: input.key?.trim() ?? null,
        name,
        description: input.description?.trim() || null,
        sort_order: input.sortOrder ?? 0,
      },
    },
    "No se pudo guardar el tipo de grupo.",
  );

  return { groupTypeId };
}

export async function setGroupTypeArchived(groupTypeId: string, archived: boolean): Promise<void> {
  await callActivityRpc<null>(
    "set_group_type_archived",
    { p_group_type_id: groupTypeId, p_archived: archived },
    archived ? "No se pudo archivar el tipo de grupo." : "No se pudo restaurar el tipo de grupo.",
  );
}

// ---------------------------------------------------------------------------
// Listado de grupos
// ---------------------------------------------------------------------------

type GroupRow = {
  id: string;
  name: string;
  description: string | null;
  campus_id: string | null;
  group_type_id: string | null;
  status: string;
  visibility: string;
  join_policy: string;
  capacity: number | null;
  age_segment: string | null;
  meeting_location_text: string | null;
  meeting_schedule_text: string | null;
  archived_at: string | null;
  campuses: { name: string } | { name: string }[] | null;
  group_types: { name: string } | { name: string }[] | null;
};

const GROUP_COLUMNS =
  "id, name, description, campus_id, group_type_id, status, visibility, join_policy, capacity, age_segment, meeting_location_text, meeting_schedule_text, archived_at, campuses(name), group_types(name)";

export async function listGroups(
  churchId: string,
  filters: GroupListFilters = {},
): Promise<{ items: GroupListItem[]; total: number; page: number; pageSize: number }> {
  const supabase = await createSupabaseServerClient();
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = normalizePageSize(filters.pageSize);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase.from("groups").select(GROUP_COLUMNS, { count: "exact" }).eq("church_id", churchId);

  if (!filters.includeArchived) query = query.is("archived_at", null);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.visibility) query = query.eq("visibility", filters.visibility);
  if (filters.joinPolicy) query = query.eq("join_policy", filters.joinPolicy);
  if (filters.campusId) query = query.eq("campus_id", filters.campusId);
  if (filters.groupTypeId) query = query.eq("group_type_id", filters.groupTypeId);
  if (filters.search?.trim()) query = query.ilike("name", `%${filters.search.trim()}%`);

  const { data, count, error } = await query.order("name").range(from, to);
  if (error) throw toDomainError(error, "No se pudieron cargar los grupos.");

  const rows = (data ?? []) as unknown as GroupRow[];
  const counts = await loadGroupCounts(churchId, rows.map((r) => r.id));

  let items: GroupListItem[] = rows.map((row) => {
    const campus = one(row.campuses);
    const groupType = one(row.group_types);
    const tally = counts.get(row.id) ?? { members: 0, leaders: 0 };
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      campusId: row.campus_id,
      campusName: campus?.name ?? null,
      groupTypeId: row.group_type_id,
      groupTypeName: groupType?.name ?? null,
      status: row.status as GroupStatus,
      visibility: row.visibility as GroupVisibility,
      joinPolicy: row.join_policy as GroupJoinPolicy,
      capacity: row.capacity,
      ageSegment: row.age_segment,
      meetingScheduleText: row.meeting_schedule_text,
      archivedAt: row.archived_at,
      memberCount: tally.members,
      leaderCount: tally.leaders,
    };
  });

  // «Sin responsable» depende del recuento real de responsables vigentes, no
  // de una columna: se filtra en aplicación tras contarlos. Quien no puede ver
  // la lista de un grupo tampoco ve sus recuentos, y ese grupo no aparece aquí
  // marcado como sin responsable por error: aparece con 0 y sin filtro no
  // cambia nada.
  if (filters.withoutLeader) items = items.filter((item) => item.leaderCount === 0);

  return { items, total: count ?? items.length, page, pageSize };
}

/**
 * Cuenta participantes activos y responsables vigentes por grupo. Se agrupa en
 * aplicación (PostgREST no expone group by), asumible al volumen de una página
 * (25-100 grupos). RLS ya limita estas dos tablas a quien puede ver la lista
 * del grupo, así que un recuento de cero también puede significar «no lo
 * puedes ver», nunca una fuga.
 */
async function loadGroupCounts(
  churchId: string,
  groupIds: string[],
): Promise<Map<string, { members: number; leaders: number }>> {
  const result = new Map<string, { members: number; leaders: number }>();
  if (groupIds.length === 0) return result;

  const supabase = await createSupabaseServerClient();
  const [membersRes, leadersRes] = await Promise.all([
    supabase
      .from("group_members")
      .select("group_id")
      .eq("church_id", churchId)
      .in("group_id", groupIds)
      .eq("status", "active"),
    supabase
      .from("group_leaders")
      .select("group_id")
      .eq("church_id", churchId)
      .in("group_id", groupIds)
      .is("ends_at", null),
  ]);

  for (const row of membersRes.data ?? []) {
    const entry = result.get(row.group_id as string) ?? { members: 0, leaders: 0 };
    entry.members += 1;
    result.set(row.group_id as string, entry);
  }
  for (const row of leadersRes.data ?? []) {
    const entry = result.get(row.group_id as string) ?? { members: 0, leaders: 0 };
    entry.leaders += 1;
    result.set(row.group_id as string, entry);
  }
  return result;
}

export async function getGroup(churchId: string, groupId: string): Promise<GroupDetail | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("groups")
    .select(`${GROUP_COLUMNS}, church_id, created_at, updated_at`)
    .eq("church_id", churchId)
    .eq("id", groupId)
    .maybeSingle();

  if (error) throw toDomainError(error, "No se pudo cargar el grupo.");
  if (!data) return null;

  const row = data as unknown as GroupRow & { church_id: string; created_at: string; updated_at: string };
  const campus = one(row.campuses);
  const groupType = one(row.group_types);

  return {
    id: row.id,
    churchId: row.church_id,
    name: row.name,
    description: row.description,
    campusId: row.campus_id,
    campusName: campus?.name ?? null,
    groupTypeId: row.group_type_id,
    groupTypeName: groupType?.name ?? null,
    status: row.status as GroupStatus,
    visibility: row.visibility as GroupVisibility,
    joinPolicy: row.join_policy as GroupJoinPolicy,
    capacity: row.capacity,
    ageSegment: row.age_segment,
    meetingLocationText: row.meeting_location_text,
    meetingScheduleText: row.meeting_schedule_text,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Alta y edición
// ---------------------------------------------------------------------------

function toGroupPayload(input: GroupInput): Record<string, unknown> {
  const payload: Record<string, unknown> = { name: input.name.trim() };
  if (input.description !== undefined) payload.description = input.description?.trim() || null;
  if (input.campusId !== undefined) payload.campus_id = input.campusId || null;
  if (input.groupTypeId !== undefined) payload.group_type_id = input.groupTypeId || null;
  if (input.visibility !== undefined) payload.visibility = input.visibility;
  if (input.status !== undefined) payload.status = input.status;
  if (input.joinPolicy !== undefined) payload.join_policy = input.joinPolicy;
  if (input.capacity !== undefined) payload.capacity = input.capacity;
  if (input.ageSegment !== undefined) payload.age_segment = input.ageSegment?.trim() || null;
  if (input.meetingLocationText !== undefined) {
    payload.meeting_location_text = input.meetingLocationText?.trim() || null;
  }
  if (input.meetingScheduleText !== undefined) {
    payload.meeting_schedule_text = input.meetingScheduleText?.trim() || null;
  }
  return payload;
}

function validateCapacity(capacity: number | null | undefined): void {
  if (capacity === null || capacity === undefined) return;
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new DomainError("VALIDATION_ERROR", "El aforo debe ser un número entero mayor que cero.");
  }
}

export async function createGroup(churchId: string, input: GroupInput): Promise<{ groupId: string }> {
  if (!input.name.trim()) throw new DomainError("VALIDATION_ERROR", "El nombre del grupo es obligatorio.");
  validateCapacity(input.capacity);

  const groupId = await callActivityRpc<string>(
    "create_group",
    { p_church_id: churchId, p_input: toGroupPayload(input) },
    "No se pudo crear el grupo.",
  );

  return { groupId };
}

export async function updateGroup(groupId: string, input: GroupInput): Promise<void> {
  if (!input.name.trim()) throw new DomainError("VALIDATION_ERROR", "El nombre del grupo es obligatorio.");
  validateCapacity(input.capacity);

  await callActivityRpc<null>(
    "update_group",
    { p_group_id: groupId, p_input: toGroupPayload(input) },
    "No se pudo guardar el grupo.",
  );
}

export async function setGroupStatus(groupId: string, status: GroupStatus): Promise<void> {
  await callActivityRpc<null>(
    "set_group_status",
    { p_group_id: groupId, p_status: status },
    "No se pudo cambiar el estado del grupo.",
  );
}

export async function setGroupArchived(groupId: string, archived: boolean): Promise<void> {
  await callActivityRpc<null>(
    "set_group_archived",
    { p_group_id: groupId, p_archived: archived },
    archived ? "No se pudo archivar el grupo." : "No se pudo restaurar el grupo.",
  );
}

// ---------------------------------------------------------------------------
// Responsables y participantes
// ---------------------------------------------------------------------------

export async function addGroupLeader(
  groupId: string,
  personId: string,
  role: GroupLeaderRole = "leader",
): Promise<{ leaderId: string }> {
  const leaderId = await callActivityRpc<string>(
    "add_group_leader",
    { p_group_id: groupId, p_person_id: personId, p_role: role },
    "No se pudo asignar el responsable.",
  );
  return { leaderId };
}

export async function endGroupLeadership(groupId: string, personId: string): Promise<void> {
  await callActivityRpc<null>(
    "end_group_leadership",
    { p_group_id: groupId, p_person_id: personId },
    "No se pudo retirar al responsable.",
  );
}

export async function addGroupMember(
  groupId: string,
  personId: string,
  notes?: string | null,
): Promise<{ memberId: string }> {
  const memberId = await callActivityRpc<string>(
    "add_group_member",
    { p_group_id: groupId, p_person_id: personId, p_input: { notes: notes?.trim() || null } },
    "No se pudo añadir a la persona al grupo.",
  );
  return { memberId };
}

export async function removeGroupMember(groupId: string, personId: string, reason?: string | null): Promise<void> {
  await callActivityRpc<null>(
    "remove_group_member",
    { p_group_id: groupId, p_person_id: personId, p_input: { reason: reason?.trim() || null } },
    "No se pudo dar de baja a la persona.",
  );
}

/** Lista del grupo con la regla de contacto de la decisión P-5 ya aplicada. */
export async function getGroupRoster(groupId: string): Promise<GroupRosterEntry[]> {
  const rows = await callActivityRpc<
    {
      person_id: string;
      display_name: string | null;
      role: string;
      status: string;
      joined_at: string | null;
      email: string | null;
      phone: string | null;
      contact_visible: boolean;
    }[]
  >("group_roster", { p_group_id: groupId }, "No se pudo cargar la lista del grupo.");

  return (rows ?? []).map((row) => ({
    personId: row.person_id,
    displayName: row.display_name ?? "Sin nombre",
    role: row.role,
    status: row.status,
    joinedAt: row.joined_at,
    email: row.email,
    phone: row.phone,
    contactVisible: row.contact_visible,
  }));
}

// ---------------------------------------------------------------------------
// Solicitudes de ingreso
// ---------------------------------------------------------------------------

type JoinRequestRow = {
  id: string;
  group_id: string;
  person_id: string;
  status: string;
  message: string | null;
  decision_note: string | null;
  created_at: string;
  decided_at: string | null;
  groups: { name: string } | { name: string }[] | null;
  people: { first_name: string; last_name: string | null; preferred_name: string | null } |
    { first_name: string; last_name: string | null; preferred_name: string | null }[] | null;
};

function personLabel(person: { first_name: string; last_name: string | null; preferred_name: string | null } | null) {
  if (!person) return "Una persona";
  return [person.preferred_name || person.first_name, person.last_name].filter(Boolean).join(" ").trim();
}

export async function listGroupJoinRequests(
  churchId: string,
  options: { groupId?: string; status?: GroupJoinRequestStatus; limit?: number } = {},
): Promise<GroupJoinRequestItem[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("group_join_requests")
    .select(
      "id, group_id, person_id, status, message, decision_note, created_at, decided_at, groups(name), people(first_name, last_name, preferred_name)",
    )
    .eq("church_id", churchId);

  if (options.groupId) query = query.eq("group_id", options.groupId);
  if (options.status) query = query.eq("status", options.status);

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(options.limit ?? 100, 1), 200));

  if (error) throw toDomainError(error, "No se pudieron cargar las solicitudes.");

  return ((data ?? []) as unknown as JoinRequestRow[]).map((row) => ({
    id: row.id,
    groupId: row.group_id,
    groupName: one(row.groups)?.name ?? "Un grupo",
    personId: row.person_id,
    personName: personLabel(one(row.people)),
    status: row.status as GroupJoinRequestStatus,
    message: row.message,
    decisionNote: row.decision_note,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
  }));
}

export async function requestGroupJoin(groupId: string, message?: string | null): Promise<{ requestId: string }> {
  const requestId = await callActivityRpc<string>(
    "request_group_join",
    { p_group_id: groupId, p_message: message?.trim() || null },
    "No se pudo enviar la solicitud.",
  );
  return { requestId };
}

export async function resolveGroupJoinRequest(
  requestId: string,
  accept: boolean,
  note?: string | null,
): Promise<void> {
  await callActivityRpc<null>(
    "resolve_group_join_request",
    { p_request_id: requestId, p_accept: accept, p_note: note?.trim() || null },
    "No se pudo resolver la solicitud.",
  );
}

export async function cancelGroupJoinRequest(requestId: string): Promise<void> {
  await callActivityRpc<null>(
    "cancel_group_join_request",
    { p_request_id: requestId },
    "No se pudo retirar la solicitud.",
  );
}

// ---------------------------------------------------------------------------
// Métricas y comunicación interna
// ---------------------------------------------------------------------------

export async function getGroupMetrics(churchId: string): Promise<GroupMetrics> {
  const data = await callActivityRpc<Record<string, number> | null>(
    "group_metrics",
    { p_church_id: churchId },
    "No se pudieron cargar las métricas de grupos.",
  );

  return {
    activeGroups: Number(data?.active_groups ?? 0),
    groupsWithoutLeader: Number(data?.groups_without_leader ?? 0),
    activeMembers: Number(data?.active_members ?? 0),
    pendingRequests: Number(data?.pending_requests ?? 0),
    groupsAtCapacity: Number(data?.groups_at_capacity ?? 0),
  };
}

/**
 * Grupos de los que la persona autenticada participa o es responsable. Sirve
 * para que quien no administra vea «mis grupos» sin recorrer el directorio.
 */
export async function listMyGroupIds(churchId: string, personId: string): Promise<Set<string>> {
  const supabase = await createSupabaseServerClient();
  const [membersRes, leadersRes] = await Promise.all([
    supabase
      .from("group_members")
      .select("group_id")
      .eq("church_id", churchId)
      .eq("person_id", personId)
      .eq("status", "active"),
    supabase
      .from("group_leaders")
      .select("group_id")
      .eq("church_id", churchId)
      .eq("person_id", personId)
      .is("ends_at", null),
  ]);

  const ids = new Set<string>();
  for (const row of membersRes.data ?? []) ids.add(row.group_id as string);
  for (const row of leadersRes.data ?? []) ids.add(row.group_id as string);
  return ids;
}
