-- Fase 5 (DI-01) · No disponibilidad de la persona, preferencia de frecuencia
-- y su aviso en la elegibilidad de asignaciones.
-- Ver docs/FASE-5-AVISOS-DISPONIBILIDAD.md §2 y §3 y docs/CONTRATO-F4-F5.md §5.
--
-- Reglas de producto (Carlos, 17 de septiembre de 2026):
-- * Periodos concretos con fecha y hora Y pauta semanal repetida.
-- * El motivo es opcional y SOLO lo ve la propia persona: a quien coordina le
--   llega el aviso, nunca el motivo (por eso app.person_unavailability no
--   devuelve motivo y las políticas de lectura son estrictamente propias).
-- * Frecuencia: máximo de actividades al mes, global y afinable por área. Dos
--   puestos de la misma actividad cuentan como una. Superarlo SOLO avisa.
--
-- Esta migración va detrás de las de F5-Carlos (20260922…) a propósito
-- (documento §7): así nunca queda por detrás de una migración ya aplicada y
-- puede apoyarse en activity_assignments para el cómputo de frecuencia.

-- ===========================================================================
-- Tablas
-- ===========================================================================

-- Periodos concretos de no disponibilidad. Rango semiabierto [starts_at, ends_at).
create table person_unavailability_periods (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  person_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  -- Dato privado de la persona: nunca sale en funciones de lectura de
  -- terceros, ni en auditoría, ni en avisos.
  reason text check (reason is null or char_length(reason) between 1 and 300),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (church_id, person_id) references church_people (church_id, person_id) on delete cascade,
  check (ends_at > starts_at)
);

comment on table person_unavailability_periods is
  'Periodo concreto en el que una persona no está disponible para servir. Rango semiabierto [starts_at, ends_at). Escritura solo por RPC de la propia persona. Ver docs/FASE-5-AVISOS-DISPONIBILIDAD.md §3.1.';
comment on column person_unavailability_periods.reason is
  'Motivo opcional. PRIVADO: solo lo lee la propia persona; nunca se expone a quien coordina ni se registra en auditoría.';

alter table person_unavailability_periods
  add constraint person_unavailability_periods_id_unique unique (id, church_id);
create index person_unavailability_periods_church_person_idx
  on person_unavailability_periods (church_id, person_id, starts_at);

create trigger person_unavailability_periods_set_updated_at
  before update on person_unavailability_periods
  for each row execute function app.set_updated_at();

-- Pauta semanal repetida, en hora local de la iglesia (churches.timezone).
-- weekday: 0 = lunes … 6 = domingo (isodow - 1).
create table person_unavailability_weekly (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  person_id uuid not null,
  weekday smallint not null check (weekday between 0 and 6),
  starts_time time not null,
  ends_time time not null,
  reason text check (reason is null or char_length(reason) between 1 and 300),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (church_id, person_id) references church_people (church_id, person_id) on delete cascade,
  check (ends_time > starts_time)
);

comment on table person_unavailability_weekly is
  'Pauta semanal de no disponibilidad, interpretada en la zona de la iglesia (churches.timezone), no en la de la persona. Ver docs/FASE-5-AVISOS-DISPONIBILIDAD.md §3.1 y §8.';
comment on column person_unavailability_weekly.weekday is
  '0 = lunes … 6 = domingo (extract(isodow) - 1).';
comment on column person_unavailability_weekly.reason is
  'Motivo opcional. PRIVADO: solo lo lee la propia persona.';

alter table person_unavailability_weekly
  add constraint person_unavailability_weekly_id_unique unique (id, church_id);
create index person_unavailability_weekly_church_person_idx
  on person_unavailability_weekly (church_id, person_id, weekday);

create trigger person_unavailability_weekly_set_updated_at
  before update on person_unavailability_weekly
  for each row execute function app.set_updated_at();

