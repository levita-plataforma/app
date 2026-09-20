# Fase 12 · Analítica (Diogo)

Revisión: **20 de septiembre de 2026.**

Implementación real de la Analítica avanzada de la Fase 12 (ver
[13-plan-por-fases.md](13-plan-por-fases.md) y
[REPARTO-CARLOS-DIOGO.md](REPARTO-CARLOS-DIOGO.md)). Pastoral y Giving son
entregas separadas de esta misma fase; completar Analítica no las completa.

## 1. Módulos realmente soportados

Construido en `feature/diogo-fase-12-analitica`, desde `main` en `04276be`.
En ese commit **no existen** tablas de Recursos (F10), Alabanza (F11) ni
Giving (F12): las tres siguen en ramas sin mergear
(`feature/carlos-fase-10-recursos-instalaciones`,
`feature/diogo-fase-11-alabanza-contenido`, `feature/diogo-fase-12-giving`).
Analítica se construye solo sobre lo que existe de verdad en `main`:

| Módulo | Disponible en main | Consumido |
|---|---|---|
| Personas | Sí | Sí |
| Servicio / Actividades / Asignaciones | Sí | Sí |
| Eventos / Inscripciones | Sí | Sí |
| Grupos | Sí | Sí (reutiliza `app.group_metrics`) |
| Discipulado | Sí | Sí (reutiliza `app.discipleship_metrics`) |
| Niños | Sí | Sí |
| Comunicación | Sí | Sí |
| Recursos (F10) | No | No — no se referencia ninguna tabla |
| Alabanza (F11) | No | No — no se referencia ninguna tabla |
| Giving (F12) | No | No — no se referencia ninguna tabla |
| Pastoral (F12) | No | No — responsabilidad de Carlos, fuera de esta rama |

Cuando Giving, Alabanza o Recursos entren en `main`, añadir sus bloques a
`app.analytics_dashboard` es aditivo: un nuevo `if app.module_enabled(...)
and app.has_capability(..., '<módulo>.read...')` más en la función, sin tocar
los bloques existentes.

## 2. Arquitectura

Una única función, dos capas (patrón estándar del proyecto):

- `app.analytics_dashboard(p_church_id, p_period, p_from, p_to, p_campus_id)` — `security definer`, calcula todo.
- `public.analytics_dashboard(...)` — `security invoker`, wrapper delgado.

No se creó ninguna tabla nueva. No hay data warehouse paralelo ni
materialización: cada bloque es una consulta agregada directa sobre las
tablas de dominio (People, Activities, Registrations, Groups...), calculada
en el momento. `audit_logs` no se usa como fuente de métricas operativas —
las tablas de dominio ya tienen el estado real.

Dos funciones auxiliares reutilizables:

- `app.analytics_period_bounds(p_period, p_from, p_to, p_timezone)` — resuelve
  el rango actual y el rango anterior comparable (misma duración,
  inmediatamente anterior, sin solape: `previous_to = period_from`).
- `app.analytics_trend(p_current, p_previous)` — construye
  `{current, previous, delta_abs, delta_pct}`. `delta_pct` es `null` (no `0`
  ni `Infinity`) cuando el período anterior es cero: el cliente muestra
  "N/A", nunca un porcentaje inventado.

## 3. Autorización: `analytics.read` no sustituye el módulo fuente

Regla central de la fase. `analytics.read` autoriza la llamada a
`app.analytics_dashboard`; pero cada bloque por módulo comprueba además,
dentro de la misma función, la capability real de lectura de ese módulo:

| Bloque | Capability de origen exigida |
|---|---|
| Personas | `people.read` |
| Servicio | `service.read` |
| Eventos | `event.read` |
| Grupos | `group.read` |
| Discipulado | `course.read` |
| Niños | `kids.read` |
| Comunicación | `communications.read_metrics` |

Si falta la capability de origen, el bloque **no aparece** en el jsonb de
respuesta (ni siquiera en cero) — no es un dato sensible ocultado con un
número, es ausencia real del bloque. Verificado por test: un `member` con
`analytics.read` concedido manualmente pero sin `people.read`/`kids.read` no
ve esos bloques.

`analytics.export` es una capability propia, distinta de `analytics.read`
(igual criterio que `giving.export` vs `giving.read_contributions` en la
Fase 12 de Giving): exportar no es lo mismo que ver en pantalla. El CSV nunca
expone más que lo que `app.analytics_dashboard` ya calculó — nunca filas
individuales, nunca PII.

Capabilities nuevas (`module_key = 'analytics'`): `analytics.read`,
`analytics.export`. Concedidas a `church_owner`, `church_admin` y
`campus_admin`, igual que el resto de fases. No existe `analytics.admin`
genérico.

Módulo `analytics` ya existía en el catálogo (`modules`, sort_order 12,
seed de Fase 0) y la navegación ya apuntaba a `/app/informes` — solo faltaba
la implementación real detrás de `ModulePlaceholder`.

