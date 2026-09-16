-- Fase 4 · Tests de recurrencia: reglas semanales y mensuales, límites, DST,
-- días 29-31, idempotencia, edición de una ocurrencia, de toda la serie y de
-- las futuras (división), cambio de regla con reconciliación y aplicación de
-- estructura a la serie. Ver docs/adr/0017.

begin;
select plan(53);

create or replace function test_set_auth_uid(p_uid uuid) returns void as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$ language plpgsql;

create or replace function t_set(p_key text, p_value text) returns text as $$
  select set_config('t4r.' || p_key, coalesce(p_value, ''), true);
$$ language sql;

create or replace function t_id(p_key text) returns uuid as $$
  select nullif(current_setting('t4r.' || p_key, true), '')::uuid;
$$ language sql;

-- Ocurrencia n (1..) de una serie por fecha.
create or replace function t_occ(p_series uuid, p_n integer) returns uuid as $$
  select id from activities where series_id = p_series order by occurrence_date offset p_n - 1 limit 1;
$$ language sql;

-- Fechas de ocurrencia de una serie, separadas por comas.
create or replace function t_dates(p_series uuid) returns text as $$
  select string_agg(occurrence_date::text, ',' order by occurrence_date) from activities where series_id = p_series;
$$ language sql;

-- Fechas de una vista previa.
create or replace function t_preview(p_church uuid, p_input jsonb) returns text as $$
  select string_agg(occurrence_date::text, ',' order by occurrence_date) from public.preview_activity_recurrence(p_church, p_input);
$$ language sql;

insert into auth.users (id, email) values
  ('c4000000-0000-0000-0000-000000000001', 'owner.p4r@example.test');

select test_set_auth_uid('c4000000-0000-0000-0000-000000000001');
select t_set('church', out_church_id::text)
from app.provision_church(
  'Church P4R', 'church-a-p4rec', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
  'Owner', 'A4R', 'owner.p4r@example.test', null, 'Sede R', null, null, null, null,
  array['people', 'serving'], null
);

reset role;

insert into service_areas (id, church_id, name, slug)
values ('c4000000-0000-0000-0000-0000000a0001', t_id('church'), 'Sonido', 'sonido');
insert into service_positions (id, church_id, service_area_id, name, min_people)
values ('c4000000-0000-0000-0000-0000000b0001', t_id('church'), 'c4000000-0000-0000-0000-0000000a0001', 'FOH', 1);
insert into qualifications (id, church_id, name)
values ('c4000000-0000-0000-0000-0000000d0001', t_id('church'), 'Mesa');
insert into position_requirements (church_id, service_position_id, requirement_type, qualification_id, min_level)
values (t_id('church'), 'c4000000-0000-0000-0000-0000000b0001', 'qualification', 'c4000000-0000-0000-0000-0000000d0001', 'basic');

select test_set_auth_uid('c4000000-0000-0000-0000-000000000001');

-- ============================================================
-- 1. Reglas
-- ============================================================
select lives_ok(
  $$ select t_set('w_series', r ->> 'series_id'), t_set('w_count', r ->> 'occurrences')
     from public.create_activity(t_id('church'),
       '{"type":"service","title":"Semanal","local_start":"2030-01-06T10:00","duration_minutes":60,"recurrence":{"frequency":"weekly","count":4}}'::jsonb) r $$,
  'Crear una serie semanal por número de ocurrencias funciona'
);

select is(
  t_dates(t_id('w_series')),
  '2030-01-06,2030-01-13,2030-01-20,2030-01-27',
  'Semanal count 4: cuatro domingos consecutivos'
);

select ok(
  current_setting('t4r.w_count') = '4'
  and (select count(distinct occurrence_date) = 4 and bool_and(status = 'draft')
          and bool_and(recurrence_rule = 'FREQ=WEEKLY;INTERVAL=1;BYDAY=SU;COUNT=4')
       from activities where series_id = t_id('w_series'))
  and (select rrule = 'FREQ=WEEKLY;INTERVAL=1;BYDAY=SU;COUNT=4' and weekdays = array[7]::smallint[]
       from activity_series where id = t_id('w_series')),
  'Las ocurrencias quedan vinculadas a la serie con fecha única y regla RRULE'
);

select ok(
  (select bool_and((starts_at at time zone 'Europe/Madrid')::time = '10:00' and ends_at - starts_at = interval '60 minutes')
   from activities where series_id = t_id('w_series')),
  'Cada ocurrencia conserva la hora local y la duración'
);

