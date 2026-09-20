# Contrato de la Fase 10 · Recursos, salas y mantenimiento

Estado: **propuesta para revisión — no implementada**. Ningún código, migración, tabla, componente o
RPC de esta fase existe todavía. Este documento se escribe antes de tocar el repositorio, siguiendo
el mismo criterio que [CONTRATO-FASE-7.md](CONTRATO-FASE-7.md): lo que no está aquí, o sobra o falta
el acuerdo.

Punto de partida real: `main` en `0db9faa` (Fase 9 en producción, `docs/13-plan-por-fases.md` §Fase 9).
Ninguna migración de Fase 10 existe todavía; el próximo prefijo libre es posterior a
`20261001001200`.

**Asignación confirmada.** [`docs/REPARTO-CARLOS-DIOGO.md`](REPARTO-CARLOS-DIOGO.md) §1 asigna la Fase
10 a **Carlos**, no a Diogo («F10 · Recursos e instalaciones | Carlos — propuesto, después de F7»).
Confirmado el 20 de septiembre de 2026: **F10 continúa asignada a Carlos.** Este documento es el
contrato de diseño, no una autorización para que Diogo la implemente.

---

## 1. Alcance

**Dentro**

- `resources`: catálogo de salas, equipos, vehículos y otros recursos reservables, con estado,
  responsable opcional, capacidad cuando aplique y aprobación configurable.
- `resource_reservations`: reservas de uso temporal de un recurso, vinculadas opcionalmente a una
  `activity` o creadas de forma independiente cuando corresponda.
- `resource_maintenance`: intervenciones sobre un recurso, con posible bloqueo de disponibilidad e
  histórico.
- Protección transaccional real contra doble reserva en base de datos (exclusion constraint), no solo
  una comprobación de disponibilidad antes de insertar.
- Integración con Activity: una actividad puede reservar 0..N recursos sin que Activity reciba un
  `room_id`.
- Capabilities, scopes (`church`/`campus`/`resource`), RLS, auditoría, notificaciones reutilizando el
  motor existente, UI desktop/mobile siguiendo `imagenes/layout*.png`.
- Archivado con historial legible; ningún borrado físico de un recurso con reservas o mantenimientos
  asociados.

**Fuera** (acordado en este contrato, no se implementa ni se insinúa en la interfaz)

- Cualquier proveedor de email/push real, webhooks externos o reintentos de entrega — no son de esta
  fase (A14, ya resuelto en Fase 9).
- Sistema de inventario/ERP: compras, depreciación, stocks, proveedores, contabilidad de activos.
- Módulo Fleet independiente: combustible, kilometraje, multas, seguros, conductores habilitados.
- QR/códigos de barras para check-out o inventario.
- Importador completo de recursos (mantener compatibilidad con la infraestructura de import/export
  existente, no construir un flujo nuevo).
- Reserva pública sin sesión (el calendario de salas no es público por defecto).
- Aprobación multinivel, flujos de reserva con varias etapas, delegación de aprobación.
- Segmentación de comunicaciones por recurso (eso es Fase 9, no se amplía aquí).
- Cantidades/inventario por unidad física agregada (ver §6, decisión de alcance MVP).

---

## 2. Decisiones de producto (cerradas en este contrato)

