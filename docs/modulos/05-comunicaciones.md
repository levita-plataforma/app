# Módulo Communications

Estado: implementado (Fase 9). Ver `supabase/migrations/20260931*.sql`, `docs/03-notificaciones.md` §13 y `docs/adr/0020-comunicaciones-vs-avisos.md`.

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

`institutional` y `operational`. **No existe `marketing` funcional** (A14, docs/07-decisiones.md): decisión explícita de esta fase, no un olvido.

## Regla de fuente de verdad

El mensaje interno persistido existe antes del intento externo. Push/email son canales de entrega, no el único registro. Sin proveedor real: quedan en `queued`, nunca se marca `sent` de forma fingida.

## Segmentación

Reglas JSON validadas server-side por allowlist positiva, solo AND (`{"all": [...]}`, sin OR ni anidamiento en esta fase):

- `campus_id`;
- `tags`;
- `relationship` (estado de `church_people`);
- `service_area_id`;
- `channel_available`;
- `group` — **reservado**, presente en la allowlist pero rechazado en tiempo de ejecución hasta que exista Fase 7 (grupos).

Explícitamente prohibido como criterio de segmentación (allowlist positiva, no requiere enumerar cada exclusión): contenido pastoral, donaciones/Giving, datos de salud, datos restringidos de menores/Kids.

## Preferencias

Opt-out vía `notification_preferences` ya existente de Fase 5, por canal (no por finalidad en esta fase — decisión de A14, evaluar en el futuro si se necesita separar).

## Antiabuso

- límite de comunicaciones creadas por tenant/hora, dentro de la propia RPC (`app.create_communication`);
- previsualización de destinatarios (`app.preview_communication_segment`) antes de enviar;
- capability `communications.send` requerida, con scope de área para líderes;
- confirmación fuerte en la UI para audiencias grandes.

## WhatsApp/SMS

Ausencia real, no simulada: no aparecen como canal funcional ni en el enum `notification_channel` ni en la UI de envío. Solo mediante integración oficial futura, tras definir coste, consentimiento y modelo operativo.
