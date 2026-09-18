-- Fase 7 · Avisos internos de Grupos y Discipulado.
-- Ver docs/CONTRATO-FASE-7.md §7.
--
-- Solo se emiten los avisos acordados como imprescindibles (decisión P-6):
-- solicitud recibida, solicitud resuelta, incorporación al grupo, cambio o
-- cancelación de reunión o sesión, y curso o paso terminado.
--
-- El transporte externo sigue DESACTIVADO (D20/D21): correo y push se encolan
-- y no salen. Ni esta migración ni la interfaz dicen que se haya enviado nada.

-- 1. Tipos de evento ---------------------------------------------------------
-- Mismo patrón que usó la Fase 6 (20260924000700_avisos_eventos.sql:5-26):
-- el check es text + constraint precisamente para poder ampliarlo dentro de
-- una transacción, cosa que `alter type ... add value` no permite.

alter table notification_events drop constraint notification_events_event_type_check;

alter table notification_events add constraint notification_events_event_type_check
  check (event_type in (
    -- Fase 5
    'assignment.proposed', 'assignment.accepted', 'assignment.declined',
    'assignment.cancelled', 'assignment.substituted',
    'assignment.substitution_requested', 'assignment.substitution_cancelled',
    'assignment.reminder', 'assignment.coverage_at_risk', 'activity.rescheduled',
    -- Fase 6
    'event.published', 'event.cancelled', 'event.rescheduled', 'event.reminder',
    'registration.confirmed', 'registration.waitlisted', 'registration.promoted',
    'registration.cancelled',
    -- Fase 7
    'group.join_request.received', 'group.join_request.accepted',
    'group.join_request.rejected', 'group.member.added',
    'group.meeting.rescheduled', 'group.meeting.cancelled',
    'course.session.rescheduled', 'course.session.cancelled',
    'course.enrollment.completed', 'path.step.completed'
  ));

-- 2. Textos ------------------------------------------------------------------
--
-- app.notification_text pasa a ser un despachador: prueba primero los tipos de
-- la Fase 7 y, si no es ninguno, delega en app.notification_text_fase5, que es
-- copia LITERAL del cuerpo que tenía hasta ahora (20260923000500:59-153). No se
-- cambia ni un texto de las fases anteriores; solo se traslada, para que cada
-- fase pueda añadir sus tipos sin volver a copiar todas las ramas.
--
-- Nota heredada (riesgo R-02 del contrato): los tipos event.* y registration.*
-- de la Fase 6 nunca tuvieron rama propia y caen en el texto genérico «Aviso».
-- No se corrige aquí porque es un defecto de la Fase 6 y corresponde a su
-- responsable; queda anotado para hotfix.

create or replace function app.notification_text_fase5(p_event notification_events)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_payload jsonb := coalesce(p_event.payload, '{}'::jsonb);
  v_when text := app.notification_when(v_payload);
  v_position text := coalesce(nullif(v_payload ->> 'position_name', ''), 'un puesto');
  v_activity text := coalesce(nullif(v_payload ->> 'activity_title', ''), 'una actividad');
  v_person text := app.notification_person_label(nullif(v_payload ->> 'person_id', '')::uuid);
  v_title text;
  v_body text;
