-- Fase 6 · RPC pública de inscripción y funciones de gestión.
-- Ver prompt de Fase 6 §22-24, §26, §42-44.
--
-- app.register_for_event: única puerta de escritura para inscripciones
-- públicas o autenticadas. security definer, transaccional, bloquea la fila
-- de events con FOR UPDATE antes de contar plazas (mismo patrón que
-- app.assignment_manage_cap / bloqueo de activities en Fase 5) para que dos
-- inscripciones concurrentes no produzcan sobreaforo. El cliente NUNCA
-- decide church_id, status ni waitlist_position: todo se resuelve aquí.

create type event_registration_source_hint as enum ('public', 'authenticated', 'admin');

create or replace function app.event_registration_status(p_event_id uuid)
returns event_registration_status
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_event events%rowtype;
  v_confirmed integer;
begin
  select * into v_event from events where id = p_event_id;
  if not found or not v_event.registration_enabled then
    return 'disabled';
  end if;

  if v_event.registration_status_override = 'closed' then
    return 'closed';
  end if;

  if v_event.registration_opens_at is not null and now() < v_event.registration_opens_at then
    return 'scheduled';
  end if;

  if v_event.registration_closes_at is not null and now() > v_event.registration_closes_at then
    return 'closed';
  end if;

  if v_event.registration_status_override = 'open' then
    return 'open';
  end if;

  if v_event.capacity is not null then
    select coalesce(sum(attendees_count), 0) into v_confirmed
    from registrations
    where event_id = p_event_id and registrations.status = 'confirmed';

    if v_confirmed >= v_event.capacity then
      return 'full';
    end if;
  end if;

  return 'open';
end;
$$;

revoke all on function app.event_registration_status(uuid) from public, anon;
grant execute on function app.event_registration_status(uuid) to authenticated;

create or replace function public.event_registration_status(p_event_id uuid)
returns event_registration_status
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.event_registration_status(p_event_id);
$$;

revoke all on function public.event_registration_status(uuid) from public;
grant execute on function public.event_registration_status(uuid) to authenticated, anon;

