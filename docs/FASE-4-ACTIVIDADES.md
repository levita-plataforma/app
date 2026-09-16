# Fase 4 — Actividades, plantillas, estructura de servicio y planificación

Fecha: **16 de septiembre de 2026**. Rama: `feature/carlos-fase-4-actividades`.

## Estado

```
FASE 4: EN REVISIÓN — PENDIENTE DE VALIDACIÓN DE CARLOS
NADA DE ESTE DOCUMENTO SE HA APLICADO EN NINGÚN ENTORNO REMOTO
```

- Decisión de arquitectura: [ADR 0017](adr/0017-actividades-planificacion-fase-4.md) (Propuesto).
- Fuente de verdad: migraciones `20260920000100` a `20260920000800` (contrato) y `20260920000900` (lecturas para la UI). Este documento solo describe lo que hace ese SQL.
- La interfaz está en desarrollo en esta rama; este documento no describe pantallas.
- Pruebas: suites `supabase/tests/fase4_actividades_test.sql` (135 aserciones), `fase4_permisos_test.sql` (71) y `fase4_recurrencia_test.sql` (74). Según el responsable de la rama, pasan en local (450/450 junto con las suites anteriores) con un arnés PostgreSQL 17 **sin Docker** que emula los roles y `auth` de Supabase. **No es una ejecución de `supabase test db`** (Docker no disponible en esa máquina); debe confirmarlo el CI de la PR.

---

## 1. Alcance y exclusiones

### Incluido (esquema, reglas y RPC)

- Actividades puntuales con horario (`timed`) o tareas sin hora fija (`flexible`).
- Estados `draft → planned → published → completed`, cancelación y archivado con matriz de transiciones.
- Visibilidad por audiencias (`private`, `leaders`, `members`, `public_future`) y nuevo modelo de lectura.
- Notas administrativas separadas del contenido visible.
- Series recurrentes acotadas (semanal, cada N semanas, mensual por día o por n-ésimo día), DST-safe, con edición de "esta", "esta y siguientes" y "toda la serie".
- Plantillas con áreas, puestos y orden del servicio, copiadas al crear.
- Duplicar actividad.
- Estructura de servicio por actividad: áreas, puestos (de catálogo o ad-hoc) y requisitos con snapshots y overrides.
- Cobertura por puesto (sin personas: `assigned_count = 0`) e incidencias de estructura.
- Orden del servicio con reordenación atómica.
- Capabilities, scopes, RLS, escritura solo por RPC y auditoría.

### Excluido

| No construido | Fase |
|---|---|
| Asignaciones de personas a puestos | 5 |
| Conflicto de persona (doble asignación, solapes) | 5 |
| Huecos y composición calculados con personas reales | 5 |
| Elegibilidad por fecha de actividad y con overrides por actividad | 5 |
| Disponibilidad, blockouts, respuestas, sustituciones | 5 |
| Notificaciones de publicación, cambios o cancelación | 5 |
| Formularios, inscripciones, aforo, entradas, web pública, ICS | 6 |
| Conflicto de recursos/salas | 10 |
| Catálogo musical (el bloque `song` del plan no lo es) | 11 |

---

## 2. Migraciones nuevas

| Orden | Archivo | Propósito |
|---|---|---|
| 1 | `20260920000100_activity_status_planned.sql` | Añade `planned` a `activity_status` (antes de `published`). |
| 2 | `20260920000200_activities_ampliacion.sql` | Visibilidad a enum, `schedule_kind`, columnas de ciclo de vida y trazabilidad, constraints, retirada del default de zona, `activity_series`, `activity_admin_notes`, índices. |
| 3 | `20260920000300_activity_estructura_y_plantillas.sql` | Áreas, puestos, requisitos y plan por actividad; plantillas y sus hijas. |
| 4 | `20260920000400_capabilities_actividades.sql` | 9 capabilities `activity*` y concesiones a roles. |
| 5 | `20260920000500_activity_funciones_y_reglas.sql` | Zona horaria, autorización por ámbito, matriz de estados, cobertura, incidencias, contrato Fase 5 y triggers de reglas. |
| 6 | `20260920000600_rls_actividades.sql` | Sustituye las políticas de `activities`, revoca escrituras directas y crea políticas de lectura. |
| 7 | `20260920000700_rpc_actividades.sql` | RPC de actividades, estructura, planning y plantillas; lecturas derivadas. |
| 8 | `20260920000800_recurrencia_actividades.sql` | Cálculo de fechas, series, expansión, división y edición de series; vista previa. |
| 9 | `20260920000900_permisos_actividades_ui.sql` | Solo lecturas para la interfaz en desarrollo: `activity_capabilities`, `activity_creation_scopes`, `activity_dashboard`, `activities_structure_status`. No cambia esquema, permisos ni reglas (ver §4.7). |

**Dependencia de orden:** `0100` debe **confirmarse (commit) antes** de ejecutar `0200` y siguientes. PostgreSQL no permite usar un valor de enum añadido en la misma transacción; `0500` crea funciones `language sql` que usan `'planned'` y se validan al crearse. Si la herramienta de despliegue agrupa varias migraciones pendientes en una sola transacción, aplicar `0100` por separado.

---

## 3. Tablas nuevas y cambios en `activities`

### 3.1 Cambios en `activities`

**Columnas añadidas**

