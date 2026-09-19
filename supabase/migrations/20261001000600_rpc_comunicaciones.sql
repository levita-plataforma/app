-- Fase 9 (Diogo) · RPC de comunicaciones: segmentación, preview,
-- creación/materialización/envío. Todo pasa por app.* security definer +
-- wrapper public.* security invoker, mismo patrón que register_for_event
-- (Fase 6) y submit_marketing_lead.
--
-- Reutiliza notification_events/notifications SOLO para el canal inapp
-- (ver decisión en el plan de Fase 9): app.notification_text tiene un case
-- fijo por event_type pensado para el copy de assignments, no para el
-- cuerpo libre de una comunicación, y app.process_notification_events crea
-- notification_deliveries para todos los canales, duplicando lo que
-- communication_recipients ya resuelve. Por eso app.send_communication
-- escribe DIRECTAMENTE una fila mínima en notification_events (ya marcada
-- processed_at, para que el consumidor de avisos nunca la recoja) y una fila
-- por destinatario inapp en notifications, sin pasar por
-- process_notification_events y sin crear notification_deliveries.

-- Se usa app.add_notification_event_types (20260928001000_hotfix_kids_seguridad.sql)
-- en vez de reescribir la constraint entera: esa función une el tipo nuevo a
-- los que ya hubiera, sin depender del orden de aplicación entre fases. Un
-- drop/add con la lista completa hardcodeada es justo el patrón que dejó
-- rotas mutuamente a la Fase 7 y la Fase 8 (ver comentario de esa función).
select app.add_notification_event_types(array['communication.sent']);

-- ============================================================================
-- 1. Validación de reglas de segmento (allowlist positiva)
-- ============================================================================

create or replace function app.validate_segment_rules(p_rules jsonb)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_rule jsonb;
  v_field text;
  v_op text;
begin
  if p_rules is null or jsonb_typeof(p_rules) <> 'object' or not (p_rules ? 'all') then
    raise exception 'Las reglas del segmento deben tener la forma {"all": [...]}.' using errcode = '22023';
  end if;

  if jsonb_typeof(p_rules -> 'all') <> 'array' then
    raise exception 'El campo "all" debe ser una lista de condiciones.' using errcode = '22023';
  end if;

  if jsonb_array_length(p_rules -> 'all') = 0 then
    raise exception 'El segmento necesita al menos una condición.' using errcode = '22023';
  end if;

  for v_rule in select * from jsonb_array_elements(p_rules -> 'all')
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

revoke all on function app.validate_segment_rules(jsonb) from public, anon;
grant execute on function app.validate_segment_rules(jsonb) to authenticated;

create or replace function app.communication_segments_validate_rules()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform app.validate_segment_rules(new.rules);
  return new;
end;
$$;

create trigger communication_segments_validate_rules
  before insert or update of rules on communication_segments
  for each row execute function app.communication_segments_validate_rules();

-- ============================================================================
-- 2. Validación de placeholders de plantilla
-- ============================================================================

create or replace function app.validate_template_placeholders(p_text text, p_allowed text[])
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_match text[];
  v_token text;
begin
  if p_text is null then
    return;
  end if;

  select array_agg(m[1]) into v_match
  from regexp_matches(p_text, '\{\{\s*([a-zA-Z_]+)\s*\}\}', 'g') m;

  if v_match is null then
    return;
  end if;

  foreach v_token in array v_match
  loop
    if v_token <> all (array['first_name', 'church_name']) then
      raise exception 'Placeholder no permitido: {{%}}', v_token using errcode = '42501';
    end if;
    if p_allowed is not null and v_token <> all (p_allowed) then
      raise exception 'Placeholder no permitido para esta plantilla: {{%}}', v_token using errcode = '42501';
    end if;
  end loop;
end;
$$;

revoke all on function app.validate_template_placeholders(text, text[]) from public, anon;
grant execute on function app.validate_template_placeholders(text, text[]) to authenticated;

