# Contrato de la Fase 7 · Grupos y discipulado

Estado: propuesta para validación de Carlos. Rama `feature/carlos-fase-7-grupos-discipulado`,
partiendo de `origin/main` = `bde4076`.

Este documento fija lo que la Fase 7 construye, lo que reutiliza de fases anteriores y lo
que deja expresamente fuera. Es el contrato que se revisa antes de mirar el código: si algo
del código no está aquí, o sobra o falta el acuerdo.

---

## 1. Alcance

**Dentro**

- Grupos: catálogo de tipos, grupos, participantes, responsables, solicitudes de ingreso,
  reuniones y asistencia, y comunicación interna al grupo.
- Discipulado: cursos, cohortes, sesiones, matrículas y asistencia; itinerarios, pasos y
  progreso por persona.
- Métricas mínimas: grupos activos, ocupación, asistencia, solicitudes pendientes,
  finalización de cursos y progreso por itinerario.

**Fuera** (acordado en el encargo, no se implementa ni se insinúa en la interfaz)

Kids y recogida de menores, notas pastorales, donaciones y campañas, transportes de correo
y push, pagos, certificados, LMS con contenidos, videoconferencia, módulo de Alabanza, y
cualquier reconstrucción de F4–F6.

---

## 2. Decisiones de producto (resueltas con Carlos el 18-09-2026)

| # | Cuestión | Decisión |
|---|---|---|
| P-1 | Visibilidad de los grupos | Directorio interno para personas con sesión y pertenencia a la iglesia; además, grupos privados visibles solo para responsables y participantes. **Nada público sin sesión.** |
| P-2 | Liderazgo y aforo | El responsable no ocupa plaza: el aforo cuenta participantes. Se puede retirar al último responsable, y entonces el grupo queda **marcado como «sin responsable»**; no se bloquea la operación. |
| P-3 | Inscripción en formación | Ambas vías: la persona **solicita plaza** y el responsable resuelve, o el responsable **matricula directamente**. |
| P-4 | Finalización de un curso | Acto explícito del responsable, con fecha y autor. La aplicación **sugiere** la finalización al alcanzar el umbral de asistencia de la cohorte, pero no la decide. |
| P-5 | Datos personales visibles para el responsable | Nombre **siempre**. Teléfono y correo **solo** si la persona lo permite (visibilidad de directorio) o si quien mira tiene permiso expreso. La ubicación de un grupo privado solo la ven participantes aceptados y responsables. |
| P-6 | Avisos internos automáticos | Lo esencial: solicitud recibida (al responsable); solicitud aceptada o rechazada e incorporación al grupo (a la persona); cambio o cancelación de reunión o sesión (a los participantes); curso o paso de itinerario terminado (a la persona). |
| P-7 | Solicitudes duplicadas | Una sola solicitud **pendiente** por persona y grupo; el ingreso requiere aprobación manual. |
| P-8 | Modificar un itinerario | Los pasos se **archivan**, nunca se borran: el progreso ya conseguido se conserva y sigue siendo legible. |

P-7 y P-8 estaban propuestas en el encargo y se adoptan tal cual.

---

## 3. Lo que se reutiliza (no se reimplementa)

- **Módulos y entitlements.** `modules` ya trae `groups` y `discipleship`
  (`20260916000600_modulos_entitlements_flags.sql:21-22`). El gating usa `app.module_enabled`
  en base y `requireModuleEnabled` en servidor; en página, el patrón `module-gate.tsx` de F6.
- **RBAC.** `app.has_capability(church_id, capability, scope_type, scope_id)` ya admite
  `scope_type = 'group'` desde la Fase 0 (`20260916000700_rbac_capabilities_scopes.sql:74`),
  y el rol `group_leader` ya existe. **Ninguna función lo usaba todavía**: la Fase 7 es la
  primera que activa ese scope.
- **Identidad y pertenencia.** `people` / `church_people`, `app.current_person_ids`,
  `app.church_ids_for_user`, `app.current_person_id`, `app.assert_active_church_person`.
  Las personas sin cuenta (`people.user_id is null`, ADR 0002) participan con normalidad.
- **Activity como raíz temporal (ADR 0004 y 0018).** Los tipos `'group_meeting'` y
  `'course_session'` ya están en el enum `activity_type` desde la Fase 0. Las reuniones y las
  sesiones **son actividades**: fecha, hora, zona horaria, sede, estado, visibilidad y
  recurrencia salen de `activities` y `activity_series`. La Fase 7 no crea un calendario
  paralelo ni duplica ninguna de esas columnas.
