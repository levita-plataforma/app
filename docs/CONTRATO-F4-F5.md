# Contrato F4/F5 — actividades, puestos, disponibilidad y eventos de aviso

Fecha: **16 de septiembre de 2026**. Tarea: **CO-01** (Carlos redacta; Carlos y Diogo acuerdan).

## 1. Propósito, estado y responsables

**Propósito.** Fijar qué produce la Fase 4 y qué consumirá la Fase 5, y proponer lo que cada parte de la Fase 5 expondrá a la otra, para que Carlos y Diogo puedan trabajar en paralelo sin cambios incompatibles.

**Estado.**

```
PROPUESTA — PENDIENTE DE ACUERDO (CO-01) Y DE VALIDACIÓN DE CARLOS
```

- Este documento **no inicia ni autoriza ningún trabajo de F5**. CA-04, CA-05, DI-01 y siguientes son encargos separados que deben iniciarse expresamente.
- **Nada de lo descrito está implementado más allá de F4.** Los apartados 3, 4 y 5 son propuestas: no existen tablas, funciones ni eventos de F5.
- Los datos de F4 proceden de las migraciones `20260920000100`–`20260920000900` y de `src/server/activities/` en la rama `feature/carlos-fase-4-actividades`. Esas migraciones no se han aplicado en ningún entorno remoto. Detalle: [ADR 0017](adr/0017-actividades-planificacion-fase-4.md) y [FASE-4-ACTIVIDADES.md](FASE-4-ACTIVIDADES.md).

**Responsables.**

| Quién | Dominio |
|---|---|
| **Carlos** | Actividades, puestos de actividad, asignaciones, transiciones, cobertura y contrato con Serving |
| **Diogo** | Disponibilidad, preferencias de frecuencia, notificaciones persistentes, cola y transporte email/push |
| **Ambos** | Definición de eventos, destinatarios, deduplicación, cambios y cancelaciones, pruebas del recorrido completo |

---

## 2. Lo que F4 produce

**Estable** = F5 puede leerlo y depender de ello; un cambio incompatible requiere acordarlo aquí. **Interno** = detalle de F4 que F5 no debe usar.

Toda escritura en estas tablas pasa por RPC de F4: `authenticated` no tiene `INSERT/UPDATE/DELETE` directos. F5 no escribe en tablas de F4; si necesita un cambio, lo pide mediante una RPC acordada.

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
| `app.activity_accepts_assignments(activity_id)` | `true` si `status in ('planned','published')` y (`flexible` o `ends_at > now()`) | Estable. Con usuario, filtra por lectura. Sin wrapper público |
| `app.position_coverage_status(min, max, assigned)` | `uncovered`, `partially_covered`, `covered` (incluye mínimo 0), `overstaffed` (nunca con máximo nulo) | Estable |
| `public.activity_position_coverage(activity_id)` | Por puesto: `min_people`, `max_people`, `assigned_count`, `coverage_status`. **En F4 `assigned_count = 0` siempre** | Estable en forma; F5 sustituye el recuento |
| `app.can_read_activity(activity_id)` | Modelo de lectura (§2.4) | Estable |
| `app.activity_cap(church, campus, activity, capability)` | Capability con scope `church`, `campus` o `activity` | Estable |
| `app.activity_structure_issues`, `app.activity_structure_issues_unchecked` | Incidencias de estructura | Interno |
| `app.evaluate_person_eligibility(church, service_position, person)` (F3) | Elegibilidad contra el **puesto de catálogo** y `now()` | Existente, **no apto** para asignar por fecha de actividad (§3) |

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

---

## 3. Lo que F5-Carlos añadirá (CA-04/CA-05) — propuesta

Nada de este apartado existe.

### 3.1 Tabla de asignaciones (boceto)

