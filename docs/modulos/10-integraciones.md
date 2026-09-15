# Módulo Integrations — Conectores y automatización

## Objetivo

Permitir que LEVITA se conecte con proveedores sin acoplar el dominio.

## Integraciones previstas

- email;
- push;
- pagos;
- Google/Microsoft Calendar;
- almacenamiento;
- contabilidad;
- SMS/WhatsApp oficial futuro;
- herramientas de streaming/meeting si hay caso real;
- API/webhooks.

## Configuración

Cada integración debe registrar:

- tenant;
- proveedor;
- credenciales cifradas/referencias de secreto;
- scopes;
- estado;
- fecha de conexión;
- usuario que conectó;
- última sincronización;
- errores.

## Seguridad

No exponer secretos en frontend ni logs. Rotación, revocación y mínimo privilegio.

## Automatizaciones

Futuro motor simple de reglas:

`trigger -> condiciones -> acciones`

Ejemplos:

- nueva inscripción -> enviar mensaje;
- asignación rechazada crítica -> avisar líder;
- credencial próxima a caducar -> crear aviso;
- nuevo visitante -> crear tarea de seguimiento.

No introducir un motor genérico complejo antes de validar estos casos.
