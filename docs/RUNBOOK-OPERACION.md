# Runbook de operación

Qué hacer cuando algo va mal en producción. No es una especificación: cada
procedimiento de aquí usa piezas que existen hoy en el código, y están comprobadas
contra el esquema real.

Lo que **no** cubre, porque no existe todavía, está en §8. No se describe un
procedimiento que nadie puede ejecutar.

Complementa [17-seguridad-operacion.md](17-seguridad-operacion.md), que dice qué debería
haber; esto dice qué hay y cómo se usa.

---

## 1. Los tres procesos periódicos

Están en [vercel.json](../vercel.json) y se ejecutan una vez al día. Esa cadencia viene
del plan de Vercel en uso, no de una decisión de producto: **una comunicación programada
para una hora concreta puede esperar hasta la siguiente pasada**.

| Tarea | Ruta | Hora (UTC) | Qué hace |
|---|---|---|---|
| Retención | `/api/tareas/retencion` | 03:00 | Borra iglesias archivadas hace más de 30 días y vacía su almacenamiento |
| Avisos | `/api/tareas/avisos` | 07:00 | Convierte eventos de notificación en avisos |
| Comunicaciones | `/api/tareas/comunicaciones` | 08:00 | Materializa las programadas y envía por lotes |

Las tres exigen `Authorization: Bearer $CRON_SECRET` y devuelven 401 sin él. Aceptan GET
(lo que usa Vercel) y POST (para una llamada manual).

Para lanzar una a mano:

```bash
curl -X POST https://<dominio>/api/tareas/comunicaciones \
  -H "Authorization: Bearer $CRON_SECRET"
```

`CRON_SECRET` se lee del entorno de Vercel. No lo copies a un fichero, a un tíquet ni a
un mensaje: si necesitas verlo, míralo en el panel y no lo pegues en ningún sitio.

Respuesta normal de comunicaciones:

```json
{"ok": true, "materialized": 2, "sent": 340, "failedToProcess": 0, "retryable": 0}
```

---

## 2. Una comunicación no sale

### 2.1 Mirar en qué estado está

```sql
select id, title, status, scheduled_at, processing_error
from communications
where church_id = '<iglesia>'
order by created_at desc
limit 20;
```

Los estados y lo que significan:

| Estado | Qué pasa | Qué hacer |
|---|---|---|
| `draft` | Nadie la ha programado | Nada, falta programarla |
| `scheduled` | Espera a que llegue su hora, o a la próxima pasada del cron | Esperar, o lanzar el cron a mano (§1) |
| `processing` | Se están calculando los destinatarios | Esperar a la pasada siguiente |
| `queued` | Tiene destinatarios y se está enviando por lotes | Esperar; con miles de destinatarios tarda varias pasadas |
| `sent` | Terminada | — |
| `partially_sent` | Unos destinatarios sí y otros no | Mirar `notification_deliveries` (§2.3) |
| `failed_to_process` | **No se pudo preparar**; el motivo está en `processing_error` | §2.2 |
| `cancelled` | Alguien la canceló | — |

### 2.2 Está en `failed_to_process`

Significa que al calcular los destinatarios algo falló de forma que no se va a arreglar
solo: normalmente un `segment_rules_snapshot` que referencia un campo que ya no existe.
La comunicación **no se ha enviado a nadie** y ya no está en la cola, así que no bloquea
a las demás. Esto es deliberado: antes de `20261004000412`, una sola comunicación rota
detenía la pasada entera y ninguna de las siguientes salía, en ninguna ejecución.

**Se resuelve desde la aplicación, no desde la base.** La ficha de la comunicación en
`/app/comunicacion/<id>` muestra el motivo del fallo y un botón «Devolver a borrador para
corregirla», visible para quien tenga `communications.schedule`. Eso la deja en `draft` y
limpia el motivo; después hay que corregir la audiencia y volver a programarla.

**No la reprogrames sin corregir la segmentación**: acabaría en el mismo estado.

Si necesitas ver el motivo desde la base, por ejemplo para varias a la vez:

```sql
select id, title, processing_error
from communications
where status = 'failed_to_process';
```

