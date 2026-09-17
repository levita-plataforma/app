-- Fase 5 (DI-02) · Emisión de eventos de aviso.
-- Ver docs/FASE-5-AVISOS-DISPONIBILIDAD.md §4.2 y docs/CONTRATO-F4-F5.md §6.
--
-- Se emite con TRIGGERS sobre las tablas de dominio, no reescribiendo las
-- funciones de F5-Carlos (sus migraciones 20260922000100..0500 pueden estar ya
-- aplicadas y no se tocan). Ventajas:
-- * misma transacción que la mutación: un rollback no deja eventos;
-- * cubre por igual las mutaciones por RPC y las cascadas internas
--   (app.activities_assignments_sync cancela o reprograma asignaciones).
--
-- Los puntos de emisión son los marcados "EVENTO F5 (DI-02)" en
-- 20260922000300 y 20260922000500; cada uno se deriva aquí del cambio de
-- estado correspondiente.
--
-- Deduplicación: idempotency_key = <event_type>:<entity_id>:<entity_version>.
-- Un conflicto NO rompe la transacción de dominio (on conflict do nothing).

-- Destinatarios ----------------------------------------------------------------

-- Administración de la iglesia: propietario y administradores vigentes.
create or replace function app.church_admin_person_ids(p_church_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(array_agg(distinct cp.person_id), '{}')
  from church_people cp
  join church_people_roles cpr
    on cpr.church_people_id = cp.id and cpr.church_id = cp.church_id
  where cp.church_id = p_church_id
    and cp.archived_at is null
    and cpr.role_key in ('church_owner', 'church_admin');
$$;

comment on function app.church_admin_person_ids(uuid) is
  'Personas con la administración de la iglesia. Destinatario de reserva cuando un área no tiene líder (regla 2) y del escalado de puestos críticos (regla 3).';

-- Regla 2: quien creó la asignación y los líderes del área del puesto; si el
-- área no tiene líder vigente, la administración de la iglesia.
create or replace function app.position_notification_recipients(
  p_church_id uuid,
  p_service_area_id uuid,
  p_created_by uuid
)
returns uuid[]
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_leaders uuid[];
  v_creator uuid[];
begin
  select coalesce(array_agg(distinct sal.person_id), '{}')
  into v_leaders
  from service_area_leaders sal
  join church_people cp on cp.church_id = sal.church_id and cp.person_id = sal.person_id and cp.archived_at is null
  where sal.church_id = p_church_id
    and sal.service_area_id = p_service_area_id
    and sal.ends_at is null;

  select coalesce(array_agg(distinct cp.person_id), '{}')
  into v_creator
  from people p
  join church_people cp on cp.person_id = p.id and cp.church_id = p_church_id and cp.archived_at is null
  where p_created_by is not null and p.user_id = p_created_by;

  if cardinality(v_leaders) = 0 then
    v_leaders := app.church_admin_person_ids(p_church_id);
  end if;

  return (select coalesce(array_agg(distinct x), '{}') from unnest(v_leaders || v_creator) x);
end;
$$;

comment on function app.position_notification_recipients(uuid, uuid, uuid) is
  'Destinatarios de las respuestas y solicitudes de un puesto (regla 2): creador de la asignación y líderes del área; sin líder de área, la administración de la iglesia.';

-- Escritura en el outbox ---------------------------------------------------------

create or replace function app.emit_notification_event(
  p_church_id uuid,
  p_event_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_entity_version integer,
  p_recipients uuid[],
  p_payload jsonb,
  p_key_suffix text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_recipients uuid[];
  v_id uuid;
begin
  if p_church_id is null or p_entity_id is null then
    return null;
  end if;

  -- Solo personas con pertenencia vigente a esa iglesia (aislamiento de tenant).
  select coalesce(array_agg(distinct cp.person_id), '{}')
  into v_recipients
  from unnest(coalesce(p_recipients, '{}'::uuid[])) r(person_id)
  join church_people cp
    on cp.church_id = p_church_id and cp.person_id = r.person_id and cp.archived_at is null;

  if cardinality(v_recipients) = 0 then
    return null;
  end if;

  insert into notification_events (
    church_id, event_type, entity_type, entity_id, entity_version,
    idempotency_key, recipient_person_ids, payload
  ) values (
    p_church_id, p_event_type, p_entity_type, p_entity_id, p_entity_version,
    p_event_type || ':' || p_entity_id::text || ':' || coalesce(p_entity_version::text, '0')
      || coalesce(':' || p_key_suffix, ''),
    v_recipients, coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (idempotency_key) do nothing
  returning id into v_id;

  return v_id;
end;
$$;

comment on function app.emit_notification_event(uuid, text, text, uuid, integer, uuid[], jsonb, text) is
  'Escribe un evento en el outbox dentro de la transacción en curso. Repetir la misma clave no duplica ni falla (on conflict do nothing).';

-- Payload mínimo -----------------------------------------------------------------

create or replace function app.assignment_notification_payload(p_assignment activity_assignments)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  -- Sin motivos de cancelación (activities.cancellation_reason), sin notas
  -- administrativas y sin la nota privada de respuesta.
  select jsonb_strip_nulls(jsonb_build_object(
    'assignment_id', p_assignment.id,
    'person_id', p_assignment.person_id,
    'activity_id', a.id,
    'activity_title', a.title,
    'activity_position_id', p_assignment.activity_position_id,
    'position_name', p_assignment.position_name,
    'service_area_id', p_assignment.service_area_id,
    'starts_at', a.starts_at,
    'ends_at', a.ends_at,
    'timezone', a.timezone
  ))
  from activities a
  where a.id = p_assignment.activity_id;
$$;

comment on function app.assignment_notification_payload(activity_assignments) is
  'Payload mínimo de un evento de asignación: identificadores, título de la actividad, nombre del puesto, inicio/fin y zona. Nunca datos sensibles.';

-- Trigger de asignaciones ---------------------------------------------------------

create or replace function app.activity_assignments_notify()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_payload jsonb;
  v_recipients uuid[];
  v_communicated boolean;
begin
  -- Alta: solo la que nace comunicada (send directo o candidato de sustitución).
  if tg_op = 'INSERT' then
    if new.status = 'pending' then
      perform app.emit_notification_event(
        new.church_id, 'assignment.proposed', 'activity_assignments', new.id, new.version,
        array[new.person_id], app.assignment_notification_payload(new)
      );
    end if;
    return null;
  end if;

  if new.status = old.status then
    return null;
  end if;

  v_payload := app.assignment_notification_payload(new);

  -- Borrador enviado: proposed -> pending.
  if old.status = 'proposed' and new.status = 'pending' then
    perform app.emit_notification_event(
      new.church_id, 'assignment.proposed', 'activity_assignments', new.id, new.version,
      array[new.person_id], v_payload
    );
    return null;
  end if;

  -- Respuesta: a quien creó la asignación y a los líderes del área (regla 2).
  if new.status in ('accepted', 'declined') then
    v_recipients := app.position_notification_recipients(new.church_id, new.service_area_id, new.created_by);
    perform app.emit_notification_event(
      new.church_id, 'assignment.' || new.status::text, 'activity_assignments', new.id, new.version,
      v_recipients, v_payload || jsonb_build_object('response_source', new.response_source)
    );
    return null;
  end if;

  -- Retirada: a la persona SOLO si ya se le había comunicado el turno.
  if new.status = 'cancelled' then
    v_communicated := old.sent_at is not null or old.response_source is not null;
    if v_communicated then
      perform app.emit_notification_event(
        new.church_id, 'assignment.cancelled', 'activity_assignments', new.id, new.version,
        array[new.person_id],
        -- `cause` es un código cerrado (coordinator, activity_cancelled...),
        -- no el motivo redactado de la cancelación.
        v_payload || jsonb_build_object('cause', new.cancel_cause)
      );
    end if;
    return null;
  end if;

  -- Sustituida: a la persona original.
  if new.status = 'substituted' then
    perform app.emit_notification_event(
      new.church_id, 'assignment.substituted', 'activity_assignments', new.id, new.version,
      array[new.person_id], v_payload
    );
    return null;
  end if;

  return null;
end;
$$;

create trigger activity_assignments_notify
  after insert or update on activity_assignments
  for each row execute function app.activity_assignments_notify();

-- Trigger de solicitudes de sustitución ---------------------------------------------

create or replace function app.activity_substitution_requests_notify()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_original activity_assignments%rowtype;
begin
  if new.status <> 'open' then
    return null;
  end if;

  select * into v_original from activity_assignments where id = new.original_assignment_id;
  if not found then
    return null;
  end if;

  perform app.emit_notification_event(
    new.church_id, 'assignment.substitution_requested', 'activity_substitution_requests', new.id, 1,
    app.position_notification_recipients(new.church_id, v_original.service_area_id, v_original.created_by),
    app.assignment_notification_payload(v_original) || jsonb_build_object(
      'request_id', new.id,
      'requested_by_self', new.requested_by_self
    )
  );
  return null;
end;
$$;

create trigger activity_substitution_requests_notify
  after insert on activity_substitution_requests
  for each row execute function app.activity_substitution_requests_notify();

-- Trigger de reprogramación de la actividad -------------------------------------------
-- Se dispara después de app.activities_assignments_sync (orden alfabético de
-- triggers: "activities_assignments_sync" < "activities_notify_reschedule"), así
-- que las versiones de las asignaciones ya vienen subidas y la clave de
-- deduplicación corresponde al cambio.

create or replace function app.activities_notify_reschedule()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_assignment activity_assignments%rowtype;
begin
  if new.status not in ('draft', 'planned', 'published') then
    return null;
  end if;
  if new.starts_at is not distinct from old.starts_at and new.ends_at is not distinct from old.ends_at then
    return null;
  end if;

  -- Solo a quien ya tenía el turno comunicado: un borrador no se avisa.
  for v_assignment in
    select * from activity_assignments
    where activity_id = new.id
      and status in ('proposed', 'pending', 'accepted')
      and (sent_at is not null or response_source is not null)
  loop
    perform app.emit_notification_event(
      new.church_id, 'activity.rescheduled', 'activity_assignments', v_assignment.id, v_assignment.version,
      array[v_assignment.person_id], app.assignment_notification_payload(v_assignment)
    );
  end loop;

  return null;
end;
$$;

create trigger activities_notify_reschedule
  after update of starts_at, ends_at on activities
  for each row execute function app.activities_notify_reschedule();

-- Permisos ------------------------------------------------------------------------

do $grants$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'app.church_admin_person_ids(uuid)',
    'app.position_notification_recipients(uuid, uuid, uuid)',
    'app.emit_notification_event(uuid, text, text, uuid, integer, uuid[], jsonb, text)',
    'app.assignment_notification_payload(activity_assignments)',
    'app.activity_assignments_notify()',
    'app.activity_substitution_requests_notify()',
    'app.activities_notify_reschedule()'
  ]
  loop
    execute format('revoke all on function %s from public, anon, authenticated', v_signature);
  end loop;
end;
$grants$;
