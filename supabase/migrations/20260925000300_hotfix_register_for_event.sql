-- Hotfix Fase 6 · Redefinición de app.register_for_event (misma firma).
-- Corrige cinco fallos de la versión de 20260924000600_rpc_inscripcion.sql,
-- ya aplicada en producción:
--
--   F-02 (crítico, suplantación) · La RPC aceptaba p_primary_person_id y los
--   person_id de p_attendees SIN validar nada. La función es `security
--   definer` y está concedida a `anon`: un visitante sin sesión podía crear
--   una inscripción y sus consent_records a nombre de una persona real
--   (incluso de OTRA iglesia, porque registrations.primary_person_id solo
--   tiene FK a people, sin restricción de church_id) y, de paso, dispararle
--   avisos, porque app.emit_registration_notification notifica a
--   primary_person_id. Ahora: sin sesión se IGNORAN esos identificadores (la
--   inscripción pública es siempre anónima respecto al directorio); con
--   sesión, la persona tiene que ser una persona activa de la iglesia del
--   evento (app.assert_active_church_person) y, además, o ser una de las
--   personas del propio usuario (app.current_person_ids) o venir de alguien
--   con event.registration.manage sobre ese evento (alta administrativa).
--
--   F-04 (alto) · La RPC solo miraba el estado temporal de la activity, nunca
--   events.visibility: quien conociera (o adivinara) el uuid de un evento
--   interno podía inscribirse en él sin sesión. Ahora se exige el mismo
--   derecho de lectura que para verlo: app.can_read_event_public sin sesión
--   y, con sesión, ese mismo derecho o app.can_read_event.
--
--   F-06 (alto, abuso) · El límite de inscripciones vivía solo en la Server
--   Action (un Map en memoria del proceso Node), y la RPC está concedida a
--   `anon`: llamando a la API de Supabase directamente se rodeaba por
--   completo. Se añade el límite dentro de la propia RPC.
--
--   F-07 (medio) · El replay por p_idempotency_key devolvía cancel_token y
--   registration_code a quien acertara la clave, sin comprobar quién
--   reintentaba. Ahora exige además que coincida el correo normalizado.
--
--   F-10 (bajo) · El bucle de respuestas no filtraba `archived_at is null`,
--   así que guardaba respuestas a campos archivados que ni siquiera figuran
--   en el fields_snapshot de la submission.

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
  -- Límites de abuso (F-06). Valores deliberadamente holgados para no
  -- estorbar a una iglesia real y suficientes para cortar un bucle
  -- automatizado (el ataque probado eran 300 inscripciones seguidas):
  --   * Por evento: solo cuenta el alta PÚBLICA (source = 'public'); un alta
  --     administrativa o autenticada ni consume ni agota el cupo, así que
  --     cargar a mano una lista de inscritos sigue funcionando.
  --   * Por correo normalizado y evento: el uso legítimo es 1 (el reintento
  --     de red usa idempotency_key y sale antes por replay); se toleran 5, y
  --     no se aplica a quien gestiona las inscripciones del evento (una
  --     familia puede compartir buzón en un alta administrativa).
  c_public_event_window constant interval := interval '10 minutes';
  c_public_event_max    constant integer  := 50;
  c_email_window        constant interval := interval '1 hour';
  c_email_max           constant integer  := 5;

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
  v_email text;
  v_is_public boolean;
  v_can_manage boolean := false;
  v_primary_person_id uuid;
  v_attendee_person_id uuid;
  v_recent integer;
