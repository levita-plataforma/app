-- Fase 8 · Hotfix de seguridad de Kids.
--
-- Cierra los fallos que encontró la revisión adversarial previa a la
-- integración, sobre el código de la rama feature/diogo-fase-8-kids. Va en una
-- migración aparte y no reescribe las nueve originales porque su contenido ya
-- está aplicado en el proyecto de producción, aunque la rama no esté integrada.
--
-- Contexto que conviene no perder: cuando se escribió esto, el módulo estaba
-- desplegado pero sin un solo dato real (cero perfiles, cero check-ins, cero
-- incidencias), así que nada de lo de abajo llegó a exponer a ningún menor.
--
-- Los arreglos, por orden de gravedad:
--   C-1  sacar a un menor sin código, sin autorización y sin auditoría
--   C-2  Kids y la Fase 7 pisándose la lista de tipos de aviso
--   C-3  notas médicas y de emergencia legibles con kids.read
--   A-1  oráculo de pertenencia y de certificado de antecedentes entre iglesias
--   A-2  alta de personal sin la credencial obligatoria, saltándose la aplicación
--   A-3  ocupación de salas de otras iglesias
--   A-4  código de recogida de 32 bits con su hash legible
--   M-1  el ratio de adultos por niño no bloqueaba nada
--   M-2  anon conservaba los privilegios por defecto sobre las diez tablas
--   M-3  dos envoltorios públicos sin revocar a anon
--   B-1  función de trigger sin revocar

-- ===========================================================================
-- C-1 · El check-out solo puede ocurrir dentro de app.kids_checkout
-- ===========================================================================
--
-- La política kid_checkins_update concedía UPDATE directo sobre la tabla a la
-- misma capacidad que tiene quien atiende la puerta (kids.checkout). Toda la
-- validación de la recogida —código, lista de autorizados, motivo del override,
-- auditoría— vive dentro de la RPC, así que bastaba un PATCH a la tabla para
-- marcar a un menor como entregado, sin dejar constancia de a quién.

drop policy if exists kid_checkins_update on kid_checkins;
revoke insert, update, delete on kid_checkins from anon, authenticated;

comment on table kid_checkins is
  'Check-in de un menor en una sesión. NO admite escritura directa: toda alta y toda salida pasan por app.kids_checkin y app.kids_checkout, que son las que validan el código de recogida, comprueban la autorización y escriben la auditoría. Corregir una fila a mano dejaría a un niño como entregado sin rastro de quién se lo llevó.';

-- ===========================================================================
-- C-2 · La lista de tipos de aviso deja de reescribirse entera
-- ===========================================================================
--
-- Kids y la Fase 7 hacían cada una `drop constraint` + `add constraint` con la
-- lista completa escrita a mano, sin conocer los tipos de la otra. La última en
-- aplicarse dejaba rota a la anterior, y en el caso de Kids no era un aviso
-- perdido: el trigger de aviso corre en la misma transacción que el check-in,
-- así que fallaba el check-in entero, justo para los menores que sí tienen
-- familia dada de alta.
--
-- A partir de aquí la constraint se amplía leyendo la que ya hay, de modo que
-- ninguna fase necesita saber qué tipos declararon las demás.

create or replace function app.add_notification_event_types(p_types text[])
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_def text;
  v_actuales text[];
  v_union text[];
  v_lista text;
begin
  select pg_get_constraintdef(c.oid) into v_def
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'notification_events'
    and c.conname = 'notification_events_event_type_check';

  if v_def is null then
    raise exception 'No existe notification_events_event_type_check.' using errcode = 'P0002';
  end if;

  -- Los valores del check son literales entrecomillados; se extraen tal cual.
  select coalesce(array_agg(m[1]), array[]::text[]) into v_actuales
  from regexp_matches(v_def, '''([^'']+)''', 'g') as m;

  select array_agg(distinct t order by t) into v_union
  from unnest(v_actuales || p_types) as t;

  select string_agg(quote_literal(t), ', ' order by t) into v_lista
  from unnest(v_union) as t;

  execute 'alter table notification_events drop constraint notification_events_event_type_check';
  execute format(
    'alter table notification_events add constraint notification_events_event_type_check check (event_type in (%s))',
    v_lista
  );
end;
$$;

revoke all on function app.add_notification_event_types(text[]) from public, anon, authenticated;

comment on function app.add_notification_event_types(text[]) is
  'Amplía la lista de tipos de aviso conservando los que ya hubiera. Cada fase añade los suyos con esto en vez de reescribir la constraint entera, que es como la Fase 7 y la Fase 8 llegaron a dejarse rotas mutuamente según el orden de aplicación.';

-- Se vuelve a declarar la unión de lo que existe hoy, por si esta migración se
-- aplica sobre una base donde la Fase 7 ya pisó los tipos de Kids.
select app.add_notification_event_types(array[
  'kid.checked_in', 'kid.checked_out', 'kid.incident_opened',
  'kid.incident_resolved', 'kid.pickup_override', 'kid.ratio_alert'
]);

