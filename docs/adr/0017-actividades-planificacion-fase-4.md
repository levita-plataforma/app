# ADR 0017 · Actividades, estructura de servicio y planificación (Fase 4)

## Estado

Propuesto — pendiente de validación de Carlos, 16 de septiembre de 2026.

Fuente de verdad: migraciones `supabase/migrations/20260920000100_activity_status_planned.sql` a `20260920000800_recurrencia_actividades.sql` de la rama `feature/fase-4-actividades-planificacion`. Este ADR solo describe lo que ese SQL hace. Nada de lo descrito se ha aplicado en ningún entorno remoto. La interfaz está en desarrollo en esta rama y no forma parte de esta decisión.

Detalle técnico, contrato RPC y plan de despliegue: [FASE-4-ACTIVIDADES.md](../FASE-4-ACTIVIDADES.md).

Relacionado: [ADR 0004](0004-activity-raiz-generica.md) (Activity como raíz), [ADR 0005](0005-rbac-capabilities-scopes.md) (capabilities y scopes), [ADR 0006](0006-modules-entitlements-feature-flags.md) (módulos), [ADR 0007](0007-auditoria.md) (auditoría), [ADR 0009](0009-soft-delete-archivado.md) (archivado), [ADR 0013](0013-estrategia-rls.md) (RLS), [ADR 0014](0014-claves-fk-tenant-safe.md) (FKs tenant-safe).

## Contexto

La Fase 0 creó `activities` como raíz genérica con estados `draft/published/cancelled/completed/archived`, visibilidad de texto (`public`/`internal`), zona horaria por defecto `Europe/Madrid` y dos políticas RLS: cualquier miembro leía todas las actividades de su iglesia (`activities_select`) y `church.settings.manage` escribía todo (`activities_manage`). La Fase 3 creó el catálogo de Serving (áreas, puestos, requisitos, cualificaciones, credenciales) y `app.evaluate_person_eligibility`.

El plan original de la Fase 4 mezclaba dos bloques de naturaleza distinta: preparar la actividad (estructura, calendario, recurrencia, plan) y operar con personas (asignaciones, conflictos, huecos con personas, composición). El segundo bloque depende de disponibilidad y respuestas, que el plan situaba en la Fase 5.

## Decisión 1 · Cambio de alcance entre Fase 4 y Fase 5

- **Fase 4:** actividades, plantillas, recurrencia, estructura de servicio por actividad (áreas, puestos, requisitos) y planificación (orden del servicio), con ciclo de vida, permisos, RLS y auditoría.
- **Fase 5:** asignaciones de personas, conflicto de persona, cálculo de huecos con personas reales, composición de equipos, disponibilidad, respuestas y notificaciones.

La Fase 4 entrega el contrato que usará la Fase 5 (ver decisión 9), no las asignaciones.

**Alternativas.** (a) Mantener el alcance original: obligaba a construir asignaciones sin disponibilidad ni respuestas y a rehacerlas en Fase 5. (b) Retrasar toda la Fase 4 a la vez que la 5: bloqueaba calendario y planificación, que no dependen de personas.

**Consecuencias.** El alcance anterior de la Fase 4 no se completa como tal; `docs/13-plan-por-fases.md` se actualiza. La cobertura de Fase 4 siempre calcula `assigned_count = 0`.

## Decisión 2 · `activities` sigue siendo la raíz, sin tabla de extensión

ADR 0004 dejó abierta la pregunta de si Fase 4 justificaba extraer columnas específicas de `Service` a una tabla de extensión 1:1. Se decide **no crearla todavía**:

- Las columnas nuevas de `activities` son transversales a todos los tipos (horario, ubicación libre, ciclo de vida, trazabilidad de plantilla/serie/duplicado, idempotencia).
- Lo que no es transversal va a tablas propias con relación 1:N, no a una extensión 1:1: `activity_series` (regla), `activity_admin_notes` (notas), `activity_service_areas`/`activity_positions`/`activity_position_requirements` (estructura), `activity_plan_items` (plan) y `activity_templates` y sus hijas.
- La única restricción por tipo es que solo `task` puede ser `flexible`; `no_areas` solo avisa en `service`, `event` y `rehearsal`.