| # | Cuestión | Decisión |
|---|---|---|
| P-1 | `Resource` / `Reservation` / `Maintenance` | Tres entidades distintas, nunca una sola tabla. `Resource` es el activo; `Reservation` es un uso temporal; `Maintenance` es una intervención con posible histórico. Ver §5, §8, §17. |
| P-2 | Tipo de recurso: enum cerrado o catálogo configurable | **Confirmado — enum cerrado** (`room`, `equipment`, `vehicle`, `other`) para el MVP. Justificación en §5.1: un catálogo configurable por tenant (como `group_types`) resolvería un problema que no existe todavía — no hay ningún requisito real de que una iglesia necesite un quinto tipo con comportamiento propio; `other` cubre el resto sin bloquear la operación. **Tipos custom de recurso quedan fuera de F10** (confirmado el 20-09-2026, ver P-2b). Ampliar a catálogo configurable es un cambio de esquema aislado y documentado si aparece la necesidad futura. |
| P-2b | Tipos custom de recurso | **Fuera de F10, sin ambigüedad.** No se prepara ningún mecanismo de extensión (ni tabla de catálogo, ni columna de "tipo libre" adicional a `type`) "por si acaso". Si una iglesia necesita un tipo que no encaja en `room`/`equipment`/`vehicle`, usa `other` con `name`/`description`/`metadata` descriptivos. |
| P-3 | `campus_id` en `resources` | **Opcional**, igual que en `activities` (ADR 0003). Una sala normalmente lo tiene; un vehículo o un proyector móvil puede ser tenant-wide. Nunca obligatorio a nivel de esquema. |
| P-4 | Estados de `Resource` | `active`, `unavailable`, `maintenance`, `archived`. Una reserva **nunca** cambia el estado del recurso: una sala reservada de 10:00 a 12:00 sigue `active` a las 9:00 y a las 13:00. `maintenance` como estado del recurso es informativo (ej. "en revisión general, no reservable ahora"), no se deriva automáticamente de una fila en `resource_maintenance` — ver P-11. |
| P-5 | `activity_id` en `resource_reservations` | **Nullable.** Justificación en §8: hay casos reales de reserva sin Activity (préstamo de proyector, uso administrativo de sala, vehículo, mantenimiento) que el propio encargo pide no forzar a convertir en Activity. Una reserva manual sin Activity exige una capability específica (§14, P-15) y siempre lleva `purpose` y `responsible_person_id` — nunca anónima. |
| P-6 | Estados de `Reservation` | **`confirmed`, `cancelled`** como estados obligatorios del MVP. `pending`/`rejected` **solo existen si `resources.requires_approval` es `true`** para ese recurso — no se crean como estados universales sin uso (ver §21, P-14). Si ningún recurso del tenant requiere aprobación, esos dos estados simplemente no aparecen nunca en filas reales; el tipo los admite porque la aprobación es opcional por recurso, no ausente del modelo. |
| P-7 | Mecanismo anti doble-reserva | **Confirmado — capa técnica unificada `resource_occupancy`.** En vez de una exclusion constraint directamente sobre `resource_reservations`, se crea una tabla técnica `resource_occupancy` que registra *cualquier* ocupación real de un recurso — una fila por reserva `confirmed` y una fila por mantenimiento `blocks_availability = true` — y lleva ella sola la `EXCLUDE USING gist` con `btree_gist` sobre `(resource_id, tstzrange(starts_at, ends_at, '[)'))`. `resource_reservations` y `resource_maintenance` siguen siendo tablas de dominio separadas (P-1 no cambia); `resource_occupancy` es infraestructura interna, no una entidad de producto, y no tiene RPC propia expuesta al cliente — la mantienen triggers/funciones internas al confirmar una reserva o crear/actualizar un mantenimiento bloqueante. Justificación completa y diseño en §10. Sigue siendo la primera vez que el proyecto usa una exclusion constraint. |
| P-8 | Semántica de solape | Intervalos **semiabiertos `[start, end)`**, igual que `app.activity_time_range` (Fase 5). `10:00–11:00` y `11:00–12:00` **no** conflictúan. |
| P-9 | Timezone | Mismos instantes UTC (`timestamptz`) que `activities`, misma resolución en el borde de presentación (zona de campus → zona de iglesia). No se introduce una estrategia distinta. |
| P-10 | Cantidades/inventario | **Cada unidad física es un `Resource` independiente** (`Silla plegable #003`, no `sillas: quantity=50`). No se modela inventario agregado en el MVP: el encargo prohíbe explícitamente construir un ERP, y un campo `quantity` en `Resource` abriría la puerta a "reservar 3 de 10" sin resolver disponibilidad por unidad, que es un problema de diseño distinto (reservas parciales de un pool) no pedido aquí. Recursos que en la práctica son fungibles en cantidad (sillas, mesas) quedan fuera de alcance del MVP salvo que se traten como un recurso único reservable como bloque (`Set de sillas del salón A`). |
| P-11 | Mantenimiento bloqueante | `resource_maintenance` puede bloquear reservas **cuando su tipo lo indica**: se añade `blocks_availability boolean not null default true`. **Confirmado — solo crea fila en `resource_occupancy` cuando `blocks_availability = true`** (§10, §18): un mantenimiento informativo (`false`) nunca entra en la capa de ocupación y por tanto nunca puede chocar con una reserva. No existe aprobación de mantenimiento en el MVP — lo crea quien tiene `facilities.manage_maintenance`, sin flujo adicional. |
| P-12 | Recurrencia | **Reutiliza el motor de `activity_series` únicamente para el caso que ya encaja: una reserva recurrente de sala vinculada a una Activity recurrente** (la serie ya existe en `activities`/`activity_series`; la reserva de recurso se crea por ocurrencia, igual que se crea la estructura de servicio por ocurrencia). **No se extiende `activity_series` para mantenimiento recurrente ni para reservas manuales recurrentes sin Activity**: `activity_series` genera filas de `activities`, y una tarea de mantenimiento periódica sin Activity no necesita ni debe convertirse en una. El mantenimiento recurrente queda fuera del MVP (§19) — se crea una fila de `resource_maintenance` a la vez; automatizarlo es una mejora futura acotada, no un segundo motor de recurrencia. |
| P-13 | Responsables (roles distintos) | Cuatro campos con significado distinto, nunca mezclados: `resources.responsible_person_id` (dueño/responsable del recurso, opcional), `resource_reservations.requested_by` (quién pidió la reserva, siempre resuelto del contexto autenticado, nunca enviado como dato libre), `resource_reservations.responsible_person_id` (quién responde durante el uso, puede coincidir con `requested_by` o no), y quien aprueba (no es un campo, es quien ejecuta `approve_reservation` con `facilities.approve_reservations` — queda en auditoría, no en una columna de "aprobador"). |
| P-14 | Aprobación | `resources.requires_approval boolean not null default false`. Si `false`: una reserva sin conflicto queda `confirmed` directamente. Si `true`: la reserva nace `pending` y exige `facilities.approve_reservations` para pasar a `confirmed` o `rejected`. **Confirmado — una reserva `pending` no bloquea disponibilidad**: no genera fila en `resource_occupancy` (P-7). La operación que adquiere el intervalo es la propia confirmación (`approve_reservation` insertando en `resource_occupancy` en la misma transacción que cambia el `status` a `confirmed`), momento en el que la exclusion constraint decide si hay hueco real. Dos personas pueden tener sendas reservas `pending` solapadas sin error — el conflicto solo se materializa, y se rechaza, cuando alguien intenta confirmar la segunda. |
| P-15 | Reserva manual sin Activity | Permitida solo con capability `facilities.create_reservation` (o superior) y siempre con `purpose` (obligatorio, no vacío), `responsible_person_id` resuelto (nunca nulo) y rango horario explícito. Nunca anónima. No se convierte automáticamente en Activity: son mecanismos distintos por diseño (§14 del encargo). |
| P-16 | Activity cancelada | **Sí, cancelación automática y auditada.** Cuando una `activity` transiciona a `cancelled` (matriz de estados de la Fase 4, ADR 0017), un trigger sobre `resource_reservations` cancela en la misma transacción todas las reservas `confirmed`/`pending` vinculadas a esa actividad, con `cancelled_at`/`cancelled_by` = sistema y auditoría `reservation.cancelled` (`cause: activity_cancelled`) por cada una. Contrastado contra el modelo real de F4: `activities_before_update` ya centraliza la transición de estado en un trigger, así que enganchar la cancelación de reservas ahí sigue el mismo patrón que la cancelación en cascada de ocurrencias de serie (ADR 0017, decisión 6). |
| P-17 | Activity cambia de hora | **Confirmado — operación protegida, nunca puede generar conflicto silencioso.** Un trigger sobre `activities` que detecte cambio de `starts_at`/`ends_at` con reservas `confirmed` vinculadas recalcula el rango para cada recurso reservado: mover la reserva es un `UPDATE` sobre `resource_reservations.starts_at/ends_at` que, en la misma transacción, actualiza su fila en `resource_occupancy` — y es ahí donde la exclusion constraint decide si hay hueco real en el nuevo horario. Si el `UPDATE` de `resource_occupancy` falla por conflicto, todo lo demás falla con él (la reserva, y el `UPDATE` de la actividad que lo disparó): cambiar la hora de una actividad con reservas de recurso queda bloqueado hasta resolver el conflicto a mano. No hay "mejor esfuerzo" silencioso ni reintento automático que reubique la reserva en otro hueco. |
| P-18 | Privacidad del calendario de recursos | El calendario interno de salas/recursos **no es público por defecto**. Visibilidad depende de tenant + pertenencia + capability/scope, igual que el resto del núcleo (§2 de `02-datos-y-rls.md`). Si en el futuro un recurso es públicamente reservable, es un flujo distinto y explícito, no una extensión silenciosa de este. |
| P-19 | Borrado físico de `Resource` | Solo si **nunca** tuvo reservas ni mantenimientos (comprobación en la RPC de borrado, no en UI). Si tiene cualquier historial: archivado obligatorio, sin excepción. Semántica idéntica a la de otras entidades con historial del núcleo (`docs/15-nucleo-plataforma.md` §12). |
| P-20 | Archivar recurso con reservas futuras | **Confirmado — bloqueado, no solo advertido.** `archive_resource` comprueba si existen reservas `confirmed`/`pending` con `starts_at >= now()`; si las hay, la RPC rechaza el archivado con un error de dominio explícito ("Este recurso tiene reservas futuras: cancélalas o resuélvelas antes de archivar.") en vez de archivar y dejarlas huérfanas. Quien archiva debe cancelar o esperar a que pasen esas reservas primero. Sustituye la redacción anterior de este contrato (que dejaba el detalle como advertencia de UI, no como bloqueo de base) — ver §43. |
| P-21 | `resource_maintenance.type` | **Confirmado — clasificación flexible, no enum rígido de dominio.** `type text not null` con `check` de no vacío, sin lista cerrada en base. Ninguna regla de negocio depende hoy de qué tipo concreto de mantenimiento sea; un enum cerrado sería precisión sin propósito. Ver §17.1. |

---

## 3. Lo que se reutiliza (no se reimplementa)

