-- Consola de plataforma: consolidación (resumen, listado, alta, invitaciones).
--
-- No crea una arquitectura nueva: amplía las RPC que ya usa /operacion.
-- 1. invitations.invited_name: nombre del propietario invitado (opcional).
-- 2. Alta asistida (con correo administrativo de la iglesia en settings.email): el núcleo (people, serving, events, communications) siempre
--    activo; solo se aceptan además módulos activables (no "próximamente");
--    nombre del propietario; auditoría de plataforma en el punto único de alta.
--    platform_create_church deja de escribir su propia auditoría (sería doble).
-- 3. platform_churches: modo de acceso, prueba, país, propietario y última
--    actividad; filtros por modo, prueba y país; búsqueda por correo solo con
--    platform.owners.manage (los correos se protegen con esa capacidad).
-- 4. platform_console_summary: recuentos por modo de acceso, altas del mes,
--    altas e invitaciones pendientes, sesiones de soporte e incidencias.
-- 5. platform_invitations y platform_resend_invitation: listado transversal y
--    reenvío (revoca la anterior y emite una nueva en la misma transacción).
-- Ninguna lee datos de negocio: solo metadatos del plano de control.

-- 1 ---------------------------------------------------------------------------------
alter table invitations add column invited_name text;
alter table invitations add constraint invitations_invited_name_check
  check (invited_name is null or length(btrim(invited_name)) between 1 and 200);

-- 2 ---------------------------------------------------------------------------------
drop function public.assisted_provision_church(text, text, text, text, text, text, text, text[]);
drop function app.assisted_provision_church(text, text, text, text, text, text, text, text[]);

create function app.assisted_provision_church(
  p_name text,
  p_slug text,
  p_locale text,
  p_timezone text,
  p_currency text,
  p_country text,
  p_owner_email text,
  p_module_keys text[] default array['people', 'serving', 'events', 'communications'],
  p_owner_name text default null,
  p_admin_email text default null
)
returns table (out_church_id uuid, out_invitation_id uuid, out_invitation_token text)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_core text[] := array['people', 'serving', 'events', 'communications'];
  v_activables text[] := array['groups', 'discipleship', 'kids', 'worship', 'giving', 'facilities', 'analytics'];
  v_modules text[];
  v_church_id uuid;
  v_campus_id uuid;
  v_subscription_id uuid;
  v_invitation_id uuid;
  v_token text;
  v_module_key text;
