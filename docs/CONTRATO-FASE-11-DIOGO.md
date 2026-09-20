# Contrato de la Fase 11 (parte de Diogo) · Alabanza: contenido nativo en LEVITA

Estado: **IMPLEMENTADA en `feature/diogo-fase-11-alabanza-contenido`, pendiente de validación de
Carlos y de integración en `main`.** Ver [FASE-11-ALABANZA-DIOGO.md](FASE-11-ALABANZA-DIOGO.md) para
el detalle de implementación real frente a este contrato. Sigue el mismo criterio que
[CONTRATO-FASE-7.md](CONTRATO-FASE-7.md) y [CONTRATO-FASE-10.md](CONTRATO-FASE-10.md): lo que no está
aquí, o sobra o falta el acuerdo.

Punto de partida real: `main` en `d498adc`. Migraciones `20261002000100` a `20261002000600`.

## Corrección de alcance (20 de septiembre de 2026)

Una versión anterior de este documento trataba Calserv como fuente de datos a migrar (schema,
repositorio, legacy IDs, dry-run, cutover, rollback desde Calserv). **Esa versión queda descartada.**
Decisión confirmada:

- **Calserv no forma parte del repositorio LEVITA.** No existe un repositorio Calserv disponible ni
  debe esperarse uno.
- **No se bloquea la Fase 11 por acceso a Calserv.**
- **No se diseña ninguna migración desde Calserv.**
- Cualquier referencia a Calserv en documentación (incluida `docs/14-referencia-uiux-alabanza.md`) se
  trata como **referencia histórica/funcional** — comportamientos que conviene conservar, conceptos que
  ya se conocen del dominio (qué es un atril, qué es un repertorio) — nunca como **fuente de datos**,
  **fuente de schema**, **repositorio a migrar** ni **sistema legacy obligatorio**.

**La parte de Diogo de la Fase 11 pasa a ser: ALABANZA — CONTENIDO NATIVO EN LEVITA.** Se diseña el
módulo de contenido (canciones, tonalidades, repertorios, atril, archivos) desde las necesidades reales
de LEVITA como plataforma multi-tenant, con el mismo nivel de precisión que los contratos de Fase 7/9/10,
sin depender de inspeccionar ningún sistema externo.

Toda afirmación de este documento que no esté respaldada por código real de `levita-app` se marca
explícitamente como **[REQUISITO]** (necesidad de producto ya fijada en documentación vigente del
proyecto) o **[PROPUESTA]** (diseño de este contrato, a validar) — nunca como "modelo legacy
existente".

---

## 1. Alcance

**Dentro** (responsabilidad de Diogo según `docs/REPARTO-CARLOS-DIOGO.md` §1 — *"F11 · Alabanza:
preparación y contenido | Diogo — propuesto, después de F9"* — reinterpretado sin la dependencia de
Calserv, según la corrección de alcance de arriba):

- Modelo conceptual de canciones (`worship_songs`), tonalidades, repertorios
  (`worship_repertoires`/`worship_repertoire_songs`) y archivos asociados (`worship_song_files`, vía
  `files` del núcleo).
- Experiencia de atril (ejecución musical) y su editor de contenido, como dos superficies distintas.
- UX de contenido: rutas, dashboard, búsqueda, archivado.
- Contratos de datos que Carlos necesitará consumir para integrar con Activity/programación.
- Propuesta (no cierre) de capabilities del dominio de contenido.
- Especificación de pruebas del dominio de contenido (aislamiento tenant, CRUD, archivado).

**Fuera** (responsabilidad de Carlos, o explícitamente fuera de esta fase):

- People/Auth, membresía de equipo.
- Activity, Assignments, scheduling, planificación de servicio.
- Roles, scopes y permisos finales (las capabilities de este documento son **PROPUESTA**, no decisión
  cerrada — §16).
- Ensayos como Activity (el contrato de contenido que un ensayo podrá consumir sí se define aquí; su
  programación no).
- Integración operativa con Sonido/Multimedia.
- Cualquier migración desde un sistema legacy — no existe ninguna en esta fase.

El cierre final de la Fase 11 sigue siendo conjunto (Carlos + Diogo). Este documento cierra la mitad de
contenido nativo, no la fase completa.

---

## 2. Fuente de verdad para este contrato

Única fuente técnica válida para diseñar esta parte de la Fase 11:

