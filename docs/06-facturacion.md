# Facturación, planes y entitlements

Revisión: **15 de septiembre de 2026**.

## 1. Principio

La suscripción pertenece a la iglesia/tenant, no a una persona. El precio, periodicidad y catálogo comercial siguen pendientes de decisión.

## 2. Separaciones obligatorias

- **plan**: oferta comercial;
- **subscription**: contrato activo de una iglesia;
- **entitlement**: capacidad/límite derivado del plan;
- **role/permission**: autorización humana.

Nunca convertir un plan en rol.

## 3. Entitlements posibles

- módulos habilitados;
- número de personas activas;
- sedes;
- almacenamiento;
- admins;
- comunicaciones;
- automatizaciones;
- integraciones.

No definir límites arbitrarios hasta aprobar pricing.

## 4. Estados

- provisioning;
- trial si se decide;
- active;
- past_due;
- grace_period;
- suspended;
- cancelled.

## 5. Alta

El pago/proveedor debe ser idempotente. Webhooks se verifican, persisten y procesan asíncronamente. Nunca activar tenant por un parámetro de retorno manipulable del navegador.

## 6. Impago

Pendiente de política comercial. La arquitectura soporta:

- avisos;
- periodo de gracia;
- restricción de nuevas acciones;
- solo lectura;
- suspensión;
- exportación.

No borrar datos por impago.

## 7. Cambio de plan

- calcular fecha efectiva;
- actualizar entitlements;
- no destruir datos de módulos desactivados;
- permitir exportación;
- definir qué ocurre al superar límites.

## 8. Operación

Overrides comerciales excepcionales deben estar auditados, tener motivo y, si es temporal, expiración.

## 9. Giving no es billing

Las donaciones que la iglesia recibe pertenecen al módulo Giving. La cuota que la iglesia paga a LEVITA pertenece a billing de plataforma. Sus permisos y proveedores pueden ser distintos.