La función `app.reset_failed_communication` **no se puede ejecutar desde el panel de
Supabase**: resuelve la iglesia a partir de la sesión y comprueba la capacidad, así que
sin una sesión de usuario responde «La comunicación no existe». Es deliberado —recuperar
una comunicación es una acción del tenant, con su registro en auditoría—, y por eso la
vía es la interfaz.

### 2.3 Está en `partially_sent`

Unos destinatarios recibieron y otros no. Para ver quiénes:

```sql
select status, count(*)
from notification_deliveries
where communication_id = '<id>'
group by status;
```

Esta tabla no la lee nadie desde la aplicación —contiene destinatarios y contenido—, así
que esta consulta hay que hacerla desde el panel de Supabase con una cuenta que tenga
acceso, dejando constancia de por qué.

---

## 3. La cola de comunicaciones parece atascada

Comprobar qué hay vencido y sin procesar:

```sql
select count(*) from app.due_scheduled_communications(100);
```

Si devuelve un número que no baja entre pasadas del cron, hay dos causas posibles:

1. **El cron no se está ejecutando.** Mirar los registros de la función en Vercel. Un
   401 repetido significa que `CRON_SECRET` no coincide entre la configuración del cron
   y la variable de entorno.
2. **Hay más comunicaciones vencidas que el límite por pasada.** El runner procesa como
   mucho 5 por ejecución (`DUE_LIMIT` en
   [runner.ts](../src/server/communications/runner.ts)) y envía en lotes de 500. Con una
   acumulación grande, lanzar el cron a mano varias veces seguidas la vacía.

Lo que **ya no puede pasar** es que una fila corrupta lo pare todo: cada comunicación se
intenta por separado y la que falla se marca. Comprobado en `npm run test:jobs` §4.

---

## 4. Los avisos no llegan

Primero, lo que hay que saber antes de investigar: **el correo y el push están
desactivados**. Los avisos se ven dentro de la aplicación y en ningún otro sitio. Si
alguien dice que «no le llega el correo», no es un fallo: no hay correo.

Eventos pendientes de convertirse en avisos:

```sql
select count(*) from notification_events where processed_at is null;
```

Si ese número no baja, el cron de avisos no está corriendo. Se puede forzar una pasada:

```sql
select app.process_notification_events(100);
```

Es seguro repetirla: procesar dos veces no duplica avisos, y si el proceso muere a media
pasada los eventos vuelven a quedar pendientes sin dejar avisos a medias. Las dos cosas
están comprobadas en `npm run test:jobs` §1 y §3.

---

## 5. El directorio va lento

Lo primero es descartar lo conocido antes de buscar causas nuevas.

**Si acaba de importarse un padrón grande**: no debería pasar, pero si pasa, mira que los
índices de búsqueda sigan con su opción puesta.

```sql
select c.relname, c.reloptions
from pg_class c
join pg_am am on am.oid = c.relam and am.amname = 'gin'
where c.relname like 'people_%trgm%';
```

Todos deben decir `{fastupdate=off}`. Si alguno no lo tiene, la búsqueda se vuelve cien
veces más lenta hasta que pase autovacuum y luego se arregla sola, que es justo lo que
hace el síntoma difícil de reproducir. El porqué está en `20261004000413`.

**Si el listado tarda pero la búsqueda no**, mira el plan:

```sql
explain (analyze)
select cp.id from church_people cp join people p on p.id = cp.person_id
where cp.church_id = '<iglesia>' and cp.archived_at is null
order by cp.joined_at desc limit 25;
```

Debe usar `church_people_church_joined_idx`. Si aparece un `Seq Scan` sobre
`church_people`, el índice se ha perdido o las estadísticas están mal; `analyze
church_people` es lo primero que hay que probar.

**El recuento del listado tarda ~130 ms con 50.000 personas y eso es lo esperado**: ningún
índice lo arregla porque cuenta todas las filas. Está explicado en
[FASE-13-OPERACION-ESCALA.md](FASE-13-OPERACION-ESCALA.md) §6.

---

## 6. Una iglesia se ha borrado, o no se ha borrado