- repositorio `levita-app` actual (`main`, `d498adc`);
- `supabase/migrations/` reales;
- `src/lib/supabase/database.types.ts`;
- ADRs vigentes (`docs/adr/`);
- documentación vigente del proyecto;
- decisiones ya confirmadas (`docs/07-decisiones.md`, `docs/13-plan-por-fases.md`).

`docs/14-referencia-uiux-alabanza.md` se usa **solo** como mapa de comportamientos y conceptos
funcionales a considerar (qué es un atril, qué distingue una canción de un repertorio) — nunca como
evidencia de un schema a reproducir. Cada vez que este documento reference algo de ese archivo, va
marcado **[REQUISITO]** (si ya está confirmado como necesidad real del producto LEVITA en otro
documento vigente) o **[PROPUESTA]** (si es una idea de diseño de este contrato inspirada en ese
comportamiento, sin confirmación adicional).

---

## 3. Contexto real ya existente en LEVITA (verificado por inspección directa)

- **Módulo `worship`** ya registrado en el catálogo (`supabase/migrations/20260916000600_modulos_entitlements_flags.sql:20`,
  `('worship', 'Alabanza', 3)`), con navegación ya apuntando a `/app/alabanza`
  (`src/components/shell/nav-items.ts:56`, `moduleKey: "worship"`) y colores de acento ya definidos
  (`ModuleGrid.tsx`). El placeholder actual (`src/app/(app)/app/alabanza/page.tsx`) se sustituye, no se
  crea una ruta nueva.
- **`activity_type` ya incluye `'rehearsal'`** desde la Fase 0
  (`supabase/migrations/20260916000500_activities.sql:6`) — si Carlos decide modelar ensayos como
  Activity, no hace falta ninguna migración de esquema para el tipo.
- **`activity_plan_items.item_type` ya incluye `'song'`** (Fase 4, ADR 0017 §14), documentado
  explícitamente en ese ADR como *"un bloque, no un catálogo musical"* — es texto libre en el orden del
  servicio, sin ninguna relación con una tabla de canciones real. Este contrato no lo toca ni asume que
  se convertirá automáticamente en una referencia a `worship_songs`; es una decisión de integración de
  Carlos (§15).
- **`files`** (ADR 0008) ya nombra explícitamente "Alabanza/partituras" como consumidor previsto —
  capa de almacenamiento a reutilizar sin excepción (§13).
- **`tags`/`custom_field_definitions`** (núcleo, Fase 0) disponibles para segmentación de canciones sin
  construir un sistema paralelo.
- **`Worship ──> Serving + People + Events`** (`docs/18-modulos-funcionales.md` §14): la dependencia de
  Worship sobre Activity/Events/Serving ya está declarada — confirma que la integración de programación
  es, por diseño del propio catálogo de módulos, territorio de otras fases/personas, no de este
  contrato de contenido.

---

## 4. Modelo de canción (`worship_songs`)

### 4.1 Clasificación de campos

| Campo | Clasificación | Justificación |
|---|---|---|
| `id` | **OBLIGATORIO** | Identidad. |
| `church_id` | **OBLIGATORIO** | Tenant-aware sin excepción (§7). |
| `title` | **OBLIGATORIO** | Núcleo mínimo de cualquier canción. |
| `subtitle` | **OPCIONAL** | Título alternativo/traducción — útil para búsqueda, no bloquea si se pospone. |
| `author` | **OBLIGATORIO** | Atribución; necesario para cualquier futura gestión de derechos, aunque esta fase no la resuelva. |
| `language` | **OPCIONAL** | Relevante en una plataforma multi-iglesia/multi-país; no bloquea el MVP. |
| `lyrics` | **OBLIGATORIO** | Sin letra, no hay atril que mostrar — es el contenido mínimo de la entidad. |
| `chords` | **OBLIGATORIO** | Mismo criterio que `lyrics`: sin cifra, la mitad del caso de uso del atril no existe. |
| `original_key` | **OBLIGATORIO** | Tonalidad en la que se compuso/registró — ver §5. |
| `default_key` | **OBLIGATORIO** | Tonalidad por defecto a mostrar en el atril si nadie transporta explícitamente — ver §5.3, cierra la pregunta "¿son `original_key` y `default_key` suficientes para F11?": **sí**, ambas cubren el caso de uso completo del MVP sin necesitar una tercera columna. |
| `bpm` | **OPCIONAL** | Útil para Sonido/Multimedia (§17) y para el propio músico; no bloquea. |
| `time_signature` | **OPCIONAL** | Mismo criterio que `bpm`. |
| `notes` | **OPCIONAL** | Texto libre no sensible — nunca notas pastorales o de otro dominio (§19). |
| `status` | **OBLIGATORIO** | Activo/archivado — toda entidad con historial lo necesita (`docs/15-nucleo-plataforma.md` §12). |
| `created_at`, `updated_at` | **OBLIGATORIO** | Convención transversal del núcleo. |
| `archived_at` | **OBLIGATORIO** | Igual que `status`; consistencia `status='archived' ⇔ archived_at is not null`, mismo patrón que `activities_archived_consistency_check` (ADR 0017). |

