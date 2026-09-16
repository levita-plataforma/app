-- Fase 3 · Elegibilidad de personas para un puesto.
-- Ver prompt de Fase 3 §15-16.

create type eligibility_status as enum ('eligible', 'eligible_with_warning', 'not_eligible');

-- app.evaluate_person_eligibility(): evalúa una persona concreta contra los
-- requisitos de un puesto. security definer porque cruza person_qualifications
-- y person_credentials, que ya están protegidos por RLS propio; esta función
-- se usa desde app.eligible_people_for_position (también security definer) y
-- se expone además standalone para evaluar a una persona ya elegida.
create or replace function app.evaluate_person_eligibility(
  p_church_id uuid,
  p_service_position_id uuid,
  p_person_id uuid
)
returns table (status eligibility_status, reasons text[])
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_position record;
  v_area_id uuid;
  v_member record;
  v_reasons text[] := '{}';
  v_has_blocking boolean := false;
  v_has_warning boolean := false;
  v_req record;
  v_person_active boolean;
begin
  select sp.* into v_position
  from service_positions sp
  where sp.id = p_service_position_id and sp.church_id = p_church_id;

  if not found then
    return query select 'not_eligible'::eligibility_status, array['position_not_found'];
    return;
  end if;

  v_area_id := v_position.service_area_id;

  select (cp.archived_at is null) into v_person_active
  from church_people cp
  where cp.church_id = p_church_id and cp.person_id = p_person_id;

  if v_person_active is null or not v_person_active then
    v_reasons := array_append(v_reasons, 'inactive_person');
    v_has_blocking := true;
  end if;

  select sam.* into v_member
  from service_area_members sam
  where sam.church_id = p_church_id
    and sam.service_area_id = v_area_id
    and sam.person_id = p_person_id;

  if not found or v_member.status <> 'active' then
    v_reasons := array_append(v_reasons, 'inactive_person');
    v_has_blocking := true;
  elsif v_member.status = 'suspended' then
    v_reasons := array_append(v_reasons, 'inactive_person');
    v_has_blocking := true;
  end if;

  if v_position.campus_id is not null and v_member.person_id is not null then
    if not exists (
      select 1 from church_people cp
      where cp.church_id = p_church_id
        and cp.person_id = p_person_id
        and (cp.primary_campus_id = v_position.campus_id or cp.primary_campus_id is null)
    ) then
      v_reasons := array_append(v_reasons, 'wrong_campus');
      v_has_warning := true;
    end if;
  end if;

  if v_position.requires_autonomous_person and found then
    if v_member.level not in ('autonomous', 'leader') then
      v_reasons := array_append(v_reasons, 'insufficient_level');
      v_has_blocking := true;
    end if;
  end if;

  for v_req in
    select * from position_requirements pr where pr.service_position_id = p_service_position_id
  loop
    if v_req.requirement_type = 'qualification' then
      if not exists (
        select 1 from person_qualifications pq
        where pq.church_id = p_church_id
          and pq.person_id = p_person_id
          and pq.qualification_id = v_req.qualification_id
          and (v_req.min_level is null or pq.level >= v_req.min_level)
          and (not v_req.requires_current_validity or pq.expires_at is null or pq.expires_at > now())
      ) then
        if v_req.strictness = 'required' then
          v_reasons := array_append(v_reasons, 'missing_qualification');
          v_has_blocking := true;
        else
          v_reasons := array_append(v_reasons, 'missing_qualification');
          v_has_warning := true;
        end if;
      end if;
    elsif v_req.requirement_type = 'credential' then
      if not exists (
        select 1 from person_credentials pc
        where pc.church_id = p_church_id
          and pc.person_id = p_person_id
          and pc.credential_type_id = v_req.credential_type_id
          and pc.status = 'valid'
          and (not v_req.requires_current_validity or pc.expires_at is null or pc.expires_at > now())
      ) then
        if v_req.strictness = 'required' then
          v_reasons := array_append(v_reasons, 'expired_credential');
          v_has_blocking := true;
        else
          v_reasons := array_append(v_reasons, 'expired_credential');
          v_has_warning := true;
        end if;
      end if;
    elsif v_req.requirement_type = 'minimum_level' then
      if found and v_member.level < v_req.min_operational_level then
        if v_req.strictness = 'required' then
          v_reasons := array_append(v_reasons, 'insufficient_level');
          v_has_blocking := true;
        else
          v_reasons := array_append(v_reasons, 'insufficient_level');
          v_has_warning := true;
        end if;
      end if;
    end if;
  end loop;

  if v_has_blocking then
    return query select 'not_eligible'::eligibility_status, v_reasons;
  elsif v_has_warning then
    return query select 'eligible_with_warning'::eligibility_status, v_reasons;
  else
    return query select 'eligible'::eligibility_status, v_reasons;
  end if;
end;
$$;

revoke all on function app.evaluate_person_eligibility(uuid, uuid, uuid) from public, anon;
grant execute on function app.evaluate_person_eligibility(uuid, uuid, uuid) to authenticated;

-- app.eligible_people_for_position(): evalúa a todos los miembros activos
-- del área del puesto (candidatos naturales) y devuelve su estado.
create or replace function app.eligible_people_for_position(
  p_church_id uuid,
  p_service_position_id uuid
)
returns table (person_id uuid, status eligibility_status, reasons text[])
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_area_id uuid;
begin
  select sp.service_area_id into v_area_id
  from service_positions sp
  where sp.id = p_service_position_id and sp.church_id = p_church_id;

  if v_area_id is null then
    return;
  end if;

  return query
  select sam.person_id, ev.status, ev.reasons
  from service_area_members sam
  cross join lateral app.evaluate_person_eligibility(p_church_id, p_service_position_id, sam.person_id) ev
  where sam.church_id = p_church_id
    and sam.service_area_id = v_area_id;
end;
$$;

revoke all on function app.eligible_people_for_position(uuid, uuid) from public, anon;
grant execute on function app.eligible_people_for_position(uuid, uuid) to authenticated;

-- Wrappers públicos (security invoker: RLS del propio usuario se aplica a
-- las tablas subyacentes vía las funciones security definer internas, y
-- requireCapability se comprueba en la capa de aplicación antes de llamar).
create or replace function public.evaluate_person_eligibility(
  p_church_id uuid,
  p_service_position_id uuid,
  p_person_id uuid
)
returns table (status eligibility_status, reasons text[])
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select * from app.evaluate_person_eligibility(p_church_id, p_service_position_id, p_person_id);
$$;

revoke all on function public.evaluate_person_eligibility(uuid, uuid, uuid) from public;
grant execute on function public.evaluate_person_eligibility(uuid, uuid, uuid) to authenticated;

create or replace function public.eligible_people_for_position(
  p_church_id uuid,
  p_service_position_id uuid
)
returns table (person_id uuid, status eligibility_status, reasons text[])
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select * from app.eligible_people_for_position(p_church_id, p_service_position_id);
$$;

revoke all on function public.eligible_people_for_position(uuid, uuid) from public;
grant execute on function public.eligible_people_for_position(uuid, uuid) to authenticated;