- **Avisos (F5).** `app.emit_notification_event(...)` con su deduplicación por
  `idempotency_key` y su filtrado a pertenencia vigente; bandeja, preferencias y motor.
- **Capa de servicio.** `DomainError`, `toDomainError`, `callActivityRpc`,
  `requireTenantContext`, `auditLog`, paginación `[25, 50, 100]`, `listCandidatePeople`.
- **Navegación.** `/app/grupos` y `/app/discipulado` ya están en `NAV_ITEMS` con su
  `moduleKey`, icono y acento de color; se ocultan solos si el módulo está apagado.

---

## 4. Entidades nuevas

### 4.1 Grupos

| Tabla | Para qué | Claves |
|---|---|---|
| `group_types` | Catálogo por iglesia (célula, ministerio de vida, grupo de estudio…) | `unique (church_id, key)`, `unique (id, church_id)` |
| `groups` | El grupo: sede, tipo, visibilidad, aforo, segmento, lugar y periodicidad | `unique (id, church_id)` |
| `group_members` | Participantes, con alta, baja y motivo | una fila activa por grupo y persona |
| `group_leaders` | Responsables con vigencia (`starts_on` / `ends_on`) | uno vigente por grupo y persona |
| `group_join_requests` | Solicitudes de ingreso y su resolución | una **pendiente** por grupo y persona (P-7) |
| `group_meetings` | Extensión 1:0..1 sobre `activities` de tipo `group_meeting` | `unique (activity_id)`, `unique (id, church_id)` |
| `group_attendance` | Asistencia por reunión y persona | `unique (group_meeting_id, person_id)` |

### 4.2 Discipulado

| Tabla | Para qué | Claves |
|---|---|---|
| `courses` | El curso: nombre, descripción, umbral de asistencia sugerido | `unique (id, church_id)` |
| `course_cohorts` | Edición concreta: sede, fechas, aforo, si admite solicitudes | `unique (id, church_id)` |
| `course_sessions` | Extensión 1:0..1 sobre `activities` de tipo `course_session`, numeradas | `unique (activity_id)`, `unique (church_id, cohort_id, session_number)` |
| `course_enrollments` | Matrícula: solicitada, matriculada, terminada, abandonada o rechazada | una activa por cohorte y persona |
| `course_session_attendance` | Asistencia por sesión y persona | `unique (course_session_id, person_id)` |
| `learning_paths` | Itinerario (nuevos creyentes, bautismo, membresía, liderazgo…) | `unique (id, church_id)` |
| `path_steps` | Pasos ordenados; pueden apuntar a un curso o ser manuales; se **archivan** | `unique (id, church_id)` |
| `person_path_progress` | Progreso de una persona en un paso concreto | `unique (learning_path_id, person_id, path_step_id)` |

Todas las tablas llevan `church_id`, FK compuestas tenant-safe `(padre_id, church_id)`
según el ADR 0014, `enable row level security` + `force row level security`, y se archivan
en vez de borrarse (D12). `cobertura_rls_test.sql` las recoge automáticamente y falla si
alguna se queda sin RLS forzada.

---

## 5. Permisos

### 5.1 Capacidades nuevas

Módulo `groups`: `group.read`, `group.create`, `group.manage`, `group.member.manage`,
`group.request.manage`, `group.meeting.manage`, `group.attendance.manage`,
`group.contact.read`.

Módulo `discipleship`: `course.read`, `course.create`, `course.manage`,
`course.enrollment.manage`, `course.attendance.manage`, `path.read`, `path.manage`,
`path.progress.manage`.

### 5.2 Reparto por rol

- `church_owner`, `church_admin`, `campus_admin`: todas.
- `group_leader` (hasta hoy sin ninguna capacidad): `group.read`, `group.member.manage`,
  `group.request.manage`, `group.meeting.manage`, `group.attendance.manage`. **No** recibe
  `group.contact.read`: los datos de contacto siguen la regla P-5.
- `member`: `group.read`, `course.read`, `path.read` — lo que sostiene el directorio interno.

### 5.3 Scope `group`

`app.group_cap(church_id, campus_id, group_id, capability)` resuelve la capacidad efectiva
combinando scope `church`, `campus` del grupo y `group` concreto, igual que
`app.activity_cap` y `app.event_cap` hacen con `activity`. Conceder liderazgo de un grupo es
insertar en `church_people_roles` una fila `('group_leader', 'group', <groups.id>)`; como
`scope_id` no tiene clave foránea genérica (decisión de la Fase 0, comentada en el propio
esquema), la Fase 7 **valida ese uuid** desde su RPC de concesión: debe ser un grupo vivo de
la misma iglesia.

---

## 6. Reglas que la base garantiza

