-- Fase 12 (Diogo) · RPC de fondos de Giving. Mismo patrón de dos capas ya
-- consolidado (Fase 9/11): app.* security definer + wrapper public.*
-- security invoker, revoke/grant explícito incluyendo anon en las dos
-- capas (ver hallazgo real de Fase 11: revoke ... from public no basta).

create or replace function app.create_giving_fund(
  p_church_id uuid,
  p_name text,
  p_description text default null,
  p_is_default boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
begin
  if not app.has_capability(p_church_id, 'giving.manage_funds') then
    raise exception 'No tienes permiso para crear fondos.' using errcode = '42501';
  end if;

  perform app.require_giving_module(p_church_id);

  insert into giving_funds (church_id, name, description, is_default)
  values (p_church_id, p_name, p_description, coalesce(p_is_default, false))
  returning id into v_id;

  perform app.write_audit_log(
    p_church_id, 'giving.fund.created', 'giving_funds', v_id,
    jsonb_build_object('name', p_name, 'is_default', p_is_default)
  );

  return v_id;
end;
$$;

revoke all on function app.create_giving_fund(uuid, text, text, boolean) from public, anon;
grant execute on function app.create_giving_fund(uuid, text, text, boolean) to authenticated;

create or replace function public.create_giving_fund(
  p_church_id uuid, p_name text, p_description text default null, p_is_default boolean default false
)
returns uuid
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.create_giving_fund(p_church_id, p_name, p_description, p_is_default);
$$;

revoke all on function public.create_giving_fund(uuid, text, text, boolean) from public, anon;
grant execute on function public.create_giving_fund(uuid, text, text, boolean) to authenticated;

-- ============================================================================
-- update_giving_fund
-- ============================================================================

create or replace function app.update_giving_fund(
  p_fund_id uuid,
  p_church_id uuid,
  p_name text,
  p_description text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_status giving_entity_status;
begin
  if not app.has_capability(p_church_id, 'giving.manage_funds') then
    raise exception 'No tienes permiso para editar fondos.' using errcode = '42501';
  end if;

  select status into v_status from giving_funds where id = p_fund_id and church_id = p_church_id;
  if v_status is null then
    raise exception 'Fondo no encontrado.' using errcode = 'P0002';
  end if;
  if v_status = 'archived' then
    raise exception 'No se puede editar un fondo archivado.' using errcode = '22023';
  end if;

  update giving_funds set name = p_name, description = p_description
  where id = p_fund_id and church_id = p_church_id;

  perform app.write_audit_log(
    p_church_id, 'giving.fund.updated', 'giving_funds', p_fund_id, jsonb_build_object('name', p_name)
  );
end;
$$;

revoke all on function app.update_giving_fund(uuid, uuid, text, text) from public, anon;
grant execute on function app.update_giving_fund(uuid, uuid, text, text) to authenticated;

create or replace function public.update_giving_fund(p_fund_id uuid, p_church_id uuid, p_name text, p_description text default null)
returns void
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.update_giving_fund(p_fund_id, p_church_id, p_name, p_description);
$$;

revoke all on function public.update_giving_fund(uuid, uuid, text, text) from public, anon;
grant execute on function public.update_giving_fund(uuid, uuid, text, text) to authenticated;

-- ============================================================================
-- set_giving_fund_default: cambia el default de forma atómica (desmarca el
-- anterior y marca el nuevo en la misma transacción, para no violar nunca
-- el índice único parcial "un solo default activo").
-- ============================================================================

create or replace function app.set_giving_fund_default(p_fund_id uuid, p_church_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_status giving_entity_status;
begin
  if not app.has_capability(p_church_id, 'giving.manage_funds') then
    raise exception 'No tienes permiso para cambiar el fondo por defecto.' using errcode = '42501';
  end if;

  select status into v_status from giving_funds where id = p_fund_id and church_id = p_church_id;
  if v_status is null then
    raise exception 'Fondo no encontrado.' using errcode = 'P0002';
  end if;
  if v_status = 'archived' then
    raise exception 'No se puede marcar como default un fondo archivado.' using errcode = '22023';
  end if;

  update giving_funds set is_default = false where church_id = p_church_id and is_default = true and id <> p_fund_id;
  update giving_funds set is_default = true where id = p_fund_id and church_id = p_church_id;

  perform app.write_audit_log(p_church_id, 'giving.fund.updated', 'giving_funds', p_fund_id, jsonb_build_object('is_default', true));
end;
$$;

revoke all on function app.set_giving_fund_default(uuid, uuid) from public, anon;
grant execute on function app.set_giving_fund_default(uuid, uuid) to authenticated;

create or replace function public.set_giving_fund_default(p_fund_id uuid, p_church_id uuid)
returns void
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.set_giving_fund_default(p_fund_id, p_church_id);
$$;

revoke all on function public.set_giving_fund_default(uuid, uuid) from public, anon;
grant execute on function public.set_giving_fund_default(uuid, uuid) to authenticated;

-- ============================================================================
-- archive_giving_fund: bloqueado si tiene histórico (encargo §47: "não
-- apagar fundo com histórico" — aquí se archiva siempre que se pueda, pero
-- se bloquea si es el único fondo default activo dejando la iglesia sin
-- ninguno, y se impide archivar si aún es el default: hay que reasignar
-- default primero).
-- ============================================================================

create or replace function app.archive_giving_fund(p_fund_id uuid, p_church_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_is_default boolean;
begin
  if not app.has_capability(p_church_id, 'giving.manage_funds') then
    raise exception 'No tienes permiso para archivar fondos.' using errcode = '42501';
  end if;

  select is_default into v_is_default from giving_funds where id = p_fund_id and church_id = p_church_id;
  if v_is_default is null then
    raise exception 'Fondo no encontrado.' using errcode = 'P0002';
  end if;
  if v_is_default then
    raise exception 'No se puede archivar el fondo por defecto: asigna otro fondo como default primero.' using errcode = '22023';
  end if;

  update giving_funds
  set status = 'archived', archived_at = now(), is_default = false
  where id = p_fund_id and church_id = p_church_id and status = 'active';

  perform app.write_audit_log(p_church_id, 'giving.fund.archived', 'giving_funds', p_fund_id, '{}'::jsonb);
end;
$$;

revoke all on function app.archive_giving_fund(uuid, uuid) from public, anon;
grant execute on function app.archive_giving_fund(uuid, uuid) to authenticated;

create or replace function public.archive_giving_fund(p_fund_id uuid, p_church_id uuid)
returns void
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.archive_giving_fund(p_fund_id, p_church_id);
$$;

revoke all on function public.archive_giving_fund(uuid, uuid) from public, anon;
grant execute on function public.archive_giving_fund(uuid, uuid) to authenticated;