| Columna | Tipo | Notas |
|---|---|---|
| `schedule_kind` | `activity_schedule_kind` not null, default `timed` | Relleno: `timed` si hay ambos instantes y `ends_at > starts_at`; si no, `flexible`. |
| `location_text` | text | ≤ 200 |
| `template_id` | uuid | FK `(template_id, church_id)` → `activity_templates`, `on delete set null` |
| `series_id` | uuid | FK `(series_id, church_id)` → `activity_series` |
| `occurrence_date` | date | Fecha local original; único con `series_id` |
| `series_modified` | boolean not null default false | Excepción de contenido de serie |
| `series_structure_modified` | boolean not null default false | Excepción de estructura de serie (áreas, puestos, requisitos o plan editados individualmente) |
| `duplicated_from_activity_id` | uuid | FK a `activities`, `on delete set null` |
| `creation_request_id` | uuid | Idempotencia; único por iglesia |
| `published_at`, `published_by` | timestamptz, uuid | Ciclo de vida |
| `completed_at` | timestamptz | Ciclo de vida |
| `cancelled_at`, `cancelled_by` | timestamptz, uuid | Ciclo de vida |
| `cancellation_reason` | text | ≤ 500 |
| `status_before_archive` | `activity_status` | Para desarchivar |

**Columnas modificadas**

| Columna | Antes | Después |
|---|---|---|
| `visibility` | `text` default `internal`, check `public`/`internal` | `activity_visibility` default `members`; **todas las filas → `members`**; se elimina `activities_visibility_check` |
| `timezone` | default `Europe/Madrid` | **sin default**; resuelto por trigger (indicada → sede → iglesia) y validado contra `pg_timezone_names` |

**Constraints**

| Constraint | Validación | Regla |
|---|---|---|
| `activities_timed_range_check` | **NOT VALID** | `timed` ⇒ ambos instantes, `ends_at > starts_at`, ≤ 62 días |
| `activities_flexible_window_check` | **NOT VALID** | `flexible` ⇒ si hay ambos, `ends_at > starts_at` |
| `activities_flexible_only_tasks_check` | **NOT VALID** | `flexible` ⇒ `type = 'task'` |
| `activities_title_check` | **NOT VALID** | título no vacío, ≤ 200 |
| `activities_organizer_membership_fkey` | **NOT VALID** | `(church_id, organizer_person_id)` → `church_people`, `on delete set null (organizer_person_id)` |
| `activities_location_text_check` | validada | ≤ 200 |
| `activities_cancellation_reason_check` | validada | ≤ 500 |
| `activities_archived_consistency_check` | validada | `archived` ⇔ `archived_at` no nulo |
| `activities_cancelled_consistency_check` | validada | `cancelled` ⇒ `cancelled_at` no nulo |
| `activities_series_occurrence_check` | validada | `series_id` y `occurrence_date` ambos nulos o ambos no nulos |
| `activities_duplicated_from_fkey`, `activities_series_fkey`, `activities_template_fkey` | validadas | FKs tenant-safe |

Una `CHECK ... NOT VALID` se comprueba en **cada** `INSERT` y `UPDATE` de la fila, aunque el `UPDATE` no toque sus columnas. Una FK `NOT VALID` solo se comprueba cuando cambian sus columnas.

La FK de Fase 0 `activities_organizer_person_id_fkey` (→ `people`) se mantiene.

**Normalización de datos existentes (0200)**

La migración desactiva el trigger `activities_set_updated_at` al empezar y lo reactiva tras estos rellenos, así que `updated_at` de las filas existentes se conserva:

1. `update activities set schedule_kind = ...` sobre todas las filas.
2. `archived_at is not null and status <> 'archived'` → `status = 'archived'`.
3. `status = 'archived' and archived_at is null` → `archived_at = updated_at` (el original).
4. `status = 'cancelled' and cancelled_at is null` → `cancelled_at = updated_at` (el original).

Los valores rellenados en 3 y 4 son una aproximación (última modificación), no la fecha real de archivado o cancelación. `disable trigger` requiere ser propietario de la tabla, algo que cumple el rol que aplica migraciones.

**Índices**

| Acción | Índice |
|---|---|
| Añadido | `activities_church_starts_idx (church_id, starts_at)` |
| Añadido | `activities_church_status_idx (church_id, status)` |
| Añadido | `activities_church_campus_starts_idx (church_id, campus_id, starts_at)` |
| Añadido | `activities_creation_request_unique (church_id, creation_request_id) where creation_request_id is not null` |
| Añadido | `activities_series_occurrence_unique (series_id, occurrence_date) where series_id is not null` |
| Eliminado | `activities_church_id_idx` (cubierto por el prefijo de los compuestos) |
| Eliminado | `activities_campus_id_idx` |
| Se mantiene | `activities_church_type_starts_idx` |

**Triggers nuevos:** `activities_before_insert` y `activities_before_update` (ver §5).

### 3.2 Tablas nuevas

Todas tienen `church_id`, RLS `ENABLE` + `FORCE`, FKs compuestas `(id, church_id)` y, salvo las hijas de plantilla, trigger `set_updated_at`.

| Tabla | Propósito | Claves y límites relevantes |
|---|---|---|
| `activity_series` | Regla de recurrencia | Semanal 1–52, mensual 1–12; `until_date` xor `occurrence_count` (1–200); `until_date ≤ starts_on + 731`; `duration_minutes` 1–89280; `split_from_series_id`; `creation_request_id` único por iglesia |
| `activity_admin_notes` | Notas administrativas 1:1 | PK `activity_id`; ≤ 4000 |
| `activity_service_areas` | Área por actividad | Única por `(activity_id, service_area_id)`; snapshot `area_name`, `area_campus_id`; `requirement` `required`/`optional` |
| `activity_positions` | Puesto por actividad | Único por `(activity_id, service_position_id)`; `service_position_id` nulo = ad-hoc; `min_people` 0–500 (def. 1); `max_people` nulo o 1–500 ≥ min; `catalog_snapshot` + `snapshot_taken_at` |
| `activity_position_requirements` | Requisitos efectivos | `origin` `inherited`/`added`; `inherited` ⇔ `catalog_snapshot`; `disabled` solo en `inherited` |
| `activity_plan_items` | Orden del servicio | `unique (activity_id, sort_order) deferrable initially immediate`; minutos; responsable en `church_people` |
| `activity_templates` | Plantilla | Nombre único por iglesia entre no archivadas; `flexible` solo `task` |
| `activity_template_areas` | Áreas de plantilla | Única por `(template_id, service_area_id)` |
| `activity_template_positions` | Puestos de plantilla | Catálogo o ad-hoc |
| `activity_template_plan_items` | Plan de plantilla | `unique (template_id, sort_order)` |

