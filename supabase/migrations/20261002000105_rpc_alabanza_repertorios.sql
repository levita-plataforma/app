-- Fase 11 (Diogo) · RPC de repertorios de Alabanza: crear, editar, archivar,
-- añadir/quitar canción, reordenar, cambiar tonalidad elegida. Mismo patrón
-- de dos capas que 20261002000104_rpc_alabanza_canciones.sql.

create or replace function app.create_worship_repertoire(
  p_church_id uuid,
  p_name text,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
  v_person_id uuid;
begin
  if not app.has_capability(p_church_id, 'worship.repertoire.manage') then
    raise exception 'No tienes permiso para crear repertorios.' using errcode = '42501';
  end if;

  if not app.module_enabled(p_church_id, 'worship') then
    raise exception 'El módulo de Alabanza no está habilitado para esta iglesia.' using errcode = '42501';
  end if;

  v_person_id := app.current_person_id(p_church_id);

  insert into worship_repertoires (church_id, name, description, created_by_person_id, updated_by_person_id)
  values (p_church_id, p_name, p_description, v_person_id, v_person_id)
  returning id into v_id;

  perform app.write_audit_log(
    p_church_id, 'worship.repertoire.created', 'worship_repertoires', v_id,
    jsonb_build_object('name', p_name)
  );

  return v_id;
end;
$$;

revoke all on function app.create_worship_repertoire(uuid, text, text) from public, anon;
grant execute on function app.create_worship_repertoire(uuid, text, text) to authenticated;

create or replace function public.create_worship_repertoire(p_church_id uuid, p_name text, p_description text default null)
returns uuid
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.create_worship_repertoire(p_church_id, p_name, p_description);
$$;

revoke all on function public.create_worship_repertoire(uuid, text, text) from public, anon;
grant execute on function public.create_worship_repertoire(uuid, text, text) to authenticated;

-- ============================================================================
-- update_worship_repertoire
-- ============================================================================

create or replace function app.update_worship_repertoire(
  p_repertoire_id uuid,
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
  v_status worship_song_status;
begin
  if not app.has_capability(p_church_id, 'worship.repertoire.manage') then
    raise exception 'No tienes permiso para editar repertorios.' using errcode = '42501';
  end if;

  select status into v_status from worship_repertoires where id = p_repertoire_id and church_id = p_church_id;
  if v_status is null then
    raise exception 'Repertorio no encontrado.' using errcode = 'P0002';
  end if;
  if v_status = 'archived' then
    raise exception 'No se puede editar un repertorio archivado.' using errcode = '22023';
  end if;

  update worship_repertoires
  set name = p_name, description = p_description, updated_by_person_id = app.current_person_id(p_church_id)
  where id = p_repertoire_id and church_id = p_church_id;

  perform app.write_audit_log(
    p_church_id, 'worship.repertoire.updated', 'worship_repertoires', p_repertoire_id,
    jsonb_build_object('name', p_name)
  );
end;
$$;

revoke all on function app.update_worship_repertoire(uuid, uuid, text, text) from public, anon;
grant execute on function app.update_worship_repertoire(uuid, uuid, text, text) to authenticated;

create or replace function public.update_worship_repertoire(p_repertoire_id uuid, p_church_id uuid, p_name text, p_description text default null)
returns void
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.update_worship_repertoire(p_repertoire_id, p_church_id, p_name, p_description);
$$;

revoke all on function public.update_worship_repertoire(uuid, uuid, text, text) from public, anon;
grant execute on function public.update_worship_repertoire(uuid, uuid, text, text) to authenticated;

-- ============================================================================
-- archive_worship_repertoire
-- ============================================================================

create or replace function app.archive_worship_repertoire(p_repertoire_id uuid, p_church_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not app.has_capability(p_church_id, 'worship.repertoire.manage') then
    raise exception 'No tienes permiso para archivar repertorios.' using errcode = '42501';
  end if;

  if not exists (select 1 from worship_repertoires where id = p_repertoire_id and church_id = p_church_id) then
    raise exception 'Repertorio no encontrado.' using errcode = 'P0002';
  end if;

  update worship_repertoires
  set status = 'archived', archived_at = now(), updated_by_person_id = app.current_person_id(p_church_id)
  where id = p_repertoire_id and church_id = p_church_id and status = 'active';

  perform app.write_audit_log(p_church_id, 'worship.repertoire.archived', 'worship_repertoires', p_repertoire_id, '{}'::jsonb);
end;
$$;

revoke all on function app.archive_worship_repertoire(uuid, uuid) from public, anon;
grant execute on function app.archive_worship_repertoire(uuid, uuid) to authenticated;

create or replace function public.archive_worship_repertoire(p_repertoire_id uuid, p_church_id uuid)
returns void
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.archive_worship_repertoire(p_repertoire_id, p_church_id);
$$;

revoke all on function public.archive_worship_repertoire(uuid, uuid) from public, anon;
grant execute on function public.archive_worship_repertoire(uuid, uuid) to authenticated;

-- ============================================================================
-- add_worship_repertoire_song: añade al final (max(position)+1). Rechaza
-- canción archivada (contrato §17: "no debe entrar en nuevos repertorios") y
-- canción de otro tenant (además de la FK tenant-safe, para un error de
-- dominio legible en vez de un 23503 crudo).
-- ============================================================================

create or replace function app.add_worship_repertoire_song(
  p_repertoire_id uuid,
  p_church_id uuid,
  p_song_id uuid,
  p_selected_key_root worship_key_root default null,
  p_selected_key_mode worship_key_mode default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
  v_repertoire_status worship_song_status;
  v_song_status worship_song_status;
  v_next_position integer;
begin
  if not app.has_capability(p_church_id, 'worship.repertoire.manage') then
    raise exception 'No tienes permiso para editar este repertorio.' using errcode = '42501';
  end if;

  select status into v_repertoire_status from worship_repertoires where id = p_repertoire_id and church_id = p_church_id;
  if v_repertoire_status is null then
    raise exception 'Repertorio no encontrado.' using errcode = 'P0002';
  end if;
  if v_repertoire_status = 'archived' then
    raise exception 'No se puede editar un repertorio archivado.' using errcode = '22023';
  end if;

  select status into v_song_status from worship_songs where id = p_song_id and church_id = p_church_id;
  if v_song_status is null then
    raise exception 'Canción no encontrada.' using errcode = 'P0002';
  end if;
  if v_song_status = 'archived' then
    raise exception 'No se puede añadir una canción archivada a un repertorio.' using errcode = '22023';
  end if;

  if (p_selected_key_root is null) <> (p_selected_key_mode is null) then
    raise exception 'La tonalidad elegida necesita nota y modalidad juntas.' using errcode = '22023';
  end if;

  select coalesce(max(position), 0) + 1 into v_next_position
  from worship_repertoire_songs
  where repertoire_id = p_repertoire_id;

  insert into worship_repertoire_songs (
    church_id, repertoire_id, song_id, position, selected_key_root, selected_key_mode
  ) values (
    p_church_id, p_repertoire_id, p_song_id, v_next_position, p_selected_key_root, p_selected_key_mode
  )
  returning id into v_id;

  perform app.write_audit_log(
    p_church_id, 'worship.repertoire.song_added', 'worship_repertoires', p_repertoire_id,
    jsonb_build_object('song_id', p_song_id, 'position', v_next_position)
  );

  return v_id;
end;
$$;

revoke all on function app.add_worship_repertoire_song(uuid, uuid, uuid, worship_key_root, worship_key_mode) from public, anon;
grant execute on function app.add_worship_repertoire_song(uuid, uuid, uuid, worship_key_root, worship_key_mode) to authenticated;

create or replace function public.add_worship_repertoire_song(
  p_repertoire_id uuid, p_church_id uuid, p_song_id uuid,
  p_selected_key_root worship_key_root default null, p_selected_key_mode worship_key_mode default null
)
returns uuid
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.add_worship_repertoire_song(p_repertoire_id, p_church_id, p_song_id, p_selected_key_root, p_selected_key_mode);
$$;

revoke all on function public.add_worship_repertoire_song(uuid, uuid, uuid, worship_key_root, worship_key_mode) from public, anon;
grant execute on function public.add_worship_repertoire_song(uuid, uuid, uuid, worship_key_root, worship_key_mode) to authenticated;

-- ============================================================================
-- remove_worship_repertoire_song: quita y compacta posiciones (0..n-1 sin
-- huecos), en la misma transacción.
-- ============================================================================

create or replace function app.remove_worship_repertoire_song(p_repertoire_song_id uuid, p_church_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_repertoire_id uuid;
  v_removed_position integer;
begin
  if not app.has_capability(p_church_id, 'worship.repertoire.manage') then
    raise exception 'No tienes permiso para editar este repertorio.' using errcode = '42501';
  end if;

  select repertoire_id, position into v_repertoire_id, v_removed_position
  from worship_repertoire_songs
  where id = p_repertoire_song_id and church_id = p_church_id;

  if v_repertoire_id is null then
    raise exception 'La canción no está en este repertorio.' using errcode = 'P0002';
  end if;

  delete from worship_repertoire_songs where id = p_repertoire_song_id and church_id = p_church_id;

  update worship_repertoire_songs
  set position = position - 1
  where repertoire_id = v_repertoire_id and position > v_removed_position;

  perform app.write_audit_log(
    p_church_id, 'worship.repertoire.song_removed', 'worship_repertoires', v_repertoire_id,
    jsonb_build_object('repertoire_song_id', p_repertoire_song_id)
  );
end;
$$;

revoke all on function app.remove_worship_repertoire_song(uuid, uuid) from public, anon;
grant execute on function app.remove_worship_repertoire_song(uuid, uuid) to authenticated;

create or replace function public.remove_worship_repertoire_song(p_repertoire_song_id uuid, p_church_id uuid)
returns void
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.remove_worship_repertoire_song(p_repertoire_song_id, p_church_id);
$$;

revoke all on function public.remove_worship_repertoire_song(uuid, uuid) from public, anon;
grant execute on function public.remove_worship_repertoire_song(uuid, uuid) to authenticated;

-- ============================================================================
-- reorder_worship_repertoire_songs: exige exactamente el conjunto actual de
-- filas (mismo criterio que reorder_activity_plan_items, Fase 4/ADR 0017):
-- si otra persona ya cambió el repertorio, falla en vez de aplicar un orden
-- a medias. p_ordered_ids es la lista completa de worship_repertoire_songs.id
-- en el nuevo orden deseado.
-- ============================================================================

create or replace function app.reorder_worship_repertoire_songs(
  p_repertoire_id uuid,
  p_church_id uuid,
  p_ordered_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_current_ids uuid[];
  v_id uuid;
  v_position integer;
begin
  if not app.has_capability(p_church_id, 'worship.repertoire.manage') then
    raise exception 'No tienes permiso para editar este repertorio.' using errcode = '42501';
  end if;

  if not exists (select 1 from worship_repertoires where id = p_repertoire_id and church_id = p_church_id) then
    raise exception 'Repertorio no encontrado.' using errcode = 'P0002';
  end if;

  select array_agg(id order by position) into v_current_ids
  from worship_repertoire_songs
  where repertoire_id = p_repertoire_id and church_id = p_church_id;

  if v_current_ids is null then v_current_ids := array[]::uuid[]; end if;

  if (select array_agg(x order by x) from unnest(p_ordered_ids) x)
     is distinct from
     (select array_agg(x order by x) from unnest(v_current_ids) x) then
    raise exception 'El repertorio cambió mientras editabas el orden. Recarga e inténtalo de nuevo.' using errcode = '55P03';
  end if;

  -- Desplaza temporalmente a un rango libre para evitar chocar con
  -- unique (repertoire_id, position) mientras se reescribe el orden.
  update worship_repertoire_songs
  set position = position + array_length(p_ordered_ids, 1)
  where repertoire_id = p_repertoire_id and church_id = p_church_id;

  v_position := 1;
  foreach v_id in array p_ordered_ids
  loop
    update worship_repertoire_songs
    set position = v_position
    where id = v_id and repertoire_id = p_repertoire_id and church_id = p_church_id;
    v_position := v_position + 1;
  end loop;

  perform app.write_audit_log(
    p_church_id, 'worship.repertoire.reordered', 'worship_repertoires', p_repertoire_id, '{}'::jsonb
  );
end;
$$;

revoke all on function app.reorder_worship_repertoire_songs(uuid, uuid, uuid[]) from public, anon;
grant execute on function app.reorder_worship_repertoire_songs(uuid, uuid, uuid[]) to authenticated;

create or replace function public.reorder_worship_repertoire_songs(p_repertoire_id uuid, p_church_id uuid, p_ordered_ids uuid[])
returns void
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.reorder_worship_repertoire_songs(p_repertoire_id, p_church_id, p_ordered_ids);
$$;

revoke all on function public.reorder_worship_repertoire_songs(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.reorder_worship_repertoire_songs(uuid, uuid, uuid[]) to authenticated;

-- ============================================================================
-- set_worship_repertoire_song_key: cambia SOLO la tonalidad elegida en este
-- repertorio (contrato §16: nunca altera worship_songs.default_key_*).
-- ============================================================================

create or replace function app.set_worship_repertoire_song_key(
  p_repertoire_song_id uuid,
  p_church_id uuid,
  p_selected_key_root worship_key_root,
  p_selected_key_mode worship_key_mode
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_repertoire_id uuid;
begin
  if not app.has_capability(p_church_id, 'worship.repertoire.manage') then
    raise exception 'No tienes permiso para editar este repertorio.' using errcode = '42501';
  end if;

  if (p_selected_key_root is null) <> (p_selected_key_mode is null) then
    raise exception 'La tonalidad elegida necesita nota y modalidad juntas.' using errcode = '22023';
  end if;

  select repertoire_id into v_repertoire_id
  from worship_repertoire_songs
  where id = p_repertoire_song_id and church_id = p_church_id;

  if v_repertoire_id is null then
    raise exception 'La canción no está en este repertorio.' using errcode = 'P0002';
  end if;

  update worship_repertoire_songs
  set selected_key_root = p_selected_key_root, selected_key_mode = p_selected_key_mode
  where id = p_repertoire_song_id and church_id = p_church_id;

  perform app.write_audit_log(
    p_church_id, 'worship.repertoire.updated', 'worship_repertoires', v_repertoire_id,
    jsonb_build_object('repertoire_song_id', p_repertoire_song_id, 'selected_key_change', true)
  );
end;
$$;

revoke all on function app.set_worship_repertoire_song_key(uuid, uuid, worship_key_root, worship_key_mode) from public, anon;
grant execute on function app.set_worship_repertoire_song_key(uuid, uuid, worship_key_root, worship_key_mode) to authenticated;

create or replace function public.set_worship_repertoire_song_key(
  p_repertoire_song_id uuid, p_church_id uuid, p_selected_key_root worship_key_root, p_selected_key_mode worship_key_mode
)
returns void
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.set_worship_repertoire_song_key(p_repertoire_song_id, p_church_id, p_selected_key_root, p_selected_key_mode);
$$;

revoke all on function public.set_worship_repertoire_song_key(uuid, uuid, worship_key_root, worship_key_mode) from public, anon;
grant execute on function public.set_worship_repertoire_song_key(uuid, uuid, worship_key_root, worship_key_mode) to authenticated;
