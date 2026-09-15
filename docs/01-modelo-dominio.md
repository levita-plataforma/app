# Modelo de dominio

Especificación revisada el 15 de septiembre de 2026. Las referencias a código y pruebas proceden del producto localizado en Documents/Levitaapp; no se han ejecutado en esta revisión. Ver [índice](README.md) y [tenants](12-iglesias-y-tenants.md).

## Vocabulario

Este es el vocabulario de la interfaz. Úsalo tal cual: es como habla la iglesia.

| En la interfaz | Tabla | Qué es |
|---|---|---|
| Área de servicio | `ministries` | Alabanza, Sonido, Multimedia, Bienvenida, Niños. Tiene líderes propios |
| Puesto | `positions` | Rol dentro del área: voz líder, batería, cámara 1, proyección, ujier |
| Tipo de servicio | `service_types` | Plantilla recurrente: «Culto domingo 11h» con los puestos habituales |
| Evento | `events` | La instancia con fecha: el culto del 4 de octubre, el ensayo del sábado |
| Turno | `event_positions` | «En este evento hacen falta 2 de cámara». Es el hueco, no la persona |
| Asignación | `assignments` | Persona propuesta para un turno + su respuesta |
| Bloqueo | `blockouts` | «Del 1 al 20 de agosto no estoy» |

## Las dos decisiones que condicionan todo

### 1 · La persona no es el usuario

`people.user_id` es **nullable**. El coordinador tiene que poder programar a
Marta *antes* de que Marta se registre. Si las asignaciones apuntaran a
`auth.users`, el alta de una iglesia se bloquearía hasta que los 40 servidores
se dieran de alta uno a uno, y ahí se pierde la adopción.

Cuando la persona acepta la invitación se enlaza su cuenta y hereda todo el
historial que ya tenía.

### 2 · El área de servicio es la unidad de gobierno

El líder de alabanza no debe poder tocar la programación de niños. El permiso
real no es de iglesia, es de área: `ministry_members.is_leader`, resuelto por
`app.can_manage_ministry()`.

Jerarquía: plataforma → iglesia (tenant) → área de servicio → puesto → turno. Una sede futura vive dentro de la iglesia. La suscripción pertenece al tenant. Cada área tiene identidad estable: crear o renombrar un área afecta solo a su iglesia y conserva sus relaciones. La base inicial es una copia editable por tenant, no un catálogo global mutable.

## Por qué turno y asignación son cosas distintas

Porque el hueco existe aunque no lo cubra nadie. Un turno con 2 plazas y 1
aceptada es el dato que alimenta el panel de huecos, la alerta del viernes y el
motor de sustituciones. Si la asignación fuera la única fila, un rechazo
borraría la necesidad.

## Estados y cobertura

**Evento:** borrador → publicado → cancelado. En borrador no se avisa; al
publicar se preparan los avisos. Publicación por líder de un evento de varias
áreas sigue pendiente en D2 de [Decisiones](07-decisiones.md).

**Asignación:** pendiente → aceptada o rechazada; aceptada y rechazada pueden
intercambiarse mientras siga vigente. Retirada es una acción de gestión y no
una respuesta del servidor. No ofrecer respuesta en culto cancelado o turno
retirado; concretar contrato y límites temporales en D5.

Pendiente en borrador se presenta como **Propuesto**. Pendiente después de
avisar se presenta como **Pendiente de respuesta**. No asignar antigüedad de
respuesta a una propuesta que aún no se envió.

**Turno** es el puesto de un evento; **plaza** es cada persona necesaria. Un
turno de Puerta puede requerir tres plazas. Confirmadas cuenta aceptadas;
propuestas/pendientes cuentan asignaciones vigentes sin respuesta; vacías son
las plazas sin propuesta ni aceptación. Rechazadas y retiradas no cubren.

Para un turno, vacías = máximo(0, necesarias − aceptadas − pendientes).
Faltan confirmaciones = máximo(0, necesarias − aceptadas). No sumar «faltan
confirmaciones» como otra categoría: ya incluye pendientes y vacías. Si se
sobreasigna un turno, mostrarlo y no forzar la suma al número necesario.

### Publicación: ejemplos normativos de la decisión heredada

Las reglas de composición cuentan **pendientes y aceptadas**. Las credenciales
se evalúan para el día del evento. No confundir aptitud para publicar con
confirmación del equipo.

| Situación | Publicación | Presentación |
|---|---|---|
| Niños, mínimo 2, sin ninguna asignación vigente | Permitida por la excepción de turno vacío | Dos plazas vacías; no afirmar que está listo |
| Niños, una persona propuesta o aceptada | Bloqueada | Falta otra persona para cumplir el mínimo |
| Niños, dos propuestas con requisitos vigentes | Permitida | Dos propuestas; cero confirmaciones |
| Sonido con requisito de autónomo, solo un aprendiz | Bloqueada | Añadir una persona autónoma |
| Sonido con aprendiz y autónomo propuestos | Permitida | No implica dos confirmaciones |
| Cualquier asignación sin requisito obligatorio vigente en la fecha | Bloqueada al asignar y revalidada al publicar | Explicación según permisos; corregir el requisito |

