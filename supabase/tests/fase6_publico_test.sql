-- Fase 6 · Tests de la superficie PÚBLICA de eventos, ejecutados con el rol
-- real (`set role anon`, como las suites de las fases 4 y 5) y con dos
-- iglesias, para comprobar que un visitante sin sesión no puede leer, escribir
-- ni suplantar nada fuera de lo estrictamente publicado.
--
-- Cubre los fallos corregidos en las migraciones 20260925*:
--   F-01 fuga de consent_definitions entre iglesias
--   F-02 suplantación de personas en la inscripción
--   F-03 avisos a los inscritos sin capability
--   F-04 inscripción en eventos no públicos
--   F-05 privilegios por defecto de `anon` sobre las nueve tablas nuevas
--   F-06 abuso de la RPC de inscripción saltándose la Server Action
--   F-07 replay idempotente ajeno que entregaba el cancel_token
--   F-09 evento público sobre una activity de audiencia restringida
--   F-11 envoltorio público del estado de inscripción
--   y la revocación de app.assert_active_church_person a `anon`.

begin;
select plan(44);

create or replace function test_set_auth_uid(p_uid uuid) returns void as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$ language plpgsql;

-- Sin sesión de verdad: `reset role` no borra las claims del JWT, así que
-- auth.uid() seguiría devolviendo al último usuario autenticado.
create or replace function test_set_anon() returns void as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
end;
$$ language plpgsql;

create or replace function t_set(p_key text, p_value text) returns text as $$
  select set_config('t6p.' || p_key, coalesce(p_value, ''), true);
$$ language sql;

create or replace function t_id(p_key text) returns uuid as $$
  select nullif(current_setting('t6p.' || p_key, true), '')::uuid;
$$ language sql;

-- Ejecuta un SQL y devuelve su SQLSTATE ('ok' si no falla): más cómodo que
-- throws_ok cuando hace falta interpolar identificadores.
create or replace function t_err(p_sql text) returns text as $$
declare
  v_state text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics v_state = returned_sqlstate;
  return v_state;
end;
$$ language plpgsql;

create or replace function t_create_event_activity(
  p_church_id uuid,
  p_title text,
  p_visibility activity_visibility,
  p_offset interval default interval '10 days'
) returns uuid as $$
declare
  v_id uuid;
begin
  v_id := (app.create_activity(
    p_church_id,
    jsonb_build_object(
      'type', 'event', 'title', p_title, 'schedule_kind', 'timed',
      'local_start', to_char((now() + p_offset), 'YYYY-MM-DD HH24:MI:SS'),
      'local_end', to_char((now() + p_offset + interval '2 hours'), 'YYYY-MM-DD HH24:MI:SS'),
      'timezone', 'Europe/Madrid',
      'visibility', p_visibility
    )
  ) ->> 'activity_id')::uuid;
  perform app.transition_activity_status(v_id, 'planned');
  perform app.transition_activity_status(v_id, 'published');
  return v_id;
end;
$$ language plpgsql;

-- Tablas de la Fase 6 que `anon` no debe poder leer en absoluto. `events` no
-- está: su política events_select_public es la superficie pública legítima.
create or replace function t_anon_readable_tables() returns text[] as $$
declare
  v_rel text;
  v_out text[] := '{}';
begin
  foreach v_rel in array array[
    'forms', 'form_fields', 'form_submissions', 'form_submission_answers',
    'registrations', 'registration_attendees', 'consent_definitions', 'consent_records'
  ] loop
    begin
      execute format('select 1 from %I limit 1', v_rel);
      v_out := v_out || v_rel;
    exception when insufficient_privilege then
      null;
    end;
  end loop;
  return v_out;
end;
$$ language plpgsql;

create or replace function t_bulk_register(p_event_id uuid, p_n integer, p_prefix text)
returns integer as $$
declare
  i integer;
