# Fase 11 (parte de Diogo) · Alabanza: contenido nativo — implementación

Estado: **IMPLEMENTADA** en `feature/diogo-fase-11-alabanza-contenido`, sobre `main` (`d498adc`).
Pendiente de validación expresa de Carlos y de integración en `main`. No confundir con **PRODUCCIÓN**:
migraciones aplicadas y `Vercel Production = Ready` comprobados no han ocurrido todavía.

Contrato de referencia: [CONTRATO-FASE-11-DIOGO.md](CONTRATO-FASE-11-DIOGO.md). Este documento describe
lo construido realmente; el contrato describe lo acordado antes de construirlo. Donde difieran, gana lo
escrito aquí como estado real, y se anota la razón del cambio.

## Alcance cubierto

- Canciones (`worship_songs`): título, subtítulo, autor, idioma, letra, cifra, tonalidad original y
  por defecto, BPM, compás, notas, estado (activa/archivada).
- Tonalidades normalizadas: enum `worship_key_root` (12 semitonos, una grafía por nota) +
  `worship_key_mode` (major/minor), nunca texto libre.
- Repertorios (`worship_repertoires`) y relación ordenada (`worship_repertoire_songs`), con tonalidad
  elegida por repertorio sin alterar la de la canción.
- Archivos: reutiliza `files` del núcleo (ADR 0008) vía RPC dedicada (`attach_worship_song_file`/
  `detach_worship_song_file`); primer consumidor real de esa tabla en el proyecto.
- Atril: vista de ejecución (letra, cifra, navegación, tamaño de texto persistido por dispositivo,
  pantalla completa), separada del editor de contenido.
- Capabilities: `worship.song.read`, `worship.song.manage`, `worship.repertoire.read`,
  `worship.repertoire.manage`, `worship.atril.use`.
- RLS forzada, FK tenant-safe, auditoría, tests de aislamiento cross-tenant.

## Fuera de alcance (confirmado, no tocado)

People/Auth, Activity, Assignments, scheduling, `activity_plan_items`, ensayos como Activity,
integración con Sonido/Multimedia, catálogo global de canciones, cualquier migración legacy o
dependencia de Calserv, roles/scopes/permisos finales (las capabilities concedidas aquí son la
propuesta mínima del contrato, no un cierre de RBAC).

## Modelo real

```text
worship_songs
  id, church_id, title, subtitle, author, language, lyrics, chords,
  original_key_root/mode, default_key_root/mode, bpm, time_signature,
  notes, status, created_by/updated_by_person_id, created_at, updated_at, archived_at

worship_repertoires
  id, church_id, name, description, status,
  created_by/updated_by_person_id, created_at, updated_at, archived_at

worship_repertoire_songs
  id, church_id, repertoire_id, song_id, position,
  selected_key_root/mode, created_at
  unique(repertoire_id, song_id), unique(repertoire_id, position)
  FK tenant-safe: (repertoire_id, church_id) y (song_id, church_id)
```

`status = 'archived' ⇔ archived_at is not null` en ambas tablas de contenido, mismo patrón de
consistencia que `activities_archived_consistency_check` (ADR 0017).

## RLS

`worship_songs`, `worship_repertoires`, `worship_repertoire_songs`: `enable row level security` +
`force row level security`, política de `select` a `authenticated` con `church_id` + capability de
lectura, sin política de escritura directa (toda mutación pasa por RPC). `revoke` explícito de
`insert/update/delete/truncate/select` a `anon` y de `insert/update/delete/truncate` a `authenticated`.

## RPC

Patrón de dos capas en todas las mutaciones: `app.*` (`security definer`, valida capability + módulo +
estado, escribe, audita) + wrapper `public.*` (`security invoker`). `revoke all ... from public, anon`
+ `grant execute ... to authenticated` en las dos capas — **hallazgo real durante la implementación**:
`revoke ... from public` (la pseudo-columna PUBLIC) no bastaba para quitarle el acceso a `anon` en este
proyecto; hacía falta el `anon` explícito en el propio `revoke`, exactamente el mismo problema que ya
forzó `20260930000300_hotfix_revokes_wrappers_publicos.sql` sobre wrappers de fases anteriores. Se
corrigió antes de cualquier commit — no quedó ninguna ventana con la superficie abierta en el historial
de esta rama.

RPCs: `create_worship_song`, `update_worship_song` (reemplaza el estado completo, no un parche
parcial — igual que `update_communication`), `archive_worship_song`, `create_worship_repertoire`,
`update_worship_repertoire`, `archive_worship_repertoire`, `add_worship_repertoire_song`,
`remove_worship_repertoire_song` (compacta posiciones sin huecos), `reorder_worship_repertoire_songs`
(exige el conjunto completo actual de ids, mismo criterio que `reorder_activity_plan_items`, ADR 0017;
conflicto → `55P03` → `DomainError` `CONFLICT`), `set_worship_repertoire_song_key`,
`attach_worship_song_file`, `detach_worship_song_file`.

## Capabilities

| Capability | `church_owner`/`church_admin`/`campus_admin` | Resto de roles |
|---|---|---|
| `worship.song.read` | Sí | No (propuesta del contrato, sin ampliar en esta implementación) |
| `worship.song.manage` | Sí | No |
| `worship.repertoire.read` | Sí | No |
| `worship.repertoire.manage` | Sí | No |
| `worship.atril.use` | Sí | No |

Reparto por rol más allá de estos tres queda explícitamente para Carlos (contrato §22, PROPUESTA PARA
CARLOS) — no se amplía unilateralmente en esta implementación.

## UI

