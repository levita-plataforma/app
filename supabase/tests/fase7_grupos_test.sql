-- Fase 7 · Tests de Grupos: esquema, aforo, liderazgo con scope 'group',
-- solicitudes de ingreso, visibilidad, reuniones sobre activities, asistencia,
-- lista con contacto condicional y aislamiento entre iglesias.
-- Ver docs/CONTRATO-FASE-7.md §4.1, §5, §6 y §9.

begin;
select plan(69);

create or replace function test_set_auth_uid(p_uid uuid) returns void as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$ language plpgsql;

create or replace function test_clear_auth() returns void as $$
begin
  perform set_config('request.jwt.claims', '', true);
end;
$$ language plpgsql;

-- Identificadores en tabla temporal, no en variables de psql (`\gset`): así la
-- suite es SQL puro y la ejecuta cualquier cliente. Una suite con `\gset` no se
-- ejecuta en el arnés local y, por tanto, no prueba nada.
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

-- Devuelve el SQLSTATE de una sentencia, o null si no falla.
create or replace function test_err(p_sql text) returns text as $$
begin
  execute p_sql;
  return null;
exception when others then
  return sqlstate;
end;
$$ language plpgsql;

-- ============================================================
-- Setup: dos iglesias con los módulos de la Fase 7 activos
-- ============================================================

insert into auth.users (id, email) values
  ('a7000000-0000-0000-0000-000000000001', 'owner.p7a@example.test'),
  ('a7000000-0000-0000-0000-000000000002', 'owner.p7b@example.test'),
  ('a7000000-0000-0000-0000-000000000003', 'lider.p7a@example.test'),
  ('a7000000-0000-0000-0000-000000000004', 'miembro.p7a@example.test'),
  ('a7000000-0000-0000-0000-000000000005', 'ajeno.p7a@example.test'),
  ('a7000000-0000-0000-0000-000000000006', 'visible.p7a@example.test');

select test_set_auth_uid('a7000000-0000-0000-0000-000000000001');
select * from app.provision_church(
  'Church A P7', 'church-a-p7', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
  'Owner', 'A7', 'owner.p7a@example.test', null, 'Sede A7', null, null, null, null,
  array['people', 'groups', 'discipleship'], null
);

select test_set_auth_uid('a7000000-0000-0000-0000-000000000002');
select * from app.provision_church(
  'Church B P7', 'church-b-p7', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
  'Owner', 'B7', 'owner.p7b@example.test', null, 'Sede B7', null, null, null, null,
  array['people', 'groups', 'discipleship'], null
);

reset role;

select test_remember('church_a', (select id from churches where slug = 'church-a-p7'));
select test_remember('church_b', (select id from churches where slug = 'church-b-p7'));
select test_remember('campus_a', (select id from campuses where church_id = test_id('church_a') limit 1));

-- Personas de la iglesia A. La que tiene directory_visible expone su contacto;
-- las demás, no (decisión P-5).
insert into people (id, user_id, first_name, last_name, email, phone, directory_visible) values
  ('a7000000-0000-0000-0000-0000000e0003', 'a7000000-0000-0000-0000-000000000003', 'Lucía', 'Líder', 'lider.p7a@example.test', '600000003', false),
  ('a7000000-0000-0000-0000-0000000e0004', 'a7000000-0000-0000-0000-000000000004', 'Marcos', 'Miembro', 'miembro.p7a@example.test', '600000004', false),
  ('a7000000-0000-0000-0000-0000000e0005', 'a7000000-0000-0000-0000-000000000005', 'Ana', 'Ajena', 'ajeno.p7a@example.test', '600000005', false),
  ('a7000000-0000-0000-0000-0000000e0006', 'a7000000-0000-0000-0000-000000000006', 'Bea', 'Visible', 'visible.p7a@example.test', '600000006', true),
  -- Persona sin cuenta de usuario: ADR 0002 exige que pueda participar igual.
  ('a7000000-0000-0000-0000-0000000e0007', null, 'Sin', 'Cuenta', null, null, false);

