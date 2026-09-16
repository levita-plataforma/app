-- Seed de desarrollo: dos tenants sintéticos para pruebas de aislamiento.
-- Datos ficticios, nunca información personal real. Ver docs/adr/0001.

insert into churches (id, name, slug, status, timezone) values
  ('00000000-0000-0000-0000-00000000000a', 'Church A (seed)', 'church-a-seed', 'active', 'Europe/Madrid'),
  ('00000000-0000-0000-0000-00000000000b', 'Church B (seed)', 'church-b-seed', 'active', 'Europe/Madrid');

insert into campuses (id, church_id, name, slug, is_primary) values
  ('00000000-0000-0000-0000-0000000001a1', '00000000-0000-0000-0000-00000000000a', 'Sede principal', 'principal', true),
  ('00000000-0000-0000-0000-0000000001b1', '00000000-0000-0000-0000-00000000000b', 'Sede principal', 'principal', true);

-- Personas sin cuenta (user_id null a propósito, ver docs/adr/0002).
insert into people (id, first_name, last_name) values
  ('00000000-0000-0000-0000-0000000002a1', 'Ana', 'García (A)'),
  ('00000000-0000-0000-0000-0000000002a2', 'Carlos', 'Ruiz (A)'),
  ('00000000-0000-0000-0000-0000000002b1', 'Beatriz', 'López (B)');

insert into church_people (church_id, person_id, relationship, primary_campus_id) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000002a1', 'member', '00000000-0000-0000-0000-0000000001a1'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000002a2', 'leader', '00000000-0000-0000-0000-0000000001a1'),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000002b1', 'member', '00000000-0000-0000-0000-0000000001b1');

-- Módulos: Church A tiene 'people' habilitado; Church B lo tiene deshabilitado
-- a propósito, para probar el bloqueo por entitlement.
insert into church_modules (church_id, module_key, status, enabled_at) values
  ('00000000-0000-0000-0000-00000000000a', 'people', 'enabled', now()),
  ('00000000-0000-0000-0000-00000000000b', 'people', 'disabled', null);

-- Actividad de ejemplo en Church A. Publicada y visible para miembros: desde
-- Fase 4 los borradores solo los ve quien gestiona actividades, y los tests de
-- aislamiento usan a un miembro sin roles.
insert into activities (church_id, campus_id, type, title, starts_at, ends_at, status, visibility, published_at) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000001a1',
   'service', 'Culto dominical (seed)', now() + interval '3 days', now() + interval '3 days 1 hour',
   'published', 'members', now());