## 4. Timezone

Todo agregado por período respeta `churches.timezone` (zona IANA), nunca
fecha UTC cruda. `this_month` usa `date_trunc('month', now() at time zone
p_timezone) at time zone p_timezone` para resolver el inicio de mes en hora
local de la iglesia, mismo patrón que `app.local_to_instant` /
`app.resolve_timezone` (Fase 4-5).

## 5. Períodos

Soportados: `7d`, `30d`, `this_month`, `3m`, `12m`, `custom` (con límite de
366 días, rechazado con `22023` si se excede o si faltan `from`/`to`, o si
`to <= from`). El período anterior comparable se calcula con la misma
duración exacta que el actual, terminando justo donde empieza el actual
(`previous_to = period_from`): evita doble conteo en el borde y hace el
delta porcentual comparable.

## 6. Filtros

`p_campus_id` opcional, validado contra `campuses` de la iglesia (`P0002` si
no existe). Se aplica en los bloques de Personas y Servicio. Campus es
filtro funcional: nunca sustituye el aislamiento tenant, que sigue siendo
`church_id` en cada consulta.

## 7. Métricas por módulo

### Personas
`active_people` (conteo simple), `new_people`/`archived_people` (tendencia),
`by_campus` (distribución). Sin métricas de raza, religión ni salud.

### Servicio
`activities` (tendencia, por `starts_at` dentro del período),
`by_status` (distribución), `positions_planned` (suma de `min_people` de los
puestos de las actividades del período), `assignments_confirmed` /
`assignments_pending` / `assignments_declined` (conteos por estado real de
`activity_assignments.status`, no inferidos de texto). No se calculó
"tasa de cobertura" como porcentaje único porque el prompt pide evitar
métricas ambiguas sin definición clara y el proyecto no tiene una definición
cerrada de "cobertura" — se deja como dato bruto (planificado vs confirmado)
en vez de una fórmula inventada.

### Eventos
`events_published` (tendencia), `registrations` (tendencia, `confirmed` +
`waitlisted`), `cancelled_registrations`, `waitlisted`.

### Grupos
Reutiliza `app.group_metrics` tal cual (mismos campos que ya usa el
dashboard de Grupos: `active_groups`, `groups_without_leader`,
`active_members`, `pending_requests`, `groups_at_capacity`) y añade
`new_members` (tendencia) y `meetings_held` (por `starts_at` de la actividad
asociada a la reunión, dentro del período).

### Discipulado
Reutiliza `app.discipleship_metrics` tal cual (`active_courses`,
`running_cohorts`, `enrolled_people`, `pending_enrollment_requests`,
`completions_last_90_days` — ventana fija de 90 días, no del período
seleccionado, tal como ya la definió la Fase 7 — `active_paths`,
`people_in_paths`).

### Niños
`checkins` (tendencia, excluye `cancelled`), `active_profiles`, `incidents`
(por `occurred_at`). No se expone ningún dato identificable de un menor
concreto: todo son conteos agregados.

### Comunicación
`communications_sent` (tendencia, `sent` + `partially_sent`),
`recipients_by_status` (distribución), `opt_outs` (conteo de
`communication_category_preferences` con `opted_out = true`).

## 8. Sin ranking individual

Deliberadamente no existe ninguna métrica de "voluntario más activo",
"donante top" ni "score de compromiso". Toda métrica es agregada por
módulo/iglesia, nunca por persona.

## 9. Export

CSV síncrono de los agregados ya calculados por el dashboard (mismo patrón
que `exportRegistrationsCsv`, Fase 6): sin `export_jobs`, que existe como
esquema pero no tiene worker real en el proyecto (confirmado por auditoría:
cero código de aplicación lo usa). Mitigación de CSV/fórmula injection
(campos que empiezan por `=`, `+`, `-`, `@`, tab o retorno de carro reciben
comilla simple inicial antes del escapado de comillas/comas/saltos), mismo
criterio que Giving F12. Auditado como `analytics.export.created`.

## 10. UI

`/app/informes` — dashboard server component, gate de módulo
(`ensureAnalyticsModule`), selector de período por enlaces (`?period=`,
allowlist validada server-side), un bloque por módulo (solo si el módulo
devolvió datos), botón de exportar si el usuario tiene `analytics.export`.
Estados vacíos distinguen "sin módulos disponibles para tu ámbito" de un
bloque ausente por capability — nunca se muestra un cero donde en realidad
no hubo acceso al dato.

Sin gráficos en esta iteración: los datos se presentan en `StatCard` (mismo
componente que el resto de dashboards de la plataforma) con delta textual.
Añadir line/bar charts queda como trabajo futuro si el volumen de datos lo
justifica — no se introdujo una librería de gráficos nueva para esta
entrega.