**Alternativas.** (a) Tabla `service_details` 1:1: ninguna columna nueva es exclusiva de cultos. (b) Tablas especializadas por tipo: descartado en ADR 0004.

**Consecuencias.** Resuelve la cuestión abierta A7 de `docs/07-decisiones.md` para Fase 4. Se revisará si fases posteriores (Events, Kids, Facilities) añaden campos exclusivos de un tipo.

## Decisión 3 · Estados, matriz de transiciones y metadatos de ciclo de vida

### Estado `planned` en migración propia

`planned` (preparada, aún no visible para la audiencia general) se añade con `ALTER TYPE activity_status ADD VALUE 'planned' BEFORE 'published'` en `20260920000100`. Va sola porque PostgreSQL no permite usar un valor de enum añadido dentro de la misma transacción en la que se añade; las migraciones siguientes lo usan en funciones SQL validadas al crearse. Es aditivo: ninguna fila cambia de estado.

### Matriz (copia de `app.activity_transition_capability`)

| Desde | Hacia | Capability | Reglas adicionales (trigger `app.activities_before_update`) |
|---|---|---|---|
| `draft` | `planned` | `activity.manage` | — |
| `planned` | `draft` | `activity.manage` | — |
| `draft`, `planned` | `published` | `activity.publish` | Sin incidencias `blocking` de estructura. Fija `published_at/by`. |
| `published` | `planned` (despublicar) | `activity.publish` | Borra `published_at/by`. |
| `published` | `completed` | `activity.publish` | Si es `timed`, `starts_at <= now()`. Fija `completed_at`. |
| `completed` | `published` (reabrir) | `activity.publish` | Sin incidencias `blocking`. Conserva `published_at/by`; borra `completed_at`. |
| `draft`, `planned`, `published` | `cancelled` | `activity.cancel` | Fija `cancelled_at/by`; motivo opcional (≤ 500). |
| `cancelled` | `draft` (reactivar) | `activity.cancel` | Borra cancelación y publicación. |
| cualquiera | `archived` | `activity.archive` | Fija `archived_at/by` y `status_before_archive`. |
| `archived` | `coalesce(status_before_archive, 'draft')` | `activity.archive` | Borra archivado. Si el destino es `published`, vuelve a exigir estructura sin bloqueos. |

Cualquier otra combinación falla con `22023`. La capability se comprueba en el ámbito de la actividad (church, campus o activity) siempre que `auth.uid()` no es nulo; con `service_role` o SQL sin usuario solo se aplica la matriz. Toda actividad nueva creada por un usuario empieza en `draft`.

### Consistencia de metadatos

- `activities_archived_consistency_check` (validada): `status = 'archived'` ⇔ `archived_at is not null`.
- `activities_cancelled_consistency_check` (validada): `cancelled` ⇒ `cancelled_at is not null`.
- `status_before_archive` guarda el estado previo para desarchivar sin perder el ciclo de vida.
- Sin cambio de estado, el trigger restaura todos los metadatos de ciclo de vida: un cliente no puede fijarlos.
- `cancellation_reason` solo se fija al cancelar y solo se borra al reactivar.
- `completed`, `cancelled` y `archived` son histórico: su contenido (tipo, título, descripción, sede, horario, zona, visibilidad, organizador, ubicación) no se puede modificar, salvo que una FK anule el organizador. La estructura y el plan solo son editables en `draft`, `planned` y `published`.

**Alternativas.** Reutilizar `draft` para "preparada": impedía distinguir borrador de actividad lista, y `activity_accepts_assignments` (Fase 5) necesita esa distinción.

**Riesgos.** Un valor de enum no se puede eliminar con facilidad (ver plan de recuperación en el documento técnico).