-- ===========================================================================
-- C-3 · Las notas médicas y de emergencia salen de kids_profiles
-- ===========================================================================
--
-- El comentario original decía que accessibility_notes y emergency_notes
-- estaban «restringidas por RLS a quien tenga kids.sensitive.read». No era
-- cierto: RLS filtra filas, no columnas, y la política solo pedía kids.read. La
-- capacidad kids.sensitive.read se creaba pero no se comprobaba en ninguna
-- parte del SQL; la única barrera estaba en TypeScript, y el servicio hacía
-- select("*"), así que el dato salía de la base igualmente.
--
-- Se mueven a una tabla propia con su política. En kids_profiles se queda
-- medical_alert_flag, que es el indicador que sí debe ver quien atiende la sala
-- para saber que tiene que consultar.

create table kids_sensitive_notes (
  kid_person_id uuid not null,
  church_id uuid not null references churches (id) on delete cascade,
  accessibility_notes text,
  emergency_notes text,
  updated_at timestamptz not null default now(),
  updated_by uuid references people (id) on delete set null,
  foreign key (church_id, kid_person_id) references church_people (church_id, person_id) on delete cascade
);

comment on table kids_sensitive_notes is
  'Notas de accesibilidad y de emergencia de un menor (alergias, medicación, apoyos). Viven aparte de kids_profiles porque RLS filtra filas y no columnas: con ambas en la misma tabla, cualquiera con kids.read leía la alergia anafiláctica de un niño. Requieren kids.sensitive.read.';

alter table kids_sensitive_notes add constraint kids_sensitive_notes_pkey primary key (kid_person_id, church_id);
create index kids_sensitive_notes_church_idx on kids_sensitive_notes (church_id);

alter table kids_sensitive_notes enable row level security;
alter table kids_sensitive_notes force row level security;

revoke all on table kids_sensitive_notes from public, anon, authenticated;
grant select on table kids_sensitive_notes to authenticated;

create policy kids_sensitive_notes_select on kids_sensitive_notes
  for select to authenticated
  using (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and (select app.has_capability(church_id, 'kids.sensitive.read'))
  );

-- Se traslada lo que hubiera y se retiran las columnas de kids_profiles.
insert into kids_sensitive_notes (kid_person_id, church_id, accessibility_notes, emergency_notes)
select person_id, church_id, accessibility_notes, emergency_notes
from kids_profiles
where accessibility_notes is not null or emergency_notes is not null
on conflict (kid_person_id, church_id) do nothing;

alter table kids_profiles drop column accessibility_notes;
alter table kids_profiles drop column emergency_notes;

comment on column kids_profiles.medical_alert_flag is
  'Indicador visible para quien atiende la sala: hay algo que consultar. El detalle está en kids_sensitive_notes y requiere kids.sensitive.read.';

-- app.kids_save_sensitive_notes(): única vía de escritura.
create or replace function app.kids_save_sensitive_notes(
  p_church_id uuid,
  p_kid_person_id uuid,
  p_accessibility_notes text,
  p_emergency_notes text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform app.assert_church_member(p_church_id);

  if not app.has_capability(p_church_id, 'kids.manage')
     or not app.has_capability(p_church_id, 'kids.sensitive.read') then
    raise exception 'No tienes permiso para editar las notas sensibles de un menor.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from kids_profiles kp
    where kp.church_id = p_church_id and kp.person_id = p_kid_person_id
  ) then
    raise exception 'El menor no tiene ficha en esta iglesia.' using errcode = 'P0002';
  end if;

  insert into kids_sensitive_notes (kid_person_id, church_id, accessibility_notes, emergency_notes, updated_by)
  values (p_kid_person_id, p_church_id,
          nullif(btrim(coalesce(p_accessibility_notes, '')), ''),
          nullif(btrim(coalesce(p_emergency_notes, '')), ''),
          app.current_person_id(p_church_id))
  on conflict (kid_person_id, church_id) do update set
    accessibility_notes = excluded.accessibility_notes,
    emergency_notes = excluded.emergency_notes,
    updated_at = now(),
    updated_by = excluded.updated_by;

  perform app.write_audit_log(p_church_id, 'kids.sensitive_notes_saved', 'kids_sensitive_notes',
    p_kid_person_id, '{}'::jsonb);
end;
$$;

revoke all on function app.kids_save_sensitive_notes(uuid, uuid, text, text) from public, anon;
grant execute on function app.kids_save_sensitive_notes(uuid, uuid, text, text) to authenticated;

create or replace function public.kids_save_sensitive_notes(
  p_church_id uuid, p_kid_person_id uuid, p_accessibility_notes text, p_emergency_notes text
)
returns void language sql security invoker set search_path = pg_catalog, public
as $$ select app.kids_save_sensitive_notes(p_church_id, p_kid_person_id, p_accessibility_notes, p_emergency_notes); $$;

revoke all on function public.kids_save_sensitive_notes(uuid, uuid, text, text) from public, anon;
grant execute on function public.kids_save_sensitive_notes(uuid, uuid, text, text) to authenticated;

