-- CA-2.4 · La invitación del panel tiene que poder entregarse.
--
-- `app.platform_invite_admin` genera un token, guarda solo su huella y
-- devuelve el id de la invitación. El token se descarta.
--
-- Con el correo desactivado, eso deja la invitación en un callejón sin salida:
-- existe, consta como pendiente, caduca a los 14 días, y **nadie puede
-- entregarle el enlace a la persona invitada**, porque el enlace no está en
-- ninguna parte. La pantalla diría «invitación creada» y no llegaría nunca.
--
-- Es el mismo patrón que el alta asistida ya resolvió: devolver el token una
-- sola vez, en el resultado de la llamada, sin persistirlo.
--
-- Lo que NO cambia, y conviene decir por qué:
--
--   * `invited_by` sigue nulo. Es tentador poner ahí al operador para tener
--     trazabilidad, pero ese campo lo usa la aceptación de OTRO flujo
--     —app.accept_person_invitation— para decidir si quien invitó podía
--     conceder ese rol. Un operador de plataforma no es miembro de la iglesia,
--     así que rellenarlo podría degradar el rol concedido. La trazabilidad de
--     quién invitó ya está en platform_audit_logs, que es su sitio.
--   * La deduplicación se conserva: si ya hay una invitación viva para ese
--     correo y papel, se devuelve esa. Lo nuevo es que en ese caso el token no
--     se puede recuperar —solo se guardó su huella— y la función lo dice en
--     vez de devolver un hueco silencioso.

drop function if exists public.platform_invite_admin(uuid, text, text);
drop function if exists app.platform_invite_admin(uuid, text, text);

create or replace function app.platform_invite_admin(
  p_church_id uuid,
  p_email text,
  p_role_key text default 'church_admin'
)
returns table (
  out_invitation_id uuid,
  -- Nulo cuando se reutiliza una invitación que ya existía: su enlace no se
  -- puede recuperar, y devolver algo ahí sería inventarlo.
  out_token text,
  out_reutilizada boolean
)
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
  -- enlaces distintos, que es la forma más rápida de que use el equivocado.
  select id into v_id
  from invitations
  where church_id = p_church_id
    and lower(email) = v_email
    and role_key = p_role_key
    and status = 'pending'
    and (expires_at is null or expires_at > now());

  if v_id is not null then
    return query select v_id, null::text, true;
    return;
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

  return query select v_id, v_token, false;
end;
$$;

comment on function app.platform_invite_admin(uuid, text, text) is
  'Invita a un responsable desde el panel y DEVUELVE el enlace una sola vez. Antes solo devolvía el id y el token se descartaba: con el correo desactivado, la invitación no podía llegarle a nadie.';

revoke all on function app.platform_invite_admin(uuid, text, text) from public, anon, authenticated;
grant execute on function app.platform_invite_admin(uuid, text, text) to authenticated;

create or replace function public.platform_invite_admin(
  p_church_id uuid, p_email text, p_role_key text default 'church_admin'
)
returns table (out_invitation_id uuid, out_token text, out_reutilizada boolean)
language sql security invoker set search_path = pg_catalog, public
as $$ select * from app.platform_invite_admin(p_church_id, p_email, p_role_key); $$;

revoke all on function public.platform_invite_admin(uuid, text, text) from public, anon;
grant execute on function public.platform_invite_admin(uuid, text, text) to authenticated;
