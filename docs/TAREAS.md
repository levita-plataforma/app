# Backlog histórico del producto

> **HISTÓRICO:** este backlog conserva decisiones y estado de trabajos anteriores. El **ROADMAP VIGENTE** es `docs/13-plan-por-fases.md`; cuando exista conflicto, prevalece la documentación integral revisada el 15/09/2026.

> **Revisión del 15 de septiembre de 2026:** se conserva el historial y sus
> casillas; no acredita implementación en este checkout. El producto se ha
> localizado en `Documents/Levitaapp` y la app de Alabanza en `Documents/Calserv`.
> El [plan vigente por fases](13-plan-por-fases.md) incorpora las aclaraciones
> del promotor: cada iglesia es un tenant, alta asistida o registro con cuota,
> base de áreas editable y ampliable, y toda la UI/UX heredada de Alabanza para
> integrarla. El pago ya no se aplaza a fase 4. El texto antiguo sobre sustituir
> Calserv se revisa como integración, no como orden de rehacer la app.
> Ver [índice](README.md) y [referencia de integración](14-referencia-uiux-alabanza.md).

## Orden de ejecución conservado como historial
Orden de ejecución. Cada tarea tiene criterios de aceptación verificables; no la
des por terminada sin cumplirlos todos.

**Antes de cada commit:** `npm test`, `./scripts/verify-rls.sh` y
`psql -f scripts/flow-check.sql` en verde.

---

## Bloque A0 · Esquema que falta, según el análisis de áreas

Sale de comparar las doce fichas de `docs/areas/`. Va antes que las pantallas:
son columnas y tablas, y rehacer una pantalla porque falta una columna es caro.
El SQL completo está en `docs/areas/00-indice.md`.

### A0.1 · Hora de llegada por puesto (R1)
- [x] `positions.call_offset_min` y `event_positions.call_offset_min`
- [x] Los recordatorios se calculan sobre la hora de llegada, no la del evento
- [x] Test: el técnico de sonido con 90 min de antelación recibe el aviso de
      «tienes que estar allí en 2 horas» 90 minutos antes que el ujier del
      mismo culto

Hecho el 2026-09-14 en `20260914000100_llegada_por_puesto.sql`. Las tres suites
pasan en CI. Controles negativos:
- `horaDeLlegada()` ignorando la antelación → `npm test` en rojo (24/25).
- El aviso de 2 h contando desde el evento → `flow-check.sql` en rojo en CI.
- Política abierta de `update` en `positions` → `verify-rls.sh` en rojo en CI.

### A0.2 · Nivel de cualificación (R2)
- [x] `member_positions.level` con `aprendiz` / `autonomo` / `forma_a_otros`
- [x] `positions.requiere_autonomo`
- [x] `packages/core` valida que un turno con `requiere_autonomo` tenga al menos
      un autónomo propuesto o aceptado. Decisión del 2026-09-14: al publicar
      cuentan las asignaciones pendientes y aceptadas, porque en un borrador
      nadie ha podido aceptar todavía; un turno vacío no bloquea
- [x] Test: un turno de sonido con solo un aprendiz no se puede publicar

Hecho el 2026-09-14 en `20260914000200_nivel_cualificacion.sql`. Controles negativos:
- `esAutonomo()` aceptando al aprendiz → `npm test` en rojo (27/30).
- Política abierta de `update` en `member_positions` → `verify-rls.sh` en rojo:
  `FALLO → una aprendiz se subió a autónoma a sí misma`.

### A0.3 · Criticidad del puesto (R5)
- [x] `positions.criticality` con `critica` / `importante` / `flexible`
- [x] Dirige cuándo se avisa al líder de un hueco y cómo se pinta en el panel
- [x] Test: un rechazo en un puesto crítico encola aviso al líder de inmediato;
      en uno flexible, no

Hecho el 2026-09-14 en `20260914000300_criticidad.sql`. Controles negativos:
- `avisarAlLiderAlRechazar()` sin mirar la criticidad → `npm test` en rojo (32/33).
- Aviso inmediato también en flexibles → `flow-check.sql` en rojo:
  `FALLO → un rechazo de ujier (flexible) generó 1 avisos al líder`.
- Aviso inmediato desactivado → `flow-check.sql` en rojo:
  `FALLO → un rechazo en sonido (crítico) debía avisar ya al líder; avisos: 0`.

Los controles de A0.2 y A0.3 se hicieron en local (PostgreSQL 18.4 sin `psql`,
con un ejecutor de Node); la referencia final sigue siendo el CI con Postgres 16.

Decisiones del 2026-09-14:
- **Crítico:** el aviso sale al rechazar o retirar a alguien, solo en un culto
  publicado y solo si el turno queda por debajo de lo que hace falta. Va a los
  líderes del área; si no queda ningún otro líder, a owner y admin. Nunca a
  quien acaba de rechazar.
