# Fase 13 · Endurecimiento, operación y escala

Rama `feature/diogo-fase-13-operacion-escala`, sobre `origin/main` = `612160c`.

```
FASE 13: PARCIAL
```

No está cerrada, y el motivo no es deuda menor: tres criterios de cierre exigen un entorno
al que no tengo acceso. Están en §7, con lo que haría falta para levantarlos.

Lo que sí se ha hecho está comprobado contra el esquema y el código reales, no contra la
documentación, y cada comprobación es repetible.

---

## 1. Matriz de cierre

| Requisito | Qué había | Evidencia | Estado |
|---|---|---|---|
| RLS en tablas tenant | Habilitada y forzada en todas | `invariantes_aislamiento_test.sql` §1 | **Cumple** |
| `search_path` en funciones definer | Fijado en todas | Invariantes §2 | **Cumple** |
| Superficie anónima acotada | 5 funciones públicas declaradas | Invariantes §3 | **Cumple** |
| Alta de personas | Admitía identidades ajenas | Corregido en `20261004000410`; invariantes §6 | **Corregido** |
| Escritura anónima en tablas | 43 tablas con grants heredados | Corregido en `20261004000411`; invariantes §9 | **Corregido** |
| Claves foráneas tenant-safe | Dos cruzaban tenants | Corregido en `20261004000411`; invariantes §7 | **Corregido** |
| Aislamiento entre iglesias | Correcto | Prueba manual con miembro raso: no ve otra iglesia, no vincula personas, no crea eventos, no borra actividades | **Cumple** |
| Tokens: un solo uso | Correcto | `npm run test:tokens` | **Cumple** |
| Tokens: caducidad y revocación | Correctas | `npm run test:tokens` | **Cumple** |
| Tokens: almacenamiento | Solo huella, 256 bits | `npm run test:tokens` | **Cumple** |
| Avisos: idempotencia | Correcta | `npm run test:jobs` §1 | **Cumple** |
| Avisos: concurrencia | `for update skip locked` | `npm run test:jobs` §2 | **Cumple** |
| Avisos: proceso caído | Se recupera sin dejar nada a medias | `npm run test:jobs` §3 | **Cumple** |
| Cola de comunicaciones | Una fila corrupta la atascaba **para siempre** | Corregido en `20261004000412`; `npm run test:jobs` §4 | **Corregido** |
| Rate limits públicos | Solo en inscripción y contacto | §6, deuda registrada | **Deuda** |
| Backups y restauración | Sin verificar | §7 | **Bloqueado** |
| Alertas | Sin proveedor | §7 | **Bloqueado** |
| Piloto con dos iglesias | Sin autorización | §7 | **Bloqueado** |
| Índices duplicados | Ocho, en siete fases distintas | Corregido en `20261004000414`; invariantes §10 | **Corregido** |
| Rendimiento con volumen | Cinco recorridos del directorio entre 96 y 179 ms | Corregido en `20261004000413`; `npm run test:rendimiento`; §4 | **Medido** |

---

## 2. Hallazgos corregidos

### 2.1 El alta de personas admitía identidades ajenas

`people_insert` estaba declarada `with check (true)`: cualquier cuenta autenticada podía
insertar filas en `people`, **incluidas filas con el `user_id` de otra cuenta**. La víctima
acabaría con dos identidades, una creada por un tercero, y `app.current_person_ids()`
resuelve por `user_id`.

**Lo que no permitía**, y conviene decirlo para no exagerar el hallazgo: vincular esa fila a
una iglesia falla con `42501`, porque `church_people` exige `people.manage`. La premisa con
la que se escribió la política en la Fase 2 —«la fila es inerte hasta vincularse»— se
sostenía. Lo comprobé, y de hecho mi primera prueba dijo lo contrario por un error de método:
un `insert ... select` cuyo origen RLS oculta inserta cero filas sin fallar, y leí eso como
éxito. La segunda versión verifica que la fila exista después.

Corregido: una persona nace sin cuenta o con la de quien la crea.

### 2.2 Escritura anónima heredada en 43 tablas

Supabase concede privilegios por defecto sobre `public` a `anon` y `authenticated`; cada
migración debe revocarlos y en 43 tablas no se hizo, incluidas `roles`, `role_capabilities`,
`subscriptions` y `platform_operators`.

**No era explotable**: todas tienen RLS habilitada y forzada, comprobado tabla por tabla. Pero
dejaba la protección en una sola capa. Revocado, y cambiados los privilegios por defecto para
que las tablas nuevas no lo hereden.

### 2.3 Dos claves foráneas cruzaban tenants

