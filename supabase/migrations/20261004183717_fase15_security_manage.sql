-- Fase 15 · PR B (ajuste final): bloquear y desbloquear por seguridad con su propia capacidad.
--
-- Antes, platform_set_security_block se comprobaba con platform.support.manage. Eso
-- mezclaba soporte y seguridad. Ahora:
--   platform.church_security.read   lee el motivo interno (ya existía).
--   platform.church_security.manage bloquea y desbloquea. Deny-by-default: no se
--                                   concede a nadie en esta migración.
-- Leer no concede gestionar, y gestionar no concede leer. Cada acción exige motivo y
-- queda en platform_audit_logs con el operador (actor) y el momento. El desbloqueo
-- no toca subscriptions.
-- La auditoría no guarda el motivo interno anterior: solo si existía.

insert into platform_capabilities (key, description) values
  ('platform.church_security.manage',
   'Bloquear y desbloquear una iglesia por seguridad. Exige motivo y queda auditado. No concede lectura del motivo.')
on conflict (key) do nothing;

create or replace function app.platform_set_security_block(p_church_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_anterior text;
begin
  perform app.assert_platform_capability('platform.church_security.manage');

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Bloquear por seguridad exige un motivo.' using errcode = '22023';
  end if;

  select security_block_reason into v_anterior from churches where id = p_church_id for update;
  if not found then
    raise exception 'La iglesia no existe.' using errcode = 'P0002';
  end if;

  update churches
  set security_block_reason = btrim(p_reason),
      security_blocked_at = now(),
      security_blocked_by = auth.uid(),
      updated_at = now()
  where id = p_church_id;

  perform app.write_platform_audit('church.security_blocked', p_church_id,
    jsonb_build_object('reason', btrim(p_reason), 'had_previous_block', v_anterior is not null));
end;
$$;

create or replace function app.platform_clear_security_block(p_church_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_anterior text;
begin
  perform app.assert_platform_capability('platform.church_security.manage');

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Desbloquear por seguridad exige un motivo.' using errcode = '22023';
  end if;

  select security_block_reason into v_anterior from churches where id = p_church_id for update;
  if not found then
    raise exception 'La iglesia no existe.' using errcode = 'P0002';
  end if;

  update churches
  set security_block_reason = null,
      security_blocked_at = null,
      security_blocked_by = null,
      updated_at = now()
  where id = p_church_id;

  perform app.write_platform_audit('church.security_unblocked', p_church_id,
    jsonb_build_object('reason', btrim(p_reason), 'had_previous_block', v_anterior is not null));
end;
$$;

revoke all on function app.platform_set_security_block(uuid, text) from public, anon;
revoke all on function app.platform_clear_security_block(uuid, text) from public, anon;
grant execute on function app.platform_set_security_block(uuid, text) to authenticated, service_role;
grant execute on function app.platform_clear_security_block(uuid, text) to authenticated, service_role;

create or replace function public.platform_set_security_block(p_church_id uuid, p_reason text)
returns void
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.platform_set_security_block(p_church_id, p_reason);
$$;

create or replace function public.platform_clear_security_block(p_church_id uuid, p_reason text)
returns void
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.platform_clear_security_block(p_church_id, p_reason);
$$;

revoke all on function public.platform_set_security_block(uuid, text) from public, anon;
revoke all on function public.platform_clear_security_block(uuid, text) from public, anon;
grant execute on function public.platform_set_security_block(uuid, text) to authenticated;
grant execute on function public.platform_clear_security_block(uuid, text) to authenticated;