- **Importante:** «si sigue sin cubrir el viernes» es la tarea E3.
- **Flexible:** nunca aviso inmediato.
- `escaladoDeHueco()` en `packages/core` dice cuándo avisar y qué pintar en
  rojo; el panel la usará en C5.

### A0.4 · Reglas de composición (R4)
- [x] `positions.min_personas`
- [x] Validación en `packages/core`: no se publica un evento con un turno que
      incumpla su mínimo
- [x] Test: un turno de niños con una sola persona propuesta o aceptada bloquea la
      publicación con un mensaje que explica por qué

Hecho el 2026-09-14 en `20260914000400_min_personas.sql`. Control negativo:
- La comprobación del mínimo desactivada en `validarPublicacion()` → `npm test`
  en rojo (34/37).
- La comprobación de aislamiento nueva (una servidora no rebaja el mínimo)
  comparte política con las demás de `positions`; su rotura, una política
  abierta de `update`, ya se probó en rojo en A0.1, y la suite para en la
  primera comprobación de esa tabla.

Decisiones del 2026-09-14:
- Mismo criterio que A0.2: cuentan las asignaciones pendientes y aceptadas, y
  un turno vacío es un hueco normal que no bloquea.
- `validarPublicacion()` devuelve todos los problemas de cada turno (mínimo y
  autónomo a la vez), para que el diálogo de publicación bloqueada los enseñe todos.
- `no_mismo_hogar` (R4) queda fuera: la ficha lo marca como preferible y no hay
  modelo de hogares.
- La regla vive en `packages/core`. Quien tenga permiso para actualizar
  `events.status` directamente se la puede saltar; blindarla con un trigger
  `before update` es la opción que deja abierta `02-datos-y-rls.md`.

### A0.5 · Credenciales con caducidad (R3) — LOPIVI
Requisito legal, no una función. Ver `docs/areas/06-ninos.md`.

- [x] Tablas `ministry_requirements` y `person_credentials`
- [x] RLS: solo owner y admin leen y escriben credenciales; el interesado ve la
      suya; **nadie más**
- [x] Asignar a alguien sin credencial bloqueante en vigor **falla**, con un
      mensaje que dice qué falta y cómo conseguirlo
- [x] Aviso al líder 60 días antes de cada caducidad
- [x] **No se guarda el documento**: solo tipo, fechas y quién lo verificó
- [x] Test: persona sin certificado → asignación rechazada; con certificado
      caducado ayer → también
- [x] Test de aislamiento: **un líder de área no puede leer `person_credentials`
      de nadie**, ni siquiera de su propia área

Hecho el 2026-09-14 en `20260914000500_credenciales.sql`. Controles negativos:
- Política abierta de lectura en `person_credentials` → `verify-rls.sh` en rojo:
  `FALLO DE AISLAMIENTO → un líder de área no lee credenciales de nadie, ni de su propia área`.
- `credencialEnVigor()` ignorando la caducidad → `npm test` en rojo (40/41).
- El trigger de asignación sin comprobar nada → `flow-check.sql` en rojo:
  `FALLO → se asignó a Niños a alguien sin certificado`.
- El aviso a 30 días en vez de 60 → `flow-check.sql` en rojo:
  `FALLO → esperaba 2 avisos de caducidad a 60 días (persona y líder), hay 0`.

Decisiones del 2026-09-14:
- **El bloqueo va en la base de datos.** Asignar es un `insert` directo desde
  supabase-js, así que un trigger sobre `assignments` lo impide al crear la
  asignación, al cambiar de persona y al reactivarla. Un aviso en pantalla se
  podría saltar.
- La credencial tiene que estar en vigor **el día del culto** en la zona de la
  iglesia, no hoy: si caduca el viernes, el domingo no vale.
- Al publicar se vuelve a comprobar en `packages/core`
  (`validarPublicacion()` con `ContextoCredenciales`), porque entre asignar y
  publicar un certificado puede caducar.
- Tipos: `delitos_sexuales`, `formacion_lopivi`, `primeros_auxilios`.
  `expires_at` nulo significa sin caducidad.
- Los requisitos de un área solo los cambian owner y admin: un líder que quitara
  el del certificado se saltaría la ley.
- El aviso sale 60 días antes a las 10:00 en la zona de la iglesia, a la persona
  y a los líderes de las áreas que lo exigen. Al renovar, el de la fecha anterior
  se cancela.
- Pendiente para E3: si cambia la fecha de un evento, las asignaciones que ya
  existen no se revalidan.

### A0.6 · Frecuencia deseada de servicio (R10)
- [x] `availability_rules` con la frecuencia que pide la persona
- [x] `ordenarPorRotacion()` la respeta
- [x] El panel avisa de quien lleva N domingos seguidos
      (`semanasSeguidasSirviendo()`; la pantalla llega en C5)
- [x] Test: alguien con «una vez al mes» que ya sirvió este mes queda al final
      del orden de sugerencia