- **Módulos y entitlements.** `modules` ya trae `facilities` (`20260916000600_modulos_entitlements_flags.sql:28`, prioridad de navegación 11). La navegación (`src/components/shell/nav-items.ts:64`) ya apunta a `/app/instalaciones` con `moduleKey: "facilities"` y acento de color propio (`ModuleGrid.tsx`). El paso de onboarding (`PasoModulos.tsx`) ya lista Facilities como módulo activable. El gating usa `app.module_enabled`/`isModuleEnabled` en servidor y el patrón `module-gate.tsx` de las fases anteriores — **el placeholder actual de `src/app/(app)/app/instalaciones/page.tsx` se sustituye**, no se crea una ruta nueva.
- **RBAC.** `app.has_capability(church_id, capability, scope_type, scope_id)` (Fase 0) admite cualquier `scope_type` nuevo sin cambios de esquema: basta con usar `'resource'` como valor de `scope_type` al conceder un rol (`church_people_roles`), exactamente como Fase 7 activó `scope_type = 'group'` sin tocar la tabla. Se construye `app.resource_cap(church_id, campus_id, resource_id, capability)` siguiendo **al carácter** el patrón de `app.activity_cap` (`20260920000500_activity_funciones_y_reglas.sql:83`): capability con scope `church`, o con scope `campus` si el recurso tiene campus, o con scope `resource` sobre el recurso concreto.
- **Identidad y pertenencia.** `people`/`church_people`, `app.current_person_ids`, `app.church_ids_for_user`, `app.assert_active_church_person` — sin cambios.
- **Activity como raíz temporal (ADR 0004, 0017, 0018).** Una reserva vinculada a Activity lee su rango con `app.activity_time_range` (ya existe, Fase 5) en vez de reimplementar el cálculo de rango semiabierto. Facilities **no crea un segundo concepto de "evento"**: si una reserva nace de una actividad recurrente, la recurrencia ya vive en `activity_series`.
- **Avisos (F5) y su extensión aditiva (F7/F8/F9).** `app.emit_notification_event`, deduplicación por `idempotency_key`, bandeja/preferencias/motor, y `app.add_notification_event_types` (creada en el hotfix de Kids, `20260928001000`, para no volver a pisar el `CHECK` de `notification_events.event_type` con un `drop constraint` destructivo como hizo la primera versión de Fase 6). Facilities añade sus tipos con esta función, nunca reescribiendo el `CHECK`.
- **Auditoría.** `app.write_audit_log(church_id, action, entity_type, entity_id, metadata, correlation_id)` sin cambios de firma.
- **Archivos.** `files` (`entity_type`/`entity_id` genéricos, `20260916001100_archivos_jobs_webhooks.sql`) para manual/foto/documento de un recurso — `entity_type = 'resource'`. No se crea un bucket ni tabla de storage específica de Facilities.
- **Capa de servicio.** `DomainError`, `toDomainError`, `requireTenantContext`, `auditLog`, paginación estándar, cliente Supabase server/RPC — mismos helpers que Fase 9.
- **Cron.** El patrón de `src/app/api/tareas/comunicaciones/route.ts` (protegido por `CRON_SECRET`, `GET`/`POST`, `timingSafeEqual`) para el job de avisos de mantenimiento próximo (`maintenance_due`), si el criterio de salida lo exige.
- **Navegación y diseño.** `imagenes/layout*.png` como única referencia visual vigente (ADR 0016) — nunca el diseño antiguo de Calserv para esta pantalla.

**Lo que NO se reutiliza, con motivo verificado contra el código real:**

- La protección de solape de `assignments`/`blockouts` (Fase 5, `app.activity_time_range(a) && v_range` en una consulta, sin `for update` ni exclusion constraint) **no es el mecanismo a copiar** para Facilities: el propio encargo de esta fase exige protección transaccional real, y esa consulta hoy es solo advisory (avisa del conflicto, no lo impide a nivel de base si dos transacciones concurrentes lo intentan a la vez). Se documenta aquí como límite conocido de Fase 5, no como error a corregir en este contrato — corregirlo ahí está fuera de alcance de Fase 10.
- `activity_series` no se extiende para generar reservas o mantenimientos sin Activity (P-12): generaría filas de `activities` para casos que el propio encargo no quiere convertir en Activity.

---

## 4. Modelo conceptual

```text
Resource (sala | equipo | vehículo | otro)
  ├── 0..N ResourceReservation (uso temporal; puede o no tener Activity)
  │     └── 0..1 Activity (nullable)
  └── 0..N ResourceMaintenance (intervención; histórico independiente)
```

`Resource`, `Reservation` y `Maintenance` son tablas distintas (P-1). Ninguna fusiona con otra. Una
`Activity` puede reservar **varios** recursos (Auditorio + Proyector + Cámara 1 + Furgoneta para un
culto dominical) sin que `activities` reciba ninguna columna de recurso: la relación vive enteramente
en `resource_reservations.activity_id`, N filas por actividad.

---

## 5. `Resource`

### 5.1 Campos conceptuales

```text
id
church_id            not null
campus_id            nullable   (P-3)
type                 resource_type not null   (P-2: enum cerrado)
name                 not null
description          nullable
status               resource_status not null default 'active'   (P-4)
capacity             integer nullable   (§15: solo relevante para 'room'; nunca obligatorio)
location_details     text nullable      (ubicación libre: "Planta 1, junto a cocina")
responsible_person_id uuid nullable     (P-13)
reservable           boolean not null default true   (un recurso puede existir sin ser reservable: p. ej. en revisión permanente)
requires_approval    boolean not null default false  (P-14)
metadata             jsonb not null default '{}'     (limitado: ver §5.2, nunca sustituye columnas tipadas)
created_at, updated_at
archived_at          nullable
```

`resource_type`: enum cerrado `('room', 'equipment', 'vehicle', 'other')` — decisión P-2.

`resource_status`: enum cerrado `('active', 'unavailable', 'maintenance', 'archived')` — decisión P-4.
`archived` en `status` y `archived_at` no nulo son la misma condición (mismo patrón de consistencia
que `activities_archived_consistency_check`, ADR 0017).

### 5.2 `metadata` limitado

`metadata jsonb` existe para atributos verdaderamente variables por tipo (ej. matrícula de un
vehículo, modelo de un proyector) que no justifican una columna propia ni una tabla EAV. **No se usa
para**: datos que necesiten validación fuerte, búsqueda estructurada, o cualquier dato de clasificación
`Personal`/`Restringido` (§40 del encargo, §2 de `17-seguridad-operacion.md`). Si un atributo necesita
buscarse o filtrarse, es una columna, no una clave de `metadata`.

---

## 6. Campus

Regla fijada (P-3): `campus_id` es **opcional** en `resources`, igual que en `activities` (ADR 0003).
Una sala normalmente pertenece a una sede; un recurso móvil (proyector portátil) o un vehículo puede
ser tenant-wide. La FK es compuesta tenant-safe: `foreign key (campus_id, church_id) references
campuses (id, church_id)` — el mismo patrón de `activities` (ADR 0014) que hace estructuralmente
imposible relacionar un recurso de la iglesia A con un campus de la iglesia B, no solo una
comprobación en servidor.

---

## 7. Estados del recurso

Ya fijados en P-4. Repetido aquí por completitud: **una reserva nunca es un estado del recurso.**
`resources.status` responde "¿existe y puede usarse este recurso en general?", no "¿está ocupado
ahora mismo?" — esa segunda pregunta la responde `resource_reservations` para un rango concreto.

---

## 8. `ResourceReservation`

### 8.1 Campos conceptuales

```text
id
church_id             not null
resource_id           not null, FK compuesta tenant-safe (resource_id, church_id) -> resources (id, church_id)
activity_id           nullable, FK compuesta tenant-safe (activity_id, church_id) -> activities (id, church_id)   (P-5)
requested_by          uuid not null   (person_id resuelto del contexto, nunca del cliente)
responsible_person_id uuid nullable   (P-13; si nulo, el responsable es requested_by)
starts_at             timestamptz not null
ends_at               timestamptz not null, check (ends_at > starts_at)
status                reservation_status not null default 'confirmed' o 'pending' según P-14
purpose               text not null, check (btrim(purpose) <> '')   (P-15: nunca vacío)
notes                 text nullable   (nunca datos pastorales/financieros/sensibles — §40, §47 del encargo)
created_at, updated_at
cancelled_at          nullable
cancelled_by          nullable
rejected_at           nullable   (solo si requires_approval)
rejected_by           nullable
```

No existe `archived_at` en `resource_reservations`: una reserva pasada no se archiva, queda como
histórico legible con su `status` final (`confirmed`, `cancelled`, `rejected`). Archivar el *recurso*
(P-19) no borra ni oculta sus reservas históricas.

### 8.2 `activity_id` opcional — justificación explícita (P-5)

Casos reales que el propio encargo (§14) exige cubrir sin Activity: préstamo de proyector, uso de sala
para tarea administrativa, vehículo, mantenimiento, uso interno que no merece Activity. Forzar
`activity_id not null` obligaría a crear una Activity fantasma para cada préstamo de proyector, lo que
contamina el calendario de actividades con ruido operativo que nadie quiere ver ahí. La contrapartida
(P-15) es que una reserva sin Activity exige explícitamente `purpose`, `responsible_person_id`
resuelto y una capability específica — nunca es gratis ni anónima.

---

## 9. Estados de reserva

Fijados en P-6 y P-14. `reservation_status`: enum `('pending', 'confirmed', 'cancelled', 'rejected')`.
`pending`/`rejected` solo aparecen en la práctica si el recurso tiene `requires_approval = true`; el
tipo los admite porque la aprobación es una propiedad *por recurso*, no una decisión global del
tenant, así que un mismo tenant puede tener recursos con y sin aprobación simultáneamente.

