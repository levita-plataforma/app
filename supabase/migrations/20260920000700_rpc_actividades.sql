-- Fase 4 · Operaciones de actividades (RPC).
-- Ver docs/adr/0017.
--
-- Patrón del repositorio: función `app.*` security definer que comprueba
-- pertenencia, capability/scope, módulo y reglas, y escribe la auditoría en la
-- misma transacción; wrapper `public.*` security invoker expuesto por la API.
-- Cada llamada RPC es una transacción: si algo falla, no queda nada a medias.
--
-- Códigos de error (SQLSTATE) que traduce la capa de aplicación:
--   42501 no autorizado · P0002 no encontrado · 22023/22P02/22007/22008/23514
--   validación · 23505 conflicto · PT409 datos cambiados (recargar)
--
-- No se usa 40001 (serialization_failure) para "datos cambiados": PostgREST
-- reintenta automáticamente las transacciones que fallan con 40001 y un error
-- determinista provocaría reintentos sin fin. PT409 responde HTTP 409.

-- ===========================================================================
-- Utilidades internas
-- ===========================================================================
create or replace function app.j_text(p jsonb, k text)
returns text
language sql
immutable
set search_path = pg_catalog, public
as $$ select nullif(btrim(p ->> k), ''); $$;

create or replace function app.assert_church_member(p_church_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_church_id is null or not (p_church_id = any (app.church_ids_for_user())) then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
end;
$$;

-- Carga y bloquea una actividad. Para usuarios de otra iglesia responde "no
-- existe" en lugar de "no autorizado", para no revelar identificadores.
create or replace function app.lock_activity(p_activity_id uuid)
returns activities
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_activity activities%rowtype;
begin
  select * into v_activity from activities a where a.id = p_activity_id for update;
  if not found or not (v_activity.church_id = any (app.church_ids_for_user())) then
    raise exception 'La actividad no existe.' using errcode = 'P0002';
  end if;
  return v_activity;
end;
$$;

create or replace function app.require_activity_cap(p_activity activities, p_capability text)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not app.activity_cap(p_activity.church_id, p_activity.campus_id, p_activity.id, p_capability) then
    raise exception 'No tienes permiso para realizar esta acción (%).', p_capability using errcode = '42501';
  end if;
end;
$$;

create or replace function app.require_serving_module(p_church_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not app.module_enabled(p_church_id, 'serving') then
    raise exception 'El módulo Servicios no está habilitado: no se pueden gestionar áreas ni puestos por actividad.'
      using errcode = '42501';
  end if;
end;
$$;

-- Parsea fecha u hora local "YYYY-MM-DD" o "YYYY-MM-DDTHH:MM".
create or replace function app.parse_local_timestamp(p_value text)
returns timestamp
language sql
immutable
set search_path = pg_catalog, public
as $$ select nullif(btrim(coalesce(p_value, '')), '')::timestamp; $$;

-- Inserta una fila de actividad (sin estructura). Uso interno.
create or replace function app.insert_activity_row(
  p_church_id uuid,
  p_type activity_type,
  p_title text,
  p_description text,
  p_campus_id uuid,
  p_schedule_kind activity_schedule_kind,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_timezone text,
  p_visibility activity_visibility,
  p_location_text text,
  p_organizer_person_id uuid,
  p_template_id uuid,
  p_series_id uuid,
  p_occurrence_date date,
  p_recurrence_rule text,
  p_creation_request_id uuid,
  p_duplicated_from uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
begin
  insert into activities (
    church_id, type, title, description, campus_id, schedule_kind, starts_at, ends_at,
    timezone, status, visibility, location_text, organizer_person_id, template_id,
    series_id, occurrence_date, recurrence_rule, creation_request_id,
    duplicated_from_activity_id, created_by
  ) values (
    p_church_id, p_type, btrim(p_title), nullif(btrim(coalesce(p_description, '')), ''), p_campus_id,
    p_schedule_kind, p_starts_at, p_ends_at, p_timezone, 'draft',
    coalesce(p_visibility, 'members'), nullif(btrim(coalesce(p_location_text, '')), ''),
    p_organizer_person_id, p_template_id, p_series_id, p_occurrence_date, p_recurrence_rule,
    p_creation_request_id, p_duplicated_from, auth.uid()
  )
  on conflict (series_id, occurrence_date) where series_id is not null do nothing
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function app.set_activity_admin_notes(p_activity activities, p_notes text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
begin
  if v_notes is null then
    delete from activity_admin_notes where activity_id = p_activity.id;
  else
    insert into activity_admin_notes (activity_id, church_id, notes, updated_by)
    values (p_activity.id, p_activity.church_id, v_notes, auth.uid())
    on conflict (activity_id) do update
      set notes = excluded.notes, updated_by = excluded.updated_by;
  end if;
end;
$$;

-- Copia requisitos del catálogo como heredados (snapshot inmutable).
create or replace function app.copy_catalog_requirements(p_activity_position_id uuid, p_service_position_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer;
begin
  insert into activity_position_requirements (
    church_id, activity_id, activity_position_id, origin, source_requirement_id,
    requirement_type, strictness, qualification_id, credential_type_id, min_level,
    min_operational_level, requires_current_validity, catalog_snapshot, created_by
  )
  select
    ap.church_id, ap.activity_id, ap.id, 'inherited', pr.id,
    pr.requirement_type, pr.strictness, pr.qualification_id, pr.credential_type_id, pr.min_level,
    pr.min_operational_level, pr.requires_current_validity,
    jsonb_build_object(
      'requirement_type', pr.requirement_type,
      'strictness', pr.strictness,
      'qualification_id', pr.qualification_id,
      'qualification_name', q.name,
      'credential_type_id', pr.credential_type_id,
      'credential_type_name', ct.name,
      'min_level', pr.min_level,
      'min_operational_level', pr.min_operational_level,
      'requires_current_validity', pr.requires_current_validity
    ),
    auth.uid()
  from activity_positions ap
  join position_requirements pr
    on pr.service_position_id = p_service_position_id and pr.church_id = ap.church_id
  left join qualifications q on q.id = pr.qualification_id
  left join credential_types ct on ct.id = pr.credential_type_id
  where ap.id = p_activity_position_id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Inserta un puesto de catálogo o ad-hoc en un área de actividad.
create or replace function app.insert_activity_position(
  p_area activity_service_areas,
  p_service_position_id uuid,
  p_input jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_catalog service_positions%rowtype;
  v_id uuid;
  v_sort integer;
begin
  if p_service_position_id is not null then
    select * into v_catalog from service_positions sp
    where sp.id = p_service_position_id and sp.church_id = p_area.church_id;
    if not found then
      raise exception 'El puesto no pertenece a esta iglesia.' using errcode = '22023';
    end if;
  elsif app.j_text(p_input, 'name') is null then
    raise exception 'Indica el nombre del puesto ad-hoc.' using errcode = '22023';
  end if;

  select coalesce(max(ap.sort_order) + 1, 0) into v_sort
  from activity_positions ap where ap.activity_service_area_id = p_area.id;

  insert into activity_positions (
    church_id, activity_id, activity_service_area_id, service_position_id, name, description,
    critical, min_people, max_people, requires_autonomous_person, notes, sort_order, created_by
  ) values (
    p_area.church_id, p_area.activity_id, p_area.id, p_service_position_id,
    coalesce(app.j_text(p_input, 'name'), v_catalog.name),
    case when p_input ? 'description' then app.j_text(p_input, 'description') else v_catalog.description end,
    coalesce((p_input ->> 'critical')::boolean, v_catalog.critical, false),
    coalesce((p_input ->> 'min_people')::smallint, v_catalog.min_people, 1),
    case when p_input ? 'max_people' then nullif(p_input ->> 'max_people', '')::smallint else v_catalog.max_people end,
    coalesce((p_input ->> 'requires_autonomous_person')::boolean, v_catalog.requires_autonomous_person, false),
    app.j_text(p_input, 'notes'),
    coalesce((p_input ->> 'sort_order')::integer, v_sort),
    auth.uid()
  )
  returning id into v_id;

  if p_service_position_id is not null then
    perform app.copy_catalog_requirements(v_id, p_service_position_id);
  end if;

  return v_id;
end;
$$;

-- Copia estructura de una plantilla a una actividad. Omite (y devuelve)
-- áreas/puestos no disponibles o de otra sede, en vez de fallar la creación.
create or replace function app.copy_template_structure(p_template_id uuid, p_activity_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_activity activities%rowtype;
  v_skipped jsonb := '[]'::jsonb;
  v_ta record;
  v_tp record;
  v_area activity_service_areas%rowtype;
  v_catalog_area service_areas%rowtype;
  v_catalog_position service_positions%rowtype;
  v_serving boolean;
begin
  select * into v_activity from activities where id = p_activity_id;
  v_serving := app.module_enabled(v_activity.church_id, 'serving');

  for v_ta in
    select ta.* from activity_template_areas ta
    where ta.template_id = p_template_id
    order by ta.sort_order, ta.created_at
  loop
    select * into v_catalog_area from service_areas sa where sa.id = v_ta.service_area_id;

    if not v_serving then
      v_skipped := v_skipped || jsonb_build_object('kind', 'area', 'name', v_catalog_area.name, 'reason', 'serving_module_disabled');
      continue;
    end if;
    if v_catalog_area.archived_at is not null or not v_catalog_area.active then
      v_skipped := v_skipped || jsonb_build_object('kind', 'area', 'name', v_catalog_area.name, 'reason', 'inactive');
      continue;
    end if;
    if v_activity.campus_id is not null and v_catalog_area.campus_id is not null
       and v_catalog_area.campus_id <> v_activity.campus_id then
      v_skipped := v_skipped || jsonb_build_object('kind', 'area', 'name', v_catalog_area.name, 'reason', 'campus_mismatch');
      continue;
    end if;

    insert into activity_service_areas (church_id, activity_id, service_area_id, area_name, requirement, notes, sort_order, created_by)
    values (v_activity.church_id, v_activity.id, v_ta.service_area_id, v_catalog_area.name, v_ta.requirement, v_ta.notes, v_ta.sort_order, auth.uid())
    returning * into v_area;

    for v_tp in
      select tp.* from activity_template_positions tp
      where tp.template_area_id = v_ta.id
      order by tp.sort_order, tp.created_at
    loop
      if v_tp.service_position_id is not null then
        select * into v_catalog_position from service_positions sp where sp.id = v_tp.service_position_id;
        if v_catalog_position.archived_at is not null or not v_catalog_position.active then
          v_skipped := v_skipped || jsonb_build_object('kind', 'position', 'name', v_catalog_position.name, 'reason', 'inactive');
          continue;
        end if;
        -- El puesto pudo cambiar de área en el catálogo después de guardar la plantilla.
        if v_catalog_position.service_area_id <> v_ta.service_area_id then
          v_skipped := v_skipped || jsonb_build_object('kind', 'position', 'name', v_catalog_position.name, 'reason', 'area_mismatch');
          continue;
        end if;
        if v_activity.campus_id is not null and v_catalog_position.campus_id is not null
           and v_catalog_position.campus_id <> v_activity.campus_id then
          v_skipped := v_skipped || jsonb_build_object('kind', 'position', 'name', v_catalog_position.name, 'reason', 'campus_mismatch');
          continue;
        end if;
      end if;

      perform app.insert_activity_position(
        v_area,
        v_tp.service_position_id,
        jsonb_build_object(
          'name', case when v_tp.service_position_id is null then v_tp.name end,
          'description', v_tp.description,
          'critical', v_tp.critical,
          'min_people', v_tp.min_people,
          'max_people', v_tp.max_people,
          'requires_autonomous_person', v_tp.requires_autonomous_person,
          'sort_order', v_tp.sort_order
        )
      );
    end loop;
  end loop;

  insert into activity_plan_items (
    church_id, activity_id, item_type, title, duration_minutes, start_offset_minutes,
    responsible_text, notes, sort_order, created_by
  )
  select v_activity.church_id, v_activity.id, tpi.item_type, tpi.title, tpi.duration_minutes,
         tpi.start_offset_minutes, tpi.responsible_text, tpi.notes,
         (row_number() over (order by tpi.sort_order) - 1)::integer, auth.uid()
  from activity_template_plan_items tpi
  where tpi.template_id = p_template_id;

  return v_skipped;
end;
$$;

-- Copia exacta de estructura entre actividades (duplicar / aplicar a serie):
-- conserva snapshots, overrides y requisitos desactivados. Los guards de
-- estructura confían en los snapshots de origen solo bajo este indicador de
-- transacción, que solo pueden fijar funciones internas.
create or replace function app.copy_activity_structure(p_source_id uuid, p_target_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_target activities%rowtype;
  v_area record;
  v_new_area uuid;
  v_position record;
  v_new_position uuid;
begin
  select * into v_target from activities where id = p_target_id;
  perform set_config('app.structure_copy', 'on', true);

  -- Sin módulo Servicios no se crean áreas ni puestos; el plan sí se copia.
  for v_area in
    select * from activity_service_areas
    where activity_id = p_source_id and app.module_enabled(v_target.church_id, 'serving')
    order by sort_order, created_at
  loop
    insert into activity_service_areas (
      church_id, activity_id, service_area_id, area_name, area_campus_id, requirement, notes, sort_order, created_by
    ) values (
      v_target.church_id, v_target.id, v_area.service_area_id, v_area.area_name, v_area.area_campus_id,
      v_area.requirement, v_area.notes, v_area.sort_order, auth.uid()
    )
    returning id into v_new_area;

    for v_position in
      select * from activity_positions where activity_service_area_id = v_area.id order by sort_order, created_at
    loop
      insert into activity_positions (
        church_id, activity_id, activity_service_area_id, service_position_id, name, description,
        critical, min_people, max_people, requires_autonomous_person, notes, sort_order,
        catalog_snapshot, snapshot_taken_at, created_by
      ) values (
        v_target.church_id, v_target.id, v_new_area, v_position.service_position_id, v_position.name,
        v_position.description, v_position.critical, v_position.min_people, v_position.max_people,
        v_position.requires_autonomous_person, v_position.notes, v_position.sort_order,
        v_position.catalog_snapshot, v_position.snapshot_taken_at, auth.uid()
      )
      returning id into v_new_position;

      insert into activity_position_requirements (
        church_id, activity_id, activity_position_id, origin, source_requirement_id, requirement_type,
        strictness, qualification_id, credential_type_id, min_level, min_operational_level,
        requires_current_validity, disabled, catalog_snapshot, created_by
      )
      select v_target.church_id, v_target.id, v_new_position, r.origin, r.source_requirement_id, r.requirement_type,
             r.strictness, r.qualification_id, r.credential_type_id, r.min_level, r.min_operational_level,
             r.requires_current_validity, r.disabled, r.catalog_snapshot, auth.uid()
      from activity_position_requirements r
      where r.activity_position_id = v_position.id;
    end loop;
  end loop;

  insert into activity_plan_items (
    church_id, activity_id, item_type, title, duration_minutes, start_offset_minutes,
    responsible_text, responsible_person_id, notes, sort_order, created_by
  )
  select v_target.church_id, v_target.id, pi.item_type, pi.title, pi.duration_minutes, pi.start_offset_minutes,
         pi.responsible_text,
         case when exists (
           select 1 from church_people cp
           where cp.church_id = v_target.church_id and cp.person_id = pi.responsible_person_id and cp.archived_at is null
         ) then pi.responsible_person_id end,
         pi.notes, pi.sort_order, auth.uid()
  from activity_plan_items pi
  where pi.activity_id = p_source_id;

  perform set_config('app.structure_copy', 'off', true);
end;
$$;

-- Editar individualmente la estructura o el plan de una ocurrencia la marca
-- como excepción de estructura (apply_activity_structure_to_series la respeta).
create or replace function app.mark_structure_modified(p_activity_id uuid)
returns void
language sql
security definer
set search_path = pg_catalog, public
as $$
  update activities set series_structure_modified = true
  where id = p_activity_id and series_id is not null and not series_structure_modified;
$$;

revoke all on function app.mark_structure_modified(uuid) from public, anon, authenticated;
revoke all on function app.j_text(jsonb, text) from public, anon;
revoke all on function app.assert_church_member(uuid) from public, anon;
revoke all on function app.lock_activity(uuid) from public, anon;
revoke all on function app.require_activity_cap(activities, text) from public, anon;
revoke all on function app.require_serving_module(uuid) from public, anon;
revoke all on function app.parse_local_timestamp(text) from public, anon;
revoke all on function app.insert_activity_row(uuid, activity_type, text, text, uuid, activity_schedule_kind, timestamptz, timestamptz, text, activity_visibility, text, uuid, uuid, uuid, date, text, uuid, uuid) from public, anon, authenticated;
revoke all on function app.set_activity_admin_notes(activities, text) from public, anon, authenticated;
revoke all on function app.copy_catalog_requirements(uuid, uuid) from public, anon, authenticated;
revoke all on function app.insert_activity_position(activity_service_areas, uuid, jsonb) from public, anon, authenticated;
revoke all on function app.copy_template_structure(uuid, uuid) from public, anon, authenticated;
revoke all on function app.copy_activity_structure(uuid, uuid) from public, anon, authenticated;
grant execute on function app.j_text(jsonb, text) to authenticated;
grant execute on function app.parse_local_timestamp(text) to authenticated;

-- ===========================================================================
-- Actividades
-- ===========================================================================

-- Resuelve starts_at/ends_at desde la entrada local y la zona.
create or replace function app.resolve_activity_schedule(
  p_kind activity_schedule_kind,
  p_type activity_type,
  p_input jsonb,
  p_timezone text,
  p_default_duration integer,
  out o_starts_at timestamptz,
  out o_ends_at timestamptz
)
language plpgsql
stable
set search_path = pg_catalog, public
as $$
declare
  v_local_start timestamp := app.parse_local_timestamp(p_input ->> 'local_start');
  v_local_end timestamp := app.parse_local_timestamp(p_input ->> 'local_end');
  v_duration integer := coalesce(nullif(p_input ->> 'duration_minutes', '')::integer, p_default_duration);
begin
  if p_kind = 'timed' then
    -- Con horario hace falta fecha y hora: una fecha sola no se interpreta
    -- como medianoche (la plantilla añade su hora por defecto antes de llegar).
    if v_local_start is null or char_length(btrim(p_input ->> 'local_start')) <= 10 then
      raise exception 'Indica la fecha y hora de inicio.' using errcode = '22023';
    end if;
    if v_local_end is not null and char_length(btrim(p_input ->> 'local_end')) <= 10 then
      raise exception 'Indica también la hora de fin.' using errcode = '22023';
    end if;
    o_starts_at := app.local_to_instant(v_local_start, p_timezone);
    if v_local_end is not null then
      o_ends_at := app.local_to_instant(v_local_end, p_timezone);
    elsif v_duration is not null then
      if v_duration < 1 then
        raise exception 'La duración debe ser de al menos 1 minuto.' using errcode = '22023';
      end if;
      o_ends_at := o_starts_at + make_interval(mins => v_duration);
    else
      raise exception 'Indica la hora de fin o la duración.' using errcode = '22023';
    end if;
    if o_ends_at <= o_starts_at then
      raise exception 'La hora de fin debe ser posterior a la de inicio.' using errcode = '22023';
    end if;
    if o_ends_at - o_starts_at > interval '62 days' then
      raise exception 'Una actividad no puede durar más de 62 días.' using errcode = '22023';
    end if;
  else
    if p_type <> 'task' then
      raise exception 'Solo las tareas pueden no tener hora fija.' using errcode = '22023';
    end if;
    o_starts_at := case when v_local_start is not null then app.local_to_instant(v_local_start, p_timezone) end;
    o_ends_at := case when v_local_end is not null then app.local_to_instant(v_local_end, p_timezone) end;
    if o_starts_at is not null and o_ends_at is not null and o_ends_at <= o_starts_at then
      raise exception 'El final de la ventana debe ser posterior al inicio.' using errcode = '22023';
    end if;
  end if;
end;
$$;

revoke all on function app.resolve_activity_schedule(activity_schedule_kind, activity_type, jsonb, text, integer) from public, anon;
grant execute on function app.resolve_activity_schedule(activity_schedule_kind, activity_type, jsonb, text, integer) to authenticated;

-- create_activity ------------------------------------------------------------
-- p_input: request_id, type, title, description, campus_id, schedule_kind,
-- local_start, local_end | duration_minutes, timezone, visibility,
-- location_text, organizer_person_id, admin_notes, template_id,
-- recurrence {frequency, interval, weekdays[], monthly_mode, month_day,
-- week_of_month, month_weekday, month_day_fallback, until_date | count}
create or replace function app.create_activity(p_church_id uuid, p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_request_id uuid := nullif(p_input ->> 'request_id', '')::uuid;
  v_template activity_templates%rowtype;
  v_template_id uuid := nullif(p_input ->> 'template_id', '')::uuid;
  v_type activity_type := nullif(p_input ->> 'type', '')::activity_type;
  v_campus_id uuid := nullif(p_input ->> 'campus_id', '')::uuid;
  v_kind activity_schedule_kind := nullif(p_input ->> 'schedule_kind', '')::activity_schedule_kind;
  v_title text := app.j_text(p_input, 'title');
  v_description text := app.j_text(p_input, 'description');
  v_visibility activity_visibility := nullif(p_input ->> 'visibility', '')::activity_visibility;
  v_location text := app.j_text(p_input, 'location_text');
  v_organizer uuid := nullif(p_input ->> 'organizer_person_id', '')::uuid;
  v_timezone text;
  v_starts timestamptz;
  v_ends timestamptz;
  v_activity_id uuid;
  v_series_id uuid;
  v_occurrences integer := 1;
  v_skipped jsonb := '[]'::jsonb;
  v_existing record;
  v_recurring boolean := jsonb_typeof(p_input -> 'recurrence') = 'object';
begin
  perform app.assert_church_member(p_church_id);

  if v_request_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('activity:' || p_church_id::text || ':' || v_request_id::text, 0));
    select a.id, a.series_id into v_existing
    from activities a
    where a.church_id = p_church_id and a.creation_request_id = v_request_id;
    if not found then
      select a.id, s.id as series_id into v_existing
      from activity_series s
      join activities a on a.series_id = s.id
      where s.church_id = p_church_id and s.creation_request_id = v_request_id
      order by a.occurrence_date
      limit 1;
    end if;
    if v_existing.id is not null then
      return jsonb_build_object(
        'activity_id', v_existing.id, 'series_id', v_existing.series_id,
        'occurrences', null, 'skipped', '[]'::jsonb, 'replayed', true
      );
    end if;
  end if;

  if v_template_id is not null then
    select * into v_template from activity_templates t
    where t.id = v_template_id and t.church_id = p_church_id
      and t.archived_at is null and t.active;
    if not found then
      raise exception 'La plantilla no existe o no está activa.' using errcode = '22023';
    end if;
    v_type := coalesce(v_type, v_template.type);
    if not (p_input ? 'campus_id') then
      v_campus_id := v_template.campus_id;
    end if;
    v_kind := coalesce(v_kind, v_template.schedule_kind);
    -- Solo fecha ("YYYY-MM-DD") + hora por defecto de la plantilla.
    if v_template.default_local_start_time is not null
       and char_length(btrim(coalesce(p_input ->> 'local_start', ''))) = 10 then
      p_input := jsonb_set(p_input, '{local_start}',
        to_jsonb((p_input ->> 'local_start') || 'T' || to_char(v_template.default_local_start_time, 'HH24:MI')));
    end if;
    v_title := coalesce(v_title, v_template.default_title, v_template.name);
    v_description := coalesce(v_description, v_template.description);
    v_visibility := coalesce(v_visibility, v_template.visibility);
    v_location := coalesce(v_location, v_template.location_text);
  end if;

  if v_type is null then
    raise exception 'Selecciona el tipo de actividad.' using errcode = '22023';
  end if;
  if v_title is null then
    raise exception 'El título es obligatorio.' using errcode = '22023';
  end if;
  v_kind := coalesce(v_kind, 'timed');

  if v_campus_id is null then
    if not app.has_capability(p_church_id, 'activity.create') then
      raise exception 'No tienes permiso para crear actividades de toda la iglesia.' using errcode = '42501';
    end if;
  else
    if not exists (
      select 1 from campuses c
      where c.id = v_campus_id and c.church_id = p_church_id and c.archived_at is null
    ) then
      raise exception 'La sede no pertenece a esta iglesia.' using errcode = '22023';
    end if;
    if not app.has_capability(p_church_id, 'activity.create', 'campus', v_campus_id) then
      raise exception 'No tienes permiso para crear actividades en esta sede.' using errcode = '42501';
    end if;
  end if;

  if v_template_id is not null and v_template.campus_id is not null
     and v_campus_id is distinct from v_template.campus_id then
    raise exception 'La plantilla es de otra sede.' using errcode = '22023';
  end if;

  v_timezone := app.resolve_activity_timezone(p_church_id, v_campus_id, p_input ->> 'timezone');

  select o_starts_at, o_ends_at into v_starts, v_ends
  from app.resolve_activity_schedule(v_kind, v_type, p_input, v_timezone, v_template.default_duration_minutes);

  if v_recurring then
    if v_kind <> 'timed' then
      raise exception 'Solo las actividades con horario pueden repetirse.' using errcode = '22023';
    end if;

    v_series_id := app.create_activity_series_row(
      p_church_id, v_type, v_title, p_input -> 'recurrence',
      (app.parse_local_timestamp(p_input ->> 'local_start'))::date,
      (app.parse_local_timestamp(p_input ->> 'local_start'))::time,
      (extract(epoch from (v_ends - v_starts)) / 60)::integer,
      v_timezone, v_request_id
    );

    v_occurrences := app.expand_activity_series(
      v_series_id,
      jsonb_build_object(
        'description', v_description, 'campus_id', v_campus_id, 'visibility', v_visibility,
        'location_text', v_location, 'organizer_person_id', v_organizer,
        'admin_notes', app.j_text(p_input, 'admin_notes')
      ),
      v_template_id, null, null
    );

    select a.id into v_activity_id from activities a
    where a.series_id = v_series_id order by a.occurrence_date limit 1;

    if v_template_id is not null then
      -- Los omitidos son los mismos en todas las ocurrencias: se calculan una vez.
      select coalesce(jsonb_agg(distinct x), '[]'::jsonb) into v_skipped
      from (
        select jsonb_array_elements(app.template_structure_preview_skips(v_template_id, v_campus_id, p_church_id)) as x
      ) s;
    end if;
  else
    v_activity_id := app.insert_activity_row(
      p_church_id, v_type, v_title, v_description, v_campus_id, v_kind, v_starts, v_ends, v_timezone,
      v_visibility, v_location, v_organizer, v_template_id, null, null, null, v_request_id, null
    );

    if app.j_text(p_input, 'admin_notes') is not null then
      perform app.set_activity_admin_notes((select a from activities a where a.id = v_activity_id), p_input ->> 'admin_notes');
    end if;

    if v_template_id is not null then
      v_skipped := app.copy_template_structure(v_template_id, v_activity_id);
    end if;
  end if;

  perform app.write_audit_log(
    p_church_id, 'activity.created', 'activities', v_activity_id,
    jsonb_build_object(
      'type', v_type, 'campus_id', v_campus_id, 'schedule_kind', v_kind,
      'template_id', v_template_id, 'series_id', v_series_id, 'occurrences', v_occurrences
    )
  );

  return jsonb_build_object(
    'activity_id', v_activity_id, 'series_id', v_series_id, 'occurrences', v_occurrences,
    'skipped', v_skipped, 'replayed', false
  );
end;
$$;

-- Omisiones que produciría una plantilla para una sede (sin escribir nada).
create or replace function app.template_structure_preview_skips(p_template_id uuid, p_campus_id uuid, p_church_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(jsonb_agg(x), '[]'::jsonb)
  from (
    select jsonb_build_object('kind', 'area', 'name', sa.name,
      'reason', case
        when not app.module_enabled(p_church_id, 'serving') then 'serving_module_disabled'
        when sa.archived_at is not null or not sa.active then 'inactive'
        else 'campus_mismatch' end) as x
    from activity_template_areas ta
    join service_areas sa on sa.id = ta.service_area_id
    where ta.template_id = p_template_id
      and (
        not app.module_enabled(p_church_id, 'serving')
        or sa.archived_at is not null or not sa.active
        or (p_campus_id is not null and sa.campus_id is not null and sa.campus_id <> p_campus_id)
      )
    union all
    select jsonb_build_object('kind', 'position', 'name', sp.name,
      'reason', case when sp.archived_at is not null or not sp.active then 'inactive'
                     when sp.service_area_id <> ta.service_area_id then 'area_mismatch'
                     else 'campus_mismatch' end)
    from activity_template_positions tp
    join activity_template_areas ta on ta.id = tp.template_area_id
    join service_areas sa on sa.id = ta.service_area_id
    join service_positions sp on sp.id = tp.service_position_id
    where tp.template_id = p_template_id
      and app.module_enabled(p_church_id, 'serving')
      and sa.archived_at is null and sa.active
      and (p_campus_id is null or sa.campus_id is null or sa.campus_id = p_campus_id)
      and (
        sp.archived_at is not null or not sp.active
        or sp.service_area_id <> ta.service_area_id
        or (p_campus_id is not null and sp.campus_id is not null and sp.campus_id <> p_campus_id)
      )
  ) s;
$$;

revoke all on function app.template_structure_preview_skips(uuid, uuid, uuid) from public, anon, authenticated;

-- update_activity (una ocurrencia o actividad puntual) ------------------------
-- p_input admite: title, description, type, visibility, location_text,
-- organizer_person_id, campus_id, schedule_kind, local_start, local_end,
-- duration_minutes, timezone, admin_notes. Solo se cambian las claves presentes.
create or replace function app.update_activity(p_activity_id uuid, p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_activity activities%rowtype := app.lock_activity(p_activity_id);
  v_new activities%rowtype;
  v_schedule_keys text[] := array['schedule_kind', 'local_start', 'local_end', 'duration_minutes', 'timezone'];
  v_fields text[];
  v_duration integer;
  v_content_changed boolean;
begin
  perform app.require_activity_cap(v_activity, 'activity.manage');
  v_new := v_activity;

  select array_agg(k order by k) into v_fields from jsonb_object_keys(p_input) k;

  if p_input ? 'title' then
    v_new.title := coalesce(app.j_text(p_input, 'title'), '');
    if v_new.title = '' then
      raise exception 'El título es obligatorio.' using errcode = '22023';
    end if;
  end if;
  if p_input ? 'description' then v_new.description := app.j_text(p_input, 'description'); end if;
  if p_input ? 'type' then v_new.type := (p_input ->> 'type')::activity_type; end if;
  if p_input ? 'visibility' then v_new.visibility := (p_input ->> 'visibility')::activity_visibility; end if;
  if p_input ? 'location_text' then v_new.location_text := app.j_text(p_input, 'location_text'); end if;
  if p_input ? 'organizer_person_id' then
    v_new.organizer_person_id := nullif(p_input ->> 'organizer_person_id', '')::uuid;
  end if;

  if p_input ? 'campus_id' then
    v_new.campus_id := nullif(p_input ->> 'campus_id', '')::uuid;
    if v_new.campus_id is distinct from v_activity.campus_id then
      if v_new.campus_id is not null and not exists (
        select 1 from campuses c where c.id = v_new.campus_id and c.church_id = v_activity.church_id and c.archived_at is null
      ) then
        raise exception 'La sede no pertenece a esta iglesia.' using errcode = '22023';
      end if;
      -- Mover de sede exige gestionar actividades en el destino con scope de
      -- iglesia o de esa sede (un scope de actividad no basta).
      if not (
        (v_new.campus_id is null and app.has_capability(v_activity.church_id, 'activity.manage'))
        or (v_new.campus_id is not null and app.has_capability(v_activity.church_id, 'activity.manage', 'campus', v_new.campus_id))
      ) then
        raise exception 'No tienes permiso para mover la actividad a esa sede.' using errcode = '42501';
      end if;
    end if;
  end if;

  if p_input ?| v_schedule_keys then
    v_new.schedule_kind := coalesce(nullif(p_input ->> 'schedule_kind', '')::activity_schedule_kind, v_activity.schedule_kind);
    v_new.timezone := case when p_input ? 'timezone'
      then app.resolve_activity_timezone(v_activity.church_id, v_new.campus_id, p_input ->> 'timezone')
      else v_activity.timezone end;
    v_duration := case when v_activity.starts_at is not null and v_activity.ends_at is not null
      then (extract(epoch from (v_activity.ends_at - v_activity.starts_at)) / 60)::integer end;
    select o_starts_at, o_ends_at into v_new.starts_at, v_new.ends_at
    from app.resolve_activity_schedule(v_new.schedule_kind, v_new.type, p_input, v_new.timezone, v_duration);
  elsif p_input ? 'type' and v_new.schedule_kind = 'flexible' and v_new.type <> 'task' then
    raise exception 'Solo las tareas pueden no tener hora fija.' using errcode = '22023';
  end if;

  v_content_changed := row(v_new.title, v_new.description, v_new.type, v_new.visibility, v_new.location_text,
      v_new.organizer_person_id, v_new.campus_id, v_new.schedule_kind, v_new.starts_at, v_new.ends_at, v_new.timezone)
    is distinct from row(v_activity.title, v_activity.description, v_activity.type, v_activity.visibility,
      v_activity.location_text, v_activity.organizer_person_id, v_activity.campus_id, v_activity.schedule_kind,
      v_activity.starts_at, v_activity.ends_at, v_activity.timezone);

  if v_content_changed then
    update activities set
      title = v_new.title,
      description = v_new.description,
      type = v_new.type,
      visibility = v_new.visibility,
      location_text = v_new.location_text,
      organizer_person_id = v_new.organizer_person_id,
      campus_id = v_new.campus_id,
      schedule_kind = v_new.schedule_kind,
      starts_at = v_new.starts_at,
      ends_at = v_new.ends_at,
      timezone = v_new.timezone,
      -- Editar una ocurrencia individualmente la convierte en excepción.
      series_modified = series_modified or series_id is not null
    where id = v_activity.id;
  end if;

  if p_input ? 'admin_notes' then
    perform app.set_activity_admin_notes(v_activity, p_input ->> 'admin_notes');
  end if;

  if v_content_changed or p_input ? 'admin_notes' then
    perform app.write_audit_log(
      v_activity.church_id, 'activity.updated', 'activities', v_activity.id,
      jsonb_build_object('fields', to_jsonb(v_fields), 'scope', 'this')
    );
  end if;

  return jsonb_build_object('updated', case when v_content_changed or p_input ? 'admin_notes' then 1 else 0 end);
end;
$$;

-- transition_activity_status ------------------------------------------------
create or replace function app.transition_activity_status(
  p_activity_id uuid,
  p_to activity_status,
  p_reason text default null
)
returns activity_status
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_activity activities%rowtype := app.lock_activity(p_activity_id);
  v_action text;
begin
  if p_to = v_activity.status then
    return v_activity.status;
  end if;

  if p_reason is not null and char_length(p_reason) > 500 then
    raise exception 'El motivo no puede superar 500 caracteres.' using errcode = '22023';
  end if;

  -- El trigger valida la matriz, la capability del ámbito y la estructura.
  update activities
  set status = p_to,
      cancellation_reason = case when p_to = 'cancelled' and v_activity.status <> 'archived'
        then p_reason else cancellation_reason end
  where id = v_activity.id;

  v_action := case
    when v_activity.status = 'archived' then 'activity.unarchived'
    when p_to = 'published' and v_activity.status in ('draft', 'planned') then 'activity.published'
    when p_to = 'cancelled' then 'activity.cancelled'
    when p_to = 'completed' then 'activity.completed'
    when p_to = 'archived' then 'activity.archived'
    else 'activity.status_changed'
  end;

  perform app.write_audit_log(
    v_activity.church_id, v_action, 'activities', v_activity.id,
    jsonb_build_object(
      'from', v_activity.status, 'to', p_to,
      'has_reason', p_to = 'cancelled' and nullif(btrim(coalesce(p_reason, '')), '') is not null
    )
  );

  return p_to;
end;
$$;

-- duplicate_activity ------------------------------------------------------------
-- p_input: request_id, local_start (nuevo inicio local opcional), title.
-- Devuelve un borrador con nuevos IDs; no copia estado, auditoría, cancelación,
-- publicación ni pertenencia a la serie original.
create or replace function app.duplicate_activity(p_activity_id uuid, p_input jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_source activities%rowtype;
  v_request_id uuid := nullif(p_input ->> 'request_id', '')::uuid;
  v_existing uuid;
  v_local_start timestamp := app.parse_local_timestamp(p_input ->> 'local_start');
  v_starts timestamptz;
  v_ends timestamptz;
  v_new_id uuid;
  v_organizer uuid;
  v_notes text;
begin
  select * into v_source from activities a where a.id = p_activity_id;
  if not found or not app.can_read_activity(p_activity_id) then
    raise exception 'La actividad no existe.' using errcode = 'P0002';
  end if;

  if v_source.campus_id is null then
    if not app.has_capability(v_source.church_id, 'activity.create') then
      raise exception 'No tienes permiso para crear actividades de toda la iglesia.' using errcode = '42501';
    end if;
  elsif not app.has_capability(v_source.church_id, 'activity.create', 'campus', v_source.campus_id) then
    raise exception 'No tienes permiso para crear actividades en esta sede.' using errcode = '42501';
  end if;

  if v_request_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('activity:' || v_source.church_id::text || ':' || v_request_id::text, 0));
    select a.id into v_existing from activities a
    where a.church_id = v_source.church_id and a.creation_request_id = v_request_id;
    if found then
      return jsonb_build_object('activity_id', v_existing, 'replayed', true);
    end if;
  end if;

  v_starts := v_source.starts_at;
  v_ends := v_source.ends_at;
  if v_local_start is not null then
    v_starts := app.local_to_instant(v_local_start, v_source.timezone);
    v_ends := case when v_source.ends_at is not null and v_source.starts_at is not null
      then v_starts + (v_source.ends_at - v_source.starts_at) end;
  end if;

  select cp.person_id into v_organizer from church_people cp
  where cp.church_id = v_source.church_id and cp.person_id = v_source.organizer_person_id and cp.archived_at is null;

  v_new_id := app.insert_activity_row(
    v_source.church_id, v_source.type, coalesce(app.j_text(p_input, 'title'), v_source.title),
    v_source.description, v_source.campus_id, v_source.schedule_kind, v_starts, v_ends, v_source.timezone,
    v_source.visibility, v_source.location_text, v_organizer, v_source.template_id,
    null, null, null, v_request_id, v_source.id
  );

  perform app.copy_activity_structure(v_source.id, v_new_id);

  if app.can_read_activity_admin_notes(v_source.id) then
    select n.notes into v_notes from activity_admin_notes n where n.activity_id = v_source.id;
    if v_notes is not null then
      perform app.set_activity_admin_notes((select a from activities a where a.id = v_new_id), v_notes);
    end if;
  end if;

  perform app.write_audit_log(
    v_source.church_id, 'activity.duplicated', 'activities', v_new_id,
    jsonb_build_object('source_activity_id', v_source.id)
  );

  return jsonb_build_object('activity_id', v_new_id, 'replayed', false);
end;
$$;

-- ===========================================================================
-- Estructura: áreas, puestos y requisitos
-- ===========================================================================
create or replace function app.add_activity_area(
  p_activity_id uuid,
  p_service_area_id uuid,
  p_requirement activity_area_requirement default 'required',
  p_notes text default null,
  p_include_positions boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_activity activities%rowtype := app.lock_activity(p_activity_id);
  v_area activity_service_areas%rowtype;
  v_position record;
  v_added integer := 0;
  v_skipped integer := 0;
  v_sort integer;
begin
  perform app.require_activity_cap(v_activity, 'activity.manage');
  perform app.require_serving_module(v_activity.church_id);
  perform app.mark_structure_modified(v_activity.id);

  if exists (
    select 1 from activity_service_areas asa
    where asa.activity_id = v_activity.id and asa.service_area_id = p_service_area_id
  ) then
    raise exception 'El área ya está añadida a esta actividad.' using errcode = '23505';
  end if;

  select coalesce(max(asa.sort_order) + 1, 0) into v_sort
  from activity_service_areas asa where asa.activity_id = v_activity.id;

  insert into activity_service_areas (church_id, activity_id, service_area_id, area_name, requirement, notes, sort_order, created_by)
  values (v_activity.church_id, v_activity.id, p_service_area_id, '', coalesce(p_requirement, 'required'),
          nullif(btrim(coalesce(p_notes, '')), ''), v_sort, auth.uid())
  returning * into v_area;

  if coalesce(p_include_positions, true) then
    for v_position in
      select sp.id, sp.campus_id from service_positions sp
      where sp.church_id = v_activity.church_id
        and sp.service_area_id = p_service_area_id
        and sp.archived_at is null and sp.active
      order by sp.sort_order, sp.name
    loop
      if v_activity.campus_id is not null and v_position.campus_id is not null
         and v_position.campus_id <> v_activity.campus_id then
        v_skipped := v_skipped + 1;
        continue;
      end if;
      perform app.insert_activity_position(v_area, v_position.id, '{}'::jsonb);
      v_added := v_added + 1;
    end loop;
  end if;

  perform app.write_audit_log(
    v_activity.church_id, 'activity.area_added', 'activities', v_activity.id,
    jsonb_build_object('activity_service_area_id', v_area.id, 'service_area_id', p_service_area_id,
      'requirement', v_area.requirement, 'positions_added', v_added, 'positions_skipped_campus', v_skipped)
  );

  return jsonb_build_object('activity_service_area_id', v_area.id, 'positions_added', v_added, 'positions_skipped', v_skipped);
end;
$$;

create or replace function app.update_activity_area(p_activity_service_area_id uuid, p_input jsonb)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_area activity_service_areas%rowtype;
  v_activity activities%rowtype;
begin
  select * into v_area from activity_service_areas where id = p_activity_service_area_id;
  if not found then
    raise exception 'El área de la actividad no existe.' using errcode = 'P0002';
  end if;
  v_activity := app.lock_activity(v_area.activity_id);
  perform app.require_activity_cap(v_activity, 'activity.manage');
  perform app.require_serving_module(v_activity.church_id);
  perform app.mark_structure_modified(v_activity.id);

  update activity_service_areas set
    requirement = case when p_input ? 'requirement' then (p_input ->> 'requirement')::activity_area_requirement else requirement end,
    notes = case when p_input ? 'notes' then app.j_text(p_input, 'notes') else notes end,
    sort_order = case when p_input ? 'sort_order' then (p_input ->> 'sort_order')::integer else sort_order end
  where id = v_area.id;

  perform app.write_audit_log(
    v_activity.church_id, 'activity.area_updated', 'activities', v_activity.id,
    jsonb_build_object('activity_service_area_id', v_area.id, 'fields', (select jsonb_agg(k) from jsonb_object_keys(p_input) k))
  );
end;
$$;

create or replace function app.remove_activity_area(p_activity_service_area_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_area activity_service_areas%rowtype;
  v_activity activities%rowtype;
begin
  select * into v_area from activity_service_areas where id = p_activity_service_area_id;
  if not found then
    raise exception 'El área de la actividad no existe.' using errcode = 'P0002';
  end if;
  v_activity := app.lock_activity(v_area.activity_id);
  perform app.require_activity_cap(v_activity, 'activity.manage');
  perform app.require_serving_module(v_activity.church_id);
  perform app.mark_structure_modified(v_activity.id);

  delete from activity_service_areas where id = v_area.id;

  perform app.write_audit_log(
    v_activity.church_id, 'activity.area_removed', 'activities', v_activity.id,
    jsonb_build_object('activity_service_area_id', v_area.id, 'service_area_id', v_area.service_area_id)
  );
end;
$$;

-- Área de actividad + actividad bloqueada + comprobación de ámbito de puestos.
create or replace function app.lock_activity_area_for_positions(p_activity_service_area_id uuid)
returns activity_service_areas
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_area activity_service_areas%rowtype;
  v_activity activities%rowtype;
begin
  select * into v_area from activity_service_areas where id = p_activity_service_area_id;
  if not found then
    raise exception 'El área de la actividad no existe.' using errcode = 'P0002';
  end if;
  v_activity := app.lock_activity(v_area.activity_id);
  if not app.activity_area_positions_cap(v_activity.church_id, v_activity.campus_id, v_activity.id, v_area.service_area_id) then
    raise exception 'No tienes permiso para gestionar los puestos de esta área.' using errcode = '42501';
  end if;
  perform app.require_serving_module(v_activity.church_id);
  perform app.mark_structure_modified(v_activity.id);
  return v_area;
end;
$$;

create or replace function app.add_activity_position(p_activity_service_area_id uuid, p_input jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_area activity_service_areas%rowtype := app.lock_activity_area_for_positions(p_activity_service_area_id);
  v_service_position_id uuid := nullif(p_input ->> 'service_position_id', '')::uuid;
  v_id uuid;
begin
  if v_service_position_id is not null and exists (
    select 1 from activity_positions ap
    where ap.activity_id = v_area.activity_id and ap.service_position_id = v_service_position_id
  ) then
    raise exception 'Ese puesto ya está en la actividad: ajusta sus mínimos y máximos.' using errcode = '23505';
  end if;

  v_id := app.insert_activity_position(v_area, v_service_position_id, p_input);

  perform app.write_audit_log(
    v_area.church_id, 'activity.position_added', 'activities', v_area.activity_id,
    jsonb_build_object('activity_position_id', v_id, 'service_position_id', v_service_position_id,
      'ad_hoc', v_service_position_id is null)
  );
  return v_id;
end;
$$;

create or replace function app.update_activity_position(p_activity_position_id uuid, p_input jsonb)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_position activity_positions%rowtype;
begin
  select * into v_position from activity_positions where id = p_activity_position_id;
  if not found then
    raise exception 'El puesto de la actividad no existe.' using errcode = 'P0002';
  end if;
  perform app.lock_activity_area_for_positions(v_position.activity_service_area_id);

  update activity_positions set
    name = case when p_input ? 'name' then coalesce(app.j_text(p_input, 'name'), '') else name end,
    description = case when p_input ? 'description' then app.j_text(p_input, 'description') else description end,
    critical = case when p_input ? 'critical' then (p_input ->> 'critical')::boolean else critical end,
    min_people = case when p_input ? 'min_people' then (p_input ->> 'min_people')::smallint else min_people end,
    max_people = case when p_input ? 'max_people' then nullif(p_input ->> 'max_people', '')::smallint else max_people end,
    requires_autonomous_person = case when p_input ? 'requires_autonomous_person'
      then (p_input ->> 'requires_autonomous_person')::boolean else requires_autonomous_person end,
    notes = case when p_input ? 'notes' then app.j_text(p_input, 'notes') else notes end,
    sort_order = case when p_input ? 'sort_order' then (p_input ->> 'sort_order')::integer else sort_order end
  where id = v_position.id;

  perform app.write_audit_log(
    v_position.church_id, 'activity.position_updated', 'activities', v_position.activity_id,
    jsonb_build_object('activity_position_id', v_position.id, 'fields', (select jsonb_agg(k) from jsonb_object_keys(p_input) k))
  );
end;
$$;

create or replace function app.remove_activity_position(p_activity_position_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_position activity_positions%rowtype;
begin
  select * into v_position from activity_positions where id = p_activity_position_id;
  if not found then
    raise exception 'El puesto de la actividad no existe.' using errcode = 'P0002';
  end if;
  perform app.lock_activity_area_for_positions(v_position.activity_service_area_id);

  delete from activity_positions where id = v_position.id;

  perform app.write_audit_log(
    v_position.church_id, 'activity.position_removed', 'activities', v_position.activity_id,
    jsonb_build_object('activity_position_id', v_position.id, 'service_position_id', v_position.service_position_id)
  );
end;
$$;

-- Requisito por actividad: p_requirement_id null = añadir; si no, override.
-- p_input: requirement_type, strictness, qualification_id, credential_type_id,
-- min_level, min_operational_level, requires_current_validity, disabled.
create or replace function app.save_activity_position_requirement(
  p_activity_position_id uuid,
  p_requirement_id uuid,
  p_input jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_position activity_positions%rowtype;
  v_requirement activity_position_requirements%rowtype;
  v_id uuid;
begin
  select * into v_position from activity_positions where id = p_activity_position_id;
  if not found then
    raise exception 'El puesto de la actividad no existe.' using errcode = 'P0002';
  end if;
  perform app.lock_activity_area_for_positions(v_position.activity_service_area_id);

  if p_requirement_id is null then
    insert into activity_position_requirements (
      church_id, activity_id, activity_position_id, origin, requirement_type, strictness,
      qualification_id, credential_type_id, min_level, min_operational_level, requires_current_validity, created_by
    ) values (
      v_position.church_id, v_position.activity_id, v_position.id, 'added',
      (p_input ->> 'requirement_type')::position_requirement_type,
      coalesce(nullif(p_input ->> 'strictness', '')::position_requirement_strictness, 'required'),
      nullif(p_input ->> 'qualification_id', '')::uuid,
      nullif(p_input ->> 'credential_type_id', '')::uuid,
      nullif(p_input ->> 'min_level', '')::qualification_level,
      nullif(p_input ->> 'min_operational_level', '')::service_operational_level,
      coalesce((p_input ->> 'requires_current_validity')::boolean, true),
      auth.uid()
    )
    returning id into v_id;
  else
    select * into v_requirement from activity_position_requirements r
    where r.id = p_requirement_id and r.activity_position_id = v_position.id;
    if not found then
      raise exception 'El requisito no existe en este puesto.' using errcode = 'P0002';
    end if;
    update activity_position_requirements set
      strictness = case when p_input ? 'strictness' then (p_input ->> 'strictness')::position_requirement_strictness else strictness end,
      min_level = case when p_input ? 'min_level' then nullif(p_input ->> 'min_level', '')::qualification_level else min_level end,
      min_operational_level = case when p_input ? 'min_operational_level'
        then nullif(p_input ->> 'min_operational_level', '')::service_operational_level else min_operational_level end,
      requires_current_validity = case when p_input ? 'requires_current_validity'
        then (p_input ->> 'requires_current_validity')::boolean else requires_current_validity end,
      disabled = case when p_input ? 'disabled' then (p_input ->> 'disabled')::boolean else disabled end
    where id = v_requirement.id;
    v_id := v_requirement.id;
  end if;

  perform app.write_audit_log(
    v_position.church_id, 'activity.position_updated', 'activities', v_position.activity_id,
    jsonb_build_object('activity_position_id', v_position.id, 'requirement_id', v_id,
      'requirement_change', case when p_requirement_id is null then 'added' else 'override' end)
  );
  return v_id;
end;
$$;

create or replace function app.remove_activity_position_requirement(p_requirement_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_requirement activity_position_requirements%rowtype;
  v_position activity_positions%rowtype;
begin
  select * into v_requirement from activity_position_requirements where id = p_requirement_id;
  if not found then
    raise exception 'El requisito no existe.' using errcode = 'P0002';
  end if;
  select * into v_position from activity_positions where id = v_requirement.activity_position_id;
  perform app.lock_activity_area_for_positions(v_position.activity_service_area_id);

  delete from activity_position_requirements where id = v_requirement.id;

  perform app.write_audit_log(
    v_position.church_id, 'activity.position_updated', 'activities', v_position.activity_id,
    jsonb_build_object('activity_position_id', v_position.id, 'requirement_id', v_requirement.id, 'requirement_change', 'removed')
  );
end;
$$;

-- ===========================================================================
-- Planning
-- ===========================================================================
create or replace function app.lock_activity_for_plan(p_activity_id uuid)
returns activities
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_activity activities%rowtype := app.lock_activity(p_activity_id);
begin
  if not (app.activity_cap(v_activity.church_id, v_activity.campus_id, v_activity.id, 'activity_plan.manage')
          or app.activity_cap(v_activity.church_id, v_activity.campus_id, v_activity.id, 'activity.manage')) then
    raise exception 'No tienes permiso para gestionar el orden del servicio.' using errcode = '42501';
  end if;
  perform app.mark_structure_modified(v_activity.id);
  return v_activity;
end;
$$;

-- p_input: item_type, title, duration_minutes, start_offset_minutes,
-- responsible_text, responsible_person_id, notes, position (índice opcional).
create or replace function app.add_activity_plan_item(p_activity_id uuid, p_input jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_activity activities%rowtype := app.lock_activity_for_plan(p_activity_id);
  v_id uuid;
  v_count integer;
  v_position integer := nullif(p_input ->> 'position', '')::integer;
begin
  select count(*) into v_count from activity_plan_items where activity_id = v_activity.id;
  if v_count >= 200 then
    raise exception 'El orden del servicio admite como máximo 200 bloques.' using errcode = '22023';
  end if;
  v_position := least(greatest(coalesce(v_position, v_count), 0), v_count);

  set constraints activity_plan_items_order_unique deferred;
  update activity_plan_items set sort_order = sort_order + 1
  where activity_id = v_activity.id and sort_order >= v_position;

  insert into activity_plan_items (
    church_id, activity_id, item_type, title, duration_minutes, start_offset_minutes,
    responsible_text, responsible_person_id, notes, sort_order, created_by
  ) values (
    v_activity.church_id, v_activity.id,
    coalesce(nullif(p_input ->> 'item_type', '')::activity_plan_item_type, 'custom'),
    coalesce(app.j_text(p_input, 'title'), ''),
    nullif(p_input ->> 'duration_minutes', '')::integer,
    nullif(p_input ->> 'start_offset_minutes', '')::integer,
    app.j_text(p_input, 'responsible_text'),
    nullif(p_input ->> 'responsible_person_id', '')::uuid,
    app.j_text(p_input, 'notes'),
    v_position,
    auth.uid()
  )
  returning id into v_id;
  set constraints activity_plan_items_order_unique immediate;

  perform app.write_audit_log(
    v_activity.church_id, 'activity.plan_item_added', 'activities', v_activity.id,
    jsonb_build_object('plan_item_id', v_id, 'item_type', coalesce(p_input ->> 'item_type', 'custom'))
  );
  return v_id;
end;
$$;

create or replace function app.update_activity_plan_item(p_plan_item_id uuid, p_input jsonb)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_item activity_plan_items%rowtype;
  v_activity activities%rowtype;
begin
  select * into v_item from activity_plan_items where id = p_plan_item_id;
  if not found then
    raise exception 'El bloque no existe.' using errcode = 'P0002';
  end if;
  v_activity := app.lock_activity_for_plan(v_item.activity_id);

  update activity_plan_items set
    item_type = case when p_input ? 'item_type' then (p_input ->> 'item_type')::activity_plan_item_type else item_type end,
    title = case when p_input ? 'title' then coalesce(app.j_text(p_input, 'title'), '') else title end,
    duration_minutes = case when p_input ? 'duration_minutes' then nullif(p_input ->> 'duration_minutes', '')::integer else duration_minutes end,
    start_offset_minutes = case when p_input ? 'start_offset_minutes'
      then nullif(p_input ->> 'start_offset_minutes', '')::integer else start_offset_minutes end,
    responsible_text = case when p_input ? 'responsible_text' then app.j_text(p_input, 'responsible_text') else responsible_text end,
    responsible_person_id = case when p_input ? 'responsible_person_id'
      then nullif(p_input ->> 'responsible_person_id', '')::uuid else responsible_person_id end,
    notes = case when p_input ? 'notes' then app.j_text(p_input, 'notes') else notes end
  where id = v_item.id;

  perform app.write_audit_log(
    v_activity.church_id, 'activity.plan_item_updated', 'activities', v_activity.id,
    jsonb_build_object('plan_item_id', v_item.id, 'fields', (select jsonb_agg(k) from jsonb_object_keys(p_input) k))
  );
end;
$$;

create or replace function app.remove_activity_plan_item(p_plan_item_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_item activity_plan_items%rowtype;
  v_activity activities%rowtype;
begin
  select * into v_item from activity_plan_items where id = p_plan_item_id;
  if not found then
    raise exception 'El bloque no existe.' using errcode = 'P0002';
  end if;
  v_activity := app.lock_activity_for_plan(v_item.activity_id);

  delete from activity_plan_items where id = v_item.id;

  -- Compacta el orden para que siga siendo 0..n-1.
  set constraints activity_plan_items_order_unique deferred;
  update activity_plan_items pi set sort_order = o.new_order
  from (
    select id, (row_number() over (order by sort_order) - 1)::integer as new_order
    from activity_plan_items where activity_id = v_activity.id
  ) o
  where pi.id = o.id and pi.sort_order <> o.new_order;
  set constraints activity_plan_items_order_unique immediate;

  perform app.write_audit_log(
    v_activity.church_id, 'activity.plan_item_removed', 'activities', v_activity.id,
    jsonb_build_object('plan_item_id', v_item.id)
  );
end;
$$;

-- Reordenación atómica. p_item_ids debe contener exactamente los bloques
-- actuales; si otro usuario añadió o quitó uno, falla con PT409 para recargar.
create or replace function app.reorder_activity_plan_items(p_activity_id uuid, p_item_ids uuid[])
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_activity activities%rowtype := app.lock_activity_for_plan(p_activity_id);
  v_current uuid[];
  v_requested uuid[];
begin
  select coalesce(array_agg(id order by id), '{}') into v_current
  from activity_plan_items where activity_id = v_activity.id;
  select coalesce(array_agg(distinct x order by x), '{}') into v_requested
  from unnest(coalesce(p_item_ids, '{}')) x;

  if v_current <> v_requested or cardinality(v_requested) <> cardinality(coalesce(p_item_ids, '{}')) then
    raise exception 'El orden del servicio ha cambiado mientras lo editabas. Recarga e inténtalo de nuevo.'
      using errcode = 'PT409';
  end if;

  set constraints activity_plan_items_order_unique deferred;
  update activity_plan_items pi set sort_order = (u.ord - 1)::integer
  from unnest(p_item_ids) with ordinality as u(id, ord)
  where pi.id = u.id and pi.activity_id = v_activity.id and pi.sort_order <> (u.ord - 1)::integer;
  set constraints activity_plan_items_order_unique immediate;

  perform app.write_audit_log(
    v_activity.church_id, 'activity.plan_reordered', 'activities', v_activity.id,
    jsonb_build_object('items', cardinality(p_item_ids))
  );
end;
$$;

-- ===========================================================================
-- Plantillas
-- ===========================================================================
-- Marca (para esta transacción) las áreas y puestos de catálogo que ya estaban
-- en una plantilla, para que reguardarla o duplicarla no falle si el catálogo
-- los desactivó después. Los guards de plantilla solo admiten inactivos de
-- esta lista; añadir elementos inactivos nuevos sigue prohibido.
create or replace function app.set_template_previous_items(p_template_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform set_config('app.template_prev_areas', coalesce((
    select string_agg(ta.service_area_id::text, ',') from activity_template_areas ta where ta.template_id = p_template_id
  ), ''), true);
  perform set_config('app.template_prev_positions', coalesce((
    select string_agg(tp.service_position_id::text, ',') from activity_template_positions tp
    where tp.template_id = p_template_id and tp.service_position_id is not null
  ), ''), true);
end;
$$;

revoke all on function app.set_template_previous_items(uuid) from public, anon, authenticated;

create or replace function app.require_template_cap(p_church_id uuid, p_campus_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not (
    app.has_capability(p_church_id, 'activity_template.manage')
    or (p_campus_id is not null and app.has_capability(p_church_id, 'activity_template.manage', 'campus', p_campus_id))
  ) then
    raise exception 'No tienes permiso para gestionar plantillas en este ámbito.' using errcode = '42501';
  end if;
end;
$$;

-- p_input: name, type, campus_id, default_title, schedule_kind,
-- default_local_start_time, default_duration_minutes, description, visibility,
-- location_text, notes, active, sort_order,
-- areas [{service_area_id, requirement, notes,
--         positions [{service_position_id?, name, description, critical,
--                     min_people, max_people, requires_autonomous_person}]}],
-- plan_items [{item_type, title, duration_minutes, start_offset_minutes,
--              responsible_text, notes}]
-- Guarda la plantilla completa (las filas hijas se reemplazan) en una transacción.
create or replace function app.save_activity_template(p_church_id uuid, p_template_id uuid, p_input jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_existing activity_templates%rowtype;
  v_id uuid := p_template_id;
  v_campus_id uuid := nullif(p_input ->> 'campus_id', '')::uuid;
  v_area jsonb;
  v_position jsonb;
  v_item jsonb;
  v_template_area_id uuid;
  v_area_index integer := 0;
  v_position_index integer;
  v_item_index integer := 0;
  v_catalog_name text;
  v_positions integer := 0;
begin
  perform app.assert_church_member(p_church_id);
  perform app.require_template_cap(p_church_id, v_campus_id);
  -- Nunca heredar la lista de elementos previos de otra llamada en la misma
  -- transacción: para plantillas nuevas queda vacía.
  perform app.set_template_previous_items(null);

  if v_campus_id is not null and not exists (
    select 1 from campuses c where c.id = v_campus_id and c.church_id = p_church_id and c.archived_at is null
  ) then
    raise exception 'La sede no pertenece a esta iglesia.' using errcode = '22023';
  end if;

  if jsonb_array_length(coalesce(p_input -> 'areas', '[]'::jsonb)) > 0 then
    perform app.require_serving_module(p_church_id);
  end if;

  if p_template_id is not null then
    select * into v_existing from activity_templates t
    where t.id = p_template_id and t.church_id = p_church_id
    for update;
    if not found then
      raise exception 'La plantilla no existe.' using errcode = 'P0002';
    end if;
    perform app.require_template_cap(p_church_id, v_existing.campus_id);

    -- Elementos que ya estaban en la plantilla: se admiten aunque el catálogo
    -- los haya desactivado (los guards consultan estos indicadores).
    perform app.set_template_previous_items(p_template_id);

    -- Primero se retiran las filas hijas: así un cambio de sede no choca con
    -- las áreas antiguas que se van a reemplazar.
    delete from activity_template_areas where template_id = p_template_id;
    delete from activity_template_plan_items where template_id = p_template_id;

    update activity_templates set
      name = coalesce(app.j_text(p_input, 'name'), ''),
      type = (p_input ->> 'type')::activity_type,
      campus_id = v_campus_id,
      default_title = app.j_text(p_input, 'default_title'),
      schedule_kind = coalesce(nullif(p_input ->> 'schedule_kind', '')::activity_schedule_kind, 'timed'),
      default_local_start_time = nullif(p_input ->> 'default_local_start_time', '')::time,
      default_duration_minutes = nullif(p_input ->> 'default_duration_minutes', '')::integer,
      description = app.j_text(p_input, 'description'),
      visibility = coalesce(nullif(p_input ->> 'visibility', '')::activity_visibility, 'members'),
      location_text = app.j_text(p_input, 'location_text'),
      notes = app.j_text(p_input, 'notes'),
      active = coalesce((p_input ->> 'active')::boolean, true),
      sort_order = coalesce((p_input ->> 'sort_order')::integer, 0)
    where id = p_template_id;
  else
    insert into activity_templates (
      church_id, name, type, campus_id, default_title, schedule_kind, default_local_start_time,
      default_duration_minutes, description, visibility, location_text, notes, active, sort_order, created_by
    ) values (
      p_church_id, coalesce(app.j_text(p_input, 'name'), ''), (p_input ->> 'type')::activity_type, v_campus_id,
      app.j_text(p_input, 'default_title'),
      coalesce(nullif(p_input ->> 'schedule_kind', '')::activity_schedule_kind, 'timed'),
      nullif(p_input ->> 'default_local_start_time', '')::time,
      nullif(p_input ->> 'default_duration_minutes', '')::integer,
      app.j_text(p_input, 'description'),
      coalesce(nullif(p_input ->> 'visibility', '')::activity_visibility, 'members'),
      app.j_text(p_input, 'location_text'), app.j_text(p_input, 'notes'),
      coalesce((p_input ->> 'active')::boolean, true),
      coalesce((p_input ->> 'sort_order')::integer, 0),
      auth.uid()
    )
    returning id into v_id;
  end if;

  for v_area in select value from jsonb_array_elements(coalesce(p_input -> 'areas', '[]'::jsonb))
  loop
    insert into activity_template_areas (church_id, template_id, service_area_id, requirement, notes, sort_order)
    values (
      p_church_id, v_id, (v_area ->> 'service_area_id')::uuid,
      coalesce(nullif(v_area ->> 'requirement', '')::activity_area_requirement, 'required'),
      app.j_text(v_area, 'notes'), v_area_index
    )
    returning id into v_template_area_id;
    v_area_index := v_area_index + 1;
    v_position_index := 0;

    for v_position in select value from jsonb_array_elements(coalesce(v_area -> 'positions', '[]'::jsonb))
    loop
      v_catalog_name := null;
      if nullif(v_position ->> 'service_position_id', '') is not null then
        select sp.name into v_catalog_name from service_positions sp
        where sp.id = (v_position ->> 'service_position_id')::uuid and sp.church_id = p_church_id;
      end if;
      insert into activity_template_positions (
        church_id, template_id, template_area_id, service_position_id, name, description, critical,
        min_people, max_people, requires_autonomous_person, sort_order
      ) values (
        p_church_id, v_id, v_template_area_id, nullif(v_position ->> 'service_position_id', '')::uuid,
        coalesce(app.j_text(v_position, 'name'), v_catalog_name, ''),
        app.j_text(v_position, 'description'),
        coalesce((v_position ->> 'critical')::boolean, false),
        coalesce(nullif(v_position ->> 'min_people', '')::smallint, 1),
        nullif(v_position ->> 'max_people', '')::smallint,
        coalesce((v_position ->> 'requires_autonomous_person')::boolean, false),
        v_position_index
      );
      v_position_index := v_position_index + 1;
      v_positions := v_positions + 1;
    end loop;
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_input -> 'plan_items', '[]'::jsonb))
  loop
    insert into activity_template_plan_items (
      church_id, template_id, item_type, title, duration_minutes, start_offset_minutes, responsible_text, notes, sort_order
    ) values (
      p_church_id, v_id,
      coalesce(nullif(v_item ->> 'item_type', '')::activity_plan_item_type, 'custom'),
      coalesce(app.j_text(v_item, 'title'), ''),
      nullif(v_item ->> 'duration_minutes', '')::integer,
      nullif(v_item ->> 'start_offset_minutes', '')::integer,
      app.j_text(v_item, 'responsible_text'), app.j_text(v_item, 'notes'), v_item_index
    );
    v_item_index := v_item_index + 1;
  end loop;

  perform app.write_audit_log(
    p_church_id,
    case when p_template_id is null then 'activity_template.created' else 'activity_template.updated' end,
    'activity_templates', v_id,
    jsonb_build_object('areas', v_area_index, 'positions', v_positions, 'plan_items', v_item_index)
  );

  perform app.set_template_previous_items(null);
  return v_id;
end;
$$;

create or replace function app.duplicate_activity_template(p_template_id uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_template activity_templates%rowtype;
  v_new_id uuid;
  v_area record;
  v_new_area uuid;
begin
  select * into v_template from activity_templates t where t.id = p_template_id;
  if not found or not (v_template.church_id = any (app.church_ids_for_user())) then
    raise exception 'La plantilla no existe.' using errcode = 'P0002';
  end if;
  perform app.require_template_cap(v_template.church_id, v_template.campus_id);
  perform app.set_template_previous_items(p_template_id);

  insert into activity_templates (
    church_id, name, type, campus_id, default_title, schedule_kind, default_local_start_time,
    default_duration_minutes, description, visibility, location_text, notes, active, sort_order, created_by
  ) values (
    v_template.church_id, coalesce(nullif(btrim(coalesce(p_name, '')), ''), v_template.name || ' (copia)'),
    v_template.type, v_template.campus_id, v_template.default_title, v_template.schedule_kind,
    v_template.default_local_start_time, v_template.default_duration_minutes, v_template.description,
    v_template.visibility, v_template.location_text, v_template.notes, true, v_template.sort_order, auth.uid()
  )
  returning id into v_new_id;

  for v_area in select * from activity_template_areas where template_id = p_template_id order by sort_order
  loop
    insert into activity_template_areas (church_id, template_id, service_area_id, requirement, notes, sort_order)
    values (v_template.church_id, v_new_id, v_area.service_area_id, v_area.requirement, v_area.notes, v_area.sort_order)
    returning id into v_new_area;

    insert into activity_template_positions (
      church_id, template_id, template_area_id, service_position_id, name, description, critical,
      min_people, max_people, requires_autonomous_person, sort_order
    )
    select v_template.church_id, v_new_id, v_new_area, tp.service_position_id, tp.name, tp.description, tp.critical,
           tp.min_people, tp.max_people, tp.requires_autonomous_person, tp.sort_order
    from activity_template_positions tp
    where tp.template_area_id = v_area.id;
  end loop;

  insert into activity_template_plan_items (
    church_id, template_id, item_type, title, duration_minutes, start_offset_minutes, responsible_text, notes, sort_order
  )
  select v_template.church_id, v_new_id, item_type, title, duration_minutes, start_offset_minutes, responsible_text, notes, sort_order
  from activity_template_plan_items where template_id = p_template_id;

  perform app.write_audit_log(
    v_template.church_id, 'activity_template.created', 'activity_templates', v_new_id,
    jsonb_build_object('duplicated_from', p_template_id)
  );
  perform app.set_template_previous_items(null);
  return v_new_id;
end;
$$;

create or replace function app.set_activity_template_archived(p_template_id uuid, p_archived boolean)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_template activity_templates%rowtype;
begin
  select * into v_template from activity_templates t where t.id = p_template_id for update;
  if not found or not (v_template.church_id = any (app.church_ids_for_user())) then
    raise exception 'La plantilla no existe.' using errcode = 'P0002';
  end if;
  perform app.require_template_cap(v_template.church_id, v_template.campus_id);

  update activity_templates set
    archived_at = case when p_archived then coalesce(archived_at, now()) end,
    archived_by = case when p_archived then auth.uid() end,
    active = not p_archived
  where id = p_template_id;

  perform app.write_audit_log(
    v_template.church_id, case when p_archived then 'activity_template.archived' else 'activity_template.restored' end,
    'activity_templates', p_template_id, '{}'::jsonb
  );
end;
$$;

-- ===========================================================================
-- Lecturas derivadas
-- ===========================================================================
revoke all on function app.lock_activity_area_for_positions(uuid) from public, anon, authenticated;
revoke all on function app.lock_activity_for_plan(uuid) from public, anon, authenticated;
revoke all on function app.require_template_cap(uuid, uuid) from public, anon, authenticated;

-- ===========================================================================
-- Wrappers públicos
-- ===========================================================================
create or replace function public.create_activity(p_church_id uuid, p_input jsonb)
returns jsonb language sql security invoker set search_path = pg_catalog, public
as $$ select app.create_activity(p_church_id, p_input); $$;

create or replace function public.update_activity(p_activity_id uuid, p_input jsonb)
returns jsonb language sql security invoker set search_path = pg_catalog, public
as $$ select app.update_activity(p_activity_id, p_input); $$;

create or replace function public.transition_activity_status(p_activity_id uuid, p_to activity_status, p_reason text default null)
returns activity_status language sql security invoker set search_path = pg_catalog, public
as $$ select app.transition_activity_status(p_activity_id, p_to, p_reason); $$;

create or replace function public.duplicate_activity(p_activity_id uuid, p_input jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path = pg_catalog, public
as $$ select app.duplicate_activity(p_activity_id, p_input); $$;

create or replace function public.add_activity_area(
  p_activity_id uuid, p_service_area_id uuid, p_requirement activity_area_requirement default 'required',
  p_notes text default null, p_include_positions boolean default true
)
returns jsonb language sql security invoker set search_path = pg_catalog, public
as $$ select app.add_activity_area(p_activity_id, p_service_area_id, p_requirement, p_notes, p_include_positions); $$;

create or replace function public.update_activity_area(p_activity_service_area_id uuid, p_input jsonb)
returns void language sql security invoker set search_path = pg_catalog, public
as $$ select app.update_activity_area(p_activity_service_area_id, p_input); $$;

create or replace function public.remove_activity_area(p_activity_service_area_id uuid)
returns void language sql security invoker set search_path = pg_catalog, public
as $$ select app.remove_activity_area(p_activity_service_area_id); $$;

create or replace function public.add_activity_position(p_activity_service_area_id uuid, p_input jsonb)
returns uuid language sql security invoker set search_path = pg_catalog, public
as $$ select app.add_activity_position(p_activity_service_area_id, p_input); $$;

create or replace function public.update_activity_position(p_activity_position_id uuid, p_input jsonb)
returns void language sql security invoker set search_path = pg_catalog, public
as $$ select app.update_activity_position(p_activity_position_id, p_input); $$;

create or replace function public.remove_activity_position(p_activity_position_id uuid)
returns void language sql security invoker set search_path = pg_catalog, public
as $$ select app.remove_activity_position(p_activity_position_id); $$;

create or replace function public.save_activity_position_requirement(
  p_activity_position_id uuid, p_requirement_id uuid, p_input jsonb
)
returns uuid language sql security invoker set search_path = pg_catalog, public
as $$ select app.save_activity_position_requirement(p_activity_position_id, p_requirement_id, p_input); $$;

create or replace function public.remove_activity_position_requirement(p_requirement_id uuid)
returns void language sql security invoker set search_path = pg_catalog, public
as $$ select app.remove_activity_position_requirement(p_requirement_id); $$;

create or replace function public.add_activity_plan_item(p_activity_id uuid, p_input jsonb)
returns uuid language sql security invoker set search_path = pg_catalog, public
as $$ select app.add_activity_plan_item(p_activity_id, p_input); $$;

create or replace function public.update_activity_plan_item(p_plan_item_id uuid, p_input jsonb)
returns void language sql security invoker set search_path = pg_catalog, public
as $$ select app.update_activity_plan_item(p_plan_item_id, p_input); $$;

create or replace function public.remove_activity_plan_item(p_plan_item_id uuid)
returns void language sql security invoker set search_path = pg_catalog, public
as $$ select app.remove_activity_plan_item(p_plan_item_id); $$;

create or replace function public.reorder_activity_plan_items(p_activity_id uuid, p_item_ids uuid[])
returns void language sql security invoker set search_path = pg_catalog, public
as $$ select app.reorder_activity_plan_items(p_activity_id, p_item_ids); $$;

create or replace function public.save_activity_template(p_church_id uuid, p_template_id uuid, p_input jsonb)
returns uuid language sql security invoker set search_path = pg_catalog, public
as $$ select app.save_activity_template(p_church_id, p_template_id, p_input); $$;

create or replace function public.duplicate_activity_template(p_template_id uuid, p_name text default null)
returns uuid language sql security invoker set search_path = pg_catalog, public
as $$ select app.duplicate_activity_template(p_template_id, p_name); $$;

create or replace function public.set_activity_template_archived(p_template_id uuid, p_archived boolean)
returns void language sql security invoker set search_path = pg_catalog, public
as $$ select app.set_activity_template_archived(p_template_id, p_archived); $$;

-- Lecturas: la RLS del usuario se aplica; las funciones internas solo
-- devuelven datos de actividades que puede leer.
create or replace function public.activity_structure_issues(p_activity_id uuid)
returns table (code text, severity text, activity_service_area_id uuid, activity_position_id uuid)
language sql stable security invoker set search_path = pg_catalog, public
as $$
  select i.* from app.activity_structure_issues(p_activity_id) i
  where app.can_read_activity(p_activity_id);
$$;

create or replace function public.activity_position_coverage(p_activity_id uuid)
returns table (
  activity_position_id uuid,
  activity_service_area_id uuid,
  min_people integer,
  max_people integer,
  assigned_count integer,
  coverage_status text
)
language sql stable security invoker set search_path = pg_catalog, public
as $$
  -- Fase 4: no existen asignaciones; assigned_count es 0 de forma explícita.
  select ap.id, ap.activity_service_area_id, ap.min_people::integer, ap.max_people::integer, 0,
         app.position_coverage_status(ap.min_people, ap.max_people, 0)
  from activity_positions ap
  where ap.activity_id = p_activity_id
  order by ap.sort_order, ap.created_at;
$$;

create or replace function public.activity_position_effective_requirements(p_activity_position_id uuid)
returns setof activity_position_requirements
language sql stable security invoker set search_path = pg_catalog, public
as $$
  select r.* from app.activity_position_effective_requirements(p_activity_position_id) r
  where app.can_read_activity(r.activity_id);
$$;

do $grants$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'public.create_activity(uuid, jsonb)',
    'public.update_activity(uuid, jsonb)',
    'public.transition_activity_status(uuid, activity_status, text)',
    'public.duplicate_activity(uuid, jsonb)',
    'public.add_activity_area(uuid, uuid, activity_area_requirement, text, boolean)',
    'public.update_activity_area(uuid, jsonb)',
    'public.remove_activity_area(uuid)',
    'public.add_activity_position(uuid, jsonb)',
    'public.update_activity_position(uuid, jsonb)',
    'public.remove_activity_position(uuid)',
    'public.save_activity_position_requirement(uuid, uuid, jsonb)',
    'public.remove_activity_position_requirement(uuid)',
    'public.add_activity_plan_item(uuid, jsonb)',
    'public.update_activity_plan_item(uuid, jsonb)',
    'public.remove_activity_plan_item(uuid)',
    'public.reorder_activity_plan_items(uuid, uuid[])',
    'public.save_activity_template(uuid, uuid, jsonb)',
    'public.duplicate_activity_template(uuid, text)',
    'public.set_activity_template_archived(uuid, boolean)',
    'public.activity_structure_issues(uuid)',
    'public.activity_position_coverage(uuid)',
    'public.activity_position_effective_requirements(uuid)',
    'app.create_activity(uuid, jsonb)',
    'app.update_activity(uuid, jsonb)',
    'app.transition_activity_status(uuid, activity_status, text)',
    'app.duplicate_activity(uuid, jsonb)',
    'app.add_activity_area(uuid, uuid, activity_area_requirement, text, boolean)',
    'app.update_activity_area(uuid, jsonb)',
    'app.remove_activity_area(uuid)',
    'app.add_activity_position(uuid, jsonb)',
    'app.update_activity_position(uuid, jsonb)',
    'app.remove_activity_position(uuid)',
    'app.save_activity_position_requirement(uuid, uuid, jsonb)',
    'app.remove_activity_position_requirement(uuid)',
    'app.add_activity_plan_item(uuid, jsonb)',
    'app.update_activity_plan_item(uuid, jsonb)',
    'app.remove_activity_plan_item(uuid)',
    'app.reorder_activity_plan_items(uuid, uuid[])',
    'app.save_activity_template(uuid, uuid, jsonb)',
    'app.duplicate_activity_template(uuid, text)',
    'app.set_activity_template_archived(uuid, boolean)'
  ]
  loop
    execute format('revoke all on function %s from public, anon', v_signature);
    execute format('grant execute on function %s to authenticated', v_signature);
  end loop;
end;
$grants$;
