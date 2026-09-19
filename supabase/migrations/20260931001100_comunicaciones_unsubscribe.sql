-- Fase 9 (Diogo) · Unsubscribe por categoría opcional (iteración).
--
-- Mismo patrón que registrations.cancel_token (Fase 6): token opaco de alta
-- entropía (dos UUID sin guiones, sin exponer person_id ni ids
-- secuenciales), comparado por igualdad, RPC pública security definer,
-- grant a anon porque la baja no debe exigir login (igual criterio que
-- cancel_registration_by_token).
--
-- Se reescribe materialize_communication_impl para: (a) tratar las
-- categorías opcionales (services/groups/events/discipleship/kids/pastoral)
-- como sujetas a communication_category_preferences (opt-out -> suppressed,
-- nunca pending), y (b) generar un unsubscribe_token para email/push de esas
-- categorías. institutional/operational/system nunca generan token ni
-- consultan la tabla de preferencias: son siempre obligatorias.

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

-- app.unsubscribe_by_token: sin sesión (anon), consume el token de un
-- communication_recipients de categoría opcional y marca opt-out para esa
-- categoría y esa persona. Idempotente: repetir con el mismo token no falla,
-- solo confirma que ya está de baja.
create or replace function app.unsubscribe_by_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_recipient communication_recipients%rowtype;
  v_comm communications%rowtype;
begin
  if p_token is null or btrim(p_token) = '' then
    raise exception 'Token no válido.' using errcode = '22023';
  end if;

  select * into v_recipient from communication_recipients where unsubscribe_token = p_token;
  if not found then
    raise exception 'Enlace de baja no válido o ya usado.' using errcode = 'P0002';
  end if;

  select * into v_comm from communications where id = v_recipient.communication_id;

  insert into communication_category_preferences (church_id, person_id, category, opted_out)
  values (v_recipient.church_id, v_recipient.person_id, v_comm.purpose, true)
  on conflict (church_id, person_id, category) do update set opted_out = true, updated_at = now();

  perform app.write_audit_log(
    v_recipient.church_id, 'preferences.updated', 'communication_category_preferences', null,
    jsonb_build_object('category', v_comm.purpose, 'via', 'unsubscribe_token')
  );

  return jsonb_build_object('category', v_comm.purpose);
end;
$$;

revoke all on function app.unsubscribe_by_token(text) from public, authenticated;
grant execute on function app.unsubscribe_by_token(text) to anon;

create or replace function public.unsubscribe_by_token(p_token text)
returns jsonb
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.unsubscribe_by_token(p_token);
$$;

revoke all on function public.unsubscribe_by_token(text) from public;
grant execute on function public.unsubscribe_by_token(text) to anon;

-- app.set_communication_category_preference: la persona autenticada
-- gestiona su propio opt-out por categoría desde /app/comunicacion/preferencias
-- (no necesita token: ya tiene sesión). Mismo criterio que
-- set_my_notification_preference de Fase 5.
create or replace function app.set_communication_category_preference(p_church_id uuid, p_category communication_purpose, p_opted_out boolean)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_person_id uuid;
begin
  if p_category::text not in ('services', 'groups', 'events', 'discipleship', 'kids', 'pastoral') then
    raise exception 'Esta categoría no admite baja: es obligatoria.' using errcode = '22023';
  end if;

  v_person_id := app.current_person_id(p_church_id);
  if v_person_id is null then
    raise exception 'No perteneces a esta iglesia.' using errcode = '42501';
  end if;

  insert into communication_category_preferences (church_id, person_id, category, opted_out)
  values (p_church_id, v_person_id, p_category, p_opted_out)
  on conflict (church_id, person_id, category) do update set opted_out = p_opted_out, updated_at = now();

  perform app.write_audit_log(
    p_church_id, 'preferences.updated', 'communication_category_preferences', null,
    jsonb_build_object('category', p_category, 'opted_out', p_opted_out)
  );
end;
$$;

revoke all on function app.set_communication_category_preference(uuid, communication_purpose, boolean) from public, anon;
grant execute on function app.set_communication_category_preference(uuid, communication_purpose, boolean) to authenticated;

create or replace function public.set_communication_category_preference(p_church_id uuid, p_category communication_purpose, p_opted_out boolean)
returns void
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.set_communication_category_preference(p_church_id, p_category, p_opted_out);
$$;

revoke all on function public.set_communication_category_preference(uuid, communication_purpose, boolean) from public;
grant execute on function public.set_communication_category_preference(uuid, communication_purpose, boolean) to authenticated;

-- Lectura de las propias preferencias de categoría (para pintar la página).
create or replace function app.list_my_communication_category_preferences(p_church_id uuid)
returns table (category communication_purpose, opted_out boolean)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select cat.category, coalesce(ccp.opted_out, false)
  from unnest(array['services', 'groups', 'events', 'discipleship', 'kids', 'pastoral']::communication_purpose[]) as cat(category)
  left join communication_category_preferences ccp
    on ccp.church_id = p_church_id and ccp.category = cat.category
    and ccp.person_id = app.current_person_id(p_church_id);
$$;

revoke all on function app.list_my_communication_category_preferences(uuid) from public, anon;
grant execute on function app.list_my_communication_category_preferences(uuid) to authenticated;

create or replace function public.list_my_communication_category_preferences(p_church_id uuid)
returns table (category communication_purpose, opted_out boolean)
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select * from app.list_my_communication_category_preferences(p_church_id);
$$;

revoke all on function public.list_my_communication_category_preferences(uuid) from public;
grant execute on function public.list_my_communication_category_preferences(uuid) to authenticated;
