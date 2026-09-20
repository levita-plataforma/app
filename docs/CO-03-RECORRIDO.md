# CO-03 · Recorrido integral de la Fase 5 con regresión de la Fase 4

Guión para recorrer a mano lo que ninguna prueba automática cubre: que las
pantallas hacen lo que el SQL promete. Lo recorre Carlos y lo valida Carlos.
Es lo único que queda para cerrar la Fase 5, pendiente desde el 18 de
septiembre de 2026.

## Antes de empezar

**Dónde.** En producción, con la iglesia real: CO-03 pide comprobación del
entorno real, no de una copia. Si prefieres recorrerlo primero en una Preview,
confirma antes en Vercel que sus variables no apuntan a la base de producción.
[05-despliegue.md](05-despliegue.md) dice que cada entorno tiene la suya, pero
eso describe cómo debe ser, y no lo he comprobado.

**Con qué datos.** Con los reales. No siembres datos sintéticos: la norma del
encargo lo prohíbe y, además, un recorrido sobre datos inventados no prueba lo
que importa. Usa una actividad de verdad de las próximas semanas —el servicio
del domingo sirve— y personas que ya existen.

**Con quién.** Hacen falta dos cuentas para probar la respuesta a una
asignación: la tuya y una segunda. Usa la de Diogo si está disponible; si no,
cualquier persona del equipo que tenga cuenta y a la que le puedas avisar de
que va a recibir algo de prueba.

**Qué no va a pasar.** El envío externo está desactivado. Ningún correo ni push
va a salir hacia nadie: los avisos aparecen solo dentro de la aplicación y las
entregas por correo se quedan en cola. Si en algún momento ves un estado que
diga que algo se ha enviado por correo, **eso es un fallo** y hay que anotarlo.

**Cuánto lleva.** Unos 40 minutos si nada falla.

---

## Parte A · Regresión de la Fase 4

No es relleno: la Fase 5 escribe sobre la estructura de actividades de la
Fase 4, y lo que se rompe al conectar dos fases se rompe justo aquí.

| # | Paso | Qué tiene que pasar |
|---|---|---|
| A1 | `/app/actividades/nueva`: crea una actividad para un domingo próximo | Se crea en estado borrador |
| A2 | Ábrela y añade un área y dos puestos, uno marcado como crítico | La estructura se guarda y el puesto crítico se distingue |
| A3 | Publica la actividad | Cambia de estado sin pedir nada raro |
| A4 | Vuelve a `/app/actividades` y comprueba que aparece con su fecha y estado | Coincide con lo que acabas de hacer |
| A5 | `/app/actividades/plantillas`: abre una plantilla existente | Carga sin error |
| A6 | Crea una actividad **recurrente** (semanal, 3 ocurrencias) | Se generan las tres, con sus fechas correctas |
| A7 | Edita **una sola** ocurrencia y comprueba que las otras dos no cambian | La serie no se contamina |
| A8 | Cancela esa ocurrencia | Queda cancelada ella sola |

Si algo de la parte A falla, para y avísame: sería una regresión de F4 y no
tiene sentido seguir con F5 encima.

---

## Parte B · Disponibilidad (DI-01)

| # | Paso | Qué tiene que pasar |
|---|---|---|
| B1 | `/app/mi-disponibilidad`: marca un **periodo concreto** que incluya el domingo de A1, con un motivo escrito | Se guarda |
| B2 | Añade también una **pauta semanal** (por ejemplo, los martes por la tarde) | Se guarda junto al periodo, sin pisarlo |
| B3 | Fíjate en el motivo que escribiste en B1 | **Solo debes verlo tú.** Es privado por diseño |
| B4 | Ajusta tu **preferencia de frecuencia** (cada cuánto quieres servir) | Se guarda |

---

## Parte C · Asignaciones y respuestas (CA-04 y CA-05)

Aquí es donde se juntan las dos partes de la fase.

| # | Paso | Qué tiene que pasar |
|---|---|---|
| C1 | Vuelve a la actividad de A1, pestaña de equipo, y busca **tu propio nombre** para el puesto | Debe aparecer un **aviso de no disponibilidad**: has dicho que ese día no puedes. El aviso avisa, no bloquea |
| C2 | Comprueba que el aviso **no enseña tu motivo** | Quien coordina ve que no estás disponible, nunca por qué |
| C3 | Busca a la segunda persona y usa **«Añadir como borrador»** | Queda propuesta, sin comunicar. Esa distinción es intencionada: preparar no es avisar |
| C4 | Comprueba que esa persona **todavía no ha recibido nada** | La bandeja de la otra cuenta sigue igual |
| C5 | Ahora usa **«Añadir y enviar»** para el otro puesto | Ahora sí se comunica |
| C6 | Desde la segunda cuenta, entra en `/app/mis-turnos` | Aparece el turno propuesto |
| C7 | Acéptalo | «Respuesta registrada: confirmada», y desde tu cuenta se ve aceptado |
| C8 | Propón un tercer turno y, desde la segunda cuenta, **recházalo** | «Respuesta registrada: rechazada», y a ti te llega aviso del rechazo |
| C9 | Sobre un turno aceptado, pide una **sustitución** | Se abre la sustitución y se ve como tal |
| C10 | Usa **«Cancelar sustitución»** | Vuelve al estado anterior, sin duplicar la asignación |
| C11 | **«Retirar»** una asignación | Desaparece y queda constancia |

