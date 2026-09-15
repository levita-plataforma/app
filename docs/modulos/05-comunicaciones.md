# Módulo Communications

## Objetivo

Unificar bandeja interna, push y email y permitir comunicación segmentada sin mezclarla con la lógica de negocio de cada módulo.

## Entidades

- `messages`
- `message_campaigns`
- `message_recipients`
- `notification_preferences`
- `device_subscriptions`
- `delivery_attempts`
- `templates`
- `segments` cuando se materialicen

## Tipos

- notificación transaccional;
- aviso operativo;
- recordatorio;
- comunicado institucional;
- campaña segmentada.

## Regla de fuente de verdad

El mensaje interno persistido existe antes del intento externo. Push/email son canales de entrega, no el único registro.

## Segmentación

Por combinaciones permitidas de:

- tags;
- grupo;
- área;
- campus;
- curso;
- evento;
- rol;
- criterios de People permitidos.

## Preferencias

Separar finalidad y canal. Algunas notificaciones críticas operativas pueden tener tratamiento distinto de comunicaciones opcionales, siempre documentado.

## Antiabuso

- límites por tenant;
- previsualización de destinatarios;
- permisos para envío masivo;
- confirmación en campañas grandes;
- rate limits;
- métricas de rebotes;
- suppression list.

## WhatsApp/SMS

Solo mediante integración oficial y tras definir coste, consentimiento y modelo operativo. No es requisito para el MVP.
