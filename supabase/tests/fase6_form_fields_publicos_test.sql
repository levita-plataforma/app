-- Fase 6 · Test de public.public_form_fields (migración
-- 20260924000800_form_fields_publicos.sql). Comprueba que `anon` puede leer
-- los campos vigentes del formulario de un evento público, y que no puede
-- leer los de un evento no público (visibility != 'public').

begin;
select plan(4);

create or replace function test_set_auth_uid(p_uid uuid) returns void as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$ language plpgsql;

create or replace function test_create_event_activity(
  p_church_id uuid,
  p_title text,
  p_visibility activity_visibility default 'members',
  p_status activity_status default 'published'
) returns uuid as $$
declare
  v_result jsonb;
  v_id uuid;
begin
  v_result := app.create_activity(
    p_church_id,
    jsonb_build_object(
      'type', 'event', 'title', p_title, 'schedule_kind', 'timed',
      'local_start', to_char((now() + interval '10 days'), 'YYYY-MM-DD HH24:MI:SS'),
      'local_end', to_char((now() + interval '10 days' + interval '2 hours'), 'YYYY-MM-DD HH24:MI:SS'),
      'timezone', 'Europe/Madrid',
      'visibility', p_visibility
    )
  );
  v_id := (v_result ->> 'activity_id')::uuid;
  perform app.transition_activity_status(v_id, 'planned');
  perform app.transition_activity_status(v_id, 'published');
  return v_id;
end;
$$ language plpgsql;

insert into auth.users (id, email) values
  ('70000000-0000-0000-0000-000000000901', 'owner.p6ffp@example.test');

select test_set_auth_uid('70000000-0000-0000-0000-000000000901');
select * from app.provision_church(
  'Church FFP', 'church-ffp', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
  'Owner', 'FFP', 'owner.p6ffp@example.test', null, 'Sede FFP', null, null, null, null,
  array['people', 'events'], null
);

select test_set_auth_uid('70000000-0000-0000-0000-000000000901');

-- Evento público con formulario asociado.
select test_create_event_activity(
  (select id from churches where slug = 'church-ffp'), 'Evento público FFP', 'public_future'
) as public_activity_id \gset

insert into forms (id, church_id, name, purpose)
values (
  '70000000-0000-0000-0000-0000000d0001',
  (select id from churches where slug = 'church-ffp'),
  'Inscripción FFP', 'Recoger datos básicos'
);

insert into form_fields (church_id, form_id, key, label, type, required, sort_order)
values (
  (select id from churches where slug = 'church-ffp'), '70000000-0000-0000-0000-0000000d0001',
  'alergias', 'Alergias', 'text', false, 1
);

insert into events (id, church_id, activity_id, public_slug, visibility, form_id)
values (
  '70000000-0000-0000-0000-0000000e0001',
  (select id from churches where slug = 'church-ffp'),
  :'public_activity_id', 'evento-publico-ffp', 'public', '70000000-0000-0000-0000-0000000d0001'
);

-- Evento NO público (internal), sin formulario visible para anon.
select test_create_event_activity(
  (select id from churches where slug = 'church-ffp'), 'Evento interno FFP', 'members'
) as internal_activity_id \gset

insert into events (id, church_id, activity_id, public_slug, visibility, form_id)
values (
  '70000000-0000-0000-0000-0000000e0002',
  (select id from churches where slug = 'church-ffp'),
  :'internal_activity_id', 'evento-interno-ffp', 'internal', '70000000-0000-0000-0000-0000000d0001'
);

reset role;
set role anon;

select is(
  (select count(*)::int from public.public_form_fields('70000000-0000-0000-0000-0000000e0001')),
  1,
  'anon obtiene los campos vigentes del formulario de un evento público'
);

select is(
  (select field_key from public.public_form_fields('70000000-0000-0000-0000-0000000e0001') limit 1),
  'alergias',
  'anon ve la key del campo esperado'
);

select is(
  (select count(*)::int from public.public_form_fields('70000000-0000-0000-0000-0000000e0002')),
  0,
  'anon NO obtiene campos de un evento no público'
);

reset role;

select is(
  (select count(*)::int from public.public_form_fields('70000000-0000-0000-0000-0000000e0001')),
  1,
  'authenticated también puede leer vía la misma función pública'
);

select * from finish();
rollback;