begin
  if p_primary_name is null or btrim(p_primary_name) = '' then
    raise exception 'El nombre es obligatorio.' using errcode = '22023';
  end if;
  if p_primary_email is null or p_primary_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'El correo no es válido.' using errcode = '22023';
  end if;

  v_email := lower(btrim(p_primary_email));
  v_is_public := auth.uid() is null;

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

  -- F-04: inscribirse exige el mismo derecho de lectura que ver el evento.
  -- Se responde "no encontrado" (y no "no autorizado") para no confirmar la
  -- existencia de un evento interno a quien prueba uuids.
  --
  -- Un evento público lo es para todo el mundo, con sesión o sin ella: por eso
  -- app.can_read_event_public vale también para quien tiene sesión. Si no, un
  -- usuario con cuenta en OTRA iglesia quedaría peor tratado que un visitante
  -- anónimo al inscribirse en un evento público (app.can_read_event exige
  -- pertenecer a la iglesia). Con sesión se acepta además la lectura interna
  -- (eventos 'members' o con capability), que el visitante no tiene.
  if not (
    app.can_read_event_public(p_event_id)
    or (not v_is_public and app.can_read_event(p_event_id))
  ) then
    raise exception 'Evento no encontrado.' using errcode = 'P0002';
  end if;

  if v_activity.status not in ('published', 'completed') then
    raise exception 'El evento no admite inscripciones.' using errcode = '22023';
  end if;

  -- F-02: identidad de la persona inscrita.
  if v_is_public then
    -- Sin sesión nadie puede reclamar una identidad del directorio.
    v_primary_person_id := null;
  else
    v_can_manage := app.event_cap(v_church_id, v_activity.campus_id, v_activity.id, 'event.registration.manage');
    v_primary_person_id := p_primary_person_id;
    if v_primary_person_id is not null then
      perform app.assert_active_church_person(v_church_id, v_primary_person_id, 'La persona inscrita');
      if not v_can_manage and v_primary_person_id not in (select app.current_person_ids()) then
        raise exception 'No puedes inscribir a otra persona.' using errcode = '42501';
      end if;
    end if;
  end if;

  -- Idempotencia: reintento con la misma clave devuelve la existente.
  -- F-07: además de acertar la clave, exige el mismo correo; así la clave de
  -- otra persona no entrega su cancel_token ni su código de inscripción.
  if p_idempotency_key is not null then
    select * into v_existing from registrations
    where event_id = p_event_id and idempotency_key = p_idempotency_key;
    if found then
      if lower(btrim(coalesce(v_existing.primary_email, ''))) is distinct from v_email then
        raise exception 'Inscripción no encontrada.' using errcode = 'P0002';
      end if;
      return query select v_existing.id, v_existing.status, v_existing.registration_code,
                          v_existing.cancel_token, v_existing.waitlist_position, true;
      return;
    end if;
  end if;

  -- F-06: límites de abuso dentro de la RPC, no solo en la Server Action.
  if v_is_public then
    select count(*) into v_recent
    from registrations
    where event_id = p_event_id
      and source = 'public'
      and registered_at > now() - c_public_event_window;
    if v_recent >= c_public_event_max then
      raise exception 'Se han recibido demasiadas inscripciones en poco tiempo. Inténtalo de nuevo en unos minutos.'
        using errcode = '53400';
    end if;
  end if;

  -- El límite por correo no se aplica a quien gestiona las inscripciones del
  -- evento: un alta administrativa puede repetir legítimamente el correo de
  -- una familia que comparte buzón.
  if not v_can_manage then
    select count(*) into v_recent
    from registrations
    where event_id = p_event_id
      and lower(primary_email) = v_email
      and registered_at > now() - c_email_window;
    if v_recent >= c_email_max then
      raise exception 'Ya hay demasiadas inscripciones recientes con este correo para este evento.'
        using errcode = '53400';
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

  -- Formulario (si el evento tiene uno asociado): valida requeridos y crea
  -- submission + answers.
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
    values (v_church_id, v_form_id, coalesce(v_form_version, 1), coalesce(v_snapshot, '[]'::jsonb), p_event_id, auth.uid(), v_primary_person_id, 'submitted')
    returning id into v_submission_id;

    for v_answer in select * from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) loop
      -- F-10: solo campos vigentes; un campo archivado no está en el snapshot
      -- y su respuesta quedaría fuera de la ficha y de la exportación.
      select * into v_field from form_fields
      where form_id = v_form_id and church_id = v_church_id and key = v_answer->>'field_key'
        and archived_at is null;
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
    v_primary_person_id, btrim(p_primary_name), v_email, p_primary_phone,
    v_final_status, v_attendees_count, v_waitlist_pos,
    (case when p_source = 'admin' and not v_is_public then 'admin'
          when not v_is_public then 'authenticated'
          else 'public' end)::registration_source,
    v_submission_id, p_idempotency_key, v_token,
    case when v_final_status = 'confirmed' then now() else null end
  )
  returning id into v_registration_id;

  if jsonb_array_length(coalesce(p_attendees, '[]'::jsonb)) = 0 then
    insert into registration_attendees (church_id, registration_id, event_id, person_id, full_name, attendee_type)
    values (v_church_id, v_registration_id, p_event_id, v_primary_person_id, btrim(p_primary_name), 'adult');
  else
    for v_attendee in select * from jsonb_array_elements(p_attendees) loop
      -- F-02, también para cada asistente: sin sesión no se reclama identidad
      -- alguna; con sesión, misma validación que la persona principal.
      v_attendee_person_id := nullif(v_attendee->>'person_id', '')::uuid;
      if v_is_public then
        v_attendee_person_id := null;
      elsif v_attendee_person_id is not null then
        perform app.assert_active_church_person(v_church_id, v_attendee_person_id, 'El asistente');
        if not v_can_manage and v_attendee_person_id not in (select app.current_person_ids()) then
          raise exception 'No puedes inscribir a otra persona como asistente.' using errcode = '42501';
        end if;
      end if;

      insert into registration_attendees (church_id, registration_id, event_id, person_id, full_name, attendee_type)
      values (
        v_church_id, v_registration_id, p_event_id,
        v_attendee_person_id,
        coalesce(nullif(btrim(v_attendee->>'full_name'), ''), p_primary_name),
        coalesce((v_attendee->>'attendee_type')::attendee_type, 'adult')
      );
    end loop;
  end if;

  for v_consent in select * from jsonb_array_elements(coalesce(p_consents, '[]'::jsonb)) loop
    insert into consent_records (church_id, consent_definition_id, consent_version, registration_id, person_id, given, origin)
    select v_church_id, cd.id, cd.version, v_registration_id, v_primary_person_id,
           coalesce((v_consent->>'given')::boolean, true),
           case when p_source = 'admin' and not v_is_public then 'admin'
                when not v_is_public then 'authenticated_registration'
                else 'public_registration' end
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

comment on function app.register_for_event(
  uuid, event_registration_type, text, text, text, uuid, jsonb, jsonb, jsonb, text, event_registration_source_hint
) is
  'Única puerta de escritura de inscripciones. Exige derecho de lectura del evento (público sin sesión, app.can_read_event con sesión), ignora o valida las identidades de persona reclamadas, limita el abuso por evento y por correo y comprueba el correo en el replay idempotente. Ver hotfix F-02, F-04, F-06, F-07 y F-10.';
