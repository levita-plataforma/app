-- Fase 4 · Recurrencia de actividades.
-- Ver docs/adr/0017.
--
-- Modelo: activity_series guarda la regla (semanal / cada N semanas /
-- mensual por día o por "n-ésimo día de la semana"; fin por fecha o por nº de
-- ocurrencias) y la hora LOCAL. Cada ocurrencia es una fila de activities con
-- series_id + occurrence_date (única), de modo que reintentar una expansión no
-- duplica filas.
--
-- Expansión acotada: máximo 200 ocurrencias y horizonte de 731 días desde la
-- primera fecha, aunque la regla indique más.
--
-- DST: el instante de cada ocurrencia se calcula con su propia fecha local
-- (fecha + hora local en la zona de la serie), así que "domingo 11:00" sigue
-- siendo 11:00 local antes y después del cambio de hora. La duración es
-- absoluta (minutos). Horas inexistentes/ambiguas: ver app.local_to_instant.
--
-- Días 29-31 en modo mensual: meses sin ese día -> sin ocurrencia (skip) o
-- último día del mes (last_day), según month_day_fallback. Igual para el 5.º
-- día de la semana de un mes que no lo tiene.

-- ===========================================================================
-- Fechas de una regla
-- ===========================================================================
create or replace function app.recurrence_dates(
  p_frequency activity_recurrence_frequency,
  p_interval integer,
  p_weekdays smallint[],
  p_monthly_mode activity_monthly_mode,
  p_month_day integer,
  p_week_of_month integer,
  p_month_weekday integer,
  p_fallback text,
  p_starts_on date,
  p_until_date date,
  p_count integer
)
returns setof date
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  v_horizon date := least(coalesce(p_until_date, p_starts_on + 731), p_starts_on + 731);
  v_max integer := least(coalesce(p_count, 200), 200);
  v_emitted integer := 0;
  v_week_start date;
  v_month date;
  v_last date;
  v_date date;
  v_weekday smallint;
  v_guard integer := 0;
begin
  if p_interval is null or p_interval < 1 then
    raise exception 'El intervalo de repetición debe ser al menos 1.' using errcode = '22023';
  end if;

  if p_frequency = 'weekly' then
    v_week_start := p_starts_on - (extract(isodow from p_starts_on)::integer - 1);
    loop
      v_guard := v_guard + 1;
      exit when v_guard > 1000 or v_week_start > v_horizon;
      for v_weekday in select distinct w from unnest(p_weekdays) w order by w
      loop
        v_date := v_week_start + (v_weekday - 1);
        continue when v_date < p_starts_on;
        if v_date > v_horizon then
          return;
        end if;
        return next v_date;
        v_emitted := v_emitted + 1;
        if v_emitted >= v_max then
          return;
        end if;
      end loop;
      v_week_start := v_week_start + 7 * p_interval;
    end loop;
    return;
  end if;

  v_month := date_trunc('month', p_starts_on)::date;
  loop
    v_guard := v_guard + 1;
    exit when v_guard > 1000 or v_month > v_horizon;
    v_last := (v_month + interval '1 month' - interval '1 day')::date;
    v_date := null;

    if p_monthly_mode = 'day_of_month' then
      if p_month_day <= extract(day from v_last) then
        v_date := v_month + (p_month_day - 1);
      elsif p_fallback = 'last_day' then
        v_date := v_last;
      end if;
    else
      if p_week_of_month = -1 then
        v_date := v_last - ((extract(isodow from v_last)::integer - p_month_weekday + 7) % 7);
      else
        v_date := v_month + ((p_month_weekday - extract(isodow from v_month)::integer + 7) % 7)
                  + 7 * (p_week_of_month - 1);
        if v_date > v_last then
          v_date := case when p_fallback = 'last_day' then v_date - 7 end;
        end if;
      end if;
    end if;

    if v_date is not null and v_date >= p_starts_on then
      if v_date > v_horizon then
        return;
      end if;
      return next v_date;
      v_emitted := v_emitted + 1;
      if v_emitted >= v_max then
        return;
      end if;
    end if;

    v_month := (v_month + make_interval(months => p_interval))::date;
  end loop;
end;
$$;

