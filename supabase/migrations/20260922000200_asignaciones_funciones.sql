-- Fase 5 (Carlos) · Funciones de dominio de asignaciones: autorización,
-- ventanas temporales, elegibilidad por fecha de actividad, conflictos y
-- lectura mínima de la persona asignada.

-- ===========================================================================
-- Autorización
-- ===========================================================================
-- Gestionar asignaciones de un puesto: assignment.manage con scope church,
-- campus de la actividad, la actividad, o el área de servicio del puesto.
create or replace function app.assignment_manage_cap(
  p_church_id uuid,
  p_campus_id uuid,
  p_activity_id uuid,
  p_service_area_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select app.activity_cap(p_church_id, p_campus_id, p_activity_id, 'assignment.manage')
    or (p_service_area_id is not null
        and app.has_capability(p_church_id, 'assignment.manage', 'service_area', p_service_area_id));
$$;

revoke all on function app.assignment_manage_cap(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function app.assignment_manage_cap(uuid, uuid, uuid, uuid) to authenticated;

-- ===========================================================================
-- Ventanas temporales (decisión de Carlos)
-- ===========================================================================
-- Rango de la actividad para solapes, semiabierto [inicio, fin). Nulo si la
-- actividad no tiene rango completo (tareas flexibles sin ventana).
create or replace function app.activity_time_range(p_activity activities)
returns tstzrange
language sql
immutable
set search_path = pg_catalog, public
as $$
  select case
    when p_activity.starts_at is not null and p_activity.ends_at is not null
      then tstzrange(p_activity.starts_at, p_activity.ends_at, '[)')
  end;
$$;

-- Instante de referencia para vigencias (credenciales, cualificaciones):
-- con horario, el final de la actividad; flexible, el final de su ventana,
-- o su inicio, o el momento de evaluar.
create or replace function app.activity_eligibility_reference(p_activity activities)
returns timestamptz
language sql
stable
set search_path = pg_catalog, public
as $$
  select coalesce(p_activity.ends_at, p_activity.starts_at, now());
$$;

-- Límite para responder: con horario, el inicio; flexible, el final de la
-- ventana (nulo = sin límite).
create or replace function app.activity_response_deadline(p_activity activities)
returns timestamptz
language sql
immutable
set search_path = pg_catalog, public
as $$
  select case when p_activity.schedule_kind = 'timed' then p_activity.starts_at else p_activity.ends_at end;
$$;

revoke all on function app.activity_time_range(activities) from public, anon;
revoke all on function app.activity_eligibility_reference(activities) from public, anon;
revoke all on function app.activity_response_deadline(activities) from public, anon;
grant execute on function app.activity_time_range(activities) to authenticated;
grant execute on function app.activity_eligibility_reference(activities) to authenticated;
grant execute on function app.activity_response_deadline(activities) to authenticated;

-- ===========================================================================
-- Capacidad del puesto
-- ===========================================================================
-- Previstos (proposed + pending + accepted) del puesto, excluyendo las
-- asignaciones indicadas (p. ej. la original de una sustitución o la propia).
create or replace function app.position_expected_count(p_activity_position_id uuid, p_exclude uuid[] default '{}')
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select count(*)::integer
  from activity_assignments aa
  where aa.activity_position_id = p_activity_position_id
    and aa.status in ('proposed', 'pending', 'accepted')
    and not (aa.id = any (coalesce(p_exclude, '{}')));
$$;

revoke all on function app.position_expected_count(uuid, uuid[]) from public, anon, authenticated;

-- ===========================================================================
-- Elegibilidad y conflictos
-- ===========================================================================
-- Evalúa a una persona para un puesto de actividad en la fecha de la
-- actividad. Devuelve códigos (sin datos sensibles):
--   bloqueos: inactive_person, not_area_member, insufficient_level,
--     missing_qualification, qualification_expired_at_activity,
--     missing_credential, credential_expired_at_activity,
--     requirement_not_met (requisito sensible no visible para quien consulta),
--     activity_not_assignable, position_full
--   avisos: los mismos códigos de requisitos recomendados con sufijo
--     _recommended, overlapping_assignment, unavailable, different_campus
-- p_exclude: asignaciones que no cuentan para capacidad ni solapes.
create or replace function app.evaluate_assignment_eligibility(
  p_activity_position_id uuid,
  p_person_id uuid,
  p_exclude uuid[] default '{}'
)
returns table (blocking text[], warnings text[])
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_position activity_positions%rowtype;
  v_activity activities%rowtype;
  v_member service_area_members%rowtype;
  v_member_found boolean := false;
  v_blocking text[] := '{}';
  v_warnings text[] := '{}';
  v_reference timestamptz;
  v_range tstzrange;
  v_req record;
  v_code text;
  v_can_see_sensitive boolean;
  v_primary_campus uuid;
  v_person_active boolean;
begin
  select * into v_position from activity_positions where id = p_activity_position_id;
  if not found then
    return query select array['position_not_found']::text[], '{}'::text[];
    return;
  end if;
  select * into v_activity from activities where id = v_position.activity_id;

  v_reference := app.activity_eligibility_reference(v_activity);
  v_range := app.activity_time_range(v_activity);
  v_can_see_sensitive := auth.uid() is null
    or app.has_capability(v_activity.church_id, 'credential.sensitive.read');

  -- Pertenencia activa a la iglesia.
  select cp.archived_at is null, cp.primary_campus_id into v_person_active, v_primary_campus
  from church_people cp
  where cp.church_id = v_activity.church_id and cp.person_id = p_person_id;
  if v_person_active is null or not v_person_active then
    v_blocking := array_append(v_blocking, 'inactive_person');
  end if;

  if not app.activity_accepts_assignments_unchecked(v_activity.id) then
    v_blocking := array_append(v_blocking, 'activity_not_assignable');
  end if;

  -- Miembro activo del área del puesto (si el área de catálogo existe).
  if v_position.service_area_id is not null then
    select * into v_member from service_area_members sam
    where sam.church_id = v_activity.church_id
      and sam.service_area_id = v_position.service_area_id
      and sam.person_id = p_person_id;
    v_member_found := found;
    if not v_member_found or v_member.status <> 'active' or v_member.left_at is not null then
      v_blocking := array_append(v_blocking, 'not_area_member');
    end if;
  end if;

  if v_position.requires_autonomous_person
     and (not v_member_found or v_member.level not in ('autonomous', 'leader')) then
    v_blocking := array_append(v_blocking, 'insufficient_level');
  end if;

  -- Requisitos efectivos del puesto en la actividad (snapshot + overrides,
  -- sin los desactivados), evaluados en la fecha de referencia.
  for v_req in
    select r.*, ct.sensitive as credential_sensitive
    from activity_position_requirements r
    left join credential_types ct on ct.id = r.credential_type_id
    where r.activity_position_id = p_activity_position_id and not r.disabled
  loop
    v_code := null;
    if v_req.requirement_type = 'qualification' then
      if not exists (
        select 1 from person_qualifications pq
        where pq.church_id = v_activity.church_id and pq.person_id = p_person_id
          and pq.qualification_id = v_req.qualification_id
          and (v_req.min_level is null or pq.level >= v_req.min_level)
      ) then
        v_code := 'missing_qualification';
      elsif v_req.requires_current_validity and not exists (
        select 1 from person_qualifications pq
        where pq.church_id = v_activity.church_id and pq.person_id = p_person_id
          and pq.qualification_id = v_req.qualification_id
          and (v_req.min_level is null or pq.level >= v_req.min_level)
          and (pq.expires_at is null or pq.expires_at > v_reference)
      ) then
        v_code := 'qualification_expired_at_activity';
      end if;
    elsif v_req.requirement_type = 'credential' then
      if not exists (
        select 1 from person_credentials pc
        where pc.church_id = v_activity.church_id and pc.person_id = p_person_id
          and pc.credential_type_id = v_req.credential_type_id and pc.status = 'valid'
      ) then
        v_code := 'missing_credential';
      elsif v_req.requires_current_validity and not exists (
        select 1 from person_credentials pc
        where pc.church_id = v_activity.church_id and pc.person_id = p_person_id
          and pc.credential_type_id = v_req.credential_type_id and pc.status = 'valid'
          and (pc.expires_at is null or pc.expires_at > v_reference)
      ) then
        v_code := 'credential_expired_at_activity';
      end if;
      if v_code is not null and coalesce(v_req.credential_sensitive, false) and not v_can_see_sensitive then
        v_code := 'requirement_not_met';
      end if;
    elsif v_req.requirement_type = 'minimum_level' then
      if not v_member_found or v_member.level < v_req.min_operational_level then
        v_code := 'insufficient_level';
      end if;
    end if;

    if v_code is not null then
      if v_req.strictness = 'required' then
        if not v_code = any (v_blocking) then v_blocking := array_append(v_blocking, v_code); end if;
      else
        v_code := v_code || '_recommended';
        if not v_code = any (v_warnings) then v_warnings := array_append(v_warnings, v_code); end if;
      end if;
    end if;
  end loop;

  -- Máximo del puesto (previstos).
  if v_position.max_people is not null
     and app.position_expected_count(p_activity_position_id, p_exclude) >= v_position.max_people then
    v_blocking := array_append(v_blocking, 'position_full');
  end if;

  -- Sede distinta (aviso).
  if v_activity.campus_id is not null and v_primary_campus is not null and v_primary_campus <> v_activity.campus_id then
    v_warnings := array_append(v_warnings, 'different_campus');
  end if;

  -- Solapes con otras asignaciones vigentes de la persona en la misma
  -- iglesia (nunca se consultan otras iglesias).
  if v_range is not null and exists (
    select 1
    from activity_assignments aa
    join activities a on a.id = aa.activity_id
    where aa.church_id = v_activity.church_id
      and aa.person_id = p_person_id
      and aa.status in ('proposed', 'pending', 'accepted')
      and not (aa.id = any (coalesce(p_exclude, '{}')))
      and aa.activity_position_id is distinct from p_activity_position_id
      and app.activity_time_range(a) && v_range
  ) then
    v_warnings := array_append(v_warnings, 'overlapping_assignment');
  end if;

  -- Disponibilidad (DI-01, Diogo): se consulta solo si existe la función
  -- acordada en el contrato. No se simula si no existe.
  if v_range is not null
     and to_regprocedure('app.person_unavailability(uuid,uuid[],timestamptz,timestamptz)') is not null then
    execute 'select exists (select 1 from app.person_unavailability($1, $2, $3, $4))'
      into v_code
      using v_activity.church_id, array[p_person_id], lower(v_range), upper(v_range);
    if v_code::boolean then
      v_warnings := array_append(v_warnings, 'unavailable');
    end if;
  end if;

  return query select v_blocking, v_warnings;
end;
$$;

-- app.activity_accepts_assignments (F4) filtra por lectura del usuario. Las
-- reglas internas necesitan la condición sin ese filtro.
create or replace function app.activity_accepts_assignments_unchecked(p_activity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce((
    select a.status in ('planned', 'published')
      and (a.schedule_kind = 'flexible' or a.ends_at > now())
    from activities a
    where a.id = p_activity_id
  ), false);
$$;

revoke all on function app.activity_accepts_assignments_unchecked(uuid) from public, anon, authenticated;
revoke all on function app.evaluate_assignment_eligibility(uuid, uuid, uuid[]) from public, anon, authenticated;

-- Lectura para la UI: solo quien gestiona asignaciones de ese puesto.
create or replace function public.preview_assignment_eligibility(p_activity_position_id uuid, p_person_id uuid)
returns table (blocking text[], warnings text[])
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_position activity_positions%rowtype;
  v_activity activities%rowtype;
begin
  select * into v_position from activity_positions where id = p_activity_position_id;
  select * into v_activity from activities where id = v_position.activity_id;
  if v_activity.id is null
     or not (v_activity.church_id = any (app.church_ids_for_user()))
     or not app.assignment_manage_cap(v_activity.church_id, v_activity.campus_id, v_activity.id, v_position.service_area_id) then
    raise exception 'No tienes permiso para gestionar asignaciones de este puesto.' using errcode = '42501';
  end if;
  return query select * from app.evaluate_assignment_eligibility(p_activity_position_id, p_person_id, '{}');
end;
$$;

revoke all on function public.preview_assignment_eligibility(uuid, uuid) from public, anon;
grant execute on function public.preview_assignment_eligibility(uuid, uuid) to authenticated;

-- ===========================================================================
-- Lectura mínima de la persona asignada
-- ===========================================================================
-- Se amplía el modelo de lectura de F4: además de su lógica original (ahora en
-- app.can_read_activity_row_base), una persona con asignación comunicada y
-- vigente (pending/accepted) puede leer la actividad, su estructura y el orden
-- del servicio. No obtiene notas administrativas (función aparte de F4) ni ve
-- al resto del equipo (política de activity_assignments, migración 0400).
create or replace function app.can_read_activity_row_base(
  p_activity_id uuid,
  p_church_id uuid,
  p_campus_id uuid,
  p_status activity_status,
  p_visibility activity_visibility,
  p_organizer_person_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not (p_church_id = any (app.church_ids_for_user())) then
    return false;
  end if;

  if p_status in ('published', 'completed', 'cancelled') then
    if p_visibility in ('members', 'public_future') then
      return true;
    end if;
    if p_visibility = 'leaders' and app.is_church_leader(p_church_id) then
      return true;
    end if;
  end if;

  if p_organizer_person_id is not null
     and p_organizer_person_id = app.current_person_id(p_church_id) then
    return true;
  end if;

  if app.activity_cap(p_church_id, p_campus_id, p_activity_id, 'activity.read')
     or app.activity_cap(p_church_id, p_campus_id, p_activity_id, 'activity.manage')
     or app.activity_cap(p_church_id, p_campus_id, p_activity_id, 'activity.publish')
     or app.activity_cap(p_church_id, p_campus_id, p_activity_id, 'activity.cancel')
     or app.activity_cap(p_church_id, p_campus_id, p_activity_id, 'activity.archive')
     or app.activity_cap(p_church_id, p_campus_id, p_activity_id, 'activity_plan.manage')
     or app.activity_cap(p_church_id, p_campus_id, p_activity_id, 'assignment.manage') then
    return true;
  end if;

  return exists (
    select 1
    from activity_service_areas asa
    where asa.activity_id = p_activity_id
      and asa.service_area_id is not null
      and (
        app.has_capability(p_church_id, 'activity.read', 'service_area', asa.service_area_id)
        or app.has_capability(p_church_id, 'activity_positions.manage', 'service_area', asa.service_area_id)
        or app.has_capability(p_church_id, 'assignment.manage', 'service_area', asa.service_area_id)
      )
  );
end;
$$;

create or replace function app.is_assigned_to_activity(p_activity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from activity_assignments aa
    where aa.activity_id = p_activity_id
      and aa.status in ('pending', 'accepted')
      and aa.person_id in (select app.current_person_ids())
  );
$$;

create or replace function app.can_read_activity_row(
  p_activity_id uuid,
  p_church_id uuid,
  p_campus_id uuid,
  p_status activity_status,
  p_visibility activity_visibility,
  p_organizer_person_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select app.can_read_activity_row_base(p_activity_id, p_church_id, p_campus_id, p_status, p_visibility, p_organizer_person_id)
    or (p_church_id = any (app.church_ids_for_user()) and app.is_assigned_to_activity(p_activity_id));
$$;

revoke all on function app.can_read_activity_row_base(uuid, uuid, uuid, activity_status, activity_visibility, uuid) from public, anon;
revoke all on function app.is_assigned_to_activity(uuid) from public, anon;
grant execute on function app.can_read_activity_row_base(uuid, uuid, uuid, activity_status, activity_visibility, uuid) to authenticated;
grant execute on function app.is_assigned_to_activity(uuid) to authenticated;