Hecho el 2026-09-14 en `20260914000600_frecuencia_deseada.sql`. Controles negativos:
- `ordenarPorRotacion()` sin mandar al final a quien cubrió su mes → `npm test`
  en rojo (44/45): salió `['marta', 'lucia', 'daniel']`.
- Política abierta de `update` en `availability_rules` → `verify-rls.sh` en rojo:
  `FALLO → una servidora cambió la frecuencia deseada de otra persona`.

Decisiones del 2026-09-14:
- Versión simple del MVP: `availability_rules.max_per_month`, una fila por
  persona; sin fila, sin límite. «Cada dos domingos» queda para después.
- Quien ya llegó a su máximo **va al final, no desaparece**: el coordinador
  sabe cosas que la app no.
- Las veces de «este mes» las cuenta quien llama, en la zona de la iglesia.
- RLS con el patrón de `blockouts`: la iglesia la lee, cada cual edita la suya,
  y owner y admin, cualquiera.
- Quemado: `semanasSeguidasSirviendo()` cuenta semanas naturales seguidas con
  algún servicio. El panel avisa desde `SEMANAS_SEGUIDAS_AVISO` (4), un valor
  por defecto hasta que las entrevistas digan otro.

---

## Bloque A · Que arranque

### A1 · Dejar el monorepo instalable
Instalar dependencias y comprobar que las dos apps arrancan. El esqueleto está
escrito pero nunca se ha ejecutado: puede haber versiones que no casen.

- [x] `npm install` termina sin errores
- [x] `npm run dev:dashboard` sirve en :3000, `npm run dev:pwa` en :3001
- [x] `npm test` sigue en verde (48/48)
- [x] `npx tsc --noEmit` limpio en los dos `apps/` y los dos `packages/`

Hecho el 2026-09-14. Notas:
- `npm audit` avisa de `postcss` (alta) dentro de Next 15. Solo se arregla con
  Next 16, que obliga a cambiar código: se decide al preparar el despliegue.
- `packages/core` y `packages/db` tienen ya su `tsconfig.json`. Para compilar
  limpio con `noUncheckedIndexedAccess` los tests llevan anotaciones `!`, que no
  cambian lo que comprueban.
- `apps/pwa/lib/push.ts` no compilaba con TypeScript 5.9: la clave VAPID ahora se
  construye sobre un `ArrayBuffer` propio.
- **Adelantado, en modo demo** (sin Supabase, con la iglesia de ejemplo de
  `packages/db/src/demo.ts`): panel de huecos (C5), programación con los
  problemas de publicación (C4), elegir candidato (C4), Mis turnos (D1), activar
  avisos con los cinco estados (D2) y detalle del turno (D5). Todas usan las
  reglas de `packages/core`; ninguna guarda nada todavía.

### A2 · Supabase local y tipos
- [ ] `npm run db:start` y `npm run db:reset` aplican las 14 migraciones
- [ ] `npm run db:types` regenera `packages/db/src/tipos-bd.ts` con contenido real
- [ ] `supabase test db` pasa `supabase/tests/rls.test.sql` (4 asserts)

**Bloqueada** (2026-09-14): `supabase start` necesita Docker, y no está instalado
en la máquina de desarrollo. Alternativas: instalar Docker Desktop, o crear un
proyecto de Supabase en la nube (región UE) y generar los tipos contra él.

### A3 · Semilla de desarrollo
Una iglesia realista para no trabajar contra tablas vacías.

- [x] `supabase/seed.sql` crea una iglesia con 5 áreas (alabanza, sonido,
      multimedia, bienvenida, niños), sus puestos, 25 personas, un tipo de
      servicio «Culto domingo 11h» y 4 eventos: uno pasado, uno publicado esta
      semana, uno con huecos sin cubrir y uno en borrador
- [~] `npm run db:reset` la carga sin errores
- [x] La semilla **no** se aplica en producción

Hecho el 2026-09-14. Notas:
- `npm run db:reset` no se ha podido ejecutar (A2 está bloqueada, sin Docker). En
  su lugar se aplicó en local lo mismo que hace el reset: base limpia, stub, las
  14 migraciones y `seed.sql`, sin errores.
- Los cuatro cultos salen a las 11:00 de Madrid; las fechas se calculan desde hoy
  convirtiendo la hora local, así que respetan el cambio de hora.
- Se publica con `update`, igual que la app, para que los triggers encolen los
  avisos de verdad. Los del culto pasado quedan como enviados: si no, el worker
  avisaría hoy de un domingo que ya pasó.
- Incluye credenciales de Niños (una caduca en 45 días y ya tiene su aviso),
  frecuencia deseada y un bloqueo por viaje.
- `config.toml` declara la semilla en `[db.seed]`: la carga `supabase db reset`
  en local, y `supabase db push` no la ejecuta nunca.
- Las personas quedan invitadas y sin cuenta; se enlazarán con el bloque B.