begin
  for i in 1..p_n loop
    perform * from app.register_for_event(
      p_event_id, 'individual', p_prefix || i, p_prefix || i || '@example.test',
      null, null, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, p_prefix || '-' || i
    );
  end loop;
  return p_n;
end;
$$ language plpgsql;

-- ============================================================
-- Aprovisionamiento: dos iglesias
-- ============================================================
insert into auth.users (id, email) values
  ('76000000-0000-0000-0000-000000000001', 'owner.a.pub6@example.test'),
  ('76000000-0000-0000-0000-000000000002', 'owner.b.pub6@example.test'),
  ('76000000-0000-0000-0000-000000000003', 'marta.pub6@example.test');

select test_set_auth_uid('76000000-0000-0000-0000-000000000001');
select t_set('church_a', out_church_id::text)
from app.provision_church(
  'Iglesia A Pub6', 'church-a-pub6', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
  'Owner', 'APub6', 'owner.a.pub6@example.test', null, 'Sede A Pub6', null, null, null, null,
  array['people', 'events'], null
);

select test_set_auth_uid('76000000-0000-0000-0000-000000000002');
select t_set('church_b', out_church_id::text)
from app.provision_church(
  'Iglesia B Pub6', 'church-b-pub6', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
  'Owner', 'BPub6', 'owner.b.pub6@example.test', null, 'Sede B Pub6', null, null, null, null,
  array['people', 'events'], null
);

reset role;

-- Personas: Marta (miembro con cuenta en A), Otra Persona (miembro de A sin
-- cuenta) y Berta (miembro de B).
insert into people (id, user_id, first_name, last_name, source) values
  ('76000000-0000-0000-0000-0000000e0003', '76000000-0000-0000-0000-000000000003', 'Marta', 'Miembro', 'manual'),
  ('76000000-0000-0000-0000-0000000e0004', null, 'Otra', 'Persona', 'manual'),
  ('76000000-0000-0000-0000-0000000e0005', null, 'Berta', 'DeB', 'manual');

insert into church_people (id, church_id, person_id, relationship, source) values
  ('76000000-0000-0000-0000-0000000f0003', t_id('church_a'), '76000000-0000-0000-0000-0000000e0003', 'member', 'manual'),
  ('76000000-0000-0000-0000-0000000f0004', t_id('church_a'), '76000000-0000-0000-0000-0000000e0004', 'member', 'manual'),
  ('76000000-0000-0000-0000-0000000f0005', t_id('church_b'), '76000000-0000-0000-0000-0000000e0005', 'member', 'manual');

insert into church_people_roles (church_id, church_people_id, role_key, scope_type, scope_id) values
  (t_id('church_a'), '76000000-0000-0000-0000-0000000f0003', 'member', 'church', null);

-- Eventos de A ---------------------------------------------------------------
select test_set_auth_uid('76000000-0000-0000-0000-000000000001');
select t_set('act_publico_a', t_create_event_activity(t_id('church_a'), 'Concierto abierto A', 'public_future')::text);
select t_set('act_interno_a', t_create_event_activity(t_id('church_a'), 'Reunión de líderes A', 'members', interval '11 days')::text);
select t_set('act_falso_publico_a', t_create_event_activity(t_id('church_a'), 'Retiro restringido A', 'leaders', interval '12 days')::text);
select t_set('act_aforo_a', t_create_event_activity(t_id('church_a'), 'Evento de aforo A', 'public_future', interval '13 days')::text);

select test_set_auth_uid('76000000-0000-0000-0000-000000000002');
select t_set('act_publico_b', t_create_event_activity(t_id('church_b'), 'Concierto abierto B', 'public_future')::text);

reset role;