begin
  perform app.assert_platform_capability('platform.churches.create');

  if p_name is null or btrim(p_name) = '' then
    raise exception 'El nombre de la iglesia es obligatorio.' using errcode = '22023';
  end if;

  if p_owner_email is null or btrim(p_owner_email) !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'El correo del propietario no es válido.' using errcode = '22023';
  end if;

  if p_admin_email is not null and btrim(p_admin_email) <> ''
     and btrim(p_admin_email) !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'El correo administrativo no es válido.' using errcode = '22023';
  end if;

  -- Solo núcleo y activables: un módulo «próximamente» (pastoral, integrations)
  -- no tiene ruta funcional y no se puede activar desde el alta.
  foreach v_module_key in array coalesce(p_module_keys, '{}'::text[]) loop
    if not (v_module_key = any (v_core) or v_module_key = any (v_activables)) then
      raise exception 'El módulo «%» no se puede activar en el alta.', v_module_key using errcode = '22023';
    end if;
  end loop;

  -- El núcleo va siempre: sin él, la iglesia no tendría personas ni servicios.
  select array(select distinct m from unnest(v_core || coalesce(p_module_keys, '{}'::text[])) m order by m)
  into v_modules;

  if not (select app.slug_available(p_slug)) then
    raise exception 'SLUG_UNAVAILABLE: el identificador "%" no está disponible', p_slug;
  end if;

  insert into churches (name, slug, status, locale, timezone, currency, settings)
  values (btrim(p_name), p_slug, 'provisioning', p_locale, p_timezone, p_currency,
          jsonb_strip_nulls(jsonb_build_object('country', p_country,
                                               'email', nullif(lower(btrim(coalesce(p_admin_email, ''))), ''))))
  returning id into v_church_id;

  insert into campuses (church_id, name, slug, is_primary, status)
  values (v_church_id, 'Sede principal', 'principal', true, 'active')
  returning id into v_campus_id;

  foreach v_module_key in array v_modules loop
    insert into church_modules (church_id, module_key, status, enabled_at)
    values (v_church_id, v_module_key, 'enabled', now())
    on conflict (church_id, module_key) do nothing;
  end loop;

  insert into subscriptions (church_id, plan_key, status, trial_ends_at)
  values (v_church_id, 'trial', 'trial', now() + interval '30 days')
  returning id into v_subscription_id;

  update churches set subscription_id = v_subscription_id where id = v_church_id;

  insert into church_onboarding (church_id, current_step, completed_steps)
  values (v_church_id, 'church', array['account']::church_onboarding_step[]);

  -- El token se devuelve una sola vez; solo se guarda su huella.
  v_token := encode(gen_random_bytes(32), 'hex');

  insert into invitations (church_id, email, role_key, token_hash, invited_by, expires_at, invited_name)
  values (v_church_id, lower(btrim(p_owner_email)), 'church_owner', encode(digest(v_token, 'sha256'), 'hex'),
          auth.uid(), now() + interval '7 days', nullif(btrim(coalesce(p_owner_name, '')), ''))
  returning id into v_invitation_id;

  perform app.write_audit_log(v_church_id, 'church.created', 'churches', v_church_id,
    jsonb_build_object('name', btrim(p_name), 'slug', p_slug, 'assisted', true));
  perform app.write_audit_log(v_church_id, 'campus.created', 'campuses', v_campus_id,
    jsonb_build_object('name', 'Sede principal', 'is_primary', true));
  perform app.write_audit_log(v_church_id, 'subscription.initialized', 'subscriptions', v_subscription_id,
    jsonb_build_object('plan_key', 'trial', 'status', 'trial'));
  perform app.write_audit_log(v_church_id, 'invitation.created', 'invitations', v_invitation_id,
    jsonb_build_object('role_key', 'church_owner'));

  perform app.write_platform_audit('platform.church_created', v_church_id,
    jsonb_build_object('slug', p_slug, 'modules', v_modules, 'assisted', true,
                       'owner_invitation_id', v_invitation_id));

  return query select v_church_id, v_invitation_id, v_token;
end;
$$;

revoke all on function app.assisted_provision_church(text, text, text, text, text, text, text, text[], text, text) from public, anon;
grant execute on function app.assisted_provision_church(text, text, text, text, text, text, text, text[], text, text) to authenticated, service_role;

create function public.assisted_provision_church(
  p_name text,
  p_slug text,
  p_locale text,
  p_timezone text,
  p_currency text,
  p_country text,
  p_owner_email text,
  p_module_keys text[] default array['people', 'serving', 'events', 'communications'],
  p_owner_name text default null,
  p_admin_email text default null
)
returns table (church_id uuid, invitation_id uuid, invitation_token text)
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select * from app.assisted_provision_church(
    p_name, p_slug, p_locale, p_timezone, p_currency, p_country, p_owner_email, p_module_keys, p_owner_name, p_admin_email
  );
$$;

revoke all on function public.assisted_provision_church(text, text, text, text, text, text, text, text[], text, text) from public, anon;
grant execute on function public.assisted_provision_church(text, text, text, text, text, text, text, text[], text, text) to authenticated;

