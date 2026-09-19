-- Fase 9 (Diogo) · Iteración: OR en segmentación, capabilities update/cancel
-- separadas, límite de creación centralizado, update_communication.
--
-- OR: el JSON de reglas admite ahora {"any": [...]} como alternativa a
-- {"all": [...]} al nivel superior (uno u otro, nunca mixto, nunca
-- anidado — mantiene la promesa de "estructurado y auditable, nunca SQL
-- libre" del prompt original). Se reescriben validate_segment_rules y
-- resolve_segment_recipients para aceptar ambos; el resto del contrato
-- (allowlist positiva, "group" reservado y rechazado) no cambia.

create or replace function app.validate_segment_rules(p_rules jsonb)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_mode text;
  v_rule jsonb;
  v_field text;
  v_op text;
begin
  if p_rules is null or jsonb_typeof(p_rules) <> 'object' then
    raise exception 'Las reglas del segmento deben ser un objeto {"all": [...]} o {"any": [...]}.' using errcode = '22023';
  end if;

  if (p_rules ? 'all') and (p_rules ? 'any') then
    raise exception 'Las reglas admiten "all" o "any", nunca ambos a la vez.' using errcode = '22023';
  elsif p_rules ? 'all' then
    v_mode := 'all';
  elsif p_rules ? 'any' then
    v_mode := 'any';
  else
    raise exception 'Las reglas del segmento deben tener la forma {"all": [...]} o {"any": [...]}.' using errcode = '22023';
  end if;

  if jsonb_typeof(p_rules -> v_mode) <> 'array' then
    raise exception 'El campo "%" debe ser una lista de condiciones.', v_mode using errcode = '22023';
  end if;

  if jsonb_array_length(p_rules -> v_mode) = 0 then
    raise exception 'El segmento necesita al menos una condición.' using errcode = '22023';
  end if;

  for v_rule in select * from jsonb_array_elements(p_rules -> v_mode)
  loop
    if jsonb_typeof(v_rule) <> 'object' or not (v_rule ? 'field') or not (v_rule ? 'op') or not (v_rule ? 'value') then
      raise exception 'Cada condición necesita field, op y value.' using errcode = '22023';
    end if;

    v_field := v_rule ->> 'field';
    v_op := v_rule ->> 'op';

    -- Allowlist positiva: cualquier campo no listado se rechaza. Esto ya
    -- cubre, sin enumerarlo, cualquier dato pastoral, de giving, de salud o
    -- de menores/Kids (prompt Fase 9 §31-34).
    if v_field not in ('campus_id', 'tags', 'relationship', 'service_area_id', 'channel_available', 'group') then
      raise exception 'Campo de segmentación no permitido: %', v_field using errcode = '42501';
    end if;

    if v_field = 'group' then
      -- Reservado: existe en el schema para no romper el JSON, pero no hay
      -- Fase 7 (grupos) todavía. Rechazo explícito, nunca fingido.
      raise exception 'Segmentación por grupo no disponible todavía.' using errcode = '0A000';
    end if;

    case v_field
      when 'campus_id' then
        if v_op not in ('eq', 'in') then
          raise exception 'Operador no permitido para campus_id: %', v_op using errcode = '22023';
        end if;
      when 'tags' then
        if v_op not in ('contains', 'contains_any') then
          raise exception 'Operador no permitido para tags: %', v_op using errcode = '22023';
        end if;
      when 'relationship' then
        if v_op not in ('eq', 'in') then
          raise exception 'Operador no permitido para relationship: %', v_op using errcode = '22023';
        end if;
      when 'service_area_id' then
        if v_op not in ('eq', 'in') then
          raise exception 'Operador no permitido para service_area_id: %', v_op using errcode = '22023';
        end if;
      when 'channel_available' then
        if v_op <> 'eq' then
          raise exception 'Operador no permitido para channel_available: %', v_op using errcode = '22023';
        end if;
        if v_rule ->> 'value' not in ('email', 'push', 'inapp') then
          raise exception 'Canal no válido en channel_available: %', v_rule ->> 'value' using errcode = '22023';
        end if;
    end case;
  end loop;
end;
$$;

-- app.resolve_segment_recipients: cada condición se resuelve de forma
-- independiente (v_matches, universo completo de church_people activos que
-- cumplen ESA condición), y luego se combina con v_candidates: AND =
-- intersección progresiva (arranca con todo el universo), OR = unión
-- progresiva (arranca vacío). Mismo intérprete case-por-campo que antes,
-- solo cambia el punto de partida y el operador de combinación.
create or replace function app.resolve_segment_recipients(p_church_id uuid, p_rules jsonb)
returns table (person_id uuid)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_mode text;
  v_rule jsonb;
  v_field text;
  v_op text;
  v_universe uuid[];
  v_candidates uuid[];
  v_matches uuid[];
begin
  perform app.validate_segment_rules(p_rules);

  v_mode := case when p_rules ? 'all' then 'all' else 'any' end;

  select coalesce(array_agg(cp.person_id), '{}') into v_universe
  from church_people cp
  where cp.church_id = p_church_id and cp.archived_at is null;

  v_candidates := case when v_mode = 'all' then v_universe else '{}'::uuid[] end;

  for v_rule in select * from jsonb_array_elements(p_rules -> v_mode)
  loop
    v_field := v_rule ->> 'field';
    v_op := v_rule ->> 'op';

    if v_field = 'campus_id' then
      select coalesce(array_agg(distinct cp.person_id), '{}') into v_matches
      from church_people cp
      where cp.church_id = p_church_id and cp.person_id = any (v_universe)
        and (
          (v_op = 'eq' and cp.primary_campus_id = (v_rule ->> 'value')::uuid)
          or (v_op = 'in' and cp.primary_campus_id = any (
            select jsonb_array_elements_text(v_rule -> 'value')::uuid
          ))
        );

    elsif v_field = 'tags' then
      select coalesce(array_agg(distinct pt.person_id), '{}') into v_matches
      from person_tags pt
      where pt.church_id = p_church_id and pt.person_id = any (v_universe)
        and (
          (v_op = 'contains' and pt.tag_id = (v_rule ->> 'value')::uuid)
          or (v_op = 'contains_any' and pt.tag_id = any (
            select jsonb_array_elements_text(v_rule -> 'value')::uuid
          ))
        );

    elsif v_field = 'relationship' then
      select coalesce(array_agg(distinct cp.person_id), '{}') into v_matches
      from church_people cp
      where cp.church_id = p_church_id and cp.person_id = any (v_universe)
        and (
          (v_op = 'eq' and cp.relationship = (v_rule ->> 'value')::church_people_relationship)
          or (v_op = 'in' and cp.relationship = any (
            select jsonb_array_elements_text(v_rule -> 'value')::church_people_relationship
          ))
        );

    elsif v_field = 'service_area_id' then
      select coalesce(array_agg(distinct sam.person_id), '{}') into v_matches
      from service_area_members sam
      where sam.church_id = p_church_id and sam.person_id = any (v_universe) and sam.status = 'active'
        and (
          (v_op = 'eq' and sam.service_area_id = (v_rule ->> 'value')::uuid)
          or (v_op = 'in' and sam.service_area_id = any (
            select jsonb_array_elements_text(v_rule -> 'value')::uuid
          ))
        );

    elsif v_field = 'channel_available' then
      if (v_rule ->> 'value') = 'email' then
        select coalesce(array_agg(distinct p.id), '{}') into v_matches
        from people p
        where p.id = any (v_universe) and p.email is not null;
      elsif (v_rule ->> 'value') = 'push' then
        -- Sin tabla de dispositivos todavía: nunca hay push disponible.
        v_matches := '{}';
      else
        v_matches := v_universe;
      end if;
    else
      v_matches := '{}';
    end if;

    if v_mode = 'all' then
      select coalesce(array_agg(distinct x), '{}') into v_candidates
      from unnest(v_candidates) x
      where x = any (v_matches);
    else
      select coalesce(array_agg(distinct x), '{}') into v_candidates
      from unnest(v_candidates || v_matches) x;
    end if;
  end loop;

  return query select unnest(v_candidates);
end;
$$;

comment on function app.resolve_segment_recipients(uuid, jsonb) is
  'Resuelve destinatarios de un segmento. Acepta {"all": [...]} (AND, intersección progresiva) o {"any": [...]} (OR, unión progresiva), nunca mixto ni anidado. Allowlist positiva de campos en app.validate_segment_rules.';

-- ============================================================================
-- Capabilities communications.update / communications.cancel (separadas de
-- communications.schedule, que hasta ahora cubría el cancelado implícito).
-- ============================================================================

insert into capabilities (key, description, module_key) values
  ('communications.update', 'Editar una comunicación en borrador', 'communications'),
  ('communications.cancel', 'Cancelar una comunicación en borrador o programada', 'communications');

insert into role_capabilities (role_key, capability_key)
select 'church_owner', key from capabilities where key in ('communications.update', 'communications.cancel')
union all
select 'church_admin', key from capabilities where key in ('communications.update', 'communications.cancel');

insert into role_capabilities (role_key, capability_key)
select 'campus_admin', key from capabilities where key in ('communications.update', 'communications.cancel');

insert into role_capabilities (role_key, capability_key) values
  ('ministry_leader', 'communications.update'),
  ('ministry_leader', 'communications.cancel');

-- app.cancel_communication ahora exige communications.cancel (antes
-- comunications.schedule cubría el cancelado implícitamente).
create or replace function app.cancel_communication(p_communication_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_comm communications%rowtype;
begin
  select * into v_comm from communications where id = p_communication_id for update skip locked;

  if not found then
    raise exception 'Comunicación no encontrada.' using errcode = 'P0002';
  end if;

  if not app.communication_cap(v_comm.church_id, null, 'communications.cancel') then
    raise exception 'No tienes permiso para cancelar esta comunicación.' using errcode = '42501';
  end if;

  if v_comm.status not in ('draft', 'scheduled') then
    raise exception 'Solo se puede cancelar una comunicación en borrador o programada.' using errcode = '22023';
  end if;

  update communications set status = 'cancelled' where id = p_communication_id;

  perform app.write_audit_log(v_comm.church_id, 'communication.cancelled', 'communications', p_communication_id);
end;
$$;

-- app.update_communication: edita una comunicación en draft (título,
-- asunto, cuerpo, canales, purpose). Nunca cambia segment_rules_snapshot
-- directamente aquí (eso sigue siendo update_communication_segment_rules,
-- ya existente) ni permite editar fuera de draft.
create or replace function app.update_communication(
  p_communication_id uuid,
  p_title text default null,
  p_subject text default null,
  p_body_template text default null,
  p_purpose communication_purpose default null,
  p_channels notification_channel[] default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_comm communications%rowtype;
  v_person_id uuid;
begin
  select * into v_comm from communications where id = p_communication_id for update skip locked;

  if not found then
    raise exception 'Comunicación no encontrada.' using errcode = 'P0002';
  end if;

  if not app.communication_cap(v_comm.church_id, null, 'communications.update') then
    raise exception 'No tienes permiso para editar esta comunicación.' using errcode = '42501';
  end if;

  if v_comm.status <> 'draft' then
    raise exception 'Solo se puede editar una comunicación en borrador.' using errcode = '22023';
  end if;

  if p_channels is not null and not (
    p_channels <@ array['inapp', 'email', 'push']::notification_channel[] and cardinality(p_channels) > 0
  ) then
    raise exception 'Canales no válidos.' using errcode = '22023';
  end if;

  v_person_id := app.current_person_id(v_comm.church_id);

  update communications set
    title = coalesce(p_title, title),
    subject = coalesce(p_subject, subject),
    body_template = coalesce(p_body_template, body_template),
    purpose = coalesce(p_purpose, purpose),
    channels = coalesce(p_channels, channels),
    updated_by_person_id = v_person_id
  where id = p_communication_id;

  perform app.write_audit_log(v_comm.church_id, 'communication.updated', 'communications', p_communication_id);
end;
$$;

revoke all on function app.update_communication(
  uuid, text, text, text, communication_purpose, notification_channel[]
) from public, anon;
grant execute on function app.update_communication(
  uuid, text, text, text, communication_purpose, notification_channel[]
) to authenticated;

create or replace function public.update_communication(
  p_communication_id uuid, p_title text default null, p_subject text default null,
  p_body_template text default null, p_purpose communication_purpose default null,
  p_channels notification_channel[] default null
)
returns void
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.update_communication(p_communication_id, p_title, p_subject, p_body_template, p_purpose, p_channels);
$$;

revoke all on function public.update_communication(
  uuid, text, text, text, communication_purpose, notification_channel[]
) from public;
grant execute on function public.update_communication(
  uuid, text, text, text, communication_purpose, notification_channel[]
) to authenticated;

-- ============================================================================
-- Límite de creación centralizado (hoy sigue siendo un valor fijo, pero en
-- un único lugar para que un entitlement futuro solo tenga que cambiar esta
-- función, no cada llamante). No se inventa un sistema de planes.
-- ============================================================================

create or replace function app.communication_rate_limit(p_church_id uuid)
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select 20;
$$;

comment on function app.communication_rate_limit(uuid) is
  'Máximo de comunicaciones creadas por hora para una iglesia. Hoy un valor fijo (20); punto de extensión único para cuando exista un sistema de entitlements que lo module por plan.';

revoke all on function app.communication_rate_limit(uuid) from public, anon;
grant execute on function app.communication_rate_limit(uuid) to authenticated, service_role;

create or replace function app.create_communication(
  p_church_id uuid,
  p_title text,
  p_purpose communication_purpose,
  p_subject text,
  p_body_template text,
  p_channels notification_channel[],
  p_rules jsonb,
  p_template_id uuid default null,
  p_segment_id uuid default null,
  p_service_area_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
  v_person_id uuid;
  v_recent integer;
  v_church_scope boolean;
begin
  v_church_scope := app.has_capability(p_church_id, 'communications.create');

  if not v_church_scope then
    if p_service_area_id is null or not app.has_capability(p_church_id, 'communications.create', 'service_area', p_service_area_id) then
      raise exception 'No tienes permiso para crear esta comunicación.' using errcode = '42501';
    end if;
    if p_rules is null or (p_rules -> 'all') is null or jsonb_array_length(p_rules -> 'all') <> 1
       or (p_rules -> 'all' -> 0 ->> 'field') <> 'service_area_id'
       or (p_rules -> 'all' -> 0 ->> 'op') <> 'eq'
       or (p_rules -> 'all' -> 0 ->> 'value') <> p_service_area_id::text then
      raise exception 'Un líder de área solo puede enviar comunicaciones acotadas a su área.' using errcode = '42501';
    end if;
  end if;

  perform app.validate_segment_rules(p_rules);

  select count(*) into v_recent
  from communications
  where church_id = p_church_id and created_at > now() - interval '1 hour';
  if v_recent >= app.communication_rate_limit(p_church_id) then
    raise exception 'Se han creado demasiadas comunicaciones en la última hora.' using errcode = '53400';
  end if;

  v_person_id := app.current_person_id(p_church_id);

  insert into communications (
    church_id, title, purpose, subject, body_template, channels,
    segment_id, segment_rules_snapshot, template_id, created_by_person_id, updated_by_person_id
  ) values (
    p_church_id, p_title, p_purpose, p_subject, p_body_template, p_channels,
    p_segment_id, p_rules, p_template_id, v_person_id, v_person_id
  )
  returning id into v_id;

  perform app.write_audit_log(
    p_church_id, 'communication.created', 'communications', v_id,
    jsonb_build_object('purpose', p_purpose, 'channels', p_channels)
  );

  return v_id;
end;
$$;