begin
  case p_event.event_type
    when 'assignment.proposed' then
      v_title := 'Turno por confirmar';
      v_body := 'Te han asignado el puesto «' || v_position || '» en «' || v_activity || '»' || v_when
        || '. Entra en LEVITA para aceptarlo o rechazarlo.';

    when 'assignment.accepted' then
      v_title := 'Turno aceptado';
      v_body := v_person || ' ha aceptado el puesto «' || v_position || '» en «' || v_activity || '»' || v_when || '.';

    when 'assignment.declined' then
      v_title := 'Turno rechazado';
      v_body := v_person || ' no puede servir en el puesto «' || v_position || '» de «' || v_activity || '»' || v_when || '.';

    when 'assignment.cancelled' then
      v_title := 'Turno retirado';
      v_body := case v_payload ->> 'cause'
        when 'activity_cancelled' then 'Se ha cancelado «' || v_activity || '»' || v_when
          || ': ya no se te espera en el puesto «' || v_position || '».'
        when 'occurrence_removed' then 'Se ha cancelado «' || v_activity || '»' || v_when
          || ': ya no se te espera en el puesto «' || v_position || '».'
        when 'activity_archived' then 'Se ha archivado «' || v_activity || '»' || v_when
          || ': ya no se te espera en el puesto «' || v_position || '».'
        when 'substitution_withdrawn' then 'Se ha retirado la sustitución del puesto «' || v_position
          || '» en «' || v_activity || '»' || v_when || ': ya no se te espera.'
        else 'Se ha retirado tu turno del puesto «' || v_position || '» en «' || v_activity || '»' || v_when || '.'
      end;

    when 'assignment.substituted' then
      v_title := 'Te han sustituido en un turno';
      v_body := 'Otra persona ocupará el puesto «' || v_position || '» en «' || v_activity || '»' || v_when
        || '. Ya no se te espera.';

    when 'assignment.substitution_requested' then
      v_title := 'Solicitud de sustitución';
      v_body := v_person || ' necesita que le sustituyan en el puesto «' || v_position || '» de «'
        || v_activity || '»' || v_when || '.';

    when 'assignment.substitution_cancelled' then
      v_title := 'Solicitud de sustitución cancelada';
      v_body := case when coalesce((v_payload ->> 'requested_by_self')::boolean, false)
        then 'Se ha cancelado la sustitución que pediste para el puesto «' || v_position || '» de «'
          || v_activity || '»' || v_when || '. Sigues contando en ese turno.'
        else 'Se ha cancelado la sustitución abierta para el puesto «' || v_position || '» de «'
          || v_activity || '»' || v_when || '. ' || v_person || ' sigue contando en ese turno.'
      end;

    when 'activity.rescheduled' then
      v_title := 'Cambio de hora';
      v_body := '«' || v_activity || '» cambia de hora: ahora empieza' || coalesce(nullif(v_when, ''), ' en otro momento')
        || '. Vuelve a confirmar tu turno del puesto «' || v_position || '».';

    when 'assignment.reminder' then
      if coalesce(v_payload ->> 'kind', 'pending') = 'accepted' then
        v_title := 'Recordatorio de turno';
        v_body := 'Sirves en el puesto «' || v_position || '» de «' || v_activity || '»' || v_when || '.';
      else
        v_title := 'Tienes un turno sin responder';
        v_body := 'Todavía no has respondido al puesto «' || v_position || '» de «' || v_activity || '»' || v_when
          || '. Entra en LEVITA para aceptarlo o rechazarlo.';
      end if;

    when 'assignment.coverage_at_risk' then
      v_title := 'Puesto crítico sin cubrir';
      -- Se cuentan SOLO las confirmaciones (turnos aceptados): un turno enviado
      -- sin responder no cubre nada, y el texto lo dice para que nadie lo lea
      -- como «hay gente asignada».
      v_body := 'El puesto crítico «' || v_position || '» de «' || v_activity || '»' || v_when
        || ' sigue sin cubrir: hay ' || coalesce(v_payload ->> 'accepted_count', '?')
        || ' persona(s) con el turno confirmado de las ' || coalesce(v_payload ->> 'min_people', '?')
        || ' que hacen falta, así que faltan ' || coalesce(v_payload ->> 'missing', '?')
        || ' confirmación(es) y quedan menos de 3 días. Los turnos enviados sin respuesta no cuentan.';

    else
      v_title := 'Aviso';
      v_body := 'Tienes un aviso nuevo en «' || v_activity || '».';
  end case;

  return jsonb_build_object('title', left(v_title, 200), 'body', left(v_body, 1000));
end;
$$;

revoke all on function app.notification_text_fase5(notification_events) from public, anon, authenticated;

create or replace function app.notification_text_fase7(p_event notification_events)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_payload jsonb := coalesce(p_event.payload, '{}'::jsonb);
  v_when text := app.notification_when(v_payload);
  v_group text := coalesce(nullif(v_payload ->> 'group_name', ''), 'un grupo');
  v_course text := coalesce(nullif(v_payload ->> 'course_name', ''), 'un curso');
  v_cohort text := coalesce(nullif(v_payload ->> 'cohort_name', ''), '');
  v_step text := coalesce(nullif(v_payload ->> 'step_title', ''), 'un paso');
  v_path text := coalesce(nullif(v_payload ->> 'path_name', ''), 'tu itinerario');
  v_person text := app.notification_person_label(nullif(v_payload ->> 'person_id', '')::uuid);
  v_note text := nullif(v_payload ->> 'decision_note', '');
  v_title text;
  v_body text;
