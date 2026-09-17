-- Fase 5 (Carlos) · Operaciones de asignaciones, respuestas y sustituciones.
--
-- Patrón del proyecto: app.* security definer (pertenencia, capability/scope,
-- módulo serving, reglas, auditoría en la misma transacción) + wrapper
-- public.* security invoker.
--
-- Concurrencia: cada operación bloquea la fila de la actividad (FOR UPDATE)
-- para serializar capacidad y sustituciones; las respuestas pueden exigir la
-- versión vista (p_expected_version) y fallan con PT409 si cambió.
--
-- Errores: 42501 no autorizado · P0002 no encontrado · 22023 regla (bloqueos
-- en DETAIL como códigos separados por comas) · PT412 hay avisos sin confirmar
-- (códigos en DETAIL) · PT409 la asignación cambió · 23505 conflicto.
--
-- EVENTO F5: puntos donde se emitirá al motor de avisos de Diogo (DI-02) cuando
-- exista su punto de escritura acordado. Hoy no se emite nada.

-- ===========================================================================
-- Utilidades
-- ===========================================================================
create or replace function app.lock_assignment_context(p_assignment_id uuid)
returns table (assignment activity_assignments, activity activities)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_assignment activity_assignments%rowtype;
  v_activity activities%rowtype;
begin
  select * into v_assignment from activity_assignments where id = p_assignment_id;
  if not found or not (v_assignment.church_id = any (app.church_ids_for_user())) then
    raise exception 'La asignación no existe.' using errcode = 'P0002';
  end if;
  select * into v_activity from activities where id = v_assignment.activity_id for update;
  select * into v_assignment from activity_assignments where id = p_assignment_id for update;
  return query select v_assignment, v_activity;
end;
$$;