`activity_position_requirements.source_requirement_id` y `audit_logs.support_session_id`
podían apuntar a filas de otra iglesia (ADR 0014). Ahora son compuestas con `church_id`.

### 2.4 Una comunicación corrupta atascaba la cola

El fallo operativo más serio de los encontrados. El runner recorría las comunicaciones
vencidas y **lanzaba al primer error**: con una fila cuyo snapshot de segmentación fuera
inválido, ninguna de las siguientes se procesaba, en ninguna ejecución, para siempre. El cron
devolvía error y al día siguiente repetía lo mismo.

Reproducido con dos comunicaciones en cola: se procesaban **cero**.

Corregido con tres piezas: un estado `failed_to_process` con su motivo, una función que
distingue lo reintentable —bloqueos, interbloqueos— de lo que no se va a arreglar solo, y una
forma de devolver la comunicación a borrador para corregirla. No se descarta nada en
silencio.

**La primera versión de este arreglo estaba a medias, y la encontré al escribir el
runbook.** Iba a documentar «ejecuta `app.reset_failed_communication` desde el panel de
Supabase» y fui a comprobarlo antes de escribirlo: la función resuelve la iglesia por la
sesión y exige `communications.schedule`, así que sin sesión responde «La comunicación no
existe». Y no había ninguna interfaz que la llamara. Es decir: había construido el estado
nuevo y la función de recuperación, pero una comunicación marcada se quedaba ahí para
siempre.

Peor: `COMMUNICATION_STATUSES` está escrita a mano en el servicio, así que añadir el valor
al enum de la base no rompió la compilación. La ficha habría pintado `undefined` como
etiqueta de estado, y el listado también.

Cerrado del todo:

- El estado está en el tipo, con su etiqueta en la ficha y en el listado.
- El listado pasa de `Record<string, string>` a `Record<CommunicationStatus, string>`, para
  que el próximo estado nuevo rompa la compilación en vez de pintar `undefined`.
- La ficha muestra el motivo del fallo y un botón para devolverla a borrador.
- Los tipos de la base estaban sin regenerar desde `20261004000412`; regenerados.
- `npm run test:jobs` §5 comprueba que quien tiene permiso la recupera, que vuelve a
  `draft` con el motivo limpio, y que **sin sesión no se puede**: eso último es lo que
  impide saltarse el permiso y la auditoría tocando la base a mano.

### 2.5 Ocho índices duplicaban exactamente a otro

Una restricción `unique` crea su propio índice. En ocho sitios se había declarado
además un índice normal sobre las mismas columnas, así que quedaban dos estructuras
idénticas: las dos se mantienen en cada escritura, las dos ocupan espacio y el
planificador solo puede usar una.

Estaban repartidos por siete fases sin relación entre ellas —`churches`, `people`,
`subscriptions`, `church_onboarding`, `events`, `registrations`, `kids_profiles` y
`worship_repertoire_songs`—, lo que dice que es un descuido fácil de cometer: quien
escribe el índice piensa en la consulta y quien escribe la restricción piensa en la
integridad, y nadie ve que la segunda ya trae el primero.

**Uno era mío**: en `20261004000411` añadí `support_sessions_id_church_unique` sin ver
que `support_sessions_id_unique` ya cubría `(id, church_id)` desde la Fase 1 —el nombre
no lo deja ver—. Retirado de esa migración.

Retirados en `20261004000414`, con un invariante nuevo para que la novena vez falle en
CI. Comprobé que el invariante detecta un duplicado real y que no marca un índice
parcial sobre la misma columna, que no es lo mismo y sí tiene sentido.

---

## 3. Lo que se comprobó y estaba bien

Merece el mismo espacio que lo que falló, porque saber que algo aguanta también es resultado:

- **Aislamiento entre iglesias**: un miembro con el rol más bajo no ve otra iglesia, no
  vincula personas, no crea eventos y no borra actividades. Comprobado con intentos reales,
  verificando que la fila no existiera después.
- **Tokens de invitación**: 256 bits, guardados solo como huella, un solo uso, caducidad y
  revocación respetadas.
- **Motor de avisos**: repetir una pasada no duplica; dos ejecuciones simultáneas no se pisan
  gracias a `for update skip locked`; un proceso que muere a media pasada deja los eventos
  pendientes, sin avisos a medias, y la siguiente los recupera.

---

## 4. Rendimiento con volumen

Sembré 100.000 personas (50.000 por iglesia, dos iglesias para que el filtro por
tenant tenga algo que descartar) y 2.000 actividades, y miré los planes de ejecución
reales con `explain (analyze)`.

