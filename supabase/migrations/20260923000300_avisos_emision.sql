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

-- ¿Esta PERSONA puede gestionar las asignaciones de este puesto? Es la versión
-- por persona de app.assignment_manage_cap, que resuelve sobre auth.uid() y por
-- tanto no sirve para decidir a quién se avisa. Misma regla de ámbitos:
-- assignment.manage con scope church, el campus de la actividad, la actividad
-- concreta o el área de servicio del puesto.
create or replace function app.person_assignment_manage_cap(
  p_church_id uuid,
  p_person_id uuid,
  p_campus_id uuid,
  p_activity_id uuid,
  p_service_area_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from church_people_roles cpr
    join church_people cp
      on cp.id = cpr.church_people_id and cp.church_id = cpr.church_id
    join role_capabilities rc
      on rc.role_key = cpr.role_key
    where cpr.church_id = p_church_id
      and cp.person_id = p_person_id
      and cp.archived_at is null
      and rc.capability_key = 'assignment.manage'
      and (
        cpr.scope_type = 'church'
        or (cpr.scope_type = 'campus' and p_campus_id is not null and cpr.scope_id = p_campus_id)
        or (cpr.scope_type = 'activity' and p_activity_id is not null and cpr.scope_id = p_activity_id)
        or (cpr.scope_type = 'service_area' and p_service_area_id is not null and cpr.scope_id = p_service_area_id)
      )
  );
$$;

comment on function app.person_assignment_manage_cap(uuid, uuid, uuid, uuid, uuid) is
  'true si esa persona tiene assignment.manage en un ámbito que cubre el puesto (iglesia, campus de la actividad, la actividad o el área). Versión por persona de app.assignment_manage_cap, que resuelve sobre auth.uid().';

-- Administración de la iglesia: propietario y administradores vigentes, en el
-- ámbito que les corresponde. Un church_admin con scope de campus NO es la
-- administración de toda la iglesia: solo entra si el campus coincide con el de
-- la actividad (y una actividad sin sede solo la ve la administración de
-- ámbito iglesia).
create or replace function app.church_admin_person_ids(p_church_id uuid, p_campus_id uuid default null)
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
    and cpr.role_key in ('church_owner', 'church_admin')
    and (
      cpr.scope_type = 'church'
      or (cpr.scope_type = 'campus' and p_campus_id is not null and cpr.scope_id = p_campus_id)
    );
$$;

comment on function app.church_admin_person_ids(uuid, uuid) is
  'Personas con la administración de la iglesia en el ámbito indicado: scope de iglesia siempre, y scope de campus solo si coincide con el de la actividad. Destinatario de reserva cuando un área no tiene líder (regla 2) y del escalado de puestos críticos (regla 3).';

