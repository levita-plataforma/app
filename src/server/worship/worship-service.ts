import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { callActivityRpc, toDomainError } from "@/server/activities/rpc";

/**
 * Alabanza: contenido nativo (Fase 11, Diogo). Ver docs/CONTRATO-FASE-11-DIOGO.md.
 * Calserv NO es fuente de datos: este módulo se diseñó desde las necesidades
 * reales de LEVITA, sin ninguna migración externa.
 *
 * Lecturas con el cliente del usuario (RLS decide qué ve, exige
 * worship.song.read/worship.repertoire.read); las escrituras pasan siempre
 * por RPC (app.* + wrapper public.*), nunca insert/update/delete directo.
 */

export const WORSHIP_KEY_ROOTS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"] as const;
export type WorshipKeyRoot = (typeof WORSHIP_KEY_ROOTS)[number];

export const WORSHIP_KEY_MODES = ["major", "minor"] as const;
export type WorshipKeyMode = (typeof WORSHIP_KEY_MODES)[number];

export type WorshipKey = { root: WorshipKeyRoot; mode: WorshipKeyMode } | null;

export const WORSHIP_STATUSES = ["active", "archived"] as const;
export type WorshipStatus = (typeof WORSHIP_STATUSES)[number];

export type WorshipSong = {
  id: string;
  title: string;
  subtitle: string | null;
  author: string | null;
  language: string | null;
  lyrics: string | null;
  chords: string | null;
  originalKey: WorshipKey;
  defaultKey: WorshipKey;
  bpm: number | null;
  timeSignature: string | null;
  notes: string | null;
  status: WorshipStatus;
  createdAt: string;
  updatedAt: string;
};

type WorshipSongRow = {
  id: string;
  title: string;
  subtitle: string | null;
  author: string | null;
  language: string | null;
  lyrics: string | null;
  chords: string | null;
  original_key_root: WorshipKeyRoot | null;
  original_key_mode: WorshipKeyMode | null;
  default_key_root: WorshipKeyRoot | null;
  default_key_mode: WorshipKeyMode | null;
  bpm: number | null;
  time_signature: string | null;
  notes: string | null;
  status: WorshipStatus;
  created_at: string;
  updated_at: string;
};

function mapKey(root: WorshipKeyRoot | null, mode: WorshipKeyMode | null): WorshipKey {
  if (!root || !mode) return null;
  return { root, mode };
}

function mapSong(row: WorshipSongRow): WorshipSong {
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    author: row.author,
    language: row.language,
    lyrics: row.lyrics,
    chords: row.chords,
    originalKey: mapKey(row.original_key_root, row.original_key_mode),
    defaultKey: mapKey(row.default_key_root, row.default_key_mode),
    bpm: row.bpm,
    timeSignature: row.time_signature,
    notes: row.notes,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SONG_COLUMNS =
  "id, title, subtitle, author, language, lyrics, chords, original_key_root, original_key_mode, default_key_root, default_key_mode, bpm, time_signature, notes, status, created_at, updated_at";

export type WorshipSongListFilters = {
  status?: WorshipStatus;
  search?: string;
  limit?: number;
};

export async function listWorshipSongs(
  churchId: string,
  filters: WorshipSongListFilters = {},
): Promise<WorshipSong[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("worship_songs")
    .select(SONG_COLUMNS)
    .eq("church_id", churchId)
    .order("title", { ascending: true });

  query = filters.status ? query.eq("status", filters.status) : query.eq("status", "active");
  if (filters.search) query = query.or(`title.ilike.%${filters.search}%,author.ilike.%${filters.search}%`);
  if (filters.limit) query = query.limit(filters.limit);

  const { data, error } = await query;
  if (error) throw toDomainError(error, "No se pudieron cargar las canciones.");
  return ((data ?? []) as WorshipSongRow[]).map(mapSong);
}

export async function getWorshipSong(churchId: string, songId: string): Promise<WorshipSong | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("worship_songs")
    .select(SONG_COLUMNS)
    .eq("church_id", churchId)
    .eq("id", songId)
    .maybeSingle();

  if (error) throw toDomainError(error, "No se pudo cargar la canción.");
  return data ? mapSong(data as WorshipSongRow) : null;
}

export type WorshipSongInput = {
  title: string;
  subtitle?: string | null;
  author?: string | null;
  language?: string | null;
  lyrics?: string | null;
  chords?: string | null;
  originalKey?: WorshipKey;
  defaultKey?: WorshipKey;
  bpm?: number | null;
  timeSignature?: string | null;
  notes?: string | null;
};