Desde la Fase 13, una iglesia archivada se borra sola a los 30 días. **El borrado es real y
no se puede deshacer**: las 107 tablas con clave foránea a `churches` se vacían en cascada.

**Para ver qué se borrará antes de que ocurra**, sin borrar nada:

```sql
select * from app.churches_due_for_purge(30);
```

Devuelve cada iglesia con los días que lleva archivada, cuántas personas y cuántos ficheros
tiene. Si algo aparece ahí y no debería, la forma de salvarlo es sacarlo del estado
`archived` antes de las 03:00.

**Para saber qué se borró:**

```sql
select created_at, metadata
from platform_audit_logs
where action = 'church.purged'
order by created_at desc;
```

La traza sobrevive al borrado, con el nombre de la iglesia, cuándo se archivó y cuántos
ficheros se encolaron. El `church_id` queda a null: la iglesia ya no existe.

**Si quedan ficheros sin borrar del almacenamiento:**

```sql
select bucket, attempts, last_error, count(*)
from storage_deletion_queue
where deleted_at is null
group by bucket, attempts, last_error;
```

A los 5 intentos fallidos un objeto deja de reintentarse, para que un bucket que ya no
existe no llene los registros cada noche. Si hay filas ahí con `attempts = 5`, el
almacenamiento conserva ficheros de una iglesia ya borrada y hay que resolverlo a mano.

**Lo que no puede pasar y conviene saber por qué**: las filas de esta cola no desaparecen
al borrar la iglesia. No tienen clave foránea a `churches` a propósito, porque la cascada
se las llevaría justo cuando hacen falta, y el borrado parecería correcto mientras las
fotos de menores siguen en el bucket. El invariante 11 lo vigila.

---

## 7. Antes de aplicar una migración

Dos reglas que salieron de incidentes reales, no de la teoría:

1. **Una migración que quita permisos no puede ir por delante del despliegue.** Aplicar
   primero la migración y después el código deja un hueco en el que la aplicación pide
   algo que ya no puede. Pasó con R-01: la ficha de persona devolvió 404 en producción
   durante unos minutos.
2. **Comprobar que el prefijo no colisiona.** La CLI de Supabase indexa por el prefijo
   numérico, no por el nombre: dos migraciones con el mismo prefijo hacen que una no se
   ejecute **sin dar ningún error**. `scripts/renumerar-migraciones.mjs` renumera una rama
   entera y CI comprueba que no haya repetidos, pero conviene mirarlo antes de subir.

---

## 8. Lo que este runbook no puede cubrir

No se describe aquí porque no existe todavía. Decir cómo se haría algo que nadie puede
ejecutar convierte un runbook en un documento de intenciones.

- **Restaurar un backup.** Hay copias configuradas en Supabase, pero nunca se ha
  ensayado una restauración, así que no se puede afirmar que el sistema sea recuperable.
  Hace falta un entorno aislado donde probarlo y autorización para hacerlo.
- **Alertas.** No hay proveedor de observabilidad. Hoy, enterarse de que el cron falla
  exige mirar los registros de Vercel a mano.
- **Notificaciones externas.** Email y push están desactivados en el código. Cuando se
  activen, este runbook necesita una sección para rebotes y bajas.
- **Incidencias de cobro.** Sin credenciales de sandbox no se ha probado nada de
  facturación.

---

## 9. Qué mirar cuando no se sabe qué pasa

En orden, de lo más probable a lo menos:

1. Los registros de las funciones en Vercel, filtrando por la ruta del cron.
2. `select status, count(*) from communications group by status` — si hay muchas en
   `failed_to_process`, algo sistemático rompió la segmentación.
3. `select count(*) from notification_events where processed_at is null` — si crece sin
   parar, el cron de avisos no corre.
4. Las tablas de auditoría: `select * from audit_logs order by created_at desc limit 50`.

Y antes de tocar nada en producción: **no hay entorno de preproducción con datos
realistas**. Cualquier prueba destructiva va contra los datos de iglesias reales. Si hay
que reproducir algo, se hace en local con el arnés de pruebas
(`supabase/tests/`), no en producción.
