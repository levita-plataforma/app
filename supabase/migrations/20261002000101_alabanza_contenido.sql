-- Fase 11 (Diogo) · Alabanza: contenido nativo (canciones, tonalidades,
-- repertorios). Ver docs/CONTRATO-FASE-11-DIOGO.md.
--
-- Calserv NO es fuente de datos ni de schema en esta fase (ver corrección de
-- alcance del 20 de septiembre de 2026 en el propio contrato): este es un
-- módulo de contenido nativo, diseñado desde las necesidades reales de
-- LEVITA, no una migración desde ningún sistema externo.

-- Tonalidad: 12 notas cromáticas en notación anglosajona, una sola grafía
-- por semitono (sin duplicar C#/Db como dos valores distintos) + modalidad
-- como columna separada. Evita el problema que el propio contrato señala:
-- "Do", "C", "C major" y "Cmaj" no deben poder coexistir como valores
-- distintos del mismo concepto.
create type worship_key_root as enum (
  'C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'
);

comment on type worship_key_root is
  'Nota raíz de una tonalidad, notación anglosajona, una sola grafía por semitono (Db se guarda como C#, D# como Eb, etc.). Ver docs/CONTRATO-FASE-11-DIOGO.md §5.';

create type worship_key_mode as enum ('major', 'minor');

create type worship_song_status as enum ('active', 'archived');

create table worship_songs (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  title text not null check (btrim(title) <> '' and char_length(title) <= 200),
  subtitle text check (subtitle is null or char_length(subtitle) <= 200),
  author text check (author is null or char_length(author) <= 200),
  language text check (language is null or char_length(language) <= 40),
  -- Texto plano con una convención simple de marcado de acordes
  -- ([C]texto[G]...), nunca HTML arbitrario: ver contrato §4.2/§8. Sin
  -- parser musical ni editor complejo en esta fase.
  lyrics text check (lyrics is null or char_length(lyrics) <= 20000),
  chords text check (chords is null or char_length(chords) <= 20000),
  original_key_root worship_key_root,
  original_key_mode worship_key_mode,
  default_key_root worship_key_root,
  default_key_mode worship_key_mode,
  -- Rango razonable de BPM: un valor de 0 o negativo no es una tonalidad
  -- válida, y por encima de 300 no corresponde a ningún uso real de este
  -- campo (double-time extremo). Ver contrato §11.
  bpm integer check (bpm is null or (bpm > 0 and bpm <= 300)),
  time_signature text check (time_signature is null or char_length(time_signature) <= 10),
  notes text check (notes is null or char_length(notes) <= 2000),
  status worship_song_status not null default 'active',
  created_by_person_id uuid,
  updated_by_person_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check ((status = 'archived') = (archived_at is not null)),
  -- Modo y nota siempre juntos o ninguno de los dos: nunca una tonalidad a
  -- medias (ver contrato §5.1).
  check ((original_key_root is null) = (original_key_mode is null)),
  check ((default_key_root is null) = (default_key_mode is null))
);

comment on table worship_songs is
  'Canción de Alabanza, contenido nativo por tenant (Fase 11, Diogo). Sin catálogo global en esta fase. Ver docs/CONTRATO-FASE-11-DIOGO.md.';
comment on column worship_songs.lyrics is
  'Texto plano, convención [Acorde]letra para cifra intercalada si se usa. Nunca HTML.';

alter table worship_songs add constraint worship_songs_id_unique unique (id, church_id);

create index worship_songs_church_status_idx on worship_songs (church_id, status);
create index worship_songs_church_title_idx on worship_songs (church_id, lower(title));

create trigger worship_songs_set_updated_at
  before update on worship_songs
  for each row execute function app.set_updated_at();

alter table worship_songs enable row level security;
alter table worship_songs force row level security;

-- ---------------------------------------------------------------------------

create table worship_repertoires (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  name text not null check (btrim(name) <> '' and char_length(name) <= 200),
  description text check (description is null or char_length(description) <= 2000),
  status worship_song_status not null default 'active',
  created_by_person_id uuid,
  updated_by_person_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check ((status = 'archived') = (archived_at is not null))
);

comment on table worship_repertoires is
  'Colección persistente y reutilizable de canciones (Fase 11). Distinta de una Activity/servicio concreto: existe con independencia de que se use o no en programación. Ver docs/CONTRATO-FASE-11-DIOGO.md §6.';

alter table worship_repertoires add constraint worship_repertoires_id_unique unique (id, church_id);

create index worship_repertoires_church_status_idx on worship_repertoires (church_id, status);

create trigger worship_repertoires_set_updated_at
  before update on worship_repertoires
  for each row execute function app.set_updated_at();

alter table worship_repertoires enable row level security;
alter table worship_repertoires force row level security;

-- ---------------------------------------------------------------------------

create table worship_repertoire_songs (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  repertoire_id uuid not null,
  song_id uuid not null,
  position integer not null check (position > 0),
  -- Tonalidad elegida para este repertorio concreto. No altera
  -- worship_songs.default_key_*: ver contrato §16, ejemplo explícito.
  selected_key_root worship_key_root,
  selected_key_mode worship_key_mode,
  created_at timestamptz not null default now(),
  check ((selected_key_root is null) = (selected_key_mode is null)),
  -- FK tenant-safe: el repertorio y la canción deben pertenecer a la MISMA
  -- iglesia que la propia fila de relación (ADR 0014). Esto hace
  -- estructuralmente imposible que un repertorio de la iglesia A contenga
  -- una canción de la iglesia B.
  foreign key (repertoire_id, church_id) references worship_repertoires (id, church_id) on delete cascade,
  foreign key (song_id, church_id) references worship_songs (id, church_id),
  unique (repertoire_id, song_id),
  unique (repertoire_id, position)
);

comment on table worship_repertoire_songs is
  'Relación ordenada repertorio -> canciones, con tonalidad elegida por repertorio. Orden explícito (position), nunca implícito por fecha de inserción. Ver docs/CONTRATO-FASE-11-DIOGO.md §6, §15.';

create index worship_repertoire_songs_repertoire_idx on worship_repertoire_songs (repertoire_id, position);
create index worship_repertoire_songs_song_idx on worship_repertoire_songs (song_id);

alter table worship_repertoire_songs enable row level security;
alter table worship_repertoire_songs force row level security;