### A4 · Iconos de la PWA
Bloqueante: sin iconos iOS no ofrece «Añadir a pantalla de inicio», y sin eso no
hay avisos.

- [x] `192.png`, `512.png`, `maskable-512.png` y `badge.png` en
      `apps/pwa/public/icons/`
- [x] El maskable respeta la zona segura (el contenido dentro del 80 % central)
- [ ] Lighthouse da la PWA como instalable

Hecho el 2026-09-14, salvo Lighthouse. Notas:
- Iconos provisionales: la marca de verificación del panel en blanco sobre el
  verde `#1d6b5c`. En el maskable el dibujo ocupa en torno al 35 % central.
- Se añade `apple-touch-icon.png` (180 px), enlazado desde el layout de la PWA:
  iOS no lee los iconos del manifest.
- Comprobado en local: el manifest, los cinco iconos y `sw.js` responden 200
  con su tipo correcto, y la página enlaza manifest y `apple-touch-icon`.
- **Pendiente:** pasar Lighthouse. La prueba que de verdad importa es instalarla
  en un iPhone real desde Safari.

---

## Bloque B · Autenticación e invitaciones

### B1 · Entrar con enlace mágico
Sin contraseña: la mayoría de los servidores son gente no técnica.

- [ ] `/entrar` pide el correo y manda el enlace
- [ ] La vuelta crea la sesión y redirige a la app correspondiente
- [ ] El registro abierto sigue desactivado: un correo no invitado recibe un
      mensaje claro, no un error
- [ ] Middleware que protege todas las rutas salvo `/entrar` y las de callback

### B2 · Invitar personas
El paso que hace que el modelo `people` / `auth.users` tenga sentido.

- [ ] Un admin añade una persona con nombre y correo → fila en `people` con
      `status = 'invited'` y `user_id` nulo
- [ ] **Se le puede asignar turnos antes de que acepte**
- [ ] Se crea la `invitation` guardando solo el hash del token, con caducidad
- [ ] Al aceptar, se enlaza `user_id`, `status` pasa a `active` y **conserva
      todas las asignaciones que ya tenía**
- [ ] Un token caducado o ya usado da un mensaje entendible, no un error 500
- [ ] Test: persona invitada → asignada → acepta → sus turnos siguen ahí

### B3 · Cambio de iglesia
Una persona puede estar en dos iglesias (un músico que sirve en dos sitios).

- [ ] Si pertenece a más de una, elige al entrar
- [ ] La iglesia activa va en la ruta, y el servidor **revalida la pertenencia
      en cada consulta**: el slug no es una credencial

---

## Bloque C · El panel del coordinador

### C1 · Áreas y puestos
- [ ] CRUD de áreas de servicio con color y orden
- [ ] CRUD de puestos dentro del área
- [ ] Asignar miembros al área y marcar líderes
- [ ] Marcar qué puestos puede cubrir cada miembro
- [ ] Un líder de alabanza **no ve ni toca** la administración del área de niños

### C2 · Tipos de servicio
- [ ] CRUD de tipos con día de la semana, hora y duración
- [ ] Definir los puestos que hacen falta por defecto y cuántos de cada uno

### C3 · Crear eventos
- [~] Desde un tipo de servicio: crea el evento y sus turnos de una vez
- [~] Desde cero, para un evento puntual
- [x] Generar las próximas N semanas de un tipo recurrente **usando
      `proximaOcurrencia()` de `packages/core`** — no sumando 168 horas
- [x] Test: una tanda que cruza el último domingo de octubre mantiene las 11:00
      hora local en todas las fechas

Pantalla hecha el 2026-09-15, en modo demo (`/eventos/nuevo`, desde el botón
«Nuevo servicio» del inicio). Notas:
- `proximasFechas()` en `packages/core/src/eventos.ts` encadena
  `proximaOcurrencia()`, con tests: la tanda que cruza el 25 de octubre sigue a
  las 11:00, sumar 168 horas habría dado las 10:00, y un miércoles a las 20:00
  también se repite bien.
- Desde plantilla: tipo de servicio y cuántas semanas, con las fechas que se
  crearán y sus puestos de siempre. Si la tanda cruza el cambio de hora, lo dice.
  Comprobado en pantalla con 8 semanas.
- Puntual: título, día y hora, con la fecha tal como quedará.
- **Falta**, con Supabase, crear de verdad el evento y sus turnos (en borrador).

Control negativo: sumar 168 horas en `proximasFechas()` → `npm test` en rojo
(63/66): fallan los tres tests de fechas, también el del miércoles, que tras el
cambio de hora pasaría a las 19:00.

### C4 · Montar la programación
La pantalla donde pasa el trabajo real.

- [ ] Vista del evento con sus turnos y quién va en cada uno
- [ ] Al asignar, se llama a `detectarConflictos()` y **se muestran todos los
      conflictos**, no solo el primero
- [ ] Un conflicto avisa pero no impide: el coordinador sabe cosas que el
      sistema no
