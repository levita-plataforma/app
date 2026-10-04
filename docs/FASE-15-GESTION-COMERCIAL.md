# Fase 15 · Gestión comercial y operación de plataforma

Rama `feature/carlos-fase-15-gestion-comercial-operacion`, sobre `origin/main` = `3904383`.

```
FASE 15: PARCIAL
```

Hay un motivo concreto y no es deuda menor: **la integración de facturación está
bloqueada porque no hay proveedor de cobro elegido ni configurado**. Todo lo demás —planes,
suscripciones, excepciones, estados, consola y soporte— está construido y probado.

Se corresponde con las etapas **CA-4** y **CA-5** de la propuesta de consola del 22/09/2026.
Contrato en [CONTRATO-FASE-15.md](CONTRATO-FASE-15.md).

---

## 1. Qué se puede hacer ya

| Función | Dónde | Capacidad |
|---|---|---|
| Ver el catálogo de planes y sus versiones | `/operacion/planes` | `platform.commercial.read` |
| Ver derechos y excepciones de una iglesia | Ficha de iglesia | `platform.commercial.read` |
| Cambiar de plan, con vista previa del efecto | Ficha de iglesia | `platform.commercial.manage` |
| Conceder y revocar excepciones | Ficha de iglesia | `platform.commercial.manage` |
| Cancelar, ahora o al final del periodo | Ficha de iglesia | `platform.commercial.manage` |
| Bloquear o desbloquear por seguridad | RPC | `platform.support.manage` |
| Ver el estado de colas y trabajos | `/operacion/procesos` | `platform.operations.read` |
| Reintentar lo que se puede repetir | `/operacion/procesos` | `platform.operations.retry` |
| Abrir y revocar sesiones de soporte | `/operacion/soporte` | `platform.support.manage` |
| Consultar la auditoría | `/operacion/auditoria` | `platform.audit.read` |

## 2. Cuatro cosas que la inspección encontró

No se buscaban; salieron al mirar qué había antes de construir.

1. **Los estados de iglesia no se aplicaban en ningún sitio.** `app.church_ids_for_user()`
   alimenta todas las políticas RLS y no mira `churches.status`. Una iglesia `suspended` o
   `archived` era, y sigue siendo, plenamente accesible: suspender no suspendía nada. F15
   separa las dimensiones y las expone; **qué se impide con cada una es una decisión
   pendiente** (§4.5), y no la he inventado.
2. **`canUsePlatform()` no lo importaba ningún fichero.** La única función que decidía si
   una iglesia podía seguir usando la plataforma estaba muerta.
3. **`plan_entitlements` existía desde la Fase 0 y nunca tuvo una fila.** La sustituye el
   catálogo versionado.
4. **`support_sessions` era solo una tabla**: ninguna función, ninguna interfaz, nadie la
   usaba. Ahora tiene ciclo de vida.

## 3. Decisiones de diseño que conviene entender

### El catálogo está versionado, y por eso está vacío

Un plan se edita creando una versión nueva. Las suscripciones apuntan a la versión que
contrataron, así que **subir un precio no cambia lo que ya tiene firmado nadie**. Sin esto,
un formulario de edición sería capaz de modificar contratos vigentes sin querer.

El catálogo nace sin planes a propósito: los precios y la periodicidad son decisiones de
Carlos (§4). La pantalla lo dice —«el catálogo está vacío, no es un fallo de carga»— en
lugar de enseñar planes de ejemplo que alguien podría tomar por reales.

### La vista previa declara lo que no sabe

`preview_plan_change` devuelve `prorrateo: "sin_politica_acordada"` y
`cobro: "sin_proveedor_configurado"`, y la interfaz los enseña. Ocultarlos daría a entender
que el cambio cobra algo.

### Un proceso sin procesador no se pinta en verde

Los webhooks entrantes y los trabajos de importación y exportación tienen tabla desde la
Fase 0 y **ningún código los lee**. La consola los muestra como «estado desconocido», con
esa palabra. Un contador a cero sin nadie procesando no es una buena noticia.