| Columna | Propuesta |
|---|---|
| `id`, `church_id` | FK tenant-safe `(id, church_id)` |
| `activity_id`, `activity_position_id` | FK compuesta a `activity_positions (id, church_id)` |
| `person_id` | FK `(church_id, person_id)` → `church_people`; persona activa de la iglesia |
| `status` | Ver §3.2 |
| `proposed_by`, `proposed_at`, `responded_at`, `response_source` | Trazabilidad |
| `substitutes_assignment_id` | Sustitución |
| `eligibility_snapshot` | Resultado de elegibilidad al proponer (motivos sin datos sensibles) |
| Unicidad | Una asignación vigente por `(activity_position_id, person_id)` |

### 3.2 Estados (propuesta)

| Estado | Significado | Cuenta para cobertura |
|---|---|---|
| `proposed` | Creada por un coordinador, aún no comunicada | Por decidir (§8) |
| `pending` | Comunicada, esperando respuesta | Por decidir (§8) |
| `accepted` | Aceptada | Sí |
| `declined` | Rechazada | No |
| `cancelled` | Retirada por el coordinador o por cancelación de la actividad | No |
| `substituted` | Sustituida por otra asignación | No |

### 3.3 Reglas previstas

- Solo se asigna si `app.activity_accepts_assignments(activity_id)` es verdadero.
- **Elegibilidad por fecha de actividad (no existe hoy):** evaluar `app.activity_position_effective_requirements` con vigencia de credenciales en `starts_at` (o ventana de la tarea), no con `now()` ni con el puesto de catálogo.
- **Conflictos de persona:** solapes con otras asignaciones (datos de Carlos) y con la disponibilidad de Diogo (§4.1). Qué bloquea y qué avisa queda abierto (A10).
- **Cobertura:** `assigned_count` pasa a contar asignaciones según §3.2, manteniendo `app.position_coverage_status`.
- Cancelar o reprogramar una actividad con asignaciones genera eventos (§5).

---

## 4. Lo que F5-Diogo expone y Carlos consume (DI-01/DI-02) — propuesta

Nada de este apartado existe. No se eligen transportes.

### 4.1 Disponibilidad y bloqueos (DI-01)

| Aspecto | Propuesta |
|---|---|
| Consulta | `app.person_unavailability(church_id, person_ids uuid[], from timestamptz, to timestamptz)` → filas `(person_id, starts_at, ends_at, kind)` |
| Rango | Semiabierto `[from, to)` en UTC |
| Zona | Los bloqueos se guardan como instantes UTC más la zona IANA en la que se definieron (para días completos y repeticiones locales); la función devuelve instantes ya resueltos |
| Privacidad | Quien asigna ve solo "no disponible" (`kind` genérico). Motivo y notas: solo la propia persona |
| Autorización | Solo quien puede asignar en esa iglesia (capability a definir) o la propia persona |
| Frecuencia deseada | `app.person_serving_preferences(church_id, person_id)` → frecuencia máxima (p. ej. veces por mes) y, si se decide, por área; la aplicación la trata como aviso, no bloqueo (por acordar) |

### 4.2 Entrada de eventos de aviso (DI-02)

| Campo | Propuesta |
|---|---|
| `idempotency_key` | Obligatorio; único. Reintentar con la misma clave no crea otro aviso |
| `church_id` | Obligatorio; aislamiento por tenant |
| `event_type` | Del catálogo §5 |
| `recipient_person_ids` | Personas (`people.id`) de esa iglesia; el motor resuelve cuentas, dispositivos y preferencias |
| `entity_type`, `entity_id` | Entidad de origen (`activities`, asignación) |
| `occurred_at` | Instante UTC del hecho |
| `payload` | Mínimo, sin datos sensibles: identificadores, título, `starts_at`/`ends_at`, `timezone`. Sin motivos de cancelación ni notas administrativas |
| Deduplicación | Por `idempotency_key`; ventana adicional por `(event_type, entity_id, destinatario)` a acordar |
| Reintentos | Responsabilidad del motor; el productor no reintenta envíos |
| Notificación persistente | Se crea antes de cualquier canal externo (D16) |