Procedencia: A0.2, A0.4 y A0.5 del backlog. La composición se comprueba al
publicar; al preparar una asignación puede señalarse el problema sin impedir
completar el equipo. La credencial bloqueante sí impide crear la asignación.
No se permite ignorar esas credenciales como un conflicto ordinario.

## Lo que añade el análisis de áreas

Las doce fichas de `docs/areas/` obligan a ampliar el modelo por cinco sitios.
El detalle y el SQL están en `docs/areas/00-indice.md`; aquí queda cómo cambia
el vocabulario del dominio.

**El puesto lleva su hora de llegada.** Sonido entra 90 minutos antes del culto,
el ujier 30. `positions.call_offset_min`, con override por evento. Los
recordatorios se calculan sobre la hora de llegada, nunca sobre `starts_at`.

**Cubrir un puesto tiene niveles.** `member_positions.level` con `aprendiz`,
`autonomo` y `forma_a_otros`. En alabanza da igual; en sonido decide si esa
persona puede quedarse sola en la mesa.

**El puesto tiene criticidad.** `positions.criticality` con `critica`,
`importante` y `flexible`. No es metadato: dirige cuándo se avisa de un hueco y
qué se pinta en rojo. Sin ella, un hueco de ujier alarma igual que uno de
sonido, el líder aprende a ignorar las alertas, y el sistema de avisos deja de
significar nada.

**Un turno se cubre cumpliendo una regla, no llegando a un número.**
`positions.min_personas` y `positions.requiere_autonomo`. Niños necesita dos
adultos siempre aunque sobre gente; el conteo de la ofrenda, dos personas por
control interno; sonido, al menos un autónomo si va un aprendiz.

**Servir en un área puede exigir credenciales en vigor.**
`ministry_requirements` y `person_credentials`. En niños y jóvenes es la Ley
Orgánica 8/2021: sin certificado vigente **la asignación se impide**. Ver
`docs/areas/06-ninos.md` y `docs/08-rgpd-y-lopivi.md`.

Y una sexta que no cambia el esquema sino el peso del producto: **la frecuencia
deseada de servicio**. La versión simple guarda un máximo deseado de servicios al mes. El backlog refiere que `ordenarPorRotacion()` lo respeta: al alcanzarlo, la persona pasa al final sin desaparecer. Reducir sobrecarga es una hipótesis de valor a validar, no una causa de abandono medida aquí.

## Reglas referidas en la implementación del producto

Referencia: `packages/core` del producto. Los conteos antiguos de pruebas no se usan como resultado actual de esta revisión:

- `detectarConflictos()` — bloqueo de disponibilidad, solape con otro evento,
  duplicado en el mismo evento, ya asignada. Devuelve **todos** los conflictos,
  no el primero: el coordinador quiere verlos todos.
- `calcularHuecos()` — distingue `faltanEnFirme` (contando pendientes) de
  `faltanConfirmadas` (solo aceptadas). El sábado importa la segunda.
- `ordenarPorRotacion()` — menos veces servido primero; a igualdad, quien lleva
  más sin hacerlo; a igualdad total, orden estable.
- `proximaOcurrencia()` — próxima ocurrencia semanal respetando el cambio de
  hora.

El backlog también refiere las reglas del bloque A0:

- `horaDeLlegada()` y `envioRecordatorio2h()` — el recordatorio cuenta desde la
  hora de llegada del puesto.
- `validarPublicacion()` — lo que impide publicar: menos gente que el mínimo,
  solo aprendices donde hace falta un autónomo, o alguien sin credencial en
  vigor. Devuelve todos los problemas, no el primero.
- `escaladoDeHueco()` y `avisarAlLiderAlRechazar()` — cuándo avisa un hueco
  según la criticidad del puesto.
- `credencialEnVigor()` y `credencialesQueFaltan()` — el certificado tiene que
  valer el día del culto.
- `ordenarPorRotacion()` respeta la frecuencia deseada, y
  `semanasSeguidasSirviendo()` detecta a quien se puede quemar.

## Pendiente de modelar

- `availability_rules` en su versión completa: disponibilidad recurrente («sirvo
  dos domingos al mes», «cada dos domingos»). El MVP solo guarda el máximo al mes.
- **Turnos por franja horaria sin evento asociado.** Vigilias por tramos,
  limpieza por semanas, «comprar el café antes del viernes». Tres áreas no
  encajan en `evento → turno`. Es la decisión de modelado grande que queda
  pendiente; la recomendación y las dos opciones están en
  `docs/areas/08-intercesion.md`.
- `teams` dentro del área, para asignar la Banda B de una vez en lugar de siete
  personas sueltas.
- `campuses`: varias sedes. La tabla está prevista en el diseño pero no creada.
- Canciones, repertorio del culto y atril: **adelantados al bloque R** de
  `docs/TAREAS.md`, porque Alabanza ya los usa en Calserv y Turnos no puede
  sustituirla sin ellos.
- `plan_items`: el orden del culto con bloques y tiempos sigue en fase 3.
