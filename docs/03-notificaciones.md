# Notificaciones y comunicación

Revisión: **15 de septiembre de 2026**.

LEVITA utiliza un motor común de mensajes. Los módulos generan eventos de negocio; el motor decide persistencia y entrega. El módulo Communications añade campañas segmentadas sobre el mismo núcleo.

## 1. Principio

Crear primero un mensaje interno persistente. Después intentar canales externos. Un fallo de push/email no elimina el aviso.

## 2. Canales

- bandeja interna;
- push web/PWA;
- email;
- futuros SMS/WhatsApp mediante integraciones oficiales.

## 3. Suscripción por dispositivo

Push pertenece al dispositivo/navegador. Activar en iPhone no activa automáticamente escritorio. Guardar endpoint, claves, user, tenant/contexto permitido, estado y timestamps.

## 4. Preferencias

Separar:

- canal;
- finalidad;
- tenant;
- dispositivo.

Distinguir avisos operativos críticos de campañas opcionales.

## 5. Eventos de Serving

- asignación publicada;
- recordatorio;
- cambio de hora;
- cancelación;
- rechazo crítico;
- sustitución;
- credencial próxima a caducar.

## 6. Eventos de otros módulos

- inscripción confirmada;
- cambio/cancelación de evento;
- solicitud de grupo;
- sesión de curso;
- comunicación de grupo;
- recordatorio de Kids cuando sea apropiado;
- tarea pastoral sin revelar contenido sensible en push;
- mantenimiento/reserva.

## 7. Privacidad del contenido

Push y email pueden aparecer en pantallas bloqueadas o bandejas compartidas. Para módulos sensibles usar texto mínimo, por ejemplo “Tienes una actualización en LEVITA”, sin incluir detalles pastorales, financieros o de menores.

## 8. Idempotencia

Cada mensaje lógico necesita clave de deduplicación. Reintentar no duplica comunicación.

## 9. Entrega

Registrar intentos:

- queued;
- sent;
- delivered si proveedor lo ofrece;
- bounced;
- failed;
- suppressed.

## 10. Campañas

Antes de enviar:

- resolver segmento;
- mostrar estimación de destinatarios;
- excluir opt-outs;
- validar permiso;
- aplicar límite;
- snapshot o regla reproducible del segmento;
- registrar campaña.

## 11. Horas de silencio

Aplicar zona horaria del destinatario/iglesia según regla. Avisos urgentes pueden tener excepción explícita.

## 12. Jobs

La entrega es asíncrona, con retries y dead-letter/estado fallido. Toda tarea incluye tenant y correlation id.

## 13. Implementación real de Comunicaciones (Fase 9)

Estado: implementado, incluida la iteración de categorías/OR/preferencias/unsubscribe. Ver `supabase/migrations/20261001*.sql`, `docs/adr/0020-comunicaciones-vs-avisos.md` y `docs/adr/0021-comunicaciones-categorias-or-unsubscribe.md`.

### 13.1 Relación con el motor de avisos (Fase 5)

Comunicaciones **no sustituye** el motor de avisos operativos (`notification_events`/`notifications`/`notification_deliveries`), ni lo duplica por completo: reutiliza dos piezas concretas y mantiene el resto separado.

- **Reutilizado de verdad**: `notification_preferences` (mismo enum `notification_channel = ('inapp', 'email', 'push')`) resuelve el opt-out por canal en el momento de materializar destinatarios. La bandeja `notifications` recibe una fila real por destinatario del canal `inapp`, escrita directamente por `app.send_communication_impl` (una única fila mínima en `notification_events` con `event_type='communication.sent'`, ya marcada `processed_at`, sirve solo para satisfacer la FK real de `notifications.event_id`; nunca pasa por `app.process_notification_events`).
- **No reutilizado, con motivo documentado**: `app.notification_text` tiene un `case` fijo por `event_type` con copy predefinido para assignments, incompatible con el cuerpo libre de una comunicación; y `app.process_notification_events` crea `notification_deliveries` para todos los canales, duplicando lo que la materialización propia de Comunicaciones ya resuelve. Por eso `communication_recipients` es la fuente de verdad de entrega de email/push de esta fase, independiente de `notification_deliveries`.