-- Preferencia de frecuencia: máximo de actividades al mes. service_area_id
-- nulo = preferencia global de la persona en esa iglesia.
create table person_serving_preferences (
  -- Clave técnica: la natural es (church_id, person_id, service_area_id), pero
  -- service_area_id es nullable y una PK no admite nulos.
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  person_id uuid not null,
  service_area_id uuid,
  max_activities_per_month integer check (max_activities_per_month is null or max_activities_per_month >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (church_id, person_id) references church_people (church_id, person_id) on delete cascade,
  foreign key (service_area_id, church_id) references service_areas (id, church_id) on delete cascade
);

comment on table person_serving_preferences is
  'Frecuencia con la que una persona desea servir: máximo de actividades al mes, global (service_area_id nulo) o por área. Superarlo solo avisa, nunca bloquea. Ver docs/FASE-5-AVISOS-DISPONIBILIDAD.md §2 regla 6.';
comment on column person_serving_preferences.max_activities_per_month is
  'Máximo de actividades distintas al mes natural. Nulo = sin límite.';

-- nulls not distinct: una sola fila global por persona además de las de área.
create unique index person_serving_preferences_unique
  on person_serving_preferences (church_id, person_id, service_area_id) nulls not distinct;

create trigger person_serving_preferences_set_updated_at
  before update on person_serving_preferences
  for each row execute function app.set_updated_at();

-- ===========================================================================
-- RLS: lectura estrictamente propia, escritura solo por RPC
-- ===========================================================================
-- La lectura directa es de la propia persona y de nadie más: así el motivo no
-- llega nunca a quien coordina. Lo que necesita coordinación se obtiene por
-- app.person_unavailability (sin motivo) y por el aviso de frecuencia.

alter table person_unavailability_periods enable row level security;
alter table person_unavailability_periods force row level security;
alter table person_unavailability_weekly enable row level security;
alter table person_unavailability_weekly force row level security;
alter table person_serving_preferences enable row level security;
alter table person_serving_preferences force row level security;

revoke insert, update, delete, truncate
  on person_unavailability_periods, person_unavailability_weekly, person_serving_preferences
  from anon, authenticated;
revoke select
  on person_unavailability_periods, person_unavailability_weekly, person_serving_preferences
  from anon;
grant select
  on person_unavailability_periods, person_unavailability_weekly, person_serving_preferences
  to authenticated;

create policy person_unavailability_periods_select_own on person_unavailability_periods
  for select to authenticated
  using (
    church_id = any ((select app.church_ids_for_user())::uuid[])
    and person_id in (select app.current_person_ids())
  );

create policy person_unavailability_weekly_select_own on person_unavailability_weekly
  for select to authenticated
  using (
    church_id = any ((select app.church_ids_for_user())::uuid[])
    and person_id in (select app.current_person_ids())
  );

create policy person_serving_preferences_select_own on person_serving_preferences
  for select to authenticated
  using (
    church_id = any ((select app.church_ids_for_user())::uuid[])
    and person_id in (select app.current_person_ids())
  );

-- ===========================================================================
-- Disponibilidad: función consumida por F5-Carlos
-- ===========================================================================
-- Firma exacta acordada en CONTRATO-F4-F5.md §5.1 y fijada en
-- FASE-5-AVISOS-DISPONIBILIDAD.md §3.2. NO devuelve el motivo.
--
-- Cubre las dos fuentes:
--   * period: solape de rangos semiabiertos [starts_at, ends_at) con [p_from, p_to).
--   * weekly: la pauta semanal expandida a instantes reales en la zona de la
--     iglesia dentro del rango consultado.
--
-- Cambio de hora: cada ocurrencia semanal se convierte con app.local_to_instant
-- (`timestamp at time zone zona`), es decir, la hora LOCAL es la que se
-- mantiene fija. Así, un bloque de los domingos a las 10:00 cae a las 08:00 UTC
-- en horario de verano y a las 09:00 UTC en horario estándar. Consecuencias
-- asumidas: el día del adelanto una hora inexistente se desplaza hacia delante
-- (semántica de PostgreSQL, ya fijada por F4), y si el bloque queda vacío por
-- ese desplazamiento no se devuelve.
--
-- Autorización: la propia persona o quien tiene assignment.manage en esa
-- iglesia (en cualquier scope: iglesia, sede, actividad o área; un líder de
-- área debe poder comprobarla). En otro caso 42501, que F5-Carlos traduce en
-- el aviso availability_unknown.
create or replace function app.person_unavailability(
  p_church_id uuid,
  p_person_ids uuid[],
  p_from timestamptz,
  p_to timestamptz
)
returns table (person_id uuid, source text, starts_at timestamptz, ends_at timestamptz)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_ids uuid[] := coalesce(p_person_ids, '{}');
  v_timezone text;
  v_manages boolean;
  v_from_local date;
  v_to_local date;
begin
  if p_church_id is null or p_from is null or p_to is null then
    raise exception 'Faltan datos para consultar la disponibilidad.' using errcode = '22023';
  end if;
  if not (p_church_id = any (app.church_ids_for_user())) then
    raise exception 'No tienes acceso a esta iglesia.' using errcode = '42501';
  end if;

  -- Quien gestiona asignaciones en esa iglesia, en cualquier ámbito.
  select exists (
    select 1
    from church_people_roles cpr
    join church_people cp on cp.id = cpr.church_people_id and cp.church_id = cpr.church_id
    join role_capabilities rc on rc.role_key = cpr.role_key
    where cpr.church_id = p_church_id
      and cp.person_id in (select app.current_person_ids())
      and cp.archived_at is null
      and rc.capability_key = 'assignment.manage'
  ) into v_manages;

  if not v_manages and exists (
    select 1 from unnest(v_ids) x
    where x is not null and x not in (select app.current_person_ids())
  ) then
    raise exception 'No tienes permiso para consultar la disponibilidad de otras personas.'
      using errcode = '42501';
  end if;

  if p_to <= p_from or cardinality(v_ids) = 0 then
    return;
  end if;
  -- Cota defensiva: la pauta semanal se expande día a día. El rango real de
  -- una actividad es de horas o días; un rango enorme sería un error de uso.
  if p_to - p_from > interval '366 days' then
    raise exception 'El rango de disponibilidad consultado es demasiado amplio (máximo 366 días).'
      using errcode = '22023';
  end if;

  select c.timezone into v_timezone from churches c where c.id = p_church_id;
  v_timezone := coalesce(v_timezone, 'Europe/Madrid');
  -- Un día de margen a cada lado: el solape se filtra después por instantes.
  v_from_local := (p_from at time zone v_timezone)::date - 1;
  v_to_local := (p_to at time zone v_timezone)::date + 1;

  return query
    select pu.person_id, 'period'::text, pu.starts_at, pu.ends_at
    from person_unavailability_periods pu
    where pu.church_id = p_church_id
      and pu.person_id = any (v_ids)
      and pu.starts_at < p_to
      and pu.ends_at > p_from
    union all
    select w.person_id, 'weekly'::text, occ.occ_starts_at, occ.occ_ends_at
    from person_unavailability_weekly w
    cross join lateral (
      select app.local_to_instant(g.d::date + w.starts_time, v_timezone) as occ_starts_at,
             app.local_to_instant(g.d::date + w.ends_time, v_timezone) as occ_ends_at
      from generate_series(v_from_local::timestamp, v_to_local::timestamp, interval '1 day') g(d)
      where extract(isodow from g.d)::integer - 1 = w.weekday
    ) occ
    where w.church_id = p_church_id
      and w.person_id = any (v_ids)
      and occ.occ_ends_at > occ.occ_starts_at
      and occ.occ_starts_at < p_to
      and occ.occ_ends_at > p_from;
end;
$$;

comment on function app.person_unavailability(uuid, uuid[], timestamptz, timestamptz) is
  'No disponibilidad de las personas indicadas dentro de [p_from, p_to). source: period | weekly. Sin motivo: es privado. Ver docs/CONTRATO-F4-F5.md §5.1.';

revoke all on function app.person_unavailability(uuid, uuid[], timestamptz, timestamptz) from public, anon;
grant execute on function app.person_unavailability(uuid, uuid[], timestamptz, timestamptz) to authenticated;

-- ===========================================================================
-- Frecuencia
-- ===========================================================================
-- Actividades DISTINTAS con asignación vigente (proposed, pending o accepted)
-- en el mes natural de p_at, medido en la zona de la iglesia. Dos puestos de
-- la misma actividad cuentan como una (count distinct activity_id).
--
-- p_exclude_activity_id: actividad que no se cuenta. Sirve para dos cosas al
-- evaluar una asignación: que un segundo puesto de la MISMA actividad no
-- dispare el aviso, y que reevaluar una asignación ya existente no se cuente a
-- sí misma. Con la firma documentada (church, person, service_area, at) se
-- obtiene la carga sin excluir nada.
create or replace function app.person_monthly_serving_load(
  p_church_id uuid,
  p_person_id uuid,
  p_service_area_id uuid,
  p_at timestamptz,
  p_exclude_activity_id uuid default null
)
returns integer
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_timezone text;
  v_month_start timestamptz;
  v_month_end timestamptz;
  v_count integer;
begin
  if p_church_id is null or p_person_id is null or p_at is null then
    return 0;
  end if;
  select c.timezone into v_timezone from churches c where c.id = p_church_id;
  v_timezone := coalesce(v_timezone, 'Europe/Madrid');

  v_month_start := app.local_to_instant(date_trunc('month', p_at at time zone v_timezone), v_timezone);
  v_month_end := app.local_to_instant(
    date_trunc('month', p_at at time zone v_timezone) + interval '1 month', v_timezone);

  select count(distinct aa.activity_id)::integer into v_count
  from activity_assignments aa
  join activities a on a.id = aa.activity_id
  where aa.church_id = p_church_id
    and aa.person_id = p_person_id
    and aa.status in ('proposed', 'pending', 'accepted')
    and (p_exclude_activity_id is null or aa.activity_id <> p_exclude_activity_id)
    and (p_service_area_id is null or aa.service_area_id = p_service_area_id)
    and coalesce(a.starts_at, a.ends_at) >= v_month_start
    and coalesce(a.starts_at, a.ends_at) < v_month_end;

  return coalesce(v_count, 0);
end;
$$;

comment on function app.person_monthly_serving_load(uuid, uuid, uuid, timestamptz, uuid) is
  'Actividades distintas con asignación vigente de la persona en el mes natural de p_at (zona de la iglesia), filtrando por área si se indica.';

-- ¿La carga alcanza o supera el máximo aplicable? El máximo del área manda
-- sobre el global: si existe fila de preferencia para el área, se usa esa (y
-- se cuenta solo esa área); si no, la global (y se cuenta toda la iglesia).
-- Sin máximo aplicable, nunca avisa.
create or replace function app.person_frequency_exceeded(
  p_church_id uuid,
  p_person_id uuid,
  p_service_area_id uuid,
  p_at timestamptz,
  p_exclude_activity_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_found boolean := false;
  v_max integer;
  v_scope uuid;
begin
  if p_church_id is null or p_person_id is null or p_at is null then
    return false;
  end if;

  if p_service_area_id is not null then
    select psp.max_activities_per_month, true into v_max, v_found
    from person_serving_preferences psp
    where psp.church_id = p_church_id
      and psp.person_id = p_person_id
      and psp.service_area_id = p_service_area_id;
  end if;

  if not coalesce(v_found, false) then
    select psp.max_activities_per_month, true into v_max, v_found
    from person_serving_preferences psp
    where psp.church_id = p_church_id
      and psp.person_id = p_person_id
      and psp.service_area_id is null;
    v_scope := null;
  else
    v_scope := p_service_area_id;
  end if;

  if not coalesce(v_found, false) or v_max is null then
    return false;
  end if;

  return app.person_monthly_serving_load(p_church_id, p_person_id, v_scope, p_at, p_exclude_activity_id) >= v_max;
end;
$$;

comment on function app.person_frequency_exceeded(uuid, uuid, uuid, timestamptz, uuid) is
  'true si asignar una actividad más en el mes natural de p_at superaría el máximo que pidió la persona (el del área si lo tiene, si no el global). Solo avisa: nunca bloquea.';

revoke all on function app.person_monthly_serving_load(uuid, uuid, uuid, timestamptz, uuid) from public, anon;
revoke all on function app.person_frequency_exceeded(uuid, uuid, uuid, timestamptz, uuid) from public, anon;
grant execute on function app.person_monthly_serving_load(uuid, uuid, uuid, timestamptz, uuid) to authenticated;
grant execute on function app.person_frequency_exceeded(uuid, uuid, uuid, timestamptz, uuid) to authenticated;

-- ===========================================================================
-- Elegibilidad: se añade el aviso frequency_exceeded
-- ===========================================================================
-- Misma firma que en 20260922000200. El cuerpo es el de F5-Carlos, sin tocar
-- ningún bloqueo, la consulta dinámica de disponibilidad, el enmascarado por
-- p_force_mask ni el return inmediato de inactive_person. Lo único nuevo es el
-- aviso de frecuencia al final.
create or replace function app.evaluate_assignment_eligibility(
  p_activity_position_id uuid,
  p_person_id uuid,
  p_exclude uuid[] default '{}',
  p_force_mask boolean default false
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
  v_frequency_at timestamptz;
begin
  select * into v_position from activity_positions where id = p_activity_position_id;
  if not found then
    return query select array['position_not_found']::text[], '{}'::text[];
    return;
  end if;
  select * into v_activity from activities where id = v_position.activity_id;

  v_reference := app.activity_eligibility_reference(v_activity);
  v_range := app.activity_time_range(v_activity);
  v_can_see_sensitive := not coalesce(p_force_mask, false) and (
    auth.uid() is null or app.has_capability(v_activity.church_id, 'credential.sensitive.read'));

  -- Pertenencia activa a la iglesia. Si no lo es, no se evalúa nada más
  -- (tampoco se consulta su disponibilidad ni sus credenciales).
  select cp.archived_at is null, cp.primary_campus_id into v_person_active, v_primary_campus
  from church_people cp
  where cp.church_id = v_activity.church_id and cp.person_id = p_person_id;
  if v_person_active is null or not v_person_active then
    return query select array['inactive_person']::text[], '{}'::text[];
    return;
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
    begin
      execute 'select exists (select 1 from app.person_unavailability($1, $2, $3, $4))'
        into v_code
        using v_activity.church_id, array[p_person_id], lower(v_range), upper(v_range);
      if v_code::boolean then
        v_warnings := array_append(v_warnings, 'unavailable');
      end if;
    exception
      when others then
        -- Un fallo o una denegación de la consulta de disponibilidad no
        -- impide asignar ni responder: se avisa de que no se pudo comprobar.
        v_warnings := array_append(v_warnings, 'availability_unknown');
    end;
  end if;

  -- Frecuencia (DI-01): la persona ya sirve tantas veces al mes como pidió.
  -- Nunca bloquea. Se excluye esta misma actividad del recuento: dos puestos
  -- de la misma actividad cuentan como una, y reevaluar una asignación ya
  -- creada no la cuenta contra sí misma.
  v_frequency_at := coalesce(v_activity.starts_at, v_activity.ends_at);
  if v_frequency_at is not null
     and app.person_frequency_exceeded(v_activity.church_id, p_person_id, v_position.service_area_id,
                                       v_frequency_at, v_activity.id) then
    v_warnings := array_append(v_warnings, 'frequency_exceeded');
  end if;

  return query select v_blocking, v_warnings;
end;
$$;

revoke all on function app.evaluate_assignment_eligibility(uuid, uuid, uuid[], boolean) from public, anon, authenticated;

-- ===========================================================================
-- RPC de la persona
-- ===========================================================================
-- Todas actúan solo sobre la persona autenticada en la iglesia indicada y se
-- auditan SIN incluir el motivo (solo si lo hay).

create or replace function app.set_my_unavailability_period(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_church_id uuid := nullif(p_input ->> 'church_id', '')::uuid;
  v_id uuid := nullif(p_input ->> 'id', '')::uuid;
  v_person_id uuid;
  v_starts timestamptz := nullif(p_input ->> 'starts_at', '')::timestamptz;
  v_ends timestamptz := nullif(p_input ->> 'ends_at', '')::timestamptz;
  v_reason text := nullif(btrim(coalesce(p_input ->> 'reason', '')), '');
  v_created boolean := false;
begin
  if v_church_id is null then
    raise exception 'Falta la iglesia.' using errcode = '22023';
  end if;
  v_person_id := app.current_person_id(v_church_id);
  if v_person_id is null then
    raise exception 'No perteneces a esta iglesia.' using errcode = '42501';
  end if;
  if v_starts is null or v_ends is null then
    raise exception 'Indica el inicio y el fin del periodo.' using errcode = '22023';
  end if;
  if v_ends <= v_starts then
    raise exception 'El fin del periodo debe ser posterior al inicio.' using errcode = '22023';
  end if;
  if v_reason is not null and char_length(v_reason) > 300 then
    raise exception 'El motivo no puede superar los 300 caracteres.' using errcode = '22023';
  end if;

  if v_id is not null then
    update person_unavailability_periods
    set starts_at = v_starts, ends_at = v_ends, reason = v_reason
    where id = v_id and church_id = v_church_id and person_id = v_person_id;
    if not found then
      raise exception 'El periodo no existe.' using errcode = 'P0002';
    end if;
  else
    insert into person_unavailability_periods (church_id, person_id, starts_at, ends_at, reason, created_by)
    values (v_church_id, v_person_id, v_starts, v_ends, v_reason, auth.uid())
    returning id into v_id;
    v_created := true;
  end if;

  -- Auditoría sin motivo: solo si lo hay.
  perform app.write_audit_log(
    v_church_id,
    case when v_created then 'availability.period_created' else 'availability.period_updated' end,
    'person_unavailability_periods', v_id,
    jsonb_build_object('person_id', v_person_id, 'starts_at', v_starts, 'ends_at', v_ends,
      'has_reason', v_reason is not null)
  );

  return jsonb_build_object('id', v_id, 'created', v_created);
end;
$$;

create or replace function app.delete_my_unavailability_period(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row person_unavailability_periods%rowtype;
begin
  select * into v_row from person_unavailability_periods
  where id = p_id and person_id in (select app.current_person_ids());
  if not found then
    -- Idempotente: borrar dos veces no falla; lo de otra persona no existe.
    return jsonb_build_object('id', p_id, 'deleted', false);
  end if;

  delete from person_unavailability_periods where id = v_row.id;

  perform app.write_audit_log(
    v_row.church_id, 'availability.period_deleted', 'person_unavailability_periods', v_row.id,
    jsonb_build_object('person_id', v_row.person_id, 'starts_at', v_row.starts_at, 'ends_at', v_row.ends_at)
  );

  return jsonb_build_object('id', v_row.id, 'deleted', true);
end;
$$;

create or replace function app.set_my_weekly_unavailability(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_church_id uuid := nullif(p_input ->> 'church_id', '')::uuid;
  v_id uuid := nullif(p_input ->> 'id', '')::uuid;
  v_person_id uuid;
  v_weekday smallint := nullif(p_input ->> 'weekday', '')::smallint;
  v_starts time := nullif(p_input ->> 'starts_time', '')::time;
  v_ends time := nullif(p_input ->> 'ends_time', '')::time;
  v_reason text := nullif(btrim(coalesce(p_input ->> 'reason', '')), '');
  v_created boolean := false;
begin
  if v_church_id is null then
    raise exception 'Falta la iglesia.' using errcode = '22023';
  end if;
  v_person_id := app.current_person_id(v_church_id);
  if v_person_id is null then
    raise exception 'No perteneces a esta iglesia.' using errcode = '42501';
  end if;
  if v_weekday is null or v_weekday < 0 or v_weekday > 6 then
    raise exception 'El día de la semana debe estar entre 0 (lunes) y 6 (domingo).' using errcode = '22023';
  end if;
  if v_starts is null or v_ends is null then
    raise exception 'Indica la hora de inicio y la de fin.' using errcode = '22023';
  end if;
  if v_ends <= v_starts then
    raise exception 'La hora de fin debe ser posterior a la de inicio.' using errcode = '22023';
  end if;
  if v_reason is not null and char_length(v_reason) > 300 then
    raise exception 'El motivo no puede superar los 300 caracteres.' using errcode = '22023';
  end if;

  if v_id is not null then
    update person_unavailability_weekly
    set weekday = v_weekday, starts_time = v_starts, ends_time = v_ends, reason = v_reason
    where id = v_id and church_id = v_church_id and person_id = v_person_id;
    if not found then
      raise exception 'La pauta semanal no existe.' using errcode = 'P0002';
    end if;
  else
    insert into person_unavailability_weekly (church_id, person_id, weekday, starts_time, ends_time, reason, created_by)
    values (v_church_id, v_person_id, v_weekday, v_starts, v_ends, v_reason, auth.uid())
    returning id into v_id;
    v_created := true;
  end if;

  perform app.write_audit_log(
    v_church_id,
    case when v_created then 'availability.weekly_created' else 'availability.weekly_updated' end,
    'person_unavailability_weekly', v_id,
    jsonb_build_object('person_id', v_person_id, 'weekday', v_weekday,
      'starts_time', v_starts::text, 'ends_time', v_ends::text, 'has_reason', v_reason is not null)
  );

  return jsonb_build_object('id', v_id, 'created', v_created);
end;
$$;

create or replace function app.delete_my_weekly_unavailability(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row person_unavailability_weekly%rowtype;
begin
  select * into v_row from person_unavailability_weekly
  where id = p_id and person_id in (select app.current_person_ids());
  if not found then
    return jsonb_build_object('id', p_id, 'deleted', false);
  end if;

  delete from person_unavailability_weekly where id = v_row.id;

  perform app.write_audit_log(
    v_row.church_id, 'availability.weekly_deleted', 'person_unavailability_weekly', v_row.id,
    jsonb_build_object('person_id', v_row.person_id, 'weekday', v_row.weekday)
  );

  return jsonb_build_object('id', v_row.id, 'deleted', true);
end;
$$;

-- p_church_id es necesario: una cuenta puede ser persona en varias iglesias y
-- la preferencia global (p_service_area_id nulo) no permite deducirla del área.
-- p_max_activities_per_month nulo = sin límite (el área puede así levantar un
-- máximo global).
create or replace function app.set_my_serving_preference(
  p_church_id uuid,
  p_service_area_id uuid,
  p_max_activities_per_month integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_person_id uuid;
  v_id uuid;
begin
  if p_church_id is null then
    raise exception 'Falta la iglesia.' using errcode = '22023';
  end if;
  v_person_id := app.current_person_id(p_church_id);
  if v_person_id is null then
    raise exception 'No perteneces a esta iglesia.' using errcode = '42501';
  end if;
  if p_max_activities_per_month is not null and p_max_activities_per_month < 0 then
    raise exception 'El máximo de actividades al mes no puede ser negativo.' using errcode = '22023';
  end if;
  if p_service_area_id is not null and not exists (
    select 1 from service_areas sa where sa.id = p_service_area_id and sa.church_id = p_church_id
  ) then
    raise exception 'El área de servicio no existe.' using errcode = 'P0002';
  end if;

  insert into person_serving_preferences (church_id, person_id, service_area_id, max_activities_per_month)
  values (p_church_id, v_person_id, p_service_area_id, p_max_activities_per_month)
  on conflict (church_id, person_id, service_area_id)
  do update set max_activities_per_month = excluded.max_activities_per_month, updated_at = now()
  returning id into v_id;

  perform app.write_audit_log(
    p_church_id, 'serving_preference.updated', 'person_serving_preferences', v_id,
    jsonb_build_object('person_id', v_person_id, 'service_area_id', p_service_area_id,
      'max_activities_per_month', p_max_activities_per_month)
  );

  return jsonb_build_object('id', v_id, 'max_activities_per_month', p_max_activities_per_month);
end;
$$;

-- ===========================================================================
-- Wrappers públicos (security invoker)
-- ===========================================================================
create or replace function public.set_my_unavailability_period(p_input jsonb)
returns jsonb language sql security invoker set search_path = pg_catalog, public
as $$ select app.set_my_unavailability_period(p_input); $$;

create or replace function public.delete_my_unavailability_period(p_id uuid)
returns jsonb language sql security invoker set search_path = pg_catalog, public
as $$ select app.delete_my_unavailability_period(p_id); $$;

create or replace function public.set_my_weekly_unavailability(p_input jsonb)
returns jsonb language sql security invoker set search_path = pg_catalog, public
as $$ select app.set_my_weekly_unavailability(p_input); $$;

create or replace function public.delete_my_weekly_unavailability(p_id uuid)
returns jsonb language sql security invoker set search_path = pg_catalog, public
as $$ select app.delete_my_weekly_unavailability(p_id); $$;

create or replace function public.set_my_serving_preference(
  p_church_id uuid, p_service_area_id uuid default null, p_max_activities_per_month integer default null
)
returns jsonb language sql security invoker set search_path = pg_catalog, public
as $$ select app.set_my_serving_preference(p_church_id, p_service_area_id, p_max_activities_per_month); $$;

do $grants$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'public.set_my_unavailability_period(jsonb)',
    'public.delete_my_unavailability_period(uuid)',
    'public.set_my_weekly_unavailability(jsonb)',
    'public.delete_my_weekly_unavailability(uuid)',
    'public.set_my_serving_preference(uuid, uuid, integer)',
    'app.set_my_unavailability_period(jsonb)',
    'app.delete_my_unavailability_period(uuid)',
    'app.set_my_weekly_unavailability(jsonb)',
    'app.delete_my_weekly_unavailability(uuid)',
    'app.set_my_serving_preference(uuid, uuid, integer)'
  ]
  loop
    execute format('revoke all on function %s from public, anon', v_signature);
    execute format('grant execute on function %s to authenticated', v_signature);
  end loop;
end;
$grants$;