create or replace function app.communication_templates_validate()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform app.validate_template_placeholders(new.subject, new.placeholders_allowed);
  perform app.validate_template_placeholders(new.body, new.placeholders_allowed);
  return new;
end;
$$;

create trigger communication_templates_validate
  before insert or update of subject, body, placeholders_allowed on communication_templates
  for each row execute function app.communication_templates_validate();

create or replace function app.communications_validate_body()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform app.validate_template_placeholders(new.subject, array['first_name', 'church_name']);
  perform app.validate_template_placeholders(new.body_template, array['first_name', 'church_name']);
  return new;
end;
$$;

create trigger communications_validate_body
  before insert or update of subject, body_template on communications
  for each row execute function app.communications_validate_body();

-- ============================================================================
-- 3. Resolución de destinatarios (interpretación controlada del JSON)
-- ============================================================================

create or replace function app.resolve_segment_recipients(p_church_id uuid, p_rules jsonb)
returns table (person_id uuid)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_rule jsonb;
  v_field text;
  v_op text;
  v_candidates uuid[];
begin
  perform app.validate_segment_rules(p_rules);

  select coalesce(array_agg(cp.person_id), '{}') into v_candidates
  from church_people cp
  where cp.church_id = p_church_id and cp.archived_at is null;

  for v_rule in select * from jsonb_array_elements(p_rules -> 'all')
  loop
    v_field := v_rule ->> 'field';
    v_op := v_rule ->> 'op';

    if v_field = 'campus_id' then
      select coalesce(array_agg(distinct cp.person_id), '{}') into v_candidates
      from church_people cp
      where cp.church_id = p_church_id and cp.person_id = any (v_candidates)
        and (
          (v_op = 'eq' and cp.primary_campus_id = (v_rule ->> 'value')::uuid)
          or (v_op = 'in' and cp.primary_campus_id = any (
            select jsonb_array_elements_text(v_rule -> 'value')::uuid
          ))
        );

    elsif v_field = 'tags' then
      select coalesce(array_agg(distinct pt.person_id), '{}') into v_candidates
      from person_tags pt
      where pt.church_id = p_church_id and pt.person_id = any (v_candidates)
        and (
          (v_op = 'contains' and pt.tag_id = (v_rule ->> 'value')::uuid)
          or (v_op = 'contains_any' and pt.tag_id = any (
            select jsonb_array_elements_text(v_rule -> 'value')::uuid
          ))
        );

    elsif v_field = 'relationship' then
      select coalesce(array_agg(distinct cp.person_id), '{}') into v_candidates
      from church_people cp
      where cp.church_id = p_church_id and cp.person_id = any (v_candidates)
        and (
          (v_op = 'eq' and cp.relationship = (v_rule ->> 'value')::church_people_relationship)
          or (v_op = 'in' and cp.relationship = any (
            select jsonb_array_elements_text(v_rule -> 'value')::church_people_relationship
          ))
        );

    elsif v_field = 'service_area_id' then
      select coalesce(array_agg(distinct sam.person_id), '{}') into v_candidates
      from service_area_members sam
      where sam.church_id = p_church_id and sam.person_id = any (v_candidates) and sam.status = 'active'
        and (
          (v_op = 'eq' and sam.service_area_id = (v_rule ->> 'value')::uuid)
          or (v_op = 'in' and sam.service_area_id = any (
            select jsonb_array_elements_text(v_rule -> 'value')::uuid
          ))
        );

    elsif v_field = 'channel_available' then
      if (v_rule ->> 'value') = 'email' then
        select coalesce(array_agg(distinct p.id), '{}') into v_candidates
        from people p
        where p.id = any (v_candidates) and p.email is not null;
      elsif (v_rule ->> 'value') = 'push' then
        -- Sin tabla de dispositivos todavía: nunca hay push disponible.
        v_candidates := '{}';
      end if;
      -- inapp: siempre disponible, no filtra nada.
    end if;
  end loop;

  return query select unnest(v_candidates);
end;
$$;