create or replace function app.series_dates(p_series activity_series)
returns setof date
language sql
immutable
set search_path = pg_catalog, public
as $$
  select * from app.recurrence_dates(
    p_series.frequency, p_series.interval_count, p_series.weekdays, p_series.monthly_mode,
    p_series.month_day, p_series.week_of_month, p_series.month_weekday, p_series.month_day_fallback,
    p_series.starts_on, p_series.until_date, p_series.occurrence_count
  );
$$;

-- Representación RFC 5545 informativa.
create or replace function app.series_rrule(p_series activity_series)
returns text
language sql
immutable
set search_path = pg_catalog, public
as $$
  select concat_ws(';',
    'FREQ=' || upper(p_series.frequency::text),
    'INTERVAL=' || p_series.interval_count,
    case when p_series.frequency = 'weekly' then
      'BYDAY=' || (
        select string_agg((array['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'])[w], ',' order by w)
        from (select distinct unnest(p_series.weekdays) w) d
      )
    end,
    case when p_series.frequency = 'monthly' and p_series.monthly_mode = 'day_of_month' then
      'BYMONTHDAY=' || p_series.month_day
    end,
    case when p_series.frequency = 'monthly' and p_series.monthly_mode = 'nth_weekday' then
      'BYDAY=' || p_series.week_of_month || (array['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'])[p_series.month_weekday]
    end,
    case when p_series.until_date is not null then 'UNTIL=' || to_char(p_series.until_date, 'YYYYMMDD') end,
    case when p_series.occurrence_count is not null then 'COUNT=' || p_series.occurrence_count end,
    case when p_series.frequency = 'monthly' and p_series.month_day_fallback = 'last_day' then 'X-LEVITA-FALLBACK=LAST-DAY' end
  );
$$;

-- Normaliza la regla recibida (JSON) sobre una fila de serie.
-- p_rule: frequency, interval, weekdays[], monthly_mode, month_day,
-- week_of_month, month_weekday, month_day_fallback, until_date | count
create or replace function app.apply_recurrence_rule(p_series activity_series, p_rule jsonb)
returns activity_series
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  v activity_series := p_series;
begin
  if p_rule is null or jsonb_typeof(p_rule) <> 'object' then
    raise exception 'Indica la regla de repetición.' using errcode = '22023';
  end if;

  v.frequency := coalesce(nullif(p_rule ->> 'frequency', '')::activity_recurrence_frequency, v.frequency);
  if v.frequency is null then
    raise exception 'Indica la frecuencia de repetición.' using errcode = '22023';
  end if;
  v.interval_count := coalesce(nullif(p_rule ->> 'interval', '')::smallint, v.interval_count, 1);

  if v.frequency = 'weekly' then
    if jsonb_typeof(p_rule -> 'weekdays') = 'array' and jsonb_array_length(p_rule -> 'weekdays') > 0 then
      select array_agg(distinct x::smallint order by x::smallint) into v.weekdays
      from jsonb_array_elements_text(p_rule -> 'weekdays') x;
    elsif v.weekdays is null then
      v.weekdays := array[extract(isodow from v.starts_on)::smallint];
    end if;
    v.monthly_mode := null;
    v.month_day := null;
    v.week_of_month := null;
    v.month_weekday := null;
  else
    v.weekdays := null;
    v.monthly_mode := coalesce(nullif(p_rule ->> 'monthly_mode', '')::activity_monthly_mode, v.monthly_mode, 'day_of_month');
    if v.monthly_mode = 'day_of_month' then
      v.month_day := coalesce(nullif(p_rule ->> 'month_day', '')::smallint, extract(day from v.starts_on)::smallint);
      v.week_of_month := null;
      v.month_weekday := null;
    else
      v.month_day := null;
      v.week_of_month := coalesce(nullif(p_rule ->> 'week_of_month', '')::smallint,
        least(((extract(day from v.starts_on)::integer - 1) / 7) + 1, 5)::smallint);
      v.month_weekday := coalesce(nullif(p_rule ->> 'month_weekday', '')::smallint, extract(isodow from v.starts_on)::smallint);
    end if;
  end if;

  if p_rule ? 'month_day_fallback' then
    v.month_day_fallback := coalesce(nullif(p_rule ->> 'month_day_fallback', ''), 'skip');
  end if;

  if nullif(p_rule ->> 'until_date', '') is not null then
    v.until_date := (p_rule ->> 'until_date')::date;
    v.occurrence_count := null;
  elsif nullif(p_rule ->> 'count', '') is not null then
    v.occurrence_count := (p_rule ->> 'count')::smallint;
    v.until_date := null;
  end if;

  if v.until_date is null and v.occurrence_count is null then
    raise exception 'Indica cuándo termina la repetición: una fecha o un número de ocurrencias.' using errcode = '22023';
  end if;
  if v.occurrence_count is not null and (v.occurrence_count < 1 or v.occurrence_count > 200) then
    raise exception 'El número de ocurrencias debe estar entre 1 y 200.' using errcode = '22023';
  end if;
  if v.until_date is not null and (v.until_date < v.starts_on or v.until_date > v.starts_on + 731) then
    raise exception 'La fecha de fin debe estar entre el inicio y dos años después.' using errcode = '22023';
  end if;

  v.rrule := app.series_rrule(v);
  return v;
