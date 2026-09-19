-- Fase 6 · Tests de eventos, formularios, inscripciones, aforo, waitlist,
-- consentimientos y check-in. Ver prompt de Fase 6 §54.

begin;
select plan(39);

create or replace function test_set_auth_uid(p_uid uuid) returns void as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$ language plpgsql;

-- `reset role` NO borra las claims del JWT (set_config con is_local sobrevive
-- a todo el bloque), así que auth.uid() sigue devolviendo al último usuario
-- autenticado. Para probar de verdad la superficie sin sesión hay que
-- limpiarlas explícitamente.
create or replace function test_clear_auth() returns void as $$
begin
  perform set_config('request.jwt.claims', '', true);
end;
$$ language plpgsql;

-- Los identificadores generados se guardan en una tabla temporal en vez de en
-- variables de psql (`\gset`): así la suite es SQL puro y la ejecuta cualquier
-- cliente, no solo psql.
create temporary table test_ids (name text primary key, id uuid);
grant all on test_ids to public;

create or replace function test_remember(p_name text, p_id uuid) returns uuid as $$
begin
  insert into test_ids (name, id) values (p_name, p_id)
  on conflict (name) do update set id = excluded.id;
  return p_id;
end;
$$ language plpgsql;

create or replace function test_id(p_name text) returns uuid as $$
  select id from test_ids where name = p_name;
$$ language sql stable;

-- El token de cancelación solo existe en el valor que devuelve la RPC: en la
-- tabla se guarda únicamente su huella (20260930000100). Se conserva aquí para
-- poder probar la cancelación igual que la hace quien recibe el enlace.
create temporary table test_tokens (name text primary key, token text);
grant all on test_tokens to public;

create or replace function test_keep_token(p_name text, p_token text) returns text as $$
begin
  insert into test_tokens (name, token) values (p_name, p_token)
  on conflict (name) do update set token = excluded.token;
  return p_token;
end;
$$ language plpgsql;

create or replace function test_token(p_name text) returns text as $$
  select token from test_tokens where name = p_name;
$$ language sql stable;

-- Crea una activity vía RPC (INSERT directo no está permitido para
-- authenticated), la publica y devuelve su id. p_status default 'published'
-- ('draft' la deja sin publicar).
create or replace function test_create_event_activity(
  p_church_id uuid,
  p_title text,
  p_visibility activity_visibility default 'members',
  p_status activity_status default 'published',
  p_starts_offset interval default interval '10 days'
) returns uuid as $$
declare
  v_result jsonb;
  v_id uuid;
begin
  v_result := app.create_activity(
    p_church_id,
    jsonb_build_object(
      'type', 'event', 'title', p_title, 'schedule_kind', 'timed',
      'local_start', to_char((now() + p_starts_offset), 'YYYY-MM-DD HH24:MI:SS'),
      'local_end', to_char((now() + p_starts_offset + interval '2 hours'), 'YYYY-MM-DD HH24:MI:SS'),
      'timezone', 'Europe/Madrid',
      'visibility', p_visibility
    )
  );
  v_id := (v_result ->> 'activity_id')::uuid;
  if p_status in ('planned', 'published', 'completed', 'cancelled', 'archived') then
    perform app.transition_activity_status(v_id, 'planned');
  end if;
  if p_status in ('published', 'completed', 'cancelled', 'archived') then
    perform app.transition_activity_status(v_id, 'published');
  end if;
  return v_id;
end;
$$ language plpgsql;

insert into auth.users (id, email) values
  ('70000000-0000-0000-0000-000000000001', 'owner.p6a@example.test'),
  ('70000000-0000-0000-0000-000000000002', 'owner.p6b@example.test');

select test_set_auth_uid('70000000-0000-0000-0000-000000000001');
select * from app.provision_church(
  'Church A P6', 'church-a-p6', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
  'Owner', 'A6', 'owner.p6a@example.test', null, 'Sede A6', null, null, null, null,
  array['people', 'events'], null
);