## 11. Rendimiento

Una sola llamada RPC por carga de página (`Promise.all` con la comprobación
de `analytics.export`), sin N+1: cada bloque es una subconsulta dentro de la
misma función, no una llamada de red separada por card. Sin caché explícita
en esta iteración (dataset pequeño por tenant en este estado del producto);
si el volumen lo exige más adelante, la clave de caché debería incluir como
mínimo `church_id`, capability/rol efectivo, `metric`/módulo, período y
filtros — nunca compartida entre tenants.

## 12. Tests

`supabase/tests/fase12_analitica_test.sql`, 32 aserciones (prefijo `t12a.`):
capability ausente (`42501`), módulo deshabilitado (`42501` aunque haya
capability), aislamiento cross-tenant, dashboard completo para el owner con
fixture real de Personas/Servicio/Eventos/Grupos/Discipulado/Niños/
Comunicación, `analytics.read` sin capability de módulo fuente no filtra
ningún bloque sensible salvo el correcto, `analytics_trend` con denominador
cero, `analytics_period_bounds` con período inválido/intervalo custom
inválido/rango >366 días, revokes explícitos de `anon` sobre las tres
funciones nuevas. Batería completa del repositorio: **1403/1403 pgTAP en
verde**, sin drift (`supabase db diff --local`).

## 13. Bugs reales encontrados y corregidos (durante el desarrollo de esta fase)

1. `activities` no admite `insert ... status = 'published'` directo: un
   trigger (`app.activities_before_insert`) obliga a que toda actividad
   nueva empiece en `draft`. Corregido el fixture del test para publicar con
   la RPC real `public.transition_activity_status`, no con un valor fijo.
2. `activity_service_areas` exige un `service_area_id` real del catálogo
   (`app.activity_service_areas_guard`), no admite un `area_name` libre sin
   FK. Corregido el fixture para crear la fila en `service_areas` y usar
   `public.add_activity_area`/`public.add_activity_position`.
3. `activities`, `activity_positions` y `activity_assignments` no tienen
   `GRANT INSERT` directo para `authenticated` (la escritura es solo por
   RPC); el fixture de test necesita `reset role` para la inserción directa
   de la actividad base, y las RPC reales para área/puesto/publicación.
4. `activity_assignments` con `status = 'accepted'` exige `sent_at` y
   `responded_at` no nulos (`activity_assignments_check2`); el fixture no
   los incluía.
5. Bug real de la primera versión de la función, no del test: dentro de una
   misma transacción, `now()` es constante (hora de inicio de la
   transacción). Un fixture insertado con `starts_at = now()` y comparado
   después con `starts_at < period_to` (también `now()` en la misma
   transacción) queda excluido por la comparación estricta. En producción
   esto no ocurre (los datos existen en transacciones anteriores a la
   consulta), pero expuso que el fixture del test debía insertar con un
   pequeño desfase hacia el pasado para ser una prueba realista —
   corregido el fixture, no la función.
6. `role_capabilities` no tiene política de `INSERT` para `authenticated`
   (tabla global, solo gestionable por migración/`reset role`); el test
   necesitaba `reset role` antes de conceder `analytics.read` a `member`
   para simular el escenario "capability transversal sin capability de
   módulo fuente".
7. La persona de prueba usada para comprobar `42501` por falta de
   `analytics.read` no tenía `people.user_id` vinculado al `auth.users` de
   la sesión: `app.current_person_ids()` resuelve por `user_id = auth.uid()`
   y sin el vínculo la persona nunca se encontraba, dando un `42501`
   correcto mecánicamente pero por la razón equivocada (sin persona
   resoluble, no por falta de capability). Corregido enlazando `user_id` en
   el fixture.

## 14. Deuda técnica y exclusiones deliberadas

- Sin gráficos (line/bar): solo `StatCard` con delta textual. Accesible por
  definición (no depende de color), pendiente de valorar si el volumen de
  datos futuro lo justifica.
- Sin caché: dataset pequeño en este estado del producto.
- Sin Recursos (F10), Alabanza (F11) ni Giving (F12): no existen en `main`
  en el momento de esta implementación. Añadir sus bloques es trabajo
  aditivo futuro, sin tocar lo ya construido.
- Sin Pastoral: responsabilidad de Carlos, no se consume ninguna tabla de
  ese dominio.
- Sin filtro de campus en Eventos/Grupos/Discipulado/Niños/Comunicación en
  esta iteración (solo Personas y Servicio) — el prompt pide campus "cuando
  aplicable"; se priorizaron los dos módulos con relación directa a
  `campus_id`/`activities.campus_id` y se deja el resto para una iteración
  posterior si se pide.
- Sin export asíncrono ni `export_jobs`: descarga síncrona, documentado
  como limitación esperada (dataset agregado pequeño, no fila por fila).
