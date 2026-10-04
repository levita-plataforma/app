-- Fase 15 · A1 (parte 3): ejecución de lifecycle con bypass acotado.
--
-- Solo la purga de retención de una iglesia archivada puede saltarse el gating
-- comercial. No es un bypass del módulo ni de comunicaciones o avisos: esos jobs
-- filtran por modo en su propio código (ver src/server/*/runner.ts).
--
-- Condiciones del bypass, todas necesarias:
--   1. La sesión actual es service_role. Un usuario autenticado no puede hacer
--      SET ROLE service_role, así que no puede llegar a esta comprobación.
--   2. El flag app.lifecycle_bypass vale 'on'. Se activa con set_config(..., true):
--      es transaccional y desaparece al terminar la transacción. El flag por sí
--      solo no basta (ver app.lifecycle_bypass_active).
--   3. La función solo acepta la acción 'purge_church' sobre una iglesia archivada
--      hace más de 30 días.
-- Ejecutable solo por service_role. Ni public, ni anon, ni authenticated.

create or replace function app.run_lifecycle(
  p_church_id uuid,
  p_action text,
  p_retention_days integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_church churches%rowtype;
  v_dias integer := greatest(coalesce(p_retention_days, 30), 7);
  v_ficheros integer := 0;
begin
  if coalesce(current_setting('role', true), '') <> 'service_role' then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  if p_action is distinct from 'purge_church' then
    raise exception 'Acción de lifecycle no soportada.' using errcode = '22023';
  end if;

  select * into v_church from churches where id = p_church_id for update;
  if not found then
    return jsonb_build_object('purged', false, 'reason', 'not_found');
  end if;

  if not (v_church.status = 'archived'
          and v_church.archived_at is not null
          and v_church.archived_at < now() - make_interval(days => v_dias)) then
    return jsonb_build_object('purged', false, 'reason', 'not_due');
  end if;

  perform set_config('app.lifecycle_bypass', 'on', true);

  insert into storage_deletion_queue (bucket, object_path, source_church_id, reason)
  select f.bucket, f.object_path, p_church_id, 'church_purged'
  from files f
  where f.church_id = p_church_id
  on conflict (bucket, object_path) do nothing;
  get diagnostics v_ficheros = row_count;

  insert into platform_audit_logs (actor_user_id, church_id, action, metadata)
  values (
    null,
    v_church.id,
    'church.purged',
    jsonb_build_object(
      'church_name', v_church.name,
      'archived_at', v_church.archived_at,
      'retention_days', v_dias,
      'files_queued', v_ficheros
    )
  );

  delete from churches where id = p_church_id;

  perform set_config('app.lifecycle_bypass', 'off', true);

  return jsonb_build_object('purged', true, 'files_queued', v_ficheros);
end;
$$;

revoke all on function app.run_lifecycle(uuid, text, integer) from public, anon, authenticated;
grant execute on function app.run_lifecycle(uuid, text, integer) to service_role;