insert into church_people (id, church_id, person_id, relationship, source) values
  ('a7000000-0000-0000-0000-0000000f0003', test_id('church_a'), 'a7000000-0000-0000-0000-0000000e0003', 'leader', 'manual'),
  ('a7000000-0000-0000-0000-0000000f0004', test_id('church_a'), 'a7000000-0000-0000-0000-0000000e0004', 'member', 'manual'),
  ('a7000000-0000-0000-0000-0000000f0005', test_id('church_a'), 'a7000000-0000-0000-0000-0000000e0005', 'member', 'manual'),
  ('a7000000-0000-0000-0000-0000000f0006', test_id('church_a'), 'a7000000-0000-0000-0000-0000000e0006', 'member', 'manual'),
  ('a7000000-0000-0000-0000-0000000f0007', test_id('church_a'), 'a7000000-0000-0000-0000-0000000e0007', 'member', 'manual');

insert into church_people_roles (church_id, church_people_id, role_key, scope_type, scope_id) values
  (test_id('church_a'), 'a7000000-0000-0000-0000-0000000f0004', 'member', 'church', null),
  (test_id('church_a'), 'a7000000-0000-0000-0000-0000000f0005', 'member', 'church', null),
  (test_id('church_a'), 'a7000000-0000-0000-0000-0000000f0006', 'member', 'church', null);

-- ============================================================
-- 1. Esquema: RLS forzada y privilegios
-- ============================================================

select ok(
  (select bool_and(c.relrowsecurity and c.relforcerowsecurity)
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname in ('group_types', 'groups', 'group_leaders', 'group_members',
                       'group_join_requests', 'group_meetings', 'group_attendance')),
  'Las siete tablas de Grupos tienen RLS ENABLE + FORCE'
);

select ok(
  not exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in ('group_types', 'groups', 'group_leaders', 'group_members',
                         'group_join_requests', 'group_meetings', 'group_attendance')
      and grantee in ('anon', 'authenticated')
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
  ),
  'anon y authenticated no pueden escribir directamente en las tablas de Grupos'
);

select ok(
  not exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in ('group_types', 'groups', 'group_leaders', 'group_members',
                         'group_join_requests', 'group_meetings', 'group_attendance')
      and grantee = 'anon' and privilege_type = 'SELECT'
  ),
  'anon no lee ninguna tabla de Grupos: la Fase 7 no tiene superficie pública'
);

select ok(
  (select count(*) from capabilities where module_key = 'groups') = 8,
  'Se han dado de alta las ocho capacidades del módulo groups'
);

select ok(
  (select count(*) from role_capabilities where role_key = 'group_leader') >= 5,
  'El rol group_leader, que nació sin ninguna capacidad, ya tiene las suyas'
);

select ok(
  not exists (
    select 1 from role_capabilities
    where role_key = 'group_leader' and capability_key = 'group.contact.read'
  ),
  'group_leader NO recibe group.contact.read: el contacto sigue la regla P-5'
);

-- ============================================================
-- 2. Tipos de grupo y creación
-- ============================================================

select test_set_auth_uid('a7000000-0000-0000-0000-000000000001');

select test_remember('tipo_celula', public.save_group_type(
  test_id('church_a'),
  jsonb_build_object('key', 'celula', 'name', 'Célula', 'sort_order', 1)
));

select ok(test_id('tipo_celula') is not null, 'Crear un tipo de grupo funciona');

select test_remember('grupo_norte', public.create_group(
  test_id('church_a'),
  jsonb_build_object(
    'name', 'Célula Norte', 'group_type_id', test_id('tipo_celula'),
    'campus_id', test_id('campus_a'), 'visibility', 'listed',
    'join_policy', 'open_request', 'capacity', 2,
    'meeting_location_text', 'Calle Falsa 1'
  )
));

select ok(test_id('grupo_norte') is not null, 'Crear un grupo funciona');