begin
  case p_event.event_type
    when 'group.join_request.received' then
      v_title := 'Nueva solicitud para tu grupo';
      v_body := v_person || ' quiere unirse a «' || v_group || '». Entra en LEVITA para aceptarla o rechazarla.';

    when 'group.join_request.accepted' then
      v_title := 'Te han aceptado en el grupo';
      v_body := 'Ya formas parte de «' || v_group || '».';

    when 'group.join_request.rejected' then
      v_title := 'Solicitud no aceptada';
      v_body := 'Tu solicitud para unirte a «' || v_group || '» no ha sido aceptada'
        || coalesce(': ' || v_note, '') || '.';

    when 'group.member.added' then
      v_title := 'Te han incorporado a un grupo';
      v_body := 'Ya formas parte de «' || v_group || '».';

    when 'group.meeting.rescheduled' then
      v_title := 'Cambio en una reunión de grupo';
      v_body := 'La reunión de «' || v_group || '» cambia de hora: ahora empieza'
        || coalesce(nullif(v_when, ''), ' en otro momento') || '.';

    when 'group.meeting.cancelled' then
      v_title := 'Reunión de grupo cancelada';
      v_body := 'Se ha cancelado la reunión de «' || v_group || '»' || v_when || '.';

    when 'course.session.rescheduled' then
      v_title := 'Cambio en una sesión de formación';
      v_body := 'Una sesión de «' || v_course || '» cambia de hora: ahora empieza'
        || coalesce(nullif(v_when, ''), ' en otro momento') || '.';

    when 'course.session.cancelled' then
      v_title := 'Sesión de formación cancelada';
      v_body := 'Se ha cancelado una sesión de «' || v_course || '»' || v_when || '.';

    when 'course.enrollment.completed' then
      v_title := 'Has terminado un curso';
      v_body := 'Has terminado «' || v_course || '»'
        || case when v_cohort <> '' then ' (' || v_cohort || ')' else '' end || '. Enhorabuena.';

    when 'path.step.completed' then
      v_title := 'Has avanzado en tu itinerario';
      v_body := 'Has completado el paso «' || v_step || '» de «' || v_path || '».';

    else
      return null;
  end case;

  return jsonb_build_object('title', left(v_title, 200), 'body', left(v_body, 1000));
end;
$$;

revoke all on function app.notification_text_fase7(notification_events) from public, anon, authenticated;

create or replace function app.notification_text(p_event notification_events)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_text jsonb;
begin
  v_text := app.notification_text_fase7(p_event);
  if v_text is not null then
    return v_text;
  end if;
  return app.notification_text_fase5(p_event);
end;
$$;

revoke all on function app.notification_text(notification_events) from public, anon, authenticated;

-- 3. Destinatarios -----------------------------------------------------------

-- app.person_group_manage_cap(): ¿esa persona (no el usuario actual) puede
-- resolver las solicitudes de este grupo? Equivalente de
-- app.person_assignment_manage_cap (20260923000300:25) para el scope 'group'.
create or replace function app.person_group_manage_cap(
  p_church_id uuid,
  p_campus_id uuid,
  p_group_id uuid,
  p_person_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from church_people cp
    join church_people_roles cpr
      on cpr.church_people_id = cp.id and cpr.church_id = cp.church_id
    join role_capabilities rc on rc.role_key = cpr.role_key
    where cp.church_id = p_church_id
      and cp.person_id = p_person_id
      and cp.archived_at is null
      and rc.capability_key = 'group.request.manage'
      and (
        cpr.scope_type = 'church'
        or (cpr.scope_type = 'campus' and cpr.scope_id is not distinct from p_campus_id)
        or (cpr.scope_type = 'group' and cpr.scope_id is not distinct from p_group_id)
      )
  );
$$;

revoke all on function app.person_group_manage_cap(uuid, uuid, uuid, uuid) from public, anon, authenticated;

-- app.group_notification_recipients(): a quién avisa un grupo.
--   'members'  → participantes activos (a quienes afecta un cambio de reunión)
--   'leaders'  → responsables vigentes que ADEMÁS puedan resolver de verdad la
--                solicitud; si no queda ninguno, se recurre a la administración
--                de la iglesia.
-- Misma doctrina que app.position_notification_recipients (20260923000300:88-97):
-- figurar en group_leaders no es la fuente de autorización.
create or replace function app.group_notification_recipients(
  p_group_id uuid,
  p_audience text
)
returns uuid[]
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_group groups%rowtype;
  v_ids uuid[];
begin
  select * into v_group from groups where id = p_group_id;
  if not found then
    return array[]::uuid[];
  end if;

  if p_audience = 'members' then
    select coalesce(array_agg(distinct gm.person_id), array[]::uuid[]) into v_ids
    from group_members gm
    where gm.group_id = p_group_id and gm.status = 'active';
    return v_ids;
  end if;

  select coalesce(array_agg(distinct gl.person_id), array[]::uuid[]) into v_ids
  from group_leaders gl
  join church_people cp
    on cp.church_id = gl.church_id and cp.person_id = gl.person_id and cp.archived_at is null
  where gl.group_id = p_group_id
    and gl.ends_at is null
    and app.person_group_manage_cap(gl.church_id, v_group.campus_id, p_group_id, gl.person_id);

  if v_ids is null or cardinality(v_ids) = 0 then
    return app.church_admin_person_ids(v_group.church_id, v_group.campus_id);
  end if;

  return v_ids;
end;
$$;

revoke all on function app.group_notification_recipients(uuid, text) from public, anon, authenticated;