---

## 5. Catálogo de eventos de dominio — propuesta

**Hoy F4 no emite ningún evento ni aviso.** Solo escribe `audit_logs` mediante `app.write_audit_log`, con estas acciones:

`activity.created`, `activity.updated`, `activity.duplicated`, `activity.published`, `activity.cancelled`, `activity.completed`, `activity.archived`, `activity.unarchived`, `activity.status_changed`, `activity.series_occurrence_removed`, `activity.area_added`, `activity.area_updated`, `activity.area_removed`, `activity.position_added`, `activity.position_updated`, `activity.position_removed`, `activity.plan_item_added`, `activity.plan_item_updated`, `activity.plan_item_removed`, `activity.plan_reordered`, `activity_template.created`, `activity_template.updated`, `activity_template.archived`, `activity_template.restored`.

| Evento | Productor | Punto de disparo | Payload mínimo | Clave de deduplicación | Audiencia |
|---|---|---|---|---|---|
| `activity.published` | Carlos | Transición `draft/planned → published` | `activity_id`, `title`, `starts_at`, `ends_at`, `timezone` | `activity.published:{activity_id}:{published_at}` | Asignados (si existen); audiencia general por decidir |
| `activity.unpublished` | Carlos | `published → planned` | `activity_id` | `activity.unpublished:{activity_id}:{updated_at}` | Asignados |
| `activity.cancelled` | Carlos | Transición a `cancelled` (incluida la reconciliación de serie) | `activity_id`, `title`, `starts_at`, `timezone` (sin motivo) | `activity.cancelled:{activity_id}:{cancelled_at}` | Asignados no rechazados |
| `activity.rescheduled` | Carlos | Cambio de `starts_at`/`ends_at` de una actividad `published` (individual o por serie) | `activity_id`, anteriores y nuevos `starts_at`/`ends_at`, `timezone` | `activity.rescheduled:{activity_id}:{nuevo starts_at}:{nuevo ends_at}` | Asignados no rechazados |
| `activity.series_changed` | Carlos | `update_activity_series`/`update_activity_series_rule` con ocurrencias publicadas afectadas | `series_id`, ocurrencias afectadas | Por ocurrencia: se emite `rescheduled`/`cancelled` en su lugar (por decidir) | Asignados |
| `assignment.proposed` | Carlos | Asignación comunicada (`pending`) | `assignment_id`, `activity_id`, `position_name`, `starts_at`, `timezone` | `assignment.proposed:{assignment_id}` | Persona asignada |
| `assignment.accepted` | Carlos | Respuesta `accepted` | `assignment_id`, `activity_id` | `assignment.accepted:{assignment_id}:{responded_at}` | Coordinador/líder de área |
| `assignment.declined` | Carlos | Respuesta `declined` | `assignment_id`, `activity_id`, `critical` | `assignment.declined:{assignment_id}:{responded_at}` | Coordinador/líder de área |
| `assignment.cancelled` | Carlos | Asignación retirada o sustituida | `assignment_id`, `activity_id` | `assignment.cancelled:{assignment_id}` | Persona asignada |
| `reminder.due` | Diogo | Planificador de recordatorios según `starts_at` y preferencias | `assignment_id`, `activity_id`, `starts_at`, `timezone` | `reminder.due:{assignment_id}:{offset}:{starts_at}` | Persona asignada |

**Emisión (decisión abierta).** Propuesta: tabla *outbox* por tenant escrita **en la misma transacción** que la RPC de dominio (Carlos escribe; el motor de Diogo consume y marca), de modo que un rollback no deja eventos huérfanos y un reintento no los duplica. Alternativas: llamada directa a una función de Diogo dentro de la transacción, o derivar de `audit_logs` (desaconsejado: la auditoría no es contrato de eventos).

---

## 6. Zona horaria y DST — reglas comunes

