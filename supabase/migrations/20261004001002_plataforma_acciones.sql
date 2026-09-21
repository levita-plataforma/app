-- Fase 14 · Acciones del panel de operación.
--
-- Tres cosas que el equipo de LEVITA necesita hacer sobre una iglesia ajena:
-- encender y apagar módulos, gestionar sus responsables y reanudar un alta que
-- se quedó a medias. Cada una con su capacidad, su comprobación en base y su
-- registro.
--
-- Lo que NO hay aquí, a propósito:
--
--   * Transferencia de propiedad. El encargo pide una regla aprobada antes de
--     implementarla —validación del nuevo propietario, protección frente a
--     dejar la iglesia sin responsable, trazabilidad— y esa regla no existe
--     todavía. La propuesta está en docs/FASE-14-ADMINISTRACION-PLATAFORMA.md;
--     hasta que se apruebe, cambiar de propietario se hace invitando al nuevo y
--     retirando al anterior, que son dos operaciones que sí existen y dejan
--     rastro.
--   * Nada comercial: ni precios, ni cobros, ni suspensiones. La suscripción se
--     consulta y no se toca.
--   * Impersonación. No se añade en esta fase.

-- 1. Módulos --------------------------------------------------------------------
--
-- Habilitar un módulo NO concede roles ni permisos a nadie: solo dice que esa
-- iglesia puede usar esa parte del producto. Quién puede hacer qué dentro sigue
-- decidiéndolo la iglesia con sus propios roles.
--
-- Deshabilitar tampoco borra nada. Los datos quedan donde están y vuelven a
-- verse si se reactiva: apagar un módulo es cerrar una puerta, no vaciar la
-- habitación.