select lives_ok(
  $$ select t_set('w2_series', public.create_activity(t_id('church'),
       '{"type":"rehearsal","title":"Ensayo","local_start":"2030-01-07T20:00","duration_minutes":90,"recurrence":{"frequency":"weekly","interval":2,"weekdays":[1,3],"until_date":"2030-02-03"}}'::jsonb) ->> 'series_id') $$,
  'Crear una serie cada 2 semanas (lunes y miércoles) hasta fecha funciona'
);

select is(
  t_dates(t_id('w2_series')),
  '2030-01-07,2030-01-09,2030-01-21,2030-01-23',
  'Cada 2 semanas hasta fecha: respeta el intervalo, los días y el límite'
);

select lives_ok(
  $$ select t_set('m_series', public.create_activity(t_id('church'),
       '{"type":"meeting","title":"Mensual","local_start":"2030-01-15T19:00","duration_minutes":60,"recurrence":{"frequency":"monthly","monthly_mode":"day_of_month","count":3}}'::jsonb) ->> 'series_id') $$,
  'Crear una serie mensual por día del mes funciona'
);

select is(
  t_dates(t_id('m_series')),
  '2030-01-15,2030-02-15,2030-03-15',
  'Mensual day_of_month: mismo día cada mes'
);

select is(
  t_preview(t_id('church'), '{"local_start":"2030-01-13T11:00","duration_minutes":60,"recurrence":{"frequency":"monthly","monthly_mode":"nth_weekday","week_of_month":2,"month_weekday":7,"count":3}}'::jsonb),
  '2030-01-13,2030-02-10,2030-03-10',
  'Mensual nth_weekday: segundo domingo de cada mes'
);

select is(
  t_preview(t_id('church'), '{"local_start":"2030-01-01T19:00","duration_minutes":60,"recurrence":{"frequency":"monthly","monthly_mode":"nth_weekday","week_of_month":-1,"month_weekday":5,"count":3}}'::jsonb),
  '2030-01-25,2030-02-22,2030-03-29',
  'Mensual nth_weekday -1: último viernes de cada mes'
);

select is(
  t_preview(t_id('church'), '{"local_start":"2030-03-01T11:00","duration_minutes":60,"recurrence":{"frequency":"monthly","monthly_mode":"nth_weekday","week_of_month":5,"month_weekday":7,"count":2}}'::jsonb),
  '2030-03-31,2030-06-30',
  'Quinto domingo con skip: los meses sin quinto domingo no tienen ocurrencia'
);

select is(
  t_preview(t_id('church'), '{"local_start":"2030-03-01T11:00","duration_minutes":60,"recurrence":{"frequency":"monthly","monthly_mode":"nth_weekday","week_of_month":5,"month_weekday":7,"month_day_fallback":"last_day","count":3}}'::jsonb),
  '2030-03-31,2030-04-28,2030-05-26',
  'Quinto domingo con last_day: se usa el último domingo del mes'
);

-- ============================================================
-- 2. Límites y validaciones
-- ============================================================
select throws_ok(
  $$ select public.create_activity(t_id('church'), '{"type":"service","title":"Demasiadas","local_start":"2030-01-06T10:00","duration_minutes":60,"recurrence":{"frequency":"weekly","count":201}}'::jsonb) $$,
  '22023', null,
  'Más de 200 ocurrencias se rechaza'
);

select throws_ok(
  $$ select public.create_activity(t_id('church'), '{"type":"service","title":"Muy larga","local_start":"2030-01-06T10:00","duration_minutes":60,"recurrence":{"frequency":"weekly","until_date":"2032-01-08"}}'::jsonb) $$,
  '22023', null,
  'Una fecha de fin a más de dos años se rechaza'
);

select throws_ok(
  $$ select public.create_activity(t_id('church'), '{"type":"service","title":"Sin fin","local_start":"2030-01-06T10:00","duration_minutes":60,"recurrence":{"frequency":"weekly"}}'::jsonb) $$,
  '22023', null,
  'Una repetición sin fecha de fin ni número de ocurrencias se rechaza'
);

select throws_ok(
  $$ select public.create_activity(t_id('church'), '{"type":"task","title":"Tarea repetida","schedule_kind":"flexible","recurrence":{"frequency":"weekly","count":3}}'::jsonb) $$,
  '22023', null,
  'Una actividad flexible no puede repetirse'
);

