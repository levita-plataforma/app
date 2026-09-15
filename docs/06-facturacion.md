# Facturación y activación de iglesias

Revisión de producto · **15 de septiembre de 2026**.
La instrucción del promotor incorpora el registro con cuota al lanzamiento.
**Sustituye la propuesta anterior de aplazar toda la facturación a fase 4.**
La landing actual aún no contiene registro, pago ni backend.

## Qué se cobra y a quién

La suscripción corresponde a una iglesia, no a cada voluntario ni a su cuenta.
El propietario gestiona el pago de su tenant. Si pertenece a dos iglesias,
ve cada suscripción dentro del contexto de la iglesia correspondiente.

Están pendientes de definir el importe, la periodicidad, los límites del plan,
el tratamiento comercial de impuestos y cualquier periodo de prueba. No se
presentan como aprobados los antiguos planes Semilla, Congregación, Iglesia y
Multisede ni sus precios. No se promete un plan gratuito.

Para maquetas usar «Cuota pendiente de definir» en una anotación de diseño.
No colocar un precio inventado en una pantalla que pueda confundirse con una
oferta pública. La interfaz final mostrará importe, periodicidad, total y las
condiciones configuradas antes de confirmar el pago.

## Alta y primer pago

Los dos recorridos se describen en [Iglesias y tenants](12-iglesias-y-tenants.md):
registro de la propia iglesia y alta asistida desde LEVITA.

Propuesta para el diseño: ambos crean una alta recuperable, llevan al pago de
esa iglesia y activan el tenant al recibir confirmación fiable del servidor.
El alta asistida no concede automáticamente acceso gratuito; operación puede
volver a enviar el enlace para continuar la misma alta.

Crear un tenant activo, vincular propietario y copiar la base de áreas debe
ser una operación recuperable y sin duplicados. Un fallo entre esos pasos
no debe dejar una iglesia cobrada sin acceso ni producir dos espacios al reintentar.

## Pantallas y estados requeridos

| Pantalla o estado | Contenido |
|---|---|
| Oferta y resumen | Iglesia, cuota configurada y condiciones antes del pago |
| Pago interrumpido | Reanudar sin repetir nombre, cuenta ni alta |
| Confirmación pendiente | «Estamos confirmando el pago»; conservar el enlace al estado del alta |
| Activación completada | «Tu iglesia está lista» y «Personalizar áreas» |
| Confirmación recibida, activación fallida | Explicar que el pago consta y ofrecer recuperar la activación o contactar con soporte; no cobrar de nuevo |
| Suscripción | Iglesia, estado, próxima fecha e importe si el proveedor los confirma; gestionar pago y consultar facturas |
| Renovación fallida | Mensaje al propietario y acción para actualizar el método de pago |
| Cancelación solicitada | Mostrar cuándo tendrá efecto según las condiciones que se aprueben |

La política de gracia, suspensión, cancelación y acceso después del impago
sigue pendiente (D3 en [Decisiones](07-decisiones.md)). El prototipo enseña la
recuperación de pago, pero no inventa un corte inmediato de turnos ni un número
de días de gracia. La cancelación de una cuota y el borrado de datos son
acciones distintas.

## Integración de referencia

La documentación heredada propone Stripe Checkout, Customer Portal y webhooks.
Es una referencia de arquitectura, no una integración presente aquí. El backend
asocia cada cliente y suscripción del proveedor con el identificador estable
del tenant; el navegador no elige la iglesia de otro cliente.

Los eventos del proveedor se verifican y procesan sin duplicados. Se consulta
el estado actual de la suscripción para reconciliar entregas repetidas o fuera
de orden. La vuelta del navegador desde el pago no activa por sí sola el tenant.
La suscripción de una iglesia no desbloquea otra por compartir propietario.

No se repiten aquí importes de terceros ni especificaciones de impuestos sin
verificación. Los documentos contractuales y de privacidad se revisan para
estas vías de alta conforme a [Datos personales](08-rgpd-y-lopivi.md).

## Criterios de aceptación del lanzamiento

- Una iglesia puede registrarse, pagar y llegar a su base editable de áreas.
- Operación puede iniciar el alta y el propietario terminarla sin una segunda alta.
- Pago cancelado, pendiente y fallido tienen recuperación explícita.
- Confirmar o reintentar dos veces no duplica cobros iniciados por la aplicación,
  tenants, propietarios ni áreas base.
- El propietario ve solo la suscripción y facturas de la iglesia activa.
- La cuota configurada coincide en la oferta, el pago y el resumen posterior.