create or replace function app.platform_create_church(
  p_name text,
  p_slug text,
  p_locale text,
  p_timezone text,
  p_currency text,
  p_country text,
  p_owner_email text,
  p_module_keys text[] default array['people', 'serving', 'events', 'communications']
)
returns table (out_church_id uuid, out_invitation_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_existente uuid;
  v_resultado record;
begin
  perform app.assert_platform_capability('platform.churches.create');

  select id into v_existente from churches where slug = p_slug;
  if v_existente is not null then
    raise exception 'Ya existe una iglesia con la dirección «%»: ábrela en el listado en vez de crearla otra vez.', p_slug
      using errcode = '23505';
  end if;

  -- La auditoría de plataforma la escribe el alta asistida (punto único).
  select * into v_resultado
  from app.assisted_provision_church(
    p_name, p_slug, p_locale, p_timezone, p_currency, p_country, p_owner_email, p_module_keys
  );

  return query select v_resultado.out_church_id, v_resultado.out_invitation_id;
end;
$$;

-- 3 ---------------------------------------------------------------------------------
drop function public.platform_churches(text, text, text, text, timestamptz, boolean, boolean, integer, integer);
drop function app.platform_churches(text, text, text, text, timestamptz, boolean, boolean, integer, integer);

create function app.platform_churches(
  p_search text default null,
  p_status text default null,
  p_plan text default null,
  p_module text default null,
  p_created_from timestamptz default null,
  p_onboarding_pendiente boolean default null,
  p_sin_propietario boolean default null,
  p_limit integer default 25,
  p_offset integer default 0,
  p_access_mode text default null,
  p_trial text default null,
  p_country text default null
)
returns table (
  id uuid,
  name text,
  slug text,
  status text,
  created_at timestamptz,
  archived_at timestamptz,
  plan_key text,
  subscription_status text,
  onboarding_completed boolean,
  modules_enabled integer,
  campuses_count integer,
  people_count integer,
  has_owner boolean,
  total_count integer,
  access_mode text,
  trial_ends_at timestamptz,
  country text,
  owner_name text,
  owner_invitation_pending boolean,
  last_activity_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  -- Buscar por correo revela si un correo administra una iglesia: solo con la
  -- capacidad que protege los correos de responsables.
  v_por_correo boolean := app.has_platform_capability('platform.owners.manage');
begin
  perform app.assert_platform_capability('platform.churches.read');

  return query
  with base as (
    select c.*, s.plan_key as s_plan, s.status as s_status, s.trial_ends_at as s_trial_ends,
           app.church_access_mode(c.id) as modo
    from churches c
    left join subscriptions s on s.id = c.subscription_id
  ),
  filtradas as (
    select b.*
    from base b
    where (v_search is null
           or b.name ilike '%' || v_search || '%'
           or b.slug ilike '%' || v_search || '%'
           or (v_por_correo and (
                 b.settings ->> 'email' ilike '%' || v_search || '%'
                 or exists (select 1 from invitations i
                            where i.church_id = b.id and i.email ilike '%' || v_search || '%'))))
      and (p_status is null or b.status::text = p_status)
      and (p_plan is null or b.s_plan = p_plan)
      and (p_created_from is null or b.created_at >= p_created_from)
      and (p_access_mode is null or b.modo = p_access_mode)
      and (p_country is null or b.settings ->> 'country' ilike p_country)
      and (p_trial is null
           or (p_trial = 'vigente' and b.s_status = 'trial' and b.modo = 'full')
           or (p_trial = 'vencida' and b.modo = 'trial_expired'))
      and (p_module is null or exists (
            select 1 from church_modules m
            where m.church_id = b.id and m.module_key = p_module and m.status = 'enabled'))
      and (p_onboarding_pendiente is not true or not exists (
            select 1 from church_onboarding o where o.church_id = b.id and o.completed_at is not null))
      and (p_sin_propietario is not true or not exists (
            select 1 from church_people_roles r where r.church_id = b.id and r.role_key = 'church_owner'))
  )
  select
    f.id, f.name, f.slug, f.status::text, f.created_at, f.archived_at,
    f.s_plan, f.s_status::text,
    (o.completed_at is not null),
    (select count(*)::int from church_modules m where m.church_id = f.id and m.status = 'enabled'),
    (select count(*)::int from campuses ca where ca.church_id = f.id and ca.archived_at is null),
    -- Cuántas personas, nunca quiénes.
    (select count(*)::int from church_people cp where cp.church_id = f.id and cp.archived_at is null),
    exists (select 1 from church_people_roles r where r.church_id = f.id and r.role_key = 'church_owner'),
    (select count(*)::int from filtradas),
    f.modo,
    f.s_trial_ends,
    f.settings ->> 'country',
    (select btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))
     from church_people_roles r
     join church_people cp on cp.id = r.church_people_id
     join people p on p.id = cp.person_id
     where r.church_id = f.id and r.role_key = 'church_owner' and cp.archived_at is null
     order by r.created_at limit 1),
    exists (select 1 from invitations i
            where i.church_id = f.id and i.role_key = 'church_owner' and i.status = 'pending'
              and (i.expires_at is null or i.expires_at > now())),
    -- Última actividad: fecha del último registro de auditoría, sin su contenido.
    (select max(a.created_at) from audit_logs a where a.church_id = f.id)
  from filtradas f
  left join church_onboarding o on o.church_id = f.id
  order by f.created_at desc
  limit v_limit
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function app.platform_churches(text, text, text, text, timestamptz, boolean, boolean, integer, integer, text, text, text) from public, anon;
grant execute on function app.platform_churches(text, text, text, text, timestamptz, boolean, boolean, integer, integer, text, text, text) to authenticated;

