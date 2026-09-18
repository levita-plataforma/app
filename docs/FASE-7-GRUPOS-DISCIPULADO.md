# Fase 7 · Grupos y discipulado

Rama `feature/carlos-fase-7-grupos-discipulado`, sobre `origin/main` = `bde4076`.
Estado: **pendiente de validación de Carlos**. No integrada ni aplicada en producción.

Qué se acordó está en [CONTRATO-FASE-7.md](CONTRATO-FASE-7.md) (decisiones P-1 a P-8) y
resumido en [07-decisiones.md](07-decisiones.md) como D22. Este documento cuenta qué se ha
construido y cómo se usa.

---

## 1. Migraciones

Siete migraciones, todas con prefijo posterior a `20260925000500`, el último aplicado en
producción. Ninguna migración ya aplicada se reescribe.

| Fichero | Qué trae |
|---|---|
| `20260927000100_grupos_esquema.sql` | `group_types`, `groups`, `group_leaders`, `group_members`, `group_join_requests`, `group_meetings`, `group_attendance`, con sus enums, índices y el trigger guard de tipo de actividad |
| `20260927000200_discipulado_esquema.sql` | `courses`, `course_cohorts`, `course_sessions`, `course_enrollments`, `course_session_attendance`, `learning_paths`, `path_steps`, `person_path_progress` |
| `20260927000300_capabilities_fase7.sql` | Las 16 capacidades nuevas, su reparto por rol, el gating de módulo y `app.group_cap`, `app.is_group_leader`, `app.can_read_group`, `app.can_read_person_contact`, `app.cohort_cap` |
| `20260927000400_rls_fase7.sql` | RLS habilitada y forzada en las 15 tablas, revocación de escritura, políticas de lectura |
| `20260927000500_avisos_fase7.sql` | Diez tipos de aviso nuevos, sus textos, destinatarios y `app.notify_group_members` |
| `20260927000600_rpc_grupos.sql` | 20 RPC de grupos con sus envoltorios públicos |
| `20260927000700_rpc_discipulado.sql` | 21 RPC de discipulado con sus envoltorios públicos |

---

## 2. Cómo se usa

### Un grupo, de principio a fin

1. Quien administra crea los **tipos de grupo** de la iglesia (`save_group_type`) y el grupo
   (`create_group`), eligiendo sede, aforo, si aparece en el directorio interno o es privado,
   y si admite solicitudes.
2. Nombra **responsable** (`add_group_leader`). Ese acto hace dos cosas a la vez: registra la
   vigencia y concede el rol `group_leader` con `scope_type = 'group'` y el grupo como
   `scope_id`. A partir de ahí, esa persona gestiona **ese** grupo y ninguno más.
3. El responsable **incorpora participantes** (`add_group_member`) o resuelve las
   **solicitudes** que llegan (`resolve_group_join_request`). El aforo cuenta participantes; el
   responsable no ocupa plaza.
4. **Convoca reuniones** (`schedule_group_meeting`), de una en una o con periodicidad semanal o
   mensual, reutilizando el motor de recurrencia de la Fase 4.
5. **Registra la asistencia** (`record_group_attendance`). Quien no participa solo se registra
   marcándolo como invitado, y entonces no cuenta para el aforo.
6. Cuando el grupo termina, se **archiva** (`set_group_archived`): participaciones, reuniones y
   asistencia se conservan intactas.

### Un curso, de principio a fin

1. `save_course` crea el curso con su umbral de asistencia sugerido; `create_cohort`, la
   edición concreta con fechas, sede y aforo.
2. `schedule_cohort_session` programa las sesiones, que se numeran solas.
3. Las personas entran por dos vías: `enroll_person_in_cohort` (alta directa) o
   `request_cohort_enrollment` + `resolve_cohort_enrollment` (solicitud).
4. `record_session_attendance` registra quién asistió.
5. `cohort_completion_suggestions` dice **a quién sugiere** la aplicación dar por terminado,
   con su proporción de asistencia a la vista. Quien termina es el responsable, con
   `complete_cohort_enrollment`, y queda registrado quién y cuándo.
6. Si el itinerario tiene un paso que apunta a ese curso, terminarlo **cierra ese paso solo**:
   no hay que marcarlo dos veces.

### Un itinerario

`save_learning_path` y `save_path_step` construyen el recorrido; `reorder_path_steps` lo
reordena; `set_person_path_step` marca el avance de una persona.

Los pasos **se archivan, nunca se borran** (`set_path_step_archived`), y la clave foránea del
progreso es `on delete restrict` para que nadie los borre por error. Quien ya avanzó en un
paso archivado lo sigue viendo en su recorrido, marcado como histórico.

---

## 3. Permisos

16 capacidades nuevas, ocho por módulo. El reparto está en el contrato §5.2. Lo que conviene
retener:

- El **scope `group`** existía en el esquema desde la Fase 0 y **ninguna función lo usaba**.
  Esta fase es la primera que lo activa, con `app.group_cap`, que combina scope `church`,
  `campus` del grupo y grupo concreto, igual que `app.activity_cap` hace con las actividades.
- El rol **`group_leader` no tenía ninguna capacidad** desde la Fase 0. Ahora recibe las de
  llevar su grupo y **no** recibe `group.contact.read`.