select test_set_auth_uid('70000000-0000-0000-0000-000000000002');
select * from app.provision_church(
  'Church B P6', 'church-b-p6', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
  'Owner', 'B6', 'owner.p6b@example.test', null, 'Sede B6', null, null, null, null,
  array['people', 'events'], null
);

reset role;

-- ============================================================
-- Setup: activity de tipo event en Church A, publicada, pública
-- ============================================================
select test_set_auth_uid('70000000-0000-0000-0000-000000000001');

select test_remember('activity_retiro', test_create_event_activity(
  (select id from churches where slug = 'church-a-p6'),
  'Retiro de jóvenes', 'public_future', 'published'
));

-- ============================================================
-- 1. events: crear sobre activity, publicar, cross-tenant
-- ============================================================
insert into events (id, church_id, activity_id, public_slug, visibility, registration_enabled, capacity, waitlist_enabled, max_waitlist)
values (
  '70000000-0000-0000-0000-0000000b0001',
  (select id from churches where slug = 'church-a-p6'),
  test_id('activity_retiro'),
  'retiro-jovenes', 'public', true, 2, true, 5
);

select ok(
  exists (select 1 from events where id = '70000000-0000-0000-0000-0000000b0001'),
  'Crear event sobre activity funciona'
);

select throws_ok(
  format(
    $$ insert into events (church_id, activity_id, public_slug)
       values ('00000000-0000-0000-0000-00000000000b', '%s', 'otro-slug') $$,
    test_id('activity_retiro')
  ),
  null, null,
  'Crear event de Church B sobre activity de Church A falla por FK compuesta'
);

-- Solo activities type=event pueden tener events (trigger guard).
select test_remember('activity_meeting', (app.create_activity(
  (select id from churches where slug = 'church-a-p6'),
  jsonb_build_object(
    'type', 'meeting', 'title', 'Reunión de liderazgo', 'schedule_kind', 'timed',
    'local_start', to_char((now() + interval '5 days'), 'YYYY-MM-DD HH24:MI:SS'),
    'local_end', to_char((now() + interval '5 days 1 hour'), 'YYYY-MM-DD HH24:MI:SS'),
    'timezone', 'Europe/Madrid'
  )
) ->> 'activity_id')::uuid);

select throws_ok(
  format(
    $$ insert into events (church_id, activity_id, public_slug)
       values ((select id from churches where slug = 'church-a-p6'), '%s', 'reunion') $$,
    test_id('activity_meeting')
  ),
  null, null,
  'Crear event sobre activity que no es type=event falla por trigger guard'
);

reset role;

-- ============================================================
-- 2. Registro público: estado de inscripción
-- ============================================================
select is(
  (select app.event_registration_status('70000000-0000-0000-0000-0000000b0001')::text),
  'open',
  'Estado de inscripción calculado: open (habilitada, sin fechas, con plazas)'
);

update events set registration_opens_at = now() + interval '1 day' where id = '70000000-0000-0000-0000-0000000b0001';
select is(
  (select app.event_registration_status('70000000-0000-0000-0000-0000000b0001')::text),
  'scheduled',
  'Inscripción todavía no abierta -> scheduled'
);
update events set registration_opens_at = null where id = '70000000-0000-0000-0000-0000000b0001';

update events set registration_closes_at = now() - interval '1 day' where id = '70000000-0000-0000-0000-0000000b0001';
select is(
  (select app.event_registration_status('70000000-0000-0000-0000-0000000b0001')::text),
  'closed',
  'Inscripción cerrada por fecha -> closed'
);
update events set registration_closes_at = null where id = '70000000-0000-0000-0000-0000000b0001';

-- ============================================================
-- 3. RPC de inscripción pública: aforo, waitlist, idempotencia
-- ============================================================
select isa_ok(
  (select r.registration_id from app.register_for_event(
    '70000000-0000-0000-0000-0000000b0001', 'individual', 'Ana Pública', 'ana@example.test',
    null, null, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'idem-ana-1'
  ) r
  where test_keep_token('ana', r.cancel_token) is not null),
  'uuid',
  'Inscripción pública devuelve un registration_id y su enlace de cancelación'
);

