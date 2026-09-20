-- Fase 11 (Diogo) · Asociación de archivos a canciones, reutilizando `files`
-- del núcleo (ADR 0008) sin storage paralelo.
--
-- files_manage_own_or_capability (20260916001100) solo concede escritura al
-- propietario del archivo o a quien tiene people.manage — ninguna de las dos
-- encaja con "gestiona contenido de Alabanza". En vez de tocar esa política
-- (relajarla ampliaría el alcance de people.manage sin necesidad), se usa
-- una RPC security definer dedicada, mismo criterio que el resto de este
-- módulo: ninguna escritura directa desde cliente.

create or replace function app.attach_worship_song_file(
  p_song_id uuid,
  p_church_id uuid,
  p_bucket text,
  p_object_path text,
  p_mime_type text default null,
  p_size_bytes bigint default null,
  p_checksum text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_file_id uuid;
  v_person_id uuid;
  v_song_status worship_song_status;
begin
  if not app.has_capability(p_church_id, 'worship.song.manage') then
    raise exception 'No tienes permiso para adjuntar archivos a canciones.' using errcode = '42501';
  end if;

  select status into v_song_status from worship_songs where id = p_song_id and church_id = p_church_id;
  if v_song_status is null then
    raise exception 'Canción no encontrada.' using errcode = 'P0002';
  end if;

  v_person_id := app.current_person_id(p_church_id);

  insert into files (
    church_id, bucket, object_path, owner_person_id, entity_type, entity_id,
    classification, mime_type, size_bytes, checksum
  ) values (
    p_church_id, p_bucket, p_object_path, v_person_id, 'song', p_song_id,
    'internal', p_mime_type, p_size_bytes, p_checksum
  )
  returning id into v_file_id;

  perform app.write_audit_log(
    p_church_id, 'worship.song.file_attached', 'worship_songs', p_song_id,
    jsonb_build_object('file_id', v_file_id)
  );

  return v_file_id;
end;
$$;

revoke all on function app.attach_worship_song_file(uuid, uuid, text, text, text, bigint, text) from public, anon;
grant execute on function app.attach_worship_song_file(uuid, uuid, text, text, text, bigint, text) to authenticated;

create or replace function public.attach_worship_song_file(
  p_song_id uuid, p_church_id uuid, p_bucket text, p_object_path text,
  p_mime_type text default null, p_size_bytes bigint default null, p_checksum text default null
)
returns uuid
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.attach_worship_song_file(p_song_id, p_church_id, p_bucket, p_object_path, p_mime_type, p_size_bytes, p_checksum);
$$;

revoke all on function public.attach_worship_song_file(uuid, uuid, text, text, text, bigint, text) from public, anon;
grant execute on function public.attach_worship_song_file(uuid, uuid, text, text, text, bigint, text) to authenticated;

-- ============================================================================
-- detach_worship_song_file: marca el archivo como eliminado (status del
-- núcleo de files), no lo borra físicamente aquí — la limpieza de storage
-- físico es responsabilidad del job de limpieza del núcleo (ADR 0008/0010),
-- fuera de este módulo.
-- ============================================================================

create or replace function app.detach_worship_song_file(p_file_id uuid, p_church_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_song_id uuid;
begin
  if not app.has_capability(p_church_id, 'worship.song.manage') then
    raise exception 'No tienes permiso para quitar archivos de canciones.' using errcode = '42501';
  end if;

  select entity_id into v_song_id
  from files
  where id = p_file_id and church_id = p_church_id and entity_type = 'song';

  if v_song_id is null then
    raise exception 'Archivo no encontrado.' using errcode = 'P0002';
  end if;

  update files set status = 'deleted' where id = p_file_id and church_id = p_church_id;

  perform app.write_audit_log(
    p_church_id, 'worship.song.file_detached', 'worship_songs', v_song_id,
    jsonb_build_object('file_id', p_file_id)
  );
end;
$$;

revoke all on function app.detach_worship_song_file(uuid, uuid) from public, anon;
grant execute on function app.detach_worship_song_file(uuid, uuid) to authenticated;

create or replace function public.detach_worship_song_file(p_file_id uuid, p_church_id uuid)
returns void
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.detach_worship_song_file(p_file_id, p_church_id);
$$;

revoke all on function public.detach_worship_song_file(uuid, uuid) from public, anon;
grant execute on function public.detach_worship_song_file(uuid, uuid) to authenticated;