-- app.register_for_event(...): inscripción transaccional completa.
-- p_attendees: jsonb array de {full_name, attendee_type, person_id}.
-- p_answers: jsonb array de {field_key, value}.
-- p_consents: jsonb array de {consent_key, given}.
create or replace function app.register_for_event(
  p_event_id uuid,
  p_registration_type event_registration_type,
  p_primary_name text,
  p_primary_email text,
  p_primary_phone text,
  p_primary_person_id uuid,
  p_attendees jsonb,
  p_answers jsonb,
  p_consents jsonb,
  p_idempotency_key text,
  p_source event_registration_source_hint default 'public'
)
returns table (
  registration_id uuid,
  status registration_status,
  registration_code text,
  cancel_token text,
  waitlist_position integer,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_event events%rowtype;
  v_activity activities%rowtype;
  v_church_id uuid;
  v_status event_registration_status;
  v_confirmed integer;
  v_capacity_left integer;
  v_attendees_count integer;
  v_final_status registration_status;
  v_waitlist_pos integer;
  v_registration_id uuid;
  v_code text;
  v_token text;
  v_existing registrations%rowtype;
  v_attendee jsonb;
  v_answer jsonb;
  v_consent jsonb;
  v_form_id uuid;
  v_form_version integer;
  v_submission_id uuid;
  v_field form_fields%rowtype;
  v_snapshot jsonb;
begin
  if p_primary_name is null or btrim(p_primary_name) = '' then
    raise exception 'El nombre es obligatorio.' using errcode = '22023';
  end if;
  if p_primary_email is null or p_primary_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'El correo no es válido.' using errcode = '22023';
  end if;

  -- Bloquea la fila del evento (vía su activity) antes de contar: serializa
  -- todas las inscripciones concurrentes de este evento.
  select a.* into v_activity
  from activities a
  join events e on e.activity_id = a.id and e.church_id = a.church_id
  where e.id = p_event_id
  for update;

  if not found then
    raise exception 'Evento no encontrado.' using errcode = 'P0002';
  end if;

  select * into v_event from events where id = p_event_id for update;
  v_church_id := v_event.church_id;

  if v_activity.status not in ('published', 'completed') then
    raise exception 'El evento no admite inscripciones.' using errcode = '22023';
  end if;

  -- Idempotencia: reintento con la misma clave devuelve la existente.
  if p_idempotency_key is not null then
    select * into v_existing from registrations
    where event_id = p_event_id and idempotency_key = p_idempotency_key;
    if found then
      return query select v_existing.id, v_existing.status, v_existing.registration_code,
                          v_existing.cancel_token, v_existing.waitlist_position, true;
      return;
    end if;
  end if;

  v_status := app.event_registration_status(p_event_id);
  if v_status = 'disabled' then
    raise exception 'Este evento no tiene inscripción habilitada.' using errcode = '22023';
  elsif v_status = 'scheduled' then
    raise exception 'La inscripción todavía no está abierta.' using errcode = '22023';
  elsif v_status = 'closed' then
    raise exception 'La inscripción está cerrada.' using errcode = '22023';
  end if;

  v_attendees_count := greatest(1, coalesce(jsonb_array_length(p_attendees), 1));

  if v_status = 'full' or (v_event.capacity is not null) then
    select coalesce(sum(attendees_count), 0) into v_confirmed
    from registrations where event_id = p_event_id and registrations.status = 'confirmed';
    v_capacity_left := case when v_event.capacity is null then null else v_event.capacity - v_confirmed end;
  end if;

  if v_capacity_left is not null and v_attendees_count <= v_capacity_left then
    v_final_status := 'confirmed';
    v_waitlist_pos := null;
  elsif v_capacity_left is not null then
    if not v_event.waitlist_enabled then
      raise exception 'El evento está completo y no admite lista de espera.' using errcode = '22023';
    end if;
    if v_event.max_waitlist is not null then
      if (select count(*) from registrations where event_id = p_event_id and registrations.status = 'waitlisted') >= v_event.max_waitlist then
        raise exception 'La lista de espera está completa.' using errcode = '22023';
      end if;
    end if;
    v_final_status := 'waitlisted';
    select coalesce(max(registrations.waitlist_position), 0) + 1 into v_waitlist_pos
    from registrations where event_id = p_event_id and registrations.status = 'waitlisted';
  else
    v_final_status := 'confirmed';
    v_waitlist_pos := null;
  end if;

  -- Formulario (si el evento tiene uno asociado): valida requeridos y crea submission + answers.
  v_form_id := v_event.form_id;
  if v_form_id is not null then
    select current_version into v_form_version from forms where id = v_form_id and church_id = v_church_id;

    for v_field in select * from form_fields where form_id = v_form_id and church_id = v_church_id and archived_at is null loop
      if v_field.required and not exists (
        select 1 from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) a
        where a->>'field_key' = v_field.key and a->'value' is not null and a->'value' <> 'null'::jsonb
      ) then
        raise exception 'Falta el campo obligatorio: %', v_field.label using errcode = '22023';
      end if;
    end loop;

    select jsonb_agg(jsonb_build_object(
      'id', id, 'key', key, 'label', label, 'type', type,
      'required', required, 'options', options, 'classification', classification
    )) into v_snapshot
    from form_fields where form_id = v_form_id and church_id = v_church_id and archived_at is null;

    insert into form_submissions (church_id, form_id, form_version, fields_snapshot, event_id, submitted_by_user, person_id, status)
    values (v_church_id, v_form_id, coalesce(v_form_version, 1), coalesce(v_snapshot, '[]'::jsonb), p_event_id, auth.uid(), p_primary_person_id, 'submitted')
    returning id into v_submission_id;

    for v_answer in select * from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) loop
      select * into v_field from form_fields
      where form_id = v_form_id and church_id = v_church_id and key = v_answer->>'field_key';
      if found then
        insert into form_submission_answers (church_id, submission_id, field_key, field_type, classification, value)
        values (v_church_id, v_submission_id, v_field.key, v_field.type, v_field.classification, v_answer->'value');
      end if;
    end loop;
  end if;

  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  insert into registrations (
    church_id, event_id, registration_code, registration_type,
    primary_person_id, primary_name, primary_email, primary_phone,
    status, attendees_count, waitlist_position, source,
    form_submission_id, idempotency_key, cancel_token,
    confirmed_at
  ) values (
    v_church_id, p_event_id, v_code, p_registration_type,
    p_primary_person_id, btrim(p_primary_name), lower(btrim(p_primary_email)), p_primary_phone,
    v_final_status, v_attendees_count, v_waitlist_pos,
    (case when p_source = 'admin' then 'admin' when auth.uid() is not null then 'authenticated' else 'public' end)::registration_source,
    v_submission_id, p_idempotency_key, v_token,
    case when v_final_status = 'confirmed' then now() else null end
  )
  returning id into v_registration_id;

  if jsonb_array_length(coalesce(p_attendees, '[]'::jsonb)) = 0 then
    insert into registration_attendees (church_id, registration_id, event_id, person_id, full_name, attendee_type)
    values (v_church_id, v_registration_id, p_event_id, p_primary_person_id, btrim(p_primary_name), 'adult');
  else
    for v_attendee in select * from jsonb_array_elements(p_attendees) loop
      insert into registration_attendees (church_id, registration_id, event_id, person_id, full_name, attendee_type)
      values (
        v_church_id, v_registration_id, p_event_id,
        nullif(v_attendee->>'person_id', '')::uuid,
        coalesce(nullif(btrim(v_attendee->>'full_name'), ''), p_primary_name),
        coalesce((v_attendee->>'attendee_type')::attendee_type, 'adult')
      );
    end loop;
  end if;

  for v_consent in select * from jsonb_array_elements(coalesce(p_consents, '[]'::jsonb)) loop
    insert into consent_records (church_id, consent_definition_id, consent_version, registration_id, person_id, given, origin)
    select v_church_id, cd.id, cd.version, v_registration_id, p_primary_person_id,
           coalesce((v_consent->>'given')::boolean, true),
           case when p_source = 'admin' then 'admin' when auth.uid() is not null then 'authenticated_registration' else 'public_registration' end
    from consent_definitions cd
    where cd.church_id = v_church_id and cd.key = v_consent->>'consent_key' and cd.active;
  end loop;

  perform app.write_audit_log(
    v_church_id,
    case v_final_status when 'confirmed' then 'registration.confirmed' else 'registration.waitlisted' end,
    'registrations', v_registration_id,
    jsonb_build_object('event_id', p_event_id, 'status', v_final_status, 'attendees_count', v_attendees_count)
  );

  return query select v_registration_id, v_final_status, v_code, v_token, v_waitlist_pos, false;