function songRpcArgs(churchId: string, input: WorshipSongInput) {
  return {
    p_church_id: churchId,
    p_title: input.title,
    p_subtitle: input.subtitle ?? null,
    p_author: input.author ?? null,
    p_language: input.language ?? null,
    p_lyrics: input.lyrics ?? null,
    p_chords: input.chords ?? null,
    p_original_key_root: input.originalKey?.root ?? null,
    p_original_key_mode: input.originalKey?.mode ?? null,
    p_default_key_root: input.defaultKey?.root ?? null,
    p_default_key_mode: input.defaultKey?.mode ?? null,
    p_bpm: input.bpm ?? null,
    p_time_signature: input.timeSignature ?? null,
    p_notes: input.notes ?? null,
  };
}

export async function createWorshipSong(churchId: string, input: WorshipSongInput): Promise<string> {
  return callActivityRpc<string>("create_worship_song", songRpcArgs(churchId, input), "No se pudo crear la canción.");
}

export async function updateWorshipSong(churchId: string, songId: string, input: WorshipSongInput): Promise<void> {
  await callActivityRpc<void>(
    "update_worship_song",
    { p_song_id: songId, ...songRpcArgs(churchId, input) },
    "No se pudo actualizar la canción.",
  );
}

export async function archiveWorshipSong(churchId: string, songId: string): Promise<void> {
  await callActivityRpc<void>(
    "archive_worship_song",
    { p_song_id: songId, p_church_id: churchId },
    "No se pudo archivar la canción.",
  );
}

// ---------------------------------------------------------------------------
// Repertorios
// ---------------------------------------------------------------------------

export type WorshipRepertoire = {
  id: string;
  name: string;
  description: string | null;
  status: WorshipStatus;
  createdAt: string;
  updatedAt: string;
};

type WorshipRepertoireRow = {
  id: string;
  name: string;
  description: string | null;
  status: WorshipStatus;
  created_at: string;
  updated_at: string;
};

function mapRepertoire(row: WorshipRepertoireRow): WorshipRepertoire {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const REPERTOIRE_COLUMNS = "id, name, description, status, created_at, updated_at";

export async function listWorshipRepertoires(
  churchId: string,
  filters: { status?: WorshipStatus } = {},
): Promise<WorshipRepertoire[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("worship_repertoires")
    .select(REPERTOIRE_COLUMNS)
    .eq("church_id", churchId)
    .order("updated_at", { ascending: false });

  query = filters.status ? query.eq("status", filters.status) : query.eq("status", "active");

  const { data, error } = await query;
  if (error) throw toDomainError(error, "No se pudieron cargar los repertorios.");
  return ((data ?? []) as WorshipRepertoireRow[]).map(mapRepertoire);
}

export async function getWorshipRepertoire(churchId: string, repertoireId: string): Promise<WorshipRepertoire | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("worship_repertoires")
    .select(REPERTOIRE_COLUMNS)
    .eq("church_id", churchId)
    .eq("id", repertoireId)
    .maybeSingle();

  if (error) throw toDomainError(error, "No se pudo cargar el repertorio.");
  return data ? mapRepertoire(data as WorshipRepertoireRow) : null;
}

export type WorshipRepertoireSongItem = {
  id: string;
  position: number;
  selectedKey: WorshipKey;
  song: WorshipSong;
};

type WorshipRepertoireSongRow = {
  id: string;
  position: number;
  selected_key_root: WorshipKeyRoot | null;
  selected_key_mode: WorshipKeyMode | null;
  worship_songs: WorshipSongRow | WorshipSongRow[] | null;
};

export async function listWorshipRepertoireSongs(
  churchId: string,
  repertoireId: string,
): Promise<WorshipRepertoireSongItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("worship_repertoire_songs")
    .select(`id, position, selected_key_root, selected_key_mode, worship_songs (${SONG_COLUMNS})`)
    .eq("church_id", churchId)
    .eq("repertoire_id", repertoireId)
    .order("position", { ascending: true });

  if (error) throw toDomainError(error, "No se pudieron cargar las canciones del repertorio.");

  return ((data ?? []) as unknown as WorshipRepertoireSongRow[]).map((row) => {
    const songRow = Array.isArray(row.worship_songs) ? row.worship_songs[0] : row.worship_songs;
    return {
      id: row.id,
      position: row.position,
      selectedKey: mapKey(row.selected_key_root, row.selected_key_mode),
      song: mapSong(songRow as WorshipSongRow),
    };
  });
}

export async function createWorshipRepertoire(
  churchId: string,
  input: { name: string; description?: string | null },
): Promise<string> {
  return callActivityRpc<string>(
    "create_worship_repertoire",
    { p_church_id: churchId, p_name: input.name, p_description: input.description ?? null },
    "No se pudo crear el repertorio.",
  );
}

export async function updateWorshipRepertoire(
  churchId: string,
  repertoireId: string,
  input: { name: string; description?: string | null },
): Promise<void> {
  await callActivityRpc<void>(
    "update_worship_repertoire",
    { p_repertoire_id: repertoireId, p_church_id: churchId, p_name: input.name, p_description: input.description ?? null },
    "No se pudo actualizar el repertorio.",
  );
}