select is(
  (select capacity from groups where id = test_id('grupo_norte')),
  2,
  'El aforo del grupo queda guardado'
);

select test_remember('grupo_privado', public.create_group(
  test_id('church_a'),
  jsonb_build_object('name', 'Grupo Privado', 'visibility', 'private', 'join_policy', 'invite_only')
));

select is(
  (select visibility::text from groups where id = test_id('grupo_privado')),
  'private',
  'Un grupo puede crearse privado'
);

reset role;
select is(
  (select count(*)::int from group_types where key = 'celula' and church_id = test_id('church_b')),
  0,
  'El tipo de grupo creado en A no aparece en B'
);

-- ============================================================
-- 3. Liderazgo: concede rol con scope 'group' y lo retira
-- ============================================================

select test_set_auth_uid('a7000000-0000-0000-0000-000000000001');

select test_remember('liderazgo_lucia', public.add_group_leader(
  test_id('grupo_norte'), 'a7000000-0000-0000-0000-0000000e0003', 'leader'
));

select ok(test_id('liderazgo_lucia') is not null, 'Nombrar responsable de grupo funciona');

reset role;
select ok(
  exists (
    select 1 from church_people_roles
    where church_id = test_id('church_a')
      and church_people_id = 'a7000000-0000-0000-0000-0000000f0003'
      and role_key = 'group_leader' and scope_type = 'group'
      and scope_id = test_id('grupo_norte')
  ),
  'Nombrar responsable concede el rol group_leader con scope_type = group y el grupo como scope_id'
);

-- Esta es la primera vez que el scope 'group' se usa de verdad: comprobamos que
-- app.has_capability lo resuelve.
select test_set_auth_uid('a7000000-0000-0000-0000-000000000003');
select ok(
  app.has_capability(test_id('church_a'), 'group.member.manage', 'group', test_id('grupo_norte')),
  'El scope group autoriza a la responsable sobre SU grupo'
);

select ok(
  not app.has_capability(test_id('church_a'), 'group.member.manage', 'group', test_id('grupo_privado')),
  'Ese mismo scope NO la autoriza sobre otro grupo'
);

select ok(
  not app.has_capability(test_id('church_a'), 'group.create'),
  'La responsable de grupo no puede crear grupos de la iglesia'
);

-- ============================================================
-- 4. Aforo: los responsables no ocupan plaza (decisión P-2)
-- ============================================================

select test_set_auth_uid('a7000000-0000-0000-0000-000000000003');

select lives_ok(
  format($$ select public.add_group_member('%s', '%s', '{}'::jsonb) $$,
         test_id('grupo_norte'), 'a7000000-0000-0000-0000-0000000e0004'),
  'La responsable puede incorporar a un participante'
);

select is(
  app.group_active_member_count(test_id('grupo_norte')),
  1,
  'La responsable no cuenta para el aforo: con un participante, el recuento es 1'
);

select lives_ok(
  format($$ select public.add_group_member('%s', '%s', '{}'::jsonb) $$,
         test_id('grupo_norte'), 'a7000000-0000-0000-0000-0000000e0007'),
  'Una persona sin cuenta de usuario también puede participar (ADR 0002)'
);

select is(
  test_err(format($$ select public.add_group_member('%s', '%s', '{}'::jsonb) $$,
                  test_id('grupo_norte'), 'a7000000-0000-0000-0000-0000000e0006')),
  '22023',
  'Superar el aforo de 2 participantes se rechaza'
);

-- ============================================================
-- 5. Solicitudes de ingreso (decisiones P-6 y P-7)
-- ============================================================

select test_set_auth_uid('a7000000-0000-0000-0000-000000000001');
select test_remember('grupo_sur', public.create_group(
  test_id('church_a'),
  jsonb_build_object('name', 'Célula Sur', 'visibility', 'listed', 'join_policy', 'open_request')
));
select public.add_group_leader(test_id('grupo_sur'), 'a7000000-0000-0000-0000-0000000e0003', 'leader');