Tipos nuevos: `activity_visibility`, `activity_schedule_kind`, `activity_recurrence_frequency`, `activity_monthly_mode`, `activity_area_requirement`, `activity_requirement_origin`, `activity_plan_item_type`.

### 3.3 Seed

`supabase/seed.sql` (solo desarrollo local; no aplicado en remoto según [FASE-0-CIERRE.md](FASE-0-CIERRE.md)): la actividad sintética de Church A pasa de `draft` a `published`, `visibility = 'members'`, `published_at = now()`, porque los tests de aislamiento usan un miembro sin roles y los borradores ya no le son visibles.

---

## 4. Contrato RPC

Todas son `public.*` (`security invoker`) que llaman a `app.*` (`security definer`). Cada llamada es una transacción. `EXECUTE` solo para `authenticated`.

Scope "actividad" = la capability con scope `church`, `campus` de la actividad o `activity` de la actividad (`app.activity_cap`). Scope "puestos" = `activity.manage` o `activity_positions.manage` en scope actividad, o `activity_positions.manage` con scope `service_area` del área (`app.activity_area_positions_cap`).

Errores (SQLSTATE): `42501` no autorizado · `P0002` no encontrado (también para actividades de otra iglesia) · `22023`/`22P02`/`22007`/`22008`/`23514` validación · `23505` conflicto · `PT409` datos cambiados (HTTP 409; no se usa `40001` porque PostgREST lo reintenta).

### 4.1 Actividades

| Función | Parámetros / claves JSON | Devuelve | Permiso | Auditoría |
|---|---|---|---|---|
| `create_activity(p_church_id, p_input)` | `request_id`, `type`, `title`, `description`, `campus_id`, `schedule_kind`, `local_start`, `local_end` \| `duration_minutes`, `timezone`, `visibility`, `location_text`, `organizer_person_id`, `admin_notes`, `template_id`, `recurrence {frequency, interval, weekdays[], monthly_mode, month_day, week_of_month, month_weekday, month_day_fallback, until_date \| count}` | `{activity_id, series_id, occurrences, skipped[], replayed}` | Miembro; `activity.create` scope `church` (sin sede) o `campus` | `activity.created` |
| `update_activity(p_activity_id, p_input)` | Solo claves presentes: `title`, `description`, `type`, `visibility`, `location_text`, `organizer_person_id`, `campus_id`, `schedule_kind`, `local_start`, `local_end`, `duration_minutes`, `timezone`, `admin_notes` | `{updated: 0\|1}` | `activity.manage` scope actividad; cambio de sede: además `activity.manage` con scope `church` (destino global) o `campus` de la sede destino; el scope `activity` no basta | `activity.updated` (`scope: this`) |
| `transition_activity_status(p_activity_id, p_to, p_reason)` | `p_reason` ≤ 500, solo se guarda al cancelar (no al desarchivar hacia `cancelled`) | `activity_status` | Según matriz (§5.1), scope actividad | Desde `archived`: `activity.unarchived`. Resto, por estado destino: `activity.published` (desde draft/planned), `activity.cancelled`, `activity.completed`, `activity.archived`; otros `activity.status_changed` |
| `duplicate_activity(p_activity_id, p_input)` | `request_id`, `local_start`, `title` | `{activity_id, replayed}` | Poder leer el origen + `activity.create` en su sede/iglesia | `activity.duplicated` |

Notas:

- `create_activity` y `duplicate_activity` son idempotentes por `request_id` (bloqueo advisory + búsqueda por `creation_request_id` de actividad o serie); un reintento devuelve `replayed: true`.
- `create_activity` con plantilla: `type`, `campus_id` (si no se envía la clave), `schedule_kind`, `title` (`default_title` o `name`), `description`, `visibility`, `location_text` y `default_duration_minutes` salen de la plantilla. Una plantilla con sede exige la misma sede. Si `local_start` es solo fecha (`YYYY-MM-DD`) y la plantilla tiene `default_local_start_time`, se usa esa hora; si no, `local_start` con hora es obligatorio para `timed`.
- `update_activity` convierte una ocurrencia en excepción de contenido (`series_modified = true`) si cambia contenido. `admin_notes` se puede cambiar también en actividades `completed`, `cancelled` y `archived` (decisión intencionada: anotaciones administrativas, auditadas como `activity.updated`); no marca excepción. Para cambiar horario hay que enviar `local_start` (la zona sola no basta en `timed`). Cambiar la sede no recalcula la zona salvo que se envíe `timezone`.
- `duplicate_activity` crea un borrador nuevo: copia contenido, estructura exacta (solo si el módulo `serving` está habilitado) y plan (responsable solo si sigue activo en la iglesia) y notas si quien duplica puede leerlas; no copia estado, publicación, cancelación ni pertenencia a la serie. Conserva `template_id` y fija `duplicated_from_activity_id`.

### 4.2 Estructura