insert into events (id, church_id, activity_id, public_slug, visibility, registration_enabled) values
  ('76000000-0000-0000-0000-0000000b0001', t_id('church_a'), t_id('act_publico_a'), 'evento-publico-a6', 'public', true),
  ('76000000-0000-0000-0000-0000000b0002', t_id('church_a'), t_id('act_interno_a'), 'evento-interno-a6', 'internal', true),
  -- Trampa de F-09: el evento se marca público, pero su activity es de
  -- audiencia 'leaders'. No debe ser legible ni inscribible sin sesión.
  ('76000000-0000-0000-0000-0000000b0003', t_id('church_a'), t_id('act_falso_publico_a'), 'evento-falso-publico-a6', 'public', true),
  ('76000000-0000-0000-0000-0000000b0004', t_id('church_a'), t_id('act_aforo_a'), 'evento-aforo-a6', 'public', true),
  ('76000000-0000-0000-0000-0000000b0005', t_id('church_b'), t_id('act_publico_b'), 'evento-publico-b6', 'public', true);

insert into consent_definitions (church_id, key, purpose_type, title, body, version, active) values
  (t_id('church_a'), 'consent_a6', 'operational', 'Datos de inscripción de A',
   'Asociación Iglesia A Pub6, calle de A 1, responsable del tratamiento: Owner APub6.', 1, true),
  (t_id('church_b'), 'consent_b6', 'operational', 'Datos de inscripción de B',
   'Asociación Iglesia B Pub6, calle de B 2, responsable del tratamiento: Owner BPub6.', 1, true);

-- ============================================================
-- 1. Privilegios de tabla de `anon` sobre las nueve tablas (F-05)
-- ============================================================
select is(
  (select count(*)::int from unnest(array[
    'events', 'forms', 'form_fields', 'form_submissions', 'form_submission_answers',
    'registrations', 'registration_attendees', 'consent_definitions', 'consent_records'
  ]) t(rel) where has_table_privilege('anon', rel, 'insert')),
  0,
  'anon no tiene INSERT en ninguna de las nueve tablas de la Fase 6'
);

select is(
  (select count(*)::int from unnest(array[
    'events', 'forms', 'form_fields', 'form_submissions', 'form_submission_answers',
    'registrations', 'registration_attendees', 'consent_definitions', 'consent_records'
  ]) t(rel) where has_table_privilege('anon', rel, 'update')
     or has_table_privilege('anon', rel, 'delete')
     or has_table_privilege('anon', rel, 'truncate')),
  0,
  'anon no tiene UPDATE, DELETE ni TRUNCATE en ninguna de las nueve tablas'
);

select is(
  (select count(*)::int from unnest(array[
    'forms', 'form_fields', 'form_submissions', 'form_submission_answers',
    'registrations', 'registration_attendees', 'consent_definitions', 'consent_records'
  ]) t(rel) where has_table_privilege('anon', rel, 'select')),
  0,
  'anon no tiene SELECT en ninguna de las nueve tablas salvo events'
);

select ok(
  has_table_privilege('anon', 'events', 'select'),
  'anon conserva SELECT sobre events: es la superficie pública legítima (events_select_public)'
);

select is(
  (select count(*)::int from unnest(array[
    'form_submissions', 'form_submission_answers', 'registrations',
    'registration_attendees', 'consent_records'
  ]) t(rel) where has_table_privilege('authenticated', rel, 'insert')
     or has_table_privilege('authenticated', rel, 'update')
     or has_table_privilege('authenticated', rel, 'delete')),
  0,
  'authenticated tampoco escribe directamente el circuito de inscripción: solo por RPC'
);

-- ============================================================
-- 2. Superficie de funciones
-- ============================================================
select ok(
  not has_function_privilege('anon', 'app.assert_active_church_person(uuid, uuid, text)', 'execute'),
  'anon no puede ejecutar app.assert_active_church_person (era un oráculo de pertenencia)'
);