### Solo se reintenta lo idempotente

Hoy eso es el borrado de ficheros y nada más. No hay botón de «reintentar todo» ni forma de
marcar un trabajo como completado a mano: el reintento reinicia los intentos, no finge el
resultado. Para cobros y envíos externos no existe reintento, y no es un olvido.

### Una sesión de soporte no abre ninguna puerta

Abrirla **no cambia ninguna política RLS**. Un operador con sesión activa sigue sin ver el
directorio, los menores, los casos pastorales ni las donaciones. Sirve para dejar constancia
de que se está atendiendo una incidencia.

Pedir un ámbito que implique datos devuelve un error que explica por qué: esa política de
autorización no está acordada (§4.8), y construir la puerta antes que la cerradura sería
peor que no tenerla.

## 4. Decisiones pendientes de Carlos

Cada una con una propuesta concreta. **Ninguna está aplicada en el código**: donde hace
falta, el hueco es explícito.

| # | Decisión | Propuesta |
|---|---|---|
| 4.1 | **Planes y precios** | Tres planes con precio mensual en euros. Sin catálogo no hay gestión comercial real, solo estructura. |
| 4.2 | **Periodo de prueba** | 30 días desde el alta, sin tarjeta. Ya existe `trial_ends_at` sin política que lo rija. |
| 4.3 | **Impuestos y facturas** | Los emite el proveedor cuando lo haya. No construir facturación propia. |
| 4.4 | **Cambio de plan y prorrateo** | Subir de plan: efecto inmediato. Bajar: al final del periodo. El prorrateo lo calcula el proveedor. |
| 4.5 | **Qué impide cada estado** | La más urgente, porque hoy no impide nada. Propuesta: impago y suspensión dejan **lectura y exportación**, quitan escritura; el bloqueo de seguridad corta todo; archivada, nada. Aplicado en `church_ids_for_user` o en una comprobación equivalente, no solo en la interfaz. |
| 4.6 | **Periodo de gracia tras impago** | 15 días antes de suspender, con avisos. |
| 4.7 | **Acceso a datos durante la suspensión** | Poder exportar siempre, incluso suspendida: negar la salida de sus propios datos a quien no ha pagado es un problema legal, no una palanca comercial. |
| 4.8 | **Autorización de soporte con acceso a datos** | Petición del operador, aprobación de un segundo operador, caducidad corta y aviso a la iglesia. Hasta que se decida, solo diagnóstico. |
| 4.9 | **Proveedor de cobro** | Sin recomendación: depende de facturación, IVA y de dónde se factura. Es lo que bloquea §5. |

## 5. Bloqueado: la integración de facturación

No hay proveedor elegido ni credenciales. Sin eso no hay webhooks reales que firmar, ni
conciliación, ni facturas que enlazar.

**Lo que no he hecho, y es deliberado:** simularlo. Un mock que responda «cobrado» no
acredita una integración y convierte una pantalla en una mentira convincente. Los campos
`billing_provider` y `billing_customer_external_id` existen desde la Fase 1 y **se quedan
vacíos**, que es la representación honesta de «sin proveedor».

Cuando se elija, lo que habrá que construir está en el encargo §7 y no cambia: firma de
webhooks, persistencia, idempotencia, tolerancia a eventos fuera de orden, conciliación y
estados desconocidos explícitos.

## 6. Qué se reutiliza de F13 y F14

**De F14**: capacidades de plataforma y su regla de no autoconcesión, `platform_audit_logs`
con `app.write_platform_audit`, la guarda del panel, `platform-service` y el diseño.

**De F13**: `correlation_id` e idempotencia en los trabajos, la cola tolerante de
comunicaciones con `failed_to_process`, `storage_deletion_queue`, el runbook y las suites
ejecutables. **No se ha construido observabilidad paralela**: la consola lee lo que esas
fases ya registran.