select test_set_auth_uid('a7000000-0000-0000-0000-000000000005');

select test_remember('solicitud_ana', public.request_group_join(test_id('grupo_sur'), 'Me gustaría entrar'));
select ok(test_id('solicitud_ana') is not null, 'Una persona puede solicitar plaza en un grupo del directorio');

select is(
  test_err(format($$ select public.request_group_join('%s', null) $$, test_id('grupo_sur'))),
  '23505',
  'Una segunda solicitud pendiente en el mismo grupo se rechaza (decisión P-7)'
);

select is(
  test_err(format($$ select public.request_group_join('%s', null) $$, test_id('grupo_privado'))),
  '22023',
  'No se puede solicitar plaza en un grupo que solo admite altas del responsable'
);

reset role;
select ok(
  exists (
    select 1 from notification_events
    where event_type = 'group.join_request.received'
      and entity_id = test_id('solicitud_ana')
      and 'a7000000-0000-0000-0000-0000000e0003' = any (recipient_person_ids)
  ),
  'La solicitud genera un aviso interno dirigido a la responsable del grupo'
);

select is(
  (select (app.notification_text(e.*) ->> 'title')
   from notification_events e where e.entity_id = test_id('solicitud_ana') limit 1),
  'Nueva solicitud para tu grupo',
  'El aviso de solicitud tiene título propio, no el genérico «Aviso»'
);

-- Resolver la solicitud incorpora a la persona y le avisa.
select test_set_auth_uid('a7000000-0000-0000-0000-000000000003');
select lives_ok(
  format($$ select public.resolve_group_join_request('%s', true, null) $$, test_id('solicitud_ana')),
  'La responsable puede aceptar la solicitud'
);

reset role;
select ok(
  exists (
    select 1 from group_members
    where group_id = test_id('grupo_sur')
      and person_id = 'a7000000-0000-0000-0000-0000000e0005' and status = 'active'
  ),
  'Aceptar la solicitud incorpora a la persona al grupo'
);

select ok(
  exists (
    select 1 from notification_events
    where event_type = 'group.join_request.accepted'
      and 'a7000000-0000-0000-0000-0000000e0005' = any (recipient_person_ids)
  ),
  'Aceptar la solicitud avisa a la persona'
);

select test_set_auth_uid('a7000000-0000-0000-0000-000000000003');
select is(
  test_err(format($$ select public.resolve_group_join_request('%s', true, null) $$, test_id('solicitud_ana'))),
  '22023',
  'Una solicitud ya resuelta no se puede volver a resolver'
);

-- ============================================================
-- 6. Visibilidad: directorio interno y grupos privados (P-1)
-- ============================================================

select test_set_auth_uid('a7000000-0000-0000-0000-000000000005');

select ok(
  exists (select 1 from groups where id = test_id('grupo_norte')),
  'Un miembro de la iglesia ve los grupos del directorio interno'
);

select ok(
  not exists (select 1 from groups where id = test_id('grupo_privado')),
  'Un miembro que no participa NO ve un grupo privado'
);

select ok(
  not exists (select 1 from group_members where group_id = test_id('grupo_norte')),
  'Ver el grupo en el directorio no da acceso a su lista de participantes'
);

select test_set_auth_uid('a7000000-0000-0000-0000-000000000004');
select ok(
  exists (select 1 from group_members where group_id = test_id('grupo_norte')),
  'Quien participa en el grupo sí ve su lista'
);

-- Sin sesión no es que se vean cero grupos: es que la tabla ni siquiera se
-- puede leer, porque a anon se le revocó el SELECT (la Fase 7 no tiene
-- superficie pública, decisión P-1).
select test_clear_auth();
set role anon;
select is(
  test_err('select count(*) from groups'),
  '42501',
  'Sin sesión no se puede leer siquiera la tabla de grupos'
);
reset role;

-- ============================================================
-- 7. Reuniones sobre activities (ADR 0018)
-- ============================================================

select test_set_auth_uid('a7000000-0000-0000-0000-000000000003');