-- Regla 2: quien creó la asignación y los líderes del área del puesto; si no
-- queda ninguno, la administración de la iglesia.
--
-- Pertenecer a service_area_leaders NO es la fuente de autorización: un aviso
-- de respuesta revela el nombre de una persona, el puesto y que rechazó el
-- turno, así que cada destinatario tiene que poder gestionar ese puesto de
-- verdad (app.person_assignment_manage_cap con la iglesia, el campus de la
-- actividad, la actividad y el área). Además se respeta
-- service_area_leaders.campus_id: el líder de una sede no recibe los avisos de
-- otra.
create or replace function app.position_notification_recipients(
  p_church_id uuid,
  p_campus_id uuid,
  p_activity_id uuid,
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
    and sal.ends_at is null
    -- Líder sin sede: de toda el área. Con sede: solo la suya.
    and (sal.campus_id is null or sal.campus_id = p_campus_id)
    and app.person_assignment_manage_cap(
      p_church_id, sal.person_id, p_campus_id, p_activity_id, p_service_area_id);

  select coalesce(array_agg(distinct cp.person_id), '{}')
  into v_creator
  from people p
  join church_people cp on cp.person_id = p.id and cp.church_id = p_church_id and cp.archived_at is null
  where p_created_by is not null
    and p.user_id = p_created_by
    -- Quien creó la asignación tampoco recibe el aviso si ya no puede gestionar
    -- el puesto (rol revocado o reducido de ámbito).
    and app.person_assignment_manage_cap(
      p_church_id, cp.person_id, p_campus_id, p_activity_id, p_service_area_id);

  if cardinality(v_leaders) = 0 then
    v_leaders := app.church_admin_person_ids(p_church_id, p_campus_id);
  end if;

  return (select coalesce(array_agg(distinct x), '{}') from unnest(v_leaders || v_creator) x);
end;
$$;

comment on function app.position_notification_recipients(uuid, uuid, uuid, uuid, uuid) is
  'Destinatarios de las respuestas y solicitudes de un puesto (regla 2): creador de la asignación y líderes del área, siempre que puedan gestionar ese puesto de verdad y en la sede de la actividad; si no queda ninguno, la administración de la iglesia de ese ámbito.';

-- Escritura en el outbox ---------------------------------------------------------

create or replace function app.emit_notification_event(
  p_church_id uuid,
  p_event_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_entity_version integer,
  p_recipients uuid[],
  p_payload jsonb,
  p_key_suffix text default null,
  -- Sustituye a la versión dentro de la clave de deduplicación sin falsear la
  -- columna entity_version. Lo usan los avisos cuya repetición NO depende de la
  -- versión de la entidad (los recordatorios: ver app.enqueue_due_reminders).
  p_key_version text default null
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
    p_event_type || ':' || p_entity_id::text || ':'
      || coalesce(p_key_version, p_entity_version::text, '0')
      || coalesce(':' || p_key_suffix, ''),
    v_recipients, coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (idempotency_key) do nothing
  returning id into v_id;

  return v_id;
end;
$$;

comment on function app.emit_notification_event(uuid, text, text, uuid, integer, uuid[], jsonb, text, text) is
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
  v_campus_id uuid;
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
    select a.campus_id into v_campus_id from activities a where a.id = new.activity_id;
    v_recipients := app.position_notification_recipients(
      new.church_id, v_campus_id, new.activity_id, new.service_area_id, new.created_by);
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
  v_campus_id uuid;
  v_payload jsonb;
begin
  -- Solo dos hechos: la solicitud se abre, o se cancela.
  if not (
    (tg_op = 'INSERT' and new.status = 'open')
    or (tg_op = 'UPDATE' and new.status = 'cancelled' and old.status is distinct from 'cancelled')
  ) then
    return null;
  end if;

  select * into v_original from activity_assignments where id = new.original_assignment_id;
  if not found then
    return null;
  end if;

  select a.campus_id into v_campus_id from activities a where a.id = new.activity_id;

  v_payload := app.assignment_notification_payload(v_original) || jsonb_build_object(
    'request_id', new.id,
    'requested_by_self', new.requested_by_self
  );

  if tg_op = 'INSERT' then
    perform app.emit_notification_event(
      new.church_id, 'assignment.substitution_requested', 'activity_substitution_requests', new.id, 1,
      app.position_notification_recipients(
        new.church_id, v_campus_id, new.activity_id, v_original.service_area_id, v_original.created_by),
      v_payload
    );
    return null;
  end if;

  -- Cancelada (contrato §6.1): se entera quien la pidió. Si la pidió la propia
  -- persona, ella; si la abrió coordinación, quien gestiona el puesto.
  perform app.emit_notification_event(
    new.church_id, 'assignment.substitution_cancelled', 'activity_substitution_requests', new.id, 2,
    case when new.requested_by_self then array[v_original.person_id]
      else app.position_notification_recipients(
        new.church_id, v_campus_id, new.activity_id, v_original.service_area_id, v_original.created_by)
    end,
    v_payload
  );
  return null;
end;
$$;

create trigger activity_substitution_requests_notify
  after insert or update on activity_substitution_requests
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
    'app.person_assignment_manage_cap(uuid, uuid, uuid, uuid, uuid)',
    'app.church_admin_person_ids(uuid, uuid)',
    'app.position_notification_recipients(uuid, uuid, uuid, uuid, uuid)',
    'app.emit_notification_event(uuid, text, text, uuid, integer, uuid[], jsonb, text, text)',
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
