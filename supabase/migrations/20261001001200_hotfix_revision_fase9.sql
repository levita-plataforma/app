-- Fase 9 · Arreglos de la revisión previa a la integración.
--
-- Va en una migración aparte y no reescribe las once anteriores porque la rama
-- sigue viva: así los cambios de una y otra parte no se pisan.
--
-- Lo que corrige:
--   1. Crear o archivar una plantilla o un segmento fallaba siempre.
--   2. Una comunicación por correo se marcaba «Enviada» sin haber salido nada.
--   3. El canal de la aplicación ignoraba las preferencias de la persona.
--   4. La resolución de segmentos estaba al alcance de cualquier sesión.
--   5. Quien tuviera sesión abierta no podía usar su enlace de baja.

-- ===========================================================================
-- 2. Un estado que distingue lo entregado de lo que solo está en cola
-- ===========================================================================
--
-- El estado final contaba como entregados a los destinatarios en 'queued'. El
-- correo no tiene proveedor y se queda en cola para siempre, así que una
-- comunicación solo por correo terminaba en 'sent' y la interfaz la mostraba
-- como «Enviada». El envío por destinatario ya estaba bien resuelto; era el
-- agregado el que mentía.
--
-- Se añade el valor al enum aquí y se usa más abajo: PostgreSQL admite
-- 'alter type ... add value' dentro de una transacción desde la 12, y el valor
-- solo se emplea en tiempo de ejecución de las funciones, no al crearlas.

alter type communication_status add value if not exists 'queued' before 'sent';

comment on type communication_status is
  'draft: en edición. scheduled: con scheduled_at pendiente. processing: materializando o enviando. queued: lo que había quedó en cola y NO ha salido, porque el transporte externo sigue desactivado (D20 y D21). sent: hubo entrega de verdad, en la bandeja de la aplicación. partially_sent: una parte se entregó y otra quedó en cola. failed: no se entregó ni se encoló nada. cancelled: cancelada antes de procesar.';

