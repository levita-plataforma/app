# Fase 5 (DI-01 y DI-02) — Disponibilidad, frecuencia y avisos

Fecha: **17 de septiembre de 2026**. Rama: `feature/fase-5-avisos-disponibilidad`, encima de `feature/carlos-fase-5-asignaciones`.

## Estado

```
EN DESARROLLO — nada aplicado en remoto. El envío externo (email y push) queda preparado y DESACTIVADO.
```

Este documento es el contrato de esta parte. La fuente de verdad sigue siendo el SQL (`20260923000100`–`20260923000500`).

Origen: el reparto asignaba DI-01 y DI-02 a Diogo y quedaron nueve decisiones abiertas en [CONTRATO-F4-F5.md §9](CONTRATO-F4-F5.md). Carlos, como propietario, decidió el 17 de septiembre de 2026 completarlas él y fijó las reglas de producto de §2. Diogo no ha subido ninguna rama; si tiene trabajo local, esta parte hay que reconciliarla con él antes de integrar.

---

## 1. Alcance

Incluido:

- **DI-01:** no disponibilidad (periodos concretos y pauta semanal), preferencia de frecuencia y su aviso en la elegibilidad.
- **DI-02:** eventos de dominio (outbox), bandeja de avisos en la aplicación, preferencias por canal, recordatorios, escalado de puestos críticos sin cubrir y cola de entrega por canal.
- Interfaz: «Mi disponibilidad», bandeja de avisos y campana en la navegación.
- Ejecución periódica: una ruta de tarea programada protegida por secreto.

Excluido (a propósito):

- Envío real de email y push: los adaptadores existen, pero sin proveedor configurado las entregas se quedan en cola (`queued`) y nunca salen. **No se envía nada a personas reales.**
- Antelación de llegada por puesto (decisión 4 del contrato): no se incorpora; los recordatorios usan el inicio de la actividad.

---

## 2. Reglas de producto (decididas por Carlos el 17-09-2026)

| # | Regla |
|---|---|
| 1 | **Disponibilidad:** periodos concretos con fecha y hora, **y** pauta semanal repetida. El motivo es opcional y **solo lo ve la propia persona**; a quien coordina le llega el aviso, nunca el motivo. |
| 2 | **Destinatarios de respuestas:** quien creó la asignación y los líderes del área del puesto. Sin líder de área, la administración de la iglesia. |
| 3 | **Escalado:** un puesto **crítico** que siga por debajo de su mínimo a menos de 3 días de la actividad avisa a la administración de la iglesia. |
| 4 | **Recordatorios:** sin respuesta, 7 y 2 días antes; ya aceptado, la víspera. |
| 5 | **Silencio:** 22:00–08:00 en la zona de la actividad. Lo que cae dentro se entrega al terminar la franja. Única excepción: una cancelación de una actividad que empieza ese mismo día. |
| 6 | **Frecuencia:** máximo de actividades al mes, global y afinable por área. Dos puestos de la misma actividad cuentan como una. Superarlo **no bloquea**: es un aviso más, que quien asigna confirma expresamente como los demás (no impide asignar, pero sí exige confirmarlo). Nadie recibe una notificación por ello: se ve al asignar. |

---

## 3. DI-01 · Disponibilidad y frecuencia (`20260923000100`)

### 3.1 Tablas

| Tabla | Columnas | Notas |
|---|---|---|
| `person_unavailability_periods` | `id`, `church_id`, `person_id`, `starts_at`, `ends_at`, `reason` (≤ 300, opcional), `created_by`, `created_at`, `updated_at` | Rango semiabierto `[starts_at, ends_at)`; `ends_at > starts_at`. FK `(church_id, person_id)` → `church_people` |
| `person_unavailability_weekly` | `id`, `church_id`, `person_id`, `weekday` (0 = lunes … 6 = domingo), `starts_time`, `ends_time`, `reason`, `created_at`, `updated_at` | Pauta repetida; se interpreta en la zona de la iglesia (`churches.timezone`). `ends_time > starts_time` |
| `person_serving_preferences` | `church_id`, `person_id`, `service_area_id` (nulo = global), `max_activities_per_month` (≥ 0, nulo = sin límite), `updated_at` | Índice único `(church_id, person_id, service_area_id)` con `nulls not distinct` |

