# ADR 0003 · Multi-campus dentro del tenant

## Estado

Aceptado — 16 de septiembre de 2026.

## Contexto

LEVITA debe servir tanto a una iglesia con una única localización como a una organización con varias sedes. No se puede asumir una única sede en el núcleo, porque introducirla después obligaría a reescribir el modelo de datos y las políticas de acceso.

## Decisión

`campuses` es una entidad de primera clase que pertenece siempre a `churches` (`campus.church_id NOT NULL`). Toda iglesia recibe una sede principal (`is_primary = true`) al crearse, aunque la interfaz simplifique el concepto para iglesias con una sola sede.

Una entidad funcional puede ser tenant-wide (ej.: una persona, una canción) o estar asociada opcionalmente a un campus concreto (`campus_id NULLABLE`) cuando tenga sentido físico (una sala, una actividad local).

`campus` **no es un tenant**. No tiene aislamiento de seguridad propio distinto del de su iglesia; es una partición funcional dentro del mismo tenant.

## Alternativas consideradas

1. **No modelar campus en la Fase 0 y añadirlo cuando haga falta.** Descartado: introducir multi-campus después requeriría añadir `campus_id` retroactivamente a decenas de tablas y decidir su nulabilidad bajo presión, con datos ya en producción.
2. **Tratar cada sede como un tenant independiente.** Descartado: rompe la gestión unificada de personas, suscripción y configuración que una organización con varias sedes espera tener.

## Consecuencias

- Cualquier tabla que pueda tener alcance de sede debe decidir explícitamente si `campus_id` es obligatorio, opcional o inexistente, documentado en el ADR de esa entidad o en su migración.
- El rol `campus_admin` obtiene su scope a partir de una relación tenant-aware, nunca de un `campus_id` enviado libremente por el cliente.
- Archivar una sede no elimina actividades históricas asociadas a ella.

## Riesgos

- Confundir `campus_id` opcional con ausencia de scope: una entidad sin `campus_id` es tenant-wide por diseño, no "sin sede asignada por error". Mitigación: cada tabla con `campus_id` documenta explícitamente su semántica en el ADR o comentario de migración.