1. Una reunión solo existe sobre una actividad de tipo `group_meeting`; una sesión, sobre una
   de tipo `course_session`. Trigger guard con `errcode 22023`, copiando
   `app.events_activity_type_guard`. Ahora bien, **estas actividades no recorren la máquina de
   estados de la Fase 4**: publicarlas exigiría `activity.publish` y cancelarlas
   `activity.cancel`, capacidades sobre el calendario de toda la iglesia, a quien solo lleva un
   grupo. El acto de cancelar vive en `group_meetings.cancelled_at` y
   `course_sessions.cancelled_at`, con autor y motivo. Ver [ADR 0019](adr/0019-grupos-y-formacion-sobre-activities.md).
2. El aforo cuenta participantes activos y **no** cuenta responsables (P-2).
3. Una sola solicitud pendiente por persona y grupo (P-7); aceptarla crea la participación.
4. Solo se registra asistencia de quien participa en el grupo o está matriculado en la cohorte.
5. Un curso se termina por acto explícito con autor y fecha (P-4); el umbral de asistencia
   solo alimenta una **sugerencia** legible, nunca una transición automática.
6. Los pasos de itinerario se archivan; el progreso conseguido permanece (P-8).
7. Toda escritura pasa por RPC `security definer` con envoltorio `public` `security invoker`;
   `insert`, `update` y `delete` quedan revocados a `anon` y `authenticated`, y `select`
   revocado a `anon`. No hay superficie pública sin sesión en esta fase (P-1).

---

## 7. Avisos internos

Tipos nuevos en `notification_events.event_type`, ampliando el `check` con el mismo patrón
que usó F6 (`drop constraint` + `add constraint`):

`group.join_request.received`, `group.join_request.accepted`, `group.join_request.rejected`,
`group.member.added`, `group.meeting.rescheduled`, `group.meeting.cancelled`,
`course.session.rescheduled`, `course.session.cancelled`, `course.enrollment.completed`,
`path.step.completed`.

Cada uno recibe su texto en `app.notification_text` y su destino en `notificationTarget`,
para que el aviso llegue a la bandeja con título propio y enlace. La función que avisa al
grupo, `app.notify_group_members`, **comprueba la capacidad desde el primer día**: la
equivalente de F6 nació sin esa comprobación y hubo que arreglarla en caliente
(`20260925000400`).

El transporte externo sigue **desactivado**: correo y push se encolan y no salen. La interfaz
no dirá en ningún momento que se ha enviado un correo.

---

## 8. Dependencias y riesgos

- **R-01 (transversal, para decisión de Carlos).** `people_select`, de la Fase 0, deja ver la
  fila completa de `people` —correo y teléfono incluidos— a cualquier miembro de la misma
  iglesia. La Fase 7 aplica la regla P-5 en su propia superficie: expone el contacto solo a
  través de RPC que comprueban permiso o consentimiento, y no amplía nada. Cumplir P-5 de
  extremo a extremo exige estrechar esa política de la Fase 0, lo que afecta a F2, F5 y F6.
  **Queda fuera de esta fase y se propone como trabajo transversal aparte.**
- **R-02.** `app.notification_text` no tiene ramas para los tipos `event.*` y `registration.*`
  de la Fase 6: esos avisos llegan con el título genérico «Aviso». No es un defecto
  introducido por F7; se anota para que se corrija como hotfix de F6.
- **F8** (propuesta para Diogo) tomará de aquí los grupos como destinatarios de comunicación.
  La Fase 7 deja `app.notify_group_members` y el scope `group` listos para ello. No se
  contacta a nadie por este documento.
- Las migraciones nuevas usan prefijos posteriores a `20260925000500`, que es el último
  aplicado en producción. Ninguna migración ya aplicada se reescribe.

---

## 9. Criterio de salida

Una persona pertenece a grupos e itinerarios sin duplicarse, los responsables acceden solo a
lo necesario, y ninguna consulta cruza la frontera de la iglesia. Se demuestra con suites
pgTAP propias (`fase7_grupos_test.sql`, `fase7_discipulado_test.sql`,
`fase7_permisos_test.sql`) que montan dos iglesias y comprueban aislamiento, denegación por
capacidad, efectividad del scope `group`, y que archivar preserva el historial.

**Estado de las pruebas:** 159 aserciones propias en verde (69 de grupos, 59 de discipulado,
31 de permisos) y **1132 en total en las 20 suites del repositorio, sin ningún fallo**. La
suite transversal `cobertura_rls_test.sql` ha pasado de 63 a 78 aserciones porque recoge sola
las quince tablas nuevas y comprueba que todas tienen RLS habilitada y forzada.