## Decisión 4 · Visibilidad por audiencias y nuevo modelo de lectura

### Conversión

`visibility` pasa de `text` a `activity_visibility` (`private`, `leaders`, `members`, `public_future`) con valor por defecto `members`. Conversión conservadora: **todas las filas existentes pasan a `members`**, tanto `internal` (antes la leía cualquier miembro) como `public` (nunca tuvo acceso anónimo; no se promociona a `public_future` para no exponerla cuando exista web pública). La distinción original `public`/`internal` no se conserva en la columna.

### Lectura de `activities` (`app.can_read_activity_row`)

Siempre dentro de una iglesia del usuario. Puede leer:

1. La audiencia general, solo si el estado es `published`, `completed` o `cancelled`:
   - `members` y `public_future`: cualquier miembro de la iglesia;
   - `leaders`: quien tiene algún rol distinto de `member` o es líder vigente de algún área (`app.is_church_leader`);
   - `private`: nadie por audiencia.
2. El organizador (`organizer_person_id`), en cualquier estado.
3. Quien tiene `activity.read`, `activity.manage` o `activity_plan.manage` con scope church, campus de la actividad o la actividad concreta.
4. Quien tiene `activity.read` o `activity_positions.manage` con scope `service_area` sobre un área que participa en la actividad.

Consecuencia: `draft`, `planned` y `archived` solo los ven quienes gestionan o leen en su ámbito, el organizador y los líderes de las áreas incluidas. El acceso efectivo a datos existentes solo se reduce.

`public_future` **no concede acceso anónimo** en Fase 4: `anon` no tiene `SELECT` en ninguna tabla del dominio y todas las políticas son `to authenticated`.

### Notas administrativas en tabla aparte

`activity_admin_notes` (1:1, máx. 4000). RLS es por fila, así que una columna en `activities` sería visible para cualquier miembro que lea la actividad. Solo las leen quienes tienen `activity.read` o `activity.manage` en scope church, campus o activity; no la audiencia general, ni el organizador, ni los líderes con scope `service_area`.

**Alternativas.** (a) Mapear `public` → `public_future`: expondría datos cuando exista la web pública. (b) Mantener `text`: sin validación ni semántica de audiencia.

## Decisión 5 · Horario, zona horaria e instantes

- `schedule_kind` (`timed`, `flexible`). `timed`: `starts_at` y `ends_at` obligatorios, `ends_at > starts_at`, duración ≤ 62 días. `flexible`: ventana opcional (`starts_at`/`ends_at` pueden ser nulos; si hay ambos, `ends_at > starts_at`). **Solo `task` puede ser `flexible`.** Solo las actividades `timed` pueden repetirse.
- Relleno inicial: `timed` si la fila tiene ambos instantes y `ends_at > starts_at`; en otro caso, `flexible`.
- Las reglas que podrían no cumplir filas heredadas se añaden como `NOT VALID`: `activities_timed_range_check`, `activities_flexible_window_check`, `activities_flexible_only_tasks_check`, `activities_title_check` y la FK `activities_organizer_membership_fkey`. Se aplican a toda inserción y a toda modificación posterior sin romper la migración.
- Se retira el valor por defecto `Europe/Madrid` de `activities.timezone`. Al insertar, la zona se resuelve en este orden: la indicada, la de la sede (`campuses.timezone`) y la de la iglesia (`churches.timezone`). Debe existir en `pg_timezone_names`; si no, error `22023`. Las filas existentes conservan su valor.
- `starts_at`/`ends_at` son instantes (`timestamptz`, UTC). La zona IANA es contexto para mostrar y para calcular recurrencias. La entrada de las RPC es hora local (`YYYY-MM-DDTHH:MM`) y se convierte con `app.local_to_instant`.

**Riesgo.** Una fila heredada que quede `flexible` sin ser `task`, o que incumpla otra `CHECK NOT VALID`, no admitirá ningún `UPDATE` (ni siquiera de estado) hasta corregirla. El documento técnico incluye las consultas previas para detectarlas.