select is(
  (select status::text from app.register_for_event(
    '70000000-0000-0000-0000-0000000b0001', 'individual', 'Bruno Público', 'bruno@example.test',
    null, null, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'idem-bruno-1'
  )),
  'confirmed',
  'Segunda inscripción (capacity=2) también confirmed'
);

select is(
  (select status::text from app.register_for_event(
    '70000000-0000-0000-0000-0000000b0001', 'individual', 'Carla Espera', 'carla@example.test',
    null, null, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'idem-carla-1'
  )),
  'waitlisted',
  'Tercera inscripción sobre capacity=2 lleno -> waitlisted'
);

select is(
  (select waitlist_position from registrations where primary_email = 'carla@example.test'),
  1,
  'Waitlist position asignada correctamente (1)'
);

-- Idempotencia: mismo idempotency_key no duplica.
select is(
  (select replayed from app.register_for_event(
    '70000000-0000-0000-0000-0000000b0001', 'individual', 'Ana Pública', 'ana@example.test',
    null, null, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'idem-ana-1'
  )),
  true,
  'Reintento con la misma idempotency_key devuelve replayed=true, sin duplicar'
);

select is(
  (select count(*)::int from registrations where event_id = '70000000-0000-0000-0000-0000000b0001' and primary_email = 'ana@example.test'),
  1,
  'No se duplicó la inscripción de Ana tras el reintento idempotente'
);

-- ============================================================
-- 4. Cancelación por token libera plaza y promociona waitlist
-- ============================================================
select ok(
  (select promoted_count > 0 from app.cancel_registration_by_token(
    test_token('ana')
  )),
  'Cancelar una confirmada promociona automáticamente a la waitlist'
);

select is(
  (select status::text from registrations where primary_email = 'carla@example.test'),
  'confirmed',
  'Carla (primera en waitlist) fue promovida a confirmed'
);

-- ============================================================
-- 5. Evento sin waitlist habilitada: lleno rechaza
-- ============================================================
select test_set_auth_uid('70000000-0000-0000-0000-000000000001');
-- Desde el hotfix F-04 la RPC de inscripción exige el mismo derecho de
-- lectura que ver el evento, así que todo evento que aquí se use para
-- inscripciones SIN sesión tiene que ser realmente público: activity
-- 'public_future' + events.visibility 'public'.
select test_remember('activity_sin_espera', test_create_event_activity(
  (select id from churches where slug = 'church-a-p6'), 'Evento sin espera', 'public_future', 'published', interval '3 days'
));
reset role;

insert into events (id, church_id, activity_id, public_slug, visibility, registration_enabled, capacity, waitlist_enabled)
values (
  '70000000-0000-0000-0000-0000000b0002',
  (select id from churches where slug = 'church-a-p6'),
  test_id('activity_sin_espera'),
  'evento-sin-espera', 'public', true, 1, false
);

select app.register_for_event(
  '70000000-0000-0000-0000-0000000b0002', 'individual', 'Primero', 'primero@example.test',
  null, null, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'idem-primero'
);

select throws_ok(
  $$ select app.register_for_event(
       '70000000-0000-0000-0000-0000000b0002', 'individual', 'Segundo', 'segundo@example.test',
       null, null, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'idem-segundo'
     ) $$,
  null, null,
  'Evento lleno sin waitlist rechaza nueva inscripción'
);

-- ============================================================
-- 6. Evento no publicado / inscripción deshabilitada rechazan
-- ============================================================
select test_set_auth_uid('70000000-0000-0000-0000-000000000001');
select test_remember('activity_borrador', test_create_event_activity(
  (select id from churches where slug = 'church-a-p6'), 'Evento borrador', 'members', 'draft', interval '20 days'
));
reset role;

