-- Fase 7 · RPC de Grupos.
-- Ver docs/CONTRATO-FASE-7.md §6.
--
-- Toda escritura del módulo pasa por aquí: las tablas tienen revocado
-- insert/update/delete para anon y authenticated. Cada función app.* es
-- security definer y comprueba, en este orden: pertenencia al tenant, módulo
-- activo, capacidad efectiva sobre el grupo y regla de negocio. El envoltorio
-- public.* es security invoker y solo delega.
--
-- Las reuniones se construyen sobre activities reutilizando las piezas de la
-- Fase 4 (app.resolve_activity_timezone, app.resolve_activity_schedule,
-- app.insert_activity_row, app.create_activity_series_row,
-- app.expand_activity_series). NO se llama a app.create_activity porque esa
-- exige la capacidad activity.create, que un responsable de grupo no tiene ni
-- debe tener: puede convocar a su grupo, no crear actividades de la iglesia.

-- Helpers --------------------------------------------------------------------

-- app.load_group(): carga el grupo comprobando tenant y módulo. Devuelve la
-- fila; lanza P0002 si no existe en una iglesia del usuario.
create or replace function app.load_group(p_group_id uuid)
returns groups
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_group groups%rowtype;
begin
  select * into v_group from groups where id = p_group_id;
  if not found or not (v_group.church_id = any (app.church_ids_for_user())) then
    raise exception 'El grupo no existe.' using errcode = 'P0002';
  end if;
  perform app.require_groups_module(v_group.church_id);
  return v_group;
end;
$$;

revoke all on function app.load_group(uuid) from public, anon, authenticated;

-- app.assert_group_cap(): carga el grupo y exige una capacidad sobre él.
create or replace function app.assert_group_cap(p_group_id uuid, p_capability text)
returns groups
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_group groups%rowtype;
begin
  v_group := app.load_group(p_group_id);
  if not app.group_cap(v_group.church_id, v_group.campus_id, v_group.id, p_capability) then
    raise exception 'No tienes permiso para esta acción en este grupo.' using errcode = '42501';
  end if;
  return v_group;
end;
$$;

revoke all on function app.assert_group_cap(uuid, text) from public, anon, authenticated;

-- app.assert_group_writable(): un grupo archivado o cerrado conserva su
-- historial y se puede consultar, pero ya no admite movimiento. Lo usan las
-- RPC que incorporan gente, convocan o registran asistencia; no lo usan
-- set_group_archived ni set_group_status, que son precisamente las que
-- devuelven un grupo a la vida.
create or replace function app.assert_group_writable(p_group groups)
returns void
language plpgsql
immutable
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_group.archived_at is not null then
    raise exception 'El grupo «%» está archivado.', p_group.name using errcode = '22023';
  end if;
  if p_group.status = 'closed' then
    raise exception 'El grupo «%» está cerrado.', p_group.name using errcode = '22023';
  end if;
end;
$$;

revoke all on function app.assert_group_writable(groups) from public, anon, authenticated;

-- Aforo: cuenta participantes activos. Los responsables NO ocupan plaza
-- (decisión P-2), por eso no se mira group_leaders aquí.
create or replace function app.group_active_member_count(p_group_id uuid)
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select count(*)::integer from group_members
  where group_id = p_group_id and status = 'active';
$$;

revoke all on function app.group_active_member_count(uuid) from public, anon;
grant execute on function app.group_active_member_count(uuid) to authenticated;

create or replace function app.group_has_active_leader(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from group_leaders
    where group_id = p_group_id and ends_at is null
  );
$$;

revoke all on function app.group_has_active_leader(uuid) from public, anon;
grant execute on function app.group_has_active_leader(uuid) to authenticated;

-- app.assert_group_has_room(): el aforo se comprueba al incorporar a alguien.
-- Bloquea la fila del grupo antes de contar: sin eso, dos altas simultáneas
-- cuentan las dos el mismo hueco y ambas lo superan. El bloqueo dura hasta el
-- final de la transacción, que es justo lo que hace falta.
create or replace function app.assert_group_has_room(p_group groups)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_capacity integer;
begin
  select capacity into v_capacity from groups where id = p_group.id for update;

  if v_capacity is not null
     and app.group_active_member_count(p_group.id) >= v_capacity then
    raise exception 'El grupo «%» ha alcanzado su aforo.', p_group.name using errcode = '22023';
  end if;
end;
$$;

revoke all on function app.assert_group_has_room(groups) from public, anon, authenticated;

-- Tipos de grupo ---------------------------------------------------------------