**FUERA DE ALCANCE** (no se crean estas columnas en F11, sin excepción):

- Cualquier campo de licenciamiento/copyright estructurado (ej. `ccli_number`, `license_status`): no
  hay decisión de producto sobre gestión de derechos en esta fase; introducir el campo sin una función
  real que lo use sería especular.
- `external_links`: valorado y descartado para el MVP — no aporta al caso de uso mínimo (atril +
  repertorio) y no hay decisión de qué tipo de enlace se permitiría ni con qué validación.
- Versionado/historial de contenido (`song_versions` o similar): ver §14 — fuera de alcance de F11,
  documentado como **CONTRATO COMPARTIDO** con Carlos por tocar programación histórica.

### 4.2 Formato de `lyrics`/`chords`

**[PROPUESTA]**: texto estructurado simple tipo Markdown-like (líneas de letra intercaladas con
anotaciones de acorde en la posición correspondiente, sin HTML arbitrario), almacenado como `text`, no
como `jsonb` estructurado por secciones. Justificación:

- No se construye un editor musical complejo ni un parser propietario (instrucción explícita §9 del
  encargo).
- HTML arbitrario introduce riesgo de XSS si se renderiza sin sanitizar y complejidad de sanitización
  si se permite; texto plano con una convención simple de marcado (ej. acordes entre corchetes
  `[C]Letra de la canción[G]...`) es suficiente para el caso de uso del atril y evita ese riesgo por
  diseño.
- Si en el futuro aparece necesidad real de estructura por sección (verso/coro/puente navegable), es
  una evolución de este campo, no una razón para sobre-diseñarlo ahora sin ese requisito confirmado.

---

## 5. Tonalidades

### 5.1 Representación [PROPUESTA]

Enum cerrado con las 12 tonalidades cromáticas en notación anglosajona, sin duplicar equivalencias
enarmónicas como valores distintos:

```text
C, C#, D, Eb, E, F, F#, G, Ab, A, Bb, B
```

(`C#`/`Db`, `D#`/`Eb`, etc. se normalizan a una sola forma por valor — la tarea sugiere ambas grafías
para algunos semitonos; se fija una única representación canónica por nota para evitar que "C#" y "Db"
sean valores distintos del mismo tono, exactamente el problema de inconsistencia que la propia tarea
pide evitar en §8/§9 del encargo original).

Modalidad (mayor/menor) como columna separada, no concatenada en el mismo valor: `key_root` (una de
las 12 notas) + `key_mode` (`'major'`/`'minor'`), o un tipo compuesto equivalente — la decisión exacta
de tipo SQL (enum + enum, o un solo enum de 24 valores) es detalle de implementación, no de este
contrato; lo que se fija aquí es que **modalidad y nota nunca comparten una sola columna de texto
libre**.

### 5.2 `original_key` y `default_key`: suficientes para F11

Confirmado en §4.1: dos columnas cubren el caso de uso completo del MVP — `original_key` documenta la
tonalidad de origen/referencia, `default_key` es la que el atril muestra por defecto (puede coincidir
con `original_key` o no, si alguien ya transportó la canción de forma permanente). Una tercera noción
de "tonalidad elegida para un repertorio/servicio concreto" queda en `worship_repertoire_songs.key`
(§6) cuando se use en un repertorio, sin necesitar una columna adicional en `worship_songs`.

### 5.3 Tonalidades por Activity — fuera de este contrato

**[REQUISITO, propiedad de Carlos]**: si un director quiere transportar una canción para un servicio
concreto sin alterar el repertorio base, esa decisión pertenece a la integración con Activity/
programación (Carlos), no a este contrato de contenido — mismo principio que §15.

---

## 6. Repertorios

### 6.1 Modelo [PROPUESTA]