- Como `church_people_roles.scope_id` no tiene clave foránea genérica —decisión de la Fase 0,
  comentada en el propio esquema—, la validación de que ese uuid es un grupo vivo del mismo
  tenant la hace `app.add_group_leader`, que es la única vía por la que se concede.

### La regla del contacto

`app.can_read_person_contact` devuelve verdadero por cuatro caminos: es uno mismo, se tiene
`people.read` o `people.manage`, se tiene `group.contact.read`, o **la persona ha hecho visible
su contacto**. `app.group_roster` devuelve el nombre siempre y el correo y el teléfono solo
cuando esa función lo permite, además de una columna `contact_visible` que lo dice
explícitamente para que la interfaz no tenga que adivinarlo.

**Límite conocido y anotado** (riesgo R-01 del contrato, pendiente transversal en D22): la
política `people_select` de la Fase 0 sigue dejando leer la fila completa de `people` a
cualquier miembro de la misma iglesia. La Fase 7 aplica la regla en su propia superficie y no
amplía nada, pero cumplirla de extremo a extremo exige estrechar esa política, lo que afecta a
F2, F5 y F6. Queda fuera de esta fase.

---

## 4. Avisos

Diez tipos nuevos, solo los acordados como imprescindibles:

| Tipo | Quién lo recibe |
|---|---|
| `group.join_request.received` | Los responsables que de verdad pueden resolverla; si no hay ninguno, la administración |
| `group.join_request.accepted` / `.rejected` | Quien solicitó |
| `group.member.added` | Quien se incorpora |
| `group.meeting.rescheduled` / `.cancelled` | Los participantes del grupo |
| `course.session.rescheduled` / `.cancelled` | Los matriculados de la cohorte |
| `course.enrollment.completed` | Quien termina el curso |
| `path.step.completed` | Quien completa el paso |

`app.notification_text` pasa a ser un despachador: prueba los tipos de la Fase 7 y, si no es
ninguno, delega en `app.notification_text_fase5`, que es copia **literal** del cuerpo anterior.
No se ha cambiado ni un texto de las fases anteriores.

`app.notify_group_members` **comprueba la capacidad desde el primer día**. La equivalente de la
Fase 6 nació sin esa comprobación y hubo que arreglarla en caliente (`20260925000400`); la
suite de permisos tiene una prueba dedicada a que no vuelva a pasar.

El **transporte externo sigue desactivado**: correo y push se encolan y no salen. La interfaz
no dice en ningún momento que se haya enviado nada.

---

## 5. Decisiones de diseño que merecen explicación

**Las reuniones no recorren la máquina de estados de las actividades.** Está razonado en el
[ADR 0019](adr/0019-grupos-y-formacion-sobre-activities.md). En corto: publicar una actividad
exige `activity.publish` y cancelarla `activity.cancel`, que son permisos sobre el calendario
de toda la iglesia. Dárselos a quien lleva una célula, para que pueda convocar su reunión del
jueves, es desproporcionado. La actividad aporta fecha, hora, zona horaria, sede y recurrencia;
el acto de cancelar vive en la tabla de la reunión.

**La columna de orden de los pasos se llama `step_order`, no `position`.** `position` es
palabra reservada de SQL y rompe las declaraciones `returns table`.

**Las reuniones se leen por RPC, no por RLS de `activities`.** La actividad se crea privada
para que no aparezca en el calendario general; quien participa ve fecha y hora a través de
`app.list_group_meetings`, que comprueba exactamente lo mismo que la política de la tabla.

---

## 6. Pruebas

| Suite | Aserciones |
|---|---|
| `fase7_grupos_test.sql` | 69 |
| `fase7_discipulado_test.sql` | 59 |
| `fase7_permisos_test.sql` | 31 |

**Total del repositorio: 1132 aserciones en 20 suites, 0 fallos.** `cobertura_rls_test.sql`
pasó de 63 a 78 al recoger sola las quince tablas nuevas.

Las tres suites son SQL puro, sin `\gset`: una suite que use ese metacomando de psql no se
ejecuta en el arnés local y, por tanto, no prueba nada —así entró la Fase 6 con dos suites
inoperativas—.

Qué cubren, además del camino feliz: aislamiento entre dos iglesias en cada tabla, denegación
por capacidad en cada RPC, el scope `group` frente a `campus` y `church`, los cuatro caminos de
la regla del contacto, el aforo, la solicitud única, el trigger guard de tipo de actividad, las
claves foráneas compuestas, que archivar preserva el historial, que un paso con progreso no se
puede borrar, que `anon` no puede leer ni ejecutar nada, y que con el módulo apagado no
funciona ni quien es propietario.

---

## 7. Lo que esta fase no hace

Kids y recogida de menores, notas pastorales, donaciones y campañas, transportes de correo y
push, pagos, certificados, LMS con contenidos, videoconferencia y el módulo de Alabanza quedan
fuera, como fija el encargo. Tampoco se reconstruye nada de F4 a F6.

La Fase 8 tomará de aquí los grupos como destinatarios de comunicación: `app.notify_group_members`
y el scope `group` quedan listos para eso. No se ha contactado con nadie por esto.