## 7. Migraciones

| Migración | Qué hace |
|---|---|
| `20261004001004` | Siete capacidades nuevas; estados separados en cuatro dimensiones; bloqueo de seguridad |
| `20261004001005` | Catálogo versionado, suscripción ampliada, historial, excepciones con inicio |
| `20261004001006` | Cambio de plan con vista previa, excepciones, cancelación |
| `20261004001007` | Consola de procesos, reintento seguro, sesiones de soporte, auditoría consultable |

Ninguna reescribe una migración aplicada. Todas se aplican sobre el esquema integrado.

## 8. Pruebas

**Hechas** (batería completa: 1688 ok, 0 problemas):

- `fase15_comercial_test.sql` (32): derechos desde la versión contratada; editar el catálogo
  no toca lo contratado; soporte no cambia precios; comercial no bloquea por seguridad;
  vista previa que no muta nada y declara lo que no sabe; cambio de plan con historial y
  auditoría; cambio programado que no altera el plan vigente; excepción caducada que deja de
  aplicar sola; cancelar sin borrar.
- `fase15_operacion_soporte_test.sql` (23): colas sin procesador declaradas como
  desconocidas; sin capacidad no se ve nada; errores recortados; reintento que reinicia
  intentos sin marcar como hecho; ámbito de datos rechazado; sesión sin motivo rechazada;
  revocación efectiva de inmediato; auditoría que deja dicho que la sesión no dio acceso.
- Las cuatro suites Node de F13 pasan sobre el esquema de F15.
- `typecheck`, `lint` y `build` limpios.

**Pendientes, y por qué:**

- **Webhook duplicado, inválido y fuera de orden**: no hay proveedor ni procesador. Probarlo
  exigiría inventar el formato de eventos de un proveedor que no está elegido.
- **Resultado incierto del proveedor y conciliación**: lo mismo.
- **Consumo por encima de un límite reducido**: los límites se calculan y se enseñan, pero
  **no se aplican** en ninguna parte, porque qué hacer al superarlos es la decisión §4.5.
- **Suspensión y reactivación sin pérdida de datos**: comprobado que cancelar no borra; la
  suspensión con efecto real no existe hasta §4.5.
- **Interfaz en móvil y escritorio**: no se ha abierto en un navegador. El build pasa, y eso
  no demuestra que se vea bien.

## 9. Estado exacto

- **`main`**: `3904383`, con F13 y F14 integradas.
- **Producción**: al día con `main`, 123 tablas, sin migraciones pendientes.
- **Esta rama**: cuatro migraciones **sin aplicar** en producción. Van antes del despliegue.
- **Sin integrar**: esperando validación de Carlos del commit concreto.

## 10. Para validar

1. Revisar §4 y decidir. Sin §4.1 no hay planes que asignar; sin §4.5 los estados siguen sin
   impedir nada.
2. Comprobar en la Preview: `/operacion/planes` (vacío y explicado), `/operacion/procesos`
   (colas sin procesador en «desconocido»), `/operacion/soporte` (lo que una sesión no
   permite) y la ficha de una iglesia.
3. Si se aprueba: aplicar las cuatro migraciones **antes** de integrar, y después el PR.

---

## 11. A1 · Gating comercial a nivel de tabla (4 de octubre de 2026)

Rama `feature/diogo-fase-15-estados-acceso`. Migraciones `20261004170016`, `20261004170017`,
`20261004170018` y `20261004170019`. Estado de la fase: **PARCIAL**, sin cambios.

### Principio

Membresía, permiso y acceso comercial son tres preguntas distintas:

- `app.church_ids_for_user()`: a qué tenants pertenece el usuario. **Sin cambios.**
- `has_capability(...)`: qué puede hacer dentro de un tenant. **Sin cambios.**
- `app.church_access_mode(church_id)`: si el tenant puede operar comercialmente. **Nuevo.**