-- ===========================================================================
-- 3. El canal de la aplicacion respeta las preferencias, y el estado dice la verdad
-- ===========================================================================
-- Las dos funciones se reproducen desde su version vigente con un parche
-- puntual, no reescritas: hoy ya costo tres fallos graves hacerlo de memoria.

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
  v_category_opted_out boolean;
  v_is_optional_category boolean;
  v_token text;
  v_inapp_enabled boolean;
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

  v_is_optional_category := v_comm.purpose::text in ('services', 'groups', 'events', 'discipleship', 'kids', 'pastoral');

  for v_person_id in
    select person_id from app.resolve_segment_recipients(v_comm.church_id, v_comm.segment_rules_snapshot)
  loop
    select p.email is not null into v_has_email from people p where p.id = v_person_id;

    v_category_opted_out := false;
    if v_is_optional_category then
      select coalesce((
        select ccp.opted_out from communication_category_preferences ccp
        where ccp.church_id = v_comm.church_id and ccp.person_id = v_person_id and ccp.category = v_comm.purpose
      ), false) into v_category_opted_out;
    end if;

    foreach v_channel in array v_comm.channels
    loop
      if v_category_opted_out and v_channel <> 'inapp' then
        -- El opt-out de categoría opcional solo suprime canales externos
        -- (email/push): la bandeja interna sigue registrando el aviso, igual
        -- que inapp nunca se puede desactivar por canal en notification_preferences.
        insert into communication_recipients (church_id, communication_id, person_id, channel, status)
        values (v_comm.church_id, p_communication_id, v_person_id, v_channel, 'suppressed')
        on conflict (communication_id, person_id, channel) do nothing;
        v_inserted := v_inserted + 1;
        continue;
      end if;

      if v_channel = 'inapp' then
        -- El canal de la aplicación también respeta las preferencias: antes
        -- solo se comprobaban para el correo, así que quien había apagado los
        -- avisos en la aplicación los seguía recibiendo. Una preferencia que no
        -- se cumple es peor que no ofrecerla.
        select coalesce((
          select np.enabled from notification_preferences np
          where np.church_id = v_comm.church_id and np.person_id = v_person_id and np.channel = 'inapp'
        ), true) into v_inapp_enabled;

        insert into communication_recipients (church_id, communication_id, person_id, channel, status)
        values (
          v_comm.church_id, p_communication_id, v_person_id, 'inapp',
          case when v_inapp_enabled then 'pending' else 'suppressed' end::communication_recipient_status
        )
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

          v_token := null;
          if v_is_optional_category and v_email_enabled then
            v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
          end if;

          insert into communication_recipients (church_id, communication_id, person_id, channel, status, unsubscribe_token)
          values (
            v_comm.church_id, p_communication_id, v_person_id, 'email',
            case when v_email_enabled then 'pending' else 'suppressed' end::communication_recipient_status,
            v_token
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

revoke all on function app.materialize_communication_impl(uuid) from public, anon, authenticated;
grant execute on function app.materialize_communication_impl(uuid) to service_role;

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
  v_hubo_entrega boolean;
  v_hubo_cola boolean;
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
    -- Una comunicación no se llama «enviada» por tener destinatarios en cola.
    -- El correo no tiene proveedor y se queda en 'queued' para siempre, así que
    -- contarlo como entregado hace creer a quien la manda que su mensaje salió.
    -- 'suppressed' y 'excluded' no son fallos: son exclusiones previstas —quien
    -- se dio de baja, quien no tiene correo— y no degradan el estado por sí
    -- solas.
    select
      exists (select 1 from communication_recipients
              where communication_id = p_communication_id and status = 'sent'),
      exists (select 1 from communication_recipients
              where communication_id = p_communication_id and status = 'queued')
    into v_hubo_entrega, v_hubo_cola;

    if v_hubo_entrega and v_hubo_cola then
      v_final_status := 'partially_sent';
    elsif v_hubo_entrega then
      v_final_status := 'sent';
    elsif v_hubo_cola then
      v_final_status := 'queued';
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

revoke all on function app.send_communication_impl(uuid, integer) from public, anon, authenticated;
grant execute on function app.send_communication_impl(uuid, integer) to service_role;

-- ===========================================================================
-- 4. La resolución de segmentos vuelve a ser interna
-- ===========================================================================
-- La llaman funciones security definer que ya comprueban capacidad. Concederla
-- a authenticated la dejaba a un paso de servir como oráculo de quién está en
-- qué segmento.

revoke all on function app.resolve_segment_recipients(uuid, jsonb) from public, anon, authenticated;

-- ===========================================================================
-- 5. El enlace de baja funciona también con sesión abierta
-- ===========================================================================
--
-- La función estaba concedida solo a anon y revocada de authenticated, pero la
-- página pública usa el cliente del usuario: quien tuviera sesión en el
-- navegador y pinchara el enlace de su correo recibía un error diciendo que el
-- enlace no era válido, cuando sí lo era.
--
-- Conceder también a authenticated no relaja nada: la credencial es el token,
-- que son 256 bits, y quien lo tiene puede darse de baja tenga sesión o no.

grant execute on function app.unsubscribe_by_token(text) to anon, authenticated;
grant execute on function public.unsubscribe_by_token(text) to anon, authenticated;

-- ===========================================================================
-- 1. Las RPC que faltaban para plantillas y segmentos
-- ===========================================================================
--
-- La migración de RLS revoca insert, update y delete sobre las cuatro tablas y
-- su comentario dice que «toda escritura pasa por RPC security definer». Para
-- comunicaciones es cierto; para plantillas y segmentos esa RPC no existía y el
-- servidor escribía directamente con el cliente del usuario, así que crear o
-- archivar cualquiera de las dos cosas fallaba siempre.
--
-- Las capacidades manage_templates y manage_segments existían desde el
-- principio sin que nada las comprobara.

create or replace function app.save_communication_template(p_church_id uuid, p_input jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_id uuid := nullif(p_input ->> 'id', '')::uuid;
  v_name text := app.j_text(p_input, 'name');
  v_body text := app.j_text(p_input, 'body');
  v_placeholders text[];
begin
  perform app.assert_church_member(p_church_id);

  if not app.has_capability(p_church_id, 'communications.manage_templates') then
    raise exception 'No tienes permiso para gestionar plantillas.' using errcode = '42501';
  end if;

  if p_input ? 'placeholders_allowed' and jsonb_typeof(p_input -> 'placeholders_allowed') = 'array' then
    select coalesce(array_agg(value::text), array['first_name', 'church_name'])
    into v_placeholders
    from jsonb_array_elements_text(p_input -> 'placeholders_allowed') as value;
  else
    v_placeholders := array['first_name', 'church_name'];
  end if;

  if v_id is null then
    if v_name is null or v_body is null then
      raise exception 'La plantilla necesita nombre y cuerpo.' using errcode = '22023';
    end if;

    insert into communication_templates (
      church_id, name, subject, body, placeholders_allowed, category, created_by_person_id
    ) values (
      p_church_id, v_name, app.j_text(p_input, 'subject'), v_body,
      v_placeholders, app.j_text(p_input, 'category'),
      app.current_person_id(p_church_id)
    )
    returning id into v_id;
  else
    update communication_templates set
      name = coalesce(v_name, name),
      subject = case when p_input ? 'subject' then app.j_text(p_input, 'subject') else subject end,
      body = coalesce(v_body, body),
      placeholders_allowed = v_placeholders,
      category = case when p_input ? 'category' then app.j_text(p_input, 'category') else category end,
      updated_at = now()
    where id = v_id and church_id = p_church_id;

    if not found then
      raise exception 'La plantilla no existe.' using errcode = 'P0002';
    end if;
  end if;

  perform app.write_audit_log(p_church_id, 'communication_template.saved',
    'communication_templates', v_id, jsonb_build_object('name', v_name));
  return v_id;
end;
$fn$;

revoke all on function app.save_communication_template(uuid, jsonb) from public, anon;
grant execute on function app.save_communication_template(uuid, jsonb) to authenticated;

create or replace function app.set_communication_template_archived(p_template_id uuid, p_archived boolean)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_church uuid;
begin
  select church_id into v_church from communication_templates where id = p_template_id;
  if v_church is null or not (v_church = any (app.church_ids_for_user())) then
    raise exception 'La plantilla no existe.' using errcode = 'P0002';
  end if;

  if not app.has_capability(v_church, 'communications.manage_templates') then
    raise exception 'No tienes permiso para gestionar plantillas.' using errcode = '42501';
  end if;

  update communication_templates
  set archived_at = case when p_archived then now() else null end, updated_at = now()
  where id = p_template_id;

  perform app.write_audit_log(v_church,
    case when p_archived then 'communication_template.archived' else 'communication_template.restored' end,
    'communication_templates', p_template_id, '{}'::jsonb);
end;
$fn$;

revoke all on function app.set_communication_template_archived(uuid, boolean) from public, anon;
grant execute on function app.set_communication_template_archived(uuid, boolean) to authenticated;

create or replace function app.save_communication_segment(p_church_id uuid, p_input jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_id uuid := nullif(p_input ->> 'id', '')::uuid;
  v_name text := app.j_text(p_input, 'name');
  v_rules jsonb := p_input -> 'rules';
begin
  perform app.assert_church_member(p_church_id);

  if not app.has_capability(p_church_id, 'communications.manage_segments') then
    raise exception 'No tienes permiso para gestionar segmentos.' using errcode = '42501';
  end if;

  -- Las reglas las valida además el trigger de la tabla; comprobarlas aquí da
  -- un error claro antes de intentar escribir.
  if v_rules is not null then
    perform app.validate_segment_rules(v_rules);
  end if;

  if v_id is null then
    if v_name is null or v_rules is null then
      raise exception 'El segmento necesita nombre y reglas.' using errcode = '22023';
    end if;

    insert into communication_segments (church_id, name, description, rules, created_by_person_id)
    values (p_church_id, v_name, app.j_text(p_input, 'description'), v_rules,
            app.current_person_id(p_church_id))
    returning id into v_id;
  else
    update communication_segments set
      name = coalesce(v_name, name),
      description = case when p_input ? 'description' then app.j_text(p_input, 'description') else description end,
      rules = coalesce(v_rules, rules),
      updated_at = now()
    where id = v_id and church_id = p_church_id;

    if not found then
      raise exception 'El segmento no existe.' using errcode = 'P0002';
    end if;
  end if;

  perform app.write_audit_log(p_church_id, 'communication_segment.saved',
    'communication_segments', v_id, jsonb_build_object('name', v_name));
  return v_id;
end;
$fn$;

revoke all on function app.save_communication_segment(uuid, jsonb) from public, anon;
grant execute on function app.save_communication_segment(uuid, jsonb) to authenticated;

create or replace function app.set_communication_segment_archived(p_segment_id uuid, p_archived boolean)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_church uuid;
begin
  select church_id into v_church from communication_segments where id = p_segment_id;
  if v_church is null or not (v_church = any (app.church_ids_for_user())) then
    raise exception 'El segmento no existe.' using errcode = 'P0002';
  end if;

  if not app.has_capability(v_church, 'communications.manage_segments') then
    raise exception 'No tienes permiso para gestionar segmentos.' using errcode = '42501';
  end if;

  update communication_segments
  set archived_at = case when p_archived then now() else null end, updated_at = now()
  where id = p_segment_id;

  perform app.write_audit_log(v_church,
    case when p_archived then 'communication_segment.archived' else 'communication_segment.restored' end,
    'communication_segments', p_segment_id, '{}'::jsonb);
end;
$fn$;

revoke all on function app.set_communication_segment_archived(uuid, boolean) from public, anon;
grant execute on function app.set_communication_segment_archived(uuid, boolean) to authenticated;

create or replace function public.save_communication_template(p_church_id uuid, p_input jsonb)
returns uuid language sql security invoker set search_path = pg_catalog, public
as $fn$ select app.save_communication_template(p_church_id, p_input); $fn$;

create or replace function public.set_communication_template_archived(p_template_id uuid, p_archived boolean)
returns void language sql security invoker set search_path = pg_catalog, public
as $fn$ select app.set_communication_template_archived(p_template_id, p_archived); $fn$;

create or replace function public.save_communication_segment(p_church_id uuid, p_input jsonb)
returns uuid language sql security invoker set search_path = pg_catalog, public
as $fn$ select app.save_communication_segment(p_church_id, p_input); $fn$;

create or replace function public.set_communication_segment_archived(p_segment_id uuid, p_archived boolean)
returns void language sql security invoker set search_path = pg_catalog, public
as $fn$ select app.set_communication_segment_archived(p_segment_id, p_archived); $fn$;

do $grants$
declare
  v_sig text;
begin
  foreach v_sig in array array[
    'public.save_communication_template(uuid, jsonb)',
    'public.set_communication_template_archived(uuid, boolean)',
    'public.save_communication_segment(uuid, jsonb)',
    'public.set_communication_segment_archived(uuid, boolean)'
  ]
  loop
    execute format('revoke all on function %s from public, anon', v_sig);
    execute format('grant execute on function %s to authenticated', v_sig);
  end loop;
end;
$grants$;