- [ ] Duplicar la programación de la semana anterior
- [ ] Publicar → se encolan los avisos (ya lo hace el trigger)
- [ ] Republicar no duplica avisos

### C5 · Panel de huecos
La pantalla que responde «¿qué falta para el domingo?».

- [ ] Próximos eventos con su cobertura, usando `calcularHuecos()`
- [ ] Distingue visualmente **faltan confirmadas** de **sin responder**: el
      sábado por la noche solo importa la primera
- [ ] Quién no ha respondido, con cuánto lleva sin hacerlo
- [ ] Un líder solo ve los huecos de sus áreas

---

## Bloque D · La PWA

### D1 · Mis turnos
- [ ] Próximos turnos con fecha en la zona de la iglesia, puesto y estado
- [ ] Aceptar y rechazar desde la lista, con actualización optimista
- [ ] Rechazar permite dejar una nota
- [ ] Vacío con sentido cuando no hay turnos, no una página en blanco

### D2 · Activar avisos
La pantalla más delicada del producto entero.

- [ ] Usa `diagnosticar()` de `lib/push.ts` y trata los cinco estados
- [ ] En iOS sin instalar, **guía de instalación con capturas reales del gesto
      Compartir → Añadir a pantalla de inicio**, no un texto genérico
- [ ] `suscribirse()` se llama **solo** dentro de un `onClick`
- [ ] Si el permiso está denegado, se explica que seguirá recibiendo correo
- [ ] `POST /api/push/subscribe` según el contrato de `04-apps.md`

### D3 · Responder desde la notificación
- [ ] `POST /api/respond` según el contrato, runtime Node
- [ ] Verifica el token con `verificar()` y escribe con doble cerrojo sobre
      `id` y `person_id`
- [ ] El worker incluye `actionToken` en el payload del push
- [ ] Probado en un Android real y en un iPhone real con la app instalada
- [ ] Un token manipulado devuelve 401 y no escribe nada

### D4 · Mis bloqueos
- [~] Alta, baja y edición de tramos de no disponibilidad
- [~] La restricción `exclude using gist` impide solapes: capturar ese error y
      ofrecer fusionar los tramos, no soltar el error de Postgres
- [x] Los bloqueos aparecen como conflicto al asignar

Pantalla hecha el 2026-09-15, en modo demo (`/disponibilidad` en la PWA, pestaña
«No estaré»). Notas:
- Reglas en `packages/core/src/bloqueos.ts`, con tests: `tramoDeDias()` (del
  primer día al último, los dos incluidos, en la zona de la iglesia y
  respetando el cambio de hora), `tramosQueSolapan()` y `fusionarTramos()`
  (junta lo que se pisa o va seguido).
- Alta y baja funcionan. **Falta editar** un tramo: hoy se quita y se vuelve a
  poner.
- El solape se detecta antes de guardar y se ofrece «¿Lo juntamos todo en un
  solo tramo?». Comprobado en la pantalla: 20–23 oct más 22–25 oct queda como
  20–25 oct. **Falta**, con Supabase, capturar el error real (`23P01`) por si
  dos móviles guardan a la vez.
- Motivo opcional, con la ayuda de `08-rgpd-y-lopivi.md`: «No hace falta decir
  por qué. Si lo pones, algo general basta, como "viaje"».
- Los bloqueos ya salían como conflicto al elegir candidato
  (`detectarConflictos()`).

Control negativo: `fusionarTramos()` sin juntar los tramos seguidos →
`npm test` en rojo (62/63).

### D5 · Detalle del turno
- [x] Quién más sirve ese día y en qué puesto
- [x] Notas del evento
- [x] Enlace para añadirlo al calendario del móvil (.ics)

Hecho el 2026-09-15, en modo demo (`/turno/[id]` en la PWA). Notas:
- Quién más sirve y las notas del culto estaban desde las primeras pantallas:
  solo nombres y puestos, agrupados por área y con la suya primero; nunca
  teléfonos.
- «Añadir a mi calendario» descarga un `.ics` generado por `archivoIcs()` en
  `packages/core/src/calendario.ts`, con tests: UTC con la Z (cada móvil lo
  enseña en su zona), CRLF, texto escapado y líneas partidas a 75 bytes, también
  con tildes.
- Empieza a la **hora de llegada** del puesto, no a la del culto, y la
  descripción dice a qué hora empieza. Comprobado en pantalla: la puerta del
  domingo 27 sale a las 08:30Z, las 10:30 en Madrid.
- El enlace es un `data:` con `download`. Hay que probarlo en un iPhone real,
  junto con la instalación de la PWA.

Control negativo: `archivoIcs()` sin escapar las comas → `npm test` en rojo
(67/69).

---

## Bloque R · Repertorio y atril