| Función | Parámetros / claves JSON | Devuelve | Permiso | Módulo `serving` | Auditoría |
|---|---|---|---|---|---|
| `add_activity_area(p_activity_id, p_service_area_id, p_requirement, p_notes, p_include_positions)` | `p_include_positions` default true: copia los puestos activos compatibles con la sede | `{activity_service_area_id, positions_added, positions_skipped}` | `activity.manage` scope actividad | Sí | `activity.area_added` |
| `update_activity_area(p_activity_service_area_id, p_input)` | `requirement`, `notes`, `sort_order` | void | `activity.manage` | Sí | `activity.area_updated` |
| `remove_activity_area(p_activity_service_area_id)` | — | void | `activity.manage` | Sí | `activity.area_removed` |
| `add_activity_position(p_activity_service_area_id, p_input)` | `service_position_id` (nulo = ad-hoc, exige `name`), `name`, `description`, `critical`, `min_people`, `max_people`, `requires_autonomous_person`, `notes`, `sort_order` | uuid | Scope puestos | Sí | `activity.position_added` |
| `update_activity_position(p_activity_position_id, p_input)` | `name`, `description`, `critical`, `min_people`, `max_people`, `requires_autonomous_person`, `notes`, `sort_order` | void | Scope puestos | Sí | `activity.position_updated` |
| `remove_activity_position(p_activity_position_id)` | — | void | Scope puestos | Sí | `activity.position_removed` |
| `save_activity_position_requirement(p_activity_position_id, p_requirement_id, p_input)` | `p_requirement_id` nulo = añadir (`requirement_type`, `strictness`, `qualification_id`, `credential_type_id`, `min_level`, `min_operational_level`, `requires_current_validity`); no nulo = override (`strictness`, `min_level`, `min_operational_level`, `requires_current_validity`, `disabled`) | uuid | Scope puestos | Sí | `activity.position_updated` (`requirement_change: added\|override`) |
| `remove_activity_position_requirement(p_requirement_id)` | Solo requisitos `added` | void | Scope puestos | Sí | `activity.position_updated` (`requirement_change: removed`) |

Todas las RPC de §4.2 y §4.3, sobre una ocurrencia de serie, la marcan como excepción de estructura (`app.mark_structure_modified` → `series_structure_modified = true`).

### 4.3 Planificación

| Función | Parámetros / claves JSON | Devuelve | Permiso | Auditoría |
|---|---|---|---|---|
| `add_activity_plan_item(p_activity_id, p_input)` | `item_type`, `title`, `duration_minutes`, `start_offset_minutes`, `responsible_text`, `responsible_person_id`, `notes`, `position` (índice; por defecto al final) | uuid | `activity_plan.manage` o `activity.manage`, scope actividad | `activity.plan_item_added` |
| `update_activity_plan_item(p_plan_item_id, p_input)` | Mismas claves salvo `position` | void | Ídem | `activity.plan_item_updated` |
| `remove_activity_plan_item(p_plan_item_id)` | Compacta `sort_order` a 0..n−1 | void | Ídem | `activity.plan_item_removed` |
| `reorder_activity_plan_items(p_activity_id, p_item_ids uuid[])` | Exactamente todos los bloques actuales, sin repetidos; si no, `PT409` | void | Ídem | `activity.plan_reordered` |

### 4.4 Plantillas

| Función | Parámetros / claves JSON | Devuelve | Permiso | Auditoría |
|---|---|---|---|---|
| `save_activity_template(p_church_id, p_template_id, p_input)` | `name`, `type`, `campus_id`, `default_title`, `schedule_kind`, `default_local_start_time`, `default_duration_minutes`, `description`, `visibility`, `location_text`, `notes`, `active`, `sort_order`, `areas[{service_area_id, requirement, notes, positions[{service_position_id?, name, description, critical, min_people, max_people, requires_autonomous_person}]}]`, `plan_items[{item_type, title, duration_minutes, start_offset_minutes, responsible_text, notes}]`. Sustituye las hijas: primero las elimina y después actualiza la plantilla (un cambio de sede con áreas nuevas funciona en un solo guardado). | uuid | `activity_template.manage` scope `church` o `campus` (sede nueva y, al editar, la actual); módulo `serving` si hay áreas | `activity_template.created` / `activity_template.updated` |
| `duplicate_activity_template(p_template_id, p_name)` | Nombre por defecto `"<nombre> (copia)"` | uuid | Ídem | `activity_template.created` (`duplicated_from`) |
| `set_activity_template_archived(p_template_id, p_archived)` | Archivar también desactiva | void | Ídem | `activity_template.archived` / `activity_template.restored` |

### 4.5 Series

| Función | Parámetros / claves JSON | Devuelve | Permiso | Auditoría |
|---|---|---|---|---|
| `update_activity_series(p_activity_id, p_input, p_scope)` | `p_scope` `future`\|`all`; claves: `title`, `description`, `type`, `visibility`, `location_text`, `organizer_person_id`, `campus_id`, `local_start_time` (`HH:MM`), `duration_minutes`. Otra clave → error | `{series_id, updated}` | `activity.manage` en la ocurrencia de origen y en cada ocurrencia afectada; cambio de sede: en destino (`church` o `campus`) | `activity.updated` sobre `activity_series` (`scope`) |
| `update_activity_series_rule(p_activity_id, p_input)` | Regla (`frequency`, `interval`, `weekdays[]`, `monthly_mode`, `month_day`, `week_of_month`, `month_weekday`, `month_day_fallback`, `until_date` \| `count`) + `local_start_time`, `duration_minutes` | `{series_id, first_activity_id, created, removed, cancelled, updated}` | `activity.manage` en la ocurrencia de origen; cancelar ocurrencias publicadas exige además `activity.cancel` (trigger; sin ella falla toda la operación con `42501`) | `activity.updated` sobre `activity_series` (`scope: series_rule`); por ocurrencia, `activity.cancelled` (`cause: series_rule_changed`) o `activity.series_occurrence_removed` |
| `apply_activity_structure_to_series(p_activity_id, p_scope)` | `future`\|`all`; omite las ocurrencias con `series_structure_modified` | integer (ocurrencias) | `activity.manage` en origen y en cada destino; módulo `serving` | `activity.updated` sobre `activity_series` (`structure_from_activity_id`) |
| `preview_activity_recurrence(p_church_id, p_input)` | `campus_id`, `timezone`, `local_start`, `local_end` \| `duration_minutes`, `recurrence{...}`. No escribe | tabla `(occurrence_date, starts_at, ends_at)` | Solo pertenencia a la iglesia | — |

