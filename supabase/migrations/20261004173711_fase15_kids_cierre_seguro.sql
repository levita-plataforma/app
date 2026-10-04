-- Fase 15 · A1 (ajuste Kids): cierre seguro de un menor ya presente en cualquier
-- modo no activo.
--
-- Antes: la incidencia de seguridad de un menor dentro solo se permitía en
-- suspended y cancelled. Ahora también en trial_expired y security_blocked.
-- Lo que no cambia: check-out y recogida ya estaban permitidos en todos los modos
-- (solo cierran una presencia activa), y un check-in o una sesión nuevos siguen
-- denegados. No se abre lectura de Kids: eso es A2, con una RPC mínima.

create or replace function app.enforce_commercial_write()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_tenant uuid;
begin
  if tg_op = 'INSERT' then
    v_tenant := new.church_id;
  elsif tg_op = 'UPDATE' then
    if new.church_id is distinct from old.church_id then
      raise exception 'No se pueden trasladar registros entre iglesias.' using errcode = '42501';
    end if;
    v_tenant := old.church_id;
  else
    v_tenant := old.church_id;
  end if;

  if app.lifecycle_bypass_active() then
    return coalesce(new, old);
  end if;

  -- Las excepciones de Kids comparan campos con to_jsonb: plpgsql resuelve
  -- new.<campo> al ejecutar, y no todas las tablas tienen esas columnas.
  if tg_table_name = 'kid_checkins' and tg_op = 'UPDATE' then
    if to_jsonb(old)->>'status' = 'checked_in' and to_jsonb(new)->>'status' = 'checked_out'
       and to_jsonb(new)->>'church_id' = to_jsonb(old)->>'church_id'
       and to_jsonb(new)->>'session_id' is not distinct from to_jsonb(old)->>'session_id'
       and to_jsonb(new)->>'kid_person_id' is not distinct from to_jsonb(old)->>'kid_person_id' then
      return new;
    end if;
  end if;

  if tg_table_name = 'kid_pickup_authorizations' and tg_op = 'UPDATE' then
    if to_jsonb(old)->>'status' in ('active', 'pending') and to_jsonb(new)->>'status' = 'used'
       and to_jsonb(new)->>'used_checkin_id' is not null
       and exists (
         select 1 from kid_checkins kc
         where kc.id = (to_jsonb(new)->>'used_checkin_id')::uuid
           and kc.church_id = v_tenant
           and kc.status = 'checked_out'
       ) then
      return new;
    end if;
  end if;

  if tg_table_name = 'kids_incidents' and tg_op = 'INSERT' then
    -- Cierre seguro de un menor ya presente: se permite en cualquier modo no activo.
    -- Solo incidencias de un menor con check-in activo; no abre nuevas presencias.
    if app.church_access_mode(v_tenant) in ('trial_expired', 'suspended', 'cancelled', 'security_blocked')
       and exists (
         select 1 from kid_checkins kc
         where kc.church_id = v_tenant
           and kc.kid_person_id = (to_jsonb(new)->>'kid_person_id')::uuid
           and kc.status = 'checked_in'
       ) then
      return new;
    end if;
  end if;

  perform app.assert_can_mutate(v_tenant);
  return coalesce(new, old);
end;
$$;