Adelantado desde la fase 3 (decisión del 2026-09-14). Alabanza ya lo usa a
diario en Calserv / LFY Worship, y Turnos no puede sustituirla sin esto. El
modelo de referencia está en el repo Calserv: `songs` y `service_songs`
(migraciones `202608310001` y `202609020007`), la letra en `202609070020_song_sheet.sql`
y la pantalla en `src/app/services/[serviceId]/atril/page.tsx`. Se toma como
referencia, no se copia: allí no hay `church_id`.

### R1 · Canciones
- [ ] Tabla de canciones con `church_id`, RLS activo y forzado: título, autor,
      tono original, BPM y letra con acordes
- [ ] Detecta duplicados con el título normalizado (sin tildes, mayúsculas ni
      espacios de sobra)
- [ ] Quién edita el catálogo: líder de Alabanza y quien tenga permiso de
      editor de canciones dentro del área, no un rol global de la iglesia
- [ ] No se suben partituras ni audios de terceros: la licencia (CCLI o
      similar) es responsabilidad de la iglesia
- [ ] Comprobación en `scripts/isolation-check.sql`: la iglesia A no ve ni
      edita las canciones de la B

### R2 · Repertorio del culto
- [ ] Canciones de un evento, en orden y con el tono de ese día
- [ ] Al publicar el repertorio, aviso «ya está el repertorio» a Sonido y
      Multimedia (R8), encolado en `notification_jobs` con su `dedupe_key`
- [ ] Test: republicar el repertorio sin cambios no vuelve a avisar

### R3 · Atril
- [ ] La canción a pantalla completa, con «siguiente» para ir a la próxima del culto
- [ ] Legible en el tema oscuro «Escenario»: salón a oscuras, móvil en el atril
- [ ] Solo lo ve quien sirve en ese evento o pertenece a Alabanza

---

## Bloque E · Cerrar el círculo de avisos

### E1 · Correo de respaldo
**No es opcional.** Quien no instale la PWA no recibe nada sin esto.

- [ ] Integrar Resend
- [ ] El worker manda correo cuando no hay suscripción push activa
- [ ] Plantillas para los cuatro tipos de aviso ya implementados
- [ ] El correo trae enlaces firmados de aceptar y rechazar, reutilizando
      `token-respuesta.ts`

### E2 · Horas de silencio
- [x] El worker respeta `quiet_from` y `quiet_to` de `notification_prefs`
- [x] Un aviso que cae en horas de silencio se reprograma al final de la
      ventana, no se descarta
- [x] Test: un aviso a las 23:40 sale a las 08:00

Hecho el 2026-09-14 en `20260914000800_horas_de_silencio.sql`. Decisiones:
- Lo aplica la base de datos, en `app.tomar_lote_avisos`: antes de tomar el
  lote aparta lo que caería en silencio al final de la ventana. Así vale para
  cualquier worker y se prueba en `flow-check.sql`.
- Se mira el momento de enviar, no la hora programada: un aviso de las 21:00 que
  el worker coge a las 23:40 también espera.
- Sin fila en `notification_prefs`, de 22:00 a 08:00 en la zona de la iglesia.
  La ventana puede cruzar la medianoche; si empieza y acaba igual, no hay silencio.
- **No esperan:** el recordatorio de 2 horas (a las 08:00 ya no sirve) y los
  avisos urgentes (el técnico de sonido que falla el sábado por la noche).
- `fueraDeSilencio()` y `respetaSilencio()` en `packages/core`, con el mismo criterio.
- La comprobación «el worker toma cada aviso una sola vez» da a Sara una ventana
  vacía, para no depender de la hora a la que corra el CI.

Controles negativos:
- `fueraDeSilencio()` a las 23:40 devolviendo las 08:00 del mismo día →
  `npm test` en rojo (52/54).
- El worker sin apartar lo que cae en silencio → `flow-check.sql` en rojo:
  `FALLO → el worker envió un aviso dentro de las horas de silencio`.

### E3 · Triggers que faltan
- [x] `turno_cambiado` cuando cambia la hora o se retira a alguien
- [x] `hueco_sin_cubrir` al líder, viernes 18:00 y al recibir un rechazo
- [x] Ampliar `scripts/flow-check.sql` con estos dos casos

Hecho el 2026-09-14 en `20260914000700_avisos_cambios_y_huecos.sql`. Decisiones:
- **Huecos del viernes:** un aviso por líder y culto, con el número de puestos,
  el viernes anterior a las 18:00 en la zona de la iglesia
  (`app.viernes_antes`, y `viernesAntes()` en `packages/core`). Cuentan los
  puestos críticos e importantes con menos gente **aceptada** de la que hace
  falta; lo pendiente no cubre. Los flexibles no avisan.
- Va a los líderes del área; si no tiene líder, a owner y admin.
- Se recalcula con cada cambio de asignación, turno o evento: se cancela al
  cubrirse y vuelve si alguien no puede. Pasado el viernes, sale en el momento.
- **Al recibir un rechazo:** en un puesto crítico sale al instante, como ya se
  decidió en A0.3. En los importantes, el aviso del viernes vuelve a quedar
  pendiente.