### 4.6 Lecturas derivadas

| Función | Devuelve | Control |
|---|---|---|
| `activity_structure_issues(p_activity_id)` | tabla `(code, severity, activity_service_area_id, activity_position_id)` | `app.can_read_activity` |
| `activity_position_coverage(p_activity_id)` | tabla `(activity_position_id, activity_service_area_id, min_people, max_people, assigned_count, coverage_status)`; `assigned_count = 0` | RLS de `activity_positions` |
| `activity_position_effective_requirements(p_activity_position_id)` | `setof activity_position_requirements` | `app.can_read_activity` |

Contrato Fase 5 sin wrapper público: `app.activity_accepts_assignments(activity_id)`.

`app.activity_structure_issues`, `app.activity_position_effective_requirements` y `app.activity_accepts_assignments` comprueban `app.can_read_activity` cuando hay usuario (`auth.uid()` no nulo). Los triggers usan `app.activity_structure_issues_unchecked`, sin `EXECUTE` para `authenticated`.

### 4.7 Lecturas para la interfaz (`0900`)

Solo informan a la UI para mostrar u ocultar acciones; la autorización real sigue en RPC, triggers y RLS. No escriben ni auditan.

| Función | Devuelve | Control |
|---|---|---|
| `activity_capabilities(p_activity_id)` | JSON `{manage, publish, cancel, archive, manage_plan, duplicate, read_admin_notes, serving_enabled, manage_positions_by_area}`; `null` si no puede leer la actividad | `app.can_read_activity` |
| `activity_creation_scopes(p_church_id)` | JSON `{create_church, create_campus_ids, templates_church, templates_campus_ids, read_all, serving_enabled}`; `null` si no es miembro | Pertenencia |
| `activity_dashboard(p_church_id)` | JSON `{timezone, week_start, week_end, this_week, drafts, upcoming, incomplete_structure, flexible_open_tasks}`; semana lunes–domingo en la zona de la iglesia | `security invoker` (RLS) |
| `activities_structure_status(p_activity_ids uuid[])` | tabla `(activity_id, blocking, warnings)`; máximo 200 ids | `security invoker` (RLS) |

---

## 5. Tipos, estados, visibilidad, cobertura e incidencias

### 5.1 Matriz de transiciones

| Desde \ Hacia | `draft` | `planned` | `published` | `completed` | `cancelled` | `archived` |
|---|---|---|---|---|---|---|
| `draft` | — | manage | publish ¹ | ✗ | cancel | archive |
| `planned` | manage | — | publish ¹ | ✗ | cancel | archive |
| `published` | ✗ | publish | — | publish ² | cancel | archive |
| `completed` | ✗ | ✗ | publish ¹ | — | ✗ | archive |
| `cancelled` | cancel | ✗ | ✗ | ✗ | — | archive |
| `archived` | archive ³ | archive ³ | archive ³ | archive ³ | archive ³ | — |

`manage` = `activity.manage`, `publish` = `activity.publish`, `cancel` = `activity.cancel`, `archive` = `activity.archive`; ✗ = no permitida (`22023`).
¹ Sin incidencias `blocking`. ² Si es `timed`, solo cuando `starts_at <= now()`. ³ Solo hacia `status_before_archive` (o `draft` si es nulo). Restaura el estado tal cual: conserva cancelación (fecha, autor, motivo), publicación y completado; no revalida la estructura.

Reglas de trigger adicionales:

- Una actividad nueva creada con usuario autenticado empieza en `draft`.
- `completed`, `cancelled` y `archived`: contenido inmutable (salvo organizador anulado por FK). Las notas administrativas (tabla aparte) sí se pueden editar.
- Cambio de sede: se rechaza si deja áreas o puestos incompatibles, con el mismo criterio que `area_campus_mismatch` (catálogo vigente; snapshot solo si el área ya no existe).
- Estructura (áreas, puestos, requisitos) y plan: editables solo en `draft`, `planned` y `published`.
- No se puede cambiar `id` ni `church_id`.
- Organizador y responsable del plan: persona activa (`church_people.archived_at is null`) de la iglesia.

### 5.2 Visibilidad

| Valor | Quién la lee cuando está `published`/`completed`/`cancelled` |
|---|---|
| `private` | Nadie por audiencia |
| `leaders` | Rol distinto de `member` o líder vigente de área |
| `members` | Cualquier miembro de la iglesia |
| `public_future` | Igual que `members`; **sin acceso anónimo** en Fase 4 |

En cualquier estado leen además: el organizador; `activity.read`/`activity.manage`/`activity.publish`/`activity.cancel`/`activity.archive`/`activity_plan.manage` con scope `church`, `campus` o `activity`; `activity.read`/`activity_positions.manage` con scope `service_area` de un área incluida. Notas administrativas: solo `activity.read`/`activity.manage` con scope `church`, `campus` o `activity`.

Otras lecturas: estructura y plan siguen a la actividad; `activity_series`, con `activity.read` de iglesia o alguna ocurrencia legible; plantillas, con `activity_template.manage` o `activity.create` en cualquier scope (todas las plantillas de la iglesia).

### 5.3 Cobertura

| Estado | Condición |
|---|---|
| `overstaffed` | `max_people` no nulo y asignados > máximo |
| `covered` | asignados ≥ `min_people` (incluye mínimo 0 con 0 asignados) |
| `uncovered` | 0 asignados y mínimo > 0 |
| `partially_covered` | 0 < asignados < mínimo |

### 5.4 Incidencias de estructura

