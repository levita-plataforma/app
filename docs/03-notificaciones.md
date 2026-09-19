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

Estado: implementado. Ver `supabase/migrations/20260927*.sql` y `docs/adr/0019-comunicaciones-vs-avisos.md`.

### 13.1 Relación con el motor de avisos (Fase 5)

Comunicaciones **no sustituye** el motor de avisos operativos (`notification_events`/`notifications`/`notification_deliveries`), ni lo duplica por completo: reutiliza dos piezas concretas y mantiene el resto separado.

- **Reutilizado de verdad**: `notification_preferences` (mismo enum `notification_channel = ('inapp', 'email', 'push')`) resuelve el opt-out por canal en el momento de materializar destinatarios. La bandeja `notifications` recibe una fila real por destinatario del canal `inapp`, escrita directamente por `app.send_communication_impl` (una única fila mínima en `notification_events` con `event_type='communication.sent'`, ya marcada `processed_at`, sirve solo para satisfacer la FK real de `notifications.event_id`; nunca pasa por `app.process_notification_events`).
- **No reutilizado, con motivo documentado**: `app.notification_text` tiene un `case` fijo por `event_type` con copy predefinido para assignments, incompatible con el cuerpo libre de una comunicación; y `app.process_notification_events` crea `notification_deliveries` para todos los canales, duplicando lo que la materialización propia de Comunicaciones ya resuelve. Por eso `communication_recipients` es la fuente de verdad de entrega de email/push de esta fase, independiente de `notification_deliveries`.

### 13.2 Modelo de datos

`communications` (entidad principal, estados `draft/scheduled/processing/sent/partially_sent/failed/cancelled`), `communication_segments` (reglas reutilizables), `communication_templates` (con placeholders allowlisted `{{first_name}}`/`{{church_name}}`), `communication_recipients` (destinatarios materializados una sola vez por comunicación, nunca recalculados; sin política de SELECT directa para el cliente, igual que `notification_deliveries`).

### 13.3 Segmentación

Reglas JSON validadas server-side por allowlist positiva (`app.validate_segment_rules`): `campus_id`, `tags`, `relationship`, `service_area_id`, `channel_available`. Solo se admite el nivel `all` (AND); no hay `any`/OR ni anidamiento en esta fase. El campo `group` existe en la allowlist pero se rechaza en tiempo de ejecución (`app.resolve_segment_recipients`) con un error explícito — Fase 7 (grupos) no existe todavía. Ningún campo pastoral, de giving, de salud o de menores es segmentable: la allowlist es positiva, así que cualquier campo no listado se rechaza sin necesidad de enumerarlo.

### 13.4 Materialización, envío y jobs

`app.materialize_communication_impl` resuelve destinatarios una sola vez (`communications.materialized_at` como guarda) y decide, por persona y canal, `pending`/`suppressed` (opt-out)/`excluded` (sin dato del canal, ej. sin email). `app.send_communication_impl` procesa en lotes acotados (`for update skip locked limit 500`): `inapp` se entrega de verdad a la bandeja; `email`/`push` quedan en `queued` — nunca se marca `sent` sin un proveedor real, siguiendo A14 (docs/07-decisiones.md).

El job periódico (`/api/tareas/comunicaciones`, protegido por `CRON_SECRET` igual que `/api/tareas/avisos`) usa `app.cron_materialize_communication`/`app.cron_send_communication` (sin capability check: son procesos internos de `service_role`, no acciones de un usuario humano) para procesar `scheduled` cuya hora ya llegó y comunicaciones con destinatarios pendientes. Cadencia: una vez al día (mismo límite de plan de Vercel que el cron de avisos) — una comunicación programada a una hora concreta puede tardar hasta la siguiente ejecución del cron.