end;
$$;

revoke all on function app.register_for_event(
  uuid, event_registration_type, text, text, text, uuid, jsonb, jsonb, jsonb, text, event_registration_source_hint
) from public, anon;
grant execute on function app.register_for_event(
  uuid, event_registration_type, text, text, text, uuid, jsonb, jsonb, jsonb, text, event_registration_source_hint
) to authenticated, anon;

create or replace function public.register_for_event(
  p_event_id uuid,
  p_registration_type event_registration_type,
  p_primary_name text,
  p_primary_email text,
  p_primary_phone text default null,
  p_primary_person_id uuid default null,
  p_attendees jsonb default '[]'::jsonb,
  p_answers jsonb default '[]'::jsonb,
  p_consents jsonb default '[]'::jsonb,
  p_idempotency_key text default null
)
returns table (
  registration_id uuid,
  status registration_status,
  registration_code text,
  cancel_token text,
  waitlist_position integer,
  replayed boolean
)
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select * from app.register_for_event(
    p_event_id, p_registration_type, p_primary_name, p_primary_email, p_primary_phone,
    p_primary_person_id, p_attendees, p_answers, p_consents, p_idempotency_key,
    case when auth.uid() is not null then 'authenticated' else 'public' end::event_registration_source_hint
  );
$$;

revoke all on function public.register_for_event(
  uuid, event_registration_type, text, text, text, uuid, jsonb, jsonb, jsonb, text
) from public;
grant execute on function public.register_for_event(
  uuid, event_registration_type, text, text, text, uuid, jsonb, jsonb, jsonb, text
) to authenticated, anon;

-- app.cancel_registration_by_token(): cancelación sin cuenta mediante token.
create or replace function app.cancel_registration_by_token(p_cancel_token text, p_reason text default null)
returns table (registration_id uuid, status registration_status, promoted_count integer)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_reg registrations%rowtype;
  v_promoted integer := 0;
begin
  select * into v_reg from registrations where cancel_token = p_cancel_token for update;
  if not found then
    raise exception 'Inscripción no encontrada.' using errcode = 'P0002';
  end if;

  if v_reg.status = 'cancelled' then
    return query select v_reg.id, v_reg.status, 0;
    return;
  end if;

  update registrations
  set status = 'cancelled', cancelled_at = now(), cancel_reason = p_reason, waitlist_position = null
  where id = v_reg.id;

  perform app.write_audit_log(v_reg.church_id, 'registration.cancelled', 'registrations', v_reg.id,
    jsonb_build_object('event_id', v_reg.event_id, 'was_status', v_reg.status));

  if v_reg.status = 'confirmed' then
    v_promoted := app.promote_waitlist(v_reg.event_id);
  end if;

  return query select v_reg.id, 'cancelled'::registration_status, v_promoted;