-- ===========================================================================
-- A-1 y A-3 · Las funciones de elegibilidad y de ratio dejan de ser oráculos
-- ===========================================================================
--
-- Ambas son security definer, recibían un uuid suelto y no comprobaban nada.
-- Desde otra iglesia se podía averiguar si una persona pertenece a ella y si
-- tiene en regla su certificado de antecedentes, y la ocupación de cualquier
-- sala. Es el mismo fallo que ya se corrigió para app.assert_active_church_person
-- en el hotfix de la Fase 6, repetido.

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
  -- Lo único que cambia respecto de la versión original es esta guardia: lo que
  -- devuelve la función es información de personal —pertenencia y estado de la
  -- credencial obligatoria, que aquí es el certificado de antecedentes—, y
  -- antes respondía a cualquiera, incluso desde otra iglesia.
  if not (p_church_id = any (app.church_ids_for_user()))
     or not (app.has_capability(p_church_id, 'kids.session.manage')
             or app.has_capability(p_church_id, 'kids.manage')
             or app.has_capability(p_church_id, 'kids.checkin')) then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

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
  v_session kids_sessions%rowtype;
  v_room kids_rooms%rowtype;
  v_activity activities%rowtype;
  v_children integer;
  v_staff integer;
  v_max integer;
  v_state kids_ratio_state;
begin
  select ks.* into v_session from kids_sessions ks where ks.id = p_session_id;
  if not found then
    return;
  end if;

  select a.* into v_activity from activities a
  where a.id = v_session.activity_id and a.church_id = v_session.church_id;

  -- La ocupación de una sala es dato de la iglesia que la organiza.
  if not app.kids_cap(v_session.church_id, v_activity.campus_id, v_activity.id, 'kids.read')
     and not app.kids_cap(v_session.church_id, v_activity.campus_id, v_activity.id, 'kids.checkin') then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  select r.* into v_room from kids_rooms r
  where r.id = v_session.room_id and r.church_id = v_session.church_id;

  select count(*)::integer into v_children from kid_checkins
  where session_id = p_session_id and status = 'checked_in';

  select count(*)::integer into v_staff from kids_session_staff
  where session_id = p_session_id and checked_in_at is not null and checked_out_at is null;

  v_max := v_staff * coalesce(v_room.ratio_children_per_adult, 0);

  if v_staff < coalesce(v_room.min_adults, 0) or v_children > v_max then
    v_state := 'blocked';
  elsif v_max > 0 and v_children >= v_max then
    v_state := 'warning';
  else
    v_state := 'safe';
  end if;

  return query select v_state, v_children, v_staff,
    coalesce(v_room.min_adults, 0), coalesce(v_room.ratio_children_per_adult, 0), v_max;
end;
$$;

revoke all on function app.kids_room_ratio_status(uuid) from public, anon;
grant execute on function app.kids_room_ratio_status(uuid) to authenticated;

-- ===========================================================================
-- M-3 · Los dos envoltorios públicos quedaron concedidos a anon
-- ===========================================================================
-- Sus `revoke ... from public` no incluían `anon`, a diferencia de los otros
-- cuatro de la misma migración. Hoy no era explotable porque la función interna
-- sí estaba revocada, pero dejaba el agujero a un `security definer` de
-- distancia.

revoke all on function public.kids_staff_eligibility(uuid, uuid, uuid) from public, anon;
grant execute on function public.kids_staff_eligibility(uuid, uuid, uuid) to authenticated;
revoke all on function public.kids_room_ratio_status(uuid) from public, anon;
grant execute on function public.kids_room_ratio_status(uuid) to authenticated;

-- ===========================================================================
-- A-2 · El alta de personal comprueba la credencial en la base, no solo en la aplicación
-- ===========================================================================
--
-- La comprobación estaba en TypeScript. La política solo pedía
-- kids.session.manage, así que un POST directo a la tabla, con
-- eligible_at_assignment a true, metía en la sala a quien fuera.

drop policy if exists kids_session_staff_manage on kids_session_staff;
revoke insert, update, delete on kids_session_staff from anon, authenticated;

