-- Fase 2 · Detección de duplicados. Ver encargo de Fase 2 §7 y §21.
--
-- Match fuerte: email normalizado exacto o teléfono normalizado exacto.
-- Match probable: nombre + apellido + fecha de nacimiento, todos iguales.
-- Nunca fusiona automáticamente; solo informa candidatos dentro del mismo
-- tenant para que el usuario decida.

create or replace function app.find_potential_duplicate_people(
  p_church_id uuid,
  p_email text default null,
  p_phone text default null,
  p_first_name text default null,
  p_last_name text default null,
  p_birth_date date default null
)
returns table (
  out_person_id uuid,
  out_first_name text,
  out_last_name text,
  out_email text,
  out_phone text,
  out_match_type text
)
language sql
security definer
stable
set search_path = pg_catalog, public
as $$
  select distinct on (p.id)
    p.id, p.first_name, p.last_name, p.email, p.phone,
    case
      when p_email is not null and p.email_normalized = app.normalize_email(p_email) then 'email'
      when p_phone is not null and p.phone_normalized = app.normalize_phone(p_phone) then 'phone'
      else 'name_birthdate'
    end
  from people p
  join church_people cp on cp.person_id = p.id
  where cp.church_id = p_church_id
    and cp.archived_at is null
    and (
      (p_email is not null and p.email_normalized = app.normalize_email(p_email))
      or (p_phone is not null and p.phone_normalized = app.normalize_phone(p_phone))
      or (
        p_first_name is not null and p_last_name is not null and p_birth_date is not null
        and lower(p.first_name) = lower(p_first_name)
        and lower(p.last_name) = lower(p_last_name)
        and p.birth_date = p_birth_date
      )
    );
$$;

revoke all on function app.find_potential_duplicate_people(uuid, text, text, text, text, date) from public, anon;
grant execute on function app.find_potential_duplicate_people(uuid, text, text, text, text, date) to authenticated;

create or replace function public.find_potential_duplicate_people(
  p_church_id uuid,
  p_email text default null,
  p_phone text default null,
  p_first_name text default null,
  p_last_name text default null,
  p_birth_date date default null
)
returns table (
  out_person_id uuid,
  out_first_name text,
  out_last_name text,
  out_email text,
  out_phone text,
  out_match_type text
)
language sql
security invoker
stable
set search_path = pg_catalog, public
as $$
  select * from app.find_potential_duplicate_people(
    p_church_id, p_email, p_phone, p_first_name, p_last_name, p_birth_date
  );
$$;

revoke all on function public.find_potential_duplicate_people(uuid, text, text, text, text, date) from public, anon;
grant execute on function public.find_potential_duplicate_people(uuid, text, text, text, text, date) to authenticated;