```text
worship_repertoires
  id                 uuid primary key
  church_id          uuid not null
  name               text not null
  description        text nullable
  status             text not null default 'active' check (status in ('active', 'archived'))
  created_by         uuid nullable
  created_at, updated_at
  archived_at        nullable

worship_repertoire_songs
  id                 uuid primary key
  church_id          uuid not null   -- redundante con repertoire_id pero necesario para RLS/FK directa
  repertoire_id      uuid not null, FK compuesta tenant-safe (repertoire_id, church_id)
  song_id            uuid not null, FK compuesta tenant-safe (song_id, church_id)
  position           integer not null
  key                text nullable  -- tonalidad elegida para este repertorio, si difiere de default_key
  unique (repertoire_id, song_id)
  unique (repertoire_id, position)  -- o constraint diferible si se permite reordenar en el mismo guardado
```

### 6.2 Tres conceptos, nunca fusionados

```text
Song                -- la canción, entidad de catálogo (§4)
                    ≠
Repertoire          -- colección persistente y reutilizable
                    ≠
Service song list   -- uso contextual en una Activity concreta, propiedad de Carlos (§15)
```

`Repertoire` puede crearse, editarse y archivarse sin que exista ninguna Activity que lo use todavía —
es contenido, no programación.

### 6.3 Orden explícito y estable

`position` es una columna real, no un orden implícito por fecha de inserción — necesario para que la
UI de repertorio (§18) y el atril (§10) naveguen en el orden que el responsable definió, de forma
determinista y editable.

---

## 7. Multi-tenant

### Decisión [REQUISITO, ya fijado transversalmente]

**Las canciones pertenecen a una iglesia. No existe catálogo global en F11.** `worship_songs.church_id
not null`, sin excepción — coherente con el resto del núcleo (`docs/00-vision.md` §Principios:
*"Tenant explícito. Todo dato funcional pertenece a una iglesia"*) y con el mismo criterio ya aplicado
en los contratos de Fase 7/9/10.

No se comparten canciones automáticamente entre tenants. Un catálogo global (ej. himnario común entre
iglesias) queda como **evolución futura explícita**, no construida ni insinuada en el esquema de esta
fase — si aparece, sería una capa aparte (catálogo compartido opcional que cada tenant copia a su
propio catálogo privado), nunca lectura directa cross-tenant de una tabla compartida.

RLS, FK tenant-safe, grants mínimos: mismo patrón exigido transversalmente por `docs/02-datos-y-rls.md`
§2 en las cuatro tablas nuevas (`worship_songs`, `worship_repertoires`, `worship_repertoire_songs`,
`worship_song_files` si se usa como tabla de relación explícita en vez de solo `files.entity_type`).

---

## 8. Letras y cifras — límites de implementación

Fijado en §4.2. Repetido aquí por completitud, respondiendo directamente a la sección 9 del encargo:

- **No se construye editor musical complejo**: el editor de atril (§11) edita texto plano con la
  convención de marcado de acordes ya fijada, no un motor de notación musical.
- **No se implementa parser propietario innecesario**: el renderizado de `[C]texto[G]...` a una vista
  con acordes alineados sobre la letra es una función de presentación simple (parseo de un patrón de
  corchetes conocido), no un lenguaje nuevo.
- **Se evita HTML arbitrario**: ya justificado en §4.2 por riesgo de XSS y complejidad de sanitización.

---

## 9. Atril

### 9.1 Naturaleza de la experiencia [REQUISITO]

El atril es una **experiencia de ejecución musical**, no un panel administrativo — fijado
explícitamente por el encargo (§11) y consistente con el criterio ya aplicado en Fase 10
(`CONTRATO-FASE-10.md` §29: el calendario de disponibilidad de recursos tampoco se convirtió en
dashboard).

### 9.2 Comportamientos obligatorios [REQUISITO]

- Abrir un repertorio y navegar entre canciones (anterior/siguiente), respetando el `position` fijado
  en §6.3.
- Visualizar letra.
- Visualizar cifra.
- Cambiar tonalidad **visualmente** (transposición de la vista, no reescritura del contenido
  almacenado — la cifra guardada en `worship_songs.chords`/`worship_repertoire_songs.key` no cambia
  por una transposición visual momentánea de quien está tocando).
- Modo fullscreen.
- Mantener el orden del repertorio activo durante toda la sesión de uso.
- Control de tamaño de texto (legibilidad a distancia, uso típico en atril físico o tablet en un
  soporte).