insert into events (id, church_id, activity_id, public_slug, registration_enabled, capacity)
values (
  '70000000-0000-0000-0000-0000000b0003',
  (select id from churches where slug = 'church-a-p6'),
  test_id('activity_borrador'),
  'evento-borrador', true, 10
);

select throws_ok(
  $$ select app.register_for_event(
       '70000000-0000-0000-0000-0000000b0003', 'individual', 'Nadie', 'nadie@example.test',
       null, null, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'idem-nadie'
     ) $$,
  null, null,
  'Evento en draft (no publicado) rechaza inscripción'
);

select is(
  (select app.event_registration_status('70000000-0000-0000-0000-0000000b0001')::text is distinct from 'disabled'),
  true,
  'Evento con registration_enabled=true no está disabled'
);

update events set registration_enabled = false where id = '70000000-0000-0000-0000-0000000b0002';
select throws_ok(
  $$ select app.register_for_event(
       '70000000-0000-0000-0000-0000000b0002', 'individual', 'Nadie2', 'nadie2@example.test',
       null, null, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'idem-nadie2'
     ) $$,
  null, null,
  'registration_enabled=false rechaza inscripción'
);

-- ============================================================
-- 7. Lectura pública: anon no ve evento interno, sí ve público publicado
-- ============================================================
select ok(
  (select app.can_read_event_public('70000000-0000-0000-0000-0000000b0001')),
  'Evento público y publicado es legible por anon (can_read_event_public)'
);

select test_set_auth_uid('70000000-0000-0000-0000-000000000001');
select test_remember('activity_interno', test_create_event_activity(
  (select id from churches where slug = 'church-a-p6'), 'Evento interno', 'members', 'published', interval '7 days'
));
reset role;

insert into events (id, church_id, activity_id, public_slug, visibility, registration_enabled, capacity)
values (
  '70000000-0000-0000-0000-0000000b0004',
  (select id from churches where slug = 'church-a-p6'),
  test_id('activity_interno'),
  'evento-interno', 'internal', true, 10
);

select ok(
  not (select app.can_read_event_public('70000000-0000-0000-0000-0000000b0004')),
  'Evento visibility=internal NO es legible por anon'
);

-- Hotfix F-04: la aserción anterior consagraba el fallo — daba por correcto
-- que la RPC de inscripción NO mirase events.visibility, así que quien
-- conociera el uuid de un evento interno podía inscribirse en él sin sesión.
-- Ahora inscribirse exige el mismo derecho de lectura que ver el evento.
select test_clear_auth();
select throws_ok(
  $$ select app.register_for_event(
       '70000000-0000-0000-0000-0000000b0004', 'individual', 'Anónimo Interno', 'internoanon@example.test',
       null, null, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'idem-interno'
     ) $$,
  'P0002', null,
  'Sin sesión no se puede inscribir en un evento visibility=internal, ni conociendo su uuid'
);

-- ============================================================
-- 8. Concurrencia: dos inscripciones simultáneas no superan aforo
-- ============================================================
select test_set_auth_uid('70000000-0000-0000-0000-000000000001');
select test_remember('activity_concurrencia', test_create_event_activity(
  (select id from churches where slug = 'church-a-p6'), 'Evento concurrencia', 'public_future', 'published', interval '4 days'
));
reset role;

insert into events (id, church_id, activity_id, public_slug, visibility, registration_enabled, capacity, waitlist_enabled)
values (
  '70000000-0000-0000-0000-0000000b0005',
  (select id from churches where slug = 'church-a-p6'),
  test_id('activity_concurrencia'),
  'evento-concurrencia', 'public', true, 1, true
);

select app.register_for_event(
  '70000000-0000-0000-0000-0000000b0005', 'individual', 'Uno', 'uno@example.test',
  null, null, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'idem-uno'
);
select app.register_for_event(
  '70000000-0000-0000-0000-0000000b0005', 'individual', 'Dos', 'dos@example.test',
  null, null, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'idem-dos'
);