- **Turno cambiado:** cambia la hora de un culto publicado (se avisa a quien
  sirve y se reprograman sus recordatorios), te retiran de un turno (estado
  `removed` o borrado) o se cancela el culto (y se cancela todo lo pendiente).
  El propio «no puedo» no avisa a quien lo dice.
- Pendiente: si cambia la fecha de un evento, las credenciales de quien ya está
  asignado no se revalidan (anotado en A0.5).
- Se ajustaron dos comprobaciones: «republicar no duplica avisos» cuenta los
  avisos a la persona asignada, y la de A0.3 filtra el aviso inmediato por su
  clave, porque publicar ahora encola también el del viernes.

Controles negativos:
- `viernesAntes()` sin retroceder cuando el evento es un viernes por la mañana →
  `npm test` en rojo (49/50).
- Sin recalcular huecos al cambiar una asignación → `flow-check.sql` en rojo:
  `FALLO → con la mesa cubierta el aviso del viernes debía cancelarse (está pending)`.
- Sin avisar del cambio de hora → `flow-check.sql` en rojo:
  `FALLO → cambiar la hora debía avisar al ujier; avisos: 0`.

### E4 · Programar el worker
- [ ] Desplegar la Edge Function
- [ ] `worker_key` en Supabase Vault
- [ ] Ejecutar el `cron.schedule` documentado
- [ ] Comprobar en producción que se drena cada 2 minutos
- [ ] Alerta si la cola acumula avisos pendientes vencidos

---

## Bloque E5 · Protección de datos

De `docs/08-rgpd-y-lopivi.md`. La supresión tiene que existir **antes** de abrir
a iglesias que no sean la piloto: sin ella, la iglesia no puede atender una
petición de borrado y es ella la responsable, no nosotros.

- [ ] Política de privacidad y aviso en el alta de la iglesia
- [ ] Texto informativo en la invitación: qué datos se guardan y para qué
- [ ] `blockouts.reason` opcional, con ayuda que guíe al nivel correcto
      («viaje», «asuntos personales») y no invite a contar un motivo médico
- [x] Exportar la ficha completa de una persona — cubre acceso y portabilidad
- [x] «Dar de baja y anonimizar»: identificador en vez de nombre, sin correo ni
      teléfono, conservando las filas de historial para que no se rompan las
      estadísticas del área
- [x] Trabajos de retención con los plazos de la tabla del documento
- [x] Test: tras anonimizar, ningún dato identificativo sobrevive en ninguna
      tabla, y el conteo de participación del área no cambia

Hecho el 2026-09-15 en `20260914000900_proteccion_de_datos.sql` la parte de base
de datos. Quedan los tres primeros puntos: los textos legales (pasan por un
abogado) y la ayuda del campo `reason`, que llega con la pantalla D4.

Decisiones:
- `public.exportar_persona()` devuelve la ficha en JSON: datos, áreas y puestos,
  turnos, bloqueos, credenciales, frecuencia y preferencias de avisos. La pide
  owner o admin de su iglesia, o la propia persona.
- `public.anonimizar_persona()`, solo owner o admin, y nunca a la única
  propietaria. Nombre sustituido por un identificador; se borran correo,
  teléfono, cuenta (si no está en otra iglesia), avisos, suscripciones,
  preferencias, frecuencia, bloqueos, invitaciones y pertenencia a áreas; sus
  turnos futuros se retiran. Se conservan las asignaciones (el historial del
  área) y las credenciales (tipo y fechas: acreditan que en su día se
  verificó). Queda en `audit_log`, sin datos personales.
- Las dos son `security definer` en `public`, para poder llamarse por RPC, y
  comprueban el permiso a mano lo primero.
- `app.aplicar_retencion()` para `pg_cron` con los plazos del documento: personas
  inactivas 12 meses (se anonimizan; `people.inactive_since` cuenta desde
  cuándo), bloqueos pasados 12 meses, credenciales 12 meses tras caducar, avisos
  resueltos 90 días y bitácora 24 meses. El `cron.schedule` está comentado en la
  migración y se ejecuta tras desplegar.
- **Pendiente:** que el motivo de un bloqueo solo lo vean su autor y quien
  administra (`08-rgpd-y-lopivi.md`). Hoy lo lee toda la iglesia; va con el
  mismo cambio de permisos por columna que los teléfonos.

El test de aislamiento encontró un fallo real antes del commit: una admin podía
exportar la ficha de alguien de otra iglesia. Con `current_person_id() = id`,
el `NULL` de otra iglesia dejaba la condición en `NULL` y el permiso no se
negaba. Se compara con `is not distinct from`.

Controles negativos:
- Anonimizar sin borrar el correo → `flow-check.sql` en rojo: `sigue en
  public.people.email: 1 filas` y `FALLO → tras anonimizar quedan 1 datos
  identificativos`.
