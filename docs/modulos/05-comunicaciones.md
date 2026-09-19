# Módulo Communications

Estado: implementado (Fase 9, incluida la iteración de categorías/OR/unsubscribe). Ver `supabase/migrations/20260931*.sql`, `docs/03-notificaciones.md` §13, `docs/adr/0020-comunicaciones-vs-avisos.md` y `docs/adr/0021-comunicaciones-categorias-or-unsubscribe.md`.

## Objetivo

Enviar comunicaciones institucionales segmentadas reutilizando datos internos del tenant (personas, tags, campus, áreas de servicio), sin exportar listas manualmente y sin construir un sistema de marketing masivo genérico.

## Entidades reales

- `communications` — entidad principal (título, finalidad, cuerpo con placeholders, canales, estado, programación).
- `communication_segments` — reglas de audiencia reutilizables.
- `communication_templates` — plantillas con placeholders allowlisted.
- `communication_recipients` — destinatarios materializados una sola vez por comunicación (fuente de verdad de entrega de email/push; independiente de `notification_deliveries` de Fase 5).
- `notification_preferences` (reutilizada de Fase 5, no duplicada) — opt-out por canal.
- `notifications` (bandeja, reutilizada de Fase 5 solo para el canal `inapp`).

Nombres descartados frente al diseño original de este documento (`messages`, `message_campaigns`, `device_subscriptions`, `templates`/`segments` sin prefijo): se optó por `communication_*` para no colisionar con nombres genéricos ya usados en otros módulos, y no se creó ninguna tabla de dispositivos push (no existe proveedor real todavía, ver A14).

## Finalidades (purpose)

9 valores en `communication_purpose`: `institutional`, `operational`, `system` (**obligatorias**, nunca admiten opt-out, ni por canal ni por categoría) y `services`, `groups`, `events`, `discipleship`, `kids`, `pastoral` (**opcionales**, sujetas a `communication_category_preferences`). **No existe `marketing` funcional** (A14, docs/07-decisiones.md): decisión explícita de esta fase, no un olvido.

## Regla de fuente de verdad

El mensaje interno persistido existe antes del intento externo. Push/email son canales de entrega, no el único registro. Sin proveedor real: quedan en `queued`, nunca se marca `sent` de forma fingida.

## Segmentación

Reglas JSON validadas server-side por allowlist positiva, AND (`{"all": [...]}`) u OR (`{"any": [...]}`) al mismo nivel — nunca ambos a la vez, sin anidamiento:

- `campus_id`;
- `tags`;
- `relationship` (estado de `church_people`);
- `service_area_id`;
- `channel_available`;
- `group` — **reservado**, presente en la allowlist pero rechazado en tiempo de ejecución hasta que exista Fase 7 (grupos).

Explícitamente prohibido como criterio de segmentación (allowlist positiva, no requiere enumerar cada exclusión): contenido pastoral, donaciones/Giving, datos de salud, datos restringidos de menores/Kids.

## Preferencias

Dos capas independientes, sin tocarse entre sí:

- **Por canal**: `notification_preferences` ya existente de Fase 5 (`church_id`, `person_id`, `channel`), reutilizada tal cual.
- **Por categoría opcional**: `communication_category_preferences` (`church_id`, `person_id`, `category`, `opted_out`), nueva de esta iteración. Solo admite las 6 categorías opcionales (CHECK); `institutional`/`operational`/`system` no pueden tener fila ahí. Un opt-out de categoría suprime `email`/`push` pero nunca `inapp` — la bandeja interna siempre registra.
- **Unsubscribe sin sesión**: `communication_recipients.unsubscribe_token` (mismo patrón que `registrations.cancel_token` de Fase 6), generado solo para email de categoría opcional sin opt-out previo. Página pública en `/i/comunicacion/baja/[token]`, RPC `app.unsubscribe_by_token` (`security definer`, `grant to anon`). Ver ADR 0021.

Gestión propia desde `/app/comunicacion/preferencias` (ambas capas, misma página).

## Antiabuso

- límite de comunicaciones creadas por tenant/hora, centralizado en `app.communication_rate_limit(p_church_id)` (hoy valor fijo, punto de extensión único para entitlements futuros — sin sistema de planes inventado);
- previsualización de destinatarios (`app.preview_communication_segment`) antes de enviar;
- capability `communications.send` requerida, con scope de área para líderes; `communications.update`/`communications.cancel` separadas de `communications.schedule`;
- confirmación fuerte en la UI para audiencias grandes.

## WhatsApp/SMS

Ausencia real, no simulada: no aparecen como canal funcional ni en el enum `notification_channel` ni en la UI de envío. Solo mediante integración oficial futura, tras definir coste, consentimiento y modelo operativo.

## Webhooks de proveedor, bounce y reintentos

No implementados: no existe ningún proveedor real de email/push (A14). Un webhook que valide firma de un proveedor inexistente sería simulación o superficie de ataque sin propósito real. Se preparó únicamente `communication_recipients.failure_kind` (`temporary`/`permanent`), sin lógica de reintento activa porque ningún envío falla hoy de verdad. Ver ADR 0021.

## Núcleo transversal

`app.create_communication`/`materialize_communication`/`send_communication` son RPCs internas reutilizables por diseño. Cualquier módulo futuro (Eventos, Serving, Grupos, Discipulado, Kids) debe llamarlas en vez de construir su propio mecanismo de envío masivo — documentado como contrato en ADR 0021, sin wrapper específico por módulo todavía (ninguno tiene un caso de uso real hoy).