select is(
  (select count(*)::int from registrations where event_id = '70000000-0000-0000-0000-0000000b0005' and status = 'confirmed'),
  1,
  'Con capacity=1, solo una inscripción queda confirmed (aforo respetado)'
);
select is(
  (select count(*)::int from registrations where event_id = '70000000-0000-0000-0000-0000000b0005' and status = 'waitlisted'),
  1,
  'La segunda queda waitlisted, sin sobreaforo'
);

-- ============================================================
-- 9. Household registration: varios attendees en una sola registration
-- ============================================================
select test_set_auth_uid('70000000-0000-0000-0000-000000000001');
select test_remember('activity_familiar', test_create_event_activity(
  (select id from churches where slug = 'church-a-p6'), 'Evento familiar', 'public_future', 'published', interval '6 days'
));
reset role;

insert into events (id, church_id, activity_id, public_slug, visibility, registration_enabled, capacity, registration_type)
values (
  '70000000-0000-0000-0000-0000000b0006',
  (select id from churches where slug = 'church-a-p6'),
  test_id('activity_familiar'),
  'evento-familiar', 'public', true, 10, 'household'
);

select app.register_for_event(
  '70000000-0000-0000-0000-0000000b0006', 'household', 'Familia Ruiz', 'ruiz@example.test',
  null, null,
  '[{"full_name": "Padre Ruiz", "attendee_type": "adult"}, {"full_name": "Hijo Ruiz", "attendee_type": "minor"}]'::jsonb,
  '[]'::jsonb, '[]'::jsonb, 'idem-ruiz'
);

select is(
  (select attendees_count from registrations where primary_email = 'ruiz@example.test'),
  2,
  'Inscripción household con 2 asistentes registra attendees_count=2'
);

select is(
  (select count(*)::int from registration_attendees ra join registrations r on r.id = ra.registration_id where r.primary_email = 'ruiz@example.test'),
  2,
  'Se crean 2 filas de registration_attendees para la inscripción familiar'
);

-- ============================================================
-- 10. Formularios: required, tipos, versión
-- ============================================================
select test_set_auth_uid('70000000-0000-0000-0000-000000000001');
insert into forms (id, church_id, name, purpose)
values ('70000000-0000-0000-0000-0000000c0001', (select id from churches where slug = 'church-a-p6'), 'Inscripción retiro', 'Recoger datos básicos para el retiro de jóvenes');

insert into form_fields (church_id, form_id, key, label, type, required, sort_order, options)
values (
  (select id from churches where slug = 'church-a-p6'), '70000000-0000-0000-0000-0000000c0001',
  'talla_camiseta', 'Talla de camiseta', 'select', true, 1,
  '[{"value":"S","label":"S"},{"value":"M","label":"M"}]'::jsonb
);

select is(
  (select current_version from forms where id = '70000000-0000-0000-0000-0000000c0001'),
  1,
  'Formulario creado en versión 1'
);

select is(
  (select app.bump_form_version('70000000-0000-0000-0000-0000000c0001', (select id from churches where slug = 'church-a-p6'))),
  2,
  'app.bump_form_version incrementa la versión vigente'
);

update events set form_id = '70000000-0000-0000-0000-0000000c0001' where id = '70000000-0000-0000-0000-0000000b0006';
reset role;

select throws_ok(
  $$ select app.register_for_event(
       '70000000-0000-0000-0000-0000000b0006', 'individual', 'Sin Talla', 'sintalla@example.test',
       null, null, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'idem-sintalla'
     ) $$,
  null, null,
  'Falta un campo required del formulario -> rechaza la inscripción'
);

select is(
  (select status::text from app.register_for_event(
    '70000000-0000-0000-0000-0000000b0006', 'individual', 'Con Talla', 'contalla@example.test',
    null, null, '[]'::jsonb,
    '[{"field_key": "talla_camiseta", "value": "M"}]'::jsonb, '[]'::jsonb, 'idem-contalla'
  )),
  'confirmed',
  'Con el campo required presente, la inscripción se confirma'
);