create or replace function app.save_group_type(p_church_id uuid, p_input jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid := nullif(p_input ->> 'id', '')::uuid;
  v_key text := app.j_text(p_input, 'key');
  v_name text := app.j_text(p_input, 'name');
  v_person uuid;
begin
  perform app.assert_church_member(p_church_id);
  perform app.require_groups_module(p_church_id);
  if not app.has_capability(p_church_id, 'group.create')
     and not app.has_capability(p_church_id, 'group.manage') then
    raise exception 'No tienes permiso para gestionar los tipos de grupo.' using errcode = '42501';
  end if;
  if v_name is null then
    raise exception 'El nombre del tipo de grupo es obligatorio.' using errcode = '22023';
  end if;

  v_person := app.current_person_id(p_church_id);

  if v_id is null then
    if v_key is null then
      raise exception 'La clave del tipo de grupo es obligatoria.' using errcode = '22023';
    end if;
    insert into group_types (church_id, key, name, description, sort_order, created_by)
    values (
      p_church_id, v_key, v_name, app.j_text(p_input, 'description'),
      coalesce((p_input ->> 'sort_order')::smallint, 0::smallint), v_person
    )
    returning id into v_id;
  else
    update group_types set
      name = v_name,
      description = app.j_text(p_input, 'description'),
      sort_order = coalesce((p_input ->> 'sort_order')::smallint, sort_order)
    where id = v_id and church_id = p_church_id;
    if not found then
      raise exception 'El tipo de grupo no existe.' using errcode = 'P0002';
    end if;
  end if;

  perform app.write_audit_log(
    p_church_id, 'group_type.saved', 'group_types', v_id,
    jsonb_build_object('name', v_name)
  );
  return v_id;
end;
$$;

revoke all on function app.save_group_type(uuid, jsonb) from public, anon;
grant execute on function app.save_group_type(uuid, jsonb) to authenticated;

create or replace function app.set_group_type_archived(p_group_type_id uuid, p_archived boolean)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_church uuid;
begin
  select church_id into v_church from group_types where id = p_group_type_id;
  if v_church is null or not (v_church = any (app.church_ids_for_user())) then
    raise exception 'El tipo de grupo no existe.' using errcode = 'P0002';
  end if;
  perform app.require_groups_module(v_church);
  if not app.has_capability(v_church, 'group.manage') then
    raise exception 'No tienes permiso para archivar tipos de grupo.' using errcode = '42501';
  end if;

  update group_types set
    archived_at = case when p_archived then now() else null end,
    archived_by = case when p_archived then app.current_person_id(v_church) else null end
  where id = p_group_type_id;

  perform app.write_audit_log(
    v_church, case when p_archived then 'group_type.archived' else 'group_type.restored' end,
    'group_types', p_group_type_id, '{}'::jsonb
  );
end;
$$;

revoke all on function app.set_group_type_archived(uuid, boolean) from public, anon;
grant execute on function app.set_group_type_archived(uuid, boolean) to authenticated;

-- Grupos -----------------------------------------------------------------------

create or replace function app.create_group(p_church_id uuid, p_input jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_campus uuid := nullif(p_input ->> 'campus_id', '')::uuid;
  v_type uuid := nullif(p_input ->> 'group_type_id', '')::uuid;
  v_name text := app.j_text(p_input, 'name');
  v_capacity integer := nullif(p_input ->> 'capacity', '')::integer;
  v_group_id uuid;
begin
  perform app.assert_church_member(p_church_id);
  perform app.require_groups_module(p_church_id);

  if v_campus is null then
    if not app.has_capability(p_church_id, 'group.create') then
      raise exception 'No tienes permiso para crear grupos de toda la iglesia.' using errcode = '42501';
    end if;
  else
    if not exists (
      select 1 from campuses c
      where c.id = v_campus and c.church_id = p_church_id and c.archived_at is null
    ) then
      raise exception 'La sede no pertenece a esta iglesia.' using errcode = '22023';
    end if;
    if not app.has_capability(p_church_id, 'group.create')
       and not app.has_capability(p_church_id, 'group.create', 'campus', v_campus) then
      raise exception 'No tienes permiso para crear grupos en esta sede.' using errcode = '42501';
    end if;
  end if;

  if v_name is null then
    raise exception 'El nombre del grupo es obligatorio.' using errcode = '22023';
  end if;

  if v_type is not null and not exists (
    select 1 from group_types gt
    where gt.id = v_type and gt.church_id = p_church_id and gt.archived_at is null
  ) then
    raise exception 'El tipo de grupo no existe o está archivado.' using errcode = '22023';
  end if;

  insert into groups (
    church_id, campus_id, group_type_id, name, description, visibility, status,
    join_policy, capacity, age_segment, meeting_location_text, meeting_schedule_text, created_by
  ) values (
    p_church_id, v_campus, v_type, v_name, app.j_text(p_input, 'description'),
    coalesce(nullif(p_input ->> 'visibility', '')::group_visibility, 'listed'),
    coalesce(nullif(p_input ->> 'status', '')::group_status, 'active'),
    coalesce(nullif(p_input ->> 'join_policy', '')::group_join_policy, 'open_request'),
    v_capacity, app.j_text(p_input, 'age_segment'),
    app.j_text(p_input, 'meeting_location_text'), app.j_text(p_input, 'meeting_schedule_text'),
    app.current_person_id(p_church_id)
  )
  returning id into v_group_id;

  perform app.write_audit_log(
    p_church_id, 'group.created', 'groups', v_group_id,
    jsonb_build_object('name', v_name, 'campus_id', v_campus, 'capacity', v_capacity)
  );
  return v_group_id;
end;
$$;

revoke all on function app.create_group(uuid, jsonb) from public, anon;
grant execute on function app.create_group(uuid, jsonb) to authenticated;

create or replace function app.update_group(p_group_id uuid, p_input jsonb)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_group groups%rowtype := app.assert_group_cap(p_group_id, 'group.manage');
  v_type uuid;
begin
  if p_input ? 'group_type_id' then
    v_type := nullif(p_input ->> 'group_type_id', '')::uuid;
    if v_type is not null and not exists (
      select 1 from group_types gt
      where gt.id = v_type and gt.church_id = v_group.church_id and gt.archived_at is null
    ) then
      raise exception 'El tipo de grupo no existe o está archivado.' using errcode = '22023';
    end if;
  else
    v_type := v_group.group_type_id;
  end if;

  update groups set
    name = coalesce(app.j_text(p_input, 'name'), name),
    description = case when p_input ? 'description' then app.j_text(p_input, 'description') else description end,
    group_type_id = v_type,
    visibility = coalesce(nullif(p_input ->> 'visibility', '')::group_visibility, visibility),
    join_policy = coalesce(nullif(p_input ->> 'join_policy', '')::group_join_policy, join_policy),
    capacity = case when p_input ? 'capacity' then nullif(p_input ->> 'capacity', '')::integer else capacity end,
    age_segment = case when p_input ? 'age_segment' then app.j_text(p_input, 'age_segment') else age_segment end,
    meeting_location_text = case when p_input ? 'meeting_location_text'
      then app.j_text(p_input, 'meeting_location_text') else meeting_location_text end,
    meeting_schedule_text = case when p_input ? 'meeting_schedule_text'
      then app.j_text(p_input, 'meeting_schedule_text') else meeting_schedule_text end
  where id = p_group_id;

  perform app.write_audit_log(
    v_group.church_id, 'group.updated', 'groups', p_group_id,
    jsonb_build_object('fields', (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_object_keys(p_input) k))
  );
end;
$$;

revoke all on function app.update_group(uuid, jsonb) from public, anon;
grant execute on function app.update_group(uuid, jsonb) to authenticated;

create or replace function app.set_group_status(p_group_id uuid, p_status group_status)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_group groups%rowtype := app.assert_group_cap(p_group_id, 'group.manage');
begin
  update groups set status = p_status where id = p_group_id;
  perform app.write_audit_log(
    v_group.church_id, 'group.status_changed', 'groups', p_group_id,
    jsonb_build_object('from', v_group.status, 'to', p_status)
  );
end;
$$;

revoke all on function app.set_group_status(uuid, group_status) from public, anon;
grant execute on function app.set_group_status(uuid, group_status) to authenticated;

-- Archivar preserva el historial: participaciones, reuniones y asistencia se
-- conservan tal cual (D12). No se borra nada.
create or replace function app.set_group_archived(p_group_id uuid, p_archived boolean)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_group groups%rowtype := app.assert_group_cap(p_group_id, 'group.manage');
begin
  update groups set
    archived_at = case when p_archived then now() else null end,
    archived_by = case when p_archived then app.current_person_id(v_group.church_id) else null end,
    status = case when p_archived then 'closed'::group_status else status end
  where id = p_group_id;

  perform app.write_audit_log(
    v_group.church_id, case when p_archived then 'group.archived' else 'group.restored' end,
    'groups', p_group_id, '{}'::jsonb
  );
end;
$$;

revoke all on function app.set_group_archived(uuid, boolean) from public, anon;
grant execute on function app.set_group_archived(uuid, boolean) to authenticated;

-- Responsables -----------------------------------------------------------------
--
-- Nombrar responsable hace dos cosas inseparables: registrar la vigencia en
-- group_leaders y conceder el rol group_leader con scope_type='group' y
-- scope_id = este grupo. Aquí es donde se valida ese scope_id, que en el
-- esquema es un uuid sin clave foránea (decisión de la Fase 0).
create or replace function app.add_group_leader(
  p_group_id uuid,
  p_person_id uuid,
  p_role group_leader_role default 'leader'
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_group groups%rowtype := app.assert_group_cap(p_group_id, 'group.manage');
  v_church_people_id uuid;
  v_leader_id uuid;
begin
  perform app.assert_group_writable(v_group);
  perform app.assert_active_church_person(v_group.church_id, p_person_id, 'El responsable');

  select id into v_church_people_id
  from church_people
  where church_id = v_group.church_id and person_id = p_person_id and archived_at is null;

  insert into group_leaders (church_id, group_id, person_id, role, created_by)
  values (v_group.church_id, p_group_id, p_person_id, p_role, app.current_person_id(v_group.church_id))
  on conflict (group_id, person_id) where ends_at is null
  do update set role = excluded.role
  returning id into v_leader_id;

  -- Concesión del rol con scope de grupo. El scope_id queda validado porque
  -- procede de un grupo cargado y comprobado contra el tenant del usuario.
  insert into church_people_roles (church_id, church_people_id, role_key, scope_type, scope_id, granted_by)
  values (v_group.church_id, v_church_people_id, 'group_leader', 'group', p_group_id,
          app.current_person_id(v_group.church_id))
  on conflict (church_id, church_people_id, role_key, scope_type, scope_id) do nothing;

  perform app.write_audit_log(
    v_group.church_id, 'group.leader_added', 'group_leaders', v_leader_id,
    jsonb_build_object('group_id', p_group_id, 'person_id', p_person_id, 'role', p_role)
  );
  return v_leader_id;
end;
$$;

revoke all on function app.add_group_leader(uuid, uuid, group_leader_role) from public, anon;
grant execute on function app.add_group_leader(uuid, uuid, group_leader_role) to authenticated;

-- Retirar al último responsable está permitido: el grupo queda marcado como
-- «sin responsable» y quien administra lo ve en el listado (decisión P-2).
create or replace function app.end_group_leadership(p_group_id uuid, p_person_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_group groups%rowtype := app.assert_group_cap(p_group_id, 'group.manage');
  v_church_people_id uuid;
begin
  update group_leaders set ends_at = now()
  where group_id = p_group_id and person_id = p_person_id and ends_at is null;

  if not found then
    raise exception 'Esa persona no es responsable vigente del grupo.' using errcode = 'P0002';
  end if;

  select id into v_church_people_id
  from church_people
  where church_id = v_group.church_id and person_id = p_person_id;

  delete from church_people_roles
  where church_id = v_group.church_id
    and church_people_id = v_church_people_id
    and role_key = 'group_leader'
    and scope_type = 'group'
    and scope_id = p_group_id;

  perform app.write_audit_log(
    v_group.church_id, 'group.leader_ended', 'groups', p_group_id,
    jsonb_build_object('person_id', p_person_id,
                       'group_left_without_leader', not app.group_has_active_leader(p_group_id))
  );
end;
$$;

revoke all on function app.end_group_leadership(uuid, uuid) from public, anon;
grant execute on function app.end_group_leadership(uuid, uuid) to authenticated;

-- Participantes ------------------------------------------------------------------

create or replace function app.add_group_member(p_group_id uuid, p_person_id uuid, p_input jsonb default '{}')
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_group groups%rowtype := app.assert_group_cap(p_group_id, 'group.member.manage');
  v_member_id uuid;
  v_was_active boolean;
begin
  perform app.assert_group_writable(v_group);
  perform app.assert_active_church_person(v_group.church_id, p_person_id, 'El participante');

  select status = 'active' into v_was_active
  from group_members where group_id = p_group_id and person_id = p_person_id;

  if coalesce(v_was_active, false) then
    raise exception 'Esa persona ya participa en el grupo.' using errcode = '23505';
  end if;

  perform app.assert_group_has_room(v_group);

  insert into group_members (church_id, group_id, person_id, status, created_by, joined_at)
  values (v_group.church_id, p_group_id, p_person_id, 'active',
          app.current_person_id(v_group.church_id), now())
  on conflict (group_id, person_id) do update set
    status = 'active', joined_at = now(), left_at = null, left_reason = null
  returning id into v_member_id;

  -- Aviso de incorporación a la persona (decisión P-6). La clave lleva el
  -- momento del alta para que una readmisión vuelva a avisar.
  perform app.emit_notification_event(
    v_group.church_id, 'group.member.added', 'group_members', v_member_id, null,
    array[p_person_id], app.group_notification_payload(p_group_id),
    null, extract(epoch from now())::bigint::text
  );

  perform app.write_audit_log(
    v_group.church_id, 'group.member_added', 'group_members', v_member_id,
    jsonb_build_object('group_id', p_group_id, 'person_id', p_person_id)
  );
  return v_member_id;
end;
$$;

revoke all on function app.add_group_member(uuid, uuid, jsonb) from public, anon;
grant execute on function app.add_group_member(uuid, uuid, jsonb) to authenticated;

-- Dar de baja conserva la fila y su historial: cambia de estado, no se borra.
create or replace function app.remove_group_member(p_group_id uuid, p_person_id uuid, p_input jsonb default '{}')
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_group groups%rowtype;
  v_self boolean;
  v_status group_member_status;
begin
  v_group := app.load_group(p_group_id);
  v_self := p_person_id in (select app.current_person_ids());

  -- Uno mismo siempre puede salir de un grupo; para dar de baja a otra persona
  -- hace falta la capacidad.
  if not v_self and not app.group_cap(v_group.church_id, v_group.campus_id, v_group.id, 'group.member.manage') then
    raise exception 'No tienes permiso para dar de baja participantes de este grupo.' using errcode = '42501';
  end if;

  v_status := case when v_self then 'left'::group_member_status else 'removed'::group_member_status end;

  update group_members set
    status = v_status,
    left_at = now(),
    left_reason = app.j_text(p_input, 'reason')
  where group_id = p_group_id and person_id = p_person_id and status = 'active';

  if not found then
    raise exception 'Esa persona no participa en el grupo.' using errcode = 'P0002';
  end if;

  perform app.write_audit_log(
    v_group.church_id, 'group.member_removed', 'groups', p_group_id,
    jsonb_build_object('person_id', p_person_id, 'status', v_status)
  );
end;
$$;

revoke all on function app.remove_group_member(uuid, uuid, jsonb) from public, anon;
grant execute on function app.remove_group_member(uuid, uuid, jsonb) to authenticated;

-- Solicitudes de ingreso -----------------------------------------------------------

create or replace function app.request_group_join(p_group_id uuid, p_message text default null)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_group groups%rowtype := app.load_group(p_group_id);
  v_person uuid := app.current_person_id(v_group.church_id);
  v_request_id uuid;
  v_recipients uuid[];
begin
  if v_person is null then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  if v_group.archived_at is not null or v_group.status <> 'active' then
    raise exception 'Este grupo no admite solicitudes ahora mismo.' using errcode = '22023';
  end if;

  if v_group.join_policy <> 'open_request' then
    raise exception 'Este grupo solo admite altas hechas por su responsable.' using errcode = '22023';
  end if;

  -- Ver el grupo es condición para poder pedir entrar: un grupo privado no
  -- recibe solicitudes de quien no debería ni saber que existe (decisión P-1).
  if not app.can_read_group(p_group_id) then
    raise exception 'El grupo no existe.' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from group_members
    where group_id = p_group_id and person_id = v_person and status = 'active'
  ) then
    raise exception 'Ya participas en este grupo.' using errcode = '23505';
  end if;

  -- Una sola solicitud pendiente por persona y grupo (decisión P-7). El índice
  -- parcial lo garantiza; esto da el error de dominio antes.
  if exists (
    select 1 from group_join_requests
    where group_id = p_group_id and person_id = v_person and status = 'pending'
  ) then
    raise exception 'Ya tienes una solicitud pendiente en este grupo.' using errcode = '23505';
  end if;

  insert into group_join_requests (church_id, group_id, person_id, status, message)
  values (v_group.church_id, p_group_id, v_person, 'pending', nullif(btrim(coalesce(p_message, '')), ''))
  returning id into v_request_id;

  v_recipients := app.group_notification_recipients(p_group_id, 'leaders');
  if cardinality(v_recipients) > 0 then
    perform app.emit_notification_event(
      v_group.church_id, 'group.join_request.received', 'group_join_requests', v_request_id, null,
      v_recipients,
      app.group_notification_payload(p_group_id) || jsonb_build_object('person_id', v_person),
      null, null
    );
  end if;

  perform app.write_audit_log(
    v_group.church_id, 'group.join_requested', 'group_join_requests', v_request_id,
    jsonb_build_object('group_id', p_group_id)
  );
  return v_request_id;
end;
$$;

revoke all on function app.request_group_join(uuid, text) from public, anon;
grant execute on function app.request_group_join(uuid, text) to authenticated;

create or replace function app.resolve_group_join_request(
  p_request_id uuid,
  p_accept boolean,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_request group_join_requests%rowtype;
  v_group groups%rowtype;
  v_member_id uuid;
  v_decider uuid;
begin
  select * into v_request from group_join_requests where id = p_request_id;
  if not found then
    raise exception 'La solicitud no existe.' using errcode = 'P0002';
  end if;

  v_group := app.assert_group_cap(v_request.group_id, 'group.request.manage');
  perform app.assert_group_writable(v_group);

  if v_request.status <> 'pending' then
    raise exception 'Esa solicitud ya está resuelta.' using errcode = '22023';
  end if;

  v_decider := app.current_person_id(v_group.church_id);

  if p_accept then
    perform app.assert_group_has_room(v_group);

    insert into group_members (church_id, group_id, person_id, status, created_by, joined_at)
    values (v_group.church_id, v_request.group_id, v_request.person_id, 'active', v_decider, now())
    on conflict (group_id, person_id) do update set
      status = 'active', joined_at = now(), left_at = null, left_reason = null
    returning id into v_member_id;
  end if;

  update group_join_requests set
    status = case when p_accept then 'accepted'::group_join_request_status
                  else 'rejected'::group_join_request_status end,
    decided_by = v_decider,
    decided_at = now(),
    decision_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_request_id;

  perform app.emit_notification_event(
    v_group.church_id,
    case when p_accept then 'group.join_request.accepted' else 'group.join_request.rejected' end,
    'group_join_requests', p_request_id, null,
    array[v_request.person_id],
    app.group_notification_payload(v_request.group_id)
      || jsonb_build_object('decision_note', nullif(btrim(coalesce(p_note, '')), '')),
    null, null
  );

  perform app.write_audit_log(
    v_group.church_id,
    case when p_accept then 'group.join_accepted' else 'group.join_rejected' end,
    'group_join_requests', p_request_id,
    jsonb_build_object('group_id', v_request.group_id, 'person_id', v_request.person_id)
  );
end;
$$;

revoke all on function app.resolve_group_join_request(uuid, boolean, text) from public, anon;
grant execute on function app.resolve_group_join_request(uuid, boolean, text) to authenticated;

create or replace function app.cancel_group_join_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_request group_join_requests%rowtype;
begin
  select * into v_request from group_join_requests where id = p_request_id;
  if not found or not (v_request.church_id = any (app.church_ids_for_user())) then
    raise exception 'La solicitud no existe.' using errcode = 'P0002';
  end if;

  if not (v_request.person_id in (select app.current_person_ids())) then
    raise exception 'Solo quien hizo la solicitud puede retirarla.' using errcode = '42501';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Esa solicitud ya está resuelta.' using errcode = '22023';
  end if;

  update group_join_requests set status = 'cancelled', decided_at = now()
  where id = p_request_id;

  perform app.write_audit_log(
    v_request.church_id, 'group.join_cancelled', 'group_join_requests', p_request_id, '{}'::jsonb
  );
end;
$$;

revoke all on function app.cancel_group_join_request(uuid) from public, anon;
grant execute on function app.cancel_group_join_request(uuid) to authenticated;

-- Reuniones ------------------------------------------------------------------------
--
-- La actividad se crea con visibility='private': la reunión de un grupo no se
-- anuncia en el calendario general de la iglesia (decisión P-1). Quien la ve es
-- quien puede ver la lista del grupo, por la política de group_meetings y por
-- public.list_group_meetings.
--
-- La reunión NO recorre la máquina de estados de activities (ADR 0019). Una
-- reunión de célula se convoca y, como mucho, se cancela; no pasa por borrador
-- ni por publicación. Publicarla exigiría 'activity.publish' y cancelarla
-- 'activity.cancel' —capacidades sobre el calendario de la iglesia entera— a
-- quien solo lleva un grupo. Por eso el acto de cancelar vive en
-- group_meetings.cancelled_at y la actividad queda como lo que es aquí: el
-- hueco temporal con su fecha, su hora y su sitio.

create or replace function app.schedule_group_meeting(p_group_id uuid, p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_group groups%rowtype := app.assert_group_cap(p_group_id, 'group.meeting.manage');
  v_person uuid := app.current_person_id(v_group.church_id);
  v_timezone text;
  v_starts timestamptz;
  v_ends timestamptz;
  v_title text := coalesce(app.j_text(p_input, 'title'), v_group.name);
  v_recurring boolean := jsonb_typeof(p_input -> 'recurrence') = 'object';
  v_series_id uuid;
  v_activity_id uuid;
  v_occurrences integer := 1;
  v_meeting_id uuid;
  v_created integer := 0;
  r record;
begin
  perform app.assert_group_writable(v_group);

  v_timezone := app.resolve_activity_timezone(v_group.church_id, v_group.campus_id, p_input ->> 'timezone');

  select o_starts_at, o_ends_at into v_starts, v_ends
  from app.resolve_activity_schedule('timed', 'group_meeting', p_input, v_timezone, 90);

  if v_recurring then
    v_series_id := app.create_activity_series_row(
      v_group.church_id, 'group_meeting', v_title, p_input -> 'recurrence',
      (app.parse_local_timestamp(p_input ->> 'local_start'))::date,
      (app.parse_local_timestamp(p_input ->> 'local_start'))::time,
      (extract(epoch from (v_ends - v_starts)) / 60)::integer,
      v_timezone, null
    );

    v_occurrences := app.expand_activity_series(
      v_series_id,
      jsonb_build_object(
        'description', app.j_text(p_input, 'description'),
        'campus_id', v_group.campus_id,
        'visibility', 'private',
        'location_text', coalesce(app.j_text(p_input, 'location_text'), v_group.meeting_location_text),
        'organizer_person_id', v_person
      ),
      null, null, null
    );

    for r in select a.id from activities a where a.series_id = v_series_id order by a.occurrence_date
    loop
      insert into group_meetings (church_id, group_id, activity_id, created_by)
      values (v_group.church_id, p_group_id, r.id, v_person)
      returning id into v_meeting_id;
      v_created := v_created + 1;
      if v_activity_id is null then
        v_activity_id := r.id;
      end if;
    end loop;
  else
    v_activity_id := app.insert_activity_row(
      v_group.church_id, 'group_meeting', v_title, app.j_text(p_input, 'description'),
      v_group.campus_id, 'timed', v_starts, v_ends, v_timezone,
      'private', coalesce(app.j_text(p_input, 'location_text'), v_group.meeting_location_text),
      v_person, null, null, null, null, null, null
    );

    insert into group_meetings (church_id, group_id, activity_id, created_by)
    values (v_group.church_id, p_group_id, v_activity_id, v_person)
    returning id into v_meeting_id;
    v_created := 1;
  end if;

  perform app.write_audit_log(
    v_group.church_id, 'group.meeting_scheduled', 'group_meetings', v_meeting_id,
    jsonb_build_object('group_id', p_group_id, 'series_id', v_series_id, 'occurrences', v_created)
  );

  return jsonb_build_object(
    'group_meeting_id', v_meeting_id,
    'activity_id', v_activity_id,
    'series_id', v_series_id,
    'occurrences', v_created
  );
end;
$$;

revoke all on function app.schedule_group_meeting(uuid, jsonb) from public, anon;
grant execute on function app.schedule_group_meeting(uuid, jsonb) to authenticated;

create or replace function app.reschedule_group_meeting(p_group_meeting_id uuid, p_input jsonb)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_meeting group_meetings%rowtype;
  v_group groups%rowtype;
  v_activity activities%rowtype;
  v_starts timestamptz;
  v_ends timestamptz;
begin
  select * into v_meeting from group_meetings where id = p_group_meeting_id;
  if not found then
    raise exception 'La reunión no existe.' using errcode = 'P0002';
  end if;

  v_group := app.assert_group_cap(v_meeting.group_id, 'group.meeting.manage');
  select * into v_activity from activities where id = v_meeting.activity_id;

  select o_starts_at, o_ends_at into v_starts, v_ends
  from app.resolve_activity_schedule('timed', 'group_meeting', p_input, v_activity.timezone,
    (extract(epoch from (v_activity.ends_at - v_activity.starts_at)) / 60)::integer);

  update activities set
    starts_at = v_starts,
    ends_at = v_ends,
    location_text = case when p_input ? 'location_text'
      then app.j_text(p_input, 'location_text') else location_text end,
    series_modified = case when series_id is not null then true else series_modified end
  where id = v_meeting.activity_id;

  -- Aviso a los participantes (decisión P-6). La clave lleva el momento del
  -- cambio, no la hora de destino: si llevara el destino, mover la reunión a una
  -- hora que ya se usó antes no avisaría a nadie, nunca más.
  perform app.emit_notification_event(
    v_group.church_id, 'group.meeting.rescheduled', 'group_meetings', p_group_meeting_id, null,
    app.group_notification_recipients(v_meeting.group_id, 'members'),
    app.group_notification_payload(v_meeting.group_id)
      || jsonb_build_object('activity_id', v_meeting.activity_id,
                            'activity_title', v_activity.title,
                            'starts_at', v_starts,
                            'timezone', v_activity.timezone),
    null, extract(epoch from clock_timestamp())::text
  );

  perform app.write_audit_log(
    v_group.church_id, 'group.meeting_rescheduled', 'group_meetings', p_group_meeting_id,
    jsonb_build_object('starts_at', v_starts)
  );
end;
$$;

revoke all on function app.reschedule_group_meeting(uuid, jsonb) from public, anon;
grant execute on function app.reschedule_group_meeting(uuid, jsonb) to authenticated;

create or replace function app.cancel_group_meeting(p_group_meeting_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_meeting group_meetings%rowtype;
  v_group groups%rowtype;
  v_activity activities%rowtype;
begin
  select * into v_meeting from group_meetings where id = p_group_meeting_id;
  if not found then
    raise exception 'La reunión no existe.' using errcode = 'P0002';
  end if;

  v_group := app.assert_group_cap(v_meeting.group_id, 'group.meeting.manage');
  select * into v_activity from activities where id = v_meeting.activity_id;

  if v_meeting.cancelled_at is not null then
    raise exception 'Esa reunión ya está cancelada.' using errcode = '22023';
  end if;

  -- Se cancela la reunión del grupo, no la actividad: ver el comentario de
  -- app.schedule_group_meeting y el ADR 0019.
  update group_meetings set
    cancelled_at = now(),
    cancelled_by = app.current_person_id(v_group.church_id),
    cancellation_reason = nullif(btrim(coalesce(p_reason, '')), '')
  where id = p_group_meeting_id;

  perform app.emit_notification_event(
    v_group.church_id, 'group.meeting.cancelled', 'group_meetings', p_group_meeting_id, null,
    app.group_notification_recipients(v_meeting.group_id, 'members'),
    app.group_notification_payload(v_meeting.group_id)
      || jsonb_build_object('activity_id', v_meeting.activity_id,
                            'activity_title', v_activity.title,
                            'starts_at', v_activity.starts_at,
                            'timezone', v_activity.timezone),
    null, null
  );

  perform app.write_audit_log(
    v_group.church_id, 'group.meeting_cancelled', 'group_meetings', p_group_meeting_id,
    jsonb_build_object('reason', p_reason)
  );
end;
$$;

revoke all on function app.cancel_group_meeting(uuid, text) from public, anon;
grant execute on function app.cancel_group_meeting(uuid, text) to authenticated;

-- Asistencia --------------------------------------------------------------------
--
-- p_entries: [{"person_id": "...", "status": "present|absent|excused",
--              "is_guest": false, "notes": "..."}]
-- Registrar es idempotente: repetir la llamada corrige, no duplica.
create or replace function app.record_group_attendance(p_group_meeting_id uuid, p_entries jsonb)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_meeting group_meetings%rowtype;
  v_group groups%rowtype;
  v_person uuid := null;
  v_recorder uuid;
  v_entry jsonb;
  v_is_guest boolean;
  v_count integer := 0;
begin
  select * into v_meeting from group_meetings where id = p_group_meeting_id;
  if not found then
    raise exception 'La reunión no existe.' using errcode = 'P0002';
  end if;

  v_group := app.assert_group_cap(v_meeting.group_id, 'group.attendance.manage');
  perform app.assert_group_writable(v_group);
  v_recorder := app.current_person_id(v_group.church_id);

  if jsonb_typeof(p_entries) <> 'array' then
    raise exception 'La asistencia debe ser una lista.' using errcode = '22023';
  end if;

  for v_entry in select * from jsonb_array_elements(p_entries)
  loop
    v_person := nullif(v_entry ->> 'person_id', '')::uuid;
    if v_person is null then
      raise exception 'Cada línea de asistencia necesita una persona.' using errcode = '22023';
    end if;

    perform app.assert_active_church_person(v_group.church_id, v_person, 'El asistente');

    v_is_guest := coalesce((v_entry ->> 'is_guest')::boolean, false);

    -- Solo se registra asistencia de quien participa en el grupo; para el
    -- resto hay que marcarlo explícitamente como invitado.
    if not v_is_guest and not exists (
      select 1 from group_members
      where group_id = v_meeting.group_id and person_id = v_person and status = 'active'
    ) then
      raise exception 'Esa persona no participa en el grupo: márcala como invitada si asistió.'
        using errcode = '22023';
    end if;

    insert into group_attendance (
      church_id, group_meeting_id, person_id, status, is_guest, notes, recorded_by, recorded_at
    ) values (
      v_group.church_id, p_group_meeting_id, v_person,
      coalesce(nullif(v_entry ->> 'status', '')::group_attendance_status, 'present'),
      v_is_guest, app.j_text(v_entry, 'notes'), v_recorder, now()
    )
    on conflict (group_meeting_id, person_id) do update set
      status = excluded.status,
      is_guest = excluded.is_guest,
      notes = excluded.notes,
      recorded_by = excluded.recorded_by,
      recorded_at = now();

    v_count := v_count + 1;
  end loop;

  update group_meetings set
    attendance_recorded_at = now(),
    attendance_recorded_by = v_recorder
  where id = p_group_meeting_id;

  perform app.write_audit_log(
    v_group.church_id, 'group.attendance_recorded', 'group_meetings', p_group_meeting_id,
    jsonb_build_object('entries', v_count)
  );
  return v_count;
end;
$$;

revoke all on function app.record_group_attendance(uuid, jsonb) from public, anon;
grant execute on function app.record_group_attendance(uuid, jsonb) to authenticated;

-- Lecturas -----------------------------------------------------------------------

-- app.group_roster(): la lista del grupo aplicando la decisión P-5. El nombre
-- va siempre; el correo y el teléfono solo si la persona los ha hecho visibles
-- o si quien mira tiene permiso expreso.
create or replace function app.group_roster(p_group_id uuid)
returns table (
  person_id uuid,
  display_name text,
  role text,
  status text,
  joined_at timestamptz,
  email text,
  phone text,
  contact_visible boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with g as (
    select * from groups where id = p_group_id and app.can_read_group_roster(p_group_id)
  ),
  roster as (
    select gl.person_id, 'leader'::text as role, 'active'::text as status, gl.starts_at as joined_at
    from group_leaders gl join g on g.id = gl.group_id
    where gl.ends_at is null
    union all
    select gm.person_id, 'member'::text, gm.status::text, gm.joined_at
    from group_members gm join g on g.id = gm.group_id
    where gm.status = 'active'
  )
  select
    r.person_id,
    coalesce(nullif(p.preferred_name, ''), p.first_name) || coalesce(' ' || p.last_name, ''),
    r.role,
    r.status,
    r.joined_at,
    case when app.can_read_person_contact(g.church_id, r.person_id, g.id) then p.email end,
    case when app.can_read_person_contact(g.church_id, r.person_id, g.id) then p.phone end,
    app.can_read_person_contact(g.church_id, r.person_id, g.id)
  from roster r
  join g on true
  join people p on p.id = r.person_id
  order by (r.role = 'member'), 2;
$$;

revoke all on function app.group_roster(uuid) from public, anon;
grant execute on function app.group_roster(uuid) to authenticated;

-- app.list_group_meetings(): reuniones con su fecha real, leídas desde la
-- actividad.
create or replace function app.list_group_meetings(
  p_group_id uuid,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit integer default 50
)
returns table (
  group_meeting_id uuid,
  activity_id uuid,
  title text,
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text,
  location_text text,
  cancelled_at timestamptz,
  cancellation_reason text,
  attendance_recorded_at timestamptz,
  attendance_count integer
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    m.id, a.id, a.title, a.starts_at, a.ends_at, a.timezone, a.location_text,
    m.cancelled_at, m.cancellation_reason,
    m.attendance_recorded_at,
    (select count(*)::integer from group_attendance ga
      where ga.group_meeting_id = m.id and ga.status = 'present')
  from group_meetings m
  join activities a on a.id = m.activity_id and a.church_id = m.church_id
  where m.group_id = p_group_id
    and app.can_read_group_roster(p_group_id)
    and (p_from is null or a.starts_at >= p_from)
    and (p_to is null or a.starts_at <= p_to)
  order by a.starts_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

revoke all on function app.list_group_meetings(uuid, timestamptz, timestamptz, integer) from public, anon;
grant execute on function app.list_group_meetings(uuid, timestamptz, timestamptz, integer) to authenticated;

-- app.group_metrics(): las métricas del §63-68 de docs/modulos/02.
create or replace function app.group_metrics(p_church_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'active_groups', (
      select count(*) from groups g
      where g.church_id = p_church_id and g.archived_at is null and g.status = 'active'
        and app.can_read_group(g.id)
    ),
    'groups_without_leader', (
      select count(*) from groups g
      where g.church_id = p_church_id and g.archived_at is null and g.status = 'active'
        and app.can_read_group(g.id) and not app.group_has_active_leader(g.id)
    ),
    'active_members', (
      select count(distinct gm.person_id) from group_members gm
      join groups g on g.id = gm.group_id
      where gm.church_id = p_church_id and gm.status = 'active'
        and g.archived_at is null and app.can_read_group_roster(g.id)
    ),
    'pending_requests', (
      select count(*) from group_join_requests r
      where r.church_id = p_church_id and r.status = 'pending'
        and app.group_cap_by_id(r.group_id, 'group.request.manage')
    ),
    'groups_at_capacity', (
      select count(*) from groups g
      where g.church_id = p_church_id and g.archived_at is null and g.capacity is not null
        and app.can_read_group(g.id)
        and app.group_active_member_count(g.id) >= g.capacity
    )
  );
$$;

revoke all on function app.group_metrics(uuid) from public, anon;
grant execute on function app.group_metrics(uuid) to authenticated;

-- Envoltorios públicos -----------------------------------------------------------

create or replace function public.save_group_type(p_church_id uuid, p_input jsonb)
returns uuid language sql security invoker set search_path = pg_catalog, public
as $$ select app.save_group_type(p_church_id, p_input); $$;

create or replace function public.set_group_type_archived(p_group_type_id uuid, p_archived boolean)
returns void language sql security invoker set search_path = pg_catalog, public
as $$ select app.set_group_type_archived(p_group_type_id, p_archived); $$;

create or replace function public.create_group(p_church_id uuid, p_input jsonb)
returns uuid language sql security invoker set search_path = pg_catalog, public
as $$ select app.create_group(p_church_id, p_input); $$;

create or replace function public.update_group(p_group_id uuid, p_input jsonb)
returns void language sql security invoker set search_path = pg_catalog, public
as $$ select app.update_group(p_group_id, p_input); $$;

create or replace function public.set_group_status(p_group_id uuid, p_status group_status)
returns void language sql security invoker set search_path = pg_catalog, public
as $$ select app.set_group_status(p_group_id, p_status); $$;

create or replace function public.set_group_archived(p_group_id uuid, p_archived boolean)
returns void language sql security invoker set search_path = pg_catalog, public
as $$ select app.set_group_archived(p_group_id, p_archived); $$;

create or replace function public.add_group_leader(p_group_id uuid, p_person_id uuid, p_role group_leader_role default 'leader')
returns uuid language sql security invoker set search_path = pg_catalog, public
as $$ select app.add_group_leader(p_group_id, p_person_id, p_role); $$;

create or replace function public.end_group_leadership(p_group_id uuid, p_person_id uuid)
returns void language sql security invoker set search_path = pg_catalog, public
as $$ select app.end_group_leadership(p_group_id, p_person_id); $$;

create or replace function public.add_group_member(p_group_id uuid, p_person_id uuid, p_input jsonb default '{}')
returns uuid language sql security invoker set search_path = pg_catalog, public
as $$ select app.add_group_member(p_group_id, p_person_id, p_input); $$;

create or replace function public.remove_group_member(p_group_id uuid, p_person_id uuid, p_input jsonb default '{}')
returns void language sql security invoker set search_path = pg_catalog, public
as $$ select app.remove_group_member(p_group_id, p_person_id, p_input); $$;

create or replace function public.request_group_join(p_group_id uuid, p_message text default null)
returns uuid language sql security invoker set search_path = pg_catalog, public
as $$ select app.request_group_join(p_group_id, p_message); $$;

create or replace function public.resolve_group_join_request(p_request_id uuid, p_accept boolean, p_note text default null)
returns void language sql security invoker set search_path = pg_catalog, public
as $$ select app.resolve_group_join_request(p_request_id, p_accept, p_note); $$;

create or replace function public.cancel_group_join_request(p_request_id uuid)
returns void language sql security invoker set search_path = pg_catalog, public
as $$ select app.cancel_group_join_request(p_request_id); $$;

create or replace function public.schedule_group_meeting(p_group_id uuid, p_input jsonb)
returns jsonb language sql security invoker set search_path = pg_catalog, public
as $$ select app.schedule_group_meeting(p_group_id, p_input); $$;

create or replace function public.reschedule_group_meeting(p_group_meeting_id uuid, p_input jsonb)
returns void language sql security invoker set search_path = pg_catalog, public
as $$ select app.reschedule_group_meeting(p_group_meeting_id, p_input); $$;

create or replace function public.cancel_group_meeting(p_group_meeting_id uuid, p_reason text default null)
returns void language sql security invoker set search_path = pg_catalog, public
as $$ select app.cancel_group_meeting(p_group_meeting_id, p_reason); $$;

create or replace function public.record_group_attendance(p_group_meeting_id uuid, p_entries jsonb)
returns integer language sql security invoker set search_path = pg_catalog, public
as $$ select app.record_group_attendance(p_group_meeting_id, p_entries); $$;

create or replace function public.group_roster(p_group_id uuid)
returns table (
  person_id uuid, display_name text, role text, status text, joined_at timestamptz,
  email text, phone text, contact_visible boolean
)
language sql stable security invoker set search_path = pg_catalog, public
as $$ select * from app.group_roster(p_group_id); $$;

create or replace function public.list_group_meetings(
  p_group_id uuid, p_from timestamptz default null,
  p_to timestamptz default null, p_limit integer default 50
)
returns table (
  group_meeting_id uuid, activity_id uuid, title text, starts_at timestamptz,
  ends_at timestamptz, timezone text, location_text text,
  cancelled_at timestamptz, cancellation_reason text,
  attendance_recorded_at timestamptz, attendance_count integer
)
language sql stable security invoker set search_path = pg_catalog, public
as $$ select * from app.list_group_meetings(p_group_id, p_from, p_to, p_limit); $$;

create or replace function public.group_metrics(p_church_id uuid)
returns jsonb language sql stable security invoker set search_path = pg_catalog, public
as $$ select app.group_metrics(p_church_id); $$;

-- Privilegios de los envoltorios: los privilegios por defecto de PostgreSQL
-- conceden EXECUTE a PUBLIC, así que hay que revocarlos explícitamente.
do $grants$
declare
  v_sig text;
begin
  foreach v_sig in array array[
    'public.save_group_type(uuid, jsonb)',
    'public.set_group_type_archived(uuid, boolean)',
    'public.create_group(uuid, jsonb)',
    'public.update_group(uuid, jsonb)',
    'public.set_group_status(uuid, group_status)',
    'public.set_group_archived(uuid, boolean)',
    'public.add_group_leader(uuid, uuid, group_leader_role)',
    'public.end_group_leadership(uuid, uuid)',
    'public.add_group_member(uuid, uuid, jsonb)',
    'public.remove_group_member(uuid, uuid, jsonb)',
    'public.request_group_join(uuid, text)',
    'public.resolve_group_join_request(uuid, boolean, text)',
    'public.cancel_group_join_request(uuid)',
    'public.schedule_group_meeting(uuid, jsonb)',
    'public.reschedule_group_meeting(uuid, jsonb)',
    'public.cancel_group_meeting(uuid, text)',
    'public.record_group_attendance(uuid, jsonb)',
    'public.group_roster(uuid)',
    'public.list_group_meetings(uuid, timestamptz, timestamptz, integer)',
    'public.group_metrics(uuid)'
  ]
  loop
    execute format('revoke all on function %s from public, anon', v_sig);
    execute format('grant execute on function %s to authenticated', v_sig);
  end loop;
end;
$grants$;
