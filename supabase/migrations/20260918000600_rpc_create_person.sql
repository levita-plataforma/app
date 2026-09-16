-- Fase 2: RPC transaccional para alta manual de persona.
--
-- El INSERT directo en `people` desde el cliente falla en RLS: PostgREST
-- ejecuta el INSERT con `RETURNING id`, y esa cláusula RETURNING se evalúa
-- contra la política de SELECT de `people`, la cual exige que la persona
-- ya esté vinculada (via user_id o church_people) — imposible para una
-- persona recién creada sin cuenta ni pertenencia todavía. Se soluciona
-- con una función security definer que crea `people` + `church_people`
-- en una sola transacción, igual que el resto de altas multi-tabla de la
-- app (provision_church, invite_existing_person, etc.).

create or replace function app.create_person(
  p_church_id uuid,
  p_first_name text,
  p_last_name text,
  p_preferred_name text,
  p_email text,
  p_phone text,
  p_birth_date date,
  p_relationship text,
  p_campus_id uuid,
  p_tag_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_person_id uuid;
  v_tag_id uuid;
begin
  if not app.has_capability(p_church_id, 'people.manage') then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  if p_first_name is null or btrim(p_first_name) = '' then
    raise exception 'El nombre es obligatorio.' using errcode = '22023';
  end if;

  insert into people (first_name, last_name, preferred_name, email, phone, birth_date, source)
  values (btrim(p_first_name), nullif(btrim(coalesce(p_last_name, '')), ''), nullif(btrim(coalesce(p_preferred_name, '')), ''),
          nullif(btrim(coalesce(p_email, '')), ''), nullif(btrim(coalesce(p_phone, '')), ''), p_birth_date, 'manual')
  returning id into v_person_id;

  insert into church_people (church_id, person_id, relationship, primary_campus_id, source)
  values (p_church_id, v_person_id, coalesce(p_relationship, 'visitor')::church_people_relationship, p_campus_id, 'manual');

  if p_tag_ids is not null and array_length(p_tag_ids, 1) > 0 then
    foreach v_tag_id in array p_tag_ids loop
      insert into person_tags (church_id, person_id, tag_id)
      values (p_church_id, v_person_id, v_tag_id)
      on conflict do nothing;
    end loop;
  end if;

  return v_person_id;
end;
$$;

create or replace function public.create_person(
  p_church_id uuid,
  p_first_name text,
  p_last_name text default null,
  p_preferred_name text default null,
  p_email text default null,
  p_phone text default null,
  p_birth_date date default null,
  p_relationship text default 'visitor',
  p_campus_id uuid default null,
  p_tag_ids uuid[] default null
)
returns uuid
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.create_person(
    p_church_id, p_first_name, p_last_name, p_preferred_name,
    p_email, p_phone, p_birth_date, p_relationship, p_campus_id, p_tag_ids
  );
$$;

revoke all on function public.create_person from public;
grant execute on function public.create_person to authenticated;