- Alto contraste/legibilidad — alineado con el objetivo WCAG AA ya fijado transversalmente
  (`docs/04-apps.md` §8).
- Evitar interacción accidental durante uso (ej. controles no traen foco por gestos accidentales de
  scroll durante una actuación en vivo) — requisito de UX a resolver en diseño de interfaz, principio
  fijado aquí como obligatorio, no su implementación exacta.

### 9.3 Prioridad de plataforma [REQUISITO]

Tablet/mobile primero — mismo principio ya fijado transversalmente ("Mobile first, escritorio cuando
aporta valor", `docs/00-vision.md` §Principios), aplicado aquí al caso de uso más exigente de esa
prioridad dentro de todo LEVITA: un músico con un dispositivo en un atril físico, no un administrador
en escritorio.

---

## 10. Atril y edición — separación obligatoria

### Decisión [REQUISITO]

Dos superficies distintas, nunca mezcladas en la misma vista:

```text
ATRIL (ejecución)          -- uso durante ensayo/culto, solo lectura + transposición visual
                               Ningún control administrativo visible aquí.
EDITOR (gestión de contenido) -- editar letra, editar cifra, cambiar tonalidad almacenada,
                               ordenar repertorio, guardar
```

El editor nunca se expone en el flujo de "estoy tocando ahora mismo". Esta separación es de diseño de
interfaz, no de permisos (los permisos finales son de Carlos, §16), pero el contrato de UX sí se cierra
aquí: **la vista de ejecución no contiene ningún control de edición**, independientemente de quién la
esté usando.

---

## 11. Archivos

### 11.1 Reutilización obligatoria del núcleo [REQUISITO]

`files` (ADR 0008, ya implementado) es la única capa de almacenamiento — no se crea storage paralelo
para Alabanza, exactamente como el propio ADR ya anticipaba nombrando "Alabanza/partituras" como
consumidor previsto.

```text
files.entity_type = 'song'
files.entity_id    = worship_songs.id
```

Clasificación de privacidad por defecto: `internal` (`docs/17-seguridad-operacion.md` §2).

### 11.2 Tipos posibles [PROPUESTA, no cerrado como obligatorio]

PDF, partitura, imagen, audio, otros — todos ya cubiertos por el modelo genérico de `files` (MIME type
libre, sin lista cerrada a nivel de esquema). **No se implementan stems/backing tracks avanzados sin
un requisito confirmado** — instrucción explícita del encargo (§13), coherente con el mismo criterio de
no sobre-diseñar ya aplicado en el contrato de Fase 10 (§37, "no convertir en ERP").

---

## 12. Ensayos

**No se crea otro calendario ni otro scheduler.** Ensayos como Activity son, sin ambigüedad, territorio
de la integración con Carlos — mismo principio fijado en §3 (`rehearsal` ya existe en `activity_type`
desde la Fase 0, sin necesitar trabajo de esquema de este contrato).

Lo que sí corresponde a este contrato: el contrato de contenido que un ensayo podrá consumir es
idéntico al que consume cualquier otro uso de repertorio — `worship_repertoires.id` y
`worship_songs.id` estables y consultables (§15). No hay un concepto de contenido distinto para
"repertorio de ensayo" frente a "repertorio de servicio" — es el mismo `Repertoire`, usado en contextos
distintos por la capa de programación de Carlos.

---

## 13. Equipo de Alabanza — fuera de esta parte

No se migra ni se diseña membresía de equipo en este contrato (People/Auth, roles, scopes finales son
de Carlos). La única superficie de este contrato que toca "quién puede hacer qué" es la propuesta de
capabilities de §16, explícitamente no vinculante.

---

## 14. Versionado de canciones — contrato compartido con Carlos

**No se implementa en F11**, ni se construye un sistema completo de versionado automáticamente
(instrucción explícita del encargo original, preservada de la versión anterior de este contrato por
seguir siendo válida sin depender de Calserv).

**Riesgo documentado, sin resolver aquí**: editar una canción usada históricamente en un servicio
pasado ¿debería alterar lo que ese servicio histórico muestra? Ejemplo: si `worship_songs.lyrics` se
corrige meses después de un culto que la usó, ¿el registro histórico de ese culto sigue mostrando la
letra de entonces, o la corregida?

**Decisión conceptual a elegir, marcada CONTRATO COMPARTIDO con Carlos** (no se cierra unilateralmente
porque toca cómo Activity trata su propio contenido histórico):

- Contenido vivo: la canción siempre muestra su versión actual, incluida al consultar un servicio
  pasado.
- Snapshot por servicio: al usar una canción en una Activity, se congela una copia de su contenido en
  ese momento (mismo principio que ADR 0017 ya aplica a `activities` `completed`/`cancelled`/
  `archived`: su contenido queda congelado, salvo notas administrativas).
- Versión explícita: sistema de versiones completo, con historial navegable.

Este contrato **recomienda** el principio de snapshot por servicio (coherente con el precedente ya
sentado por ADR 0017 para el resto de Activity), pero la decisión final requiere que Carlos confirme
cómo su propia Activity trata contenido referenciado — no se puede cerrar solo desde el lado de
contenido.

---

## 15. Activity / Song — interfaz futura, no implementación

### Decisión explícita [REQUISITO]

**No se altera `activities` ni `activity_plan_items` en este contrato.** Se documenta la interfaz que
Carlos consumirá:

```text
Activity → ordered song references
```

**Advertencia explícita, ya verificada por inspección real del código**: `activity_plan_items.item_type
= 'song'` (Fase 4, ADR 0017 §14) es **hoy** un bloque de texto libre en el orden del servicio, sin
ninguna relación con una tabla de canciones real. **No se asume que ese campo ya representa una FK
real** — decidir si evoluciona a una referencia real a `worship_songs`, o si se crea una tabla nueva
(`activity_songs` o equivalente) de propiedad de Carlos, es una decisión de integración que este
contrato no toma. Lo único que este contrato garantiza es que `worship_songs.id` y
`worship_repertoires.id` serán identificadores estables, tenant-scoped, y consultables desde el momento
en que se implemente este módulo.

---

## 16. Permisos — propuesta, no decisión final

Lista de operaciones necesarias, marcada explícitamente **PROPUESTA, no vinculante**:

```text
worship.song.read
worship.song.manage
worship.repertoire.read
worship.repertoire.manage
worship.atril.use
```

Nombres consistentes con el resto del proyecto (`communications.*`, `facilities.*` en los contratos
previos; módulo `worship`, ya presente en el catálogo, §3). El reparto por rol/scope y la integración
con `app.has_capability`/scopes (mecanismo único ya existente, ADR 0005) **no se cierra aquí** — es
decisión de Carlos.

---

## 17. Sonido / Multimedia — interfaz necesaria, no integración

Documentado, no implementado: datos de una canción potencialmente útiles para Sonido/Multimedia —
`bpm`, tonalidad elegida en el repertorio (`worship_repertoire_songs.key`), archivos (`files`), y el
orden del repertorio (`position`). Todos ya son campos del modelo cerrado en §4/§5/§6/§11 — no se añade
ningún campo nuevo solo para esta interfaz. La integración funcional real es trabajo de Carlos.

---

## 18. UI/UX

### 18.1 Rutas propuestas (routing, no implementación)

```text
/app/alabanza                    (dashboard — ya reservado, moduleKey "worship")
/app/alabanza/canciones
/app/alabanza/canciones/[id]
/app/alabanza/repertorios
/app/alabanza/repertorios/[id]
/app/alabanza/atril
```

Sustituye el placeholder actual (`src/app/(app)/app/alabanza/page.tsx`). Referencia visual única:
`imagenes/layout*.png` + shell existente (ADR 0016, D18) — nunca un visual histórico externo.

### 18.2 Dashboard [PROPUESTA]

- Total de canciones (recuento real).
- Repertorios existentes.
- Contenidos recientes (últimas canciones/repertorios creados o editados).
- Accesos rápidos al atril.

Sin métricas ficticias — mismo principio ya aplicado en todos los contratos anteriores.

### 18.3 Search

Mínimo: título, autor, tag cuando exista (reutilizando `tags` del núcleo, §3). No se construye
full-text complejo sin necesidad confirmada.

### 18.4 Archivado

Canciones y repertorios usados históricamente se archivan, nunca se eliminan vía UI común — mismo
patrón que el resto del núcleo (`docs/15-nucleo-plataforma.md` §12).

---

## 19. Clasificación de datos

Contenido de Alabanza es mayoritariamente **Internal** (título, letra, cifra, tonalidad, repertorios).
`notes` en canciones/repertorios es texto libre — nunca datos pastorales/financieros/sensibles de otro
dominio (mismo principio ya fijado en `CONTRATO-FASE-10.md` §40). Nombres de personas identificables en
notas (no compositores externos): dato **Personal**, no Internal.

---

## 20. Auditoría

Mínimo, siguiendo el patrón de acción/entidad ya consolidado (`song.*`, `communication.*`, `activity.*`):

```text
song.created
song.updated
song.archived

repertoire.created
repertoire.updated
repertoire.archived

file.attached
file.detached
```

---

## 21. RLS futura

Toda entidad tenant-aware nueva (`worship_songs`, `worship_repertoires`, `worship_repertoire_songs`)
cumple, sin excepción, lo ya exigido transversalmente:

- `church_id not null`;
- `enable row level security` + `force row level security`;
- grants mínimos, escritura solo por RPC `security definer` con wrapper `public.*` `security invoker`;
- FK compuestas tenant-safe `(hijo_id, church_id) references padre (id, church_id)`;
- tests cross-tenant, recogidos automáticamente por `cobertura_rls_test.sql`.

No se relaja ninguna política existente para dar cabida a Alabanza.

---

## 22. Pruebas requeridas (especificación, no implementación)

- Aislamiento tenant: iglesia A no lee/escribe canciones ni repertorios de iglesia B.
- CRUD de canción (crear, editar, archivar).
- CRUD de repertorio, incluyendo orden (`position`) estable tras reordenar.
- `song cannot reference tenant B`: una FK cross-tenant en `worship_repertoire_songs.song_id` se
  rechaza.
- `repertoire cannot include song from tenant B`: mismo caso desde el lado del repertorio.
- Atril solo lee contenido permitido (respeta RLS, no expone canciones archivadas fuera de su contexto
  de uso sin marcarlas como tal).
- Contenido archivado se maneja correctamente: sigue legible desde un repertorio histórico, no rompe la
  navegación.
- Archivos tenant-safe: un archivo de `files` asociado a una canción de la iglesia A no es accesible
  desde la iglesia B.

---

## 23. Fuera de alcance de la parte de Diogo

No se implementa en esta parte: People/Auth, membresía de equipo, Activity, Assignments, scheduling,
planificación de servicio, roles, scopes finales, permisos finales, programación de ensayos, integración
con Sonido/Multimedia, ninguna migración legacy.

---

## 24. Contratos para Carlos

| Contrato expuesto | Forma | Consumidor |
|---|---|---|
| **Song ID estable** | `worship_songs.id` (uuid), tenant-scoped | Carlos, para referenciar canciones desde Activity o una tabla nueva de su dominio |
| **Repertoire ID estable** | `worship_repertoires.id` (uuid), tenant-scoped | Carlos, si decide que una Activity puede cargar un repertorio completo |
| **Relación ordenada repertoire→song** | `worship_repertoire_songs (repertoire_id, song_id, position, key)` — contrato de lectura | Carlos, para leer el orden y tonalidad elegida al usar un repertorio en programación |
| **Operaciones necesarias de autorización** | Lista de §16, marcada PROPUESTA | Carlos, para cerrar la matriz de capabilities/scopes final |
| **Contrato futuro Activity→songs** | No se define la forma exacta aquí (§15) — solo se garantiza la estabilidad de los identificadores | Carlos |
| **Datos necesarios para ensayo/culto** | `bpm`, `key`, `files`, `position` — ya expuestos en el modelo (§4/§6/§11) | Carlos, Sonido/Multimedia (indirectamente) |
| **Límites claros del módulo de contenido** | Este documento completo: qué contiene, qué no, dónde empieza la responsabilidad de Carlos | Carlos |

---

## 25. Escenarios de aceptación

| ID | Escenario |
|---|---|
| S11D-01 | Crear una canción con letra, cifra, tonalidad original y por defecto, dentro de un tenant. |
| S11D-02 | Crear un repertorio y añadir varias canciones con orden explícito (`position`). |
| S11D-03 | Reordenar un repertorio y confirmar que el nuevo orden persiste de forma estable. |
| S11D-04 | Adjuntar un archivo (sintético) a una canción vía `files`, confirmar `entity_type`/`entity_id` correctos. |
| S11D-05 | Intento cross-tenant: iglesia A intenta leer/editar una canción o repertorio de iglesia B → rechazado por RLS. |
| S11D-06 | Archivar una canción usada en un repertorio: el repertorio sigue mostrando la canción archivada, legible, no roto. |
| S11D-07 | Consultar el atril (ejecución) para un repertorio, confirmando que la vista no expone ningún control de edición. |
| S11D-08 | Transponer visualmente una canción en el atril y confirmar que el contenido almacenado (`chords`) no cambia. |

---

## 26. Criterios de salida (parte de Diogo)

- [ ] modelo de `worship_songs` cerrado (§4);
- [ ] tonalidades cerradas (§5), incluida la confirmación de que `original_key`/`default_key` bastan
      para F11;
- [ ] repertorios cerrados (§6), con orden explícito y estable;
- [ ] atril mapeado (§9), separado de su editor (§10);
- [ ] archivos mapeados (§11), reutilizando `files` sin storage paralelo;
- [ ] multi-tenant cerrado (§7): canciones por iglesia, sin catálogo global en F11;
- [ ] fronteras con Carlos explícitas (§1, §15, §23, §24);
- [ ] ningún dato relevante queda sin destino o decisión — todo lo cerrado en este documento tiene
      modelo; lo no cerrado (versionado, §14) está marcado explícitamente como contrato compartido, no
      omitido en silencio.

**No se exige programación/Activity lista para cerrar la preparación de Diogo** — coherente con la
frontera fijada en §1, §15 y §23.

Este contrato **no depende de ningún bloqueo externo**: a diferencia de la versión anterior (que
quedaba parcialmente bloqueada por falta de acceso a un repositorio Calserv inexistente), todas las
decisiones de este documento se cierran con la única fuente de verdad real disponible — el propio
repositorio LEVITA y su documentación vigente (§2).

---

## 27. Decisiones pendientes

1. **Versionado de canciones y contenido histórico** (§14) — CONTRATO COMPARTIDO con Carlos, no
   cerrado unilateralmente.
2. **Contrato exacto Activity→Song** (§15) — explícitamente de Carlos; solo se garantiza la
   estabilidad de los identificadores como superficie de consumo.
3. **Reparto final de capabilities por rol/scope** (§16) — propuesta, no decisión final; de Carlos.
4. **Catálogo global de canciones compartido entre iglesias** — descartado para F11 (§7), pero queda
   como posible evolución futura si aparece demanda real de producto; no se construye ni se insinúa en
   el esquema de esta fase.
5. **Tipo SQL exacto para tonalidad** (§5.1: enum compuesto vs. dos enums separados) — detalle de
   implementación, no bloquea el contrato.
6. **Formato exacto de marcado de acordes en `lyrics`/`chords`** (§4.2/§8) — se fija el principio (texto
   plano, sin HTML, convención simple tipo `[Acorde]texto`), el detalle exacto de sintaxis es de diseño
   técnico.

---

## 28. Riesgos

1. **Sin precedente de un módulo de contenido puramente nativo en LEVITA todavía en producción** (a
   diferencia de Fase 9/10, que sí llegaron a integrarse) — mitigado siguiendo exactamente el mismo
   nivel de disciplina RLS/RPC/auditoría ya consolidado, sin inventar un patrón nuevo.
2. **Ambigüedad en la frontera Activity↔Song si Carlos y este contrato no coordinan antes de
   implementar** (§15) — mitigado dejando la interfaz explícitamente abierta y documentada, en vez de
   asumir una forma concreta que podría no encajar con el diseño real de Activity.
3. **Contenido histórico y edición de canciones** (§14) — riesgo real sin resolver hasta que Carlos
   confirme el tratamiento de contenido referenciado desde Activity; mitigación parcial: no editar
   destructivamente contenido ya usado en programación histórica sin esa confirmación.
4. **XSS/contenido no sanitizado si en el futuro se permite HTML en letra/cifra** — mitigado por diseño
   al fijar texto plano sin HTML arbitrario desde el principio (§4.2, §8).
5. **Archivos huérfanos** si una canción se borra sin limpiar sus archivos asociados — mismo riesgo ya
   documentado en ADR 0008 para el núcleo de `files`; mitigación: seguir el mismo criterio de archivado
   obligatorio con historial (§18.4), nunca borrado físico de una canción con archivos o repertorios
   asociados.
6. **Sobre-diseño del modelo de contenido** (ej. campos especulativos, sistema de versiones completo sin
   necesidad confirmada) — mitigado explícitamente en §4.1 (columnas fuera de alcance listadas con
   motivo) y §14 (versionado no construido sin decisión conjunta).