create function public.platform_churches(
  p_search text default null,
  p_status text default null,
  p_plan text default null,
  p_module text default null,
  p_created_from timestamptz default null,
  p_onboarding_pendiente boolean default null,
  p_sin_propietario boolean default null,
  p_limit integer default 25,
  p_offset integer default 0,
  p_access_mode text default null,
  p_trial text default null,
  p_country text default null
)
returns table (
  id uuid, name text, slug text, status text, created_at timestamptz, archived_at timestamptz,
  plan_key text, subscription_status text, onboarding_completed boolean, modules_enabled integer,
  campuses_count integer, people_count integer, has_owner boolean, total_count integer,
  access_mode text, trial_ends_at timestamptz, country text, owner_name text,
  owner_invitation_pending boolean, last_activity_at timestamptz
)
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select * from app.platform_churches(p_search, p_status, p_plan, p_module, p_created_from,
    p_onboarding_pendiente, p_sin_propietario, p_limit, p_offset, p_access_mode, p_trial, p_country);
$$;

revoke all on function public.platform_churches(text, text, text, text, timestamptz, boolean, boolean, integer, integer, text, text, text) from public, anon;
grant execute on function public.platform_churches(text, text, text, text, timestamptz, boolean, boolean, integer, integer, text, text, text) to authenticated;

-- 4 ---------------------------------------------------------------------------------
create function app.platform_console_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_modos jsonb;
begin
  perform app.assert_platform_capability('platform.churches.read');

  select coalesce(jsonb_object_agg(modo, n), '{}'::jsonb) into v_modos
  from (
    select app.church_access_mode(c.id) as modo, count(*)::int as n
    from churches c group by 1
  ) x;

  return jsonb_build_object(
    'por_modo', v_modos,
    'en_prueba', (select count(*)::int from churches c join subscriptions s on s.church_id = c.id
                  where s.status = 'trial' and app.church_access_mode(c.id) = 'full'),
    'altas_mes', (select count(*)::int from churches where created_at >= date_trunc('month', now())),
    'altas_pendientes', (select count(*)::int from churches c
                         left join church_onboarding o on o.church_id = c.id
                         where c.archived_at is null and (o.id is null or o.completed_at is null)),
    'invitaciones_pendientes', (select count(*)::int from invitations
                                where status = 'pending' and (expires_at is null or expires_at > now())),
    'invitaciones_caducadas', (select count(*)::int from invitations
                               where status = 'pending' and expires_at is not null and expires_at <= now()),
    'sin_propietario', (select count(*)::int from churches c
                        where c.archived_at is null
                          and not exists (select 1 from church_people_roles r
                                          where r.church_id = c.id and r.role_key = 'church_owner')
                          and not exists (select 1 from invitations i
                                          where i.church_id = c.id and i.role_key = 'church_owner' and i.status = 'pending')),
    'sesiones_soporte_activas', (select count(*)::int from support_sessions
                                 where revoked_at is null and expires_at > now()),
    -- Incidencias operativas: recuentos, sin contenido.
    'entregas_fallidas_7d', (select count(*)::int from notification_deliveries
                             where status = 'failed' and updated_at > now() - interval '7 days'),
    'exportaciones_fallidas_7d', (select count(*)::int from export_jobs
                                  where status::text = 'failed' and created_at > now() - interval '7 days')
  );