create or replace function app.platform_set_module(
  p_church_id uuid,
  p_module_key text,
  p_enabled boolean,
  p_motivo text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_anterior text;
begin
  perform app.assert_platform_capability('platform.modules.manage');

  if not exists (select 1 from churches where id = p_church_id) then
    raise exception 'La iglesia no existe.' using errcode = 'P0002';
  end if;

  if not exists (select 1 from modules where key = p_module_key) then
    raise exception 'Ese módulo no existe.' using errcode = 'P0002';
  end if;

  select status::text into v_anterior
  from church_modules where church_id = p_church_id and module_key = p_module_key;

  insert into church_modules (church_id, module_key, status, enabled_at, disabled_at)
  values (
    p_church_id, p_module_key,
    case when p_enabled then 'enabled' else 'disabled' end::church_module_status,
    case when p_enabled then now() end,
    case when not p_enabled then now() end
  )
  on conflict (church_id, module_key) do update set
    status = excluded.status,
    enabled_at = case when p_enabled then coalesce(church_modules.enabled_at, now()) else church_modules.enabled_at end,
    disabled_at = case when p_enabled then null else now() end,
    updated_at = now();

  perform app.write_platform_audit(
    case when p_enabled then 'platform.module_enabled' else 'platform.module_disabled' end,
    p_church_id,
    jsonb_build_object('module_key', p_module_key, 'anterior', v_anterior, 'motivo', p_motivo)
  );
end;
$$;

revoke all on function app.platform_set_module(uuid, text, boolean, text) from public, anon;
grant execute on function app.platform_set_module(uuid, text, boolean, text) to authenticated;

-- 2. Responsables e invitaciones ---------------------------------------------------

create or replace function app.platform_invite_admin(
  p_church_id uuid,
  p_email text,
  p_role_key text default 'church_admin'
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_token text;
  v_id uuid;
begin
  perform app.assert_platform_capability('platform.owners.manage');

  if not exists (select 1 from churches where id = p_church_id) then
    raise exception 'La iglesia no existe.' using errcode = 'P0002';
  end if;

  if v_email = '' or position('@' in v_email) = 0 then
    raise exception 'Indica un correo válido.' using errcode = '22023';
  end if;

  if p_role_key not in ('church_owner', 'church_admin') then
    raise exception 'Desde el panel solo se invita como propietario o administrador.' using errcode = '22023';
  end if;

  -- Una invitación viva para el mismo correo y papel no se duplica: se devuelve
  -- la que hay. Pulsar dos veces no deja a alguien con dos invitaciones y dos
  -- correos distintos, que es la forma más rápida de que use el equivocado.
  select id into v_id
  from invitations
  where church_id = p_church_id
    and lower(email) = v_email
    and role_key = p_role_key
    and status = 'pending'
    and (expires_at is null or expires_at > now());

  if v_id is not null then
    return v_id;
  end if;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  insert into invitations (church_id, email, role_key, token_hash, status, invited_by, expires_at)
  values (
    p_church_id, v_email, p_role_key,
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    'pending', null, now() + interval '14 days'
  )
  returning id into v_id;

  perform app.write_platform_audit('platform.admin_invited', p_church_id,
    jsonb_build_object('role_key', p_role_key, 'invitation_id', v_id));

  return v_id;
end;
$$;

comment on function app.platform_invite_admin(uuid, text, text) is
  'Invita a alguien como propietario o administrador de una iglesia. Devuelve el id de la invitación, nunca el token: el token viaja por su canal y no se enseña en el panel.';

revoke all on function app.platform_invite_admin(uuid, text, text) from public, anon;
grant execute on function app.platform_invite_admin(uuid, text, text) to authenticated;

create or replace function app.platform_revoke_invitation(p_invitation_id uuid, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_church uuid;
  v_status text;
begin
  perform app.assert_platform_capability('platform.owners.manage');

  select church_id, status::text into v_church, v_status
  from invitations where id = p_invitation_id;

  if v_church is null then
    raise exception 'La invitación no existe.' using errcode = 'P0002';
  end if;

  if v_status <> 'pending' then
    raise exception 'Esa invitación ya está %.', v_status using errcode = '22023';
  end if;

  update invitations
  set status = 'revoked', revoked_at = now()
  where id = p_invitation_id;

  perform app.write_platform_audit('platform.invitation_revoked', v_church,
    jsonb_build_object('invitation_id', p_invitation_id, 'motivo', p_motivo));
end;
$$;

revoke all on function app.platform_revoke_invitation(uuid, text) from public, anon;
grant execute on function app.platform_revoke_invitation(uuid, text) to authenticated;

create or replace function app.platform_remove_admin(p_church_id uuid, p_person_id uuid, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_role text;
  v_propietarios integer;
begin
  perform app.assert_platform_capability('platform.owners.manage');

  select r.role_key into v_role
  from church_people_roles r
  join church_people cp on cp.id = r.church_people_id
  where r.church_id = p_church_id and cp.person_id = p_person_id
    and r.role_key in ('church_owner', 'church_admin')
  limit 1;

  if v_role is null then
    raise exception 'Esa persona no es responsable de esta iglesia.' using errcode = 'P0002';
  end if;

  -- Dejar una iglesia sin propietario la deja bloqueada: nadie podría invitar a
  -- nadie ni cambiar su configuración. Se impide aquí, no en la interfaz.
  if v_role = 'church_owner' then
    select count(*) into v_propietarios
    from church_people_roles r
    join church_people cp on cp.id = r.church_people_id
    where r.church_id = p_church_id and r.role_key = 'church_owner' and cp.archived_at is null;

    if v_propietarios <= 1 then
      raise exception 'Es el único propietario: invita antes a otro y espera a que acepte.'
        using errcode = '22023';
    end if;
  end if;

  delete from church_people_roles r
  using church_people cp
  where cp.id = r.church_people_id
    and r.church_id = p_church_id
    and cp.person_id = p_person_id
    and r.role_key = v_role;

  perform app.write_platform_audit('platform.admin_removed', p_church_id,
    jsonb_build_object('person_id', p_person_id, 'role_key', v_role, 'motivo', p_motivo));
end;
$$;

revoke all on function app.platform_remove_admin(uuid, uuid, text) from public, anon;
grant execute on function app.platform_remove_admin(uuid, uuid, text) to authenticated;

-- 3. Altas --------------------------------------------------------------------------
--
-- El alta en sí ya existe (app.assisted_provision_church, Fase 1). Aquí solo se
-- le pone delante la capacidad nueva y el registro, sin reescribir su lógica.
--
-- La idempotencia importa: pulsar dos veces «crear» no puede dar dos iglesias.
-- El slug es único en `churches`, así que el segundo intento choca; lo que hace
-- esta función es convertir ese choque en un mensaje claro en vez de un error
-- de restricción.

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

  select * into v_resultado
  from app.assisted_provision_church(
    p_name, p_slug, p_locale, p_timezone, p_currency, p_country, p_owner_email, p_module_keys
  );

  perform app.write_platform_audit('platform.church_created', v_resultado.out_church_id,
    jsonb_build_object('slug', p_slug, 'modules', p_module_keys));

  -- El token de invitación NO sale de aquí: lo genera el alta asistida y lo
  -- entrega por su canal. Enseñarlo en el panel lo convertiría en algo que
  -- cualquiera con acceso a la pantalla podría usar para entrar como dueño.
  return query select v_resultado.out_church_id, v_resultado.out_invitation_id;
end;
$$;

revoke all on function app.platform_create_church(text, text, text, text, text, text, text, text[]) from public, anon;
grant execute on function app.platform_create_church(text, text, text, text, text, text, text, text[]) to authenticated;

-- 4. Envoltorios públicos -------------------------------------------------------------

create or replace function public.platform_set_module(p_church_id uuid, p_module_key text, p_enabled boolean, p_motivo text default null)
returns void language sql security invoker set search_path = pg_catalog, public
as $$ select app.platform_set_module(p_church_id, p_module_key, p_enabled, p_motivo); $$;

create or replace function public.platform_invite_admin(p_church_id uuid, p_email text, p_role_key text default 'church_admin')
returns uuid language sql security invoker set search_path = pg_catalog, public
as $$ select app.platform_invite_admin(p_church_id, p_email, p_role_key); $$;

create or replace function public.platform_revoke_invitation(p_invitation_id uuid, p_motivo text default null)
returns void language sql security invoker set search_path = pg_catalog, public
as $$ select app.platform_revoke_invitation(p_invitation_id, p_motivo); $$;

create or replace function public.platform_remove_admin(p_church_id uuid, p_person_id uuid, p_motivo text default null)
returns void language sql security invoker set search_path = pg_catalog, public
as $$ select app.platform_remove_admin(p_church_id, p_person_id, p_motivo); $$;

create or replace function public.platform_create_church(
  p_name text, p_slug text, p_locale text, p_timezone text, p_currency text,
  p_country text, p_owner_email text,
  p_module_keys text[] default array['people', 'serving', 'events', 'communications']
)
returns table (out_church_id uuid, out_invitation_id uuid)
language sql security invoker set search_path = pg_catalog, public
as $$ select * from app.platform_create_church(p_name, p_slug, p_locale, p_timezone, p_currency, p_country, p_owner_email, p_module_keys); $$;

do $grants$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
    where p.proname in ('platform_set_module', 'platform_invite_admin', 'platform_revoke_invitation',
                        'platform_remove_admin', 'platform_create_church')
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end;
$grants$;