## Decisión 6 · Recurrencia

### Modelo

- `activity_series` guarda la regla estructurada: `weekly` (días ISO 1–7, cada 1–52 semanas) o `monthly` (cada 1–12 meses) por `day_of_month` (1–31) o `nth_weekday` (semana 1–5 o `-1` = última, día ISO), fecha de inicio, **hora local**, duración absoluta en minutos, zona, y fin por `until_date` **o** `occurrence_count` (exactamente uno). `rrule` es una representación RFC 5545 informativa; la fuente de verdad son las columnas.
- Cada ocurrencia es una fila de `activities` con `series_id` + `occurrence_date` (fecha local original). `(series_id, occurrence_date)` es único: reintentar una expansión no duplica filas.
- Límites: máximo **200 ocurrencias** y horizonte de **731 días** desde `starts_on`, aunque la regla indique más. Las ocurrencias se crean en la misma transacción que la serie.

### DST

Cada ocurrencia calcula su instante con su propia fecha local más la hora local de la serie, así que "domingo 11:00" sigue siendo 11:00 local antes y después del cambio de hora; la duración es absoluta. `app.local_to_instant` usa `timestamp AT TIME ZONE zona`, con la semántica documentada de PostgreSQL: una hora inexistente (salto de primavera) se desplaza hacia delante (02:30 → 03:30) y una hora ambigua (vuelta a horario estándar) se resuelve como horario estándar (la segunda).

### Meses cortos y n-ésimo día

`month_day_fallback`: `skip` (por defecto) omite los meses sin ese día (29–31) o sin 5.º día de la semana; `last_day` usa el último día del mes o la última aparición de ese día de la semana.

### Edición

| Operación | RPC | Efecto |
|---|---|---|
| Solo esta | `update_activity` | Cambia la fila y marca `series_modified = true` (excepción). |
| Esta y siguientes | `update_activity_series(..., 'future')` | Divide la serie en la fecha de la ocurrencia (`app.split_activity_series`: la original termina el día anterior; la nueva conserva la regla y `split_from_series_id`) y aplica los cambios a la nueva. |
| Toda la serie | `update_activity_series(..., 'all')` | Aplica los cambios sin dividir. |
| Cambio de regla | `update_activity_series_rule` | Siempre desde esta ocurrencia: divide y reconcilia. |
| Estructura a la serie | `apply_activity_structure_to_series(..., 'future'/'all')` | Sustituye áreas, puestos, requisitos y plan de las ocurrencias editables por una copia exacta de esta. |

Las ediciones masivas solo tocan ocurrencias **editables**: estado `draft`/`planned`/`published`, sin `series_modified` y con `starts_at >= now()`. Las ediciones masivas no admiten cambiar la fecha (eso es "solo esta").

Reconciliación al cambiar la regla: fechas nuevas → se crean ocurrencias copiando la estructura y las notas de la ocurrencia de origen; ocurrencias que siguen encajando → se recalcula la hora si cambió; ocurrencias que ya no encajan → `draft`/`planned` se eliminan, `published` se cancelan con motivo "Serie reprogramada", y excepciones, cerradas y pasadas se conservan.

**Alternativas.** (a) Expansión perezosa (calcular ocurrencias al leer): impide asignaciones, estructura y excepciones por ocurrencia. (b) Serie ilimitada con job de extensión: requiere jobs que aún no existen. (c) RRULE como fuente de verdad: difícil de validar en SQL.

**Riesgos.** Las ediciones de estructura o plan de una ocurrencia individual **no** marcan `series_modified`; `apply_activity_structure_to_series` las sobrescribe. Cancelar ocurrencias publicadas al cambiar la regla pasa por el trigger de estado y exige `activity.cancel` además de `activity.manage`.

## Decisión 7 · Plantillas

