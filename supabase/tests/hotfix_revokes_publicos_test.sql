-- Hotfix transversal · Superficie de anon en public y app.
--
-- Fija por lista blanca qué puede alcanzar una sesión sin autenticar, en vez de
-- comprobar función por función: así, cuando alguien añada una RPC y se olvide
-- del revoke, la prueba falla sola en vez de esperar a que lo vea una revisión.

begin;
select plan(4);

-- 1. En public, anon solo alcanza la superficie pública de la Fase 6 y el
--    formulario de contacto de la web.
select is(
  (select coalesce(array_agg(p.proname::text order by p.proname), array[]::text[])
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
   where has_function_privilege('anon', p.oid, 'execute')
     and p.prokind = 'f'
     and exists (
       select 1 from pg_proc a
       where a.pronamespace = 'app'::regnamespace and a.proname = p.proname
     )),
  array['cancel_registration_by_token', 'event_registration_status',
        'register_for_event', 'submit_marketing_lead'],
  'En public, anon solo alcanza los wrappers de la superficie pública declarada'
);

-- 2. En app, anon solo alcanza lo que la superficie pública necesita de verdad.
--    Se excluyen las funciones de trigger, que no se pueden invocar por RPC.
select is(
  (select coalesce(array_agg(p.proname::text order by p.proname), array[]::text[])
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'app'
   where has_function_privilege('anon', p.oid, 'execute')
     and p.prosecdef
     and pg_get_function_result(p.oid) <> 'trigger'),
  array['can_read_event_public', 'cancel_registration_by_token', 'register_for_event', 'submit_marketing_lead'],
  'En app, anon solo alcanza las funciones security definer de la superficie pública'
);

-- 3. Lo que se revoca sigue estando al alcance de quien lo usa: revocar de
--    PUBLIC sin conceder a authenticated habría dejado la aplicación sin acceso,
--    porque estas funciones no tenían grant propio.
select is(
  (select count(*)::int
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
   where p.proname in (
     'admin_cancel_registration', 'checkin_attendee', 'undo_checkin_attendee',
     'promote_waitlist', 'notify_event_registrants', 'create_person',
     'eligible_people_for_position', 'evaluate_person_eligibility'
   )
     and has_function_privilege('authenticated', p.oid, 'execute')),
  8,
  'Las ocho siguen al alcance de authenticated: el revoke no ha roto la aplicación'
);

-- 4. Y una sesión anónima que lo intente recibe 42501, no un resultado.
set role anon;
select set_config('request.jwt.claims', '', true);

select throws_ok(
  $$ select public.create_person(
       '00000000-0000-0000-0000-000000000000'::uuid,
       'Intruso', 'Anonimo', null, 'intruso@example.test', null, null, 'visitor', null, null) $$,
  '42501',
  null,
  'Una sesión anónima que llama a create_person recibe 42501'
);

reset role;

select * from finish();
rollback;