select is(
  (select fs.form_version from form_submissions fs join registrations r on r.form_submission_id = fs.id where r.primary_email = 'contalla@example.test'),
  2,
  'La submission queda anclada a la versión vigente del formulario (2) en el momento del envío'
);

-- ============================================================
-- 11. Consentimientos: versión y separación operativo/marketing
-- ============================================================
select test_set_auth_uid('70000000-0000-0000-0000-000000000001');
insert into consent_definitions (id, church_id, key, purpose_type, title, body, version)
values (
  '70000000-0000-0000-0000-0000000d0001', (select id from churches where slug = 'church-a-p6'),
  'inscripcion_evento', 'operational', 'Tratamiento de datos de inscripción', 'Usamos tus datos para gestionar tu inscripción.', 1
);
insert into consent_definitions (id, church_id, key, purpose_type, title, body, version)
values (
  '70000000-0000-0000-0000-0000000d0002', (select id from churches where slug = 'church-a-p6'),
  'comunicaciones_marketing', 'marketing', 'Comunicaciones promocionales', 'Podemos enviarte otras novedades de la iglesia.', 1
);
reset role;

select is(
  (select status::text from app.register_for_event(
    '70000000-0000-0000-0000-0000000b0006', 'individual', 'Con Consentimiento', 'consent@example.test',
    null, null, '[]'::jsonb,
    '[{"field_key": "talla_camiseta", "value": "S"}]'::jsonb,
    '[{"consent_key": "inscripcion_evento", "given": true}, {"consent_key": "comunicaciones_marketing", "given": false}]'::jsonb,
    'idem-consent'
  )),
  'confirmed',
  'Inscripción con consentimientos registrados se confirma'
);

select is(
  (select count(*)::int from consent_records cr join registrations r on r.id = cr.registration_id where r.primary_email = 'consent@example.test'),
  2,
  'Se registran 2 consent_records (operativo y marketing) por separado'
);

select is(
  (select given from consent_records cr join registrations r on r.id = cr.registration_id
   join consent_definitions cd on cd.id = cr.consent_definition_id
   where r.primary_email = 'consent@example.test' and cd.key = 'comunicaciones_marketing'),
  false,
  'El consentimiento de marketing queda registrado como NO dado, sin bloquear la inscripción operativa'
);

-- ============================================================
-- 12. Check-in: idempotente, cross-tenant bloqueado
-- ============================================================
select test_set_auth_uid('70000000-0000-0000-0000-000000000001');

select ok(
  (select attendance_status::text = 'checked_in' from app.checkin_attendee(
    (select ra.id from registration_attendees ra join registrations r on r.id = ra.registration_id where r.primary_email = 'ana@example.test')
  )),
  'Check-in de un asistente funciona'
);

select ok(
  (select attendance_status::text = 'checked_in' from app.checkin_attendee(
    (select ra.id from registration_attendees ra join registrations r on r.id = ra.registration_id where r.primary_email = 'ana@example.test')
  )),
  'Repetir check-in es idempotente (sigue checked_in, sin error)'
);

reset role;
select test_set_auth_uid('70000000-0000-0000-0000-000000000002');

select throws_ok(
  format(
    $$ select app.checkin_attendee('%s') $$,
    (select ra.id from registration_attendees ra join registrations r on r.id = ra.registration_id where r.primary_email = 'ana@example.test')
  ),
  null, null,
  'Check-in de un asistente de Church A desde Church B falla (no autorizado)'
);

reset role;

-- ============================================================
-- 13. Cobertura RLS de las tablas nuevas
-- ============================================================
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where relname = 'events'),
  'events tiene RLS enable+force'
);
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where relname = 'registrations'),
  'registrations tiene RLS enable+force'
);
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where relname = 'form_submissions'),
  'form_submissions tiene RLS enable+force'
);

select * from finish();
rollback;
