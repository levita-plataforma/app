-- R-01 · El correo y el teléfono dejan de estar a la vista de cualquier miembro.
--
-- La política people_select de la Fase 0 decide si se ve la FILA, y deja verla
-- entera a cualquier miembro de la iglesia. RLS filtra filas, no columnas, así
-- que el correo, el teléfono, la fecha de nacimiento y las notas de cualquiera
-- eran legibles por cualquiera de la misma iglesia.
--
-- La regla de quién puede ver el contacto ya estaba decidida y escrita en la
-- Fase 7: app.can_read_person_contact —uno mismo, quien tenga people.read, o
-- quien lidere un grupo del que esa persona es miembro—. Lo único que faltaba
-- era aplicarla a la tabla, que es lo que hace esta migración. Aquel aviso
-- decía que estrecharla afectaba a F2, F5 y F6; al medirlo resultan ser tres
-- lecturas en todo el código, porque el resto solo pide nombres.
--
-- Se hace con privilegios por columna, que es la herramienta que corresponde:
-- authenticated pierde el select sobre las seis columnas sensibles y lo
-- conserva sobre el resto. Las funciones security definer no se ven afectadas,
-- así que las RPC que ya comprueban capacidad siguen funcionando igual.

revoke select on people from authenticated;

grant select (
  id, user_id, first_name, last_name, preferred_name, avatar_file_id,
  locale, directory_visible, created_at, updated_at, archived_at, archived_by,
  source
) on people to authenticated;

-- email_normalized y phone_normalized entran en la lista: son el mismo dato en
-- minúsculas, y dejarlas fuera habría hecho inútil el resto.
comment on column people.email is
  'Dato de contacto. No legible por select directo: se sirve por app.person_contact, que comprueba app.can_read_person_contact (R-01).';
comment on column people.phone is
  'Dato de contacto. No legible por select directo: ver comentario de people.email (R-01).';

-- ---------------------------------------------------------------------------
-- La ficha de persona: contacto si corresponde, y si no, nulo
-- ---------------------------------------------------------------------------
--
-- Devuelve la fila siempre, con los datos de contacto en null cuando no hay
-- derecho a verlos, en vez de fallar: la ficha tiene que poder abrirse igual, y
-- así la interfaz distingue «no tiene teléfono» de «no puedes verlo» mirando
-- can_read_contact, sin tener que adivinarlo por un error.

create or replace function app.person_contact(p_church_id uuid, p_person_id uuid)
returns table (
  person_id uuid,
  can_read_contact boolean,
  email text,
  phone text,
  birth_date date,
  notes text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_puede boolean;
  v_ve_ficha boolean;
begin
  perform app.assert_church_member(p_church_id);

  -- Pertenecer a la iglesia de la persona es condición previa: sin esto, la
  -- función serviría para comprobar la existencia de un uuid de otro tenant.
  select exists (
    select 1 from church_people cp
    where cp.person_id = p_person_id and cp.church_id = p_church_id
  ) into v_ve_ficha;

  if not v_ve_ficha then
    raise exception 'La persona no existe en esta iglesia.' using errcode = 'P0002';
  end if;

  v_puede := app.can_read_person_contact(p_church_id, p_person_id);

  -- Las notas no son contacto: van solo con people.read, nunca por liderar un
  -- grupo. El comentario de la columna dice que no guarda datos sensibles, pero
  -- es texto libre sobre una persona y no tiene por qué leerlo quien coordina
  -- un grupo.
  return query
  select
    p.id,
    v_puede,
    case when v_puede then p.email end,
    case when v_puede then p.phone end,
    case when v_puede then p.birth_date end,
    case when app.has_capability(p_church_id, 'people.read') then p.notes end
  from people p
  where p.id = p_person_id;
end;
$$;

revoke all on function app.person_contact(uuid, uuid) from public, anon;
grant execute on function app.person_contact(uuid, uuid) to authenticated;

create or replace function public.person_contact(p_church_id uuid, p_person_id uuid)
returns table (
  person_id uuid,
  can_read_contact boolean,
  email text,
  phone text,
  birth_date date,
  notes text
)
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select * from app.person_contact(p_church_id, p_person_id);
$$;

revoke all on function public.person_contact(uuid, uuid) from public, anon;
grant execute on function public.person_contact(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Kids necesita la fecha de nacimiento, y la necesita en bloque
-- ---------------------------------------------------------------------------
--
-- La elegibilidad por edad y el listado de perfiles la leen para varias
-- personas a la vez. Exige kids.manage, que es la capacidad que esas pantallas
-- ya pedían antes de consultar.

create or replace function app.people_birth_dates(p_church_id uuid, p_person_ids uuid[])
returns table (person_id uuid, birth_date date)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  perform app.assert_church_member(p_church_id);

  if not app.has_capability(p_church_id, 'kids.manage')
     and not app.has_capability(p_church_id, 'people.read') then
    raise exception 'No tienes permiso para ver fechas de nacimiento.' using errcode = '42501';
  end if;

  return query
  select p.id, p.birth_date
  from people p
  join church_people cp on cp.person_id = p.id and cp.church_id = p_church_id
  where p.id = any (p_person_ids);
end;
$$;

revoke all on function app.people_birth_dates(uuid, uuid[]) from public, anon;
grant execute on function app.people_birth_dates(uuid, uuid[]) to authenticated;

create or replace function public.people_birth_dates(p_church_id uuid, p_person_ids uuid[])
returns table (person_id uuid, birth_date date)
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select * from app.people_birth_dates(p_church_id, p_person_ids);
$$;

revoke all on function public.people_birth_dates(uuid, uuid[]) from public, anon;
grant execute on function public.people_birth_dates(uuid, uuid[]) to authenticated;
