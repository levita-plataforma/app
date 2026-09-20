-- R-01 · El correo y el teléfono dejan de estar a la vista de cualquier miembro.
--
-- Lo que se comprueba no es solo que la RPC filtre, sino que la puerta de atrás
-- esté cerrada: que un select directo sobre people ya no devuelva contacto. Sin
-- esa aserción, la función serviría de poco.

begin;
select plan(11);

create or replace function test_set_auth_uid(p_uid uuid) returns void as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$ language plpgsql;

-- Devuelve el SQLSTATE de una consulta, u 'ok' si no lanza.
create or replace function t_err(p_sql text) returns text as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate;
end;
$$ language plpgsql;

insert into auth.users (id, email) values
  ('a1000000-0000-0000-0000-000000000001', 'owner.r01@example.test'),
  ('a1000000-0000-0000-0000-000000000002', 'raso.r01@example.test'),
  ('a1000000-0000-0000-0000-000000000003', 'otra.r01@example.test');

select test_set_auth_uid('a1000000-0000-0000-0000-000000000001');
select * from app.provision_church(
  'Church R01', 'church-r01', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
  'Owner', 'R01', 'owner.r01@example.test', null, 'Sede R01', null, null, null, null,
  array['people'], null
);

select test_set_auth_uid('a1000000-0000-0000-0000-000000000003');
select * from app.provision_church(
  'Church R01 B', 'church-r01-b', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
  'Otra', 'R01B', 'otra.r01@example.test', null, 'Sede R01B', null, null, null, null,
  array['people'], null
);

reset role;

-- Una persona con contacto, y un miembro raso sin ninguna capacidad sobre
-- personas: el caso que R-01 describe, el de quien solo pertenece a la iglesia.
insert into people (id, first_name, last_name, email, phone, birth_date, notes, source) values
  ('a1000000-0000-0000-0000-0000000e0001', 'Marta', 'Ruiz', 'marta.r01@example.test', '+34600111222', '1990-04-12', 'Nota interna', 'manual'),
  ('a1000000-0000-0000-0000-0000000e0002', 'Raso', 'Sinpermisos', 'raso.r01@example.test', '+34600333444', '1988-01-01', null, 'manual');

update people set user_id = 'a1000000-0000-0000-0000-000000000002'
where id = 'a1000000-0000-0000-0000-0000000e0002';

insert into church_people (church_id, person_id, relationship, source)
select (select id from churches where slug = 'church-r01'), p, 'member', 'manual'
from unnest(array[
  'a1000000-0000-0000-0000-0000000e0001'::uuid,
  'a1000000-0000-0000-0000-0000000e0002'::uuid
]) p;

-- ============================================================
-- 1. La puerta de atrás: select directo sobre las columnas
-- ============================================================
select test_set_auth_uid('a1000000-0000-0000-0000-000000000002');

select is(
  t_err($$ select email from people where id = 'a1000000-0000-0000-0000-0000000e0001' $$),
  '42501',
  'Un miembro no puede leer el correo con un select directo sobre people'
);

select is(
  t_err($$ select phone from people where id = 'a1000000-0000-0000-0000-0000000e0001' $$),
  '42501',
  'Tampoco el teléfono'
);

select is(
  t_err($$ select email_normalized from people where id = 'a1000000-0000-0000-0000-0000000e0001' $$),
  '42501',
  'Ni la versión normalizada, que es el mismo dato en minúsculas'
);

select is(
  t_err($$ select notes, birth_date from people where id = 'a1000000-0000-0000-0000-0000000e0001' $$),
  '42501',
  'Ni las notas ni la fecha de nacimiento'
);

select is(
  t_err($$ select first_name, last_name, preferred_name from people
           where id = 'a1000000-0000-0000-0000-0000000e0001' $$),
  'ok',
  'Los nombres siguen siendo legibles: la aplicación los usa en todas partes'
);

-- ============================================================
-- 2. La RPC: qué ve cada uno
-- ============================================================
select is(
  (select can_read_contact from app.person_contact(
     (select id from churches where slug = 'church-r01'),
     'a1000000-0000-0000-0000-0000000e0001')),
  false,
  'Un miembro raso no tiene derecho al contacto de otra persona'
);

select is(
  (select coalesce(email, '(nulo)') from app.person_contact(
     (select id from churches where slug = 'church-r01'),
     'a1000000-0000-0000-0000-0000000e0001')),
  '(nulo)',
  'Y la RPC se lo devuelve en nulo, sin fallar: la ficha se abre igual'
);

select is(
  (select email from app.person_contact(
     (select id from churches where slug = 'church-r01'),
     'a1000000-0000-0000-0000-0000000e0002')),
  'raso.r01@example.test',
  'Su propio contacto sí lo ve'
);

-- El owner tiene people.read.
select test_set_auth_uid('a1000000-0000-0000-0000-000000000001');

select is(
  (select email from app.person_contact(
     (select id from churches where slug = 'church-r01'),
     'a1000000-0000-0000-0000-0000000e0001')),
  'marta.r01@example.test',
  'Quien tiene people.read sí ve el contacto'
);

select is(
  (select notes from app.person_contact(
     (select id from churches where slug = 'church-r01'),
     'a1000000-0000-0000-0000-0000000e0001')),
  'Nota interna',
  'Y las notas, que van solo con people.read y nunca por liderar un grupo'
);

-- ============================================================
-- 3. Aislamiento entre iglesias
-- ============================================================
select test_set_auth_uid('a1000000-0000-0000-0000-000000000003');

select is(
  t_err(format($$ select * from app.person_contact(%L, 'a1000000-0000-0000-0000-0000000e0001') $$,
                (select id from churches where slug = 'church-r01-b'))),
  'P0002',
  'Preguntar por una persona de otra iglesia no revela si existe'
);

reset role;

select * from finish();
rollback;