select test_remember('reunion_1', (public.schedule_group_meeting(
  test_id('grupo_norte'),
  jsonb_build_object(
    'local_start', to_char(now() + interval '3 days', 'YYYY-MM-DD HH24:MI:SS'),
    'duration_minutes', 90
  )
) ->> 'group_meeting_id')::uuid);

select ok(test_id('reunion_1') is not null, 'La responsable puede convocar una reunión de su grupo');

reset role;
select is(
  (select a.type::text from activities a
   join group_meetings m on m.activity_id = a.id where m.id = test_id('reunion_1')),
  'group_meeting',
  'La reunión se apoya en una activity de tipo group_meeting, no en un calendario paralelo'
);

select is(
  (select a.visibility::text from activities a
   join group_meetings m on m.activity_id = a.id where m.id = test_id('reunion_1')),
  'private',
  'La actividad de la reunión es privada: no se anuncia en el calendario general'
);

-- La reunión se cancela en group_meetings, sin tocar el estado de la actividad
-- (ADR 0019): así quien lleva un grupo no necesita activity.cancel, que es un
-- permiso sobre el calendario de toda la iglesia.
select test_set_auth_uid('a7000000-0000-0000-0000-000000000003');
select ok(
  not app.has_capability(test_id('church_a'), 'activity.cancel'),
  'La responsable de grupo no tiene permiso sobre el calendario de la iglesia'
);

-- `reset role` no borra las claims del JWT, así que aquí hay que volver a
-- identificarse como quien sí puede crear actividades de la iglesia.
select test_set_auth_uid('a7000000-0000-0000-0000-000000000001');
select test_remember('act_suelta', (app.create_activity(
  test_id('church_a'),
  jsonb_build_object(
    'type', 'meeting', 'title', 'Reunión de liderazgo', 'schedule_kind', 'timed',
    'local_start', to_char(now() + interval '4 days', 'YYYY-MM-DD HH24:MI:SS'),
    'local_end', to_char(now() + interval '4 days 1 hour', 'YYYY-MM-DD HH24:MI:SS'),
    'timezone', 'Europe/Madrid'
  )
) ->> 'activity_id')::uuid);

-- Para llegar al trigger y a la clave foránea hay que poder insertar: se prueba
-- con service_role, porque a authenticated la escritura directa está revocada
-- (eso se comprueba aparte, en la sección 13).
set role service_role;

select is(
  test_err(format(
    $$ insert into group_meetings (church_id, group_id, activity_id)
       values ('%s', '%s', '%s') $$,
    test_id('church_a'), test_id('grupo_norte'), test_id('act_suelta'))),
  '22023',
  'El trigger guard rechaza colgar una reunión de una activity que no es group_meeting'
);

-- En group_members no hay trigger guard que se adelante, así que aquí se ve
-- actuar a la clave foránea compuesta del ADR 0014: un grupo de la iglesia A no
-- puede tener participantes colgados de la iglesia B.
select is(
  test_err(format(
    $$ insert into group_members (church_id, group_id, person_id)
       values ('%s', '%s', '%s') $$,
    test_id('church_b'), test_id('grupo_norte'), 'a7000000-0000-0000-0000-0000000e0006')),
  '23503',
  'La FK compuesta (group_id, church_id) impide mezclar iglesias'
);

reset role;

-- Cambiar la hora avisa a los participantes (decisión P-6).
select test_set_auth_uid('a7000000-0000-0000-0000-000000000003');
select lives_ok(
  format($$ select public.reschedule_group_meeting('%s', jsonb_build_object('local_start', '%s', 'duration_minutes', 90)) $$,
         test_id('reunion_1'), to_char(now() + interval '5 days', 'YYYY-MM-DD HH24:MI:SS')),
  'La responsable puede cambiar la hora de la reunión'
);

reset role;
select ok(
  exists (
    select 1 from notification_events
    where event_type = 'group.meeting.rescheduled'
      and 'a7000000-0000-0000-0000-0000000e0004' = any (recipient_person_ids)
  ),
  'Cambiar la hora avisa a los participantes del grupo'
);

