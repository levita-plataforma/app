-- Fase 8 (Diogo) · Elegibilidad de staff Kids y estado de ratio.
-- Ver prompt Fase 8 §12-16, §33.
--
-- Reutiliza church_people (membership) y person_credentials (Fase 3), sin
-- crear kids_qualifications/kids_credentials (§33). No reutiliza
-- app.evaluate_person_eligibility de Fase 3 tal cual porque esa función
-- evalúa contra un service_position de Serving, no contra "cualquier
-- credential_type marcado como requerido para Kids en esta sala"; el
-- patrón (consultar person_credentials + church_people) es el mismo, solo
-- cambia contra qué se compara.

create type kids_ratio_state as enum ('safe', 'warning', 'blocked');

-- app.kids_required_credential_types(): catálogo de credential_types que
-- una iglesia exige para trabajar en Kids. Se modela como una tabla ligera
-- en vez de una columna en credential_types, para no acoplar Kids a Fase 3
-- de forma no aditiva.
create table kids_required_credentials (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  credential_type_id uuid not null,
  required boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (church_id, credential_type_id),
  foreign key (credential_type_id, church_id) references credential_types (id, church_id) on delete cascade
);

comment on table kids_required_credentials is
  'Marca qué credential_types (de Fase 3, ej. certificado de delitos sexuales) son obligatorios para trabajar como staff Kids en esta iglesia. Extensión aditiva de Serving, sin duplicar su catálogo. Ver prompt Fase 8 §12-13, §33.';

alter table kids_required_credentials add constraint kids_required_credentials_id_unique unique (id, church_id);
create index kids_required_credentials_church_idx on kids_required_credentials (church_id);

alter table kids_required_credentials enable row level security;
alter table kids_required_credentials force row level security;

create policy kids_required_credentials_select on kids_required_credentials
  for select to authenticated
  using (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and (select app.has_capability(church_id, 'kids.read'))
  );

create policy kids_required_credentials_manage on kids_required_credentials
  for all to authenticated
  using ( (select app.has_capability(church_id, 'kids.room.manage')) )
  with check ( (select app.has_capability(church_id, 'kids.room.manage')) );

-- app.kids_staff_eligibility(): evalúa si una persona puede ser staff Kids
-- en una iglesia+campus dados. Códigos de bloqueo estructurados, mismo
-- espíritu que app.evaluate_person_eligibility de Fase 3.
create or replace function app.kids_staff_eligibility(
  p_church_id uuid,
  p_person_id uuid,
  p_campus_id uuid default null
)
returns table (eligible boolean, reasons text[])
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_reasons text[] := '{}';
  v_member_active boolean;
  v_req record;
begin
  select (cp.archived_at is null) into v_member_active
  from church_people cp
  where cp.church_id = p_church_id and cp.person_id = p_person_id;

  if v_member_active is null or not v_member_active then
    v_reasons := array_append(v_reasons, 'inactive_person');
  end if;

  if p_campus_id is not null then
    if not exists (
      select 1 from church_people cp
      where cp.church_id = p_church_id and cp.person_id = p_person_id
        and (cp.primary_campus_id = p_campus_id or cp.primary_campus_id is null)
    ) then
      v_reasons := array_append(v_reasons, 'wrong_campus');
    end if;
  end if;

  for v_req in
    select krc.credential_type_id, ct.requires_expiry
    from kids_required_credentials krc
    join credential_types ct on ct.id = krc.credential_type_id and ct.church_id = krc.church_id
    where krc.church_id = p_church_id and krc.active and krc.required
  loop
    if not exists (
      select 1 from person_credentials pc
      where pc.church_id = p_church_id
        and pc.person_id = p_person_id
        and pc.credential_type_id = v_req.credential_type_id
        and pc.status = 'valid'
        and (not v_req.requires_expiry or pc.expires_at is null or pc.expires_at > now())
    ) then
      v_reasons := array_append(v_reasons, 'missing_credential');
    end if;
  end loop;

  return query select (array_length(v_reasons, 1) is null), v_reasons;
end;
$$;

revoke all on function app.kids_staff_eligibility(uuid, uuid, uuid) from public, anon;
grant execute on function app.kids_staff_eligibility(uuid, uuid, uuid) to authenticated;

-- app.kids_room_ratio_status(): estado de ratio de una sesión, en tiempo
-- real. safe = cumple ratio y min_adults; warning = falta staff pero
-- todavía no supera el ratio (deja margen antes de bloquear); blocked =
-- ratio o min_adults incumplidos. Ver prompt Fase 8 §14, §16.
create or replace function app.kids_room_ratio_status(p_session_id uuid)
returns table (
  state kids_ratio_state,
  children_checked_in integer,
  staff_checked_in integer,
  min_adults_required integer,
  ratio_children_per_adult integer,
  max_children_for_current_staff integer
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_room kids_rooms%rowtype;
  v_children integer;
  v_staff integer;
  v_max_children integer;
  v_state kids_ratio_state;
begin
  select r.* into v_room
  from kids_sessions ks join kids_rooms r on r.id = ks.room_id and r.church_id = ks.church_id
  where ks.id = p_session_id;

  if not found then
    return;
  end if;

  select count(*) into v_children from kid_checkins where session_id = p_session_id and status = 'checked_in';
  select count(*) into v_staff from kids_session_staff
    where session_id = p_session_id and checked_in_at is not null and checked_out_at is null;

  v_max_children := v_staff * v_room.ratio_children_per_adult;

  if v_staff < v_room.min_adults or v_children > v_max_children then
    v_state := 'blocked';
  elsif v_staff = v_room.min_adults and v_children >= (v_max_children - v_room.ratio_children_per_adult / 2) then
    v_state := 'warning';
  else
    v_state := 'safe';
  end if;

  return query select v_state, v_children, v_staff, v_room.min_adults, v_room.ratio_children_per_adult, v_max_children;
end;
$$;

revoke all on function app.kids_room_ratio_status(uuid) from public, anon;
grant execute on function app.kids_room_ratio_status(uuid) to authenticated;
