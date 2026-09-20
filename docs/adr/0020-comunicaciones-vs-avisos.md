# ADR 0020 · Comunicaciones (Fase 9): tablas propias, reutilización parcial del motor de avisos

## Estado

Aceptado. Propuesto e implementado el 30 de septiembre de 2026.

Fuente de verdad: migraciones `supabase/migrations/20261001000100_comunicaciones.sql` a `20261001000700_metricas_comunicaciones.sql`. Este ADR solo describe lo que ese SQL hace.

Relacionado: [ADR 0013](0013-estrategia-rls.md), [ADR 0014](0014-claves-fk-tenant-safe.md), decisión D16/D21 y A14 (`docs/07-decisiones.md`), `docs/03-notificaciones.md` §13.

## Contexto

El motor de avisos de Fase 5 (`notification_events`/`notifications`/`notification_deliveries`/`notification_preferences`) ya modela eventos de dominio con destinatarios, canales, preferencias y una cola de entrega. Fase 9 necesita enviar comunicaciones institucionales masivas y segmentadas: en apariencia, el mismo problema. Se evaluó reutilizar el motor de avisos completo antes de crear tablas nuevas.

## Decisión · Tablas propias (`communications`, `communication_segments`, `communication_templates`, `communication_recipients`)

Una comunicación es un envío masivo con destinatarios **materializados una sola vez** y un estado de entrega propio por persona y canal; el motor de Fase 5 modela eventos de dominio 1 evento → N personas, con reglas de reintento, silencio nocturno y escalado pensadas para avisos operativos individuales (turno propuesto, recordatorio, sustitución). Forzar ambos ciclos de vida en el mismo esquema habría exigido:

- Ampliar el `CHECK` cerrado de `notification_events.event_type` con un concepto (`communication.*`) que no comparte las reglas de reintento/escalado del resto de la lista.
- Que `communication_recipients` y `notification_deliveries` compitieran por representar la misma entrega, con dos fuentes de verdad divergentes.

Se crean cuatro tablas nuevas, todas `church_id` + RLS enable+force + FK compuestas tenant-safe (ADR 0014): `communications` (entidad principal, enum de estado `draft/scheduled/processing/sent/partially_sent/failed/cancelled`), `communication_segments` (reglas reutilizables), `communication_templates` (placeholders allowlisted), `communication_recipients` (destinatario materializado, `unique(communication_id, person_id, channel)`, sin política de `SELECT` directa para el cliente — igual que `notification_deliveries`).

## Decisión · Reutilización real, no total, del motor de avisos

Dos piezas de Fase 5 SÍ se reutilizan sin duplicar:

1. **`notification_preferences`**: mismo enum `notification_channel = ('inapp', 'email', 'push')`. El opt-out por canal, ya resuelto por Fase 5, decide en el momento de materializar si un destinatario queda `pending` o `suppressed` — no se crea un segundo sistema de preferencias.
2. **`notifications` (bandeja)**: cada destinatario del canal `inapp` recibe una fila real en la bandeja compartida, para que Avisos y Comunicaciones convivan en una única bandeja del usuario.

Lo que **no** se reutiliza, con motivo verificado contra el código real:

- `app.notification_text` es un `case` fijo por `event_type`, con copy predefinido para assignments (turno, sustitución, recordatorio). No admite el cuerpo libre de una comunicación (`{{first_name}}`/`{{church_name}}` interpolados desde `communications.body_template`).
- `app.process_notification_events` crea `notification_deliveries` para **todos** los canales de un evento, no solo `inapp`. Pasar una comunicación por ahí generaría filas de `notification_deliveries` para email/push que competirían con `communication_recipients`, duplicando el registro de entrega.