**El primer intento midió lo que no era.** Escribí las consultas a mano suponiendo que
el directorio ordenaba por apellido, encontré un recorrido secuencial, probé un índice
y bajó de 140 ms a 0,3 ms. Un resultado excelente sobre una consulta que la aplicación
nunca ejecuta: `listPeople` ordena por `joined_at desc`, pide `count:exact` y busca con
cinco `ilike` independientes. Rehice la medición reconstruyendo lo que PostgREST genera
a partir de `src/server/people/people-service.ts`. Ese índice se descartó.

Con los recorridos correctos, ninguno bajaba de 88 ms:

| Recorrido | Antes | Después |
|---|---:|---:|
| Página 1 del directorio | 95,7 ms | **0,2 ms** |
| Página 41 (desplazamiento 1.000) | 111,4 ms | **4,6 ms** |
| Filtro por vínculo | 99,9 ms | **0,2 ms** |
| Búsqueda por nombre o contacto | 179,3 ms | **5,6 ms** |
| Recuento exacto del listado | 135,3 ms | 133,7 ms |
| Calendario: actividades de un mes | 0,1 ms | 0,1 ms |

Seis índices en `20261004000413`: uno parcial sobre `church_people (church_id, joined_at desc)`
para el orden y los filtros, y cinco de trigramas sobre las columnas que busca el
directorio. El índice de trigramas que existía desde la Fase 2 no servía: está sobre la
concatenación de los tres nombres, así que solo lo aprovecharía una consulta escrita
contra esa misma expresión, y ninguna lo está.

**Coste**: 12 MB de índices sobre 29 MB de tablas. La diferencia en escritura está por
debajo del ruido: 2.000 altas tardaron 756 ms sin los índices y 735 ms con ellos, y la
variación entre pasadas es mayor que esa diferencia.

**Comprobado también el caso contrario**, porque un índice puede ser una trampa para el
tenant pequeño: con una iglesia de 40 personas dentro de la misma base de 100.000, el
planificador sigue eligiendo el camino corto y responde en 0,3 ms. No se degrada.

### El buscador iba bien o mal según cuándo hubiera pasado autovacuum

Al ejecutar la prueba desde cero, la búsqueda volvió a tardar 97 ms y a recorrer `people`
entera, con los índices puestos. La misma consulta, medida unos minutos más tarde, tardaba
2,6 ms y usaba el índice. La diferencia no estaba en los datos sino en el momento.

Un índice GIN acumula lo recién insertado en una lista sin ordenar y la consolida más
tarde, en un `vacuum`. Mientras esa lista está llena, el planificador descarta el índice.
Reproducido a propósito: importar 10.000 personas y buscar acto seguido daba 104 ms; con un
`vacuum analyze` por medio, la misma búsqueda daba 2,3 ms.

No es una curiosidad de laboratorio, porque el proyecto importa padrones enteros
(`src/server/people/import-service.ts`). Sin arreglarlo, tras cada importación el buscador
del directorio iría cien veces más lento durante un rato que nadie controla —el que tarde
autovacuum— y luego se arreglaría solo: la clase de fallo que no se reproduce cuando
alguien lo reporta.

Los cinco índices llevan `fastupdate = off`. Lo que cuesta, medido:

| | Antes | Después |
|---|---:|---:|
| Alta de una persona | 1,89 ms | 2,13 ms |
| Importar 10.000 personas | 2,8 s | 18 s |
| Búsqueda tras esa importación | 104 ms | **2,7 ms, y ya siempre** |

El alta individual es la operación frecuente y +0,24 ms no se nota dentro de una petición
HTTP. La importación masiva es un episodio de puesta en marcha, asíncrono, donde 18
segundos no molestan a nadie. La prueba de rendimiento incluye esa comprobación, así que si
alguien añade un índice GIN sobre `people` y olvida la opción, se ve.

**Lo que esto no demuestra.** Es una medición local, con datos sintéticos, sin
concurrencia, sin la latencia de red de Supabase y sin RLS activa en el plan medido.
Acredita que estos planes dejan de recorrer tablas enteras. No acredita capacidad de
escala, y no lo voy a presentar como tal. Los objetivos de rendimiento siguen sin
acordarse (§8).

---

## 5. Lo que queda ejecutable

Además, [RUNBOOK-OPERACION.md](RUNBOOK-OPERACION.md) recoge qué hacer cuando algo falla en
producción, con los procedimientos comprobados contra el código real.