-- app.group_notification_payload(): datos mínimos para redactar el aviso.
-- Se revoca de authenticated porque no comprueba lectura: es de uso interno de
-- funciones definer (misma corrección que hubo que aplicar a
-- app.event_notification_payload en 20260925000400).
create or replace function app.group_notification_payload(p_group_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'group_id', g.id,
    'group_name', g.name,
    'campus_id', g.campus_id
  )
  from groups g
  where g.id = p_group_id;
$$;

revoke all on function app.group_notification_payload(uuid) from public, anon, authenticated;

create or replace function app.cohort_notification_payload(p_cohort_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'cohort_id', cc.id,
    'cohort_name', cc.name,
    'course_id', c.id,
    'course_name', c.name,
    'campus_id', cc.campus_id
  )
  from course_cohorts cc
  join courses c on c.id = cc.course_id and c.church_id = cc.church_id
  where cc.id = p_cohort_id;
$$;

revoke all on function app.cohort_notification_payload(uuid) from public, anon, authenticated;

-- app.cohort_notification_recipients(): matriculados vivos de una cohorte.
create or replace function app.cohort_notification_recipients(p_cohort_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(array_agg(distinct e.person_id), array[]::uuid[])
  from course_enrollments e
  where e.cohort_id = p_cohort_id
    and e.status in ('enrolled', 'completed');
$$;

revoke all on function app.cohort_notification_recipients(uuid) from public, anon, authenticated;

-- app.notify_group_members(): comunicación interna al grupo.
--
-- A diferencia de la equivalente de la Fase 6, esta comprueba la capacidad
-- DESDE EL PRIMER DÍA: sin group.manage o group.meeting.manage sobre ese grupo
-- no se puede escribir a sus participantes (la de eventos nació sin la
-- comprobación y hubo que arreglarla en caliente, 20260925000400).
create or replace function app.notify_group_members(
  p_group_id uuid,
  p_event_type text,
  p_extra jsonb default '{}'::jsonb,
  p_key_suffix text default null
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_group groups%rowtype;
  v_recipients uuid[];
  v_event_id uuid;
begin
  select * into v_group from groups where id = p_group_id;
  if not found then
    raise exception 'El grupo no existe.' using errcode = 'P0002';
  end if;

  if not (
    app.group_cap(v_group.church_id, v_group.campus_id, v_group.id, 'group.manage')
    or app.group_cap(v_group.church_id, v_group.campus_id, v_group.id, 'group.meeting.manage')
  ) then
    raise exception 'No tienes permiso para escribir a los participantes de este grupo.'
      using errcode = '42501';
  end if;

  -- El tipo no puede ser libre: con el check de notification_events como único
  -- límite, quien lleva un grupo podría colocar en la bandeja de sus
  -- participantes un aviso de cualquier otro dominio («has terminado un curso»,
  -- «turno por confirmar»...) y con el texto que quisiera.
  if p_event_type not in ('group.meeting.rescheduled', 'group.meeting.cancelled') then
    raise exception 'Tipo de aviso no permitido para un grupo: %.', p_event_type
      using errcode = '22023';
  end if;

  v_recipients := app.group_notification_recipients(p_group_id, 'members');
  if cardinality(v_recipients) = 0 then
    return 0;
  end if;

  v_event_id := app.emit_notification_event(
    v_group.church_id,
    p_event_type,
    'groups',
    p_group_id,
    null,
    v_recipients,
    -- El payload de confianza va el ÚLTIMO: si fuera al revés, p_extra podría
    -- sobreescribir el nombre del grupo y falsear de quién viene el aviso.
    coalesce(p_extra, '{}'::jsonb) || app.group_notification_payload(p_group_id),
    -- Sin sufijo propio, la clave sería «<tipo>:<grupo>:0» y un grupo recibiría
    -- un único aviso de cada tipo en toda su vida: el segundo se perdería en
    -- silencio. El sufijo por defecto no puede depender de que el llamante se
    -- acuerde de pasarlo.
    coalesce(p_key_suffix, gen_random_uuid()::text),
    null
  );

  if v_event_id is null then
    return 0;
  end if;

  return cardinality(v_recipients);
end;
$$;

revoke all on function app.notify_group_members(uuid, text, jsonb, text) from public, anon;
grant execute on function app.notify_group_members(uuid, text, jsonb, text) to authenticated;

create or replace function public.notify_group_members(
  p_group_id uuid,
  p_event_type text,
  p_extra jsonb default '{}'::jsonb,
  p_key_suffix text default null
)
returns integer
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.notify_group_members(p_group_id, p_event_type, p_extra, p_key_suffix);
$$;

revoke all on function public.notify_group_members(uuid, text, jsonb, text) from public, anon;
grant execute on function public.notify_group_members(uuid, text, jsonb, text) to authenticated;