revoke all on function app.resolve_segment_recipients(uuid, jsonb) from public, anon;
grant execute on function app.resolve_segment_recipients(uuid, jsonb) to authenticated;

-- ============================================================================
-- 4. Preview agregado (sin exponer filas de personas)
-- ============================================================================

create or replace function app.preview_communication_segment(
  p_church_id uuid,
  p_rules jsonb,
  p_channels notification_channel[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_total integer;
  v_by_channel jsonb := '{}'::jsonb;
  v_excluded jsonb := '[]'::jsonb;
  v_channel notification_channel;
  v_count integer;
  v_sin_email integer;
  v_opt_out integer;
begin
  if not (app.has_capability(p_church_id, 'communications.create')
      or app.has_capability(p_church_id, 'communications.manage_segments')) then
    raise exception 'No tienes permiso para previsualizar segmentos.' using errcode = '42501';
  end if;

  select count(*) into v_total from app.resolve_segment_recipients(p_church_id, p_rules);

  foreach v_channel in array coalesce(p_channels, array['inapp']::notification_channel[])
  loop
    if v_channel = 'inapp' then
      v_count := v_total;
    elsif v_channel = 'email' then
      select count(*) into v_count
      from app.resolve_segment_recipients(p_church_id, p_rules) r
      join people p on p.id = r.person_id
      where p.email is not null
        and coalesce((
          select np.enabled from notification_preferences np
          where np.church_id = p_church_id and np.person_id = r.person_id and np.channel = 'email'
        ), true);
    else
      -- push: sin tabla de dispositivos, nunca disponible. No se finge un número.
      v_count := 0;
    end if;

    v_by_channel := v_by_channel || jsonb_build_object(v_channel::text, v_count);
  end loop;

  select count(*) into v_sin_email
  from app.resolve_segment_recipients(p_church_id, p_rules) r
  join people p on p.id = r.person_id
  where p.email is null;

  select count(*) into v_opt_out
  from app.resolve_segment_recipients(p_church_id, p_rules) r
  join notification_preferences np
    on np.church_id = p_church_id and np.person_id = r.person_id and np.channel = 'email'
  where np.enabled = false;

  if v_sin_email > 0 then
    v_excluded := v_excluded || jsonb_build_array(jsonb_build_object('reason', 'sin_email', 'count', v_sin_email));
  end if;
  if v_opt_out > 0 then
    v_excluded := v_excluded || jsonb_build_array(jsonb_build_object('reason', 'opt_out_email', 'count', v_opt_out));
  end if;

  return jsonb_build_object('total', v_total, 'by_channel', v_by_channel, 'excluded', v_excluded);
end;
$$;

revoke all on function app.preview_communication_segment(uuid, jsonb, notification_channel[]) from public, anon;
grant execute on function app.preview_communication_segment(uuid, jsonb, notification_channel[]) to authenticated;

create or replace function public.preview_communication_segment(
  p_church_id uuid, p_rules jsonb, p_channels notification_channel[]
)
returns jsonb
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.preview_communication_segment(p_church_id, p_rules, p_channels);
$$;

revoke all on function public.preview_communication_segment(uuid, jsonb, notification_channel[]) from public;
grant execute on function public.preview_communication_segment(uuid, jsonb, notification_channel[]) to authenticated;

-- ============================================================================
-- 5. Creación de comunicaciones (con scope de área para ministry_leader)
-- ============================================================================

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
    -- Un líder de área solo puede crear comunicaciones cuyo segmento esté
    -- acotado exclusivamente a esa área (prompt Fase 9 §29).
    if p_rules is null or (p_rules -> 'all') is null or jsonb_array_length(p_rules -> 'all') <> 1
       or (p_rules -> 'all' -> 0 ->> 'field') <> 'service_area_id'
       or (p_rules -> 'all' -> 0 ->> 'op') <> 'eq'
       or (p_rules -> 'all' -> 0 ->> 'value') <> p_service_area_id::text then
      raise exception 'Un líder de área solo puede enviar comunicaciones acotadas a su área.' using errcode = '42501';
    end if;
  end if;

  perform app.validate_segment_rules(p_rules);

  -- Rate limit simple por tenant: máximo 20 comunicaciones creadas por hora.
  select count(*) into v_recent
  from communications
  where church_id = p_church_id and created_at > now() - interval '1 hour';
  if v_recent >= 20 then
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

revoke all on function app.create_communication(
  uuid, text, communication_purpose, text, text, notification_channel[], jsonb, uuid, uuid, uuid
) from public, anon;
grant execute on function app.create_communication(
  uuid, text, communication_purpose, text, text, notification_channel[], jsonb, uuid, uuid, uuid
) to authenticated;

create or replace function public.create_communication(
  p_church_id uuid, p_title text, p_purpose communication_purpose, p_subject text, p_body_template text,
  p_channels notification_channel[], p_rules jsonb, p_template_id uuid default null,
  p_segment_id uuid default null, p_service_area_id uuid default null
)
returns uuid
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.create_communication(
    p_church_id, p_title, p_purpose, p_subject, p_body_template, p_channels, p_rules,
    p_template_id, p_segment_id, p_service_area_id
  );
$$;

revoke all on function public.create_communication(
  uuid, text, communication_purpose, text, text, notification_channel[], jsonb, uuid, uuid, uuid
) from public;
grant execute on function public.create_communication(
  uuid, text, communication_purpose, text, text, notification_channel[], jsonb, uuid, uuid, uuid
) to authenticated;

-- ============================================================================
-- 6. Materialización (idempotente)
-- ============================================================================

-- app.materialize_communication_impl(): lógica compartida por el envío
-- manual (con capability check) y el cron (sin capability check, invocado
-- solo por service_role). Nunca se expone directamente vía RPC.
create or replace function app.materialize_communication_impl(p_communication_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_comm communications%rowtype;
  v_person_id uuid;
  v_channel notification_channel;
  v_has_email boolean;
  v_email_enabled boolean;
  v_inserted integer := 0;
begin
  select * into v_comm from communications where id = p_communication_id for update skip locked;

  if not found then
    raise exception 'Comunicación no encontrada o bloqueada por otro proceso.' using errcode = 'P0002';
  end if;

  if v_comm.materialized_at is not null then
    return jsonb_build_object('already_materialized', true, 'communication_id', p_communication_id);
  end if;

  if v_comm.status not in ('draft', 'scheduled') then
    raise exception 'Solo se puede materializar una comunicación en borrador o programada.' using errcode = '22023';
  end if;

  for v_person_id in
    select person_id from app.resolve_segment_recipients(v_comm.church_id, v_comm.segment_rules_snapshot)
  loop
    select p.email is not null into v_has_email from people p where p.id = v_person_id;

    foreach v_channel in array v_comm.channels
    loop
      if v_channel = 'inapp' then
        insert into communication_recipients (church_id, communication_id, person_id, channel, status)
        values (v_comm.church_id, p_communication_id, v_person_id, 'inapp', 'pending')
        on conflict (communication_id, person_id, channel) do nothing;
      elsif v_channel = 'email' then
        if not v_has_email then
          insert into communication_recipients (church_id, communication_id, person_id, channel, status, excluded_reason)
          values (v_comm.church_id, p_communication_id, v_person_id, 'email', 'excluded', 'sin_email')
          on conflict (communication_id, person_id, channel) do nothing;
        else
          select coalesce((
            select np.enabled from notification_preferences np
            where np.church_id = v_comm.church_id and np.person_id = v_person_id and np.channel = 'email'
          ), true) into v_email_enabled;

          insert into communication_recipients (church_id, communication_id, person_id, channel, status)
          values (
            v_comm.church_id, p_communication_id, v_person_id, 'email',
            case when v_email_enabled then 'pending' else 'suppressed' end::communication_recipient_status
          )
          on conflict (communication_id, person_id, channel) do nothing;
        end if;
      elsif v_channel = 'push' then
        -- Sin tabla de dispositivos: siempre excluido, nunca fingido.
        insert into communication_recipients (church_id, communication_id, person_id, channel, status, excluded_reason)
        values (v_comm.church_id, p_communication_id, v_person_id, 'push', 'excluded', 'canal_no_disponible')
        on conflict (communication_id, person_id, channel) do nothing;
      end if;

      v_inserted := v_inserted + 1;
    end loop;
  end loop;

  update communications set status = 'processing', materialized_at = now() where id = p_communication_id;

  perform app.write_audit_log(
    v_comm.church_id, 'communication.materialized', 'communications', p_communication_id,
    jsonb_build_object('recipients_inserted', v_inserted)
  );

  return jsonb_build_object('already_materialized', false, 'communication_id', p_communication_id, 'recipients', v_inserted);
end;
$$;

revoke all on function app.materialize_communication_impl(uuid) from public, anon;
grant execute on function app.materialize_communication_impl(uuid) to service_role;

-- Envío manual: exige communications.send del llamante.
create or replace function app.materialize_communication(p_communication_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_church_id uuid;
begin
  select church_id into v_church_id from communications where id = p_communication_id;
  if v_church_id is null then
    raise exception 'Comunicación no encontrada.' using errcode = 'P0002';
  end if;
  if not app.communication_cap(v_church_id, null, 'communications.send') then
    raise exception 'No tienes permiso para materializar esta comunicación.' using errcode = '42501';
  end if;
  return app.materialize_communication_impl(p_communication_id);
end;
$$;

revoke all on function app.materialize_communication(uuid) from public, anon;
grant execute on function app.materialize_communication(uuid) to authenticated;

create or replace function public.materialize_communication(p_communication_id uuid)
returns jsonb
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.materialize_communication(p_communication_id);
$$;

-- Cron: sin capability check (proceso interno, no hay usuario humano).
create or replace function app.cron_materialize_communication(p_communication_id uuid)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $$
  select app.materialize_communication_impl(p_communication_id);
$$;

revoke all on function app.cron_materialize_communication(uuid) from public, anon, authenticated;
grant execute on function app.cron_materialize_communication(uuid) to service_role;

create or replace function public.cron_materialize_communication(p_communication_id uuid)
returns jsonb
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.cron_materialize_communication(p_communication_id);
$$;

revoke all on function public.cron_materialize_communication(uuid) from public, anon, authenticated;
grant execute on function public.cron_materialize_communication(uuid) to service_role;

revoke all on function public.materialize_communication(uuid) from public;
grant execute on function public.materialize_communication(uuid) to authenticated;

-- ============================================================================
-- 7. Envío (en lotes, nunca síncrono para miles de destinatarios)
-- ============================================================================

-- app.send_communication_impl(): lógica compartida por el envío manual (con
-- capability check) y el cron (sin capability check). Nunca se expone
-- directamente vía RPC.
create or replace function app.send_communication_impl(p_communication_id uuid, p_batch_limit integer default 500)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_comm communications%rowtype;
  v_recipient communication_recipients%rowtype;
  v_event_id uuid;
  v_title text;
  v_body text;
  v_person people%rowtype;
  v_church_name text;
  v_processed integer := 0;
  v_remaining integer;
  v_final_status communication_status;
begin
  select * into v_comm from communications where id = p_communication_id for update skip locked;

  if not found then
    raise exception 'Comunicación no encontrada o bloqueada por otro proceso.' using errcode = 'P0002';
  end if;

  if v_comm.materialized_at is null then
    raise exception 'La comunicación todavía no está materializada.' using errcode = '22023';
  end if;

  if v_comm.status not in ('processing', 'scheduled', 'draft') then
    return jsonb_build_object('status', v_comm.status, 'processed', 0);
  end if;

  update communications set status = 'processing' where id = p_communication_id;

  select name into v_church_name from churches where id = v_comm.church_id;

  for v_recipient in
    select * from communication_recipients
    where communication_id = p_communication_id and status = 'pending'
    order by created_at
    limit greatest(coalesce(p_batch_limit, 500), 1)
    for update skip locked
  loop
    if v_recipient.channel = 'inapp' then
      select * into v_person from people where id = v_recipient.person_id;

      v_title := v_comm.subject;
      if v_title is null or btrim(v_title) = '' then
        v_title := v_comm.title;
      end if;
      v_body := replace(replace(v_comm.body_template, '{{first_name}}', coalesce(v_person.first_name, '')),
        '{{church_name}}', coalesce(v_church_name, ''));
      v_title := replace(replace(v_title, '{{first_name}}', coalesce(v_person.first_name, '')),
        '{{church_name}}', coalesce(v_church_name, ''));

      insert into notification_events (
        church_id, event_type, entity_type, entity_id, entity_version,
        idempotency_key, recipient_person_ids, payload, processed_at
      ) values (
        v_comm.church_id, 'communication.sent', 'communications', p_communication_id, 1,
        'communication.sent:' || p_communication_id::text || ':1:' || v_recipient.person_id::text,
        array[v_recipient.person_id], '{}'::jsonb, now()
      )
      on conflict (idempotency_key) do nothing
      returning id into v_event_id;

      if v_event_id is null then
        select id into v_event_id from notification_events
        where idempotency_key = 'communication.sent:' || p_communication_id::text || ':1:' || v_recipient.person_id::text;
      end if;

      insert into notifications (
        church_id, event_id, person_id, event_type, title, body, entity_type, entity_id
      ) values (
        v_comm.church_id, v_event_id, v_recipient.person_id, 'communication.sent',
        left(coalesce(v_title, 'Comunicación'), 200), left(coalesce(v_body, ''), 1000),
        'communications', p_communication_id
      )
      on conflict (event_id, person_id) do nothing;

      update communication_recipients set status = 'sent', sent_at = now() where id = v_recipient.id;
    else
      -- email/push sin proveedor real: queda en cola, nunca se finge enviado.
      update communication_recipients set status = 'queued' where id = v_recipient.id;
    end if;

    v_processed := v_processed + 1;
  end loop;

  select count(*) into v_remaining
  from communication_recipients
  where communication_id = p_communication_id and status = 'pending';

  if v_remaining = 0 then
    if exists (
      select 1 from communication_recipients
      where communication_id = p_communication_id and status in ('sent', 'queued')
    ) and exists (
      select 1 from communication_recipients
      where communication_id = p_communication_id and status in ('failed', 'excluded')
    ) then
      v_final_status := 'partially_sent';
    elsif exists (
      select 1 from communication_recipients
      where communication_id = p_communication_id and status in ('sent', 'queued', 'suppressed')
    ) then
      v_final_status := 'sent';
    else
      v_final_status := 'failed';
    end if;

    update communications
    set status = v_final_status, sent_at = now()
    where id = p_communication_id;

    perform app.write_audit_log(
      v_comm.church_id, 'communication.sent', 'communications', p_communication_id,
      jsonb_build_object('final_status', v_final_status)
    );
  end if;

  return jsonb_build_object('processed', v_processed, 'remaining', v_remaining);
end;
$$;

revoke all on function app.send_communication_impl(uuid, integer) from public, anon;
grant execute on function app.send_communication_impl(uuid, integer) to service_role;

-- Envío manual: exige communications.send del llamante.
create or replace function app.send_communication(p_communication_id uuid, p_batch_limit integer default 500)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_church_id uuid;
begin
  select church_id into v_church_id from communications where id = p_communication_id;
  if v_church_id is null then
    raise exception 'Comunicación no encontrada.' using errcode = 'P0002';
  end if;
  if not app.communication_cap(v_church_id, null, 'communications.send') then
    raise exception 'No tienes permiso para enviar esta comunicación.' using errcode = '42501';
  end if;
  return app.send_communication_impl(p_communication_id, p_batch_limit);
end;
$$;

revoke all on function app.send_communication(uuid, integer) from public, anon;
grant execute on function app.send_communication(uuid, integer) to authenticated;

-- Cron: sin capability check (proceso interno, no hay usuario humano).
create or replace function app.cron_send_communication(p_communication_id uuid, p_batch_limit integer default 500)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $$
  select app.send_communication_impl(p_communication_id, p_batch_limit);
$$;

revoke all on function app.cron_send_communication(uuid, integer) from public, anon, authenticated;
grant execute on function app.cron_send_communication(uuid, integer) to service_role;

create or replace function public.cron_send_communication(p_communication_id uuid, p_batch_limit integer default 500)
returns jsonb
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.cron_send_communication(p_communication_id, p_batch_limit);
$$;

revoke all on function public.cron_send_communication(uuid, integer) from public, anon, authenticated;
grant execute on function public.cron_send_communication(uuid, integer) to service_role;

create or replace function public.send_communication(p_communication_id uuid, p_batch_limit integer default 500)
returns jsonb
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.send_communication(p_communication_id, p_batch_limit);
$$;

revoke all on function public.send_communication(uuid, integer) from public;
grant execute on function public.send_communication(uuid, integer) to authenticated;

-- ============================================================================
-- 8. Cancelación (solo antes de procesar)
-- ============================================================================

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

  if not app.communication_cap(v_comm.church_id, null, 'communications.schedule') then
    raise exception 'No tienes permiso para cancelar esta comunicación.' using errcode = '42501';
  end if;

  if v_comm.status not in ('draft', 'scheduled') then
    raise exception 'Solo se puede cancelar una comunicación en borrador o programada.' using errcode = '22023';
  end if;

  update communications set status = 'cancelled' where id = p_communication_id;

  perform app.write_audit_log(v_comm.church_id, 'communication.cancelled', 'communications', p_communication_id);
end;
$$;

revoke all on function app.cancel_communication(uuid) from public, anon;
grant execute on function app.cancel_communication(uuid) to authenticated;

create or replace function public.cancel_communication(p_communication_id uuid)
returns void
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.cancel_communication(p_communication_id);
$$;

revoke all on function public.cancel_communication(uuid) from public;
grant execute on function public.cancel_communication(uuid) to authenticated;

-- ============================================================================
-- 9. Descubrimiento para el cron (solo service_role)
-- ============================================================================

-- Comunicaciones programadas cuya hora ya llegó y todavía no se
-- materializaron.
create or replace function app.due_scheduled_communications(p_limit integer default 5)
returns table (id uuid)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select c.id from communications c
  where c.status = 'scheduled' and c.materialized_at is null and c.scheduled_at <= now()
  order by c.scheduled_at
  limit greatest(coalesce(p_limit, 5), 1);
$$;

revoke all on function app.due_scheduled_communications(integer) from public, anon, authenticated;
grant execute on function app.due_scheduled_communications(integer) to service_role;

create or replace function public.due_scheduled_communications(p_limit integer default 5)
returns table (id uuid)
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select * from app.due_scheduled_communications(p_limit);
$$;

revoke all on function public.due_scheduled_communications(integer) from public, anon, authenticated;
grant execute on function public.due_scheduled_communications(integer) to service_role;

-- Comunicaciones materializadas con destinatarios todavía pendientes de
-- procesar (recién materializadas o enviadas a medias en una pasada previa).
create or replace function app.pending_send_communications(p_limit integer default 5)
returns table (id uuid)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select distinct c.id from communications c
  join communication_recipients cr on cr.communication_id = c.id and cr.status = 'pending'
  where c.materialized_at is not null and c.status in ('processing', 'scheduled', 'draft')
  limit greatest(coalesce(p_limit, 5), 1);
$$;

revoke all on function app.pending_send_communications(integer) from public, anon, authenticated;
grant execute on function app.pending_send_communications(integer) to service_role;

create or replace function public.pending_send_communications(p_limit integer default 5)
returns table (id uuid)
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select * from app.pending_send_communications(p_limit);
$$;

revoke all on function public.pending_send_communications(integer) from public, anon, authenticated;
grant execute on function public.pending_send_communications(integer) to service_role;