select ok(
  not has_function_privilege('anon', 'app.event_notification_payload(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'app.event_notification_payload(uuid)', 'execute'),
  'app.event_notification_payload queda para uso interno: ni anon ni authenticated la ejecutan (F-03)'
);

select ok(
  not has_function_privilege('anon', 'app.event_registration_status(uuid)', 'execute')
  and has_function_privilege('anon', 'public.event_registration_status(uuid)', 'execute'),
  'anon solo alcanza el envoltorio público del estado de inscripción, no la función interna (F-11)'
);

select is(
  (select count(*)::int from pg_policies
   where tablename = 'consent_definitions' and policyname = 'consent_definitions_select_public'),
  0,
  'La política que exponía las cláusulas de todas las iglesias ya no existe (F-01)'
);

-- ============================================================
-- 3. Lectura como `anon` real
-- ============================================================
select test_set_anon();

select is(
  t_anon_readable_tables(),
  '{}'::text[],
  'anon no puede leer ninguna de las ocho tablas no públicas de la Fase 6'
);

select is(
  (select count(*)::int from events),
  3,
  'anon solo ve los tres eventos realmente públicos (dos de A y uno de B), de cinco existentes'
);

select is(
  (select count(*)::int from events where church_id = t_id('church_b')),
  1,
  'De la segunda iglesia, anon solo ve su evento público, nada más'
);

select is(
  (select count(*)::int from events where id = '76000000-0000-0000-0000-0000000b0002'),
  0,
  'anon no ve el evento visibility=internal'
);

select is(
  (select count(*)::int from events where id = '76000000-0000-0000-0000-0000000b0003'),
  0,
  'anon no ve un evento marcado público sobre una activity de audiencia restringida (F-09)'
);

select ok(
  not app.can_read_event_public('76000000-0000-0000-0000-0000000b0003'),
  'app.can_read_event_public exige también que la activity sea public_future (F-09)'
);

select is(
  (select count(*)::int from public.public_event_by_slug('church-a-pub6', 'evento-publico-a6')),
  1,
  'anon lee el evento público de A por slug de iglesia + slug de evento'
);

select is(
  (select count(*)::int from public.public_event_by_slug('church-a-pub6', 'evento-publico-b6')),
  0,
  'El slug de un evento de B no se resuelve bajo la iglesia A'
);

select is(
  (select count(*)::int from public.public_event_by_slug('church-a-pub6', 'evento-interno-a6')),
  0,
  'anon no lee por slug un evento interno'
);

select is(
  (select public.event_registration_status('76000000-0000-0000-0000-0000000b0001'::uuid)::text),
  'open',
  'anon obtiene el estado de inscripción de un evento público'
);

select ok(
  (select public.event_registration_status('76000000-0000-0000-0000-0000000b0002'::uuid)) is null,
  'anon no obtiene el estado de inscripción de un evento interno (F-11)'
);

-- ============================================================
-- 4. Consentimientos: nunca los de otra iglesia (F-01)
-- ============================================================
select is(
  (select count(*)::int from public.public_consent_definitions('church-a-pub6')),
  1,
  'anon obtiene solo la cláusula de la iglesia pedida por slug'
);

select is(
  (select consent_key from public.public_consent_definitions('church-a-pub6')),
  'consent_a6',
  'La cláusula devuelta es la de la iglesia A'
);

select is(
  (select count(*)::int from public.public_consent_definitions('church-a-pub6') where consent_key = 'consent_b6'),
  0,
  'La cláusula de la iglesia B no aparece al consultar la iglesia A (fuga entre inquilinos cerrada)'
);

select is(
  (select count(*)::int from public.public_consent_definitions('slug-que-no-existe')),
  0,
  'Un slug inexistente no devuelve ninguna cláusula'
);

-- ============================================================
-- 5. Inscripción sin sesión: visibilidad (F-04)
-- ============================================================
select is(
  t_err($$ select * from app.register_for_event(
    '76000000-0000-0000-0000-0000000b0002', 'individual', 'Intruso', 'intruso@example.test',
    null, null, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'idem-intruso') $$),
  'P0002',
  'anon no puede inscribirse en un evento interno ni conociendo su uuid (F-04)'
);

select is(
  t_err($$ select * from app.register_for_event(
    '76000000-0000-0000-0000-0000000b0003', 'individual', 'Intruso2', 'intruso2@example.test',
    null, null, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'idem-intruso2') $$),
  'P0002',
  'anon no puede inscribirse en un evento público sobre una activity restringida (F-09)'
);

select is(
  (select status::text from app.register_for_event(
    '76000000-0000-0000-0000-0000000b0001', 'individual', 'Visitante Uno', 'visitante1@example.test',
    null, null, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'idem-visitante1')),
  'confirmed',
  'anon sí puede inscribirse en el evento público'
);

-- ============================================================
-- 6. Inscripción sin sesión: suplantación (F-02)
-- ============================================================
select t_set('reg_suplanta', (select registration_id::text from app.register_for_event(
  '76000000-0000-0000-0000-0000000b0001', 'individual', 'Falsa Marta', 'falsamarta@example.test',
  null, '76000000-0000-0000-0000-0000000e0003',
  '[{"full_name": "Otra Persona", "person_id": "76000000-0000-0000-0000-0000000e0004"}]'::jsonb,
  '[]'::jsonb, '[{"consent_key": "consent_a6", "given": true}]'::jsonb, 'idem-falsamarta')));

reset role;

select ok(
  (select primary_person_id from registrations where id = t_id('reg_suplanta')) is null,
  'Una inscripción sin sesión NO queda a nombre de la persona reclamada (F-02)'
);

select is(
  (select count(*)::int from registration_attendees
   where registration_id = t_id('reg_suplanta') and person_id is not null),
  0,
  'Tampoco los asistentes quedan vinculados a personas reales sin sesión (F-02)'
);

select is(
  (select count(*)::int from consent_records
   where registration_id = t_id('reg_suplanta') and person_id is not null),
  0,
  'Ni se registra un consentimiento a nombre de una persona real sin sesión (F-02)'
);

-- ============================================================
-- 7. Inscripción autenticada: solo por uno mismo (F-02)
-- ============================================================
select test_set_auth_uid('76000000-0000-0000-0000-000000000003');

select is(
  t_err($$ select * from app.register_for_event(
    '76000000-0000-0000-0000-0000000b0001', 'individual', 'Marta', 'marta.otro@example.test',
    null, '76000000-0000-0000-0000-0000000e0004', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'idem-marta-otro') $$),
  '42501',
  'Un miembro sin gestión de inscripciones no puede inscribir a otra persona de su iglesia'
);

select is(
  t_err($$ select * from app.register_for_event(
    '76000000-0000-0000-0000-0000000b0001', 'individual', 'Marta', 'marta.b@example.test',
    null, '76000000-0000-0000-0000-0000000e0005', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'idem-marta-b') $$),
  '22023',
  'Tampoco a nombre de una persona de OTRA iglesia (no es persona activa de la iglesia del evento)'
);

select is(
  t_err($$ select * from app.register_for_event(
    '76000000-0000-0000-0000-0000000b0001', 'individual', 'Marta', 'marta@example.test',
    null, '76000000-0000-0000-0000-0000000e0003',
    '[{"full_name": "Otra Persona", "person_id": "76000000-0000-0000-0000-0000000e0004"}]'::jsonb,
    '[]'::jsonb, '[]'::jsonb, 'idem-marta-attendee') $$),
  '42501',
  'La misma regla se aplica a cada asistente, no solo a la persona principal'
);

select is(
  (select status::text from app.register_for_event(
    '76000000-0000-0000-0000-0000000b0001', 'individual', 'Marta', 'marta@example.test',
    null, '76000000-0000-0000-0000-0000000e0003', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'idem-marta-ok')),
  'confirmed',
  'Marta sí puede inscribirse a sí misma con su sesión'
);

reset role;

select is(
  (select primary_person_id::text from registrations where idempotency_key = 'idem-marta-ok'),
  '76000000-0000-0000-0000-0000000e0003',
  'La inscripción de Marta queda vinculada a su propia persona'
);

-- ============================================================
-- 8. Replay idempotente ajeno (F-07)
-- ============================================================
select test_set_anon();

select is(
  t_err($$ select * from app.register_for_event(
    '76000000-0000-0000-0000-0000000b0001', 'individual', 'Ladrón', 'ladron@example.test',
    null, null, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'idem-visitante1') $$),
  'P0002',
  'Acertar la idempotency_key de otro no entrega su inscripción (F-07)'
);

select is(
  (select replayed from app.register_for_event(
    '76000000-0000-0000-0000-0000000b0001', 'individual', 'Visitante Uno', 'Visitante1@Example.test',
    null, null, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'idem-visitante1')),
  true,
  'El propio titular sí recupera su inscripción con su clave, sin distinguir mayúsculas del correo'
);

-- ============================================================
-- 9. Límite de abuso dentro de la RPC (F-06)
-- ============================================================
-- Por correo normalizado y evento: el uso legítimo es 1, se toleran 5.
select t_bulk_register('76000000-0000-0000-0000-0000000b0004', 4, 'aforo-previo');

select is(
  (select count(*)::int from (
    select app.register_for_event(
      '76000000-0000-0000-0000-0000000b0004', 'individual', 'Machacón', 'machacon@example.test',
      null, null, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'idem-machacon-' || g)
    from generate_series(1, 5) g
  ) s),
  5,
  'Cinco inscripciones con el mismo correo al mismo evento pasan'
);

select is(
  t_err($$ select * from app.register_for_event(
    '76000000-0000-0000-0000-0000000b0004', 'individual', 'Machacón', 'MACHACON@example.test',
    null, null, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'idem-machacon-6') $$),
  '53400',
  'La sexta con el mismo correo (normalizado) se corta dentro de la RPC (F-06)'
);

-- Por evento y ventana temporal: 50 altas públicas cada 10 minutos.
select t_bulk_register('76000000-0000-0000-0000-0000000b0004', 41, 'tromba');

reset role;
select is(
  (select count(*)::int from registrations where event_id = '76000000-0000-0000-0000-0000000b0004'),
  50,
  'El evento acumula ya 50 inscripciones públicas en la ventana'
);

select test_set_anon();
select is(
  t_err($$ select * from app.register_for_event(
    '76000000-0000-0000-0000-0000000b0004', 'individual', 'Gota', 'gota@example.test',
    null, null, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'idem-gota') $$),
  '53400',
  'La inscripción 51 del evento se corta: el límite vive en la RPC, no solo en la Server Action (F-06)'
);

reset role;

-- ============================================================
-- 10. Avisos a los inscritos: exigen capability (F-03)
-- ============================================================
select test_set_auth_uid('76000000-0000-0000-0000-000000000003');
select is(
  t_err($$ select app.notify_event_registrants('76000000-0000-0000-0000-0000000b0001', 'event.reminder') $$),
  '42501',
  'Un miembro sin gestión del evento no puede avisar a sus inscritos (F-03)'
);

select test_set_auth_uid('76000000-0000-0000-0000-000000000002');
select is(
  t_err($$ select app.notify_event_registrants('76000000-0000-0000-0000-0000000b0001', 'event.reminder') $$),
  '42501',
  'El propietario de OTRA iglesia tampoco puede avisar a los inscritos de un evento ajeno (F-03)'
);

select test_set_auth_uid('76000000-0000-0000-0000-000000000001');
select ok(
  (select app.notify_event_registrants('76000000-0000-0000-0000-0000000b0001', 'event.reminder')) >= 1,
  'El propietario del evento sí puede avisar a sus inscritos'
);

reset role;

select * from finish();
rollback;
