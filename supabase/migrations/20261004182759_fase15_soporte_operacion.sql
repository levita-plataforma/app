-- Fase 15 · PR B: soporte operacional.
--
-- Una sesión de soporte deja constancia de quién atiende una incidencia, en qué
-- iglesia, por qué, durante cuánto tiempo y con qué ámbito. Hoy su único ámbito es
-- el diagnóstico (metadatos). No concede lectura de datos de la iglesia: ninguna
-- política RLS la consulta, y la base la sigue sin ver. Los módulos sensibles
-- (Kids, Giving, Pastoral) quedan denegados por defecto.
--
-- 1. Duración explícita: 15, 30, 60, 120 o 240 minutos. Por defecto 60. Un valor
--    fuera de la lista se rechaza; ya no se recorta en silencio.
-- 2. Auditoría de la apertura con quién la autorizó (el operador con
--    platform.support.manage que la abre) y la duración.
-- 3. Diagnóstico sin datos de la iglesia: estado, plan, modo, flags, conteos
--    agregados. Nunca el motivo de seguridad ni contenido de negocio.
-- 4. Banner para el tenant: solo un booleano, sin operador, motivo ni caducidad.

-- 1 y 2. Apertura -----------------------------------------------------------------

create or replace function app.platform_open_support_session(
  p_church_id uuid,
  p_reason text,
  p_minutes integer default 60,
  p_scopes text[] default array['diagnostics']::text[]
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
  v_minutos integer := coalesce(p_minutes, 60);
  v_scope text;
begin
  perform app.assert_platform_capability('platform.support.manage');

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Una sesión de soporte sin motivo no se puede justificar después.' using errcode = '22023';
  end if;

  if length(btrim(p_reason)) > 500 then
    raise exception 'El motivo no puede superar los 500 caracteres.' using errcode = '22023';
  end if;

  if v_minutos not in (15, 30, 60, 120, 240) then
    raise exception 'La duración debe ser 15, 30, 60, 120 o 240 minutos.' using errcode = '22023';
  end if;

  if not exists (select 1 from churches where id = p_church_id) then
    raise exception 'La iglesia no existe.' using errcode = 'P0002';
  end if;

  foreach v_scope in array coalesce(p_scopes, array['diagnostics'])
  loop
    if v_scope <> 'diagnostics' then
      raise exception 'Solo está admitido el ámbito «diagnostics». El acceso a datos de la iglesia necesita una política de autorización aprobada, y todavía no la hay.'
        using errcode = '22023';
    end if;
  end loop;

  -- Una sesión viva por operador e iglesia.
  if exists (
    select 1 from support_sessions
    where church_id = p_church_id and operator_user_id = auth.uid()
      and revoked_at is null and expires_at > now()
  ) then
    raise exception 'Ya tienes una sesión de soporte abierta para esta iglesia.' using errcode = '23505';
  end if;

  insert into support_sessions (church_id, operator_user_id, reason, capabilities, expires_at)
  values (p_church_id, auth.uid(), btrim(p_reason), array['diagnostics'], now() + make_interval(mins => v_minutos))
  returning id into v_id;

  perform app.write_platform_audit('support.session_opened', p_church_id,
    jsonb_build_object('session_id', v_id, 'reason', btrim(p_reason), 'minutes', v_minutos,
                       'scopes', array['diagnostics'], 'grants_data_access', false,
                       'authorized_by', auth.uid()));

  return v_id;
end;
$$;

-- 3. Diagnóstico sin datos ------------------------------------------------------------

create or replace function app.platform_church_diagnostics(p_church_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not (app.has_platform_capability('platform.operations.read')
          or app.has_platform_capability('platform.churches.read')) then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  if not exists (select 1 from churches where id = p_church_id) then
    raise exception 'La iglesia no existe.' using errcode = 'P0002';
  end if;

  -- Solo metadatos y conteos agregados: sin motivo de seguridad, sin contenido
  -- de avisos, sin nombres ni datos de personas.
  return (
    select jsonb_build_object(
      'lifecycle', c.status::text,
      'commercial', coalesce(s.status::text, 'sin_suscripcion'),
      'access_mode', app.church_access_mode(c.id),
      'security_blocked', c.security_block_reason is not null,
      'maintenance', c.maintenance_until is not null and c.maintenance_until > now(),
      'archived', c.archived_at is not null,
      'active_support_sessions', (
        select count(*)::integer from support_sessions ss
        where ss.church_id = c.id and ss.revoked_at is null and ss.expires_at > now()
      ),
      'last_support_session_at', (select max(ss.started_at) from support_sessions ss where ss.church_id = c.id),
      'last_activity_at', (select max(al.created_at) from audit_logs al where al.church_id = c.id),
      'failed_deliveries_7d', (
        select count(*)::integer from notification_deliveries nd
        where nd.church_id = c.id and nd.status = 'failed' and nd.updated_at > now() - interval '7 days'
      ),
      'queued_deliveries', (
        select count(*)::integer from notification_deliveries nd
        where nd.church_id = c.id and nd.status = 'queued'
      )
    )
    from churches c
    left join subscriptions s on s.church_id = c.id
    where c.id = p_church_id
  );
end;
$$;

-- 4. Banner del tenant ------------------------------------------------------------------

-- Solo para miembros de la iglesia. Devuelve un booleano: no revela operador, motivo
-- ni caducidad. Para cualquiera que no sea miembro, false.
create or replace function app.support_session_active_for_church(p_church_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p_church_id = any (app.church_ids_for_user())
     and exists (
       select 1 from support_sessions ss
       where ss.church_id = p_church_id
         and ss.revoked_at is null
         and ss.expires_at > now()
     );
$$;

revoke all on function app.platform_church_diagnostics(uuid) from public, anon;
revoke all on function app.support_session_active_for_church(uuid) from public, anon;
grant execute on function app.platform_church_diagnostics(uuid) to authenticated, service_role;
grant execute on function app.support_session_active_for_church(uuid) to authenticated, service_role;

create or replace function public.platform_church_diagnostics(p_church_id uuid)
returns jsonb
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.platform_church_diagnostics(p_church_id);
$$;

create or replace function public.support_session_active_for_church(p_church_id uuid)
returns boolean
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.support_session_active_for_church(p_church_id);
$$;

revoke all on function public.platform_church_diagnostics(uuid) from public, anon;
revoke all on function public.support_session_active_for_church(uuid) from public, anon;
grant execute on function public.platform_church_diagnostics(uuid) to authenticated;
grant execute on function public.support_session_active_for_church(uuid) to authenticated;