select is(
  (select (app.notification_text(e.*) ->> 'title')
   from notification_events e where e.event_type = 'group.meeting.rescheduled' limit 1),
  'Cambio en una reunión de grupo',
  'El aviso de cambio de reunión tiene título propio'
);

-- ============================================================
-- 8. Asistencia
-- ============================================================

select test_set_auth_uid('a7000000-0000-0000-0000-000000000003');

select is(
  public.record_group_attendance(
    test_id('reunion_1'),
    jsonb_build_array(
      jsonb_build_object('person_id', 'a7000000-0000-0000-0000-0000000e0004', 'status', 'present')
    )
  ),
  1,
  'Registrar asistencia de un participante funciona'
);

select is(
  test_err(format(
    $$ select public.record_group_attendance('%s', jsonb_build_array(
         jsonb_build_object('person_id', '%s', 'status', 'present'))) $$,
    test_id('reunion_1'), 'a7000000-0000-0000-0000-0000000e0006')),
  '22023',
  'No se registra asistencia de quien no participa salvo que se marque como invitado'
);

select is(
  public.record_group_attendance(
    test_id('reunion_1'),
    jsonb_build_array(
      jsonb_build_object('person_id', 'a7000000-0000-0000-0000-0000000e0006',
                         'status', 'present', 'is_guest', true)
    )
  ),
  1,
  'Una persona invitada sí se puede registrar marcándola como tal'
);

select is(
  public.record_group_attendance(
    test_id('reunion_1'),
    jsonb_build_array(
      jsonb_build_object('person_id', 'a7000000-0000-0000-0000-0000000e0004', 'status', 'absent')
    )
  ),
  1,
  'Volver a registrar corrige en vez de duplicar'
);

reset role;
select is(
  (select status::text from group_attendance
   where group_meeting_id = test_id('reunion_1')
     and person_id = 'a7000000-0000-0000-0000-0000000e0004'),
  'absent',
  'La corrección de asistencia queda guardada'
);

select is(
  (select count(*)::int from group_attendance where group_meeting_id = test_id('reunion_1')),
  2,
  'No se han duplicado filas de asistencia'
);

-- ============================================================
-- 9. Lista del grupo: nombre siempre, contacto condicional (P-5)
-- ============================================================

-- La responsable no tiene group.contact.read ni people.read.
select test_set_auth_uid('a7000000-0000-0000-0000-000000000003');

select ok(
  (select count(*) from app.group_roster(test_id('grupo_norte'))) >= 3,
  'La responsable ve la lista completa de su grupo'
);

select ok(
  (select bool_and(display_name is not null and btrim(display_name) <> '')
   from app.group_roster(test_id('grupo_norte'))),
  'El nombre de cada participante se ve siempre'
);

select is(
  (select email from app.group_roster(test_id('grupo_norte'))
   where person_id = 'a7000000-0000-0000-0000-0000000e0004'),
  null,
  'El correo de quien no lo ha hecho visible NO se muestra a la responsable'
);

select ok(
  (select not contact_visible from app.group_roster(test_id('grupo_norte'))
   where person_id = 'a7000000-0000-0000-0000-0000000e0004'),
  'La lista dice explícitamente que ese contacto no es visible'
);

-- Quien administra la iglesia sí tiene people.read.
select test_set_auth_uid('a7000000-0000-0000-0000-000000000001');
select is(
  (select email from app.group_roster(test_id('grupo_norte'))
   where person_id = 'a7000000-0000-0000-0000-0000000e0004'),
  'miembro.p7a@example.test',
  'Quien tiene permiso expreso sí ve el contacto'
);

-- ============================================================
-- 10. Retirar al último responsable (decisión P-2)
-- ============================================================

select test_set_auth_uid('a7000000-0000-0000-0000-000000000001');