select is(
  (select count(*)::int from activities where title in ('Demasiadas', 'Muy larga', 'Sin fin', 'Tarea repetida')),
  0,
  'Las altas recurrentes rechazadas no dejan ocurrencias'
);

-- ============================================================
-- 3. DST
-- ============================================================
select lives_ok(
  $$ select t_set('ny_series', public.create_activity(t_id('church'),
       '{"type":"service","title":"Culto NY","timezone":"America/New_York","local_start":"2030-10-20T11:00","duration_minutes":60,"recurrence":{"frequency":"weekly","count":3}}'::jsonb) ->> 'series_id') $$,
  'Crear serie semanal en America/New_York funciona'
);

select is(
  (select string_agg(to_char(starts_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI'), ',' order by occurrence_date)
   from activities where series_id = t_id('ny_series')),
  '2030-10-20 15:00,2030-10-27 15:00,2030-11-03 16:00',
  'Domingo 11:00 en Nueva York: 15:00 UTC antes del cambio de hora y 16:00 UTC después'
);

select ok(
  (select bool_and(timezone = 'America/New_York' and (starts_at at time zone 'America/New_York')::time = '11:00')
   from activities where series_id = t_id('ny_series'))
  and (select timezone = 'America/New_York' from activity_series where id = t_id('ny_series')),
  'La hora local 11:00 se conserva en todas las ocurrencias'
);

select is(
  (select string_agg(to_char(starts_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI'), ',' order by occurrence_date)
   from public.preview_activity_recurrence(t_id('church'),
     '{"local_start":"2030-03-24T02:30","duration_minutes":60,"recurrence":{"frequency":"weekly","count":2}}'::jsonb)),
  '2030-03-24 01:30,2030-03-31 01:30',
  'Europe/Madrid: 02:30 inexistente (31-mar) se desplaza hacia delante (03:30 CEST = 01:30 UTC)'
);

select is(
  (select to_char(starts_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI')
   from public.preview_activity_recurrence(t_id('church'),
     '{"local_start":"2030-10-27T02:30","duration_minutes":60,"recurrence":{"frequency":"weekly","count":1}}'::jsonb)),
  '2030-10-27 01:30',
  'Europe/Madrid: 02:30 ambigua (27-oct) se resuelve en horario estándar (01:30 UTC)'
);

-- ============================================================
-- 4. Días 29-31
-- ============================================================
select is(
  t_preview(t_id('church'), '{"local_start":"2031-01-31T10:00","duration_minutes":60,"recurrence":{"frequency":"monthly","count":4}}'::jsonb),
  '2031-01-31,2031-03-31,2031-05-31,2031-07-31',
  'Día 31 con skip: solo meses de 31 días'
);

select is(
  t_preview(t_id('church'), '{"local_start":"2027-01-31T10:00","duration_minutes":60,"recurrence":{"frequency":"monthly","count":4,"month_day_fallback":"last_day"}}'::jsonb),
  '2027-01-31,2027-02-28,2027-03-31,2027-04-30',
  'Día 31 con last_day: último día de cada mes'
);

select is(
  t_preview(t_id('church'), '{"local_start":"2031-01-29T10:00","duration_minutes":60,"recurrence":{"frequency":"monthly","count":3}}'::jsonb),
  '2031-01-29,2031-03-29,2031-04-29',
  'Día 29 con skip en año no bisiesto: febrero sin ocurrencia'
);

select is(
  t_preview(t_id('church'), '{"local_start":"2032-01-29T10:00","duration_minutes":60,"recurrence":{"frequency":"monthly","count":2}}'::jsonb),
  '2032-01-29,2032-02-29',
  'Día 29 en año bisiesto: febrero sí tiene ocurrencia'
);

select is(
  (select count(*)::int from activity_series
   where church_id = t_id('church')
     and starts_on in ('2030-01-13', '2030-01-01', '2030-03-01', '2030-03-24', '2030-10-27',
                       '2031-01-31', '2027-01-31', '2031-01-29', '2032-01-29')),
  0,
  'La vista previa no escribe series'
);

-- ============================================================
-- 5. Idempotencia
-- ============================================================
select lives_ok(
  $$ select t_set('idem_first', public.create_activity(t_id('church'),
       '{"request_id":"c4000000-0000-0000-0000-0000000f0001","type":"service","title":"Idempotente","local_start":"2030-02-03T10:00","duration_minutes":60,"recurrence":{"frequency":"weekly","count":3}}'::jsonb)::text) $$,
  'Alta recurrente con request_id funciona'
);

select ok(
  (select (r ->> 'replayed')::boolean
      and r ->> 'activity_id' = current_setting('t4r.idem_first')::jsonb ->> 'activity_id'
      and r ->> 'series_id' = current_setting('t4r.idem_first')::jsonb ->> 'series_id'
   from public.create_activity(t_id('church'),
     '{"request_id":"c4000000-0000-0000-0000-0000000f0001","type":"service","title":"Idempotente","local_start":"2030-02-03T10:00","duration_minutes":60,"recurrence":{"frequency":"weekly","count":3}}'::jsonb) r),
  'Repetir el alta con el mismo request_id devuelve la misma serie y ocurrencia'
);

select ok(
  (select count(*) = 1 from activity_series where creation_request_id = 'c4000000-0000-0000-0000-0000000f0001')
  and (select count(*) = 3 from activities where title = 'Idempotente'),
  'El reintento no duplica la serie ni las ocurrencias'
);

-- ============================================================
-- 6. Editar una ocurrencia y toda la serie
-- ============================================================
select lives_ok(
  $$ select public.update_activity(t_occ(t_id('w_series'), 2), '{"title":"Especial"}'::jsonb) $$,
  'Editar solo una ocurrencia funciona'
);

select ok(
  (select series_modified and title = 'Especial' from activities where id = t_occ(t_id('w_series'), 2)),
  'Editar solo esta ocurrencia la marca como excepción'
);

select is(
  (select (public.update_activity_series(t_occ(t_id('w_series'), 1), '{"title":"Semanal nuevo","local_start_time":"09:30"}'::jsonb, 'all') ->> 'updated')::int),
  3,
  'Editar toda la serie actualiza las ocurrencias no modificadas'
);

select ok(
  (select title = 'Especial' and (starts_at at time zone 'Europe/Madrid')::time = '10:00'
   from activities where id = t_occ(t_id('w_series'), 2))
  and (select bool_and(title = 'Semanal nuevo' and (starts_at at time zone 'Europe/Madrid')::time = '09:30'
                       and ends_at - starts_at = interval '60 minutes')
       from activities where series_id = t_id('w_series') and not series_modified)
  and (select title = 'Semanal nuevo' and local_start_time = '09:30' from activity_series where id = t_id('w_series')),
  'La edición de toda la serie no sobrescribe la excepción y actualiza la regla'
);

select throws_ok(
  $$ select public.update_activity_series(t_occ(t_id('w_series'), 1), '{"local_start":"2030-01-07T10:00"}'::jsonb, 'all') $$,
  '22023', null,
  'Cambiar la fecha no se admite en ediciones de serie'
);

-- ============================================================
-- 7. Editar esta y las siguientes (división)
-- ============================================================
select t_set('f_series', public.create_activity(t_id('church'),
  '{"type":"service","title":"Futura","local_start":"2030-02-03T18:00","duration_minutes":60,"recurrence":{"frequency":"weekly","count":4}}'::jsonb) ->> 'series_id');
select t_set('f_occ1', t_occ(t_id('f_series'), 1)::text);
select t_set('f_occ3', t_occ(t_id('f_series'), 3)::text);

select lives_ok(
  $$ select t_set('f_new_series', public.update_activity_series(t_id('f_occ3'), '{"location_text":"Salón"}'::jsonb, 'future') ->> 'series_id') $$,
  'Editar esta y las siguientes funciona'
);

select ok(
  t_id('f_new_series') <> t_id('f_series')
  and (select until_date = '2030-02-16' and occurrence_count is null from activity_series where id = t_id('f_series'))
  and (select split_from_series_id = t_id('f_series') and starts_on = '2030-02-17' and occurrence_count = 2
       from activity_series where id = t_id('f_new_series')),
  'La serie original termina el día anterior y la nueva registra split_from_series_id'
);

select ok(
  t_dates(t_id('f_series')) = '2030-02-03,2030-02-10'
  and t_dates(t_id('f_new_series')) = '2030-02-17,2030-02-24'
  and (select bool_and(location_text is null) from activities where series_id = t_id('f_series'))
  and (select bool_and(location_text = 'Salón') from activities where series_id = t_id('f_new_series')),
  'Solo las ocurrencias desde la elegida pasan a la nueva serie y reciben el cambio'
);

-- ============================================================
-- 8. Cambio de regla con reconciliación
-- ============================================================
select t_set('r_series', public.create_activity(t_id('church'),
  '{"type":"service","title":"Regla","local_start":"2030-09-01T11:00","duration_minutes":60,"recurrence":{"frequency":"weekly","count":6}}'::jsonb) ->> 'series_id');
select t_set('r_occ1', t_occ(t_id('r_series'), 1)::text);
select t_set('r_occ2', t_occ(t_id('r_series'), 2)::text);
select t_set('r_occ3', t_occ(t_id('r_series'), 3)::text);
select t_set('r_occ4', t_occ(t_id('r_series'), 4)::text);
select t_set('r_occ5', t_occ(t_id('r_series'), 5)::text);
select t_set('r_occ6', t_occ(t_id('r_series'), 6)::text);
select public.transition_activity_status(t_id('r_occ2'), 'published');
select public.update_activity(t_id('r_occ6'), '{"description":"Excepción"}'::jsonb);

select ok(
  (select (r ->> 'removed')::int = 1 and (r ->> 'cancelled')::int = 1 and (r ->> 'updated')::int = 3
      and (r ->> 'created')::int = 0 and (r ->> 'series_id')::uuid = t_id('r_series')
   from public.update_activity_series_rule(t_id('r_occ1'),
     '{"frequency":"weekly","interval":2,"count":3,"local_start_time":"12:00"}'::jsonb) r),
  'Cambiar la regla reconcilia: 1 borrador eliminado, 1 publicada cancelada, 3 reprogramadas'
);

select ok(
  not exists (select 1 from activities where id = t_id('r_occ4'))
  and (select status = 'cancelled' and cancellation_reason = 'Serie reprogramada' from activities where id = t_id('r_occ2'))
  and (select status = 'draft' and series_modified and (starts_at at time zone 'Europe/Madrid')::time = '11:00'
       from activities where id = t_id('r_occ6')),
  'El borrador sobrante se elimina, la publicada se cancela con motivo y la excepción se conserva'
);

select ok(
  (select bool_and((starts_at at time zone 'Europe/Madrid')::time = '12:00')
   from activities where id in (t_id('r_occ1'), t_id('r_occ3'), t_id('r_occ5')))
  and (select rrule = 'FREQ=WEEKLY;INTERVAL=2;BYDAY=SU;COUNT=3' and local_start_time = '12:00'
       from activity_series where id = t_id('r_series')),
  'Las ocurrencias que siguen encajando se mueven a la nueva hora local'
);

select ok(
  (select (r ->> 'created')::int = 2 and (r ->> 'removed')::int = 2 and (r ->> 'cancelled')::int = 0
   from public.update_activity_series_rule(t_id('r_occ1'),
     '{"frequency":"weekly","interval":1,"weekdays":[3,7],"count":4}'::jsonb) r)
  and t_dates(t_id('r_series')) = '2030-09-01,2030-09-04,2030-09-08,2030-09-11,2030-10-06',
  'Una regla con fechas nuevas crea las que faltan sin duplicar fechas existentes (canceladas incluidas)'
);

-- ============================================================
-- 9. Aplicar estructura a la serie
-- ============================================================
select t_set('s_series', public.create_activity(t_id('church'),
  '{"type":"service","title":"Estructura","local_start":"2030-04-07T11:00","duration_minutes":90,"recurrence":{"frequency":"weekly","count":4}}'::jsonb) ->> 'series_id');
select t_set('s_occ1', t_occ(t_id('s_series'), 1)::text);
select t_set('s_occ2', t_occ(t_id('s_series'), 2)::text);
select t_set('s_occ3', t_occ(t_id('s_series'), 3)::text);
select t_set('s_occ4', t_occ(t_id('s_series'), 4)::text);
select public.add_activity_area(t_id('s_occ1'), 'c4000000-0000-0000-0000-0000000a0001');
select public.add_activity_plan_item(t_id('s_occ1'), '{"item_type":"song","title":"Alabanza","duration_minutes":20}'::jsonb);
select public.update_activity(t_id('s_occ3'), '{"title":"Estructura especial"}'::jsonb);

select is(
  public.apply_activity_structure_to_series(t_id('s_occ1'), 'all'),
  2,
  'Aplicar la estructura a toda la serie afecta a las ocurrencias no modificadas'
);

select ok(
  (select bool_and(
     (select count(*) from activity_service_areas where activity_id = a.id) = 1
     and (select count(*) from activity_positions where activity_id = a.id) = 1
     and (select count(*) from activity_position_requirements where activity_id = a.id and origin = 'inherited') = 1
     and (select count(*) from activity_plan_items where activity_id = a.id) = 1)
   from activities a where a.id in (t_id('s_occ2'), t_id('s_occ4')))
  and (select count(*) = 0 from activity_service_areas where activity_id = t_id('s_occ3')),
  'La estructura se copia a las ocurrencias editables y la excepción queda intacta'
);

select is(
  public.apply_activity_structure_to_series(t_id('s_occ1'), 'all'),
  2,
  'Volver a aplicar la estructura (reemplazando requisitos heredados) funciona'
);

select ok(
  (select bool_and((select count(*) from activity_service_areas where activity_id = a.id) = 1
                   and (select count(*) from activity_position_requirements where activity_id = a.id) = 1)
   from activities a where a.id in (t_id('s_occ2'), t_id('s_occ4'))),
  'Reaplicar reemplaza la estructura sin duplicarla'
);

select is(
  public.apply_activity_structure_to_series(t_id('s_occ2'), 'future'),
  1,
  'Aplicar a las siguientes solo afecta a ocurrencias posteriores no modificadas'
);

select t_set('s_dup', public.duplicate_activity(t_id('s_occ2')) ->> 'activity_id');

select ok(
  (select series_id is null and occurrence_date is null and not series_modified
      and duplicated_from_activity_id = t_id('s_occ2')
      and (select count(*) from activity_service_areas s where s.activity_id = a.id) = 1
   from activities a
   where a.id = t_id('s_dup')),
  'Duplicar una ocurrencia crea una actividad puntual fuera de la serie'
);

-- ============================================================
-- 10. Ocurrencias pasadas y completadas
-- ============================================================
select t_set('p_series', public.create_activity(t_id('church'),
  '{"type":"service","title":"Pasada","local_start":"2020-01-05T11:00","duration_minutes":60,"recurrence":{"frequency":"weekly","count":3}}'::jsonb) ->> 'series_id');
select t_set('p_occ1', t_occ(t_id('p_series'), 1)::text);
select public.transition_activity_status(t_id('p_occ1'), 'published');
select public.transition_activity_status(t_id('p_occ1'), 'completed');

select is(
  (select (public.update_activity_series(t_id('p_occ1'), '{"title":"Pasada nueva"}'::jsonb, 'all') ->> 'updated')::int),
  0,
  'Editar toda la serie no toca ocurrencias pasadas'
);

select ok(
  (select bool_and(title = 'Pasada') from activities where series_id = t_id('p_series'))
  and (select status = 'completed' from activities where id = t_id('p_occ1')),
  'Las ocurrencias pasadas y completadas conservan su contenido y estado'
);

select ok(
  (select (r ->> 'removed')::int = 0 and (r ->> 'cancelled')::int = 0 and (r ->> 'updated')::int = 0
   from public.update_activity_series_rule(t_id('p_occ1'), '{"frequency":"weekly","count":1}'::jsonb) r)
  and (select count(*) = 3 from activities where title = 'Pasada'),
  'Cambiar la regla no elimina ni cancela ocurrencias pasadas'
);

-- ============================================================
-- 11. Serie desde plantilla
-- ============================================================
select t_set('tpl', public.save_activity_template(t_id('church'), null,
  '{"name":"Culto con sonido","type":"service","default_duration_minutes":60,"areas":[{"service_area_id":"c4000000-0000-0000-0000-0000000a0001","positions":[{"service_position_id":"c4000000-0000-0000-0000-0000000b0001"}]}]}'::jsonb)::text);

select t_set('tpl_series', public.create_activity(t_id('church'), jsonb_build_object(
  'template_id', t_id('tpl'), 'local_start', '2030-05-05T11:00',
  'recurrence', jsonb_build_object('frequency', 'weekly', 'count', 2))) ->> 'series_id');

select ok(
  (select bool_and(template_id = t_id('tpl')
                   and (select count(*) from activity_positions ap where ap.activity_id = a.id) = 1
                   and (select count(*) from activity_position_requirements r where r.activity_id = a.id) = 1)
          and count(*) = 2
   from activities a
   where a.series_id = t_id('tpl_series')),
  'Una serie creada desde plantilla copia la estructura en cada ocurrencia'
);

reset role;

select ok(
  (select count(*) >= 1 from audit_logs where action = 'activity.updated' and entity_type = 'activity_series' and entity_id = t_id('r_series')),
  'Las ediciones de serie se auditan sobre activity_series'
);

select * from finish();
rollback;