Una operación de negocio necesita las tres: membresía, capacidad y modo `full` o `grace`.

### Modo de acceso

Prioridad: `security_blocked` > `cancelled`/`suspended` > `trial_expired` > `past_due` en gracia > `active`/`trial`.

`cancelled` y `suspended` van por delante de `trial_expired` porque una baja o una suspensión operativa
explica el bloqueo mejor que el vencimiento de una prueba, y no debe presentarse como "prueba vencida".

| Modo | Origen | Escritura de negocio |
|---|---|---|
| `full` | suscripción `active` o `trial`, o sin suscripción aún | permitida |
| `grace` | `past_due` con menos de 15 días desde `past_due_since` | permitida |
| `suspended` | `suspended`, o `past_due` tras 15 días | denegada |
| `cancelled` | `cancelled`, o iglesia archivada | denegada |
| `trial_expired` | `trial` con `trial_ends_at` pasado, sin conversión | denegada (`CHURCH_TRIAL_EXPIRED`) |
| `security_blocked` | `churches.security_block_reason` no nulo | denegada, aunque la suscripción esté activa |

`past_due_since` lo fija la operación de plataforma hasta que exista la integración de cobro. Es
obligatorio mientras `status = past_due`. La gracia se calcula en el servidor; el cliente no envía
fechas.

### Clasificación de las 109 tablas con `church_id`

- **Negocio (94):** triggers `<tabla>_commercial_gate`. Incluye `webhook_endpoints_outbound` (movida
  desde infraestructura) y las tablas de Kids, `campuses`, `church_people_roles` e `invitations`.
- **Plano de control (6):** sin trigger general, con sus propias reglas: `subscriptions`,
  `subscription_history`, `support_sessions`, `church_entitlement_overrides`, `church_feature_flags`,
  `church_modules`.
- **Infraestructura y ciclo de vida (7):** sin trigger general. Reglas propias: `export_jobs`
  (ver más abajo), `church_onboarding`, `import_jobs`, `notification_events`,
  `notification_deliveries`, `notifications`, `webhook_events_inbound`.
- **Auditoría (2):** `audit_logs`, `platform_audit_logs`. Inmutables.

La clasificación vive en la tabla `commercial_gate_classification`, con su motivo por fila. El test
de guardarraíl usa el catálogo de PostgreSQL: falla si aparece una tabla con `church_id` sin
clasificar, o si una tabla de negocio no tiene su trigger.

**Triggers añadidos:** 96 en total. 94 de negocio, más `churches_commercial_gate` (solo
`update` y `delete`) y `export_jobs_commercial_gate`.

### Iglesia (`churches`)

No tiene `church_id`, así que no entra en el trigger genérico. Tiene su propio guardarraíl: en modos
restringidos solo pueden cambiar `status`, `archived_at`, `archived_by`, `security_block_reason`,
`security_blocked_at`, `security_blocked_by` y `updated_at`. El branding y la configuración normal se
bloquean. Borrar una iglesia solo es posible con el bypass de lifecycle.

### Excepciones de Kids (por transición, no por módulo)

Permitidas en cualquier modo:

- pasar un check-in de `checked_in` a `checked_out`, manteniendo sesión, menor e iglesia;
- marcar una autorización de recogida como `used`, si está ligada a un check-out ya hecho.

Permitida en `trial_expired`, `suspended`, `cancelled` y `security_blocked`:

- registrar una incidencia de un menor que sigue dentro (`checked_in`). Es el cierre seguro de una
  presencia activa; sin menor dentro, la incidencia se deniega.

Denegadas en todos los modos no activos: crear check-ins nuevos, crear sesiones, cambiar configuración
de salas y crear menores. Denegada también cualquier incidencia de un menor que no está dentro.

El estado comercial nunca impide entregar un menor de forma segura: check-out y recogida no miran el modo.
La lectura de Kids no se abre con esto (eso es A2, mediante una RPC mínima y auditada).
Tests: `supabase/tests/fase15_kids_cierre_seguro_test.sql`.