select lives_ok(
  format($$ select public.end_group_leadership('%s', '%s') $$,
         test_id('grupo_norte'), 'a7000000-0000-0000-0000-0000000e0003'),
  'Se puede retirar al último responsable: no se bloquea la operación'
);

reset role;
select ok(
  not app.group_has_active_leader(test_id('grupo_norte')),
  'El grupo queda marcado como «sin responsable»'
);

select ok(
  not exists (
    select 1 from church_people_roles
    where role_key = 'group_leader' and scope_type = 'group'
      and scope_id = test_id('grupo_norte')
      and church_people_id = 'a7000000-0000-0000-0000-0000000f0003'
  ),
  'Retirar el liderazgo revoca también el rol con scope de grupo'
);

select test_set_auth_uid('a7000000-0000-0000-0000-000000000003');
select ok(
  not app.has_capability(test_id('church_a'), 'group.member.manage', 'group', test_id('grupo_norte')),
  'Quien deja de ser responsable pierde la capacidad sobre ese grupo'
);

-- ============================================================
-- 11. Archivar preserva el historial (D12)
-- ============================================================

select test_set_auth_uid('a7000000-0000-0000-0000-000000000001');
select lives_ok(
  format($$ select public.set_group_archived('%s', true) $$, test_id('grupo_norte')),
  'Archivar un grupo funciona'
);

reset role;
select is(
  (select count(*)::int from group_members where group_id = test_id('grupo_norte')),
  2,
  'Archivar el grupo conserva a sus participantes'
);

select is(
  (select count(*)::int from group_attendance where group_meeting_id = test_id('reunion_1')),
  2,
  'Archivar el grupo conserva el historial de asistencia'
);

-- ============================================================
-- 12. Aislamiento entre iglesias
-- ============================================================

select test_set_auth_uid('a7000000-0000-0000-0000-000000000002');

select is(
  (select count(*)::int from groups),
  0,
  'La iglesia B no ve ningún grupo de la iglesia A'
);

select is(
  (select count(*)::int from group_members),
  0,
  'La iglesia B no ve ninguna participación de la iglesia A'
);

select is(
  test_err(format($$ select public.add_group_member('%s', '%s', '{}'::jsonb) $$,
                  test_id('grupo_sur'), 'a7000000-0000-0000-0000-0000000e0004')),
  'P0002',
  'La iglesia B no puede tocar un grupo de la iglesia A'
);

select is(
  (select count(*)::int from app.group_roster(test_id('grupo_sur'))),
  0,
  'La lista de un grupo de otra iglesia llega vacía'
);

-- ============================================================
-- 13. Escritura directa revocada
-- ============================================================

select test_set_auth_uid('a7000000-0000-0000-0000-000000000001');

select is(
  test_err(format($$ insert into groups (church_id, name) values ('%s', 'A pelo') $$, test_id('church_a'))),
  '42501',
  'Ni siquiera quien administra puede insertar un grupo sin pasar por la RPC'
);

select is(
  test_err(format($$ update groups set name = 'Cambiado' where id = '%s' $$, test_id('grupo_sur'))),
  '42501',
  'Tampoco puede actualizar un grupo directamente'
);

select is(
  test_err(format($$ delete from group_members where group_id = '%s' $$, test_id('grupo_sur'))),
  '42501',
  'Tampoco puede borrar participaciones directamente'
);

-- ============================================================
-- 14. Gating de módulo
-- ============================================================

reset role;
update church_modules set status = 'disabled'
where church_id = test_id('church_a') and module_key = 'groups';

select test_set_auth_uid('a7000000-0000-0000-0000-000000000001');
select is(
  test_err(format($$ select public.create_group('%s', jsonb_build_object('name', 'Con el módulo apagado')) $$,
                  test_id('church_a'))),
  '42501',
  'Con el módulo de Grupos apagado no se puede crear ningún grupo'
);

reset role;
update church_modules set status = 'enabled'
where church_id = test_id('church_a') and module_key = 'groups';

select * from finish();
rollback;