- `activity_templates` + `activity_template_areas` + `activity_template_positions` + `activity_template_plan_items`. Guardado completo en una transacción (`save_activity_template` sustituye las filas hijas).
- Usar una plantilla **copia** su estructura a la actividad. La actividad solo guarda `template_id` como trazabilidad (`on delete set null`); cambiar o archivar la plantilla no altera actividades ya creadas.
- Al copiar, se **omiten** (sin fallar la creación) las áreas y puestos inactivos, de otra sede o con el módulo `serving` deshabilitado, y se devuelven en `skipped` con `kind`, `name` y `reason` (`inactive`, `campus_mismatch`, `serving_module_disabled`).
- Una plantilla con sede solo admite áreas y puestos globales o de esa sede, y solo se aplica a actividades de esa sede.

**Alternativa.** Referencia viva a la plantilla: cualquier cambio alteraría actividades pasadas y publicadas.

## Decisión 8 · Estructura de servicio por actividad: snapshots y overrides

- `activity_service_areas`: área del catálogo con `area_name` y `area_campus_id` como snapshot fijado por el servidor; `requirement` `required`/`optional`.
- `activity_positions`: valores efectivos propios (`min_people`, `max_people`, `critical`, `requires_autonomous_person`...). `catalog_snapshot` guarda los valores del catálogo al copiar y es inmutable. `service_position_id` nulo = **puesto ad-hoc** de esa actividad.
- `activity_position_requirements`: `origin = inherited` (copiado de `position_requirements`, con `catalog_snapshot`) o `added` (solo esta actividad). Un requisito heredado no se borra: se **desactiva** (`disabled`) o se ajusta (override de exigencia, nivel o vigencia); no se puede cambiar su tipo, cualificación o credencial. Solo los `added` se pueden eliminar.
- Borrar un elemento del catálogo anula la referencia (`on delete set null`) y conserva el snapshot. La copia exacta entre actividades (duplicar, aplicar a la serie) conserva snapshots, overrides y desactivaciones.

## Decisión 9 · Contrato para Fase 5

- `app.activity_position_effective_requirements(activity_position_id)`: requisitos heredados no desactivados más los añadidos. Wrapper público filtrado por `app.can_read_activity`.
- `app.activity_accepts_assignments(activity_id)`: verdadero solo si el estado es `planned` o `published` y la actividad es `flexible` o `ends_at > now()`.

**Declaración explícita:** la elegibilidad de Fase 3 (`app.evaluate_person_eligibility(church, service_position, person)`) trabaja contra el puesto de **catálogo** y `now()`. **No** evalúa la vigencia de credenciales en la fecha de la actividad **ni** los overrides, requisitos añadidos o desactivados por actividad. La Fase 5 debe añadir esa evaluación antes de asignar.

## Decisión 10 · Cobertura e incidencias de estructura

### Cobertura (`app.position_coverage_status(min, max, asignados)`)

| Estado | Condición |
|---|---|
| `overstaffed` | `max` no nulo y asignados > `max` |
| `covered` | asignados ≥ `min` (con `min = 0` y 0 asignados cuenta como cubierto) |
| `uncovered` | 0 asignados y `min > 0` |
| `partially_covered` | 0 < asignados < `min` |

`min_people` 0–500 (por defecto 1); `max_people` nulo = sin máximo (nunca `overstaffed`), si existe ≥ `min_people`. En Fase 4 `assigned_count` es siempre 0.

### Incidencias (`app.activity_structure_issues`)

| Código | Severidad |
|---|---|
| `required_area_without_positions` | blocking |
| `area_campus_mismatch` | blocking |
| `position_campus_mismatch` | blocking |
| `optional_area_without_positions` | warning |
| `catalog_area_unavailable` | warning |
| `catalog_position_unavailable` | warning |
| `no_areas` (solo `service`, `event`, `rehearsal`) | warning |
| `plan_exceeds_activity` (solo `timed`) | warning |