Rutas: `/app/alabanza` (dashboard), `/app/alabanza/canciones` (+ `/nueva`, `/[id]`),
`/app/alabanza/repertorios` (+ `/nuevo`, `/[id]`), `/app/alabanza/atril`. Mismo patrón que Comunicación
(Fase 9): Server Components para lectura vía `requireTenantContext`, Server Actions con
`requireCapability` antes de cada escritura, `DomainError` capturado y mostrado como texto.

Editor de repertorio: reordenar con controles subir/bajar además de la posición en lista (no depende
solo de drag, ver contrato §35/§48). Atril: navegación anterior/siguiente (botones + flechas de
teclado), tamaño de texto persistido por dispositivo (`localStorage`, preferencia local, nunca
configuración de tenant), pantalla completa, lista rápida — sin ningún control administrativo visible
en esa pantalla. Cambiar la tonalidad mostrada en el atril es una preferencia de presentación
inmediata, nunca reescribe `chords` ni `selected_key_*`.

## Archivos: primer consumidor real de `files`

Ningún módulo anterior del proyecto escribía en `files` (confirmado por auditoría del repositorio antes
de implementar). Su política RLS (`files_manage_own_or_capability`) solo autoriza al propietario del
archivo o a quien tiene `people.manage` — ninguna encaja con "gestiona contenido de Alabanza". Se optó
por RPC dedicada (`attach_worship_song_file`/`detach_worship_song_file`, `security definer`,
comprobando `worship.song.manage` por dentro) en vez de tocar esa política para ampliarla, que habría
acoplado People con Worship sin necesidad.

La subida real de archivos (signed URL, bucket) no existe todavía en ningún módulo del proyecto — la UI
muestra la lista real (vacía por defecto) y permite quitar un archivo ya adjunto; adjuntar uno nuevo
queda documentado como pendiente de esa infraestructura compartida, no fingido con un botón que no sube
nada.

## Auditoría

`worship.song.created/updated/archived`, `worship.repertoire.created/updated/archived`,
`worship.repertoire.song_added/song_removed/reordered`, `worship.song.file_attached/file_detached`.
Metadata mínima (título, ids relevantes), nunca letra/cifra completa en el payload.

## Tests

`supabase/tests/fase11_alabanza_test.sql`: 45 aserciones — CRUD completo de canciones y repertorios,
validación de tonalidad (nota+modo siempre juntos), BPM fuera de rango, relación ordenada (posición
estable, reorder exige el conjunto completo, quitar compacta sin huecos), canción archivada rechazada
al añadirse a un repertorio o al editarse, tonalidad de repertorio no altera la de la canción,
aislamiento cross-tenant (lectura, edición, archivado, FK de la relación), RLS forzada, superficie
pública/anon revocada, capability ausente, auditoría, archivos.

**1408/1408 tests del repositorio completo en verde** tras `supabase db reset --local` +
`supabase test db`. `supabase db diff --local` sin cambios pendientes.

## Bugs reales encontrados y corregidos durante la implementación

1. **Sintaxis de constraint inválida**: `check (status = 'archived') = (archived_at is not null)` no es
   SQL válido sin paréntesis alrededor de toda la expresión booleana — corregido a
   `check ((status = 'archived') = (archived_at is not null))` en ambas tablas.
2. **Revoke incompleto en wrappers públicos**: ver sección RPC arriba. Corregido en la primera pasada
   de implementación, antes de cualquier commit — verificado con `hotfix_revokes_publicos_test.sql`
   (que ya existía en el repositorio con este propósito exacto), en verde en todos los commits de esta
   rama.
3. **`55P03` sin mapear a `DomainError`**: el código de conflicto de reorder no tenía traducción en
   `src/server/activities/rpc.ts`, caería en `INTERNAL_ERROR` genérico. Corregido con una entrada
   aditiva (`CONFLICT`), sin tocar el resto de mapeos ya usados por otras fases.
4. **Tests con semántica incorrecta de `update_worship_song`**: el test inicial asumía una actualización
   parcial (solo título), pero la RPC reemplaza el estado completo por diseño (igual que
   `update_communication` en Fase 9) — el test se corrigió para reenviar todos los campos, no la RPC.

## Deuda técnica real

- Subida real de archivos (signed URL/storage) no implementada — pendiente de infraestructura
  compartida del núcleo, no específica de Alabanza.
- `resource_maintenance`-equivalente para instrumentos/equipo de sonido: no aplica a esta fase
  (pertenece a Facilities, Fase 10, ya con su propio contrato).
- Sin editor de estructura por secciones (verso/coro/puente) para letra/cifra: texto plano con
  convención simple de corchetes, por decisión explícita del contrato (§9 del encargo original, sin
  parser musical).

## Contratos pendientes con Carlos

- Relación `Activity ↔ Song`: forma exacta no decidida aquí (contrato §15/§21). `worship_songs.id` y
  `worship_repertoires.id` son estables y consultables desde ahora.
- Reparto de capabilities por rol más allá de `church_owner`/`church_admin`/`campus_admin`.
- Versionado de canciones vs. contenido histórico de Activity (contrato §14, marcado explícitamente
  como decisión compartida).
- Ensayos como Activity: el tipo `rehearsal` ya existe en `activity_type` desde la Fase 0; la
  integración con Alabanza (qué repertorio usa un ensayo) es la misma relación que con un servicio, sin
  necesitar un concepto de contenido nuevo.

## Estado de la integración global de la Fase 11

**Solo la parte de Diogo.** La parte de Carlos (identidad, actividades, programación, permisos
finales) no se ha tocado ni implementado en esta rama. La Fase 11 completa requiere cierre conjunto,
según `docs/REPARTO-CARLOS-DIOGO.md` §3/§4. No se declara `FASE 11 COMPLETADA` en ningún documento por
este trabajo.
