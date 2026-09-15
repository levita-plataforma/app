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