create or replace function app.kids_add_session_staff(
  p_session_id uuid,
  p_person_id uuid,
  p_role text default 'assistant'
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_session kids_sessions%rowtype;
  v_activity activities%rowtype;
  v_eligible boolean;
  v_reasons text[];
  v_id uuid;
begin
  select ks.* into v_session from kids_sessions ks where ks.id = p_session_id;
  if not found or not (v_session.church_id = any (app.church_ids_for_user())) then
    raise exception 'Sesión Kids no encontrada.' using errcode = 'P0002';
  end if;

  select a.* into v_activity from activities a
  where a.id = v_session.activity_id and a.church_id = v_session.church_id;

  if not app.kids_cap(v_session.church_id, v_activity.campus_id, v_activity.id, 'kids.session.manage') then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  -- El snapshot de elegibilidad se calcula aquí; no se acepta del cliente.
  select e.eligible, e.reasons into v_eligible, v_reasons
  from app.kids_staff_eligibility(v_session.church_id, p_person_id, v_activity.campus_id) e;

  if not v_eligible then
    raise exception 'Esa persona no puede estar con menores: %.', array_to_string(v_reasons, ', ')
      using errcode = '22023';
  end if;

  insert into kids_session_staff (church_id, session_id, person_id, role,
                                  eligible_at_assignment, eligibility_reasons)
  values (v_session.church_id, p_session_id, p_person_id, p_role::kids_staff_role, true, v_reasons)
  returning id into v_id;

  perform app.write_audit_log(v_session.church_id, 'kids.staff_added', 'kids_session_staff', v_id,
    jsonb_build_object('session_id', p_session_id, 'person_id', p_person_id, 'role', p_role));

  return v_id;
end;
$$;

revoke all on function app.kids_add_session_staff(uuid, uuid, text) from public, anon;
grant execute on function app.kids_add_session_staff(uuid, uuid, text) to authenticated;

create or replace function public.kids_add_session_staff(p_session_id uuid, p_person_id uuid, p_role text default 'assistant')
returns uuid language sql security invoker set search_path = pg_catalog, public
as $$ select app.kids_add_session_staff(p_session_id, p_person_id, p_role); $$;

revoke all on function public.kids_add_session_staff(uuid, uuid, text) from public, anon;
grant execute on function public.kids_add_session_staff(uuid, uuid, text) to authenticated;

-- Retirar a alguien del turno también pasa por RPC, y queda auditado: antes se
-- borraba la fila sin dejar constancia.
create or replace function app.kids_remove_session_staff(p_staff_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_staff kids_session_staff%rowtype;
  v_session kids_sessions%rowtype;
  v_activity activities%rowtype;
begin
  select s.* into v_staff from kids_session_staff s where s.id = p_staff_id;
  if not found or not (v_staff.church_id = any (app.church_ids_for_user())) then
    raise exception 'Asignación no encontrada.' using errcode = 'P0002';
  end if;

  select ks.* into v_session from kids_sessions ks where ks.id = v_staff.session_id;
  select a.* into v_activity from activities a
  where a.id = v_session.activity_id and a.church_id = v_session.church_id;

  if not app.kids_cap(v_staff.church_id, v_activity.campus_id, v_activity.id, 'kids.session.manage') then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  delete from kids_session_staff where id = p_staff_id;

  perform app.write_audit_log(v_staff.church_id, 'kids.staff_removed', 'kids_session_staff', p_staff_id,
    jsonb_build_object('session_id', v_staff.session_id, 'person_id', v_staff.person_id,
                       'reason', nullif(btrim(coalesce(p_reason, '')), '')));
end;
$$;

revoke all on function app.kids_remove_session_staff(uuid, text) from public, anon;
grant execute on function app.kids_remove_session_staff(uuid, text) to authenticated;

create or replace function public.kids_remove_session_staff(p_staff_id uuid, p_reason text default null)
returns void language sql security invoker set search_path = pg_catalog, public
as $$ select app.kids_remove_session_staff(p_staff_id, p_reason); $$;

revoke all on function public.kids_remove_session_staff(uuid, text) from public, anon;
grant execute on function public.kids_remove_session_staff(uuid, text) to authenticated;

-- ===========================================================================
-- A-4 · El código de recogida
-- ===========================================================================
--
-- Era de 8 caracteres hexadecimales, o sea 32 bits, y su hash —sha256 sin sal,
-- con el id de sesión que ve quien lee la fila— era legible con kids.read. En
-- la revisión se recuperó un código real invirtiendo el hash en 0,37 segundos.
--
-- Se hacen dos cosas: retirar el hash de la superficie legible, que es lo que
-- mata el ataque, y subir la entropía del código. Se mantienen 8 caracteres
-- visibles porque alguien tiene que teclearlos en la puerta, pero pasan a
-- salir de un alfabeto sin ambigüedades y el hash incorpora el identificador
-- del check-in, que no se conoce de antemano.

revoke select on table kid_checkins from authenticated;
grant select (
  id, church_id, session_id, kid_person_id, room_id, status,
  checked_in_at, checked_in_by, checked_out_at, checked_out_by,
  authorized_pickup_id, pickup_person_snapshot, incident_flag, notes,
  created_at, updated_at
) on table kid_checkins to authenticated;

comment on column kid_checkins.pickup_token_hash is
  'Huella del código de recogida. No es legible por authenticated: la comprobación la hace app.kids_checkout, que es security definer. Cuando era legible se pudo recuperar el código original a partir de ella.';

-- ===========================================================================
-- M-1 · El ratio de adultos por niño pasa a bloquear de verdad
-- ===========================================================================
--
-- La interfaz avisaba «RATIO INSUFICIENTE — NO ACEPTES MÁS CHECK-IN», pero
-- nada lo impedía: la RPC solo miraba el aforo de la sala. El estado 'blocked'
-- era decorativo.

create or replace function app.kids_checkin(
  p_session_id uuid,
  p_kid_person_id uuid
)
returns table (checkin_id uuid, pickup_code text, replayed boolean)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_session kids_sessions%rowtype;
  v_room kids_rooms%rowtype;
  v_activity activities%rowtype;
  v_church_id uuid;
  v_existing kid_checkins%rowtype;
  v_children_count integer;
  v_staff_count integer;
  v_code text;
  v_hash text;
  v_checkin_id uuid;
  v_alfabeto text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i integer;
begin
  select ks.* into v_session from kids_sessions ks where ks.id = p_session_id for update;
  if not found then
    raise exception 'Sesión Kids no encontrada.' using errcode = 'P0002';
  end if;
  v_church_id := v_session.church_id;

  select a.* into v_activity from activities a where a.id = v_session.activity_id and a.church_id = v_church_id;
  select r.* into v_room from kids_rooms r where r.id = v_session.room_id and r.church_id = v_church_id;

  if not app.kids_cap(v_church_id, v_activity.campus_id, v_activity.id, 'kids.checkin') then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  if v_session.status not in ('scheduled', 'open') then
    raise exception 'La sesión no admite check-in.' using errcode = '22023';
  end if;

  -- El primer check-in abre la sesión, como hacía la versión original.
  if v_session.status = 'scheduled' then
    update kids_sessions set status = 'open', opened_at = now(), opened_by = auth.uid()
    where id = p_session_id;
  end if;

  if not exists (select 1 from church_people cp where cp.church_id = v_church_id and cp.person_id = p_kid_person_id and cp.archived_at is null) then
    raise exception 'El menor no pertenece a esta iglesia.' using errcode = '22023';
  end if;

  select * into v_existing from kid_checkins
  where session_id = p_session_id and kid_person_id = p_kid_person_id and status = 'checked_in';
  if found then
    return query select v_existing.id, null::text, true;
    return;
  end if;

  select count(*)::integer into v_children_count from kid_checkins
  where session_id = p_session_id and status = 'checked_in';

  if v_room.capacity is not null and v_children_count >= v_room.capacity then
    raise exception 'La sala «%» ha alcanzado su aforo.', v_room.name using errcode = '22023';
  end if;

  -- El ratio, que antes no se comprobaba. La sesión ya está bloqueada más
  -- arriba con FOR UPDATE, así que el recuento de personal es estable.
  select count(*)::integer into v_staff_count from kids_session_staff
  where session_id = p_session_id and checked_in_at is not null and checked_out_at is null;

  if v_staff_count < coalesce(v_room.min_adults, 0) then
    raise exception 'La sala «%» necesita al menos % adulto(s) y hay %.',
      v_room.name, v_room.min_adults, v_staff_count using errcode = '22023';
  end if;

  if coalesce(v_room.ratio_children_per_adult, 0) > 0
     and v_children_count + 1 > v_staff_count * v_room.ratio_children_per_adult then
    raise exception 'No se puede admitir a otro menor en «%»: el ratio es % por adulto y hay % adulto(s).',
      v_room.name, v_room.ratio_children_per_adult, v_staff_count using errcode = '22023';
  end if;

  v_checkin_id := gen_random_uuid();

  -- Ocho caracteres de un alfabeto de 32 sin ambigüedades (sin I, O, 0, 1):
  -- 40 bits, y la huella lleva dentro el identificador del check-in, que no se
  -- conoce hasta que existe.
  v_code := '';
  for i in 1..8 loop
    v_code := v_code || substr(v_alfabeto, 1 + floor(random() * length(v_alfabeto))::integer, 1);
  end loop;

  v_hash := encode(digest(v_code || ':' || p_session_id::text || ':' || v_checkin_id::text, 'sha256'), 'hex');

  insert into kid_checkins (id, church_id, session_id, kid_person_id, room_id, checked_in_by, pickup_token_hash)
  values (v_checkin_id, v_church_id, p_session_id, p_kid_person_id, v_room.id, auth.uid(), v_hash);

  perform app.write_audit_log(v_church_id, 'kids.checkin', 'kid_checkins', v_checkin_id,
    jsonb_build_object('session_id', p_session_id, 'room_id', v_room.id));

  return query select v_checkin_id, v_code, false;
end;
$$;

revoke all on function app.kids_checkin(uuid, uuid) from public, anon;
grant execute on function app.kids_checkin(uuid, uuid) to authenticated;

-- El checkout tiene que buscar con la huella nueva, que incluye el id de la
-- fila: se compara contra cada check-in vivo de la sesión.
create or replace function app.kids_find_checkin_by_code(p_session_id uuid, p_pickup_code text)
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
  select kc.id
  from kid_checkins kc
  where kc.session_id = p_session_id
    and kc.status = 'checked_in'
    and kc.pickup_token_hash = encode(
      digest(upper(btrim(p_pickup_code)) || ':' || p_session_id::text || ':' || kc.id::text, 'sha256'),
      'hex')
  limit 1;
$$;

revoke all on function app.kids_find_checkin_by_code(uuid, text) from public, anon, authenticated;

comment on function app.kids_find_checkin_by_code(uuid, text) is
  'Localiza el check-in vivo cuyo código de recogida coincide. Interna: no se concede a authenticated para que nadie pueda usarla como oráculo de códigos.';

-- ===========================================================================
-- M-2 · anon pierde los privilegios por defecto sobre las tablas de Kids
-- ===========================================================================
--
-- Ninguna migración de la fase revocaba nada, así que anon conservaba los
-- privilegios que PostgreSQL concede por defecto sobre toda tabla nueva en
-- public. Solo lo frenaba la RLS: una capa en vez de dos. Es literalmente el
-- hallazgo F-05 del hotfix de la Fase 6, repetido.

do $privs$
declare
  v_table text;
begin
  foreach v_table in array array[
    'kids_profiles', 'kid_guardians', 'kid_pickup_authorizations',
    'kids_rooms', 'kids_sessions', 'kids_session_staff',
    'kid_checkins', 'kids_incidents', 'kid_pickup_overrides',
    'kids_required_credentials', 'kids_sensitive_notes'
  ]
  loop
    execute format('revoke all on table public.%I from anon', v_table);
  end loop;
end;
$privs$;

-- ===========================================================================
-- M-7 · Las incidencias no se borran
-- ===========================================================================
-- La política era `for all`, así que incluía DELETE, y no había auditoría: una
-- incidencia sobre un menor podía desaparecer sin rastro.

revoke delete on kids_incidents from authenticated;

comment on table kids_incidents is
  'Incidencias ocurridas en una sesión de Kids. No se borran: el historial de lo que le pasó a un menor no puede depender de que a alguien le incomode. Se cierran cambiando su estado.';

-- ===========================================================================
-- B-1 · La función de trigger de avisos, revocada
-- ===========================================================================
-- No se puede invocar suelta por ser `returns trigger`, pero anon tiene usage
-- sobre el esquema app desde la Fase 6 y la ACL por defecto la dejaba a
-- disposición de PUBLIC.

revoke all on function app.emit_kid_checkin_notification() from public, anon, authenticated;

-- El checkout busca con la huella nueva. De paso se corrige un caso límite:
-- si se pasaba una autorización revocada y se salvaba el checkout por override,
-- al final se intentaba marcarla como usada y eso viola su propio check
-- ((status='revoked') = (revoked_at is not null)), abortando la recogida.
create or replace function app.kids_checkout(
  p_pickup_code text,
  p_session_id uuid,
  p_pickup_person_name text,
  p_authorized_pickup_id uuid default null,
  p_override_reason text default null
)
returns table (checkin_id uuid, status kid_checkin_status, authorized boolean)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_checkin kid_checkins%rowtype;
  v_session kids_sessions%rowtype;
  v_activity activities%rowtype;
  v_church_id uuid;
  v_checkin_id uuid;
  v_auth kid_pickup_authorizations%rowtype;
  v_authorized boolean := false;
  v_por_autorizacion boolean := false;
begin
  select ks.* into v_session from kids_sessions ks where ks.id = p_session_id for update;
  if not found then
    raise exception 'Sesión Kids no encontrada.' using errcode = 'P0002';
  end if;
  v_church_id := v_session.church_id;

  select a.* into v_activity from activities a where a.id = v_session.activity_id and a.church_id = v_church_id;

  if not app.kids_cap(v_church_id, v_activity.campus_id, v_activity.id, 'kids.checkout') then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  v_checkin_id := app.kids_find_checkin_by_code(p_session_id, p_pickup_code);
  if v_checkin_id is null then
    raise exception 'Código no válido o ya utilizado.' using errcode = 'P0002';
  end if;

  select * into v_checkin from kid_checkins where id = v_checkin_id for update;
  if not found or v_checkin.status <> 'checked_in' then
    raise exception 'Código no válido o ya utilizado.' using errcode = 'P0002';
  end if;

  if p_authorized_pickup_id is not null then
    select * into v_auth from kid_pickup_authorizations
    where id = p_authorized_pickup_id and church_id = v_church_id and kid_person_id = v_checkin.kid_person_id
    for update;

    if found
       and v_auth.status = 'active'
       and (v_auth.valid_until is null or v_auth.valid_until > now())
       and v_auth.valid_from <= now()
    then
      v_authorized := true;
      v_por_autorizacion := true;
    end if;
  end if;

  if not v_authorized and p_override_reason is not null then
    if not app.kids_cap(v_church_id, v_activity.campus_id, v_activity.id, 'kids.pickup.override') then
      raise exception 'No autorizado para anular la validación de recogida.' using errcode = '42501';
    end if;
    if btrim(coalesce(p_pickup_person_name, '')) = '' then
      raise exception 'Para anular la validación hay que registrar a quién se entrega el menor.'
        using errcode = '22023';
    end if;
    v_authorized := true;

    insert into kid_pickup_overrides (church_id, checkin_id, operator_person_id, pickup_person_name, reason)
    values (v_church_id, v_checkin.id, app.current_person_id(v_church_id), p_pickup_person_name, p_override_reason);

    perform app.write_audit_log(v_church_id, 'kids.pickup_override', 'kid_checkins', v_checkin.id,
      jsonb_build_object('session_id', p_session_id, 'reason_recorded', true));
  end if;

  if not v_authorized then
    perform app.write_audit_log(v_church_id, 'kids.pickup_denied', 'kid_checkins', v_checkin.id,
      jsonb_build_object('session_id', p_session_id));
    return query select v_checkin.id, v_checkin.status, false;
    return;
  end if;

  update kid_checkins
  set status = 'checked_out',
      checked_out_at = now(),
      checked_out_by = auth.uid(),
      authorized_pickup_id = case when v_por_autorizacion then p_authorized_pickup_id end,
      pickup_person_snapshot = p_pickup_person_name
  where id = v_checkin.id;

  -- Solo se consume la autorización si fue ella la que autorizó la recogida.
  if v_por_autorizacion and v_auth.id is not null and v_auth.one_time then
    update kid_pickup_authorizations
    set status = 'used', used_at = now(), used_checkin_id = v_checkin.id
    where id = v_auth.id;
  end if;

  perform app.write_audit_log(v_church_id, 'kids.checkout', 'kid_checkins', v_checkin.id,
    jsonb_build_object('session_id', p_session_id,
                       'authorized_pickup_id', case when v_por_autorizacion then p_authorized_pickup_id end,
                       'override', not v_por_autorizacion));

  return query select v_checkin.id, 'checked_out'::kid_checkin_status, true;
end;
$$;

revoke all on function app.kids_checkout(text, uuid, text, uuid, text) from public, anon;
grant execute on function app.kids_checkout(text, uuid, text, uuid, text) to authenticated;

-- ===========================================================================
-- Entrada y salida del personal de sala
-- ===========================================================================
--
-- Al cerrar la escritura directa de kids_session_staff (A-2) se cerró también
-- la vía por la que el personal marcaba su entrada y su salida. Sin eso, el
-- recuento de adultos presentes se queda a cero y, con el ratio ya en vigor,
-- no entraría ningún menor en ninguna sala con min_adults > 0: el arreglo de
-- A-2 y el de M-1 se anulaban el uno al otro.

create or replace function app.kids_staff_check_in(p_staff_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_staff kids_session_staff%rowtype;
  v_session kids_sessions%rowtype;
  v_activity activities%rowtype;
  v_eligible boolean;
  v_reasons text[];
begin
  select s.* into v_staff from kids_session_staff s where s.id = p_staff_id;
  if not found or not (v_staff.church_id = any (app.church_ids_for_user())) then
    raise exception 'Asignación no encontrada.' using errcode = 'P0002';
  end if;

  select ks.* into v_session from kids_sessions ks where ks.id = v_staff.session_id;
  select a.* into v_activity from activities a
  where a.id = v_session.activity_id and a.church_id = v_session.church_id;

  if not app.kids_cap(v_staff.church_id, v_activity.campus_id, v_activity.id, 'kids.session.manage')
     and not app.kids_cap(v_staff.church_id, v_activity.campus_id, v_activity.id, 'kids.checkin') then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  -- La credencial se vuelve a comprobar al entrar, no solo al asignar: entre
  -- una cosa y otra puede haber caducado.
  select e.eligible, e.reasons into v_eligible, v_reasons
  from app.kids_staff_eligibility(v_staff.church_id, v_staff.person_id, v_activity.campus_id) e;

  if not v_eligible then
    raise exception 'Esa persona no puede estar con menores: %.', array_to_string(v_reasons, ', ')
      using errcode = '22023';
  end if;

  update kids_session_staff
  set checked_in_at = now(), checked_in_by = auth.uid(), checked_out_at = null
  where id = p_staff_id;

  perform app.write_audit_log(v_staff.church_id, 'kids.staff_checked_in', 'kids_session_staff',
    p_staff_id, jsonb_build_object('session_id', v_staff.session_id, 'person_id', v_staff.person_id));
end;
$$;

revoke all on function app.kids_staff_check_in(uuid) from public, anon;
grant execute on function app.kids_staff_check_in(uuid) to authenticated;

create or replace function app.kids_staff_check_out(p_staff_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_staff kids_session_staff%rowtype;
  v_session kids_sessions%rowtype;
  v_activity activities%rowtype;
  v_ninos integer;
  v_adultos integer;
  v_room kids_rooms%rowtype;
begin
  select s.* into v_staff from kids_session_staff s where s.id = p_staff_id;
  if not found or not (v_staff.church_id = any (app.church_ids_for_user())) then
    raise exception 'Asignación no encontrada.' using errcode = 'P0002';
  end if;

  select ks.* into v_session from kids_sessions ks where ks.id = v_staff.session_id for update;
  select a.* into v_activity from activities a
  where a.id = v_session.activity_id and a.church_id = v_session.church_id;

  if not app.kids_cap(v_staff.church_id, v_activity.campus_id, v_activity.id, 'kids.session.manage')
     and not app.kids_cap(v_staff.church_id, v_activity.campus_id, v_activity.id, 'kids.checkin') then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  select count(*)::integer into v_ninos from kid_checkins
  where session_id = v_staff.session_id and status = 'checked_in';

  select count(*)::integer into v_adultos from kids_session_staff
  where session_id = v_staff.session_id and checked_in_at is not null and checked_out_at is null;

  select r.* into v_room from kids_rooms r
  where r.id = v_session.room_id and r.church_id = v_session.church_id;

  -- No se puede dejar la sala por debajo del mínimo con menores dentro: es la
  -- otra mitad de la regla del ratio, y sin esto se podía vaciar de adultos una
  -- sala llena de niños.
  if v_ninos > 0 and v_adultos - 1 < coalesce(v_room.min_adults, 0) then
    raise exception 'No puedes salir de «%»: quedan % menor(es) y la sala necesita al menos % adulto(s).',
      v_room.name, v_ninos, v_room.min_adults using errcode = '22023';
  end if;

  update kids_session_staff set checked_out_at = now() where id = p_staff_id;

  perform app.write_audit_log(v_staff.church_id, 'kids.staff_checked_out', 'kids_session_staff',
    p_staff_id, jsonb_build_object('session_id', v_staff.session_id, 'person_id', v_staff.person_id));
end;
$$;

revoke all on function app.kids_staff_check_out(uuid) from public, anon;
grant execute on function app.kids_staff_check_out(uuid) to authenticated;

create or replace function public.kids_staff_check_in(p_staff_id uuid)
returns void language sql security invoker set search_path = pg_catalog, public
as $$ select app.kids_staff_check_in(p_staff_id); $$;

create or replace function public.kids_staff_check_out(p_staff_id uuid)
returns void language sql security invoker set search_path = pg_catalog, public
as $$ select app.kids_staff_check_out(p_staff_id); $$;

revoke all on function public.kids_staff_check_in(uuid) from public, anon;
grant execute on function public.kids_staff_check_in(uuid) to authenticated;
revoke all on function public.kids_staff_check_out(uuid) from public, anon;
grant execute on function public.kids_staff_check_out(uuid) to authenticated;

-- ===========================================================================
-- Buscar el check-in por su código, sin revelar nada de más
-- ===========================================================================
--
-- La huella dejó de ser legible, así que la pantalla de recogida ya no puede ir
-- del código al menor por su cuenta. Esta función lo hace dentro, devolviendo
-- solo lo imprescindible para atender la puerta: quién es el menor y en qué
-- sala está. Exige kids.checkout, así que no sirve como oráculo de códigos.

create or replace function app.kids_lookup_pickup(p_session_id uuid, p_pickup_code text)
returns table (checkin_id uuid, kid_person_id uuid, kid_name text, room_name text, medical_alert boolean)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_session kids_sessions%rowtype;
  v_activity activities%rowtype;
  v_id uuid;
begin
  select ks.* into v_session from kids_sessions ks where ks.id = p_session_id;
  if not found then
    raise exception 'Sesión Kids no encontrada.' using errcode = 'P0002';
  end if;

  select a.* into v_activity from activities a
  where a.id = v_session.activity_id and a.church_id = v_session.church_id;

  if not app.kids_cap(v_session.church_id, v_activity.campus_id, v_activity.id, 'kids.checkout') then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  v_id := app.kids_find_checkin_by_code(p_session_id, p_pickup_code);
  if v_id is null then
    raise exception 'Código no válido o ya utilizado.' using errcode = 'P0002';
  end if;

  return query
  select kc.id, kc.kid_person_id,
         coalesce(nullif(p.preferred_name, ''), p.first_name) || coalesce(' ' || p.last_name, ''),
         r.name,
         coalesce(kp.medical_alert_flag, false)
  from kid_checkins kc
  join people p on p.id = kc.kid_person_id
  left join kids_rooms r on r.id = kc.room_id
  left join kids_profiles kp on kp.person_id = kc.kid_person_id and kp.church_id = kc.church_id
  where kc.id = v_id;
end;
$$;

revoke all on function app.kids_lookup_pickup(uuid, text) from public, anon;
grant execute on function app.kids_lookup_pickup(uuid, text) to authenticated;

create or replace function public.kids_lookup_pickup(p_session_id uuid, p_pickup_code text)
returns table (checkin_id uuid, kid_person_id uuid, kid_name text, room_name text, medical_alert boolean)
language sql stable security invoker set search_path = pg_catalog, public
as $$ select * from app.kids_lookup_pickup(p_session_id, p_pickup_code); $$;

revoke all on function public.kids_lookup_pickup(uuid, text) from public, anon;
grant execute on function public.kids_lookup_pickup(uuid, text) to authenticated;

-- ===========================================================================
-- Las pantallas de puerta necesitan ver su sesión
-- ===========================================================================
-- kids_sessions_select exigía kids.read o kids.session.manage, así que quien
-- solo tiene kids.checkin o kids.checkout no podía abrir la pantalla en la que
-- trabaja: la página daba 404. Es anterior a este hotfix, pero lo arrastraba.

drop policy if exists kids_sessions_select on kids_sessions;

create policy kids_sessions_select on kids_sessions
  for select to authenticated
  using (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and exists (
      select 1 from activities a
      where a.id = activity_id and a.church_id = kids_sessions.church_id
        and (
          app.kids_cap(kids_sessions.church_id, a.campus_id, a.id, 'kids.read')
          or app.kids_cap(kids_sessions.church_id, a.campus_id, a.id, 'kids.session.manage')
          or app.kids_cap(kids_sessions.church_id, a.campus_id, a.id, 'kids.checkin')
          or app.kids_cap(kids_sessions.church_id, a.campus_id, a.id, 'kids.checkout')
        )
    )
  );
