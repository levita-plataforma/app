# ADR 0019 · Reuniones de grupo y sesiones de formación sobre `activities`, sin su máquina de estados

Fecha: 18-09-2026
Estado: propuesto (pendiente de validación de Carlos)
Fase: 7 · Grupos y discipulado

## Contexto

El ADR 0004 fijó `activities` como raíz temporal de `Service`, `Meeting`, `Event`,
`CourseSession`, `GroupMeeting`, `Rehearsal`, `Task` y `Shift`. El ADR 0018 concretó la
plantilla con la que la Fase 6 colgó `events` de `activities`: extensión 1:0..1, clave
foránea compuesta `(activity_id, church_id)`, `unique (activity_id)`, trigger guard que
comprueba el tipo, y nada de duplicar fecha, hora, zona horaria, sede, recurrencia ni estado.

La Fase 7 necesita dos cosas que encajan en esa plantilla —las reuniones de grupo y las
sesiones de cohorte— y se topa con un obstáculo que la Fase 6 no tuvo: **quién las convoca**.

Un evento lo crea alguien que administra la iglesia, y esa persona ya tiene
`activity.create`, `activity.publish` y `activity.cancel`. Una reunión de célula la convoca
quien lleva la célula, que no administra nada más. El trigger `app.activities_before_update`
de la Fase 4 exige la capacidad correspondiente en **cada** cambio de estado
(`app.activity_transition_capability`), y solo exime a las operaciones sin actor —las del
motor, que corre con `service_role` y sin JWT—.

Es decir: para que una reunión de grupo pasara de borrador a publicada, quien lleva el grupo
necesitaría `activity.publish`; para cancelarla, `activity.cancel`. Ambas son capacidades
sobre el calendario de **toda la iglesia**.

## Decisión

Las reuniones de grupo y las sesiones de cohorte se construyen sobre `activities` siguiendo
el ADR 0018, **pero no recorren la máquina de estados de actividades**.

1. La actividad se crea con `app.insert_activity_row` —no con `app.create_activity`, que
   exige `activity.create`— después de haber comprobado `group.meeting.manage` o
   `course.manage` sobre el grupo o la cohorte concretos.
2. Se crea con `visibility = 'private'`: la reunión de un grupo privado no se anuncia en el
   calendario general de la iglesia (decisión P-1 del contrato de la fase).
3. Su estado no se toca nunca. El acto de cancelar vive en `group_meetings.cancelled_at` y
   `course_sessions.cancelled_at`, con su autor y su motivo.
4. La fecha, la hora, la zona horaria, la sede, el lugar y la recurrencia siguen viviendo
   **solo** en `activities` y `activity_series`. Una célula semanal se apoya en el motor de
   recurrencia de la Fase 4 sin añadir nada.
5. Quien participa no lee la actividad por RLS, sino por RPC `security definer`
   (`app.list_group_meetings`), que comprueba lo mismo que la política de la tabla de
   reuniones.

## Alternativas descartadas

- **Conceder `activity.publish` y `activity.cancel` al rol `group_leader`.** Le daría poder
  sobre el calendario de la iglesia entera. Descartada por deny-by-default (ADR 0005).
- **Conceder esas capacidades acotadas con `scope_type='activity'`, una concesión por
  reunión.** Es correcta en lo conceptual y reutiliza el mecanismo de la Fase 4, pero obliga
  a escribir una fila de rol por cada ocurrencia —hasta 200 en una serie—, a limpiarlas al
  retirar a un responsable, y a razonar sobre roles que sobreviven a los grupos. Demasiada
  maquinaria para un estado que este dominio no usa.
- **Ejecutar el cambio de estado «como el sistema», limpiando las claims del JWT dentro de la
  función.** Funciona, porque el trigger exime a las operaciones sin actor, pero es un truco:
  desactiva la autorización de la Fase 4 desde dentro y deja la transacción en un estado
  difícil de razonar. Descartada por opaca.
- **Llevar las reuniones en una tabla propia, con su fecha y su recurrencia.** Contradice los
  ADR 0004 y 0018 y duplicaría el motor de recurrencia.

## Consecuencias

- Quien lleva un grupo puede convocar, cambiar y cancelar las reuniones de **su** grupo sin
  obtener ningún permiso sobre el resto de la iglesia.
- Las actividades de estas reuniones quedan en el estado inicial (`draft`) de por vida. No es
  un descuido: en este dominio el estado de la actividad no significa nada, y por eso ninguna
  consulta de la Fase 7 lo lee. Quien administre la iglesia y mire el calendario general no
  las verá, porque son privadas.
- Hay una duplicación deliberada y acotada: «cancelada» existe en la tabla de la reunión y
  podría existir en la actividad. Se acepta a cambio de no repartir permisos de más, y queda
  anotada aquí para que no se lea como un olvido.
- Si una fase futura necesita que estas reuniones aparezcan en el calendario general, el
  cambio es cambiar su visibilidad y decidir entonces quién puede publicarlas; nada de lo
  escrito aquí lo impide.

## Referencias

- `docs/adr/0004-activity-raiz-generica.md`, `docs/adr/0005-rbac-capabilities-scopes.md`,
  `docs/adr/0018-events-extiende-activities.md`
- `supabase/migrations/20260920000500_activity_funciones_y_reglas.sql` (trigger
  `app.activities_before_update`, condición `v_actor is not null`)
- `supabase/migrations/20260927000600_rpc_grupos.sql` y `..._0700_rpc_discipulado.sql`
- `docs/CONTRATO-FASE-7.md` §6