| Comando | Qué comprueba |
|---|---|
| `supabase test db` | Toda la batería, con `invariantes_aislamiento_test.sql` dentro |
| `npm run test:jobs` | Idempotencia, concurrencia, caída del proceso, cola atascada y recuperación |
| `npm run test:tokens` | Ciclo de vida de las invitaciones |
| `npm run test:concurrencia` | Doble reserva de recursos (Fase 10) |
| `npm run test:rendimiento` | Que ningún recorrido del directorio recorra las tablas enteras |

`invariantes_aislamiento_test.sql` (10 aserciones) es lo que convierte esta auditoría en algo que no caduca:
si alguien añade una tabla sin RLS, una función definer sin `search_path` o una política
`with check (true)`, falla en CI en vez de esperar a la siguiente revisión.

---

## 6. Deuda registrada, no crítica

**Sin límite de tasa en las superficies públicas de token** (`unsubscribe_by_token`,
`cancel_registration_by_token`, `accept_invitation`) ni en `public_event_by_slug`.

No es un riesgo de acceso: los tokens son de 256 bits y la fuerza bruta es inviable. Es un
riesgo de **coste**: nada impide lanzar muchas peticiones y hacer trabajar a la base. No se
ha construido un limitador porque haría falta una identidad de cliente que la base no tiene
—la IP no llega hasta ahí— y un límite global sería, él mismo, una forma de denegación de
servicio: bastaría con saturarlo para impedir que nadie acepte una invitación.

Lo razonable cuando se aborde: limitar en el borde (Vercel o el proxy), no en la base.

**El recuento exacto del directorio cuesta 134 ms con 50.000 personas** y ningún índice
lo arregla: el trabajo es recorrer el resultado, no encontrarlo. `listPeople` pide
`count:exact`, que además arrastra el join a `people` impuesto por el `!inner` del select.
Ese join es redundante para contar —la clave foránea garantiza que toda pertenencia tiene
su persona— y quitarlo bajaría el recuento a unos 12 ms.

No se ha tocado porque no es un cambio de esquema sino de consulta, y porque `people`
tiene RLS propia: contar sin el join cambiaría el resultado si alguna política llegara a
ocultar personas de la propia iglesia. Cuando se aborde, hay que medir ambas cifras sobre
la misma iglesia antes de cambiar nada.

**Una cuenta puede crear filas sueltas ilimitadas en `people`.** Inertes y no vinculables,
pero ruido en la tabla central. RLS no es el sitio para un límite de frecuencia.

---

## 7. Bloqueado: qué falta y qué haría falta

### Restauración de backup

**No verificado.** Un backup configurado sin restauración probada no acredita recuperabilidad,
y no tengo acceso al panel de Supabase para ejecutar una.

Para levantarlo hace falta: acceso al proyecto, un entorno aislado donde restaurar y
autorización para hacerlo. Con eso, el ensayo consistiría en restaurar una copia, comprobar
integridad referencial, que los ficheros sigan accesibles y que la aplicación arranque contra
ella.

### Alertas

**No verificadas.** No hay proveedor de observabilidad configurado. Se puede instrumentar y
definir condiciones, pero no puedo probar que una alerta llegue a nadie, y una alerta que no
se ha visto llegar no es una alerta.

### Piloto con dos iglesias

**No realizado.** Exige usuarios reales y autorización expresa. El encargo prohíbe contactar
a terceros automáticamente, y no se ha hecho.

### Rendimiento con volumen

Ya no está bloqueado: se ha medido y corregido lo que se podía medir en local (§4). Lo que
sigue sin existir es un **objetivo acordado**, y sin él no hay criterio de cumplimiento.
Propuesta, ahora con datos para sostenerla: que el directorio y el calendario respondan por
debajo de 300 ms de extremo a extremo con 5.000 personas por iglesia. Los planes medidos
dejan margen de sobra para ese número; lo que falta por medir es la parte que no está en la
base (red, render, sesión).

---

## 8. Decisiones pendientes de Carlos

1. **MFA para operadores de plataforma**: el encargo pide acordarlo si no está definido. Hoy
   el panel protege con sesión más capacidad.
2. **Objetivos de rendimiento**: §4 tiene la medición y §7 la propuesta concreta.
3. **Política de retención y borrado** tras una baja: sin ella no se puede validar el
   comportamiento de conservación y eliminación de datos.

---

## 9. Qué NO se ha tocado

- Billing: sin credenciales de sandbox no se prueba, y no se hacen cargos reales.
- Impersonación y soporte: existe `support_sessions` en el esquema; no se ha ampliado.
- Email y push: siguen desactivados. Nada aquí sugiere lo contrario.
