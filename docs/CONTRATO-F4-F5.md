# Contrato F4/F5 — actividades, puestos, asignaciones, disponibilidad y eventos de aviso

Fecha: **16 de septiembre de 2026**; actualización: **17 de septiembre de 2026** (decisiones de F5 de Carlos). Tarea: **CO-01** (Carlos redacta; Carlos y Diogo acuerdan).

## 1. Propósito, estado y responsables

**Propósito.** Fijar qué produce la Fase 4, qué entrega y qué consume la parte de Carlos de la Fase 5, y qué queda por acordar con Diogo, para que ambos trabajen en paralelo sin cambios incompatibles.

**Estado.**

```
F4:            INTEGRADA Y APLICADA EN PRODUCCIÓN (17 de septiembre de 2026)
F5 · CARLOS:   INTEGRADA EN MAIN Y APLICADA EN PRODUCCIÓN (17 de septiembre de 2026)
F5 · COMPARTIDO Y DIOGO: DECIDIDO POR CARLOS COMO PROPIETARIO (17 de septiembre de 2026);
               implementado en feature/fase-5-avisos-disponibilidad (PR #5), sin integrar
               ni aplicar en remoto
```

- **F4.** Los datos de §2 proceden de las migraciones `20260920000100`–`20260920000900` y de `src/server/activities/`, integradas en `main` con la PR #2 (merge `b3f5add`), validadas por Carlos en el commit `93eb369` y **aplicadas en producción el 17 de septiembre de 2026**. Detalle y evidencias: [FASE-4-ACTIVIDADES.md §9](FASE-4-ACTIVIDADES.md) y [ADR 0017](adr/0017-actividades-planificacion-fase-4.md).
- **F5 · Carlos (CA-04/CA-05).** Las decisiones de §3 están acordadas por Carlos. Las migraciones `20260922000100`–`20260922000500` se **aplicaron en producción el 17 de septiembre de 2026** y la PR #4 se integró en `main` (merge `a9fd3c8`) tras la validación expresa del commit `f9cb5b4`. Detalle técnico y evidencias: [FASE-5-ASIGNACIONES.md](FASE-5-ASIGNACIONES.md).
- **F5 · Diogo (DI-01 a DI-04) y lo compartido.** Diogo no subió trabajo y las decisiones seguían abiertas, así que el 17 de septiembre de 2026 Carlos, como propietario, las decidió y encargó la implementación: está en la rama `feature/fase-5-avisos-disponibilidad` (PR #5, migraciones `20260923…`), **sin integrar y sin aplicar en remoto**, con el envío externo de email y push desactivado. Si Diogo tiene trabajo local, hay que reconciliarlo antes de integrar.
- Este documento no autoriza por sí mismo integraciones en `main` ni cambios en producción: cada una necesita la validación expresa del propietario sobre el commit concreto.

**Responsables.**

| Quién | Dominio |
|---|---|
| **Carlos** | Actividades, puestos de actividad, asignaciones, transiciones, cobertura y contrato con Serving |
| **Diogo** | Disponibilidad, preferencias de frecuencia, notificaciones persistentes, cola y transporte email/push |
| **Ambos** | Definición de eventos, destinatarios, deduplicación, cambios y cancelaciones, pruebas del recorrido completo |

---

## 2. Lo que F4 produce

**Estable** = F5 puede leerlo y depender de ello; un cambio incompatible requiere acordarlo aquí. **Interno** = detalle de F4 que F5 no debe usar.

Toda escritura en estas tablas pasa por RPC de F4: `authenticated` no tiene `INSERT/UPDATE/DELETE` directos. F5-Carlos no tiene RPC que escriban en tablas de F4; reacciona a los cambios de F4 con triggers propios, y uno de ellos modifica `activities`: una ocurrencia con asignaciones que F4 iba a borrar pasa a `cancelled` en lugar de eliminarse (§3, decisión 5; detalle en [FASE-5-ASIGNACIONES.md §7](FASE-5-ASIGNACIONES.md)).

### 2.1 Tablas y columnas

| Tabla | Columnas para consumidores | Contrato |
|---|---|---|
| `activities` | `id`, `church_id`, `campus_id`, `type`, `title`, `status` (`draft`, `planned`, `published`, `completed`, `cancelled`, `archived`), `schedule_kind` (`timed`, `flexible`), `starts_at`/`ends_at` (instantes UTC; en `flexible` pueden ser nulos), `timezone` (IANA), `visibility` (`private`, `leaders`, `members`, `public_future`), `organizer_person_id`, `location_text`, `series_id`, `occurrence_date` (fecha local), `published_at`, `published_by`, `cancelled_at`, `cancelled_by`, `cancellation_reason`, `completed_at`, `archived_at` | Estable |
| `activities` | `series_modified`, `series_structure_modified`, `status_before_archive`, `template_id`, `duplicated_from_activity_id`, `creation_request_id`, `recurrence_rule` | Interno |
| `activity_series` | `id`, `church_id`, `timezone`, `local_start_time`, `duration_minutes` | Estable solo para agrupar ocurrencias; la regla es interna |
| `activity_service_areas` | `id`, `activity_id`, `service_area_id` (nulo si el catálogo se borró), `area_name`, `requirement` (`required`, `optional`) | Estable |
| `activity_positions` | `id`, `activity_id`, `activity_service_area_id`, `service_area_id`, `service_position_id` (nulo = ad-hoc), `name`, `critical`, `min_people` (0–500), `max_people` (nulo = sin máximo), `requires_autonomous_person` | Estable |
| `activity_positions` | `catalog_snapshot`, `snapshot_taken_at`, `sort_order` | Interno |
| `activity_position_requirements` | Leer mediante `app.activity_position_effective_requirements`, no directamente (las filas `disabled` siguen en la tabla) | Estable vía función |
| `activity_plan_items`, `activity_admin_notes`, plantillas | — | Interno para F5 |
| `audit_logs` | Registro de auditoría, no es un bus de eventos | No usar como fuente de avisos |

### 2.2 Funciones

| Función | Qué devuelve | Contrato |
|---|---|---|
| `app.activity_position_effective_requirements(activity_position_id)` | Requisitos heredados no desactivados + añadidos por actividad (`requirement_type`, `strictness`, `qualification_id`, `credential_type_id`, `min_level`, `min_operational_level`, `requires_current_validity`) | Estable. Con usuario, filtra por `app.can_read_activity`. Wrapper `public.*` disponible |
| `app.activity_accepts_assignments(activity_id)` | `true` si `status in ('planned','published')` y (`flexible` o `ends_at > now()`) | Estable. Con usuario, filtra por lectura. Sin wrapper público (F5 no lo necesita). Internamente F5-Carlos usa `app.activity_accepts_assignments_unchecked`, más estricta: una tarea `flexible` con `ends_at` vencido no admite asignaciones (decisión 9) |
| `app.position_coverage_status(min, max, assigned)` | `uncovered`, `partially_covered`, `covered` (incluye mínimo 0), `overstaffed` (nunca con máximo nulo) | Estable |
| `public.activity_position_coverage(activity_id)` | Por puesto: `min_people`, `max_people`, `assigned_count`, `coverage_status`. En F4 `assigned_count = 0` siempre | Estable en forma; F5-Carlos la amplía (§4.3) |
| `app.can_read_activity(activity_id)` | Modelo de lectura (§2.4) | Estable |
| `app.can_read_activity_row(...)` | Condición de lectura por fila usada en RLS de `activities` | Estable; F5-Carlos la redefine conservando su lógica (§4.4) |
| `app.activity_cap(church, campus, activity, capability)` | Capability con scope `church`, `campus` o `activity` | Estable |
| `app.activity_structure_issues`, `app.activity_structure_issues_unchecked` | Incidencias de estructura | Interno |
| `app.evaluate_person_eligibility(church, service_position, person)` (F3) | Elegibilidad contra el **puesto de catálogo** y `now()` | Existente, **no apto** para asignar por fecha de actividad; F5-Carlos usa su propia evaluación (§4.2) |

### 2.3 Capabilities y scopes

| Capability | Uso en F4 |
|---|---|
| `activity.read`, `activity.create`, `activity.manage`, `activity.publish`, `activity.cancel`, `activity.archive` | Actividad y ciclo de vida |
| `activity_positions.manage` | Puestos y requisitos de un área en actividades |
| `activity_template.manage`, `activity_plan.manage` | Plantillas y orden del servicio |

Scopes: `church` (satisface cualquier scope), `campus`, `service_area`, `activity`. Roles: `church_owner`, `church_admin` y `campus_admin` tienen todas; `ministry_leader` tiene `activity.read` y `activity_positions.manage`. Todas con `module_key` nulo; la estructura por actividad exige además el módulo `serving`.

### 2.4 Modelo de lectura (RLS)

- Audiencia general: solo `published`, `completed`, `cancelled`, según `visibility` (`members`/`public_future` = miembros; `leaders` = rol distinto de `member` o líder vigente de área; `private` = nadie).
- En cualquier estado: organizador; `activity.read/manage/publish/cancel/archive` o `activity_plan.manage` con scope `church`, `campus` o `activity`; `activity.read`/`activity_positions.manage` con scope `service_area` de un área incluida.
- `anon` no lee nada; `public_future` no da acceso anónimo.
- Estructura sigue a la actividad. Notas administrativas: solo `activity.read`/`activity.manage` en scope `church`, `campus` o `activity`.
- Ampliación de F5-Carlos: §4.4.

---

## 3. Decisiones de F5 del dominio de Carlos

Acordadas por Carlos el **17 de septiembre de 2026**. Sustituyen las propuestas anteriores de este apartado. Donde una decisión toca el dominio de Diogo, esa parte figura como pendiente y se repite en §9.

| Nº | Tema | Decisión | Estado |
|---|---|---|---|
| 1 | Estados | `proposed` (borrador no comunicado, invisible para la persona) → enviar → `pending` → `accepted` / `declined`; `cancelled` (retirada, con causa); `substituted` (reemplazada). | Acordada por Carlos |
| 2 | Cobertura | Confirmados = `accepted` (determinan `coverage_status` y `assigned_count`); pendientes = `pending`; previstos = `proposed` + `pending` + `accepted`. Columnas nuevas `pending_count`, `proposed_count` y `expected_count` en `public.activity_position_coverage`. | Acordada por Carlos |
| 3 | Conflictos | **Bloquean:** pertenencia (a la iglesia y al área), requisitos obligatorios en la fecha de la actividad, persona autónoma, estado de la actividad y máximo del puesto. **Avisan** (se confirman y quedan registrados): solapes con otras asignaciones, no disponibilidad, frecuencia, requisitos recomendados y sede distinta. Rangos semiabiertos `[inicio, fin)`. | Acordada por Carlos. Frecuencia: pendiente de la firma de Diogo. No disponibilidad: depende de DI-01 |
| 4 | Respuestas | La persona responde hasta el inicio de la actividad (flexibles: hasta el fin de su ventana, o sin límite si no la tiene). Tras aceptar, la baja es mediante sustitución. Desde el inicio, solo el coordinador registra cambios. | Acordada por Carlos |
| 5 | Cambios de F4 | Cambio de hora → reconfirmación. Cancelar, archivar (salvo completadas) o eliminar una ocurrencia → asignaciones `cancelled`. Despublicar conserva las asignaciones. Duplicar o aplicar estructura no copia personas. Eliminar un puesto con personas asignadas se bloquea. | Acordada por Carlos |
| 6 | Sustitución | Solicitud (de la persona o del gestor) → candidato elegido por el gestor (revalidado, único por solicitud) → la asignación original pasa a `substituted` cuando el candidato acepta. | Acordada por Carlos |
| 7 | Personas sin cuenta | Respuesta registrada por un representante, auditada y marcada con `response_source = representative`. | Acordada por Carlos |
| 8 | Permisos | Capability `assignment.manage` con scopes `church`, `campus`, `activity` y `service_area`; roles `church_owner`, `church_admin`, `campus_admin` y `ministry_leader` (este, en el ámbito de su área). Responder las propias asignaciones no requiere capability. Lectura mínima de la persona asignada (`pending`/`accepted`): la actividad, su estructura y el orden del servicio; sin notas administrativas ni el resto del equipo. | Acordada por Carlos |
| 9 | Flexibles | Se usa su ventana si existe; nunca se inventa una hora. | Acordada por Carlos |
| 10 | Publicación multiárea | Se conserva la autoridad de F4 (A8): gestionar asignaciones no concede `activity.publish`. | Acordada por Carlos |
| 11 | Enlaces de respuesta | Primera versión solo autenticada; sin tokens firmados. | Acordada por Carlos |

Consecuencias ya resueltas de la lista anterior de decisiones abiertas: estados y cobertura (antes 1), conflictos salvo frecuencia (antes 6), ventana de respuesta (antes 11, A9), publicación multiárea (antes 12, A8) y wrapper de `app.activity_accepts_assignments` (antes 13: no se necesita).

Detalles de implementación conformes a lo acordado: el coordinador puede cambiar una respuesta aceptada a rechazada y registrar respuestas después del inicio (decisión 4); el representante puede responder por personas con o sin cuenta (decisión 7); quien lee la actividad por audiencia ve el equipo confirmado (decisión 8); el candidato de sustitución se crea directamente en `pending` y solo puede aceptar mientras sea el candidato activo de una solicitud abierta (decisión 6). Limitaciones conocidas: [FASE-5-ASIGNACIONES.md §14](FASE-5-ASIGNACIONES.md).

---

## 4. Lo que F5-Carlos entrega (contrato estable)

Estado: **en desarrollo** en `feature/carlos-fase-5-asignaciones`, no aplicado en remoto. Se considera contrato para Diogo y para la interfaz: un cambio incompatible se acuerda aquí. Descripción completa en [FASE-5-ASIGNACIONES.md](FASE-5-ASIGNACIONES.md).

### 4.1 Tablas y columnas públicas

Las tres tablas tienen RLS forzado; `authenticated` solo tiene `SELECT` y la escritura pasa por RPC.

| Tabla | Columnas para consumidores | Notas |
|---|---|---|
| `activity_assignments` | `id`, `church_id`, `activity_id`, `activity_position_id` (nulo solo si el puesto se eliminó después), `person_id`, `status` (`activity_assignment_status`), `version`, `position_name` (snapshot), `service_area_id` (snapshot), `substitutes_assignment_id`, `created_at`, `sent_at`, `responded_at`, `response_source` (`self`, `representative`), `confirmed_starts_at`, `confirmed_ends_at`, `reconfirmation_requested_at`, `cancelled_at`, `cancel_cause` (`coordinator`, `activity_cancelled`, `activity_archived`, `occurrence_removed`, `substitution_withdrawn`), `substituted_at`, `updated_at` | Las filas no se borran. `version` es monotónica: sube en cada mutación de la fila |
| `activity_assignment_notes` | `assignment_id`, `person_id`, `note` (1–1000), `updated_at` | Solo la lee la propia persona. **Nunca** se incluye en eventos ni avisos |
| `activity_substitution_requests` | `id`, `church_id`, `activity_id`, `original_assignment_id`, `status` (`open`, `completed`, `cancelled`), `candidate_assignment_id`, `requested_by_self`, `requested_at`, `completed_at`, `cancelled_at` | Una solicitud abierta por asignación original |

Columnas de trazabilidad (`created_by`, `sent_by`, `responded_by`, `cancelled_by`, `requested_by`, `eligibility_checked_at`): internas.

Códigos de elegibilidad guardados (`eligibility_blocking`, `eligibility_warnings`, `acknowledged_warnings`): sin `SELECT` por columna para `authenticated`, porque pueden revelar datos personales (por ejemplo, una no disponibilidad confirmada). Se guardan siempre enmascarados y quien gestiona el puesto los lee con `activity_assignment_recorded_warnings`.

### 4.2 RPC

Todas son `public.*` (`security invoker`) que llaman a `app.*` (`security definer`), salvo las lecturas indicadas. `EXECUTE` solo para `authenticated`.

| Función | Parámetros | Devuelve |
|---|---|---|
| `create_activity_assignment` | `p_activity_position_id uuid`, `p_person_id uuid`, `p_input jsonb` (`acknowledged_warnings` array de códigos confirmados, `send` bool) | `{assignment_id, status, version, replayed, warnings}` |
| `send_activity_assignments` | `p_activity_id uuid`, `p_assignment_ids uuid[]` (nulo = todas las `proposed` que gestione) | `{sent, blocked: [{assignment_id, blocking}]}` (las bloqueadas siguen en borrador) |
| `cancel_activity_assignment` | `p_assignment_id uuid`, `p_expected_version integer` | `{status, version, replayed}` |
| `respond_activity_assignment` | `p_assignment_id uuid`, `p_response text` (`accepted`, `declined`), `p_expected_version integer`, `p_note text` (`''` la borra) | `{status, version, replayed}` |
| `record_assignment_response` | `p_assignment_id uuid`, `p_response text`, `p_expected_version integer` | `{status, version, replayed}` |
| `request_assignment_substitution` | `p_assignment_id uuid` | `{request_id, replayed}` |
| `propose_substitution_candidate` | `p_request_id uuid`, `p_person_id uuid`, `p_acknowledged_warnings text[]` | `{assignment_id, status, warnings}` |
| `cancel_substitution_request` | `p_request_id uuid` (la persona solo cancela las que pidió ella) | void |
| `preview_assignment_eligibility` (`security definer`) | `p_activity_position_id uuid`, `p_person_id uuid` | tabla `(blocking text[], warnings text[])` |
| `activity_position_coverage` (`security definer`) | `p_activity_id uuid` | ver §4.3 |
| `activity_staffing_summary` (`security definer`) | `p_activity_ids uuid[]` (máx. 200) | tabla `(activity_id, positions, positions_requiring_people, confirmed, pending, proposed, uncovered_positions)` |
| `activity_assignment_review` (`security definer`) | `p_activity_id uuid` | tabla `(assignment_id, blocking, warnings)` de las asignaciones vigentes que gestione, reevaluadas con los datos actuales |
| `activity_assignment_recorded_warnings` (`security definer`) | `p_activity_id uuid` | tabla `(assignment_id, eligibility_warnings, acknowledged_warnings)` de las asignaciones que gestione |
| `my_respondable_assignments_count` (`security definer`) | `p_church_id uuid` | integer: turnos propios `pending` que aún se pueden responder |

**Errores (SQLSTATE):** `42501` no autorizado · `P0002` no encontrado · `22023` regla incumplida (bloqueos en `DETAIL` como códigos separados por comas) · `PT412` hay avisos sin confirmar (en `DETAIL`, solo los códigos que faltan por confirmar) · `PT409` la asignación cambió respecto a `p_expected_version` (versión actual en `DETAIL`) · `23505` conflicto.

**Códigos de elegibilidad.**

| Tipo | Códigos |
|---|---|
| Bloqueo | `inactive_person`, `not_area_member`, `insufficient_level`, `missing_qualification`, `qualification_expired_at_activity`, `missing_credential`, `credential_expired_at_activity`, `requirement_not_met`, `activity_not_assignable`, `position_full`, `position_not_found` |
| Aviso | `overlapping_assignment`, `unavailable`, `availability_unknown`, `different_campus` y los códigos de requisito con sufijo `_recommended` |

### 4.3 Cobertura

`public.activity_position_coverage(p_activity_id)` conserva las seis columnas de F4 en el mismo orden y añade tres al final:

| Columna | Valor |
|---|---|
| `activity_position_id`, `activity_service_area_id`, `min_people`, `max_people` | Igual que F4 |
| `assigned_count` | Confirmados (`accepted`) |
| `coverage_status` | `app.position_coverage_status(min, max, confirmados)` |
| `pending_count` | `pending` (nulo si no gestiona el puesto) |
| `proposed_count` | `proposed` (nulo si no gestiona el puesto) |
| `expected_count` | `accepted` + `pending` + `proposed`, con la original y su candidato vigente como una plaza (nulo si no gestiona el puesto) |

Es `security definer` y exige `app.can_read_activity` (sin lectura, 0 filas). Confirmados y estado de cobertura llegan a cualquiera que lea la actividad; pendientes, borradores y previstos solo a quien gestiona el puesto (coherente con las decisiones 1 y 8: los borradores y el resto del equipo no son visibles para la audiencia). `activity_staffing_summary` suma `pending` y `proposed` solo de los puestos que gestiona y los devuelve nulos si no gestiona ninguno.

### 4.4 Modelo de lectura

| Quién | Actividad y estructura | Asignaciones |
|---|---|---|
| `assignment.manage` en el ámbito | Sí, en cualquier estado (se añade a la lógica de F4) | Todas las del puesto |
| Persona con asignación `pending`/`accepted` | Sí, con la actividad `planned`/`published`/`completed`/`cancelled` (actividad, estructura y orden del servicio); no notas administrativas | Solo las suyas que llegaron a comunicarse; nunca borradores |
| Lectura por el modelo de F4 (audiencia o capabilities) | Como en F4 | Solo las `accepted` (equipo confirmado, conforme a lo acordado) |

`app.can_read_activity_row` pasa a ser `app.can_read_activity_row_base` (lógica de F4 más `assignment.manage`) **o** estar asignado. Las políticas de F4 que la usan no cambian.

---

## 5. Lo que F5-Carlos consume de Diogo

### 5.1 Disponibilidad (DI-01)

| Aspecto | Estado |
|---|---|
| Firma consumida | `app.person_unavailability(church_id uuid, person_ids uuid[], from timestamptz, to timestamptz)` → filas. Solo se comprueba si devuelve alguna fila para la persona |
| Cómo se consulta | Dinámicamente, **solo si la función existe** (`to_regprocedure`). Si no existe, no se emite el aviso `unavailable`. F5-Carlos **no** crea tabla ni función sustituta |
| Rango enviado | `[starts_at, ends_at)` de la actividad; no se consulta si la actividad no tiene ambos valores |
| Contexto de llamada | Dentro de funciones `security definer` de F5, con el usuario autenticado de la petición: quien gestiona asignaciones (crear, candidato, vista previa, revisión) y también la propia persona al aceptar |
| Si la consulta falla | Cualquier error o denegación de la función se captura: se añade el aviso `availability_unknown` y la operación continúa |
| Resto de la propuesta anterior (columnas devueltas, privacidad del motivo, capability que la autoriza, zona) | Pendiente de Diogo |

### 5.2 Frecuencia deseada

`app.person_serving_preferences` **no se consume todavía**. El aviso de frecuencia (decisión 3) queda pendiente de que Diogo fije la firma y el cómputo.

### 5.3 Entrada de eventos de aviso (DI-02) — propuesta pendiente de Diogo

| Campo | Propuesta |
|---|---|
| `idempotency_key` | Obligatorio; único. Reintentar con la misma clave no crea otro aviso |
| `church_id` | Obligatorio; aislamiento por tenant |
| `event_type` | Del catálogo §6 |
| `recipient_person_ids` | Personas (`people.id`) de esa iglesia; el motor resuelve cuentas, dispositivos y preferencias |
| `entity_type`, `entity_id`, `entity_version` | Entidad de origen y su versión (`activity_assignments.version`) |
| `occurred_at` | Instante UTC del hecho |
| `payload` | Mínimo, sin datos sensibles: identificadores, título, `position_name`, `starts_at`/`ends_at`, `timezone`. Sin motivos de cancelación, notas administrativas ni notas privadas de respuesta |
| Reintentos | Responsabilidad del motor; el productor no reintenta envíos |
| Notificación persistente | Se crea antes de cualquier canal externo (D16) |

---

## 6. Eventos de dominio

**Hoy ni F4 ni F5-Carlos emiten eventos ni avisos.** Solo escriben `audit_logs` mediante `app.write_audit_log`, que no es contrato de eventos.

Acciones de auditoría de F4: `activity.created`, `activity.updated`, `activity.duplicated`, `activity.published`, `activity.cancelled`, `activity.completed`, `activity.archived`, `activity.unarchived`, `activity.status_changed`, `activity.series_occurrence_removed`, `activity.area_added`, `activity.area_updated`, `activity.area_removed`, `activity.position_added`, `activity.position_updated`, `activity.position_removed`, `activity.plan_item_added`, `activity.plan_item_updated`, `activity.plan_item_removed`, `activity.plan_reordered`, `activity_template.created`, `activity_template.updated`, `activity_template.archived`, `activity_template.restored`.

Acciones de auditoría de F5-Carlos: `assignment.created`, `assignment.sent`, `assignment.cancelled`, `assignment.accepted`, `assignment.declined`, `assignment.response_recorded`, `assignment.substituted`, `assignment.substitution_requested`, `assignment.substitution_candidate_proposed`, `assignment.substitution_cancelled`, `assignment.cancelled_by_activity`, `assignment.reconfirmation_requested`.

### 6.1 Puntos de emisión marcados en el SQL de F5-Carlos

Marcados con el comentario `EVENTO F5 (DI-02)`. No emiten nada hasta que exista el punto de escritura acordado.

| Función (migración) | Hecho | Evento previsto | Destinatario previsto |
|---|---|---|---|
| `app.create_activity_assignment` (`0500`) | Asignación creada ya enviada (`send`) | `assignment.proposed` | Persona asignada |
| `app.send_activity_assignments` (`0500`) | `proposed` → `pending` | `assignment.proposed` | Persona asignada |
| `app.cancel_activity_assignment` (`0500`) | Retirada por el coordinador | `assignment.cancelled` | Persona, si ya estaba comunicada |
| `app.cancel_activity_assignment` (`0500`) | Retirada de una original con candidato vigente: el candidato → `cancelled` | `assignment.cancelled` | Candidato retirado |
| `app.cancel_substitution_request` (`0500`) | Solicitud cancelada; candidato vigente → `cancelled` | `assignment.cancelled` y `assignment.substitution_cancelled` | Candidato retirado; quien pidió la sustitución |
| `app.apply_assignment_response` (`0500`) | Candidato acepta y la original pasa a `substituted` | `assignment.cancelled` (sustituida) | Persona original |
| `app.apply_assignment_response` (`0500`) | Respuesta propia o de representante | `assignment.accepted` / `assignment.declined` (sin la nota) | Quien gestiona el puesto |
| `app.apply_assignment_response` (`0500`) | La original con sustitución abierta pasa a `declined`: candidato retirado | `assignment.cancelled` | Candidato retirado, si lo había |
| `app.request_assignment_substitution` (`0500`) | Solicitud abierta | `assignment.substitution_requested` | Quien gestiona el puesto |
| `app.propose_substitution_candidate` (`0500`) | Candidato creado en `pending` | `assignment.proposed` | Candidato |
| `app.activities_assignments_sync` (`0300`) | Actividad cancelada, archivada u ocurrencia eliminada | `assignment.cancelled` por asignación afectada | Personas afectadas |
| `app.activities_assignments_sync` (`0300`) | Cambio de `starts_at`/`ends_at` | `activity.rescheduled` | Personas con asignación comunicada |

Eventos del catálogo anterior **sin punto marcado** en el SQL: `activity.published`, `activity.unpublished`, `activity.series_changed` (productor Carlos) y `reminder.due` (productor Diogo). Siguen pendientes (§9).

### 6.2 Deduplicación (propuesta de Carlos, pendiente de Diogo)

La clave de deduplicación de los eventos de asignación usa **`assignment_id` + `version`** (p. ej. `assignment.proposed:{assignment_id}:{version}`), no la fecha: mover una actividad de A a B y de vuelta a A sube la versión dos veces y produce dos eventos legítimos distintos, mientras que un reintento de la misma transición repite la misma clave. `activity.rescheduled` se emitiría por asignación afectada con su nueva versión.

### 6.3 Mecanismo de emisión

**Pendiente de Diogo.** Propuesta: *outbox* escrita en la misma transacción que la mutación de dominio, con el esquema definido por Diogo; Carlos escribe en el punto acordado y el motor de Diogo consume. Un rollback no deja eventos y la entrega externa ocurre fuera de la transacción.

---

## 7. Zona horaria y DST — reglas comunes

| Regla | Detalle |
|---|---|
| Almacenamiento | Instantes en `timestamptz` (UTC) + zona IANA explícita (`activities.timezone`) |
| Validación de zona | Debe existir en `pg_timezone_names` |
| Resolución de zona en F4 | Indicada → sede (`campuses.timezone`) → iglesia (`churches.timezone`) |
| Hora local → instante | En base de datos (`app.local_to_instant`: `timestamp AT TIME ZONE zona`). Hora inexistente → hacia delante; ambigua → horario estándar |
| Recurrencia | Hora local fija por ocurrencia; duración absoluta en minutos |
| Solapes y disponibilidad (F5-Carlos) | Rango `[starts_at, ends_at)` en UTC; sin rango completo no se evalúan solapes ni disponibilidad |
| Recordatorios (propuesta) | Calculados sobre instantes UTC; horas de silencio evaluadas en una zona por decidir (§9) |
| Payloads | Siempre `starts_at`/`ends_at` UTC + `timezone`; el formateo local lo hace el canal |

---

## 8. Migraciones y coordinación

### 8.1 Prefijos

| Rango | Dueño | Estado |
|---|---|---|
| `20260920000100`–`20260920000900` | F4 (Carlos) | Aplicadas en producción |
| `20260921…` | F5-Diogo | Propuesto; pendiente de confirmación de Diogo |
| `20260922000100`–`20260922000500` | F5-Carlos | Usados en `feature/carlos-fase-5-asignaciones`; no aplicados en remoto |

Migraciones de F5-Carlos:

1. `20260922000100_asignaciones.sql`
2. `20260922000200_asignaciones_funciones.sql`
3. `20260922000300_asignaciones_integracion_f4.sql`
4. `20260922000400_rls_asignaciones.sql`
5. `20260922000500_rpc_asignaciones.sql`

Reglas:

- Las migraciones de disponibilidad de Diogo **no deben depender de `activity_assignments`**.
- F5-Carlos no depende del esquema de Diogo (la disponibilidad se consulta solo si existe), así que ambas partes pueden aplicarse en cualquier orden sin error. Si las de Diogo (`20260921…`) llegan a un entorno donde ya están las de Carlos, su marca de tiempo será anterior a la última aplicada: revisar con `supabase db push --dry-run` antes de aplicarlas.
- Cada PR se vuelve a probar (pgTAP completo) con el orden combinado de las ramas ya integradas; Carlos coordina ese orden.

### 8.2 Archivos compartidos (Carlos es responsable)

| Archivo / área | Regla |
|---|---|
| Tenant y autorización (`src/server/tenant/`, `app.has_capability`, catálogo `capabilities`/`role_capabilities`) | Diogo propone capabilities nuevas; Carlos las integra. F5-Carlos añade `assignment.manage` |
| Funciones de lectura de F4 (`app.can_read_activity_row`) | F5-Carlos la redefine (§4.4); cualquier otro cambio se coordina aquí |
| Navegación global `src/components/shell/nav-items.ts` | Diogo propone entradas; Carlos las integra |
| Tipos generados `src/lib/supabase/database.types.ts` | Se regeneran desde el orden combinado; no se editan a mano ni se mantienen versiones paralelas |

---

## 9. Decisiones abiertas

Pendientes de Diogo o de ambos. Única lista vigente.

1. **Emisión de eventos:** mecanismo (propuesta: outbox en la misma transacción, esquema de Diogo) y punto de escritura que usará Carlos (§6.3).
2. **Deduplicación:** clave propuesta `assignment_id` + `version` (§6.2) y ventana adicional del motor.
3. **Silencio y recordatorios:** zona de referencia (destinatario, actividad o iglesia), offsets y excepciones urgentes al silencio.
4. **Llegada por puesto:** F4 no tiene antelación de llegada por puesto; decidir si se incorpora, de forma compatible, antes de basar recordatorios en ella.
5. **Frecuencia:** firma de `app.person_serving_preferences`, si se cuenta por actividad o por puesto y si es por área. Carlos la tratará como aviso (decisión 3).
6. **Disponibilidad:** confirmar la firma de §5.1, qué columnas devuelve y la capability que autoriza la consulta. Si deniega o falla en los contextos de llamada de F5-Carlos, el resultado es el aviso `availability_unknown`.
7. **Destinatarios de avisos y escalado:** quién recibe aceptaciones y rechazos, escalado por criticidad y sin líder, audiencia de `activity.published` y `activity.unpublished`, y si un cambio de serie emite un evento agregado o por ocurrencia.
8. **Transporte:** proveedor de email/push y entorno de pruebas.
9. **Prefijo `20260921…`** para las migraciones de Diogo.

## Acuerdo

- [x] Acordado por Carlos — solo las decisiones de su dominio (§3), el 17 de septiembre de 2026; no incluye lo compartido ni lo de Diogo (§5, §6, §9).
- [ ] Acordado por Diogo