| Regla | Detalle |
|---|---|
| Almacenamiento | Instantes en `timestamptz` (UTC) + zona IANA explícita (`activities.timezone`) |
| Validación de zona | Debe existir en `pg_timezone_names` |
| Resolución de zona en F4 | Indicada → sede (`campuses.timezone`) → iglesia (`churches.timezone`) |
| Hora local → instante | En base de datos (`app.local_to_instant`: `timestamp AT TIME ZONE zona`). Hora inexistente → hacia delante; ambigua → horario estándar |
| Recurrencia | Hora local fija por ocurrencia; duración absoluta en minutos |
| Disponibilidad (propuesta) | Rangos en UTC con la zona de definición como contexto; comparación de solapes siempre en UTC |
| Recordatorios (propuesta) | Calculados sobre instantes UTC; horas de silencio evaluadas en la zona del destinatario (por decidir cuál) |
| Payloads | Siempre `starts_at`/`ends_at` UTC + `timezone`; el formateo local lo hace el canal |

---

## 7. Migraciones y coordinación

### 7.1 Prefijos

| Rango | Dueño | Estado |
|---|---|---|
| `20260920000100`–`20260920000999` | F4 (Carlos) | Reservado |
| `20260921…` | F5-Diogo (propuesta) | Por acordar |
| `20260922…` | F5-Carlos (propuesta) | Por acordar |

Migraciones de F4:

1. `20260920000100_activity_status_planned.sql`
2. `20260920000200_activities_ampliacion.sql`
3. `20260920000300_activity_estructura_y_plantillas.sql`
4. `20260920000400_capabilities_actividades.sql`
5. `20260920000500_activity_funciones_y_reglas.sql`
6. `20260920000600_rls_actividades.sql`
7. `20260920000700_rpc_actividades.sql`
8. `20260920000800_recurrencia_actividades.sql`
9. `20260920000900_permisos_actividades_ui.sql`

Propuesta: con `20260921…` para Diogo y `20260922…` para Carlos, las asignaciones de Carlos pueden depender de la disponibilidad de Diogo en orden natural. Cada PR se vuelve a probar (pgTAP completo) con el orden combinado de las ramas ya integradas; Carlos coordina ese orden.

### 7.2 Archivos compartidos (Carlos es responsable)

| Archivo / área | Regla |
|---|---|
| Tenant y autorización (`src/server/tenant/`, `app.has_capability`, catálogo `capabilities`/`role_capabilities`) | Diogo propone capabilities nuevas; Carlos las integra |
| Navegación global `src/components/shell/nav-items.ts` | Diogo propone entradas; Carlos las integra |
| Tipos generados `src/lib/supabase/database.types.ts` | Se regeneran desde el orden combinado; no se editan a mano ni se mantienen versiones paralelas |

---

## 8. Decisiones abiertas

1. Estados de asignación definitivos y cuáles cuentan para cobertura (`proposed`, `pending`).
2. Mecanismo de emisión de eventos: outbox transaccional, llamada directa o alternativa.
3. Esquema de prefijos de migración F5 (`20260921…` Diogo / `20260922…` Carlos u otro).
4. Firma final de la consulta de disponibilidad y capability que la autoriza.
5. Si la frecuencia deseada bloquea o solo avisa.
6. Conflictos que bloquean frente a los que avisan (A10).
7. Audiencia de `activity.published`: solo asignados o también la audiencia general.
8. Si un cambio de serie emite un evento agregado o eventos por ocurrencia.
9. Ventana de deduplicación del motor y su clave.
10. Zona de referencia para horas de silencio y recordatorios (destinatario, actividad o iglesia).
11. Ventana de respuesta: hasta cuándo se acepta, rechaza o cambia una respuesta (A9).
12. Quién publica una actividad multiárea y si un líder publica su parte (propuesta F4: solo `activity.publish` en el ámbito de la actividad; A8).
13. Si F5 necesita un wrapper público de `app.activity_accepts_assignments`.

## Acuerdo

- [ ] Acordado por Carlos
- [ ] Acordado por Diogo