Las tres con RLS forzado; escritura solo por RPC.

### 3.2 Funciones

| Función | Firma y resultado |
|---|---|
| `app.person_unavailability` | `(p_church_id uuid, p_person_ids uuid[], p_from timestamptz, p_to timestamptz)` → `(person_id uuid, source text, starts_at timestamptz, ends_at timestamptz)`. `source`: `period` o `weekly`. **Sin motivo**: es privado. Es la firma exacta que ya consume F5-Carlos |
| Autorización de la anterior | La propia persona, o quien tiene `assignment.manage` en la iglesia. En otro caso, `42501` (F5-Carlos lo traduce en el aviso `availability_unknown`) |
| `app.person_monthly_serving_load` | `(church, person, service_area, at timestamptz)` → actividades **distintas** con asignación vigente en el mes natural de `at`, filtrando por área si se indica |
| `app.person_frequency_exceeded` | `(church, person, service_area, at)` → boolean: la carga alcanza o supera el máximo aplicable (el del área si existe; si no, el global) |

`app.evaluate_assignment_eligibility` se **redefine** (misma firma) añadiendo el aviso `frequency_exceeded`. No cambia ningún bloqueo.

### 3.3 RPC de la persona

`set_my_unavailability_period`, `delete_my_unavailability_period`, `set_my_weekly_unavailability`, `delete_my_weekly_unavailability`, `set_my_serving_preference`. Todas actúan sobre la persona autenticada en la iglesia activa y se auditan (`availability.*`, `serving_preference.updated`) sin incluir el motivo.

---

## 4. DI-02 · Avisos

### 4.1 Tablas (`20260923000200`)

| Tabla | Cometido |
|---|---|
| `notification_events` | Outbox. `idempotency_key` único, `church_id`, `event_type`, `entity_type`, `entity_id`, `entity_version`, `occurred_at`, `recipient_person_ids uuid[]`, `payload jsonb`, `created_at`, `processed_at`, `attempts`, `last_error` |
| `notifications` | Bandeja persistente por persona. Único `(event_id, person_id)`. `title`, `body`, `entity_type`, `entity_id`, `created_at`, `read_at` |
| `notification_deliveries` | Una fila por aviso y canal (`inapp`, `email`, `push`). `status`: `queued`, `sent`, `failed`, `suppressed`; `scheduled_for` (silencio), `attempts`, `last_error`, `sent_at` |
| `notification_preferences` | Por persona y canal: `enabled`. `inapp` no se puede desactivar |

`payload` mínimo y sin datos sensibles: identificadores, título de la actividad, `position_name`, `starts_at`/`ends_at`, `timezone`. **Nunca** motivos de cancelación, notas administrativas ni la nota privada de respuesta.

### 4.2 Emisión (`20260923000300`)

Los eventos se escriben **en la misma transacción** que la mutación, desde triggers sobre `activity_assignments`, `activity_substitution_requests` y `activities`. Así no se reescribe ninguna función de F5-Carlos y un rollback no deja eventos.

Deduplicación: `idempotency_key` = `<event_type>:<entity_id>:<entity_version>` (clave propuesta en el contrato §6.2).

| Hecho | `event_type` | Destinatarios |
|---|---|---|
| Asignación creada ya enviada, enviada desde borrador o candidato propuesto | `assignment.proposed` | La persona asignada |
| Respuesta aceptada o rechazada | `assignment.accepted` / `assignment.declined` | Quien creó la asignación y los líderes del área (regla 2) |
| Retirada, cancelada por la actividad o sustitución retirada | `assignment.cancelled` | La persona, solo si ya se le había comunicado |
| Original sustituida | `assignment.substituted` | La persona original |
| Sustitución solicitada | `assignment.substitution_requested` | Quien gestiona el puesto (regla 2) |
| Cambio de hora | `activity.rescheduled` | Personas con asignación comunicada |
| Recordatorio | `assignment.reminder` | La persona asignada |
| Puesto crítico sin cubrir | `assignment.coverage_at_risk` | Administración de la iglesia |

### 4.3 Proceso (`20260923000500`, solo `service_role`)

