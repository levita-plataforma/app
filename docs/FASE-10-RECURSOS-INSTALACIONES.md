# Fase 10 · Recursos, instalaciones y mantenimiento

Estado: **integrada en `main` (`fa6704c`) y migraciones aplicadas en producción**, el 20 de
septiembre de 2026. **Sin comprobar en pantalla todavía**: que el esquema esté aplicado y la
batería en verde dice que la base está bien, no que el módulo funcione.

Qué se acordó está en [CONTRATO-FASE-10.md](CONTRATO-FASE-10.md) (decisiones P-1 a P-21).
Este documento cuenta qué se ha construido, cómo se usa y qué límites tiene.

---

## 1. Lo que sostiene la fase

Una iglesia no puede reservar dos veces la misma sala. Eso suena obvio y es lo difícil:
dos personas pueden pulsar «Reservar» en el mismo segundo, y una comprobación de
disponibilidad seguida de una inserción no lo impide — entre las dos cabe la otra
transacción.

La protección vive en `resource_occupancy`, una tabla técnica que registra **toda**
ocupación real de un recurso, venga de una reserva confirmada o de un mantenimiento que
bloquea, y lleva una restricción de exclusión sobre `(recurso, rango)`:

```sql
constraint resource_occupancy_no_overlap exclude using gist (
  resource_id with =,
  during with &&
)
```

Es la primera restricción de exclusión del proyecto, así que antes de comprometerse a ella
se comprobó contra PostgreSQL real. Con dos transacciones abiertas a la vez sobre la misma
franja, la segunda **se bloquea** esperando a la primera y recibe `23P01` al desbloquearse.
Esa prueba vive en el repositorio y se ejecuta con `npm run test:concurrencia`.

Por qué una tabla aparte y no una restricción sobre cada tabla: dos restricciones separadas
no pueden verse entre sí, así que una reserva y un mantenimiento podrían cruzarse sobre el
mismo recurso sin que ninguna lo notara. Con una sola capa de ocupación, ese cruce es el
mismo conflicto que cualquier otro.

**El riesgo que eso trae**, anotado para quien venga después: si alguna ruta de escritura
futura no pasa por `app.occupy_resource`, rompe la garantía para todos los demás casos. Por
eso la escritura sobre reservas y mantenimientos está revocada y solo entra por RPC.

---

## 2. Migraciones

Diez, con prefijo posterior a `20261003001200`, el último que había en `main` al renumerarlas.

| Fichero | Qué trae |
|---|---|
| `20261004000400_facilities_esquema.sql` | `resources`, `resource_reservations`, `resource_maintenance` y `resource_occupancy`, con sus enums, índices y la restricción de exclusión |
| `20261004000401_capabilities_facilities.sql` | Las seis capacidades, su reparto por rol y `app.resource_cap` |
| `20261004000402_rls_facilities.sql` | RLS habilitada y forzada, escritura revocada, políticas de lectura y el grant por columnas de las notas de mantenimiento |
| `20261004000403_facilities_ocupacion.sql` | Adquirir, soltar y mover una franja, y la traducción del conflicto a un mensaje con sentido |
| `20261004000404_rpc_facilities_recursos.sql` | Alta, edición, archivado, restauración y borrado del catálogo |
| `20261004000405_rpc_facilities_reservas.sql` | Crear, editar, cancelar, aprobar y rechazar reservas |
| `20261004000406_rpc_facilities_mantenimiento.sql` | Programar, editar, cerrar y cancelar intervenciones |
| `20261004000407_facilities_activity_hooks.sql` | Reconciliación con Activity: cancelar, archivar y cambiar de hora |
| `20261004000408_facilities_hora_local.sql` | Entrada por hora local más zona, como en la Fase 4 |
| `20261004000409_avisos_facilities.sql` | Cuatro tipos de aviso, sus textos y su emisión |

---

## 3. Cómo se usa

**Dar de alta un recurso.** `/app/instalaciones` → «Nuevo recurso». Una sala admite aforo;
un equipo o un vehículo, no. El aforo **no** es la cantidad de unidades reservables: cada
unidad física es su propio recurso (`Cámara 1`, `Cámara 2`), porque «reservar 3 de 10» es un
problema distinto que esta fase no resuelve.

**Reservar.** Desde la portada del módulo, eligiendo recurso, horario y para qué. El
propósito es obligatorio: una reserva nunca es anónima. Si el recurso está cogido, el error
dice qué franja lo ocupa y a qué hora, pero nunca de qué va lo que la ocupa.

**Reservar para una actividad.** La reserva toma el horario de la actividad y no se le puede
cambiar por su cuenta: un solo horario, no dos que puedan divergir en silencio. Si la
actividad cambia de hora, la reserva se mueve con ella; si se cancela o se archiva, la
reserva se cancela y suelta la sala.

**Aprobación.** Un recurso puede exigirla. Entonces la reserva nace pendiente y **no ocupa
nada**: dos personas pueden pedir la misma franja, y el conflicto se decide al confirmar. La
segunda que se intente confirmar recibe el no y su reserva sigue pendiente, no en un estado
a medias.