create or replace function app.require_assignment_manage(p_activity activities, p_service_area_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not app.assignment_manage_cap(p_activity.church_id, p_activity.campus_id, p_activity.id, p_service_area_id) then
    raise exception 'No tienes permiso para gestionar asignaciones de este puesto.' using errcode = '42501';
  end if;
  if not app.module_enabled(p_activity.church_id, 'serving') then
    raise exception 'El módulo Servicios no está habilitado.' using errcode = '42501';
  end if;
end;
$$;

create or replace function app.raise_assignment_blocked(p_blocking text[])
returns void
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
begin
  if cardinality(p_blocking) > 0 then
    raise exception 'No se puede asignar: la persona no cumple las condiciones del puesto.'
      using errcode = '22023', detail = array_to_string(p_blocking, ',');
  end if;
end;
$$;

create or replace function app.check_expected_version(p_assignment activity_assignments, p_expected integer)
returns void
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
begin
  if p_expected is not null and p_expected <> p_assignment.version then
    raise exception 'La asignación ha cambiado mientras la veías. Recarga e inténtalo de nuevo.'
      using errcode = 'PT409', detail = p_assignment.version::text;
  end if;
end;
$$;

revoke all on function app.lock_assignment_context(uuid) from public, anon, authenticated;
revoke all on function app.require_assignment_manage(activities, uuid) from public, anon, authenticated;
revoke all on function app.raise_assignment_blocked(text[]) from public, anon, authenticated;
revoke all on function app.check_expected_version(activity_assignments, integer) from public, anon, authenticated;

-- ===========================================================================
-- Crear
-- ===========================================================================
-- p_input: acknowledge_warnings (bool), send (bool: crear ya comunicada).
create or replace function app.create_activity_assignment(p_activity_position_id uuid, p_person_id uuid, p_input jsonb default '{}')
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_position activity_positions%rowtype;
  v_activity activities%rowtype;
  v_existing activity_assignments%rowtype;
  v_blocking text[];
  v_warnings text[];
  v_ack boolean := coalesce((p_input ->> 'acknowledge_warnings')::boolean, false);
  v_send boolean := coalesce((p_input ->> 'send')::boolean, false);
  v_id uuid;
begin
  select * into v_position from activity_positions where id = p_activity_position_id;
  if not found or not (v_position.church_id = any (app.church_ids_for_user())) then
    raise exception 'El puesto no existe.' using errcode = 'P0002';
  end if;
  select * into v_activity from activities where id = v_position.activity_id for update;
  perform app.require_assignment_manage(v_activity, v_position.service_area_id);

  -- Reintento: ya existe una asignación vigente para esa persona y puesto.
  select * into v_existing from activity_assignments
  where activity_position_id = p_activity_position_id and person_id = p_person_id
    and status in ('proposed', 'pending', 'accepted');
  if found then
    return jsonb_build_object('assignment_id', v_existing.id, 'status', v_existing.status, 'version', v_existing.version,
      'replayed', true, 'warnings', to_jsonb(v_existing.eligibility_warnings));
  end if;

  select e.blocking, e.warnings into v_blocking, v_warnings
  from app.evaluate_assignment_eligibility(p_activity_position_id, p_person_id, '{}') e;

  perform app.raise_assignment_blocked(v_blocking);
  if cardinality(v_warnings) > 0 and not v_ack then
    raise exception 'La asignación tiene avisos que deben confirmarse.'
      using errcode = 'PT412', detail = array_to_string(v_warnings, ',');
  end if;

  insert into activity_assignments (
    church_id, activity_id, activity_position_id, person_id, status, position_name,
    eligibility_blocking, eligibility_warnings, acknowledged_warnings, created_by, sent_by, sent_at
  ) values (
    v_activity.church_id, v_activity.id, v_position.id, p_person_id,
    case when v_send then 'pending'::activity_assignment_status else 'proposed' end,
    v_position.name, v_blocking, v_warnings, case when v_ack then v_warnings else '{}' end,
    auth.uid(), case when v_send then auth.uid() end, case when v_send then now() end
  )
  returning id into v_id;

  perform app.write_audit_log(
    v_activity.church_id, 'assignment.created', 'activity_assignments', v_id,
    jsonb_build_object('activity_id', v_activity.id, 'activity_position_id', v_position.id, 'person_id', p_person_id,
      'sent', v_send, 'acknowledged_warnings', case when v_ack then to_jsonb(v_warnings) else '[]'::jsonb end)
  );
  -- EVENTO F5 (DI-02): assignment.proposed a la persona si v_send.

  return jsonb_build_object('assignment_id', v_id, 'status', case when v_send then 'pending' else 'proposed' end,
    'version', 1, 'replayed', false, 'warnings', to_jsonb(v_warnings));
exception
  when unique_violation then
    -- Otra transacción creó la misma asignación a la vez.
    select * into v_existing from activity_assignments
    where activity_position_id = p_activity_position_id and person_id = p_person_id
      and status in ('proposed', 'pending', 'accepted');
    return jsonb_build_object('assignment_id', v_existing.id, 'status', v_existing.status, 'version', v_existing.version,
      'replayed', true, 'warnings', to_jsonb(v_existing.eligibility_warnings));
end;
$$;

-- ===========================================================================
-- Enviar (proposed -> pending)
-- ===========================================================================
-- p_assignment_ids nulo = todas las propuestas de la actividad que el usuario gestione.
create or replace function app.send_activity_assignments(p_activity_id uuid, p_assignment_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_activity activities%rowtype;
  v_assignment activity_assignments%rowtype;
  v_sent integer := 0;
begin
  select * into v_activity from activities where id = p_activity_id for update;
  if not found or not (v_activity.church_id = any (app.church_ids_for_user())) then
    raise exception 'La actividad no existe.' using errcode = 'P0002';
  end if;
  if not app.activity_accepts_assignments_unchecked(v_activity.id) then
    raise exception 'La actividad no admite asignaciones en su estado actual.' using errcode = '22023';
  end if;

  for v_assignment in
    select * from activity_assignments
    where activity_id = p_activity_id and status = 'proposed'
      and (p_assignment_ids is null or id = any (p_assignment_ids))
    for update
  loop
    if not app.assignment_manage_cap(v_activity.church_id, v_activity.campus_id, v_activity.id, v_assignment.service_area_id) then
      if p_assignment_ids is not null then
        raise exception 'No tienes permiso para enviar todas las asignaciones indicadas.' using errcode = '42501';
      end if;
      continue;
    end if;
    update activity_assignments
    set status = 'pending', sent_at = now(), sent_by = auth.uid(), version = version + 1
    where id = v_assignment.id;
    v_sent := v_sent + 1;
    -- EVENTO F5 (DI-02): assignment.proposed a v_assignment.person_id.
  end loop;

  if v_sent > 0 then
    perform app.write_audit_log(v_activity.church_id, 'assignment.sent', 'activities', v_activity.id,
      jsonb_build_object('assignments', v_sent));
  end if;
  return v_sent;
end;
$$;

-- ===========================================================================
-- Retirar (coordinador)
-- ===========================================================================
create or replace function app.cancel_activity_assignment(p_assignment_id uuid, p_expected_version integer default null)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_ctx record;
  v_assignment activity_assignments%rowtype;
  v_activity activities%rowtype;
begin
  select * into v_ctx from app.lock_assignment_context(p_assignment_id);
  v_assignment := v_ctx.assignment;
  v_activity := v_ctx.activity;
  perform app.require_assignment_manage(v_activity, v_assignment.service_area_id);

  if v_assignment.status not in ('proposed', 'pending', 'accepted') then
    return jsonb_build_object('status', v_assignment.status, 'version', v_assignment.version, 'replayed', true);
  end if;
  perform app.check_expected_version(v_assignment, p_expected_version);

  update activity_assignments
  set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancel_cause = 'coordinator', version = version + 1
  where id = v_assignment.id;

  -- Si era candidato de una sustitución, la solicitud vuelve a quedar sin candidato.
  update activity_substitution_requests set candidate_assignment_id = null
  where candidate_assignment_id = v_assignment.id and status = 'open';

  -- Si era la original con solicitud abierta, se cierra la solicitud y su candidato.
  update activity_assignments
  set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancel_cause = 'substitution_withdrawn', version = version + 1
  where substitutes_assignment_id = v_assignment.id and status in ('proposed', 'pending', 'accepted');
  update activity_substitution_requests set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid()
  where original_assignment_id = v_assignment.id and status = 'open';

  perform app.write_audit_log(v_activity.church_id, 'assignment.cancelled', 'activity_assignments', v_assignment.id,
    jsonb_build_object('activity_id', v_activity.id, 'from', v_assignment.status));
  -- EVENTO F5 (DI-02): assignment.cancelled a la persona si ya estaba comunicada.

  return jsonb_build_object('status', 'cancelled', 'version', v_assignment.version + 1, 'replayed', false);
end;
$$;

-- ===========================================================================
-- Respuestas
-- ===========================================================================
-- Aplica una respuesta ya autorizada. p_source: self | representative.
create or replace function app.apply_assignment_response(
  p_assignment activity_assignments,
  p_activity activities,
  p_response text,
  p_source activity_assignment_response_source,
  p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_to activity_assignment_status;
  v_blocking text[];
  v_original activity_assignments%rowtype;
begin
  if p_response not in ('accepted', 'declined') then
    raise exception 'Respuesta no válida.' using errcode = '22023';
  end if;
  v_to := p_response::activity_assignment_status;

  -- Repetición de la misma respuesta: sin cambios ni nueva versión (idempotente).
  if p_assignment.status = v_to then
    return jsonb_build_object('status', p_assignment.status, 'version', p_assignment.version, 'replayed', true);
  end if;

  if p_assignment.status in ('proposed', 'cancelled', 'substituted') then
    raise exception 'Esta asignación ya no admite respuestas.' using errcode = '22023';
  end if;
  perform app.check_expected_version(p_assignment, p_expected_version);

  -- Tras aceptar, la propia persona no rechaza: solicita sustitución.
  if p_source = 'self' and p_assignment.status = 'accepted' and v_to = 'declined' then
    raise exception 'Ya aceptaste este turno: solicita una sustitución para darte de baja.' using errcode = '22023';
  end if;

  if v_to = 'accepted' then
    select e.blocking into v_blocking
    from app.evaluate_assignment_eligibility(
      p_assignment.activity_position_id, p_assignment.person_id,
      array_remove(array[p_assignment.id, p_assignment.substitutes_assignment_id], null)
    ) e;
    perform app.raise_assignment_blocked(v_blocking);
  end if;

  update activity_assignments
  set status = v_to,
      responded_at = now(), responded_by = auth.uid(), response_source = p_source,
      confirmed_starts_at = case when v_to = 'accepted' then p_activity.starts_at end,
      confirmed_ends_at = case when v_to = 'accepted' then p_activity.ends_at end,
      reconfirmation_requested_at = case when v_to = 'accepted' then null else reconfirmation_requested_at end,
      version = version + 1
  where id = p_assignment.id;

  -- Sustitución: al aceptar el candidato, la original queda sustituida.
  if p_assignment.substitutes_assignment_id is not null then
    if v_to = 'accepted' then
      select * into v_original from activity_assignments where id = p_assignment.substitutes_assignment_id for update;
      if v_original.status in ('proposed', 'pending', 'accepted') then
        update activity_assignments set status = 'substituted', substituted_at = now(), version = version + 1
        where id = v_original.id;
      end if;
      update activity_substitution_requests set status = 'completed', completed_at = now()
      where original_assignment_id = p_assignment.substitutes_assignment_id and status = 'open';
      perform app.write_audit_log(p_activity.church_id, 'assignment.substituted', 'activity_assignments', v_original.id,
        jsonb_build_object('activity_id', p_activity.id, 'substitute_assignment_id', p_assignment.id));
      -- EVENTO F5 (DI-02): assignment.cancelled (sustituida) a la persona original.
    else
      update activity_substitution_requests set candidate_assignment_id = null
      where candidate_assignment_id = p_assignment.id and status = 'open';
    end if;
  end if;

  perform app.write_audit_log(
    p_activity.church_id,
    case when p_source = 'representative' then 'assignment.response_recorded' else 'assignment.' || p_response end,
    'activity_assignments', p_assignment.id,
    jsonb_build_object('activity_id', p_activity.id, 'from', p_assignment.status, 'to', v_to, 'source', p_source)
  );
  -- EVENTO F5 (DI-02): assignment.accepted/declined a quien gestiona el puesto (sin la nota).

  return jsonb_build_object('status', v_to, 'version', p_assignment.version + 1, 'replayed', false);
end;
$$;

revoke all on function app.apply_assignment_response(activity_assignments, activities, text, activity_assignment_response_source, integer)
  from public, anon, authenticated;

-- Respuesta de la propia persona. p_note: nota privada opcional ('' la borra).
create or replace function app.respond_activity_assignment(
  p_assignment_id uuid,
  p_response text,
  p_expected_version integer default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_ctx record;
  v_assignment activity_assignments%rowtype;
  v_activity activities%rowtype;
  v_deadline timestamptz;
  v_result jsonb;
begin
  select * into v_ctx from app.lock_assignment_context(p_assignment_id);
  v_assignment := v_ctx.assignment;
  v_activity := v_ctx.activity;

  -- Solo la persona asignada; un borrador no existe para ella.
  if not (v_assignment.person_id in (select app.current_person_ids())) or v_assignment.status = 'proposed' then
    raise exception 'La asignación no existe.' using errcode = 'P0002';
  end if;

  v_deadline := app.activity_response_deadline(v_activity);
  if v_deadline is not null and now() >= v_deadline and v_assignment.status::text <> p_response then
    raise exception 'El plazo para responder terminó al empezar la actividad.' using errcode = '22023';
  end if;
  if v_activity.status not in ('planned', 'published') and v_assignment.status::text <> p_response then
    raise exception 'La actividad no admite respuestas en su estado actual.' using errcode = '22023';
  end if;

  v_result := app.apply_assignment_response(v_assignment, v_activity, p_response, 'self', p_expected_version);

  if p_note is not null then
    if btrim(p_note) = '' then
      delete from activity_assignment_notes where assignment_id = v_assignment.id;
    else
      insert into activity_assignment_notes (assignment_id, church_id, person_id, note)
      values (v_assignment.id, v_assignment.church_id, v_assignment.person_id, btrim(p_note))
      on conflict (assignment_id) do update set note = excluded.note, updated_at = now();
    end if;
  end if;

  return v_result;
end;
$$;

-- Respuesta registrada por un representante (quien gestiona el puesto), p. ej.
-- para personas sin cuenta. Queda auditada como tal. Sin nota privada.
create or replace function app.record_assignment_response(
  p_assignment_id uuid,
  p_response text,
  p_expected_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_ctx record;
begin
  select * into v_ctx from app.lock_assignment_context(p_assignment_id);
  perform app.require_assignment_manage(v_ctx.activity, (v_ctx.assignment).service_area_id);
  if (v_ctx.activity).status not in ('planned', 'published') then
    raise exception 'La actividad no admite respuestas en su estado actual.' using errcode = '22023';
  end if;
  if (v_ctx.assignment).status = 'proposed' then
    raise exception 'Envía la asignación antes de registrar una respuesta.' using errcode = '22023';
  end if;
  return app.apply_assignment_response(v_ctx.assignment, v_ctx.activity, p_response, 'representative', p_expected_version);
end;
$$;

-- ===========================================================================
-- Sustituciones
-- ===========================================================================
-- La persona (sobre su asignación aceptada, antes del inicio) o quien gestiona
-- el puesto (aceptada o pendiente) abre una solicitud. Idempotente.
create or replace function app.request_assignment_substitution(p_assignment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_ctx record;
  v_assignment activity_assignments%rowtype;
  v_activity activities%rowtype;
  v_self boolean;
  v_existing activity_substitution_requests%rowtype;
  v_id uuid;
  v_deadline timestamptz;
begin
  select * into v_ctx from app.lock_assignment_context(p_assignment_id);
  v_assignment := v_ctx.assignment;
  v_activity := v_ctx.activity;
  v_self := v_assignment.person_id in (select app.current_person_ids());

  if v_self and v_assignment.status <> 'proposed'
     and not app.assignment_manage_cap(v_activity.church_id, v_activity.campus_id, v_activity.id, v_assignment.service_area_id) then
    if v_assignment.status <> 'accepted' then
      raise exception 'Solo puedes pedir sustitución de un turno aceptado; si está pendiente, recházalo.' using errcode = '22023';
    end if;
    v_deadline := app.activity_response_deadline(v_activity);
    if v_deadline is not null and now() >= v_deadline then
      raise exception 'La actividad ya empezó: habla con quien coordina el puesto.' using errcode = '22023';
    end if;
  else
    perform app.require_assignment_manage(v_activity, v_assignment.service_area_id);
    v_self := false;
    if v_assignment.status not in ('pending', 'accepted') then
      raise exception 'Solo se sustituyen asignaciones pendientes o aceptadas.' using errcode = '22023';
    end if;
  end if;

  if not app.activity_accepts_assignments_unchecked(v_activity.id) then
    raise exception 'La actividad no admite cambios de asignación en su estado actual.' using errcode = '22023';
  end if;

  select * into v_existing from activity_substitution_requests
  where original_assignment_id = v_assignment.id and status = 'open';
  if found then
    return jsonb_build_object('request_id', v_existing.id, 'replayed', true);
  end if;

  insert into activity_substitution_requests (church_id, activity_id, original_assignment_id, requested_by, requested_by_self)
  values (v_activity.church_id, v_activity.id, v_assignment.id, auth.uid(), v_self)
  returning id into v_id;

  perform app.write_audit_log(v_activity.church_id, 'assignment.substitution_requested', 'activity_assignments', v_assignment.id,
    jsonb_build_object('activity_id', v_activity.id, 'request_id', v_id, 'by_self', v_self));
  -- EVENTO F5 (DI-02): assignment.substitution_requested a quien gestiona el puesto.

  return jsonb_build_object('request_id', v_id, 'replayed', false);
end;
$$;

-- Quien gestiona el puesto elige candidato: se crea su asignación en pending
-- vinculada a la original. Un solo candidato vigente por solicitud.
create or replace function app.propose_substitution_candidate(
  p_request_id uuid,
  p_person_id uuid,
  p_acknowledge_warnings boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_request activity_substitution_requests%rowtype;
  v_original activity_assignments%rowtype;
  v_activity activities%rowtype;
  v_blocking text[];
  v_warnings text[];
  v_id uuid;
begin
  select * into v_request from activity_substitution_requests where id = p_request_id;
  if not found or not (v_request.church_id = any (app.church_ids_for_user())) then
    raise exception 'La solicitud no existe.' using errcode = 'P0002';
  end if;
  select * into v_activity from activities where id = v_request.activity_id for update;
  select * into v_request from activity_substitution_requests where id = p_request_id for update;
  select * into v_original from activity_assignments where id = v_request.original_assignment_id for update;
  perform app.require_assignment_manage(v_activity, v_original.service_area_id);

  if v_request.status <> 'open' then
    raise exception 'La solicitud ya no está abierta.' using errcode = '22023';
  end if;
  if v_request.candidate_assignment_id is not null and exists (
    select 1 from activity_assignments
    where id = v_request.candidate_assignment_id and status in ('proposed', 'pending', 'accepted')
  ) then
    raise exception 'La solicitud ya tiene un candidato pendiente: retíralo antes de proponer otro.' using errcode = '23505';
  end if;
  if p_person_id = v_original.person_id then
    raise exception 'El candidato debe ser otra persona.' using errcode = '22023';
  end if;
  if v_original.activity_position_id is null or v_original.status not in ('pending', 'accepted') then
    raise exception 'La asignación original ya no es sustituible.' using errcode = '22023';
  end if;

  select e.blocking, e.warnings into v_blocking, v_warnings
  from app.evaluate_assignment_eligibility(v_original.activity_position_id, p_person_id, array[v_original.id]) e;
  perform app.raise_assignment_blocked(v_blocking);
  if cardinality(v_warnings) > 0 and not coalesce(p_acknowledge_warnings, false) then
    raise exception 'El candidato tiene avisos que deben confirmarse.' using errcode = 'PT412', detail = array_to_string(v_warnings, ',');
  end if;

  insert into activity_assignments (
    church_id, activity_id, activity_position_id, person_id, status, position_name, substitutes_assignment_id,
    eligibility_blocking, eligibility_warnings, acknowledged_warnings, created_by, sent_by, sent_at
  ) values (
    v_activity.church_id, v_activity.id, v_original.activity_position_id, p_person_id, 'pending', v_original.position_name,
    v_original.id, v_blocking, v_warnings, case when p_acknowledge_warnings then v_warnings else '{}' end,
    auth.uid(), auth.uid(), now()
  )
  returning id into v_id;

  update activity_substitution_requests set candidate_assignment_id = v_id where id = v_request.id;

  perform app.write_audit_log(v_activity.church_id, 'assignment.substitution_candidate_proposed', 'activity_assignments', v_id,
    jsonb_build_object('activity_id', v_activity.id, 'request_id', v_request.id, 'original_assignment_id', v_original.id));
  -- EVENTO F5 (DI-02): assignment.proposed al candidato.

  return jsonb_build_object('assignment_id', v_id, 'status', 'pending', 'warnings', to_jsonb(v_warnings));
exception
  when unique_violation then
    raise exception 'Esa persona ya tiene una asignación vigente en el puesto o la solicitud ya tiene candidato.' using errcode = '23505';
end;
$$;

create or replace function app.cancel_substitution_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_request activity_substitution_requests%rowtype;
  v_original activity_assignments%rowtype;
  v_activity activities%rowtype;
begin
  select * into v_request from activity_substitution_requests where id = p_request_id;
  if not found or not (v_request.church_id = any (app.church_ids_for_user())) then
    raise exception 'La solicitud no existe.' using errcode = 'P0002';
  end if;
  select * into v_activity from activities where id = v_request.activity_id for update;
  select * into v_request from activity_substitution_requests where id = p_request_id for update;
  select * into v_original from activity_assignments where id = v_request.original_assignment_id;

  if not (v_original.person_id in (select app.current_person_ids()))
     and not app.assignment_manage_cap(v_activity.church_id, v_activity.campus_id, v_activity.id, v_original.service_area_id) then
    raise exception 'No tienes permiso para cancelar esta solicitud.' using errcode = '42501';
  end if;
  if v_request.status <> 'open' then
    return;
  end if;

  update activity_assignments
  set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancel_cause = 'substitution_withdrawn', version = version + 1
  where substitutes_assignment_id = v_original.id and status in ('proposed', 'pending', 'accepted');

  update activity_substitution_requests set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid()
  where id = v_request.id;

  perform app.write_audit_log(v_activity.church_id, 'assignment.substitution_cancelled', 'activity_assignments', v_original.id,
    jsonb_build_object('activity_id', v_activity.id, 'request_id', v_request.id));
end;
$$;

-- ===========================================================================
-- Lecturas
-- ===========================================================================
-- Cobertura (contrato F4 conservado y ampliado): assigned_count = confirmados
-- (accepted), coverage_status calculado con confirmados. Columnas nuevas al
-- final: pending_count (pending), proposed_count (borradores; solo cuentan si
-- el usuario puede verlos por RLS) y expected_count (previstos).
drop function if exists public.activity_position_coverage(uuid);

create function public.activity_position_coverage(p_activity_id uuid)
returns table (
  activity_position_id uuid,
  activity_service_area_id uuid,
  min_people integer,
  max_people integer,
  assigned_count integer,
  coverage_status text,
  pending_count integer,
  proposed_count integer,
  expected_count integer
)
language sql stable security invoker set search_path = pg_catalog, public
as $$
  select ap.id, ap.activity_service_area_id, ap.min_people::integer, ap.max_people::integer,
         coalesce(c.accepted, 0),
         app.position_coverage_status(ap.min_people, ap.max_people, coalesce(c.accepted, 0)),
         coalesce(c.pending, 0), coalesce(c.proposed, 0),
         coalesce(c.accepted, 0) + coalesce(c.pending, 0) + coalesce(c.proposed, 0)
  from activity_positions ap
  left join lateral (
    select count(*) filter (where aa.status = 'accepted')::integer as accepted,
           count(*) filter (where aa.status = 'pending')::integer as pending,
           count(*) filter (where aa.status = 'proposed')::integer as proposed
    from activity_assignments aa
    where aa.activity_position_id = ap.id
  ) c on true
  where ap.activity_id = p_activity_id
  order by ap.sort_order, ap.created_at;
$$;

-- Resumen por actividad para listados y dashboard (máx. 200 ids).
create or replace function public.activity_staffing_summary(p_activity_ids uuid[])
returns table (
  activity_id uuid,
  positions integer,
  positions_requiring_people integer,
  confirmed integer,
  pending integer,
  proposed integer,
  uncovered_positions integer
)
language sql stable security invoker set search_path = pg_catalog, public
as $$
  select a.id,
         count(ap.id)::integer,
         count(ap.id) filter (where ap.min_people > 0)::integer,
         coalesce(sum(c.accepted), 0)::integer,
         coalesce(sum(c.pending), 0)::integer,
         coalesce(sum(c.proposed), 0)::integer,
         count(ap.id) filter (where coalesce(c.accepted, 0) < ap.min_people)::integer
  from activities a
  left join activity_positions ap on ap.activity_id = a.id
  left join lateral (
    select count(*) filter (where aa.status = 'accepted') as accepted,
           count(*) filter (where aa.status = 'pending') as pending,
           count(*) filter (where aa.status = 'proposed') as proposed
    from activity_assignments aa where aa.activity_position_id = ap.id
  ) c on true
  where a.id = any (p_activity_ids[1:200])
  group by a.id;
$$;

-- Revisión de asignaciones vigentes: reevalúa elegibilidad con los datos y la
-- fecha actuales (requisitos cambiados, credencial que caduca antes, nueva
-- hora). Solo para quien gestiona asignaciones de la actividad.
create or replace function public.activity_assignment_review(p_activity_id uuid)
returns table (assignment_id uuid, blocking text[], warnings text[])
language plpgsql stable security definer set search_path = pg_catalog, public
as $$
declare
  v_activity activities%rowtype;
begin
  select * into v_activity from activities where id = p_activity_id;
  if not found or not (v_activity.church_id = any (app.church_ids_for_user())) then
    return;
  end if;
  return query
  select aa.id, e.blocking, e.warnings
  from activity_assignments aa
  cross join lateral app.evaluate_assignment_eligibility(
    aa.activity_position_id, aa.person_id, array_remove(array[aa.id, aa.substitutes_assignment_id], null)
  ) e
  where aa.activity_id = p_activity_id
    and aa.status in ('proposed', 'pending', 'accepted')
    and aa.activity_position_id is not null
    and app.assignment_manage_cap(v_activity.church_id, v_activity.campus_id, v_activity.id, aa.service_area_id);
end;
$$;

-- ===========================================================================
-- Wrappers públicos
-- ===========================================================================
create or replace function public.create_activity_assignment(p_activity_position_id uuid, p_person_id uuid, p_input jsonb default '{}')
returns jsonb language sql security invoker set search_path = pg_catalog, public
as $$ select app.create_activity_assignment(p_activity_position_id, p_person_id, p_input); $$;

create or replace function public.send_activity_assignments(p_activity_id uuid, p_assignment_ids uuid[] default null)
returns integer language sql security invoker set search_path = pg_catalog, public
as $$ select app.send_activity_assignments(p_activity_id, p_assignment_ids); $$;

create or replace function public.cancel_activity_assignment(p_assignment_id uuid, p_expected_version integer default null)
returns jsonb language sql security invoker set search_path = pg_catalog, public
as $$ select app.cancel_activity_assignment(p_assignment_id, p_expected_version); $$;

create or replace function public.respond_activity_assignment(p_assignment_id uuid, p_response text, p_expected_version integer default null, p_note text default null)
returns jsonb language sql security invoker set search_path = pg_catalog, public
as $$ select app.respond_activity_assignment(p_assignment_id, p_response, p_expected_version, p_note); $$;

create or replace function public.record_assignment_response(p_assignment_id uuid, p_response text, p_expected_version integer default null)
returns jsonb language sql security invoker set search_path = pg_catalog, public
as $$ select app.record_assignment_response(p_assignment_id, p_response, p_expected_version); $$;

create or replace function public.request_assignment_substitution(p_assignment_id uuid)
returns jsonb language sql security invoker set search_path = pg_catalog, public
as $$ select app.request_assignment_substitution(p_assignment_id); $$;

create or replace function public.propose_substitution_candidate(p_request_id uuid, p_person_id uuid, p_acknowledge_warnings boolean default false)
returns jsonb language sql security invoker set search_path = pg_catalog, public
as $$ select app.propose_substitution_candidate(p_request_id, p_person_id, p_acknowledge_warnings); $$;

create or replace function public.cancel_substitution_request(p_request_id uuid)
returns void language sql security invoker set search_path = pg_catalog, public
as $$ select app.cancel_substitution_request(p_request_id); $$;

do $grants$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'public.create_activity_assignment(uuid, uuid, jsonb)',
    'public.send_activity_assignments(uuid, uuid[])',
    'public.cancel_activity_assignment(uuid, integer)',
    'public.respond_activity_assignment(uuid, text, integer, text)',
    'public.record_assignment_response(uuid, text, integer)',
    'public.request_assignment_substitution(uuid)',
    'public.propose_substitution_candidate(uuid, uuid, boolean)',
    'public.cancel_substitution_request(uuid)',
    'public.activity_position_coverage(uuid)',
    'public.activity_staffing_summary(uuid[])',
    'public.activity_assignment_review(uuid)',
    'app.create_activity_assignment(uuid, uuid, jsonb)',
    'app.send_activity_assignments(uuid, uuid[])',
    'app.cancel_activity_assignment(uuid, integer)',
    'app.respond_activity_assignment(uuid, text, integer, text)',
    'app.record_assignment_response(uuid, text, integer)',
    'app.request_assignment_substitution(uuid)',
    'app.propose_substitution_candidate(uuid, uuid, boolean)',
    'app.cancel_substitution_request(uuid)'
  ]
  loop
    execute format('revoke all on function %s from public, anon', v_signature);
    execute format('grant execute on function %s to authenticated', v_signature);
  end loop;
end;
$grants$;