| Función | Cometido |
|---|---|
| `app.process_notification_events(p_limit)` | Toma eventos sin procesar con `for update skip locked`, crea la notificación de cada destinatario y sus entregas por canal según preferencias, aplicando el silencio en `scheduled_for`; marca `processed_at` |
| `app.enqueue_due_reminders()` | Crea los eventos de recordatorio de la regla 4 |
| `app.escalate_uncovered_positions()` | Crea los eventos de escalado de la regla 3 |
| `app.claim_notification_deliveries(p_channel, p_limit)` / `app.complete_notification_delivery(...)` | Cola de salida para el futuro transporte |

Silencio (regla 5): `scheduled_for` se desplaza al final de la franja en la zona de la actividad; el canal `inapp` nunca se retrasa.

### 4.4 Lectura (`20260923000400` y `20260923000500`)

Cada persona lee **solo sus** notificaciones y preferencias. Nadie lee el outbox ni las entregas desde el cliente (`service_role`). RPC: `list_my_notifications`, `count_my_unread_notifications`, `mark_notification_read`, `mark_all_notifications_read`, `set_my_notification_preference`.

---

## 5. Interfaz

| Pantalla | Contenido |
|---|---|
| `/app/mi-disponibilidad` | Periodos, pauta semanal y frecuencia (global y por área). Aviso claro de que el motivo es privado |
| `/app/avisos` | Bandeja: sin leer y todo, con enlace a la actividad o al turno y «marcar todo como leído» |
| Campana en la cabecera | Número de avisos sin leer |

Ningún texto promete correo ni push mientras el transporte esté desactivado.

---

## 6. Ejecución periódica y transporte

- Ruta `/api/tareas/avisos` (acepta `GET` y `POST`), protegida por `CRON_SECRET` en la cabecera `Authorization: Bearer …`. Sin credencial válida responde 401, esté o no configurado el secreto.
- La dispara **Vercel Cron** una vez al día (`vercel.json`, 07:00 UTC), que es lo que permite cualquier plan. Vercel envía esa cabecera automáticamente cuando `CRON_SECRET` está definida en el entorno.
- **Latencia:** con una sola pasada diaria, un aviso puede tardar hasta 24 horas en aparecer en la bandeja. Si el plan lo permite, subir la frecuencia a `*/10 * * * *` en `vercel.json` es un cambio de una línea. Mientras tanto, se puede forzar una pasada llamando a la ruta con el secreto.
- Ejecuta, con la clave de servicio: recordatorios → escalado → proceso de eventos. Devuelve los contadores de cada paso.
- Transporte: `NOTIFICATIONS_TRANSPORT` (`disabled` por defecto). Desactivado, las entregas de `email` y `push` se quedan en `queued` y se registra el motivo; no se contacta con ningún proveedor.

---

## 7. Migraciones

`20260923000100_disponibilidad.sql`, `…000200_avisos.sql`, `…000300_avisos_emision.sql`, `…000400_rls_avisos.sql`, `…000500_rpc_avisos.sql`.

Se usa el prefijo `20260923…` (posterior a F5-Carlos) en lugar del `20260921…` que el contrato reservaba a Diogo: así estas migraciones nunca quedan por detrás de unas ya aplicadas y no hay que reescribir las de F5-Carlos, que pueden estar ya en producción.

---

## 8. Riesgos

| Riesgo | Tratamiento |
|---|---|
| Reparto con Diogo | Esta parte era suya. Si tiene trabajo local, hay que reconciliar antes de integrar |
| Envío externo | Desactivado por defecto; activarlo exige proveedor, credenciales y una prueba con datos sintéticos |
| Volumen de avisos | La bandeja crece sin purga; conviene un archivado posterior |
| Frecuencia de la tarea | Una pasada diaria: la bandeja puede ir hasta 24 horas por detrás. Subirla depende del plan de Vercel |
| Zona de la pauta semanal | Se interpreta en la zona de la iglesia, no en la de la persona |
| Pauta semanal y medianoche | Una franja no puede cruzar la medianoche («sábados de 22:00 a 02:00» son dos franjas) |
| Preferencia de canal | Es de la persona, no de cada iglesia: cambiarla se aplica a todas sus pertenencias |
| Outbox en la misma transacción | Es lo acordado, pero implica que un defecto al emitir un evento aborta la escritura de dominio. Al ampliar el catálogo de `event_type` hay que actualizar su `check` antes de emitir el valor nuevo |