| Código | Severidad | Condición |
|---|---|---|
| `required_area_without_positions` | blocking | Área `required` sin puestos |
| `area_campus_mismatch` | blocking | Actividad con sede y área de otra sede (catálogo vigente; si el área ya no existe, snapshot) |
| `position_campus_mismatch` | blocking | Actividad con sede y puesto de catálogo de otra sede |
| `optional_area_without_positions` | warning | Área `optional` sin puestos |
| `catalog_area_unavailable` | warning | Área de catálogo borrada, archivada o inactiva |
| `catalog_position_unavailable` | warning | Puesto de catálogo borrado, archivado o inactivo |
| `no_areas` | warning | `service`, `event` o `rehearsal` sin áreas |
| `plan_items_overlap` | warning | Algún bloque empieza antes de que termine el bloque anterior (cualquier `schedule_kind`) |
| `plan_exceeds_activity` | warning | `timed` y el final calculado del plan supera la duración |

Línea temporal del plan: se recorren los bloques por `sort_order`; inicio = `start_offset_minutes` si existe, si no el final del anterior; hay solape si el inicio es menor que el final del bloque inmediatamente anterior; final del plan = máximo de inicio + duración.

### 5.5 Compatibilidad de sede

| Actividad / plantilla | Áreas y puestos admitidos |
|---|---|
| Global (sin sede) | De cualquier sede o globales |
| De sede | Globales o de la misma sede |

Se comprueba al añadir (triggers de estructura y de plantilla), al cambiar la sede de la actividad o plantilla (rechazo) y al copiar desde plantilla (omisión con `skipped`). Los cambios posteriores del catálogo se señalan como incidencias.

---

## 6. Recurrencia y DST

### 6.1 Reglas

| Aspecto | Regla |
|---|---|
| Frecuencias | `weekly` (días ISO 1=lunes…7=domingo, cada 1–52 semanas); `monthly` (cada 1–12 meses) |
| Mensual | `day_of_month` (1–31) o `nth_weekday` (semana 1–5 o −1 = última; día ISO) |
| Fin | `until_date` **o** `count` (1–200), obligatorio |
| Límites de expansión | 200 ocurrencias y 731 días desde la primera fecha |
| Solo `timed` | Una actividad `flexible` no puede repetirse |
| Semanal | Las semanas cuentan desde el lunes de la semana de `starts_on`; las fechas anteriores a `starts_on` se omiten; sin `weekdays`, el día de `starts_on` |
| Mensual sin día indicado | `month_day` = día de `starts_on`; `nth_weekday` deduce semana y día de `starts_on` |
| Días 29–31 y 5.º día | `skip` (por defecto): sin ocurrencia ese mes; `last_day`: último día del mes o última aparición del día de la semana |
| Hora | Hora local de la serie; instante = `(fecha + hora local) AT TIME ZONE zona` por ocurrencia |
| Duración | Absoluta en minutos |
| Identidad | `(series_id, occurrence_date)` única; expansión idempotente |
| Hora inexistente (primavera) | Se desplaza hacia delante (semántica de PostgreSQL) |
| Hora ambigua (otoño) | Se resuelve en horario estándar (semántica de PostgreSQL) |

### 6.2 Ejemplos

Casos cubiertos por aserciones de `supabase/tests/fase4_recurrencia_test.sql` (resultado según el arnés local descrito en "Estado"; pendiente de CI):

**Nueva York, domingo 11:00, semanal** (fin de horario de verano el 3 de noviembre de 2030):

| Ocurrencia | Local | UTC |
|---|---|---|
| 2030-10-20 | 11:00 EDT (UTC−4) | 15:00 |
| 2030-10-27 | 11:00 EDT (UTC−4) | 15:00 |
| 2030-11-03 | 11:00 EST (UTC−5) | 16:00 |

**Madrid, hora inexistente:** serie semanal a las 02:30 desde 2030-03-24. El 2030-03-31 las 02:30 no existen (02:00 → 03:00). Resultado: **03:30 CEST** (01:30 UTC), igual que el 24 de marzo a las 02:30 CET (01:30 UTC).

**Madrid, hora ambigua:** 2030-10-27 02:30 local existe dos veces (03:00 CEST → 02:00 CET). Resultado: **02:30 CET** (01:30 UTC), la segunda.

**Mensual día 31, 4 ocurrencias:**

| `month_day_fallback` | Desde | Fechas | En la suite |
|---|---|---|---|
| `skip` | 2031-01-31 | 2031-01-31, 2031-03-31, 2031-05-31, 2031-07-31 | Sí |
| `skip` | 2027-01-31 | 2027-01-31, 2027-03-31, 2027-05-31, 2027-07-31 | No (derivado de la regla) |
| `last_day` | 2027-01-31 | 2027-01-31, 2027-02-28, 2027-03-31, 2027-04-30 | Sí |

Las mismas reglas dan para 2026 (Nueva York 2026-10-25 15:00 UTC → 2026-11-01 16:00 UTC; Madrid 2026-03-29 02:30 → 03:30 CEST; 2026-10-25 02:30 → CET); esos ejemplos no están en la suite.

### 6.3 Edición de series

| Operación | Ocurrencias afectadas | Serie |
|---|---|---|
| Solo esta (`update_activity`) | Esta; pasa a `series_modified` (contenido) | Sin cambios |
| Solo esta (RPC de estructura o plan) | Esta; pasa a `series_structure_modified` | Sin cambios |
| Esta y siguientes (`update_activity_series … 'future'`) | Editables desde esta fecha | Se divide: la original termina el día anterior (`until_date`, `occurrence_count` nulo); la nueva empieza en esta fecha, con `split_from_series_id` y, si había `count`, las ocurrencias restantes |
| Toda la serie (`… 'all'`) | Todas las editables | Se actualiza sin dividir |
| Cambio de regla | Desde esta fecha, con reconciliación | Se divide y se actualiza la nueva |
| Aplicar estructura | Editables (`future` o `all`), salvo el origen y las que tienen `series_structure_modified`; exige módulo `serving` | Sin cambios |