export async function archiveWorshipRepertoire(churchId: string, repertoireId: string): Promise<void> {
  await callActivityRpc<void>(
    "archive_worship_repertoire",
    { p_repertoire_id: repertoireId, p_church_id: churchId },
    "No se pudo archivar el repertorio.",
  );
}

export async function addWorshipRepertoireSong(
  churchId: string,
  repertoireId: string,
  songId: string,
  selectedKey?: WorshipKey,
): Promise<string> {
  return callActivityRpc<string>(
    "add_worship_repertoire_song",
    {
      p_repertoire_id: repertoireId,
      p_church_id: churchId,
      p_song_id: songId,
      p_selected_key_root: selectedKey?.root ?? null,
      p_selected_key_mode: selectedKey?.mode ?? null,
    },
    "No se pudo añadir la canción al repertorio.",
  );
}

export async function removeWorshipRepertoireSong(churchId: string, repertoireSongId: string): Promise<void> {
  await callActivityRpc<void>(
    "remove_worship_repertoire_song",
    { p_repertoire_song_id: repertoireSongId, p_church_id: churchId },
    "No se pudo quitar la canción del repertorio.",
  );
}

export async function reorderWorshipRepertoireSongs(
  churchId: string,
  repertoireId: string,
  orderedIds: string[],
): Promise<void> {
  await callActivityRpc<void>(
    "reorder_worship_repertoire_songs",
    { p_repertoire_id: repertoireId, p_church_id: churchId, p_ordered_ids: orderedIds },
    "No se pudo reordenar el repertorio.",
  );
}

export async function setWorshipRepertoireSongKey(
  churchId: string,
  repertoireSongId: string,
  selectedKey: WorshipKey,
): Promise<void> {
  if (!selectedKey) throw new Error("selectedKey es obligatorio para fijar la tonalidad de un repertorio.");
  await callActivityRpc<void>(
    "set_worship_repertoire_song_key",
    {
      p_repertoire_song_id: repertoireSongId,
      p_church_id: churchId,
      p_selected_key_root: selectedKey.root,
      p_selected_key_mode: selectedKey.mode,
    },
    "No se pudo cambiar la tonalidad elegida.",
  );
}

// ---------------------------------------------------------------------------
// Archivos (files del núcleo, entity_type = 'song')
// ---------------------------------------------------------------------------

export async function attachWorshipSongFile(
  churchId: string,
  songId: string,
  file: { bucket: string; objectPath: string; mimeType?: string | null; sizeBytes?: number | null; checksum?: string | null },
): Promise<string> {
  return callActivityRpc<string>(
    "attach_worship_song_file",
    {
      p_song_id: songId,
      p_church_id: churchId,
      p_bucket: file.bucket,
      p_object_path: file.objectPath,
      p_mime_type: file.mimeType ?? null,
      p_size_bytes: file.sizeBytes ?? null,
      p_checksum: file.checksum ?? null,
    },
    "No se pudo adjuntar el archivo.",
  );
}

export async function detachWorshipSongFile(churchId: string, fileId: string): Promise<void> {
  await callActivityRpc<void>(
    "detach_worship_song_file",
    { p_file_id: fileId, p_church_id: churchId },
    "No se pudo quitar el archivo.",
  );
}

export type WorshipSongFile = {
  id: string;
  bucket: string;
  objectPath: string;
  mimeType: string | null;
  sizeBytes: number | null;
};

export async function listWorshipSongFiles(churchId: string, songId: string): Promise<WorshipSongFile[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("files")
    .select("id, bucket, object_path, mime_type, size_bytes")
    .eq("church_id", churchId)
    .eq("entity_type", "song")
    .eq("entity_id", songId)
    .eq("status", "active");

  if (error) throw toDomainError(error, "No se pudieron cargar los archivos de la canción.");
  return (data ?? []).map((row) => ({
    id: row.id,
    bucket: row.bucket,
    objectPath: row.object_path,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
  }));
}

// ---------------------------------------------------------------------------
// KPIs del dashboard
// ---------------------------------------------------------------------------

export type WorshipKpis = {
  activeSongs: number;
  repertoires: number;
};

export async function getWorshipKpis(churchId: string): Promise<WorshipKpis> {
  const supabase = await createSupabaseServerClient();

  const [songs, repertoires] = await Promise.all([
    supabase.from("worship_songs").select("id", { count: "exact", head: true }).eq("church_id", churchId).eq("status", "active"),
    supabase.from("worship_repertoires").select("id", { count: "exact", head: true }).eq("church_id", churchId).eq("status", "active"),
  ]);

  if (songs.error) throw toDomainError(songs.error, "No se pudieron cargar las métricas de Alabanza.");
  if (repertoires.error) throw toDomainError(repertoires.error, "No se pudieron cargar las métricas de Alabanza.");

  return {
    activeSongs: songs.count ?? 0,
    repertoires: repertoires.count ?? 0,
  };
}