**Publicar exige estructura válida (sin `blocking`), no personas.** Los huecos de cobertura no bloquean la publicación.

## Decisión 11 · Compatibilidad de sede

- Actividad **global** (sin sede): admite áreas y puestos de cualquier sede o globales.
- Actividad **de sede**: solo áreas y puestos globales (`campus_id` nulo) o de la misma sede.
- Se comprueba al añadir (trigger), al cambiar la sede de la actividad (el trigger rechaza el cambio si dejaría áreas o puestos incompatibles) y al cambiar la sede de una plantilla.
- Si el catálogo cambia de sede después, `area_campus_mismatch`/`position_campus_mismatch` lo señalan como incidencia bloqueante para publicar.

## Decisión 12 · Permisos

### Capabilities nuevas (`module_key` nulo)

| Capability | Uso |
|---|---|
| `activity.read` | Ver actividades en cualquier estado en su ámbito, con notas administrativas |
| `activity.create` | Crear (desde cero, plantilla o recurrentes) y duplicar |
| `activity.manage` | Editar actividad, áreas y plan; ediciones de serie |
| `activity_positions.manage` | Puestos y requisitos de un área dentro de actividades |
| `activity.publish` | Publicar, despublicar, completar y reabrir |
| `activity.cancel` | Cancelar y reactivar |
| `activity.archive` | Archivar y desarchivar |
| `activity_template.manage` | Plantillas |
| `activity_plan.manage` | Orden del servicio |

### Scopes

`church` (toda la iglesia), `campus` (actividades de esa sede, no las globales), `service_area` (`activity.read` de actividades con esa área; `activity_positions.manage` de los puestos de esa área) y `activity` (una actividad concreta). Con `app.has_capability`, una asignación con scope `church` satisface cualquier scope.

### Roles

| Rol | Capabilities |
|---|---|
| `church_owner`, `church_admin` | todas las `activity*` |
| `campus_admin` | todas las `activity*` (efectivas por sede si el rol se asigna con scope `campus`) |
| `ministry_leader` | `activity.read`, `activity_positions.manage` |

`ministry_leader` **no** recibe `activity.manage` ni `create`/`publish`/`cancel`/`archive`: gestiona los puestos de su área en actividades ajenas, pero no edita la actividad raíz, las áreas ni el plan, ni cambia su estado. Así, aunque el rol se asignara por error con scope `church`, no podría editar ni cambiar estados. Sí podría leer todas las actividades (incluidos borradores y notas administrativas) y gestionar puestos de todas ellas.

**Riesgo previo, fuera de Fase 4:** `app.accept_person_invitation` inserta el `role_key` de la invitación creada con `invite_existing_person` siempre con `scope_type = 'church'`. Un `ministry_leader` o `campus_admin` invitado así obtiene alcance de toda la iglesia. Debe tratarse en una rama `hotfix/` separada.

### Módulos

Actividades, calendario, plantillas sin áreas y planificación son **núcleo** (`module_key` nulo): una iglesia puede programar reuniones o tareas sin Serving. La estructura de servicio por actividad exige el módulo `serving` habilitado (`app.require_serving_module`) en `add_activity_area`, en las operaciones de puestos y requisitos y en `save_activity_template` con áreas.

## Decisión 13 · RLS y escritura solo por RPC

- Se **eliminan** `activities_select` y `activities_manage` de Fase 0 y se crea un `activities_select` nuevo. Añadir políticas restrictivas sin retirarlas no habría servido: las políticas permisivas se combinan con OR.
- Se revocan `INSERT`, `UPDATE`, `DELETE` y `TRUNCATE` a `anon` y `authenticated` en `activities` y en las diez tablas nuevas; `anon` tampoco tiene `SELECT`. No hay políticas de escritura: una escritura directa falla por privilegios antes de llegar a RLS.
- Toda escritura pasa por funciones `app.*` `security definer` (pertenencia, capability y scope, módulo, reglas y auditoría en la misma transacción) expuestas con wrappers `public.*` `security invoker`.
- Las reglas de dominio viven en triggers (matriz de estados, histórico inmutable, compatibilidad de sede, pertenencia de personas al tenant, inmutabilidad de snapshots), así que también se aplican a `service_role` y SQL directo.
- Lectura de estructura y plan: quien puede leer la actividad. Series: `activity.read` de iglesia o poder leer alguna ocurrencia. Plantillas: quien tiene `activity_template.manage` o `activity.create` en algún scope.