---

## Parte D · Avisos (DI-02)

| # | Paso | Qué tiene que pasar |
|---|---|---|
| D1 | Mira la **campana** de la navegación | Marca los avisos sin leer de lo que has hecho en la parte C |
| D2 | `/app/avisos`: abre la bandeja | Están los avisos, con su texto en condiciones: sin marcadores sin sustituir, sin «undefined», sin nombres de campo en crudo |
| D3 | Marca uno como leído | La campana baja la cuenta |
| D4 | En esa misma página, en **preferencias de avisos**, apaga un canal | Se guarda |
| D5 | Provoca un aviso de esa categoría | **No debe llegar.** Una preferencia que no se cumple es peor que no ofrecerla |
| D6 | Vuelve a encenderla | Los siguientes sí llegan |
| D7 | En cualquier aviso, busca el estado de entrega por correo | Debe decir que está **en cola**, nunca «enviado». No hay proveedor de correo |

---

## Parte E · Lo que corre solo

La tarea programada se ejecuta **una vez al día**, así que esta parte no la
puedes forzar desde la interfaz sin esperar. Dos opciones: la miras mañana, o
me dices y la disparo yo con su secreto.

| # | Paso | Qué tiene que pasar |
|---|---|---|
| E1 | Al día siguiente, revisa la bandeja | Hay recordatorio de los turnos próximos, y **uno solo**: ni repetido ni prematuro |
| E2 | Deja un puesto **crítico** sin cubrir en una actividad cercana | Llega el aviso de escalado a quien coordina |
| E3 | Comprueba que ningún aviso ha salido de la aplicación | Nadie ha recibido correos. Pregúntaselo a la segunda persona |

---

## Parte F · De paso, lo que cambió el 20 de septiembre

No es de la Fase 5, pero se toca en el mismo recorrido y conviene verlo con los
mismos ojos.

| # | Paso | Qué tiene que pasar |
|---|---|---|
| F1 | `/app/personas`, abre una ficha con tu cuenta | Ves el correo y el teléfono con normalidad: tienes `people.read` |
| F2 | Con una cuenta sin esa capacidad, abre la misma ficha | Donde iba el correo pone **«No tienes permiso para verlo»**, no un guion. Y los campos del formulario salen deshabilitados |
| F3 | Con esa segunda cuenta, si puede editar, guarda un cambio de nombre | Al volver, el correo y el teléfono **siguen ahí**: no se han borrado al guardar |
| F4 | `/app/kids`, listado de perfiles | Las edades siguen calculándose |
| F5 | Abre un evento y su inscripción pública | Sigue funcionando: los límites subieron a 200 por evento cada 10 minutos |

El paso F3 es el que más me importa: es el fallo que habría borrado datos de
contacto sin avisar, y quiero verlo confirmado en pantalla y no solo en pruebas.

---

## Señales de alarma

Si ves cualquiera de estas, anótala y dímela; no sigas como si nada:

- Un motivo de no disponibilidad visible para alguien que no eres tú.
- Un aviso que llega a quien no le corresponde, o que no llega a quien sí.
- Un estado que diga «enviado» donde el correo está desactivado.
- Un recordatorio duplicado o que llega antes de tiempo.
- Datos de otra iglesia asomando en cualquier pantalla.
- Una asignación que aparece dos veces tras una sustitución.

---

## Veredicto

Al terminar, rellena esto y con eso se cierra la fase:

```
CO-03 · Recorrido integral de la Fase 5
Fecha:
Quien lo recorre:
Versión probada (commit de main):

Parte A (regresión F4):   correcta / con fallos
Parte B (disponibilidad): correcta / con fallos
Parte C (asignaciones):   correcta / con fallos
Parte D (avisos):         correcta / con fallos
Parte E (tarea diaria):   correcta / con fallos / pendiente
Parte F (cambios del 20):  correcta / con fallos

Fallos encontrados:

Veredicto: FASE 5 CERRADA / FASE 5 PARCIAL — queda:
```

Cuando esté, actualizo [13-plan-por-fases.md](13-plan-por-fases.md),
[FASE-5-ASIGNACIONES.md](FASE-5-ASIGNACIONES.md) y
[CONTRATO-F4-F5.md](CONTRATO-F4-F5.md), que hoy siguen diciendo que la fase
está parcial.
