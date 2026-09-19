# Módulos Groups y Discipleship

Implementados en la Fase 7. Lo acordado está en [CONTRATO-FASE-7.md](../CONTRATO-FASE-7.md);
lo construido, en [FASE-7-GRUPOS-DISCIPULADO.md](../FASE-7-GRUPOS-DISCIPULADO.md). Este
documento describe el módulo tal como ha quedado.

## Objetivo

Gestionar comunidad, células, pequeños grupos y procesos de formación sin reutilizar
incorrectamente las áreas de servicio. Un grupo no es un área: tiene responsables,
participantes, reuniones y asistencia, y no hereda el modelo de puestos de Serving
(`docs/01-modelo-dominio.md` §13).

## Entidades de Groups

| Tabla | Para qué |
|---|---|
| `group_types` | Catálogo por iglesia: célula, grupo de estudio, ministerio de vida… |
| `groups` | El grupo: sede, tipo, visibilidad, aforo, segmento, lugar y periodicidad |
| `group_leaders` | Responsables, con vigencia (`starts_at` / `ends_at`) |
| `group_members` | Participantes, con alta, baja y motivo |
| `group_join_requests` | Solicitudes de ingreso y su resolución |
| `group_meetings` | Reunión: extensión de una `activity` de tipo `group_meeting` |
| `group_attendance` | Asistencia por reunión y persona, con marca de invitado |

## Datos de grupo

Tenant, sede, nombre, descripción, tipo, visibilidad (`listed` en el directorio interno o
`private`), aforo, edad o segmento, lugar de reunión, periodicidad legible, política de
ingreso (`open_request` o `invite_only`), estado (`active`, `paused`, `closed`) y archivado.

El **aforo cuenta participantes**: los responsables no ocupan plaza. Se puede retirar al último
responsable; el grupo queda marcado como «sin responsable» y no se bloquea nada.

## Flujos

Crear grupo · incorporar participantes · solicitar plaza · aceptar o rechazar la solicitud ·
convocar reunión, con periodicidad si hace falta · cambiar u hora o cancelar la reunión ·
registrar asistencia · escribir a los participantes del grupo · archivar el grupo conservando
el historial.

La comunicación al grupo (`notify_group_members`) exige capacidad sobre ese grupo y solo llega
a la bandeja de LEVITA: el transporte externo de correo y push sigue desactivado.

## Discipleship

| Tabla | Para qué |
|---|---|
| `courses` | El curso, con el umbral de asistencia que dispara la sugerencia de finalización |
| `course_cohorts` | Edición concreta: sede, fechas, aforo, si admite solicitudes |
| `course_sessions` | Sesión numerada: extensión de una `activity` de tipo `course_session` |
| `course_enrollments` | Matrícula: solicitada, matriculada, terminada, abandonada o rechazada |
| `course_session_attendance` | Asistencia por sesión y persona |
| `learning_paths` | Itinerario |
| `path_steps` | Pasos ordenados (`step_order`); pueden apuntar a un curso o ser manuales |
| `person_path_progress` | Progreso de una persona en un paso |

Casos: nuevos creyentes, bautismo, membresía, liderazgo, formación bíblica.

Se entra en una cohorte por dos vías: alta directa del responsable, o solicitud de plaza que el
responsable resuelve. **Terminar un curso es un acto explícito del responsable**, con autor y
fecha; la aplicación sugiere a quien supera el umbral de asistencia, pero no decide. Terminar
un curso cierra solo el paso del itinerario que apunte a ese curso.

Los pasos de un itinerario **se archivan, nunca se borran**: el progreso conseguido se conserva
y quien ya avanzó sigue viéndolo como histórico.

Esto no es un LMS: no hay contenidos, materiales, calificaciones ni certificados.

## Permisos

Ocho capacidades por módulo (`group.*` y `course.*` / `path.*`). Un líder de grupo ve lo
necesario de los participantes de **su** grupo, no el directorio completo: la Fase 7 activa por
primera vez el scope `group` de `church_people_roles`, que existía sin usar desde la Fase 0, y
`app.group_cap` resuelve la capacidad efectiva combinando iglesia, sede y grupo.

Los datos de contacto tienen regla propia: el **nombre se ve siempre**; el teléfono y el correo,
solo si la persona los ha hecho visibles o si quien mira tiene permiso expreso
(`group.contact.read`, `people.read` o `people.manage`). El rol `group_leader` **no** lo recibe.

El lugar de reunión de un grupo privado solo lo ven responsables y participantes aceptados.

Nada de este módulo es accesible sin sesión: no hay superficie pública.

## Métricas

`group_metrics`: grupos activos, grupos sin responsable, participantes activos, solicitudes
pendientes y grupos que han alcanzado su aforo.

`discipleship_metrics`: cursos activos, cohortes en marcha, personas matriculadas, solicitudes
de plaza pendientes, finalizaciones de los últimos 90 días, itinerarios activos y personas con
itinerario en marcha.

Cada métrica se calcula solo sobre lo que quien pregunta puede ver.