Editables: `draft`/`planned`/`published`, sin `series_modified`, `starts_at >= now()`.

Reconciliación de regla: fecha nueva → ocurrencia nueva con copia exacta de estructura (si `serving` está habilitado) y plan y notas del origen; encaja y es editable → se recalcula hora si cambió; no encaja → `draft`/`planned` se **eliminan** (auditoría `activity.series_occurrence_removed`), `published` se **cancelan** ("Serie reprogramada"; auditoría `activity.cancelled` con `cause: series_rule_changed`; requiere `activity.cancel`), excepciones (de contenido o de estructura), cerradas y pasadas se conservan.

---

## 7. Plan de migración y despliegue (para revisión de Carlos)

> **Nada se ha aplicado en ningún entorno remoto.** Este plan es una propuesta para revisar. Las consultas y el SQL de recuperación no se han ejecutado contra ninguna base de datos.

### 7.1 Antes de aplicar

1. Hacer **backup o snapshot PITR** del proyecto y anotar la marca de tiempo.
2. Confirmar qué migraciones están aplicadas:

```sql
select version from supabase_migrations.schema_migrations order by version;
```

Deben estar todas las anteriores a `20260920000100` (Fases 0–3).

3. Consultas previas (solo lectura):

```sql
-- a) Visibilidad actual: todas pasarán a 'members'.
select visibility, count(*) from activities group by visibility;

-- b) Estados actuales.
select status, count(*) from activities group by status;

-- c) Filas que incumplirán CHECK NOT VALID (quedarán bloqueadas para UPDATE).
--    c1) timed con duración > 62 días
select id, church_id from activities
where starts_at is not null and ends_at is not null and ends_at > starts_at
  and ends_at - starts_at > interval '62 days';
--    c2) quedarán flexible y no son task
select id, church_id, type from activities
where not (starts_at is not null and ends_at is not null and ends_at > starts_at)
  and type <> 'task';
--    c3) ventana inválida (ends_at <= starts_at)
select id, church_id from activities
where starts_at is not null and ends_at is not null and ends_at <= starts_at;
--    c4) título vacío o > 200
select id, church_id from activities
where btrim(title) = '' or char_length(title) > 200;

-- d) Incoherencias archivado/estado (la migración las normaliza).
select count(*) filter (where archived_at is not null and status <> 'archived') as pasaran_a_archived,
       count(*) filter (where status = 'archived' and archived_at is null)     as archived_sin_fecha,
       count(*) filter (where status = 'cancelled')                            as cancelled_recibiran_fecha
from activities;

-- e) Organizadores fuera de church_people de la misma iglesia (FK NOT VALID).
select a.id, a.church_id, a.organizer_person_id from activities a
where a.organizer_person_id is not null
  and not exists (select 1 from church_people cp
                  where cp.church_id = a.church_id and cp.person_id = a.organizer_person_id);

-- f) Zonas horarias no válidas.
select 'activities' as tabla, timezone, count(*) from activities
where timezone not in (select name from pg_timezone_names) group by timezone
union all
select 'campuses', timezone, count(*) from campuses
where timezone is not null and timezone not in (select name from pg_timezone_names) group by timezone
union all
select 'churches', timezone, count(*) from churches
where timezone not in (select name from pg_timezone_names) group by timezone;

-- g) Colisiones con el catálogo de capabilities que se va a insertar.
select key from capabilities where key like 'activity%';

-- h) Políticas actuales de activities (se esperan activities_select y activities_manage).
select policyname, cmd from pg_policies where schemaname = 'public' and tablename = 'activities';

-- i) Riesgo previo: roles de liderazgo con scope church.
select role_key, scope_type, count(*) from church_people_roles
where role_key in ('ministry_leader', 'campus_admin') group by role_key, scope_type;
```

Criterio: c1–c4 y e deberían devolver 0 filas; si no, corregirlas antes o aceptar que esas filas no se podrán actualizar. f debe devolver 0 filas en `churches` (si la zona de una iglesia no es válida, no se podrán crear actividades en ella). g debe devolver 0 filas (la inserción fallaría por clave duplicada).

### 7.2 Orden de aplicación

1. `20260920000100_activity_status_planned.sql` — **sola, confirmada**.
2. `20260920000200` a `20260920000900`, en orden.
3. No aplicar `supabase/seed.sql` en remoto.

### 7.3 Compatibilidad con la versión desplegada

Búsqueda de `activities` en `src/` de `main` (`git grep -i activit origin/main -- src`), excluyendo tipos generados: el único uso es `src/app/(app)/app/page.tsx`, que cuenta actividades en el panel:

```ts
supabase.from("activities").select("id", { count: "exact", head: true })
  .eq("church_id", tenant.churchId).is("archived_at", null)
```

| Aspecto | Efecto tras aplicar |
|---|---|
| Forma de la consulta | Sigue siendo válida: `id`, `church_id` y `archived_at` existen |
| Resultado | Respeta el nuevo modelo de lectura: un miembro sin rol deja de contar borradores, planificadas y privadas |
| Escrituras | La versión desplegada no escribe en `activities` |
| Tipos (`database.types.ts`) | Desactualizados (`visibility: string`, sin tablas nuevas); no rompen el panel |

El código de actividades en `src/lib/activities/` y `src/server/activities/` está en desarrollo en esta rama y no forma parte de la versión desplegada.

### 7.4 Después de aplicar (verificación)