end;
$$;

revoke all on function app.cancel_registration_by_token(text, text) from public, anon;
grant execute on function app.cancel_registration_by_token(text, text) to authenticated, anon;

create or replace function public.cancel_registration_by_token(p_cancel_token text, p_reason text default null)
returns table (registration_id uuid, status registration_status, promoted_count integer)
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select * from app.cancel_registration_by_token(p_cancel_token, p_reason);
$$;

revoke all on function public.cancel_registration_by_token(text, text) from public;
grant execute on function public.cancel_registration_by_token(text, text) to authenticated, anon;

-- app.promote_waitlist(): promociona a los siguientes elegibles cuando hay
-- capacidad libre. Idempotente: solo promueve mientras haya plazas y
-- registros en waitlist, en orden de posición. FOR UPDATE SKIP LOCKED evita
-- que dos llamadas simultáneas promocionen la misma plaza dos veces.
create or replace function app.promote_waitlist(p_event_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_event events%rowtype;
  v_confirmed integer;
  v_free integer;
  v_row registrations%rowtype;
  v_count integer := 0;
begin
  select * into v_event from events where id = p_event_id for update;
  if not found or v_event.capacity is null then
    return 0;
  end if;

  select coalesce(sum(attendees_count), 0) into v_confirmed
  from registrations where event_id = p_event_id and registrations.status = 'confirmed';
  v_free := v_event.capacity - v_confirmed;

  for v_row in
    select * from registrations
    where event_id = p_event_id and status = 'waitlisted'
    order by waitlist_position asc
    for update skip locked
  loop
    exit when v_free < v_row.attendees_count;

    update registrations
    set status = 'confirmed', confirmed_at = now(), waitlist_position = null
    where id = v_row.id;

    perform app.write_audit_log(v_event.church_id, 'registration.promoted', 'registrations', v_row.id,
      jsonb_build_object('event_id', p_event_id));

    v_free := v_free - v_row.attendees_count;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function app.promote_waitlist(uuid) from public, anon;
grant execute on function app.promote_waitlist(uuid) to authenticated;

create or replace function public.promote_waitlist(p_event_id uuid)
returns integer
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.promote_waitlist(p_event_id);
$$;

revoke all on function public.promote_waitlist(uuid) from public;
grant execute on function public.promote_waitlist(uuid) to authenticated;

-- app.admin_cancel_registration(): cancelación administrativa (requiere capability).
create or replace function app.admin_cancel_registration(p_registration_id uuid, p_reason text default null)
returns table (registration_id uuid, status registration_status, promoted_count integer)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_reg registrations%rowtype;
  v_activity activities%rowtype;
  v_promoted integer := 0;
begin
  select * into v_reg from registrations where id = p_registration_id for update;
  if not found then
    raise exception 'Inscripción no encontrada.' using errcode = 'P0002';
  end if;

  select a.* into v_activity from activities a
  join events e on e.activity_id = a.id and e.church_id = a.church_id
  where e.id = v_reg.event_id;

  if not app.event_cap(v_reg.church_id, v_activity.campus_id, v_activity.id, 'event.registration.manage') then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  if v_reg.status = 'cancelled' then
    return query select v_reg.id, v_reg.status, 0;
    return;
  end if;

  update registrations
  set status = 'cancelled', cancelled_at = now(), cancel_reason = p_reason, waitlist_position = null
  where id = v_reg.id;

  perform app.write_audit_log(v_reg.church_id, 'registration.cancelled', 'registrations', v_reg.id,
    jsonb_build_object('event_id', v_reg.event_id, 'was_status', v_reg.status, 'by', 'admin'));

  if v_reg.status = 'confirmed' then
    v_promoted := app.promote_waitlist(v_reg.event_id);
  end if;

  return query select v_reg.id, 'cancelled'::registration_status, v_promoted;
end;
$$;

revoke all on function app.admin_cancel_registration(uuid, text) from public, anon;
grant execute on function app.admin_cancel_registration(uuid, text) to authenticated;

create or replace function public.admin_cancel_registration(p_registration_id uuid, p_reason text default null)
returns table (registration_id uuid, status registration_status, promoted_count integer)
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select * from app.admin_cancel_registration(p_registration_id, p_reason);
$$;

revoke all on function public.admin_cancel_registration(uuid, text) from public;
grant execute on function public.admin_cancel_registration(uuid, text) to authenticated;

-- app.checkin_attendee() / app.undo_checkin_attendee(): idempotentes.
create or replace function app.checkin_attendee(p_attendee_id uuid)
returns table (attendee_id uuid, attendance_status attendance_status, checked_in_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_att registration_attendees%rowtype;
  v_activity activities%rowtype;
begin
  select * into v_att from registration_attendees where id = p_attendee_id;
  if not found then
    raise exception 'Asistente no encontrado.' using errcode = 'P0002';
  end if;

  select a.* into v_activity from activities a
  join events e on e.activity_id = a.id and e.church_id = a.church_id
  where e.id = v_att.event_id;

  if not app.event_cap(v_att.church_id, v_activity.campus_id, v_activity.id, 'event.checkin') then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  if v_att.attendance_status <> 'checked_in' then
    update registration_attendees
    set attendance_status = 'checked_in', checked_in_at = now(), checked_in_by = auth.uid()
    where id = p_attendee_id;

    perform app.write_audit_log(v_att.church_id, 'event.checkin', 'registration_attendees', p_attendee_id,
      jsonb_build_object('event_id', v_att.event_id));
  end if;

  return query select v_att.id, 'checked_in'::attendance_status, now();
end;
$$;

revoke all on function app.checkin_attendee(uuid) from public, anon;
grant execute on function app.checkin_attendee(uuid) to authenticated;

create or replace function public.checkin_attendee(p_attendee_id uuid)
returns table (attendee_id uuid, attendance_status attendance_status, checked_in_at timestamptz)
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select * from app.checkin_attendee(p_attendee_id);
$$;

revoke all on function public.checkin_attendee(uuid) from public;
grant execute on function public.checkin_attendee(uuid) to authenticated;

create or replace function app.undo_checkin_attendee(p_attendee_id uuid)
returns table (attendee_id uuid, attendance_status attendance_status)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_att registration_attendees%rowtype;
  v_activity activities%rowtype;
begin
  select * into v_att from registration_attendees where id = p_attendee_id;
  if not found then
    raise exception 'Asistente no encontrado.' using errcode = 'P0002';
  end if;

  select a.* into v_activity from activities a
  join events e on e.activity_id = a.id and e.church_id = a.church_id
  where e.id = v_att.event_id;

  if not app.event_cap(v_att.church_id, v_activity.campus_id, v_activity.id, 'event.checkin') then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  update registration_attendees
  set attendance_status = 'registered', checked_in_at = null, checked_in_by = null
  where id = p_attendee_id;

  perform app.write_audit_log(v_att.church_id, 'event.checkout_undo', 'registration_attendees', p_attendee_id,
    jsonb_build_object('event_id', v_att.event_id));

  return query select v_att.id, 'registered'::attendance_status;
end;
$$;

revoke all on function app.undo_checkin_attendee(uuid) from public, anon;
grant execute on function app.undo_checkin_attendee(uuid) to authenticated;

create or replace function public.undo_checkin_attendee(p_attendee_id uuid)
returns table (attendee_id uuid, attendance_status attendance_status)
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select * from app.undo_checkin_attendee(p_attendee_id);
$$;

revoke all on function public.undo_checkin_attendee(uuid) from public;
grant execute on function public.undo_checkin_attendee(uuid) to authenticated;

-- public.public_event_by_slug(): lectura pública mínima y segura de un
-- evento por slug de iglesia + slug de evento, sin exponer IDs internos
-- innecesarios ni church_id.
create or replace function public.public_event_by_slug(p_church_slug text, p_event_slug text)
returns table (
  event_id uuid,
  title text,
  short_description text,
  public_description text,
  cover_image_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text,
  location_text text,
  church_name text,
  registration_status event_registration_status,
  capacity integer,
  confirmed_count integer,
  contact_email text,
  contact_phone text,
  registration_type event_registration_type
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    e.id, a.title, e.short_description, e.public_description, e.cover_image_url,
    a.starts_at, a.ends_at, a.timezone, a.location_text, c.name,
    app.event_registration_status(e.id), e.capacity,
    (select coalesce(sum(attendees_count), 0)::integer from registrations where event_id = e.id and registrations.status = 'confirmed'),
    e.contact_email, e.contact_phone, e.registration_type
  from events e
  join activities a on a.id = e.activity_id and a.church_id = e.church_id
  join churches c on c.id = e.church_id
  where c.slug = p_church_slug
    and e.public_slug = p_event_slug
    and app.can_read_event_public(e.id);
$$;

revoke all on function public.public_event_by_slug(text, text) from public;
grant execute on function public.public_event_by_slug(text, text) to anon, authenticated;
