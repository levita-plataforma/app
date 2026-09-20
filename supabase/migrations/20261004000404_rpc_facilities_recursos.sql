-- Fase 10 · RPC del catálogo de recursos.
-- Ver docs/CONTRATO-FASE-10.md §26, §32 y §33.
--
-- Toda escritura sobre resources pasa por aquí: la tabla tiene revocados
-- insert, update y delete, así que no hay otra vía.

-- app.save_resource --------------------------------------------------------------
--
-- Crea o edita. Un solo punto de entrada, como save_communication_template en
-- la Fase 9: los dos caminos comparten validación y el de edición tendría que
-- repetirla entera.

create or replace function app.save_resource(p_church_id uuid, p_input jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid := nullif(p_input ->> 'id', '')::uuid;
  v_name text := app.j_text(p_input, 'name');
  v_type text := app.j_text(p_input, 'type');
  v_campus uuid := nullif(p_input ->> 'campus_id', '')::uuid;
  v_responsible uuid := nullif(p_input ->> 'responsible_person_id', '')::uuid;
  v_capacity integer := nullif(p_input ->> 'capacity', '')::integer;
  v_status text := app.j_text(p_input, 'status');
  v_campus_actual uuid;
begin
  perform app.assert_church_member(p_church_id);

  if v_id is null then
    -- Al crear no hay recurso todavía, así que el ámbito posible es la iglesia
    -- o la sede donde se va a crear.
    if not app.resource_cap(p_church_id, v_campus, null, 'facilities.manage_resources') then
      raise exception 'No tienes permiso para crear recursos.' using errcode = '42501';
    end if;

    if v_name is null or v_type is null then
      raise exception 'El recurso necesita nombre y tipo.' using errcode = '22023';
    end if;

    insert into resources (
      church_id, campus_id, type, name, description, capacity, location_details,
      responsible_person_id, reservable, requires_approval, metadata, created_by
    ) values (
      p_church_id, v_campus, v_type::resource_type, v_name,
      app.j_text(p_input, 'description'), v_capacity,
      app.j_text(p_input, 'location_details'), v_responsible,
      coalesce((p_input ->> 'reservable')::boolean, true),
      coalesce((p_input ->> 'requires_approval')::boolean, false),
      coalesce(p_input -> 'metadata', '{}'::jsonb),
      app.current_person_id(p_church_id)
    )
    returning id into v_id;
  else
    select campus_id into v_campus_actual from resources where id = v_id and church_id = p_church_id;
    if v_campus_actual is null and not exists (select 1 from resources where id = v_id and church_id = p_church_id) then
      raise exception 'El recurso no existe.' using errcode = 'P0002';
    end if;

    -- El permiso se mira sobre la sede ACTUAL, no sobre la que se pide. Si no,
    -- quien administra la sede A podría mover a la sede B un recurso que no le
    -- corresponde con solo mandar otro campus_id.
    if not app.resource_cap(p_church_id, v_campus_actual, v_id, 'facilities.manage_resources') then
      raise exception 'No tienes permiso para editar este recurso.' using errcode = '42501';
    end if;

    -- Y si además cambia de sede, hace falta permiso también sobre la nueva.
    if p_input ? 'campus_id' and v_campus is distinct from v_campus_actual
       and not app.resource_cap(p_church_id, v_campus, v_id, 'facilities.manage_resources') then
      raise exception 'No tienes permiso sobre la sede de destino.' using errcode = '42501';
    end if;

    if v_status is not null and v_status = 'archived' then
      raise exception 'Para archivar un recurso usa archive_resource.' using errcode = '22023';
    end if;

    update resources set
      name = coalesce(v_name, name),
      type = coalesce(v_type::resource_type, type),
      campus_id = case when p_input ? 'campus_id' then v_campus else campus_id end,
      description = case when p_input ? 'description' then app.j_text(p_input, 'description') else description end,
      capacity = case when p_input ? 'capacity' then v_capacity else capacity end,
      location_details = case when p_input ? 'location_details' then app.j_text(p_input, 'location_details') else location_details end,
      responsible_person_id = case when p_input ? 'responsible_person_id' then v_responsible else responsible_person_id end,
      reservable = coalesce((p_input ->> 'reservable')::boolean, reservable),
      requires_approval = coalesce((p_input ->> 'requires_approval')::boolean, requires_approval),
      status = coalesce(v_status::resource_status, status),
      metadata = case when p_input ? 'metadata' then coalesce(p_input -> 'metadata', '{}'::jsonb) else metadata end,
      updated_at = now()
    where id = v_id and church_id = p_church_id and archived_at is null;

    if not found then
      raise exception 'El recurso no existe o está archivado.' using errcode = 'P0002';
    end if;
  end if;

  perform app.write_audit_log(p_church_id, 'resource.saved', 'resources', v_id,
    jsonb_build_object('name', v_name, 'type', v_type));
  return v_id;
end;
$$;

revoke all on function app.save_resource(uuid, jsonb) from public, anon;
grant execute on function app.save_resource(uuid, jsonb) to authenticated;

-- app.archive_resource -------------------------------------------------------------
--
-- Bloquea si quedan reservas futuras (decisión P-20). Archivar y dejar
-- reservas vivas apuntando a un recurso que ya no está sería peor que negarse:
-- quien reservó el auditorio para el domingo no se enteraría de nada.

create or replace function app.archive_resource(p_resource_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_church uuid;
  v_campus uuid;
  v_pendientes integer;
begin
  select church_id, campus_id into v_church, v_campus from resources where id = p_resource_id;
  if v_church is null or not (v_church = any (app.church_ids_for_user())) then
    raise exception 'El recurso no existe.' using errcode = 'P0002';
  end if;

  if not app.resource_cap(v_church, v_campus, p_resource_id, 'facilities.manage_resources') then
    raise exception 'No tienes permiso para archivar este recurso.' using errcode = '42501';
  end if;

  select count(*) into v_pendientes
  from resource_reservations
  where resource_id = p_resource_id
    and status in ('confirmed', 'pending')
    and starts_at >= now();

  if v_pendientes > 0 then
    raise exception 'Este recurso tiene % reserva(s) futura(s): cancélalas o espera a que pasen antes de archivarlo.', v_pendientes
      using errcode = '22023';
  end if;

  update resources
  set status = 'archived', archived_at = now(), archived_by = app.current_person_id(v_church), updated_at = now()
  where id = p_resource_id and archived_at is null;

  if not found then
    raise exception 'El recurso ya estaba archivado.' using errcode = '22023';
  end if;

  perform app.write_audit_log(v_church, 'resource.archived', 'resources', p_resource_id, '{}'::jsonb);
end;
$$;

revoke all on function app.archive_resource(uuid) from public, anon;
grant execute on function app.archive_resource(uuid) to authenticated;

-- app.restore_resource --------------------------------------------------------------

create or replace function app.restore_resource(p_resource_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_church uuid;
  v_campus uuid;
begin
  select church_id, campus_id into v_church, v_campus from resources where id = p_resource_id;
  if v_church is null or not (v_church = any (app.church_ids_for_user())) then
    raise exception 'El recurso no existe.' using errcode = 'P0002';
  end if;

  if not app.resource_cap(v_church, v_campus, p_resource_id, 'facilities.manage_resources') then
    raise exception 'No tienes permiso para restaurar este recurso.' using errcode = '42501';
  end if;

  update resources
  set status = 'active', archived_at = null, archived_by = null, updated_at = now()
  where id = p_resource_id and archived_at is not null;

  if not found then
    raise exception 'El recurso no estaba archivado.' using errcode = '22023';
  end if;

  perform app.write_audit_log(v_church, 'resource.restored', 'resources', p_resource_id, '{}'::jsonb);
end;
$$;

revoke all on function app.restore_resource(uuid) from public, anon;
grant execute on function app.restore_resource(uuid) to authenticated;

-- app.delete_resource ----------------------------------------------------------------
--
-- Solo si nunca tuvo historial (decisión P-19). Un recurso con una sola reserva
-- pasada ya no se borra: se archiva. La comprobación está aquí y no en la
-- interfaz, porque la interfaz no es una barrera.

create or replace function app.delete_resource(p_resource_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_church uuid;
  v_campus uuid;
begin
  select church_id, campus_id into v_church, v_campus from resources where id = p_resource_id;
  if v_church is null or not (v_church = any (app.church_ids_for_user())) then
    raise exception 'El recurso no existe.' using errcode = 'P0002';
  end if;

  if not app.resource_cap(v_church, v_campus, p_resource_id, 'facilities.manage_resources') then
    raise exception 'No tienes permiso para borrar este recurso.' using errcode = '42501';
  end if;

  if exists (select 1 from resource_reservations where resource_id = p_resource_id)
     or exists (select 1 from resource_maintenance where resource_id = p_resource_id) then
    raise exception 'Este recurso ya tiene historial: archívalo en vez de borrarlo.' using errcode = '22023';
  end if;

  delete from resources where id = p_resource_id;

  perform app.write_audit_log(v_church, 'resource.deleted', 'resources', p_resource_id, '{}'::jsonb);
end;
$$;

revoke all on function app.delete_resource(uuid) from public, anon;
grant execute on function app.delete_resource(uuid) to authenticated;

-- Envoltorios públicos ----------------------------------------------------------------

create or replace function public.save_resource(p_church_id uuid, p_input jsonb)
returns uuid language sql security invoker set search_path = pg_catalog, public
as $$ select app.save_resource(p_church_id, p_input); $$;

create or replace function public.archive_resource(p_resource_id uuid)
returns void language sql security invoker set search_path = pg_catalog, public
as $$ select app.archive_resource(p_resource_id); $$;

create or replace function public.restore_resource(p_resource_id uuid)
returns void language sql security invoker set search_path = pg_catalog, public
as $$ select app.restore_resource(p_resource_id); $$;

create or replace function public.delete_resource(p_resource_id uuid)
returns void language sql security invoker set search_path = pg_catalog, public
as $$ select app.delete_resource(p_resource_id); $$;

do $grants$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
    where p.proname in ('save_resource', 'archive_resource', 'restore_resource', 'delete_resource')
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end;
$grants$;