### Exportaciones (`export_jobs`)

- `trial_expired`, `suspended`, `cancelled`, `full` y `grace`: se pueden solicitar.
- `security_blocked`: denegadas, también para la plataforma.

### Bypass de lifecycle

`app.run_lifecycle(p_church_id, p_action, p_retention_days)`.

- `EXECUTE` solo para `service_role`. Revocado de `public`, `anon` y `authenticated`.
- Solo acepta `purge_church`, sobre una iglesia archivada hace más de 30 días (mínimo 7).
- Pone `app.lifecycle_bypass = 'on'` con `set_config(..., true)`: transaccional. Al terminar la
  transacción vuelve a su valor previo.
- El trigger lo acepta **solo** si el flag está en `on` **y** `current_setting('role') = 'service_role'`.
  Un usuario autenticado puede poner el flag, pero el trigger lo ignora, y no puede hacer
  `SET ROLE service_role` porque no es miembro de ese rol.

**Solo lifecycle.** No se usa para comunicaciones ni para avisos.

La purga en lote `purge_archived_churches` queda revocada de `service_role`. Su único uso era el
runner de retención, que ahora llama a `run_lifecycle` por iglesia.

### Jobs

- **Comunicaciones:** `due_scheduled_communications` y `pending_send_communications` solo devuelven
  iglesias en `full` o `grace`.
- **Avisos:** `claim_notification_deliveries` solo reclama entregas de iglesias en `full` o `grace`.
- **Retención:** `src/server/retention/runner.ts` llama a `run_lifecycle` por iglesia vencida. No se
  detiene por el estado comercial.

### Pruebas

- `supabase/tests/fase15_gating_comercial_test.sql`, 48 aserciones: modos por estado, escritura de
  negocio, `DETAIL` seguro (`CHURCH_SUSPENDED`, etc.), superficie de recuperación del owner, Kids
  (cuatro casos del encargo más incidencias), exportaciones, aislamiento entre tenants, traslado
  entre tenants denegado, bypass (flag sin rol, anon, authenticated, service_role, persistencia),
  purga real, jobs (comunicaciones y avisos) y guardarraíl por catálogo.
- `supabase/tests/fase5_asignaciones_test.sql` y `fase5_avisos_test.sql`: el borrado en cascada usa
  ahora el mismo camino que producción (`service_role` y bypass transaccional).
- `supabase/tests/retencion/borrado.mjs`: adaptado a `run_lifecycle`. Pasa desde una base limpia.
- Persistencia del flag entre conexiones: comprobada con dos peticiones independientes al servidor
  (la segunda lee el flag vacío).
- `supabase test db`: 43 ficheros, 1.806 aserciones en verde (incluye `fase15_trial_expired_test.sql` y `fase15_kids_cierre_seguro_test.sql`). `supabase db diff --local`: sin cambios.

### Prueba vencida y avisos suprimidos (4 de octubre de 2026)

- **Fechas de prueba.** `subscriptions.trial_started_at` (nueva, con backfill desde `created_at`) y
  `trial_ends_at` (ya escrita por el provisioning, 30 días). Restricción: el fin es posterior al inicio.
  La app no calcula la prueba: el modo compara `now()` con `trial_ends_at`. Una prueba sin fin se trata
  como `full` (no debería existir, el provisioning siempre la escribe).
- **Sin conversión, no se borra nada.** `trial_expired` no entra en retención, no cambia el estado de la
  iglesia a cancelada y no tiene un botón de pago ficticio. El propietario puede exportar.
- **Eventos de aviso.** `process_notification_events` cierra como `suppressed` los eventos de iglesias
  fuera de full/grace, con `processed_at`, `suppressed_at` y `suppression_reason` (JSON
  `{"reason":"tenant_access_mode","tenant_access_mode":"<modo>"}`). No genera bandeja ni entregas.