**Solución adoptada**: `app.send_communication_impl` escribe DIRECTAMENTE una fila mínima en `notification_events` (con `event_type = 'communication.sent'`, agregado al `CHECK` existente porque la FK real de `notifications.event_id` lo exige — no hay forma de insertar en la bandeja sin una fila de outbox) ya marcada `processed_at = now()`, para que `app.process_notification_events` nunca la recoja ni intente re-derivar destinatarios de ella. Después inserta una fila en `notifications` por destinatario `inapp`, con el texto ya interpolado. **Nunca se crean filas en `notification_deliveries` para una comunicación.**

## Decisión · Grafía del canal: `inapp`, no `in_app`

El enum `notification_channel` de Fase 5 ya usa `inapp` (sin guion bajo). Comunicaciones reutiliza el mismo enum tal cual — no se crea un cuarto valor ni se reescribe con otra grafía. Cualquier código nuevo de esta fase que necesite referirse al canal de bandeja usa `'inapp'`.

## Decisión · Rutas separadas para llamada humana vs. cron

Cada acción de materializar/enviar existe dos veces:

- `app.materialize_communication` / `app.send_communication`: exigen `communications.send` del llamante (vía `app.communication_cap`, con scope `service_area` para líderes de área). Pensadas para el clic humano "Enviar ahora" desde la UI.
- `app.cron_materialize_communication` / `app.cron_send_communication`: sin ningún capability check, granted solo a `service_role`. Pensadas para el job periódico (`/api/tareas/comunicaciones`), que no tiene sesión de usuario y por tanto no puede evaluar `app.has_capability` (depende de `auth.uid()`).

Ambas llaman a la misma lógica interna (`app.materialize_communication_impl` / `app.send_communication_impl`) para no duplicar comportamiento — solo difieren en la comprobación de autorización previa. `app.due_scheduled_communications`/`app.pending_send_communications` (también `service_role`-only) le dicen al cron qué comunicaciones existen que procesar, sin que el cliente humano necesite conocerlas.

## Decisión · Segmentación: JSON validado, allowlist positiva, sin OR/anidamiento

Las reglas de un segmento se guardan como `{"all": [{"field": ..., "op": ..., "value": ...}]}`, validadas server-side (`app.validate_segment_rules`) contra una allowlist positiva: `campus_id`, `tags`, `relationship`, `service_area_id`, `channel_available`, y `group` (reservado, rechazado en ejecución porque Fase 7 no existe). Cualquier campo no listado se rechaza automáticamente — esto cubre, sin necesidad de enumerarlas, las prohibiciones explícitas de segmentar por datos pastorales, de Giving, de salud o de menores/Kids.

Solo se admite el nivel `all` (AND); no hay `any` (OR) ni anidamiento en esta fase. `app.resolve_segment_recipients` interpreta el JSON con un `case` controlado por campo (nunca SQL libre ni `format()` con datos del cliente) y devuelve la intersección progresiva de un array `uuid[]` en memoria — no una tabla temporal, porque `CREATE TEMPORARY TABLE` no está permitido dentro de una función `stable` (bloqueaba la primera versión de esta función durante el desarrollo; corregido antes de mezclarse).

## Consecuencias

- Una comunicación materializada nunca cambia sus destinatarios aunque el segmento guardado se edite después: `communications.segment_rules_snapshot` es una copia inmutable tomada al crear/editar en `draft`, no una referencia viva a `communication_segments.rules`.
- Sin proveedor real de email/push (A14): toda comunicación con esos canales queda como máximo en `queued`. El estado final de la comunicación (`sent`/`partially_sent`/`failed`) se calcula solo a partir de si el "encolado" tuvo éxito, no de una entrega externa confirmada — documentado en la UI, no oculto.
- El job de comunicaciones corre una vez al día (mismo límite de plan de Vercel que el cron de avisos), no cada 15 minutos como se planteó inicialmente: una comunicación programada a una hora concreta puede tardar hasta la siguiente ejecución del cron.
- Ampliar la segmentación a grupos (cuando exista Fase 7) o a OR/anidamiento no requiere cambiar el esquema de `communication_segments.rules` — solo ampliar la allowlist y el intérprete de `app.resolve_segment_recipients`.
