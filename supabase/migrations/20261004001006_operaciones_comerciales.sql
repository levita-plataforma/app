-- Fase 15 · Operaciones comerciales: cambiar de plan, excepciones y cancelar.
--
-- Todas comparten tres reglas:
--
--   1. Se puede preguntar qué pasaría ANTES de hacerlo. Una operación que mueve
--      dinero o corta el servicio no debería descubrirse al confirmarla.
--   2. Comprueban la capacidad en la base, no en la interfaz.
--   3. Dejan rastro en dos sitios con propósitos distintos: auditoría (quién
--      hizo qué) e historial comercial (qué condiciones rigieron y desde cuándo).
--
-- Lo que NO deciden: cuándo aplica un cambio de plan, si hay prorrateo, cuántos
-- días de gracia hay tras un impago. Eso son políticas de Carlos. La función
-- acepta el momento como parámetro explícito en vez de suponerlo.

-- 1. Qué pasaría si cambio el plan ------------------------------------------------

create or replace function app.preview_plan_change(
  p_church_id uuid,
  p_plan_version_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actual record;
  v_nueva record;
  v_perdidas jsonb;
  v_uso jsonb;
begin
  perform app.assert_platform_capability('platform.commercial.read');

  select s.plan_version_id, s.status, s.current_period_end, pv.plan_key, pv.version, pv.price_cents, pv.currency
  into v_actual
  from subscriptions s
  left join plan_versions pv on pv.id = s.plan_version_id
  where s.church_id = p_church_id;

  if not found then
    raise exception 'Esta iglesia no tiene suscripción.' using errcode = 'P0002';
  end if;

  select pv.plan_key, pv.version, pv.price_cents, pv.currency, pv.billing_period
  into v_nueva
  from plan_versions pv where pv.id = p_plan_version_id;

  if not found then
    raise exception 'Esa versión de plan no existe.' using errcode = 'P0002';
  end if;

  -- Lo que importa de verdad: qué deja de estar incluido. Un cambio de plan que
  -- recorta límites es el que puede romper algo, y es el que hay que ver antes.
  select coalesce(jsonb_agg(jsonb_build_object(
           'capability', d.capability,
           'limit_ahora', d.limit_ahora,
           'limit_despues', d.limit_despues
         ) order by d.capability), '[]'::jsonb)
  into v_perdidas
  from (
    select e.capability,
           e.limit_value as limit_ahora,
           nueva.limit_value as limit_despues
    from app.church_entitlements(p_church_id) e
    left join plan_version_entitlements nueva
      on nueva.plan_version_id = p_plan_version_id and nueva.capability = e.capability
    where nueva.plan_version_id is null
       or (nueva.limit_value is not null
           and (e.limit_value is null or nueva.limit_value < e.limit_value))
  ) d;

  -- Consumo real frente a los límites nuevos, para las dos magnitudes que la
  -- base puede contar hoy sin inventarse nada.
  select jsonb_build_object(
    'personas_activas', (select count(*)::int from church_people where church_id = p_church_id and archived_at is null),
    'sedes', (select count(*)::int from campuses where church_id = p_church_id and archived_at is null)
  ) into v_uso;

  return jsonb_build_object(
    'actual', jsonb_build_object(
      'plan_key', v_actual.plan_key, 'version', v_actual.version,
      'price_cents', v_actual.price_cents, 'currency', v_actual.currency,
      'status', v_actual.status, 'current_period_end', v_actual.current_period_end
    ),
    'nueva', jsonb_build_object(
      'plan_key', v_nueva.plan_key, 'version', v_nueva.version,
      'price_cents', v_nueva.price_cents, 'currency', v_nueva.currency,
      'billing_period', v_nueva.billing_period
    ),
    'pierde', v_perdidas,
    'uso_actual', v_uso,
    -- Lo que esta función NO sabe, dicho en el propio resultado para que la
    -- interfaz no se lo invente: qué se cobra al cambiar.
    'prorrateo', 'sin_politica_acordada',
    'cobro', case when v_nueva.price_cents is null then 'sin_precio_definido' else 'sin_proveedor_configurado' end
  );
end;
$$;

comment on function app.preview_plan_change(uuid, uuid) is
  'Qué cambiaría si se aplicase ese plan: precio, derechos que se pierden y consumo actual frente a los límites nuevos. No cambia nada. Declara explícitamente lo que no sabe (prorrateo, cobro) en vez de dejar que la interfaz lo suponga.';

revoke all on function app.preview_plan_change(uuid, uuid) from public, anon, authenticated;
grant execute on function app.preview_plan_change(uuid, uuid) to authenticated;

-- 2. Cambiar de plan ---------------------------------------------------------------

create or replace function app.platform_change_plan(
  p_church_id uuid,
  p_plan_version_id uuid,
  p_reason text,
  -- Cuándo. Nulo = ahora. Se pide explícito porque «al final del periodo» y
  -- «ahora mismo» tienen consecuencias distintas y ninguna es el valor obvio.
  p_effective_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_sub record;
  v_programado boolean;
begin
  perform app.assert_platform_capability('platform.commercial.manage');

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Hace falta un motivo para cambiar el plan.' using errcode = '22023';
  end if;

  select * into v_sub from subscriptions where church_id = p_church_id for update;
  if not found then
    raise exception 'Esta iglesia no tiene suscripción.' using errcode = 'P0002';
  end if;

  if not exists (select 1 from plan_versions where id = p_plan_version_id) then
    raise exception 'Esa versión de plan no existe.' using errcode = 'P0002';
  end if;

  if v_sub.plan_version_id is not distinct from p_plan_version_id then
    raise exception 'La iglesia ya está en esa versión de plan.' using errcode = '22023';
  end if;

  v_programado := p_effective_at is not null and p_effective_at > now();

  if v_programado then
    update subscriptions
    set scheduled_plan_version_id = p_plan_version_id,
        scheduled_change_at = p_effective_at,
        updated_at = now()
    where church_id = p_church_id;
  else
    update subscriptions
    set plan_version_id = p_plan_version_id,
        plan_key = (select plan_key from plan_versions where id = p_plan_version_id),
        scheduled_plan_version_id = null,
        scheduled_change_at = null,
        updated_at = now()
    where church_id = p_church_id;
  end if;

  insert into subscription_history (church_id, event, from_plan_version_id, to_plan_version_id, reason, actor_user_id, metadata)
  values (
    p_church_id,
    case when v_programado then 'plan.change_scheduled' else 'plan.changed' end,
    v_sub.plan_version_id, p_plan_version_id, btrim(p_reason), auth.uid(),
    jsonb_build_object('effective_at', coalesce(p_effective_at, now()))
  );

  perform app.write_platform_audit(
    case when v_programado then 'subscription.plan_change_scheduled' else 'subscription.plan_changed' end,
    p_church_id,
    jsonb_build_object('from', v_sub.plan_version_id, 'to', p_plan_version_id, 'reason', btrim(p_reason))
  );

  return jsonb_build_object('scheduled', v_programado, 'effective_at', coalesce(p_effective_at, now()));
end;
$$;

revoke all on function app.platform_change_plan(uuid, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function app.platform_change_plan(uuid, uuid, text, timestamptz) to authenticated;

-- 3. Excepciones comerciales --------------------------------------------------------

create or replace function app.platform_grant_override(
  p_church_id uuid,
  p_capability text,
  p_limit_value integer,
  p_reason text,
  p_expires_at timestamptz default null,
  p_starts_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
  v_inicio timestamptz := coalesce(p_starts_at, now());
begin
  perform app.assert_platform_capability('platform.commercial.manage');

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Una excepción sin motivo no se puede revisar después.' using errcode = '22023';
  end if;

  if p_expires_at is not null and p_expires_at <= v_inicio then
    raise exception 'La excepción caducaría antes de empezar.' using errcode = '22023';
  end if;

  if not exists (select 1 from churches where id = p_church_id) then
    raise exception 'La iglesia no existe.' using errcode = 'P0002';
  end if;

  insert into church_entitlement_overrides
    (church_id, capability, limit_value, reason, granted_by, starts_at, expires_at)
  values
    (p_church_id, p_capability, p_limit_value, btrim(p_reason), auth.uid(), v_inicio, p_expires_at)
  on conflict (church_id, capability) do update
    set limit_value = excluded.limit_value,
        reason = excluded.reason,
        granted_by = excluded.granted_by,
        starts_at = excluded.starts_at,
        expires_at = excluded.expires_at,
        revoked_at = null,
        revoked_by = null
  returning id into v_id;

  perform app.write_platform_audit('subscription.override_granted', p_church_id,
    jsonb_build_object('capability', p_capability, 'limit_value', p_limit_value,
                       'reason', btrim(p_reason), 'starts_at', v_inicio, 'expires_at', p_expires_at));

  return v_id;
end;
$$;

revoke all on function app.platform_grant_override(uuid, text, integer, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function app.platform_grant_override(uuid, text, integer, text, timestamptz, timestamptz) to authenticated;

create or replace function app.platform_revoke_override(p_override_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_church uuid;
  v_cap text;
begin
  perform app.assert_platform_capability('platform.commercial.manage');

  select church_id, capability into v_church, v_cap
  from church_entitlement_overrides where id = p_override_id and revoked_at is null;

  if not found then
    raise exception 'Esa excepción no existe o ya estaba revocada.' using errcode = 'P0002';
  end if;

  update church_entitlement_overrides
  set revoked_at = now(), revoked_by = auth.uid()
  where id = p_override_id;

  perform app.write_platform_audit('subscription.override_revoked', v_church,
    jsonb_build_object('capability', v_cap, 'reason', nullif(btrim(coalesce(p_reason, '')), '')));
end;
$$;

revoke all on function app.platform_revoke_override(uuid, text) from public, anon, authenticated;
grant execute on function app.platform_revoke_override(uuid, text) to authenticated;

-- 4. Cancelar ------------------------------------------------------------------------
--
-- Cancelar al final del periodo y cancelar ya son operaciones distintas, y la
-- diferencia importa: una deja a la iglesia trabajando hasta que termine lo
-- pagado y la otra la corta hoy. Se elige explícitamente.
--
-- Ninguna de las dos borra nada. El borrado va por el procedimiento de
-- retención de la Fase 13, a los 30 días de archivar, y no por aquí.

create or replace function app.platform_cancel_subscription(
  p_church_id uuid,
  p_reason text,
  p_at_period_end boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_sub record;
begin
  perform app.assert_platform_capability('platform.commercial.manage');

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Hace falta un motivo para cancelar.' using errcode = '22023';
  end if;

  select * into v_sub from subscriptions where church_id = p_church_id for update;
  if not found then
    raise exception 'Esta iglesia no tiene suscripción.' using errcode = 'P0002';
  end if;

  if v_sub.status = 'cancelled' then
    raise exception 'Esta suscripción ya estaba cancelada.' using errcode = '22023';
  end if;

  if p_at_period_end then
    update subscriptions
    set cancel_at_period_end = true,
        cancel_at = coalesce(current_period_end, renews_at),
        updated_at = now()
    where church_id = p_church_id;
  else
    update subscriptions
    set status = 'cancelled',
        cancel_at_period_end = false,
        cancelled_at = now(),
        updated_at = now()
    where church_id = p_church_id;
  end if;

  insert into subscription_history (church_id, event, from_status, to_status, reason, actor_user_id, metadata)
  values (p_church_id,
          case when p_at_period_end then 'subscription.cancel_scheduled' else 'subscription.cancelled' end,
          v_sub.status,
          case when p_at_period_end then v_sub.status else 'cancelled'::subscription_status end,
          btrim(p_reason), auth.uid(),
          jsonb_build_object('at_period_end', p_at_period_end));

  perform app.write_platform_audit(
    case when p_at_period_end then 'subscription.cancel_scheduled' else 'subscription.cancelled' end,
    p_church_id, jsonb_build_object('reason', btrim(p_reason), 'at_period_end', p_at_period_end));

  -- Cancelar no archiva ni borra: eso es otra decisión, con su propio plazo.
  return jsonb_build_object(
    'cancelled_now', not p_at_period_end,
    'effective_at', case when p_at_period_end then coalesce(v_sub.current_period_end, v_sub.renews_at) else now() end,
    'datos', 'se_conservan'
  );
end;
$$;

revoke all on function app.platform_cancel_subscription(uuid, text, boolean) from public, anon, authenticated;
grant execute on function app.platform_cancel_subscription(uuid, text, boolean) to authenticated;

-- 5. Envoltorios públicos --------------------------------------------------------------

create or replace function public.preview_plan_change(p_church_id uuid, p_plan_version_id uuid)
returns jsonb language sql security invoker set search_path = pg_catalog, public
as $$ select app.preview_plan_change(p_church_id, p_plan_version_id); $$;

create or replace function public.platform_change_plan(
  p_church_id uuid, p_plan_version_id uuid, p_reason text, p_effective_at timestamptz default null)
returns jsonb language sql security invoker set search_path = pg_catalog, public
as $$ select app.platform_change_plan(p_church_id, p_plan_version_id, p_reason, p_effective_at); $$;

create or replace function public.platform_grant_override(
  p_church_id uuid, p_capability text, p_limit_value integer, p_reason text,
  p_expires_at timestamptz default null, p_starts_at timestamptz default null)
returns uuid language sql security invoker set search_path = pg_catalog, public
as $$ select app.platform_grant_override(p_church_id, p_capability, p_limit_value, p_reason, p_expires_at, p_starts_at); $$;

create or replace function public.platform_revoke_override(p_override_id uuid, p_reason text)
returns void language sql security invoker set search_path = pg_catalog, public
as $$ select app.platform_revoke_override(p_override_id, p_reason); $$;

create or replace function public.platform_cancel_subscription(
  p_church_id uuid, p_reason text, p_at_period_end boolean default true)
returns jsonb language sql security invoker set search_path = pg_catalog, public
as $$ select app.platform_cancel_subscription(p_church_id, p_reason, p_at_period_end); $$;

revoke all on function public.preview_plan_change(uuid, uuid) from public, anon;
revoke all on function public.platform_change_plan(uuid, uuid, text, timestamptz) from public, anon;
revoke all on function public.platform_grant_override(uuid, text, integer, text, timestamptz, timestamptz) from public, anon;
revoke all on function public.platform_revoke_override(uuid, text) from public, anon;
revoke all on function public.platform_cancel_subscription(uuid, text, boolean) from public, anon;

grant execute on function public.preview_plan_change(uuid, uuid) to authenticated;
grant execute on function public.platform_change_plan(uuid, uuid, text, timestamptz) to authenticated;
grant execute on function public.platform_grant_override(uuid, text, integer, text, timestamptz, timestamptz) to authenticated;
grant execute on function public.platform_revoke_override(uuid, text) to authenticated;
grant execute on function public.platform_cancel_subscription(uuid, text, boolean) to authenticated;