**Mantenimiento.** Puede bloquear el recurso o ser solo una anotación en la agenda. Cuando
bloquea, compite por la franja igual que una reserva. Cerrarlo libera el recurso y conserva
la fila: la ventana deja de bloquear porque ya se hizo, no porque se borre el historial.

---

## 4. Permisos

| Capacidad | Para qué |
|---|---|
| `facilities.read` | Ver el catálogo y la disponibilidad |
| `facilities.manage_resources` | Crear, editar, archivar y restaurar recursos |
| `facilities.create_reservation` | Reservar |
| `facilities.manage_reservations` | Editar y cancelar reservas de otras personas |
| `facilities.approve_reservations` | Aprobar o rechazar lo que está pendiente |
| `facilities.manage_maintenance` | Programar, ejecutar y cancelar mantenimientos |

`ministry_leader` recibe solo las dos primeras de uso diario —consultar y reservar—: quien
coordina un área necesita saber si el auditorio está libre y cogerlo para su ensayo, no
administrar el catálogo ni aprobar lo que piden los demás. `member` solo consulta.

**Responsable de un recurso concreto**: no es un rol nuevo. Se concede
`facilities.manage_reservations` con `scope_type = 'resource'` sobre ese recurso, igual que
la Fase 7 hizo con los grupos. El valor `resource` ya estaba admitido desde la Fase 0.

---

## 5. Avisos

Cuatro, y solo cuatro: reserva aprobada, reserva rechazada (con el motivo), reserva
cancelada porque se canceló la actividad, y mantenimiento asignado.

**Crear una reserva no avisa.** Quien la pide ya sabe que la ha pedido, y llenar la bandeja
de confirmaciones de lo que uno acaba de hacer es la forma más rápida de que se deje de
leer. Hay una aserción que lo fija.

Los avisos dicen de qué recurso se trata y cuándo, pero **no arrastran el propósito de la
reserva ni el título de la actividad**. Saber que se canceló la reunión que ocupaba tu sala
no es lo mismo que saber de qué iba esa reunión.

El transporte externo sigue desactivado (D20 y D21): esto se queda en la bandeja de la
aplicación. Nada sale hacia nadie.

---

## 6. Pruebas

| Suite | Aserciones | Qué cubre |
|---|---|---|
| `fase10_reservas_test.sql` | 38 | Catálogo, reservar, adyacencia, editar, cancelar, aprobación y aislamiento entre iglesias |
| `fase10_mantenimiento_activity_test.sql` | 22 | Mantenimiento bloqueante, su cruce con reservas en las dos direcciones, y la reconciliación con Activity |
| `fase10_avisos_test.sql` | 14 | Quién recibe cada aviso, qué dice y qué no dice |
| `supabase/tests/concurrencia/reservas.mjs` | 11 comprobaciones | Transacciones **simultáneas**: dos reservas, dos aprobaciones y reserva contra mantenimiento |

La prueba de concurrencia va fuera de pgTAP porque una suite pgTAP corre en una sola sesión
y una sola transacción: puede enseñar que dos inserciones seguidas chocan, pero no que dos
transacciones abiertas a la vez no se cuelen las dos. Se ejecuta con
`npm run test:concurrencia` y añade `pg` como dependencia de desarrollo, la única de toda la
fase.

Batería completa con las diez fases conviviendo: **1449 aserciones, sin fallos**.
`tsc`, `lint` y `build` limpios.

---

## 7. Límites conocidos

- **Sin recurrencia propia.** Una reserva recurrente existe si la actividad es recurrente,
  porque la recurrencia vive en `activity_series`. El mantenimiento periódico se crea a
  mano, una intervención cada vez: automatizarlo sería un segundo motor de recurrencia y
  esta fase no lo construye.
- **Sin cantidades.** No hay «reservar 3 sillas de 10». Cada unidad física es un recurso, o
  se trata el conjunto como un recurso único (`Set de sillas del salón A`).
- **Sin buffers de montaje.** Dos usos consecutivos que se tocan en el minuto exacto son
  válidos. Si hiciera falta un margen, sería una decisión de producto nueva.
- **Sin calendario visual.** La disponibilidad se consulta en listas, no en una rejilla
  semanal. Es lo siguiente que pediría un uso real.
- **La Fase 5 sigue sin protección transaccional** en el solape de asignaciones: avisa del
  conflicto pero no lo impide a nivel de base. Se anota aquí como límite conocido suyo, no
  como algo que esta fase corrija.

---

## 8. Qué cambió fuera de la fase

- `src/server/activities/rpc.ts`: se añade `23P01` a la tabla de traducción de errores. Sin
  eso, un choque de reservas habría llegado como «No se pudo crear la reserva», perdiendo el
  mensaje que dice qué franja está ocupada, y se habría registrado como error inesperado. Es
  aditivo: ningún caso existente cambia.
- `package.json`: `pg` como dependencia de desarrollo y el script `test:concurrencia`.
- `src/lib/supabase/database.types.ts`: tipos regenerados desde el esquema completo.