---

## 10. Doble reserva y conflicto con mantenimiento — mecanismo elegido

### Decisión: `resource_occupancy` como capa técnica unificada

Se crea una tabla técnica, **`resource_occupancy`**, que es la única fuente de verdad de "este
recurso está físicamente ocupado en este rango" — y la única tabla que lleva la exclusion constraint.
`resource_reservations` y `resource_maintenance` **siguen siendo tablas de dominio separadas** (P-1
no cambia: siguen sin fusionarse, cada una con su propio ciclo de vida, permisos y auditoría);
`resource_occupancy` no es una tercera entidad de producto ni tiene RPC propia expuesta al cliente —
es infraestructura interna que resuelve exactamente el problema de §18 (reserva vs. mantenimiento
cruzando dos tablas) sin necesidad de dos exclusion constraints coordinadas a mano.

```sql
create extension if not exists btree_gist;

create table resource_occupancy (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null,
  resource_id uuid not null,
  occupied_range tstzrange not null,
  source_type text not null check (source_type in ('reservation', 'maintenance')),
  source_id uuid not null,  -- resource_reservations.id o resource_maintenance.id
  created_at timestamptz not null default now(),
  unique (source_type, source_id),  -- una ocupación activa por reserva/mantenimiento
  exclude using gist (
    resource_id with =,
    occupied_range with &&
  )
);
```

Reglas de mantenimiento de esta tabla (triggers/funciones internas, nunca escritura directa desde
cliente — mismo revoke total a `anon`/`authenticated` que el resto del esquema):

- **Al confirmar una reserva** (`status` pasa a `confirmed`, sea por `create_reservation` directo sin
  aprobación o por `approve_reservation`): se inserta una fila en `resource_occupancy` con
  `source_type = 'reservation'`. Si la inserción falla por la exclusion constraint, la confirmación
  entera falla y la reserva no llega a `confirmed` (P-14).
- **Al cancelar/rechazar una reserva `confirmed`**: se borra su fila de `resource_occupancy` en la
  misma transacción, liberando el hueco de inmediato (§43, "Cancelar y liberar inmediatamente").
- **Al crear/actualizar un mantenimiento con `blocks_availability = true`**: se inserta o actualiza su
  fila en `resource_occupancy` con `source_type = 'maintenance'` (P-11). Un mantenimiento con
  `blocks_availability = false` **nunca** toca esta tabla.
- **Al completar/cancelar un mantenimiento, o si `blocks_availability` pasa a `false`**: se borra su
  fila de `resource_occupancy`.

Esto hace que **Postgres mismo** rechace cualquier intento de ocupar el mismo recurso dos veces en
rangos que se solapan — sea el origen una reserva confirmándose contra otra reserva ya confirmada, una
reserva confirmándose contra un mantenimiento bloqueante activo, o un mantenimiento bloqueante
creándose sobre una reserva ya confirmada — sin importar cuántas transacciones concurrentes lo
intenten a la vez ni si el servidor de aplicación comprobó disponibilidad antes de escribir. No es una
comprobación de consulta seguida de un insert (razón de carrera clásica: ambas transacciones
consultan "libre", ambas insertan, ambas creen que reservaron).

### Alternativas consideradas

1. **Elegida: `resource_occupancy` con `EXCLUDE USING gist` (`btree_gist`).** Una sola constraint
   resuelve a la vez el conflicto reserva-reserva (§10) y el conflicto reserva-mantenimiento (§18), sin
   duplicar lógica de solape en dos sitios ni depender de que dos rutas de escritura distintas
   coordinen sus locks manualmente. Coste: primera vez que el proyecto usa esta extensión, y una tabla
   técnica adicional que hay que mantener sincronizada por trigger — mitigado por ser un patrón
   mecánico (insertar al confirmar/bloquear, borrar al liberar), no lógica de negocio dispersa.
2. **Exclusion constraint directamente sobre `resource_reservations`, con el conflicto de mantenimiento
   resuelto aparte (`for update` + comprobación manual).** Descartada: exige mantener dos mecanismos de
   protección distintos (uno fuerte por constraint, otro dependiente de que cada RPC recuerde bloquear
   correctamente), justo el riesgo que la opción unificada evita.
3. **`SELECT ... FOR UPDATE` sobre las filas existentes + comprobación de solape dentro de la
   transacción, sin exclusion constraint.** Descartada: exige que **toda** ruta de escritura (RPC
   humana, cron, futuros procesos) recuerde bloquear correctamente y en el mismo orden para evitar
   deadlocks; un solo punto de entrada que se salte el lock rompe la garantía.