- **Entregas en cola.** `claim_notification_deliveries` pasa a `suppressed` las entregas email/push
  pendientes de iglesias fuera de full/grace, con el mismo motivo en `last_error`. La bandeja (`inapp`)
  no se toca.
- **Reactivación.** Lo suprimido no se reenvía nunca. Al volver a full, los eventos nuevos sí generan avisos.
- **Avisos de plataforma y recuperación** (prueba vencida, suspensión, bloqueo de seguridad, instrucciones
  de recuperación, futuras incidencias de cobro) **no son avisos de negocio**. No pasan por esta cola ni se
  generan aquí. Su canal se decidirá con los mensajes de plataforma existentes, no con una cola nueva.
- **Coste medido** (base local, lote en una sola sentencia, trigger activo frente a desactivado en la misma
  transacción): ~11 µs por fila en lotes de 100 y de 10.000 filas; ~51 µs en una inserción unitaria, que
  incluye el arranque en frío. Una importación de 10.000 filas suma ~108 ms. Cada fila hace una llamada a
  `app.church_access_mode`, es decir, dos búsquedas por clave (`churches` y `subscriptions`). Es coste por
  fila por diseño; no se optimiza sin evidencia de volumen real. Deuda P2: cachear el modo por sentencia si
  alguna importación supera el orden de 100.000 filas.

### Lo que A1 NO hace

- **No bloquea lecturas (A2).** Mientras A2 no esté, un owner de una iglesia `security_blocked` puede
  leer datos de negocio mediante RLS. Esto **no cumple** todavía la regla aprobada de que
  `security_blocked` impide el acceso normal a datos.
- **No ofrece superficie de recuperación nueva.** Hoy el owner ve su fila de iglesia y su suscripción,
  pero no hay pantalla de estado ni de próximos pasos (PR C).
- **Sin prueba en navegador ni en Preview.** Hace falta una sesión real de owner y de operador.
- **Superficie del propietario en prueba vencida.** No hay pantalla de estado ni de próximos pasos para
  `trial_expired` (ni para `suspended`). Pendiente de la superficie de recuperación.
- **Coste de la reclamación de entregas** con el paso de supresión: no medido.

### Pendientes de esta fase

- **A2:** gating de lecturas, con inventario de las 92 políticas de lectura y el diseño de la
  superficie de recuperación.
- **PR B:** sesiones de soporte (60 min por defecto, 4 h como máximo, motivo obligatorio), con deny-by-default
  para Pastoral, Giving y Kids.
- **PR C:** consola y banners sin Stripe.
- **Stripe, precios, límites de plan e IVA:** aplazados, sin cambios en esta fase.

## 12. A2 · Gating de lectura y superficie de recuperación

Estado: **A1 implementado en PR #35** (`feature/diogo-fase-15-estados-acceso`, pendiente de smoke real y de
validación de Carlos antes de merge). **A2 implementado en `feature/diogo-fase-15-gating-lecturas`**, con base en la
rama de A1 y PR propia contra esa rama, no contra `main`. **Stripe sigue pendiente.** Fase 15 **sigue parcial**.

### Principio

Pertenencia y acceso comercial son condiciones separadas. `app.church_ids_for_user()` no cambia: responde solo a
"¿de qué iglesias es miembro este usuario?". La lectura de negocio exige las dos cosas:

- pertenencia (la condición que ya tenía cada política);
- acceso comercial de lectura: `full` o `grace`.

Un estado no operativo (`trial_expired`, `suspended`, `cancelled`, `security_blocked`) no deja usar LEVITA como
aplicación de solo lectura. Lo único que se ve es la superficie de recuperación.

### Funciones centrales

