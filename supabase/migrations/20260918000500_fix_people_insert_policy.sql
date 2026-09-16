-- Fase 2 · Corrige un bug real de RLS heredado de Fase 0: la política
-- people_manage exigía que `id` ya existiera en church_people incluso
-- para el propio INSERT de la persona, lo cual es imposible en el primer
-- alta manual (church_people se crea en un segundo paso). Hasta ahora no
-- se había detectado porque toda creación de persona pasaba por RPCs
-- security definer (provision_church, assisted_provision_church) que
-- saltan RLS. La Fase 2 necesita creación directa desde la aplicación.
--
-- Se sustituye por INSERT permitido a cualquier authenticated (la fila
-- creada es inerte hasta que se vincule con church_people, que sí exige
-- people.manage) y UPDATE/DELETE restringidos a la posesión real.

drop policy people_manage on people;

create policy people_insert on people
  for insert to authenticated
  with check (true);

create policy people_update on people
  for update to authenticated
  using (
    id in (
      select cp.person_id from church_people cp
      where (select app.has_capability(cp.church_id, 'people.manage'))
    )
  )
  with check (
    id in (
      select cp.person_id from church_people cp
      where (select app.has_capability(cp.church_id, 'people.manage'))
    )
  );

comment on policy people_insert on people is
  'INSERT abierto a authenticated: la fila es inerte hasta vincularse a una iglesia vía church_people, que sí exige people.manage. Evita el problema de huevo y gallina del alta manual. Ver encargo de Fase 2 §1.';