### 13.2 Modelo de datos

`communications` (entidad principal, estados `draft/scheduled/processing/sent/partially_sent/failed/cancelled`), `communication_segments` (reglas reutilizables), `communication_templates` (con placeholders allowlisted `{{first_name}}`/`{{church_name}}`), `communication_recipients` (destinatarios materializados una sola vez por comunicación, nunca recalculados; sin política de SELECT directa para el cliente, igual que `notification_deliveries`).

### 13.3 Segmentación

Reglas JSON validadas server-side por allowlist positiva (`app.validate_segment_rules`): `campus_id`, `tags`, `relationship`, `service_area_id`, `channel_available`. Se admite el nivel `all` (AND) o `any` (OR) al mismo nivel superior — nunca ambos a la vez, sin anidamiento. `app.resolve_segment_recipients` calcula el universo que cumple cada condición por separado y combina por intersección progresiva (AND) o unión progresiva (OR). El campo `group` existe en la allowlist pero se rechaza en tiempo de ejecución con un error explícito — Fase 7 (grupos) no existe todavía. Ningún campo pastoral, de giving, de salud o de menores es segmentable: la allowlist es positiva, así que cualquier campo no listado se rechaza sin necesidad de enumerarlo.

### 13.4 Materialización, envío y jobs

`app.materialize_communication_impl` resuelve destinatarios una sola vez (`communications.materialized_at` como guarda) y decide, por persona y canal, `pending`/`suppressed` (opt-out de canal u opt-out de categoría opcional)/`excluded` (sin dato del canal, ej. sin email). `app.send_communication_impl` procesa en lotes acotados (`for update skip locked limit 500`): `inapp` se entrega de verdad a la bandeja; `email`/`push` quedan en `queued` — nunca se marca `sent` sin un proveedor real, siguiendo A14 (docs/07-decisiones.md).

### 13.5 Categorías, preferencias por categoría y unsubscribe (iteración)

`communication_purpose` tiene 9 valores: `institutional`/`operational`/`system` (obligatorias, sin opt-out posible) y `services`/`groups`/`events`/`discipleship`/`kids`/`pastoral` (opcionales). Las opcionales admiten baja vía `communication_category_preferences` (`church_id`, `person_id`, `category`, `opted_out`) — tabla nueva y acotada, sin tocar el contrato de `notification_preferences` de Fase 5. Un opt-out de categoría suprime `email`/`push` pero nunca `inapp`.

Baja sin sesión: `communication_recipients.unsubscribe_token` (mismo patrón que `registrations.cancel_token` de Fase 6, dos UUID sin guiones, comparación por igualdad), generado solo para email de categoría opcional sin opt-out previo. Página pública `/i/comunicacion/baja/[token]`, RPC `app.unsubscribe_by_token` (`security definer`, `grant to anon`). El aislamiento multi-tenant lo resuelve el propio token, no un parámetro `church_id` explícito. Ver ADR 0021.

### 13.6 Webhooks de proveedor

No implementados: no hay proveedor real de email/push (A14). Se preparó `communication_recipients.failure_kind` (`temporary`/`permanent`) sin lógica de reintento activa, porque ningún envío falla realmente hoy. Ver ADR 0021.

El job periódico (`/api/tareas/comunicaciones`, protegido por `CRON_SECRET` igual que `/api/tareas/avisos`) usa `app.cron_materialize_communication`/`app.cron_send_communication` (sin capability check: son procesos internos de `service_role`, no acciones de un usuario humano) para procesar `scheduled` cuya hora ya llegó y comunicaciones con destinatarios pendientes. Cadencia: una vez al día (mismo límite de plan de Vercel que el cron de avisos) — una comunicación programada a una hora concreta puede tardar hasta la siguiente ejecución del cron.