| Función | Uso |
|---|---|
| `app.can_read_church(church_id)` | RPC de un solo church_id: pertenencia AND modo operativo. |
| `app.readable_church_ids()` | Políticas. Devuelve un array de iglesias legibles; el planificador la evalúa una vez por sentencia (InitPlan), no por fila. |
| `app.church_ids_without_security_block()` | Historial y exportaciones, que siguen visibles en el resto de estados no operativos. |
| `app.assert_can_read_church(church_id)` | RPC que devuelven datos de negocio. Lanza 42501 con DETAIL `CHURCH_<MODO>`. |
| `app.get_my_memberships()` | Membresías propias con su modo. Sin RLS de `people` ni `church_people`, que ocultarían la iglesia bloqueada. |
| `app.get_my_church_access_modes()` | Modo por membresía (la usa la app para elegir una iglesia operativa). |
| `app.get_church_recovery_context(church_id)` | Contexto de recuperación. Solo owner/admin. Sin `security_block_reason`. |
| `app.kids_record_incident_for_present_kid(...)` | Incidencia de un menor que sigue dentro. Owner, admin o coordinador de Kids. |

### Inventario de políticas SELECT

166 políticas SELECT/ALL en 120 tablas (estado real de `pg_policies`):

- **Negocio (133 políticas):** `ALTER POLICY` que añade `church_id = ANY (app.readable_church_ids())`. Incluye
  personas (vía `church_people`), Kids, grupos, eventos, comunicaciones, giving, recursos, archivos, avisos.
- **Recuperación (3 políticas):** `subscription_history` y `export_jobs`: visibles salvo en `security_blocked`.
- **Historial de suscripción:** la condición original (`settings.manage`) no la tiene ningún rol en
  `role_capabilities`, así que nadie de la iglesia la veía, ni siquiera en full. Se sustituye por
  `church_owner`/`church_admin`. Es un defecto previo corregido aquí.
- **Control, infra, auditoría de plataforma y catálogos:** sin cambio (`churches`, `subscriptions`,
  `church_modules`, `church_feature_flags`, `church_onboarding`, `notification_preferences`, `support_sessions`,
  catálogos y tablas de plataforma).
- **Políticas `anon`:** sin cambio. La página pública de eventos se cierra dentro de `app.can_read_event_public`,
  que ya es la excepción pública de la lista blanca de seguridad.

Las escrituras no cambian: la guardia de A1 (triggers) sigue siendo la barrera de escritura.

### Superficie de recuperación

- Un owner o admin de una iglesia no operativa ve, en `/app/estado` y en el layout: estado, motivo seguro según el
  modo, fechas (prueba, gracia, retención), próximos pasos y, si aplica, el historial de suscripción en solo lectura.
- En `security_blocked` no se devuelve historial, ni fechas de retención, ni exportación, ni el motivo interno.
- Los textos son fijos por modo en `estado-copy.ts`. No hay botones de pago.
- El layout, en estado no operativo, renderiza solo la superficie de recuperación y **no renderiza los hijos**: una
  ruta profunda como `/app/personas` no carga datos de negocio.
- Cambio de iglesia: `getTenantContext` elige la iglesia pedida, la de la cookie (validada), una operativa, o la
  primera. La acción `switchActiveChurch` valida el id contra las membresías propias antes de guardar la cookie.
- Un usuario con una iglesia bloqueada y otra activa sigue usando la activa, y no queda atrapado.

### Kids

- Check-out y recogida: sin cambio desde A1. Son RPC y no dependen del modo.
- `kids_authorized_pickups`: visible en cualquier modo solo para un menor con check-in activo (cierre seguro).
  Para el resto de menores, solo en full/grace.
- Incidencia de menor dentro: `kids_record_incident_for_present_kid` cuando el modo no es operativo. El servicio
  de incidencias usa esa RPC porque `public.has_capability` lee roles con RLS y allí no vería nada.
- No hay SELECT normal de Kids en ningún modo no operativo.
- `kids_room_ratio_status`, `kids_staff_eligibility`, `kids_add_session_staff`, `kids_remove_session_staff`:
  `assert_can_read_church`. `kids_cap` solo devuelve un booleano de capacidad: sin guardia.