end;
$$;

revoke all on function app.recurrence_dates(activity_recurrence_frequency, integer, smallint[], activity_monthly_mode, integer, integer, integer, text, date, date, integer) from public, anon;
revoke all on function app.series_dates(activity_series) from public, anon;
revoke all on function app.series_rrule(activity_series) from public, anon;
revoke all on function app.apply_recurrence_rule(activity_series, jsonb) from public, anon;
grant execute on function app.recurrence_dates(activity_recurrence_frequency, integer, smallint[], activity_monthly_mode, integer, integer, integer, text, date, date, integer) to authenticated;
grant execute on function app.series_dates(activity_series) to authenticated;
grant execute on function app.series_rrule(activity_series) to authenticated;
grant execute on function app.apply_recurrence_rule(activity_series, jsonb) to authenticated;

-- ===========================================================================
-- Series y expansión
-- ===========================================================================
create or replace function app.create_activity_series_row(
  p_church_id uuid,
  p_type activity_type,
  p_title text,
  p_rule jsonb,
  p_starts_on date,
  p_local_start_time time,
  p_duration_minutes integer,
  p_timezone text,
  p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v activity_series;
begin
  v.church_id := p_church_id;
  v.type := p_type;
  v.title := btrim(p_title);
  v.starts_on := p_starts_on;
  v.local_start_time := p_local_start_time;
  v.duration_minutes := p_duration_minutes;
  v.timezone := p_timezone;
  v.month_day_fallback := 'skip';
  v := app.apply_recurrence_rule(v, p_rule);

  if not exists (select 1 from app.series_dates(v)) then
    raise exception 'La regla de repetición no genera ninguna fecha.' using errcode = '22023';
  end if;

  insert into activity_series (
    church_id, type, title, frequency, interval_count, weekdays, monthly_mode, month_day, week_of_month,
    month_weekday, month_day_fallback, starts_on, local_start_time, duration_minutes, timezone,
    until_date, occurrence_count, rrule, creation_request_id, created_by
  ) values (
    v.church_id, v.type, v.title, v.frequency, v.interval_count, v.weekdays, v.monthly_mode, v.month_day,
    v.week_of_month, v.month_weekday, v.month_day_fallback, v.starts_on, v.local_start_time,
    v.duration_minutes, v.timezone, v.until_date, v.occurrence_count, v.rrule, p_request_id, auth.uid()
  )
  returning id into v.id;

  return v.id;
end;
$$;

-- Crea las ocurrencias que falten (idempotente por (series_id, occurrence_date)).
-- p_base: description, campus_id, visibility, location_text,
-- organizer_person_id, admin_notes. Estructura: desde plantilla o copia
-- exacta de una ocurrencia de origen.
create or replace function app.expand_activity_series(
  p_series_id uuid,
  p_base jsonb,
  p_template_id uuid,
  p_source_activity_id uuid,
  p_from_date date
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_series activity_series%rowtype;
  v_date date;
  v_id uuid;
  v_starts timestamptz;
  v_created integer := 0;
begin
  select * into v_series from activity_series where id = p_series_id;

  for v_date in select d from app.series_dates(v_series) d
  loop
    continue when p_from_date is not null and v_date < p_from_date;

    v_starts := app.local_to_instant(v_date + v_series.local_start_time, v_series.timezone);
    v_id := app.insert_activity_row(
      v_series.church_id, v_series.type, v_series.title, p_base ->> 'description',
      nullif(p_base ->> 'campus_id', '')::uuid, 'timed', v_starts,
      v_starts + make_interval(mins => v_series.duration_minutes), v_series.timezone,
      nullif(p_base ->> 'visibility', '')::activity_visibility, p_base ->> 'location_text',
      nullif(p_base ->> 'organizer_person_id', '')::uuid, p_template_id, v_series.id, v_date,
      v_series.rrule, null, null
    );

    continue when v_id is null;
    v_created := v_created + 1;

    if nullif(btrim(coalesce(p_base ->> 'admin_notes', '')), '') is not null then
      perform app.set_activity_admin_notes((select a from activities a where a.id = v_id), p_base ->> 'admin_notes');
    end if;

    if p_source_activity_id is not null then
      perform app.copy_activity_structure(p_source_activity_id, v_id);
    elsif p_template_id is not null then
      perform app.copy_template_structure(p_template_id, v_id);
    end if;
  end loop;

  return v_created;
end;
$$;

-- Divide una serie en p_from_date: la original termina el día anterior y la
-- nueva (misma regla) empieza en p_from_date con las ocurrencias >= fecha.
-- Si no hay ocurrencias anteriores, devuelve la misma serie.
create or replace function app.split_activity_series(p_series_id uuid, p_from_date date)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_old activity_series%rowtype;
  v_new activity_series%rowtype;
  v_before integer;
begin
  select * into v_old from activity_series where id = p_series_id for update;

  select count(*) into v_before from app.series_dates(v_old) d where d < p_from_date;
  if v_before = 0 and not exists (
    select 1 from activities a where a.series_id = p_series_id and a.occurrence_date < p_from_date
  ) then
    return p_series_id;
  end if;

  v_new := v_old;
  v_new.id := gen_random_uuid();
  v_new.starts_on := p_from_date;
  v_new.split_from_series_id := v_old.id;
  v_new.creation_request_id := null;
  v_new.created_by := auth.uid();
  if v_old.occurrence_count is not null then
    v_new.occurrence_count := greatest(v_old.occurrence_count - v_before, 1);
  end if;
  if v_new.until_date is not null and v_new.until_date > p_from_date + 731 then
    v_new.until_date := p_from_date + 731;
  end if;
  v_new.rrule := app.series_rrule(v_new);

  insert into activity_series (
    id, church_id, type, title, frequency, interval_count, weekdays, monthly_mode, month_day, week_of_month,
    month_weekday, month_day_fallback, starts_on, local_start_time, duration_minutes, timezone,
    until_date, occurrence_count, rrule, split_from_series_id, created_by
  ) values (
    v_new.id, v_new.church_id, v_new.type, v_new.title, v_new.frequency, v_new.interval_count, v_new.weekdays,
    v_new.monthly_mode, v_new.month_day, v_new.week_of_month, v_new.month_weekday, v_new.month_day_fallback,
    v_new.starts_on, v_new.local_start_time, v_new.duration_minutes, v_new.timezone, v_new.until_date,
    v_new.occurrence_count, v_new.rrule, v_new.split_from_series_id, v_new.created_by
  );

  -- Cierre de la serie original (hasta el día anterior).
  update activity_series set
    until_date = greatest(p_from_date - 1, starts_on),
    occurrence_count = null
  where id = v_old.id;
  update activity_series s set rrule = app.series_rrule(s) where s.id = v_old.id;

  update activities set series_id = v_new.id
  where series_id = v_old.id and occurrence_date >= p_from_date;

  return v_new.id;
end;
$$;

revoke all on function app.create_activity_series_row(uuid, activity_type, text, jsonb, date, time, integer, text, uuid) from public, anon, authenticated;
revoke all on function app.expand_activity_series(uuid, jsonb, uuid, uuid, date) from public, anon, authenticated;
revoke all on function app.split_activity_series(uuid, date) from public, anon, authenticated;

-- ===========================================================================
-- Edición de series
-- ===========================================================================

-- Ocurrencias de una serie que una edición masiva puede tocar: no
-- excepciones, no cerradas, no pasadas.
create or replace function app.series_editable_occurrences(p_series_id uuid, p_from_date date)
returns setof activities
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select a.* from activities a
  where a.series_id = p_series_id
    and (p_from_date is null or a.occurrence_date >= p_from_date)
    and a.status in ('draft', 'planned', 'published')
    and not a.series_modified
    and a.starts_at >= now()
  order by a.occurrence_date;
$$;

revoke all on function app.series_editable_occurrences(uuid, date) from public, anon, authenticated;

-- p_scope: 'future' (esta y siguientes) | 'all' (toda la serie).
-- p_input: title, description, type, visibility, location_text,
-- organizer_person_id, campus_id, local_start_time ("HH:MM"), duration_minutes.
-- No admite cambiar la fecha: eso es una edición de "solo esta ocurrencia".
create or replace function app.update_activity_series(p_activity_id uuid, p_input jsonb, p_scope text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_activity activities%rowtype := app.lock_activity(p_activity_id);
  v_series_id uuid;
  v_series activity_series%rowtype;
  v_target activities%rowtype;
  v_from date;
  v_updated integer := 0;
  v_allowed text[] := array['title', 'description', 'type', 'visibility', 'location_text',
    'organizer_person_id', 'campus_id', 'local_start_time', 'duration_minutes'];
  v_key text;
  v_campus uuid;
  v_starts timestamptz;
begin
  if p_scope not in ('future', 'all') then
    raise exception 'Ámbito de edición no válido.' using errcode = '22023';
  end if;
  if v_activity.series_id is null then
    raise exception 'La actividad no pertenece a una serie.' using errcode = '22023';
  end if;
  perform app.require_activity_cap(v_activity, 'activity.manage');

  for v_key in select jsonb_object_keys(p_input)
  loop
    if not v_key = any (v_allowed) then
      raise exception 'El campo "%" solo se puede cambiar en esta ocurrencia.', v_key using errcode = '22023';
    end if;
  end loop;

  if p_input ? 'title' and app.j_text(p_input, 'title') is null then
    raise exception 'El título es obligatorio.' using errcode = '22023';
  end if;
  if p_input ? 'campus_id' then
    v_campus := nullif(p_input ->> 'campus_id', '')::uuid;
    if v_campus is not null and not exists (
      select 1 from campuses c where c.id = v_campus and c.church_id = v_activity.church_id and c.archived_at is null
    ) then
      raise exception 'La sede no pertenece a esta iglesia.' using errcode = '22023';
    end if;
    if not ((v_campus is null and app.has_capability(v_activity.church_id, 'activity.manage'))
            or (v_campus is not null and app.has_capability(v_activity.church_id, 'activity.manage', 'campus', v_campus))) then
      raise exception 'No tienes permiso para mover actividades a esa sede.' using errcode = '42501';
    end if;
  end if;

  if p_scope = 'future' then
    v_from := v_activity.occurrence_date;
    v_series_id := app.split_activity_series(v_activity.series_id, v_from);
  else
    v_from := null;
    v_series_id := v_activity.series_id;
  end if;

  update activity_series s set
    title = case when p_input ? 'title' then app.j_text(p_input, 'title') else title end,
    type = case when p_input ? 'type' then (p_input ->> 'type')::activity_type else type end,
    local_start_time = case when p_input ? 'local_start_time' then (p_input ->> 'local_start_time')::time else local_start_time end,
    duration_minutes = case when p_input ? 'duration_minutes' then (p_input ->> 'duration_minutes')::integer else duration_minutes end
  where s.id = v_series_id
  returning * into v_series;

  for v_target in
    select * from app.series_editable_occurrences(v_series_id, v_from)
  loop
    perform 1 from activities where id = v_target.id for update;
    if not app.activity_cap(v_target.church_id, v_target.campus_id, v_target.id, 'activity.manage') then
      raise exception 'No tienes permiso para editar todas las ocurrencias afectadas.' using errcode = '42501';
    end if;

    v_starts := case when p_input ?| array['local_start_time', 'duration_minutes']
      then app.local_to_instant(v_target.occurrence_date + v_series.local_start_time, v_target.timezone) end;

    update activities set
      title = case when p_input ? 'title' then v_series.title else title end,
      type = case when p_input ? 'type' then v_series.type else type end,
      description = case when p_input ? 'description' then app.j_text(p_input, 'description') else description end,
      visibility = case when p_input ? 'visibility' then (p_input ->> 'visibility')::activity_visibility else visibility end,
      location_text = case when p_input ? 'location_text' then app.j_text(p_input, 'location_text') else location_text end,
      organizer_person_id = case when p_input ? 'organizer_person_id'
        then nullif(p_input ->> 'organizer_person_id', '')::uuid else organizer_person_id end,
      campus_id = case when p_input ? 'campus_id' then v_campus else campus_id end,
      starts_at = coalesce(v_starts, starts_at),
      ends_at = case when v_starts is not null then v_starts + make_interval(mins => v_series.duration_minutes) else ends_at end,
      recurrence_rule = v_series.rrule
    where id = v_target.id;

    v_updated := v_updated + 1;
  end loop;

  perform app.write_audit_log(
    v_activity.church_id, 'activity.updated', 'activity_series', v_series_id,
    jsonb_build_object('scope', p_scope, 'from_activity_id', v_activity.id, 'occurrences', v_updated,
      'fields', (select jsonb_agg(k) from jsonb_object_keys(p_input) k))
  );

  return jsonb_build_object('series_id', v_series_id, 'updated', v_updated);
end;
$$;

-- Cambia la regla desde esta ocurrencia (y siguientes). Reconciliación:
-- * fechas nuevas: se crean ocurrencias copiando la estructura de esta;
-- * ocurrencias que ya no encajan: borradores/planificadas sin excepción se
--   eliminan (no tienen histórico); publicadas se cancelan con motivo;
--   excepciones, cerradas y pasadas se conservan;
-- * ocurrencias que siguen encajando: se actualiza la hora si cambió.
-- p_input: la regla (ver app.apply_recurrence_rule) + local_start_time,
-- duration_minutes opcionales.
create or replace function app.update_activity_series_rule(p_activity_id uuid, p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_activity activities%rowtype := app.lock_activity(p_activity_id);
  v_series_id uuid;
  v_series activity_series%rowtype;
  v_dates date[];
  v_target activities%rowtype;
  v_created integer;
  v_removed integer := 0;
  v_cancelled integer := 0;
  v_updated integer := 0;
  v_notes text;
  v_first uuid;
  v_starts timestamptz;
begin
  if v_activity.series_id is null then
    raise exception 'La actividad no pertenece a una serie.' using errcode = '22023';
  end if;
  perform app.require_activity_cap(v_activity, 'activity.manage');

  v_series_id := app.split_activity_series(v_activity.series_id, v_activity.occurrence_date);
  select * into v_series from activity_series where id = v_series_id for update;

  v_series.starts_on := v_activity.occurrence_date;
  if p_input ? 'local_start_time' then
    v_series.local_start_time := (p_input ->> 'local_start_time')::time;
  end if;
  if p_input ? 'duration_minutes' then
    v_series.duration_minutes := (p_input ->> 'duration_minutes')::integer;
  end if;
  v_series := app.apply_recurrence_rule(v_series, p_input);

  select array_agg(d order by d) into v_dates from app.series_dates(v_series) d;
  if v_dates is null then
    raise exception 'La regla de repetición no genera ninguna fecha.' using errcode = '22023';
  end if;

  update activity_series set
    frequency = v_series.frequency, interval_count = v_series.interval_count, weekdays = v_series.weekdays,
    monthly_mode = v_series.monthly_mode, month_day = v_series.month_day, week_of_month = v_series.week_of_month,
    month_weekday = v_series.month_weekday, month_day_fallback = v_series.month_day_fallback,
    starts_on = v_series.starts_on, local_start_time = v_series.local_start_time,
    duration_minutes = v_series.duration_minutes, until_date = v_series.until_date,
    occurrence_count = v_series.occurrence_count, rrule = v_series.rrule
  where id = v_series_id;

  -- Nuevas fechas: copia exacta de la estructura y notas de esta ocurrencia.
  select n.notes into v_notes from activity_admin_notes n where n.activity_id = v_activity.id;
  v_created := app.expand_activity_series(
    v_series_id,
    jsonb_build_object(
      'description', v_activity.description, 'campus_id', v_activity.campus_id,
      'visibility', v_activity.visibility, 'location_text', v_activity.location_text,
      'organizer_person_id', v_activity.organizer_person_id, 'admin_notes', v_notes
    ),
    null, v_activity.id, v_activity.occurrence_date
  );

  for v_target in
    select * from activities a
    where a.series_id = v_series_id and a.occurrence_date >= v_activity.occurrence_date
    order by a.occurrence_date
    for update
  loop
    if v_target.occurrence_date = any (v_dates) then
      if v_target.status in ('draft', 'planned', 'published') and not v_target.series_modified
         and v_target.starts_at >= now() then
        v_starts := app.local_to_instant(v_target.occurrence_date + v_series.local_start_time, v_series.timezone);
        if v_starts is distinct from v_target.starts_at
           or v_target.ends_at is distinct from v_starts + make_interval(mins => v_series.duration_minutes) then
          update activities set
            starts_at = v_starts,
            ends_at = v_starts + make_interval(mins => v_series.duration_minutes),
            recurrence_rule = v_series.rrule
          where id = v_target.id;
          v_updated := v_updated + 1;
        else
          update activities set recurrence_rule = v_series.rrule where id = v_target.id;
        end if;
      end if;
    elsif v_target.series_modified or v_target.status not in ('draft', 'planned', 'published')
          or v_target.starts_at < now() then
      -- Excepción o histórico: se conserva.
      null;
    elsif v_target.status = 'published' then
      -- Requiere activity.cancel (lo comprueba el trigger de estado).
      update activities set status = 'cancelled', cancellation_reason = 'Serie reprogramada'
      where id = v_target.id;
      v_cancelled := v_cancelled + 1;
      perform app.write_audit_log(
        v_activity.church_id, 'activity.cancelled', 'activities', v_target.id,
        jsonb_build_object('from', v_target.status, 'to', 'cancelled', 'cause', 'series_rule_changed', 'series_id', v_series_id)
      );
    else
      -- Borrador/planificada sin excepción ni histórico: se elimina.
      delete from activities where id = v_target.id;
      v_removed := v_removed + 1;
      perform app.write_audit_log(
        v_activity.church_id, 'activity.series_occurrence_removed', 'activities', v_target.id,
        jsonb_build_object('occurrence_date', v_target.occurrence_date, 'status', v_target.status, 'series_id', v_series_id)
      );
    end if;
  end loop;

  select a.id into v_first from activities a
  where a.series_id = v_series_id and a.occurrence_date >= v_activity.occurrence_date
    and a.status in ('draft', 'planned', 'published')
  order by a.occurrence_date limit 1;

  perform app.write_audit_log(
    v_activity.church_id, 'activity.updated', 'activity_series', v_series_id,
    jsonb_build_object('scope', 'series_rule', 'from_activity_id', v_activity.id, 'created', v_created,
      'removed', v_removed, 'cancelled', v_cancelled, 'updated', v_updated, 'rrule', v_series.rrule)
  );

  return jsonb_build_object(
    'series_id', v_series_id, 'first_activity_id', v_first, 'created', v_created,
    'removed', v_removed, 'cancelled', v_cancelled, 'updated', v_updated
  );
end;
$$;

-- Copia la estructura (áreas, puestos, requisitos, plan) de esta ocurrencia a
-- las siguientes ('future') o a todas ('all') las ocurrencias editables.
create or replace function app.apply_activity_structure_to_series(p_activity_id uuid, p_scope text)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_source activities%rowtype := app.lock_activity(p_activity_id);
  v_target activities%rowtype;
  v_count integer := 0;
begin
  if p_scope not in ('future', 'all') then
    raise exception 'Ámbito no válido.' using errcode = '22023';
  end if;
  if v_source.series_id is null then
    raise exception 'La actividad no pertenece a una serie.' using errcode = '22023';
  end if;
  perform app.require_activity_cap(v_source, 'activity.manage');
  -- Sin el módulo se borrarían áreas del destino sin poder copiarlas.
  perform app.require_serving_module(v_source.church_id);

  for v_target in
    select * from app.series_editable_occurrences(
      v_source.series_id, case when p_scope = 'future' then v_source.occurrence_date end
    )
  loop
    continue when v_target.id = v_source.id;
    -- Excepciones de estructura (editadas individualmente): se respetan.
    continue when v_target.series_structure_modified;
    perform 1 from activities where id = v_target.id for update;
    if not app.activity_cap(v_target.church_id, v_target.campus_id, v_target.id, 'activity.manage') then
      raise exception 'No tienes permiso para editar todas las ocurrencias afectadas.' using errcode = '42501';
    end if;
    delete from activity_service_areas where activity_id = v_target.id;
    delete from activity_plan_items where activity_id = v_target.id;
    perform app.copy_activity_structure(v_source.id, v_target.id);
    v_count := v_count + 1;
  end loop;

  perform app.write_audit_log(
    v_source.church_id, 'activity.updated', 'activity_series', v_source.series_id,
    jsonb_build_object('scope', p_scope, 'structure_from_activity_id', v_source.id, 'occurrences', v_count)
  );
  return v_count;
end;
$$;

-- Vista previa sin escribir: fechas e instantes que generaría una regla.
-- p_input: campus_id, timezone, local_start, local_end | duration_minutes, recurrence{...}
create or replace function app.preview_activity_recurrence(p_church_id uuid, p_input jsonb)
returns table (occurrence_date date, starts_at timestamptz, ends_at timestamptz)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v activity_series;
  v_local_start timestamp := app.parse_local_timestamp(p_input ->> 'local_start');
  v_local_end timestamp := app.parse_local_timestamp(p_input ->> 'local_end');
  v_start_instant timestamptz;
begin
  perform app.assert_church_member(p_church_id);
  if v_local_start is null then
    raise exception 'Indica la fecha y hora de inicio.' using errcode = '22023';
  end if;

  v.timezone := app.resolve_activity_timezone(p_church_id, nullif(p_input ->> 'campus_id', '')::uuid, p_input ->> 'timezone');
  v.starts_on := v_local_start::date;
  v.local_start_time := v_local_start::time;
  v_start_instant := app.local_to_instant(v_local_start, v.timezone);
  v.duration_minutes := coalesce(
    case when v_local_end is not null
      then (extract(epoch from (app.local_to_instant(v_local_end, v.timezone) - v_start_instant)) / 60)::integer end,
    nullif(p_input ->> 'duration_minutes', '')::integer
  );
  if v.duration_minutes is null or v.duration_minutes < 1 then
    raise exception 'Indica una hora de fin posterior al inicio o una duración.' using errcode = '22023';
  end if;
  v.month_day_fallback := 'skip';
  v := app.apply_recurrence_rule(v, p_input -> 'recurrence');

  return query
  select d, app.local_to_instant(d + v.local_start_time, v.timezone),
         app.local_to_instant(d + v.local_start_time, v.timezone) + make_interval(mins => v.duration_minutes)
  from app.series_dates(v) d;
end;
$$;

-- Wrappers públicos ----------------------------------------------------------
create or replace function public.update_activity_series(p_activity_id uuid, p_input jsonb, p_scope text)
returns jsonb language sql security invoker set search_path = pg_catalog, public
as $$ select app.update_activity_series(p_activity_id, p_input, p_scope); $$;

create or replace function public.update_activity_series_rule(p_activity_id uuid, p_input jsonb)
returns jsonb language sql security invoker set search_path = pg_catalog, public
as $$ select app.update_activity_series_rule(p_activity_id, p_input); $$;

create or replace function public.apply_activity_structure_to_series(p_activity_id uuid, p_scope text)
returns integer language sql security invoker set search_path = pg_catalog, public
as $$ select app.apply_activity_structure_to_series(p_activity_id, p_scope); $$;

create or replace function public.preview_activity_recurrence(p_church_id uuid, p_input jsonb)
returns table (occurrence_date date, starts_at timestamptz, ends_at timestamptz)
language sql stable security invoker set search_path = pg_catalog, public
as $$ select * from app.preview_activity_recurrence(p_church_id, p_input); $$;

do $grants$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'public.update_activity_series(uuid, jsonb, text)',
    'public.update_activity_series_rule(uuid, jsonb)',
    'public.apply_activity_structure_to_series(uuid, text)',
    'public.preview_activity_recurrence(uuid, jsonb)',
    'app.update_activity_series(uuid, jsonb, text)',
    'app.update_activity_series_rule(uuid, jsonb)',
    'app.apply_activity_structure_to_series(uuid, text)',
    'app.preview_activity_recurrence(uuid, jsonb)'
  ]
  loop
    execute format('revoke all on function %s from public, anon', v_signature);
    execute format('grant execute on function %s to authenticated', v_signature);
  end loop;
end;
$grants$;