end;
$$;

revoke all on function app.platform_console_summary() from public, anon;
grant execute on function app.platform_console_summary() to authenticated;

create function public.platform_console_summary()
returns jsonb language sql security invoker set search_path = pg_catalog, public
as $$ select app.platform_console_summary(); $$;

revoke all on function public.platform_console_summary() from public, anon;
grant execute on function public.platform_console_summary() to authenticated;

-- 5 ---------------------------------------------------------------------------------
create function app.platform_invitations(p_estado text default 'pendientes', p_limit integer default 100)
returns table (
  id uuid,
  church_id uuid,
  church_name text,
  email text,
  invited_name text,
  role_key text,
  status text,
  expires_at timestamptz,
  created_at timestamptz,
  caducada boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  -- Muestra correos: la misma capacidad que protege los correos de responsables.
  perform app.assert_platform_capability('platform.owners.manage');

  return query
  select i.id, i.church_id, c.name, i.email, i.invited_name, i.role_key, i.status::text,
         i.expires_at, i.created_at,
         (i.status = 'pending' and i.expires_at is not null and i.expires_at <= now())
  from invitations i
  join churches c on c.id = i.church_id
  where i.role_key in ('church_owner', 'church_admin')
    and (coalesce(p_estado, 'pendientes') = 'todas'
         or (p_estado = 'pendientes' and i.status = 'pending')
         or (p_estado = 'caducadas' and i.status = 'pending' and i.expires_at is not null and i.expires_at <= now()))
  order by i.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

-- Reenviar: no se puede recuperar el enlace anterior (solo se guarda su huella),
-- así que se revoca y se emite otro para el mismo correo y rol. Una transacción.
create function app.platform_resend_invitation(p_invitation_id uuid)
returns table (out_invitation_id uuid, out_token text)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_inv invitations%rowtype;
  v_token text;
  v_new uuid;
begin
  perform app.assert_platform_capability('platform.owners.manage');

  select * into v_inv from invitations where id = p_invitation_id for update;
  if not found then
    raise exception 'La invitación no existe.' using errcode = 'P0002';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'Solo se puede reenviar una invitación pendiente.' using errcode = '22023';
  end if;

  update invitations set status = 'revoked', revoked_at = now() where id = v_inv.id;

  v_token := encode(gen_random_bytes(32), 'hex');
  insert into invitations (church_id, email, role_key, token_hash, invited_by, expires_at, invited_name)
  values (v_inv.church_id, v_inv.email, v_inv.role_key, encode(digest(v_token, 'sha256'), 'hex'),
          auth.uid(), now() + interval '7 days', v_inv.invited_name)
  returning id into v_new;

  perform app.write_platform_audit('platform.invitation_resent', v_inv.church_id,
    jsonb_build_object('previous_invitation_id', v_inv.id, 'invitation_id', v_new, 'role_key', v_inv.role_key));

  return query select v_new, v_token;
end;
$$;

revoke all on function app.platform_invitations(text, integer) from public, anon;
revoke all on function app.platform_resend_invitation(uuid) from public, anon;
grant execute on function app.platform_invitations(text, integer) to authenticated;
grant execute on function app.platform_resend_invitation(uuid) to authenticated;

create function public.platform_invitations(p_estado text default 'pendientes', p_limit integer default 100)
returns table (
  id uuid, church_id uuid, church_name text, email text, invited_name text, role_key text,
  status text, expires_at timestamptz, created_at timestamptz, caducada boolean
)
language sql security invoker set search_path = pg_catalog, public
as $$ select * from app.platform_invitations(p_estado, p_limit); $$;

create function public.platform_resend_invitation(p_invitation_id uuid)
returns table (out_invitation_id uuid, out_token text)
language sql security invoker set search_path = pg_catalog, public
as $$ select * from app.platform_resend_invitation(p_invitation_id); $$;

revoke all on function public.platform_invitations(text, integer) from public, anon;
revoke all on function public.platform_resend_invitation(uuid) from public, anon;
grant execute on function public.platform_invitations(text, integer) to authenticated;
grant execute on function public.platform_resend_invitation(uuid) to authenticated;

-- 6. Ficha: modo de acceso, país, fechas de prueba y gracia, bloqueo sin motivo ----------
CREATE OR REPLACE FUNCTION app.platform_church_detail(p_church_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_church churches%rowtype;
  v_resultado jsonb;
begin
  perform app.assert_platform_capability('platform.churches.read');

  select * into v_church from churches where id = p_church_id;
  if not found then
    raise exception 'La iglesia no existe.' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'id', v_church.id,
    'name', v_church.name,
    'slug', v_church.slug,
    'status', v_church.status,
    'locale', v_church.locale,
    'timezone', v_church.timezone,
    'currency', v_church.currency,
    'created_at', v_church.created_at,
    'archived_at', v_church.archived_at,
    'country', v_church.settings ->> 'country',
    'access_mode', app.church_access_mode(v_church.id),
    -- Bloqueo de seguridad: si existe y cuándo. El motivo y quién lo fijó solo
    -- con platform.church_security.read, por app.church_service_state.
    'security_blocked', v_church.security_block_reason is not null,
    'security_blocked_at', v_church.security_blocked_at,

    'onboarding', (
      select jsonb_build_object(
        'current_step', o.current_step,
        'completed_steps', o.completed_steps,
        'started_at', o.started_at,
        'completed_at', o.completed_at
      )
      from church_onboarding o where o.church_id = p_church_id
    ),

    'subscription', (
      select jsonb_build_object(
        'plan_key', s.plan_key,
        'status', s.status,
        'trial_started_at', s.trial_started_at,
        'trial_ends_at', s.trial_ends_at,
        'past_due_since', s.past_due_since,
        'grace_ends_at', case when s.past_due_since is not null then s.past_due_since + interval '15 days' end,
        'cancelled_at', s.cancelled_at,
        'started_at', s.started_at,
        'renews_at', s.renews_at,
        'cancel_at', s.cancel_at
      )
      from subscriptions s where s.id = v_church.subscription_id
    ),

    -- Responsables: nombre y rol, porque sin eso no se puede gestionar quién
    -- manda en una iglesia. El correo NO viaja aquí: se sirve aparte, con su
    -- propia capacidad, en app.platform_church_contacts.
    'responsables', coalesce((
      select jsonb_agg(jsonb_build_object(
        'person_id', p.id,
        'name', btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')),
        'role_key', r.role_key,
        'has_account', (p.user_id is not null)
      ) order by r.role_key)
      from church_people_roles r
      join church_people cp on cp.id = r.church_people_id
      join people p on p.id = cp.person_id
      where r.church_id = p_church_id
        and r.role_key in ('church_owner', 'church_admin')
        and cp.archived_at is null
    ), '[]'::jsonb),

    'invitaciones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'role_key', i.role_key,
        'invited_name', i.invited_name,
        'accepted_at', i.accepted_at,
        'status', i.status,
        'expires_at', i.expires_at,
        'created_at', i.created_at,
        'caducada', (i.status = 'pending' and i.expires_at is not null and i.expires_at <= now())
      ) order by i.created_at desc)
      from invitations i where i.church_id = p_church_id
    ), '[]'::jsonb),

    'sedes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ca.id, 'name', ca.name, 'archived_at', ca.archived_at
      ) order by ca.name)
      from campuses ca where ca.church_id = p_church_id
    ), '[]'::jsonb),

    'modulos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'module_key', m.key,
        'name', m.name,
        'status', coalesce(cm.status::text, 'disabled'),
        'enabled_at', cm.enabled_at
      ) order by m.sort_order, m.key)
      from modules m
      left join church_modules cm on cm.module_key = m.key and cm.church_id = p_church_id
    ), '[]'::jsonb),

    'historial', coalesce((
      select jsonb_agg(jsonb_build_object(
        'action', a.action,
        'created_at', a.created_at,
        'metadata', a.metadata
      ) order by a.created_at desc)
      from (
        select * from platform_audit_logs
        where church_id = p_church_id
        order by created_at desc
        limit 50
      ) a
    ), '[]'::jsonb)
  ) into v_resultado;

  return v_resultado;
end;
$function$;