### Funciones SECURITY DEFINER con lectura de negocio

- `analytics_dashboard`: `assert_can_read_church` al inicio.
- `analytics_trend` y `analytics_period_bounds`: cálculo puro sobre fechas, sin datos de la iglesia: sin guardia.
- `list_my_notifications` y `count_my_unread_notifications`: sin bandeja fuera de full/grace (devuelven vacío o 0).
- `kids_checkin`, `kids_checkout`, `kids_lookup_pickup`, `kids_find_checkin_by_code`, `kids_save_sensitive_notes`,
  `kids_staff_check_in/out`: **pendientes de auditoría fina** (ver "Lo que A2 NO hace").

### Notificaciones y archivos

- Bandeja de negocio: cerrada fuera de full/grace. La recuperación no depende de `notifications`.
- Archivos: se cierra la tabla `files` (metadatos). **No hay ninguna URL firmada de Storage en la aplicación**, así que
  hoy no existe un camino de descarga de negocio; el control real está en `files`. Cuando se añada descarga, debe
  pasar por la misma condición (ver pendientes).

### Pruebas

- `supabase/tests/fase15_gating_lecturas_test.sql` (52 aserciones) con rol `authenticated` real, no superusuario:
  full, trial_expired, suspended, cancelled, security_blocked, multi-iglesia (A bloqueada, B operativa), aislamiento
  con C, miembro sin rol, RPC de analytics y Kids, bandeja, historial, exportaciones y reactivación.
- `fase15_gating_comercial_test.sql`: la expectativa de incidencia en `security_blocked` pasa a ALLOWED (cierre seguro).
- `hotfix_revokes_publicos_test.sql` sin cambios: la lista blanca de anon no cambia.
- `supabase test db`: 44 ficheros, 1.858 aserciones en verde. `supabase db diff --local`: sin cambios.
- Playwright: **no implementado.** El proyecto no tiene Playwright instalado. Queda como pendiente, con el flujo que
  cubriría: full, trial_expired, suspended, security_blocked, deep links, sidebar reducida, recuperación y cambio de iglesia.

### Rendimiento (base local, 50.000 filas de `tags`, rol `authenticated`)

- Con gating: 4,6 ms en `count(*)`. Sin RLS (superusuario): 2,4 ms.
- `readable_church_ids()` y `church_ids_for_user()` aparecen como InitPlan y se evalúan una vez por sentencia.
- Índices: `churches_pkey`, `subscriptions_church_id_key` (único), `church_people_person_id_idx`, `tags_church_id_idx`.
  No se han creado índices nuevos.

### Lo que A2 NO hace

- **Auditoría fina de RPC de lectura** (checkin, lookup, pickup por código, notas sensibles, staff): inventario hecho
  en la sección de Kids, pero falta revisar cada una con un test de rol real.
- **`security_block_reason` directo:** el owner puede leerlo desde la API de `churches` (la columna no tiene
  privilegio restringido). La recuperación no lo muestra, pero la fuga por API sigue abierta. Requiere privilegio de
  columna y revisar consumidores antes de aplicarlo.
- **Support sessions:** no concede lectura de negocio hoy, y no se ha tocado. Es el siguiente hueco de PR B.
- **Playwright** y **smoke real en Preview:** pendientes.
- **Exportación desde la UI:** no existe pantalla de solicitud de exportación en la aplicación. La superficie
  de recuperación indica disponibilidad, pero el botón está pendiente.
- **Activación desde la UI:** pendiente hasta que exista la integración de cobro (Stripe).

### Pendientes de esta fase

- A1: smoke real en Preview y validación de Carlos (PR #35).
- A2: auditoría fina de RPC de Kids, privilegio de columna para `security_block_reason`, Playwright, descarga de
  archivos con la misma condición cuando exista.
- PR B: sesiones de soporte. PR C: consola y banners.
- Stripe, precios, límites de plan e IVA: aplazados.