- Exportar sin comprobar permisos → `verify-rls.sh` en rojo:
  `FALLO → una servidora exportó la ficha de otra persona`.
- La retención sin borrar bloqueos → `flow-check.sql` en rojo:
  `FALLO → un bloqueo terminado hace 13 meses no se borró`.

---

## Bloque M · Migrar Alabanza desde Calserv

**No antes de que Turnos tenga los bloques C, D y R funcionando.** Calserv /
LFY Worship sigue en producción hasta el corte (decisión del 2026-09-14).

- [ ] Proyecto de Supabase **nuevo**, en región UE. No se comparte con Calserv:
      sus triggers sobre `auth.users` crearían perfiles también para Turnos
- [ ] Script de migración con **dry-run obligatorio** que imprima qué va a
      crear, qué descarta y por qué, antes de escribir nada
- [ ] Correspondencia: `members` → `people`, `team_roles` → `positions` del área
      Alabanza, `member_roles` → `ministry_members` + `member_positions`,
      `services` → `events`, `service_assignments` agrupadas por (servicio,
      rol) → `event_positions.needed` + `assignments`
- [ ] Fechas: Calserv guarda fecha y hora **sin zona**. Se convierten con
      `AT TIME ZONE 'Europe/Madrid'` fecha a fecha, nunca con un desfase fijo.
      Las restricciones de día completo pasan a `[00:00, 00:00 del día siguiente)` local
- [ ] Restricciones que se solapan: fusionarlas antes de insertar, o el
      `exclude using gist` de `blockouts` falla
- [ ] Estados: `invited` → `pending`, `confirmed` → `accepted`, `declined` →
      `declined` con el motivo en `response_note`. **Pendiente de decidir**:
      `assigned` (borrador por persona, sin equivalente en Turnos) y los
      estados de servicio `pending_confirmation` / `confirmed` / `completed`
- [ ] Las cuentas no se copian: cada persona recibe una invitación nueva y, al
      aceptarla, conserva su historial. Las suscripciones push no se migran
      (van ligadas al dominio de Calserv)
- [ ] RGPD: decidir qué pasa con `members.notes` y los avatares (bucket público
      en Calserv) antes de migrarlos; lo que no tenga uso en Turnos no se copia
- [ ] Test: tras migrar, los conteos de personas, servicios y asignaciones por
      estado coinciden con el informe del dry-run

---

## Bloque F · Que no la abandonen

- **F1 · Intercambios de turno.** La tabla `swap_requests` existe; falta el
  flujo: pedir, ofrecer a una persona o al puesto entero, aceptar, y el visto
  bueno del líder.
- **F2 · Suscripción de calendario.** Feed .ics por persona, con token en la
  URL. Muchos servidores viven en su calendario.
- **F3 · Informe de participación.** Veces servidas por persona y por área en un
  periodo. Detecta al que se quema y al que nunca entra.
  **Hecho el 2026-09-15** en `packages/core/src/informes.ts`
  (`informeParticipacion()`) y en el panel de demo, en `/participacion`. Cuenta
  días distintos: dos puestos el mismo domingo son una vez. «Se está quemando»
  a partir de `SEMANAS_SEGUIDAS_AVISO` semanas seguidas; «nunca entra» si está
  en un área y no ha servido ninguna vez en el periodo. Orden: primero quien se
  quema (por semanas seguidas), luego de más a menos veces, y al final quien
  nunca entra. Al revisar la pantalla apareció un orden raro (las semanas
  seguidas ordenaban a todos); se corrigió y quedó con su test.
- **F4 · Exportar para WhatsApp.** Un mensaje con la programación del domingo
  listo para pegar en el grupo. No pelear contra WhatsApp: convivir con él.
  **Hecho el 2026-09-15** en `mensajeParaWhatsApp()` y en la programación de un
  culto publicado («Copiar el mensaje»). Negrita y cursiva de WhatsApp, áreas en
  el orden de la iglesia, hora de llegada por puesto, lo pendiente «(sin
  confirmar)», huecos «_sin cubrir_» o «_falta N_», y las notas del culto. Quien
  dijo que no puede no sale. Nunca teléfonos.

  Controles negativos de F3 y F4: incluir a quien dijo «no puedo» y contar
  puestos en vez de días → `npm test` en rojo (57/59), cada uno en su test.

---

## Bloque G · Fuera del MVP

Auto-programación con rotación justa (`ordenarPorRotacion()` ya está hecho y
probado, falta la pantalla), orden del culto con bloques, tiempos y ficheros
(las canciones y el atril se adelantaron al bloque R), varias sedes, WhatsApp como canal, y la facturación con Stripe del bloque de fase 4.

---

## Deuda conocida

- `packages/db/src/tipos-bd.ts` es un placeholder hasta que se ejecute A2.
- No hay tabla `campuses`: varias sedes está previsto pero sin modelar.
- No hay tabla `subscriptions` de Stripe: fase 4.
- `audit_log` existe y no la escribe nadie todavía.