## Decisión 14 · Planificación (orden del servicio)

- Unidades explícitas: **minutos**. `duration_minutes` 0–1440; `start_offset_minutes` −1440–4320 **respecto a `starts_at`** de la actividad (negativo = antes del inicio). Offset nulo = empieza cuando termina el bloque anterior.
- `item_type`: `section`, `song`, `speech`, `prayer`, `announcement`, `media`, `transition`, `custom`. `song` es un bloque, no un catálogo musical.
- `sort_order` único por actividad con constraint **diferible** (`activity_plan_items_order_unique`). Insertar en una posición, eliminar (compacta a 0..n−1) y reordenar son atómicos. `reorder_activity_plan_items` exige exactamente el conjunto actual de bloques; si otro usuario añadió o quitó uno, falla con **`40001`** para recargar.
- Máximo 200 bloques. El responsable puede ser texto libre o una persona activa de la iglesia.
- Los solapamientos entre bloques están permitidos. Un plan que termina después de la actividad genera la incidencia `plan_exceeds_activity` (warning). No existe incidencia específica de solapamiento.

## Decisión 15 · Auditoría

Acciones emitidas con `app.write_audit_log` en la misma transacción:

| Acción | Entidad |
|---|---|
| `activity.created`, `activity.duplicated` | `activities` |
| `activity.updated` | `activities` (`scope: this`) o `activity_series` (`future`, `all`, `series_rule` o aplicación de estructura) |
| `activity.published`, `activity.cancelled`, `activity.completed`, `activity.archived`, `activity.status_changed` | `activities` |
| `activity.area_added`, `activity.area_updated`, `activity.area_removed` | `activities` |
| `activity.position_added`, `activity.position_updated` (también requisitos: `added`/`override`/`removed`), `activity.position_removed` | `activities` |
| `activity.plan_item_added`, `activity.plan_item_updated`, `activity.plan_item_removed`, `activity.plan_reordered` | `activities` |
| `activity_template.created` (también duplicar), `activity_template.updated`, `activity_template.archived`, `activity_template.restored` | `activity_templates` |

Los metadatos registran campos cambiados, no contenido: el motivo de cancelación se registra como `has_reason`. Las cancelaciones y eliminaciones de la reconciliación de reglas quedan resumidas en el `activity.updated` de la serie, sin una entrada por ocurrencia.

## Consecuencias

- La Fase 5 parte de actividades con estructura y un contrato explícito, sin asignaciones previas que migrar.
- Los miembros sin rol dejan de ver borradores; el seed sintético publica su actividad de ejemplo para que los tests de aislamiento sigan viendo una fila.
- La aplicación desplegada solo cuenta `activities` en el panel; el recuento pasa a respetar el nuevo modelo de lectura.
- Los tipos TypeScript (`src/lib/supabase/database.types.ts`) quedan desactualizados hasta regenerarlos.

## Riesgos

- Filas heredadas que incumplan constraints `NOT VALID` quedan bloqueadas para `UPDATE`.
- La normalización de `archived_at`/`cancelled_at` usa `updated_at`, que la propia migración sobrescribe al rellenar `schedule_kind` (ver documento técnico).
- Elegibilidad por fecha de actividad y overrides pendiente para Fase 5.
- Riesgo previo de invitaciones con scope `church`.
- `planned` no se puede retirar con una simple reversión.
- La suite pgTAP de Fase 4 está en desarrollo en esta rama; este ADR no recoge resultados de pruebas.
