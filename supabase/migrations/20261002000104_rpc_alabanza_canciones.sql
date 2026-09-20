-- Fase 11 (Diogo) · RPC de canciones de Alabanza. Mismo patrón que
-- app.create_communication (Fase 9, 20261001000600): app.* security definer
-- + wrapper public.* security invoker, revoke/grant explícito en las dos
-- capas, auditoría en la misma transacción.

create or replace function app.create_worship_song(
  p_church_id uuid,
  p_title text,
  p_subtitle text default null,
  p_author text default null,
  p_language text default null,
  p_lyrics text default null,
  p_chords text default null,
  p_original_key_root worship_key_root default null,
  p_original_key_mode worship_key_mode default null,
  p_default_key_root worship_key_root default null,
  p_default_key_mode worship_key_mode default null,
  p_bpm integer default null,
  p_time_signature text default null,
  p_notes text default null
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
  if not app.has_capability(p_church_id, 'worship.song.manage') then
    raise exception 'No tienes permiso para crear canciones.' using errcode = '42501';
  end if;

  if not app.module_enabled(p_church_id, 'worship') then
    raise exception 'El módulo de Alabanza no está habilitado para esta iglesia.' using errcode = '42501';
  end if;

  v_person_id := app.current_person_id(p_church_id);

  insert into worship_songs (
    church_id, title, subtitle, author, language, lyrics, chords,
    original_key_root, original_key_mode, default_key_root, default_key_mode,
    bpm, time_signature, notes, created_by_person_id, updated_by_person_id
  ) values (
    p_church_id, p_title, p_subtitle, p_author, p_language, p_lyrics, p_chords,
    p_original_key_root, p_original_key_mode, p_default_key_root, p_default_key_mode,
    p_bpm, p_time_signature, p_notes, v_person_id, v_person_id
  )
  returning id into v_id;

  perform app.write_audit_log(
    p_church_id, 'worship.song.created', 'worship_songs', v_id,
    jsonb_build_object('title', p_title)
  );

  return v_id;
end;
$$;

revoke all on function app.create_worship_song(
  uuid, text, text, text, text, text, text, worship_key_root, worship_key_mode,
  worship_key_root, worship_key_mode, integer, text, text
) from public, anon;
grant execute on function app.create_worship_song(
  uuid, text, text, text, text, text, text, worship_key_root, worship_key_mode,
  worship_key_root, worship_key_mode, integer, text, text
) to authenticated;

create or replace function public.create_worship_song(
  p_church_id uuid, p_title text, p_subtitle text default null, p_author text default null,
  p_language text default null, p_lyrics text default null, p_chords text default null,
  p_original_key_root worship_key_root default null, p_original_key_mode worship_key_mode default null,
  p_default_key_root worship_key_root default null, p_default_key_mode worship_key_mode default null,
  p_bpm integer default null, p_time_signature text default null, p_notes text default null
)
returns uuid
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.create_worship_song(
    p_church_id, p_title, p_subtitle, p_author, p_language, p_lyrics, p_chords,
    p_original_key_root, p_original_key_mode, p_default_key_root, p_default_key_mode,
    p_bpm, p_time_signature, p_notes
  );
$$;

revoke all on function public.create_worship_song(
  uuid, text, text, text, text, text, text, worship_key_root, worship_key_mode,
  worship_key_root, worship_key_mode, integer, text, text
) from public, anon;
grant execute on function public.create_worship_song(
  uuid, text, text, text, text, text, text, worship_key_root, worship_key_mode,
  worship_key_root, worship_key_mode, integer, text, text
) to authenticated;

-- ============================================================================
-- update_worship_song: solo canciones activas (una archivada se reactiva
-- explícitamente primero, nunca se edita "de paso").
-- ============================================================================

create or replace function app.update_worship_song(
  p_song_id uuid,
  p_church_id uuid,
  p_title text,
  p_subtitle text default null,
  p_author text default null,
  p_language text default null,
  p_lyrics text default null,
  p_chords text default null,
  p_original_key_root worship_key_root default null,
  p_original_key_mode worship_key_mode default null,
  p_default_key_root worship_key_root default null,
  p_default_key_mode worship_key_mode default null,
  p_bpm integer default null,
  p_time_signature text default null,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_status worship_song_status;
  v_person_id uuid;
begin
  if not app.has_capability(p_church_id, 'worship.song.manage') then
    raise exception 'No tienes permiso para editar canciones.' using errcode = '42501';
  end if;

  select status into v_status from worship_songs where id = p_song_id and church_id = p_church_id;
  if v_status is null then
    raise exception 'Canción no encontrada.' using errcode = 'P0002';
  end if;
  if v_status = 'archived' then
    raise exception 'No se puede editar una canción archivada.' using errcode = '22023';
  end if;

  v_person_id := app.current_person_id(p_church_id);

  update worship_songs set
    title = p_title,
    subtitle = p_subtitle,
    author = p_author,
    language = p_language,
    lyrics = p_lyrics,
    chords = p_chords,
    original_key_root = p_original_key_root,
    original_key_mode = p_original_key_mode,
    default_key_root = p_default_key_root,
    default_key_mode = p_default_key_mode,
    bpm = p_bpm,
    time_signature = p_time_signature,
    notes = p_notes,
    updated_by_person_id = v_person_id
  where id = p_song_id and church_id = p_church_id;

  perform app.write_audit_log(
    p_church_id, 'worship.song.updated', 'worship_songs', p_song_id,
    jsonb_build_object('title', p_title)
  );
end;
$$;

revoke all on function app.update_worship_song(
  uuid, uuid, text, text, text, text, text, text, worship_key_root, worship_key_mode,
  worship_key_root, worship_key_mode, integer, text, text
) from public, anon;
grant execute on function app.update_worship_song(
  uuid, uuid, text, text, text, text, text, text, worship_key_root, worship_key_mode,
  worship_key_root, worship_key_mode, integer, text, text
) to authenticated;

create or replace function public.update_worship_song(
  p_song_id uuid, p_church_id uuid, p_title text, p_subtitle text default null, p_author text default null,
  p_language text default null, p_lyrics text default null, p_chords text default null,
  p_original_key_root worship_key_root default null, p_original_key_mode worship_key_mode default null,
  p_default_key_root worship_key_root default null, p_default_key_mode worship_key_mode default null,
  p_bpm integer default null, p_time_signature text default null, p_notes text default null
)
returns void
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.update_worship_song(
    p_song_id, p_church_id, p_title, p_subtitle, p_author, p_language, p_lyrics, p_chords,
    p_original_key_root, p_original_key_mode, p_default_key_root, p_default_key_mode,
    p_bpm, p_time_signature, p_notes
  );
$$;

revoke all on function public.update_worship_song(
  uuid, uuid, text, text, text, text, text, text, worship_key_root, worship_key_mode,
  worship_key_root, worship_key_mode, integer, text, text
) from public, anon;
grant execute on function public.update_worship_song(
  uuid, uuid, text, text, text, text, text, text, worship_key_root, worship_key_mode,
  worship_key_root, worship_key_mode, integer, text, text
) to authenticated;

-- ============================================================================
-- archive_worship_song
-- ============================================================================

create or replace function app.archive_worship_song(p_song_id uuid, p_church_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not app.has_capability(p_church_id, 'worship.song.manage') then
    raise exception 'No tienes permiso para archivar canciones.' using errcode = '42501';
  end if;

  if not exists (select 1 from worship_songs where id = p_song_id and church_id = p_church_id) then
    raise exception 'Canción no encontrada.' using errcode = 'P0002';
  end if;

  update worship_songs
  set status = 'archived', archived_at = now(), updated_by_person_id = app.current_person_id(p_church_id)
  where id = p_song_id and church_id = p_church_id and status = 'active';

  perform app.write_audit_log(p_church_id, 'worship.song.archived', 'worship_songs', p_song_id, '{}'::jsonb);
end;
$$;

revoke all on function app.archive_worship_song(uuid, uuid) from public, anon;
grant execute on function app.archive_worship_song(uuid, uuid) to authenticated;

create or replace function public.archive_worship_song(p_song_id uuid, p_church_id uuid)
returns void
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.archive_worship_song(p_song_id, p_church_id);
$$;

revoke all on function public.archive_worship_song(uuid, uuid) from public, anon;
grant execute on function public.archive_worship_song(uuid, uuid) to authenticated;