```sql
-- planned existe
select enum_range(null::activity_status);

-- Solo la política nueva en activities
select policyname, cmd from pg_policies where schemaname = 'public' and tablename = 'activities';

-- Sin escritura directa
select has_table_privilege('authenticated', 'public.activities', 'INSERT') as ins,
       has_table_privilege('authenticated', 'public.activities', 'UPDATE') as upd,
       has_table_privilege('anon', 'public.activities', 'SELECT')          as anon_sel;
-- esperado: false, false, false

-- RLS en las tablas nuevas
select c.relname, c.relrowsecurity, c.relforcerowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname like 'activity\_%' order by 1;

-- Constraints y validación
select conname, convalidated from pg_constraint
where conrelid = 'public.activities'::regclass order by 1;

-- Conversión
select visibility, schedule_kind, count(*) from activities group by 1, 2;

-- Capabilities y roles
select role_key, count(*) from role_capabilities where capability_key like 'activity%' group by 1;
-- esperado: church_owner 9, church_admin 9, campus_admin 9, ministry_leader 2
```

Comprobación funcional mínima con un usuario real de cada tipo: el panel carga; un miembro sin rol no ve borradores; un administrador crea, publica y archiva una actividad de prueba en una iglesia de prueba.

### 7.5 Recuperación

`git revert` **no revierte migraciones aplicadas**: solo cambia archivos del repositorio. La base de datos se corrige con una **migración compensatoria nueva** (timestamp posterior) o restaurando el backup/PITR. No borrar del repositorio migraciones ya registradas en `supabase_migrations.schema_migrations`.

**Nivel 1 — contención (restaurar el acceso de Fase 0 sin tocar el esquema).** Recrea las políticas tal como estaban en `20260916000900_politicas_rls_core.sql` y devuelve la escritura directa. Los triggers de Fase 4 siguen activos.

```sql
drop policy if exists activities_select on activities;  -- la de Fase 4 tiene el mismo nombre

create policy activities_select on activities
  for select to authenticated
  using ( church_id = any((select app.church_ids_for_user())::uuid[]) );

create policy activities_manage on activities
  for all to authenticated
  using ( (select app.has_capability(church_id, 'church.settings.manage')) )
  with check ( (select app.has_capability(church_id, 'church.settings.manage')) );

grant insert, update, delete on activities to authenticated;
```

**Nivel 2 — reversión de esquema** (borrador para escribir y probar en local antes de usarlo):

1. Nivel 1.
2. Eliminar wrappers `public.*` y funciones `app.*` de `0900`, `0800` y `0700`, luego triggers y funciones de `0500` (`activities_before_insert`, `activities_before_update`, guards de estructura y plantillas).
3. `delete from capabilities where key like 'activity%';` (`role_capabilities` cae en cascada).
4. Eliminar FKs `activities_template_fkey` y `activities_series_fkey`; eliminar tablas de `0300` y `activity_admin_notes`, `activity_series`.
5. Mover `planned` fuera del valor antes de retirar reglas: `update activities set status = 'draft' where status = 'planned';` (sin el trigger de `0500`).
6. Restaurar visibilidad a texto:

```sql
alter table activities alter column visibility drop default;
alter table activities alter column visibility type text
  using (case when visibility = 'public_future' then 'public' else 'internal' end);
alter table activities alter column visibility set default 'internal';
alter table activities add constraint activities_visibility_check
  check (visibility in ('public', 'internal'));
```

   La distinción original `public`/`internal` se perdió al migrar (todo pasó a `members`); si importa, recuperarla del backup.
7. `alter table activities alter column timezone set default 'Europe/Madrid';`
8. Eliminar constraints, índices y columnas añadidos en `0200`; recrear `activities_church_id_idx (church_id)` y `activities_campus_id_idx (campus_id) where campus_id is not null`.
9. Eliminar los tipos nuevos.
10. **`planned` no se puede eliminar de `activity_status` con un `ALTER TYPE`.** Retirarlo exige crear un tipo nuevo sin el valor, convertir la columna y eliminar todo lo que dependa del tipo antiguo, con todas las filas ya fuera de `planned`. Recomendación: dejar el valor; sin reglas que lo usen es inocuo.

`archived_at`/`cancelled_at` rellenados y las filas pasadas a `archived` por la normalización (§3.1) no se distinguen de los datos previos con SQL compensatorio; solo desde el backup. `updated_at` se conserva.

---

## 8. Riesgos y deuda

| Riesgo / deuda | Detalle | Tratamiento |
|---|---|---|
| Invitaciones con scope `church` (previo, fuera de F4) | `app.accept_person_invitation` asigna el `role_key` de la invitación (`invite_existing_person` acepta cualquier `role_key`) siempre con `scope_type = 'church'`. Un `ministry_leader` así asignado lee todas las actividades (incluidos borradores y notas administrativas) y gestiona puestos en todas; un `campus_admin` obtiene todas las capabilities `activity*` en toda la iglesia. | Rama `hotfix/` separada |
| Elegibilidad por fecha de actividad | `app.evaluate_person_eligibility` evalúa el puesto de catálogo contra `now()`: no usa la fecha de la actividad ni los overrides, añadidos o desactivados por actividad. | Fase 5, antes de asignar |
| Filas heredadas que incumplan `CHECK NOT VALID` | No admiten `UPDATE` hasta corregirlas. | Consultas §7.1 c |
| Fechas aproximadas en la normalización | `archived_at`/`cancelled_at` rellenados usan el `updated_at` original (última modificación), no la fecha real. | Aceptado; consultas §7.1 d |
| Cambio de regla y `activity.cancel` | Cancelar ocurrencias publicadas exige `activity.cancel` además de `activity.manage`; sin ella falla toda la operación. | Documentado |
| Pruebas | Suites `fase4_actividades` (135), `fase4_permisos` (71) y `fase4_recurrencia` (74) pasan según el responsable con un arnés PostgreSQL 17 sin Docker; no se ejecutó `supabase test db`. | Confirmar en CI de la PR |
| Tipos TypeScript | `src/lib/supabase/database.types.ts` no está regenerado. | **Pendiente** |
| UI e i18n | En desarrollo en esta rama; límites desconocidos para este documento. | Pendiente |
| Rendimiento de creación recurrente | Hasta 200 ocurrencias con copia de estructura por ocurrencia en una transacción. | Medir en local |