4. **Comprobar disponibilidad en servidor antes de insertar (patrón de `assignments`/`blockouts` de
   Fase 5).** Descartada explícitamente: es justo el patrón que el encargo prohíbe ("NO basta con
   consultar disponibilidad y después insertar"), y es además el patrón ya usado en Fase 5, cuya
   debilidad se documenta en §3 de este contrato.
5. **Rango de tipo `tsrange` con columna de zona horaria separada en vez de `tstzrange`.** Descartada:
   `tstzrange` sobre columnas `timestamptz` es coherente con el resto del proyecto
   (`app.activity_time_range` ya usa `tstzrange`), evita el riesgo de comparar instantes en zonas
   distintas.

### Alcance de la protección

`resource_occupancy` protege cualquier combinación de reserva `confirmed` y mantenimiento bloqueante
del mismo recurso. **No** incluye reservas `pending`: una `pending` no ocupa nada hasta confirmarse
(P-14) — dos personas pueden tener sendas solicitudes `pending` solapadas sin error; el conflicto se
resuelve, y se rechaza si corresponde, en el momento de aprobar.

---

## 11. Semántica de solapamiento

Fijado en P-8: intervalos **semiabiertos `[start, end)`**. `10:00–11:00` y `11:00–12:00` **no**
conflictúan — la reserva que termina a las 11:00 libera el recurso exactamente en ese instante para la
que empieza a las 11:00. Coherente con `app.activity_time_range` (Fase 5), que ya usa `tstzrange(...,
'[)')`. No se introduce una semántica distinta para Facilities.

---

## 12. Timezone

Mismos instantes `timestamptz` (UTC) que el resto del núcleo. La zona horaria de presentación se
resuelve en el borde (campus → iglesia), igual que `activities` (ADR 0017, Decisión 5): no se
introduce una tercera estrategia de timezone en la plataforma.

---

## 13. Reservas vinculadas a Activity

```text
Activity (1) ──── (0..N) ResourceReservation
```

Ejemplo del propio encargo: "Culto dominical" reserva Auditorio + Proyector + Cámara 1 + Furgoneta —
cuatro filas de `resource_reservations` con el mismo `activity_id`, cada una con su propio
`resource_id`, y normalmente el mismo rango horario que la actividad (aunque no forzado: un proyector
puede reservarse desde una hora antes para montaje — el rango de la reserva es independiente del
rango de la actividad, la relación es solo de pertenencia).

Facilities **no duplica Activity**: no crea su propia noción de "evento" ni su propio calendario
paralelo de horarios para actividades que ya tienen fecha/hora en `activities`.

---

## 14. Reservas sin Activity

Fijado en P-5/P-15. Capability `facilities.create_reservation` exigida siempre; sin Activity, además
`purpose` y `responsible_person_id` resueltos son obligatorios a nivel de constraint, no solo de
validación en servidor (`purpose` lleva `check` de no vacío; `responsible_person_id` nulo se resuelve
a `requested_by` antes de insertar, nunca queda nulo en la fila final).

---

## 15. Capacidad

`resources.capacity` es `integer nullable`, sin `check` que lo obligue por tipo a nivel de esquema
(un `check` condicionado por `type` es frágil si se amplía el enum). La **validación de si tiene
sentido pedirlo** vive en la capa de servicio/UI: el formulario de alta solo muestra el campo capacidad
cuando `type = 'room'`; para `equipment`/`vehicle`/`other` queda oculto y se guarda `null`. No se
obliga capacidad globalmente (petición explícita del encargo, §15).

---

## 16. Quantities

Fijado en P-10: cada unidad física es un `Resource` independiente, sin campo `quantity`. Ver
justificación completa en la tabla de decisiones.

---

## 17. Mantenimiento

### 17.1 Campos conceptuales

```text
id
church_id              not null
resource_id            not null, FK compuesta tenant-safe
type                   text not null, check (btrim(type) <> '')   (P-21: clasificación flexible)
title                  not null
description            nullable
starts_at              timestamptz not null
ends_at                timestamptz nullable   (una intervención puede no tener fin conocido de antemano)
status                 maintenance_status not null default 'scheduled'
blocks_availability    boolean not null default true   (P-11)
responsible_person_id  uuid nullable
recurrence             fuera de alcance del MVP (P-12) — columna no se crea todavía
completed_at           nullable
created_at, updated_at
cancelled_at           nullable
```

`maintenance_status`: enum `('scheduled', 'in_progress', 'completed', 'cancelled')`. Sin aprobación
(P-11): quien tiene `facilities.manage_maintenance` la crea directamente.

**P-21 (confirmado) — `type` es clasificación flexible, no enum rígido de dominio.** A diferencia de
`resource.type` (P-2, con impacto directo en UI y en validaciones como capacidad), el tipo de
mantenimiento (`revisión`, `limpieza`, `reparación`, `inspección legal`...) no cambia el comportamiento
del sistema, solo es descriptivo — no hay ninguna regla de negocio que dependa de qué valor concreto
tenga. `type text not null` con `check` de no vacío, sin `CHECK ... IN (...)` cerrado. La UI ofrece una
lista de sugerencias frecuentes (autocompletar, no obligar), pero el servidor no rechaza un valor fuera
de esa lista. Si en el futuro aparece una regla de negocio real que dependa del tipo de mantenimiento
(por ejemplo, un tipo que exija aprobación cuando otros no la exigen), se cierra ese subconjunto con un
`check` adicional en ese momento, no antes.

### 17.2 ¿Bloquea, es informativo, o necesita aprobación?

Fijado en P-11: depende de `blocks_availability` por fila, por defecto `true`. No hay aprobación de
mantenimiento en el MVP.

---

## 18. Mantenimiento y conflictos

Ejemplo del encargo: Proyector con `maintenance` 10:00–12:00 (`blocks_availability = true`) y un
intento de `reservation` 11:00–13:00 **debe** ser rechazado con el mismo rigor que dos reservas
solapadas (§10). Resuelto directamente por `resource_occupancy` (§10): el mantenimiento bloqueante ya
tiene su fila en la tabla de ocupación con `source_type = 'maintenance'` en el momento en que alguien
intenta confirmar la reserva de 11:00–13:00; la exclusion constraint rechaza la inserción de la
ocupación de la reserva (`resource_id` igual, rangos solapados), y la confirmación falla con el mismo
error de dominio que dos reservas solapadas. Mismo mecanismo, mismo rigor, sin dos sistemas de
protección distintos que mantener sincronizados.

---

## 19. Recurrencia

Fijado en P-12. Dentro de F10: reserva recurrente de sala **solo** cuando cuelga de una Activity
recurrente ya existente (reutiliza `activity_series`). Fuera de F10: mantenimiento recurrente
(limpieza semanal, revisión mensual) y reserva recurrente **sin** Activity — se crean fila a fila en
el MVP; automatizar su generación es una mejora futura acotada y explícita, no un segundo motor de
recurrencia construido ahora.

---

## 20. Responsables

Fijado en P-13. Cuatro roles distintos, nunca un único campo "responsable":

| Rol | Dónde vive | Puede ser nulo |
|---|---|---|
| Owner/responsable del recurso | `resources.responsible_person_id` | Sí |
| Solicitante de la reserva | `resource_reservations.requested_by` | No — resuelto del contexto autenticado |
| Responsable durante el uso | `resource_reservations.responsible_person_id` | Sí — si nulo, es `requested_by` |
| Quien aprueba | No es un campo; se audita quién ejecutó `approve_reservation` | — |

---

## 21. Aprobación

Fijado en P-14. `resources.requires_approval` decide, por recurso, si una reserva nace `confirmed`
(si no hay conflicto) o `pending` (exige `facilities.approve_reservations`).

---

## 22. Permisos (capabilities)

Nuevas, módulo `facilities`:

```text
facilities.read
facilities.manage_resources
facilities.create_reservation
facilities.manage_reservations
facilities.approve_reservations
facilities.manage_maintenance
```

`facilities.manage_reservations` cubre editar/cancelar cualquier reserva dentro del scope efectivo;
`facilities.approve_reservations` es la única que puede mover `pending → confirmed/rejected` — separada
de `manage_reservations` por el mismo motivo que Fase 9 separó `communications.cancel` de
`communications.schedule` (ADR 0021): una capability que permite gestionar no debería implicar
silenciosamente la capacidad de aprobar.

### Matriz mínima por capability y scope (cerrada)

| Capability | `church_owner` / `church_admin` | `campus_admin` (scope `campus`) | `ministry_leader` | `member` |
|---|---|---|---|---|
| `facilities.read` | Sí | Sí (recursos de su sede) | Sí (solo lectura, todo el tenant) | Sí (solo lectura, todo el tenant) |
| `facilities.manage_resources` | Sí | Sí (recursos de su sede) | No | No |
| `facilities.create_reservation` | Sí | Sí (recursos de su sede) | Sí | No |
| `facilities.manage_reservations` | Sí | Sí (recursos de su sede) | No, salvo scope `resource` concreto (ver abajo) | No |
| `facilities.approve_reservations` | Sí | Sí (recursos de su sede) | No | No |
| `facilities.manage_maintenance` | Sí | Sí (recursos de su sede) | No | No |

Igual que en Fase 4 (`ministry_leader` no recibe `activity.manage` por defecto, ADR 0017 Decisión 12),
`ministry_leader` recibe **solo** `facilities.read` (todo el tenant, para poder consultar
disponibilidad al planificar) y `facilities.create_reservation` (para poder reservar recursos para su
área) — no administra el catálogo de recursos ni aprueba ni gestiona mantenimiento por defecto.
`member` recibe únicamente `facilities.read`: puede consultar disponibilidad, no reservar sin un rol
adicional. Cualquier reserva creada por `member` necesitaría una capability que este contrato no le
concede — si el producto necesita que cualquier miembro pueda reservar ciertos recursos (ej. un
proyector de préstamo libre), se concede `facilities.create_reservation` explícitamente vía rol, no
ampliando el permiso base de `member`.

**Responsable de recurso** (P-13, §20): no es un rol nuevo del catálogo de `docs/15-nucleo-plataforma.md`
§9. Se concede como una fila de `church_people_roles` con `scope_type = 'resource'` sobre un rol
existente (`ministry_leader` u otro) con la capability `facilities.manage_reservations` scoped a un
`resource_id` concreto — siguiendo el mismo patrón que Fase 7 usó para `group_leader` con
`scope_type = 'group'`. Esto es lo que hace que la fila de `ministry_leader` en la matriz de arriba
diga "No, salvo scope `resource` concreto": el rol de catálogo no lo incluye por defecto, pero una
concesión específica sobre un recurso sí lo habilita para ese recurso exclusivamente. No se crea un
rol de catálogo nuevo solo para esto.

---

## 23. Scopes

Fijado: `church`, `campus`, `resource` (§22, §3). `app.resource_cap(church_id, campus_id, resource_id,
capability)` resuelve la capacidad efectiva, mismo patrón exacto que `app.activity_cap`. Ejemplos del
encargo:

- `campus_admin` → recursos de su campus (`scope_type = 'campus'`, `scope_id = campus.id`).
- "Facilities manager" → todos los recursos autorizados (`scope_type = 'church'`).
- Responsable de un recurso concreto → solo ese recurso (`scope_type = 'resource'`, `scope_id =
  resource.id`).

Todo scope se evalúa server-side vía `app.has_capability`/`app.resource_cap`; nunca se confía en un
`resource_id`/`campus_id` enviado por el cliente como si fuera autorización.

---

## 24. Entitlement

Módulo `facilities`, ya presente en el catálogo (§3). `isModuleEnabled(churchId, "facilities")` +
`ensureFacilitiesModule` (mismo patrón que `ensureCommunicationsModule`) en cada página. Un usuario con
capability pero con el módulo deshabilitado para su tenant no puede operar — el entitlement se
comprueba siempre además del permiso humano, nunca en su lugar.

---

## 25. RLS

Toda tabla nueva (`resources`, `resource_reservations`, `resource_maintenance`, y también la técnica
`resource_occupancy`) cumple, sin excepción, lo ya exigido por `docs/02-datos-y-rls.md` §2 y verificado
automáticamente por `cobertura_rls_test.sql` (Fase 7 lo confirmó: la suite recoge sola cualquier tabla
tenant-aware nueva y falla si le falta RLS forzada):

- `church_id not null`;
- `enable row level security` + `force row level security`;
- grants mínimos (`insert`/`update`/`delete` revocados a `anon`/`authenticated`; escritura solo por RPC
  `security definer`);
- FK compuestas tenant-safe `(hijo_id, church_id) references padre (id, church_id)`;
- índices por `church_id` y por las claves usadas en políticas/consultas frecuentes
  (`resource_id, starts_at`);
- tests cross-tenant explícitos (iglesia A no lee/escribe recursos, reservas ni mantenimientos de la
  iglesia B; FK cross-tenant rechazada; `campus_id` de otra iglesia rechazado).

`resource_occupancy` es tabla técnica (§10): lleva RLS igual que cualquier otra, pero **sin política de
`SELECT` directa para el cliente** — nadie consulta disponibilidad leyendo `resource_occupancy`
directamente, se consulta a través de `resources`/`resource_reservations`/`resource_maintenance` o de
una RPC de disponibilidad dedicada. Mismo patrón que `communication_recipients` en Fase 9 (ADR 0020):
una tabla de soporte interno no necesita, y no debe tener, superficie de lectura propia para el
cliente.

No se relaja ninguna política existente para dar cabida a Facilities.

---

## 26. RPC

Disciplina ya consolidada desde Fase 9 (ADR 0020/0021), sin excepción:

- Cada operación de escritura: función `app.*` `security definer` + wrapper `public.*` `security
  invoker`.
- `revoke all ... from public, anon` explícito en las dos capas; `grant execute ... to authenticated`
  solo donde corresponda.
- `search_path` fijo (`pg_catalog, public`).
- Cada RPC valida, en este orden: tenant (vía `requireTenantContext`/RLS), capability + scope (vía
  `app.resource_cap`), entitlement del módulo, estado del recurso/reserva (transiciones válidas), y
  audita en la misma transacción.
- Rutas separadas humano vs. cron cuando aplique (ej. job de `maintenance_due`), mismo patrón que
  `app.materialize_communication` vs. `app.cron_materialize_communication` (ADR 0020).
- Tests pgTAP por cada RPC nueva, incluidos los escenarios de aislamiento de §13-datos-y-rls.md §13.

---

## 27. UI

Ruta raíz: **`/app/instalaciones`** — ya reservada en `nav-items.ts`, no `/app/facilities` (la
convención del proyecto usa nombres en español para rutas de usuario, igual que `/app/comunicacion`,
`/app/servicios`). Sustituye el placeholder actual de
`src/app/(app)/app/instalaciones/page.tsx`.

Subrutas propuestas (routing, no implementación):

```text
/app/instalaciones                      (dashboard)
/app/instalaciones/recursos             (listado + filtros)
/app/instalaciones/recursos/nuevo
/app/instalaciones/recursos/[resourceId]
/app/instalaciones/reservas             (listado + calendario/disponibilidad)
/app/instalaciones/reservas/nueva
/app/instalaciones/mantenimiento
```

Referencia visual: `imagenes/layout*.png` (ADR 0016) — nunca Calserv para esta sección, que es
enteramente nueva y no tiene equivalente en la app de Alabanza.

---

## 28. Dashboard

KPIs reales (nunca inventados/hardcoded), calculados contra las tablas reales:

- Recursos activos (`count(*) where status = 'active'`).
- Reservas hoy (`count(*) where status = 'confirmed' and tstzrange(starts_at, ends_at) && tstzrange(today_start, today_end)`).
- Mantenimientos pendientes (`count(*) where status in ('scheduled', 'in_progress')`).
- Conflictos/solicitudes pendientes (`count(*) where status = 'pending'`, solo tiene sentido si algún
  recurso del tenant usa `requires_approval`).

Secciones: Próximas reservas, Recursos (resumen por tipo/estado), Mantenimiento, Incidencias
relevantes (mantenimientos bloqueantes activos ahora mismo).

---

## 29. Calendario / disponibilidad

Debe responder "¿está libre la sala principal el sábado de 16:00 a 20:00?" sin navegar varias
pantallas: una vista filtrada por recurso (selector de recurso + selector de rango) que consulta
directamente contra la misma fuente de verdad que la exclusion constraint protege (reservas
`confirmed` + mantenimientos bloqueantes en el rango). **No se reconstruye el calendario general de
Activity** — Facilities ofrece una vista propia, acotada a recursos, no un calendario de eventos
paralelo.

---

## 30. Notificaciones

Reutiliza el motor común (§3). Eventos nuevos en `notification_events.event_type`, añadidos vía
`app.add_notification_event_types` (nunca reescribiendo el `CHECK`):

```text
reservation.requested
reservation.confirmed
reservation.rejected
reservation.cancelled
reservation.changed
maintenance.due
maintenance.scheduled
maintenance.completed
```

No se implementa un segundo sistema de avisos. El transporte externo sigue el mismo estado que el
resto de la plataforma (A14): en cola, sin salida real, mientras no exista proveedor.

---

## 31. Auditoría

Mínimo, siguiendo el patrón de acción/entidad ya usado (`activity.*`, `communication.*`,
`group.*`):

```text
resource.created
resource.updated
resource.archived

reservation.created
reservation.confirmed
reservation.rejected
reservation.cancelled
reservation.updated

maintenance.created
maintenance.updated
maintenance.completed
maintenance.cancelled
```

Metadata registra campos cambiados y motivos cortos (ej. `has_reason`), nunca contenido libre
extenso. Ninguna nota (`resource_reservations.notes`) se copia íntegra al payload de auditoría.

---

## 32. Archivado

Fijado en P-19 (junto con §33) y P-20. Un recurso con historial (reservas o mantenimientos, en
cualquier estado, incluidos cancelados/rechazados) se archiva, nunca se borra. **Un recurso con
reservas futuras `confirmed`/`pending` no puede archivarse sin resolverlas primero** (P-20): la RPC de
archivado las comprueba y rechaza la operación si existen, en vez de archivar y dejarlas huérfanas o
apuntando a un recurso ya no disponible. Las reservas históricas (pasadas, o futuras ya
canceladas/rechazadas) de un recurso archivado permanecen legibles con su recurso "archivado"
indicado, no ocultas. Una `Activity` histórica que reservó un recurso ya archivado sigue mostrando esa
reserva sin romperse — el recurso archivado sigue existiendo como fila, solo deja de ser reservable de
nuevo (`reservable` pasa a `false` implícitamente al archivar, o el estado `archived` ya lo cubre).

---

## 33. Resource delete

Fijado en P-19: borrado físico solo si nunca tuvo reservas ni mantenimientos; si tiene cualquier
historial, archivado obligatorio. Semántica simple y consistente con el resto del núcleo, sin
excepciones por tipo de recurso.

---

## 34. Search/filter

Mínimo: búsqueda por nombre; filtros por tipo, campus, estado, disponibilidad (rango libre/ocupado) y
responsable. No se diseña un motor de búsqueda complejo (full-text, ranking, sinónimos) — un `ilike`
sobre `name` server-side, paginado, es suficiente para el volumen esperado de recursos por iglesia.

---

## 35. Mobile / desktop

Mobile (mínimo): consultar recurso, ver disponibilidad, reservar, cancelar si autorizado, consultar
mantenimiento. Desktop: calendario, administración, filtros, planificación — mismo criterio de
"mobile first, escritorio cuando aporta valor" ya fijado en `docs/00-vision.md` §Principios de
producto.

---

## 36. QR / códigos

Fuera de F10 (P-2/§36 del encargo), salvo decisión expresa posterior. No se introduce infraestructura
de QR "por si acaso".

---

## 37. Inventario

Fuera de alcance salvo estado, identificación, localización, disponibilidad y mantenimiento — ya
cubierto por el modelo de `Resource`/`Reservation`/`Maintenance` de este contrato. No se implementan
compras, depreciación, stocks, proveedores ni contabilidad de activos.

---

## 38. Vehículos

Tratados como `Resource` de `type = 'vehicle'`, sin módulo Fleet independiente. No se implementan
combustible, kilometraje, multas, seguros ni conductores habilitados en el MVP — si aparece un
requisito explícito futuro, se evalúa como extensión del modelo de `Resource` (probablemente
`metadata` para datos descriptivos, o una tabla de extensión 1:1 si el volumen de campos lo justifica,
mismo criterio que Activity/Service en ADR 0004).

---

## 39. Archivos

Reutiliza `files` del núcleo (`entity_type = 'resource'`, `entity_id = resources.id`) para manual,
foto o documento de un recurso. No se crea storage específico de Facilities. Clasificación por
defecto: `internal`; un documento con datos personales del responsable (si alguna vez se adjuntara)
sería `personal`, nunca `public` por defecto.

---

## 40. Data classification

Facilities maneja mayormente **Internal** (nombre del recurso, ubicación, estado). Un dato **Personal**
real: `responsible_person_id` (referencia a una persona, no un dato libre). `notes` en reservas es
texto libre y **debe** tratarse como potencialmente sensible por diseño de UI/copy ("no incluyas datos
pastorales o financieros aquí"), aunque no se le aplica automáticamente una clasificación restringida
a nivel de esquema — es responsabilidad de quien escribe, como ya ocurre con las notas de otras
entidades del núcleo.

---

## 41. Import/export

No se construye un importador completo en F10. Se mantiene compatibilidad con la infraestructura de
`import_jobs`/`export_jobs` ya existente (Fase 0) para cuando el roadmap lo requiera explícitamente —
no se cierra la puerta, no se construye ahora.

---

## 42. Concurrencia — escenarios explícitos

1. **Doble reserva simultánea.** Usuario 1 confirma Sala A 10:00–12:00; Usuario 2 intenta confirmar
   simultáneamente Sala A 11:00–13:00. Ambas transacciones llegan casi a la vez a insertar su fila en
   `resource_occupancy`. La exclusion constraint (§10) permite que solo un `INSERT` tenga éxito; el
   segundo recibe un error de Postgres (`23P01`, `exclusion_violation`) que la RPC de confirmación
   traduce a un `DomainError` legible ("Ese recurso ya está reservado en ese horario."), nunca un 500
   genérico — y esa segunda reserva se queda en `pending` (o falla la creación directa si no requería
   aprobación), no se reintenta sola en otro hueco.
2. **Mantenimiento bloqueante vs. reserva.** Misma garantía, mismo mecanismo (§18), verificada con
   tests reales contra la base (no solo unitarios de función aislada): confirmar una reserva que se
   solapa con la ocupación de un mantenimiento bloqueante falla igual que si se solapara con otra
   reserva.

Los tests que cubren esto se ejecutan contra Postgres real (pgTAP), disparando dos sesiones
concurrentes cuando el arnés de test lo permita, o como mínimo verificando que la constraint rechaza
el segundo `INSERT` en la misma sesión tras el primero — la garantía la da el motor, no el test; el
test confirma que la garantía existe.

---

## 43. Casos edge (comportamiento fijado, no implementado todavía)

| Caso | Comportamiento fijado |
|---|---|
| Modificar hora de reserva `confirmed` y crear conflicto | El `UPDATE` de `resource_occupancy` (disparado por el cambio de horario de la reserva) falla por la exclusion constraint; la RPC devuelve error legible, la reserva no cambia. Si la reserva está `pending`, no hay `resource_occupancy` que actualizar — el conflicto se detecta recién al confirmar. |
| Cancelar y liberar inmediatamente | Cancelar/rechazar borra la fila correspondiente de `resource_occupancy` en la misma transacción; el hueco queda libre de inmediato. |
| Archivar recurso con reserva futura | **P-20 (confirmado): bloqueado.** `archive_resource` rechaza el archivado si existen reservas `confirmed`/`pending` con `starts_at >= now()`; quien archiva debe cancelarlas o resolverlas primero. No es una advertencia de UI que se pueda saltar, es un rechazo de la RPC. |
| Mover recurso de campus | Permitido; no afecta reservas ya `confirmed` con ese `resource_id` (la reserva no lleva su propio `campus_id`, hereda el del recurso en el momento de consulta). |
| Cambio de timezone | No aplica un mecanismo distinto: los instantes ya están en UTC; cambiar el timezone del campus/iglesia solo cambia cómo se muestran, no altera ninguna reserva ni ninguna fila de `resource_occupancy`. |
| Activity cancelada | P-16: cancelación automática y auditada de reservas asociadas, misma transacción; cada cancelación borra su fila de `resource_occupancy`. |
| Activity cambia de horario | P-17: el `UPDATE` de `resource_occupancy` de cada reserva afectada pasa por la exclusion constraint; si hay conflicto, esa actualización falla y arrastra consigo el `UPDATE` de la actividad en la misma transacción — el cambio de hora queda bloqueado hasta resolver a mano. |
| Maintenance se extiende | Actualizar `ends_at` de la fila de mantenimiento actualiza (o crea, si antes no bloqueaba) su fila en `resource_occupancy`; si `blocks_availability = true` y la extensión colisiona con una reserva `confirmed` ya existente, esa actualización falla por la misma exclusion constraint (§18) — no se permite extender un mantenimiento "por encima" de una reserva ya confirmada sin resolución explícita. |
| Usuario pierde permiso después de crear reserva | La reserva ya creada permanece válida (no se revoca retroactivamente); el usuario sin permiso ya no puede modificarla/cancelarla, pero alguien con `facilities.manage_reservations` en el scope correspondiente sí puede. |

---

## 44. Activity cancelada

Ver P-16. Decisión ya cerrada: sí, cancelación y liberación automática y transaccional (cada
cancelación borra su fila de `resource_occupancy`), auditada por reserva afectada, siguiendo el mismo
patrón que la cancelación en cascada de ocurrencias de serie descrita en ADR 0017 (Decisión 6).

---

## 45. Activity cambia de hora

Ver P-17. Decisión ya cerrada: operación protegida, nunca mueve la reserva silenciosamente ni puede
generar un conflicto oculto. La coordinación vive en la misma transacción de
`update_activity`/`update_activity_series` (capa RPC), apoyándose en que la exclusion constraint de
`resource_occupancy` (§10) hace estructuralmente imposible que un `UPDATE` de horario de actividad deje
dos ocupaciones solapadas del mismo recurso — la actualización de `resource_occupancy` es la que falla
primero, y arrastra consigo tanto la reserva como el cambio de horario de la actividad.

---

## 46. Reserva manual

Ver P-5/P-15. Cerrado: capability específica, `purpose` y `responsable` obligatorios, inicio/fin
explícitos, nunca anónima.

---

## 47. Privacidad

Ver P-18. Cerrado: calendario interno nunca público por defecto; visibilidad depende de
tenant/pertenencia/capability-scope.

---

## 48. Escenarios de aceptación

| ID | Escenario |
|---|---|
| S10-01 | Crear un recurso tipo sala, con campus y capacidad. |
| S10-02 | Crear una reserva libre (sin Activity) con `purpose` y responsable. |
| S10-03 | Intentar una reserva solapada con otra `confirmed` del mismo recurso → rechazada por la base. |
| S10-04 | Reservar varios recursos (sala + proyector + vehículo) para una misma Activity. |
| S10-05 | Cancelar una reserva y comprobar que el hueco queda libre inmediatamente para una nueva reserva en el mismo rango. |
| S10-06 | Mantenimiento bloqueante sobre un recurso impide una reserva solapada. |
| S10-07 | Reservar un recurso de otro campus de la misma iglesia (permitido si el recurso es tenant-wide o del campus correcto; rechazado si es de un campus distinto sin scope). |
| S10-08 | Intento cross-tenant: iglesia A intenta leer/reservar un recurso de iglesia B → rechazado por RLS/FK tenant-safe. |
| S10-09 | Usuario sin `facilities.create_reservation` intenta reservar → `FORBIDDEN`. |
| S10-10 | `campus_admin` con scope de campus solo ve/gestiona recursos de su campus, no de otras sedes de la misma iglesia. |
| S10-11 | Activity con reservas de recurso cambia de horario y el nuevo rango colisiona con otra reserva `confirmed` → el cambio de horario de la Activity queda bloqueado. |
| S10-12 | Recurso archivado con historial: sus reservas pasadas siguen siendo legibles; el recurso ya no aparece como reservable en el selector de nuevas reservas. |

---

## 49. Criterios de salida

Fase 10 solo estará completa si:

- [ ] recursos reales pueden crearse/editarse/archivarse;
- [ ] salas/equipos/vehículos están representados sin duplicar modelo (P-1, P-2);
- [ ] Activity puede reservar varios recursos (§13);
- [ ] reservas manuales funcionan según lo aprobado en este contrato (§14, P-5/P-15);
- [ ] doble reserva está impedida en base mediante la exclusion constraint de `resource_occupancy`, no
      solo en frontend (§10);
- [ ] mantenimiento bloqueante funciona con la misma garantía que las reservas, vía la misma
      `resource_occupancy` (§18);
- [ ] cancelación libera disponibilidad inmediatamente (§43);
- [ ] historial permanece legible tras archivar, y archivar con reservas futuras queda bloqueado (§32,
      §33, P-20);
- [ ] multi-campus funciona (`campus_id` opcional, FK tenant-safe, §6);
- [ ] entitlement del módulo `facilities` funciona (§24);
- [ ] capabilities/scopes funcionan según la matriz cerrada, incluido el scope `resource` (§22, §23);
- [ ] RLS habilitada y forzada en las cuatro tablas nuevas (`resources`, `resource_reservations`,
      `resource_maintenance`, `resource_occupancy`), recogida por `cobertura_rls_test.sql` (§25);
- [ ] tests cross-tenant pasan (§25, §48 S10-08);
- [ ] tests de reserva concurrente pasan contra Postgres real (§42);
- [ ] auditoría funciona para las 14 acciones mínimas listadas (§31);
- [ ] notificaciones reutilizan el motor existente, sin segundo sistema de avisos (§30);
- [ ] UI desktop/mobile cumple `imagenes/layout*.png` (§27, §35);
- [ ] `npm run lint`, `npm run typecheck`, `supabase test db`, `npm run build` pasan;
- [ ] documentación (`docs/13-plan-por-fases.md`, `docs/15-nucleo-plataforma.md` si aplica, ADR nuevo)
      queda actualizada con el estado real, sin inflar "producción" antes de comprobarlo en pantalla
      (mismo criterio que Fase 9, `docs/13-plan-por-fases.md` §Fase 9 final).

---

## 50. Decisiones todavía abiertas

Confirmado el 20 de septiembre de 2026: quién implementa (Carlos), el mecanismo anti doble-reserva
unificado (`resource_occupancy`), que `pending` no ocupa el intervalo, que el mantenimiento solo ocupa
cuando bloquea, que archivar con reservas futuras se bloquea (no se advierte y se permite), que
Activity-cancel libera y Activity-reschedule es una operación protegida, la matriz mínima de
capabilities/scopes, y que los tipos custom de recurso quedan fuera de F10. Quedan genuinamente
abiertas solo estas cuestiones, que no se cierran en este contrato porque requieren una decisión humana
que no puede inventarse sin arriesgar construir algo que nadie pidió:

1. **Prueba de concepto de `resource_occupancy` contra Postgres real** (§10, §52): el diseño está
   cerrado, pero no se ha ejecutado ni validado ninguna migración de prueba en este contrato —
   confirmar el comportamiento exacto de la exclusion constraint (mensaje de error `23P01`, coste de
   mantener sincronizada la tabla por trigger) es trabajo de diseño técnico/implementación, no de este
   documento.
2. **Si Facilities necesita su propia página `/app/instalaciones/[resourceId]/calendario` separada del
   selector de disponibilidad genérico**, o si una sola vista basta (§27, §29): detalle de UX a resolver
   en diseño de interfaz, no en este contrato de datos/permisos.
3. **Redacción exacta de los mensajes de error de dominio** (conflicto de reserva, archivado bloqueado
   por reservas futuras, etc.): el contrato fija el comportamiento y ejemplos de texto, no la copy
   final de producto.

---

## 51. Dependencias

- **Activity** (Fase 4/5/7, ya en producción): raíz temporal, matriz de estados, `activity_series`,
  `app.activity_time_range`, `app.activity_cap` como patrón a replicar.
- **Entitlements** (Fase 0): módulo `facilities` ya en el catálogo, falta el gate real de página.
- **RBAC/capabilities/scopes** (Fase 0, extendido en Fase 7 con `scope_type = 'group'`): mecanismo
  genérico ya soporta `scope_type = 'resource'` sin cambios de esquema.
- **Auditoría** (Fase 0): `app.write_audit_log` sin cambios de firma.
- **Notificaciones** (Fase 5, extendido aditivamente en F7/F8/F9): `app.emit_notification_event`,
  `app.add_notification_event_types`.
- **Files** (Fase 0): tabla genérica reutilizable sin cambios.
- **`btree_gist`** (extensión de Postgres, no instalada todavía en este proyecto): debe habilitarse en
  la primera migración de Facilities, antes de crear `resource_occupancy`.

---

## 52. Riesgos

1. **Primera exclusion constraint del proyecto, y primera tabla técnica de este tipo
   (`resource_occupancy`).** Sin precedente en el repositorio; el diseño técnico debe incluir una
   prueba de concepto local antes de comprometerse a la migración final (§50.1), especialmente para
   verificar el comportamiento exacto del mensaje de error (`23P01`) y su traducción a `DomainError`, y
   el coste de mantener `resource_occupancy` sincronizada por trigger en cada punto de escritura
   (confirmar reserva, cancelar reserva, crear/actualizar/completar mantenimiento bloqueante).
2. **`resource_occupancy` es un punto único de fallo para toda la protección de conflictos.** Si algún
   trigger que debería insertar/borrar una fila ahí se olvida en una ruta de escritura nueva (por
   ejemplo, un futuro proceso batch de mantenimiento masivo), esa ruta rompe silenciosamente la
   garantía para todos los demás casos. Mitigación: toda escritura sobre `resource_reservations`/
   `resource_maintenance` que afecte disponibilidad pasa por un número reducido y bien definido de RPC
   `app.*`, nunca por `INSERT`/`UPDATE` directo (ya exigido por §26); revisar en el diseño técnico que
   no exista ninguna vía de escritura que se salte esas RPC.
3. **`activity_series` no diseñado para generar reservas de recurso por ocurrencia**: aunque P-12 fija
   que se reutiliza para el caso Activity-recurrente, la implementación real de "una reserva de recurso
   por ocurrencia de la serie" no tiene código existente que copiar tal cual — Fase 4 solo replica
   estructura de servicio (áreas/puestos/plan), no reservas de recurso. Es trabajo nuevo, no una
   reutilización mecánica.
4. **Campo `metadata jsonb`** (§5.2): riesgo de que, bajo presión de plazos, se use como cajón de sastre
   para datos que deberían ser columnas o quedar fuera de alcance (P-10, inventario). Mitigación: este
   contrato ya fija su límite; cualquier ampliación de qué guarda `metadata` debe justificarse por
   escrito, no añadirse silenciosamente en una migración.
